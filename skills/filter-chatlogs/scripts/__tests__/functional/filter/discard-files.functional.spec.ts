// src: scripts/__tests__/functional/filter/discard-files.functional.spec.ts
// @(#): _discardFiles の機能テスト
//       実 tempdir を使用したバッチ削除・stats 加算の検証
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
import { _discardFiles } from '../../../modules/prefilter.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makePeriodDir, makeRepeatedContent } from '../../_helpers/fixtures.ts';
// constants
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';
import { FILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';
// types
import type { DiscardFile } from '../../../types/filter.types.ts';
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
 * `_discardFiles` 関数の機能テストスイート。
 *
 * ファイル名パターン除外・キャッシュ DISCARD 確定の両方から集約された `DiscardFile[]` を
 * バッチで削除し、stats を加算する。
 *
 * ## 検証観点
 * - `dryRun === true` のときは実削除せず `stats.skip` に加算し、ログ出力を行わない
 * - `dryRun === false` のときは `removeFile` を呼び、成功なら `stats.remove`、失敗なら `stats.error` を加算する
 * - 削除対象が 0 件のとき正常に完了する
 *
 * テスト ID 範囲: T-FL-DF-01 〜 T-FL-DF-04
 *
 * @see _discardFiles
 */
describe('_discardFiles', () => {
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
   * dryRun=false で実在するファイルを処理する前提条件グループ。
   *
   * 実削除が行われ stats.remove が加算されることを検証する。
   */
  describe('Given: dryRun=false で実在する 1 ファイルを処理する', () => {
    /** _discardFiles([file], false, stats) を呼び出すとき。 */
    describe('When: _discardFiles を呼び出す', () => {
      /** 実ファイルが削除され stats.remove が加算されることを検証する。 */
      describe('Then: T-FL-DF-01 - 実ファイルが削除され stats.remove が加算される', () => {
        it('T-FL-DF-01-01: 実ファイルが削除され stats.remove が 1 になる', async () => {
          const filePath = `${periodDir1}/discard-target.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const files: DiscardFile[] = [
            { filePath, filename: 'discard-target.md', reason: 'trivial', decision: 'DISCARD' },
          ];

          await _discardFiles(files, false, stats);
          loggerStub.restore();

          assertEquals(await Deno.stat(filePath).catch(() => null), null);
          assertEquals(stats.remove, 1);
        });

        it('T-FL-DF-01-02: ログに "removed" という文言が出力される', async () => {
          const filePath = `${periodDir1}/discard-target2.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const files: DiscardFile[] = [
            { filePath, filename: 'discard-target2.md', reason: 'trivial', decision: 'DISCARD' },
          ];

          await _discardFiles(files, false, stats);
          loggerStub.restore();

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('removed')), true);
        });
      });
    });
  });

  /**
   * dryRun=true で対象ファイルを処理する前提条件グループ。
   *
   * 実削除を行わず stats.skip のみが加算され、ログ出力もされないことを検証する。
   */
  describe('Given: dryRun=true で 1 ファイルを処理する', () => {
    /** _discardFiles([file], true, stats) を呼び出すとき。 */
    describe('When: _discardFiles を呼び出す', () => {
      /** 実ファイルが削除されず stats.skip が加算され、削除予定のログが出力されることを検証する。 */
      describe('Then: T-FL-DF-02 - 実ファイルは削除されず stats.skip が加算される', () => {
        it('T-FL-DF-02-01: stats.skip が 1 になり実ファイルは削除されない', async () => {
          const filePath = `${periodDir1}/dryrun-target.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const files: DiscardFile[] = [
            { filePath, filename: 'dryrun-target.md', reason: 'trivial', decision: 'DISCARD' },
          ];

          await _discardFiles(files, true, stats);
          loggerStub.restore();

          assertEquals(stats.skip, 1);
          assertEquals(await Deno.stat(filePath).then(() => true).catch(() => false), true);
          assertEquals(loggerStub.infoLogs.length, 1);
        });

        it('T-FL-DF-02-02: ログに "skipped" という文言が出力される', async () => {
          const filePath = `${periodDir1}/dryrun-target2.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const files: DiscardFile[] = [
            { filePath, filename: 'dryrun-target2.md', reason: 'trivial', decision: 'DISCARD' },
          ];

          await _discardFiles(files, true, stats);
          loggerStub.restore();

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('skipped')), true);
        });
      });
    });
  });

  /**
   * dryRun=false で削除対象ファイルが実在しない前提条件グループ。
   *
   * `removeFile` が false を返すケースで stats.error が加算され、stats.remove は増えないことを検証する。
   */
  describe('Given: dryRun=false で削除対象ファイルが実在しない', () => {
    /** _discardFiles([file], false, stats) を呼び出すとき。 */
    describe('When: _discardFiles を呼び出す', () => {
      /** stats.error が加算され、stats.remove は増えないことを検証する。 */
      describe('Then: T-FL-DF-03 - stats.error が 1 になる', () => {
        it('T-FL-DF-03-01: removeFile 失敗 → stats.error === 1, stats.remove === 0', async () => {
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const files: DiscardFile[] = [
            {
              filePath: `${periodDir1}/missing-target.md`,
              filename: 'missing-target.md',
              reason: 'trivial',
              decision: 'DISCARD',
            },
          ];

          // ファイルを作成しないことで removeFile が NotFound → false を返す状態を再現する
          await _discardFiles(files, false, stats);
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
        });

        it('T-FL-DF-03-02: ログに "cant removed" という文言が warn で出力される', async () => {
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const files: DiscardFile[] = [
            {
              filePath: `${periodDir1}/missing-target2.md`,
              filename: 'missing-target2.md',
              reason: 'trivial',
              decision: 'DISCARD',
            },
          ];

          await _discardFiles(files, false, stats);
          loggerStub.restore();

          assertEquals(loggerStub.warnLogs.some((l) => l.includes('cant removed')), true);
        });
      });
    });
  });

  /**
   * 削除対象が 0 件の前提条件グループ。
   *
   * 例外なく正常終了し、stats が変化しないことを検証する。
   */
  describe('Given: 削除対象が 0 件', () => {
    /** _discardFiles([], false, stats) を呼び出すとき。 */
    describe('When: _discardFiles を呼び出す', () => {
      /** stats が変化せず正常終了することを検証する。 */
      describe('Then: T-FL-DF-04 - stats が変化せず正常終了する', () => {
        it('T-FL-DF-04-01: 空配列を渡しても stats は全て 0 のまま', async () => {
          const stats = _makeStats();

          await _discardFiles([], false, stats);

          assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 0 });
        });
      });
    });
  });

  /**
   * `decision` が `DISCARD` 以外（`ERROR` 等）のエントリが誤って渡される前提条件グループ。
   *
   * 呼び出し元が `toDelete` の組み立てを誤った場合でも `_discardFiles` 自体が
   * 誤削除を防ぐガードとして機能し、非 DISCARD エントリは削除されずそのまま戻り値に残ることを検証する。
   */
  describe('Given: decision が DISCARD 以外（ERROR）のエントリを含むファイルリスト', () => {
    /** _discardFiles([discardEntry, errorEntry], false, stats) を呼び出すとき。 */
    describe('When: _discardFiles を呼び出す', () => {
      /** ERROR エントリは削除されず戻り値に残り、DISCARD エントリのみ削除されることを検証する。 */
      describe('Then: T-FL-DF-05 - ERROR エントリは削除されず戻り値に残る', () => {
        it('T-FL-DF-05-01: ERROR エントリは実削除されず、戻り値にそのまま含まれる', async () => {
          const discardPath = `${periodDir1}/guard-discard-target.md`;
          const errorPath = `${periodDir1}/guard-error-target.md`;
          await Deno.writeTextFile(discardPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(errorPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          const loggerStub = makeLoggerStub();
          const stats = _makeStats();
          const errorEntry: DiscardFile = {
            filePath: errorPath,
            filename: 'guard-error-target.md',
            reason: '読み込み失敗',
            decision: FILTER_DECISIONS.ERROR,
          };
          const discardEntry: DiscardFile = {
            filePath: discardPath,
            filename: 'guard-discard-target.md',
            reason: 'trivial',
            decision: FILTER_DECISIONS.DISCARD,
          };

          const result = await _discardFiles([discardEntry, errorEntry], false, stats);
          loggerStub.restore();

          assertEquals(await Deno.stat(errorPath).then(() => true).catch(() => false), true);
          assertEquals(await Deno.stat(discardPath).catch(() => null), null);
          assertEquals(result, [errorEntry]);
          assertEquals(stats.remove, 1);
        });
      });
    });
  });
});
