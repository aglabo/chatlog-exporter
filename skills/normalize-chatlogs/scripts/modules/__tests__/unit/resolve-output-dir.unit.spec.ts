// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/resolve-output-dir.unit.spec.ts
// @(#): resolveOutputDir のユニットテスト
//       対象: resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { resolveOutputDir } from '../../../phases/phase-write.ts';

// ─── Tests

/**
 * `resolveOutputDir` のユニットテストスイート。
 *
 * outputBase に project を結合するだけの単純な振る舞いの正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-NCH-ROD-01-01 〜 T-NCH-ROD-02-01
 *
 * @see resolveOutputDir
 */
describe('resolveOutputDir', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-NCH-ROD-01-01: project を指定したとき outputBase/project を返す', () => {
      const result = resolveOutputDir('base', 'my-app');
      assertEquals(result, 'base/my-app');
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-NCH-ROD-02-01: project が undefined のとき outputBase/misc を返す', () => {
      const result = resolveOutputDir('base', undefined);
      assertEquals(result, 'base/misc');
    });
  });
});
