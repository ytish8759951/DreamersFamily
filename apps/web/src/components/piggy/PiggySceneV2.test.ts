import { describe, expect, it } from 'vitest';
import { getPiggyProductActionStatus, getPiggyProductStatusLabel, isPointInsideRect, PIGGY_DRAG_SCROLL_LOCK_CLASS } from './PiggySceneV2';

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

describe('PiggySceneV2 product status labels', () => {
  it('maps every shelf status to a stable DOM status and visible label', () => {
    expect(getPiggyProductActionStatus({ status: 'available', affordable: true })).toBe('available');
    expect(getPiggyProductStatusLabel({ status: 'available', affordable: true })).toBe('購買');

    expect(getPiggyProductActionStatus({ status: 'available', affordable: false })).toBe('insufficient');
    expect(getPiggyProductStatusLabel({ status: 'available', affordable: false })).toBe('存款不足');

    expect(getPiggyProductActionStatus({ status: 'pendingPurchase', affordable: true })).toBe('pending');
    expect(getPiggyProductStatusLabel({ status: 'pendingPurchase', affordable: true })).toBe('等待到貨');

    expect(getPiggyProductActionStatus({ status: 'arrived', affordable: true })).toBe('arrived');
    expect(getPiggyProductStatusLabel({ status: 'arrived', affordable: true })).toBe('已到貨');
  });
});
