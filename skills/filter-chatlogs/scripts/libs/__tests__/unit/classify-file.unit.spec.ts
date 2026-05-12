// src: scripts/__tests__/unit/libs/classify-file.unit.spec.ts
// @(#): classify-file.ts のユニットテスト
//       対象: checkFilename / checkUserContent / checkAssistantContent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { checkAssistantContent, checkFilename, checkUserContent } from '../../../libs/classify-file.ts';

// ─── Helpers
import { MIN_ASSISTANT_CHARS } from '../../../constants/common.constants.ts';
import { NOISE_USER_PREFIX_PATTERNS } from '../../../constants/patterns.constants.ts';
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

      assertNotEquals(result, null);
    });

    it('[Normal] T-PF-CF-01-02: say-ok-and-nothing-else.md → null でない', () => {
      const result = checkFilename('say-ok-and-nothing-else.md');

      assertNotEquals(result, null);
    });

    it('[Normal] T-PF-CF-01-03: command-message-claude-idd-framework.md → null でない', () => {
      const result = checkFilename('command-message-claude-idd-framework.md');

      assertNotEquals(result, null);
    });

    it('[Normal] T-PF-CF-01-04: command-message-deckrd-deckrd.md → null でない', () => {
      const result = checkFilename('command-message-deckrd-deckrd.md');

      assertNotEquals(result, null);
    });

    it('[Normal] T-PF-CF-01-05: command-message-deckrd-coder.md → null でない', () => {
      const result = checkFilename('command-message-deckrd-coder.md');

      assertNotEquals(result, null);
    });

    it('[Normal] T-PF-CF-02-01: "my-chat-log.md" → null', () => {
      const result = checkFilename('my-chat-log.md');

      assertEquals(result, null);
    });

    it('[Normal] T-PF-CF-02-02: 空文字列 "" → null', () => {
      const result = checkFilename('');

      assertEquals(result, null);
    });
  });

  /** 大文字小文字を区別しない検証ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-CF-03-01: "Say-Ok-And-Nothing-Else.md" → null でない', () => {
      const result = checkFilename('Say-Ok-And-Nothing-Else.md');

      assertNotEquals(result, null);
    });

    it('[Edge] T-PF-CF-03-02: "SAY-OK-AND-NOTHING-ELSE.md" → null でない', () => {
      const result = checkFilename('SAY-OK-AND-NOTHING-ELSE.md');

      assertNotEquals(result, null);
    });

    it('[Edge] T-PF-CF-04-01: reason に "ファイル名パターン:" が含まれる', () => {
      const result = checkFilename('say-ok-and-nothing-else.md');

      assertEquals(result!.includes('ファイル名パターン:'), true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUserContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkUserContent` のユニットテストスイート。
 *
 * User ターンなし・システムタグのみ・コマンドのみ・PREFIX/EXACT パターン・1ターン限定ルールを検証する。
 *
 * テスト ID 範囲: T-PF-UC-01 〜 T-PF-UC-08
 *
 * @see checkUserContent
 */
describe('checkUserContent', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; text: string }>): Turn[] {
    return turns;
  }

  /** User ターンが存在しないケース・全ターンがシステムタグ・コマンドのみのケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-UC-01-01: "Userターンが存在しない" を含む reason を返す', () => {
      const turns = _makeTurns([{ role: 'assistant', text: '回答' }]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
      assertEquals(result!.includes('Userターンが存在しない'), true);
    });

    it('[Error] T-PF-UC-02-01: 単一 User ターンで <system-reminder> のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '<system-reminder>システムメッセージ</system-reminder>' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-02-02: 複数 User ターン全てが <system-reminder> → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '<system-reminder>msg1</system-reminder>' },
        { role: 'assistant', text: '回答' },
        { role: 'user', text: '<command-name>cmd</command-name>' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-03-01: 単一 User ターンで /commit のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '/commit' },
        { role: 'assistant', text: '了解しました' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-03-02: 複数 User ターン全てが /コマンド → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '/commit' },
        { role: 'assistant', text: '回答1' },
        { role: 'user', text: '/export-log' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-03-04: 単一 User ターンで /filter-chatlogs のみ → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '/filter-chatlogs' },
        { role: 'assistant', text: '了解しました' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-04-01: "=== GIT LOGS ===" で始まる → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '=== GIT LOGS ===\ngit log --oneline' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-04-02: "---\\nname: commit-message-generator" で始まる → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '---\nname: commit-message-generator\n---' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-04-03: "Based on the issue title" で始まる → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'Based on the issue title, generate a branch name' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-04-04: "Implement the following plan" で始まる → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'Implement the following plan:\n1. step one' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-06-01: "C:\\\\Users\\\\foo\\\\bar.md" → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'C:\\Users\\foo\\bar.md' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-UC-06-02: "docs/readme.md" → reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'docs/readme.md' },
        { role: 'assistant', text: '回答' },
      ]);
      const result = checkUserContent(turns);

      assertNotEquals(result, null);
    });
  });

  /** 通常テキストや複数ターンで 1ターン限定ルールが適用されないケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-UC-08-01: 通常テキストの単一 User ターン → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'この機能の設計についてどう思いますか？' },
        { role: 'assistant', text: '良い設計だと思います。' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });

    it('[Normal] T-PF-UC-08-02: 複数の通常 User ターン → null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問1' },
        { role: 'assistant', text: '回答1' },
        { role: 'user', text: '質問2' },
        { role: 'assistant', text: '回答2' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });
  });

  /** 複数 User ターン時に 1ターン限定ルールが無効化されるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-UC-02-03: 1ターン目はシステムタグ、2ターン目は通常テキスト → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '<system-reminder>msg</system-reminder>' },
        { role: 'assistant', text: '回答' },
        { role: 'user', text: '通常の質問テキスト' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });

    it('[Edge] T-PF-UC-03-03: 1ターン目は /コマンド、2ターン目は通常テキスト → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '/commit' },
        { role: 'assistant', text: '回答' },
        { role: 'user', text: '通常の質問テキスト' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });

    it('[Edge] T-PF-UC-05-01: 複数 User ターンでは prefix パターンが適用されず null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '=== GIT LOGS ===\ngit log --oneline' },
        { role: 'assistant', text: '回答1' },
        { role: 'user', text: '通常の質問' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });

    it('[Edge] T-PF-UC-07-01: 複数 User ターンでは exact パターンが適用されず null を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: 'C:\\Users\\foo\\bar.md' },
        { role: 'assistant', text: '回答' },
        { role: 'user', text: '通常の質問' },
      ]);
      const result = checkUserContent(turns);

      assertEquals(result, null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkAssistantContent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `checkAssistantContent` のユニットテストスイート。
 *
 * User=1ターン限定の Assistant 応答長チェック・複数 Assistant ターンの合計判定を検証する。
 *
 * テスト ID 範囲: T-PF-AC-01 〜 T-PF-AC-05
 *
 * @see checkAssistantContent
 */
describe('checkAssistantContent', () => {
  /** @param turns - ロール・テキストペアから Turn[] を生成するヘルパー。 */
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; text: string }>): Turn[] {
    return turns;
  }

  /** User=1 + Assistant 合計が MIN_ASSISTANT_CHARS 未満のケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-AC-01-01: null でない reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: '短い' },
      ]);
      const result = checkAssistantContent(turns);

      assertNotEquals(result, null);
    });

    it('[Error] T-PF-AC-01-02: reason に文字数情報が含まれる', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: '短い' },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result!.includes(`${MIN_ASSISTANT_CHARS}`), true);
    });

    it('[Error] T-PF-AC-05-01: 各 40 文字 × 2 件（合計 80 < 100）→ reason を返す', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: 'a'.repeat(40) },
        { role: 'assistant', text: 'b'.repeat(40) },
      ]);
      const result = checkAssistantContent(turns);

      assertNotEquals(result, null);
    });
  });

  /** User=1 + Assistant が十分な長さのケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-AC-02-01: ちょうど MIN_ASSISTANT_CHARS 文字 → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: 'a'.repeat(MIN_ASSISTANT_CHARS) },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });

    it('[Normal] T-PF-AC-02-02: MIN_ASSISTANT_CHARS より多い文字数 → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: 'a'.repeat(MIN_ASSISTANT_CHARS + 50) },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });

    it('[Normal] T-PF-AC-03-01: User=1 + Assistant なし → null', () => {
      const turns = _makeTurns([{ role: 'user', text: '質問のみ' }]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });

    it('[Normal] T-PF-AC-05-02: 各 60 文字 × 2 件（合計 120 >= 100）→ null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問' },
        { role: 'assistant', text: 'a'.repeat(60) },
        { role: 'assistant', text: 'b'.repeat(60) },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });
  });

  /** 複数 User ターン時に 1ターン限定ルールが無効化されるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-AC-04-01: User=2, Assistant 短い → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問1' },
        { role: 'assistant', text: '短い' },
        { role: 'user', text: '質問2' },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });

    it('[Edge] T-PF-AC-04-02: User=3, Assistant 1 文字 → null', () => {
      const turns = _makeTurns([
        { role: 'user', text: '質問1' },
        { role: 'user', text: '質問2' },
        { role: 'user', text: '質問3' },
        { role: 'assistant', text: 'a' },
      ]);
      const result = checkAssistantContent(turns);

      assertEquals(result, null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NOISE_USER_PREFIX_PATTERNS — スラッシュコマンドパターン
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `NOISE_USER_PREFIX_PATTERNS` スラッシュコマンドパターンの単体テストスイート。
 *
 * スラッシュコマンドラベルを持つ正規表現が、新旧スキル名 `/filter-chatlog` および
 * `/filter-chatlogs` の両方にマッチすることを検証する。
 *
 * テスト ID 範囲: T-PF-NP-01 〜 T-PF-NP-02
 *
 * @see NOISE_USER_PREFIX_PATTERNS
 */
describe('NOISE_USER_PREFIX_PATTERNS - スラッシュコマンドパターン', () => {
  /** スラッシュコマンドラベルを持つパターンを取得する。 */
  const _slashPattern = NOISE_USER_PREFIX_PATTERNS.find((p) => p.label === 'スラッシュコマンドのみ')!;

  /** 旧スキル名・新スキル名の両方がパターンにマッチするケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-NP-01-01: /filter-chatlog（旧スキル名）→ パターンにマッチする', () => {
      assertEquals(_slashPattern.pattern.test('/filter-chatlog'), true);
    });

    it('[Normal] T-PF-NP-01-02: /filter-chatlogs（新スキル名）→ パターンにマッチする', () => {
      assertEquals(_slashPattern.pattern.test('/filter-chatlogs'), true);
    });
  });
});
