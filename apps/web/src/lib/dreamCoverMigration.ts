import { useEffect } from 'react';
import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';
import type { LocalDream } from './localTypes';

let migrationPromise: Promise<void> | null = null;

export function useDreamCoverMigration() {
  useEffect(() => {
    void migrateDreamCoverDataUrls();
  }, []);
}

export function migrateDreamCoverDataUrls() {
  if (!migrationPromise) {
    migrationPromise = runDreamCoverDataUrlMigration().finally(() => {
      migrationPromise = null;
    });
  }
  return migrationPromise;
}

async function runDreamCoverDataUrlMigration() {
  const state = dataRepository.getState();
  const targets = state.dreams
    .map((dream) => ({ dream, dataUrl: findDreamCoverDataUrl(dream) }))
    .filter((item): item is { dream: LocalDream; dataUrl: string } => Boolean(item.dataUrl));

  for (const { dream, dataUrl } of targets) {
    const blob = await dataUrlToBlob(dataUrl);
    const mediaId = createLocalId();
    await mediaRepository.saveMedia({
      id: mediaId,
      ownerType: 'dream',
      ownerId: dream.id,
      mediaType: 'image',
      mimeType: blob.type || parseDataUrlMimeType(dataUrl) || 'image/webp',
      fileName: `${dream.title || 'dream-cover'}.${fileExtensionFromMimeType(blob.type || parseDataUrlMimeType(dataUrl))}`,
      blob
    });
    dataRepository.migrateDreamCoverToMedia(dream.id, {
      cover_media_id: mediaId,
      cover_mime_type: blob.type || parseDataUrlMimeType(dataUrl) || 'image/webp',
      cover_file_name: `${dream.title || 'dream-cover'}.${fileExtensionFromMimeType(blob.type || parseDataUrlMimeType(dataUrl))}`
    });
  }
}

function findDreamCoverDataUrl(dream: LocalDream) {
  for (const value of [dream.cover_path, dream.coverUrl, dream.imageUrl]) {
    if (typeof value === 'string' && value.startsWith('data:image')) return value;
  }
  return null;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function parseDataUrlMimeType(dataUrl: string) {
  const match = /^data:([^;,]+)/.exec(dataUrl);
  return match?.[1] ?? null;
}

function fileExtensionFromMimeType(mimeType?: string | null) {
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  return 'webp';
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
