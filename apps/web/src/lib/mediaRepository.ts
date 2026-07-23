import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dataMode, dataRepository } from './dataRepository';
import { getSupabaseConfig, supabaseClient } from './supabaseData';
import { getChildSession, isChildSessionValid } from './childSessionRepository';
import { ImageUploadPipelineError, logImageUploadDiagnostics, uploadStageMessage } from './imageUploadPipeline';
import { startupTrace, traceStartupPromise, traceStartupPromiseAll } from './startupTrace';
import type { LocalDatabaseState, UUID } from './localTypes';

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
const signedUrlCache = new Map<string, { url: string; references: number; expiresAt: number }>();
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

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
  familyId?: string | null;
  childId?: string | null;
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

type RemoteMediaAsset = {
  id: UUID;
  family_id: UUID;
  child_id: UUID | null;
  entity_type: MediaOwnerType | string | null;
  entity_id: UUID | string | null;
  media_kind: UnifiedMediaType | 'document';
  purpose: string | null;
  bucket: 'family-media';
  path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

type MediaScope = {
  familyId: UUID;
  childId: UUID;
  ownerId: string;
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
  listStoreSummaries,
  backfillLocalMediaToSupabase
};

async function openMediaDb() {
  return traceStartupPromise('openMediaDb', () => new Promise<IDBDatabase>((resolve, reject) => {
    startupTrace('indexedDB.open start', { databaseName: DB_NAME, version: DB_VERSION });
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onblocked = () => {
      startupTrace('indexedDB.open blocked', { databaseName: DB_NAME, version: DB_VERSION });
    };
    request.onupgradeneeded = (event) => {
      startupTrace('indexedDB.open upgrade start', {
        databaseName: DB_NAME,
        version: DB_VERSION,
        oldVersion: event.oldVersion
      });
      upgradeMediaDb(request);
      startupTrace('indexedDB.open upgrade finish', {
        databaseName: DB_NAME,
        version: DB_VERSION
      });
    };
    request.onsuccess = () => {
      startupTrace('indexedDB.open finish', { databaseName: DB_NAME, version: DB_VERSION });
      resolve(request.result);
    };
    request.onerror = () => {
      startupTrace('indexedDB.open error', {
        databaseName: DB_NAME,
        version: DB_VERSION,
        message: request.error?.message ?? 'Failed to open media IndexedDB'
      });
      reject(request.error ?? new Error('Failed to open media IndexedDB'));
    };
  }));
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
  startupTrace('mediaRepository.saveMedia start', {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mediaType: input.mediaType,
    id: input.id ?? null
  });
  const record = await traceStartupPromise('mediaRepository.normalizeSaveInput', () => normalizeSaveInput(input), {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mediaType: input.mediaType
  });
  if (shouldUseSupabaseStorage(record.ownerType)) {
    const saved = await traceStartupPromise('mediaRepository.saveSupabaseStorageMedia', () => saveSupabaseStorageMedia(record, input), {
      ownerType: record.ownerType,
      ownerId: record.ownerId,
      id: record.id
    });
    startupTrace('mediaRepository.saveMedia finish', { id: saved.id, remote: true });
    return saved;
  }
  const db = await traceStartupPromise('mediaRepository.openMediaDb for saveMedia', () => openMediaDb(), {
    id: record.id
  });
  await traceStartupPromise('mediaRepository.writeTransaction saveMedia', () => writeTransaction(db, (store) => store.put(record)), {
    id: record.id
  });
  db.close();
  startupTrace('mediaRepository.saveMedia finish', { id: record.id, remote: false });
  return record;
}

export async function getMedia(id: string) {
  const remoteMedia = await findRemoteMedia(id);
  if (remoteMedia) return getSupabaseStorageMedia(remoteMedia);
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
  const remoteMedia = await findRemoteMedia(id);
  if (remoteMedia) {
    await deleteSupabaseStorageMedia(remoteMedia);
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
  if (shouldUseSupabaseStorage(next.ownerType)) {
    const saved = await saveSupabaseStorageMedia(next, input);
    revokeCachedObjectUrl(input.id);
    return saved;
  }
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

export async function backfillLocalMediaToSupabase() {
  if (dataMode !== 'supabase' || !supabaseClient) return { attempted: 0, uploaded: 0, skipped: 0, failed: 0 };
  const records = await listMedia();
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const record of records) {
    if (record.bucket === 'family-media' && record.storagePath) {
      skipped += 1;
      continue;
    }
    try {
      await saveSupabaseStorageMedia(record, {
        id: record.id,
        ownerType: record.ownerType,
        ownerId: record.ownerId,
        mediaType: record.mediaType,
        mimeType: record.mimeType,
        fileName: record.fileName,
        width: record.width,
        height: record.height,
        duration: record.duration,
        thumbnailBlob: record.thumbnailBlob,
        thumbnailMimeType: record.thumbnailMimeType,
        blob: record.blob,
        createdAt: record.createdAt
      });
      uploaded += 1;
    } catch (error) {
      failed += 1;
      console.warn('[mediaRepository] failed to backfill local media to Supabase', {
        mediaId: record.id,
        ownerType: record.ownerType,
        ownerId: record.ownerId,
        error
      });
    }
  }
  return { attempted: records.length, uploaded, skipped, failed };
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
  const remoteMedia = await findRemoteMedia(id);
  if (remoteMedia) return acquireSupabaseSignedUrl(id, remoteMedia);
  const record = await getMedia(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(id, { url, references: 1 });
  return url;
}

export function releaseMediaObjectUrl(id: string) {
  const signed = signedUrlCache.get(id);
  if (signed) {
    signed.references -= 1;
    if (signed.references <= 0) signedUrlCache.delete(id);
    return;
  }
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
  const storeNames = Array.from(db.objectStoreNames);
  const summaries = await traceStartupPromiseAll(
    'mediaRepository.listStoreSummaries stores',
    storeNames.map((storeName) => ({
      label: storeName,
      promise:
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
    }))
  );
  db.close();
  return summaries;
}

function writeTransaction(db: IDBDatabase, write: (store: IDBObjectStore) => void) {
  return traceStartupPromise('mediaRepository.writeTransaction', () => new Promise<void>((resolve, reject) => {
    startupTrace('mediaRepository.writeTransaction inner start');
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    write(transaction.objectStore(MEDIA_STORE_NAME));
    transaction.oncomplete = () => {
      startupTrace('mediaRepository.writeTransaction inner finish');
      resolve();
    };
    transaction.onerror = () => {
      startupTrace('mediaRepository.writeTransaction inner error', {
        message: transaction.error?.message ?? 'Failed to write media'
      });
      reject(transaction.error ?? new Error('Failed to write media'));
    };
  }));
}

async function normalizeSaveInput(input: SaveMediaInput): Promise<UnifiedMediaRecord> {
  const mediaType = input.mediaType;
  const blob = await traceStartupPromise('mediaRepository.prepareMediaBlob', () => prepareMediaBlob(input), {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mediaType
  });
  validateMediaLimit(mediaType, blob, input.duration ?? null);
  const thumbnail = input.thumbnailBlob ?? (await traceStartupPromise('mediaRepository.generateThumbnailBlob', () => generateThumbnailBlob(blob, mediaType), {
    mediaType,
    blobSize: blob.size
  }));
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
  return dataMode === 'supabase' && Boolean(supabaseClient) && Boolean(ownerType);
}

async function saveSupabaseStorageMedia(record: UnifiedMediaRecord, input?: Partial<SaveMediaInput>): Promise<UnifiedMediaRecord> {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const scope = resolveMediaScope(record, input);
  if (!scope) throw new Error('Media owner scope is unavailable. Please save the item first or re-upload the media.');
  const client = getStorageClientForScope(scope);
  const extension = extensionFromMimeType(record.mimeType, record.fileName);
  const createdAt = new Date(record.createdAt);
  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const ownerSegment = safePathSegment(record.ownerType);
  const storagePath = `${scope.familyId}/${scope.childId}/${year}/${month}/${ownerSegment}/${record.id}.${extension}`;
  const upload = await client.storage
    .from('family-media')
    .upload(storagePath, record.blob, {
      cacheControl: '31536000',
      contentType: record.mimeType,
      upsert: true
    });
  if (upload.error) {
    const diagnostics = {
      stage: 'storage-upload' as const,
      ownerType: record.ownerType,
      familyId: scope.familyId,
      childId: scope.childId,
      ownerId: scope.ownerId,
      originalFileName: record.fileName ?? null,
      originalMimeType: record.mimeType,
      originalBytes: record.blob.size,
      normalizedFileName: record.fileName ?? null,
      normalizedMimeType: record.mimeType,
      normalizedBytes: record.blob.size,
      path: storagePath,
      storagePath,
      bytes: record.blob.size,
      mimeType: record.mimeType,
      status: 'statusCode' in upload.error ? upload.error.statusCode : undefined,
      uploadStatus: 'statusCode' in upload.error ? upload.error.statusCode : undefined,
      code: 'error' in upload.error ? String(upload.error.error) : undefined,
      uploadCode: 'error' in upload.error ? String(upload.error.error) : undefined,
      message: upload.error.message
    };
    logImageUploadDiagnostics('[mediaRepository] family-media upload failed', diagnostics);
    throw new ImageUploadPipelineError('storage-upload', uploadStageMessage('storage-upload'), diagnostics, upload.error);
  }
  logImageUploadDiagnostics('[mediaRepository] family-media upload completed', {
    stage: 'storage-upload',
    ownerType: record.ownerType,
    familyId: scope.familyId,
    childId: scope.childId,
    ownerId: scope.ownerId,
    originalFileName: record.fileName ?? null,
    originalMimeType: record.mimeType,
    originalBytes: record.blob.size,
    normalizedFileName: record.fileName ?? null,
    normalizedMimeType: record.mimeType,
    normalizedBytes: record.blob.size,
    storagePath,
    uploadStatus: 200,
    mediaAssetId: record.id
  });

  let thumbnailPath: string | null = null;
  if (record.thumbnailBlob) {
    thumbnailPath = `${scope.familyId}/${scope.childId}/${year}/${month}/${ownerSegment}/${record.id}-thumb.webp`;
    const thumbnailUpload = await client.storage
      .from('family-media')
      .upload(thumbnailPath, record.thumbnailBlob, {
        cacheControl: '31536000',
        contentType: record.thumbnailMimeType ?? record.thumbnailBlob.type ?? 'image/webp',
        upsert: true
      });
    if (thumbnailUpload.error) throw thumbnailUpload.error;
  }

  await upsertRemoteMediaAsset({
    record,
    scope,
    storagePath
  });

  if (record.ownerType === 'share') {
    try {
      dataRepository.updateShareMediaStorage(record.id, {
        bucket: 'family-media',
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        mime_type: record.mimeType,
        file_size_bytes: record.blob.size,
        width: record.width ?? null,
        height: record.height ?? null,
        duration_seconds: record.duration ?? null
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Share media not found')) throw error;
    }
  }

  return {
    ...record,
    bucket: 'family-media',
    storagePath,
    thumbnailPath
  };
}

async function getSupabaseStorageMedia(media: RemoteMediaAsset) {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const client = getStorageClientForRemoteMedia(media);
  const download = await client.storage.from(media.bucket).download(media.path);
  if (download.error) throw download.error;
  let thumbnailBlob: Blob | undefined;
  return {
    id: media.id,
    ownerType: normalizeRemoteOwnerType(media.entity_type),
    ownerId: media.entity_id ?? media.id,
    mediaType: normalizeRemoteMediaType(media.media_kind),
    mimeType: media.mime_type,
    fileName: media.path.split('/').pop(),
    bucket: 'family-media',
    storagePath: media.path,
    thumbnailBlob,
    thumbnailMimeType: thumbnailBlob?.type,
    thumbnailPath: null,
    createdAt: normalizeCreatedAt(media.created_at),
    blob: download.data
  } satisfies UnifiedMediaRecord;
}

async function deleteSupabaseStorageMedia(media: RemoteMediaAsset) {
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const client = getStorageClientForRemoteMedia(media);
  const paths = [media.path].filter((path): path is string => Boolean(path));
  if (!paths.length) return;
  const { error } = await client.storage.from(media.bucket).remove(paths);
  if (error) throw error;
  await client.from('media_assets').delete().eq('id', media.id);
}

async function findRemoteMedia(mediaId: string): Promise<RemoteMediaAsset | null> {
  if (dataMode !== 'supabase') return null;
  const media = dataRepository.getState().share_media.find((item) => item.id === mediaId || item.media_asset_id === mediaId);
  if (media?.bucket === 'family-media') {
    return {
      id: media.media_asset_id ?? media.id,
      family_id: media.family_id,
      child_id: media.child_id,
      entity_type: 'share',
      entity_id: media.share_id,
      media_kind: media.media_type,
      purpose: 'content',
      bucket: 'family-media',
      path: media.storage_path,
      mime_type: media.mime_type,
      file_size: media.file_size_bytes,
      created_at: media.created_at
    };
  }
  if (!supabaseClient) return null;
  const scoped = getStorageClientForCurrentSession();
  const { data, error } = await scoped
    .from('media_assets')
    .select('id,family_id,child_id,entity_type,entity_id,media_kind,purpose,bucket,path,mime_type,file_size,created_at')
    .eq('id', mediaId)
    .maybeSingle();
  if (error) {
    console.warn('[mediaRepository] failed to resolve remote media metadata', { mediaId, error });
    return null;
  }
  const row = data as RemoteMediaAsset | null;
  return row?.bucket === 'family-media' ? row : null;
}

async function upsertRemoteMediaAsset(input: {
  record: UnifiedMediaRecord;
  scope: MediaScope;
  storagePath: string;
}) {
  const client = getStorageClientForScope(input.scope);
  const row = {
    id: input.record.id,
    family_id: input.scope.familyId,
    child_id: input.scope.childId,
    record_id: null,
    entity_type: input.record.ownerType,
    entity_id: isUuid(input.scope.ownerId) ? input.scope.ownerId : null,
    media_kind: input.record.mediaType,
    purpose: mediaPurpose(input.record.ownerType),
    bucket: 'family-media',
    path: input.storagePath,
    mime_type: input.record.mimeType,
    file_size: input.record.blob.size,
    caption: input.record.fileName ?? null,
    uploaded_by: null,
    uploaded_by_child_id: input.record.ownerType === 'avatar' && input.scope.ownerId === input.scope.childId ? input.scope.childId : null,
    uploaded_by_device_id: null
  };
  const { error } = await client.from('media_assets').upsert(row, { onConflict: 'id' });
  if (error) {
    const diagnostics = {
      stage: 'media-assets' as const,
      ownerType: input.record.ownerType,
      familyId: input.scope.familyId,
      childId: input.scope.childId,
      ownerId: input.scope.ownerId,
      originalFileName: input.record.fileName ?? null,
      originalMimeType: input.record.mimeType,
      originalBytes: input.record.blob.size,
      normalizedFileName: input.record.fileName ?? null,
      normalizedMimeType: input.record.mimeType,
      normalizedBytes: input.record.blob.size,
      storagePath: input.storagePath,
      mediaAssetId: input.record.id,
      uploadCode: error.code,
      uploadMessage: error.message
    };
    logImageUploadDiagnostics('[mediaRepository] media_assets upsert failed', diagnostics);
    throw new ImageUploadPipelineError('media-assets', uploadStageMessage('media-assets'), diagnostics, error);
  }
  logImageUploadDiagnostics('[mediaRepository] media_assets upsert completed', {
    stage: 'media-assets',
    ownerType: input.record.ownerType,
    familyId: input.scope.familyId,
    childId: input.scope.childId,
    ownerId: input.scope.ownerId,
    originalFileName: input.record.fileName ?? null,
    originalMimeType: input.record.mimeType,
    originalBytes: input.record.blob.size,
    normalizedFileName: input.record.fileName ?? null,
    normalizedMimeType: input.record.mimeType,
    normalizedBytes: input.record.blob.size,
    storagePath: input.storagePath,
    mediaAssetId: input.record.id
  });
}

function resolveMediaScope(record: UnifiedMediaRecord, input?: Partial<SaveMediaInput>): MediaScope | null {
  const state = dataRepository.getState();
  const session = getChildSession();
  const familyId = input?.familyId ?? session?.familyId ?? state.family_id;
  const explicitChildId = input?.childId ?? null;
  const childId =
    explicitChildId ??
    resolveOwnerChildId(record.ownerType, record.ownerId, state) ??
    (isChildSessionValid(session) ? session.childId : null) ??
    state.active_child_id ??
    state.device_child_id ??
    state.children.find((child) => child.status === 'active')?.id ??
    null;
  if (!familyId || !childId) return null;
  return { familyId, childId, ownerId: record.ownerId };
}

function resolveOwnerChildId(ownerType: MediaOwnerType, ownerId: string, state: LocalDatabaseState) {
  if (ownerType === 'share') return state.shares.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'dream') return state.dreams.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'mailbox') return state.encouragement_cards.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'special-day') return state.special_days.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'piggy-product') return state.piggy_products.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'task') return state.tasks.find((item) => item.id === ownerId)?.child_id ?? null;
  if (ownerType === 'avatar') return state.children.some((child) => child.id === ownerId) ? ownerId : null;
  return null;
}

function getStorageClientForCurrentSession() {
  const session = getChildSession();
  if (isChildSessionValid(session)) return getChildScopedSupabaseClient(session);
  return supabaseClient!;
}

function getStorageClientForRemoteMedia(media: RemoteMediaAsset) {
  const session = getChildSession();
  if (isChildSessionValid(session, media.child_id)) return getChildScopedSupabaseClient(session);
  return supabaseClient!;
}

function getStorageClientForScope(scope: MediaScope) {
  const session = getChildSession();
  if (isChildSessionValid(session, scope.childId)) return getChildScopedSupabaseClient(session);
  return supabaseClient!;
}

async function acquireSupabaseSignedUrl(id: string, media: RemoteMediaAsset) {
  const cached = signedUrlCache.get(id);
  if (cached && cached.expiresAt - Date.now() > SIGNED_URL_REFRESH_BUFFER_MS) {
    cached.references += 1;
    return cached.url;
  }
  if (!supabaseClient) throw new Error('Supabase Storage is not configured');
  const client = getStorageClientForRemoteMedia(media);
  const signed = await client.storage.from(media.bucket).createSignedUrl(media.path, SIGNED_URL_TTL_SECONDS);
  if (signed.error) throw signed.error;
  if (!signed.data?.signedUrl) throw new Error('無法取得媒體授權網址');
  signedUrlCache.set(id, {
    url: signed.data.signedUrl,
    references: (cached?.references ?? 0) + 1,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000
  });
  return signed.data.signedUrl;
}

let childScopedClientKey: string | null = null;
let childScopedClient: SupabaseClient | null = null;

function getChildScopedSupabaseClient(session: NonNullable<ReturnType<typeof getChildSession>>) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase is not configured');
  const key = `${session.childId}:${session.deviceBindingId}:${session.deviceId}`;
  if (childScopedClient && childScopedClientKey === key) return childScopedClient;
  childScopedClientKey = key;
  childScopedClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        'x-child-id': session.childId,
        'x-child-device-id': session.deviceId,
        'x-child-device-binding-id': session.deviceBindingId
      }
    }
  });
  return childScopedClient;
}

function mediaPurpose(ownerType: MediaOwnerType) {
  if (ownerType === 'avatar') return 'avatar';
  if (ownerType === 'dream' || ownerType === 'special-day') return 'cover';
  return 'content';
}

function normalizeRemoteOwnerType(value: string | null): MediaOwnerType {
  if (
    value === 'share' ||
    value === 'dream' ||
    value === 'mailbox' ||
    value === 'special-day' ||
    value === 'avatar' ||
    value === 'memory' ||
    value === 'piggy-product' ||
    value === 'task'
  ) {
    return value;
  }
  return 'memory';
}

function normalizeRemoteMediaType(value: string): UnifiedMediaType {
  if (value === 'photo' || value === 'audio' || value === 'video' || value === 'image') return value;
  return 'image';
}

function safePathSegment(value: string) {
  return value.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'media';
}

function isUuid(value: string | null | undefined): value is UUID {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value));
}

function extensionFromMimeType(mimeType: string, fileName?: string) {
  const extension = fileName?.split('.').pop()?.toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'mp3', 'm4a', 'mp4', 'mov', 'wav', 'webm'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('webm')) return 'webm';
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
  signedUrlCache.delete(id);
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
    const compressed = await traceStartupPromise('mediaRepository.resizeImageBlob prepare', () => resizeImageBlob(input.blob, IMAGE_MAX_SIDE, 0.82), {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      mediaType: input.mediaType
    });
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
    return await traceStartupPromise('mediaRepository.resizeImageBlob thumbnail', () => resizeImageBlob(blob, THUMBNAIL_MAX_SIDE, 0.72), {
      mediaType,
      blobSize: blob.size
    });
  } catch {
    return null;
  }
}

async function resizeImageBlob(blob: Blob, maxSide: number, quality: number) {
  const bitmap = await traceStartupPromise('createImageBitmap', () => createImageBitmap(blob), {
    blobSize: blob.size,
    blobType: blob.type,
    maxSide
  });
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
  return traceStartupPromise('canvas.toBlob', () => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality)), {
    width,
    height,
    quality
  });
}

function defaultMimeType(mediaType: UnifiedMediaType) {
  if (mediaType === 'photo' || mediaType === 'image') return 'image/webp';
  if (mediaType === 'audio') return 'audio/mp4';
  return 'video/mp4';
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
