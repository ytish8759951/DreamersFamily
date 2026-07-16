// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', relativePath), 'utf8');
}

describe('startup initialization safety', () => {
  it('does not leave parent route guards in an infinite loading state', () => {
    const routes = readRepoFile('apps/web/src/routes.tsx');
    const supabaseData = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(routes).toContain('function StartupBlocker');
    expect(routes).toContain('isRuntimeAuthBlocked(runtimeInfo)');
    expect(routes).toContain('setTimedOut(true)');
    expect(routes).toContain('window.location.reload()');
    expect(routes).toContain("runtimeInfo.authStatus === 'error'");
    expect(supabaseData).toContain("authStatus: 'error'");
    expect(supabaseData).toContain("startupTrace('AUTH END'");
  });
});
