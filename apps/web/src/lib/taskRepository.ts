import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';

export const taskRepository = {
  createTask: dataRepository.createTask.bind(dataRepository),
  completeTask: dataRepository.completeTask.bind(dataRepository),
  approveTask: dataRepository.approveTask.bind(dataRepository),
  listTasks: dataRepository.listTasks.bind(dataRepository),
  getStarBalance: dataRepository.getStarBalance.bind(dataRepository),
  redeemStarsForScreenTime: dataRepository.redeemStarsForScreenTime.bind(dataRepository),
  saveTaskImage,
  createPreviewUrl,
  releasePreviewUrl,
  deleteTaskMedia,
  getTaskMediaUrl,
  releaseTaskMediaUrl
};

function createPreviewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

function releasePreviewUrl(url?: string | null) {
  if (url) URL.revokeObjectURL(url);
}

async function saveTaskImage(input: { id?: string; ownerId: string; blob: Blob; mimeType: string; fileName?: string; thumbnail?: Blob | null }) {
  const media = await mediaRepository.saveMedia({
    id: input.id,
    ownerType: 'task',
    ownerId: input.ownerId,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    thumbnailBlob: input.thumbnail ?? undefined,
    blob: input.blob
  });
  return media.id;
}

function deleteTaskMedia(mediaId: string | null | undefined) {
  return mediaId ? mediaRepository.deleteMedia(mediaId) : Promise.resolve();
}

function getTaskMediaUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseTaskMediaUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}
