// src: scripts/phases/__tests__/unit/resolve-project.unit.spec.ts
// @(#): resolveProject の単体テスト
//       対象: resolveProject
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { resolveProject } from '../../phase-write.ts';

// ─── Helpers
// constants
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';

// ─── Tests

/**
 * `resolveProject` のユニットテストスイート。
 *
 * `project` の値に応じたフォールバック解決を検証する。
 *
 * テスト ID 範囲: T-CL-RP-01 〜 T-CL-RP-02
 *
 * @see resolveProject
 */
describe('resolveProject', () => {
  /**
   * 正常系: project に通常の文字列を渡した場合の振る舞いテスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-RP-01: project="app1" → "app1" がそのまま返る', () => {
      assertEquals(resolveProject('app1'), 'app1');
    });
  });

  /**
   * エッジケース: project が undefined の場合の振る舞いテスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-RP-02: project=undefined → FALLBACK_PROJECT が返る', () => {
      assertEquals(resolveProject(undefined), FALLBACK_PROJECT);
    });
  });
});
