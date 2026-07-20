import { describe, expect, it } from 'vitest';
import { isPointInsideRect, PIGGY_DRAG_SCROLL_LOCK_CLASS } from './PiggySceneV2';

describe('PiggySceneV2 pointer drag helpers', () => {
  it('uses an inclusive bounding rect hit test for the piggy deposit slot', () => {
    const rect = { left: 100, right: 180, top: 40, bottom: 92 };

    expect(isPointInsideRect(rect, 100, 40)).toBe(true);
    expect(isPointInsideRect(rect, 140, 70)).toBe(true);
    expect(isPointInsideRect(rect, 180, 92)).toBe(true);
    expect(isPointInsideRect(rect, 99, 70)).toBe(false);
    expect(isPointInsideRect(rect, 140, 93)).toBe(false);
  });

  it('keeps the scroll-lock class scoped to piggy coin dragging', () => {
    expect(PIGGY_DRAG_SCROLL_LOCK_CLASS).toBe('piggy-v2-scroll-locked');
  });
});
