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
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { loadEntry } from '../../load-entry.ts';

// ─── Helpers
// errors
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// classes
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers

// constants

/**
 * `Deno.readTextFile` を差し替えて throw させる非 Error 値。
 *
 * ファイル I/O 層がライブラリ更新や `Deno.core` 由来の低レベル失敗で Error 以外を
 * 投げた場合に相当する。`isFileIoError` にも `ChatlogError` にも該当しないため、
 * `loadEntry` の catch はこの値を `Error` へ包み直す経路へ入る。
 */
const _NON_ERROR_THROWN = 'raw string failure from read layer';

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

    /** 読み込み層が Error 以外を throw した場合、呼び出し元（`loadEntries` / phase）は
     *  `error.message` を読むため、素通しすると `undefined` を表示して原因が消える。
     *  `Error` へ包み直したうえで元の値を message に残すことを固定する。 */
    it('[Error] T-NE-LE-05: 読み込み層が非 Error 値を throw したとき error が Error に包まれ message に元の値が残る', async () => {
      const filePath = `${tempDir}/non-error.md`;
      const _readPaths: string[] = [];
      using _readStub = stub(Deno, 'readTextFile', (path: string | URL) => {
        _readPaths.push(String(path));
        return Promise.reject(_NON_ERROR_THROWN);
      });

      const _result = await loadEntry(filePath);

      // assert — 差し替えた読み込み層が loadEntry の受け取ったパスで 1 回だけ呼ばれる
      assertEquals(_readPaths, [filePath]);
      assertEquals(_readStub.calls.length, 1);

      // assert — 非 Error は throw されず、失敗結果として返る
      assertEquals((_result as { filePath: string }).filePath, filePath);
      const _error = (_result as { error: unknown }).error;
      assertInstanceOf(_error, Error);
      assertEquals(_error.message, _NON_ERROR_THROWN);
    });
  });
});
