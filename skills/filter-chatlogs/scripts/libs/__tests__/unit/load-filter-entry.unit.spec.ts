// src: scripts/libs/__tests__/unit/load-filter-entry.unit.spec.ts
// @(#): loadFilterEntry / loadFilterEntries のユニットテスト
//       対象: loadFilterEntry / loadFilterEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadFilterEntries, loadFilterEntry } from '../../load-filter-entry.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { CLEResult } from '../../../types/cache.types.ts';
// constants
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';

// ─── Internal Helpers

// functions
/**
 * テスト用の空 `ChatlogCache<CLEResult>`（バッファバック）を生成する。
 *
 * ファイル I/O をせずにインメモリバッファで動作するキャッシュを返す。
 *
 * @returns 初期化済みの空キャッシュ
 */
const _makeEmptyFilterCache = async (): Promise<ChatlogCache<CLEResult>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<CLEResult>(
    'filter-cache',
    '/fake/cache',
    undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
        glob: () => Promise.resolve([]),
        removeFile: (path) => {
          buf.delete(path);
          return Promise.resolve();
        },
      },
    },
  );
  await cache.ready;
  return cache;
};

/**
 * テスト用の一時ファイルを指定された内容で作成する。
 *
 * @param content - 書き込むファイル内容
 * @returns 作成した一時ファイルのパス
 */
const _makeTempFile = async (content: string): Promise<string> => {
  const path = await Deno.makeTempFile({ suffix: '.md' });
  await Deno.writeTextFile(path, content);
  return path;
};

// constants
/** 正しい frontmatter を持つエントリ本文。 */
const _VALID_ENTRY = `---\ntitle: Test\ndate: 2026-01-01\n---\n\n### User\nHello\n`;

/** YAML 構文が不正な frontmatter を持つエントリ本文。 */
const _INVALID_YAML_ENTRY = `---\ntitle: [unclosed\n---\n\n### User\nHello\n`;

// ─── Tests

/**
 * `loadFilterEntry` 関数のユニットテストスイート。
 *
 * ファイルパスから `ChatlogEntry` を読み込む。ファイル I/O 起因の致命的エラーは
 * そのまま呼び出し元に throw し、frontmatter 解析エラー等は `cache` に書き込まず
 * `{ ok: false, filePath, error }` を返す（cache への書き込みは呼び出し元の責務）。
 *
 * テスト ID 範囲: T-FC-LFE-01 〜 T-FC-LFE-03
 *
 * @see loadFilterEntry
 */
describe('loadFilterEntry', () => {
  /** 各テストで作成した一時ファイルのパスを記録する。 */
  let tempFiles: string[] = [];

  beforeEach(() => {
    tempFiles = [];
  });

  afterEach(async () => {
    await Promise.all(tempFiles.map((f) => Deno.remove(f).catch(() => {})));
  });

  /** 正常系: 存在する正しい frontmatter 付きファイルを読み込むケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FC-LFE-01: 正しい frontmatter 付きファイル → ChatlogEntry が返る', async () => {
      const path = await _makeTempFile(_VALID_ENTRY);
      tempFiles.push(path);

      const result = await loadFilterEntry(path);

      assertEquals(result instanceof ChatlogEntry, true);
      assertEquals((result as ChatlogEntry).filePath, path);
      assertEquals((result as ChatlogEntry).content, '### User\nHello\n');
    });
  });

  /** 異常系: ファイル I/O 起因の致命的エラーはそのまま re-throw されるケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-FC-LFE-02: 存在しないファイルパス → 例外が re-throw される', async () => {
      const _filePath = '/nonexistent/path/to/file.md';

      await assertRejects(() => loadFilterEntry(_filePath));
    });

    it('[Error] T-FC-LFE-03: frontmatter の YAML 構文が不正 → { filePath, error } が返る', async () => {
      const path = await _makeTempFile(_INVALID_YAML_ENTRY);
      tempFiles.push(path);

      const result = await loadFilterEntry(path);

      assertEquals(result instanceof ChatlogEntry, false);
      const failure = result as { filePath: string; error: Error };
      assertEquals(failure.filePath, path);
      assertEquals(failure.error instanceof Error, true);
      assertEquals(typeof failure.error.message, 'string');
    });
  });
});

/**
 * `loadFilterEntries` 関数のユニットテストスイート。
 *
 * `loadFilterEntry` を `Promise.all` で並列適用し、成功分を `entries`、
 * 失敗分を `errors` に振り分ける。`errors` はまとめて `cache` に ERROR を書き込む。
 *
 * テスト ID 範囲: T-FC-LFES-01 〜 T-FC-LFES-03
 *
 * @see loadFilterEntries
 */
describe('loadFilterEntries', () => {
  let tempFiles: string[] = [];

  beforeEach(() => {
    tempFiles = [];
  });

  afterEach(async () => {
    await Promise.all(tempFiles.map((f) => Deno.remove(f).catch(() => {})));
  });

  /** 正常系: 複数ファイルの並列読み込み、および空配列のケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FC-LFES-01: 複数ファイルパス → 順序通りに entries が返り errors は空', async () => {
      const path1 = await _makeTempFile(_VALID_ENTRY);
      const path2 = await _makeTempFile(`---\ntitle: Second\n---\n\n### User\nSecond entry\n`);
      tempFiles.push(path1, path2);
      const cache = await _makeEmptyFilterCache();

      const results = await loadFilterEntries([path1, path2], cache, 2);

      assertEquals(results.entries.length, 2);
      assertEquals(results.entries[0].filePath, path1);
      assertEquals(results.entries[1].filePath, path2);
      assertEquals(results.errors, []);
    });

    it('[Normal] T-FC-LFES-02: 空配列 → entries・errors ともに空配列が返る', async () => {
      const cache = await _makeEmptyFilterCache();

      const results = await loadFilterEntries([], cache, 2);

      assertEquals(results.entries, []);
      assertEquals(results.errors, []);
    });
  });

  /** エッジケース: 一部のファイルがパースエラーで残りが正常なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FC-LFES-03: 一部ファイルがパースエラー → entries/errors に分離され cache に ERROR が記録される', async () => {
      const okPath = await _makeTempFile(_VALID_ENTRY);
      const errorPath = await _makeTempFile(_INVALID_YAML_ENTRY);
      tempFiles.push(okPath, errorPath);
      const cache = await _makeEmptyFilterCache();

      const results = await loadFilterEntries([okPath, errorPath], cache, 2);

      assertEquals(results.entries.length, 1);
      assertEquals(results.entries[0].filePath, okPath);
      assertEquals(results.entries[0].content, '### User\nHello\n');

      assertEquals(results.errors.length, 1);
      assertEquals(results.errors[0].filePath, errorPath);
      assertEquals(results.errors[0].error instanceof Error, true);

      const cached = cache.read(errorPath);
      assertEquals(cached.decision, FILTER_DECISIONS.ERROR);
      assertEquals(cached.confidence, 0);
      assertEquals(cached.reason, results.errors[0].error.message);
    });

    it('[Edge] T-FC-LFES-04: cache 省略 → errors は返るが cache への書き込みは行われない（例外も発生しない）', async () => {
      const okPath = await _makeTempFile(_VALID_ENTRY);
      const errorPath = await _makeTempFile(_INVALID_YAML_ENTRY);
      tempFiles.push(okPath, errorPath);

      const results = await loadFilterEntries([okPath, errorPath], undefined, 2);

      assertEquals(results.entries.length, 1);
      assertEquals(results.entries[0].filePath, okPath);
      assertEquals(results.errors.length, 1);
      assertEquals(results.errors[0].filePath, errorPath);
    });
  });
});
