// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', relativePath), 'utf8');
}

describe('parent child device settings UI', () => {
  it('keeps parent device settings focused on binding and login actions', () => {
    const source = readRepoFile('apps/web/src/pages/parent/Children.tsx');

    expect(source).toContain('<div><dt>綁定狀態</dt><dd>{isBound ?');
    expect(source).toContain('4 位 PIN');
    expect(source).toContain('複製網址');
    expect(source).toContain('重新產生網址');
    expect(source).toContain('解除綁定');

    expect(source).not.toContain('<div><dt>使用狀態</dt>');
    expect(source).not.toContain('<div><dt>QR 狀態</dt>');
    expect(source).not.toContain('<div><dt>最後登入時間</dt>');
    expect(source).not.toContain('<div><dt>最近心跳</dt>');
    expect(source).not.toContain('<div><dt>最後登入裝置</dt>');
    expect(source).not.toContain('last_login_device ??');
    expect(source).not.toContain('navigator.userAgent');
  });
});
