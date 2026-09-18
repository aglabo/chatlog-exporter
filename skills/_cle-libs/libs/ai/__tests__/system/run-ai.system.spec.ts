// src: skills/_cle-libs/libs/__tests__/ai/system/run-ai.system.spec.ts
// @(#): runAI のシステムテスト（実 Claude CLI / 実 llama サーバ使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

import { runAI } from '../../run-ai.ts';

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

/** llama 経路は出力契約が必須（DR-19）。応答を `reply: <text>` として復元させる。 */
const _REPLY_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: { reply: { type: 'string' } },
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
});
