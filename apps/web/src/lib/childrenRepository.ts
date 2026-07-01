import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';

export const childrenRepository = {
  createChild: dataRepository.createChild.bind(dataRepository),
  updateChild: dataRepository.updateChild.bind(dataRepository),
  deleteChild: dataRepository.deleteChild.bind(dataRepository),
  switchChild: dataRepository.switchChild.bind(dataRepository),
  listChildren: dataRepository.listChildren.bind(dataRepository),
  saveChildAvatar,
  getChildAvatarUrl,
  releaseChildAvatarUrl
};

async function saveChildAvatar(input: { childId: string; blob: Blob; mimeType: string; fileName?: string }) {
  const media = await mediaRepository.saveMedia({
    ownerType: 'avatar',
    ownerId: input.childId,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    blob: input.blob
  });
  return media.id;
}

function getChildAvatarUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseChildAvatarUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}
