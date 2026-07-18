// src: scripts/__tests__/unit/resolve-session-id.unit.spec.ts
// @(#): sessionId 解決関数のユニットテスト
//       対象: resolveSessionId
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { resolveSessionId } from '../../libs/session-writer.ts';

// ─── Tests

/**
 * `resolveSessionId` のユニットテストスイート。
 *
 * sessionId が存在する通常ケースでは値を変更せずそのまま返し、
 * sessionId が欠落している場合のみ `generateHash` で一意な代替値を生成することを検証する。
 *
 * @see resolveSessionId
 */
describe('resolveSessionId', () => {
  /** sessionId が存在する通常ケース。 */
  describe('Given: sessionId が存在する', () => {
    describe('When: resolveSessionId(sessionId) を呼び出す', () => {
      describe('Then: T-EC-RS-01 - 渡した sessionId をそのまま返す', () => {
        it('T-EC-RS-01-01: sessionId="sess-0001" → "sess-0001" が返る（値が変わらない）', async () => {
          const result = await resolveSessionId('sess-0001');
          assertEquals(result, 'sess-0001');
        });
      });
    });
  });

  /** sessionId が欠落している場合に、呼び出しごとに異なる代替値を生成するケース。 */
  describe('Given: sessionId が undefined', () => {
    describe('When: resolveSessionId(undefined) を2回呼び出す', () => {
      describe('Then: T-EC-RS-02 - 呼び出しごとに異なる代替値が生成される', () => {
        it('T-EC-RS-02-01: 2回の呼び出し結果が異なる（フォールバック衝突を回避する）', async () => {
          const result1 = await resolveSessionId(undefined);
          const result2 = await resolveSessionId(undefined);
          assertNotEquals(result1, result2);
        });
      });
    });
  });
});
