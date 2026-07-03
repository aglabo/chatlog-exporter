// src: scripts/__tests__/unit/setfm-phase-write.unit.spec.ts
// @(#): _phaseWrite および _filterWriteEntries のユニットテスト
//       対象: _phaseWriteForTest, _filterWriteEntriesForTest
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
import {
  _filterWriteEntriesForTest as filterWriteEntries,
  _phaseWriteForTest as phaseWrite,
} from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { Stats } from '../../types/phase.types.ts';

// ─── Internal Helpers

// types
type _WriteProvider = (
  entry: ChatlogEntry,
  cache: ChatlogWorks<SetfmCache>,
  outputDir: string,
  inputDir: string,
  dryRun: boolean,
) => Promise<boolean>;

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
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス
 * @returns 指定されたパスを持つ最小 `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  return new ChatlogEntry('# body', { filePath });
};

/**
 * 呼び出し回数をカウントするスタブ writeProvider を返す（常に true を返す）。
 *
 * @returns `{ stub, getCount }` — stub は _WriteProvider 互換の非同期関数、getCount は呼び出し回数を返す
 */
const _makeWriteStub = (): { stub: _WriteProvider; getCount: () => number } => {
  let _count = 0;
  const stub = (
    _entry: ChatlogEntry,
    _cache: ChatlogWorks<SetfmCache>,
    _outputDir: string,
    _inputDir: string,
    _dryRun: boolean,
  ): Promise<boolean> => {
    _count++;
    return Promise.resolve(true);
  };
  const getCount = () => _count;
  return { stub, getCount };
};

/**
 * 指定した件数だけ false を返し、その後は true を返すスタブ writeProvider を返す。
 *
 * @param failCount - false を返す回数（先頭 N 回）
 * @returns `{ stub }` — stub は _WriteProvider 互換の非同期関数
 */
const _makeWriteStubWithFails = (failCount: number): { stub: _WriteProvider } => {
  let _callCount = 0;
  const stub = (
    _entry: ChatlogEntry,
    _cache: ChatlogWorks<SetfmCache>,
    _outputDir: string,
    _inputDir: string,
    _dryRun: boolean,
  ): Promise<boolean> => {
    _callCount++;
    return Promise.resolve(_callCount > failCount);
  };
  return { stub };
};

/** テスト用デフォルト Stats オブジェクト。 */
const _makeStats = (): Stats => ({ total: 0, success: 0, fail: 0, skip: 0, written: 0 });

// ─── Tests

/**
 * `_phaseWrite` のユニットテストスイート。
 *
 * フィルタリングは呼び出し元の責務となったため、渡されたエントリを
 * すべて writeProvider に渡すことを検証する。
 * stats の success/fail カウントも検証する。
 *
 * テスト ID 範囲: T-SF-PW-01, T-SF-PW-03, T-SF-PW-04, T-SF-PW-05
 *
 * @see _phaseWriteForTest
 */
describe('_phaseWrite', () => {
  /** 正常系: 渡された全エントリが writeProvider に渡される。 */
  it('[Normal] T-SF-PW-01-01: entries 3件渡す → writeProvider 3回呼ばれる', async () => {
    const cache = await _makeCache();
    const { stub, getCount } = _makeWriteStub();
    const entries = [
      _makeEntry('/path/to/a.md'),
      _makeEntry('/path/to/b.md'),
      _makeEntry('/path/to/c.md'),
    ];

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: false },
      _makeStats(),
      stub,
    );

    assertEquals(getCount(), 3);
  });

  /** 正常系: 全エントリ成功 → stats.success がエントリ数と等しい。 */
  it('[Normal] T-SF-PW-04-01: 全エントリが true を返す → stats.success === entries.length', async () => {
    const cache = await _makeCache();
    const { stub } = _makeWriteStub();
    const entries = [
      _makeEntry('/path/to/a.md'),
      _makeEntry('/path/to/b.md'),
      _makeEntry('/path/to/c.md'),
    ];
    const stats = _makeStats();

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: false },
      stats,
      stub,
    );

    assertEquals(stats.success, 3);
    assertEquals(stats.fail, 0);
  });

  /** 正常系: 一部のエントリが false → stats.fail が増加する。 */
  it('[Normal] T-SF-PW-05-01: 先頭 2件が false を返す → stats.fail === 2, stats.success === 1', async () => {
    const cache = await _makeCache();
    const { stub } = _makeWriteStubWithFails(2);
    const entries = [
      _makeEntry('/path/to/a.md'),
      _makeEntry('/path/to/b.md'),
      _makeEntry('/path/to/c.md'),
    ];
    const stats = _makeStats();

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: false },
      stats,
      stub,
    );

    assertEquals(stats.fail, 2);
    assertEquals(stats.success, 1);
  });

  /** エッジケース: 空のエントリ配列では writeProvider は呼ばれない。 */
  it('[Edge] T-SF-PW-03-01: entries=[] → 0回', async () => {
    const cache = await _makeCache();
    const { stub, getCount } = _makeWriteStub();

    await phaseWrite(
      [],
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: false },
      _makeStats(),
      stub,
    );

    assertEquals(getCount(), 0);
  });

  /** エッジケース: entries=[] のとき stats は変化しない。 */
  it('[Edge] T-SF-PW-03-02: entries=[] → stats.success === 0, stats.fail === 0', async () => {
    const cache = await _makeCache();
    const { stub } = _makeWriteStub();
    const stats = _makeStats();

    await phaseWrite(
      [],
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: false },
      stats,
      stub,
    );

    assertEquals(stats.success, 0);
    assertEquals(stats.fail, 0);
  });
});

/**
 * `_filterWriteEntries` のユニットテストスイート。
 *
 * `reviewOnly=false` のとき reviewed と need-review を返し、
 * `reviewOnly=true` のとき reviewed のみを返すことを検証する。
 * written および status 未設定のエントリは常に除外される。
 *
 * テスト ID 範囲: T-SF-FW-01 〜 T-SF-FW-04
 *
 * @see _filterWriteEntriesForTest
 */
describe('_filterWriteEntries', () => {
  /** 正常系: reviewOnly=false では reviewed と need-review が両方含まれる。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FW-01-01: reviewOnly=false, mixed statuses → need-review のみ', async () => {
      const yaml = 'a:\n  status: reviewed\nb:\n  status: need-review\nc:\n  status: written\n';
      const cache = await _makeCache(yaml);
      const entries = [
        _makeEntry('/path/to/a.md'),
        _makeEntry('/path/to/b.md'),
        _makeEntry('/path/to/c.md'),
      ];

      const result = filterWriteEntries(entries, cache, false);

      assertEquals(result.length, 1);
      assertEquals(result.map((e) => e.filePath), ['/path/to/b.md']);
    });

    it('[Normal] T-SF-FW-02-01: reviewOnly=true, mixed statuses → reviewed のみ', async () => {
      const yaml = 'a:\n  status: reviewed\nb:\n  status: need-review\nc:\n  status: reviewed\n';
      const cache = await _makeCache(yaml);
      const entries = [
        _makeEntry('/path/to/a.md'),
        _makeEntry('/path/to/b.md'),
        _makeEntry('/path/to/c.md'),
      ];

      const result = filterWriteEntries(entries, cache, true);

      assertEquals(result.length, 2);
      assertEquals(result.map((e) => e.filePath), ['/path/to/a.md', '/path/to/c.md']);
    });
  });

  /** エッジケース: written および status 未設定のエントリは除外される。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-FW-03-01: status=written → 除外される、status=reviewed も除外される (reviewOnly=false)', async () => {
      const yaml = 'a:\n  status: written\nb:\n  status: reviewed\nc:\n  status: need-review\n';
      const cache = await _makeCache(yaml);
      const entries = [
        _makeEntry('/path/to/a.md'),
        _makeEntry('/path/to/b.md'),
        _makeEntry('/path/to/c.md'),
      ];

      const result = filterWriteEntries(entries, cache, false);

      assertEquals(result.length, 1);
      assertEquals(result[0].filePath, '/path/to/c.md');
    });

    it('[Edge] T-SF-FW-04-01: status=undefined → 除外される', async () => {
      const yaml = 'a:\n  type: chat\nb:\n  status: need-review\n';
      const cache = await _makeCache(yaml);
      const entries = [
        _makeEntry('/path/to/a.md'),
        _makeEntry('/path/to/b.md'),
      ];

      const result = filterWriteEntries(entries, cache, false);

      assertEquals(result.length, 1);
      assertEquals(result[0].filePath, '/path/to/b.md');
    });
  });
});
