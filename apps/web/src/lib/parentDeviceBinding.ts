import { deleteCookieValue, getCookieValue, getLocalStorage, setCookieValue } from './storage';

const PARENT_DEVICE_BINDING_KEY = 'little-dreamers-family:parent-device-binding:v1';
const tokenPrefix = 'pf1';

export type ParentDeviceBinding = {
  familyId: string;
  parentId: string;
  parentName: string;
  parentRole: 'owner' | 'parent';
  relation: string;
  deviceLabel: string;
  boundAt: string;
};

export type ParentInvitePayload = {
  familyId: string;
  familyName: string;
  ownerName: string;
  inviteCode: string;
  expiresAt: string;
  createdAt: string;
};

export function createParentInviteToken(payload: ParentInvitePayload) {
  return `${tokenPrefix}_${randomToken()}_${encodeBase64Url(JSON.stringify(payload))}`;
}

export function parseParentInviteToken(token: string): ParentInvitePayload | null {
  const normalized = token.trim();
  const firstSeparator = normalized.indexOf('_');
  const secondSeparator = normalized.indexOf('_', firstSeparator + 1);
  if (firstSeparator < 0 || secondSeparator < 0) return null;
  if (normalized.slice(0, firstSeparator) !== tokenPrefix) return null;
  const random = normalized.slice(firstSeparator + 1, secondSeparator);
  const payload = normalized.slice(secondSeparator + 1);
  if (!/^[a-f0-9]{32}$/i.test(random) || !payload) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<ParentInvitePayload>;
    if (!parsed.familyId || !parsed.familyName || !parsed.inviteCode || !parsed.expiresAt) return null;
    return {
      familyId: String(parsed.familyId),
      familyName: String(parsed.familyName),
      ownerName: String(parsed.ownerName || 'Owner'),
      inviteCode: String(parsed.inviteCode),
      expiresAt: String(parsed.expiresAt),
      createdAt: String(parsed.createdAt || new Date().toISOString())
    };
  } catch {
    return null;
  }
}

export function getParentInviteUrl(token: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/join-parent/${encodeURIComponent(token)}`;
}

export function readParentDeviceBinding(): ParentDeviceBinding | null {
  const raw = getLocalStorage().getItem(PARENT_DEVICE_BINDING_KEY) ?? getCookieValue(PARENT_DEVICE_BINDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParentDeviceBinding;
    if (!parsed.familyId || !parsed.parentId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveParentDeviceBinding(binding: ParentDeviceBinding) {
  const serialized = JSON.stringify(binding);
  try {
    getLocalStorage().setItem(PARENT_DEVICE_BINDING_KEY, serialized);
  } catch {
    // Cookie fallback keeps PWA/WebView launches attached to the same family.
  }
  setCookieValue(PARENT_DEVICE_BINDING_KEY, serialized, 60 * 60 * 24 * 365 * 2);
}

export function clearParentDeviceBinding() {
  try {
    getLocalStorage().removeItem(PARENT_DEVICE_BINDING_KEY);
  } catch {
    // Nothing to clear.
  }
  deleteCookieValue(PARENT_DEVICE_BINDING_KEY);
}

export function currentDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const platform = navigator.platform || 'Device';
  if (/iPad/i.test(platform)) return 'iPad';
  if (/iPhone/i.test(platform)) return 'iPhone';
  if (/Android/i.test(navigator.userAgent)) return 'Android';
  return platform || 'Web';
}

function randomToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint8Array(16);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 32);
}

function encodeBase64Url(value: string) {
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return decodeURIComponent(escape(decoded));
}
