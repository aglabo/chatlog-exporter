// src: skills/_scripts/libs/ai/__tests__/unit/rate-limit-utils.unit.spec.ts
// @(#): rate-limit-utils のユニットテスト
//       対象: isRateLimitError, isFatalAiError
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isFatalAiError, isRateLimitError } from '../../rate-limit-utils.ts';

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

// ─── Internal Helpers (isFatalAiError)

// constants
/** `isFatalAiError` が `true` を返すべきケース（AiError の subindex を問わない致命エラー）。 */
const _fatalTrueCases = [
  {
    id: 'T-LIB-AI-FA-01',
    label: 'Normal',
    desc: 'kind=AiError かつ subindex=ExitFailure の ChatlogError → true',
    value: new ChatlogError('AiError', 'ExitFailure'),
  },
  {
    id: 'T-LIB-AI-FA-02',
    label: 'Normal',
    desc: 'kind=AiError かつ subindex=RateLimit の ChatlogError → true',
    value: new ChatlogError('AiError', 'RateLimit'),
  },
] as const;

/** `isFatalAiError` が `false` を返すべきケース（非 AiError / 非 ChatlogError / 非 Error 値）。 */
const _fatalFalseCases = [
  {
    id: 'T-LIB-AI-FA-03',
    label: 'Error',
    desc: 'kind 違いの ChatlogError（TimedOut/Timeout）→ false',
    value: new ChatlogError('TimedOut', 'Timeout'),
  },
  {
    id: 'T-LIB-AI-FA-04',
    label: 'Error',
    desc: 'ChatlogError 以外の Error → false',
    value: new Error('AiError'),
  },
  {
    id: 'T-LIB-AI-FA-05',
    label: 'Edge',
    desc: '非 Error 値（string）→ false',
    value: 'AiError',
  },
  {
    id: 'T-LIB-AI-FA-06',
    label: 'Edge',
    desc: '非 Error 値（null）→ false',
    value: null,
  },
  {
    id: 'T-LIB-AI-FA-07',
    label: 'Edge',
    desc: '非 Error 値（undefined）→ false',
    value: undefined,
  },
] as const;

/**
 * `isFatalAiError` のユニットテストスイート。
 *
 * AI CLI が非0終了で落ちた致命的 `ChatlogError`（kind==='AiError'）を、
 * subindex（ExitFailure / RateLimit 等）を問わず `true` と判定し、
 * それ以外（kind 違い / 非 ChatlogError / 非 Error 値）は `false` になることを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-FA-01 〜 T-LIB-AI-FA-07
 *
 * @see isFatalAiError
 */
describe('isFatalAiError', () => {
  describe('When: 正常系', () => {
    for (const { id, label, desc, value } of _fatalTrueCases) {
      it(`[${label}] ${id}: ${desc}`, () => {
        assertEquals(isFatalAiError(value), true);
      });
    }
  });

  describe('When: 異常系・エッジケース', () => {
    for (const { id, label, desc, value } of _fatalFalseCases) {
      it(`[${label}] ${id}: ${desc}`, () => {
        assertEquals(isFatalAiError(value), false);
      });
    }
  });
});
