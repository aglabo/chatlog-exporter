// src: scripts/testing/mutation/__tests__/unit/baseline.unit.spec.ts
// @(#): baseline のユニットテスト
//       対象: runBaseline
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStrictEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { runBaseline } from '../../baseline.ts';

// ─── Helpers
// types
import type { TestRunnerProvider, TestRunOptions, TestRunOutcome } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 終了コード 0 で 1 件以上 passed したテスト実行結果。 */
const _SUCCESS_OUTCOME: TestRunOutcome = { kind: 'exited', code: 0, stdout: 'ok | 3 passed | 0 failed', stderr: '' };

/** 中断信号を持たない、既定の実行オプション (制限時間 120 秒)。 */
const _DEFAULT_OPTIONS: TestRunOptions = { timeoutMs: 120000 };

// types
/** runner スタブが受け取った呼び出し内容。 */
type _RunnerCall = {
  /** runner に渡した `deno` の引数。 */
  args: string[];
  /** runner に渡した実行の制限時間と中断信号。 */
  options: TestRunOptions;
};

/** ベースラインが `failed` になるテスト実行結果のテーブル駆動ケース。 */
type _FailedCase = {
  /** テスト ID。 */
  id: string;
  /** ケースの説明 (it ラベルに埋め込む)。 */
  title: string;
  /** runner が返すテスト実行結果。 */
  outcome: TestRunOutcome;
};

// functions
/**
 * 引数に関わらず、指定のテスト実行結果を返す runner スタブを作る。
 * 実プロセスは起動しない (unit runner は `--allow-run` を持たない)。
 *
 * @param outcome - runner が返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRunnerStub = (outcome: TestRunOutcome): TestRunnerProvider => () => Promise.resolve(outcome);

/**
 * 呼び出し内容を `calls` に記録してから、`inner` に処理を委ねる runner スタブを作る。
 * 実プロセスは起動しない。
 *
 * @param calls - 呼び出し内容 (引数と実行オプション) の記録先
 * @param inner - 結果を返す runner スタブ (省略時は成功した結果を返す)
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRecordingRunnerStub = (
  calls: _RunnerCall[],
  inner: TestRunnerProvider = _makeRunnerStub(_SUCCESS_OUTCOME),
): TestRunnerProvider =>
(args: string[], options: TestRunOptions) => {
  calls.push({ args: [...args], options });
  return inner(args, options);
};

/**
 * 呼び出されると `ctl` を中止してから、指定のテスト実行結果を返す runner スタブを作る。
 * 実行中に中断された状況を再現する。実プロセスは起動しない。
 *
 * @param ctl - 呼び出し時に中止する AbortController
 * @param outcome - 中止後に runner が返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeAbortingRunnerStub = (ctl: AbortController, outcome: TestRunOutcome): TestRunnerProvider => () => {
  ctl.abort();
  return Promise.resolve(outcome);
};

/**
 * 呼び出されると `Error('spawn failed')` で reject する runner スタブを作る。
 * 実プロセスは起動しない。
 *
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeThrowingRunnerStub = (): TestRunnerProvider => () => Promise.reject(new Error('spawn failed'));

/**
 * 指定のテスト実行結果を返す runner と既定の引数・実行オプションで、ベースラインを判定する。
 *
 * @param outcome - runner が返すテスト実行結果
 * @returns `runBaseline` の判定結果
 */
const _runWithOutcome = (outcome: TestRunOutcome): ReturnType<typeof runBaseline> =>
  runBaseline(_makeRunnerStub(outcome), ['test'], _DEFAULT_OPTIONS);

/**
 * 指定のテスト実行結果を返す runner でベースラインを判定し、`failed` の理由を取り出す。
 * 判定が `failed` でなければ、その時点でテストを失敗させる。
 *
 * @param outcome - runner が返すテスト実行結果
 * @returns `failed` の判定が持つ理由
 */
const _runFailedReason = async (outcome: TestRunOutcome): Promise<string> => {
  const _result = await _runWithOutcome(outcome);
  assert(_result.kind === 'failed', `kind は failed であるべき (実際: ${_result.kind})`);
  return _result.reason;
};

// ─── Tests

/**
 * `runBaseline` のユニットテストスイート。
 *
 * 変異体を流す前に元のコードでテストを 1 回実行し、その結果から続行できるかを判定することを検証する
 * (execution R-209 / REQ-F-016 / DR-08)。
 *
 * @see runBaseline
 */
describe('runBaseline', () => {
  /**
   * 終了コード 0 で passed が 1 件以上なら `ok` になる (execution R-209 / REQ-F-016 / DR-08)。
   */
  describe('ベースラインの成功', () => {
    /** テストが成功した結果を runner が返す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-BL-01-01: 終了コード 0 / ok | 3 passed | 0 failed → ok', async () => {
        assertEquals(await _runWithOutcome(_SUCCESS_OUTCOME), { kind: 'ok' });
      });
    });
  });

  /**
   * 元の設定のまま実行するため、引数と実行オプションを変えずに runner へ渡す (execution R-207 / DD-10)。
   */
  describe('runner への受け渡し', () => {
    /** 引数を記録する runner に成功した結果を返させる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-BL-02-01: args [test, a.unit.spec.ts] → runner は同じ args を受け取り、--config deno.mutation-* を含まない', async () => {
        const _calls: _RunnerCall[] = [];

        await runBaseline(_makeRecordingRunnerStub(_calls), ['test', 'a.unit.spec.ts'], _DEFAULT_OPTIONS);

        assertEquals(_calls[0].args, ['test', 'a.unit.spec.ts']);
        assertEquals(_calls[0].args.filter((arg) => arg === '--config' || arg.startsWith('deno.mutation-')), []);
      });

      it('[Normal] T-MUT-BL-02-02: timeoutMs 120000 → runner は同じ timeoutMs 120000 を受け取る', async () => {
        const _calls: _RunnerCall[] = [];

        await runBaseline(_makeRecordingRunnerStub(_calls), ['test'], { timeoutMs: 120000 });

        assertEquals(_calls[0].options.timeoutMs, 120000);
      });

      it('[Normal] T-MUT-BL-02-03: 成功を返す runner → runner は 1 回だけ呼ばれる', async () => {
        const _calls: _RunnerCall[] = [];

        await runBaseline(_makeRecordingRunnerStub(_calls), ['test'], _DEFAULT_OPTIONS);

        assertEquals(_calls.length, 1);
      });
    });
  });

  /**
   * 元のコードのままテストが通らなければ、変異体を流さずに `failed` で止める
   * (execution R-208 / REQ-F-016 / AC-017)。
   */
  describe('ベースラインの失敗', () => {
    /** 続行できないテスト実行結果を runner が返す異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: _FailedCase[] = [
        {
          id: 'T-MUT-BL-03-01',
          title: '終了コード 1 / FAILED | 2 passed | 1 failed',
          outcome: { kind: 'exited', code: 1, stdout: 'FAILED | 2 passed | 1 failed', stderr: '' },
        },
        {
          id: 'T-MUT-BL-03-02',
          title: '制限時間超過 (timeout)',
          outcome: { kind: 'timeout' },
        },
        {
          id: 'T-MUT-BL-03-03',
          title: '起動失敗 (error: deno not found)',
          outcome: { kind: 'error', message: 'deno not found' },
        },
        {
          id: 'T-MUT-BL-03-04',
          title: '終了コード 0 / ok | 0 passed | 0 failed',
          outcome: { kind: 'exited', code: 0, stdout: 'ok | 0 passed | 0 failed', stderr: '' },
        },
        {
          id: 'T-MUT-BL-03-05',
          title: '終了コード 0 / 空出力 (要約行なし)',
          outcome: { kind: 'exited', code: 0, stdout: '', stderr: '' },
        },
      ];

      for (const { id, title, outcome } of _cases) {
        it(`[Error] ${id}: ${title} → failed`, async () => {
          const _result = await _runWithOutcome(outcome);

          assertEquals(_result.kind, 'failed');
        });
      }
    });
  });

  /**
   * `failed` の判定には、利用者が原因を追える理由を記録する (execution R-208 / REQ-F-013 (d))。
   */
  describe('失敗理由の記録', () => {
    /** 続行できないテスト実行結果を runner が返す異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-BL-04-01: 起動失敗 (error: deno not found) → reason に deno not found を含む', async () => {
        const _reason = await _runFailedReason({ kind: 'error', message: 'deno not found' });

        assertStringIncludes(_reason, 'deno not found');
      });

      const _cases: _FailedCase[] = [
        {
          id: 'T-MUT-BL-04-02',
          title: '制限時間超過 (timeout)',
          outcome: { kind: 'timeout' },
        },
        {
          id: 'T-MUT-BL-04-03',
          title: 'passed 0 件 (exit 0 + "0 passed")',
          outcome: { kind: 'exited', code: 0, stdout: 'ok | 0 passed | 0 failed', stderr: '' },
        },
        {
          id: 'T-MUT-BL-04-04',
          title: '要約行なし (exit 0 + 空出力)',
          outcome: { kind: 'exited', code: 0, stdout: '', stderr: '' },
        },
      ];

      for (const { id, title, outcome } of _cases) {
        it(`[Error] ${id}: ${title} → reason が空でない`, async () => {
          const _reason = await _runFailedReason(outcome);

          assert(_reason.length > 0, `reason は空でないべき (実際: ${JSON.stringify(_reason)})`);
        });
      }
    });
  });

  /**
   * 実行中に中断信号が中止されたら、`failed` ではなく `interrupted` を返す (execution R-227)。
   */
  describe('ベースライン実行中の中断', () => {
    /** 中断信号を渡し、runner への受け渡しや呼び出し中の中止を扱う境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-BL-05-01: 呼び出し中に abort + 終了コード 1 → interrupted', async () => {
        const _ctl = new AbortController();
        const _runner = _makeAbortingRunnerStub(_ctl, { kind: 'exited', code: 1, stdout: '', stderr: '' });

        const _result = await runBaseline(_runner, ['test'], { ..._DEFAULT_OPTIONS, signal: _ctl.signal });

        assertEquals(_result, { kind: 'interrupted' });
      });

      it('[Edge] T-MUT-BL-05-03: 呼び出し中に abort + 成功相当の結果 → ok ではなく interrupted', async () => {
        const _ctl = new AbortController();
        const _runner = _makeAbortingRunnerStub(_ctl, _SUCCESS_OUTCOME);

        const _result = await runBaseline(_runner, ['test'], { ..._DEFAULT_OPTIONS, signal: _ctl.signal });

        assertEquals(_result, { kind: 'interrupted' });
      });

      it('[Edge] T-MUT-BL-05-04: 呼び出し前に abort 済み + 成功結果 → ok ではなく interrupted', async () => {
        const _ctl = new AbortController();
        _ctl.abort();

        const _result = await runBaseline(_makeRunnerStub(_SUCCESS_OUTCOME), ['test'], {
          ..._DEFAULT_OPTIONS,
          signal: _ctl.signal,
        });

        assertEquals(_result, { kind: 'interrupted' });
      });

      it('[Edge] T-MUT-BL-05-02: signal: ctl.signal → runner は同じ signal オブジェクトを受け取る', async () => {
        const _ctl = new AbortController();
        const _calls: _RunnerCall[] = [];

        await runBaseline(_makeRecordingRunnerStub(_calls), ['test'], { ..._DEFAULT_OPTIONS, signal: _ctl.signal });

        assertStrictEquals(_calls[0].options.signal, _ctl.signal);
      });
    });
  });

  /**
   * 要約行が ANSI エスケープで装飾されていても、除去してから passed 件数を読む (execution DD-06)。
   */
  describe('ANSI 付きの要約行', () => {
    /** 色付き出力の要約行を返す runner を渡す境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-BL-06-01: 終了コード 0 / ANSI 装飾付きの 3 passed → ok', async () => {
        const _outcome: TestRunOutcome = {
          kind: 'exited',
          code: 0,
          stdout: '\x1b[32mok\x1b[0m | 3 passed | 0 failed',
          stderr: '',
        };

        assertEquals(await _runWithOutcome(_outcome), { kind: 'ok' });
      });
    });
  });

  /**
   * passed がちょうど 1 件でも `ok` になり、下限は 1 件とする (execution R-209 / DD-06)。
   */
  describe('passed 件数の下限', () => {
    /** passed が下限ちょうどの要約行を返す runner を渡す境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-BL-07-01: 終了コード 0 / ok | 1 passed | 0 failed → ok', async () => {
        const _outcome: TestRunOutcome = { kind: 'exited', code: 0, stdout: 'ok | 1 passed | 0 failed', stderr: '' };

        assertEquals(await _runWithOutcome(_outcome), { kind: 'ok' });
      });
    });
  });

  /**
   * runner の例外は投げ直さず、`failed` の判定に変換する (execution R-208 / DD-10)。
   */
  describe('runner が例外を投げる', () => {
    /** 呼び出し時に例外を投げる runner を渡す異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-BL-08-01: runner が Error("spawn failed") を投げる → reject せず failed', async () => {
        const _result = await runBaseline(_makeThrowingRunnerStub(), ['test'], _DEFAULT_OPTIONS);

        assertEquals(_result.kind, 'failed');
      });
    });
  });
});
