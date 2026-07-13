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
import { makePeriodDir, makeRepeatedContent, makeValidContent } from '../../_helpers/fixtures.ts';
// constants
import { FILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';
// types
import type { BaseStats } from '../../../types/stats.types.ts';

// ─── Internal Helpers

// functions
/**
 * テスト用の初期化済み `BaseStats` オブジェクトを返す。
 *
 * @returns `{ keep: 0, skip: 0, remove: 0, error: 0 }` の BaseStats
 */
const _makeStats = (): BaseStats => ({ keep: 0, skip: 0, remove: 0, error: 0 });

// ─── Tests

/**
 * `prefilterFiles` 関数の機能テストスイート。
 *
 * `prefilterFiles(files)` はファイル名パターンと本文長の 2 段階でノイズを除外し、
 * 通過したファイルパスの配列を返す。`cache` 指定時はファイル名パターン除外・読み込み失敗の
 * decision を書き込む。
 *
 * ## 除外条件
 * - ファイル名が除外パターンに一致する（例: `say-ok-and-nothing-else.md`）
 * - 本文（frontmatter を除いた部分）が空または 1000 文字未満
 *
 * テスト ID 範囲: T-FL-PFF-01 〜 T-FL-PFF-21
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
        it('T-FL-PFF-01-01: say-ok-and-nothing-else.md は通過せず実削除される', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
          assertEquals(await Deno.stat(filePath).catch(() => null), null);
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
        it('T-FL-PFF-02-01: body が空のファイルは通過せず実削除される', async () => {
          const filePath = `${periodDir1}/empty-body.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
          assertEquals(await Deno.stat(filePath).catch(() => null), null);
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
        it('T-FL-PFF-03-01: 短い本文のファイルは通過せず実削除される', async () => {
          const filePath = `${periodDir1}/short.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.length, 0);
          assertEquals(await Deno.stat(filePath).catch(() => null), null);
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
   * stats 引数を渡した場合の remove カウント検証グループ。
   *
   * ファイル名パターン除外・本文除外の合計が stats.remove に正しく反映されることを検証する。
   */
  describe('Given: 3 ファイル（ファイル名パターン除外 1 + 本文短すぎ 1 + 正常 1）', () => {
    /** stats = _makeStats() を渡して prefilterFiles を呼び出すとき。 */
    describe('When: stats オブジェクトを渡して prefilterFiles を呼び出す', () => {
      /** stats.remove が除外確定数と一致し、戻り値が正常ファイルのみであることを検証する。 */
      describe('Then: T-FL-PFF-07 - stats.remove が除外確定数と一致する', () => {
        it('T-FL-PFF-07-01: stats.remove === 2 かつ 戻り値は 1 ファイル', async () => {
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
          assertEquals(_stats.remove, 2);
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

        it('T-FL-PFF-09-02: [Normal] dryRun: true でも戻り値は dryRun なし時と同じで、stats.remove 相当は stats.skip に計上される', async () => {
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
          assertEquals(statsNormal.remove, 2);
          assertEquals(statsDryRun.remove, 0);
          assertEquals(statsDryRun.skip, 2);
          assertEquals(statsDryRun.skip, statsNormal.remove);
        });
      });
    });
  });

  /**
   * 正常なファイルの前提条件グループ。
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
  describe('Given: 正常なファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** passed に含まれることを検証する。 */
      describe('Then: T-FL-PFF-12 - passed に含まれる', () => {
        it('T-FL-PFF-12-01: 正常なファイル → passed に含まれる', async () => {
          const filePath = `${periodDir1}/cache-miss.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath], { stats: _makeStats() });
          errStub.restore();

          assertEquals(result.includes(filePath), true);
        });
      });
    });
  });

  /**
   * 本文読み込みに失敗する（実ファイルが存在しない）ファイルを cache 指定で処理する前提条件グループ。
   *
   * 読み込み失敗時に cache へ ERROR decision が記録されることを検証する。
   */
  describe('Given: 本文読み込みに失敗するファイル（cache 指定あり）', () => {
    /** prefilterFiles([file], { cache }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache }) を呼び出す', () => {
      /** cache に ERROR decision が記録され、stats.error が加算され、passed に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-16 - cache に ERROR decision が記録される', () => {
        it('T-FL-PFF-16-01: cache.read(filePath).decision === FILTER_DECISIONS.ERROR になる', async () => {
          const filePath = `${periodDir1}/missing-read.md`;
          const cache = await _makeEmptyCache();
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          const result = await prefilterFiles([filePath], { stats, cache });
          errStub.restore();

          assertEquals(cache.read(filePath).decision, FILTER_DECISIONS.ERROR);
          assertEquals(stats.error, 1);
          assertEquals(result.includes(filePath), false);
        });
      });
    });
  });

  /**
   * 本文読み込みに失敗する（実ファイルが存在しない）ファイルを cache 指定なしで処理する前提条件グループ。
   *
   * cache 未指定でも従来通り例外を投げず stats.error が加算されることを検証する（回帰確認）。
   */
  describe('Given: 本文読み込みに失敗するファイル（cache 指定なし）', () => {
    /** prefilterFiles([file], { stats }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { stats }) を呼び出す', () => {
      /** 例外が投げられず stats.error が加算されることを検証する。 */
      describe('Then: T-FL-PFF-17 - 例外が投げられず stats.error が加算される', () => {
        it('T-FL-PFF-17-01: stats.error === 1 になる', async () => {
          const filePath = `${periodDir1}/missing-read-nocache.md`;
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats });
          errStub.restore();

          assertEquals(stats.error, 1);
        });
      });
    });
  });

  /**
   * ファイル名除外 1 件・短本文除外 1 件・正常ファイル複数件が混在するファイルリストの前提条件グループ。
   *
   * ステージ分割リファクタリングによって戻り値の順序が入力順から崩れていないことを検証する
   * characterization test（現行実装でも新実装でも PASS する想定）。
   */
  describe('Given: ファイル名除外1 + 短本文除外1 + 正常3件が混在するファイルリスト', () => {
    /** prefilterFiles(files) を呼び出すとき。 */
    describe('When: prefilterFiles(files) を呼び出す', () => {
      /** 戻り値配列が入力 files の順序と一致することを検証する。 */
      describe('Then: T-FL-PFF-19 - 戻り値の順序が入力順と一致する', () => {
        it('T-FL-PFF-19-01: passed 配列が入力 files の順序と一致する', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-order.md`;
          const validPath1 = `${periodDir1}/order-valid1.md`;
          const validPath2 = `${periodDir1}/order-valid2.md`;
          const validPath3 = `${periodDir1}/order-valid3.md`;
          await Deno.writeTextFile(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          await Deno.writeTextFile(validPath3, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(validPath1, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(validPath2, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const files = [validPath3, excludedPath, validPath1, shortPath, validPath2];
          const result = await prefilterFiles(files, { stats: _makeStats() });
          errStub.restore();

          assertEquals(result, [validPath3, validPath1, validPath2]);
        });
      });
    });
  });

  /**
   * cache に ERROR decision が既に記録されているファイル（実ファイルは正常）の前提条件グループ。
   *
   * ERROR キャッシュはヒットとみなさず、AI 判定対象（`passed`）に含めることを検証する。
   */
  describe('Given: cache に ERROR decision が既にあるファイル', () => {
    /** prefilterFiles([file], { cache, discardThreshold }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, discardThreshold }) を呼び出す', () => {
      /** passed に含まれることを検証する。 */
      describe('Then: T-FL-PFF-18 - passed に含まれる', () => {
        it('T-FL-PFF-18-01: ERROR キャッシュは再読み込みされ passed に含まれる', async () => {
          const filePath = `${periodDir1}/cached-error.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const cache = await _makeEmptyCache();
          await cache.write(filePath, { decision: FILTER_DECISIONS.ERROR, confidence: 0, reason: 'read failure' });
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          const result = await prefilterFiles([filePath], { stats, cache, discardThreshold: 0.7 });
          errStub.restore();

          assertEquals(result.includes(filePath), true);
        });
      });
    });
  });

  /**
   * 除外パターンのファイル名を持つファイルを cache 指定で処理する前提条件グループ。
   *
   * ファイル名除外は cache 廃止に伴い decision を書き込まなくなったため、
   * 実削除・dry-run 時のスキップ動作のみを検証する。
   */
  describe('Given: 除外パターンのファイル名を持つファイル（cache 指定あり）', () => {
    /** prefilterFiles([file], { cache, discardThreshold }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { cache, discardThreshold }) を呼び出す', () => {
      /** ファイルが実削除される、または dry-run 時は削除されないことを検証する。 */
      describe('Then: T-FL-PFF-20 - ファイルが実削除される', () => {
        it('T-FL-PFF-20-01: 実削除され stats.remove が加算される', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-cached.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats });
          errStub.restore();

          assertEquals(await Deno.stat(filePath).catch(() => null), null);
          assertEquals(stats.remove, 1);
        });

        it('T-FL-PFF-20-02: dry-run 時はファイルが削除されず stats.skip が加算される', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-cached-dryrun.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();

          await prefilterFiles([filePath], { stats, dryRun: true });
          loggerStub.restore();

          assertEquals(await Deno.stat(filePath).then(() => true).catch(() => false), true);
          assertEquals(stats.skip, 1);
        });
      });
    });
  });

  /**
   * 除外パターンのファイル名を持つが、削除実行前にファイルが既に存在しない前提条件グループ。
   *
   * `removeFile` が `false` を返すケースで stats.error が加算されることを検証する。
   */
  describe('Given: 除外パターンのファイル名を持つファイルが実削除前に既に存在しない', () => {
    /** prefilterFiles([file], { stats }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { stats }) を呼び出す', () => {
      /** stats.error が増え、stats.remove は増えないことを検証する。 */
      describe('Then: T-FL-PFF-21 - stats.error が 1 になる', () => {
        it('T-FL-PFF-21-01: removeFile 失敗 → stats.error === 1, stats.remove === 0', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-missing.md`;
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          // ファイルを作成しないことで removeFile が NotFound → false を返す状態を再現する
          await prefilterFiles([filePath], { stats });
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
        });
      });
    });
  });
});
