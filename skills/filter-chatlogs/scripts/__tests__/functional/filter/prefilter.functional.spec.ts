// src: scripts/__tests__/functional/filter/prefilter.functional.spec.ts
// @(#): prefilterFiles の機能テスト
//       実 tempdir を使用した事前フィルタリングの検証
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
import { prefilterFiles } from '../../../modules/prefilter.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { makePeriodDir, makeRepeatedContent, makeValidContent } from '../../_helpers/fixtures.ts';
// constants
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';
import { FILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';
// types
import type { CLEResult } from '../../../types/cache.types.ts';
import type { BaseStats } from '../../../types/stats.types.ts';

// ─── Internal Helpers

// functions
/**
 * テスト用の初期化済み `BaseStats` オブジェクトを返す。
 *
 * @returns `{ keep: 0, skip: 0, remove: 0, error: 0 }` の BaseStats
 */
const _makeStats = (): BaseStats => ({ keep: 0, skip: 0, remove: 0, error: 0 });

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
      },
    },
  );
  await cache.ready;
  return cache;
};

// ─── Tests

/**
 * `prefilterFiles` 関数の機能テストスイート。
 *
 * `prefilterFiles(files)` はファイル名パターンと本文長の 2 段階でノイズを除外し、
 * 通過したファイルパスの配列を返す。`cache` 指定時はさらにキャッシュ済み判定結果で
 * AI 呼び出し対象からファイルを除外する。
 *
 * ## 除外条件
 * - ファイル名が除外パターンに一致する（例: `say-ok-and-nothing-else.md`）
 * - 本文（frontmatter を除いた部分）が空または 1000 文字未満
 * - `cache` にファイルの判定結果（DISCARD/KEEP）が既に存在する
 *   （dry-run 時は削除・stats 変更を行わず AI 対象からのみ除外する）
 *
 * テスト ID 範囲: T-FL-PFF-01 〜 T-FL-PFF-14
 *
 * @see prefilterFiles
 */
describe('prefilterFiles', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス。 */
  let periodDir1: string;

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 除外パターンに一致するファイル名を持つファイルを入力とする前提条件グループ。
   *
   * ファイルの内容が有効であっても、ファイル名パターンによってスキップされることを検証する。
   */
  describe('Given: 除外パターンのファイル名を持つファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-01 - ファイルがスキップされる', () => {
        it('T-FL-PFF-01-01: say-ok-and-nothing-else.md は通過しない', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * frontmatter のみで本文が空のファイルを入力とする前提条件グループ。
   *
   * 本文なし（0 文字）のファイルが除外されることを検証する。
   */
  describe('Given: frontmatter のみで本文がないファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-02 - ファイルがスキップされる', () => {
        it('T-FL-PFF-02-01: body が空のファイルは通過しない', async () => {
          const filePath = `${periodDir1}/empty-body.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * 本文が 1000 文字未満の短すぎるファイルを入力とする前提条件グループ。
   *
   * 本文が短すぎるファイルが除外されることを検証する。
   */
  describe('Given: 本文が短すぎるファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-03 - ファイルがスキップされる', () => {
        it('T-FL-PFF-03-01: 短い本文のファイルは通過しない', async () => {
          const filePath = `${periodDir1}/short.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * デフォルト閾値（1000 文字）を超える本文長のファイルを入力とする前提条件グループ。
   *
   * `minCharCount` パラメータで閾値をオーバーライドし、除外/通過が制御されることを検証する。
   * `makeRepeatedContent(1200)` は body 約 2426 文字を生成するため、その値を基準にする。
   */
  describe('Given: デフォルト閾値(1000文字)を超える本文長のファイル', () => {
    /** prefilterFiles([file], minCharCount) を呼び出すとき。 */
    describe('When: prefilterFiles([file], minCharCount=本文長+1) を呼び出す', () => {
      /** minCharCount が適用されてファイルが除外/通過されることを検証する。 */
      describe('Then: T-FL-PFF-05 - minCharCount が適用されてファイルが除外される', () => {
        it('T-FL-PFF-05-01: minCharCount を本文長より大きく設定するとファイルが除外される', async () => {
          const filePath = `${periodDir1}/long-content.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(1200));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { minCharCount: 2428, stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
        });

        it('T-FL-PFF-05-02: minCharCount を本文長より小さく設定するとファイルが通過する', async () => {
          const filePath = `${periodDir1}/long-content2.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(1200));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { minCharCount: 2426, stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 1);
        });
      });
    });
  });

  /**
   * User ターン 1 件・Assistant が 400 文字のファイルを入力とする前提条件グループ。
   *
   * `minAssistantChars` パラメータで閾値をオーバーライドし、除外/通過が制御されることを検証する。
   * `makeValidContent('テスト', 'u'.repeat(1500), 'a'.repeat(400))` は
   * User 1 件・Assistant 400 文字を生成する。
   */
  describe('Given: User ターン 1 件・Assistant が 400 文字のファイル', () => {
    /** prefilterFiles([file], MIN_CHAR_COUNT, minAssistantChars) を呼び出すとき。 */
    describe('When: prefilterFiles([file], 1000, minAssistantChars) を呼び出す', () => {
      /** minAssistantChars が適用されて除外/通過が制御されることを検証する。 */
      describe('Then: T-FL-PFF-06 - minAssistantChars が適用されて除外/通過が制御される', () => {
        it('T-FL-PFF-06-01: minAssistantChars を Assistant 文字数より大きく設定するとファイルが除外される', async () => {
          const filePath = `${periodDir1}/assistant-400.md`;
          await Deno.writeTextFile(filePath, makeValidContent('テスト', 'u'.repeat(1500), 'a'.repeat(400)));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], {
            minCharCount: 1000,
            minAssistantChars: 401,
            stats: _makeStats(),
          });
          errStub.restore();

          assertEquals(result.length, 0);
        });

        it('T-FL-PFF-06-02: minAssistantChars を Assistant 文字数より小さく設定するとファイルが通過する', async () => {
          const filePath = `${periodDir1}/assistant-400b.md`;
          await Deno.writeTextFile(filePath, makeValidContent('テスト', 'u'.repeat(1500), 'a'.repeat(400)));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], {
            minCharCount: 1000,
            minAssistantChars: 399,
            stats: _makeStats(),
          });
          errStub.restore();

          assertEquals(result.length, 1);
        });
      });
    });
  });

  /**
   * stats 引数を渡した場合の keep カウント検証グループ。
   *
   * 事前段階で KEEP 確定したファイル数が stats.keep に正しく反映されることを検証する。
   */
  describe('Given: 3 ファイル（ファイル名パターン除外 1 + 本文短すぎ 1 + 正常 1）', () => {
    /** stats = _makeStats() を渡して prefilterFiles を呼び出すとき。 */
    describe('When: stats オブジェクトを渡して prefilterFiles を呼び出す', () => {
      /** stats.keep が事前 KEEP 確定数と一致し、戻り値が正常ファイルのみであることを検証する。 */
      describe('Then: T-FL-PFF-07 - stats.keep が事前 KEEP 確定数と一致する', () => {
        it('T-FL-PFF-07-01: stats.keep === 2 かつ 戻り値は 1 ファイル', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-body.md`;
          const validPath = `${periodDir1}/valid.md`;
          await Deno.writeTextFile(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const _stats = _makeStats();
          const result = await prefilterFiles([excludedPath, shortPath, validPath], { stats: _stats });
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(_stats.keep, 2);
        });
      });
    });
  });

  /**
   * stats を渡して prefilterFiles を呼び出したときの基本動作を検証するグループ。
   */
  describe('Given: 正常な 2 ファイル', () => {
    /** stats を渡して prefilterFiles を呼び出すとき。 */
    describe('When: stats を渡して prefilterFiles を呼び出す', () => {
      /** エラーなく 2 ファイルが戻ることを検証する。 */
      describe('Then: T-FL-PFF-08 - エラーなく動作する', () => {
        it('T-FL-PFF-08-01: stats を渡すと2ファイルが返される', async () => {
          const validPath1 = `${periodDir1}/valid1.md`;
          const validPath2 = `${periodDir1}/valid2.md`;
          await Deno.writeTextFile(validPath1, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(validPath2, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([validPath1, validPath2], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 2);
        });
      });
    });
  });

  /**
   * ファイル名が正常かつ本文が十分な長さを持つファイルを入力とする前提条件グループ。
   *
   * 有効なファイルが通過し、複数ファイル混在時は有効なファイルのみ通過することを検証する。
   */
  describe('Given: 正常なコンテンツを持つファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルが通過し、結果に含まれることを検証する。 */
      describe('Then: T-FL-PFF-04 - ファイルが通過する', () => {
        it('T-FL-PFF-04-01: 正常なファイルは通過する', async () => {
          const filePath = `${periodDir1}/normal.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0], filePath);
        });

        it('T-FL-PFF-04-02: 複数ファイルのうち正常なものだけ通過する', async () => {
          const validPath = `${periodDir1}/valid.md`;
          const shortPath = `${periodDir1}/short.md`;
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(shortPath, '---\ntitle: 短い\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([validPath, shortPath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0], validPath);
        });
      });
    });
  });

  /**
   * ファイル名パターン除外 1 件・本文短すぎ 1 件・正常 1 件が混在するファイルを入力とする前提条件グループ。
   *
   * `dryRun: true` を指定したときのログ抑制と、戻り値・stats の値が `dryRun: false` と一致することを検証する。
   */
  describe('Given: 3 ファイル（ファイル名パターン除外 1 + 本文短すぎ 1 + 正常 1）', () => {
    /** dryRun: true を渡して prefilterFiles を呼び出すとき。 */
    describe('When: dryRun: true を渡して prefilterFiles を呼び出す', () => {
      /** ログ出力が抑制され、戻り値・stats は dryRun なし時と同じであることを検証する。 */
      describe('Then: T-FL-PFF-09 - ログ出力が抑制され結果は変わらない', () => {
        it('T-FL-PFF-09-01: [Normal] dryRun: true のとき logger.info が呼ばれない', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-body.md`;
          const validPath = `${periodDir1}/valid.md`;
          await Deno.writeTextFile(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();

          await prefilterFiles([excludedPath, shortPath, validPath], { stats: _makeStats(), dryRun: true });
          loggerStub.restore();

          assertEquals(loggerStub.infoLogs.length, 0);
        });

        it('T-FL-PFF-09-02: [Normal] dryRun: true でも戻り値と stats.keep は dryRun なし時と同じ', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-body.md`;
          const validPath = `${periodDir1}/valid.md`;
          await Deno.writeTextFile(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();

          const statsDryRun = _makeStats();
          const resultDryRun = await prefilterFiles([excludedPath, shortPath, validPath], {
            stats: statsDryRun,
            dryRun: true,
          });
          const statsNormal = _makeStats();
          const resultNormal = await prefilterFiles([excludedPath, shortPath, validPath], { stats: statsNormal });
          loggerStub.restore();

          assertEquals(resultDryRun, resultNormal);
          assertEquals(statsDryRun.keep, statsNormal.keep);
        });
      });
    });
  });

  /**
   * cache に DISCARD(confidence >= discardThreshold) のエントリが存在するファイルの前提条件グループ。
   *
   * AI 呼び出し対象から除外され、その場で削除・stats.remove 加算が行われることを検証する。
   */
  describe('Given: cache に DISCARD(confidence >= discardThreshold) のエントリがあるファイル', () => {
    /** prefilterFiles([file], { cache, discardThreshold }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, discardThreshold }) を呼び出す', () => {
      /** ファイルが削除され、passed に含まれず、stats.remove が増えることを検証する。 */
      describe('Then: T-FL-PFF-10 - ファイルが削除され stats.remove が増える', () => {
        it('T-FL-PFF-10-01: passed に含まれない', async () => {
          const filePath = `${periodDir1}/cached-discard.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' });
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats(), cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(result.includes(filePath), false);
        });

        it('T-FL-PFF-10-02: ファイルが削除され stats.remove が 1 になる', async () => {
          const filePath = `${periodDir1}/cached-discard2.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' });
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(await Deno.stat(filePath).catch(() => null), null);
          assertEquals(stats.remove, 1);
        });
      });
    });
  });

  /**
   * cache に KEEP、または confidence が discardThreshold 未満の DISCARD エントリが存在するファイルの前提条件グループ。
   *
   * AI 呼び出し対象から除外され、KEEP 確定（stats.keep 加算）が行われることを検証する。
   */
  describe('Given: cache に KEEP、または confidence 不足の DISCARD エントリがあるファイル', () => {
    /** prefilterFiles([file], { cache, discardThreshold }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, discardThreshold }) を呼び出す', () => {
      /** ファイルが残り、passed に含まれず、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PFF-11 - ファイルが残り stats.keep が増える', () => {
        it('T-FL-PFF-11-01: decision=KEEP → passed に含まれず stats.keep が 1 になる', async () => {
          const filePath = `${periodDir1}/cached-keep.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' });
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          const result = await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(result.includes(filePath), false);
          assertEquals(stats.keep, 1);
          assertEquals(await Deno.stat(filePath).then(() => true).catch(() => false), true);
        });

        it('T-FL-PFF-11-02: confidence が discardThreshold 未満 → stats.keep が 1 になり削除されない', async () => {
          const filePath = `${periodDir1}/cached-lowconf.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.5, reason: 'low conf' });
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(stats.keep, 1);
          assertEquals(stats.remove, 0);
          assertEquals(await Deno.stat(filePath).then(() => true).catch(() => false), true);
        });
      });
    });
  });

  /**
   * cache にエントリが存在しないファイルの前提条件グループ。
   *
   * 従来通り AI 判定対象（`passed`）に含まれることを検証する。
   */
  describe('Given: cache にエントリが存在しないファイル', () => {
    /** prefilterFiles([file], { cache }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache }) を呼び出す', () => {
      /** passed に含まれることを検証する。 */
      describe('Then: T-FL-PFF-12 - passed に含まれる', () => {
        it('T-FL-PFF-12-01: キャッシュミス → passed に含まれる', async () => {
          const filePath = `${periodDir1}/cache-miss.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats(), cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(result.includes(filePath), true);
        });
      });
    });
  });

  /**
   * dry-run モードで cache に DISCARD 確定エントリがあるファイルの前提条件グループ。
   *
   * dry-run 時はキャッシュヒットでもファイル削除は行わないが、
   * サマリー集計 (`keep + skip + remove + error === total`) を保つため stats.remove は加算されることを検証する。
   */
  describe('Given: dry-run モードで cache に DISCARD 確定エントリがあるファイル', () => {
    /** prefilterFiles([file], { cache, dryRun: true }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, dryRun: true }) を呼び出す', () => {
      /** ファイルは削除されないが、stats.remove は加算されることを検証する。 */
      describe('Then: T-FL-PFF-13 - ファイルは削除されないが stats.remove は加算される', () => {
        it('T-FL-PFF-13-01: dry-run 時はファイルが削除されない', async () => {
          const filePath = `${periodDir1}/dryrun-cached-discard.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' });
          const loggerStub = makeLoggerStub();

          await prefilterFiles([filePath], { stats: _makeStats(), cache, discardThreshold: 0.7, dryRun: true });
          loggerStub.restore();

          assertEquals(await Deno.stat(filePath).then(() => true).catch(() => false), true);
        });

        it('T-FL-PFF-13-02: dry-run 時は stats.remove が加算される（would-remove）', async () => {
          const filePath = `${periodDir1}/dryrun-cached-discard2.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' });
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7, dryRun: true });
          loggerStub.restore();

          assertEquals(stats.remove, 1);
          assertEquals(stats.keep, 0);
        });
      });
    });
  });

  /**
   * dry-run モードで cache に KEEP 相当エントリがあるファイルの前提条件グループ。
   *
   * dry-run 時でもキャッシュヒットの KEEP 判定は stats.keep に加算されることを検証する
   * （`keep + skip + remove + error === total` の集計整合性を保つため）。
   */
  describe('Given: dry-run モードで cache に KEEP 相当エントリがあるファイル', () => {
    /** prefilterFiles([file], { cache, dryRun: true }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, dryRun: true }) を呼び出す', () => {
      /** stats.keep が加算されることを検証する。 */
      describe('Then: T-FL-PFF-15 - stats.keep が加算される', () => {
        it('T-FL-PFF-15-01: dry-run 時はキャッシュ KEEP で stats.keep が加算される', async () => {
          const filePath = `${periodDir1}/dryrun-cached-keep.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'reusable' });
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7, dryRun: true });
          loggerStub.restore();

          assertEquals(stats.keep, 1);
          assertEquals(stats.remove, 0);
        });
      });
    });
  });

  /**
   * cache に DISCARD 確定エントリがあるが、削除実行前にファイルが既に存在しない前提条件グループ。
   *
   * `removeFile` が `false` を返すケースで stats.error が加算されることを検証する。
   */
  describe('Given: cache に DISCARD 確定エントリがあるが対象ファイルが既に存在しない', () => {
    /** prefilterFiles([file], { cache, discardThreshold }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, discardThreshold }) を呼び出す', () => {
      /** stats.error が増え、stats.remove は増えないことを検証する。 */
      describe('Then: T-FL-PFF-14 - stats.error が 1 になる', () => {
        it('T-FL-PFF-14-01: removeFile 失敗 → stats.error === 1, stats.remove === 0', async () => {
          const filePath = `${periodDir1}/cached-discard-missing.md`;
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' });
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          // ファイルを作成しないことで removeFile が NotFound → false を返す状態を再現する
          await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
        });
      });
    });
  });
});
