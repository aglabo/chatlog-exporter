// src: scripts/libs/__tests__/unit/text-utils.unit.spec.ts
// @(#): _cle-libs テキストユーティリティのユニットテスト
//       対象: parseFrontmatterEntries / parseAiJsonArray
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../../_cle-libs/__tests__/helpers/assert.ts';

// ─── Helpers
// functions
import { parseFrontmatterEntries } from '../../../../../_cle-libs/libs/text/frontmatter-utils.ts';
import { parseAiJsonArray } from '../../../../../_cle-libs/libs/text/json-utils.ts';
// types
import type { ClaudeResult } from '../../../types/filter.types.ts';
// constants
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';

// ─── Tests

describe('parseFrontmatterEntries', () => {
  // ─── T-FL-PF-01: frontmatter あり → body 分離 ─────────────────────────────────

  describe('Given: frontmatter 付きのテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-FL-PF-01 - body が frontmatter 以降になる', () => {
        it('T-FL-PF-01-01: body が frontmatter の後の部分になる', () => {
          const text = '---\ntitle: テスト\n---\n本文です\n';
          const { content } = parseFrontmatterEntries(text);

          assertEquals(content, '本文です\n');
        });

        it('T-FL-PF-01-02: meta が空オブジェクトを返す', () => {
          const text = '---\ntitle: テスト\n---\n本文';
          const { meta } = parseFrontmatterEntries(text);

          assertEquals(typeof meta, 'object');
        });
      });
    });
  });

  // ─── T-FL-PF-02: frontmatter なし → body=全文 ──────────────────────────────

  describe('Given: frontmatter なしのテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-FL-PF-02 - body が全文になる', () => {
        it('T-FL-PF-02-01: body が入力テキスト全体になる', () => {
          const text = '本文のみです\n追加テキスト';
          const { content } = parseFrontmatterEntries(text);

          assertEquals(content, text);
        });
      });
    });
  });

  // ─── T-FL-PF-03: 閉じ区切りなし → body=全文 ────────────────────────────────

  describe('Given: 開始区切りはあるが閉じ区切りがないテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-FL-PF-03 - 閉じ区切りなし → body=全文', () => {
        it('T-FL-PF-03-01: body が入力テキスト全体になる', () => {
          const text = '---\ntitle: テスト\n本文（閉じ区切りなし）';
          const { content } = parseFrontmatterEntries(text);

          assertEquals(content, text);
        });
      });
    });
  });

  // ─── T-FL-PF-04: frontmatter のみ（body 空） ────────────────────────────────

  describe('Given: frontmatter のみで本文がないテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-FL-PF-04 - body が空文字列になる', () => {
        it('T-FL-PF-04-01: body が空文字列になる', () => {
          const text = '---\ntitle: テスト\n---\n';
          const { content } = parseFrontmatterEntries(text);

          assertEquals(content, '');
        });
      });
    });
  });
});

describe('parseAiJsonArray', () => {
  // ─── T-FL-PJ-01: 純粋な JSON 配列文字列 → パース成功 ─────────────────────────

  describe('Given: 純粋な JSON 配列文字列', () => {
    describe('When: parseAiJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-01 - 配列が返される', () => {
        it('T-FL-PJ-01-01: 有効な JSON 配列 → null でない', () => {
          const raw = JSON.stringify([{
            file: 'a.md',
            decision: FILTER_DECISIONS.KEEP,
            confidence: 0.9,
            reason: 'good',
          }]);
          const result = parseAiJsonArray(raw);

          assertNotNull(result);
        });

        it('T-FL-PJ-01-02: 配列の最初の要素の file が "a.md" になる', () => {
          const raw = JSON.stringify([{
            file: 'a.md',
            decision: FILTER_DECISIONS.KEEP,
            confidence: 0.9,
            reason: 'good',
          }]);
          const result = parseAiJsonArray<ClaudeResult>(raw);

          assertEquals(result![0].file, 'a.md');
        });

        it('T-FL-PJ-01-03: decision が "KEEP" になる', () => {
          const raw = JSON.stringify([{
            file: 'a.md',
            decision: FILTER_DECISIONS.KEEP,
            confidence: 0.9,
            reason: 'good',
          }]);
          const result = parseAiJsonArray<ClaudeResult>(raw);

          assertEquals(result![0].decision, FILTER_DECISIONS.KEEP);
        });

        it('T-FL-PJ-01-04: 複数件の配列が正しくパースされる', () => {
          const raw = JSON.stringify([
            { file: 'a.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'good' },
            { file: 'b.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.8, reason: 'bad' },
          ]);
          const result = parseAiJsonArray(raw);

          assertEquals(result!.length, 2);
        });
      });
    });
  });

  // ─── T-FL-PJ-02: テキスト中に [...] 埋め込み → フォールバック成功 ─────────

  describe('Given: テキスト中に JSON 配列が埋め込まれた文字列', () => {
    describe('When: parseAiJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-02 - フォールバックで配列が返される', () => {
        it('T-FL-PJ-02-01: 前置テキスト + JSON 配列 → null でない', () => {
          const arr = [{ file: 'a.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'ok' }];
          const raw = `前置テキスト\n${JSON.stringify(arr)}\n後置テキスト`;
          const result = parseAiJsonArray(raw);

          assertNotNull(result);
        });

        it('T-FL-PJ-02-02: マークダウンコードブロック内の JSON → null でない', () => {
          const arr = [{ file: 'b.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.8, reason: 'no' }];
          const raw = `\`\`\`json\n${JSON.stringify(arr)}\n\`\`\``;
          const result = parseAiJsonArray(raw);

          assertNotNull(result);
        });
      });
    });
  });

  // ─── T-FL-PJ-03: 貪欲マッチのみで成功するケース ─────────────────────────────

  describe('Given: 非貪欲マッチでは失敗するが貪欲マッチで成功するテキスト', () => {
    describe('When: parseAiJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-03 - 貪欲マッチで配列が返される', () => {
        it('T-FL-PJ-03-01: ネストした配列を含む文字列 → null でない', () => {
          const arr = [{ file: 'c.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.7, reason: 'nested [x]' }];
          const raw = `some text ${JSON.stringify(arr)} more text`;
          const result = parseAiJsonArray(raw);

          assertNotNull(result);
        });
      });
    });
  });

  // ─── T-FL-PJ-04: JSON でないテキスト → null ─────────────────────────────────

  describe('Given: JSON として解析できないテキスト', () => {
    describe('When: parseAiJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-04 - null が返される', () => {
        it('T-FL-PJ-04-01: 完全に無効なテキスト → null', () => {
          const result = parseAiJsonArray('これはJSONではありません');

          assertNull(result);
        });

        it('T-FL-PJ-04-02: 空文字列 → null', () => {
          const result = parseAiJsonArray('');

          assertNull(result);
        });

        it('T-FL-PJ-04-03: 空の配列 → null（length=0 の場合は null 扱い）', () => {
          const result = parseAiJsonArray('[]');

          assertNull(result);
        });
      });
    });
  });
});
