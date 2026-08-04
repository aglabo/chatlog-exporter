// src: scripts/phases/__tests__/unit/apply-move.unit.spec.ts
// @(#): _applyMove の単体テスト
//       対象: _applyMove
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
import { _applyMove } from '../../phase-write.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// types
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// constants
const _FILE_CONTENT = `---\ntitle: Test Title\n---\n本文`;

// ─── Tests

/**
 * `_applyMove` のユニットテストスイート。
 *
 * `cached.action` による moved/movedByAI の振り分け、実移動失敗時の
 * stats/cache 非変化を検証する。
 *
 * テスト ID 範囲: T-CL-AM-01 〜 T-CL-AM-07
 *
 * @see _applyMove
 */
describe('_applyMove', () => {
  let loggerStub: LoggerStub;
  let tempDir: string;

  beforeEach(async () => {
    loggerStub = makeLoggerStub();
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    loggerStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 正常系: 実ファイル移動が成功するケースでの stats/cache/ログの検証。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-AM-01: cached.action=move, project あり → stats.moved++（movedByAI は増えない）', async () => {
      const srcPath = `${tempDir}/test.md`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(_stats.moved, 1);
      assertEquals(_stats.movedByAI, 0);
    });

    it('[Normal] T-CL-AM-02: cached.action=move で移動成功後、キャッシュエントリが削除される', async () => {
      const srcPath = `${tempDir}/test.md`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(_cache.read(srcPath), {});
    });

    it('[Normal] T-CL-AM-03: cached.action=move-by-ai, project あり → stats.movedByAI++（moved は増えない）', async () => {
      const srcPath = `${tempDir}/test.md`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVEBYAI });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(_stats.movedByAI, 1);
      assertEquals(_stats.moved, 0);
    });

    it('[Normal] T-CL-AM-04: 移動成功時 logger.info が呼ばれる', async () => {
      const srcPath = `${tempDir}/test.md`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(loggerStub.infoLogs.length > 0, true);
    });
  });

  /**
   * 異常系: 実ファイル移動が失敗する（srcPath が存在しない）ケースでの stats/cache/ログの検証。
   */
  describe('When: 異常系', () => {
    it('[Error] T-CL-AM-05: srcPath 不在 → stats.error++ のみ（moved/movedByAI/remaining/skip は不変）', async () => {
      const srcPath = `${tempDir}/missing.md`;
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1' });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(_stats.error, 1);
      assertEquals(_stats.moved, 0);
      assertEquals(_stats.movedByAI, 0);
      assertEquals(_stats.remaining, 0);
      assertEquals(_stats.skip, 0);
    });

    it('[Error] T-CL-AM-06: srcPath 不在 → キャッシュエントリは削除されない', async () => {
      const srcPath = `${tempDir}/missing.md`;
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1' });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(_cache.read(srcPath), { project: 'app1' });
    });

    it('[Error] T-CL-AM-07: srcPath 不在 → logger.error が呼ばれる', async () => {
      const srcPath = `${tempDir}/missing.md`;
      const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(srcPath, { project: 'app1' });
      const _stats = _makeStats();

      await _applyMove(_entry, tempDir, false, { cache: _cache, stats: _stats });

      assertEquals(loggerStub.errorLogs.length > 0, true);
    });
  });
});
