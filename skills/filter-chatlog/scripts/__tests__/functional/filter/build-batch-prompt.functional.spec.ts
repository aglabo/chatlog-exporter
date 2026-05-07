// src: scripts/__tests__/functional/filter/build-batch-prompt.functional.spec.ts
// @(#): buildBatchPrompt の機能テスト
//       実ファイルを使用したバッチプロンプト構築の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../../filter-chatlog.ts';
// types
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Helpers
import { makeTestDirs, makeValidContent } from '../../_helpers/chatlog-fixtures.ts';
// constants
import { MAX_PROMPT_LENGTH, OVER_MAX_CHARS_LENGTH } from '../../_helpers/constants.ts';

// ─── Tests

/**
 * `buildBatchPrompt` 関数の機能テストスイート。
 *
 * `buildBatchPrompt(files)` は複数の .md ファイルを読み込み、
 * `=== FILE N: filename ===` 形式のヘッダ付きバッチプロンプト文字列を生成する。
 * 本文が `MAX_BODY_CHARS`（8000）を超える場合は切り詰める。
 * 存在しないファイルパスが渡された場合は `ChatlogError('FileDirNotFound')` を throw する。
 *
 * テスト ID 範囲: T-FL-BP-01 〜 T-FL-BP-03
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
  /**
   * 通常の .md ファイル（2 件）を入力とする前提条件グループ。
   *
   * 各ファイルが `=== FILE N: filename ===` 形式でプロンプトに埋め込まれることを検証する。
   */
  describe('Given: 2 つのファイル', () => {
    /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
    let tempDir: string;

    /** チャットログファイルを配置するディレクトリのパス。 */
    let chatlogDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** buildBatchPrompt([file1, file2]) を呼び出すとき。 */
    describe('When: buildBatchPrompt([file1, file2]) を呼び出す', () => {
      /** `=== FILE N: filename ===` 形式で結合されることを検証する。 */
      describe('Then: T-FL-BP-01 - === FILE N: filename === 形式で結合される', () => {
        it('T-FL-BP-01-01: "=== FILE 1:" を含む', async () => {
          const file1 = `${chatlogDir}/chat-a.md`;
          await Deno.writeTextFile(file1, makeValidContent('テスト'));

          const result = await buildBatchPrompt([file1]);

          assertStringIncludes(result, '=== FILE 1:');
        });

        it('T-FL-BP-01-02: ファイル名が含まれる', async () => {
          const file1 = `${chatlogDir}/my-chatlog.md`;
          await Deno.writeTextFile(file1, makeValidContent('テスト'));

          const result = await buildBatchPrompt([file1]);

          assertStringIncludes(result, 'my-chatlog.md');
        });

        it('T-FL-BP-01-03: 2 ファイルで "=== FILE 2:" も含まれる', async () => {
          const file1 = `${chatlogDir}/chat-a.md`;
          const file2 = `${chatlogDir}/chat-b.md`;
          await Deno.writeTextFile(file1, makeValidContent('A', '質問A', '回答A'));
          await Deno.writeTextFile(file2, makeValidContent('B', '質問B', '回答B'));

          const result = await buildBatchPrompt([file1, file2]);

          assertStringIncludes(result, '=== FILE 1:');
          assertStringIncludes(result, '=== FILE 2:');
        });
      });
    });
  });

  /**
   * 存在しないファイルパスを入力とする前提条件グループ。
   *
   * fail-first 原則に従い、`ChatlogError('FileDirNotFound')` を throw することを検証する。
   */
  describe('Given: 存在しないファイルパス', () => {
    /** buildBatchPrompt([nonExistentPath]) を呼び出すとき。 */
    describe('When: buildBatchPrompt([nonExistentPath]) を呼び出す', () => {
      /** `ChatlogError` が throw されることを検証する。 */
      describe('Then: T-FL-BP-03 - ChatlogError(FileDirNotFound) を throw する', () => {
        it('T-FL-BP-03-01: ChatlogError(FileDirNotFound) を throw する', async () => {
          const nonExistent = '/nonexistent/path/chat.md';

          const err = await assertRejects(
            () => buildBatchPrompt([nonExistent]),
            ChatlogError,
          );

          assertEquals((err as ChatlogError).kind, 'FileDirNotFound');
        });
      });
    });
  });

  /**
   * `MAX_BODY_CHARS`（8000）を大幅に超える本文を持つファイルを入力とする前提条件グループ。
   *
   * プロンプト全体が無制限に巨大化しないよう、本文が切り詰められることを検証する。
   */
  describe('Given: MAX_BODY_CHARS を超える長大な本文のファイル', () => {
    /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
    let tempDir: string;

    /** チャットログファイルを配置するディレクトリのパス。 */
    let chatlogDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** buildBatchPrompt([file]) を呼び出すとき。 */
    describe('When: buildBatchPrompt([file]) を呼び出す', () => {
      /** 本文が切り詰められ、結果長が合理的な範囲に収まることを検証する。 */
      describe('Then: T-FL-BP-02 - 本文が切り詰められる', () => {
        it('T-FL-BP-02-01: 結果の長さが無制限に増大しない', async () => {
          const longText = 'x'.repeat(OVER_MAX_CHARS_LENGTH);
          const file = `${chatlogDir}/long.md`;
          await Deno.writeTextFile(file, makeValidContent('Long', longText, '回答'));

          const result = await buildBatchPrompt([file]);

          // MAX_BODY_CHARS=8000 + ヘッダー分で合理的な範囲内に収まる
          assertEquals(result.length < MAX_PROMPT_LENGTH, true);
        });
      });
    });
  });
});
