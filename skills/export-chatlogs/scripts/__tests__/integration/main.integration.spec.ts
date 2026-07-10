// src: scripts/__tests__/integration/main.integration.spec.ts
// @(#): export-chatlogs main() のオーケストレーション結合テスト
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../export-chatlogs.ts';
// types
import type { RunExportProvider } from '../../export-chatlogs.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// types
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { ExportResult } from '../../types/export-result.types.ts';

// ─── Internal Helpers

// constants
/** `runExport` の代わりに main() へ注入するスタブが解決する `ExportResult`。 */
const _STUB_RESULT: ExportResult = {
  exportedCount: 1,
  skippedCount: 0,
  errorCount: 0,
  outputPaths: ['/tmp/foo.md'],
};

// functions
/** `_STUB_RESULT` を resolve する `RunExportProvider` スタブを生成する。 */
const _makeResolvingRunExport = (): RunExportProvider => () => Promise.resolve(_STUB_RESULT);

/** 指定した `ChatlogError` を reject する `RunExportProvider` スタブを生成する。 */
const _makeRejectingRunExport = (error: ChatlogError): RunExportProvider => () => Promise.reject(error);

// ─── Tests

/**
 * `main()` のオーケストレーション結合テストスイート。
 *
 * `runExportFn` に注入したスタブを介して、config構築 → runExportFn 呼び出し →
 * ログ出力／エラー伝播という main() 自身の処理フローを、実 exporter I/O なしで検証する。
 *
 * @see main
 * @see RunExportProvider
 */
describe('main (integration)', () => {
  let outputDir: string;
  let loggerStub: LoggerStub;

  beforeEach(() => {
    outputDir = '/tmp/export-chatlogs-integration';
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
    GlobalConfig.resetInstance();
  });

  /** runExportFn が正常に resolve するときのログ出力を検証する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-EC-MI-01: runExportFn が resolve する ExportResult で main() が正常に resolve する', async () => {
      const stubRunExport = _makeResolvingRunExport();

      await main(['claude', '--export-dir', outputDir], stubRunExport);
    });

    it('[Normal] T-EC-MI-02: result.outputPaths の各要素が logger.log に渡される', async () => {
      const stubRunExport = _makeResolvingRunExport();

      await main(['claude', '--export-dir', outputDir], stubRunExport);

      assertEquals(loggerStub.logLogs, _STUB_RESULT.outputPaths);
    });

    it('[Normal] T-EC-MI-03: 件数集計を含むサマリーが logger.info に渡される', async () => {
      const stubRunExport = _makeResolvingRunExport();

      await main(['claude', '--export-dir', outputDir], stubRunExport);

      assertEquals(
        loggerStub.infoLogs.some((msg) => msg.includes('完了') && msg.includes('1')),
        true,
      );
    });
  });

  /** runExportFn が reject するときのエラー伝播を検証する。 */
  describe('When: 異常系', () => {
    it('[Error] T-EC-MI-04: runExportFn が ChatlogError を reject → main() が同じエラーで reject する', async () => {
      const _error = new ChatlogError('InvalidArgs', 'UnsupportedAgent', 'テスト用エラー');
      const stubRunExport = _makeRejectingRunExport(_error);

      const rejected = await assertRejects(
        () => main(['claude', '--export-dir', outputDir], stubRunExport),
        ChatlogError,
      );
      assertStringIncludes((rejected as ChatlogError).message, 'テスト用エラー');
    });
  });
});
