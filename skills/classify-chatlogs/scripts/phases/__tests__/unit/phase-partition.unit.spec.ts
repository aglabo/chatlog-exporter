// src: scripts/phases/__tests__/unit/phase-partition.unit.spec.ts
// @(#): partitionEntries の単体テスト
//       対象: partitionEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { partitionEntries } from '../../phase-partition.ts';

// ─── Helpers
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `partitionEntries` のユニットテストスイート。
 *
 * cache に project が設定済みかどうかのみで cached/uncached を振り分けることを検証する。
 *
 * テスト ID 範囲: T-CL-PCE-01 〜 T-CL-PCE-05
 *
 * @see partitionEntries
 */
describe('partitionEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCE-01: project 設定済みエントリのみ → uncached は空、cached に全件含まれる', async () => {
      const _entryA = _makeEntry('/tmp/input/a.md', {}, '');
      const _entryB = _makeEntry('/tmp/input/b.md', {}, '');
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entryA.filePath!, { project: 'proj-a' });
      await _cache.write(_entryB.filePath!, { project: 'proj-b' });

      const result = partitionEntries([_entryA, _entryB], _cache);

      assertEquals(result.uncached, []);
      assertEquals(result.cached, [_entryA, _entryB]);
    });

    it('[Normal] T-CL-PCE-02: project 未設定エントリのみ → cached は空、uncached に全件含まれる', async () => {
      const _entryA = _makeEntry('/tmp/input/a.md', {}, '');
      const _entryB = _makeEntry('/tmp/input/b.md', {}, '');
      const _cache = await _makeEmptyClassifyCache();

      const result = partitionEntries([_entryA, _entryB], _cache);

      assertEquals(result.cached, []);
      assertEquals(result.uncached, [_entryA, _entryB]);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCE-03: project 設定済みと未設定が混在 → 正しく振り分けられる', async () => {
      const _entryCached = _makeEntry('/tmp/input/cached.md', {}, '');
      const _entryUncached = _makeEntry('/tmp/input/uncached.md', {}, '');
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entryCached.filePath!, { project: 'proj-a' });

      const result = partitionEntries([_entryCached, _entryUncached], _cache);

      assertEquals(result.cached, [_entryCached]);
      assertEquals(result.uncached, [_entryUncached]);
    });

    it('[Edge] T-CL-PCE-04: cached と uncached を合わせると渡した全エントリになる', async () => {
      const _entryA = _makeEntry('/tmp/input/a.md', {}, '');
      const _entryB = _makeEntry('/tmp/input/uncached.md', {}, '');
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entryA.filePath!, { project: 'proj-a' });

      const result = partitionEntries([_entryA, _entryB], _cache);

      assertEquals([...result.cached, ...result.uncached], [_entryA, _entryB]);
    });

    it('[Edge] T-CL-PCE-05: project が空文字列 → uncached 扱いになる', async () => {
      const _entry = _makeEntry('/tmp/input/empty-project.md', {}, '');
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entry.filePath!, { project: '' });

      const result = partitionEntries([_entry], _cache);

      assertEquals(result.cached, []);
      assertEquals(result.uncached, [_entry]);
    });
  });
});
