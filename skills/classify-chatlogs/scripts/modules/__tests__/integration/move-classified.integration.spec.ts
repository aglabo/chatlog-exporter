// src: scripts/modules/__tests__/integration/move-classified.integration.spec.ts
// @(#): moveClassified の統合テスト（classifyFile 実失敗の伝播）
//       対象: moveClassified
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { moveClassified } from '../../file-ops.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { ClassifyBuffer } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

describe('moveClassified', () => {
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

    describe('When: moveClassified(buffer, tempDir, false, stats) を呼び出す', () => {
      describe('Then: T-CL-MC-10 - classifyFile の実失敗が stats.error に伝播する', () => {
        it('T-CL-MC-10-01: stats.error が 1 になる', async () => {
          const _buffer: ClassifyBuffer = [{
            file: entry,
            project: 'app1',
            action: CLASSIFY_ACTIONS.MOVE,
          }];
          const _stats = _makeStats();

          await moveClassified(_buffer, tempDir, false, _stats);

          assertEquals(_stats.error, 1);
        });

        it('T-CL-MC-10-02: stats.moved は 0 のままである', async () => {
          const _buffer: ClassifyBuffer = [{
            file: entry,
            project: 'app1',
            action: CLASSIFY_ACTIONS.MOVE,
          }];
          const _stats = _makeStats();

          await moveClassified(_buffer, tempDir, false, _stats);

          assertEquals(_stats.moved, 0);
        });
      });
    });
  });
});
