// src: scripts/types/__tests__/unit/prefilter.types.unit.spec.ts
// @(#): prefilter.types.ts の型定義ユニットテスト
//       対象: PrefilterStats — prefilter 処理の統計情報型
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import type { PrefilterStats } from '../../prefilter.types.ts';

// ─── Tests

/**
 * `PrefilterStats` 型のユニットテストスイート。
 *
 * noise / keep / error フィールドを持つオブジェクトが `PrefilterStats` として代入できることを検証する。
 *
 * テスト ID 範囲: T-PF-PS-01
 *
 * @see PrefilterStats
 */
describe('PrefilterStats', () => {
  /**
   * `PrefilterStats` 型への代入と各フィールド参照の検証。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-PS-01: noise/keep/error フィールドを持つオブジェクトを PrefilterStats として代入できる', () => {
      const _stats: PrefilterStats = { noise: 1, keep: 2, error: 3 };

      assertEquals(_stats.noise, 1);
      assertEquals(_stats.keep, 2);
      assertEquals(_stats.error, 3);
    });
  });
});
