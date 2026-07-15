// src: scripts/__tests__/unit/filter/count-unexecuted-chunk-files.unit.spec.ts
// @(#): count-unexecuted-chunk-files.ts のユニットテスト
//       対象: countUnexecutedChunkFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { countUnexecutedChunkFiles } from '../../../modules/filter/count-unexecuted-chunk-files.ts';

// ─── Tests

/**
 * `countUnexecutedChunkFiles` のユニットテストスイート。
 *
 * `runChunked` の戻り値（穴を含みうる配列）から、未実行チャンクに含まれる
 * ファイル数の合計を正しく集計することを検証する。
 *
 * テスト ID 範囲: T-FL-CUCF-01 〜 T-FL-CUCF-04
 *
 * @see countUnexecutedChunkFiles
 */
describe('countUnexecutedChunkFiles', () => {
  describe('When: 正常系・エッジケース', () => {
    it('T-FL-CUCF-01: items が空配列 → 0 を返す', () => {
      const result = countUnexecutedChunkFiles([], 2, []);

      assertEquals(result, 0);
    });

    it('T-FL-CUCF-02: 全チャンクが実行済み（穴なし） → 0 を返す', () => {
      const items = ['a.md', 'b.md', 'c.md', 'd.md'];
      const chunkResults = [undefined, undefined];

      const result = countUnexecutedChunkFiles(items, 2, chunkResults);

      assertEquals(result, 0);
    });

    it('T-FL-CUCF-03: 一部チャンクが未実行（穴あり） → 穴チャンクのファイル数合計を返す', () => {
      const items = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
      const chunkResults: unknown[] = [undefined];
      // インデックス 1, 2 は穴（未代入）のまま残す

      const result = countUnexecutedChunkFiles(items, 2, chunkResults);

      assertEquals(result, 3);
    });

    it('T-FL-CUCF-04: 全チャンクが未実行（穴のみ） → 全ファイル数を返す', () => {
      const items = ['a.md', 'b.md', 'c.md'];
      const chunkResults: unknown[] = [];

      const result = countUnexecutedChunkFiles(items, 1, chunkResults);

      assertEquals(result, 3);
    });
  });
});
