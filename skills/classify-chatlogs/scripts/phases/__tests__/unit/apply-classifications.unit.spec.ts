// src: scripts/phases/__tests__/unit/apply-classifications.unit.spec.ts
// @(#): applyClassifications の単体テスト
//       対象: applyClassifications
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { applyClassifications } from '../../phase-write.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `applyClassifications` のユニットテストスイート。
 *
 * キャッシュ上の action に基づく振る舞いを検証する。
 *
 * テスト ID 範囲: T-CL-MC-01 〜 T-CL-MC-13
 *
 * @see applyClassifications
 */
describe('applyClassifications', () => {
  /**
   * 正常系: 各 action の振る舞いテスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-MC-04: entries が空 → 何も起きない', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _stats = _makeStats();

      await applyClassifications([], _cache, '/tmp/output', false, _stats);

      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-05: action=remaining → stats.remaining++ のみ', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { action: CLASSIFY_ACTIONS.REMAINING });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        false,
        _stats,
      );

      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-06: キャッシュ未登録（action=undefined） → stats.remaining++', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        false,
        _stats,
      );

      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-14: action=empty, project あり → stats.moved++（project 由来の確定済みキャッシュとして移動される）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.EMPTY });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-15: action=undefined, project あり → stats.moved++（project 由来の確定済みキャッシュとして移動される）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1' });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-09: action=error, project なし → stats.remaining++ のみ、ファイル移動なし', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = new ChatlogEntry('', { filePath: '/tmp/input/broken.md' });
      await _cache.write('/tmp/input/broken.md', { action: CLASSIFY_ACTIONS.ERROR, reason: 'AI 分類失敗' });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        false,
        _stats,
      );

      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });
  });

  /**
   * 正常系: moveChatlogEntry の呼び出し確認（dryRun=true を利用した実際呼び出し）。
   */
  describe('When: 正常系 (moveChatlogEntry 実呼び出し)', () => {
    it('[Normal] T-CL-MC-02: action=move → moveChatlogEntry 呼び出し（stats.moved がインクリメントされる）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      // dryRun=true なので stats.moved がインクリメントされる（ファイルシステムは変更しない）
      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-03: action=MOVEBYAI → moveChatlogEntry 呼び出し（stats.movedByAI がインクリメントされる）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVEBYAI });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 1);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-08: action=move, project=undefined → project 未確定のため stats.remaining++', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: undefined, action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      // project が未確定のため action=move でも移動されず stats.remaining がインクリメントされる
      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-07: destDir にバックスラッシュを含む Windows パスを渡しても dryRun=true で stats.moved がインクリメントされる（normalizePath によるパス正規化）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        'C:\\output',
        true,
        _stats,
      );

      // normalizePath 適用後もパス組み立てが壊れず、dryRun=true で stats.moved がインクリメントされる
      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-13: action=move, dryRun=true → キャッシュエントリは削除されない', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      // dryRun=true で moveChatlogEntry 呼び出しのみ確認（実ファイル操作はしない）。
      // 実削除の検証は integration テストで実施する。
      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        true,
        _stats,
      );

      // dryRun=true では削除されない
      assertEquals(_cache.read('/tmp/input/test.md').action, CLASSIFY_ACTIONS.MOVE);
    });
  });
});
