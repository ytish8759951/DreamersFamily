import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localData';
import { MemoryPackRepository } from './memoryPackRepository';
import { MockDatabase } from './mockDatabase';
import type { KeyValueStorage } from './storage';

class TestStorage implements KeyValueStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('memory pack repository', () => {
  let data: LocalDataService;
  let memoryPacks: MemoryPackRepository;

  beforeEach(() => {
    const dataStorage = new TestStorage();
    data = new LocalDataService(new MockDatabase(dataStorage, 'test-db'));
    data.resetLocalData();
    memoryPacks = new MemoryPackRepository(data);
  });

  it('builds, stores, exports and deletes a JSON memory pack with mediaId references only', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const task = data.createTask({
      child_id: child.id,
      title: '整理玩具',
      reward_stars: 12
    });
    data.completeTask(task.id, '我完成了');
    data.approveTask(task.id);
    const dream = data.createDream({
      child_id: child.id,
      title: '彩虹腳踏車',
      target_amount: 100,
      cover_media_id: 'dream-cover-media-id'
    });
    data.addDreamDeposit(dream.id, 100, '達標');
    data.completeDream(dream.id);
    const share = data.createShare({
      child_id: child.id,
      title: '作品照片',
      caption: '我的作品',
      media: [
        {
          media_type: 'photo',
          mime_type: 'image/jpeg',
          file_name: 'work.jpg',
          file_size_bytes: 1234,
          data_url: 'data:image/jpeg;base64,SHOULD_NOT_BE_STORED'
        },
        {
          media_type: 'audio',
          mime_type: 'audio/webm',
          file_name: 'voice.webm',
          duration_seconds: 28
        }
      ]
    });
    const badge = data.createBadge({
      name: '閱讀小達人',
      icon: '📚',
      reward_stars: 3
    });
    data.awardBadge({ child_id: child.id, badge_id: badge.id, note: '連續閱讀' });
    data.createMailboxMessage({
      child_id: child.id,
      title: '你很棒',
      message: '謝謝你主動整理。',
      card_type: 'image',
      media: {
        mime_type: 'image/png',
        file_name: 'card.png',
        data_url: 'data:image/png;base64,MAILBOX_BLOB'
      }
    });
    data.addScreenTime(child.id, '2026-06-27', 30, '家長增加');
    data.recordScreenTimeUsed(child.id, '2026-06-27', 10);
    data.addPiggyIncome({ child_id: child.id, source: 'allowance', amount: 200 });
    data.depositPiggyCoin(child.id, 200);
    const product = data.createPiggyProduct({
      child_id: child.id,
      name: 'lego',
      price: 100,
      main_media_id: 'product-media',
      shelf_status: 'shelf'
    });
    const purchase = data.requestPiggyPurchase(child.id, product.id);
    data.createSpecialDay({
      child_id: child.id,
      title: '家庭露營',
      date: '2026-07-01',
      type: 'family_event'
    });

    const pack = memoryPacks.buildMemoryPack({ childId: child.id, title: '2026 回憶包' });
    const exported = memoryPacks.exportMemoryPack(pack.id);
    const parsed = JSON.parse(exported);

    expect(memoryPacks.getMemoryPack(pack.id)?.id).toBe(pack.id);
    expect(memoryPacks.listMemoryPacks(child.id)).toHaveLength(1);
    expect(parsed).toMatchObject({
      id: pack.id,
      childId: child.id,
      childName: '樂樂',
      title: '2026 回憶包',
      coverMediaId: share.media[0].id,
      stats: {
        totalPhotos: 1,
        totalVideos: 0,
        totalAudios: 1,
        totalDreams: 1,
        completedDreams: 1,
        totalTasks: 1,
        totalStars: 15,
        totalBadges: 1,
        totalScreenTimeAdded: 30,
        totalScreenTimeUsed: 10,
        totalEncouragementCards: 1,
        totalSpecialDays: 1
      }
    });
    expect(parsed.content.shareHistory[0].media[0]).toMatchObject({
      mediaId: share.media[0].id,
      mediaType: 'photo',
      mimeType: 'image/jpeg'
    });
    expect(parsed.content.dreamHistory[0].coverMediaId).toBe('dream-cover-media-id');
    expect(parsed.content.starHistory).toHaveLength(2);
    expect(parsed.content.piggyBankLogs.map((item: { type: string }) => item.type)).toEqual([
      'purchase_debit',
      'coin_deposit'
    ]);
    expect(parsed.content.piggyPurchases[0]).toMatchObject({
      id: purchase.id,
      productId: product.id,
      productName: 'lego',
      status: 'pendingPurchase'
    });
    expect(parsed.summary).toContain('1 個任務');
    expect(parsed.summary).toContain('累積 15 顆星星');
    expect(exported).not.toContain('Blob');
    expect(exported).not.toContain('data:image');
    expect(exported).not.toContain('base64');
    expect(exported).not.toContain('SHOULD_NOT_BE_STORED');
    expect(exported).not.toContain('MAILBOX_BLOB');

    expect(memoryPacks.deleteMemoryPack(pack.id).id).toBe(pack.id);
    expect(memoryPacks.getMemoryPack(pack.id)).toBeNull();
  });

  it('uses a dream cover when no photo share exists', () => {
    const child = data.createChild({ display_name: '安安' });
    data.createDream({
      child_id: child.id,
      title: '夢想',
      target_amount: 100,
      cover_media_id: 'dream-cover-only'
    });

    expect(memoryPacks.buildMemoryPack({ childId: child.id }).coverMediaId).toBe('dream-cover-only');
  });
});
