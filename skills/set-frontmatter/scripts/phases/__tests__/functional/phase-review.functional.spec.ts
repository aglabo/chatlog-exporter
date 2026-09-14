// src: scripts/phases/__tests__/functional/phase-review.functional.spec.ts
// @(#): phaseReview の review-failed / reviewed ステータス書き込みユニットテスト
//       対象: phaseReview
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { phaseReview } from '../../phase-review.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
import { reviewFrontmatter } from '../../../modules/setfm-review.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';
import type { ReviewResult } from '../../../types/phase.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-cache-pr-unit', import.meta.url).pathname,
);

/** テスト用並列度。 */
const _CONCURRENCY = 1;

/** テスト用最小 Dics。reviewProvider スタブが使用しないため最小構造でよい。 */
const _DICS = {} as Dics;

/** テスト用最小 Prompts。reviewProvider スタブが使用しないため最小構造でよい。 */
const _PROMPTS = {} as Prompts;

// functions

/**
 * インメモリキャッシュを返す。指定した `data` が filePath にヒットする状態で初期化される。
 *
 * @param filePath - キャッシュキーとなるファイルパス
 * @param data - `cache.read(filePath)` に返させる `SetfmCache` データ
 * @returns 指定ファイルにキャッシュヒットする `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCacheWithHit = async (
  filePath: string,
  data: Partial<SetfmCache>,
): Promise<ChatlogCache<SetfmCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: (path, content) => {
        buf.set(path, content);
        return Promise.resolve();
      },
      mkdir: () => Promise.resolve(),
      readTextFile: (_path: string) => Promise.resolve(JSON.stringify(data)),
      glob: (_pattern: string) => Promise.resolve([filePath]),
    },
  });
  await cache.ready;
  return cache;
};

/**
 * 空のインメモリキャッシュを返す。すべてのファイルがキャッシュミス（`read` が `{}`）の状態で初期化される。
 *
 * @returns 書き込みのみ `_hash` に反映される `ChatlogCache<SetfmCache>` インスタンス
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

/** 全フィールド充足エントリ（type/category/title/topics/tags）。 */
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

/**
 * `validity: 'error'` を返す reviewProvider スタブ。
 *
 * @param errors - 返すエラーメッセージ配列
 * @returns reviewProvider 互換の非同期関数
 */
const _makeFailReviewStub =
  (errors: string[]) => (_entry: ChatlogEntry, _dics: Dics, _prompts: Prompts): Promise<ReviewResult> =>
    Promise.resolve({ validity: 'error', errors });

/**
 * `validity: 'pass'` を返す reviewProvider スタブ。
 *
 * @returns reviewProvider 互換の非同期関数
 */
const _makePassReviewStub = () => (_entry: ChatlogEntry, _dics: Dics, _prompts: Prompts): Promise<ReviewResult> =>
  Promise.resolve({ validity: 'pass', errors: [] });

// ─── Tests

/**
 * `phaseReview` の `review-failed` / `reviewed` ステータス書き込みユニットテストスイート。
 *
 * `reviewProvider` が `validity: 'error'` を返した場合に `status: 'review-failed'` が書き込まれ、
 * `validity: 'pass'` を返した場合に `status: 'reviewed'` が書き込まれることを検証する。
 *
 * テスト ID 範囲: T-SF-PR-01 〜 T-SF-PR-02
 *
 * @see phaseReview
 */
describe('phaseReview', () => {
  /** 正常系: reviewProvider が pass を返す → status = reviewed */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-PR-01-01: reviewProvider が pass を返す → status = reviewed', async () => {
      const filePath = '/path/to/pass.md';
      const entry = _makeFullEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, {
        type: 'research',
        category: 'development',
        frontmatter: { title: 'Test Title' },
      });

      await phaseReview(
        [entry],
        cache,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makePassReviewStub(),
      );

      assertEquals(cache.read(filePath).status, 'reviewed');
    });
  });

  /** 異常系: reviewProvider が error を返す → status が review-failed になる */
  describe('When: 異常系', () => {
    it('[Error] T-SF-PR-02-01: reviewProvider が error を返す → status が review-failed に設定される', async () => {
      const filePath = '/path/to/fail.md';
      const entry = _makeFullEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, {
        type: 'research',
        category: 'development',
        frontmatter: { title: 'Test Title' },
      });

      await phaseReview(
        [entry],
        cache,
        _DICS,
        _PROMPTS,
        { concurrency: _CONCURRENCY, dryRun: false },
        _makeFailReviewStub(['title が不正']),
      );

      assertEquals(cache.read(filePath).status, 'review-failed');
    });
  });
});

/**
 * `phaseReview` が出力契約違反（ResponseSchemaViolation）を当該ファイルの FAIL に留め、一括処理を続行することを検証するスイート。
 *
 * `reviewProvider` から実 `reviewFrontmatter` を呼び、`aiRunnerProvider` だけをスタブに差し替える。
 * モジュール層の契約違反伝播は T-SF-OCT-05-01 でカバー済み。
 *
 * テスト ID 範囲: T-SF-OCTF-05
 *
 * @see phaseReview
 */
describe('phaseReview — 出力契約違反', () => {
  describe('When: 一部ファイルの AI 応答が ResponseSchemaViolation になる', () => {
    it('[Error] T-SF-OCTF-05-01: reject せず当該ファイルのみ FAIL を記録し、他ファイルのレビューは続行する', async () => {
      const _dics: Dics = {
        category: 'development,tooling',
        tags: 'typescript,deno',
        categoryEntries: [],
        typeEntries: [
          { key: 'research', def: 'Research', desc: '調査', rules: {} },
          { key: 'discussion', def: 'Discussion', desc: '議論', rules: {} },
        ],
        topicEntries: [
          { key: 'ai', def: 'AI', desc: 'AI 関連', rules: {} },
          { key: 'tooling', def: 'Tooling', desc: 'ツール関連', rules: {} },
        ],
      };
      const _prompts: Prompts = {
        categoryPrompts: new Map(),
        prompts: new Map([['review', { system: 'You are reviewer.', user: 'Review: {{result_yaml}}' }]]),
      };
      const _pathA = '/path/to/a.md';
      const _pathB = '/path/to/b.md';
      const _violationStub = (): Promise<string> =>
        Promise.reject(new ChatlogError('AiError', 'ResponseSchemaViolation', 'schema violation'));
      const _passStub = (): Promise<string> => Promise.resolve('validity: pass\nerrors: []');
      const _reviewProvider = (
        entry: ChatlogEntry,
        ...rest: [Dics, Prompts, number, string?, AbortSignal?]
      ): Promise<ReviewResult> =>
        reviewFrontmatter(entry, ...rest, entry.filePath === _pathA ? _violationStub : _passStub);
      const cache = await _makeEmptyCache();
      const errorStub = stub(logger, 'error');

      try {
        await phaseReview(
          [_makeFullEntry(_pathA), _makeFullEntry(_pathB)],
          cache,
          _dics,
          _prompts,
          { concurrency: 1, dryRun: false, maxRetry: 3, model: 'sonnet' },
          _reviewProvider,
        );
      } finally {
        errorStub.restore();
      }

      const _failLogs = errorStub.calls
        .map((c) => String(c.args[0]))
        .filter((msg) => msg.includes('FAIL (review 失敗)') && msg.includes('a.md'));
      assertEquals(_failLogs.length, 1);
      assertEquals(
        [SETFM_CACHE_STATUSES.REVIEWED, SETFM_CACHE_STATUSES.REVIEW_FAILED].some((st) =>
          st === cache.read(_pathA).status
        ),
        false,
      );
      assertEquals(cache.read(_pathB).status, SETFM_CACHE_STATUSES.REVIEWED);
    });
  });
});
