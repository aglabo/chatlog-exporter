// src: scripts/phases/__tests__/fixtures/phase-type-category.fixtures.spec.ts
// @(#): _phaseTypeAndCategory の fixtures テスト
//       対象: _phaseTypeAndCategoryForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { phaseTypeAndCategory } from '../../phase-type-category.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { normalizePath } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { DicEntry, Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants
/** fixtures-data/fm-type-category ディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _FIXTURES_FM_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-type-category', import.meta.url).pathname,
);

/** テスト用最大コンテンツ長。 */
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用並列度。 */
const _CONCURRENCY = 1;

// functions

/**
 * fixtures-data/fm-cache の実 JSON ファイルを読み込んだ `ChatlogCache<SetfmCache>` を返す。
 *
 * `subDir` に絶対パスを渡すことで `cacheRoot` を無視し、fixtures ディレクトリを直接使用する。
 * `writeTextFile` は noop にして fixtures ファイルへの上書きを防ぐ。
 * ready 完了時に自動で loadAll() が実行される。
 *
 * @returns ready 完了済みの `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCache = async (): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_FIXTURES_FM_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
    },
  });
  await cache.ready;
  return cache;
};

/**
 * テスト用 `DicEntry` を生成する。
 *
 * @param overrides - 上書きするフィールド
 * @returns デフォルト値を持つ `DicEntry`
 */
const _makeDicEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'misc',
  def: 'Miscellaneous log',
  desc: 'その他のログ',
  rules: { when: ['その他'], not: [] },
  ...overrides,
});

/**
 * テスト用 `Dics` を生成する（最小限のエントリのみ含む）。
 *
 * @returns 最小限のエントリセットを持つ `Dics`
 */
const _makeDics = (): Dics => ({
  category: 'general,development',
  tags: 'lang:typescript',
  categoryEntries: [
    _makeDicEntry({ key: 'general', def: 'General log', desc: '汎用ログ', rules: { when: ['汎用'], not: [] } }),
  ],
  typeEntries: [
    _makeDicEntry({ key: 'misc', def: 'Misc log', desc: 'その他ログ', rules: { when: ['その他'], not: [] } }),
  ],
  topicEntries: [],
});

/**
 * テスト用 `Prompts` を生成する（最小限のプロンプトテンプレートのみ含む）。
 *
 * @returns 最小限のプロンプトテンプレートを持つ `Prompts`
 */
const _makePrompts = (): Prompts => ({
  categoryPrompts: new Map([['misc', 'focus guide for misc']]),
  prompts: new Map([
    ['type-category', { system: 'Classify.', user: '${entries}' }],
    ['frontmatter', { system: 'Generate frontmatter.', user: '${entries}' }],
  ]),
});

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス（拡張子なしベース名が fixtures JSON キーに対応）
 * @param body - 本文テキスト
 * @returns 指定された filePath と body を持つ `ChatlogEntry`
 */
const _makeEntry = (filePath: string, body: string): ChatlogEntry => {
  const text = ['---', 'session_id: sess-001', '---', '', body].join('\n');
  return new ChatlogEntry(text, { filePath });
};

// ─── Tests

/**
 * `_phaseTypeAndCategory` の fixtures テストスイート。
 *
 * `fixtures-data/fm-cache/` の実 JSON ファイルを `ChatlogCache.loadAll()` で読み込み、
 * `_phaseTypeAndCategory` がキャッシュヒット時に AI 呼び出しをスキップすることを検証する。
 *
 * テスト ID 範囲: T-SF-FX-01, T-SF-FX-03
 *
 * @see _phaseTypeAndCategoryForTest
 */
describe('_phaseTypeAndCategory fixtures', () => {
  let cache: ChatlogCache<SetfmCache>;
  let judgeCallCount: number;
  let judgeStub: (entry: ChatlogEntry, maxLen: number, dics: Dics, prompts: Prompts) => Promise<void>;

  beforeEach(async () => {
    cache = await _makeCache();
    judgeCallCount = 0;
    judgeStub = (entry) => {
      judgeCallCount++;
      entry.frontmatter.set('type', 'stub-type');
      entry.frontmatter.set('category', 'stub-category');
      return Promise.resolve();
    };
  });

  /**
   * `_phaseTypeAndCategory` — type+category ヒット時のスキップ検証。
   *
   * `type-only.json` に type/category が存在するとき、judgeProvider は呼ばれず
   * キャッシュ値が frontmatter にセットされることを検証する。
   */
  describe('_phaseTypeAndCategory', () => {
    describe('When: type+category キャッシュヒット', () => {
      it('[Normal] T-SF-FX-01: type-only.json ヒット → judgeProvider 未呼び出し、type/category がキャッシュ値でセット', async () => {
        const entry = _makeEntry('/path/to/type-only.md', '# type only');

        await phaseTypeAndCategory(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
          { concurrency: _CONCURRENCY, dryRun: false },
          judgeStub,
        );

        assertEquals(entry.frontmatter.get('type'), 'coding');
        assertEquals(entry.frontmatter.get('category'), 'development');
        assertEquals(judgeCallCount, 0);
      });
    });

    /**
     * `_phaseTypeAndCategory` — type なし（partial-miss.json）のミス検証。
     *
     * `partial-miss.json` は category のみで type がないため、キャッシュミス扱いとなり
     * judgeProvider が呼ばれることを検証する。
     */
    describe('When: type なしでキャッシュミス', () => {
      it('[Normal] T-SF-FX-03: partial-miss.json (type なし) → judgeProvider が1回呼ばれる', async () => {
        const entry = _makeEntry('/path/to/partial-miss.md', '# partial miss');

        await phaseTypeAndCategory(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
          { concurrency: _CONCURRENCY, dryRun: false },
          judgeStub,
        );

        assertEquals(judgeCallCount, 1);
        assertEquals(entry.frontmatter.get('type'), 'stub-type');
        assertEquals(entry.frontmatter.get('category'), 'stub-category');
      });
    });
  });
});
