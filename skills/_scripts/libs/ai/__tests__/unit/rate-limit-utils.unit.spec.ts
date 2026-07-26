// src: skills/_scripts/libs/ai/__tests__/unit/rate-limit-utils.unit.spec.ts
// @(#): rate-limit-utils のユニットテスト
//       対象: isRateLimitError
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isRateLimitError } from '../../rate-limit-utils.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Internal Helpers

// constants
/** `isRateLimitError` が `true` を返すべき正常系ケース。 */
const _trueCases = [
  {
    id: 'T-LIB-AI-RL-01',
    desc: 'kind=AiError かつ subindex=RateLimit の ChatlogError → true',
    value: new ChatlogError('AiError', 'RateLimit'),
  },
] as const;

/** `isRateLimitError` が `false` を返すべき異常系・エッジケース。 */
const _falseCases = [
  {
    id: 'T-LIB-AI-RL-02',
    label: 'Error',
    desc: 'kind=AiError だが subindex 違いの ChatlogError → false',
    value: new ChatlogError('AiError', 'TimedOut'),
  },
  {
    id: 'T-LIB-AI-RL-03',
    label: 'Error',
    desc: 'subindex=RateLimit だが kind 違いの ChatlogError → false',
    value: new ChatlogError('TimedOut', 'RateLimit'),
  },
  {
    id: 'T-LIB-AI-RL-04',
    label: 'Error',
    desc: 'ChatlogError 以外の Error → false',
    value: new Error('RateLimit'),
  },
  {
    id: 'T-LIB-AI-RL-05',
    label: 'Edge',
    desc: '非 Error 値（string）→ false',
    value: 'RateLimit',
  },
  {
    id: 'T-LIB-AI-RL-06',
    label: 'Edge',
    desc: '非 Error 値（null）→ false',
    value: null,
  },
  {
    id: 'T-LIB-AI-RL-07',
    label: 'Edge',
    desc: '非 Error 値（undefined）→ false',
    value: undefined,
  },
] as const;

// ─── Tests

/**
 * `isRateLimitError` のユニットテストスイート。
 *
 * AI レートリミット由来の `ChatlogError` のみを判定し、
 * それ以外（kind 違い / subindex 違い / 非 ChatlogError / 非 Error 値）は
 * すべて `false` になることを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-RL-01 〜 T-LIB-AI-RL-07
 *
 * @see isRateLimitError
 */
describe('isRateLimitError', () => {
  describe('When: 正常系', () => {
    for (const { id, desc, value } of _trueCases) {
      it(`[Normal] ${id}: ${desc}`, () => {
        assertEquals(isRateLimitError(value), true);
      });
    }
  });

  describe('When: 異常系・エッジケース', () => {
    for (const { id, label, desc, value } of _falseCases) {
      it(`[${label}] ${id}: ${desc}`, () => {
        assertEquals(isRateLimitError(value), false);
      });
    }
  });
});
