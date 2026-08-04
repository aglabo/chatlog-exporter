// src: scripts/phases/__tests__/unit/phase-status.unit.spec.ts
// @(#): phaseStatus キャッシュステータス設定のユニットテスト
//       対象: phaseStatus
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { phaseStatus } from '../../phase-status.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { SetfmCache } from '../../../types/cache.types.ts';

// ─── Internal Helpers

// functions

/**
 * バッファプロバイダーを使った `ChatlogCache<SetfmCache>` インスタンスを生成する。
 *
 * ファイルシステムに依存しないテストのため、`Map<string, string>` をバッファとして使用する。
 * `yaml` を渡すと ready 完了時に YAML でキャッシュが初期化される。
 *
 * @param buf - 読み書きを受け持つバッファ
 * @param yaml - 初期キャッシュ内容（省略時は空）
 * @returns 初期化済みの `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCache = async (buf: Map<string, string>, yaml?: string): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(
    'fm-cache',
    '/fake/cache',
    yaml != null ? { yaml } : undefined,
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
      },
    },
  );
  await cache.ready;
  return cache;
};

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス
 * @param fmLines  - frontmatter ブロック内の YAML 行配列（--- を除く）
 * @param body     - 本文テキスト
 * @returns 指定されたパスと frontmatter を持つ `ChatlogEntry`
 */
const _makeEntry = (filePath: string, fmLines: string[], body: string): ChatlogEntry => {
  const text = ['---', ...fmLines, '---', '', body].join('\n');
  return new ChatlogEntry(text, { filePath });
};

/** 全5フィールド充足エントリ: type/category/title/topics[1]/tags[1] */
const _makeFullEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# Full entry body');

/** title フィールドが存在しないエントリ */
const _makeMissingTitleEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

// ─── Tests

/**
 * `phaseStatus` のユニットテストスイート。
 *
 * キャッシュ MISS 状態のエントリに対して、フロントマターフィールドの充足状態に応じた
 * status 値（`'frontmatter'` または `''`）がキャッシュに書き込まれることを検証する。
 * また、cache.status が `'written'` のエントリはスキップされることを検証する。
 *
 * テスト ID 範囲: T-SF-PS-01 〜 T-SF-PS-07
 *
 * @see phaseStatus
 */
describe('phaseStatus', () => {
  /**
   * フロントマターフィールド充足エントリの正常系。
   * 全6フィールドが揃っているとき `status: 'frontmatter'` がキャッシュに書き込まれる。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-PS-01: 全フィールド充足エントリ → cache.status === "frontmatter"', async () => {
      const buf = new Map<string, string>();
      const cache = await _makeCache(buf);
      const entry = _makeFullEntry('/path/to/full.md');

      await phaseStatus([entry], cache, false);

      assertEquals(cache.read('/path/to/full.md').status, SETFM_CACHE_STATUSES.FRONTMATTER);
    });

    it('[Normal] T-SF-PS-04: 混在配列（充足・不足・written）→ 各エントリが正しいステータス', async () => {
      const buf = new Map<string, string>();
      // 'written' エントリは yaml キー = ファイル名（拡張子なし）= 'written-entry'
      const cache = await _makeCache(buf, 'written-entry:\n  status: written');
      const fullEntry = _makeFullEntry('/path/to/full.md');
      const missingEntry = _makeMissingTitleEntry('/path/to/missing.md');
      const writtenEntry = _makeFullEntry('/path/to/written-entry.md');

      await phaseStatus([fullEntry, missingEntry, writtenEntry], cache, false);

      assertEquals(cache.read('/path/to/full.md').status, SETFM_CACHE_STATUSES.FRONTMATTER);
      assertEquals(cache.read('/path/to/missing.md').status, SETFM_CACHE_STATUSES.EMPTY);
      assertEquals(cache.read('/path/to/written-entry.md').status, SETFM_CACHE_STATUSES.WRITTEN);
    });
  });

  /**
   * フロントマターフィールド不足エントリの異常系。
   * title がないとき `status: ''` がキャッシュに書き込まれる。
   */
  describe('When: 異常系', () => {
    it('[Error] T-SF-PS-02: title なしエントリ → cache.status === ""', async () => {
      const buf = new Map<string, string>();
      const cache = await _makeCache(buf);
      const entry = _makeMissingTitleEntry('/path/to/missing.md');

      await phaseStatus([entry], cache, false);

      assertEquals(cache.read('/path/to/missing.md').status, SETFM_CACHE_STATUSES.EMPTY);
    });
  });

  /**
   * エッジケース: cache.status が 'written' のエントリはスキップされる、空配列はエラーなく完了する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-PS-03: cache.status === "written" のエントリ → 変更なし（"written" のまま）', async () => {
      const buf = new Map<string, string>();
      // yaml キー = ファイル名（拡張子なし）= 'written'
      const cache = await _makeCache(buf, 'written:\n  status: written');
      const entry = _makeFullEntry('/path/to/written.md');

      await phaseStatus([entry], cache, false);

      assertEquals(cache.read('/path/to/written.md').status, SETFM_CACHE_STATUSES.WRITTEN);
    });

    it('[Edge] T-SF-PS-05: entries=[] → エラーなく完了、cache への書き込みなし', async () => {
      const buf = new Map<string, string>();
      const cache = await _makeCache(buf);

      await phaseStatus([], cache, false);

      assertEquals(buf.size, 0);
    });

    it('[Edge] T-SF-PS-07: dryRun=true → cache.status は変更されない（書き込みなし）', async () => {
      const buf = new Map<string, string>();
      const cache = await _makeCache(buf);
      const entry = _makeFullEntry('/path/to/full.md');

      await phaseStatus([entry], cache, true);

      assertEquals(cache.read('/path/to/full.md').status, undefined);
    });

    describe('T-SF-PS-08/09: dryRun=true ログ検証', () => {
      let loggerStub: LoggerStub;

      beforeEach(() => {
        loggerStub = makeLoggerStub();
      });

      afterEach(() => {
        loggerStub.restore();
      });

      it('[Edge] T-SF-PS-08: dryRun=true, written 以外のエントリ → "status:" がファイル名を含んでログ出力される', async () => {
        const buf = new Map<string, string>();
        const cache = await _makeCache(buf);
        const entry = _makeFullEntry('/path/to/full.md');

        await phaseStatus([entry], cache, true);

        assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('status:') && l.includes('full.md')), true);
      });

      it('[Edge] T-SF-PS-09: dryRun=true, cache.status === "written" のエントリ → "status:" ログなし', async () => {
        const buf = new Map<string, string>();
        const cache = await _makeCache(buf, 'written:\n  status: written');
        const entry = _makeFullEntry('/path/to/written.md');

        await phaseStatus([entry], cache, true);

        assertEquals(
          loggerStub.dryrunLogs.every((l) => !(l.includes('status:') && l.includes('written.md'))),
          true,
        );
      });
    });
  });
});
