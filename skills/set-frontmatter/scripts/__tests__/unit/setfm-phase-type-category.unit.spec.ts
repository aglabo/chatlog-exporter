// src: scripts/__tests__/unit/setfm-phase-type-category.unit.spec.ts
// @(#): _phaseTypeAndCategory dryRun パラメータのユニットテスト
//       対象: _phaseTypeAndCategoryForTest
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
import { _phaseTypeAndCategoryForTest as phaseTypeAndCategory } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { Dics, Prompts } from '../../types/dics.types.ts';

// ─── Internal Helpers

// types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
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
 * インメモリバッファを使った `ChatlogWorks<SetfmCache>` を生成する。
 *
 * ファイルシステムに依存しない。`yaml` を渡すと初期キャッシュを設定できる。
 *
 * @param yaml - 初期キャッシュ YAML 文字列（省略時は空キャッシュ）
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
 * `_phaseTypeAndCategory` の dryRun パラメータに関するユニットテストスイート。
 *
 * dryRun=false の場合は judgeProvider と cache.write が呼ばれ、
 * dryRun=true の場合はどちらも呼ばれないことを検証する。
 *
 * テスト ID 範囲: T-01-01-01 〜 T-01-03-01
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

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, 1, false, stub);

      assertEquals(getCount(), 1);
    });

    it('[Normal] T-01-01-02: entry 1件 / dryRun=false → cache.write が 1 回以上呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, 1, false, stub);

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

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, 1, true, stub);

      assertEquals(getCount(), 0);
    });

    it('[Normal] T-01-02-02: entry 1件 / dryRun=true → cache.write が 0 回呼ばれる', async () => {
      const cache = await _makeCache();
      const { stub } = _makeJudgeStub();
      const entries = [_makeEntry('/path/to/a.md')];
      const writeSpy = spy(cache, 'write');

      await phaseTypeAndCategory(entries, cache, 1000, _DICS, _PROMPTS, 1, true, stub);

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

      await phaseTypeAndCategory([], cache, 1000, _DICS, _PROMPTS, 1, true, stub);

      assertEquals(getCount(), 0);
    });
  });
});
