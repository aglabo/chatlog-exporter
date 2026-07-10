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
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { spy } from '@std/testing/mock';

// ─── Test target
import { phaseReview } from '../../phase-review.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
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

  /**
   * reviewProvider が throw したとき phase が継続するケース。
   */
  describe('When: reviewProvider が throw する', () => {
    it('[Normal] T-04-04-01: reviewProvider が throw しても他エントリは処理継続する', async () => {
      const cache = await _makeCache();
      const _throwingStub: _ReviewProvider = (_entry, _dics, _prompts) => {
        throw new ChatlogError('AiError', 'ExitFailure', 'simulated AI failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const warnSpy = spy(logger, 'warn');
      try {
        // Should resolve without throwing (catch inside phase)
        await phaseReview(entries, cache, _dics, _prompts, 2, false, _throwingStub);
        assertEquals(warnSpy.calls.length >= 1, true);
      } finally {
        warnSpy.restore();
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
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
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
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
      assertEquals(cache.read(filePath).type, 'tech');
      assertEquals(cache.read(filePath).category, 'ai');
    });

    it('[Edge] T-03-01-03: r.corrected に空文字フィールドがある → cache の既存値が保持される', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: 'need-review' as const,
        frontmatter: { title: 'cached-title' },
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { title: '', type: 'tech' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });

    it('[Edge] T-03-01-05: r.corrected.type が空文字 → cache.type は既存値のまま', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: 'need-review' as const,
        type: 'existing-type',
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { type: '', category: 'ai' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
      assertEquals(cache.read(filePath).type, 'existing-type');
    });

    it('[Edge] T-03-01-04: r.corrected に空配列フィールドがある → cache の既存値が保持される', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      await cache.write(filePath, {
        status: 'need-review' as const,
        frontmatter: { topics: ['existing-topic'] },
      });
      const { stub } = _makeCorrectedStub({
        validity: 'corrected',
        errors: [],
        corrected: { topics: [], type: 'tech' },
      });
      const entry = _makeEntry(filePath);
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
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
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
      assertEquals(cache.read(filePath).status, 'review-failed');
    });

    it('[Normal] T-03-03-02: validity=error → cache.delete は呼ばれない', async () => {
      const cache = await _makeCache();
      const filePath = '/path/to/a.md';
      // pre-populate cache
      await cache.write(filePath, { status: 'need-review' as const, frontmatter: { title: 'kept' } });
      const deleteSpy = spy(cache, 'delete');
      const { stub } = _makeCorrectedStub({ validity: 'error', errors: [] });
      const entry = _makeEntry(filePath);
      try {
        await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);
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
        status: 'need-review' as const,
      });

      const entry = _makeEntry(filePath);
      (entry.frontmatter as unknown as { set: (k: string, v: unknown) => void })
        .set('title', null);

      const { stub } = _makeReviewStub();
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);

      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });

    it('[Edge] T-SF-PR-10-02: entry.title が空文字列 → cache の frontmatter.title は上書きされない', async () => {
      const filePath = '/path/to/b.md';
      const cache = await _makeCache();
      await cache.write(filePath, {
        frontmatter: { title: 'cached-title' },
        status: 'need-review' as const,
      });

      const entry = _makeEntry(filePath);
      entry.frontmatter.set('title', '');

      const { stub } = _makeReviewStub();
      await phaseReview([entry], cache, _dics, _prompts, 1, false, stub);

      assertEquals(cache.read(filePath).frontmatter?.['title'], 'cached-title');
    });
  });
});
