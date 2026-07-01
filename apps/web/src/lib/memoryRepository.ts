import { mediaRepository } from './mediaRepository';
import type { LocalShareMedia } from './localTypes';

export const memoryRepository = {
  getMemoryMediaUrl,
  releaseMemoryMediaUrl,
  getMediaForDownload,
  getMediaBytes,
  saveDreamCover,
  updateDreamCoverOwner,
  deleteMedia,
  createPreviewUrl,
  releasePreviewUrl,
  createZipBlob,
  downloadBlob,
  createDownload
};

function getMemoryMediaUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseMemoryMediaUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}

async function getMediaForDownload(media: LocalShareMedia) {
  const record = await mediaRepository.getMedia(media.id);
  if (!record) throw new Error('Media not found');
  return {
    blob: record.blob,
    fileName: media.storage_path || record.fileName || `${media.media_type}-${media.id}`
  };
}

async function getMediaBytes(mediaId: string, fallbackName: string) {
  const record = await mediaRepository.getMedia(mediaId);
  if (!record) return null;
  return {
    fileName: record.fileName || fallbackName,
    data: new Uint8Array(await record.blob.arrayBuffer())
  };
}

async function saveDreamCover(input: { id?: string; ownerId: string; blob: Blob; mimeType: string; fileName?: string }) {
  const media = await mediaRepository.saveMedia({
    id: input.id,
    ownerType: 'dream',
    ownerId: input.ownerId,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    blob: input.blob
  });
  return media.id;
}

async function updateDreamCoverOwner(mediaId: string, ownerId: string) {
  await mediaRepository.updateMedia({ id: mediaId, ownerType: 'dream', ownerId });
}

function deleteMedia(mediaId: string | null | undefined) {
  return mediaId ? mediaRepository.deleteMedia(mediaId) : Promise.resolve();
}

function createPreviewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

function releasePreviewUrl(url?: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function createZipBlob(data: Uint8Array) {
  const bytes = new ArrayBuffer(data.byteLength);
  new Uint8Array(bytes).set(data);
  return new Blob([bytes], { type: 'application/zip' });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createDownload(blob: Blob, fileName: string) {
  return { blob, fileName };
}
