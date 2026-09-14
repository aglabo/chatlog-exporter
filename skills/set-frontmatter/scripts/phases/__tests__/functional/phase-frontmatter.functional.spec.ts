// src: scripts/phases/__tests__/functional/phase-frontmatter.functional.spec.ts
// @(#): _phaseFrontmatter フィールド充足チェックのユニットテスト
//       対象: phaseFrontmatter (_hasFrontmatterFields 経由の分岐動作)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { stub } from '@std/testing/mock';

// ─── Test target
import { phaseFrontmatter } from '../../phase-frontmatter.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
import { generateFrontmatter } from '../../../modules/setfm-frontmatter.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-frontmatter-unit', import.meta.url).pathname,
);

/** テスト用最大コンテンツ長。 */
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用並列度。 */
const _CONCURRENCY = 1;

/**
 * テスト用最小 Dics。generateProvider スタブが dics を無視するため最小構造でよい。
 * `_alreadyFilled` パスでは generateProvider は一切呼ばれないため、内容は空でよい。
 */
const _DICS = {} as Dics;

/**
 * テスト用最小 Prompts。generateProvider スタブが prompts を無視するため最小構造でよい。
 */
const _PROMPTS = {} as Prompts;

// functions

/**
 * 書き込みをすべて noop にしたインメモリキャッシュを返す。
 * `readTextFile` が常に reject するため、自動 loadAll() 後も全パスがキャッシュミス（`cache.read()` → `{}`）になる。
 *
 * `subDir` に絶対パスを渡すことで `GlobalConfig.getInstance()` を呼ばずに初期化できる。
 * `mkdir` は noop なのでディレクトリは作成されない。
 *
 * @returns キャッシュ空の `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeEmptyCache = async (): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readTextFile: () => Promise.reject(new Error('not found')),
    },
  });
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

/** topics フィールドが存在しないエントリ */
const _makeMissingTopicsEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** tags フィールドが存在しないエントリ */
const _makeMissingTagsEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'topics:',
    '  - typescript',
  ], '# body');

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

/** topics が空配列（`[]`）のエントリ */
const _makeEmptyTopicsEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'topics: []',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** title が空文字列のエントリ */
const _makeEmptyTitleEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    "title: ''",
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** topics がスカラー文字列（配列でない）のエントリ */
const _makeScalarTopicsEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'topics: typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** type フィールドが存在しないエントリ（category あり） */
const _makeMissingTypeEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'category: development',
    'title: Test Title',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** category フィールドが存在しないエントリ（type あり） */
const _makeMissingCategoryEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'title: Test Title',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/** type が空文字列のエントリ */
const _makeEmptyTypeEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    "type: ''",
    'category: development',
    'title: Test Title',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# body');

/**
 * generateProvider スタブ。呼び出し回数をカウントし、title に 'Generated' をセットして true を返す。
 *
 * @param counter - `{ count: number }` オブジェクト（参照渡しでカウントを外部から観察する）
 * @returns generateProvider 互換の非同期関数
 */
const _makeGenerateStub =
  (counter: { count: number }) => (e: ChatlogEntry, _max: number, _dics: Dics, _prompts: Prompts): Promise<boolean> => {
    counter.count++;
    e.frontmatter.set('title', 'Generated');
    return Promise.resolve(true);
  };

/**
 * generateProvider スタブ。全5フィールド（type/category/title/topics/tags）をセットして true を返す。
 * T-SF-PF-12 で「生成成功＋全フィールド充足」ケースに使用する。
 *
 * @param counter - `{ count: number }` オブジェクト（参照渡しでカウントを外部から観察する）
 * @returns generateProvider 互換の非同期関数
 */
const _makeFullGenerateStub =
  (counter: { count: number }) => (e: ChatlogEntry, _max: number, _dics: Dics, _prompts: Prompts): Promise<boolean> => {
    counter.count++;
    e.frontmatter.set('type', 'research');
    e.frontmatter.set('category', 'development');
    e.frontmatter.set('title', 'Generated Title');
    e.frontmatter.set('topics', ['typescript']);
    e.frontmatter.set('tags', ['lang:typescript']);
    return Promise.resolve(true);
  };

/**
 * generateProvider スタブ。何もセットせずに false を返す（生成失敗シミュレーション）。
 *
 * @returns generateProvider 互換の非同期関数
 */
const _makeFailGenerateStub = (_counter: { count: number }) =>
(
  _e: ChatlogEntry,
  _max: number,
  _dics: Dics,
  _prompts: Prompts,
): Promise<boolean> => {
  return Promise.resolve(false);
};

// ─── Tests

/**
 * `phaseFrontmatter` のフィールド充足チェック（`_hasFrontmatterFields` 分岐）ユニットテストスイート。
 *
 * すべてのケースで cache MISS 状態（`_makeEmptyCache` 使用、`loadAll()` 未呼び出し）。
 * `_hasFrontmatterFields` は非 export のため、`phaseFrontmatter` 経由で振る舞いを検証する。
 *
 * テスト ID 範囲: T-SF-PF-01 〜 T-SF-PF-14
 *
 * @see phaseFrontmatter
 */
describe('_phaseFrontmatter', () => {
  /**
   * `_alreadyFilled` 分岐: 全フィールド充足時に generateProvider をスキップする。
   * `_hasFrontmatterFields` が常に false の実装では counter.count === 1 になるため FN 確認の役割も持つ。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-PF-01-01: 全フィールド揃い → generateProvider 未呼び出し、status が frontmatter', async () => {
      const filePath = '/path/to/full.md';
      const entry = _makeFullEntry(filePath);
      const counter = { count: 0 };
      const cache = await _makeEmptyCache();

      await phaseFrontmatter(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 0);
      assertEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.FRONTMATTER);
    });

    it('[Normal] T-SF-PF-02-01: topics なし → generateProvider が1回呼ばれる', async () => {
      const entry = _makeMissingTopicsEntry('/path/to/no-topics.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Normal] T-SF-PF-03-01: tags なし → generateProvider が1回呼ばれる', async () => {
      const entry = _makeMissingTagsEntry('/path/to/no-tags.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Normal] T-SF-PF-04-01: title なし → generateProvider が1回呼ばれる', async () => {
      const entry = _makeMissingTitleEntry('/path/to/no-title.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Normal] T-SF-PF-05-01: summary なし（5フィールド揃い）→ generateProvider 未呼び出し', async () => {
      const entry = _makeMissingTopicsEntry('/path/to/no-topics.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Normal] T-SF-PF-07-01: type なし → generateProvider が1回呼ばれる', async () => {
      const entry = _makeMissingTypeEntry('/path/to/no-type.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Normal] T-SF-PF-08-01: category なし → generateProvider が1回呼ばれる', async () => {
      const entry = _makeMissingCategoryEntry('/path/to/no-category.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });
  });

  /** エッジケース: topics の空配列・空文字列は不充足として generateProvider に委ねる。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-PF-06-01: topics が空配列 [] → 不充足として generateProvider が1回呼ばれ、status は frontmatter にならない', async () => {
      const filePath = '/path/to/empty-topics.md';
      const entry = _makeEmptyTopicsEntry(filePath);
      const counter = { count: 0 };
      const cache = await _makeEmptyCache();

      await phaseFrontmatter(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
      assertNotEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.FRONTMATTER);
    });

    it('[Edge] T-SF-PF-06-02: title が空文字列 → generateProvider が1回呼ばれる', async () => {
      const entry = _makeEmptyTitleEntry('/path/to/empty-title.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });

    it('[Edge] T-SF-PF-09-01: type が空文字列 → generateProvider が1回呼ばれる', async () => {
      const entry = _makeEmptyTypeEntry('/path/to/empty-type.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });
  });

  /** 異常系: topics がスカラー文字列（配列でない）は不充足として generateProvider に委ねる。 */
  describe('When: 異常系', () => {
    it('[Error] T-SF-PF-06-03: topics がスカラー文字列（配列でない）→ generateProvider が1回呼ばれる', async () => {
      const entry = _makeScalarTopicsEntry('/path/to/scalar-topics.md');
      const counter = { count: 0 };

      await phaseFrontmatter(
        [entry],
        await _makeEmptyCache(),
        _MAX_CONTENT_LENGTH,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeGenerateStub(counter),
      );

      assertEquals(counter.count, 1);
    });
  });

  /**
   * review-failed 除外テスト (T-SF-PF-14)。
   *
   * `status: 'review-failed'` のキャッシュヒットエントリは `_hits` から除外され、
   * `_needsGenerate` パスに流れて generateProvider が呼ばれることを検証する。
   */
  describe('review-failed 除外', () => {
    describe('When: キャッシュヒットだが status=review-failed', () => {
      it('[Error] T-SF-PF-14-01: status=review-failed + frontmatter あり → generateProvider が1回呼ばれる', async () => {
        const filePath = '/path/to/review-failed.md';
        const cache = await _makeEmptyCache();
        await cache.write(filePath, {
          frontmatter: {
            type: 'research',
            category: 'development',
            title: 'Failed Title',
            topics: ['typescript'],
            tags: ['lang:typescript'],
          },
          status: 'review-failed',
        });

        const entry = _makeEntry(filePath, [], '# body');
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeGenerateStub(counter),
        );

        assertEquals(counter.count, 1);
      });
    });
  });

  /**
   * NEED_REVIEW ステータス書き込みテスト (T-SF-PF-10〜13)。
   *
   * `phaseFrontmatter` の 3 パス（キャッシュヒット / _alreadyFilled / _needsGenerate）で
   * 全フィールド充足時に `status: 'frontmatter'` が書き込まれることを検証する。
   */
  describe('NEED_REVIEW ステータス書き込み', () => {
    /** キャッシュヒットパス (_hits) の NEED_REVIEW 書き込み */
    describe('When: キャッシュヒット', () => {
      it('[Normal] T-SF-PF-10-01: キャッシュヒット＋全フィールド充足 → status = frontmatter', async () => {
        const filePath = '/path/to/cached-full.md';
        const cache = await _makeEmptyCache();
        await cache.write(filePath, {
          status: SETFM_CACHE_STATUSES.TYPE_CATEGORY,
          frontmatter: {
            type: 'research',
            category: 'development',
            title: 'Cached Title',
            topics: ['typescript'],
            tags: ['lang:typescript'],
          },
        });

        const entry = _makeEntry(filePath, [], '# body');
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeGenerateStub(counter),
        );

        assertEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.FRONTMATTER);
      });

      it('[Edge] T-SF-PF-10-02: キャッシュヒット＋フィールド不足 → status が frontmatter でない', async () => {
        const filePath = '/path/to/cached-partial.md';
        const cache = await _makeEmptyCache();
        await cache.write(filePath, {
          frontmatter: { type: 'research', category: 'development' },
        });

        const entry = _makeMissingTopicsEntry(filePath);
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeGenerateStub(counter),
        );

        const status = cache.read(filePath).status;
        assertEquals(status !== SETFM_CACHE_STATUSES.FRONTMATTER, true);
      });
    });

    /** _alreadyFilled パス (キャッシュミス＋全フィールド充足) の NEED_REVIEW 書き込み */
    describe('When: 既充足エントリ（キャッシュミス）', () => {
      it('[Normal] T-SF-PF-11-01: 既充足エントリ（キャッシュミス）→ status = frontmatter', async () => {
        const filePath = '/path/to/already-full.md';
        const entry = _makeFullEntry(filePath);
        const cache = await _makeEmptyCache();
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeGenerateStub(counter),
        );

        assertEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.FRONTMATTER);
      });
    });

    /** _needsGenerate パス (新規生成) の NEED_REVIEW 書き込み */
    describe('When: 新規生成', () => {
      it('[Normal] T-SF-PF-12-01: 新規生成成功＋全フィールド充足 → status = frontmatter', async () => {
        const filePath = '/path/to/new-full.md';
        const entry = _makeMissingTopicsEntry(filePath);
        const cache = await _makeEmptyCache();
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeFullGenerateStub(counter),
        );

        assertEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.FRONTMATTER);
      });

      it('[Normal] T-SF-PF-12-02: AI 応答の tags が空配列 → status = frontmatter、frontmatter に [] を保持', async () => {
        // generateProvider スタブではなく、実 generateFrontmatter + aiRunnerProvider スタブで空配列応答を通す
        const filePath = '/path/to/empty-arrays-gen.md';
        const entry = _makeEntry(filePath, ['type: research', 'category: development'], '# body');
        const cache = await _makeEmptyCache();
        // _DICS は空オブジェクトで出力契約の構築に使えないため、最小の Dics / Prompts を用意する
        const _dics: Dics = {
          category: 'development',
          tags: 'typescript',
          categoryEntries: [],
          typeEntries: [],
          topicEntries: [],
        };
        const _prompts: Prompts = {
          categoryPrompts: new Map(),
          prompts: new Map([['meta', { system: 'You are assistant.', user: 'Generate: {{body}}' }]]),
        };
        const _emptyArraysStub = (): Promise<string> => Promise.resolve('title: B\ntopics: [ai]\ntags: []\n');
        const _generateProvider = (
          entry: ChatlogEntry,
          ...rest: [number, Dics, Prompts, number, string?, AbortSignal?]
        ): Promise<boolean> => generateFrontmatter(entry, ...rest, _emptyArraysStub);

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _dics,
          _prompts,
          { concurrency: _CONCURRENCY, dryRun: false },
          _generateProvider,
        );

        const _cached = cache.read(filePath);
        assertEquals(_cached.status, SETFM_CACHE_STATUSES.FRONTMATTER);
        assertEquals(_cached.frontmatter?.title, 'B');
        assertEquals(_cached.frontmatter?.topics, ['ai']);
        assertEquals(_cached.frontmatter?.tags, []);
      });

      it('[Error] T-SF-PF-13-01: 生成失敗 (_ok=false) → status が frontmatter でない', async () => {
        const filePath = '/path/to/fail-gen.md';
        const entry = _makeMissingTopicsEntry(filePath);
        const cache = await _makeEmptyCache();
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeFailGenerateStub(counter),
        );

        assertEquals(cache.read(filePath).status !== SETFM_CACHE_STATUSES.FRONTMATTER, true);
      });

      it('[Edge] T-SF-PF-13-02: 生成成功だがフィールド不足 → status が frontmatter でない', async () => {
        const filePath = '/path/to/partial-gen.md';
        const entry = _makeMissingTopicsEntry(filePath);
        const cache = await _makeEmptyCache();
        const counter = { count: 0 };

        await phaseFrontmatter(
          [entry],
          cache,
          _MAX_CONTENT_LENGTH,
          _DICS,
          _PROMPTS,
          { concurrency: _CONCURRENCY, dryRun: false },
          _makeGenerateStub(counter),
        );

        assertEquals(cache.read(filePath).status !== SETFM_CACHE_STATUSES.FRONTMATTER, true);
      });
    });
  });
});

/**
 * `phaseFrontmatter` が出力契約違反（ResponseSchemaViolation）を当該ファイルの FAIL に留め、一括処理を続行することを検証するスイート。
 *
 * `generateProvider` から実 `generateFrontmatter` を呼び、`aiRunnerProvider` だけをスタブに差し替える。
 * モジュール層の契約違反伝播は T-SF-OCT-04-01 でカバー済み。
 *
 * テスト ID 範囲: T-SF-OCTF-04
 *
 * @see phaseFrontmatter
 */
describe('phaseFrontmatter — 出力契約違反', () => {
  describe('When: 一部ファイルの AI 応答が ResponseSchemaViolation になる', () => {
    it('[Error] T-SF-OCTF-04-01: reject せず当該ファイルのみ FAIL を記録し、他ファイルの生成は続行する', async () => {
      const _dics: Dics = {
        category: 'development,tooling',
        tags: 'typescript,deno',
        categoryEntries: [],
        typeEntries: [],
        topicEntries: [
          { key: 'ai', def: 'AI', desc: 'AI 関連', rules: {} },
          { key: 'tooling', def: 'Tooling', desc: 'ツール関連', rules: {} },
        ],
      };
      const _prompts: Prompts = {
        categoryPrompts: new Map(),
        prompts: new Map([['meta', { system: 'You are assistant.', user: 'Generate: {{body}}' }]]),
      };
      const _pathA = '/path/to/a.md';
      const _pathB = '/path/to/b.md';
      const _violationStub = (): Promise<string> =>
        Promise.reject(new ChatlogError('AiError', 'ResponseSchemaViolation', 'schema violation'));
      const _okStub = (): Promise<string> => Promise.resolve('title: B\ntopics:\n  - ai\ntags:\n  - typescript\n');
      const _generateProvider = (
        entry: ChatlogEntry,
        ...rest: [number, Dics, Prompts, number, string?, AbortSignal?]
      ): Promise<boolean> => generateFrontmatter(entry, ...rest, entry.filePath === _pathA ? _violationStub : _okStub);
      const cache = await _makeEmptyCache();
      const errorStub = stub(logger, 'error');

      try {
        await phaseFrontmatter(
          [_makeEntry(_pathA, [], '# a'), _makeEntry(_pathB, [], '# b')],
          cache,
          _MAX_CONTENT_LENGTH,
          _dics,
          _prompts,
          { concurrency: 1, dryRun: false, maxRetry: 3, model: 'sonnet' },
          _generateProvider,
        );
      } finally {
        errorStub.restore();
      }

      const _failLogs = errorStub.calls
        .map((c) => String(c.args[0]))
        .filter((msg) => msg.includes('FAIL (生成失敗)') && msg.includes('a.md'));
      assertEquals(_failLogs.length, 1);
      assertEquals(cache.read(_pathA).frontmatter, undefined);
      assertEquals(cache.read(_pathA).status !== SETFM_CACHE_STATUSES.FRONTMATTER, true);
      assertEquals(cache.read(_pathB).frontmatter?.title, 'B');
    });
  });
});
