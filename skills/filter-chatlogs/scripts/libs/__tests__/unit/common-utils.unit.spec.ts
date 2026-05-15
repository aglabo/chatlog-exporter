// src: skills/filter-chatlogs/scripts/libs/__tests__/unit/common-utils.unit.spec.ts
// @(#): common-utils ユニットテスト
//       対象: validateChatlogsDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { validateChatlogsDir } from '../../common-utils.ts';

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
});
