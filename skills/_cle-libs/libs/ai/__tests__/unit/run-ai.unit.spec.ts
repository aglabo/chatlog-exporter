// src: skills/_cle-libs/libs/ai/__tests__/unit/run-ai.unit.spec.ts
// @(#): run-ai のユニットテスト
//       対象: runAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words mcps

// ─── BDD modules
import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStringIncludes,
} from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _buildCommand, buildValidModelsMessage, runAI } from '../../run-ai.ts';
import type { RunAIOptions } from '../../run-ai.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';
import { isAbortingAiError } from '../../abort-utils.ts';
// types
import type { CommandMockHandle } from '../../../../__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeDelayedSuccessMock,
  makeSuccessMock,
} from '../../../../__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';
import type { AiModelToProvider } from '../../../../types/ai.const.types.ts';
import type { FetchProvider } from '../../../../types/providers.types.ts';
// constants
import { AI_MODEL_TO_PROVIDER_MAP, AI_PROVIDERS } from '../../../../types/ai.const.types.ts';

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

/**
 * `Deno.Command` の代替クラスを返すファクトリ。
 * コンストラクタが受け取った `opts.signal` を捕捉し、正常応答を返すフェイクを生成する。
 *
 * @param captured - 捕捉した `AbortSignal` の格納先
 * @param stdout - spawn().output() が返す stdout バイト列
 * @returns `Deno.Command` と互換の偽クラス
 */
const _makeSignalCapturingStub = (captured: { value?: AbortSignal }, stdout: Uint8Array) => {
  return class {
    constructor(_cmd: string, opts: { args: string[]; signal?: AbortSignal }) {
      captured.value = opts.signal;
    }
    spawn() {
      return {
        stdin: { getWriter: () => ({ write: () => Promise.resolve(), close: () => Promise.resolve() }) },
        output: () =>
          Promise.resolve({ success: true, code: 0, stdout, stderr: new Uint8Array() } as Deno.CommandOutput),
      };
    }
  };
};

/**
 * `Deno.Command` の代替クラスを返すファクトリ。
 * `opts.signal` を無視し、`delayMs` 経過後に必ず reject するフェイクを生成する。
 *
 * signal を尊重するモックだと「外部 abort とタイマーのどちらが先に abort したか」で
 * レースになるため、reject 時刻を固定して catch 到達時点で両方が abort 済みになる状況を
 * 決定的に作るために用いる。
 *
 * @param delayMs - reject するまでの待機ミリ秒
 * @returns `Deno.Command` と互換の偽クラス
 */
const _makeLateRejectingCommandStub = (delayMs: number) => {
  return class {
    constructor(_cmd: string, _opts: unknown) {}
    spawn() {
      return {
        stdin: { getWriter: () => ({ write: () => Promise.resolve(), close: () => Promise.resolve() }) },
        output: () =>
          new Promise<Deno.CommandOutput>((_resolve, reject) => {
            setTimeout(() => reject(new Error('boom')), delayMs);
          }),
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

/**
 * 分割前に受理されていた既存バックエンドのモデル値 (T-LIB-AI-RA-52-01 / T-LIB-AI-RA-52-02 / T-LIB-AI-RA-53-01)。
 *
 * claude 経路のみ `--output-format json` の JSON を解釈して `.result` を返すため、
 * stdout と期待値が異なる。他の経路は trim 済み生 stdout がそのまま返る。
 * `modelArg` は CLI へ渡る `--model` 引数値で、opencode 経路のみ provider を含む。
 * `routeLabel` は後段のエラー文言が埋め込む経路ラベル（`AI_BACKEND_COMMAND_MAP` の値）で、antigravity のみ論理名と異なる。
 */
const _backendCases = [
  {
    model: 'sonnet',
    backend: 'claude',
    stdout: '{"result":"ok"}',
    expected: 'ok',
    modelArg: 'sonnet',
    routeLabel: 'claude',
  },
  { model: 'gpt-5', backend: 'codex', stdout: 'ok', expected: 'ok', modelArg: 'gpt-5', routeLabel: 'codex' },
  {
    model: 'copilot/gpt-4',
    backend: 'copilot',
    stdout: 'ok',
    expected: 'ok',
    modelArg: 'gpt-4',
    routeLabel: 'copilot',
  },
  {
    model: 'opencode/gpt-4',
    backend: 'opencode',
    stdout: 'ok',
    expected: 'ok',
    modelArg: 'opencode/gpt-4',
    routeLabel: 'opencode',
  },
  {
    model: 'gemini-3-pro',
    backend: 'antigravity',
    stdout: 'ok',
    expected: 'ok',
    modelArg: 'gemini-3-pro',
    routeLabel: 'agy',
  },
] as const;

/**
 * 失敗系の分類が 3 層分割の前後で変わらないことを確かめる非回帰ケース (T-LIB-AI-RA-52-03)。
 *
 * シナリオごとにモックの形が異なるため、1 本の値テーブルにまとめず
 * スタブ生成関数とオプション生成関数を持つテーブルとして組む。
 */
const _classificationCases: Array<{
  desc: string;
  makeStub: () => unknown;
  makeOptions: () => RunAIOptions;
  kind: ChatlogError['kind'];
  subindex: string;
}> = [
  {
    desc: 'stderr に rate limit 表現 + exit 1',
    makeStub: () =>
      _makeCommandStub({
        success: false,
        code: 1,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode('You have hit the rate limit'),
        signal: null,
      }),
    makeOptions: () => ({ model: 'sonnet' }),
    kind: 'AiError',
    subindex: 'RateLimit',
  },
  {
    desc: 'stderr = "boom" + exit 1 (rate limit 表現なし)',
    makeStub: () =>
      _makeCommandStub({
        success: false,
        code: 1,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode('boom'),
        signal: null,
      }),
    makeOptions: () => ({ model: 'sonnet' }),
    kind: 'AiError',
    subindex: 'ExitFailure',
  },
  {
    desc: 'claude の stdout が JSON でない + exit 0',
    makeStub: () =>
      _makeCommandStub({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode('not json'),
        stderr: new Uint8Array(),
        signal: null,
      }),
    makeOptions: () => ({ model: 'sonnet' }),
    kind: 'AiError',
    subindex: 'InvalidFormat',
  },
  {
    desc: '未知のモデル値',
    makeStub: () =>
      _makeCommandStub({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode('{"result":"ok"}'),
        stderr: new Uint8Array(),
        signal: null,
      }),
    makeOptions: () => ({ model: 'invalid-model' }),
    kind: 'UnknownModel',
    subindex: 'InvalidModel',
  },
  {
    desc: 'timeoutMs=1 + 100ms 遅延モック',
    makeStub: () => makeDelayedSuccessMock(100, new TextEncoder().encode('ok')),
    makeOptions: () => ({ model: 'sonnet', timeoutMs: 1 }),
    kind: 'TimedOut',
    subindex: 'Timeout',
  },
  {
    desc: 'abort 済み外部 signal + reject モック',
    makeStub: () => _makeRejectingCommandStub(),
    makeOptions: () => {
      const _external = new AbortController();
      _external.abort();
      return { model: 'sonnet', signal: _external.signal };
    },
    kind: 'Aborted',
    subindex: 'ExternalAbort',
  },
];

/**
 * `buildValidModelsMessage` の文言からモデル名トークンを取り出す。
 *
 * 部分文字列で検証すると `opus` が `opusplan` / `opus[1m]` / `claude-opus-*` に、
 * `sonnet` が `sonnet[1m]` に、`haiku` が `claude-haiku-*` に一致してしまい、
 * 定数からそのエントリが失われても検知できない。トークン厳密一致にするための分割。
 */
const _listedModels = (message: string): string[] =>
  message.split(' (or ')[0].replace('Valid models: ', '').split(', ');

/**
 * `buildValidModelsMessage` の文言から provider 名トークンを取り出す。
 *
 * `claude` が `claude-opus-*` に一致する同種の取りこぼしを避けるため、
 * `<provider>/<model>` 一覧の側もトークンへ分割して検証する。
 */
const _listedProviders = (message: string): string[] =>
  message.split(' (or <provider>/<model> with provider: ')[1].replace(/\)$/, '').split(', ');

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

    it('[Normal] T-LIB-AI-RA-48: model=sonnet → claude args に --safe-mode が含まれる', () => {
      const result = _buildCommand('sonnet', 'sys');
      assertEquals(result.command, 'claude');
      assertEquals(result.args.includes('--safe-mode'), true);
    });

    it('[Normal] T-LIB-AI-RA-49: model=sonnet → claude args に --tools= が含まれる', () => {
      const result = _buildCommand('sonnet', 'sys');
      assertEquals(result.command, 'claude');
      assertEquals(result.args.includes('--tools='), true);
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

  /**
   * `runAI` を前段 / 中段 / 後段の 3 層へ分割したあとの非回帰検証。
   *
   * 分割の前後で、正常応答した CLI の実行結果から返る文字列が変わらないことを確認する。
   *
   * テスト ID 範囲: T-LIB-AI-RA-50-01 〜 T-LIB-AI-RA-57-03
   */
  describe('3-layer split', () => {
    let commandHandle: CommandMockHandle;

    afterEach(() => {
      commandHandle?.restore();
    });

    /** 正常応答した CLI から従来どおりの文字列が返るケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-AI-RA-50-01: runAI — 正常応答する Deno.Command スタブ → 分割前と同一の文字列 ("ok") を返す', async () => {
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('{"result":"ok"}')));

        const _result = await runAI('sys', 'user', { model: 'sonnet' });

        assertEquals(_result, 'ok');
      });
    });

    /** 分割前に受理されていた既存バックエンドのモデル値が、分割後も受理されるケース（非回帰ガード）。 */
    describe('When: 正常系（既存バックエンドの受理）', () => {
      for (const { model, backend, stdout, expected } of _backendCases) {
        it(`[Normal] T-LIB-AI-RA-52-01: runAI — model="${model}" (${backend}) → UnknownModel を throw せず "${expected}" を返す`, async () => {
          commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(stdout)));

          const _result = await runAI('sys', 'user', { model });

          assertEquals(_result, expected);
        });
      }
    });

    /**
     * `options.model` 省略時に、前段の設定解決が GlobalConfig の既定モデルを
     * 各バックエンドの `--model` 引数へ渡すケース（非回帰ガード）。
     */
    describe('When: 正常系（既定モデルの設定解決）', () => {
      for (const { model, backend, stdout, modelArg } of _backendCases) {
        it(`[Normal] T-LIB-AI-RA-52-02: runAI — options.model 省略・GlobalConfig model="${model}" (${backend}) → --model に "${modelArg}" が渡る`, async () => {
          GlobalConfig.getInstance({ yaml: `model: ${model}` });
          const _capturedArgs: { value: string[] } = { value: [] };
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(stdout), _capturedArgs),
          );

          await runAI('sys', 'user');

          assertEquals(_capturedArgs.value.includes('--model'), true);
          assertEquals(_capturedArgs.value[_capturedArgs.value.indexOf('--model') + 1], modelArg);
        });
      }
    });

    /** 前段が合成した中断シグナルを中段 (`_runViaCli`) へ引数で引き渡すケース。 */
    describe('When: 正常系（中段への signal 引き渡し）', () => {
      it('[Normal] T-LIB-AI-RA-51-02: run-ai.ts ソース — 前段が _runViaCli を呼び、合成済み signal を引数に渡し、AbortSignal.any は 1 箇所のみ', async () => {
        const _source = await Deno.readTextFile(new URL('../../run-ai.ts', import.meta.url));
        const _count = (re: RegExp): number => (_source.match(re) ?? []).length;

        // (a) 前段が中段を呼び出している（定義側は `_runViaCli = async (` なのでこの正規表現は一致しない）
        assertEquals(/_runViaCli\s*\(/.test(_source), true);
        // (b) その呼び出しが合成済み signal を引数として渡している
        const _callArgs = _source.match(/_runViaCli\s*\(([\s\S]*?)\);/)?.[1] ?? '';
        assertStringIncludes(_callArgs, 'signal');
        // (c) シグナル合成は前段の 1 箇所だけ（中段が再合成していない）
        assertEquals(_count(/AbortSignal\.any/g), 1);
      });

      it('[Normal] T-LIB-AI-RA-51-01: runAI — timeoutMs と外部 signal 指定 → 中段が受け取る signal は ext.signal とは別の合成済みインスタンス', async () => {
        const _origCommand = Deno.Command;
        const _captured: { value?: AbortSignal } = {};
        const _external = new AbortController();
        Deno.Command = _makeSignalCapturingStub(
          _captured,
          new TextEncoder().encode('{"result":"ok"}'),
        ) as unknown as typeof Deno.Command;
        try {
          await runAI('sys', 'user', { model: 'sonnet', timeoutMs: 5000, signal: _external.signal });

          const _signal = _captured.value;
          assertEquals(_signal instanceof AbortSignal, true);
          assertFalse(_signal === _external.signal);
          assertFalse(_signal!.aborted);

          _external.abort();

          assertEquals(_signal!.aborted, true);
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });

    /**
     * タイムアウトタイマーの生成・解放が、前段と後段のそれぞれ 1 箇所に集約されているケース（非回帰ガード）。
     *
     * 経路ごとにタイマーを複製すると解放漏れが生じるため、実装ソースを読み取って
     * 呼び出し箇所を数える静的検査で守る。
     */
    describe('When: 正常系（タイマー生成箇所の検査）', () => {
      it('[Normal] T-LIB-AI-RA-54-01: run-ai.ts ソース — タイマー生成は前段の 1 箇所、解放は後段の 1 箇所のみ', async () => {
        const _source = await Deno.readTextFile(new URL('../../run-ai.ts', import.meta.url));
        const _count = (re: RegExp): number => (_source.match(re) ?? []).length;

        // (a) タイマー生成は前段の 1 箇所だけ（経路ごとに複製されていない）
        assertEquals(_count(/\bsetTimeout\s*\(/g), 1);
        // (b) タイマー解放は後段の finally の 1 箇所だけ
        assertEquals(_count(/clearTimeout\s*\(/g), 1);
      });
    });

    /**
     * 外部 abort をタイムアウトより優先する判定が、後段の catch 1 箇所に集約されているケース（非回帰ガード）。
     *
     * 経路ごとに判定を複製すると優先順位が経路差で崩れるため、実装ソースを読み取って
     * subindex 文字列リテラルの出現数を数える静的検査で守る。
     */
    describe('When: 正常系（キャンセル優先判定箇所の検査）', () => {
      it('[Normal] T-LIB-AI-RA-54-02: run-ai.ts ソース — 外部 abort 優先判定は後段の 1 箇所のみ', async () => {
        const _source = await Deno.readTextFile(new URL('../../run-ai.ts', import.meta.url));
        const _count = (re: RegExp): number => (_source.match(re) ?? []).length;

        // (a) 外部 abort の分類は後段の catch 1 箇所だけ（経路ごとに複製されていない）
        assertEquals(_count(/'ExternalAbort'/g), 1);
        // (b) タイムアウトの分類も後段の catch 1 箇所だけ
        assertEquals(_count(/'Timeout'/g), 1);
      });
    });

    /**
     * 中段 `_runViaCli` がモジュール外へ公開されていないケース（非回帰ガード）。
     *
     * 中段が公開されると経路依存の処理を前段/後段を介さず直接呼べてしまうため、
     * 実装ソースを読み取って定義の存在と export 修飾の不在を静的検査で守る。
     */
    describe('When: 正常系（中段の非公開性の検査）', () => {
      it('[Normal] T-LIB-AI-RA-55-01: run-ai.ts ソース — _runViaCli は定義されているがモジュール外へ公開されていない', async () => {
        const _source = await Deno.readTextFile(new URL('../../run-ai.ts', import.meta.url));
        const _definition = /(const|function)\s+_runViaCli\b/;
        const _exportedDefinition = /export\s+(const|async\s+function|function)\s+_runViaCli\b/;
        const _namedReExport = /export\s*\{[^}]*_runViaCli/;

        // (a) 中段が実体として定義されている（部分文字列一致はコメントでも通るため定義形で確認する）
        assert(_definition.test(_source));
        // (b) 定義に export 修飾が付いていない
        assertFalse(_exportedDefinition.test(_source));
        // (c) 名前付き re-export でも公開されていない
        assertFalse(_namedReExport.test(_source));

        // (d) 空振り防止: 公開された場合を模した文字列には (b)(c) の正規表現が一致する
        const _exportedDefinitionSample = 'export const _runViaCli = async (spec) => {};';
        const _namedReExportSample = 'export { _runViaCli };';
        assert(_exportedDefinition.test(_exportedDefinitionSample));
        assert(_namedReExport.test(_namedReExportSample));
      });
    });

    /**
     * `timeoutMs: 0`（タイムアウト無効）で前段がタイマーを生成しないケース（非回帰ガード）。
     *
     * 前段の既定値解決が `0` を falsy として取りこぼすと、無効指定なのにタイマーが張られる。
     * `globalThis.setTimeout` をスパイへ差し替えて呼び出し回数を数えることで守る。
     */
    describe('When: エッジケース（timeoutMs=0 でのタイマー未生成）', () => {
      it('[Edge] T-LIB-AI-RA-56-01: runAI — timeoutMs=0 → setTimeout は呼ばれず "ok" を返す', async () => {
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('{"result":"ok"}')));
        const _origSetTimeout = globalThis.setTimeout;
        const _spy = { calls: 0 };
        globalThis.setTimeout = ((...args: Parameters<typeof _origSetTimeout>) => {
          _spy.calls++;
          return _origSetTimeout(...args);
        }) as typeof globalThis.setTimeout;

        try {
          const _result = await runAI('sys', 'user', { model: 'sonnet', timeoutMs: 0 });

          // (a) タイマーが 1 つも生成されていない
          assertEquals(_spy.calls, 0);
          // (b) タイマー無しでも従来どおりの結果が返る
          assertEquals(_result, 'ok');

          // (c) 空振り防止: 同じスパイで timeoutMs 指定時には実際にタイマーが生成される
          _spy.calls = 0;
          await runAI('sys', 'user', { model: 'sonnet', timeoutMs: 5000 });
          assertEquals(_spy.calls >= 1, true);
        } finally {
          globalThis.setTimeout = _origSetTimeout;
        }
      });
    });

    /** 失敗系シナリオが分割前と同一の kind / subindex で throw されるケース（非回帰ガード）。 */
    describe('When: 異常系（失敗分類の非回帰）', () => {
      for (const { desc, makeStub, makeOptions, kind, subindex } of _classificationCases) {
        it(`[Error] T-LIB-AI-RA-52-03: runAI — ${desc} → ChatlogError(${kind}) subindex=${subindex}`, async () => {
          const _origCommand = Deno.Command;
          Deno.Command = makeStub() as unknown as typeof Deno.Command;
          try {
            const _err = await assertRejects(
              () => runAI('sys', 'user', makeOptions()),
              ChatlogError,
            ) as ChatlogError;
            assertEquals(_err.kind, kind);
            assertEquals(_err.subindex, subindex);
          } finally {
            Deno.Command = _origCommand;
          }
        });
      }

      it('[Error] T-LIB-AI-RA-52-04: runAI — model="invalid-model" → message が案内文言を含んでも kind/subindex 判定は不変', async () => {
        commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('{"result":"ok"}')));

        const _err = await assertRejects(
          () => runAI('sys', 'user', { model: 'invalid-model' }),
          ChatlogError,
        ) as ChatlogError;

        // 案内文言が message に載っている（文言側の変更点）
        assertStringIncludes(_err.message, buildValidModelsMessage());
        // それでも kind / subindex による既存の分岐判定は分割前と同じ結果になる
        assertEquals(_err.kind, 'UnknownModel');
        assertEquals(_err.subindex, 'InvalidModel');
        assertFalse(isAbortingAiError(_err));
      });
    });

    /**
     * 後段の `Aborted` / `ExternalAbort` 文言が経路ラベルで組み立てられているケース（非回帰ガード）。
     *
     * 経路ラベルは `AI_BACKEND_COMMAND_MAP` の値であってバックエンド論理名ではない。
     * antigravity 経路のみ両者が食い違う（論理名 `antigravity` に対しラベルは `agy`）ため、
     * 文言を完全一致で固定してラベル種別の取り違えを検出する。
     * `ChatlogError` は `message` に `<kind ラベル>: ` を前置するため、期待値も前置込みで組み立てる。
     */
    describe('When: 異常系（外部 abort 時の経路ラベル文言）', () => {
      for (const { model, backend, routeLabel } of _backendCases) {
        it(`[Error] T-LIB-AI-RA-53-01: runAI — model="${model}" (${backend}) + abort 済み外部 signal → message が "Aborted: ${routeLabel} was aborted by an external signal"`, async () => {
          const _origCommand = Deno.Command;
          Deno.Command = _makeRejectingCommandStub() as unknown as typeof Deno.Command;
          const _externalController = new AbortController();
          _externalController.abort();
          try {
            const _err = await assertRejects(
              () => runAI('sys', 'user', { model, signal: _externalController.signal }),
              ChatlogError,
            ) as ChatlogError;

            assertEquals(_err.message, `Aborted: ${routeLabel} was aborted by an external signal`);
          } finally {
            Deno.Command = _origCommand;
          }
        });
      }
    });

    /**
     * 後段の `TimedOut` / `Timeout` 文言が経路ラベルで組み立てられているケース（非回帰ガード）。
     *
     * 外部 abort 時（T-LIB-AI-RA-53-01）と同じく、経路ラベルは `AI_BACKEND_COMMAND_MAP` の値であって
     * バックエンド論理名ではない。antigravity 経路のみ両者が食い違う（論理名 `antigravity` に対し
     * ラベルは `agy`）ため、文言を完全一致で固定してラベル種別の取り違えを検出する。
     * `ChatlogError` は `message` に `<kind ラベル>: ` を前置するため、期待値も前置込みで組み立てる。
     */
    describe('When: 異常系（タイムアウト時の経路ラベル文言）', () => {
      for (const { model, backend, routeLabel } of _backendCases) {
        it(`[Error] T-LIB-AI-RA-53-02: runAI — model="${model}" (${backend}) + timeoutMs=1 → message が "Timed Out: ${routeLabel} timed out after 1ms"`, async () => {
          commandHandle = installCommandMock(makeDelayedSuccessMock(100, new TextEncoder().encode('ok')));

          const _err = await assertRejects(
            () => runAI('sys', 'user', { model, timeoutMs: 1 }),
            ChatlogError,
          ) as ChatlogError;

          assertEquals(_err.message, `Timed Out: ${routeLabel} timed out after 1ms`);
        });
      }
    });

    /**
     * llama provider にモデル識別子が無い値が、前段のモデル値検証で弾かれるケース（非回帰ガード）。
     *
     * 検証責務が `_buildCommand` の分岐から前段へ移っても、利用者が分岐に用いる
     * `kind` / `subindex` の分類は変わらないことを固定する。文言は前段移行で変わるため検証しない。
     */
    describe('When: 異常系（モデル識別子が空の llama 指定）', () => {
      it('[Error] T-LIB-AI-RA-57-01: runAI — model="llama/" → ChatlogError(UnknownModel) subindex=InvalidModel', async () => {
        const _err = await assertRejects(
          () => runAI('sys', 'user', { model: 'llama/' }),
          ChatlogError,
        ) as ChatlogError;

        assertEquals(_err.kind, 'UnknownModel');
        assertEquals(_err.subindex, 'InvalidModel');
      });

      // 空文字だけでなく空白のみの識別子も同じ分類で弾かれる（`.trim() === ''` 判定の境界）。
      it('[Error] T-LIB-AI-RA-57-02: runAI — model="llama/ " → ChatlogError(UnknownModel) subindex=InvalidModel', async () => {
        const _err = await assertRejects(
          () => runAI('sys', 'user', { model: 'llama/ ' }),
          ChatlogError,
        ) as ChatlogError;

        assertEquals(_err.kind, 'UnknownModel');
        assertEquals(_err.subindex, 'InvalidModel');
      });

      /**
       * `ChatlogError` は `detail` プロパティを持たないため、案内文言は `message` へ埋め込まれる。
       * `_buildCommand` の `default` 分岐が返す文言には受理形式一覧が含まれないので、
       * このアサーションは検証責務が前段へ移っていることを固定する。
       */
      it('[Error] T-LIB-AI-RA-57-03: runAI — model="llama/" → message が受理形式の一覧を含む', async () => {
        const _err = await assertRejects(
          () => runAI('sys', 'user', { model: 'llama/' }),
          ChatlogError,
        ) as ChatlogError;

        assertStringIncludes(_err.message, buildValidModelsMessage());
      });
    });

    /**
     * タイムアウトと外部 abort が同時に発火した場合に、外部 abort が優先して報告されるケース（非回帰ガード）。
     *
     * signal を無視して 20ms 後に必ず reject するスタブを使うことで、後段の catch へ到達した時点で
     * 事前 abort 済みの外部 signal と 1ms タイマーの両方が abort 済みになる状況を決定的に作る。
     * signal を尊重するスタブだと、どちらが先に abort したかでレースになるため用いない。
     */
    describe('When: 異常系（外部 abort とタイムアウトの同時発火）', () => {
      it('[Error] T-LIB-AI-RA-56-02: runAI — abort 済み外部 signal + timeoutMs=1 + 20ms 後 reject → ChatlogError(Aborted) subindex=ExternalAbort', async () => {
        const _origCommand = Deno.Command;
        Deno.Command = _makeLateRejectingCommandStub(20) as unknown as typeof Deno.Command;
        const _externalController = new AbortController();
        _externalController.abort();

        try {
          const _err = await assertRejects(
            () =>
              runAI('sys', 'user', {
                model: 'sonnet',
                timeoutMs: 1,
                signal: _externalController.signal,
              }),
            ChatlogError,
          ) as ChatlogError;

          assertEquals(_err.kind, 'Aborted');
          assertEquals(_err.subindex, 'ExternalAbort');
        } finally {
          Deno.Command = _origCommand;
        }
      });
    });
  });
});

/**
 * モデルパターン型 `AiModelToProvider` のユニットテストスイート。
 *
 * `regex` バリアントが表示ラベルを必須フィールドとして持つことを型レベルで検証する。
 * 文言生成関数はこのラベルを参照するため、ラベルの欠落はコンパイル時に検出される必要がある。
 *
 * テスト ID 範囲: T-LIB-AI-MSG-04-01
 *
 * @see AiModelToProvider
 */
describe('AiModelToProvider', () => {
  /** 表示ラベルを欠いた regex エントリが型として拒否されることを確認する。 */
  describe('When: エッジケース', () => {
    /**
     * `regex` バリアントの `label` が必須であることは型レベルで固定する。`@ts-expect-error` は
     * ラベル欠落を拒否できなければ「未使用の抑制」として型検査エラーになるため、
     * `label` が省略可能になった時点でこのテストはコンパイルに失敗する。
     */
    it('[Edge] T-LIB-AI-MSG-04-01: 表示ラベルを欠いた regex エントリは AiModelToProvider に代入できない', () => {
      // arrange
      // @ts-expect-error label 必須のため、ラベルを欠いた regex エントリは代入できない
      const _noLabel: AiModelToProvider = { match: 'regex', pattern: /^x-/, provider: 'claude' };
      const _labeled: AiModelToProvider = { match: 'regex', pattern: /^x-/, label: 'x-*', provider: 'claude' };

      // assert
      assertEquals(_noLabel.match, 'regex');
      assertEquals(_labeled, { match: 'regex', pattern: /^x-/, label: 'x-*', provider: 'claude' });
    });
  });
});

/**
 * 受理モデル形式の案内文言を生成する `buildValidModelsMessage` のユニットテストスイート。
 *
 * 文言は `AI_MODEL_TO_PROVIDER_MAP` / `AI_PROVIDERS` から動的に導出されるため、
 * 定数の追加・変更が文言へ自動的に反映されることを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-MSG-01-01 〜 T-LIB-AI-MSG-03-01
 *
 * @see buildValidModelsMessage
 */
describe('buildValidModelsMessage', () => {
  /** 引数を省略し、実定数から文言を生成するケース。 */
  describe('When: 正常系', () => {
    /**
     * `exact` エントリは受理されるモデル名そのものであり、一件でも欠ければ利用者は
     * 有効なモデルを無効と誤認する。`sonnet[1m]` / `opus[1m]` は角括弧を含むため
     * 正規表現ではなく部分文字列として検証する。
     */
    it('[Normal] T-LIB-AI-MSG-01-01: exact エントリ 9 件がすべて文言に含まれる', () => {
      // act
      const _message = buildValidModelsMessage();

      // assert
      assertArrayIncludes(_listedModels(_message), [
        'default',
        'best',
        'fable',
        'opus',
        'sonnet',
        'haiku',
        'sonnet[1m]',
        'opus[1m]',
        'opusplan',
      ]);
    });

    /**
     * `regex` エントリは exact 名と同じく実際に受理される形式であり、表示ラベルが欠ければ
     * 利用者はバージョン付きモデル名を指定できないと誤認する。claude 系 3 件は
     * `^claude-` の 1 件へまとめられやすいため、5 件すべてを個別に検証する。
     */
    it('[Normal] T-LIB-AI-MSG-01-02: regex エントリ 5 件の表示ラベルがすべて文言に含まれる', () => {
      // act
      const _message = buildValidModelsMessage();

      // assert
      assertStringIncludes(_message, 'gpt-*');
      assertStringIncludes(_message, 'claude-opus-*');
      assertStringIncludes(_message, 'claude-sonnet-*');
      assertStringIncludes(_message, 'claude-haiku-*');
      assertStringIncludes(_message, 'gemini-*');
    });

    /**
     * `<provider>/<model>` 形式の provider 一覧は実定数から導出される。`llama` は
     * `AI_PROVIDERS` の要素であるため、引数を注入せずに文言へ現れなければならない。
     * 文言全体への部分一致では `ollama` 等へ偽陽性で当たるため、provider 一覧の
     * セグメントをトークンへ分割して検証する（AC-014）。
     */
    it('[Normal] T-LIB-AI-MSG-01-03: <provider>/<model> の provider 一覧に llama が含まれる', () => {
      // act
      const _message = buildValidModelsMessage();

      // assert
      assertArrayIncludes(_listedProviders(_message), ['llama']);
    });

    /**
     * provider 一覧が引数からそのまま導出されることを、実定数に存在しない名前で確認する。
     * 実 provider 名を使うと文言側の手書き分岐でも偶然通ってしまうため、衝突しない
     * テスト専用の名前を渡し、手書き列挙が無いことを保証する。
     */
    it('[Normal] T-LIB-AI-MSG-02-01: provider 一覧を引数で受け取り手書き分岐を経由せず文言へ反映する', () => {
      // act
      const _message = buildValidModelsMessage(['test-provider-xyz', 'another-fake-provider']);

      // assert
      assertStringIncludes(_message, 'test-provider-xyz');
      assertStringIncludes(_message, 'another-fake-provider');
    });

    /**
     * 引数を省略した呼び出しが実定数を束ねていることを固定する。既定引数がハードコードの
     * 配列や部分集合へ差し替えられると、実定数を明示的に渡した結果と文言が食い違うため、
     * 両者の一致で回帰を検出する。
     */
    it('[Normal] T-LIB-AI-MSG-02-02: 既定引数が実定数を束ね実定数の内容と一致する文言を返す', () => {
      // act
      const _message = buildValidModelsMessage();
      const _explicit = buildValidModelsMessage(AI_PROVIDERS, AI_MODEL_TO_PROVIDER_MAP);

      // assert
      assertArrayIncludes(_listedProviders(_message), [...AI_PROVIDERS]);
      assertEquals(_message, _explicit);
    });
  });

  /** 正規表現ソースと表示ラベルの分離を確認するケース。 */
  describe('When: エッジケース', () => {
    /**
     * `regex` エントリの文言は `pattern.source` から導出せず、定義側が持つ表示ラベルを
     * そのまま使う。ラベルが正規表現ソースへ退行すると `^gpt-` のような利用者が
     * 入力できない文字列が案内文言に漏れるため、キャレット付きの形の不在を固定する。
     */
    it('[Edge] T-LIB-AI-MSG-03-01: 正規表現ソースそのものは文言に出力されない', () => {
      // act
      const _message = buildValidModelsMessage();

      // assert
      assertFalse(_message.includes('^gpt-'));
      assertFalse(_message.includes('/^gpt-/'));
      assertFalse(_message.includes('^claude-opus-'));
      assertFalse(_message.includes('^gemini-'));
      assertStringIncludes(_message, 'gpt-*');
    });
  });
});

/**
 * `RunAIOptions.fetchProvider` の型受け入れを固定するテストスイート。
 *
 * HTTP 呼び出しをテストからインジェクトできるよう、`fetch` 互換関数を任意フィールドとして
 * 受け付けることを検証する（値の利用は後続タスク）。
 *
 * テスト ID 範囲: T-LIB-AI-LAP-02
 *
 * @see RunAIOptions
 */
describe('RunAIOptions.fetchProvider', () => {
  it('[Normal] T-LIB-AI-LAP-02-01: FetchProvider 形の関数を任意フィールドへ代入できる', () => {
    // 代入が成立すること自体が検証対象（`globalThis.fetch` が FetchProvider に適合する）
    const _realFetch: FetchProvider = globalThis.fetch;
    const _fakeFetch: FetchProvider = () => Promise.resolve(new Response(''));

    const _options: RunAIOptions = { fetchProvider: _fakeFetch };

    assertEquals(_options.fetchProvider, _fakeFetch);
  });
});
