import type { LocalChild, UUID } from './localTypes';

export type ChildDeviceTokenPayload = {
  childId: UUID;
  displayName: string;
  birthDate: string | null;
  themeColor: string | null;
  createdAt: string;
};

const tokenPrefix = 'df1';

export function createRandomChildToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint8Array(16);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 32);
}

export function createChildDeviceToken(payload: ChildDeviceTokenPayload) {
  return `${tokenPrefix}_${createRandomChildToken()}_${encodeBase64Url(JSON.stringify(payload))}`;
}

export function createChildDeviceTokenForChild(child: Pick<LocalChild, 'id' | 'display_name' | 'birth_date' | 'theme_color' | 'created_at'>) {
  return createChildDeviceToken({
    childId: child.id,
    displayName: child.display_name,
    birthDate: child.birth_date,
    themeColor: child.theme_color,
    createdAt: child.created_at
  });
}

export function parseChildDeviceToken(token: string): ChildDeviceTokenPayload | null {
  const normalized = token.trim();
  const firstSeparator = normalized.indexOf('_');
  const secondSeparator = normalized.indexOf('_', firstSeparator + 1);
  if (firstSeparator < 0 || secondSeparator < 0) return null;

  const prefix = normalized.slice(0, firstSeparator);
  const random = normalized.slice(firstSeparator + 1, secondSeparator);
  const payload = normalized.slice(secondSeparator + 1);
  if (prefix !== tokenPrefix || !/^[a-f0-9]{32}$/i.test(random) || !payload) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<ChildDeviceTokenPayload>;
    if (!parsed.childId || !parsed.displayName || !parsed.createdAt) return null;
    return {
      childId: String(parsed.childId),
      displayName: String(parsed.displayName),
      birthDate: parsed.birthDate ? String(parsed.birthDate) : null,
      themeColor: parsed.themeColor ? String(parsed.themeColor) : null,
      createdAt: String(parsed.createdAt)
    };
  } catch {
    return null;
  }
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
