// src: scripts/modules/__tests__/functional/write-frontmatter.functional.spec.ts
// @(#): writeFrontmatter の機能テスト
//       実ファイルを使ったフロントマター書き込みの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { writeFrontmatter } from '../../setfm-write.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../../_scripts/classes/ChatlogWorks.class.ts';
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { fileOrDirExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';

// ─── Internal Helpers

let tempDir: string;
let cache: ChatlogWorks<SetfmCache>;
let errStub: Stub<Console>;
let logStub: Stub<Console>;

/**
 * テスト用 `ChatlogEntry` をファイルパスから生成する。
 *
 * @param filePath - エントリに設定するファイルパス
 * @returns セッションメタ付きの `ChatlogEntry`
 */
function _makeChatlogEntry(filePath: string): ChatlogEntry {
  const text = [
    '---',
    'session_id: sess-001',
    'date: 2026-03-15',
    'project: my-project',
    'slug: test-slug',
    '---',
    '',
    '# テスト',
    '本文テキスト',
  ].join('\n');
  return new ChatlogEntry(text, { filePath });
}

/**
 * noop キャッシュを生成する。
 *
 * @param cacheDir - キャッシュ用ディレクトリ（`subDir` に直接渡す）
 * @returns 初期化済みの `ChatlogWorks<SetfmCache>` インスタンス
 */
async function _makeNoopCache(cacheDir: string): Promise<ChatlogWorks<SetfmCache>> {
  const buf = new Map<string, string>();
  const c = new ChatlogWorks<SetfmCache>(cacheDir, '', undefined, {
    cache: {
      readTextFile: (path: string) => {
        const data = buf.get(path);
        if (data === undefined) { return Promise.reject(new Error('not found')); }
        return Promise.resolve(data);
      },
      writeTextFile: (path: string, data: string) => {
        buf.set(path, data);
        return Promise.resolve();
      },
      mkdir: () => Promise.resolve(),
    },
  });
  await c.ready;
  return c;
}

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
  cache = await _makeNoopCache(tempDir);
  errStub = stub(console, 'error', () => {});
  logStub = stub(console, 'log', () => {});
});

afterEach(async () => {
  errStub.restore();
  logStub.restore();
  await Deno.remove(tempDir, { recursive: true });
});

// ─── Tests

describe('writeFrontmatter', () => {
  describe('Given: 有効な yaml と dryRun=false', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir, false) を呼び出す', () => {
      describe('Then: T-SF-WF-01 - ファイルが更新され true が返る', () => {
        it('T-SF-WF-01-01: ファイルが更新される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('---'), true);
        });

        it('T-SF-WF-01-02: true を返す', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          const ok = await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          assertEquals(ok, true);
        });

        it('T-SF-WF-01-03: ファイルに "type: research" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('type: "research"'), true);
        });

        it('T-SF-WF-01-04: ファイルに "category: development" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('category: "development"'), true);
        });

        it('T-SF-WF-01-05: 本文が末尾に保持される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('# テスト'), true);
        });
      });
    });
  });

  // ─── dryRun=true: ファイルは変更されない ─────────────────────────────────

  describe('Given: 有効な yaml と dryRun=true', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir, true) を呼び出す', () => {
      describe('Then: T-SF-WF-02 - ファイルは変更されず true が返る', () => {
        it('T-SF-WF-02-01: ファイルが変更されない', async () => {
          const filePath = `${tempDir}/test.md`;
          const originalContent = '# テスト\n本文';
          await Deno.writeTextFile(filePath, originalContent);
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, true);

          const updated = await readTextFile(filePath);
          assertEquals(updated, originalContent);
        });

        it('T-SF-WF-02-02: true を返す', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          const ok = await writeFrontmatter(entry, cache, tempDir, tempDir, true);

          assertEquals(ok, true);
        });
      });
    });
  });

  // ─── yaml が空文字の場合 ──────────────────────────────────────────────────

  describe('Given: frontmatter が空（title 未設定）の entry', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir, false) を呼び出す', () => {
      describe('Then: T-SF-WF-03 - false が返る', () => {
        it('T-SF-WF-03-01: false を返す', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);

          const ok = await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          assertEquals(ok, false);
        });

        it('T-SF-WF-03-02: ファイルが変更されない', async () => {
          const filePath = `${tempDir}/test.md`;
          const originalContent = '# テスト\n本文';
          await Deno.writeTextFile(filePath, originalContent);
          const entry = _makeChatlogEntry(filePath);

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          const updated = await readTextFile(filePath);
          assertEquals(updated, originalContent);
        });
      });
    });
  });

  // ─── 一時ファイルが残らない ───────────────────────────────────────────────

  describe('Given: 正常な書き込み完了後', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir, false) を呼び出す', () => {
      describe('Then: T-SF-WF-04 - .tmp ファイルが残らない', () => {
        it('T-SF-WF-04-01: .tmp ファイルが残らない', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          entry.frontmatter.set('title', 'テスト');
          entry.frontmatter.set('type', 'research');
          entry.frontmatter.set('category', 'development');

          await writeFrontmatter(entry, cache, tempDir, tempDir, false);

          assertEquals(await fileOrDirExists(`${filePath}.tmp`), false);
        });
      });
    });
  });
});
