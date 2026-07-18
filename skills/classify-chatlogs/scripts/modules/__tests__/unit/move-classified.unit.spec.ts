// src: scripts/modules/__tests__/unit/move-classified.unit.spec.ts
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
import { applyClassifications } from '../../file-ops.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// constants
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
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
    it('[Normal] T-CL-MC-01: action=skip → stats.skipped++ のみ、classifyFile 未呼び出し', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.SKIP });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        _cache,
        '/tmp/output',
        false,
        _stats,
      );

      assertEquals(_stats.skipped, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-04: entries が空 → 何も起きない', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _stats = _makeStats();

      await applyClassifications([], _cache, '/tmp/output', false, _stats);

      assertEquals(_stats.skipped, 0);
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
      assertEquals(_stats.skipped, 0);
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
      assertEquals(_stats.skipped, 0);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-09: action=error → stats.error++ のみ、ファイル移動なし', async () => {
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

      assertEquals(_stats.error, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.skipped, 0);
      assertEquals(_stats.remaining, 0);
    });
  });

  /**
   * 正常系: classifyFile の呼び出し確認（dryRun=true を利用した実際呼び出し）。
   */
  describe('When: 正常系 (classifyFile 実呼び出し)', () => {
    it('[Normal] T-CL-MC-02: action=move → classifyFile 呼び出し（stats.moved がインクリメントされる）', async () => {
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

    it('[Normal] T-CL-MC-03: action=MOVEBYAI → classifyFile 呼び出し（stats.movedByAI がインクリメントされる）', async () => {
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

    it('[Normal] T-CL-MC-08: action=move, project=undefined → FALLBACK_PROJECT でファイル移動が実行される（dryRun=true）', async () => {
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

      // project=undefined でも FALLBACK_PROJECT('misc') で dryRun 移動が実行され stats.moved がインクリメントされる
      assertEquals(_stats.moved, 1, `FALLBACK_PROJECT=${FALLBACK_PROJECT} でファイル移動が実行されるはず`);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
      assertEquals(_stats.skipped, 0);
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

      // dryRun=true で classifyFile 呼び出しのみ確認（実ファイル操作はしない）。
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
