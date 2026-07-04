// src: scripts/__tests__/unit/setfm-phase-review.unit.spec.ts
// @(#): _phaseReview の dryRun パラメータのユニットテスト
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
// stub
import { spy } from '@std/testing/mock';

// ─── Test target
import { _phaseReviewForTest as phaseReview } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { Dics, Prompts } from '../../types/dics.types.ts';
import type { ReviewResult } from '../../types/phase.types.ts';

// ─── Internal Helpers

// types
type _ReviewProvider = (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
) => Promise<ReviewResult>;

// functions

/**
 * インメモリバッファを使ったキャッシュを返す。
 * yaml を指定した場合は YAML で初期化する。省略時はキャッシュミス状態（status 未設定）。
 *
 * @param yaml - キャッシュ初期値の YAML 文字列（省略時は空キャッシュ）
 * @returns 初期化済みの `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCache = async (yaml?: string): Promise<ChatlogWorks<SetfmCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogWorks<SetfmCache>(
    'fm-cache',
    '/fake/cache',
    yaml != null ? { yaml } : undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          return data !== undefined ? Promise.resolve(data) : Promise.reject(new Error('not found'));
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
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
 * @returns 指定されたパスを持つ最小 `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  return new ChatlogEntry('# body', { filePath });
};

/**
 * 呼び出し回数をカウントする reviewProvider スタブを返す。
 * 常に `{ validity: 'pass', errors: [] }` を返す。
 *
 * @returns `{ stub, getCount }` — stub は _ReviewProvider 互換の非同期関数、getCount は呼び出し回数を返す
 */
const _makeReviewStub = (): { stub: _ReviewProvider; getCount: () => number } => {
  let _count = 0;
  const stub: _ReviewProvider = (_entry, _dics, _prompts) => {
    _count++;
    return Promise.resolve({ validity: 'pass', errors: [] });
  };
  return { stub, getCount: () => _count };
};

/** テスト用の空 Dics / Prompts ダミー。 */
const _dics = {} as Dics;
const _prompts = {} as Prompts;

// ─── Tests

/**
 * `_phaseReview` の dryRun パラメータのユニットテストスイート。
 *
 * dryRun=false では reviewProvider と cache.write が呼ばれ、
 * dryRun=true では両方とも呼ばれないことを検証する。
 *
 * テスト ID 範囲: T-04-01 〜 T-04-03
 *
 * @see _phaseReviewForTest
 */
describe('_phaseReview', () => {
  /**
   * dryRun=false の動作: reviewProvider と cache.write が実行される。
   */
  describe('When: dryRun=false', () => {
    it('[Normal] T-04-01-01: dryRun=false → reviewProvider 1回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseReview(entries, cache, _dics, _prompts, 1, false, stub);

      assertEquals(getCount(), 1);
    });

    it('[Normal] T-04-01-02: dryRun=false → cache.write 1回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseReview(entries, cache, _dics, _prompts, 1, false, stub);

      assertEquals(writeSpy.calls.length >= 1, true);
    });
  });

  /**
   * dryRun=true の動作: reviewProvider も cache.write も呼ばれない。
   */
  describe('When: dryRun=true', () => {
    it('[Normal] T-04-02-01: dryRun=true → reviewProvider 0回', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseReview(entries, cache, _dics, _prompts, 1, true, stub);

      assertEquals(getCount(), 0);
    });

    it('[Normal] T-04-02-02: dryRun=true → cache.write 0回', async () => {
      const cache = await _makeCache();
      const { stub } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseReview(entries, cache, _dics, _prompts, 1, true, stub);

      assertEquals(writeSpy.calls.length, 0);
    });
  });

  /**
   * エッジケース: entries=[] のとき dryRun=true でも正常に解決する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-04-03-01: entries=[] / dryRun=true → resolves, reviewProvider 0回', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeReviewStub();

      await phaseReview([], cache, _dics, _prompts, 1, true, stub);

      assertEquals(getCount(), 0);
    });
  });
});
