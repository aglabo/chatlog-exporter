// src: skills/_scripts/libs/ai/__tests__/unit/run-ai.unit.spec.ts
// @(#): run-ai のユニットテスト
//       対象: runAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { runAI } from '../../run-ai.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Tests

/**
 * `runAI` 関数のユニットテストスイート。
 *
 * モデルバリデーション（UnknownModel）の subindex 設定を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-RA-01
 *
 * @see runAI
 */
describe('runAI', () => {
  /**
   * モデルバリデーションの検証。
   *
   * 無効なモデル名が渡された場合に ChatlogError(UnknownModel) が
   * 正しい subindex ('ModelName') でスローされることを確認する。
   */
  describe('model validation', () => {
    /** 無効なモデル名によるエラーケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-AI-RA-01: 無効なモデル名 → ChatlogError(UnknownModel) subindex=ModelName', async () => {
        const _err = await assertRejects(
          () => runAI('system', 'user', { model: 'invalid-model' }),
          ChatlogError,
        ) as ChatlogError;
        assertEquals(_err.kind, 'UnknownModel');
        assertEquals(_err.subindex, 'ModelName');
      });
    });
  });
});
