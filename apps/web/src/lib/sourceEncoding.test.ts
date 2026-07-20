// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const scanRoots = ['apps/web/src', 'docs', 'supabase'];
const textExtensions = new Set(['.ts', '.tsx', '.css', '.json', '.sql', '.md', '.html']);

function listTextFiles(root: string): string[] {
  const absoluteRoot = join(repoRoot, root);
  const entries = readdirSync(absoluteRoot, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(absoluteRoot, entry.name);
    if (entry.isDirectory()) return listTextFiles(relative(repoRoot, absolutePath));
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) return [];
    return [absolutePath];
  });
}

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('source text encoding', () => {
  it('does not contain Unicode replacement characters in shipped text sources', () => {
    const offenders = scanRoots
      .flatMap(listTextFiles)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return source.includes('\uFFFD') ? [relative(repoRoot, file)] : [];
      });

    expect(offenders).toEqual([]);
  });

  it('keeps piggy user-facing labels in JSX instead of damaged CSS content', () => {
    const styles = readSource('apps/web/src/styles/index.css');
    const piggyScene = readSource('apps/web/src/components/piggy/PiggySceneV2.tsx');

    expect(piggyScene).toContain('<h2>商品架</h2>');
    expect(piggyScene).toContain("{isArranging ? '完成' : '整理'}");
    expect(piggyScene).toContain('<strong>收入紀錄</strong>');
    expect(piggyScene).toContain('<span>上一頁</span>');
    expect(piggyScene).toContain('<span>下一頁</span>');
    expect(piggyScene).toContain('等待到貨');
    expect(piggyScene).toContain('拖動硬幣到撲滿裡存錢吧！');
    expect(styles).not.toMatch(/content:\s*["'][^"']*\uFFFD[^"']*["']/u);
    expect(styles).not.toContain('data-type="影\uFFFD"');
  });

  it('matches share data-type selectors to real Traditional Chinese labels', () => {
    const styles = readSource('apps/web/src/styles/index.css');
    const childPage = readSource('apps/web/src/pages/child/ChildPage.tsx');

    expect(childPage).toContain("photo: '照片'");
    expect(childPage).toContain("audio: '語音'");
    expect(childPage).toContain("video: '影片'");
    expect(childPage).toContain("mixed: '混合'");
    expect(styles).toContain('small[data-type="語音"]');
    expect(styles).toContain('small[data-type="影片"]');
    expect(styles).toContain('small[data-type="鼓勵卡"]');
    expect(styles).toContain('small[data-type="混合"]');
  });
});
