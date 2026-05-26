// src: scripts/modules/__tests__/unit/classify-noai.unit.spec.ts
// @(#): preClassify / findBufferEntries / processPreclassify の単体テスト
//       対象: preClassify / findBufferEntries / processPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findBufferEntries, preClassify, processPreclassify } from '../../classify-noai.ts';
// types
import type { ClassifyBufferEntry } from '../../../types/classify.types.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { ClassifyChatlogEntry } from '../../../classes/ClassifyChatlogEntry.class.ts';
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
// types
import type { GlobProvider } from '../../../../../_scripts/types/providers.types.ts';
import type { ClassifyStats } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `preClassify` のユニットテストスイート。
 *
 * frontmatter の `project` フィールドと本文長に基づく事前分類ロジックを検証する。
 *
 * テスト ID 範囲: T-CL-PRE-01 〜 T-CL-PRE-06
 *
 * @see preClassify
 */
describe('preClassify', () => {
  /**
   * 正常系: frontmatter の `project` フィールドが存在する場合の分岐テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PRE-01: project フィールドあり + 既に正しいディレクトリ内 → action=skip, buffer に追加, remaining に含まれない', () => {
      const _entry = _makeEntry('/tmp/chatlogs/app1/test.md', { project: 'app1' }, '本文テキスト');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'skip');
      assertEquals(buffer[0].project, 'app1');
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-02: project フィールドあり + ディレクトリが違う → action=move, buffer に追加', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', { project: 'app1' }, '本文テキスト');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'move');
      assertEquals(buffer[0].project, 'app1');
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-03: project フィールドなし + hasMeta=false + 短い → FALLBACK_PROJECT, action=move, buffer に追加', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, 'short');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'move');
      assertEquals(buffer[0].project, FALLBACK_PROJECT);
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-04: project フィールドなし + hasMeta=true → remaining に追加（AI 処理対象）', () => {
      const _entry = _makeEntry(
        '/tmp/chatlogs/test.md',
        { title: 'Some Title', category: 'development' },
        'short',
      );

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 0);
      assertEquals(remaining.length, 1);
    });

    it('[Normal] T-CL-PRE-05: project フィールドなし + hasMeta=false + 長い → remaining に追加', () => {
      const _longContent = 'a'.repeat(100);
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, _longContent);

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 0);
      assertEquals(remaining.length, 1);
    });
  });

  /**
   * エッジケース: 複数エントリが混在する場合のテスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PRE-06: 混合ケース（skip/move/remaining が混在）', () => {
      const _skipEntry = _makeEntry('/tmp/chatlogs/app1/a.md', { project: 'app1' }, '本文');
      const _moveEntry = _makeEntry('/tmp/chatlogs/b.md', { project: 'app2' }, '本文');
      const _shortEntry = _makeEntry('/tmp/chatlogs/c.md', {}, 'x');
      const _remainingEntry = _makeEntry('/tmp/chatlogs/d.md', { title: 'Title' }, 'x');
      const _longEntry = _makeEntry('/tmp/chatlogs/e.md', {}, 'x'.repeat(100));

      const { buffer, remaining } = preClassify([
        _skipEntry,
        _moveEntry,
        _shortEntry,
        _remainingEntry,
        _longEntry,
      ]);

      // skip: 1件 (app1/a.md)
      // move: 2件 (b.md → app2, c.md → FALLBACK_PROJECT)
      // remaining: 2件 (d.md, e.md)
      assertEquals(buffer.length, 3);
      assertEquals(remaining.length, 2);

      const _skipEntries = buffer.filter((e: ClassifyBufferEntry) => e.action === 'skip');
      const _moveEntries = buffer.filter((e: ClassifyBufferEntry) => e.action === 'move');
      assertEquals(_skipEntries.length, 1);
      assertEquals(_moveEntries.length, 2);
      assertEquals(remaining.length, 2);
    });
  });
});

/**
 * `findBufferEntries` のユニットテストスイート。
 *
 * glob / loadMeta プロバイダを差し替えてファイル収集・メタ読み込みパイプラインを検証する。
 *
 * テスト ID 範囲: T-CL-LBE-01 〜 T-CL-LBE-04
 *
 * @see findBufferEntries
 */
describe('findBufferEntries', () => {
  /**
   * 正常系: ファイル収集とメタ読み込みが正常に動作する場合のテスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-LBE-01: 空ディレクトリ（glob が空配列を返す）→ 空配列を返す', async () => {
      const _emptyGlob: GlobProvider = (_pattern: string) => Promise.resolve([]);

      const result = await findBufferEntries('/tmp/empty', { glob: _emptyGlob });

      assertEquals(result, []);
    });

    it('[Normal] T-CL-LBE-02: 複数ファイルがある場合 → ClassifyBufferEntry[] を返す', async () => {
      const _files = ['/tmp/dir/a.md', '/tmp/dir/b.md'];
      const _stubGlob: GlobProvider = (_pattern: string) => Promise.resolve(_files);
      const _entryA = _makeEntry('/tmp/dir/a.md', { title: 'Entry A' }, '本文A');
      const _entryB = _makeEntry('/tmp/dir/b.md', { title: 'Entry B' }, '本文B');
      const _metaMap: Record<string, ClassifyChatlogEntry> = {
        '/tmp/dir/a.md': _entryA,
        '/tmp/dir/b.md': _entryB,
      };
      const _stubLoadMeta = (path: string) => Promise.resolve(_metaMap[path] ?? null);

      const result = await findBufferEntries('/tmp/dir', {
        glob: _stubGlob,
        loadMeta: _stubLoadMeta,
      });

      assertEquals(result.length, 2);
      assertEquals(result[0].file, _entryA);
      assertEquals(result[1].file, _entryB);
    });
  });

  /**
   * 異常系: loadMeta が null を返す場合のスキップ動作テスト。
   */
  describe('When: 異常系', () => {
    it('[Error] T-CL-LBE-03: loadMeta が null を返すファイルがある場合 → スキップして残りを返す + stats.error が増加する', async () => {
      const _files = ['/tmp/dir/good.md', '/tmp/dir/bad.md'];
      const _stubGlob: GlobProvider = (_pattern: string) => Promise.resolve(_files);
      const _goodEntry = _makeEntry('/tmp/dir/good.md', { title: 'Good' }, '本文');
      const _stubLoadMeta = (path: string) =>
        path === '/tmp/dir/good.md' ? Promise.resolve(_goodEntry) : Promise.resolve(null);
      const _stats: ClassifyStats = _makeStats();

      const result = await findBufferEntries('/tmp/dir', {
        glob: _stubGlob,
        loadMeta: _stubLoadMeta,
      }, _stats);

      assertEquals(result.length, 1);
      assertEquals(result[0].file, _goodEntry);
      assertEquals(_stats.error, 1);
    });
  });

  /**
   * エッジケース: ファイルが 0 件の場合の型形状テスト、stats 省略時の動作テスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-LBE-04: ファイルが 0 件の時でも ClassifyBufferEntry[] 型を返す', async () => {
      const _stubGlob: GlobProvider = (_pattern: string) => Promise.resolve([]);
      const _stubLoadMeta = (_path: string): Promise<null> => Promise.resolve(null);

      const result = await findBufferEntries('/tmp/dir', {
        glob: _stubGlob,
        loadMeta: _stubLoadMeta,
      });

      assertEquals(Array.isArray(result), true);
      assertEquals(result.length, 0);
    });

    it('[Edge] T-CL-LBE-05: stats 省略時に null ファイルがあってもクラッシュせず空配列を返す', async () => {
      const _files = ['/tmp/dir/bad.md'];
      const _stubGlob: GlobProvider = (_pattern: string) => Promise.resolve(_files);
      const _stubLoadMeta = (_path: string): Promise<null> => Promise.resolve(null);

      const result = await findBufferEntries('/tmp/dir', {
        glob: _stubGlob,
        loadMeta: _stubLoadMeta,
      });

      assertEquals(Array.isArray(result), true);
      assertEquals(result.length, 0);
    });

    it('[Edge] T-CL-LBE-06: loadMeta が ChatlogError をスローする場合 → スキップして残りを返す + stats.error が増加する', async () => {
      const _files = ['/tmp/dir/good.md', '/tmp/dir/broken.md'];
      const _stubGlob: GlobProvider = (_pattern: string) => Promise.resolve(_files);
      const _goodEntry = _makeEntry('/tmp/dir/good.md', { title: 'Good' }, '本文');
      const _stubLoadMeta = (path: string): Promise<ClassifyChatlogEntry | null> => {
        if (path === '/tmp/dir/broken.md') {
          return Promise.reject(new ChatlogError('InvalidFormat', path));
        }
        return Promise.resolve(_goodEntry);
      };
      const _stats: ClassifyStats = _makeStats();

      const result = await findBufferEntries('/tmp/dir', {
        glob: _stubGlob,
        loadMeta: _stubLoadMeta,
      }, _stats);

      assertEquals(result.length, 1);
      assertEquals(result[0].file, _goodEntry);
      assertEquals(_stats.error, 1);
    });
  });
});

/**
 * `processPreclassify` のユニットテストスイート。
 *
 * `ClassifyBufferEntry[]` を直接渡し、各エントリに `preClassify` を適用した結果を検証する。
 *
 * テスト ID 範囲: T-CL-PCL-01 〜 T-CL-PCL-03
 *
 * @see processPreclassify
 */
describe('processPreclassify', () => {
  /**
   * 正常系: project あり・なし・短すぎるファイルが混在する場合の分類結果テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCL-01: project あり・project なし・短すぎる混在 → それぞれ適切な action が設定された ClassifyBufferEntry[] を返す', () => {
      const _entryWithProject = _makeEntry('/tmp/dir/app1/a.md', { project: 'app1' }, '本文');
      const _entryShort = _makeEntry('/tmp/dir/b.md', {}, 'x');
      const _entryLong = _makeEntry('/tmp/dir/c.md', {}, 'a'.repeat(100));

      const _buffer: ClassifyBufferEntry[] = [
        { file: _entryWithProject },
        { file: _entryShort },
        { file: _entryLong },
      ];

      const _result = processPreclassify(_buffer);

      assertEquals(_result.length, 3);
      assertEquals(_result[0].action, 'skip');
      assertEquals(_result[0].project, 'app1');
      assertEquals(_result[1].action, 'move');
      assertEquals(_result[1].project, FALLBACK_PROJECT);
      assertEquals(_result[2].action, 'remaining');
    });

    it('[Normal] T-CL-PCL-02: 空配列を渡す → 空配列を返す', () => {
      const _result = processPreclassify([]);

      assertEquals(Array.isArray(_result), true);
      assertEquals(_result.length, 0);
    });
  });

  /**
   * エッジケース: 単一エントリのみの場合の動作テスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCL-03: 単一エントリ（project あり）を渡す → action=skip を返す', () => {
      const _entry = _makeEntry('/tmp/dir/app1/a.md', { project: 'app1' }, '本文');
      const _buffer: ClassifyBufferEntry[] = [{ file: _entry }];

      const _result = processPreclassify(_buffer);

      assertEquals(_result.length, 1);
      assertEquals(_result[0].action, 'skip');
      assertEquals(_result[0].project, 'app1');
    });
  });
});
