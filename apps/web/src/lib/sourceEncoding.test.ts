// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const scanRoots = ['apps/web/src', 'docs', 'supabase'];
const textExtensions = new Set(['.ts', '.tsx', '.css', '.json', '.sql', '.md', '.html']);
const mojibakeFragments = [
  0x56d9,
  0x856d,
  0x8756,
  0x929d,
  0x648c,
  0x646e,
  0x969e,
  0x9788,
  0x6f78,
  0x773a,
  0x8751,
  0x66cc,
  0x6576,
  0x761b,
  0x769b,
  0xf351,
  0xf424,
  0xf24c,
  0xf113
].map((codePoint) => String.fromCodePoint(codePoint));
const mojibakePattern = new RegExp(`[\\uE000-\\uF8FF]|${mojibakeFragments.join('|')}`, 'u');

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

  it('does not contain known mojibake fragments in shipped text sources', () => {
    const offenders = scanRoots
      .flatMap(listTextFiles)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return mojibakePattern.test(source) ? [relative(repoRoot, file)] : [];
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
    expect(styles).not.toMatch(/content:\s*["'][^"']*(購買|存款不足|等待到貨|已到貨|拖動硬幣|商品架|收入紀錄|上一頁|下一頁)[^"']*["']/u);
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

  it('keeps the iPad shelf product action row inside the fixed product card', () => {
    const styles = readSource('apps/web/src/styles/index.css');
    const piggyScene = readSource('apps/web/src/components/piggy/PiggySceneV2.tsx');

    expect(piggyScene).toContain('className="piggy-v2-product-action"');
    expect(styles).toContain('grid-template-rows: 68px minmax(18px, 32px) 16px 30px');
    expect(styles).toContain('.piggy-v2-product-action');
    expect(styles).toContain('height: 30px');
    expect(styles).toContain('-webkit-line-clamp: 2');
  });
});
