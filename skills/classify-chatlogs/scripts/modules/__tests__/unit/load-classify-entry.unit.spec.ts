// src: skills/classify-chatlogs/scripts/modules/__tests__/unit/load-classify-entry.unit.spec.ts
// @(#): loadClassifyEntry のユニットテスト
//       対象: loadClassifyEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadClassifyEntry } from '../../classify-noai.ts';

// ─── Helpers
// errors
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// constants
import { ENTRY_ACTIONS, ENTRY_STATUSES } from '../../../../../_scripts/types/action-status.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `loadClassifyEntry` のユニットテストスイート。
 *
 * ファイル読み込みと `ActionStatusEntry` 返却のロジックを検証する。
 * 正常系では `entry` が `ChatlogEntry` インスタンス、エラー系では `options.action === 'error'` を検証する。
 *
 * テスト ID 範囲: T-03-01-01 〜 T-03-02-04
 *
 * @see loadClassifyEntry
 */
describe('loadClassifyEntry', () => {
  let tempDir: string;
  let cache: Awaited<ReturnType<typeof _makeEmptyClassifyCache>>;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    cache = await _makeEmptyClassifyCache();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 正常系: 有効な .md ファイルを読み込んだときの ActionStatusEntry 検証。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-03-01-01: entry が ChatlogEntry のインスタンスである', async () => {
      const filePath = `${tempDir}/valid.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n本文');

      const _result = await loadClassifyEntry(filePath, cache);

      assertInstanceOf(_result.entry, ChatlogEntry);
    });

    it('[Normal] T-03-01-03: options.action が undefined（エラーなし）', async () => {
      const filePath = `${tempDir}/valid.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n本文');

      const _result = await loadClassifyEntry(filePath, cache);

      assertEquals(_result.options.action, undefined);
    });
  });

  /**
   * 異常系: ファイル不在とフロントマターエラーのケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-03-02-01: 存在しないパスで ChatlogError がスローされる', async () => {
      await assertRejects(
        () => loadClassifyEntry('/nonexistent/path/file.md', cache),
        ChatlogError,
      );
    });

    it('[Error] T-03-02-02: 不正な YAML フロントマターで options.action === "error" かつ options.status === "error"', async () => {
      const filePath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadClassifyEntry(filePath, cache);

      assertEquals(_result.options.action, ENTRY_ACTIONS.ERROR);
      assertEquals(_result.options.status, ENTRY_STATUSES.ERROR);
    });

    it('[Error] T-03-02-03: エラー時の entry が ChatlogEntry インスタンスである', async () => {
      const filePath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadClassifyEntry(filePath, cache);

      assertInstanceOf(_result.entry, ChatlogEntry);
    });

    it('[Error] T-03-02-04: エラー時の options.reason が空でない文字列', async () => {
      const filePath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadClassifyEntry(filePath, cache);

      assertEquals(typeof _result.options.reason, 'string');
      assertEquals((_result.options.reason ?? '').length > 0, true);
    });
  });
});
