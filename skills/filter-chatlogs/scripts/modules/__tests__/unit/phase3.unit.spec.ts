// src: scripts/modules/__tests__/unit/prefilter-phase3.unit.spec.ts
// @(#): prefilter.ts のユニットテスト
//       対象: _phase3PartitionByContent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase3PartitionByContent } from '../../prefilter.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers

// functions
function _makeBody(options: { userText?: string; assistantText?: string; extraPadding?: number }): string {
  const userText = options.userText ?? '質問内容です';
  const assistantText = options.assistantText ?? 'アシスタントの回答です';
  const padding = 'x'.repeat(options.extraPadding ?? 0);

  return `### User\n${userText}${padding}\n\n### Assistant\n${assistantText}\n`;
}

function _makeEntry(filePath: string, content: string): ChatlogEntry {
  return new ChatlogEntry(content, { filePath });
}

// ─── Tests

/**
 * `_phase3PartitionByContent` のユニットテストスイート。
 *
 * 読み込み済みファイルエントリの本文を内容チェックで `survivors`/`results` に分類する
 * 純粋関数の動作を検証する。正常通過・本文空・内容除外・複数エントリ混在を網羅する。
 *
 * テスト ID 範囲: T-FL-P3-01 〜 T-FL-P3-04
 *
 * @see _phase3PartitionByContent
 */
describe('_phase3PartitionByContent', () => {
  // ─── T-FL-P3-01: 正常な本文 → survivors に追加 ───────────────────────────────

  describe('Given: 除外条件に該当しない正常な本文を持つエントリ', () => {
    describe('When: _phase3PartitionByContent(readOk, minCharCount, minAssistantChars) を呼び出す', () => {
      describe('Then: T-FL-P3-01 - survivors に追加され results は空', () => {
        it('T-FL-P3-01-01: survivors に content 付きで追加され results は空になる', () => {
          const content = _makeBody({ userText: 'u'.repeat(500), assistantText: 'a'.repeat(500), extraPadding: 200 });
          const readOk = [_makeEntry('/a/ok.md', content)];

          const result = _phase3PartitionByContent(readOk, 1000, 300);

          assertEquals(result.results, []);
          assertEquals(result.survivors.length, 1);
          assertEquals(result.survivors[0].filePath, '/a/ok.md');
          assertEquals(result.survivors[0].filename, 'ok.md');
          assert(result.survivors[0].content.trim().length > 0);
        });
      });
    });
  });

  // ─── T-FL-P3-02: 本文が空文字列 → 「本文が空」 ───────────────────────────────

  describe('Given: content.trim() が空文字列のエントリ', () => {
    describe('When: _phase3PartitionByContent(readOk, minCharCount, minAssistantChars) を呼び出す', () => {
      describe('Then: T-FL-P3-02 - results に「本文が空」の excluded-content が追加される', () => {
        it('T-FL-P3-02-01: results に outcome=excluded-content, reason=本文が空 が追加される', () => {
          const readOk = [_makeEntry('/a/empty.md', '   \n  ')];

          const result = _phase3PartitionByContent(readOk, 1000, 300);

          assertEquals(result.survivors, []);
          assertEquals(result.results, [
            { filePath: '/a/empty.md', filename: 'empty.md', reason: '本文が空', decision: 'DISCARD' },
          ]);
        });
      });
    });
  });

  // ─── T-FL-P3-03: isExcludedByContent が除外判定 ─────────────────────────────

  describe('Given: minCharCount 未満の短い本文を持つエントリ', () => {
    describe('When: _phase3PartitionByContent(readOk, minCharCount, minAssistantChars) を呼び出す', () => {
      describe('Then: T-FL-P3-03 - isExcludedByContent の reason で excluded-content が追加される', () => {
        it('T-FL-P3-03-01: results に isExcludedByContent の reason が反映される', () => {
          const content = '短い本文';
          const readOk = [_makeEntry('/a/short.md', content)];

          const result = _phase3PartitionByContent(readOk, 1000, 300);

          assertEquals(result.survivors, []);
          assertEquals(result.results.length, 1);
          assertEquals(result.results[0].decision, 'DISCARD');
          assert(result.results[0].reason?.includes('短すぎる'));
        });
      });
    });
  });

  // ─── T-FL-P3-04: 複数エントリ混在 ─────────────────────────────────────────────

  describe('Given: 通過エントリと除外エントリが混在する readOk 配列', () => {
    describe('When: _phase3PartitionByContent(readOk, minCharCount, minAssistantChars) を呼び出す', () => {
      describe('Then: T-FL-P3-04 - それぞれ survivors/results に正しく振り分けられる', () => {
        it('T-FL-P3-04-01: 通過エントリは survivors、除外エントリは results に入る', () => {
          const okContent = _makeBody({
            userText: 'u'.repeat(500),
            assistantText: 'a'.repeat(500),
            extraPadding: 200,
          });
          const readOk = [
            _makeEntry('/a/ok.md', okContent),
            _makeEntry('/b/empty.md', ''),
          ];

          const result = _phase3PartitionByContent(readOk, 1000, 300);

          assertEquals(result.survivors.length, 1);
          assertEquals(result.survivors[0].filePath, '/a/ok.md');
          assertEquals(result.results, [
            { filePath: '/b/empty.md', filename: 'empty.md', reason: '本文が空', decision: 'DISCARD' },
          ]);
        });
      });
    });
  });
});
