// src: scripts/modules/filter/__tests__/functional/sweep-discards.functional.spec.ts
// @(#): sweepDiscards の機能テスト
//       キャッシュ上 DISCARD とマークされたファイルの一括削除（mark-then-sweep のスイープフェーズ）を検証する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { sweepDiscards } from '../../sweep-discards.ts';
// types
import type { FilterStats } from '../../../../types/stats.types.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../../_scripts/classes/ChatlogCache.class.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../../../../_scripts/constants/config-schema.constants.ts';
import { fileOrDirExists } from '../../../../../../_scripts/libs/file-ops/exists-utils.ts';
import { makePeriodDir } from '../../../../__tests__/_helpers/fixtures.ts';
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../../../../types/cache.types.ts';

// ─── Internal Helpers

// functions

/**
 * テスト用の空キャッシュ（バッファバック）を生成する。
 *
 * ファイル I/O をせずにインメモリバッファで動作する `ChatlogCache<CLEResult>` を返す。
 * @returns 初期化済みの空キャッシュ
 */
const _makeEmptyCache = async (): Promise<ChatlogCache<CLEResult>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<CLEResult>(
    'filter-cache',
    '/fake/cache',
    undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
        glob: () => Promise.resolve([]),
        removeFile: (path) => {
          buf.delete(path);
          return Promise.resolve();
        },
      },
    },
  );
  await cache.ready;
  return cache;
};

/**
 * 初期値がすべて 0 の `FilterStats` オブジェクトを生成する。
 *
 * @returns `{ keep: 0, skip: 0, remove: 0, error: 0 }` の FilterStats
 */
const _makeStats = (): FilterStats => ({ keep: 0, skip: 0, remove: 0, error: 0 });

// ─── Tests

/**
 * `sweepDiscards` 関数の機能テストスイート。
 *
 * `sweepDiscards(allFiles, cache, stats, dryRun)` は
 * キャッシュ上 `decision: DISCARD` とマークされたが実ファイルが残っているものを一括削除する。
 * 削除成功時はキャッシュエントリ自体を削除し、削除失敗時はキャッシュの decision を ERROR にマークする。
 *
 * テスト ID 範囲: T-FL-SWP-01 〜 T-FL-SWP-04
 *
 * @see sweepDiscards
 */
describe('sweepDiscards', () => {
  let tempDir: string;
  let periodDir1: string;

  /**
   * テスト用 .md ファイルを一時ディレクトリに作成し、そのパスを返す。
   *
   * @param name - ファイル名（例: `a.md`）
   * @returns 作成したファイルの絶対パス
   */
  async function _createTempFile(name: string): Promise<string> {
    const filePath = `${periodDir1}/${name}`;
    await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n### User\n質問\n\n### Assistant\n回答\n');
    return filePath;
  }

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * キャッシュに DISCARD マーク済みエントリが記録されているファイルの前提条件グループ。
   *
   * 実ファイルが削除され、stats.remove が加算され、キャッシュエントリも削除されることを検証する。
   */
  describe('Given: キャッシュに DISCARD マーク済みエントリがあり実ファイルが残っている', () => {
    /** sweepDiscards([file], cache, stats, false) を呼び出すとき。 */
    describe('When: sweepDiscards(...) を呼び出す（dryRun=false）', () => {
      /** ファイルが削除され、stats.remove が増え、キャッシュエントリも消える。 */
      describe('Then: T-FL-SWP-01 - ファイルが削除され stats.remove が増えキャッシュも消える', () => {
        it('T-FL-SWP-01-01: ファイルが削除される', async () => {
          const filePath = await _createTempFile('zombie.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const logStub = stub(console, 'log', () => {});

          await sweepDiscards([filePath], cache, stats, false);
          logStub.restore();

          assertEquals(await fileOrDirExists(filePath), false);
        });

        it('T-FL-SWP-01-02: stats.remove が 1 になる', async () => {
          const filePath = await _createTempFile('zombie2.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const logStub = stub(console, 'log', () => {});

          await sweepDiscards([filePath], cache, stats, false);
          logStub.restore();

          assertEquals(stats.remove, 1);
        });

        it('T-FL-SWP-01-03: キャッシュエントリが削除される', async () => {
          const filePath = await _createTempFile('zombie3.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const logStub = stub(console, 'log', () => {});

          await sweepDiscards([filePath], cache, stats, false);
          logStub.restore();

          assertEquals(cache.read(filePath), {});
        });
      });
    });
  });

  /**
   * キャッシュが KEEP のファイルの前提条件グループ。
   *
   * 削除対象外として扱われ、ファイルが残ることを検証する。
   */
  describe('Given: キャッシュが KEEP', () => {
    /** sweepDiscards([file], cache, stats, false) を呼び出すとき。 */
    describe('When: sweepDiscards(...) を呼び出す（dryRun=false）', () => {
      /** ファイルが削除されず、stats が変化しない。 */
      describe('Then: T-FL-SWP-02 - ファイルが残り stats が変化しない', () => {
        it('T-FL-SWP-02-01: KEEP 判定のファイルは削除されない', async () => {
          const filePath = await _createTempFile('keep.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' });
          const stats = _makeStats();

          await sweepDiscards([filePath], cache, stats, false);

          assertEquals(await fileOrDirExists(filePath), true);
          assertEquals(stats.remove, 0);
        });
      });
    });
  });

  /**
   * DISCARD マーク済みだが削除実行時にファイルが既に存在しない前提条件グループ。
   *
   * `removeFile` が失敗するケースで stats.error が加算され、
   * キャッシュの decision が ERROR にマークされることを検証する。
   */
  describe('Given: DISCARD マーク済みだが削除直前にファイルが既に存在しない', () => {
    /** sweepDiscards([file], cache, stats, false) を呼び出すとき。 */
    describe('When: sweepDiscards(...) を呼び出す（dryRun=false）', () => {
      /** stats.error が増え、stats.remove は増えず、キャッシュの decision が ERROR になる。 */
      describe('Then: T-FL-SWP-03 - stats.error が 1 になりキャッシュが ERROR にマークされる', () => {
        it('T-FL-SWP-03-01: removeFile が失敗 → stats.error === 1', async () => {
          const filePath = await _createTempFile('vanish.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const logStub = stub(console, 'log', () => {});
          const warnStub = stub(console, 'warn', () => {});
          // fileExists では検出されるが、削除実行時に Deno.remove が NotFound を投げる TOCTOU を再現する
          const removeStub = stub(Deno, 'remove', () => Promise.reject(new Deno.errors.NotFound()));

          await sweepDiscards([filePath], cache, stats, false);
          removeStub.restore();
          warnStub.restore();
          logStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
        });

        it('T-FL-SWP-03-02: キャッシュの decision が ERROR にマークされ confidence/reason は保持される', async () => {
          const filePath = await _createTempFile('vanish2.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const logStub = stub(console, 'log', () => {});
          const warnStub = stub(console, 'warn', () => {});
          const removeStub = stub(Deno, 'remove', () => Promise.reject(new Deno.errors.NotFound()));

          await sweepDiscards([filePath], cache, stats, false);
          removeStub.restore();
          warnStub.restore();
          logStub.restore();

          assertEquals(cache.read(filePath), {
            decision: FILTER_DECISIONS.ERROR,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
        });
      });
    });
  });

  /**
   * dryRun=true で DISCARD マーク済みファイルを渡す前提条件グループ。
   *
   * 削除は実行されず、stats.skip に計上されることを検証する。
   */
  describe('Given: DISCARD マーク済みファイルが存在し dryRun=true', () => {
    /** sweepDiscards([file], cache, stats, true) を呼び出すとき。 */
    describe('When: sweepDiscards(...) を呼び出す（dryRun=true）', () => {
      /** ファイルは削除されず、stats.skip が増える。 */
      describe('Then: T-FL-SWP-04 - stats.skip が増え削除されない', () => {
        it('T-FL-SWP-04-01: ファイルが削除されずに残る', async () => {
          const filePath = await _createTempFile('dry.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const infoStub = stub(console, 'error', () => {});

          await sweepDiscards([filePath], cache, stats, true);
          infoStub.restore();

          assertEquals(await fileOrDirExists(filePath), true);
        });

        it('T-FL-SWP-04-02: stats.skip が 1 になる', async () => {
          const filePath = await _createTempFile('dry2.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const infoStub = stub(console, 'error', () => {});

          await sweepDiscards([filePath], cache, stats, true);
          infoStub.restore();

          assertEquals(stats.skip, 1);
          assertEquals(stats.remove, 0);
        });
      });
    });
  });

  /**
   * DISCARD マーク済みファイルが複数存在し dryRun=true の前提条件グループ。
   *
   * ファイルごとに stats.skip が加算され、ファイルごとに skip ログが出力されることを検証する。
   */
  describe('Given: DISCARD マーク済みファイルが2件存在し dryRun=true', () => {
    /** sweepDiscards([file1, file2], cache, stats, true) を呼び出すとき。 */
    describe('When: sweepDiscards(...) を呼び出す（dryRun=true）', () => {
      /** stats.skip がファイル数分増え、ファイルごとに skip ログが出力される。 */
      describe('Then: T-FL-SWP-05 - ファイル単位で stats.skip 加算とログ出力が行われる', () => {
        it('T-FL-SWP-05-01: stats.skip が 2 になる', async () => {
          const filePath1 = await _createTempFile('dry3.md');
          const filePath2 = await _createTempFile('dry4.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath1, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          await cache.write(filePath2, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const infoStub = stub(console, 'error', () => {});

          await sweepDiscards([filePath1, filePath2], cache, stats, true);
          infoStub.restore();

          assertEquals(stats.skip, 2);
        });

        it('T-FL-SWP-05-02: ファイルごとに skip ログが出力される', async () => {
          const filePath1 = await _createTempFile('dry5.md');
          const filePath2 = await _createTempFile('dry6.md');
          const cache = await _makeEmptyCache();
          await cache.write(filePath1, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          await cache.write(filePath2, {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            reason: 'trivial',
          });
          const stats = _makeStats();
          const infoStub = stub(console, 'error', () => {});

          await sweepDiscards([filePath1, filePath2], cache, stats, true);
          infoStub.restore();

          const messages = infoStub.calls.map((call) => call.args[0] as string);
          assertEquals(messages.some((msg) => msg.includes('dry5.md')), true);
          assertEquals(messages.some((msg) => msg.includes('dry6.md')), true);
        });
      });
    });
  });
});
