// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/load-entries.unit.spec.ts
// @(#): loadEntries のユニットテスト
//       対象: loadEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadEntries } from '../../load-entries.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Tests

/**
 * `loadEntries` のユニットテストスイート。
 *
 * ファイルパス一覧から `ChatlogEntry` を並列読み込みし、成功分（`entries`）と
 * 失敗分（`errors`）に分離するロジックを検証する。
 *
 * @see loadEntries
 */
describe('loadEntries', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /** 正常系: 全ファイルが有効な場合の分離結果検証。 */
  describe('When: 正常系', () => {
    it('[Normal] T-NE-LEs-01: 全ファイルが有効なとき entries に全件含まれ errors は空になる', async () => {
      const filePath1 = `${tempDir}/a.md`;
      const filePath2 = `${tempDir}/b.md`;
      await Deno.writeTextFile(filePath1, '---\ntitle: A\n---\n本文A');
      await Deno.writeTextFile(filePath2, '---\ntitle: B\n---\n本文B');

      const _result = await loadEntries([filePath1, filePath2], 2);

      assertEquals(_result.entries.length, 2);
      assertEquals(_result.entries.every((e) => e instanceof ChatlogEntry), true);
      assertEquals(_result.errors.length, 0);
    });
  });

  /** エッジケース: 正常/異常混在時の分離順序検証。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-NE-LEs-02: 正常/異常混在のとき正常分は entries に、異常分は errors に分離される', async () => {
      const validPath = `${tempDir}/valid.md`;
      const badPath = `${tempDir}/bad-yaml.md`;
      await Deno.writeTextFile(validPath, '---\ntitle: OK\n---\n本文');
      await Deno.writeTextFile(badPath, '---\ntitle: [unclosed\n---\n本文');

      const _result = await loadEntries([validPath, badPath], 2);

      assertEquals(_result.entries.map((e) => e.filePath), [validPath]);
      assertEquals(_result.errors.map((e) => e.filePath), [badPath]);
    });
  });
});
