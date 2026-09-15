// src: skills/_cle-libs/libs/ai/__tests__/integration/run-ai.integration.spec.ts
// @(#): runAI の統合テスト
//       Deno.Command モックを使った Claude CLI 呼び出しの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runAI } from '../../run-ai.ts';

// ─── Classes
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';

// ─── Helpers
import type { CommandMockHandle } from '../../../../__tests__/helpers/deno-command-mock.ts';
import { installCommandMock, makeNotFoundMock } from '../../../../__tests__/helpers/deno-command-mock.ts';

// ─── Tests

let commandHandle: CommandMockHandle;

// 設定ファイル（.config/chatlog-exporter/config.yaml）を読ませず、テストが与える YAML で設定を固定する
beforeEach(() => {
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: 'model: sonnet\n' });
});

afterEach(() => {
  commandHandle?.restore();
  GlobalConfig.resetInstance();
});

describe('runAI', () => {
  // ─── NotFound で例外スロー ────────────────────────────────────────────────

  describe('Given: claude CLI が存在しない (NotFound) モック', () => {
    describe('When: runAI(system, user) を呼び出す', () => {
      describe('Then: T-LIB-AI-RA-IT-04 - Deno.errors.NotFound がスローされる', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeNotFoundMock());
        });

        it('T-LIB-AI-RA-IT-04-01: Deno.errors.NotFound がスローされる', async () => {
          await assertRejects(
            () => runAI('system prompt', 'user prompt'),
            Deno.errors.NotFound,
          );
        });
      });
    });
  });
});
