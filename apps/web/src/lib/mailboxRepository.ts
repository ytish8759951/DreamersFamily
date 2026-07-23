import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';
import type { LocalMailboxMessage } from './localTypes';

export type MailboxRecordingDraft = {
  blob: Blob;
  preview_url: string;
  mime_type: string;
  file_name: string;
  duration_seconds: number;
};

export const mailboxRepository = {
  createMailboxMessage: dataRepository.createMailboxMessage.bind(dataRepository),
  markMessageRead: dataRepository.markMessageRead.bind(dataRepository),
  listMailboxMessages: dataRepository.listMailboxMessages.bind(dataRepository),
  createRecordingDraft,
  releaseRecordingDraft,
  saveMailboxMedia,
  saveMailboxMediaFile,
  saveMailboxRecording,
  deleteMailboxMedia,
  getMailboxMediaUrl,
  releaseMailboxMediaUrl
};

function createRecordingDraft(input: { chunks: Blob[]; mimeType: string; fileName: string; durationSeconds: number }): MailboxRecordingDraft {
  const blob = new Blob(input.chunks, { type: input.mimeType || 'audio/webm' });
  return {
    blob,
    preview_url: URL.createObjectURL(blob),
    mime_type: blob.type || 'audio/webm',
    file_name: input.fileName,
    duration_seconds: input.durationSeconds
  };
}

function releaseRecordingDraft(recording?: Pick<MailboxRecordingDraft, 'preview_url'> | null) {
  if (recording?.preview_url) URL.revokeObjectURL(recording.preview_url);
}

async function saveMailboxMedia(input: {
  ownerId: string;
  childId?: string | null;
  cardType: LocalMailboxMessage['card_type'];
  mimeType: string;
  fileName?: string;
  durationSeconds?: number | null;
  blob: Blob;
}) {
  const mediaType = input.cardType === 'audio' ? 'audio' : input.cardType === 'video' ? 'video' : 'image';
  const media = await mediaRepository.saveMedia({
    ownerType: 'mailbox',
    ownerId: input.ownerId,
    childId: input.childId,
    mediaType,
    mimeType: input.mimeType,
    fileName: input.fileName,
    duration: input.durationSeconds ?? undefined,
    blob: input.blob
  });
  return media.id;
}

async function saveMailboxMediaFile(input: { ownerId: string; childId?: string | null; cardType: LocalMailboxMessage['card_type']; file: File }) {
  const mimeType = input.file.type || (input.cardType === 'audio' ? 'audio/mpeg' : input.cardType === 'video' ? 'video/mp4' : 'image/jpeg');
  return saveMailboxMedia({
    ownerId: input.ownerId,
    childId: input.childId,
    cardType: input.cardType,
    mimeType,
    fileName: input.file.name,
    blob: new Blob([await input.file.arrayBuffer()], { type: mimeType })
  });
}

function saveMailboxRecording(input: { ownerId: string; childId?: string | null; recording: MailboxRecordingDraft }) {
  return saveMailboxMedia({
    ownerId: input.ownerId,
    childId: input.childId,
    cardType: 'audio',
    mimeType: input.recording.mime_type,
    fileName: input.recording.file_name,
    durationSeconds: input.recording.duration_seconds,
    blob: input.recording.blob
  });
}

function deleteMailboxMedia(mediaId: string) {
  return mediaRepository.deleteMedia(mediaId);
}

function getMailboxMediaUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseMailboxMediaUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}
