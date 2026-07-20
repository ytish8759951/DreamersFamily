import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';

export const specialDayRepository = {
  createSpecialDay: dataRepository.createSpecialDay.bind(dataRepository),
  updateSpecialDay: dataRepository.updateSpecialDay.bind(dataRepository),
  deleteSpecialDay: dataRepository.deleteSpecialDay.bind(dataRepository),
  getSpecialDays: dataRepository.getSpecialDays.bind(dataRepository),
  getUpcomingSpecialDays: dataRepository.getUpcomingSpecialDays.bind(dataRepository),
  saveSpecialDayImage,
  saveSpecialDayImageFile,
  getSpecialDayImageUrl,
  releaseSpecialDayImageUrl
};

async function saveSpecialDayImage(input: { ownerId: string; childId?: string | null; blob: Blob; mimeType: string; fileName?: string }) {
  const state = dataRepository.getState();
  const media = await mediaRepository.saveMedia({
    ownerType: 'special-day',
    ownerId: input.ownerId,
    childId: input.childId ?? state.special_days.find((day) => day.id === input.ownerId)?.child_id ?? state.active_child_id,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    blob: input.blob
  });
  return media.id;
}

async function saveSpecialDayImageFile(input: { ownerId: string; childId?: string | null; file: File }) {
  return saveSpecialDayImage({
    ownerId: input.ownerId,
    childId: input.childId,
    blob: new Blob([await input.file.arrayBuffer()], { type: input.file.type || 'image/jpeg' }),
    mimeType: input.file.type || 'image/jpeg',
    fileName: input.file.name
  });
}

function getSpecialDayImageUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseSpecialDayImageUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}
