// src: skills/_cle-libs/libs/__tests__/ai/system/run-ai.system.spec.ts
// @(#): runAI のシステムテスト（実 Claude CLI / 実 codex CLI / 実 llama サーバ使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

import { _buildCommand, runAI } from '../../run-ai.ts';

// ─── Classes
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';

// ─── Types
import type { OutputContract } from '../../../../types/json-schema.types.ts';

// ─── Internal Helpers

const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

const _SYSTEM_PROMPT = 'You are a test assistant. Reply only with the single word "hello" and nothing else.';
const _USER_PROMPT = 'hello, and only reply "hello".';

/** claude 経路に固定するモデル。設定ファイルの model に左右されないよう明示する。 */
const _CLAUDE_MODEL = 'haiku';

/**
 * codex 経路に固定するモデル。設定ファイルの model に左右されないよう明示する。
 * codex 経路（bare `gpt-*`）に振り分けられ、かつ codex のアカウントで利用できるモデルでなければならない。
 */
const _CODEX_MODEL = 'gpt-6-luna';

/** codex 経路で system prompt が届いたことを示す固有トークン。user prompt には含めない。 */
const _CODEX_TOKEN = 'ZEBRA-42';
const _CODEX_SYSTEM_PROMPT = `You are a test assistant. Reply with exactly the token ${_CODEX_TOKEN} and nothing else.`;
/** トークンに言及しない中立な user prompt。応答にトークンが出れば system prompt 由来と言える。 */
const _CODEX_USER_PROMPT = 'Follow the system prompt.';

/** `codex` コマンドが PATH 上で起動できるか。起動できない環境では codex 系テストを ignore する。 */
const _isCodexAvailable = async (): Promise<boolean> => {
  try {
    await new Deno.Command('codex', { args: ['--version'], stdout: 'null', stderr: 'null' }).output();
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return false;
    }
    throw e;
  }
};
const _hasCodexCli = await _isCodexAvailable();

/** llama 経路は出力契約が必須（DR-19）。応答を `reply: <text>` として復元させる。 */
const _REPLY_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: { reply: { type: 'string' } },
  maxTokens: 256,
};

// llama 経路は設定ファイル（.config/chatlog-exporter/config.yaml）の model / llamaEndpoint を使う
const _llamaModel = GlobalConfig.getInstance().get('model') as string;
const _llamaEndpoint = GlobalConfig.getInstance().get('llamaEndpoint') as string;
const _hasLlamaServer = _llamaModel.startsWith('llama/') && _llamaEndpoint !== '';

// ─────────────────────────────────────────────
// runAI
// ─────────────────────────────────────────────

// ─── ignore check
describe('should ignore runAI', { ignore: !_shouldRunAI }, () => {
  it(
    'T-LIB-RA-SYS-01-01: claude 経路: 返却文字列が "hello" を含む（大文字小文字問わず）',
    async () => {
      const result = await runAI(_SYSTEM_PROMPT, _USER_PROMPT, { model: _CLAUDE_MODEL });
      assertStringIncludes(result.toLowerCase(), 'hello');
    },
  );

  it(
    'T-LIB-RA-SYS-01-02: llama 経路: 出力契約付きで返却文字列が "hello" を含む（大文字小文字問わず）',
    { ignore: !_hasLlamaServer },
    async () => {
      const result = await runAI(_SYSTEM_PROMPT, _USER_PROMPT, {
        model: _llamaModel,
        outputContract: _REPLY_CONTRACT,
      });
      assertStringIncludes(result.toLowerCase(), 'hello');
    },
  );

  it(
    'T-LIB-RA-SYS-01-03: codex 経路: system prompt だけが指示する固有トークン "ZEBRA-42" を返却文字列が含む',
    { ignore: !_hasCodexCli },
    async () => {
      const result = await runAI(_CODEX_SYSTEM_PROMPT, _CODEX_USER_PROMPT, { model: _CODEX_MODEL });
      assertStringIncludes(result.toUpperCase(), _CODEX_TOKEN);
    },
  );
});

// ─────────────────────────────────────────────
// _buildCommand（実 CLI の引数受理）
// ─────────────────────────────────────────────

// API を呼ばない（`--help` で引数解析のみ行わせる）ため RUN_AI で gate しない
describe('Given: 実 codex CLI が PATH 上にある', { ignore: !_hasCodexCli }, () => {
  describe('When: _buildCommand が生成した codex 用 argv に --help を付けて実 CLI を起動する', () => {
    it(
      '[Normal] T-LIB-RA-SYS-02-01: codex が argv を受理して終了コード 0 で終わる（未知の引数で clap が exit 2 にしない）',
      async () => {
        const spec = _buildCommand(_CODEX_MODEL, 'sys');
        const { code, stderr } = await new Deno.Command(spec.command, {
          args: [...spec.args, '--help'],
          stdout: 'piped',
          stderr: 'piped',
        }).output();
        assertEquals(code, 0, `codex rejected argv ${JSON.stringify(spec.args)}: ${new TextDecoder().decode(stderr)}`);
      },
    );
  });
});
