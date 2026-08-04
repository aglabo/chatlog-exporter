// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/load-entry.unit.spec.ts
// @(#): loadEntry のユニットテスト
//       対象: loadEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadEntry } from '../../load-entry.ts';

// ─── Helpers
// errors
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// classes
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Tests

/**
 * `loadEntry` のユニットテストスイート。
 *
 * ファイル読み込みと `ChatlogEntry | LoadEntryFailure` 返却のロジックを検証する。
 * 正常系では戻り値が `ChatlogEntry` インスタンス、エラー系では `{ filePath, error }` の失敗結果を検証する。
 *
 * @see loadEntry
 */
describe('loadEntry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /** 正常系: 有効な .md ファイルを読み込んだときの戻り値検証。 */
  describe('When: 正常系', () => {
    it('[Normal] T-NE-LE-01: 戻り値が ChatlogEntry のインスタンスである', async () => {
      const filePath = `${tempDir}/valid.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n本文');

      const _result = await loadEntry(filePath);

      assertInstanceOf(_result, ChatlogEntry);
    });
  });

  /** 異常系: ファイル不在とフロントマターエラーのケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-NE-LE-02: 存在しないパスで ChatlogError がスローされる', async () => {
      await assertRejects(
        () => loadEntry('/nonexistent/path/file.md'),
        ChatlogError,
      );
    });

    it('[Error] T-NE-LE-03: エラー時の戻り値が { filePath, error } 形式である', async () => {
      const filePath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadEntry(filePath);

      assertEquals(_result instanceof ChatlogEntry, false);
      assertEquals((_result as { filePath: string }).filePath, filePath);
    });

    it('[Error] T-NE-LE-04: エラー時の error が空でないメッセージを持つ', async () => {
      const filePath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadEntry(filePath);

      const _error = (_result as { error: Error }).error;
      assertInstanceOf(_error, Error);
      assertEquals(_error.message.length > 0, true);
    });
  });
});
