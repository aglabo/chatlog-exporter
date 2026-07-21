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
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

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

/**
 * ファイルをディスクに書き込み、同じテキストから `ChatlogEntry` を生成する。
 *
 * `_discardFiles` は実ファイル削除を試みるため、削除確定を期待するエントリは
 * 実ファイルとエントリの content を必ず一致させる。
 *
 * @param filePath - 書き込み先ファイルパス
 * @param text - ファイルに書き込むテキスト（frontmatter を含む）
 * @returns 書き込んだテキストから生成した `ChatlogEntry`
 */
const _writeEntry = async (filePath: string, text: string): Promise<ChatlogEntry> => {
  await Deno.writeTextFile(filePath, text);
  return new ChatlogEntry(text, { filePath });
};

// ─── Tests

/**
 * `prefilterFiles` 関数の機能テストスイート。
 *
 * `prefilterFiles(entries)` は読み込み済み `ChatlogEntry[]` をファイル名パターンと本文長の
 * 2 段階でノイズを除外し、通過した `ChatlogEntry[]` を返す。
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
          const entry = await _writeEntry(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { stats: _makeStats(), concurrency: 2 });
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
          const entry = await _writeEntry(filePath, '---\ntitle: テスト\n---\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { stats: _makeStats(), concurrency: 2 });
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
          const entry = await _writeEntry(filePath, '---\ntitle: テスト\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { stats: _makeStats(), concurrency: 2 });
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
          const entry = await _writeEntry(filePath, makeRepeatedContent(1200));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { minCharCount: 2428, stats: _makeStats(), concurrency: 2 });
          errStub.restore();

          assertEquals(result.length, 0);
        });

        it('T-FL-PFF-05-02: minCharCount を本文長より小さく設定するとファイルが通過する', async () => {
          const filePath = `${periodDir1}/long-content2.md`;
          const entry = await _writeEntry(filePath, makeRepeatedContent(1200));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { minCharCount: 2426, stats: _makeStats(), concurrency: 2 });
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
          const entry = await _writeEntry(filePath, makeValidContent('テスト', 'u'.repeat(1500), 'a'.repeat(400)));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], {
            minCharCount: 1000,
            minAssistantChars: 401,
            stats: _makeStats(),
            concurrency: 2,
          });
          errStub.restore();

          assertEquals(result.length, 0);
        });

        it('T-FL-PFF-06-02: minAssistantChars を Assistant 文字数より小さく設定するとファイルが通過する', async () => {
          const filePath = `${periodDir1}/assistant-400b.md`;
          const entry = await _writeEntry(filePath, makeValidContent('テスト', 'u'.repeat(1500), 'a'.repeat(400)));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], {
            minCharCount: 1000,
            minAssistantChars: 399,
            stats: _makeStats(),
            concurrency: 2,
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
          const excludedEntry = await _writeEntry(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const shortEntry = await _writeEntry(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          const validEntry = await _writeEntry(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const _stats = _makeStats();
          const result = await prefilterFiles([excludedEntry, shortEntry, validEntry], {
            stats: _stats,
            concurrency: 2,
          });
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
          const entry1 = await _writeEntry(validPath1, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const entry2 = await _writeEntry(validPath2, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry1, entry2], { stats: _makeStats(), concurrency: 2 });
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
          const entry = await _writeEntry(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { stats: _makeStats(), concurrency: 2 });
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0].filePath, filePath);
        });

        it('T-FL-PFF-04-02: 複数ファイルのうち正常なものだけ通過する', async () => {
          const validPath = `${periodDir1}/valid.md`;
          const shortPath = `${periodDir1}/short.md`;
          const validEntry = await _writeEntry(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const shortEntry = await _writeEntry(shortPath, '---\ntitle: 短い\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([validEntry, shortEntry], { stats: _makeStats(), concurrency: 2 });
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0].filePath, validPath);
        });
      });
    });
  });

  /**
   * ファイル名パターン除外 1 件・本文短すぎ 1 件・正常 1 件が混在するファイルを入力とする前提条件グループ。
   *
   * `dryRun: true` を指定したときも削除予定ファイルのログ出力・`stats.skip` 計上が行われ、
   * DISCARD 確定ファイルは実削除しなくても `passed` から除外されることを検証する。
   */
  describe('Given: 3 ファイル（ファイル名パターン除外 1 + 本文短すぎ 1 + 正常 1）', () => {
    /** dryRun: true を渡して prefilterFiles を呼び出すとき。 */
    describe('When: dryRun: true を渡して prefilterFiles を呼び出す', () => {
      /** dryRun でも削除予定ファイルはログ出力・stats.skip に計上され、DISCARD 確定分は passed から除外されることを検証する。 */
      describe('Then: T-FL-PFF-09 - 削除予定がログ出力され、DISCARD 確定分は passed から除外される', () => {
        it('T-FL-PFF-09-01: [Normal] dryRun: true のとき削除予定ファイルの logger.dryrun が呼ばれる', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-body.md`;
          const validPath = `${periodDir1}/valid.md`;
          const excludedEntry = await _writeEntry(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const shortEntry = await _writeEntry(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          const validEntry = await _writeEntry(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();

          await prefilterFiles([excludedEntry, shortEntry, validEntry], {
            stats: _makeStats(),
            dryRun: true,
            concurrency: 2,
          });
          loggerStub.restore();

          assertEquals(loggerStub.dryrunLogs.length, 2);
        });

        it('T-FL-PFF-09-02: [Normal] dryRun: true でも DISCARD 確定分は passed から除外され、stats.skip に計上される', async () => {
          const excludedPath = `${periodDir1}/say-ok-and-nothing-else.md`;
          const shortPath = `${periodDir1}/short-body.md`;
          const validPath = `${periodDir1}/valid.md`;
          const excludedEntry = await _writeEntry(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const shortEntry = await _writeEntry(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          const validEntry = await _writeEntry(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();

          const statsDryRun = _makeStats();
          const resultDryRun = await prefilterFiles([excludedEntry, shortEntry, validEntry], {
            stats: statsDryRun,
            dryRun: true,
            concurrency: 2,
          });
          const statsNormal = _makeStats();
          const resultNormal = await prefilterFiles([excludedEntry, shortEntry, validEntry], {
            stats: statsNormal,
            concurrency: 2,
          });
          loggerStub.restore();

          assertEquals(resultDryRun.map((e) => e.filePath), [validPath]);
          assertEquals(resultNormal.map((e) => e.filePath), [validPath]);
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
   * AI 判定対象（`passed`）に含まれることを検証する。
   */
  describe('Given: 正常なファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** passed に含まれることを検証する。 */
      describe('Then: T-FL-PFF-12 - passed に含まれる', () => {
        it('T-FL-PFF-12-01: 正常なファイル → passed に含まれる', async () => {
          const filePath = `${periodDir1}/cache-miss.md`;
          const entry = await _writeEntry(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([entry], { stats: _makeStats(), concurrency: 2 });
          errStub.restore();

          assertEquals(result.map((e) => e.filePath).includes(filePath), true);
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
          const excludedEntry = await _writeEntry(excludedPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const shortEntry = await _writeEntry(shortPath, '---\ntitle: テスト\n---\n短い本文\n');
          const validEntry3 = await _writeEntry(validPath3, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const validEntry1 = await _writeEntry(validPath1, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const validEntry2 = await _writeEntry(validPath2, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});

          const entries = [validEntry3, excludedEntry, validEntry1, shortEntry, validEntry2];
          const result = await prefilterFiles(entries, { stats: _makeStats(), concurrency: 2 });
          errStub.restore();

          assertEquals(result.map((e) => e.filePath), [validPath3, validPath1, validPath2]);
        });
      });
    });
  });

  /**
   * 除外パターンのファイル名を持つファイルの前提条件グループ。
   *
   * 実削除・dry-run 時のスキップ動作を検証する。
   */
  describe('Given: 除外パターンのファイル名を持つファイル', () => {
    /** prefilterFiles([file], { stats }) を呼び出すとき。 */
    describe('When: prefilterFiles([file], { stats }) を呼び出す', () => {
      /** ファイルが実削除される、または dry-run 時は削除されないことを検証する。 */
      describe('Then: T-FL-PFF-20 - ファイルが実削除される', () => {
        it('T-FL-PFF-20-01: 実削除され stats.remove が加算される', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-cached.md`;
          const entry = await _writeEntry(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await prefilterFiles([entry], { stats, concurrency: 2 });
          errStub.restore();

          assertEquals(await Deno.stat(filePath).catch(() => null), null);
          assertEquals(stats.remove, 1);
        });

        it('T-FL-PFF-20-02: dry-run 時はファイルが削除されず stats.skip が加算される', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-cached-dryrun.md`;
          const entry = await _writeEntry(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();

          await prefilterFiles([entry], { stats, dryRun: true, concurrency: 2 });
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
          const entry = new ChatlogEntry('', { filePath });
          await prefilterFiles([entry], { stats, concurrency: 2 });
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
        });

        it('T-FL-PFF-21-02: removeFile 失敗ファイルは passed に含まれる', async () => {
          const filePath = `${periodDir1}/say-ok-and-nothing-else-missing.md`;
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          // ファイルを作成しないことで removeFile が NotFound → false を返す状態を再現する
          const entry = new ChatlogEntry('', { filePath });
          const passed = await prefilterFiles([entry], { stats, concurrency: 2 });
          errStub.restore();

          assertEquals(passed.map((e) => e.filePath), [filePath]);
        });
      });
    });
  });
});
