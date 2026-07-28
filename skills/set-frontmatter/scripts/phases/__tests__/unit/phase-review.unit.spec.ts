// src: scripts/phases/__tests__/unit/phase-review.unit.spec.ts
// @(#): phaseReview の dryRun パラメータのユニットテスト
//       対象: phaseReview
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { spy } from '@std/testing/mock';

// ─── Test target
import { needsReviewAi, phaseReview } from '../../phase-review.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';
import type { ReviewResult } from '../../../types/phase.types.ts';

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
 * @returns 初期化済みの `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCache = async (yaml?: string): Promise<ChatlogCache<SetfmCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<SetfmCache>(
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

/**
 * 呼び出し時に指定した `ReviewResult` を返す reviewProvider スタブを返す。
 *
 * @param result - `reviewProvider` が返す `ReviewResult`
 * @returns `{ stub }` — stub は `_ReviewProvider` 互換の非同期関数
 */
const _makeCorrectedStub = (result: ReviewResult): { stub: _ReviewProvider } => {
  const stub: _ReviewProvider = (_entry, _dics, _prompts) => Promise.resolve(result);
  return { stub };
};

/** テスト用の空 Dics / Prompts ダミー。 */
const _dics = {} as Dics;
const _prompts = {} as Prompts;

// ─── Tests

/**
 * `phaseReview` の dryRun パラメータのユニットテストスイート。
 *
 * dryRun=false では reviewProvider と cache.write が呼ばれ、
 * dryRun=true では両方とも呼ばれないことを検証する。
 *
 * テスト ID 範囲: T-04-01 〜 T-04-03
 *
 * @see phaseReview
 */
describe('phaseReview', () => {
  /**
   * dryRun=false の動作: reviewProvider と cache.write が実行される。
   */
  describe('When: dryRun=false', () => {
    it('[Normal] T-04-01-01: dryRun=false → reviewProvider 1回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);

      assertEquals(getCount(), 1);
    });

    it('[Normal] T-04-01-02: dryRun=false → cache.write 1回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);

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

      await phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: true }, stub);

      assertEquals(getCount(), 0);
    });

    it('[Normal] T-04-02-02: dryRun=true → cache.write 0回', async () => {
      const cache = await _makeCache();
      const { stub } = _makeReviewStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: true }, stub);

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

      await phaseReview([], cache, _dics, _prompts, { concurrency: 1, dryRun: true }, stub);

      assertEquals(getCount(), 0);
    });
  });

  /**
   * reviewProvider が RateLimit 以外のエラー（非 AiError / AiError/ExitFailure）を throw したとき
   * phase が abort せず継続し `logger.error` にログを出すケース。
   *
   * RateLimit のみバッチを abort する（別ケース T-04-05-01 で検証）。
   * 非 RateLimit のエラーは握りつぶして他エントリの処理を継続する。
   */
  describe('When: reviewProvider が非 RateLimit エラーを throw する', () => {
    it('[Normal] T-04-04-01: reviewProvider が非 AiError を throw → abort せず他エントリ継続・error ログが出る', async () => {
      const cache = await _makeCache();
      const _throwingStub: _ReviewProvider = (_entry, _dics, _prompts) => {
        throw new Error('simulated non-fatal failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const errorSpy = spy(logger, 'error');
      try {
        // Should resolve without throwing (catch inside phase)
        await phaseReview(entries, cache, _dics, _prompts, { concurrency: 2, dryRun: false }, _throwingStub);
        assertEquals(errorSpy.calls.length >= 1, true);
      } finally {
        errorSpy.restore();
      }
    });

    it('[Error] T-04-04-02: reviewProvider が AiError/ExitFailure を throw → 再 throw せず継続・error ログが出る', async () => {
      const cache = await _makeCache();
      const _throwingStub: _ReviewProvider = (_entry, _dics, _prompts) => {
        throw new ChatlogError('AiError', 'ExitFailure', 'simulated exit failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const errorSpy = spy(logger, 'error');
      try {
        // ExitFailure は再 throw せず resolve する
        await phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: false }, _throwingStub);
        assertEquals(errorSpy.calls.some((c) => String(c.args[0]).includes('review 失敗')), true);
      } finally {
        errorSpy.restore();
      }
    });
  });

  /**
   * validity='corrected' のとき r.corrected を cache.frontmatter に書き込むケース。
   */
  describe('When: validity=corrected → r.corrected をキャッシュに書き込む', () => {
    it('[Normal] T-03-01-01: corrected={type,category,title,topics,tags} → cache.frontmatter に反映', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { type: 'tech', category: 'ai', title: 'T', topics: ['x'], tags: ['y'] },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      const fm = cache.read(filePath).frontmatter;
      assertEquals(fm?.['type'], 'tech');
      assertEquals(fm?.['category'], 'ai');
      assertEquals(fm?.['title'], 'T');
    });

    it('[Normal] T-03-01-02: corrected の type/category が cache.type/category に設定される', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { type: 'tech', category: 'ai' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      assertEquals(cache.read(filePath).type, 'tech');
      assertEquals(cache.read(filePath).category, 'ai');
    });

    it('[Edge] T-03-01-03: r.corrected に空文字フィールドがある → cache の既存値が保持される', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: SETFM_CACHE_STATUSES.FRONTMATTER,
        frontmatter: { title: 'cached-title' },
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { title: '', type: 'tech' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });

    it('[Edge] T-03-01-05: r.corrected.type が空文字 → cache.type は既存値のまま', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: SETFM_CACHE_STATUSES.FRONTMATTER,
        type: 'existing-type',
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { type: '', category: 'ai' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      assertEquals(cache.read(filePath).type, 'existing-type');
    });

    it('[Edge] T-03-01-04: r.corrected に空配列フィールドがある → cache の既存値が保持される', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: SETFM_CACHE_STATUSES.FRONTMATTER,
        frontmatter: { topics: ['existing-topic'] },
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { topics: [], type: 'tech' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      assertEquals(cache.read(filePath).frontmatter?.['topics'], ['existing-topic']);
    });
  });

  /**
   * validity='error' のとき cache.status が 'review-failed' になり cache.delete が呼ばれないケース。
   */
  describe('When: validity=error → status が review-failed になる', () => {
    it('[Normal] T-03-03-01: validity=error → cache.status === review-failed', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      const { stub } = _makeCorrectedStub({ validity: 'error', errors: ['review failed'] });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
      assertEquals(cache.read(filePath).status, SETFM_CACHE_STATUSES.REVIEW_FAILED);
    });

    it('[Normal] T-03-03-02: validity=error → cache.delete は呼ばれない', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      // pre-populate cache
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.FRONTMATTER, frontmatter: { title: 'kept' } });
      const deleteSpy = spy(cache, 'delete');
      const { stub } = _makeCorrectedStub({ validity: 'error', errors: [] });
      const entry = _makeEntry(filePath);
      try {
        await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);
        assertEquals(deleteSpy.calls.length, 0);
      } finally {
        deleteSpy.restore();
      }
    });
  });

  /**
   * entry.frontmatter に null / 空文字列フィールドがあるとき、キャッシュの既存値が保持されるケース。
   */
  describe('When: entry.frontmatter に null/空文字フィールドがある', () => {
    it('[Edge] T-SF-PR-10-01: entry.title が null → cache の frontmatter.title は上書きされない', async () => {
      const filePath = '/path/to/a.md';
      const cache = await _makeCache();
      await cache.write(filePath, {
        frontmatter: { title: 'cached-title' },
        status: SETFM_CACHE_STATUSES.FRONTMATTER,
      });

      const entry = _makeEntry(filePath);
      (entry.frontmatter as unknown as { set: (k: string, v: unknown) => void })
        .set('title', null);

      const { stub } = _makeReviewStub();
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);

      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });

    it('[Edge] T-SF-PR-10-02: entry.title が空文字列 → cache の frontmatter.title は上書きされない', async () => {
      const filePath = '/path/to/b.md';
      const cache = await _makeCache();
      await cache.write(filePath, {
        frontmatter: { title: 'cached-title' },
        status: SETFM_CACHE_STATUSES.FRONTMATTER,
      });

      const entry = _makeEntry(filePath);
      entry.frontmatter.set('title', '');

      const { stub } = _makeReviewStub();
      await phaseReview([entry], cache, _dics, _prompts, { concurrency: 1, dryRun: false }, stub);

      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });
  });

  /**
   * 先頭ファイルが RateLimit を throw したとき、残りのファイルのレビューが中断されるケース。
   */
  describe('When: reviewProvider が RateLimit を throw する', () => {
    it('[Error] T-04-05-01: 先頭が RateLimit → 2 番目以降の reviewProvider が呼ばれず ChatlogError を再 throw', async () => {
      const cache = await _makeCache();
      let _count = 0;
      const _rateLimitStub: _ReviewProvider = (_entry, _dics, _prompts) => {
        _count++;
        throw new ChatlogError('AiError', 'RateLimit', 'simulated rate limit');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];

      // concurrency=1 で逐次実行 → 先頭 throw で abort し 2 番目は着手されない
      const error = await assertRejects(
        () => phaseReview(entries, cache, _dics, _prompts, { concurrency: 1, dryRun: false }, _rateLimitStub),
        ChatlogError,
      );
      assertEquals(error.kind, 'AiError');
      assertEquals(_count, 1);
    });
  });

  /**
   * `needsReviewAi` 述語のユニットテスト。
   *
   * dry-run 内訳集計で「再実行時にレビュー AI を呼ぶか」を entry と cache から純粋判定する。
   * キャッシュ status が `reviewed` のときのみ AI 不要（false）。
   */
  describe('needsReviewAi', () => {
    /** status=reviewed で AI 不要な正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-04-06-01: status=reviewed → false', async () => {
        const filePath = '/path/to/a.md';
        const cache = await _makeCache();
        await cache.write(filePath, { status: SETFM_CACHE_STATUSES.REVIEWED });
        assertEquals(needsReviewAi(_makeEntry(filePath), cache), false);
      });
    });

    /** status!=reviewed で AI 必要なエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-04-06-02: status=frontmatter → true', async () => {
        const filePath = '/path/to/b.md';
        const cache = await _makeCache();
        await cache.write(filePath, { status: SETFM_CACHE_STATUSES.FRONTMATTER });
        assertEquals(needsReviewAi(_makeEntry(filePath), cache), true);
      });
    });
  });
});
