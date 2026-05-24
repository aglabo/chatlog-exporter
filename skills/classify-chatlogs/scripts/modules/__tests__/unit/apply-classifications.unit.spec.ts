// src: scripts/modules/__tests__/unit/apply-classifications.unit.spec.ts
// @(#): applyClassifications の単体テスト
//       対象: applyClassifications
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { applyClassifications } from '../../file-ops.ts';

// ─── Helpers
// types
import type { ClassifyBuffer } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `applyClassifications` のユニットテストスイート。
 *
 * バッファエントリの action に基づく振る舞いを検証する。
 *
 * テスト ID 範囲: T-CL-AC-01 〜 T-CL-AC-04
 *
 * @see applyClassifications
 */
describe('applyClassifications', () => {
  /**
   * 正常系: 各 action の振る舞いテスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-AC-01: action=skip → stats.skipped++ のみ、classifyFile 未呼び出し', async () => {
      const _entry = _makeEntry('/tmp/input/test.md');
      const _buffer: ClassifyBuffer = [{ file: _entry, project: 'app1', byAI: false, action: 'skip' }];
      const _stats = _makeStats();

      await applyClassifications(_buffer, false, _stats);

      assertEquals(_stats.skipped, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
    });

    it('[Normal] T-CL-AC-04: 空バッファ → 何も起きない', async () => {
      const _buffer: ClassifyBuffer = [];
      const _stats = _makeStats();

      await applyClassifications(_buffer, false, _stats);

      assertEquals(_stats.skipped, 0);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });
  });

  /**
   * 正常系: classifyFile の呼び出し確認（dryRun=true を利用した実際呼び出し）。
   */
  describe('When: 正常系 (classifyFile 実呼び出し)', () => {
    it('[Normal] T-CL-AC-02: action=move, byAI=false → classifyFile 呼び出し（byAI=false で）', async () => {
      const _entry = _makeEntry('/tmp/input/test.md');
      const _buffer: ClassifyBuffer = [{ file: _entry, project: 'app1', byAI: false, action: 'move' }];
      const _stats = _makeStats();

      await applyClassifications(_buffer, true, _stats);

      // dryRun=true なので stats.moved がインクリメントされる（ファイルシステムは変更しない）
      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
    });

    it('[Normal] T-CL-AC-03: action=move, byAI=true → classifyFile 呼び出し（byAI=true で）', async () => {
      const _entry = _makeEntry('/tmp/input/test.md');
      const _buffer: ClassifyBuffer = [{ file: _entry, project: 'app1', byAI: true, action: 'move' }];
      const _stats = _makeStats();

      await applyClassifications(_buffer, true, _stats);

      // dryRun=true なので stats.movedByAI がインクリメントされる
      assertEquals(_stats.movedByAI, 1);
      assertEquals(_stats.moved, 0);
    });
  });
});
