// src: scripts/modules/__tests__/functional/load-chatlog-entry.functional.spec.ts
// @(#): loadChatlogEntry の機能テスト
//       対象: loadChatlogEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm nofm noheader

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../../_cle-libs/__tests__/helpers/assert.ts';

// ─── Test target
import { loadChatlogEntry } from '../../setfm-entry-loader.ts';

// ─── Tests

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

/**
 * `loadChatlogEntry` のユニットテストスイート。
 *
 * ファイル読み込み・ChatlogEntry 生成・スキップ条件を検証する。
 *
 * テスト ID 範囲: T-SF-LCE-01 〜 T-SF-LCE-04
 *
 * @see loadChatlogEntry
 */
describe('loadChatlogEntry', () => {
  /**
   * フロントマターありの .md ファイルを読み込む正常系テスト。
   *
   * `ChatlogEntry` が返り、`filePath` と `frontmatter.get()` が正しく機能することを検証する。
   */
  describe('正常系 - フロントマターあり', () => {
    /** 有効なフロントマターと `#` ヘッダーを持つファイルから ChatlogEntry を返すケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-LCE-01-01: ChatlogEntry インスタンスが返る', async () => {
        const filePath = `${tempDir}/test.md`;
        const content = [
          '---',
          'session_id: sess-001',
          'date: 2026-03-15',
          'project: my-project',
          'slug: test-slug',
          '---',
          '',
          '# テスト',
          '本文テキスト',
        ].join('\n');
        await Deno.writeTextFile(filePath, content);

        const result = await loadChatlogEntry(filePath);

        assertNotNull(result);
      });

      it('[Normal] T-SF-LCE-01-02: entry.filePath が引数の filePath と一致する', async () => {
        const filePath = `${tempDir}/test.md`;
        const content = [
          '---',
          'session_id: sess-001',
          '---',
          '',
          '# テスト',
          '本文テキスト',
        ].join('\n');
        await Deno.writeTextFile(filePath, content);

        const result = await loadChatlogEntry(filePath);

        assertNotNull(result);
        assertEquals(result!.filePath, filePath);
      });

      it('[Normal] T-SF-LCE-01-03: frontmatter.get("session_id") が "sess-001" を返す', async () => {
        const filePath = `${tempDir}/test.md`;
        const content = [
          '---',
          'session_id: sess-001',
          '---',
          '',
          '# テスト',
          '本文テキスト',
        ].join('\n');
        await Deno.writeTextFile(filePath, content);

        const result = await loadChatlogEntry(filePath);

        assertNotNull(result);
        assertEquals(result!.frontmatter.get('session_id'), 'sess-001');
      });
    });
  });

  /**
   * ファイルが存在しない場合の異常系テスト。
   *
   * `null` が返り、例外がスローされないことを検証する。
   */
  describe('異常系 - ファイル不在', () => {
    /** 存在しないファイルパスを渡した場合のケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-LCE-02-01: 存在しないファイル → null が返る', async () => {
        const result = await loadChatlogEntry(`${tempDir}/nonexistent.md`);

        assertNull(result);
      });
    });
  });

  /**
   * エッジケース: ヘッダーなし・フロントマターなしのファイルを検証する。
   */
  describe('エッジケース', () => {
    /** `#` ヘッダー行を含まないファイルと、フロントマターのないファイルのケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-LCE-03-01: "#" ヘッダーなし → null が返る', async () => {
        const filePath = `${tempDir}/noheader.md`;
        await Deno.writeTextFile(filePath, 'ヘッダーなしの本文テキスト');

        const result = await loadChatlogEntry(filePath);

        assertNull(result);
      });

      it('[Edge] T-SF-LCE-04-01: フロントマターなし（本文あり）→ ChatlogEntry が返る', async () => {
        const filePath = `${tempDir}/nofm.md`;
        await Deno.writeTextFile(filePath, '# タイトル\n本文');

        const result = await loadChatlogEntry(filePath);

        assertNotNull(result);
      });

      it('[Edge] T-SF-LCE-04-02: フロントマターなし → frontmatter.get("session_id") が undefined を返す', async () => {
        const filePath = `${tempDir}/nofm.md`;
        await Deno.writeTextFile(filePath, '# タイトル\n本文');

        const result = await loadChatlogEntry(filePath);

        assertNotNull(result);
        assertEquals(result!.frontmatter.get('session_id'), undefined);
      });
    });
  });
});
