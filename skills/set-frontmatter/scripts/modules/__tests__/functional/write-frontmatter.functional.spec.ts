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
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { readTextFile } from '../../../../../_cle-libs/libs/file-io/read-utils.ts';
import { fileOrDirExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';

// ─── Internal Helpers

let tempDir: string;
let cache: ChatlogCache<SetfmCache>;
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
 * @returns 初期化済みの `ChatlogCache<SetfmCache>` インスタンス
 */
async function _makeNoopCache(cacheDir: string): Promise<ChatlogCache<SetfmCache>> {
  const buf = new Map<string, string>();
  const c = new ChatlogCache<SetfmCache>(cacheDir, '', undefined, {
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

/** 6フィールドをすべて entry.frontmatter にセットするヘルパー。 */
const _setAllFields = (entry: ChatlogEntry): void => {
  entry.frontmatter.set('type', 'research');
  entry.frontmatter.set('category', 'development');
  entry.frontmatter.set('title', 'テスト');
  entry.frontmatter.set('summary', 'テスト用のサマリー');
  entry.frontmatter.set('topics', ['topic-a']);
  entry.frontmatter.set('tags', ['tag1']);
};

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
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir) を呼び出す', () => {
      describe('Then: T-SF-WF-01 - ファイルが更新され true が返る', () => {
        it('T-SF-WF-01-01: ファイルが更新される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('---'), true);
        });

        it('T-SF-WF-01-02: true を返す', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          const ok = await writeFrontmatter(entry, cache, tempDir, tempDir);

          assertEquals(ok, true);
        });

        it('T-SF-WF-01-03: ファイルに "type: research" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('type: "research"'), true);
        });

        it('T-SF-WF-01-04: ファイルに "category: development" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('category: "development"'), true);
        });

        it('T-SF-WF-01-05: 本文が末尾に保持される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('# テスト'), true);
        });
      });
    });
  });

  // ─── yaml が空文字の場合 ──────────────────────────────────────────────────

  describe('Given: frontmatter が空（title 未設定）の entry', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir) を呼び出す', () => {
      describe('Then: T-SF-WF-03 - false が返る', () => {
        it('T-SF-WF-03-01: false を返す', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);

          const ok = await writeFrontmatter(entry, cache, tempDir, tempDir);

          assertEquals(ok, false);
        });

        it('T-SF-WF-03-02: ファイルが変更されない', async () => {
          const filePath = `${tempDir}/test.md`;
          const originalContent = '# テスト\n本文';
          await Deno.writeTextFile(filePath, originalContent);
          const entry = _makeChatlogEntry(filePath);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          const updated = await readTextFile(filePath);
          assertEquals(updated, originalContent);
        });
      });
    });
  });

  // ─── inputDir が normalizeLogs ルートより深い絞り込み済みパスの場合 ─────────

  describe('Given: inputDir が normalizeLogs ルートより深い絞り込み済みパス', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir) を呼び出す', () => {
      describe('Then: T-SF-WF-05 - filePath から逆算した agent/yyyy/yyyy-mm 階層で出力される', () => {
        it('T-SF-WF-05-01: outputDir/agent/yyyy/yyyy-mm/... に出力される', async () => {
          const inputBaseDir = `${tempDir}/chatlogs/normalizeLogs`;
          const outputBaseDir = `${tempDir}/chatlogs/outputLogs`;
          const narrowedInputDir = `${inputBaseDir}/codex/2026/2026-04`;
          const filePath = `${narrowedInputDir}/chatlog-exporter/2026-04-03-xxx.md`;

          await Deno.mkdir(`${narrowedInputDir}/chatlog-exporter`, { recursive: true });
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, outputBaseDir, narrowedInputDir);

          const expectedOutputPath = `${outputBaseDir}/codex/2026/2026-04/chatlog-exporter/2026-04-03-xxx.md`;
          assertEquals(await fileOrDirExists(expectedOutputPath), true);
        });

        it('T-SF-WF-05-02: 入力が normalizeLogs 配下なら outputDir 引数を無視し outputLogs へ振り替える', async () => {
          const inputBaseDir = `${tempDir}/chatlogs/normalizeLogs`;
          const narrowedInputDir = `${inputBaseDir}/claude/2026/2026-05`;
          const filePath = `${narrowedInputDir}/chatlog-exporter/2026-05-01-yyy.md`;
          // 振り替えが働かない場合にのみ使われる、無関係な出力先
          const unrelatedOutputDir = `${tempDir}/chatlogs/otherLogs`;

          await Deno.mkdir(`${narrowedInputDir}/chatlog-exporter`, { recursive: true });
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, unrelatedOutputDir, narrowedInputDir);

          const redirectedPath =
            `${tempDir}/chatlogs/outputLogs/claude/2026/2026-05/chatlog-exporter/2026-05-01-yyy.md`;
          assertEquals(await fileOrDirExists(redirectedPath), true);
        });
      });
    });
  });

  // ─── 一時ファイルが残らない ───────────────────────────────────────────────

  describe('Given: 正常な書き込み完了後', () => {
    describe('When: writeFrontmatter(entry, cache, outputDir, inputDir) を呼び出す', () => {
      describe('Then: T-SF-WF-04 - .tmp ファイルが残らない', () => {
        it('T-SF-WF-04-01: .tmp ファイルが残らない', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const entry = _makeChatlogEntry(filePath);
          _setAllFields(entry);

          await writeFrontmatter(entry, cache, tempDir, tempDir);

          assertEquals(await fileOrDirExists(`${filePath}.tmp`), false);
        });
      });
    });
  });
});
