// src: scripts/__tests__/fixtures/cache-hit.fixtures.spec.ts
// @(#): _phaseReview の fixtures テスト
//       対象: _phaseReviewForTest
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
import { _phaseReviewForTest as phaseReview } from '../../set-frontmatter.ts';

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
  const cache = new ChatlogWorks<SetfmCache>(_FIXTURES_FM_CACHE_DIR, '', undefined, {
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
 * `_phaseReview` がキャッシュヒット時に AI 呼び出しをスキップすることを検証する。
 *
 * テスト ID 範囲: T-SF-FX-04 〜 T-SF-FX-06
 *
 * @see _phaseReviewForTest
 */
describe('cache-hit fixtures', () => {
  let cache: ChatlogWorks<SetfmCache>;
  let reviewCallCount: number;
  let reviewStub: (entry: ChatlogEntry, dics: Dics, prompts: Prompts) => Promise<ReviewResult>;

  beforeEach(async () => {
    cache = await _makeCache();
    reviewCallCount = 0;
    reviewStub = (_entry) => {
      reviewCallCount++;
      return Promise.resolve({ validity: 'pass', errors: [] });
    };
  });

  /**
   * `_phaseReview` — レビュー済みキャッシュヒット時のスキップ検証。
   *
   * `reviewed-full.json` に `status: 'reviewed'` が存在するとき、reviewProvider は呼ばれず
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
          false,
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
          false,
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
          false,
          _reviewWithCorrection,
        );

        const cached = cache.read('/path/to/reviewed-miss.md');
        assertEquals(cached.status, 'reviewed');
        assertEquals(cached.frontmatter?.['topics'], correctedTopics);
        assertEquals(cached.frontmatter?.['tags'], correctedTags);
      });
    });
  });
});
