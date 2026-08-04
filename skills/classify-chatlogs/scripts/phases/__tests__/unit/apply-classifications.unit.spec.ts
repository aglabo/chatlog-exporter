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
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { applyClassifications } from '../../phase-write.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// types
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';

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
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
  });

  /**
   * 正常系: 各 action の振る舞いテスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-MC-04: entries が空 → 何も起きない', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _stats = _makeStats();

      await applyClassifications([], '/tmp/output', false, { cache: _cache, stats: _stats }, { concurrency: 4 });

      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-05: project なし（action 未設定） → stats.remaining++ のみ', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', {});
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        false,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
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
        '/tmp/output',
        false,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-14: action=empty, project あり, dryRun=true → stats.skip++（move は呼ばれない）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.EMPTY });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      assertEquals(_stats.skip, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
    });

    it('[Normal] T-CL-MC-15: action=undefined, project あり, dryRun=true → stats.skip++（move は呼ばれない）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1' });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      assertEquals(_stats.skip, 1);
      assertEquals(_stats.moved, 0);
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
        '/tmp/output',
        false,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });
  });

  /**
   * 正常系: dryRun=true で project 確定済みの場合、moveChatlogEntry を呼ばず skip 扱いになることを確認する。
   */
  describe('When: 正常系 (dryRun=true・project 確定済み → move スキップ)', () => {
    it('[Normal] T-CL-MC-02: action=move, dryRun=true → stats.skip++（moveChatlogEntry は呼ばれない）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      // dryRun=true では move を実行せず stats.skip がインクリメントされる
      assertEquals(_stats.skip, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
      assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('move skipped: test.md')), true);
    });

    it('[Normal] T-CL-MC-03: action=MOVEBYAI, dryRun=true → stats.skip++（moveChatlogEntry は呼ばれない）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVEBYAI });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      assertEquals(_stats.skip, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
      assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('move skipped: test.md')), true);
    });

    it('[Normal] T-CL-MC-08: action=move, project=undefined, dryRun=true → project 未確定のため stats.remaining++', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: undefined, action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      // project が未確定のため action=move でも移動されず stats.remaining がインクリメントされる
      assertEquals(_stats.remaining, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.error, 0);
    });

    it('[Normal] T-CL-MC-13: action=move, dryRun=true → キャッシュエントリは削除されない', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _entry = _makeEntry('/tmp/input/test.md');
      await _cache.write('/tmp/input/test.md', { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      // dryRun=true では move 自体がスキップされ、キャッシュ削除も発生しない。
      // 実削除の検証は integration テストで実施する。
      await applyClassifications(
        [_entry],
        '/tmp/output',
        true,
        { cache: _cache, stats: _stats },
        { concurrency: 4 },
      );

      // dryRun=true では削除されない
      assertEquals(_cache.read('/tmp/input/test.md').action, CLASSIFY_ACTIONS.MOVE);
    });
  });
});
