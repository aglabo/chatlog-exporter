// src: scripts/phases/__tests__/fixtures/phase-frontmatter.fixtures.spec.ts
// @(#): phaseFrontmatter の fixtures テスト
//       対象: phaseFrontmatter
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
import { phaseFrontmatter } from '../../phase-frontmatter.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { normalizePath } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { DicEntry, Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants
/** fixtures-data/fm-frontmatter ディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _FIXTURES_FM_FRONTMATTER_DIR = normalizePath(
  new URL('./fixtures-data/fm-frontmatter', import.meta.url).pathname,
);

/** テスト用最大コンテンツ長。 */
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用並列度。 */
const _CONCURRENCY = 1;

// functions

/**
 * fixtures-data/fm-frontmatter の実 JSON ファイルを読み込んだ `ChatlogCache<SetfmCache>` を返す。
 *
 * `subDir` に絶対パスを渡すことで `cacheRoot` を無視し、fixtures ディレクトリを直接使用する。
 * `writeTextFile` は noop にして fixtures ファイルへの上書きを防ぐ。
 * ready 完了時に自動で loadAll() が実行される。
 *
 * @returns ready 完了済みの `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCache = async (): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_FIXTURES_FM_FRONTMATTER_DIR, '', undefined, {
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
 * `phaseFrontmatter` の fixtures テストスイート。
 *
 * `fixtures-data/fm-frontmatter/` の実 JSON ファイルを `ChatlogCache.loadAll()` で読み込み、
 * `phaseFrontmatter` がキャッシュヒット時に AI 呼び出しをスキップすることを検証する。
 *
 * テスト ID 範囲: T-SF-FX-02
 *
 * @see phaseFrontmatter
 */
describe('cache-hit fixtures', () => {
  let cache: ChatlogCache<SetfmCache>;
  let generateCallCount: number;
  let generateStub: (entry: ChatlogEntry, maxLen: number, dics: Dics, prompts: Prompts) => Promise<boolean>;

  beforeEach(async () => {
    cache = await _makeCache();
    generateCallCount = 0;
    generateStub = (entry) => {
      generateCallCount++;
      entry.frontmatter.set('title', 'Generated Title');
      return Promise.resolve(true);
    };
  });

  /**
   * `phaseFrontmatter` — frontmatter ヒット時のスキップ検証。
   *
   * `frontmatter-full.json` に frontmatter が存在するとき、generateProvider は呼ばれず
   * キャッシュ値が frontmatter に復元されることを検証する。
   */
  describe('_phaseFrontmatter', () => {
    describe('When: frontmatter キャッシュヒット', () => {
      it('[Normal] T-SF-FX-02: frontmatter-full.json ヒット → generateProvider 未呼び出し、title 等が復元', async () => {
        const entry = _makeEntry('/path/to/frontmatter-full.md', '# frontmatter full');

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
          { concurrency: _CONCURRENCY, dryRun: false },
          generateStub,
        );

        assertEquals(entry.frontmatter.get('title'), 'Fixtures Full Test');
        assertEquals(entry.frontmatter.get('topics'), ['development', 'testing']);
        assertEquals(generateCallCount, 0);
      });
    });
  });
});
