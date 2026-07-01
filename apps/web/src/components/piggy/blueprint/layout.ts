import type { CSSProperties } from 'react';
import { COLORS, RADII, SAFE_AREA, SCENE_SIZE, SHADOWS, SPACING, Z_INDEX } from './scene';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

type DecorationRect = Rect & {
  anchor: 'desk-left' | 'desk-center' | 'desk-right';
};

const HERO = {
  width: 430,
  height: 570
} as const;

const TOP_ALIGNMENT = 250;
const BOTTOM_BASELINE = 820;

export const BACKGROUND: Rect = {
  x: 0,
  y: 0,
  width: SCENE_SIZE.width,
  height: SCENE_SIZE.height,
  z: Z_INDEX.background
} as const;

export const DESK: Rect = {
  x: 0,
  y: 650,
  width: SCENE_SIZE.width,
  height: 340,
  z: Z_INDEX.desk
} as const;

export const PIGGYBANK: Rect = {
  x: 500,
  y: TOP_ALIGNMENT,
  width: HERO.width,
  height: HERO.height,
  z: Z_INDEX.piggyBank
} as const;

export const NOTEBOOK: Rect = {
  x: 120,
  y: TOP_ALIGNMENT,
  width: 300,
  height: BOTTOM_BASELINE - TOP_ALIGNMENT,
  z: Z_INDEX.level2
} as const;

export const STICKY_NOTE: Rect = {
  x: 850,
  y: TOP_ALIGNMENT + SPACING.section,
  width: 210,
  height: 310,
  z: Z_INDEX.stickyNote
} as const;

export const SHELF: Rect = {
  x: 1030,
  y: TOP_ALIGNMENT,
  width: 330,
  height: BOTTOM_BASELINE - TOP_ALIGNMENT,
  z: Z_INDEX.level2
} as const;

export const COIN_DOCK: Rect = {
  x: 455,
  y: 800,
  width: 620,
  height: 110,
  z: Z_INDEX.coinDock
} as const;

export const BOTTOM_NAV: Rect = {
  x: SAFE_AREA.left + SPACING.large,
  y: 930,
  width: SCENE_SIZE.width - (SAFE_AREA.left + SAFE_AREA.right + SPACING.large * 2),
  height: 70,
  z: Z_INDEX.bottomNavigation
} as const;

export const NOTEBOOK_CONTENT: Rect = {
  x: 54,
  y: 58,
  width: 218,
  height: 476,
  z: Z_INDEX.level2
} as const;

export const STICKY_CONTENT: Rect = {
  x: 25,
  y: 52,
  width: 160,
  height: 232,
  z: Z_INDEX.stickyNote
} as const;

export const COIN_CANVAS: Rect = {
  x: 45,
  y: 298,
  width: 340,
  height: 214,
  z: Z_INDEX.coinCanvas
} as const;

export const SHELF_GRID = {
  x: 34,
  y: 82,
  width: 262,
  height: 455,
  columns: 2,
  rows: 3,
  columnGap: SPACING.medium,
  rowGap: SPACING.medium
} as const;

export const COIN_DOCK_ITEMS = {
  values: [100, 50, 10, 5, 1],
  coinSize: 88,
  gap: SPACING.medium + SPACING.small - 3,
  startX: 28,
  y: 11
} as const;

export const BOTTOM_NAV_ITEMS = {
  width: 116,
  height: 52,
  y: 9,
  x: [70, 305, 540, 775, 1010]
} as const;

export const DECORATIONS = {
  teddy: { x: 48, y: 690, width: 110, height: 110, z: Z_INDEX.decorations, anchor: 'desk-left' },
  plant: { x: 198, y: 728, width: 70, height: 94, z: Z_INDEX.decorations, anchor: 'desk-left' },
  paper: { x: 98, y: 830, width: 110, height: 76, z: Z_INDEX.decorations, anchor: 'desk-left' },
  crayons: { x: 242, y: 820, width: 80, height: 58, z: Z_INDEX.decorations, anchor: 'desk-left' },
  dinosaur: { x: 900, y: 702, width: 90, height: 93, z: Z_INDEX.decorations, anchor: 'desk-center' },
  stars: { x: 1018, y: 820, width: 70, height: 70, z: Z_INDEX.decorations, anchor: 'desk-right' }
} as const satisfies Record<string, DecorationRect>;

export const LAYOUT = {
  scene: SCENE_SIZE,
  safeArea: SAFE_AREA,
  background: BACKGROUND,
  desk: DESK,
  notebook: NOTEBOOK,
  piggyBank: PIGGYBANK,
  stickyNote: STICKY_NOTE,
  shelf: SHELF,
  coinDock: COIN_DOCK,
  bottomNavigation: BOTTOM_NAV,
  notebookContent: NOTEBOOK_CONTENT,
  stickyContent: STICKY_CONTENT,
  coinCanvas: COIN_CANVAS,
  shelfGrid: SHELF_GRID,
  coinDockItems: COIN_DOCK_ITEMS,
  bottomNavItems: BOTTOM_NAV_ITEMS,
  decorations: DECORATIONS,
  topAlignment: TOP_ALIGNMENT,
  bottomBaseline: BOTTOM_BASELINE
} as const;

export function sceneBlueprintVars(): CSSProperties {
  return {
    '--scene-width': `${SCENE_SIZE.width}px`,
    '--scene-height': `${SCENE_SIZE.height}px`,
    '--scene-bg': COLORS.wall,
    '--scene-ink': COLORS.ink,
    '--scene-muted-ink': COLORS.mutedInk,
    '--scene-accent': COLORS.accent,
    '--scene-accent-dark': COLORS.accentDark,
    '--scene-paper': COLORS.paper,
    '--scene-disabled': COLORS.disabled,
    '--scene-shadow-soft': SHADOWS.soft,
    '--scene-shadow-coin': SHADOWS.coin,
    '--scene-shadow-glow': SHADOWS.glow,
    '--scene-radius-md': `${RADII.md}px`,
    '--scene-radius-lg': `${RADII.lg}px`,
    '--scene-radius-pill': `${RADII.pill}px`,

    '--background-x': `${BACKGROUND.x}px`,
    '--background-y': `${BACKGROUND.y}px`,
    '--background-w': `${BACKGROUND.width}px`,
    '--background-h': `${BACKGROUND.height}px`,
    '--background-z': BACKGROUND.z,

    '--desk-x': `${DESK.x}px`,
    '--desk-y': `${DESK.y}px`,
    '--desk-w': `${DESK.width}px`,
    '--desk-h': `${DESK.height}px`,
    '--desk-z': DESK.z,

    '--notebook-x': `${NOTEBOOK.x}px`,
    '--notebook-y': `${NOTEBOOK.y}px`,
    '--notebook-w': `${NOTEBOOK.width}px`,
    '--notebook-h': `${NOTEBOOK.height}px`,
    '--notebook-z': NOTEBOOK.z,

    '--piggy-x': `${PIGGYBANK.x}px`,
    '--piggy-y': `${PIGGYBANK.y}px`,
    '--piggy-w': `${PIGGYBANK.width}px`,
    '--piggy-h': `${PIGGYBANK.height}px`,
    '--piggy-z': PIGGYBANK.z,

    '--sticky-x': `${STICKY_NOTE.x}px`,
    '--sticky-y': `${STICKY_NOTE.y}px`,
    '--sticky-w': `${STICKY_NOTE.width}px`,
    '--sticky-h': `${STICKY_NOTE.height}px`,
    '--sticky-z': STICKY_NOTE.z,

    '--shelf-x': `${SHELF.x}px`,
    '--shelf-y': `${SHELF.y}px`,
    '--shelf-w': `${SHELF.width}px`,
    '--shelf-h': `${SHELF.height}px`,
    '--shelf-z': SHELF.z,

    '--coin-dock-x': `${COIN_DOCK.x}px`,
    '--coin-dock-y': `${COIN_DOCK.y}px`,
    '--coin-dock-w': `${COIN_DOCK.width}px`,
    '--coin-dock-h': `${COIN_DOCK.height}px`,
    '--coin-dock-z': COIN_DOCK.z,

    '--bottom-nav-x': `${BOTTOM_NAV.x}px`,
    '--bottom-nav-y': `${BOTTOM_NAV.y}px`,
    '--bottom-nav-w': `${BOTTOM_NAV.width}px`,
    '--bottom-nav-h': `${BOTTOM_NAV.height}px`,
    '--bottom-nav-z': BOTTOM_NAV.z,

    '--notebook-content-x': `${NOTEBOOK_CONTENT.x}px`,
    '--notebook-content-y': `${NOTEBOOK_CONTENT.y}px`,
    '--notebook-content-w': `${NOTEBOOK_CONTENT.width}px`,
    '--notebook-content-h': `${NOTEBOOK_CONTENT.height}px`,

    '--sticky-content-x': `${STICKY_CONTENT.x}px`,
    '--sticky-content-y': `${STICKY_CONTENT.y}px`,
    '--sticky-content-w': `${STICKY_CONTENT.width}px`,
    '--sticky-content-h': `${STICKY_CONTENT.height}px`,

    '--coin-canvas-x': `${COIN_CANVAS.x}px`,
    '--coin-canvas-y': `${COIN_CANVAS.y}px`,
    '--coin-canvas-w': `${COIN_CANVAS.width}px`,
    '--coin-canvas-h': `${COIN_CANVAS.height}px`,

    '--shelf-grid-x': `${SHELF_GRID.x}px`,
    '--shelf-grid-y': `${SHELF_GRID.y}px`,
    '--shelf-grid-w': `${SHELF_GRID.width}px`,
    '--shelf-grid-h': `${SHELF_GRID.height}px`,
    '--shelf-grid-column-gap': `${SHELF_GRID.columnGap}px`,
    '--shelf-grid-row-gap': `${SHELF_GRID.rowGap}px`,

    '--coin-size': `${COIN_DOCK_ITEMS.coinSize}px`,
    '--coin-gap': `${COIN_DOCK_ITEMS.gap}px`,
    '--coin-start-x': `${COIN_DOCK_ITEMS.startX}px`,
    '--coin-y': `${COIN_DOCK_ITEMS.y}px`,

    '--nav-item-w': `${BOTTOM_NAV_ITEMS.width}px`,
    '--nav-item-h': `${BOTTOM_NAV_ITEMS.height}px`,
    '--nav-item-y': `${BOTTOM_NAV_ITEMS.y}px`,
    '--nav-item-1-x': `${BOTTOM_NAV_ITEMS.x[0]}px`,
    '--nav-item-2-x': `${BOTTOM_NAV_ITEMS.x[1]}px`,
    '--nav-item-3-x': `${BOTTOM_NAV_ITEMS.x[2]}px`,
    '--nav-item-4-x': `${BOTTOM_NAV_ITEMS.x[3]}px`,
    '--nav-item-5-x': `${BOTTOM_NAV_ITEMS.x[4]}px`,

    '--deco-teddy-x': `${DECORATIONS.teddy.x}px`,
    '--deco-teddy-y': `${DECORATIONS.teddy.y}px`,
    '--deco-teddy-w': `${DECORATIONS.teddy.width}px`,
    '--deco-plant-x': `${DECORATIONS.plant.x}px`,
    '--deco-plant-y': `${DECORATIONS.plant.y}px`,
    '--deco-plant-w': `${DECORATIONS.plant.width}px`,
    '--deco-paper-x': `${DECORATIONS.paper.x}px`,
    '--deco-paper-y': `${DECORATIONS.paper.y}px`,
    '--deco-paper-w': `${DECORATIONS.paper.width}px`,
    '--deco-crayons-x': `${DECORATIONS.crayons.x}px`,
    '--deco-crayons-y': `${DECORATIONS.crayons.y}px`,
    '--deco-crayons-w': `${DECORATIONS.crayons.width}px`,
    '--deco-dinosaur-x': `${DECORATIONS.dinosaur.x}px`,
    '--deco-dinosaur-y': `${DECORATIONS.dinosaur.y}px`,
    '--deco-dinosaur-w': `${DECORATIONS.dinosaur.width}px`,
    '--deco-stars-x': `${DECORATIONS.stars.x}px`,
    '--deco-stars-y': `${DECORATIONS.stars.y}px`,
    '--deco-stars-w': `${DECORATIONS.stars.width}px`
  } as CSSProperties;
}
