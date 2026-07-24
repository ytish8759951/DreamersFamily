import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const childPagePath = resolve(dirname(fileURLToPath(import.meta.url)), 'ChildPage.tsx');
const boardPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../components/ChildDrawingBoard.tsx');
const localTypesPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/localTypes.ts');
const localDataPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/localData.ts');
const shareRepositoryPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/shareRepository.ts');

const childPage = readFileSync(childPagePath, 'utf8');
const board = readFileSync(boardPath, 'utf8');
const localTypes = readFileSync(localTypesPath, 'utf8');
const localData = readFileSync(localDataPath, 'utf8');
const shareRepository = readFileSync(shareRepositoryPath, 'utf8');

describe('drawing share regression guards', () => {
  it('adds drawing as the fourth formal child share topic and category', () => {
    expect(childPage).toContain('畫板分享');
    expect(childPage).toContain('自由畫畫、蓋印章並分享作品');
    expect(childPage).toContain("openShareForm('drawing')");
    expect(childPage).toContain("{ value: 'drawing' as const, label: '畫作'");
    expect(localTypes).toContain("'drawing'");
  });

  it('keeps drawing shares on the existing formal share/media repository path', () => {
    expect(childPage).toContain("share_type: 'drawing'");
    expect(childPage).toContain("media_type: 'photo'");
    expect(childPage).toContain('skipImageCompression: true');
    expect(localData).toContain('share_type?: LocalShare');
    expect(shareRepository).toContain('skipImageCompression?: boolean');
  });

  it('implements the canvas tools with pointer events, real erasing, draft retention and PNG export', () => {
    expect(board).toContain('onPointerDown');
    expect(board).toContain('onPointerMove');
    expect(board).toContain('onPointerUp');
    expect(board).toContain('onPointerCancel');
    expect(board).toContain('setPointerCapture');
    expect(board).toContain("globalCompositeOperation = 'destination-out'");
    expect(board).toContain('Math.random() * Math.PI * 2');
    expect(board).toContain('localStorage.setItem(draftKey');
    expect(board).toContain("toBlob(resolve, 'image/png')");
    expect(board).toContain('EXPORT_WIDTH = 2048');
    expect(board).toContain('EXPORT_HEIGHT = 1536');
  });

  it('prevents duplicate drawing submits with a stable client request id until success', () => {
    expect(board).toContain('submitRequestIdRef');
    expect(board).toContain('if (isSubmitting) return');
    expect(board).toContain('setSubmitting(true)');
    expect(board).toContain('clientRequestId: submitRequestIdRef.current');
    expect(board).toContain('setSubmitting(false)');
  });
});
