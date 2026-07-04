// src: scripts/__tests__/functional/setfm-phase-review.functional.spec.ts
// @(#): _phaseReview の review-failed / reviewed ステータス書き込みユニットテスト
//       対象: _phaseReviewForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phaseReviewForTest as phaseReview } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { Dics, Prompts } from '../../types/dics.types.ts';
import type { ReviewResult } from '../../types/phase.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogWorks` の `subDir` に渡す。 */
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
 * @returns 指定ファイルにキャッシュヒットする `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCacheWithHit = async (
  filePath: string,
  data: Partial<SetfmCache>,
): Promise<ChatlogWorks<SetfmCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogWorks<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
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

/** 全フィールド充足エントリ（type/category/title/summary/topics/tags）。 */
const _makeFullEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'summary: Test summary text',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# Full entry body');

/**
 * `validity: 'fail'` を返す reviewProvider スタブ。
 *
 * @param errors - 返すエラーメッセージ配列
 * @returns reviewProvider 互換の非同期関数
 */
const _makeFailReviewStub =
  (errors: string[]) => (_entry: ChatlogEntry, _dics: Dics, _prompts: Prompts): Promise<ReviewResult> =>
    Promise.resolve({ validity: 'fail', errors });

/**
 * `validity: 'pass'` を返す reviewProvider スタブ。
 *
 * @returns reviewProvider 互換の非同期関数
 */
const _makePassReviewStub = () => (_entry: ChatlogEntry, _dics: Dics, _prompts: Prompts): Promise<ReviewResult> =>
  Promise.resolve({ validity: 'pass', errors: [] });

// ─── Tests

/**
 * `_phaseReview` の `review-failed` / `reviewed` ステータス書き込みユニットテストスイート。
 *
 * `reviewProvider` が `validity: 'fail'` を返した場合に `status: 'review-failed'` が書き込まれ、
 * `validity: 'pass'` を返した場合に `status: 'reviewed'` が書き込まれることを検証する。
 *
 * テスト ID 範囲: T-SF-PR-01 〜 T-SF-PR-02
 *
 * @see _phaseReviewForTest
 */
describe('_phaseReview', () => {
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
        _CONCURRENCY,
        false,
        _makePassReviewStub(),
      );

      assertEquals(cache.read(filePath).status, 'reviewed');
    });
  });

  /** 異常系: reviewProvider が fail を返す → キャッシュエントリが削除される */
  describe('When: 異常系', () => {
    it('[Error] T-SF-PR-02-01: reviewProvider が fail を返す → キャッシュエントリが削除される', async () => {
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
        _CONCURRENCY,
        false,
        _makeFailReviewStub(['title が不正']),
      );

      assertEquals(cache.read(filePath), {});
    });
  });
});
