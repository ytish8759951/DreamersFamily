import type { CSSProperties } from 'react';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  anchor: string;
};

export const PIGGY_SCENE_V2 = {
  width: 1440,
  height: 1024
} as const;

export const PIGGY_V2_TOKENS = {
  safeArea: { left: 80, right: 80, top: 60, bottom: 60 },
  colors: {
    cream: '#fff7ed',
    white: '#ffffff',
    primary: '#7a8f6e',
    sage: '#8ca77d',
    line: '#eee3d4',
    text: '#2e2e2e',
    muted: '#7d7d7d',
    yellow: '#fff5d6'
  },
  radius: {
    card: 24,
    item: 16,
    pill: 999
  },
  shadow: {
    home: '0 8px 24px rgba(0, 0, 0, 0.06)',
    cardHover: '0 14px 30px rgba(77, 59, 35, 0.1)',
    soft: '0 6px 18px rgba(87, 64, 33, 0.05)'
  }
} as const;

export const PIGGY_V2_LAYOUT = {
  background: { x: 0, y: 0, width: 1440, height: 1024, z: 0, anchor: 'scene' },
  desk: { x: 0, y: 738, width: 1440, height: 212, z: 1, anchor: 'bottom-stage' },
  notebook: { x: 26, y: 216, width: 392, height: 536, z: 7, anchor: 'left-group' },
  piggyBank: { x: 470, y: 168, width: 548, height: 632, z: 14, anchor: 'hero-center' },
  stickyNote: { x: 836, y: 294, width: 260, height: 350, z: 16, anchor: 'hero-right-attached' },
  shelf: { x: 1110, y: 218, width: 286, height: 588, z: 8, anchor: 'right-weight' },
  coinDock: { x: 282, y: 798, width: 875, height: 118, z: 12, anchor: 'desk-center' },
  notebookContent: { x: 92, y: 82, width: 366, height: 400, z: 8, anchor: 'inside-notebook' },
  stickyContent: { x: 36, y: 64, width: 188, height: 260, z: 17, anchor: 'inside-sticky' },
  coinCanvas: { x: 78, y: 346, width: 412, height: 218, z: 15, anchor: 'inside-glass' },
  shelfGrid: {
    x: 0,
    y: 0,
    width: 286,
    height: 528,
    columns: 2,
    rows: 3,
    columnGap: 28,
    rowGap: 30,
    z: 9,
    anchor: 'inside-shelf'
  },
  decorations: {
    teddy: { x: 64, y: 766, width: 104, height: 104, z: 4, anchor: 'desk-left' },
    plant: { x: 210, y: 744, width: 78, height: 104, z: 4, anchor: 'desk-left' },
    paper: { x: 42, y: 846, width: 120, height: 82, z: 4, anchor: 'desk-left' },
    crayons: { x: 180, y: 852, width: 100, height: 68, z: 4, anchor: 'desk-left' },
    dinosaur: { x: 1036, y: 744, width: 88, height: 92, z: 5, anchor: 'desk-center-right' },
    stars: { x: 920, y: 822, width: 76, height: 76, z: 4, anchor: 'desk-right' }
  }
} as const satisfies Record<string, unknown>;

function rectVars(prefix: string, rect: Rect): CSSProperties {
  return {
    [`--${prefix}-x`]: `${rect.x}px`,
    [`--${prefix}-y`]: `${rect.y}px`,
    [`--${prefix}-w`]: `${rect.width}px`,
    [`--${prefix}-h`]: `${rect.height}px`,
    [`--${prefix}-z`]: rect.z
  } as CSSProperties;
}

export function piggySceneV2Vars(): CSSProperties {
  const decorations = PIGGY_V2_LAYOUT.decorations;
  return {
    '--piggy-v2-scene-w': `${PIGGY_SCENE_V2.width}px`,
    '--piggy-v2-scene-h': `${PIGGY_SCENE_V2.height}px`,
    '--piggy-v2-cream': PIGGY_V2_TOKENS.colors.cream,
    '--piggy-v2-white': PIGGY_V2_TOKENS.colors.white,
    '--piggy-v2-primary': PIGGY_V2_TOKENS.colors.primary,
    '--piggy-v2-sage': PIGGY_V2_TOKENS.colors.sage,
    '--piggy-v2-line': PIGGY_V2_TOKENS.colors.line,
    '--piggy-v2-text': PIGGY_V2_TOKENS.colors.text,
    '--piggy-v2-muted': PIGGY_V2_TOKENS.colors.muted,
    '--piggy-v2-yellow': PIGGY_V2_TOKENS.colors.yellow,
    '--piggy-v2-radius-card': `${PIGGY_V2_TOKENS.radius.card}px`,
    '--piggy-v2-radius-item': `${PIGGY_V2_TOKENS.radius.item}px`,
    '--piggy-v2-radius-pill': `${PIGGY_V2_TOKENS.radius.pill}px`,
    '--piggy-v2-shadow-home': PIGGY_V2_TOKENS.shadow.home,
    '--piggy-v2-shadow-hover': PIGGY_V2_TOKENS.shadow.cardHover,
    '--piggy-v2-shadow-soft': PIGGY_V2_TOKENS.shadow.soft,
    ...rectVars('v2-bg', PIGGY_V2_LAYOUT.background),
    ...rectVars('v2-desk', PIGGY_V2_LAYOUT.desk),
    ...rectVars('v2-notebook', PIGGY_V2_LAYOUT.notebook),
    ...rectVars('v2-piggy', PIGGY_V2_LAYOUT.piggyBank),
    ...rectVars('v2-sticky', PIGGY_V2_LAYOUT.stickyNote),
    ...rectVars('v2-shelf', PIGGY_V2_LAYOUT.shelf),
    ...rectVars('v2-coin-dock', PIGGY_V2_LAYOUT.coinDock),
    ...rectVars('v2-notebook-content', PIGGY_V2_LAYOUT.notebookContent),
    ...rectVars('v2-sticky-content', PIGGY_V2_LAYOUT.stickyContent),
    ...rectVars('v2-coin-canvas', PIGGY_V2_LAYOUT.coinCanvas),
    '--v2-shelf-grid-x': `${PIGGY_V2_LAYOUT.shelfGrid.x}px`,
    '--v2-shelf-grid-y': `${PIGGY_V2_LAYOUT.shelfGrid.y}px`,
    '--v2-shelf-grid-w': `${PIGGY_V2_LAYOUT.shelfGrid.width}px`,
    '--v2-shelf-grid-h': `${PIGGY_V2_LAYOUT.shelfGrid.height}px`,
    '--v2-shelf-grid-column-gap': `${PIGGY_V2_LAYOUT.shelfGrid.columnGap}px`,
    '--v2-shelf-grid-row-gap': `${PIGGY_V2_LAYOUT.shelfGrid.rowGap}px`,
    '--v2-shelf-grid-z': PIGGY_V2_LAYOUT.shelfGrid.z,
    '--v2-deco-teddy-x': `${decorations.teddy.x}px`,
    '--v2-deco-teddy-y': `${decorations.teddy.y}px`,
    '--v2-deco-teddy-w': `${decorations.teddy.width}px`,
    '--v2-deco-plant-x': `${decorations.plant.x}px`,
    '--v2-deco-plant-y': `${decorations.plant.y}px`,
    '--v2-deco-plant-w': `${decorations.plant.width}px`,
    '--v2-deco-paper-x': `${decorations.paper.x}px`,
    '--v2-deco-paper-y': `${decorations.paper.y}px`,
    '--v2-deco-paper-w': `${decorations.paper.width}px`,
    '--v2-deco-crayons-x': `${decorations.crayons.x}px`,
    '--v2-deco-crayons-y': `${decorations.crayons.y}px`,
    '--v2-deco-crayons-w': `${decorations.crayons.width}px`,
    '--v2-deco-dinosaur-x': `${decorations.dinosaur.x}px`,
    '--v2-deco-dinosaur-y': `${decorations.dinosaur.y}px`,
    '--v2-deco-dinosaur-w': `${decorations.dinosaur.width}px`,
    '--v2-deco-stars-x': `${decorations.stars.x}px`,
    '--v2-deco-stars-y': `${decorations.stars.y}px`,
    '--v2-deco-stars-w': `${decorations.stars.width}px`
  } as CSSProperties;
}
