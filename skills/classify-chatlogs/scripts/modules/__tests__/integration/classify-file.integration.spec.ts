// src: scripts/modules/__tests__/integration/classify-file.integration.spec.ts
// @(#): classifyFile の統合テスト（正常移動・移動失敗 分岐）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyFile } from '../../file-ops.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Helpers
// classes
import { ClassifyChatlogEntry } from '../../../classes/ClassifyChatlogEntry.class.ts';
// utils
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { dirExists, fileExists, fileOrDirExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';

// ─── Internal Helpers

// constants
const _FILE_CONTENT = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
const _SRC_FILENAME = 'a.md';

// ─── Tests

describe('classifyFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-CL-CF-02: 正常移動 ────────────────────────────────────────────────

  describe('Given: 実在するファイルと dryRun=false', () => {
    let entry: ClassifyChatlogEntry;
    let srcPath: string;

    beforeEach(async () => {
      srcPath = `${tempDir}/${_SRC_FILENAME}`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      entry = new ClassifyChatlogEntry(_FILE_CONTENT, srcPath);
    });

    describe('When: classifyFile(entry, "app1", tempDir, false) を呼び出す', () => {
      describe('Then: T-CL-CF-02 - ファイルが app1/ サブディレクトリへ移動される', () => {
        it('T-CL-CF-02-04: action が MOVE になる', async () => {
          const _result = await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(_result.action, CLASSIFY_ACTIONS.MOVE);
        });

        it('T-CL-CF-02-06: dstDir（tempDir/app1）が存在する', async () => {
          await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(await dirExists(`${tempDir}/app1`), true);
        });

        it('T-CL-CF-02-01: dstPath にファイルが存在する', async () => {
          await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(await fileExists(`${tempDir}/app1/${_SRC_FILENAME}`), true);
        });

        it('T-CL-CF-02-02: srcPath が存在しない', async () => {
          await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(await fileOrDirExists(srcPath), false, 'srcPath がまだ存在する');
        });

        it('T-CL-CF-02-03: dstPath のテキストに "project: app1" が含まれる', async () => {
          await classifyFile(entry, 'app1', tempDir, false);

          const _dstText = await readTextFile(`${tempDir}/app1/${_SRC_FILENAME}`);
          assertStringIncludes(_dstText, 'project: "app1"');
        });

        it('T-CL-CF-02-05: message に "moved:" が含まれる', async () => {
          const _result = await classifyFile(entry, 'app1', tempDir, false);

          assertStringIncludes(_result.message, 'moved:');
        });
      });
    });
  });

  // ─── T-CL-CF-03: 移動失敗 ────────────────────────────────────────────────

  describe('Given: 存在しないファイルパスと dryRun=false', () => {
    let entry: ClassifyChatlogEntry;

    beforeEach(() => {
      entry = new ClassifyChatlogEntry(
        `---\ntitle: Test\n---\n本文`,
        `${tempDir}/missing.md`,
      );
    });

    describe('When: classifyFile(entry, "app1", tempDir, false) を呼び出す（srcPath 不在）', () => {
      describe('Then: T-CL-CF-03 - 例外なしで action が ERROR になる', () => {
        it('T-CL-CF-03-01: 例外がスローされない', async () => {
          await classifyFile(entry, 'app1', tempDir, false);
        });

        it('T-CL-CF-03-02: action が ERROR になる', async () => {
          const _result = await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(_result.action, CLASSIFY_ACTIONS.ERROR);
        });

        it('T-CL-CF-03-03: message に "move failed:" が含まれる', async () => {
          const _result = await classifyFile(entry, 'app1', tempDir, false);

          assertStringIncludes(_result.message, 'move failed:');
        });

        it('T-CL-CF-03-04: action が MOVE でない', async () => {
          const _result = await classifyFile(entry, 'app1', tempDir, false);

          assertEquals(_result.action !== CLASSIFY_ACTIONS.MOVE, true);
        });
      });
    });
  });
});
