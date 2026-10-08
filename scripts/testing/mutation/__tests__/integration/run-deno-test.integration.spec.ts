// src: scripts/testing/mutation/__tests__/integration/run-deno-test.integration.spec.ts
// @(#): 実際の deno を起動する run-deno-test の統合テスト
//       対象: runDenoTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runDenoTest } from '../../run-deno-test.ts';

// ─── Helpers
import { join } from '@std/path';
// types
import type { TestRunOutcome } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 子プロセスのテストが待機する時間 (ミリ秒)。制限時間を十分に超える長さにする。 */
const _WAIT_MS = 60_000;

/** `runDenoTest` に渡す制限時間 (ミリ秒)。 */
const _TIMEOUT_MS = 2_000;

/**
 * `timeout` が返るまでの所要時間の上限 (ミリ秒)。
 *
 * 制限時間 2 秒に、子プロセスの `deno` の起動 (型検査を含む) と、kill 後に出力ストリームが閉じるまでの猶予を足した値。
 * 60 秒の待機が自然に終わるのを待った場合とは明確に区別できる。
 */
const _ELAPSED_LIMIT_MS = 15_000;

/** 待機するだけのテストファイルの内容。 */
const _WAITING_TEST_SOURCE = `Deno.test('wait', async () => {
  await new Promise((resolve) => setTimeout(resolve, ${_WAIT_MS}));
});
`;

/** 子プロセスが標準出力・標準エラーへそれぞれ書く文字数 (1 MiB)。ASCII のみなので文字数 = バイト数。 */
const _OUTPUT_SIZE = 1_048_576;

/** パイプ容量を超える出力を待つ制限時間 (ミリ秒)。 */
const _LARGE_OUTPUT_TIMEOUT_MS = 30_000;

/**
 * 標準出力・標準エラーへ各 `_OUTPUT_SIZE` 文字を書き切って終了コード 0 で終わるスクリプトの内容。
 * `write` は一部しか書かないことがあるため、書けたバイト数だけ進めて書き切るまで繰り返す。
 */
const _LARGE_OUTPUT_SOURCE = `const writeAll = async (stream, data) => {
  let offset = 0;
  while (offset < data.length) {
    offset += await stream.write(data.subarray(offset));
  }
};
const payload = new TextEncoder().encode('x'.repeat(${_OUTPUT_SIZE}));
await writeAll(Deno.stdout, payload);
await writeAll(Deno.stderr, payload);
`;

// functions
/**
 * 一時ディレクトリにスクリプトを書き出し、実際の `deno <subcommand>` で実行する。
 * `--no-config` を付け、カレントディレクトリ (リポジトリ) の deno.jsonc / lock を子プロセスに拾わせない。
 *
 * @param dir - スクリプトを書き出す一時ディレクトリ
 * @param fileName - 書き出すスクリプトのファイル名
 * @param source - スクリプトの内容
 * @param subcommand - 子プロセスの `deno` に渡すサブコマンド (`test` / `run`)
 * @param timeoutMs - `runDenoTest` に渡す制限時間 (ミリ秒)
 * @returns `runDenoTest` の結果と、その呼び出しの所要時間 (ミリ秒。スクリプトの書き出しは含まない)
 */
const _runFixture = async (
  dir: string,
  fileName: string,
  source: string,
  subcommand: 'test' | 'run',
  timeoutMs: number,
): Promise<{ result: TestRunOutcome; elapsed: number }> => {
  const _file = join(dir, fileName);
  await Deno.writeTextFile(_file, source);

  const _start = performance.now();
  const _result = await runDenoTest([subcommand, '--no-config', _file], { timeoutMs });
  return { result: _result, elapsed: performance.now() - _start };
};

// ─── Tests

/**
 * 実際の `deno test` を子プロセスで起動する `runDenoTest` の統合テストスイート。
 *
 * 既定の起動元 (スタブなし) で、制限時間を超えた直接の子プロセスが終了させられることを検証する。
 *
 * @see execution R-218 / DD-04 / REQ-NF-003
 */
describe('runDenoTest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'run-deno-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /** 実際の子プロセスが制限時間を超える異常ケース。 */
  describe('When: 実際の deno test が制限時間を超える', () => {
    it(`[Error] T-MUT-RDI-01-01: ${_WAIT_MS}ms 待機するテスト, timeoutMs ${_TIMEOUT_MS} → ${_ELAPSED_LIMIT_MS}ms 未満で { kind: 'timeout' }`, async () => {
      const { result: _result, elapsed: _elapsed } = await _runFixture(
        tempDir,
        'wait.test.ts',
        _WAITING_TEST_SOURCE,
        'test',
        _TIMEOUT_MS,
      );

      assertEquals(_result, { kind: 'timeout' });
      assert(_elapsed < _ELAPSED_LIMIT_MS, `elapsed ${_elapsed}ms は ${_ELAPSED_LIMIT_MS}ms 未満であるべき`);
    });
  });

  /**
   * 実際の子プロセスがパイプの容量を超えて出力するエッジケース。
   *
   * @see execution R-217 / DD-03
   */
  describe('When: 実際の子プロセスがパイプの容量を超えて出力する', () => {
    it(`[Edge] T-MUT-RDI-02-01: stdout・stderr に各 ${_OUTPUT_SIZE} 文字を書き exit 0, timeoutMs ${_LARGE_OUTPUT_TIMEOUT_MS} → 詰まらず exited code 0 で全量捕捉`, async () => {
      const { result: _result } = await _runFixture(
        tempDir,
        'large-output.ts',
        _LARGE_OUTPUT_SOURCE,
        'run',
        _LARGE_OUTPUT_TIMEOUT_MS,
      );

      assert(_result.kind === 'exited', `kind は exited であるべき (実際: ${_result.kind})`);
      assertEquals(_result.code, 0);
      assertEquals(_result.stdout.length, _OUTPUT_SIZE);
      assertEquals(_result.stderr.length, _OUTPUT_SIZE);
    });
  });
});
