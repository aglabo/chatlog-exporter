// src: scripts/__tests__/unit/libs/classify-file.unit.spec.ts
// @(#): classify-file.ts のユニットテスト
//       対象: checkFilename / checkUserContent / checkConversationPattern / checkPromptContent / checkAssistantContent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';

// ─── Test target
import {
  checkAssistantContent,
  checkConversationPattern,
  checkFilename,
  checkPromptContent,
  checkUserContent,
  classifyConversation,
  readConversation,
} from '../../../libs/classify-file.ts';

// ─── Helpers
// constants
import { MIN_ASSISTANT_CHARS } from '../../../constants/common.constants.ts';
// types
import type { Turn } from '../../../../../_scripts/types/conversation.types.ts';

// ─── Tests

// ─────────────────────────────────────────────────────────────────────────────
// checkFilename
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkFilename` のユニットテストスイート。
 *
 * ファイル名パターン一致・不一致・大文字小文字無視・reason 文字列を検証する。
 *
 * テスト ID 範囲: T-PF-CF-01 〜 T-PF-CF-04
 *
 * @see checkFilename
 */
describe('checkFilename', () => {
  /** NOISE_FILENAME_PATTERNS に含まれるファイル名が正しく検出されるケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-CF-01-01: you-are-a-topic-and-tag-extraction-assistant.md → null でない', () => {
      const result = checkFilename('you-are-a-topic-and-tag-extraction-assistant.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-01-02: say-ok-and-nothing-else.md → null でない', () => {
      const result = checkFilename('say-ok-and-nothing-else.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-01-03: command-message-claude-idd-framework.md → null でない', () => {
      const result = checkFilename('command-message-claude-idd-framework.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-01-04: command-message-deckrd-deckrd.md → null でない', () => {
      const result = checkFilename('command-message-deckrd-deckrd.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-01-05: command-message-deckrd-coder.md → null でない', () => {
      const result = checkFilename('command-message-deckrd-coder.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-01-06: pr-temp-idd-pr-pr-current-draft-md-*.md → null でない', () => {
      const result = checkFilename('pr-temp-idd-pr-pr-current-draft-md-abc.md');

      assertNotNull(result);
    });

    it('[Normal] T-PF-CF-02-01: "my-chat-log.md" → null', () => {
      const result = checkFilename('my-chat-log.md');

      assertNull(result);
    });

    it('[Normal] T-PF-CF-02-02: 空文字列 "" → null', () => {
      const result = checkFilename('');

      assertNull(result);
    });
  });

  /** 大文字小文字を区別しない検証ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-CF-03-01: "Say-Ok-And-Nothing-Else.md" → null でない', () => {
      const result = checkFilename('Say-Ok-And-Nothing-Else.md');

      assertNotNull(result);
    });

    it('[Edge] T-PF-CF-03-02: "SAY-OK-AND-NOTHING-ELSE.md" → null でない', () => {
      const result = checkFilename('SAY-OK-AND-NOTHING-ELSE.md');

      assertNotNull(result);
    });

    it('[Edge] T-PF-CF-04-01: reason に "ファイル名パターン:" が含まれる', () => {
      const result = checkFilename('say-ok-and-nothing-else.md');

      assert(result!.includes('ファイル名パターン:'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUserContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkUserContent` のユニットテストスイート。
 *
 * User ターンなし・システムタグのみ・コマンドのみ・NOISE_USER_PATTERNS（スラッシュ/パス）・1ターン限定ルールを検証する。
 *
 * テスト ID 範囲: T-PF-UC-01 〜 T-PF-UC-08
 *
 * @see checkUserContent
 */
describe('checkUserContent', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; content: string }>): Turn[] {
    return turns;
  }

  /** User ターンが存在しないケース・全ターンがシステムタグ・コマンドのみのケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-UC-01-01: "Userターンが存在しない" を含む reason を返す', () => {
      const turns = _makeTurns([{ role: 'assistant', content: '回答' }]);
      const result = checkUserContent(turns);

      assertNotNull(result);
      assert(result!.includes('Userターンが存在しない'));
    });

    it('[Error] T-PF-UC-02-01: 単一 User ターンで <system-reminder> のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '<system-reminder>システムメッセージ</system-reminder>' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-02-02: 複数 User ターン全てが <system-reminder> → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '<system-reminder>msg1</system-reminder>' },
        { role: 'assistant', content: '回答' },
        { role: 'user', content: '<command-name>cmd</command-name>' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-03-01: 単一 User ターンで /commit のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '/commit' },
        { role: 'assistant', content: '了解しました' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-03-02: 複数 User ターン全てが /コマンド → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '/commit' },
        { role: 'assistant', content: '回答1' },
        { role: 'user', content: '/export-log' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-03-04: 単一 User ターンで /filter-chatlogs のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '/filter-chatlogs' },
        { role: 'assistant', content: '了解しました' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-06-01: "C:\\\\Users\\\\foo\\\\bar.md" → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'C:\\Users\\foo\\bar.md' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-UC-06-02: "docs/readme.md" → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'docs/readme.md' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotNull(result);
    });
  });

  /** 通常テキストや複数ターンで 1ターン限定ルールが適用されないケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-UC-08-01: 通常テキストの単一 User ターン → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'この機能の設計についてどう思いますか？' },
        { role: 'assistant', content: '良い設計だと思います。' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });

    it('[Normal] T-PF-UC-08-02: 複数の通常 User ターン → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問1' },
        { role: 'assistant', content: '回答1' },
        { role: 'user', content: '質問2' },
        { role: 'assistant', content: '回答2' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });
  });

  /** 複数 User ターン時に 1ターン限定ルールが無効化されるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-UC-02-03: 1ターン目はシステムタグ、2ターン目は通常テキスト → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '<system-reminder>msg</system-reminder>' },
        { role: 'assistant', content: '回答' },
        { role: 'user', content: '通常の質問テキスト' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-UC-03-03: 1ターン目は /コマンド、2ターン目は通常テキスト → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '/commit' },
        { role: 'assistant', content: '回答' },
        { role: 'user', content: '通常の質問テキスト' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-UC-05-01: 複数 User ターンでは prefix パターンが適用されず null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '=== GIT LOGS ===\ngit log --oneline' },
        { role: 'assistant', content: '回答1' },
        { role: 'user', content: '通常の質問' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-UC-07-01: 複数 User ターンでは exact パターンが適用されず null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'C:\\Users\\foo\\bar.md' },
        { role: 'assistant', content: '回答' },
        { role: 'user', content: '通常の質問' },
      ]);
      const result = checkUserContent(turns);

      assertNull(result);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkAssistantContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkAssistantContent` のユニットテストスイート。
 *
 * User=1ターン限定の Assistant 応答長チェック・パターンマッチ・複数 Assistant ターンの合計判定を検証する。
 *
 * テスト ID 範囲: T-PF-AC-01 〜 T-PF-AC-08
 *
 * @see checkAssistantContent
 */
describe('checkAssistantContent', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; content: string }>): Turn[] {
    return turns;
  }

  /** User=1 + Assistant の応答がノイズパターンに一致するケース。 */
  describe('When: パターンマッチ', () => {
    it('[Error] T-PF-AC-06-01: assistant="ok" → reason に "Assistant定型肯定応答のみ" が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'なんかやって' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
      assert(result!.includes('Assistant定型肯定応答のみ'));
    });

    it('[Error] T-PF-AC-06-02: assistant="了解" → reason に "Assistant定型肯定応答のみ" が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'なんかやって' },
        { role: 'assistant', content: '了解' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
      assert(result!.includes('Assistant定型肯定応答のみ'));
    });

    it('[Error] T-PF-AC-07-01: assistant=\'{"key":"value"}\' のみ → reason に "AssistantがJSONのみ返却" が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'JSONを返して' },
        { role: 'assistant', content: '{"key":"value"}' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
      assert(result!.includes('AssistantがJSONのみ返却'));
    });

    it('[Error] T-PF-AC-08-01: assistant="```typescript\\nconst x=1;\\n```" のみ → reason に "Assistantがコードブロックのみ" が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'コードを書いて' },
        { role: 'assistant', content: '```typescript\nconst x=1;\n```' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
      assert(result!.includes('Assistantがコードブロックのみ'));
    });
  });

  /** User=1 + Assistant 合計が MIN_ASSISTANT_CHARS 未満のケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-AC-01-01: null でない reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: '短い' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
    });

    it('[Error] T-PF-AC-01-02: reason に文字数情報が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: '短い' },
      ]);
      const result = checkAssistantContent(turns);

      assert(result!.includes(`${MIN_ASSISTANT_CHARS}`));
    });

    it('[Error] T-PF-AC-05-01: 各 40 文字 × 2 件（合計 80 < 100）→ reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(40) },
        { role: 'assistant', content: 'b'.repeat(40) },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
    });
  });

  /** User=1 + Assistant が十分な長さのケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-AC-02-01: ちょうど MIN_ASSISTANT_CHARS 文字 → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS) },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Normal] T-PF-AC-02-02: MIN_ASSISTANT_CHARS より多い文字数 → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS + 50) },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Normal] T-PF-AC-03-01: User=1 + Assistant なし → null', () => {
      const turns = _makeTurns([{ role: 'user', content: '質問のみ' }]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Normal] T-PF-AC-05-02: 各 60 文字 × 2 件（合計 120 >= 100）→ null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(60) },
        { role: 'assistant', content: 'b'.repeat(60) },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });
  });

  /** 複数 User ターン時に 1ターン限定ルールが無効化されるケース。 */
  describe('When: エッジケース', () => {
    it('[Error] T-PF-AC-09-01: PR生成作業ログ(CTRL_SKIP + 実質内容ターン) → reason に "PR生成作業ログ" が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'PRドラフトを作成して' },
        { role: 'assistant', content: 'PRドラフトを生成します。まず現在のブランチの状態を確認します。' },
        { role: 'assistant', content: 'PRドラフトが生成されました。内容を確認します。' },
        {
          role: 'assistant',
          content:
            'PRドラフトが生成されました。\n**生成されたPRドラフト** (`temp/idd/pr/pr_current_draft.md`):\n詳細内容...',
        },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
      assert(result!.includes('PR生成作業ログ'));
    });

    it('[Edge] T-PF-AC-08-02: User=2ターン + assistant="ok" → null（isSingleUserTurnゲート外のためスキップ）', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問1' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: '質問2' },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-AC-08-02: User=2ターン + assistant="ok" → null（isSingleUserTurnゲート外のためスキップ）', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問1' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: '質問2' },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-AC-04-01: User=2, Assistant 短い → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問1' },
        { role: 'assistant', content: '短い' },
        { role: 'user', content: '質問2' },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-AC-04-02: User=3, Assistant 1 文字 → null', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問1' },
        { role: 'user', content: '質問2' },
        { role: 'user', content: '質問3' },
        { role: 'assistant', content: 'a' },
      ]);
      const result = checkAssistantContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-AC-10-01: assistant が MIN_ASSISTANT_CHARS - 1（99文字）の場合 → null でない（reason を返す）', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS - 1) },
      ]);
      const result = checkAssistantContent(turns);

      assertNotNull(result);
    });

    it('[Edge] T-PF-AC-10-02: reason に `99`（文字数）が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', content: '質問' },
        { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS - 1) },
      ]);
      const result = checkAssistantContent(turns);

      assert(result!.includes(`${MIN_ASSISTANT_CHARS - 1}`));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkConversationPattern
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkConversationPattern` のユニットテストスイート。
 *
 * システム生成定型・コマンドプロンプトパターン（Git操作ログ・YAML・deckrd指示・プロンプトテスト）の
 * 1ターン限定検出と、複数ターン時の null 返却を検証する。
 *
 * テスト ID 範囲: T-PF-CV-01 〜 T-PF-CV-03
 *
 * @see checkConversationPattern
 */
describe('checkConversationPattern', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; content: string }>): Turn[] {
    return turns;
  }

  /** 各 NOISE_CONVERSATION_PATTERNS のパターンに対して reason を返すケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-CV-01-01: "=== GIT LOGS ===" で始まる → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '=== GIT LOGS ===\ngit log --oneline' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-02: "---\\nname: skill" で始まる → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '---\nname: commit-message-generator\n---' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-03: "Implement the following plan" で始まる → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'Implement the following plan:\n1. step one' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-04: "以下のプランを実装" で始まる → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '以下のプランを実装してください' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-05: "=== PROMPT ===" で始まる → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '=== PROMPT ===\nsome prompt text' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-06: Git操作ログ(User) + 短い応答(Assistant) → null でない reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '=== GIT LOGS ===\ngit log --oneline' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-01-07: スキル呼び出し(User) + 短い応答(Assistant) → null でない reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '---\nname: commit-message-generator\n---' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = checkConversationPattern(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-CV-02-01: 通常テキスト → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'この機能の設計についてどう思いますか？' },
        { role: 'assistant', content: '良い設計だと思います。' },
      ]);
      const result = checkConversationPattern(turns);

      assertNull(result);
    });
  });

  /** 複数 User ターン時に 1ターン限定ルールが無効化されるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-CV-03-01: 複数 User ターンでは適用されず null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: '=== GIT LOGS ===\ngit log' },
        { role: 'assistant', content: '回答1' },
        { role: 'user', content: '通常の質問' },
      ]);
      const result = checkConversationPattern(turns);

      assertNull(result);
    });

    it("[Edge] T-PF-CV-04-01: User ターンの content が空文字列 `''` → null を返す", () => {
      const turns = _makeTurns([
        { role: 'user', content: '' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkConversationPattern(turns);

      assertNull(result);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkPromptContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkPromptContent` のユニットテストスイート。
 *
 * 定型プロンプト各種（タイトル説明生成・commit判定・GitHub Issue生成・branch名生成・
 * 英語翻訳・要約生成・システムプロンプト転写）の1ターン限定検出と、複数ターン時の null 返却を検証する。
 *
 * テスト ID 範囲: T-PF-PM-01 〜 T-PF-PM-03
 *
 * @see checkPromptContent
 */
describe('checkPromptContent', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; content: string }>): Turn[] {
    return turns;
  }

  /** 各 NOISE_PROMPT_PATTERNS のパターンに対して reason を返すケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-PM-01-01: タイトル説明生成プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '以下のタイトルに対して、50-100文字程度の簡潔な説明を日本語で生成してください' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-02: commit/issue/branch 判定プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '以下の情報から、最適なcommit種別を判定し、json形式で返してください' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-03: GitHub Issue 生成プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: '以下のjson形式パラメータから、github issue下書きをmarkdown形式で生成してください' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-04: branch 名生成プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'Based on the issue title, generate a branch name' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-05: 英語翻訳プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'Translate the following text to english for use in pull request' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-06: 要約生成プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'Summarize the following text in 100 words' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-07: システムプロンプト転写 → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'You are a topic and tag extraction assistant. Your task is ...' },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-01-08: filter-chatlogs判定プロンプト → null でない reason', () => {
      const turns = _makeTurns([
        {
          role: 'user',
          content:
            'Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.\n[{"file":"...","decision":"KEEP or DISCARD",...}]',
        },
        { role: 'assistant', content: '[{"file":"input.md","decision":"DISCARD","confidence":0.97,"reason":"..."}]' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Normal] T-PF-PM-02-01: 通常テキスト → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'この機能の設計についてどう思いますか？' },
        { role: 'assistant', content: '良い設計だと思います。' },
      ]);
      const result = checkPromptContent(turns);

      assertNull(result);
    });
  });

  /** 複数 User ターン時も最初のターンがパターン一致すれば検出されるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-PM-03-01: 複数 User ターンでも最初のターンがパターン一致 → null でない reason', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'Based on the issue title, generate a branch name' },
        { role: 'assistant', content: '回答1' },
        { role: 'user', content: '通常の質問' },
      ]);
      const result = checkPromptContent(turns);

      assertNotNull(result);
    });

    it('[Edge] T-PF-PM-04-01: タイトル説明生成プロンプトが先頭でない → null（先頭でないので不一致）', () => {
      const turns = _makeTurns([
        {
          role: 'user',
          content: '前置テキスト\n以下のタイトルに対して、50-100文字程度の簡潔な説明を生成してください',
        },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNull(result);
    });

    it('[Edge] T-PF-PM-04-02: システムプロンプト転写が先頭でない → null（先頭でないので不一致）', () => {
      const turns = _makeTurns([
        {
          role: 'user',
          content: 'なお、you are a topic and tag extraction assistant として機能します',
        },
        { role: 'assistant', content: '回答' },
      ]);
      const result = checkPromptContent(turns);

      assertNull(result);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readConversation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `readConversation` のユニットテストスイート。
 *
 * frontmatter 付きテキストの会話パース、および frontmatter の閉じ区切りがない
 * 不正フォーマットに対する修復フォールバックを検証する。
 *
 * テスト ID 範囲: T-PF-RC-01 〜 T-PF-RC-02
 *
 * @see readConversation
 */
describe('readConversation', () => {
  /** frontmatter を除いた content から会話ターンが正しく解析されるケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-RC-01-01: frontmatter 付きテキスト → content 部分の User/Assistant ターンが解析される', () => {
      const text = [
        '---',
        'title: テスト会話',
        '---',
        '',
        '### User',
        '質問テキスト',
        '',
        '### Assistant',
        '応答テキスト',
        '',
      ].join('\n');

      const conversation = readConversation(text);

      assertEquals(conversation.length, 2);
      assertEquals(conversation[0].content, '質問テキスト');
      assertEquals(conversation[1].content, '応答テキスト');
    });
  });

  /** frontmatter の閉じ区切りがない不正フォーマットに対する修復フォールバックのケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-RC-02-01: frontmatter の閉じ区切りがない → 例外をスローせず会話を返す', () => {
      const text = [
        '---',
        'title: 不正フォーマット',
        '',
        '### User',
        '質問テキスト',
        '',
        '### Assistant',
        '応答テキスト',
        '',
      ].join('\n');

      let threw = false;
      let conversation: Turn[] = [];
      try {
        conversation = readConversation(text) as Turn[];
      } catch {
        threw = true;
      }

      assertEquals(threw, false);
      assert(conversation.length > 0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyConversation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `classifyConversation` のユニットテストスイート。
 *
 * checkUserContent → checkConversationPattern → checkPromptContent → checkAssistantContent
 * の優先順位で最初に一致した reason を返すこと、いずれも一致しない場合に null を返すことを検証する。
 *
 * テスト ID 範囲: T-PF-CC-01 〜 T-PF-CC-02
 *
 * @see classifyConversation
 */
describe('classifyConversation', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; content: string }>): Turn[] {
    return turns;
  }

  /** 複数チェックに一致しうる会話で、より優先度の高い checkUserContent の reason が返るケース。 */
  describe('When: 正常系', () => {
    it(
      '[Normal] T-PF-CC-01-01: Userターン不在（checkUserContent該当） → checkUserContentのreasonを返す',
      () => {
        const turns = _makeTurns([{ role: 'assistant', content: '回答' }]);

        const result = classifyConversation(turns);

        assertNotNull(result);
        assert(result!.includes('Userターンが存在しない'));
      },
    );

    it('[Normal] T-PF-CC-01-02: 通常の会話 → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', content: 'この機能の設計についてどう思いますか？' },
        { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS) },
      ]);

      const result = classifyConversation(turns);

      assertNull(result);
    });
  });

  /** checkUserContent は一致せず checkConversationPattern が一致するケース（優先順位の検証）。 */
  describe('When: エッジケース', () => {
    it(
      '[Edge] T-PF-CC-02-01: Git操作ログパターン（checkConversationPattern該当）→ そのreasonを返す',
      () => {
        const turns = _makeTurns([
          { role: 'user', content: '=== GIT LOGS ===\ngit log --oneline' },
          { role: 'assistant', content: 'a'.repeat(MIN_ASSISTANT_CHARS) },
        ]);

        const result = classifyConversation(turns);

        assertNotNull(result);
      },
    );

    it(
      '[Edge] T-PF-CC-03-01: checkUserContent と checkAssistantContent の両方が該当 → checkUserContentのreasonを優先する',
      () => {
        const turns = _makeTurns([
          { role: 'user', content: '<system-reminder>x</system-reminder>' },
          { role: 'assistant', content: '短い' },
        ]);

        const result = classifyConversation(turns);

        assertNotNull(result);
        assert(result!.includes('システムTag'));
      },
    );
  });
});

// NOTE: NOISE_USER_PATTERNS_* の定数直接参照テスト（T-PF-NP-01〜04）は削除済み。
// checkUserContent 経由で同等ロジックを検証しているため再追加しないこと。
