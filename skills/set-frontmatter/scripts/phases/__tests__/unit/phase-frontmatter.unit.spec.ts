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
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { spy } from '@std/testing/mock';

// ─── Test target
import { phaseFrontmatter } from '../../phase-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogWorks } from '../../../../../_scripts/classes/ChatlogWorks.class.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
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
 * テスト用 `ChatlogEntry` を生成する（フロントマターフィールドなし）。
 *
 * @param filePath - エントリのファイルパス
 * @returns 指定されたパスを持つ最小 `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  return new ChatlogEntry('# body', { filePath });
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

// ─── Tests

/**
 * `phaseFrontmatter` の dryRun パラメータに関するユニットテストスイート。
 *
 * `_needsGenerate` パス（キャッシュミス・フロントマターフィールドなし）における
 * generateProvider と cache.write の呼び出し回数を検証する。
 *
 * テスト ID 範囲: T-02-01 〜 T-02-03
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

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 1, false, stub);

      assertEquals(getCount(), 1);
    });

    /** 正常系: cache.write が呼ばれる。 */
    it('[Normal] T-02-01-02: dryRun=false → cache.write 1回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const cacheSpy = spy(cache, 'write');
      const { stub } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 1, false, stub);

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

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 1, true, stub);

      assertEquals(getCount(), 0);
    });

    /** 正常系: cache.write が呼ばれない。 */
    it('[Normal] T-02-02-02: dryRun=true → cache.write 0回', async () => {
      const cache = await _makeCache();
      const cacheSpy = spy(cache, 'write');
      const { stub } = _makeGenerateStub(true);
      const entries = [_makeEntry('/path/to/a.md')];

      await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 1, true, stub);

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

      await phaseFrontmatter([], cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 1, true, generateStub);

      assertEquals(cacheSpy.calls.length, 0);
      cacheSpy.restore();
    });
  });

  /**
   * generateProvider が throw したとき phase が継続するケース。
   */
  describe('When: generateProvider が throw する', () => {
    it('[Normal] T-02-04-01: generateProvider が throw しても他エントリは処理継続し warn ログが出る', async () => {
      const cache = await _makeCache();
      const _throwingStub: _GenerateProvider = (_entry, _maxLen, _dics, _prompts) => {
        throw new ChatlogError('AiError', 'ExitFailure', 'simulated AI failure');
      };
      const entries = [_makeEntry('/path/to/a.md'), _makeEntry('/path/to/b.md')];
      const warnSpy = spy(logger, 'warn');
      const cacheSpy = spy(cache, 'write');
      try {
        await phaseFrontmatter(entries, cache, 1000, _FAKE_DICS, _FAKE_PROMPTS, 2, false, _throwingStub);
        // Both entries fail (throw → catch in phase), no cache write happens
        assertEquals(cacheSpy.calls.length, 0);
        // logger.warn was called at least once (for each failing entry)
        assertEquals(warnSpy.calls.length >= 1, true);
      } finally {
        warnSpy.restore();
        cacheSpy.restore();
      }
    });
  });
});
