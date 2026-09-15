// src: skills/_cle-libs/libs/__tests__/ai/system/run-ai.system.spec.ts
// @(#): runAI のシステムテスト（実 Claude CLI 使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

import { runAI } from '../../run-ai.ts';

const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

// ─────────────────────────────────────────────
// runAI
// ─────────────────────────────────────────────

// ─── ignore check
describe('should ignore runAI', { ignore: !_shouldRunAI }, () => {
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
