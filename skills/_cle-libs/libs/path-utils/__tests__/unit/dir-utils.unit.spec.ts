// src: skills/_cle-libs/libs/path-utils/__tests__/unit/dir-utils.unit.spec.ts
// @(#): dir-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { getProjectRoot, resetProjectRoot } from '../../dir-utils.ts';

// ─── Tests

// ─────────────────────────────────────────────
// getProjectRoot / resetProjectRoot
// ─────────────────────────────────────────────

/**
 * `getProjectRoot` / `resetProjectRoot` のユニットテストスイート。
 *
 * シード設定・キャッシュ動作・リセット・バックスラッシュ正規化を検証する。
 *
 * テスト ID 範囲: T-LIB-DU-60 〜 T-LIB-DU-62
 *
 * @see getProjectRoot
 * @see resetProjectRoot
 */
describe('getProjectRoot / resetProjectRoot', () => {
  beforeEach(() => resetProjectRoot());

  /** seed 設定後に getProjectRoot() がシードした値をそのまま返すテスト。 */
  describe('When: resetProjectRoot でパスをシードした場合', () => {
    it('[Normal] T-LIB-DU-60-01: resetProjectRoot("/home/user/project") 後に getProjectRoot() → "/home/user/project" が返る', () => {
      resetProjectRoot('/home/user/project');
      const _result = getProjectRoot();
      assertEquals(_result, '/home/user/project');
    });

    it('[Normal] T-LIB-DU-60-02: getProjectRoot() を 2 回呼ぶ → キャッシュが機能し両方同じ値を返す', () => {
      resetProjectRoot('/home/user/project');
      const _result1 = getProjectRoot();
      const _result2 = getProjectRoot();
      assertEquals(_result1, '/home/user/project');
      assertEquals(_result2, '/home/user/project');
    });

    it('[Edge] T-LIB-DU-60-03: resetProjectRoot("/proj1") → getProjectRoot() → resetProjectRoot("/proj2") → getProjectRoot() → それぞれ正しい値を返す', () => {
      resetProjectRoot('/proj1');
      const _result1 = getProjectRoot();
      resetProjectRoot('/proj2');
      const _result2 = getProjectRoot();
      assertEquals(_result1, '/proj1');
      assertEquals(_result2, '/proj2');
    });
  });

  /** 引数なし/空文字でキャッシュがクリアされることを確認するテスト。 */
  describe('When: resetProjectRoot を引数なし/空文字で呼んだ場合', () => {
    it('[Normal] T-LIB-DU-61-01: resetProjectRoot() 後に再シードすると新しい値が返る', () => {
      resetProjectRoot('/home/user/project');
      resetProjectRoot();
      resetProjectRoot('/new/path');
      const _result = getProjectRoot();
      assertEquals(_result, '/new/path');
    });

    it('[Edge] T-LIB-DU-61-02: resetProjectRoot("") 後に再シードすると新しい値が返る', () => {
      resetProjectRoot('/home/user/project');
      resetProjectRoot('');
      resetProjectRoot('/another/path');
      const _result = getProjectRoot();
      assertEquals(_result, '/another/path');
    });
  });

  /** バックスラッシュパスが正規化されることを確認するテスト。 */
  describe('When: バックスラッシュパスをシードする場合', () => {
    it('[Edge] T-LIB-DU-62-01: resetProjectRoot("C:\\\\Users\\\\foo") → getProjectRoot() → "C:/Users/foo" が返る', () => {
      resetProjectRoot('C:\\Users\\foo');
      const _result = getProjectRoot();
      assertEquals(_result, 'C:/Users/foo');
    });
  });
});
