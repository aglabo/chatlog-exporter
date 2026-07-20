// src: scripts/phases/__tests__/integration/move-chatlog-entry.integration.spec.ts
// @(#): moveChatlogEntry の統合テスト（正常移動・移動失敗 分岐）
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
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Helpers
// classes
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// utils
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { dirExists, fileExists, fileOrDirExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';
// internal helpers
import { _makeEmptyClassifyCache } from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type { ClassifyCache } from '../../../types/classify.types.ts';

// ─── Internal Helpers

// constants
const _FILE_CONTENT = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
const _SRC_FILENAME = 'a.md';

// functions
/**
 * `removeFile` プロバイダが `NotFound` 以外のエラーを throw する `ChatlogCache<ClassifyCache>` を生成する。
 *
 * 他のプロバイダ（readTextFile/writeTextFile/mkdir/glob）は `_makeEmptyClassifyCache` と同様に
 * インメモリバッファで実装する。`cache.delete` がこのエラーをそのまま re-throw することを
 * 利用して、実ファイル移動が成功しても `moveChatlogEntry` が影響を受けないことを検証する。
 *
 * @returns 初期化済みの `ChatlogCache<ClassifyCache>`
 */
const _makeCacheWithFailingDelete = async (): Promise<ChatlogCache<ClassifyCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<ClassifyCache>(
    'classify-cache',
    '/fake/cache',
    undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
        glob: () => Promise.resolve([]),
        removeFile: () => Promise.reject(new Error('permission denied')),
      },
    },
  );
  await cache.ready;
  return cache;
};

// ─── Tests

describe('moveChatlogEntry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-CL-CF-02: 正常移動 ────────────────────────────────────────────────

  describe('Given: 実在するファイルと dryRun=false', () => {
    let entry: ChatlogEntry;
    let srcPath: string;

    beforeEach(async () => {
      srcPath = `${tempDir}/${_SRC_FILENAME}`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
    });

    describe('When: moveChatlogEntry(entry, "app1", tempDir, false, cache) を呼び出す', () => {
      describe('Then: T-CL-CF-02 - ファイルが app1/ サブディレクトリへ移動される', () => {
        it('T-CL-CF-02-04: action が MOVE になる', async () => {
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(_result.action, CLASSIFY_ACTIONS.MOVE);
        });

        it('T-CL-CF-02-06: dstDir（tempDir/app1）が存在する', async () => {
          const cache = await _makeEmptyClassifyCache();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(await dirExists(`${tempDir}/app1`), true);
        });

        it('T-CL-CF-02-01: dstPath にファイルが存在する', async () => {
          const cache = await _makeEmptyClassifyCache();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(await fileExists(`${tempDir}/app1/${_SRC_FILENAME}`), true);
        });

        it('T-CL-CF-02-02: srcPath が存在しない', async () => {
          const cache = await _makeEmptyClassifyCache();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(await fileOrDirExists(srcPath), false, 'srcPath がまだ存在する');
        });

        it('T-CL-CF-02-03: dstPath のテキストに "project: app1" が含まれる', async () => {
          const cache = await _makeEmptyClassifyCache();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          const _dstText = await readTextFile(`${tempDir}/app1/${_SRC_FILENAME}`);
          assertStringIncludes(_dstText, 'project: "app1"');
        });

        it('T-CL-CF-02-05: message に "moved:" が含まれる', async () => {
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertStringIncludes(_result.message, 'moved:');
        });

        it('T-CL-CF-02-07: 移動成功後、対応する cache エントリが削除される（read が空オブジェクトを返す）', async () => {
          const cache = await _makeEmptyClassifyCache();
          await cache.write(srcPath, { project: 'app1' });

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(cache.read(srcPath), {});
        });
      });
    });
  });

  // ─── T-CL-CF-03: 移動失敗 ────────────────────────────────────────────────

  describe('Given: 存在しないファイルパスと dryRun=false', () => {
    let entry: ChatlogEntry;

    beforeEach(() => {
      entry = new ChatlogEntry(
        `---\ntitle: Test\n---\n本文`,
        { filePath: `${tempDir}/missing.md` },
      );
    });

    describe('When: moveChatlogEntry(entry, "app1", tempDir, false, cache) を呼び出す（srcPath 不在）', () => {
      describe('Then: T-CL-CF-03 - 例外なしで action が ERROR になる', () => {
        it('T-CL-CF-03-01: 例外がスローされない', async () => {
          const cache = await _makeEmptyClassifyCache();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);
        });

        it('T-CL-CF-03-02: action が ERROR になる', async () => {
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(_result.action, CLASSIFY_ACTIONS.ERROR);
        });

        it('T-CL-CF-03-03: message に "move failed:" が含まれる', async () => {
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertStringIncludes(_result.message, 'move failed:');
        });

        it('T-CL-CF-03-04: action が MOVE でない', async () => {
          const cache = await _makeEmptyClassifyCache();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(_result.action !== CLASSIFY_ACTIONS.MOVE, true);
        });

        it('T-CL-CF-03-05: 移動失敗時、cache エントリは削除されない（read が書き込んだ値のまま）', async () => {
          const cache = await _makeEmptyClassifyCache();
          const srcPath = `${tempDir}/missing.md`;
          await cache.write(srcPath, { project: 'app1' });

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(cache.read(srcPath), { project: 'app1' });
        });
      });
    });
  });

  // ─── T-CL-CF-04: 移動成功だが cache.delete が失敗 ────────────────────────

  describe('Given: 実在するファイル（実移動は成功する）だが cache.delete が non-NotFound エラーを throw する', () => {
    let entry: ChatlogEntry;
    let srcPath: string;

    beforeEach(async () => {
      srcPath = `${tempDir}/${_SRC_FILENAME}`;
      await Deno.writeTextFile(srcPath, _FILE_CONTENT);
      entry = new ChatlogEntry(_FILE_CONTENT, { filePath: srcPath });
    });

    describe('When: moveChatlogEntry(entry, "app1", tempDir, false, cache) を呼び出す', () => {
      describe('Then: T-CL-CF-04 - cache 削除失敗が move 失敗に化けない', () => {
        it('T-CL-CF-04-01: action が MOVE になる', async () => {
          const cache = await _makeCacheWithFailingDelete();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(_result.action, CLASSIFY_ACTIONS.MOVE);
        });

        it('T-CL-CF-04-02: message に "moved:" が含まれる', async () => {
          const cache = await _makeCacheWithFailingDelete();

          const _result = await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertStringIncludes(_result.message, 'moved:');
        });

        it('T-CL-CF-04-03: 実ファイルが tempDir/app1/ へ移動済みである', async () => {
          const cache = await _makeCacheWithFailingDelete();

          await moveChatlogEntry(entry, 'app1', tempDir, false, cache);

          assertEquals(await fileExists(`${tempDir}/app1/${_SRC_FILENAME}`), true);
        });
      });
    });
  });
});
