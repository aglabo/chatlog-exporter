// src: scripts/libs/__tests__/unit/format-entry.unit.spec.ts
// @(#): formatDicEntry / formatDicEntryShort のユニットテスト
//       辞書エントリをプロンプト文字列に整形する関数の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assert, assertEquals, assertNotMatch } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  formatDicEntries,
  formatDicEntriesShort,
  formatDicEntry,
  formatDicEntryShort,
} from '../../dic-format-utils.ts';

// ─── Helpers
// types
import type { DicEntry, DicRules } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// functions
function _makeEntry(key: string, def: string, rules: DicRules, structure?: string): DicEntry {
  return { key, def, desc: '', rules, structure };
}

// ─── Tests

describe('formatDicEntry', () => {
  describe('Given: when と not 両方があるエントリ', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-01 - when/not が含まれる形式に展開される', () => {
        const entry = _makeEntry('research', '調査・情報収集', { when: ['技術調査'], not: ['実装作業'] });

        it('T-SF-FE-01-01: "- research: 調査・情報収集" で始まる', () => {
          const result = formatDicEntry(entry);

          assert(result.startsWith('- research: 調査・情報収集'));
        });

        it('T-SF-FE-01-02: "when: 技術調査" 行が含まれる', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('  when: 技術調査'));
        });

        it('T-SF-FE-01-03: "not: 実装作業" 行が含まれる', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('  not: 実装作業'));
        });
      });
    });
  });

  // ─── when のみのエントリ ──────────────────────────────────────────────────

  describe('Given: when のみがあるエントリ（not は空配列）', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-02 - not 行が含まれない', () => {
        const entry = _makeEntry('execution', '実行・実装', { when: ['実装作業'], not: [] });

        it('T-SF-FE-02-01: "when:" 行が含まれる', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('  when:'));
        });

        it('T-SF-FE-02-02: "not:" 行が含まれない', () => {
          const result = formatDicEntry(entry);

          assertNotMatch(result, /\s+not:/);
        });
      });
    });
  });

  // ─── when も not も空のエントリ ──────────────────────────────────────────

  describe('Given: when も not も空のエントリ', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-03 - "- key: def" のみになる', () => {
        const entry = _makeEntry('writing', '文書作成', { when: [], not: [] });

        it('T-SF-FE-03-01: "- writing: 文書作成\\n" が返る（末尾改行付き）', () => {
          const result = formatDicEntry(entry);

          assertEquals(result, '- writing: 文書作成\n');
        });
      });
    });
  });

  // ─── when に複数値があるエントリ ─────────────────────────────────────────

  describe('Given: when に複数の値があるエントリ', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-04 - when の値が " / " で区切られる', () => {
        const entry = _makeEntry('discussion', '議論・相談', { when: ['設計議論', '方針議論'], not: [] });

        it('T-SF-FE-04-01: when の値が "設計議論 / 方針議論" で展開される', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('設計議論 / 方針議論'));
        });
      });
    });
  });

  // ─── always フィールドを含むエントリ ─────────────────────────────────────

  describe('Given: always フィールドを含むエントリ', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-07 - always 行が展開される', () => {
        const entry = _makeEntry('incident', 'エラー起点のログ', {
          when: ['エラーが起点'],
          always: ['incident は他のタイプより優先'],
          not: ['エラーなしの実装'],
        });

        it('T-SF-FE-07-01: "always:" 行が含まれる', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('  always: incident は他のタイプより優先'));
        });

        it('T-SF-FE-07-02: when / always / not の順序で展開される', () => {
          const result = formatDicEntry(entry);
          const whenIdx = result.indexOf('  when:');
          const alwaysIdx = result.indexOf('  always:');
          const notIdx = result.indexOf('  not:');

          assert(whenIdx < alwaysIdx && alwaysIdx < notIdx);
        });
      });
    });
  });

  // ─── structure フィールドを含むエントリ ──────────────────────────────────

  describe('Given: structure フィールドを含むエントリ', () => {
    describe('When: formatDicEntry を呼び出す', () => {
      describe('Then: T-SF-FE-08 - structure が末尾に追加される', () => {
        const entry = _makeEntry('execution', '実装ログ', { when: ['実装作業'], not: [] }, '指示 → 実装 → 確認');

        it('T-SF-FE-08-01: "structure: 指示 → 実装 → 確認" 行が含まれる', () => {
          const result = formatDicEntry(entry);

          assert(result.includes('  structure: 指示 → 実装 → 確認'));
        });

        it('T-SF-FE-08-02: structure 行が末尾改行の直前にある', () => {
          const result = formatDicEntry(entry);
          const lines = result.split('\n');

          assertEquals(lines.at(-2), '  structure: 指示 → 実装 → 確認');
          assertEquals(lines.at(-1), '');
        });
      });
    });
  });
});

describe('formatDicEntryShort', () => {
  describe('Given: when と not 両方があるエントリ', () => {
    describe('When: formatDicEntryShort を呼び出す', () => {
      describe('Then: T-SF-FE-05 - rules を無視して "- key: def" のみ返る', () => {
        const entry = _makeEntry('research', '調査・情報収集', { when: ['技術調査'], not: ['実装作業'] });

        it('T-SF-FE-05-01: "- research: 調査・情報収集" だけが返る', () => {
          const result = formatDicEntryShort(entry);

          assertEquals(result, '- research: 調査・情報収集');
        });

        it('T-SF-FE-05-02: "when:" 行が含まれない', () => {
          const result = formatDicEntryShort(entry);

          assertNotMatch(result, /when:/);
        });

        it('T-SF-FE-05-03: "not:" 行が含まれない', () => {
          const result = formatDicEntryShort(entry);

          assertNotMatch(result, /not:/);
        });
      });
    });
  });

  describe('Given: rules が空のエントリ', () => {
    describe('When: formatDicEntryShort を呼び出す', () => {
      describe('Then: T-SF-FE-06 - "- key: def" が返る', () => {
        const entry = _makeEntry('writing', '文書作成', { when: [], not: [] });

        it('T-SF-FE-06-01: "- writing: 文書作成" が返る', () => {
          const result = formatDicEntryShort(entry);

          assertEquals(result, '- writing: 文書作成');
        });
      });
    });
  });
});

describe('formatDicEntries', () => {
  /** 2エントリが改行で結合される正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FE-10: 空配列 → 空文字列が返る', () => {
      const result = formatDicEntries([]);

      assertEquals(result, '');
    });
  });
});

describe('formatDicEntriesShort', () => {
  /** 2エントリが改行で結合される正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FE-11: 2エントリ → "- key: def" が改行で結合された文字列が返る', () => {
      const entries = [
        _makeEntry('research', '調査', { when: [], not: [] }),
        _makeEntry('execution', '実行', { when: [], not: [] }),
      ];

      const result = formatDicEntriesShort(entries);

      assertEquals(result, '- research: 調査\n- execution: 実行');
    });

    it('[Normal] T-SF-FE-12: 空配列 → 空文字列が返る', () => {
      const result = formatDicEntriesShort([]);

      assertEquals(result, '');
    });
  });
});
