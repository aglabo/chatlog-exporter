// src: scripts/modules/__tests__/unit/classify-noai.unit.spec.ts
// @(#): preClassify / processPreclassify の単体テスト
//       対象: preClassify / processPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { preClassify, processPreclassify } from '../../classify-noai.ts';

// ─── Helpers
// types
import type { ClassifyBufferEntry } from '../../../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `preClassify` のユニットテストスイート。
 *
 * frontmatter の `project` フィールドと本文長に基づく事前分類ロジックを検証する。
 * `ClassifyBufferEntry` を受け取り、`action` を設定した `ClassifyBufferEntry` を返す。
 *
 * テスト ID 範囲: T-CL-PRE-01 〜 T-CL-PRE-06
 *
 * @see preClassify
 */
describe('preClassify', () => {
  /**
   * 正常系: frontmatter の `project` フィールドが存在する場合の分岐テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PRE-01: project フィールドあり + 既に正しいディレクトリ内 → action=skip', () => {
      const _entry = _makeEntry('/tmp/chatlogs/app1/test.md', { project: 'app1' }, '本文テキスト');

      const result = preClassify({ file: _entry, filePath: _entry.filePath });

      assertEquals(result.action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(result.project, 'app1');
      assertEquals(result.byAI, false);
    });

    it('[Normal] T-CL-PRE-02: project フィールドあり + ディレクトリが違う → action=move', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', { project: 'app1' }, '本文テキスト');

      const result = preClassify({ file: _entry, filePath: _entry.filePath });

      assertEquals(result.action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(result.project, 'app1');
      assertEquals(result.byAI, false);
    });

    it('[Normal] T-CL-PRE-03: project フィールドなし + hasMeta=false + 短い → FALLBACK_PROJECT, action=move', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, 'short');

      const result = preClassify({ file: _entry, filePath: _entry.filePath });

      assertEquals(result.action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(result.project, FALLBACK_PROJECT);
      assertEquals(result.byAI, false);
    });

    it('[Normal] T-CL-PRE-04: project フィールドなし + hasMeta=true → action=remaining（AI 処理対象）', () => {
      const _entry = _makeEntry(
        '/tmp/chatlogs/test.md',
        { title: 'Some Title', category: 'development' },
        'short',
      );

      const result = preClassify({ file: _entry, filePath: _entry.filePath });

      assertEquals(result.action, CLASSIFY_ACTIONS.REMAINING);
    });

    it('[Normal] T-CL-PRE-05: project フィールドなし + hasMeta=false + 長い → action=remaining', () => {
      const _longContent = 'a'.repeat(100);
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, _longContent);

      const result = preClassify({ file: _entry, filePath: _entry.filePath });

      assertEquals(result.action, CLASSIFY_ACTIONS.REMAINING);
    });
  });

  /**
   * エッジケース: `action === 'error'` のエントリはそのまま返す。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PRE-06: action=error のエントリ → そのまま返す（file は null のまま）', () => {
      const _errorEntry: ClassifyBufferEntry = {
        file: null,
        filePath: '/tmp/chatlogs/broken.md',
        action: CLASSIFY_ACTIONS.ERROR,
        reason: 'InvalidFormat',
      };

      const result = preClassify(_errorEntry);

      assertEquals(result.action, CLASSIFY_ACTIONS.ERROR);
      assertEquals(result.file, null);
      assertEquals(result.reason, 'InvalidFormat');
    });
  });
});

/**
 * `processPreclassify` のユニットテストスイート。
 *
 * `ClassifyBufferEntry[]` を直接渡し、各エントリに `preClassify` を適用した結果を検証する。
 *
 * テスト ID 範囲: T-CL-PCL-01 〜 T-CL-PCL-03
 *
 * @see processPreclassify
 */
describe('processPreclassify', () => {
  /**
   * 正常系: project あり・なし・短すぎるファイルが混在する場合の分類結果テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCL-01: project あり・project なし・短すぎる混在 → それぞれ適切な action が設定された ClassifyBufferEntry[] を返す', () => {
      const _entryWithProject = _makeEntry('/tmp/dir/app1/a.md', { project: 'app1' }, '本文');
      const _entryShort = _makeEntry('/tmp/dir/b.md', {}, 'x');
      const _entryLong = _makeEntry('/tmp/dir/c.md', {}, 'a'.repeat(100));

      const _buffer: ClassifyBufferEntry[] = [
        { file: _entryWithProject, filePath: _entryWithProject.filePath },
        { file: _entryShort, filePath: _entryShort.filePath },
        { file: _entryLong, filePath: _entryLong.filePath },
      ];

      const _result = processPreclassify(_buffer);

      assertEquals(_result.length, 3);
      assertEquals(_result[0].action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(_result[0].project, 'app1');
      assertEquals(_result[1].action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(_result[1].project, FALLBACK_PROJECT);
      assertEquals(_result[2].action, CLASSIFY_ACTIONS.REMAINING);
    });

    it('[Normal] T-CL-PCL-02: 空配列を渡す → 空配列を返す', () => {
      const _result = processPreclassify([]);

      assertEquals(Array.isArray(_result), true);
      assertEquals(_result.length, 0);
    });
  });

  /**
   * エッジケース: 単一エントリのみの場合の動作テスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCL-03: 単一エントリ（project あり）を渡す → action=skip を返す', () => {
      const _entry = _makeEntry('/tmp/dir/app1/a.md', { project: 'app1' }, '本文');
      const _buffer: ClassifyBufferEntry[] = [{ file: _entry, filePath: _entry.filePath }];

      const _result = processPreclassify(_buffer);

      assertEquals(_result.length, 1);
      assertEquals(_result[0].action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(_result[0].project, 'app1');
    });
  });
});
