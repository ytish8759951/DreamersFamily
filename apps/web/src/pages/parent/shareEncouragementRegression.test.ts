// @ts-nocheck
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'ParentFeaturePages.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('parent share encouragement regression guards', () => {
  it('opens a 1 to 5 star selector before saving encouragement', () => {
    expect(source).toContain('function ShareEncouragementDialog');
    expect(source).toContain('這次想給孩子幾顆星星？');
    expect(source).toContain('[1, 2, 3, 4, 5].map');
    expect(source).toContain('送出鼓勵');
    expect(source).toContain('取消');
  });

  it('writes encouragement through the star repository and prevents duplicates in the row UI', () => {
    expect(source).toContain('starRepository.encourageShareWithStars');
    expect(source).toContain("star.transaction_type === 'share_reward'");
    expect(source).toContain('shareRewards.get(share.id) ?? null');
    expect(source).toContain('已鼓勵${encouragement.amount}顆星');
    expect(source).toContain('disabled={Boolean(encouragement)}');
  });

  it('shows submitting, success, and retryable Chinese failure states', () => {
    expect(source).toContain('送出中');
    expect(source).toContain('已送出 ${awardedStars} 顆星星給孩子！');
    expect(source).toContain('送出失敗：');
    expect(source).toContain('重新送出');
  });
});
