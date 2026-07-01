export const SCENE_SIZE = {
  width: 1440,
  height: 1024
} as const;

export const SAFE_AREA = {
  left: 80,
  right: 80,
  top: 60,
  bottom: 60
} as const;

export const SPACING = {
  small: 16,
  medium: 24,
  large: 40,
  section: 72
} as const;

export const HERO_RATIO = {
  piggyBank: 1,
  notebook: 0.68,
  shelf: 0.72,
  stickyNote: 0.42,
  coinDock: 0.95,
  bottomNavigation: 1,
  decorations: {
    min: 0.2,
    max: 0.35
  }
} as const;

export const COLORS = {
  wall: '#f5ead4',
  ink: '#634326',
  mutedInk: '#8a6a44',
  accent: '#f0a93b',
  accentDark: '#b96f19',
  paper: 'rgba(255, 248, 229, 0.72)',
  disabled: '#b7b2a8'
} as const;

export const SHADOWS = {
  soft: '0 18px 34px rgba(111, 72, 32, 0.16)',
  coin: 'drop-shadow(0 10px 6px rgba(89, 56, 20, 0.25))',
  glow: 'drop-shadow(0 0 13px rgba(248, 198, 78, 0.62))'
} as const;

export const RADII = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999
} as const;

export const Z_INDEX = {
  background: 0,
  desk: 1,
  decorations: 6,
  level2: 7,
  piggyBank: 8,
  stickyNote: 9,
  coinDock: 10,
  bottomNavigation: 20,
  coinCanvas: 2,
  glass: 3,
  glassHighlight: 4,
  animation: 7
} as const;
