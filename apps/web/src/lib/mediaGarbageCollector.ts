import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';

export type MediaGarbageCollectionReport = {
  referencedMediaIds: string[];
  orphanedMediaIds: string[];
};

export async function dryRunMediaGarbageCollection(): Promise<MediaGarbageCollectionReport> {
  const referencedMediaIds = collectReferencedMediaIds();
  const media = await mediaRepository.listMedia();
  const orphanedMediaIds = media
    .map((record) => record.id)
    .filter((mediaId) => !referencedMediaIds.has(mediaId))
    .sort();
  return {
    referencedMediaIds: Array.from(referencedMediaIds).sort(),
    orphanedMediaIds
  };
}

export async function deleteOrphanedMedia(confirm = false): Promise<MediaGarbageCollectionReport> {
  const report = await dryRunMediaGarbageCollection();
  if (!confirm) return report;
  for (const mediaId of report.orphanedMediaIds) {
    await mediaRepository.deleteMedia(mediaId);
  }
  return report;
}

function collectReferencedMediaIds() {
  const state = dataRepository.getState();
  const ids = new Set<string>();
  const add = (value?: string | string[] | null) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === 'string' && value.trim()) ids.add(value);
  };

  state.share_media.forEach((media) => {
    add(media.id);
    add(media.thumbnail_path);
  });
  state.encouragement_cards.forEach((message) => {
    add(message.media_id);
    if (message.media_path && !message.media_path.startsWith('local/')) add(message.media_path);
  });
  state.tasks.forEach((task) => {
    add(task.task_image_media_id);
    add(task.thumbnail_media_id);
  });
  state.dreams.forEach((dream) => {
    add(dream.cover_media_id);
    add(dream.coverMediaId);
  });
  state.children.forEach((child) => {
    add(child.avatar_media_id);
    if (child.avatar_path && !child.avatar_path.startsWith('data:')) add(child.avatar_path);
  });
  state.special_days.forEach((day) => add(day.image_media_id));
  add(state.family_settings.family_avatar_media_id);
  add(state.family_settings.parent_avatar_media_id);
  state.piggy_products.forEach((product) => {
    add(product.main_media_id);
    add(product.gallery_media_ids);
  });
  state.piggy_purchases.forEach((purchase) => add(purchase.product_snapshot.main_media_id));

  return ids;
}
