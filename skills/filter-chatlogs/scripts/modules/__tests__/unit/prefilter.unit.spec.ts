// src: scripts/modules/__tests__/unit/prefilter.unit.spec.ts
// @(#): prefilter.ts のユニットテスト
//       対象: isSystemOnlyMessage / isExcludedByFilename / isExcludedByContent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isExcludedByContent, isExcludedByFilename, isSystemOnlyMessage } from '../../prefilter.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../../../_cle-libs/constants/config-schema.constants.ts';

// ─── Internal Helpers

// functions
function _makeBody(options: { userText?: string; assistantText?: string; extraPadding?: number }): string {
  const userText = options.userText ?? '質問内容です';
  const assistantText = options.assistantText ?? 'アシスタントの回答です';
  const padding = 'x'.repeat(options.extraPadding ?? 0);

  return `### User\n${userText}${padding}\n\n### Assistant\n${assistantText}\n`;
}

// ─── Tests

/**
 * `isSystemOnlyMessage` のユニットテストスイート。
 *
 * SYSTEM_TAG_PREFIXES に含まれるプレフィックスで始まるテキストを検出することを検証する。
 * trim後のマッチ・不一致ケース・境界値を網羅する。
 *
 * テスト ID 範囲: T-PF-IS-01 〜 T-PF-IS-04
 *
 * @see isSystemOnlyMessage
 */
describe('isSystemOnlyMessage', () => {
  /** SYSTEM_TAG_PREFIXES の各プレフィックスで始まるテキストが true を返すケース。 */
  describe('When: 正常系（true を返す）', () => {
    it('[Normal] T-PF-IS-01-01: `<system-reminder>msg</system-reminder>` → true', () => {
      assert(isSystemOnlyMessage('<system-reminder>msg</system-reminder>'));
    });

    it('[Normal] T-PF-IS-01-02: `<command-name>cmd</command-name>` → true', () => {
      assert(isSystemOnlyMessage('<command-name>cmd</command-name>'));
    });

    it('[Normal] T-PF-IS-01-03: `<command-message>msg</command-message>` → true', () => {
      assert(isSystemOnlyMessage('<command-message>msg</command-message>'));
    });

    it('[Normal] T-PF-IS-01-04: `<local-command-stdout>out</local-command-stdout>` → true', () => {
      assert(isSystemOnlyMessage('<local-command-stdout>out</local-command-stdout>'));
    });

    it('[Normal] T-PF-IS-01-05: `<ide_opened_file>file.ts</ide_opened_file>` → true', () => {
      assert(isSystemOnlyMessage('<ide_opened_file>file.ts</ide_opened_file>'));
    });

    it('[Normal] T-PF-IS-01-06: `<ide_selection>selected</ide_selection>` → true', () => {
      assert(isSystemOnlyMessage('<ide_selection>selected</ide_selection>'));
    });

    it('[Normal] T-PF-IS-01-07: `---\\ntitle: test\\n---\\n` → true', () => {
      assert(isSystemOnlyMessage('---\ntitle: test\n---\n'));
    });
  });

  /** 通常テキスト・空文字列・スラッシュコマンドが false を返すケース。 */
  describe('When: 正常系（false を返す）', () => {
    it('[Normal] T-PF-IS-02-01: `これは通常のメッセージです` → false', () => {
      assertFalse(isSystemOnlyMessage('これは通常のメッセージです'));
    });

    it("[Normal] T-PF-IS-02-02: `''`（空文字列）→ false", () => {
      assertFalse(isSystemOnlyMessage(''));
    });

    it('[Normal] T-PF-IS-02-03: `/commit`（スラッシュコマンド）→ false', () => {
      assertFalse(isSystemOnlyMessage('/commit'));
    });
  });

  /** trim 後にプレフィックスがマッチする・しないケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-IS-03-01: `  <system-reminder>msg</system-reminder>`（先頭空白）→ true（trim後マッチ）', () => {
      assert(isSystemOnlyMessage('  <system-reminder>msg</system-reminder>'));
    });

    it('[Edge] T-PF-IS-03-02: `\\n<command-name>cmd</command-name>`（先頭改行）→ true（trim後マッチ）', () => {
      assert(isSystemOnlyMessage('\n<command-name>cmd</command-name>'));
    });

    it('[Edge] T-PF-IS-03-03: `---`（改行なし）→ false（`---\\n` とは一致しない）', () => {
      assertFalse(isSystemOnlyMessage('---'));
    });
  });

  /** プレフィックスが先頭でなく中間に出現するケース・類似タグだが一致しないケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-IS-04-01: `普通のテキスト\\n<system-reminder>msg</system-reminder>`（中間に出現）→ false', () => {
      assertFalse(isSystemOnlyMessage('普通のテキスト\n<system-reminder>msg</system-reminder>'));
    });

    it('[Error] T-PF-IS-04-02: `<system-info>info</system-info>`（類似するが一致しないタグ）→ false', () => {
      assertFalse(isSystemOnlyMessage('<system-info>info</system-info>'));
    });
  });
});

describe('isExcludedByFilename', () => {
  // ─── T-FL-IF-01: 除外パターン一致 → true ─────────────────────────────────────

  describe('Given: 除外パターンに一致するファイル名', () => {
    describe('When: isExcludedByFilename(filename) を呼び出す', () => {
      describe('Then: T-FL-IF-01 - true が返される', () => {
        it('T-FL-IF-01-01: you-are-a-topic-and-tag-extraction-assistant を含む → true', () => {
          const result = isExcludedByFilename('you-are-a-topic-and-tag-extraction-assistant.md');

          assert(result);
        });

        it('T-FL-IF-01-02: say-ok-and-nothing-else を含む → true', () => {
          const result = isExcludedByFilename('say-ok-and-nothing-else.md');

          assert(result);
        });

        it('T-FL-IF-01-03: command-message-claude-idd-framework を含む → true', () => {
          const result = isExcludedByFilename('command-message-claude-idd-framework.md');

          assert(result);
        });

        it('T-FL-IF-01-04: command-message-deckrd-deckrd を含む → true', () => {
          const result = isExcludedByFilename('command-message-deckrd-deckrd.md');

          assert(result);
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

          assertFalse(result);
        });

        it('T-FL-IF-02-02: 空文字列 → false', () => {
          const result = isExcludedByFilename('');

          assertFalse(result);
        });

        it('T-FL-IF-02-03: 無関係なファイル名 → false', () => {
          const result = isExcludedByFilename('architecture-discussion-2026.md');

          assertFalse(result);
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

          assert(result);
        });

        it('T-FL-IF-03-02: 全大文字の除外パターン → true', () => {
          const result = isExcludedByFilename('SAY-OK-AND-NOTHING-ELSE.md');

          assert(result);
        });
      });
    });
  });
});

describe('isExcludedByContent', () => {
  // ─── T-FL-IC-01: 本文が短すぎる → excluded=true ─────────────────────────────

  describe('Given: 本文が minCharCount より短いテキスト', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-01 - excluded=true が返される', () => {
        it('T-FL-IC-01-01: excluded が true になる', () => {
          const body = '短い本文';
          const { excluded } = isExcludedByContent(body);

          assert(excluded);
        });

        it('T-FL-IC-01-02: reason に "短すぎる" が含まれる', () => {
          const body = '短い本文';
          const { reason } = isExcludedByContent(body);

          assert(reason.includes('短すぎる'));
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

          assert(excluded);
        });

        it('T-FL-IC-02-02: reason に "User" が含まれる', () => {
          const body = '### Assistant\n' + 'a'.repeat(1000) + '\n';
          const { reason } = isExcludedByContent(body);

          assert(reason.includes('User'));
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

          assert(excluded);
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

          assert(excluded);
        });

        it('T-FL-IC-04-02: reason に "短すぎる" が含まれる', () => {
          const userText = 'u'.repeat(900);
          const assistantText = '短い';
          const body = `### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
          const { reason } = isExcludedByContent(body);

          assert(reason.includes('短すぎる'));
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

          assertFalse(excluded);
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

          assertFalse(excluded);
        });
      });
    });
  });

  // ─── T-FL-IC-06: User ターン複数件 → 1ターン限定チェックが免除される ─────────

  describe('Given: User ターンが複数件で Assistant 応答が短いエントリ', () => {
    describe('When: isExcludedByContent(body) を呼び出す', () => {
      describe('Then: T-FL-IC-06 - 1ターン限定チェックが免除され excluded=false が返される', () => {
        it('[Edge] T-FL-IC-06-01: 複数Userターン + Assistant短文 → excluded=false', () => {
          const body = [
            '### User',
            'u'.repeat(300),
            '',
            '### Assistant',
            'a'.repeat(300),
            '',
            '### User',
            'u'.repeat(400),
            '',
            '### Assistant',
            '短い',
          ].join('\n');
          const { excluded } = isExcludedByContent(body);

          assertFalse(excluded);
        });
      });
    });
  });

  // ─── T-FL-IC-07: minCharCount のちょうど境界値 → excluded=false ──────────────

  describe('Given: 本文の長さがちょうど minCharCount と一致するテキスト', () => {
    describe('When: isExcludedByContent(body, minCharCount) を呼び出す', () => {
      describe('Then: T-FL-IC-07 - 境界値では除外されず excluded=false が返される', () => {
        it('[Edge] T-FL-IC-07-01: body.length === minCharCount → excluded=false', () => {
          const userText = 'u'.repeat(500);
          const assistantText = 'a'.repeat(400);
          const unpadded = `### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
          const minCharCount = DEFAULT_CONFIG_VALUES.minCharCount as number;
          const padding = 'x'.repeat(minCharCount - unpadded.length);
          const body = `### User\n${userText}${padding}\n\n### Assistant\n${assistantText}\n`;

          assertEquals(body.length, minCharCount);
          const { excluded } = isExcludedByContent(body, minCharCount);

          assertFalse(excluded);
        });
      });
    });
  });
});
