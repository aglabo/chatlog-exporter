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
import { makeLoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';

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
/** レートリミット検出のテーブル駆動ケース (RA-13〜15, RA-21, RA-22)。stdout / stderr の両ストリームを検査対象とする。 */
const _rateLimitCases = [
  {
    id: 'T-LIB-AI-RA-13',
    label: 'Error',
    stdout: '',
    stderr: 'You have hit the rate limit',
    desc: 'stderr に "rate limit"',
  },
  { id: 'T-LIB-AI-RA-14', label: 'Error', stdout: '', stderr: 'HTTP 429 Too Many Requests', desc: 'stderr に "429"' },
  {
    id: 'T-LIB-AI-RA-15',
    label: 'Edge',
    stdout: '',
    stderr: 'Error code 4290',
    desc: 'stderr に "4290" (部分マッチ仕様)',
  },
  {
    id: 'T-LIB-AI-RA-21',
    label: 'Error',
    stdout: 'Claude usage limit reached',
    stderr: '',
    desc: 'stdout に "Claude usage limit reached" (stderr 空)',
  },
  { id: 'T-LIB-AI-RA-22', label: 'Error', stdout: '', stderr: 'usage limit exceeded', desc: 'stderr に "usage limit"' },
] as const;

const _cases: Array<{ model: string; expected: CommandSpec }> = [
  {
    model: 'sonnet',
    expected: {
      command: 'claude',
      args: [
        '--print',
        '--output-format',
        'json',
        '--system-prompt',
        'sys',
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

    it('[Normal] T-LIB-AI-RA-28: model=sonnet → claude args に --output-format json が含まれる', () => {
      const result = _buildCommand('sonnet', 'sys');
      assertEquals(result.command, 'claude');
      assertEquals(result.args.includes('--output-format'), true);
      assertEquals(result.args[result.args.indexOf('--output-format') + 1], 'json');
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
      for (const { id, label, stdout, stderr, desc } of _rateLimitCases) {
        it(`[${label}] ${id}: runAI — ${desc} → AiError/RateLimit`, async () => {
          const _origCommand = Deno.Command;
          Deno.Command = _makeCommandStub({
            success: false,
            code: 1,
            stdout: new TextEncoder().encode(stdout),
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

      it('[Error] T-LIB-AI-RA-24: runAI — stderr に sandbox disabled バナー (rate limit 文字列なし) → RateLimit にならず AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode(
            '⚠ Sandbox disabled: sandbox is enabled but the Windows sandbox is not active on this session (feature gate off)',
          ),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-33: runAI — CLI 失敗時 stderr が logger.error に "(stderr)" ラベル付きで出力される', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('model not found'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        const _loggerStub = makeLoggerStub();
        try {
          await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          );
          const _hasStderrLog = _loggerStub.errorLogs.some((m) =>
            m.includes('(stderr):') && m.includes('model not found')
          );
          assertEquals(_hasStderrLog, true);
        } finally {
          _loggerStub.restore();
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-34: runAI — CLI 失敗時 stdout(JSON) が logger.error に "(stdout)" ラベル付きで丸ごと出力される', async () => {
        const _origCommand = Deno.Command;
        const _stdout = '{"type":"result","subtype":"error","is_error":true,"api_error_status":429}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new TextEncoder().encode('some error'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        const _loggerStub = makeLoggerStub();
        try {
          await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          );
          const _stdoutLog = _loggerStub.errorLogs.find((m) => m.includes('(stdout):'));
          assertStringIncludes(_stdoutLog ?? '', _stdout);
        } finally {
          _loggerStub.restore();
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-35: runAI — stderr 空 かつ stdout に JSON のみ → stdout JSON がログされ stderr 行はスキップされる', async () => {
        const _origCommand = Deno.Command;
        const _stdout = '{"type":"result","subtype":"error","is_error":true,"api_error_status":429}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        const _loggerStub = makeLoggerStub();
        try {
          await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          );
          const _hasStdoutLog = _loggerStub.errorLogs.some((m) => m.includes('(stdout):') && m.includes(_stdout));
          const _hasStderrLog = _loggerStub.errorLogs.some((m) => m.includes('(stderr):'));
          assertEquals(_hasStdoutLog, true);
          assertEquals(_hasStderrLog, false);
        } finally {
          _loggerStub.restore();
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-36: runAI — exit 1 かつ claude JSON is_error:true/api_error_status:429 → AiError/RateLimit', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '{"is_error":true,"api_error_status":429,"subtype":"success","terminal_reason":"api_error","result":"You\'ve hit your monthly spend limit · raise it at claude.ai/settings/usage"}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
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

      it('[Error] T-LIB-AI-RA-39: runAI — exit 1 かつ claude JSON is_error:true/api_error_status:500 (429以外) → AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode('{"is_error":true,"api_error_status":500,"result":"boom"}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-45: runAI — exit 1 かつ is_error:true/api_error_status:null/result:"...monthly spend limit..." → AiError/RateLimit', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '{"is_error":true,"api_error_status":null,"result":"You\'ve hit your monthly spend limit · raise it at claude.ai/settings/usage"}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
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

      it('[Error] T-LIB-AI-RA-46: runAI — exit 1 かつ is_error:true/api_error_status:null/result:"usage limit reached" → AiError/RateLimit', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode('{"is_error":true,"api_error_status":null,"result":"usage limit reached"}'),
          stderr: new Uint8Array(),
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

      it('[Edge] T-LIB-AI-RA-47: runAI — exit 1 かつ is_error:true/api_error_status:null/result:"boom" (レートリミット表現なし) → AiError/ExitFailure (誤検出しない)', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode('{"is_error":true,"api_error_status":null,"result":"boom"}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-40: runAI — exit 1 かつ stdout がプレーンテキスト(JSON パース不能) → フォールバックで AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode('plain text crash dump'),
          stderr: new TextEncoder().encode('crash'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-42: runAI — exit 1 かつ ケースA完全JSON → message に "429" と result 文言 ("monthly spend limit") の両方が含まれる', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '{"is_error":true,"api_error_status":429,"subtype":"success","terminal_reason":"api_error","result":"You\'ve hit your monthly spend limit · raise it at claude.ai/settings/usage"}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertStringIncludes(_err.message, '429');
          assertStringIncludes(_err.message, 'monthly spend limit');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-43: runAI — exit 1 かつ api_error_status:null/terminal_reason あり → message に result ("boom") は含まれ status 数値部分は含まれない', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(
            '{"is_error":true,"api_error_status":null,"terminal_reason":"api_error","result":"boom"}',
          ),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertStringIncludes(_err.message, 'boom');
          assertEquals(_err.message.includes('status'), false);
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-44: runAI — exit 1 かつ status/terminal_reason 両欠損 → message に result ("partial") 含み例外なく throw される', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode('{"is_error":true,"result":"partial"}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertStringIncludes(_err.message, 'partial');
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });

    /** CLI 正常終了時（claude backend）の正常ケース。claude は `--output-format json` の構造化 JSON を返し、runAI はその `.result` を抽出して返す。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-AI-RA-12: runAI — claude が JSON `{"result":"hello"}` を返す → .result ("hello") を返す', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('{"result":"hello"}'),
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

      it('[Normal] T-LIB-AI-RA-29: runAI — claude stdout 先頭にサンドボックスバナー + 末尾に JSON → バナーを除去して .result を抽出する', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '⚠ Sandbox disabled: sandbox is enabled but the Windows sandbox is not active on this session (feature gate off)\n{"result":"answer"}';
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_result, 'answer');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Normal] T-LIB-AI-RA-37: runAI — exit 1 だが claude JSON is_error:false/result あり → throw せず .result を返す', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '{"is_error":false,"api_error_status":null,"subtype":"success","terminal_reason":"completed","result":"title: hello"}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_result, 'title: hello');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Normal] T-LIB-AI-RA-38: runAI — exit 1 だが claude JSON is_error:false → logger.error が呼ばれない (errorLogs 空)', async () => {
        const _origCommand = Deno.Command;
        const _stdout =
          '{"is_error":false,"api_error_status":null,"subtype":"success","terminal_reason":"completed","result":"title: hello"}';
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new TextEncoder().encode(_stdout),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        const _loggerStub = makeLoggerStub();
        try {
          await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_loggerStub.errorLogs.length, 0);
        } finally {
          _loggerStub.restore();
          Deno.Command = _origCommand;
        }
      });
    });

    /**
     * claude JSON パース失敗時の異常ケース。
     *
     * 成功終了(exit 0)でも stdout が JSON として解釈できない、または `.result`
     * が文字列でない場合は fail-first で ChatlogError(AiError/InvalidFormat) を throw する。
     */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-AI-RA-30: runAI — claude stdout に "{" が無く JSON パース不能 → ChatlogError(AiError/InvalidFormat)', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('not a json output'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'InvalidFormat');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Error] T-LIB-AI-RA-31: runAI — claude JSON が有効だが .result が文字列でない → ChatlogError(AiError/InvalidFormat)', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('{"noResult":123}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'InvalidFormat');
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });

    /**
     * レートリミット判定の誤検出防止に関するエッジケース。
     *
     * フォールバック分岐のレートリミット判定は `_RATE_LIMIT_PATTERN`
     * (`rate.?limit|429|usage limit|spend limit`) のみで行う。sandbox バナー系の文字列は
     * レートリミットの代理シグナルとして扱わないため、いずれも ExitFailure に分類される。
     *
     * - 正常終了(exit 0)の stdout はレートリミット検査対象外である（RA-23）。
     * - sandbox バナー本文 "sandbox is enabled but not active" は RateLimit にならず
     *   ExitFailure である（RA-25）。
     * - 小文字 "sandbox disabled" も RateLimit にならず ExitFailure である（RA-26）。
     * - "Sandbox disabled:" で始まる任意の文字列も RateLimit にならず ExitFailure である（RA-27）。
     */
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-AI-RA-23: runAI — 正常終了 かつ .result に "usage limit" を含む → RateLimit 判定されず .result を返す', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('{"result":"the response mentions a usage limit topic"}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_result, 'the response mentions a usage limit topic');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-32: runAI — claude 以外のバックエンド(codex) → JSON パースせず生 stdout を trim して返す', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('  plain codex output  \n'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'gpt-5' });
          assertEquals(_result, 'plain codex output');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-25: runAI — stderr が "sandbox is enabled but not active" のみ ("disabled" なし) → RateLimit にならず AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('sandbox is enabled but not active'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-26: runAI — stderr が小文字 "sandbox disabled" のみ（先頭 s 小文字）→ RateLimit にならず AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('sandbox disabled'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-27: runAI — stderr が "Sandbox disabled: something else entirely" → RateLimit にならず AiError/ExitFailure', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('Sandbox disabled: something else entirely'),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _err = await assertRejects(
            () => runAI('sys', 'user', { model: 'sonnet' }),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'ExitFailure');
        } finally {
          Deno.Command = _origCommand;
        }
      });

      it('[Edge] T-LIB-AI-RA-41: runAI — exit 0 かつ claude JSON is_error:false/result:"ok" → .result ("ok") を返す', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeCommandStub({
          success: true,
          code: 0,
          stdout: new TextEncoder().encode('{"is_error":false,"result":"ok"}'),
          stderr: new Uint8Array(),
          signal: null,
        }) as unknown as typeof Deno.Command;
        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet' });
          assertEquals(_result, 'ok');
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
        commandHandle = installCommandMock(
          makeSuccessMock(new TextEncoder().encode('{"result":"ok"}'), _capturedArgs),
        );

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
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('{"result":"ok"}')));

        const _result = await runAI('sys', 'user', { model: 'sonnet', timeoutMs: 0 });

        assertEquals(_result, 'ok');
      });
    });
  });
});
