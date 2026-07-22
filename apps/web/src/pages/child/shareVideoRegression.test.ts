// @ts-nocheck
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'ChildPage.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('child share video regression guards', () => {
  it('captures the selected video file before resetting recorder state', () => {
    expect(source).toContain('const input = event.currentTarget;');
    expect(source).toContain('const file = captureFirstSelectedFile(input);');
    expect(source).toContain('void processSelectedVideo(file);');
    expect(source).not.toMatch(/setShareForm\(\([^)]*\)\s*=>[\s\S]*event\.(currentTarget|target)\.files/);
  });

  it('keeps child submitted videos playable with native controls', () => {
    expect(source).toContain('<LocalShareMediaView mediaId={media.id} mediaType="video" controls />');
  });

  it('keeps the existing child audio click-to-play behavior', () => {
    expect(source).toContain("if (media?.media_type === 'audio') {");
    expect(source).toContain('void new Audio(audioUrl).play();');
    expect(source).toContain("role={media?.media_type === 'audio' ? 'button' : undefined}");
  });
});
