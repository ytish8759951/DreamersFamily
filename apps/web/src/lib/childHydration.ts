import { childBindingTrace, hashForTrace } from './childBindingTrace';
import { CHILD_SESSION_VERSION, saveChildSession, type ChildSession } from './childSessionRepository';
import type { UUID } from './localTypes';

export interface ChildBindingBootstrapResult {
  token: string;
  childId: UUID;
  childName: string;
  familyId: UUID;
  deviceBindingId: string;
  deviceId: UUID;
  boundAt: string;
  birthDate?: string | null;
  themeColor?: string | null;
}

export interface ChildBootstrapPayload {
  session: ChildSession;
  repositoryReady: true;
}

export function createChildSessionFromBindingResult(binding: ChildBindingBootstrapResult): ChildSession {
  const sessionCreatedAt = new Date().toISOString();
  return {
    childId: binding.childId,
    childName: binding.childName,
    familyId: binding.familyId,
    deviceBindingId: binding.deviceBindingId,
    deviceId: binding.deviceId,
    boundAt: binding.boundAt,
    sessionCreatedAt,
    sessionVersion: CHILD_SESSION_VERSION,
    birthDate: binding.birthDate ?? null,
    themeColor: binding.themeColor ?? null,
    childToken: binding.token
  };
}

export function bootstrapChildDeviceSession(binding: ChildBindingBootstrapResult): ChildBootstrapPayload {
  const tokenHash = hashForTrace(binding.token);
  childBindingTrace('Child bootstrap start', {
    tokenHash,
    childId: binding.childId,
    familyId: binding.familyId,
    bindingId: binding.deviceBindingId
  });
  const session = saveChildSession(createChildSessionFromBindingResult(binding));
  childBindingTrace('ChildSession saved', {
    tokenHash,
    childId: session.childId,
    familyId: session.familyId,
    deviceBindingId: session.deviceBindingId,
    sessionVersion: session.sessionVersion
  });
  childBindingTrace('repository ready', {
    tokenHash,
    childId: session.childId,
    ready: true
  });
  return { session, repositoryReady: true };
}

