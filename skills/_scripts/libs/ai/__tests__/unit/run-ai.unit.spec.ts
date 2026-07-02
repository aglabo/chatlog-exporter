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
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _buildCommand, runAI } from '../../run-ai.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

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

// constants
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
      it('[Error] T-LIB-AI-RA-11: runAI — CLI が非ゼロ終了 → stderr がエラーメッセージに含まれる', async () => {
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
          assertEquals(_err.kind, 'CliError');
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
});
