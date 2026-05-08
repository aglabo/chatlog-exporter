// src: scripts/__tests__/unit/filter-chatlog.unit.spec.ts
// @(#): filter-chatlog.ts のユニットテスト
//       parseArgs / parseFrontmatterEntries / parseConversation / parseJsonArray /
//       extractBodyText / isExcludedByFilename / isExcludedByContent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../filter-chatlog.ts';
// functions
import { extractBodyText, isExcludedByContent, isExcludedByFilename } from '../../libs/prefilter.ts';
// types
import type { ClaudeResult } from '../../types/filter.types.ts';
import type { ParsedConfig } from '../../types/filter.types.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { parseFrontmatterEntries } from '../../../../_scripts/libs/text/frontmatter-utils.ts';
import { parseJsonArray } from '../../../../_scripts/libs/text/json-utils.ts';
import { parseConversation } from '../../../../_scripts/libs/text/markdown-utils.ts';

// ─── Internal Helpers

// types
type Args = ParsedConfig;

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  // ─── T-FL-PA-01: デフォルト値 ───────────────────────────────────────────────

  describe('Given: 引数なしの空配列', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-FL-PA-01 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-01-01', field: 'agent', expected: undefined },
          { id: 'T-FL-PA-01-02', field: 'dryRun', expected: undefined },
          { id: 'T-FL-PA-01-03', field: 'inputDir', expected: undefined },
          { id: 'T-FL-PA-01-04', field: 'period', expected: undefined },
          { id: 'T-FL-PA-01-05', field: 'chatlogsDir', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([])[field], expected);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-02〜07: 単一オプション ──────────────────────────────────────────

  describe('Given: 単一オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-02-01', args: ['chatgpt'], field: 'agent', expected: 'chatgpt' },
          { id: 'T-FL-PA-03-01', args: ['2026-03'], field: 'period', expected: '2026-03' },
          { id: 'T-FL-PA-05-01', args: ['--dry-run'], field: 'dryRun', expected: true },
          { id: 'T-FL-PA-06-01', args: ['--input', '/path/to/input'], field: 'inputDir', expected: '/path/to/input' },
          { id: 'T-FL-PA-07-01', args: ['--input=/path/to/input'], field: 'inputDir', expected: '/path/to/input' },
        ];
        for (const { id, args, field, expected } of _cases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(args)[field], expected);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-08: 複数オプション組み合わせ ────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --input ./in を渡す', () => {
    it('T-FL-PA-08-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(['claude', '2026-03', '--dry-run', '--input', './in']);
      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
      assertEquals(result.dryRun, true);
      assertEquals(result.inputDir, './in');
    });
  });

  // ─── T-FL-PA-09: 異常系 ───────────────────────────────────────────────────────

  describe('Given: 不正な引数', () => {
    it('T-FL-PA-09-01: 未知オプション → ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['--unknown']),
        ChatlogError,
        'Invalid Args',
      );
    });
  });

  // ─── T-FL-PA-10: --config オプション ─────────────────────────────────────────

  describe('Given: --config オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: configFile フィールドに値が設定される', () => {
        it('T-FL-PA-10-01: --config cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config', 'cfg.yaml']).configFile, 'cfg.yaml');
        });

        it('T-FL-PA-10-02: --config=cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config=cfg.yaml']).configFile, 'cfg.yaml');
        });
      });
    });
  });

  // ─── T-FL-PA-11: --chatlogs-dir オプション ───────────────────────────────────

  describe('Given: --chatlogs-dir オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir フィールドに値が設定される', () => {
        it('T-FL-PA-11-01: --chatlogs-dir /base → chatlogsDir が "/base" になる', () => {
          assertEquals(parseArgs(['--chatlogs-dir', '/base']).chatlogsDir, '/base');
        });

        it('T-FL-PA-11-02: --chatlogs-dir=/base → chatlogsDir が "/base" になる', () => {
          assertEquals(parseArgs(['--chatlogs-dir=/base']).chatlogsDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-12: --chatlogs-dir と --input の組み合わせ ──────────────────────

  describe('Given: --chatlogs-dir と --input の両方が渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 両フィールドに別々の値が設定される', () => {
        it('T-FL-PA-12-01: --chatlogs-dir と --input が同時指定できる', () => {
          const result = parseArgs(['--chatlogs-dir', '/base', '--input', '/custom']);
          assertEquals(result.chatlogsDir, '/base');
          assertEquals(result.inputDir, '/custom');
        });
      });
    });
  });

  // ─── T-FL-PA-13: 全オプション組み合わせ ─────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --chatlogs-dir /base を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 全フィールドが正しく解析される', () => {
        it('T-FL-PA-13-01: 全フィールドが正しく解析される', () => {
          const result = parseArgs(['claude', '2026-03', '--dry-run', '--chatlogs-dir', '/base']);
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
          assertEquals(result.dryRun, true);
          assertEquals(result.chatlogsDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-14: --chatlogs-dir バリデーション ───────────────────────────────

  /**
   * `--chatlogs-dir` にディレクトリパスでない値を渡した場合の異常系グループ。
   *
   * ディレクトリパス（`/` を含む正規化済みパス）でない値は `ChatlogError(InvalidArgs)` をスローする。
   */
  describe('Given: --chatlogs-dir にディレクトリパスでない値を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-FL-PA-14-01: --chatlogs-dir foo（スラッシュなし）→ ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => parseArgs(['--chatlogs-dir', 'foo']),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-FL-PA-15: --chatlogs-dir 未指定時の inputDir フォールバック ────────────

  /**
   * `--chatlogs-dir` 未指定・`--input` 指定のとき `chatlogsDir` に `inputDir` の値が入ることを検証するグループ。
   */
  describe('Given: --chatlogs-dir が未指定で --input が指定されている', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir が inputDir の値になる', () => {
        it('T-FL-PA-15-01: --input /path/to → chatlogsDir が "/path/to" になる', () => {
          assertEquals(parseArgs(['--input', '/path/to']).chatlogsDir, '/path/to');
        });
      });
    });
  });

  // ─── T-FL-PA-16: --chatlogs-dir と --input 両方未指定 ─────────────────────────

  /**
   * `--chatlogs-dir` も `--input` も未指定のとき `chatlogsDir` が `undefined` になることを検証するグループ。
   */
  describe('Given: --chatlogs-dir も --input も未指定', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir が undefined になる', () => {
        it('T-FL-PA-16-01: 引数なし → chatlogsDir が undefined になる', () => {
          assertEquals(parseArgs([]).chatlogsDir, undefined);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseFrontmatterEntries
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// parseConversation
// ─────────────────────────────────────────────────────────────────────────────

describe('parseConversation', () => {
  // ─── T-FL-PC-01: User/Assistant ターン 1 件ずつ ────────────────────────────────

  describe('Given: User と Assistant のターンが 1 件ずつあるテキスト', () => {
    describe('When: parseConversation(body) を呼び出す', () => {
      describe('Then: T-FL-PC-01 - 2 件のターンが返される', () => {
        const body = '### User\nユーザーの質問\n\n### Assistant\nアシスタントの回答\n';

        it('T-FL-PC-01-01: ターン数が 2 になる', () => {
          const turns = parseConversation(body);

          assertEquals(turns.length, 2);
        });

        it('T-FL-PC-01-02: 最初のターンの role が "user" になる', () => {
          const turns = parseConversation(body);

          assertEquals(turns[0].role, 'user');
        });

        it('T-FL-PC-01-03: 2 番目のターンの role が "assistant" になる', () => {
          const turns = parseConversation(body);

          assertEquals(turns[1].role, 'assistant');
        });

        it('T-FL-PC-01-04: User ターンのテキストが正しく抽出される', () => {
          const turns = parseConversation(body);

          assertEquals(turns[0].text, 'ユーザーの質問');
        });
      });
    });
  });

  // ─── T-FL-PC-02: 複数ターン ────────────────────────────────────────────────

  describe('Given: 3 ターンある本文', () => {
    describe('When: parseConversation(body) を呼び出す', () => {
      describe('Then: T-FL-PC-02 - 3 件のターンが返される', () => {
        const body = ['### User', '質問1', '', '### Assistant', '回答1', '', '### User', '質問2'].join('\n');

        it('T-FL-PC-02-01: ターン数が 3 になる', () => {
          const turns = parseConversation(body);

          assertEquals(turns.length, 3);
        });

        it('T-FL-PC-02-02: 3 番目のターンの role が "user" になる', () => {
          const turns = parseConversation(body);

          assertEquals(turns[2].role, 'user');
        });
      });
    });
  });

  // ─── T-FL-PC-03: ターンなし → 空配列 ──────────────────────────────────────

  describe('Given: ターンヘッダーがないテキスト', () => {
    describe('When: parseConversation(body) を呼び出す', () => {
      describe('Then: T-FL-PC-03 - 空配列が返される', () => {
        it('T-FL-PC-03-01: 空配列が返される', () => {
          const body = 'ヘッダーのない本文テキスト';
          const turns = parseConversation(body);

          assertEquals(turns.length, 0);
        });
      });
    });
  });

  // ─── T-FL-PC-04: テキストなしターン → 除外 ────────────────────────────────

  describe('Given: テキストのないターンヘッダー', () => {
    describe('When: parseConversation(body) を呼び出す', () => {
      describe('Then: T-FL-PC-04 - 空テキストのターンは除外される', () => {
        it('T-FL-PC-04-01: テキストなしのターンは含まれない', () => {
          const body = '### User\n\n### Assistant\n回答あり\n';
          const turns = parseConversation(body);

          assertEquals(turns.length, 1);
          assertEquals(turns[0].role, 'assistant');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseJsonArray
// ─────────────────────────────────────────────────────────────────────────────

describe('parseJsonArray', () => {
  // ─── T-FL-PJ-01: 純粋な JSON 配列文字列 → パース成功 ─────────────────────────

  describe('Given: 純粋な JSON 配列文字列', () => {
    describe('When: parseJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-01 - 配列が返される', () => {
        it('T-FL-PJ-01-01: 有効な JSON 配列 → null でない', () => {
          const raw = JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'good' }]);
          const result = parseJsonArray(raw);

          assertNotEquals(result, null);
        });

        it('T-FL-PJ-01-02: 配列の最初の要素の file が "a.md" になる', () => {
          const raw = JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'good' }]);
          const result = parseJsonArray<ClaudeResult>(raw);

          assertEquals(result![0].file, 'a.md');
        });

        it('T-FL-PJ-01-03: decision が "KEEP" になる', () => {
          const raw = JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'good' }]);
          const result = parseJsonArray<ClaudeResult>(raw);

          assertEquals(result![0].decision, 'KEEP');
        });

        it('T-FL-PJ-01-04: 複数件の配列が正しくパースされる', () => {
          const raw = JSON.stringify([
            { file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'good' },
            { file: 'b.md', decision: 'DISCARD', confidence: 0.8, reason: 'bad' },
          ]);
          const result = parseJsonArray(raw);

          assertEquals(result!.length, 2);
        });
      });
    });
  });

  // ─── T-FL-PJ-02: テキスト中に [...] 埋め込み → フォールバック成功 ─────────

  describe('Given: テキスト中に JSON 配列が埋め込まれた文字列', () => {
    describe('When: parseJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-02 - フォールバックで配列が返される', () => {
        it('T-FL-PJ-02-01: 前置テキスト + JSON 配列 → null でない', () => {
          const arr = [{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'ok' }];
          const raw = `前置テキスト\n${JSON.stringify(arr)}\n後置テキスト`;
          const result = parseJsonArray(raw);

          assertNotEquals(result, null);
        });

        it('T-FL-PJ-02-02: マークダウンコードブロック内の JSON → null でない', () => {
          const arr = [{ file: 'b.md', decision: 'DISCARD', confidence: 0.8, reason: 'no' }];
          const raw = `\`\`\`json\n${JSON.stringify(arr)}\n\`\`\``;
          const result = parseJsonArray(raw);

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-FL-PJ-03: 貪欲マッチのみで成功するケース ─────────────────────────────

  describe('Given: 非貪欲マッチでは失敗するが貪欲マッチで成功するテキスト', () => {
    describe('When: parseJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-03 - 貪欲マッチで配列が返される', () => {
        it('T-FL-PJ-03-01: ネストした配列を含む文字列 → null でない', () => {
          const arr = [{ file: 'c.md', decision: 'KEEP', confidence: 0.7, reason: 'nested [x]' }];
          const raw = `some text ${JSON.stringify(arr)} more text`;
          const result = parseJsonArray(raw);

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-FL-PJ-04: JSON でないテキスト → null ─────────────────────────────────

  describe('Given: JSON として解析できないテキスト', () => {
    describe('When: parseJsonArray(raw) を呼び出す', () => {
      describe('Then: T-FL-PJ-04 - null が返される', () => {
        it('T-FL-PJ-04-01: 完全に無効なテキスト → null', () => {
          const result = parseJsonArray('これはJSONではありません');

          assertEquals(result, null);
        });

        it('T-FL-PJ-04-02: 空文字列 → null', () => {
          const result = parseJsonArray('');

          assertEquals(result, null);
        });

        it('T-FL-PJ-04-03: 空の配列 → null（length=0 の場合は null 扱い）', () => {
          const result = parseJsonArray('[]');

          assertEquals(result, null);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractBodyText
// ─────────────────────────────────────────────────────────────────────────────

describe('extractBodyText', () => {
  // ─── T-FL-EB-01: 通常会話 → User/Assistant フォーマット ──────────────────────

  describe('Given: User と Assistant ターンを含む本文', () => {
    describe('When: extractBodyText(body) を呼び出す', () => {
      describe('Then: T-FL-EB-01 - ### User / ### Assistant フォーマットで返される', () => {
        const body = '### User\nユーザーの質問\n\n### Assistant\nアシスタントの回答\n';

        it('T-FL-EB-01-01: "### User" を含む', () => {
          const result = extractBodyText(body);

          assertStringIncludes(result, '### User');
        });

        it('T-FL-EB-01-02: "### Assistant" を含む', () => {
          const result = extractBodyText(body);

          assertStringIncludes(result, '### Assistant');
        });

        it('T-FL-EB-01-03: ユーザーのテキストが含まれる', () => {
          const result = extractBodyText(body);

          assertStringIncludes(result, 'ユーザーの質問');
        });
      });
    });
  });

  // ─── T-FL-EB-02: maxChars 切り詰め ──────────────────────────────────────────

  describe('Given: maxChars より長い本文', () => {
    describe('When: extractBodyText(body, maxChars) を呼び出す', () => {
      describe('Then: T-FL-EB-02 - maxChars 文字以内に切り詰められる', () => {
        it('T-FL-EB-02-01: 結果の長さが maxChars 以下になる', () => {
          const longText = 'x'.repeat(500);
          const body = `### User\n${longText}\n`;
          const maxChars = 100;
          const result = extractBodyText(body, maxChars);

          assertEquals(result.length <= maxChars, true);
        });

        it('T-FL-EB-02-02: maxChars=10 でも結果が返される', () => {
          const body = '### User\n質問テキスト\n\n### Assistant\n回答テキスト\n';
          const result = extractBodyText(body, 10);

          assertEquals(result.length <= 10, true);
        });
      });
    });
  });

  // ─── T-FL-EB-03: ターンなし → 空文字列 ─────────────────────────────────────

  describe('Given: ターンヘッダーがない本文', () => {
    describe('When: extractBodyText(body) を呼び出す', () => {
      describe('Then: T-FL-EB-03 - 空文字列が返される', () => {
        it('T-FL-EB-03-01: ターンなし → 空文字列', () => {
          const body = 'ヘッダーのない本文テキスト';
          const result = extractBodyText(body);

          assertEquals(result, '');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isExcludedByFilename
// ─────────────────────────────────────────────────────────────────────────────

describe('isExcludedByFilename', () => {
  // ─── T-FL-IF-01: 除外パターン一致 → true ─────────────────────────────────────

  describe('Given: 除外パターンに一致するファイル名', () => {
    describe('When: isExcludedByFilename(filename) を呼び出す', () => {
      describe('Then: T-FL-IF-01 - true が返される', () => {
        it('T-FL-IF-01-01: you-are-a-topic-and-tag-extraction-assistant を含む → true', () => {
          const result = isExcludedByFilename('you-are-a-topic-and-tag-extraction-assistant.md');

          assertEquals(result, true);
        });

        it('T-FL-IF-01-02: say-ok-and-nothing-else を含む → true', () => {
          const result = isExcludedByFilename('say-ok-and-nothing-else.md');

          assertEquals(result, true);
        });

        it('T-FL-IF-01-03: command-message-claude-idd-framework を含む → true', () => {
          const result = isExcludedByFilename('command-message-claude-idd-framework.md');

          assertEquals(result, true);
        });

        it('T-FL-IF-01-04: command-message-deckrd-deckrd を含む → true', () => {
          const result = isExcludedByFilename('command-message-deckrd-deckrd.md');

          assertEquals(result, true);
        });
      });
    });
  });

  // ─── T-FL-IF-02: 一致しない → false ─────────────────────────────────────────

  describe('Given: 除外パターンに一致しない通常のファイル名', () => {
    describe('When: isExcludedByFilename(filename) を呼び出す', () => {
      describe('Then: T-FL-IF-02 - false が返される', () => {
        it('T-FL-IF-02-01: 通常のファイル名 → false', () => {
          const result = isExcludedByFilename('my-chat-log.md');

          assertEquals(result, false);
        });

        it('T-FL-IF-02-02: 空文字列 → false', () => {
          const result = isExcludedByFilename('');

          assertEquals(result, false);
        });

        it('T-FL-IF-02-03: 無関係なファイル名 → false', () => {
          const result = isExcludedByFilename('architecture-discussion-2026.md');

          assertEquals(result, false);
        });
      });
    });
  });

  // ─── T-FL-IF-03: 大文字小文字の差異（toLowerCase） ──────────────────────────

  describe('Given: 大文字を含む除外パターンのファイル名', () => {
    describe('When: isExcludedByFilename(filename) を呼び出す', () => {
      describe('Then: T-FL-IF-03 - 大文字小文字を区別せず true が返される', () => {
        it('T-FL-IF-03-01: 大文字含む除外パターン → true', () => {
          const result = isExcludedByFilename('Say-Ok-And-Nothing-Else.md');

          assertEquals(result, true);
        });

        it('T-FL-IF-03-02: 全大文字の除外パターン → true', () => {
          const result = isExcludedByFilename('SAY-OK-AND-NOTHING-ELSE.md');

          assertEquals(result, true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isExcludedByContent
// ─────────────────────────────────────────────────────────────────────────────

describe('isExcludedByContent', () => {
  // ─── 正常な会話テキスト生成ヘルパー ──────────────────────────────────────────

  function _makeBody(options: { userText?: string; assistantText?: string; extraPadding?: number }): string {
    const userText = options.userText ?? '質問内容です';
    const assistantText = options.assistantText ?? 'アシスタントの回答です';
    const padding = 'x'.repeat(options.extraPadding ?? 0);

    return `### User\n${userText}${padding}\n\n### Assistant\n${assistantText}\n`;
  }

  // ─── T-FL-IC-01: 本文が短すぎる → excluded=true ─────────────────────────────

  describe('Given: 本文が minCharCount より短いテキスト', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-01 - excluded=true が返される', () => {
        it('T-FL-IC-01-01: excluded が true になる', () => {
          const body = '短い本文';
          const { excluded } = isExcludedByContent(body);

          assertEquals(excluded, true);
        });

        it('T-FL-IC-01-02: reason に "短すぎる" が含まれる', () => {
          const body = '短い本文';
          const { reason } = isExcludedByContent(body);

          assertEquals(reason.includes('短すぎる'), true);
        });
      });
    });
  });

  // ─── T-FL-IC-02: User ターンなし → excluded=true ────────────────────────────

  describe('Given: User ターンが存在しない本文', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-02 - excluded=true が返される', () => {
        it('T-FL-IC-02-01: excluded が true になる', () => {
          const body = '### Assistant\n' + 'a'.repeat(1000) + '\n';
          const { excluded } = isExcludedByContent(body);

          assertEquals(excluded, true);
        });

        it('T-FL-IC-02-02: reason に "User" が含まれる', () => {
          const body = '### Assistant\n' + 'a'.repeat(1000) + '\n';
          const { reason } = isExcludedByContent(body);

          assertEquals(reason.includes('User'), true);
        });
      });
    });
  });

  // ─── T-FL-IC-03: User 1 件でシステムタグのみ → excluded=true ─────────────────

  describe('Given: User メッセージがシステムタグのみ', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-03 - excluded=true が返される', () => {
        it('T-FL-IC-03-01: <system-reminder で始まる User メッセージ → excluded=true', () => {
          const body = [
            '### User',
            '<system-reminder>システムメッセージ</system-reminder>',
            '',
            '### Assistant',
            'a'.repeat(500),
          ].join('\n');
          const paddedBody = body + 'x'.repeat(Math.max(0, 1000 - body.length));
          const { excluded } = isExcludedByContent(paddedBody);

          assertEquals(excluded, true);
        });
      });
    });
  });

  // ─── T-FL-IC-04: User 1 件で Assistant が短い → excluded=true ─────────────────

  describe('Given: User 1 ターンで Assistant の応答が短すぎる', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-04 - excluded=true が返される', () => {
        it('T-FL-IC-04-01: Assistant が minAssistantChars より短い → excluded=true', () => {
          const userText = 'u'.repeat(900);
          const assistantText = '短い';
          const body = `### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
          const { excluded } = isExcludedByContent(body);

          assertEquals(excluded, true);
        });

        it('T-FL-IC-04-02: reason に "短すぎる" が含まれる', () => {
          const userText = 'u'.repeat(900);
          const assistantText = '短い';
          const body = `### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
          const { reason } = isExcludedByContent(body);

          assertEquals(reason.includes('短すぎる'), true);
        });
      });
    });
  });

  // ─── T-FL-IC-05: 正常な会話 → excluded=false ─────────────────────────────────

  describe('Given: 十分な長さの正常な会話テキスト', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-05 - excluded=false が返される', () => {
        it('T-FL-IC-05-01: 正常な会話 → excluded=false', () => {
          const body = _makeBody({ userText: 'u'.repeat(500), assistantText: 'a'.repeat(500), extraPadding: 200 });
          const { excluded } = isExcludedByContent(body);

          assertEquals(excluded, false);
        });

        it('T-FL-IC-05-02: 複数ターンの会話 → excluded=false', () => {
          const body = [
            '### User',
            'u'.repeat(300),
            '',
            '### Assistant',
            'a'.repeat(300),
            '',
            '### User',
            'u'.repeat(300),
            '',
            '### Assistant',
            'a'.repeat(300),
          ].join('\n');
          const { excluded } = isExcludedByContent(body);

          assertEquals(excluded, false);
        });
      });
    });
  });
});
