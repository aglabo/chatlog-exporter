// src: scripts/phases/__tests__/unit/move-chatlog-entry.unit.spec.ts
// @(#): moveChatlogEntry の単体テスト（dryRun=true 分岐・project=undefined・destDir 正規化）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { moveChatlogEntry } from '../../phase-write.ts';
// constants
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers
import {
  _makeClassifyChatlogEntry,
  _makeEmptyClassifyCache,
} from '../../../__tests__/_helpers/classify-test-helpers.ts';

// constants
/** 実ファイル移動テストで移動元に置く chatlog の内容。 */
const _FILE_CONTENT = `---\ntitle: Test Title\n---\n本文`;

// functions
/**
 * `path` にファイルが存在するか判定する。
 *
 * @param path - 判定するファイルパス
 * @returns 存在すれば `true`、`NotFound` なら `false`
 */
const _exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) { return false; }
    throw e;
  }
};

// ─── Tests

describe('moveChatlogEntry', () => {
  describe('Given: dryRun=true の呼び出し', () => {
    describe('When: moveChatlogEntry(_entry, "app1", "/tmp/output", true, cache) を呼び出す', () => {
      describe('Then: T-CL-CF-01 - action=MOVE・message に "[dry-run]" と "→ app1/" が含まれる', () => {
        it('T-CL-CF-01-01: action が CLASSIFY_ACTIONS.MOVE になる', async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(_entry, 'app1', '/tmp/output', true, cache);

          assertEquals(_result.action, CLASSIFY_ACTIONS.MOVE);
        });

        it('T-CL-CF-01-02: message に "[dry-run]" が含まれる', async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(_entry, 'app1', '/tmp/output', true, cache);

          assertStringIncludes(_result.message, '[dry-run]');
        });

        it('T-CL-CF-01-03: message に "→ app1/" が含まれる', async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(_entry, 'app1', '/tmp/output', true, cache);

          assertStringIncludes(_result.message, '→ app1/');
        });

        it('T-CL-CF-01-04: cache エントリは削除されない（read が書き込んだ値のまま）', async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();
          await cache.write(_entry.filePath!, { project: 'app1' });

          await moveChatlogEntry(_entry, 'app1', '/tmp/output', true, cache);

          assertEquals(cache.read(_entry.filePath!), { project: 'app1' });
        });
      });
    });
  });

  describe('Given: project=undefined の呼び出し', () => {
    describe(`When: moveChatlogEntry(_entry, undefined, "/tmp/output", true, cache) を呼び出す (dryRun=true)`, () => {
      describe(`Then: T-CL-CF-03 - FALLBACK_PROJECT で dryRun 移動される・action=MOVE`, () => {
        it(`T-CL-CF-03-02: message に "→ ${FALLBACK_PROJECT}/" が含まれる`, async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(_entry, undefined, '/tmp/output', true, cache);

          assertStringIncludes(_result.message, `→ ${FALLBACK_PROJECT}/`);
        });
      });
    });
  });

  describe('Given: destDir に Windows バックスラッシュパスを渡す呼び出し', () => {
    describe('When: moveChatlogEntry(_entry, "app1", "C:\\\\output", true, cache) を呼び出す (dryRun=true)', () => {
      describe('Then: T-CL-CF-04 - normalizePath によりパスが正規化されて処理が壊れない', () => {
        it('T-CL-CF-04-01: destDir="C:\\\\output" + dryRun=true → action=MOVE・message に "→ app1/" が含まれる', async () => {
          const _entry = _makeClassifyChatlogEntry('test.md');
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(_entry, 'app1', 'C:\\output', true, cache);

          assertEquals(_result.action, CLASSIFY_ACTIONS.MOVE);
          assertStringIncludes(_result.message, '→ app1/');
        });
      });
    });
  });

  describe('Given: 安全でない project 名での実移動 (dryRun=false)', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir();
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    describe('When: moveChatlogEntry(_entry, <unsafe>, destDir, false, cache) を呼び出す', () => {
      const _unsafeProjectCases = [
        { id: 'T-CL-CF-05-01', project: '.' },
        { id: 'T-CL-CF-05-02', project: '..' },
        { id: 'T-CL-CF-05-03', project: '../escape' },
        { id: 'T-CL-CF-05-04', project: 'a/b' },
        { id: 'T-CL-CF-05-05', project: 'a\\b' },
        { id: 'T-CL-CF-05-06', project: 'C:foo' },
      ];

      for (const { id, project } of _unsafeProjectCases) {
        it(
          `[Error] ${id}: project=${
            JSON.stringify(project)
          } → action=ERROR・移動元は内容ごと残り・destDir 外へ書き込まない`,
          async () => {
            const _destDir = `${tempDir}/dest`;
            await Deno.mkdir(_destDir, { recursive: true });
            const _srcPath = `${_destDir}/test.md`;
            await Deno.writeTextFile(_srcPath, _FILE_CONTENT);
            const _entry = new ChatlogEntry(_FILE_CONTENT, { filePath: _srcPath });
            const cache = await _makeEmptyClassifyCache();

            const _result = await moveChatlogEntry(_entry, project, _destDir, false, cache);

            assertEquals(_result.action, CLASSIFY_ACTIONS.ERROR);
            assertEquals(await Deno.readTextFile(_srcPath), _FILE_CONTENT);
            assertEquals(await _exists(`${_destDir}/../escape/test.md`), false);
            assertEquals(await _exists(`${tempDir}/test.md`), false);
          },
        );
      }
    });
  });
});
