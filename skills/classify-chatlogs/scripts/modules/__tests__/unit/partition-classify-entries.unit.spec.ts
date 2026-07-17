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
import { _makeEmptyClassifyCache, _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type { ClassifyBufferEntry, FindBufferEntriesOptions } from '../../../types/classify.types.ts';
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
 *
 * @param entries - パスをキーとした `ClassifyBufferEntry` マップ
 * @returns `path => Promise<ClassifyBufferEntry>` 互換のスタブ関数
 */
const _makeLoadMeta = (
  entries: Map<string, ClassifyBufferEntry>,
): FindBufferEntriesOptions['loadMeta'] =>
(path: string): Promise<ClassifyBufferEntry> => Promise.resolve(entries.get(path)!);

// ─── Tests

/**
 * `partitionClassifyEntries` のユニットテストスイート。
 *
 * ディレクトリ走査 → AI なし事前分類 → キャッシュ有無による REMAINING の振り分けを検証する。
 *
 * テスト ID 範囲: T-CL-PCE-01 〜 T-CL-PCE-03
 *
 * @see partitionClassifyEntries
 */
describe('partitionClassifyEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCE-01: preclassify で全件 MOVE/SKIP に解決する → resolved に全件含まれ、cached/uncached は空', async () => {
      // frontmatter に project あり、パスは proj-a サブディレクトリ外 → MOVE
      const _entryMove = _makeEntry('/tmp/input/test.md', { project: 'proj-a' }, '');
      // frontmatter に project あり、パスが proj-a サブディレクトリ内 → SKIP
      const _entrySkip = _makeEntry('/tmp/input/proj-a/test.md', { project: 'proj-a' }, '');

      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryMove.filePath!, { file: _entryMove }],
        [_entrySkip.filePath!, { file: _entrySkip }],
      ]);
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries),
      };
      const _cache = await _makeEmptyClassifyCache();
      const _stats = _makeStats();

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts, _stats);

      assertEquals(result.resolved.length, 2);
      assertEquals(result.resolved.map((e) => e.action).sort(), [CLASSIFY_ACTIONS.MOVE, CLASSIFY_ACTIONS.SKIP].sort());
      assertEquals(result.cached, []);
      assertEquals(result.uncached, []);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCE-02: REMAINING エントリのファイルがキャッシュ済み → cached に project/action: MOVEBYAI で含まれ uncached には含まれない', async () => {
      const _entry = _makeEntry('/tmp/input/cached.md', {}, 'a'.repeat(100));
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entry.filePath!, { file: _entry }],
      ]);
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries),
      };
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entry.filePath!, { project: 'proj-a', confidence: 0.95, reason: 'cached decision' });

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.resolved, []);
      assertEquals(result.uncached, []);
      assertEquals(result.cached.length, 1);
      assertEquals(result.cached[0].project, 'proj-a');
      assertEquals(result.cached[0].action, CLASSIFY_ACTIONS.MOVEBYAI);
    });

    it('[Edge] T-CL-PCE-03: REMAINING エントリが一部のみキャッシュ済み → cache済み分は cached へ、未cache分は uncached へ振り分けられる', async () => {
      const _entryCached = _makeEntry('/tmp/input/cached2.md', {}, 'a'.repeat(100));
      const _entryUncached = _makeEntry('/tmp/input/uncached.md', {}, 'b'.repeat(100));
      const _entries = new Map<string, ClassifyBufferEntry>([
        [_entryCached.filePath!, { file: _entryCached }],
        [_entryUncached.filePath!, { file: _entryUncached }],
      ]);
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([..._entries.keys()]),
        loadMeta: _makeLoadMeta(_entries),
      };
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entryCached.filePath!, { project: 'proj-a', confidence: 0.9, reason: 'cached' });

      const result = await partitionClassifyEntries('/tmp/input', _cache, _opts);

      assertEquals(result.cached.length, 1);
      assertEquals(result.cached[0].file.filePath, _entryCached.filePath);
      assertEquals(result.cached[0].project, 'proj-a');
      assertEquals(result.uncached.length, 1);
      assertEquals(result.uncached[0].file.filePath, _entryUncached.filePath);
    });
  });
});
