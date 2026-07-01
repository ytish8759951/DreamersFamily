export const DEFAULT_BADGE_ICON = '🏅';

export function normalizeBadgeIcon(value?: string | null) {
  const normalized = value?.trim() ?? '';
  const compact = normalized.replace(/\uFE0F/g, '');
  if (!compact || normalized.length > 8 || Array.from(compact).length !== 1) return DEFAULT_BADGE_ICON;
  return /\p{Extended_Pictographic}/u.test(compact) ? normalized : DEFAULT_BADGE_ICON;
}
