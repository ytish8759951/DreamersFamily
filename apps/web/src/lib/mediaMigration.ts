import { LOCAL_DATABASE_KEY } from './mockDatabase';
import { mediaRepository, type MediaOwnerType, type UnifiedMediaType } from './mediaRepository';
import { getLocalStorage, readJson, writeJson } from './storage';
import type { LocalDatabaseState, UUID } from './localTypes';

type MutableState = LocalDatabaseState & Record<string, unknown>;

export type MediaMigrationResult = {
  migratedCount: number;
  migratedMediaIds: string[];
};

export async function migrateLocalStorageMediaToRepository(): Promise<MediaMigrationResult> {
  const storage = getLocalStorage();
  const state = readJson<MutableState>(storage, LOCAL_DATABASE_KEY);
  if (!state || state.schema_version !== 1) return { migratedCount: 0, migratedMediaIds: [] };

  const migratedMediaIds: string[] = [];
  const migrateDataUrl = async (input: {
    dataUrl: string | null | undefined;
    mediaId?: string | null;
    ownerType: MediaOwnerType;
    ownerId: string;
    mediaType: UnifiedMediaType;
    fileName?: string;
  }) => {
    if (!isDataUrl(input.dataUrl)) return input.mediaId ?? null;
    const blob = dataUrlToBlob(input.dataUrl);
    const mediaId = input.mediaId || createLocalId();
    await mediaRepository.saveMedia({
      id: mediaId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      mediaType: input.mediaType,
      mimeType: blob.type,
      fileName: input.fileName,
      blob
    });
    migratedMediaIds.push(mediaId);
    return mediaId;
  };

  for (const media of state.share_media ?? []) {
    const dataUrl = media.local_data_url;
    const mediaId = await migrateDataUrl({
      dataUrl,
      mediaId: media.id,
      ownerType: 'share',
      ownerId: media.share_id,
      mediaType: media.media_type,
      fileName: media.storage_path?.split('/').pop()
    });
    if (mediaId) {
      media.local_data_url = null;
      media.bucket = 'local-media';
      media.storage_path = media.storage_path || mediaId;
      media.mime_type = media.mime_type || dataUrlMimeType(dataUrl) || 'application/octet-stream';
      media.file_size_bytes = media.file_size_bytes || dataUrlByteSize(dataUrl);
    }
  }

  for (const message of state.encouragement_cards ?? []) {
    const mediaType = mailboxMediaType(message.card_type, message.media_mime_type);
    const mediaId = await migrateDataUrl({
      dataUrl: message.local_data_url,
      mediaId: message.media_id,
      ownerType: 'mailbox',
      ownerId: message.id,
      mediaType,
      fileName: message.media_path?.split('/').pop()
    });
    if (mediaId) {
      message.media_id = mediaId;
      message.media_bucket = 'local-media';
      message.media_path = message.media_path || mediaId;
      message.media_mime_type = message.media_mime_type || dataUrlMimeType(message.local_data_url);
      message.local_data_url = null;
    }
  }

  for (const day of state.special_days ?? []) {
    const mediaId = await migrateDataUrl({
      dataUrl: day.image_data_url,
      mediaId: day.image_media_id,
      ownerType: 'special-day',
      ownerId: day.id,
      mediaType: 'image',
      fileName: `${day.id}.webp`
    });
    if (mediaId) {
      day.image_media_id = mediaId;
      day.image_data_url = null;
    }
  }

  for (const child of state.children ?? []) {
    const mediaId = await migrateDataUrl({
      dataUrl: child.avatar_path,
      mediaId: child.avatar_media_id,
      ownerType: 'avatar',
      ownerId: child.id,
      mediaType: 'image',
      fileName: `${child.id}-avatar.webp`
    });
    if (mediaId) {
      child.avatar_media_id = mediaId;
      child.avatar_path = null;
    }
  }

  for (const dream of state.dreams ?? []) {
    const legacyCover = dream.cover_path || dream.coverUrl || dream.imageUrl;
    const mediaId = await migrateDataUrl({
      dataUrl: legacyCover,
      mediaId: dream.cover_media_id ?? dream.coverMediaId,
      ownerType: 'dream',
      ownerId: dream.id,
      mediaType: 'image',
      fileName: `${dream.id}-cover.webp`
    });
    if (mediaId) {
      dream.cover_media_id = mediaId;
      dream.coverMediaId = mediaId;
      dream.cover_path = null;
      dream.coverUrl = null;
      dream.imageUrl = null;
    }
  }

  const settings = state.family_settings;
  if (settings) {
    const familyAvatarId = await migrateDataUrl({
      dataUrl: settings.family_avatar_data_url,
      mediaId: settings.family_avatar_media_id,
      ownerType: 'avatar',
      ownerId: 'family-avatar',
      mediaType: 'image',
      fileName: 'family-avatar.webp'
    });
    if (familyAvatarId) {
      settings.family_avatar_media_id = familyAvatarId;
      settings.family_avatar_data_url = null;
    }

    const parentAvatarId = await migrateDataUrl({
      dataUrl: settings.parent_avatar_data_url,
      mediaId: settings.parent_avatar_media_id,
      ownerType: 'avatar',
      ownerId: 'parent-avatar',
      mediaType: 'image',
      fileName: 'parent-avatar.webp'
    });
    if (parentAvatarId) {
      settings.parent_avatar_media_id = parentAvatarId;
      settings.parent_avatar_data_url = null;
    }
  }

  if (migratedMediaIds.length) writeJson(storage, LOCAL_DATABASE_KEY, state);
  return { migratedCount: migratedMediaIds.length, migratedMediaIds };
}

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:(image|video|audio)\//.test(value);
}

function dataUrlMimeType(value: string | null | undefined) {
  if (!isDataUrl(value)) return null;
  return value.slice(5, value.indexOf(';')) || null;
}

function dataUrlByteSize(value: string | null | undefined) {
  if (!isDataUrl(value)) return 0;
  const base64 = value.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload = ''] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function mailboxMediaType(cardType: string, mimeType: string | null): UnifiedMediaType {
  if (cardType === 'video' || mimeType?.startsWith('video/')) return 'video';
  if (cardType === 'audio' || mimeType?.startsWith('audio/')) return 'audio';
  return 'image';
}

function createLocalId(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
