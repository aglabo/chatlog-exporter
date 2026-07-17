// src: scripts/modules/__tests__/unit/partition-classify-entries.unit.spec.ts
// @(#): partitionClassifyEntries の単体テスト
//       対象: partitionClassifyEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { partitionClassifyEntries } from '../../partition-classify-entries.ts';

// ─── Helpers
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import type { ClassifyBufferEntry, ClassifyCache, FindBufferEntriesOptions } from '../../../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers

// functions

/**
 * `opts.glob` 用のスタブを生成する。
 *
 * 渡された `paths` を、glob パターン引数を無視してそのまま返す。
 *
 * @param paths - 返却するファイルパス配列
 * @returns `GlobProvider` 互換のスタブ関数
 */
const _makeGlob = (paths: string[]): FindBufferEntriesOptions['glob'] => (_pattern: string) => Promise.resolve(paths);

/**
 * `opts.loadMeta` 用のスタブを生成する。
 *
 * `path` に対応する `ClassifyBufferEntry` を `entries` マップから返す。
 * `errorPaths` に含まれるパスは、実装のローダーが担う「読み込み失敗時に `cache` へ
 * `action: ERROR` を書き込む」責務を代替して `cache` に書き込む。
 *
 * @param entries - パスをキーとした `ClassifyBufferEntry` マップ
 * @param cache - エラーパスの書き込み先 `ChatlogCache`
 * @param errorPaths - 読み込み失敗として扱うパスの集合
 * @returns `path => Promise<ClassifyBufferEntry>` 互換のスタブ関数
 */
const _makeLoadMeta = (
  entries: Map<string, ClassifyBufferEntry>,
  cache: ChatlogCache<ClassifyCache>,
  errorPaths: ReadonlySet<string> = new Set(),
): FindBufferEntriesOptions['loadMeta'] =>
async (path: string): Promise<ClassifyBufferEntry> => {
  if (errorPaths.has(path)) {
    await cache.write(path, { action: CLASSIFY_ACTIONS.ERROR, reason: 'invalid frontmatter' });
  }
  return entries.get(path)!;
};

// ─── Tests

/**
 * `partitionClassifyEntries` のユニットテストスイート。
 *
 * ディレクトリ走査 → AI なし事前分類 → キャッシュ有無による REMAINING の振り分けを検証する。
 *
 * テスト ID 範囲: T-CL-PCE-01 〜 T-CL-PCE-04
 *
 * @see partitionClassifyEntries
 */
describe('partitionClassifyEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCE-01: preclassify で全件 MOVE/SKIP に解決する → filePaths に全件含まれ, uncached は空', async () => {
      // frontmatter に project あり、パスは proj-a サブディレクトリ外 → MOVE
      const _entryMove = _makeEntry('/tmp/input/move-test.md', { project: 'proj-a' }, '');
      // frontmatter に project あり、パスが proj-a サブディレクトリ内 → SKIP
      const _entrySkip = _makeEntry('/tmp/input/proj-a/skip-test.md', { project: 'proj-a' }, '');

      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryMove.filePath!, { entry: _entryMove }],
        [_entrySkip.filePath!, { entry: _entrySkip }],
      ]);
      const _cache = await _makeEmptyClassifyCache();
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries, _cache),
      };

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.filePaths.sort(), [_entryMove.filePath!, _entrySkip.filePath!].sort());
      assertEquals(result.uncached, []);
      assertEquals(_cache.read(_entryMove.filePath!).action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(_cache.read(_entrySkip.filePath!).action, CLASSIFY_ACTIONS.SKIP);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCE-02: REMAINING エントリのファイルがキャッシュ済み → uncached には含まれず cache に project/action: MOVEBYAI が書き込まれる', async () => {
      const _entry = _makeEntry('/tmp/input/cached.md', {}, 'a'.repeat(100));
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entry.filePath!, { entry: _entry }],
      ]);
      const _cache = await _makeEmptyClassifyCache();
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries, _cache),
      };
      await _cache.write(_entry.filePath!, { project: 'proj-a', confidence: 0.95, reason: 'cached decision' });

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.uncached, []);
      assertEquals(_cache.read(_entry.filePath!).action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(_cache.read(_entry.filePath!).project, 'proj-a');
    });

    it('[Edge] T-CL-PCE-03: REMAINING エントリが一部のみキャッシュ済み → cache済み分は cache 経由で MOVEBYAI, 未cache分は uncached に含まれる', async () => {
      const _entryCached = _makeEntry('/tmp/input/cached2.md', {}, 'a'.repeat(100));
      const _entryUncached = _makeEntry('/tmp/input/uncached.md', {}, 'b'.repeat(100));
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryCached.filePath!, { entry: _entryCached }],
        [_entryUncached.filePath!, { entry: _entryUncached }],
      ]);
      const _cache = await _makeEmptyClassifyCache();
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries, _cache),
      };
      await _cache.write(_entryCached.filePath!, { project: 'proj-a', confidence: 0.9, reason: 'cached' });

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(_cache.read(_entryCached.filePath!).action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(_cache.read(_entryCached.filePath!).project, 'proj-a');
      assertEquals(result.uncached.length, 1);
      assertEquals(result.uncached[0].filePath, _entryUncached.filePath);
    });

    it('[Edge] T-CL-PCE-04: entries Map に読み込み成功した全ファイルの filePath→ChatlogEntry が格納される', async () => {
      const _entryA = _makeEntry('/tmp/input/a.md', { project: 'proj-a' }, '');
      const _entryB = _makeEntry('/tmp/input/uncached.md', {}, 'b'.repeat(100));
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryA.filePath!, { entry: _entryA }],
        [_entryB.filePath!, { entry: _entryB }],
      ]);
      const _cache = await _makeEmptyClassifyCache();
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries, _cache),
      };

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.entries.size, 2);
      assertEquals(result.entries.get(_entryA.filePath!), _entryA);
      assertEquals(result.entries.get(_entryB.filePath!), _entryB);
    });

    it('[Edge] T-CL-PCE-05: 読み込み失敗(ERROR)ファイルは filePaths には残るが entries/uncached からは除外され cache.action が ERROR になる', async () => {
      const _entryOk = _makeEntry('/tmp/input/ok.md', {}, 'a'.repeat(100));
      const _errorPath = '/tmp/input/broken.md';
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryOk.filePath!, { entry: _entryOk }],
        [_errorPath, { entry: _makeEntry(_errorPath, {}, '') }],
      ]);
      const _cache = await _makeEmptyClassifyCache();
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries, _cache, new Set([_errorPath])),
      };

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.filePaths.sort(), [_entryOk.filePath!, _errorPath].sort());
      assertEquals(result.entries.has(_errorPath), false);
      assertEquals(result.uncached.some((e) => e.filePath === _errorPath), false);
      assertEquals(_cache.read(_errorPath).action, CLASSIFY_ACTIONS.ERROR);
    });
  });
});
