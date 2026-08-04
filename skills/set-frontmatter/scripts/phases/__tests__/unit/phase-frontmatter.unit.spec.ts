// src: scripts/phases/__tests__/unit/phase-frontmatter.unit.spec.ts
// @(#): _phaseFrontmatter の dryRun ユニットテスト
//       対象: phaseFrontmatter
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
import { needsFrontmatterAi, phaseFrontmatter } from '../../phase-frontmatter.ts';

// ─── Helpers
import { stringify } from '@std/yaml';
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// types
type _GenerateProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
) => Promise<boolean>;

// constants
const _FAKE_DICS = {} as Dics;
const _FAKE_PROMPTS = {} as Prompts;

// functions

/**
 * インメモリバッファを使ったキャッシュを返す。
 * yaml を指定した場合は YAML で初期化する。省略時はキャッシュミス状態。
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
 * テスト用 `ChatlogEntry` を生成する（フロントマターフィールドなし）。
 *
 * @param filePath - エントリのファイルパス
 * @returns 指定されたパスを持つ最小 `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  return new ChatlogEntry('# body', { filePath });
};

/**
 * `hasRequiredFields()` を満たす全5フィールド入り frontmatter を持つテスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス
 * @returns type/category/title/topics/tags を持つ `ChatlogEntry`
 */
const _makeFilledEntry = (filePath: string): ChatlogEntry => {
  const _md = [
    '---',
    'type: tech',
    'category: backend',
    'title: Filled',
    'topics:',
    '  - topic-a',
    'tags:',
    '  - tag-a',
    '---',
    '# body',
  ].join('\n');
  return new ChatlogEntry(_md, { filePath });
};

/**
 * 呼び出し回数をカウントするスタブ generateProvider を返す。
 *
 * @param returns - スタブが返す値（デフォルト true）
 * @returns `{ stub, getCount }` — stub は _GenerateProvider 互換の非同期関数、getCount は呼び出し回数を返す
 */
const _makeGenerateStub = (returns = true): { stub: _GenerateProvider; getCount: () => number } => {
  let _count = 0;
  const stub: _GenerateProvider = (
    _entry: ChatlogEntry,
    _maxLen: number,
    _dics: Dics,
    _prompts: Prompts,
  ): Promise<boolean> => {
    _count++;
    return Promise.resolve(returns);
  };
  return { stub, getCount: () => _count };
};

/** `hasRequiredFields()` を満たす全5フィールド（type/category/title/topics/tags）の frontmatter。 */
const _FULL_FRONTMATTER = {
  type: 'tech',
  category: 'backend',
  title: 'Cached Title',
  topics: ['topic-a'],
  tags: ['tag-a'],
} as const;

/**
 * 単一エントリ（basename=`a`）のキャッシュを指定 status・frontmatter で初期化した YAML を返す。
 *
 * `ChatlogCache` は basename をキーに使うため、`/path/to/a.md` は `a` に対応する。
 *
 * @param status - キャッシュエントリの status 値（例: `'frontmatter'` / `'type-category'`）
 * @param withFrontmatter - true のとき全5フィールドの frontmatter を含める
 * @returns `_makeCache` に渡す YAML 文字列
 */
const _cacheYaml = (status: string, withFrontmatter: boolean): string => {
  const _entry: Record<string, unknown> = { status };
  if (withFrontmatter) { _entry.frontmatter = { ..._FULL_FRONTMATTER }; }
  return stringify({ a: _entry });
};

// ─── Tests

/**
 * `phaseFrontmatter` のユニットテストスイート。
 *
 * `_needsGenerate` パス（キャッシュミス・フロントマターフィールドなし）における
 * generateProvider と cache.write の呼び出し回数、および
 * キャッシュヒット判定（`_isGenerated`）による生成スキップ・frontmatter 復元を検証する。
 *
 * テスト ID 範囲: T-02-01 〜 T-02-06
 *
 * @see phaseFrontmatter
 */
describe('_phaseFrontmatter', () => {
  /**
   * dryRun=false の場合、生成・キャッシュ書き込みが実行される正常系ケース。
   */
  describe('When: dryRun=false', () => {
    /** 正常系: generateProvider が呼ばれる。 */
    it('[Normal] T-02-01-01: dryRun=false → generateProvider 1回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, { concurrency: 1, dryRun: false }, stub);

      assertEquals(getCount(), 1);
    });

    /** 正常系: cache.write が呼ばれる。 */
    it('[Normal] T-02-01-02: dryRun=false → cache.write 1回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const cacheSpy = spy(cache, 'write');
      const { stub } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, { concurrency: 1, dryRun: false }, stub);

      assertEquals(cacheSpy.calls.length >= 1, true);
      cacheSpy.restore();
    });
  });

  /**
   * dryRun=true の場合、生成・キャッシュ書き込みがスキップされるケース。
   */
  describe('When: dryRun=true', () => {
    /** 正常系: generateProvider が呼ばれない。 */
    it('[Normal] T-02-02-01: dryRun=true → generateProvider 0回', async () => {
      const cache = await _makeCache();
      const { stub, getCount } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, { concurrency: 1, dryRun: true }, stub);

      assertEquals(getCount(), 0);
    });

    /** 正常系: cache.write が呼ばれない。 */
    it('[Normal] T-02-02-02: dryRun=true → cache.write 0回', async () => {
      const cache = await _makeCache();
      const cacheSpy = spy(cache, 'write');
      const { stub } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, { concurrency: 1, dryRun: true }, stub);

      assertEquals(cacheSpy.calls.length, 0);
      cacheSpy.restore();
    });
  });

  /**
   * エッジケース: entries が空の場合。
   */
  describe('When: エッジケース', () => {
    /** エッジケース: entries=[] → cache.write が呼ばれない。 */
    it('[Edge] T-02-03-01: entries=[] / dryRun=true → cache.write 0回', async () => {
      const cache = await _makeCache();
      const cacheSpy = spy(cache, 'write');
      const { stub: generateStub } = _makeGenerateStub(true);

      await phaseFrontmatter(
        [],
        cache,
        1000,
        _FAKE_DICS,
        _FAKE_PROMPTS,
        { concurrency: 1, dryRun: true },
        generateStub,
      );

      assertEquals(cacheSpy.calls.length, 0);
      cacheSpy.restore();
    });
  });

  /**
   * generateProvider が RateLimit 以外のエラー（非 AiError / AiError/ExitFailure）を throw したとき
   * phase が abort せず継続し `logger.error` にログを出すケース。
   *
   * RateLimit のみバッチを abort する（別ケース T-02-05-01 で検証）。
   * 非 RateLimit のエラーは握りつぶして他エントリの処理を継続する。
   */
  describe('When: generateProvider が非 RateLimit エラーを throw する', () => {
    it('[Normal] T-02-04-01: generateProvider が非 AiError を throw → abort せず他エントリ継続・error ログが出る', async () => {
      const cache = await _makeCache();
      const _throwingStub: _GenerateProvider = (_entry, _maxLen, _dics, _prompts) => {
        throw new Error('simulated non-fatal failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const errorSpy = spy(logger, 'error');
      const cacheSpy = spy(cache, 'write');
      try {
        await phaseFrontmatter(
          entries,
          cache,
          1000,
          _FAKE_DICS,
          _FAKE_PROMPTS,
          { concurrency: 2, dryRun: false },
          _throwingStub,
        );
        // Both entries fail (throw → catch in phase), no cache write happens
        assertEquals(cacheSpy.calls.length, 0);
        // logger.error was called at least once (for each failing entry)
        assertEquals(errorSpy.calls.length >= 1, true);
      } finally {
        errorSpy.restore();
        cacheSpy.restore();
      }
    });

    it('[Error] T-02-04-02: generateProvider が AiError/ExitFailure を throw → 再 throw せず継続・error ログが出る', async () => {
      const cache = await _makeCache();
      const _throwingStub: _GenerateProvider = (_entry, _maxLen, _dics, _prompts) => {
        throw new ChatlogError('AiError', 'ExitFailure', 'simulated exit failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const errorSpy = spy(logger, 'error');
      try {
        // ExitFailure は再 throw せず resolve する
        await phaseFrontmatter(
          entries,
          cache,
          1000,
          _FAKE_DICS,
          _FAKE_PROMPTS,
          { concurrency: 1, dryRun: false },
          _throwingStub,
        );
        assertEquals(errorSpy.calls.some((c) => String(c.args[0]).includes('生成失敗')), true);
      } finally {
        errorSpy.restore();
      }
    });
  });

  /**
   * 先頭ファイルが RateLimit を throw したとき、残りのファイルの生成が中断されるケース。
   */
  describe('When: generateProvider が RateLimit を throw する', () => {
    it('[Error] T-02-05-01: 先頭が RateLimit → 2 番目以降の generateProvider が呼ばれず ChatlogError を再 throw', async () => {
      const cache = await _makeCache();
      let _count = 0;
      const _rateLimitStub: _GenerateProvider = (_entry, _maxLen, _dics, _prompts) => {
        _count++;
        throw new ChatlogError('AiError', 'RateLimit', 'simulated rate limit');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];

      // concurrency=1 で逐次実行 → 先頭 throw で abort し 2 番目は着手されない
      const error = await assertRejects(
        () =>
          phaseFrontmatter(
            entries,
            cache,
            1000,
            _FAKE_DICS,
            _FAKE_PROMPTS,
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
   * キャッシュヒット判定（`_isGenerated`）に関するテスト。
   *
   * status=`frontmatter`（frontmatter 保存済みの中間状態）および status=`type-category` の
   * キャッシュがヒット扱いされ、AI 再生成をスキップして frontmatter が復元されることを検証する。
   */
  describe('キャッシュヒット判定（_isGenerated）', () => {
    /** frontmatter を保持したキャッシュがヒット扱いされ、生成がスキップされる正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-02-06-01: status=frontmatter + frontmatter あり → generateProvider 0回・frontmatter 復元', async () => {
        const cache = await _makeCache(_cacheYaml(SETFM_CACHE_STATUSES.FRONTMATTER, true));
        const { stub, getCount } = _makeGenerateStub(true);
        const entry = _makeEntry('/path/to/a.md');

        await phaseFrontmatter(
          [entry],
          cache,
          1000,
          _FAKE_DICS,
          _FAKE_PROMPTS,
          { concurrency: 1, dryRun: false },
          stub,
        );

        assertEquals(getCount(), 0);
        assertEquals(entry.frontmatter.hasRequiredFields(), true);
        assertEquals(entry.frontmatter.get('title'), _FULL_FRONTMATTER.title);
      });

      it('[Normal] T-02-06-03: status=type-category + frontmatter あり → generateProvider 0回', async () => {
        const cache = await _makeCache(_cacheYaml(SETFM_CACHE_STATUSES.TYPE_CATEGORY, true));
        const { stub, getCount } = _makeGenerateStub(true);
        const entry = _makeEntry('/path/to/a.md');

        await phaseFrontmatter(
          [entry],
          cache,
          1000,
          _FAKE_DICS,
          _FAKE_PROMPTS,
          { concurrency: 1, dryRun: false },
          stub,
        );

        assertEquals(getCount(), 0);
        assertEquals(entry.frontmatter.hasRequiredFields(), true);
      });
    });

    /** frontmatter が保存されていない frontmatter はヒット扱いされず生成経路へ入る境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-02-06-02: status=frontmatter + frontmatter なし → generateProvider が呼ばれる', async () => {
        const cache = await _makeCache(_cacheYaml(SETFM_CACHE_STATUSES.FRONTMATTER, false));
        const { stub, getCount } = _makeGenerateStub(true);
        const entry = _makeEntry('/path/to/a.md');

        await phaseFrontmatter(
          [entry],
          cache,
          1000,
          _FAKE_DICS,
          _FAKE_PROMPTS,
          { concurrency: 1, dryRun: false },
          stub,
        );

        assertEquals(getCount(), 1);
      });
    });
  });

  /**
   * `needsFrontmatterAi` 述語のユニットテスト。
   *
   * dry-run 内訳集計で「再実行時にフロントマターを AI 生成するか」を entry と cache から純粋判定する。
   * キャッシュが生成済み（`_isGenerated`）または entry に必須フィールドが既記入なら AI 不要（false）。
   */
  describe('needsFrontmatterAi', () => {
    /** キャッシュ生成済み・entry 既記入で AI 不要な正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-02-07-01: status=frontmatter + frontmatter あり（生成済み）→ false', async () => {
        const cache = await _makeCache(_cacheYaml(SETFM_CACHE_STATUSES.FRONTMATTER, true));
        assertEquals(needsFrontmatterAi(_makeEntry('/path/to/a.md'), cache), false);
      });

      it('[Normal] T-02-07-02: cache miss + entry に必須フィールド既記入 → false', async () => {
        const cache = await _makeCache();
        assertEquals(needsFrontmatterAi(_makeFilledEntry('/path/to/a.md'), cache), false);
      });
    });

    /** キャッシュ未生成かつ entry 未記入で AI 必要なエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-02-07-03: cache miss + entry フィールドなし → true', async () => {
        const cache = await _makeCache();
        assertEquals(needsFrontmatterAi(_makeEntry('/path/to/a.md'), cache), true);
      });
    });
  });
});
