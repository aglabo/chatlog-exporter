// src: scripts/__tests__/system/export-chatlogs.main.system.spec.ts
// @(#): export-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals, assertRejects, assertStrictEquals, assertStringIncludes } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// -- Test target --
import { main } from '../../export-chatlogs.ts';

// -- Helpers --
import { useDefaultGlobalConfig } from '../../../../_cle-libs/__tests__/helpers/global-config-setup.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';
// types
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { RunExportProvider } from '../../export-chatlogs.ts';
import type { ExportConfig } from '../../types/export-config.types.ts';
import type { ExportResult } from '../../types/export-result.types.ts';

/** テスト対象スクリプト `export-chatlogs.ts` への絶対パス。サブプロセス起動時の引数として使用する。 */
const SCRIPT_PATH = new URL('../../export-chatlogs.ts', import.meta.url).pathname;

/**
 * `export-chatlogs.ts` を Deno サブプロセスとして起動し、終了コードを返す。
 * システムテストで実際のプロセス終了コードを検証するために使用する。
 */
async function runExport(args: string[]): Promise<number> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
}

/**
 * `export-chatlogs.ts` を Deno サブプロセスとして起動し、終了コードと stderr を返す。
 * CLI エントリがエラーを `::error::` 形式で出力することや、正常終了時の終了コードを検証するために使用する。
 *
 * @param args - スクリプトへ渡す CLI 引数
 * @param env - サブプロセスへ追加で渡す環境変数（TEMP / TMP の差し替え等）
 */
async function _runExportWithStderr(
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stderr: string }> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', '--allow-env', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'piped',
    ...(env ? { env } : {}),
  });
  const _output = await _cmd.output();
  return { code: _output.code, stderr: new TextDecoder().decode(_output.stderr) };
}

/**
 * 受け取った `ExportConfig` を記録し、固定の `ExportResult` を返す `runExportFn` スタブを作る。
 * `Error` を渡すと、記録したうえでその `Error` で reject する。
 * main() が runExportFn に何を渡したかを検証するために使用する。
 *
 * @param outcome - スタブが返す固定の結果、または reject に使う `Error`
 * @returns スタブ本体と、受け取った config の記録配列
 */
const _makeRunExportStub = (outcome: ExportResult | Error): { fn: RunExportProvider; received: ExportConfig[] } => {
  const received: ExportConfig[] = [];
  const fn: RunExportProvider = (config) => {
    received.push(config);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
  return { fn, received };
};

/**
 * errorCount 1 の結果を作る。
 *
 * @returns 1 件エラーの `ExportResult`
 */
const _makeErrorCountResult = (): ExportResult => ({
  exportedCount: 0,
  skippedCount: 0,
  errorCount: 1,
  outputPaths: [],
});

/**
 * errorCount 0 の成功結果を作る。
 *
 * @param exportDir - 出力パスの基点とするディレクトリ
 * @returns 1 件出力済みの `ExportResult`
 */
const _makeSuccessResult = (exportDir: string): ExportResult => ({
  exportedCount: 1,
  skippedCount: 0,
  errorCount: 0,
  outputPaths: [`${exportDir}/claude/sess-001.md`],
});

// ─── T-EC-SYS-01: 不明なオプション → exit(1) ─────────────────────────────────

/**
 * `main` 関数のシステムテストスイート（実プロセス起動）。
 *
 * export-chatlogs をサブプロセスとして起動し、終了コードを検証する。
 * 不明なオプション指定時に exit(1) で終了することをカバーする。
 *
 * @see main
 */
describe('main - エラー終了コード', () => {
  /**
   * 不明なオプション指定で exit(1) になるシナリオ。
   * parseArgs がエラーをスローしたとき、main がそれを catch して
   * exit(1) で終了することをサブプロセス起動で確認する。
   */
  describe('Given: 不明なオプション "--unknown-flag" を指定', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-01: プロセスが終了コード 1 で終了する */
      describe('Then: T-EC-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-EC-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runExport(['claude', '--unknown-flag']);
          assertEquals(code, 1);
        });
      });
    });
  });

  /**
   * ChatlogError がスローされるシナリオ。
   * CLI エントリが例外を捕捉し、`::error::` 付きメッセージを出して exit(1) することを確認する。
   */
  describe('Given: chatgpt エージェントに入力ディレクトリを指定しない', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-02: ChatlogError を捕捉して ::error:: を出力し exit(1) する */
      describe('Then: T-EC-SYS-02 - ChatlogError を ::error:: として出力し終了コード 1 で終了する', () => {
        it('[Error] T-EC-SYS-02-01: exit 1、stderr に ::error:: Invalid Args を含み Uncaught を含まない', async () => {
          const { code, stderr } = await _runExportWithStderr(['chatgpt']);

          assertEquals(code, 1);
          assertStringIncludes(
            stderr,
            '::error:: Invalid Args: chatgpt エージェントには入力ディレクトリを指定してください',
          );
          assertEquals(stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${stderr}`);
        });
      });
    });
  });

  /**
   * ChatlogError 以外の Error (NotADirectory) がスローされるシナリオ。
   * CLI エントリが再スローせずに `::error::` を出して exit(1) することを確認する。
   */
  describe('Given: --input-dir に通常ファイルを指定', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-03: ChatlogError 以外の Error も捕捉して exit(1) する */
      describe('Then: T-EC-SYS-03 - ChatlogError 以外の Error も ::error:: として出力し終了コード 1 で終了する', () => {
        it('[Error] T-EC-SYS-03-01: exit 1、stderr に ::error:: と readdir を含み Uncaught を含まない', async () => {
          const tmpFile = await Deno.makeTempFile();
          try {
            const { code, stderr } = await _runExportWithStderr(['chatgpt', '--input-dir', tmpFile]);

            assertEquals(code, 1);
            assertStringIncludes(stderr, '::error::');
            assertStringIncludes(stderr, 'readdir');
            assertEquals(stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${stderr}`);
          } finally {
            await Deno.remove(tmpFile);
          }
        });
      });
    });
  });
});

// ─── T-EC-SYS-07: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

/**
 * `main` 関数のエントリポイント正常終了テスト（実プロセス起動）。
 *
 * サブプロセスでは runExportFn を差し替えられないため、実エクスポータの成功経路として
 * 空の inputDir を指定した chatgpt エクスポートを使う。ユーザーの実履歴
 * （~/.claude / ~/.codex）は読まず、GlobalConfig・出力先・TEMP / TMP はすべて tempDir に向ける。
 *
 * @see main
 */
describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 会話ファイルが 0 件の inputDir を chatgpt エージェントで指定', () => {
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      let tempDir: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        tempDir = await Deno.makeTempDir();
        const _inputDir = `${tempDir}/input`;
        await Deno.mkdir(_inputDir);
        // GlobalConfig・出力先が tempDir 配下へ向くよう、--config / --export-dir と TEMP / TMP を tempDir に向ける
        const _configFile = `${tempDir}/config.yaml`;
        await Deno.writeTextFile(_configFile, `chatlogsDir: "${normalizePath(tempDir)}/chatlogs"\n`);
        _result = await _runExportWithStderr(
          ['chatgpt', '--input-dir', _inputDir, '--export-dir', `${tempDir}/output`, '--config', _configFile],
          { TEMP: tempDir, TMP: tempDir },
        );
      });

      afterAll(async () => {
        await Deno.remove(tempDir, { recursive: true });
      });

      describe('Then: T-EC-SYS-07 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-EC-SYS-07-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-EC-SYS-07-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-EC-SYS-04..06: main() の戻り値 (in-process) ───────────────────────────

/**
 * `main` 関数の in-process テストスイート。
 *
 * runExportFn をスタブに差し替え、main() が終了コード 0 を返すこと、
 * runExportFn の例外を握り潰さないことを検証する。
 *
 * @see main
 */
describe('main - 戻り値 (in-process)', () => {
  useDefaultGlobalConfig();

  let tempDir: string;
  let exportDir: string;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    exportDir = `${tempDir}/output`;
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  /** runExportFn が errorCount 0 の結果を返すシナリオ */
  describe('Given: runExportFn が errorCount 0 の結果を返す', () => {
    describe('When: 正常系', () => {
      describe('Then: T-EC-SYS-04 - main() は 0 を返し完了ログを出す', () => {
        it('[Normal] T-EC-SYS-04-01: 戻り値が 0 である', async () => {
          const { fn } = _makeRunExportStub(_makeSuccessResult(exportDir));

          assertEquals(await main(['claude', '--export-dir', exportDir], fn), 0);
        });

        it('[Normal] T-EC-SYS-04-02: info ログに "完了: " を含む', async () => {
          const { fn } = _makeRunExportStub(_makeSuccessResult(exportDir));

          await main(['claude', '--export-dir', exportDir], fn);

          assertStringIncludes(loggerStub.infoLogs.join('\n'), '完了: ');
        });

        it('[Normal] T-EC-SYS-04-03: runExportFn が exportDir を含む config を 1 回受け取る', async () => {
          const { fn, received } = _makeRunExportStub(_makeSuccessResult(exportDir));

          await main(['claude', '--export-dir', exportDir], fn);

          assertEquals(received.length, 1);
          assertEquals(received[0].exportDir, normalizePath(exportDir));
        });

        it('[Normal] T-EC-SYS-04-04: runExportFn が受け取る config の agent が "claude" である', async () => {
          const { fn, received } = _makeRunExportStub(_makeSuccessResult(exportDir));

          await main(['claude', '--export-dir', exportDir], fn);

          assertEquals(received[0].agent, 'claude');
        });
      });
    });
  });

  /** runExportFn が errorCount 1 の結果を返すシナリオ */
  describe('Given: runExportFn が errorCount 1 の結果を返す', () => {
    describe('When: エッジケース', () => {
      describe('Then: T-EC-SYS-05 - errorCount > 0 でも main() は 0 を返す', () => {
        it('[Edge] T-EC-SYS-05-01: 戻り値が 0 である', async () => {
          const { fn } = _makeRunExportStub(_makeErrorCountResult());

          assertEquals(await main(['claude', '--export-dir', exportDir], fn), 0);
        });

        it('[Edge] T-EC-SYS-05-02: runExportFn がちょうど 1 回呼ばれる', async () => {
          const { fn, received } = _makeRunExportStub(_makeErrorCountResult());

          await main(['claude', '--export-dir', exportDir], fn);

          assertEquals(received.length, 1);
        });

        it('[Edge] T-EC-SYS-05-03: 完了サマリの info ログに "エラー: 1" を含む', async () => {
          const { fn } = _makeRunExportStub(_makeErrorCountResult());

          await main(['claude', '--export-dir', exportDir], fn);

          assertStringIncludes(loggerStub.infoLogs.join('\n'), 'エラー: 1');
        });
      });
    });
  });

  /** runExportFn が例外を投げるシナリオ */
  describe('Given: runExportFn が Error を throw する', () => {
    describe('When: 異常系', () => {
      describe('Then: T-EC-SYS-06 - main() は例外を握り潰さず同じエラーで reject する', () => {
        it('[Error] T-EC-SYS-06-01: runExportFn が投げたエラーと同一インスタンスで reject する', async () => {
          const _err = new Error('stub export failure');
          const { fn } = _makeRunExportStub(_err);

          const _e = await assertRejects(() => main(['claude', '--export-dir', exportDir], fn));

          assertStrictEquals(_e, _err);
        });

        it('[Error] T-EC-SYS-06-02: throw する runExportFn が正規化済みの exportDir を受け取る', async () => {
          const { fn, received } = _makeRunExportStub(new Error('stub export failure'));

          await assertRejects(() => main(['claude', '--export-dir', exportDir], fn));

          assertEquals(received[0]?.exportDir, normalizePath(exportDir));
        });

        it('[Error] T-EC-SYS-06-03: reject 後の info ログに "完了: " を含まない', async () => {
          const { fn } = _makeRunExportStub(new Error('stub export failure'));

          await assertRejects(() => main(['claude', '--export-dir', exportDir], fn));

          const _info = loggerStub.infoLogs.join('\n');
          assertEquals(_info.includes('完了: '), false, `info logs contain 完了:\n${_info}`);
        });
      });
    });
  });
});
