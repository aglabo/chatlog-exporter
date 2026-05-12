// src: scripts/__tests__/unit/set-frontmatter.format-entry.unit.spec.ts
// @(#): formatEntryWithRules / formatEntryShort のユニットテスト
//       辞書エントリをプロンプト文字列に整形する関数の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertNotMatch } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import type { DicEntry } from '../../set-frontmatter.ts';
import { formatEntryShort, formatEntryWithRules } from '../../set-frontmatter.ts';

// ─── テスト用ヘルパー ─────────────────────────────────────────────────────────

function _makeEntry(key: string, def: string, when: string[], not: string[]): DicEntry {
  return { key, def, desc: '', rules: { when, not } };
}

// ─── formatEntryWithRules のテスト ────────────────────────────────────────────

describe('formatEntryWithRules', () => {
  describe('Given: when と not 両方があるエントリ', () => {
    describe('When: formatEntryWithRules を呼び出す', () => {
      describe('Then: T-SF-FE-01 - when/not が含まれる形式に展開される', () => {
        const entry = _makeEntry('research', '調査・情報収集', ['技術調査'], ['実装作業']);

        it('T-SF-FE-01-01: "- research: 調査・情報収集" で始まる', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result.startsWith('- research: 調査・情報収集'), true);
        });

        it('T-SF-FE-01-02: "when: 技術調査" 行が含まれる', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result.includes('  when: 技術調査'), true);
        });

        it('T-SF-FE-01-03: "not:  実装作業" 行が含まれる', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result.includes('  not:  実装作業'), true);
        });
      });
    });
  });

  // ─── when のみのエントリ ──────────────────────────────────────────────────

  describe('Given: when のみがあるエントリ（not は空配列）', () => {
    describe('When: formatEntryWithRules を呼び出す', () => {
      describe('Then: T-SF-FE-02 - not 行が含まれない', () => {
        const entry = _makeEntry('execution', '実行・実装', ['実装作業'], []);

        it('T-SF-FE-02-01: "when:" 行が含まれる', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result.includes('  when:'), true);
        });

        it('T-SF-FE-02-02: "not:" 行が含まれない', () => {
          const result = formatEntryWithRules(entry);

          assertNotMatch(result, /\s+not:/);
        });
      });
    });
  });

  // ─── when も not も空のエントリ ──────────────────────────────────────────

  describe('Given: when も not も空のエントリ', () => {
    describe('When: formatEntryWithRules を呼び出す', () => {
      describe('Then: T-SF-FE-03 - "- key: def" のみになる', () => {
        const entry = _makeEntry('writing', '文書作成', [], []);

        it('T-SF-FE-03-01: "- writing: 文書作成" のみ返る', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result, '- writing: 文書作成');
        });
      });
    });
  });

  // ─── when に複数値があるエントリ ─────────────────────────────────────────

  describe('Given: when に複数の値があるエントリ', () => {
    describe('When: formatEntryWithRules を呼び出す', () => {
      describe('Then: T-SF-FE-04 - when の値が " / " で区切られる', () => {
        const entry = _makeEntry('discussion', '議論・相談', ['設計議論', '方針議論'], []);

        it('T-SF-FE-04-01: when の値が "設計議論 / 方針議論" で展開される', () => {
          const result = formatEntryWithRules(entry);

          assertEquals(result.includes('設計議論 / 方針議論'), true);
        });
      });
    });
  });
});

// ─── formatEntryShort のテスト ────────────────────────────────────────────────

describe('formatEntryShort', () => {
  describe('Given: when と not 両方があるエントリ', () => {
    describe('When: formatEntryShort を呼び出す', () => {
      describe('Then: T-SF-FE-05 - rules を無視して "- key: def" のみ返る', () => {
        const entry = _makeEntry('research', '調査・情報収集', ['技術調査'], ['実装作業']);

        it('T-SF-FE-05-01: "- research: 調査・情報収集" だけが返る', () => {
          const result = formatEntryShort(entry);

          assertEquals(result, '- research: 調査・情報収集');
        });

        it('T-SF-FE-05-02: "when:" 行が含まれない', () => {
          const result = formatEntryShort(entry);

          assertNotMatch(result, /when:/);
        });

        it('T-SF-FE-05-03: "not:" 行が含まれない', () => {
          const result = formatEntryShort(entry);

          assertNotMatch(result, /not:/);
        });
      });
    });
  });

  describe('Given: rules が空のエントリ', () => {
    describe('When: formatEntryShort を呼び出す', () => {
      describe('Then: T-SF-FE-06 - "- key: def" が返る', () => {
        const entry = _makeEntry('writing', '文書作成', [], []);

        it('T-SF-FE-06-01: "- writing: 文書作成" が返る', () => {
          const result = formatEntryShort(entry);

          assertEquals(result, '- writing: 文書作成');
        });
      });
    });
  });
});
