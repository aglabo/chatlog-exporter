// src: skills/_scripts/libs/ai/__tests__/unit/run-ai.unit.spec.ts
// @(#): run-ai のユニットテスト
//       対象: runAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _buildCommand, runAI } from '../../run-ai.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';
// types
import type { CommandMockHandle } from '../../../../__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeDelayedSuccessMock,
  makeSuccessMock,
} from '../../../../__tests__/helpers/deno-command-mock.ts';

// ─── Internal Helpers

// types
type CommandSpec = { command: string; args: string[]; hasSystemPromptWithArgs: boolean };

// functions
/**
 * `Deno.Command` の代替クラスを返すファクトリ。
 * spawn() が固定の `CommandOutput` を返すフェイクを生成する。
 *
 * @param output - spawn().output() が解決する `Deno.CommandOutput`
 * @returns `Deno.Command` と互換の偽クラス
 */
const _makeCommandStub = (output: Deno.CommandOutput) => {
  return class {
    constructor(_cmd: string, _opts: unknown) {}
    spawn() {
      return {
        stdin: { getWriter: () => ({ write: () => Promise.resolve(), close: () => Promise.resolve() }) },
        output: () => Promise.resolve(output),
      };
    }
  };
};

/**
 * `Deno.Command` の代替クラスを返すファクトリ。
 * spawn().output() が常に reject するフェイクを生成する（外部 signal abort 時の挙動を再現）。
 *
 * @returns `Deno.Command` と互換の偽クラス
 */
const _makeRejectingCommandStub = () => {
  return class {
    constructor(_cmd: string, _opts: unknown) {}
    spawn() {
      return {
        stdin: { getWriter: () => ({ write: () => Promise.resolve(), close: () => Promise.resolve() }) },
        output: () => Promise.reject(new Error('aborted')),
      };
    }
  };
};

// constants
/** レートリミット検出のテーブル駆動ケース (RA-13, RA-14, RA-15)。 */
const _rateLimitCases = [
  { id: 'T-LIB-AI-RA-13', label: 'Error', stderr: 'You have hit the rate limit', desc: '"rate limit"' },
  { id: 'T-LIB-AI-RA-14', label: 'Error', stderr: 'HTTP 429 Too Many Requests', desc: '"429"' },
  { id: 'T-LIB-AI-RA-15', label: 'Edge', stderr: 'Error code 4290', desc: '"4290" (部分マッチ仕様)' },
] as const;

const _cases: Array<{ model: string; expected: CommandSpec }> = [
  {
    model: 'sonnet',
    expected: {
      command: 'claude',
      args: [
        '-p',
        '--system-prompt',
        'sys',
        '--output-format',
        'text',
        '--permission-mode',
        'acceptEdits',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--model',
        'sonnet',
      ],
      hasSystemPromptWithArgs: true,
    },
  },
  {
    model: 'gpt-5',
    expected: { command: 'codex', args: ['exec', '--model', 'gpt-5'], hasSystemPromptWithArgs: false },
  },
  {
    model: 'copilot/gpt-4',
    expected: { command: 'copilot', args: ['--model', 'gpt-4'], hasSystemPromptWithArgs: false },
  },
  {
    model: 'openai/gpt-4',
    expected: { command: 'opencode', args: ['run', '--model', 'openai/gpt-4'], hasSystemPromptWithArgs: false },
  },
];

// ─── Tests

// GlobalConfig はシングルトンのため、他のテストへの状態漏れを防ぐために
// ファイル全体で毎回リセットする（このファイル内の全 describe に適用）。
beforeEach(() => {
  GlobalConfig.resetInstance();
});

afterEach(() => {
  GlobalConfig.resetInstance();
});

/**
 * `_buildCommand` 関数のユニットテストスイート。
 *
 * モデル名から CLI コマンド・引数・hasSystemPromptWithArgs フラグを正しく生成することを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-RA-02 〜 T-LIB-AI-RA-05
 *
 * @see _buildCommand
 */
describe('_buildCommand', () => {
  /**
   * 有効なモデル名ごとに正しい CommandSpec を返す正常ケース。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-AI-RA-02: model=sonnet → command=claude, hasSystemPromptWithArgs=true', () => {
      const result = _buildCommand('sonnet', 'sys');
      assertEquals(result.command, 'claude');
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-03: model=gpt-5 → command=codex, args=[exec,--skip-git-repo-check,--append-system-prompt,sys,--model,gpt-5]', () => {
      const result = _buildCommand('gpt-5', 'sys');
      assertEquals(result.command, 'codex');
      assertEquals(result.args, ['exec', '--skip-git-repo-check', '--append-system-prompt', 'sys', '--model', 'gpt-5']);
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-04: model=copilot/gpt-4 → command=copilot, args=[--disable-builtin-mcps,--model,gpt-4,--prompt,sys]', () => {
      const result = _buildCommand('copilot/gpt-4', 'sys');
      assertEquals(result.command, 'copilot');
      assertEquals(result.args, ['--disable-builtin-mcps', '--model', 'gpt-4', '--prompt', 'sys']);
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-05: model=openai/gpt-4 → command=codex, args=[exec,--skip-git-repo-check,--append-system-prompt,sys,--model,gpt-4]', () => {
      const result = _buildCommand('openai/gpt-4', 'sys');
      assertEquals(result.command, 'codex');
      assertEquals(result.args, ['exec', '--skip-git-repo-check', '--append-system-prompt', 'sys', '--model', 'gpt-4']);
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-07: model=google/gemini → command=agy, args=[--model,gemini,--print,sys]', () => {
      const result = _buildCommand('google/gemini', 'sys');
      assertEquals(result.command, 'agy');
      assertEquals(result.args, ['--model', 'gemini', '--print', 'sys']);
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-10: model=antigravity/foo → { command:"agy", args:["--model","foo","--print","sys"], hasSystemPromptWithArgs:true }', () => {
      const result = _buildCommand('antigravity/foo', 'sys');
      assertEquals(result.command, 'agy');
      assertEquals(result.args, ['--model', 'foo', '--print', 'sys']);
      assertEquals(result.hasSystemPromptWithArgs, true);
    });

    it('[Normal] T-LIB-AI-RA-08: model=claude/claude-3 → command=claude, args include --model claude-3 (stripped)', () => {
      const result = _buildCommand('claude/claude-3', 'sys');
      assertEquals(result.command, 'claude');
      assertEquals(result.args.includes('--model'), true);
      assertEquals(result.args[result.args.indexOf('--model') + 1], 'claude-3');
      assertEquals(result.hasSystemPromptWithArgs, true);
    });
  });
});

/**
 * `runAI` 関数のユニットテストスイート。
 *
 * モデルバリデーション（UnknownModel）・CLI 終了コード・stderr キャプチャを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-RA-01, T-LIB-AI-RA-11 〜 T-LIB-AI-RA-12
 *
 * @see runAI
 */
describe('runAI', () => {
  /**
   * モデルバリデーションの検証。
   *
   * 無効なモデル名が渡された場合に ChatlogError(UnknownModel) が
   * 正しい subindex ('InvalidModel') でスローされることを確認する。
   */
  describe('model validation', () => {
    /** 無効なモデル名によるエラーケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-AI-RA-01: 無効なモデル名 → ChatlogError(UnknownModel) subindex=InvalidModel', async () => {
        const _err = await assertRejects(
          () => runAI('system', 'user', { model: 'invalid-model' }),
          ChatlogError,
        ) as ChatlogError;
        assertEquals(_err.kind, 'UnknownModel');
        assertEquals(_err.subindex, 'InvalidModel');
      });
    });
  });

  /**
   * CLI 終了コードと stderr キャプチャの検証。
   *
   * 非ゼロ終了時に stderr がエラーメッセージに含まれること、
   * および正常終了時に stdout 文字列が返されることを確認する。
   */
  describe('CLI execution', () => {
    /** CLI 非ゼロ終了時のエラーケース。 */
    describe('When: 異常系', () => {
      for (const { id, label, stderr, desc } of _rateLimitCases) {
        it(`[${label}] ${id}: runAI — stderr に ${desc} → AiError/RateLimit`, async () => {
          const _origCommand = Deno.Command;
          Deno.Command = _makeCommandStub({
            success: false,
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode(stderr),
            signal: null,
          }) as unknown as typeof Deno.Command;
          try {
            const _err = await assertRejects(
              () => runAI('sys', 'user', { model: 'sonnet' }),
              ChatlogError,
            ) as ChatlogError;
            assertEquals(_err.kind, 'AiError');
            assertEquals(_err.subindex, 'RateLimit');
          } finally {
            Deno.Command = _origCommand;
          }
        });
      }

      it('[Error] T-LIB-AI-RA-11: runAI — CLI が非ゼロ終了 → AiError/ExitFailure + stderr がメッセージに含まれる', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('model not found'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
          assertStringIncludes(_err.message, 'model not found');
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });

    /** CLI 正常終了時の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-AI-RA-12: runAI — CLI が正常終了 → stdout 文字列を返す', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('hello'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_result, 'hello');
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });
  });

  /**
   * 外部から渡された `AbortSignal` による中断の検証。
   *
   * `options.signal` が abort された状態でサブプロセスが失敗した場合、
   * タイムアウトとは区別された ChatlogError('Aborted', 'ExternalAbort') がスローされることを確認する。
   */
  describe('external signal abort', () => {
    /** 外部 signal が原因で中断されるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-AI-RA-16: runAI — options.signal が abort 済み → ChatlogError(Aborted) subindex=ExternalAbort', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeRejectingCommandStub() as unknown as typeof Deno.Command;
        const _externalController = new AbortController();
        _externalController.abort();
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet', signal: _externalController.signal }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'Aborted');
          assertEquals(_err.subindex, 'ExternalAbort');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-17: runAI — signal 未指定でサブプロセス失敗 → ChatlogError(AiError) がそのまま伝播する（回帰確認）', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeRejectingCommandStub() as unknown as typeof Deno.Command;
        try {
          await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            Error,
            'aborted',
          );
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });
  });

  /**
   * `options.model` / `options.timeoutMs` 省略時の GlobalConfig フォールバック検証。
   *
   * `GlobalConfig.getInstance()` の設定値が options 未指定時に使われること、
   * および `??` によって `timeoutMs: 0` が明示指定された場合は
   * GlobalConfig の値で上書きされないことを確認する。
   */
  describe('GlobalConfig fallback', () => {
    let commandHandle: CommandMockHandle;

    afterEach(() => {
      commandHandle?.restore();
    });

    /** options 省略時に GlobalConfig の設定値へフォールバックするケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-AI-RA-18: options.model 省略 → GlobalConfig の model ("opus") が CLI 引数に使われる', async () => {
        GlobalConfig.getInstance({ yaml: 'model: opus' });
        const _capturedArgs: { value: string[] } = { value: [] };
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('ok'), _capturedArgs));

        await runAI('sys', 'user');

        assertEquals(_capturedArgs.value.includes('--model'), true);
        assertEquals(_capturedArgs.value[_capturedArgs.value.indexOf('--model') + 1], 'opus');
      });
    });

    /** options 省略時に GlobalConfig の timeoutMs 設定値でタイムアウトが発生するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-AI-RA-19: options.timeoutMs 省略 → GlobalConfig の timeoutMs (1ms) でタイムアウトする', async () => {
        GlobalConfig.getInstance({ yaml: 'timeoutMs: 1' });
        commandHandle = installCommandMock(makeDelayedSuccessMock(100, new TextEncoder().encode('ok')));

        const _err = await assertRejects(
          () => runAI('sys', 'user', { model: 'sonnet' }),
          ChatlogError,
        ) as ChatlogError;
        assertEquals(_err.kind, 'TimedOut');
      });
    });

    /** `options.timeoutMs: 0` は GlobalConfig の値で上書きされない（`??` の 0 特別扱い）エッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-AI-RA-20: options.timeoutMs=0 かつ GlobalConfig.timeoutMs が非ゼロ → タイムアウトしない', async () => {
        GlobalConfig.getInstance({ yaml: 'timeoutMs: 50' });
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('ok')));

        const _result = await runAI('sys', 'user', { model: 'sonnet', timeoutMs: 0 });

        assertEquals(_result, 'ok');
      });
    });
  });
});
