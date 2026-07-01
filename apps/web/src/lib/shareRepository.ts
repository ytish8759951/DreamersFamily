import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';
import type { LocalShareMedia, UUID } from './localTypes';
import type { SaveMediaInput, UnifiedMediaType } from './mediaRepository';

export type ShareMediaChunk = Blob;
export type ShareRecordedMedia = {
  preview_url: string;
  blob: Blob;
  mime_type: string;
  file_name: string;
  file_size_bytes: number;
  duration_seconds: number;
  media_type: 'audio' | 'video';
};

type SaveShareMediaInput = {
  id?: string;
  shareId: string;
  childId: string;
  mediaType: LocalShareMedia['media_type'];
  mimeType: string;
  fileName?: string;
  fileSizeBytes?: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  blob: Blob;
};

export const shareRepository = {
  createShare: dataRepository.createShare.bind(dataRepository),
  listShares: dataRepository.listShares.bind(dataRepository),
  redeemStarsForScreenTime: dataRepository.redeemStarsForScreenTime.bind(dataRepository),
  approveShare: dataRepository.approveShare.bind(dataRepository),
  deleteShare: dataRepository.deleteShare.bind(dataRepository),
  createRecordingBlob,
  createRecordedMedia,
  createPreviewUrl,
  releasePreviewUrl,
  saveShareMedia,
  getMediaUrl,
  releaseMediaUrl,
  downloadMedia
};

function createRecordedMedia(input: {
  chunks: ShareMediaChunk[];
  mimeType: string;
  mediaType: 'audio' | 'video';
  fileName: string;
  durationSeconds: number;
}) {
  const blob = createRecordingBlob(input.chunks, input.mimeType);
  return {
    preview_url: createPreviewUrl(blob),
    blob,
    mime_type: blob.type || input.mimeType,
    file_name: input.fileName,
    file_size_bytes: blob.size,
    duration_seconds: input.durationSeconds,
    media_type: input.mediaType
  } satisfies ShareRecordedMedia;
}

function createRecordingBlob(chunks: Blob[], mimeType: string) {
  return new Blob(chunks, { type: mimeType });
}

function createPreviewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

function releasePreviewUrl(url?: string | null) {
  if (url) URL.revokeObjectURL(url);
}

async function saveShareMedia(input: SaveShareMediaInput) {
  const mediaId = input.id ?? createLocalId();
  const mediaType = input.mediaType as UnifiedMediaType;
  await mediaRepository.saveMedia({
    id: mediaId,
    ownerType: 'share',
    ownerId: input.shareId,
    mediaType,
    mimeType: input.mimeType,
    fileName: input.fileName,
    duration: input.durationSeconds,
    blob: input.blob
  } satisfies SaveMediaInput);
  return {
    id: mediaId,
    media_type: input.mediaType,
    mime_type: input.mimeType,
    file_name: input.fileName,
    file_size_bytes: input.fileSizeBytes ?? input.blob.size,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_seconds: input.durationSeconds ?? null
  };
}

function getMediaUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseMediaUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}

async function downloadMedia(media: LocalShareMedia) {
  const record = await mediaRepository.getMedia(media.id);
  if (!record) throw new Error('Media not found');
  return {
    blob: record.blob,
    fileName: media.storage_path || record.fileName || `${media.media_type}-${media.id}`
  };
}

function createLocalId(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
