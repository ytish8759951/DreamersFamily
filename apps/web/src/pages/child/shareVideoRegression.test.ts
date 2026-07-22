// @ts-nocheck
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'ChildPage.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('child share video regression guards', () => {
  it('keeps child photo selection state-driven with preview and delayed input clearing', () => {
    expect(source).toContain('function SharePhotoPicker');
    expect(source).toContain('inputRef={photoInputRef}');
    expect(source).toContain('ref={inputRef}');
    expect(source).toContain('type="file"');
    expect(source).toContain('accept="image/*"');
    expect(source).toContain('const file = captureFirstSelectedFile(input, { clear: false });');
    expect(source).toContain('void processSelectedPhoto(file);');
    expect(source).toContain('setSelectedPhotoPreviewUrl');
    expect(source).toContain('shareRepository.createPreviewUrl(file)');
    expect(source).toContain('更換照片');
    expect(source).toContain('目前檔案大小');
  });

  it('supports iOS photo formats and HEIC conversion before upload', () => {
    expect(source).toContain('image/heic');
    expect(source).toContain('image/heif');
    expect(source).toContain("['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']");
    expect(source).toContain('prepareSharePhotoForUpload');
    expect(source).toContain('convertSharePhotoToJpeg');
    expect(source).toContain('HEIC/HEIF 照片轉換失敗');
  });

  it('uses native camera and library file inputs for video sharing', () => {
    expect(source).toContain('function ShareNativeVideoPicker');
    expect(source).toContain('ref={cameraInputRef}');
    expect(source).toContain('ref={libraryInputRef}');
    expect(source).toContain('capture="environment"');
    expect(source).toContain('從照片圖庫選擇影片');
    expect(source).toContain('preload="metadata"');
    expect(source).not.toContain('function ShareVideoRecorder');
    expect(source).not.toContain("startShareRecording('video')");
    expect(source).not.toContain('getShareVideoRecordingMimeType');
    expect(source).not.toContain('videoRecordingErrorMessage');
  });

  it('captures selected video files synchronously without clearing the input immediately', () => {
    expect(source).toContain('const input = event.currentTarget;');
    expect(source).toContain('const file = captureFirstSelectedFile(input, { clear: false });');
    expect(source).toContain("void processSelectedVideo(file, 'camera');");
    expect(source).toContain("void processSelectedVideo(file, 'library');");
    expect(source).not.toMatch(/setShareForm\(\([^)]*\)\s*=>[\s\S]*event\.(currentTarget|target)\.files/);
  });

  it('accepts iOS video formats and reports the 300MB limit in Chinese', () => {
    expect(source).toContain('video/quicktime');
    expect(source).toContain("'m4v'");
    expect(source).toContain('影片檔案太大');
    expect(source).toContain('系統允許的最大容量');
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
