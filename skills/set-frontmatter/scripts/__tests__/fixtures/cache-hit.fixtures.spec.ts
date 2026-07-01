// src: scripts/__tests__/fixtures/cache-hit.fixtures.spec.ts
// @(#): _phaseTypeAndCategory / _phaseFrontmatter / _phaseReview の fixtures テスト
//       対象: _phaseTypeAndCategoryForTest, _phaseFrontmatterForTest, _phaseReviewForTest
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
import {
  _phaseFrontmatterForTest as phaseFrontmatter,
  _phaseReviewForTest as phaseReview,
  _phaseTypeAndCategoryForTest as phaseTypeAndCategory,
} from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { DicEntry, Dics, Prompts } from '../../types/dics.types.ts';
import type { ReviewResult } from '../../types/phase.types.ts';

// ─── Internal Helpers

// constants
/** fixtures-data/fm-cache ディレクトリの絶対パス。`ChatlogWorks` の `subDir` に渡す。 */
const _FIXTURES_FM_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-cache', import.meta.url).pathname,
);

/** テスト用最大コンテンツ長。 */
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用並列度。 */
const _CONCURRENCY = 1;

// functions

/**
 * fixtures-data/fm-cache の実 JSON ファイルを読み込んだ `ChatlogWorks<SetfmCache>` を返す。
 *
 * `subDir` に絶対パスを渡すことで `cacheRoot` を無視し、fixtures ディレクトリを直接使用する。
 * `writeTextFile` は noop にして fixtures ファイルへの上書きを防ぐ。
 * ready 完了時に自動で loadAll() が実行される。
 *
 * @returns ready 完了済みの `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCache = async (): Promise<ChatlogWorks<SetfmCache>> => {
  const cache = new ChatlogWorks<SetfmCache>(_FIXTURES_FM_CACHE_DIR, '', {
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
 * キャッシュヒット fixtures テストスイート。
 *
 * `fixtures-data/fm-cache/` の実 JSON ファイルを `ChatlogWorks.loadAll()` で読み込み、
 * `_phaseTypeAndCategory` / `_phaseFrontmatter` がキャッシュヒット時に AI 呼び出しを
 * スキップすることを検証する。
 *
 * テスト ID 範囲: T-SF-FX-01 〜 T-SF-FX-03
 *
 * @see _phaseTypeAndCategoryForTest
 * @see _phaseFrontmatterForTest
 */
describe('cache-hit fixtures', () => {
  let cache: ChatlogWorks<SetfmCache>;
  let judgeCallCount: number;
  let generateCallCount: number;
  let reviewCallCount: number;
  let judgeStub: (entry: ChatlogEntry, maxLen: number, dics: Dics, prompts: Prompts) => Promise<void>;
  let generateStub: (entry: ChatlogEntry, maxLen: number, dics: Dics, prompts: Prompts) => Promise<boolean>;
  let reviewStub: (entry: ChatlogEntry, dics: Dics, prompts: Prompts) => Promise<ReviewResult>;

  beforeEach(async () => {
    cache = await _makeCache();
    judgeCallCount = 0;
    generateCallCount = 0;
    reviewCallCount = 0;
    judgeStub = (entry) => {
      judgeCallCount++;
      entry.frontmatter.set('type', 'stub-type');
      entry.frontmatter.set('category', 'stub-category');
      return Promise.resolve();
    };
    generateStub = (entry) => {
      generateCallCount++;
      entry.frontmatter.set('title', 'Generated Title');
      return Promise.resolve(true);
    };
    reviewStub = (_entry) => {
      reviewCallCount++;
      return Promise.resolve({ validity: 'pass', errors: [] });
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
          _CONCURRENCY,
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
          _CONCURRENCY,
          judgeStub,
        );

        assertEquals(judgeCallCount, 1);
        assertEquals(entry.frontmatter.get('type'), 'stub-type');
        assertEquals(entry.frontmatter.get('category'), 'stub-category');
      });
    });
  });

  /**
   * `_phaseFrontmatter` — frontmatter ヒット時のスキップ検証。
   *
   * `frontmatter-full.json` に frontmatter が存在するとき、generateProvider は呼ばれず
   * キャッシュ値が frontmatter に復元されることを検証する。
   */
  describe('_phaseFrontmatter', () => {
    describe('When: frontmatter キャッシュヒット', () => {
      it('[Normal] T-SF-FX-02: frontmatter-full.json ヒット → generateProvider 未呼び出し、title/summary 等が復元', async () => {
        const entry = _makeEntry('/path/to/frontmatter-full.md', '# frontmatter full');

        const result = await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
          _CONCURRENCY,
          generateStub,
        );

        assertEquals(result.has('/path/to/frontmatter-full.md'), true);
        assertEquals(entry.frontmatter.get('title'), 'Fixtures Full Test');
        assertEquals(entry.frontmatter.get('summary'), 'fixtures テスト用フロントマターサンプル');
        assertEquals(generateCallCount, 0);
      });
    });
  });

  /**
   * `_phaseReview` — レビュー済みキャッシュヒット時のスキップ検証。
   *
   * `reviewed-full.json` に `reviewed: true` が存在するとき、reviewProvider は呼ばれず
   * スキップされることを検証する。また `reviewed-miss.json` では reviewProvider が1回呼ばれることを検証する。
   */
  describe('_phaseReview', () => {
    describe('When: reviewedキャッシュヒット', () => {
      it('[Normal] T-SF-FX-04: reviewed-full.json ヒット → reviewProvider 未呼び出し', async () => {
        const entry = _makeEntry('/path/to/reviewed-full.md', '# reviewed full');

        await phaseReview(
          [entry],
          cache,
          _makeDics(),
          _makePrompts(),
          _CONCURRENCY,
          reviewStub,
        );

        assertEquals(reviewCallCount, 0);
      });
    });

    describe('When: reviewedキャッシュミス', () => {
      it('[Normal] T-SF-FX-05: reviewed-miss.json ミス → reviewProvider が1回呼ばれる', async () => {
        const entry = _makeEntry('/path/to/reviewed-miss.md', '# reviewed miss');

        await phaseReview(
          [entry],
          cache,
          _makeDics(),
          _makePrompts(),
          _CONCURRENCY,
          reviewStub,
        );

        assertEquals(reviewCallCount, 1);
      });

      it('[Normal] T-SF-FX-06: reviewed-miss.json ミス → reviewProvider の修正が cache.frontmatter に反映される', async () => {
        const entry = _makeEntry('/path/to/reviewed-miss.md', '# reviewed miss');
        const correctedTopics = ['corrected-topic'];
        const correctedTags = ['corrected:tag'];
        const _reviewWithCorrection = (e: ChatlogEntry, _dics: Dics, _prompts: Prompts): Promise<ReviewResult> => {
          reviewCallCount++;
          e.frontmatter.set('topics', correctedTopics);
          e.frontmatter.set('tags', correctedTags);
          return Promise.resolve({ validity: 'pass', errors: [] });
        };

        await phaseReview(
          [entry],
          cache,
          _makeDics(),
          _makePrompts(),
          _CONCURRENCY,
          _reviewWithCorrection,
        );

        const cached = cache.read('/path/to/reviewed-miss.md');
        assertEquals(cached.reviewed, true);
        assertEquals(cached.frontmatter?.['topics'], correctedTopics);
        assertEquals(cached.frontmatter?.['tags'], correctedTags);
      });
    });
  });
});
