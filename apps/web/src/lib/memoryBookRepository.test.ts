import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './localData';
import { MemoryBookRepository } from './memoryBookRepository';
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

describe('memory book repository', () => {
  let repository: MemoryBookRepository;

  beforeEach(() => {
    const data = new LocalDataService(new MockDatabase(new TestStorage(), 'test-db'));
    data.resetLocalData();
    repository = new MemoryBookRepository(data);
  });

  it('stores one editable annual parent note per child and year', () => {
    repository.saveAnnualParentNote('child-a', 2026, '沉沉今年開始自己整理書包。');
    repository.saveAnnualParentNote('child-a', 2027, '沉沉今年愛上閱讀。');
    repository.saveAnnualParentNote('child-b', 2026, '安安今年學會分享玩具。');

    expect(repository.getAnnualParentNote('child-a', 2026)?.note).toBe('沉沉今年開始自己整理書包。');
    expect(repository.getAnnualParentNote('child-a', 2027)?.note).toBe('沉沉今年愛上閱讀。');
    expect(repository.getAnnualParentNote('child-b', 2026)?.note).toBe('安安今年學會分享玩具。');

    repository.saveAnnualParentNote('child-a', 2026, '沉沉今年每天都很努力。');

    expect(repository.getAnnualParentNote('child-a', 2026)?.note).toBe('沉沉今年每天都很努力。');
    expect(repository.listAnnualParentNotes()).toHaveLength(3);
  });
});
