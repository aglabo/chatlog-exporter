// src: scripts/phases/__tests__/unit/phase-write.unit.spec.ts
// @(#): phaseWrite のユニットテスト
//       対象: phaseWrite
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { phaseWrite } from '../../phase-write.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';

import type { SetfmCache } from '../../../types/cache.types.ts';
import type { Stats } from '../../../types/phase.types.ts';

// ─── Internal Helpers

// types
type _WriteProvider = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
  outputDir: string,
  inputDir: string,
) => Promise<boolean>;

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
    _cache: ChatlogCache<SetfmCache>,
    _outputDir: string,
    _inputDir: string,
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
    _cache: ChatlogCache<SetfmCache>,
    _outputDir: string,
    _inputDir: string,
  ): Promise<boolean> => {
    _callCount++;
    return Promise.resolve(_callCount > failCount);
  };
  return { stub };
};

/** テスト用デフォルト Stats オブジェクト。 */
const _makeStats = (): Stats => ({ total: 0, success: 0, fail: 0, skip: 0, written: 0 });

/**
 * 6フィールドを持つキャッシュエントリを書き込んだキャッシュを返す。
 *
 * @param filePath - キャッシュのキー（エントリのファイルパス）
 * @returns 指定パスに6フィールドが書き込まれた `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCacheWithEntry = async (filePath: string): Promise<ChatlogCache<SetfmCache>> => {
  const cache = await _makeCache();
  await cache.write(filePath, {
    type: 'tech',
    category: 'backend',
    frontmatter: {
      title: 'Test Title',
      topics: ['topic-a'],
      tags: ['tag1'],
    },
  });
  return cache;
};

// ─── Tests

/**
 * `phaseWrite` のユニットテストスイート。
 *
 * フィルタリングは呼び出し元の責務となったため、渡されたエントリを
 * すべて writeProvider に渡すことを検証する。
 * stats の success/fail カウントも検証する。
 *
 * テスト ID 範囲: T-SF-PW-01, T-SF-PW-03, T-SF-PW-04, T-SF-PW-05
 *
 * @see phaseWrite
 */
describe('phaseWrite', () => {
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

  /** dryRun=true: writeProvider は呼ばれない。 */
  it('[Normal] T-SF-PW-06-01: dryRun=true → writeProvider は呼ばれない', async () => {
    const filePath = '/path/to/a.md';
    const cache = await _makeCacheWithEntry(filePath);
    const { stub: writeStub, getCount } = _makeWriteStub();
    const entries = [_makeEntry(filePath)];

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: true },
      _makeStats(),
      writeStub,
    );

    assertEquals(getCount(), 0);
  });

  /** dryRun=true: stats.skip がインクリメントされる。 */
  it('[Normal] T-SF-PW-06-02: dryRun=true → stats.skip === entries.length', async () => {
    const paths = ['/path/to/a.md', '/path/to/b.md'];
    const buf = new Map<string, string>();
    const cache = new ChatlogCache<SetfmCache>(
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
        },
      },
    );
    await cache.ready;
    await Promise.all(
      paths.map((p) =>
        cache.write(p, {
          type: 'tech',
          category: 'backend',
          frontmatter: { title: 'T', topics: ['t'], tags: ['x'] },
        })
      ),
    );
    const { stub: writeStub } = _makeWriteStub();
    const entries = paths.map(_makeEntry);
    const stats = _makeStats();

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: true },
      stats,
      writeStub,
    );

    assertEquals(stats.skip, 2);
    assertEquals(stats.fail, 0);
  });

  /** dryRun=true かつキャッシュが空: stats.skip がインクリメントされる（fail は増えない）。 */
  it('[Edge] T-SF-PW-06-03: dryRun=true, キャッシュ空 → stats.skip++ (fail は増えない)', async () => {
    const cache = await _makeCache();
    const { stub: writeStub } = _makeWriteStub();
    const entries = [_makeEntry('/path/to/a.md')];
    const stats = _makeStats();

    await phaseWrite(
      entries,
      cache,
      { outputDir: '/out', inputDir: '/in', dryRun: true },
      stats,
      writeStub,
    );

    assertEquals(stats.skip, 1);
    assertEquals(stats.fail, 0);
  });

  /** dryRun=true: dryrun ログに type/category/ファイル名が含まれる。 */
  describe('When: dryRun ログ出力', () => {
    let loggerStub: LoggerStub;

    beforeEach(() => {
      loggerStub = makeLoggerStub();
    });

    afterEach(() => {
      loggerStub.restore();
    });

    it('[Normal] T-SF-PW-06-04: dryRun=true → logger.dryrun に type/category/filename が含まれる', async () => {
      const filePath = '/path/to/a.md';
      const cache = await _makeCacheWithEntry(filePath);
      const { stub: writeStub } = _makeWriteStub();
      const entries = [_makeEntry(filePath)];

      await phaseWrite(
        entries,
        cache,
        { outputDir: '/out', inputDir: '/in', dryRun: true },
        _makeStats(),
        writeStub,
      );

      const dryRunLine = loggerStub.dryrunLogs[0];
      assertStringIncludes(dryRunLine ?? '', 'tech');
      assertStringIncludes(dryRunLine ?? '', 'backend');
      assertStringIncludes(dryRunLine ?? '', 'a.md');
    });
  });
});
