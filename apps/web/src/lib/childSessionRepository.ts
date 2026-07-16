import type { LocalChildIdentity, LocalDatabaseState, UUID } from './localTypes';
import { deleteCookieValue, getCookieValue, getLocalStorage, readJson, setCookieValue, writeJson } from './storage';

export const CHILD_SESSION_STORAGE_KEY = 'little-dreamers-family:child-session:v1';
export const CHILD_SESSION_COOKIE_KEY = 'little-dreamers-family:child-session:v1';
export const CHILD_SESSION_VERSION = 1;

const LEGACY_CURRENT_CHILD_IDENTITY_KEY = 'currentChildIdentity';
const LEGACY_DEVICE_BINDING_KEY = 'deviceBinding';

export interface ChildSession {
  childId: UUID;
  childName: string;
  familyId: UUID;
  deviceBindingId: string;
  deviceId: UUID;
  bindingConfirmed: true;
  bindingStatus: 'bound';
  tokenStatus: 'consumed';
  boundAt: string;
  sessionCreatedAt: string;
  sessionVersion: typeof CHILD_SESSION_VERSION;
  birthDate?: string | null;
  themeColor?: string | null;
  childToken?: string | null;
}

export type ChildSessionSource = 'storage' | 'cookie' | 'legacy' | 'binding';

export interface ChildSessionReadResult {
  session: ChildSession | null;
  source: ChildSessionSource | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeChildSession(value: unknown): ChildSession | null {
  if (!isRecord(value)) return null;
  if (value.sessionVersion !== CHILD_SESSION_VERSION) return null;
  const childId = normalizeString(value.childId);
  const childName = normalizeString(value.childName);
  const familyId = normalizeString(value.familyId);
  const deviceBindingId = normalizeString(value.deviceBindingId);
  const deviceId = normalizeString(value.deviceId);
  const bindingConfirmed = value.bindingConfirmed === true;
  const bindingStatus = value.bindingStatus === 'bound' ? 'bound' : null;
  const tokenStatus = value.tokenStatus === 'consumed' ? 'consumed' : null;
  const boundAt = normalizeString(value.boundAt);
  const sessionCreatedAt = normalizeString(value.sessionCreatedAt);
  if (
    !childId ||
    !childName ||
    !familyId ||
    !deviceBindingId ||
    !deviceId ||
    !bindingConfirmed ||
    !bindingStatus ||
    !tokenStatus ||
    !boundAt ||
    !sessionCreatedAt
  ) {
    return null;
  }
  return {
    childId,
    childName,
    familyId,
    deviceBindingId,
    deviceId,
    bindingConfirmed,
    bindingStatus,
    tokenStatus,
    boundAt,
    sessionCreatedAt,
    sessionVersion: CHILD_SESSION_VERSION,
    birthDate: normalizeString(value.birthDate),
    themeColor: normalizeString(value.themeColor),
    childToken: normalizeString(value.childToken)
  };
}

function readCookieSession(): ChildSession | null {
  const raw = getCookieValue(CHILD_SESSION_COOKIE_KEY);
  if (!raw) return null;
  try {
    return normalizeChildSession(JSON.parse(raw));
  } catch {
    deleteCookieValue(CHILD_SESSION_COOKIE_KEY);
    return null;
  }
}

export function getChildSession(): ChildSession | null {
  return readChildSessionWithSource().session;
}

export function readChildSessionWithSource(): ChildSessionReadResult {
  const storageSession = normalizeChildSession(readJson<unknown>(getLocalStorage(), CHILD_SESSION_STORAGE_KEY));
  if (storageSession) return { session: storageSession, source: 'storage' };
  const cookieSession = readCookieSession();
  if (cookieSession) {
    saveChildSession(cookieSession);
    return { session: cookieSession, source: 'cookie' };
  }
  const legacySession = migrateLegacyChildState();
  return { session: legacySession, source: legacySession ? 'legacy' : null };
}

export function saveChildSession(session: ChildSession): ChildSession {
  const normalized = normalizeChildSession(session);
  if (!normalized) throw new Error('Invalid child session');
  writeJson(getLocalStorage(), CHILD_SESSION_STORAGE_KEY, normalized);
  setCookieValue(CHILD_SESSION_COOKIE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearChildSession() {
  getLocalStorage().removeItem(CHILD_SESSION_STORAGE_KEY);
  deleteCookieValue(CHILD_SESSION_COOKIE_KEY);
}

export function isChildSessionValid(session: ChildSession | null | undefined, expectedChildId?: UUID | null): session is ChildSession {
  if (!session || session.sessionVersion !== CHILD_SESSION_VERSION) return false;
  if (!session.childId || !session.childName || !session.familyId || !session.deviceBindingId || !session.deviceId) return false;
  if (session.bindingConfirmed !== true || session.bindingStatus !== 'bound' || session.tokenStatus !== 'consumed') return false;
  if (expectedChildId && session.childId !== expectedChildId) return false;
  return true;
}

export function migrateLegacyChildState(state?: Pick<LocalDatabaseState, 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'device_id' | 'children' | 'device_bindings'>): ChildSession | null {
  const storage = getLocalStorage();
  const legacyIdentity = state?.currentChildIdentity ?? readJson<Partial<LocalChildIdentity>>(storage, LEGACY_CURRENT_CHILD_IDENTITY_KEY);
  const legacyDeviceBinding = state?.deviceBinding ?? storage.getItem(LEGACY_DEVICE_BINDING_KEY);
  const legacyChildId = legacyIdentity?.childId ?? legacyDeviceBinding ?? state?.device_child_id ?? null;
  if (!legacyChildId || !legacyIdentity?.displayName) return null;

  const child = state?.children?.find((item) => item.id === legacyChildId && item.status === 'active') ?? null;
  const binding = state?.device_bindings
    ?.filter((item) => item.child_id === legacyChildId && item.binding_status === 'bound')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const familyId = child?.family_id ?? binding?.family_id ?? null;
  const deviceId = binding?.device_id ?? state?.device_id ?? null;
  if (!familyId || !deviceId) return null;

  const timestamp = legacyIdentity.boundAt ?? binding?.used_at ?? new Date().toISOString();
  const session = normalizeChildSession({
    childId: legacyChildId,
    childName: legacyIdentity.displayName,
    familyId,
    deviceBindingId: binding?.id ?? `${legacyChildId}:${deviceId}`,
    deviceId,
    bindingConfirmed: true,
    bindingStatus: 'bound',
    tokenStatus: 'consumed',
    boundAt: timestamp,
    sessionCreatedAt: timestamp,
    sessionVersion: CHILD_SESSION_VERSION,
    birthDate: legacyIdentity.birthDate ?? child?.birth_date ?? null,
    themeColor: legacyIdentity.themeColor ?? child?.theme_color ?? null,
    childToken: legacyIdentity.childToken ?? child?.child_token ?? null
  });
  return session ? saveChildSession(session) : null;
}
