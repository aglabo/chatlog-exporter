// src: scripts/__tests__/integration/set-frontmatter.run-claude.integration.spec.ts
// @(#): runClaude の統合テスト
//       Deno.Command モックを使った Claude CLI 呼び出しの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test helpers
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// test target
import { runClaude } from '../../set-frontmatter.ts';

const _enc = new TextEncoder();

// ─── テスト共通セットアップ ───────────────────────────────────────────────────

let commandHandle: CommandMockHandle;

afterEach(() => {
  commandHandle?.restore();
});

// ─── 正常終了の場合 ───────────────────────────────────────────────────────────

describe('runClaude', () => {
  describe('Given: Claude CLI が "research" を返す成功モック', () => {
    describe('When: runClaude(system, user) を呼び出す', () => {
      describe('Then: T-SF-RC-01 - "research" が返る（trim済み）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
        });

        it('T-SF-RC-01-01: 返り値が "research" になる', async () => {
          const result = await runClaude('system prompt', 'user prompt');

          assertEquals(result, 'research');
        });
      });
    });
  });

  // ─── 空白付き stdout の trim ─────────────────────────────────────────────

  describe('Given: Claude CLI が空白付き "  research  \\n" を返す成功モック', () => {
    describe('When: runClaude(system, user) を呼び出す', () => {
      describe('Then: T-SF-RC-02 - trim されて "research" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('  research  \n')));
        });

        it('T-SF-RC-02-01: 返り値が "research" になる', async () => {
          const result = await runClaude('system prompt', 'user prompt');

          assertEquals(result, 'research');
        });
      });
    });
  });

  // ─── 非ゼロ exit で Error スロー ─────────────────────────────────────────

  describe('Given: Claude CLI が exit code=1 で失敗するモック', () => {
    describe('When: runClaude(system, user) を呼び出す', () => {
      describe('Then: T-SF-RC-03 - Error がスローされる', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-RC-03-01: Error がスローされる', async () => {
          await assertRejects(
            () => runClaude('system prompt', 'user prompt'),
            Error,
          );
        });
      });
    });
  });

  // ─── NotFound で例外スロー ────────────────────────────────────────────────

  describe('Given: claude CLI が存在しない (NotFound) モック', () => {
    describe('When: runClaude(system, user) を呼び出す', () => {
      describe('Then: T-SF-RC-04 - Deno.errors.NotFound がスローされる', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeNotFoundMock());
        });

        it('T-SF-RC-04-01: Deno.errors.NotFound がスローされる', async () => {
          await assertRejects(
            () => runClaude('system prompt', 'user prompt'),
            Deno.errors.NotFound,
          );
        });
      });
    });
  });
});
