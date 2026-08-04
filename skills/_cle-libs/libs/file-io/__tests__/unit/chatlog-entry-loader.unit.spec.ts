// src: skills/_cle-libs/libs/file-io/__tests__/unit/chatlog-entry-loader.unit.spec.ts
// @(#): loadChatlogEntry ユニットテスト
//       対象: loadChatlogEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadChatlogEntry } from '../../chatlog-entry-loader.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Internal Helpers

// constants
/** 正しい frontmatter を持つエントリ本文。 */
const _VALID_ENTRY = `---\ntitle: Test\ndate: 2026-01-01\n---\n\n### User\nHello\n`;

/** YAML 構文が不正な frontmatter を持つエントリ本文。 */
const _INVALID_YAML_ENTRY = `---\ntitle: [unclosed\n---\n\n### User\nHello\n`;

/** frontmatter の閉じ `---` がない不正フォーマットのエントリ本文。 */
const _INVALID_FORMAT_ENTRY = `---\ntitle: Test\n\n### User\nHello\n`;

// functions
/**
 * テスト用の一時ファイルを指定された内容で作成する。
 *
 * @param content - 書き込むファイル内容
 * @returns 作成した一時ファイルのパス
 */
const _makeTempFile = async (content: string): Promise<string> => {
  const path = await Deno.makeTempFile({ suffix: '.md' });
  await Deno.writeTextFile(path, content);
  return path;
};

// ─── Tests

/**
 * `loadChatlogEntry` 関数のユニットテストスイート。
 *
 * ファイルパスからテキストを読み込み `ChatlogEntry` インスタンスを生成する。
 * ファイル I/O エラー・frontmatter 解析エラーはいずれも catch せず呼び出し元に throw する。
 *
 * テスト ID 範囲: T-LIB-U-CEL-01 〜 T-LIB-U-CEL-07
 *
 * @see loadChatlogEntry
 */
describe('loadChatlogEntry', () => {
  /** 各テストで作成した一時ファイルのパスを記録する。 */
  let tempFiles: string[] = [];

  beforeEach(() => {
    tempFiles = [];
  });

  afterEach(async () => {
    for (const f of tempFiles) {
      await Deno.remove(f).catch(() => {});
    }
  });

  /**
   * 正常系のテスト。
   *
   * 存在する正しい frontmatter 付きファイルを読み込むと `ChatlogEntry` が返ることを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-U-CEL-01: 正しい frontmatter 付きファイルを読み込むと ChatlogEntry が返る', async () => {
      const path = await _makeTempFile(_VALID_ENTRY);
      tempFiles.push(path);

      const result = await loadChatlogEntry(path);

      assertEquals(result instanceof ChatlogEntry, true);
    });

    it('[Normal] T-LIB-U-CEL-02: 返された ChatlogEntry の options.filePath に渡した filePath が設定される', async () => {
      const path = await _makeTempFile(_VALID_ENTRY);
      tempFiles.push(path);

      const result = await loadChatlogEntry(path);

      assertEquals(result.options.filePath, path);
    });
  });

  /**
   * 異常系のテスト。
   *
   * ファイル未存在・不正 YAML・不正フォーマットのいずれも例外を呼び出し元に伝播することを検証する。
   */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-U-CEL-03: 存在しないファイルパス → ChatlogError(FileDirNotFound)', async () => {
      const err = await assertRejects(
        () => loadChatlogEntry('/nonexistent/path/to/file.md'),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'FileDirNotFound');
    });

    it('[Error] T-LIB-U-CEL-04: frontmatter の YAML 構文が不正 → ChatlogError(InvalidYaml)', async () => {
      const path = await _makeTempFile(_INVALID_YAML_ENTRY);
      tempFiles.push(path);

      const err = await assertRejects(
        () => loadChatlogEntry(path),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'InvalidYaml');
    });

    it('[Error] T-LIB-U-CEL-05: frontmatter が閉じられていない → ChatlogError(InvalidFormat)', async () => {
      const path = await _makeTempFile(_INVALID_FORMAT_ENTRY);
      tempFiles.push(path);

      const err = await assertRejects(
        () => loadChatlogEntry(path),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'InvalidFormat');
      assertEquals((err as ChatlogError).subindex, 'NotClosed');
    });
  });

  /**
   * エッジケースのテスト。
   *
   * `throwFileIoError: false` を指定した場合の挙動を検証する。
   * ファイル I/O 起因のエラーは `null` を返し、ファイル I/O 起因ではない
   * frontmatter 解析エラーは `throwFileIoError` の値に関わらず throw されることを確認する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-U-CEL-06: 存在しないファイルパス + throwFileIoError=false → null が返る', async () => {
      const result = await loadChatlogEntry('/nonexistent/path/to/file.md', false);

      assertEquals(result, null);
    });

    it('[Edge] T-LIB-U-CEL-07: frontmatter の YAML 構文が不正 + throwFileIoError=false → ChatlogError(InvalidYaml)', async () => {
      const path = await _makeTempFile(_INVALID_YAML_ENTRY);
      tempFiles.push(path);

      const err = await assertRejects(
        () => loadChatlogEntry(path, false),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'InvalidYaml');
    });
  });
});
