// src: scripts/phases/__tests__/unit/phase-type-category.unit.spec.ts
// @(#): _phaseTypeAndCategory dryRun パラメータ・キャッシュステータス別 hit/miss 判定のユニットテスト
//       対象: _phaseTypeAndCategoryForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { spy } from '@std/testing/mock';

// ─── Test target
import { needsTypeCategoryAi, phaseTypeAndCategory } from '../../phase-type-category.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// constants
import { CACHE_STATUSES } from '../../../../../_scripts/types/cache-status.const.types.ts';
// types
import type { CacheStatus } from '../../../../../_scripts/types/cache-status.const.types.ts';
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  model?: string,
  signal?: AbortSignal,
) => Promise<void>;

// constants
/** テスト用ダミー辞書。AI 呼び出しのないスタブには渡されるだけで参照されない。 */
const _DICS: Dics = {
  category: 'research,development',
  categoryEntries: [],
  typeEntries: [],
  topicEntries: [],
  tags: 'lang:typescript',
};

/** テスト用ダミープロンプト。AI 呼び出しのないスタブには渡されるだけで参照されない。 */
const _PROMPTS: Prompts = {
  categoryPrompts: new Map(),
  prompts: new Map(),
};

// functions

/**
 * インメモリバッファを使った `ChatlogCache<SetfmCache>` を生成する。
 *
 * ファイルシステムに依存しない。`yaml` を渡すと初期キャッシュを設定できる。
 *
 * @param yaml - 初期キャッシュ YAML 文字列（省略時は空キャッシュ）
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
        glob: () => Promise.resolve([]),
      },
    },
  );
  await cache.ready;
  return cache;
};

/**
 * テスト用 `ChatlogEntry` を生成する（type/category なし・キャッシュ MISS 想定）。
 *
 * @param filePath - エントリのファイルパス
 * @returns 最小限のフロントマターを持つ `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => new ChatlogEntry('---\ntitle: test\n---\n# body', { filePath });

/**
 * 既存 frontmatter に type/category を持つテスト用 `ChatlogEntry` を生成する。
 *
 * `type` / `category` に空文字を渡すと当該フィールドを省略でき、片方欠けのケースを再現できる。
 *
 * @param filePath - エントリのファイルパス
 * @param type - frontmatter に設定する type 値（空文字なら省略）
 * @param category - frontmatter に設定する category 値（空文字なら省略）
 * @returns 指定した type/category を持つ `ChatlogEntry`
 */
const _makeEntryWithFrontmatter = (filePath: string, type: string, category: string): ChatlogEntry => {
  const _lines = ['---', 'title: test'];
  if (type) { _lines.push(`type: ${type}`); }
  if (category) { _lines.push(`category: ${category}`); }
  _lines.push('---', '# body');
  return new ChatlogEntry(_lines.join('\n'), { filePath });
};

/**
 * 指定ステータスで type/category をキャッシュに書き込み済みの `ChatlogCache` を返す。
 *
 * @param filePath - キャッシュエントリのファイルパス
 * @param status - キャッシュエントリのステータス
 * @returns 書き込み済みの `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCacheWithEntry = async (
  filePath: string,
  status: CacheStatus,
): Promise<ChatlogCache<SetfmCache>> => {
  const cache = await _makeCache();
  await cache.write(filePath, { type: 'cached-type', category: 'cached-cat', status });
  return cache;
};

/**
 * 呼び出し回数をカウントする judgeProvider スタブを返す。
 *
 * AI 呼び出しは行わず、entry の frontmatter に `type: stub` / `category: stub` を設定する。
 * これにより `cache.write` が呼ばれる前提条件（type/category フィールドが存在する）を満たす。
 *
 * @returns `{ stub, getCount }` — stub は _JudgeProvider 互換、getCount は呼び出し回数を返す
 */
const _makeJudgeStub = (): { stub: _JudgeProvider; getCount: () => number } => {
  let _count = 0;
  const stub: _JudgeProvider = (entry) => {
    _count++;
    entry.frontmatter.set('type', 'stub');
    entry.frontmatter.set('category', 'stub');
    return Promise.resolve();
  };
  return { stub, getCount: () => _count };
};

// ─── Tests

/**
 * `_phaseTypeAndCategory` のユニットテストスイート。
 *
 * dryRun フラグの動作、キャッシュヒット/ミスの判定、
 * および `empty` / `review-failed` ステータス時の再判定、壊れたキャッシュの再判定を検証する。
 *
 * テスト ID 範囲: T-01-01-01 〜 T-01-04-07
 *
 * @see _phaseTypeAndCategoryForTest
 */
describe('_phaseTypeAndCategory', () => {
  /**
   * dryRun=false の正常系: judgeProvider と cache.write が従来通り呼ばれる。
   */
  describe('When: 正常系 dryRun=false', () => {
    it('[Normal] T-01-01-01: entry 1件 / dryRun=false → judgeProvider が 1 回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

      assertEquals(getCount(), 1);
    });

    it('[Normal] T-01-01-02: entry 1件 / dryRun=false → cache.write が 1 回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

      assertEquals(writeSpy.calls.length >= 1, true);
      writeSpy.restore();
    });
  });

  /**
   * dryRun=true の正常系: judgeProvider も cache.write も呼ばれない。
   */
  describe('When: 正常系 dryRun=true', () => {
    it('[Normal] T-01-02-01: entry 1件 / dryRun=true → judgeProvider が 0 回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: true }, stub);

      assertEquals(getCount(), 0);
    });

    it('[Normal] T-01-02-02: entry 1件 / dryRun=true → cache.write が 0 回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: true }, stub);

      assertEquals(writeSpy.calls.length, 0);
      writeSpy.restore();
    });
  });

  /**
   * エッジケース: entries=[] のとき dryRun に関わらずエラーなく完了する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-01-03-01: entries=[] / dryRun=true → エラーなく完了・judgeProvider 0 回', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeJudgeStub();

      await phaseTypeAndCategory([], cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: true }, stub);

      assertEquals(getCount(), 0);
    });
  });

  /**
   * キャッシュステータスによる hit/miss 判定のテスト。
   *
   * `review-failed` はキャッシュに type/category があっても再判定する。
   * それ以外のステータス（例: `set-types`）はキャッシュ値を適用してスキップする。
   */
  describe('キャッシュステータスによる hit/miss 判定', () => {
    /** review-failed: type/category があっても再判定が必要なケース。 */
    describe('When: 異常系', () => {
      it(
        '[Error] T-01-04-01: status=review-failed + type/category あり → judgeProvider が 1 回呼ばれる',
        async () => {
          const filePath = '/path/to/a.md';
          const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.REVIEW_FAILED);
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry(filePath)];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );
    });

    /** type/category があり、status が review-failed 以外: キャッシュ値を適用してスキップ。 */
    describe('When: 正常系', () => {
      it(
        '[Normal] T-01-04-02: status=set-types + type/category あり → judgeProvider が 0 回呼ばれる',
        async () => {
          const filePath = '/path/to/b.md';
          const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.SET_TYPES);
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry(filePath)];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 0);
        },
      );

      it(
        '[Normal] T-01-04-03: status=set-types + type/category あり → frontmatter にキャッシュ値が適用される',
        async () => {
          const filePath = '/path/to/b.md';
          const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.SET_TYPES);
          const { stub } = _makeJudgeStub();
          const entry = _makeEntry(filePath);

          await phaseTypeAndCategory([entry], cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(entry.frontmatter.get('type'), 'cached-type');
          assertEquals(entry.frontmatter.get('category'), 'cached-cat');
        },
      );
    });

    /** type/category がない: status 問わず再判定。 */
    describe('When: エッジケース', () => {
      it(
        '[Edge] T-01-04-04: type/category なし（status 問わず）→ judgeProvider が 1 回呼ばれる',
        async () => {
          const cache = await _makeCache();
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry('/path/to/c.md')];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );

      it(
        '[Edge] T-01-04-05: status=empty + type/category あり（壊れたキャッシュ）→ judgeProvider が 1 回呼ばれる',
        async () => {
          const filePath = '/path/to/broken.md';
          const cache = await _makeCache();
          // EMPTY ステータスだが type/category が存在する壊れたキャッシュを直接書き込む
          await cache.write(filePath, { type: 'some-type', category: 'some-cat', status: CACHE_STATUSES.EMPTY });
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry(filePath)];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );

      it(
        '[Edge] T-01-04-07: status=undefined（キャッシュミス）+ type/category あり → judgeProvider が 1 回呼ばれる（_needsReJudge の明示的 undefined 条件）',
        async () => {
          const filePath = '/path/to/undefined-status.md';
          // status フィールドを持たないキャッシュエントリ（status=undefined）
          // cache.write は常に status を付与するため、直接インメモリバッファを経由して
          // status なしのエントリを再現するには _makeCache のバッファに JSON を書き込む。
          // ここでは status=undefined ≒ cache miss（_makeCache でキャッシュヒットしない）状態で
          // type/category だけ持たせる別キャッシュを使う。
          const buf = new Map<string, string>();
          buf.set(filePath + '.json', JSON.stringify({ type: 'some-type', category: 'some-cat' }));
          const cacheWithNoStatus = new ChatlogCache<SetfmCache>(
            'fm-cache',
            '/fake/cache',
            undefined,
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
                glob: () => Promise.resolve([]),
              },
            },
          );
          await cacheWithNoStatus.ready;
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry(filePath)];

          await phaseTypeAndCategory(entries, cacheWithNoStatus, 1000, _DICS, _PROMPTS, {
            concurrency: 1,
            dryRun: false,
          }, stub);

          assertEquals(getCount(), 1);
        },
      );

      it(
        '[Edge] T-01-04-06: status=set-types + category なし（片方欠け）→ judgeProvider が 1 回呼ばれる',
        async () => {
          const filePath = '/path/to/partial.md';
          const cache = await _makeCache();
          // set-types ステータスだが category が欠けた壊れたキャッシュ
          await cache.write(filePath, { type: 'some-type', category: '', status: CACHE_STATUSES.SET_TYPES });
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntry(filePath)];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );
    });
  });

  /**
   * 先頭ファイルが RateLimit を throw したとき、残りのファイルの判定が中断されるケース。
   */
  describe('When: judgeProvider が RateLimit を throw する', () => {
    it('[Error] T-01-05-01: 先頭が RateLimit → 2 番目以降の judgeProvider が呼ばれず ChatlogError を再 throw', async () => {
      const cache = await _makeCache();
      let _count = 0;
      const _rateLimitStub: _JudgeProvider = (_entry, _maxLen, _dics, _prompts) => {
        _count++;
        throw new ChatlogError('AiError', 'RateLimit', 'simulated rate limit');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];

      // concurrency=1 で逐次実行 → 先頭 throw で abort し 2 番目は着手されない
      const error = await assertRejects(
        () =>
          phaseTypeAndCategory(
            entries,
            cache,
            1000,
            _DICS,
            _PROMPTS,
            { concurrency: 1, dryRun: false },
            _rateLimitStub,
          ),
        ChatlogError,
      );
      assertEquals(error.kind, 'AiError');
      assertEquals(_count, 1);
    });
  });

  /**
   * worker が `runConcurrent` の `ctl.signal` を judgeProvider へ転送するケース。
   *
   * この転送があることで、兄弟ファイルが RateLimit で abort したとき in-flight の judge が signal を受け取れる。
   */
  describe('When: signal 転送', () => {
    it('[Normal] T-01-06-01: judgeProvider に AbortSignal が転送される', async () => {
      const cache = await _makeCache();
      let _captured: AbortSignal | undefined;
      const _captureStub: _JudgeProvider = (entry, _maxLen, _dics, _prompts, _model, signal) => {
        _captured = signal;
        entry.frontmatter.set('type', 'stub');
        entry.frontmatter.set('category', 'stub');
        return Promise.resolve();
      };
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseTypeAndCategory(
        entries,
        cache,
        1000,
        _DICS,
        _PROMPTS,
        { concurrency: 1, dryRun: false },
        _captureStub,
      );

      assert(_captured instanceof AbortSignal, 'signal was not forwarded to judgeProvider');
    });
  });

  /**
   * キャッシュミス時に entry の既存 type/category を尊重するテスト。
   *
   * 既存 frontmatter に type/category が両方あれば AI 判定（judgeProvider）をスキップし、
   * 既存値を SET_TYPES ステータスでキャッシュに書き込む。片方でも欠けていれば従来どおり再判定する。
   */
  /**
   * `needsTypeCategoryAi` 述語のユニットテスト。
   *
   * dry-run 内訳集計で「再実行時に type/category を AI 判定するか」を entry と cache から純粋判定する。
   * `_needsReJudge` と同一の判定ロジックを外部公開する。
   */
  describe('needsTypeCategoryAi', () => {
    /** キャッシュに type/category が有効に揃っており AI 不要な正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-08-01: status=set-types + type/category あり → false', async () => {
        const filePath = '/path/to/ok.md';
        const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.SET_TYPES);
        assertEquals(needsTypeCategoryAi(_makeEntry(filePath), cache), false);
      });
    });

    /** キャッシュミス・再判定ステータスで AI 必要な異常系/エッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-01-08-02: cache miss（status undefined）→ true', async () => {
        const cache = await _makeCache();
        assertEquals(needsTypeCategoryAi(_makeEntry('/path/to/miss.md'), cache), true);
      });

      it('[Edge] T-01-08-03: status=review-failed + type/category あり → true', async () => {
        const filePath = '/path/to/rf.md';
        const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.REVIEW_FAILED);
        assertEquals(needsTypeCategoryAi(_makeEntry(filePath), cache), true);
      });
    });
  });

  describe('既存 type/category による AI スキップ', () => {
    /** 既存 type/category が両方そろっており AI をスキップする正常系。 */
    describe('When: 正常系', () => {
      it(
        '[Normal] T-01-07-01: cache miss + 既存 type/category あり → judgeProvider が 0 回呼ばれる',
        async () => {
          const filePath = '/path/to/existing.md';
          const cache = await _makeCache();
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntryWithFrontmatter(filePath, 'existing-type', 'existing-cat')];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 0);
        },
      );

      it(
        '[Normal] T-01-07-02: cache miss + 既存 type/category あり → キャッシュに既存値と SET_TYPES が書かれる',
        async () => {
          const filePath = '/path/to/existing.md';
          const cache = await _makeCache();
          const { stub } = _makeJudgeStub();
          const entries = [_makeEntryWithFrontmatter(filePath, 'existing-type', 'existing-cat')];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          const _cached = cache.read(filePath);
          assertEquals(_cached.type, 'existing-type');
          assertEquals(_cached.category, 'existing-cat');
          assertEquals(_cached.status, CACHE_STATUSES.SET_TYPES);
        },
      );
    });

    /** 既存 type/category が片方欠けており従来どおり再判定する回帰確認。 */
    describe('When: エッジケース', () => {
      it(
        '[Edge] T-01-07-03: cache miss + category なし（片方欠け）→ judgeProvider が 1 回呼ばれる',
        async () => {
          const filePath = '/path/to/partial-existing.md';
          const cache = await _makeCache();
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntryWithFrontmatter(filePath, 'existing-type', '')];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );

      it(
        '[Edge] T-01-07-04: status=review-failed + 既存 type/category あり → judgeProvider が 1 回呼ばれる（AI 再判定）',
        async () => {
          const filePath = '/path/to/review-failed-existing.md';
          const cache = await _makeCacheWithEntry(filePath, CACHE_STATUSES.REVIEW_FAILED);
          const { stub, getCount } = _makeJudgeStub();
          const entries = [_makeEntryWithFrontmatter(filePath, 'existing-type', 'existing-cat')];

          await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, { concurrency: 1, dryRun: false }, stub);

          assertEquals(getCount(), 1);
        },
      );
    });
  });
});
