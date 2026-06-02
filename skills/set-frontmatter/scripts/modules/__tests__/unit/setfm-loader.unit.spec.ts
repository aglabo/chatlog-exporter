// src: scripts/modules/__tests__/unit/setfm-loader.unit.spec.ts
// @(#): setfm-loader のユニットテスト
//       対象: loadChatlogEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { loadChatlogEntry } from '../../setfm-loader.ts';

// ─── Internal Helpers

// constants
/** 有効な chatlog Markdown テキスト（見出しと本文を含む）。 */
const _VALID_CONTENT = '# タイトル\n本文テキスト';

/** 見出し（`#`）を持たない本文テキスト。 */
const _NO_HEADING_CONTENT = '見出しなしの本文';

/** 空文字列。 */
const _EMPTY_CONTENT = '';

/** テストで渡すダミーファイルパス。 */
const _DUMMY_PATH = '/dummy/test.md';

// ─── Tests

/**
 * `loadChatlogEntry` のユニットテストスイート。
 *
 * ファイル読み込み結果に応じた正常返却・null 返却・エラー伝播を検証する。
 *
 * テスト ID 範囲: T-SF-LCE-01 〜 T-SF-LCE-05
 *
 * @see loadChatlogEntry
 */
describe('loadChatlogEntry', () => {
  /**
   * ファイル読み込みが成功するケースのテスト。
   *
   * 有効なコンテンツ・見出しなし・空本文の各パターンを検証する。
   */
  describe('readTextFile', () => {
    /** 有効なコンテンツが読み込まれる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-LCE-01: 有効なchatlog MDを読み込むとChatlogEntryを返す', async () => {
        using _readStub = stub(Deno, 'readTextFile', () => Promise.resolve(_VALID_CONTENT));

        const result = await loadChatlogEntry(_DUMMY_PATH, 0);

        assertEquals(result !== null, true);
        assertEquals(result?.content, '# タイトル\n本文テキスト\n');
      });
    });

    /** ファイルの内容が条件を満たさない場合に null を返すケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-LCE-02: 見出しなしの本文はnullを返す', async () => {
        using _readStub = stub(Deno, 'readTextFile', () => Promise.resolve(_NO_HEADING_CONTENT));

        const result = await loadChatlogEntry(_DUMMY_PATH, 0);

        assertEquals(result, null);
      });

      it('[Edge] T-SF-LCE-03: 空本文はnullを返す', async () => {
        using _readStub = stub(Deno, 'readTextFile', () => Promise.resolve(_EMPTY_CONTENT));

        const result = await loadChatlogEntry(_DUMMY_PATH, 0);

        assertEquals(result, null);
      });
    });

    /** ファイル読み込みがエラーになるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-LCE-04: ファイル不在(FileDirNotFound)はnullを返す', async () => {
        using _readStub = stub(Deno, 'readTextFile', () => Promise.reject(new Deno.errors.NotFound('not found')));

        const result = await loadChatlogEntry(_DUMMY_PATH, 0);

        assertEquals(result, null);
      });

      it('[Error] T-SF-LCE-05: 権限エラー(PermissionDenied)はエラーをthrowする', async () => {
        using _readStub = stub(Deno, 'readTextFile', () => Promise.reject(new Deno.errors.PermissionDenied('denied')));

        await assertRejects(
          () => loadChatlogEntry(_DUMMY_PATH, 0),
          Deno.errors.PermissionDenied,
        );
      });
    });
  });
});
