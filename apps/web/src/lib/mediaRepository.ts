import { dataMode, dataRepository } from './dataRepository';
import { supabaseClient } from './supabaseData';

const DB_NAME = 'little-dreamers-family-media';
const DB_VERSION = 4;
const MEDIA_STORE_NAME = 'media';
const LEGACY_SHARE_STORE_NAME = 'share-media';
const LEGACY_DREAM_STORE_NAME = 'dream-media';
const LEGACY_VIDEO_STORE_NAME = 'share-videos';

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const AUDIO_MAX_SECONDS = 5 * 60;
const THUMBNAIL_MAX_SIDE = 320;
const IMAGE_MAX_SIDE = 1600;

const objectUrlCache = new Map<string, { url: string; references: number }>();

export type MediaOwnerType = 'share' | 'dream' | 'mailbox' | 'special-day' | 'avatar' | 'memory' | 'piggy-product' | 'task';
export type UnifiedMediaType = 'photo' | 'audio' | 'video' | 'image';

export type UnifiedMediaRecord = {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  mediaType: UnifiedMediaType;
  mimeType: string;
  fileName?: string;
  width?: number;
  height?: number;
  duration?: number;
  bucket?: 'family-media';
  storagePath?: string;
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
  thumbnailPath?: string | null;
  createdAt: number;
  blob: Blob;
};

export type SaveMediaInput = {
  id?: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  mediaType: UnifiedMediaType;
  mimeType?: string;
  fileName?: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailBlob?: Blob | null;
  thumbnailMimeType?: string | null;
  skipImageCompression?: boolean;
  blob: Blob;
  createdAt?: number;
};

export type UpdateMediaInput = Partial<Omit<SaveMediaInput, 'id'>> & {
  id: string;
};

export type LocalMediaStoreSummary = {
  databaseName: string;
  storeName: string;
  count: number;
  totalBytes: number;
  hasBlob: boolean;
};

type LegacyMediaRecord = {
  id: string;
  blob: Blob;
  mimeType?: string;
  mediaType?: 'photo' | 'audio' | 'video' | 'dream-cover';
  size?: number;
  createdAt?: string | number;
};

export const mediaRepository = {
  saveMedia,
  getMedia,
  deleteMedia,
  updateMedia,
  getMediaByOwner,
  listMedia,
  deleteOwnerMedia,
  clearMedia,
  clearDemoMedia,
  cleanup,
  getMediaObjectUrl,
  acquireMediaObjectUrl,
  releaseMediaObjectUrl,
  revokeMediaObjectUrl,
  getMediaThumbnail,
  getThumbnail,
  createThumbnail,
  listStoreSummaries
};

async function openMediaDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgradeMediaDb(request);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open media IndexedDB'));
  });
}

function upgradeMediaDb(request: IDBOpenDBRequest) {
  const db = request.result;
  const transaction = request.transaction;
  if (!transaction) return;

  let mediaStore: IDBObjectStore;
  if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
    mediaStore = db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
  } else {
    mediaStore = transaction.objectStore(MEDIA_STORE_NAME);
  }
  if (!mediaStore.indexNames.contains('owner')) {
    mediaStore.createIndex('owner', ['ownerType', 'ownerId'], { unique: false });
  }

  migrateLegacyStore(db, transaction, mediaStore, LEGACY_SHARE_STORE_NAME, 'share');
  migrateLegacyStore(db, transaction, mediaStore, LEGACY_DREAM_STORE_NAME, 'dream');
  migrateLegacyStore(db, transaction, mediaStore, LEGACY_VIDEO_STORE_NAME, 'share');
}

function migrateLegacyStore(
  db: IDBDatabase,
  transaction: IDBTransaction,
  mediaStore: IDBObjectStore,
  legacyStoreName: string,
  ownerType: MediaOwnerType
) {
  if (!db.objectStoreNames.contains(legacyStoreName)) return;

  const request = transaction.objectStore(legacyStoreName).getAll();
  request.onsuccess = () => {
    const records = (request.result as LegacyMediaRecord[]) ?? [];
    records.forEach((record) => {
      if (!record?.id || !(record.blob instanceof Blob)) return;
      mediaStore.put(normalizeLegacyRecord(record, ownerType));
    });
    db.deleteObjectStore(legacyStoreName);
  };
}

function normalizeLegacyRecord(record: LegacyMediaRecord, ownerType: MediaOwnerType): UnifiedMediaRecord {
  const mappedOwnerType = ownerType;
  const mediaType = record.mediaType === 'dream-cover' ? 'image' : record.mediaType ?? 'video';
  const ownerId =
    mappedOwnerType === 'share'
      ? findShareOwnerId(record.id)
      : mappedOwnerType === 'dream'
        ? findDreamOwnerId(record.id)
        : record.id;
  return {
    id: record.id,
    ownerType: mappedOwnerType,
    ownerId,
    mediaType,
    mimeType: record.mimeType || record.blob.type || defaultMimeType(mediaType),
    createdAt: normalizeCreatedAt(record.createdAt),
    blob: record.blob
  };
}

export async function saveMedia(input: SaveMediaInput) {
  const record = await normalizeSaveInput(input);
  if (shouldUseSupabaseStorage(record.ownerType)) {
    return saveSupabaseStorageMedia(record);
  }
  const db = await openMediaDb();
  await writeTransaction(db, (store) => store.put(record));
  db.close();
  return record;
}

export async function getMedia(id: string) {
  const remoteShareMedia = findRemoteShareMedia(id);
  if (remoteShareMedia) return getSupabaseStorageMedia(remoteShareMedia);
  const db = await openMediaDb();
  const record = await new Promise<UnifiedMediaRecord | null>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as UnifiedMediaRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read media'));
  });
  db.close();
  return record;
}

export async function deleteMedia(id: string) {
  revokeCachedObjectUrl(id);
  const remoteShareMedia = findRemoteShareMedia(id);
  if (remoteShareMedia) {
    await deleteSupabaseStorageMedia(remoteShareMedia);
    return;
  }
  const db = await openMediaDb();
  await writeTransaction(db, (store) => store.delete(id));
  db.close();
}

export async function updateMedia(input: UpdateMediaInput) {
  const existing = await getMedia(input.id);
  if (!existing) return null;
  const next = await normalizeSaveInput({
    ...existing,
    ...input,
    id: input.id,
    blob: input.blob ?? existing.blob
  });
  const db = await openMediaDb();
  await writeTransaction(db, (store) => store.put(next));
  db.close();
  revokeCachedObjectUrl(input.id);
  return next;
}

export async function getMediaByOwner(ownerType: MediaOwnerType, ownerId: string) {
  const db = await openMediaDb();
  const records = await new Promise<UnifiedMediaRecord[]>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const request = store.indexNames.contains('owner')
      ? store.index('owner').getAll([ownerType, ownerId])
      : store.getAll();
    request.onsuccess = () => {
      const result = (request.result as UnifiedMediaRecord[]) ?? [];
      resolve(
        store.indexNames.contains('owner')
          ? result
          : result.filter((record) => record.ownerType === ownerType && record.ownerId === ownerId)
      );
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read owner media'));
  });
  db.close();
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listMedia() {
  const db = await openMediaDb();
  const records = await new Promise<UnifiedMediaRecord[]>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as UnifiedMediaRecord[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('Failed to list media'));
  });
  db.close();
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteOwnerMedia(ownerType: MediaOwnerType, ownerId: string) {
  const records = await getMediaByOwner(ownerType, ownerId);
  const db = await openMediaDb();
  await writeTransaction(db, (store) => {
    records.forEach((record) => {
      revokeCachedObjectUrl(record.id);
      store.delete(record.id);
    });
  });
  db.close();
}

export async function clearMedia() {
  cleanup();
  const db = await openMediaDb();
  await writeTransaction(db, (store) => store.clear());
  db.close();
}

export async function clearDemoMedia() {
  cleanup();
  const records = await listMedia();
  const demoRecords = records.filter((record) => record.ownerType !== 'avatar');
  if (!demoRecords.length) return;

  const db = await openMediaDb();
  await writeTransaction(db, (store) => {
    demoRecords.forEach((record) => {
      revokeCachedObjectUrl(record.id);
      store.delete(record.id);
    });
  });
  db.close();
}

export function cleanup() {
  objectUrlCache.forEach((cached) => URL.revokeObjectURL(cached.url));
  objectUrlCache.clear();
}

export async function getMediaObjectUrl(id: string) {
  return acquireMediaObjectUrl(id);
}

export async function acquireMediaObjectUrl(id: string) {
  const cached = objectUrlCache.get(id);
  if (cached) {
    cached.references += 1;
    return cached.url;
  }
  const record = await getMedia(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(id, { url, references: 1 });
  return url;
}

export function releaseMediaObjectUrl(id: string) {
  const cached = objectUrlCache.get(id);
  if (!cached) return;
  cached.references -= 1;
  if (cached.references > 0) return;
  URL.revokeObjectURL(cached.url);
  objectUrlCache.delete(id);
}

export function revokeMediaObjectUrl(id: string) {
  revokeCachedObjectUrl(id);
}

export async function getMediaThumbnail(id: string) {
  const record = await getMedia(id);
  if (!record) return null;
  return record.thumbnailBlob ?? null;
}

export async function getThumbnail(id: string) {
  return getMediaThumbnail(id);
}

export async function createThumbnail(blob: Blob, mediaType: UnifiedMediaType = 'image') {
  return generateThumbnailBlob(blob, mediaType);
}

export async function listStoreSummaries(): Promise<LocalMediaStoreSummary[]> {
  const db = await openMediaDb();
  const summaries = await Promise.all(
    Array.from(db.objectStoreNames).map(
      (storeName) =>
        new Promise<LocalMediaStoreSummary>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const request = transaction.objectStore(storeName).getAll();
          request.onsuccess = () => {
            const records = (request.result as Array<UnifiedMediaRecord | LegacyMediaRecord>) ?? [];
            resolve({
              databaseName: DB_NAME,
              storeName,
              count: records.length,
              totalBytes: records.reduce((total, record) => total + (record.blob?.size ?? 0), 0),
              hasBlob: records.some((record) => record.blob instanceof Blob)
            });
          };
          request.onerror = () => reject(request.error ?? new Error('Failed to list media store'));
        })
    )
  );
  db.close();
  return summaries;
}

function writeTransaction(db: IDBDatabase, write: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    write(transaction.objectStore(MEDIA_STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to write media'));
  });
}

async function normalizeSaveInput(input: SaveMediaInput): Promise<UnifiedMediaRecord> {
  const mediaType = input.mediaType;
  const blob = await prepareMediaBlob(input);
  validateMediaLimit(mediaType, blob, input.duration ?? null);
  const thumbnail = input.thumbnailBlob ?? (await generateThumbnailBlob(blob, mediaType));
  return {
    id: input.id ?? createLocalId(),
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mediaType,
    mimeType: input.mimeType || blob.type || defaultMimeType(mediaType),
    fileName: input.fileName || undefined,
    width: input.width ?? undefined,
    height: input.height ?? undefined,
    duration: input.duration ?? undefined,
    thumbnailBlob: thumbnail ?? undefined,
    thumbnailMimeType: thumbnail?.type || undefined,
    createdAt: input.createdAt ?? Date.now(),
    blob
  };
}

function shouldUseSupabaseStorage(ownerType: MediaOwnerType) {
  return dataMode === 'supabase' && ownerType === 'share' && Boolean(supabaseClient);
}

async function saveSupabaseStorageMedia(record: UnifiedMediaRecord): Promise<UnifiedMediaRecord> {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const share = dataRepository.getState().shares.find((item) => item.id === record.ownerId);
  if (!share) throw new Error('Share metadata must exist before uploading media');
  const extension = extensionFromMimeType(record.mimeType, record.fileName);
  const createdAt = new Date(record.createdAt);
  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const storagePath = `${share.family_id}/${share.child_id}/${year}/${month}/${record.id}.${extension}`;
  const upload = await supabaseClient.storage
    .from('family-media')
    .upload(storagePath, record.blob, {
      cacheControl: '31536000',
      contentType: record.mimeType,
      upsert: true
    });
  if (upload.error) throw upload.error;

  let thumbnailPath: string | null = null;
  if (record.thumbnailBlob) {
    thumbnailPath = `${share.family_id}/${share.child_id}/${year}/${month}/${record.id}-thumb.webp`;
    const thumbnailUpload = await supabaseClient.storage
      .from('family-media')
      .upload(thumbnailPath, record.thumbnailBlob, {
        cacheControl: '31536000',
        contentType: record.thumbnailMimeType ?? record.thumbnailBlob.type ?? 'image/webp',
        upsert: true
      });
    if (thumbnailUpload.error) throw thumbnailUpload.error;
  }

  return {
    ...record,
    bucket: 'family-media',
    storagePath,
    thumbnailPath
  };
}

async function getSupabaseStorageMedia(media: ReturnType<typeof findRemoteShareMedia> extends infer T ? NonNullable<T> : never) {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const download = await supabaseClient.storage.from(media.bucket).download(media.storage_path);
  if (download.error) throw download.error;
  let thumbnailBlob: Blob | undefined;
  if (media.thumbnail_path) {
    const thumbnailDownload = await supabaseClient.storage.from(media.bucket).download(media.thumbnail_path);
    if (!thumbnailDownload.error && thumbnailDownload.data) thumbnailBlob = thumbnailDownload.data;
  }
  return {
    id: media.id,
    ownerType: 'share',
    ownerId: media.share_id,
    mediaType: media.media_type,
    mimeType: media.mime_type,
    fileName: media.storage_path.split('/').pop(),
    width: media.width ?? undefined,
    height: media.height ?? undefined,
    duration: media.duration_seconds ?? undefined,
    bucket: 'family-media',
    storagePath: media.storage_path,
    thumbnailBlob,
    thumbnailMimeType: thumbnailBlob?.type,
    thumbnailPath: media.thumbnail_path,
    createdAt: normalizeCreatedAt(media.created_at),
    blob: download.data
  } satisfies UnifiedMediaRecord;
}

async function deleteSupabaseStorageMedia(media: ReturnType<typeof findRemoteShareMedia> extends infer T ? NonNullable<T> : never) {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const paths = [media.storage_path, media.thumbnail_path].filter((path): path is string => Boolean(path));
  if (!paths.length) return;
  const { error } = await supabaseClient.storage.from(media.bucket).remove(paths);
  if (error) throw error;
}

function findRemoteShareMedia(mediaId: string) {
  if (dataMode !== 'supabase') return null;
  const media = dataRepository.getState().share_media.find((item) => item.id === mediaId);
  return media?.bucket === 'family-media' ? media : null;
}

function extensionFromMimeType(mimeType: string, fileName?: string) {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('webm')) return 'webm';
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'bin';
}

function findShareOwnerId(mediaId: string) {
  const state = dataRepository.getState();
  const media = state.share_media.find((item) => item.id === mediaId);
  return media?.share_id ?? mediaId;
}

function findDreamOwnerId(mediaId: string) {
  const state = dataRepository.getState();
  const dream = state.dreams.find((item) => item.cover_media_id === mediaId || item.coverMediaId === mediaId);
  return dream?.id ?? mediaId;
}

function normalizeCreatedAt(value?: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Date.now();
}

function revokeCachedObjectUrl(id: string) {
  const cached = objectUrlCache.get(id);
  if (!cached) return;
  URL.revokeObjectURL(cached.url);
  objectUrlCache.delete(id);
}

function validateMediaLimit(mediaType: UnifiedMediaType, blob: Blob, duration?: number | null) {
  if ((mediaType === 'photo' || mediaType === 'image') && blob.size > PHOTO_MAX_BYTES) {
    throw new Error('Image media must be 10MB or smaller');
  }
  if (mediaType === 'video' && blob.size > VIDEO_MAX_BYTES) {
    throw new Error('Video media must be 300MB or smaller');
  }
  if (mediaType === 'audio' && duration !== null && duration !== undefined && duration > AUDIO_MAX_SECONDS) {
    throw new Error('Audio media must be 5 minutes or shorter');
  }
}

async function prepareMediaBlob(input: SaveMediaInput) {
  if (input.skipImageCompression || (input.mediaType !== 'photo' && input.mediaType !== 'image')) return input.blob;
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return input.blob;
  try {
    const compressed = await resizeImageBlob(input.blob, IMAGE_MAX_SIDE, 0.82);
    if (!compressed || compressed.size > input.blob.size) return input.blob;
    return compressed;
  } catch {
    return input.blob;
  }
}

async function generateThumbnailBlob(blob: Blob, mediaType: UnifiedMediaType) {
  if (mediaType !== 'photo' && mediaType !== 'image') return null;
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  try {
    return await resizeImageBlob(blob, THUMBNAIL_MAX_SIDE, 0.72);
  } catch {
    return null;
  }
}

async function resizeImageBlob(blob: Blob, maxSide: number, quality: number) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

function defaultMimeType(mediaType: UnifiedMediaType) {
  if (mediaType === 'photo' || mediaType === 'image') return 'image/webp';
  if (mediaType === 'audio') return 'audio/webm';
  return 'video/webm';
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
