// src: skills/filter-chatlogs/scripts/libs/__tests__/unit/common-utils.unit.spec.ts
// @(#): common-utils ユニットテスト
//       対象: validateChatlogsDir / extractConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractConversation, validateChatlogsDir } from '../../common-utils.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { StatProvider } from '../../../../../_scripts/types/providers.types.ts';

// ─── Internal Helpers

// constants
/** ディレクトリが存在することをシミュレートする StatProvider。 */
const _existsStatProvider: StatProvider = (_path: string) => Promise.resolve({ isDirectory: true } as Deno.FileInfo);
/** ディレクトリが存在しないことをシミュレートする StatProvider（NotFound をスロー）。 */
const _notFoundStatProvider: StatProvider = (_path: string) => {
  throw new Deno.errors.NotFound('not found');
};
/** ファイルパスを指定した場合の StatProvider（isDirectory: false）。 */
const _fileStatProvider: StatProvider = (_path: string) => Promise.resolve({ isDirectory: false } as Deno.FileInfo);

// ─── Tests

/**
 * `validateChatlogsDir` のユニットテストスイート。
 *
 * ディレクトリ存在の正常系・不在の異常系を検証する。
 *
 * テスト ID 範囲: T-FL-VCD-01 〜 T-FL-VCD-02
 *
 * @see validateChatlogsDir
 */
describe('validateChatlogsDir', () => {
  /** ディレクトリ存在の正常系テスト。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FL-VCD-01-01: ディレクトリが存在する → 例外がスローされない', async () => {
      await validateChatlogsDir('/some/dir', _existsStatProvider);
    });
  });

  /** ディレクトリ不在の異常系テスト。 */
  describe('When: 異常系', () => {
    it('[Error] T-FL-VCD-02-01: 存在しないディレクトリ → ChatlogError がスローされる', async () => {
      await assertRejects(
        () => validateChatlogsDir('/nonexistent/dir', _notFoundStatProvider),
        ChatlogError,
      );
    });

    it('[Error] T-FL-VCD-02-02: 存在しないディレクトリ → subindex が ChatlogsDir', async () => {
      const err = await assertRejects(
        () => validateChatlogsDir('/nonexistent/dir', _notFoundStatProvider),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'NotFound');
    });
  });

  /** ファイルパスを指定した場合のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FL-VCD-03-01: ファイルパスを指定 → ChatlogError がスローされる', async () => {
      await assertRejects(
        () => validateChatlogsDir('/some/file.ts', _fileStatProvider),
        ChatlogError,
      );
    });

    it('[Edge] T-FL-VCD-03-02: ファイルパスを指定 → subindex が `NotFound` であること', async () => {
      const err = await assertRejects(
        () => validateChatlogsDir('/some/file.ts', _fileStatProvider),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'NotFound');
    });
  });
});

describe('extractConversation', () => {
  // ─── T-FL-EB-01: 通常会話 → User/Assistant フォーマット ──────────────────────

  describe('Given: User と Assistant ターンを含む本文', () => {
    describe('When: extractConversation(body) を呼び出す', () => {
      describe('Then: T-FL-EB-01 - ### User / ### Assistant フォーマットで返される', () => {
        const body = '### User\nユーザーの質問\n\n### Assistant\nアシスタントの回答\n';

        it('T-FL-EB-01-01: "### User" を含む', () => {
          const result = extractConversation(body);

          assertStringIncludes(result, '### User');
        });

        it('T-FL-EB-01-02: "### Assistant" を含む', () => {
          const result = extractConversation(body);

          assertStringIncludes(result, '### Assistant');
        });

        it('T-FL-EB-01-03: ユーザーのテキストが含まれる', () => {
          const result = extractConversation(body);

          assertStringIncludes(result, 'ユーザーの質問');
        });
      });
    });
  });

  // ─── T-FL-EB-02: maxChars 切り詰め ──────────────────────────────────────────

  describe('Given: maxChars より長い本文', () => {
    describe('When: extractConversation(body, maxChars) を呼び出す', () => {
      describe('Then: T-FL-EB-02 - maxChars 文字以内に切り詰められる', () => {
        it('T-FL-EB-02-01: 結果の長さが maxChars 以下になる', () => {
          const longText = 'x'.repeat(500);
          const body = `### User\n${longText}\n`;
          const maxChars = 100;
          const result = extractConversation(body, maxChars);

          assert(result.length <= maxChars);
        });

        it('T-FL-EB-02-02: maxChars=10 でも結果が返される', () => {
          const body = '### User\n質問テキスト\n\n### Assistant\n回答テキスト\n';
          const result = extractConversation(body, 10);

          assert(result.length <= 10);
        });
      });
    });
  });

  // ─── T-FL-EB-03: ターンなし → 空文字列 ─────────────────────────────────────

  describe('Given: ターンヘッダーがない本文', () => {
    describe('When: extractConversation(body) を呼び出す', () => {
      describe('Then: T-FL-EB-03 - 空文字列が返される', () => {
        it('T-FL-EB-03-01: ターンなし → 空文字列', () => {
          const body = 'ヘッダーのない本文テキスト';
          const result = extractConversation(body);

          assertEquals(result, '');
        });
      });
    });
  });
});
