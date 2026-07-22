import { describe, expect, it } from 'vitest';
import { captureFirstSelectedFile, clearFileInput } from './fileInput';

describe('file input helpers', () => {
  it('returns the captured file and clears the input before async processing can run', () => {
    const file = new File(['video'], 'ipad-recording.mov', { type: '' });
    const input: {
      files: { length: number; item(index: number): File | null } | null;
      value: string;
    } = {
      files: {
        length: 1,
        item: (index: number) => (index === 0 ? file : null)
      },
      value: 'C:\\fakepath\\ipad-recording.mov'
    };

    const captured = captureFirstSelectedFile(input);
    input.files = null;

    expect(captured).toBe(file);
    expect(captured?.name).toBe('ipad-recording.mov');
    expect(captured?.type).toBe('');
    expect(input.value).toBe('');
  });

  it('can preserve the input value while keeping the captured file after the event target is gone', () => {
    const file = new File(['video'], 'ios-camera.MOV', { type: 'video/quicktime' });
    const input: {
      files: { length: number; item(index: number): File | null } | null;
      value: string;
    } = {
      files: {
        length: 1,
        item: (index: number) => (index === 0 ? file : null)
      },
      value: 'C:\\fakepath\\ios-camera.MOV'
    };

    const captured = captureFirstSelectedFile(input, { clear: false });
    input.files = null;

    expect(captured).toBe(file);
    expect(captured?.type).toBe('video/quicktime');
    expect(input.value).toBe('C:\\fakepath\\ios-camera.MOV');

    clearFileInput(input);
    expect(input.value).toBe('');
  });

  it('handles cancelled recording selection without throwing', () => {
    const input = {
      files: null,
      value: 'C:\\fakepath\\cancelled.mov'
    };

    expect(captureFirstSelectedFile(input)).toBeNull();
    expect(input.value).toBe('');
  });
});
