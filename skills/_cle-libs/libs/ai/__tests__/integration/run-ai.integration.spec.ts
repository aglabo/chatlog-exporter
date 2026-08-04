// src: skills/_cle-libs/libs/ai/__tests__/integration/run-ai.integration.spec.ts
// @(#): runAI の統合テスト
//       Deno.Command モックを使った Claude CLI 呼び出しの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runAI } from '../../run-ai.ts';

// ─── Helpers
import type { CommandMockHandle } from '../../../../__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../__tests__/helpers/deno-command-mock.ts';

// ─── Internal Helpers

// constants
const _enc = new TextEncoder();

// ─── Tests

let commandHandle: CommandMockHandle;

afterEach(() => {
  commandHandle?.restore();
});

describe('runAI', () => {
  // ─── 空白付き stdout の trim ─────────────────────────────────────────────

  describe('Given: Claude CLI が先頭バナー付き JSON `{"result":"research"}` を返す成功モック', () => {
    describe('When: runAI(system, user) を呼び出す', () => {
      describe('Then: T-LIB-AI-RA-IT-02 - バナー除去 + .result 抽出で "research" が返る', () => {
        beforeEach(() => {
          const _banner =
            '⚠ Sandbox disabled: sandbox is enabled but the Windows sandbox is not active on this session (feature gate off)';
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode(`${_banner}\n{"result":"research"}`)));
        });

        it('T-LIB-AI-RA-IT-02-01: 返り値が "research" になる', async () => {
          const result = await runAI('system prompt', 'user prompt');

          assertEquals(result, 'research');
        });
      });
    });
  });

  // ─── 非ゼロ exit で Error スロー ─────────────────────────────────────────

  describe('Given: Claude CLI が exit code=1 で失敗するモック', () => {
    describe('When: runAI(system, user) を呼び出す', () => {
      describe('Then: T-LIB-AI-RA-IT-03 - Error がスローされる', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-LIB-AI-RA-IT-03-01: Error がスローされる', async () => {
          await assertRejects(
            () => runAI('system prompt', 'user prompt'),
            Error,
          );
        });
      });
    });
  });

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
