// src: skills/_cle-libs/libs/__tests__/ai/system/run-ai.system.spec.ts
// @(#): runAI のシステムテスト（実 Claude CLI 使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assertRejects, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
import { runAI } from '../../run-ai.ts';

const _shouldRunClaude = Deno.env.get('RUN_CLAUDE_TESTS') === '1';

// ─────────────────────────────────────────────
// runAI
// ─────────────────────────────────────────────

// ─── ignore check
describe('should ignore runAI', { ignore: !_shouldRunClaude }, () => {
  it(
    'T-LIB-RA-SYS-01-01: 返却文字列が "hello" を含む（大文字小文字問わず）',
    async () => {
      const result = await runAI(
        'You are a test assistant. Reply only with the single word "hello" and nothing else.',
        'hello, and only reply "hello".',
      );
      assertStringIncludes(result.toLowerCase(), 'hello');
    },
  );
});

// ──── グループ02: 不正モデル名
describe('invalid model', () => {
  describe('Given: 不正なモデル名 "invalid-model"', () => {
    describe('When: runAI() を呼ぶ', () => {
      describe('Then: T-LIB-RA-SYS-02 - UnknownModel エラーがスローされる', () => {
        it('T-LIB-RA-SYS-02-01: ChatlogError(UnknownModel) がスローされる', async () => {
          await assertRejects(
            () => runAI('system', 'user', { model: 'invalid-model' }),
            ChatlogError,
            'Unknown Model',
          );
        });
      });
    });
  });
});
