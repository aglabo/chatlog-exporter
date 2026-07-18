// src: scripts/phases/__tests__/integration/move-classified.integration.spec.ts
// @(#): applyClassifications の統合テスト（classifyFile 実失敗の伝播・キャッシュ削除）
//       対象: applyClassifications
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { applyClassifications } from '../../phase-write.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

describe('applyClassifications', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  describe('Given: action=move だが srcPath が存在しないエントリと dryRun=false', () => {
    let entry: ChatlogEntry;

    beforeEach(() => {
      entry = new ChatlogEntry(
        `---\ntitle: Test\n---\n本文`,
        { filePath: `${tempDir}/missing.md` },
      );
    });

    describe('When: applyClassifications(entries, cache, tempDir, false, stats) を呼び出す', () => {
      describe('Then: T-CL-MC-10 - classifyFile の実失敗が stats.error に伝播する', () => {
        it('T-CL-MC-10-01: stats.error が 1 になる', async () => {
          const _cache = await _makeEmptyClassifyCache();
          await _cache.write(`${tempDir}/missing.md`, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
          const _stats = _makeStats();

          await applyClassifications(
            [entry],
            _cache,
            tempDir,
            false,
            _stats,
          );

          assertEquals(_stats.error, 1);
        });

        it('T-CL-MC-10-02: stats.moved は 0 のままである', async () => {
          const _cache = await _makeEmptyClassifyCache();
          await _cache.write(`${tempDir}/missing.md`, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
          const _stats = _makeStats();

          await applyClassifications(
            [entry],
            _cache,
            tempDir,
            false,
            _stats,
          );

          assertEquals(_stats.moved, 0);
        });

        it('T-CL-MC-10-03: 移動失敗時、キャッシュエントリは削除されずに残る', async () => {
          const _cache = await _makeEmptyClassifyCache();
          await _cache.write(`${tempDir}/missing.md`, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
          const _stats = _makeStats();

          await applyClassifications(
            [entry],
            _cache,
            tempDir,
            false,
            _stats,
          );

          assertEquals(_cache.read(`${tempDir}/missing.md`).action, CLASSIFY_ACTIONS.MOVE);
        });
      });
    });
  });

  describe('Given: action=move で srcPath が実在するエントリと dryRun=false', () => {
    let entry: ChatlogEntry;
    let srcPath: string;

    beforeEach(async () => {
      srcPath = `${tempDir}/exists.md`;
      await Deno.writeTextFile(srcPath, `---\ntitle: Test\n---\n本文`);
      entry = new ChatlogEntry(`---\ntitle: Test\n---\n本文`, { filePath: srcPath });
    });

    describe('When: applyClassifications(entries, cache, destDir, false, stats) を呼び出す', () => {
      describe('Then: T-CL-MC-11 - ファイル移動成功後にキャッシュエントリが削除される', () => {
        it('T-CL-MC-11-01: stats.moved が 1 になる', async () => {
          const _cache = await _makeEmptyClassifyCache();
          await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
          const _stats = _makeStats();
          const destDir = `${tempDir}/out`;

          await applyClassifications([entry], _cache, destDir, false, _stats);

          assertEquals(_stats.moved, 1);
        });

        it('T-CL-MC-11-02: cache.read(srcPath) が空オブジェクトを返す（キャッシュ削除済み）', async () => {
          const _cache = await _makeEmptyClassifyCache();
          await _cache.write(srcPath, { project: 'app1', action: CLASSIFY_ACTIONS.MOVE });
          const _stats = _makeStats();
          const destDir = `${tempDir}/out`;

          await applyClassifications([entry], _cache, destDir, false, _stats);

          assertEquals(_cache.read(srcPath), {});
        });
      });
    });
  });

  describe('Given: キャッシュに ERROR（project なし）が登録済みのエントリと dryRun=false', () => {
    describe('When: applyClassifications(entries, cache, destDir, false, stats) を呼び出す', () => {
      describe('Then: T-CL-MC-12 - project の有無で move/remaining が決まる', () => {
        it('T-CL-MC-12-02: action=error, project なし → remaining 扱いでキャッシュは削除されない', async () => {
          const _cache = await _makeEmptyClassifyCache();
          const errorEntry = new ChatlogEntry(`---\ntitle: Test\n---\n本文`, { filePath: `${tempDir}/error.md` });
          await _cache.write(`${tempDir}/error.md`, { action: CLASSIFY_ACTIONS.ERROR, reason: 'AI 分類失敗' });
          const _stats = _makeStats();

          await applyClassifications(
            [errorEntry],
            _cache,
            `${tempDir}/out`,
            false,
            _stats,
          );

          assertEquals(_cache.read(`${tempDir}/error.md`).action, CLASSIFY_ACTIONS.ERROR);
        });
      });
    });
  });
});
