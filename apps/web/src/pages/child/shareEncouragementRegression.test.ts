// @ts-nocheck
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'ChildPage.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('child share encouragement regression guards', () => {
  it('renders share encouragement stars from the existing star ledger', () => {
    expect(source).toContain("star.transaction_type === 'share_reward'");
    expect(source).toContain('shareRewards.get(share.id) ?? 0');
    expect(source).toContain('function ChildShareStarBadge');
    expect(source).toContain('家長鼓勵 {stars}顆星');
  });

  it('keeps media share cards on the existing photo, audio, and video paths', () => {
    expect(source).toContain('<LocalShareAlbum media={photoMedia} title={share.title ?? share.caption} />');
    expect(source).toContain('<LocalShareMediaView mediaId={media.id} mediaType="video" controls />');
    expect(source).toContain('void new Audio(audioUrl).play();');
  });
});
