// src: scripts/modules/__tests__/unit/prefilter-phase1.unit.spec.ts
// @(#): prefilter.ts のユニットテスト
//       対象: _phase1PartitionByFilename
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase1PartitionByFilename } from '../../prefilter.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers

// functions
/** テスト用の `ChatlogEntry` を `filePath` のみ指定して生成する（本テストでは content は無関係）。 */
function _makeEntry(filePath: string): ChatlogEntry {
  return new ChatlogEntry('', { filePath });
}

// ─── Tests

/**
 * `_phase1PartitionByFilename` のユニットテストスイート。
 *
 * ファイルパス配列をファイル名パターンで `fileList`/`discardFiles` に分類する
 * 純粋関数の動作を検証する。全件除外・全件通過・混在・空配列・順序保持を網羅する。
 *
 * テスト ID 範囲: T-FL-P11-01 〜 T-FL-P11-05
 *
 * @see _phase1PartitionByFilename
 */
describe('_phase1PartitionByFilename', () => {
  // ─── T-FL-P11-01: 除外パターンに一致するファイルのみ ─────────────────────────

  describe('Given: 除外パターンに一致するファイルのみの配列', () => {
    describe('When: _phase1PartitionByFilename(files) を呼び出す', () => {
      describe('Then: T-FL-P11-01 - discardFiles に全件、fileList は空', () => {
        it('T-FL-P11-01-01: 全件が discardFiles に入り fileList は空になる', () => {
          const files = ['/a/say-ok-and-nothing-else.md', '/b/you-are-a-topic-and-tag-extraction-assistant.md'];
          const entries = files.map((filePath) => _makeEntry(filePath));
          const result = _phase1PartitionByFilename(entries);

          assertEquals(result.fileList, []);
          assertEquals(result.discardFiles.map((d) => d.filePath), files);
        });

        it('T-FL-P11-01-02: discardFiles の各要素が filePath/filename/reason を持つ', () => {
          const filePath = '/a/say-ok-and-nothing-else.md';
          const result = _phase1PartitionByFilename([_makeEntry(filePath)]);

          assertEquals(result.discardFiles.length, 1);
          assertEquals(result.discardFiles[0].filePath, filePath);
          assertEquals(result.discardFiles[0].filename, 'say-ok-and-nothing-else.md');
          assertEquals(result.discardFiles[0].reason.length > 0, true);
        });
      });
    });
  });

  // ─── T-FL-P11-02: 除外パターンに一致しないファイルのみ ───────────────────────

  describe('Given: 除外パターンに一致しないファイルのみの配列', () => {
    describe('When: _phase1PartitionByFilename(files) を呼び出す', () => {
      describe('Then: T-FL-P11-02 - fileList に全件、discardFiles は空', () => {
        it('T-FL-P11-02-01: 全件が fileList に入り discardFiles は空になる', () => {
          const files = ['/a/my-chat-log.md', '/b/architecture-discussion-2026.md'];
          const entries = files.map((filePath) => _makeEntry(filePath));
          const result = _phase1PartitionByFilename(entries);

          assertEquals(result.fileList.map((e) => e.filePath), files);
          assertEquals(result.discardFiles, []);
        });
      });
    });
  });

  // ─── T-FL-P11-03: 除外対象と通過対象が混在 ───────────────────────────────────

  describe('Given: 除外対象と通過対象が混在する配列', () => {
    describe('When: _phase1PartitionByFilename(files) を呼び出す', () => {
      describe('Then: T-FL-P11-03 - それぞれ正しい配列に振り分けられる', () => {
        it('T-FL-P11-03-01: 除外1件+通過1件 → fileList/discardFiles に正しく分類される', () => {
          const survivorPath = '/a/my-chat-log.md';
          const discardedPath = '/b/say-ok-and-nothing-else.md';
          const result = _phase1PartitionByFilename([_makeEntry(survivorPath), _makeEntry(discardedPath)]);

          assertEquals(result.fileList.map((e) => e.filePath), [survivorPath]);
          assertEquals(result.discardFiles.map((d) => d.filePath), [discardedPath]);
        });
      });
    });
  });

  // ─── T-FL-P11-04: 空配列 ─────────────────────────────────────────────────────

  describe('Given: 空のファイルパス配列', () => {
    describe('When: _phase1PartitionByFilename(files) を呼び出す', () => {
      describe('Then: T-FL-P11-04 - fileList/discardFiles ともに空配列', () => {
        it('T-FL-P11-04-01: fileList と discardFiles がともに空配列になる', () => {
          const result = _phase1PartitionByFilename([]);

          assertEquals(result.fileList, []);
          assertEquals(result.discardFiles, []);
        });
      });
    });
  });

  // ─── T-FL-P11-05: 入力順序の保持 ─────────────────────────────────────────────

  describe('Given: 通過対象・除外対象がそれぞれ複数含まれる配列', () => {
    describe('When: _phase1PartitionByFilename(files) を呼び出す', () => {
      describe('Then: T-FL-P11-05 - fileList/discardFiles がそれぞれ入力順を保持する', () => {
        it('T-FL-P11-05-01: fileList の順序が入力順と一致する', () => {
          const files = ['/a/third.md', '/b/first.md', '/c/second.md'];
          const entries = files.map((filePath) => _makeEntry(filePath));
          const result = _phase1PartitionByFilename(entries);

          assertEquals(result.fileList.map((e) => e.filePath), files);
        });

        it('T-FL-P11-05-02: discardFiles の順序が入力順と一致する', () => {
          const filePath1 = '/say-ok-and-nothing-else-a.md';
          const filePath2 = '/say-ok-and-nothing-else-b.md';
          const result = _phase1PartitionByFilename([_makeEntry(filePath1), _makeEntry(filePath2)]);

          assertEquals(result.discardFiles.map((d) => d.filePath), [filePath1, filePath2]);
        });
      });
    });
  });
});
