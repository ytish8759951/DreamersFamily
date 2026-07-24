import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', relativePath), 'utf8');
}

describe('bootstrap chunk recovery', () => {
  it('keeps missing hashed assets out of the SPA fallback', () => {
    const redirects = readRepoFile('apps/web/public/_redirects');
    const middleware = readRepoFile('apps/web/functions/_middleware.js');

    expect(redirects).toContain('/* /index.html 200');
    expect(middleware).toContain("url.pathname.startsWith('/assets/')");
    expect(middleware).toContain("contentType.toLowerCase().includes('text/html')");
    expect(middleware).toContain('status: 404');
    expect(middleware).toContain('application/javascript');
    expect(middleware).toContain('text/css');
    expect(middleware).toContain('X-Dreamers-Asset-Missing');
    expect(middleware).toContain('no-cache, no-store, must-revalidate');
  });

  it('recovers module import and chunk failures without clearing persistent user data', () => {
    const source = readRepoFile('apps/web/src/main.tsx');

    expect(source).toContain('Importing a module script failed'.toLowerCase());
    expect(source).toContain('failed to fetch dynamically imported module');
    expect(source).toContain('chunkloaderror');
    expect(source).toContain('unable to preload css');
    expect(source).toContain('BOOT_RECOVERY_GUARD_KEY');
    expect(source).toContain('sessionStorage.setItem');
    expect(source).not.toContain('localStorage.clear');
    expect(source).not.toContain('indexedDB.deleteDatabase');
    expect(source).toContain('重新載入新版');
    expect(source).toContain('DreamersFamily 載入新版時失敗');
    expect(source).toContain('/build-meta.json');
  });
});
