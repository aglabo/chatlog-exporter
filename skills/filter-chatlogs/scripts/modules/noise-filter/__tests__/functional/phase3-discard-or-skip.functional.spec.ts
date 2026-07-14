// src: scripts/modules/noise-filter/__tests__/functional/phase3-discard-or-skip.functional.spec.ts
// @(#): process-noise-files.ts の機能テスト
//       対象: _phase3DiscardOrSkip — ノイズ確定ファイルの削除/dry-run 実行
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase3DiscardOrSkip } from '../../process-noise-files.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { fileExists } from '../../../../../../_scripts/libs/file-ops/exists-utils.ts';
// types
import type { LoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';

// ─── Tests

/**
 * `_phase3DiscardOrSkip` 関数の機能テストスイート。
 *
 * ノイズ判定確定ファイル（`NoiseDiscardFile[]`）を受け取り、`dryRun` に応じて
 * 実削除または dry-run ログ出力を行い、`stats` を加算する。
 *
 * テスト ID 範囲: T-PF-P3-01 〜 T-PF-P3-03
 *
 * @see _phase3DiscardOrSkip
 */
describe('_phase3DiscardOrSkip', () => {
  /** テスト用一時ディレクトリ。 */
  let tempDir: string;

  /** logger stub。 */
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-PF-P3-01: 通常モード → 実削除され stats.remove 加算 ──────────────────

  describe('Given: ノイズ確定ファイル 1 件と dryRun=false', () => {
    describe('When: _phase3DiscardOrSkip(discardFiles, stats, false) を呼び出す', () => {
      describe('Then: T-PF-P3-01 - ファイルが削除され stats.remove が 1 になる', () => {
        it('T-PF-P3-01-01: ファイルが削除され stats.remove=1、logger.info に "deleted:" が出力される', async () => {
          const filePath = `${tempDir}/noise.md`;
          await Deno.writeTextFile(filePath, 'dummy');
          const discardFiles = [
            { filePath, filename: 'noise.md', reason: 'テスト理由', decision: FILTER_DECISIONS.DISCARD },
          ];
          const stats = { keep: 0, skip: 0, remove: 0, error: 0 };

          await _phase3DiscardOrSkip(discardFiles, stats, false);

          assertEquals(await fileExists(filePath), false);
          assertEquals(stats.remove, 1);
          assertEquals(loggerStub.infoLogs.some((line) => line.includes(`deleted: ${filePath}`)), true);
          assertEquals(loggerStub.infoLogs.some((line) => line.includes('テスト理由')), true);
        });
      });
    });
  });

  // ─── T-PF-P3-02: dry-run モード → 削除されずログ出力、stats.skip 加算 ────────

  describe('Given: ノイズ確定ファイル 1 件と dryRun=true', () => {
    describe('When: _phase3DiscardOrSkip(discardFiles, stats, true) を呼び出す', () => {
      describe('Then: T-PF-P3-02 - ファイルが削除されず stats.skip が 1 になる', () => {
        it('T-PF-P3-02-01: ファイルが削除されずに残り stats.skip=1、logger.log には出力されず logger.info にファイルパスと reason が出力される', async () => {
          const filePath = `${tempDir}/noise.md`;
          await Deno.writeTextFile(filePath, 'dummy');
          const discardFiles = [
            { filePath, filename: 'noise.md', reason: 'テスト理由', decision: FILTER_DECISIONS.DISCARD },
          ];
          const stats = { keep: 0, skip: 0, remove: 0, error: 0 };

          await _phase3DiscardOrSkip(discardFiles, stats, true);

          assertEquals(await fileExists(filePath), true);
          assertEquals(stats.skip, 1);
          assertEquals(loggerStub.logLogs, []);
          assertEquals(
            loggerStub.infoLogs.some((line) => line.includes(filePath) && line.includes('テスト理由')),
            true,
          );
        });
      });
    });
  });

  // ─── T-PF-P3-03: 削除対象ファイルが実削除前に既に存在しない → stats.error 加算 ─

  describe('Given: ノイズ確定ファイルが実削除前に既に存在しない', () => {
    describe('When: _phase3DiscardOrSkip(discardFiles, stats, false) を呼び出す', () => {
      describe('Then: T-PF-P3-03 - stats.error が 1 になる', () => {
        it('T-PF-P3-03-01: removeFile 失敗 → stats.error=1, stats.remove=0', async () => {
          const filePath = `${tempDir}/vanished.md`;
          const discardFiles = [
            { filePath, filename: 'vanished.md', reason: 'テスト理由', decision: FILTER_DECISIONS.DISCARD },
          ];
          const stats = { keep: 0, skip: 0, remove: 0, error: 0 };

          await _phase3DiscardOrSkip(discardFiles, stats, false);

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
          assertEquals(loggerStub.warnLogs.some((line) => line.includes(filePath)), true);
        });
      });
    });
  });
});
