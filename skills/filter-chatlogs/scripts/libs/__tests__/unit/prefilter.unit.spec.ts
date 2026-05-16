// src: scripts/libs/__tests__/unit/prefilter.unit.spec.ts
// @(#): prefilter ユニットテスト
//       対象: isSystemOnlyMessage
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isSystemOnlyMessage } from '../../prefilter.ts';

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
      assertEquals(isSystemOnlyMessage('<system-reminder>msg</system-reminder>'), true);
    });

    it('[Normal] T-PF-IS-01-02: `<command-name>cmd</command-name>` → true', () => {
      assertEquals(isSystemOnlyMessage('<command-name>cmd</command-name>'), true);
    });

    it('[Normal] T-PF-IS-01-03: `<command-message>msg</command-message>` → true', () => {
      assertEquals(isSystemOnlyMessage('<command-message>msg</command-message>'), true);
    });

    it('[Normal] T-PF-IS-01-04: `<local-command-stdout>out</local-command-stdout>` → true', () => {
      assertEquals(isSystemOnlyMessage('<local-command-stdout>out</local-command-stdout>'), true);
    });

    it('[Normal] T-PF-IS-01-05: `<ide_opened_file>file.ts</ide_opened_file>` → true', () => {
      assertEquals(isSystemOnlyMessage('<ide_opened_file>file.ts</ide_opened_file>'), true);
    });

    it('[Normal] T-PF-IS-01-06: `<ide_selection>selected</ide_selection>` → true', () => {
      assertEquals(isSystemOnlyMessage('<ide_selection>selected</ide_selection>'), true);
    });

    it('[Normal] T-PF-IS-01-07: `---\\ntitle: test\\n---\\n` → true', () => {
      assertEquals(isSystemOnlyMessage('---\ntitle: test\n---\n'), true);
    });
  });

  /** 通常テキスト・空文字列・スラッシュコマンドが false を返すケース。 */
  describe('When: 正常系（false を返す）', () => {
    it('[Normal] T-PF-IS-02-01: `これは通常のメッセージです` → false', () => {
      assertEquals(isSystemOnlyMessage('これは通常のメッセージです'), false);
    });

    it("[Normal] T-PF-IS-02-02: `''`（空文字列）→ false", () => {
      assertEquals(isSystemOnlyMessage(''), false);
    });

    it('[Normal] T-PF-IS-02-03: `/commit`（スラッシュコマンド）→ false', () => {
      assertEquals(isSystemOnlyMessage('/commit'), false);
    });
  });

  /** trim 後にプレフィックスがマッチする・しないケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-IS-03-01: `  <system-reminder>msg</system-reminder>`（先頭空白）→ true（trim後マッチ）', () => {
      assertEquals(isSystemOnlyMessage('  <system-reminder>msg</system-reminder>'), true);
    });

    it('[Edge] T-PF-IS-03-02: `\\n<command-name>cmd</command-name>`（先頭改行）→ true（trim後マッチ）', () => {
      assertEquals(isSystemOnlyMessage('\n<command-name>cmd</command-name>'), true);
    });

    it('[Edge] T-PF-IS-03-03: `---`（改行なし）→ false（`---\\n` とは一致しない）', () => {
      assertEquals(isSystemOnlyMessage('---'), false);
    });
  });

  /** プレフィックスが先頭でなく中間に出現するケース・類似タグだが一致しないケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-IS-04-01: `普通のテキスト\\n<system-reminder>msg</system-reminder>`（中間に出現）→ false', () => {
      assertEquals(isSystemOnlyMessage('普通のテキスト\n<system-reminder>msg</system-reminder>'), false);
    });

    it('[Error] T-PF-IS-04-02: `<system-info>info</system-info>`（類似するが一致しないタグ）→ false', () => {
      assertEquals(isSystemOnlyMessage('<system-info>info</system-info>'), false);
    });
  });
});
