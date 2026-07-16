import { dataRepository } from './dataRepository';
import { mediaRepository, clearDemoMedia } from './mediaRepository';
import { clearChildSession } from './childSessionRepository';

export const settingsRepository = {
  getSettings: dataRepository.getSettings.bind(dataRepository),
  getState: dataRepository.getState.bind(dataRepository),
  updateSettings: dataRepository.updateSettings.bind(dataRepository),
  exportData: dataRepository.exportData.bind(dataRepository),
  importData: dataRepository.importData.bind(dataRepository),
  resetAllData: dataRepository.resetAllData.bind(dataRepository),
  resetDemoData,
  previewTestDataCleanup: dataRepository.previewTestDataCleanup.bind(dataRepository),
  executeTestDataCleanup,
  createDemoData: dataRepository.createDemoData.bind(dataRepository),
  removeDemoData: dataRepository.removeDemoData.bind(dataRepository),
  saveAvatar,
  saveAvatarFile,
  getAvatarUrl,
  releaseAvatarUrl,
  downloadJson,
  estimateJsonKb
};

async function saveAvatar(input: { ownerId: string; blob: Blob; mimeType: string; fileName?: string }) {
  const media = await mediaRepository.saveMedia({
    ownerType: 'avatar',
    ownerId: input.ownerId,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    blob: input.blob
  });
  return media.id;
}

async function saveAvatarFile(input: { ownerId: string; file: File }) {
  return saveAvatar({
    ownerId: input.ownerId,
    blob: new Blob([await input.file.arrayBuffer()], { type: input.file.type || 'image/jpeg' }),
    mimeType: input.file.type || 'image/jpeg',
    fileName: input.file.name
  });
}

function getAvatarUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseAvatarUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}

function downloadJson(raw: string, fileName: string) {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function estimateJsonKb(raw: string) {
  return (new TextEncoder().encode(raw).length / 1024).toFixed(1);
}

async function resetDemoData() {
  await clearDemoMedia();
  return dataRepository.resetDemoData();
}

async function executeTestDataCleanup(input?: { familyId?: string | null; removeFamily?: boolean }) {
  const result = await dataRepository.executeTestDataCleanup(input);
  clearChildSession();
  return result;
}
