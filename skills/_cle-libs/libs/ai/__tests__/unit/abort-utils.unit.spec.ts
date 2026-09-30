// src: skills/_cle-libs/libs/ai/__tests__/unit/abort-utils.unit.spec.ts
// @(#): abort-utils のユニットテスト
//       対象: isAbortingAiError, describeAbortReason, isResponseFormatViolation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { describeAbortReason, isAbortingAiError, isResponseFormatViolation } from '../../abort-utils.ts';

// ─── Regression targets (未変更の既存判定関数)
import { isFatalAiError, isRateLimitError } from '../../rate-limit-utils.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Internal Helpers

// constants
/** `isAbortingAiError` が `true` を返すべき中断側ケース。 */
const _trueCases = [
  {
    id: 'T-LIB-AI-LAP-01-01',
    desc: 'kind=AiError かつ subindex=RateLimit の ChatlogError → true',
    value: new ChatlogError('AiError', 'RateLimit'),
  },
  {
    id: 'T-LIB-AI-LAP-01-02',
    desc: 'kind=AiError かつ subindex=InvalidEndpoint の ChatlogError → true',
    value: new ChatlogError('AiError', 'InvalidEndpoint'),
  },
  {
    id: 'T-LIB-AI-LAP-01-03',
    desc: 'kind=AiError かつ subindex=BackendUnavailable の ChatlogError → true',
    value: new ChatlogError('AiError', 'BackendUnavailable'),
  },
  {
    id: 'T-LIB-AI-LAP-01-04',
    desc: 'kind=AiError かつ subindex=ResponseFormatRejected の ChatlogError → true',
    value: new ChatlogError('AiError', 'ResponseFormatRejected'),
  },
] as const;

/** `isAbortingAiError` が `false` を返すべき続行側・エッジケース。 */
const _falseCases = [
  {
    id: 'T-LIB-AI-LAP-03-01',
    label: 'Edge',
    desc: 'kind=AiError だが続行側 subindex=ExitFailure の ChatlogError → false',
    value: new ChatlogError('AiError', 'ExitFailure'),
  },
  {
    id: 'T-LIB-AI-LAP-03-02',
    label: 'Edge',
    desc: 'kind=AiError だが続行側 subindex=ResponseSchemaViolation の ChatlogError → false',
    value: new ChatlogError('AiError', 'ResponseSchemaViolation'),
  },
  {
    id: 'T-LIB-AI-LAP-03-03',
    label: 'Edge',
    desc: '中断側 subindex だが kind 違いの ChatlogError → false',
    value: new ChatlogError('UnknownModel', 'BackendUnavailable'),
  },
  {
    id: 'T-LIB-AI-LAP-05-01',
    label: 'Edge',
    desc: 'ChatlogError 以外の Error → false',
    value: new Error('BackendUnavailable'),
  },
  {
    id: 'T-LIB-AI-LAP-05-03',
    label: 'Edge',
    desc: 'kind も subindex も持たない任意オブジェクト → false',
    value: { foo: 'bar' },
  },
] as const;

/** `describeAbortReason` が理由ラベルを返すべき中断側ケース。 */
const _reasonCases = [
  {
    id: 'T-LIB-AI-LAP-06-01',
    subindex: 'RateLimit',
    expected: 'レートリミット',
  },
  {
    id: 'T-LIB-AI-LAP-06-02',
    subindex: 'InvalidEndpoint',
    expected: 'エンドポイント設定の不備',
  },
  {
    id: 'T-LIB-AI-LAP-06-03',
    subindex: 'BackendUnavailable',
    expected: 'AI バックエンドへの接続失敗',
  },
  {
    id: 'T-LIB-AI-LAP-06-04',
    subindex: 'ResponseFormatRejected',
    expected: 'レスポンス形式の拒否',
  },
] as const;

/** `isResponseFormatViolation` が `true` を返すべき続行側ケース。 */
const _violationTrueCases = [
  {
    id: 'T-LIB-AI-LAP-09-01',
    desc: 'kind=AiError かつ subindex=ResponseSchemaViolation の ChatlogError → true',
    value: new ChatlogError('AiError', 'ResponseSchemaViolation'),
  },
  {
    id: 'T-LIB-AI-LAP-09-02',
    desc: 'detail 付きでも subindex が一致すれば true',
    value: new ChatlogError('AiError', 'ResponseSchemaViolation', 'response body is not valid JSON'),
  },
] as const;

/**
 * `isResponseFormatViolation` が `false` を返すべきケース。
 *
 * 中断側 4 subindex を明示的に並べるのは、`ResponseFormatRejected` と
 * `ResponseSchemaViolation` が名前も `kind` も近く、取り違えると再要求の可否が
 * 逆になるためである（前者は中断、後者は再要求）。
 */
const _violationFalseCases = [
  {
    id: 'T-LIB-AI-LAP-10-01',
    label: 'Edge',
    desc: '中断側 subindex=RateLimit → false',
    value: new ChatlogError('AiError', 'RateLimit'),
  },
  {
    id: 'T-LIB-AI-LAP-10-02',
    label: 'Edge',
    desc: '中断側 subindex=InvalidEndpoint → false',
    value: new ChatlogError('AiError', 'InvalidEndpoint'),
  },
  {
    id: 'T-LIB-AI-LAP-10-03',
    label: 'Edge',
    desc: '中断側 subindex=BackendUnavailable → false',
    value: new ChatlogError('AiError', 'BackendUnavailable'),
  },
  {
    id: 'T-LIB-AI-LAP-10-04',
    label: 'Edge',
    desc: '中断側 subindex=ResponseFormatRejected → false（名前が似ているが扱いは逆）',
    value: new ChatlogError('AiError', 'ResponseFormatRejected'),
  },
  {
    id: 'T-LIB-AI-LAP-10-05',
    label: 'Edge',
    desc: '続行側だが subindex 違いの ExitFailure → false',
    value: new ChatlogError('AiError', 'ExitFailure'),
  },
  {
    id: 'T-LIB-AI-LAP-10-06',
    label: 'Edge',
    desc: 'subindex は一致するが kind 違いの ChatlogError → false',
    value: new ChatlogError('InvalidFormat', 'ResponseSchemaViolation'),
  },
  {
    id: 'T-LIB-AI-LAP-10-07',
    label: 'Edge',
    desc: 'ChatlogError 以外の Error → false',
    value: new Error('x'),
  },
] as const;

// ─── Tests

/**
 * `isAbortingAiError` のユニットテストスイート。
 *
 * llama 経路で一括処理を中断すべき `ChatlogError` のみを `true` と判定することを検証する。
 *
 * テスト ID: T-LIB-AI-LAP-01-01〜01-04 / 03-01〜03-03 / 05-01〜05-03
 * （04-01・04-02 は別 describe の回帰テスト）
 *
 * @see isAbortingAiError
 */
describe('isAbortingAiError', () => {
  describe('When: 正常系', () => {
    for (const { id, desc, value } of _trueCases) {
      it(`[Normal] ${id}: ${desc}`, () => {
        assertEquals(isAbortingAiError(value), true);
      });
    }
  });

  describe('When: 続行側・エッジケース', () => {
    for (const { id, label, desc, value } of _falseCases) {
      it(`[${label}] ${id}: ${desc}`, () => {
        assertEquals(isAbortingAiError(value), false);
      });
    }

    it('[Edge] T-LIB-AI-LAP-05-02: null / undefined → false（throw しない）', () => {
      assertEquals(isAbortingAiError(null), false);
      assertEquals(isAbortingAiError(undefined), false);
    });
  });
});

/**
 * 既存判定関数の回帰テスト。
 *
 * 兄弟述語 `isAbortingAiError` の追加後も `isRateLimitError` / `isFatalAiError` の
 * 真偽が変わらないことを固定する。
 *
 * テスト ID 範囲: T-LIB-AI-LAP-04-01 〜 T-LIB-AI-LAP-04-02
 */
describe('回帰: 既存判定関数の挙動', () => {
  it('[Normal] T-LIB-AI-LAP-04-01: isRateLimitError は RateLimit のみ true のまま', () => {
    assertEquals(isRateLimitError(new ChatlogError('AiError', 'RateLimit')), true);
    assertEquals(isRateLimitError(new ChatlogError('AiError', 'ExitFailure')), false);
  });

  it('[Normal] T-LIB-AI-LAP-04-02: isFatalAiError は kind=AiError のみ true のまま', () => {
    assertEquals(isFatalAiError(new ChatlogError('AiError', 'ExitFailure')), true);
    assertEquals(isFatalAiError(new ChatlogError('TimedOut', 'Timeout')), false);
  });
});

/**
 * `describeAbortReason` のユニットテストスイート。
 *
 * 中断側 `ChatlogError` に対してのみ、ユーザーに提示する理由ラベルを返すことを検証する。
 * 続行側・非 `ChatlogError` では `undefined` を返し、呼び出し元が中立な既定文言へ
 * フォールバックできることを固定する。
 *
 * テスト ID 範囲: T-LIB-AI-LAP-06-01 〜 T-LIB-AI-LAP-07-03
 *
 * @see describeAbortReason
 */
describe('describeAbortReason', () => {
  describe('When: 正常系', () => {
    for (const { id, subindex, expected } of _reasonCases) {
      it(`[Normal] ${id}: subindex=${subindex} → ${expected}`, () => {
        assertEquals(describeAbortReason(new ChatlogError('AiError', subindex)), expected);
      });
    }
  });

  describe('When: 続行側・エッジケース', () => {
    it('[Edge] T-LIB-AI-LAP-07-01: 続行側 subindex=ExitFailure → undefined', () => {
      assertEquals(describeAbortReason(new ChatlogError('AiError', 'ExitFailure')), undefined);
    });

    it('[Edge] T-LIB-AI-LAP-07-02: 続行側 subindex=ResponseSchemaViolation → undefined', () => {
      assertEquals(describeAbortReason(new ChatlogError('AiError', 'ResponseSchemaViolation')), undefined);
    });

    it('[Edge] T-LIB-AI-LAP-07-03: ChatlogError 以外・null / undefined → undefined（throw しない）', () => {
      assertEquals(describeAbortReason(new Error('BackendUnavailable')), undefined);
      assertEquals(describeAbortReason(null), undefined);
      assertEquals(describeAbortReason(undefined), undefined);
    });
  });
});

/**
 * `isResponseFormatViolation` のユニットテストスイート。
 *
 * llama 経路が応答形式違反として投げる `ChatlogError('AiError', 'ResponseSchemaViolation', ...)`
 * のみを `true` と判定し、中断側 subindex・kind 違い・非 `ChatlogError` を `false` に保つことを
 * 検証する。この述語は「同じ要求を送り直せば直り得るか」の線引きであり、`isAbortingAiError` と
 * 真偽が重ならないことが要件である。
 *
 * テスト ID 範囲: T-LIB-AI-LAP-09-01 〜 T-LIB-AI-LAP-10-08
 *
 * @see isResponseFormatViolation
 */
describe('isResponseFormatViolation', () => {
  describe('When: 正常系', () => {
    for (const { id, desc, value } of _violationTrueCases) {
      it(`[Normal] ${id}: ${desc}`, () => {
        assertEquals(isResponseFormatViolation(value), true);
      });
    }
  });

  describe('When: 中断側・エッジケース', () => {
    for (const { id, label, desc, value } of _violationFalseCases) {
      it(`[${label}] ${id}: ${desc}`, () => {
        assertEquals(isResponseFormatViolation(value), false);
      });
    }

    it('[Edge] T-LIB-AI-LAP-10-08: null / undefined → false（throw しない）', () => {
      assertEquals(isResponseFormatViolation(null), false);
      assertEquals(isResponseFormatViolation(undefined), false);
    });
  });
});
