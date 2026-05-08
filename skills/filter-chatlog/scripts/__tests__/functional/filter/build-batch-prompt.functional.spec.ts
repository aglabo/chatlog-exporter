// src: scripts/__tests__/functional/filter/build-batch-prompt.functional.spec.ts
// @(#): buildBatchPrompt の機能テスト
//       実ファイルを使用したバッチプロンプト構築の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../../libs/batch-prompt.ts';
// types
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Helpers
import { makeFrontmatter, makePlainContent, makeTestDirs, makeValidContent } from '../../_helpers/chatlog-fixtures.ts';
// constants
import { CHUNK_SIZE, MAX_PROMPT_LENGTH, OVER_MAX_CHARS_LENGTH } from '../../_helpers/constants.ts';

// ─── Tests

/**
 * `buildBatchPrompt` 関数の機能テストスイート。
 *
 * `buildBatchPrompt(files)` は複数の .md ファイルを読み込み、
 * `=== FILE N: filename ===` 形式のヘッダ付きバッチプロンプト文字列を生成する。
 * 本文が `MAX_BODY_CHARS`（8000）を超える場合は切り詰める。
 * 存在しないファイルパスが渡された場合は `ChatlogError('FileDirNotFound')` を throw する。
 *
 * テスト ID 範囲: T-FL-BP-01 〜 T-FL-BP-09
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
  /**
   * 単一の .md ファイルを渡す前提条件グループ。
   *
   * ファイル内容の種別（正常・エッジケース）ごとに When で分類する。
   */
  describe('Given: 単一の .md ファイルを渡す', () => {
    let tempDir: string;
    let chatlogsDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogsDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    describe('When: 正常系 - フロントマターが除外され本文とファイル名が出力に含まれる', () => {
      /** フロントマターが除外され本文が抽出されることを検証する。 */
      describe('Then: [Normal] T-FL-BP-01 - フロントマターが除外され本文が抽出される', () => {
        it('T-FL-BP-01-01: [Normal] フロントマターの "title:" が出力に含まれない', async () => {
          const file = `${chatlogsDir}/chat.md`;
          await Deno.writeTextFile(file, makeValidContent('テスト', '質問', '回答'));

          const result = await buildBatchPrompt([file]);

          assert(!result.includes('title:'));
        });

        it('T-FL-BP-01-02: [Normal] 本文テキスト "質問" が出力に含まれる', async () => {
          const file = `${chatlogsDir}/chat.md`;
          await Deno.writeTextFile(file, makeValidContent('テスト', '質問', '回答'));

          const result = await buildBatchPrompt([file]);

          assertStringIncludes(result, '質問');
        });

        it('T-FL-BP-01-04: [Normal] ヘッダーが "=== FILE 1: <filename> ===" の形式で出力される', async () => {
          const file = `${chatlogsDir}/chat.md`;
          await Deno.writeTextFile(file, makeValidContent('テスト', '質問', '回答'));

          const result = await buildBatchPrompt([file]);

          assertStringIncludes(result, '=== FILE 1: chat.md ===');
        });

        it('T-FL-BP-01-03: [Normal] サブディレクトリ内ファイルでもファイル名のみが抽出される', async () => {
          const subDir = `${chatlogsDir}/sub`;
          await Deno.mkdir(subDir, { recursive: true });
          const file = `${subDir}/deep.md`;
          await Deno.writeTextFile(file, makeValidContent('テスト'));

          const result = await buildBatchPrompt([file]);

          assertStringIncludes(result, 'deep.md');
          assert(!result.includes('sub/'));
        });
      });
    });

    describe('When: エッジケース - フロントマターのみ・ターンマーカーなし・長大本文で本文が空または切り詰められる', () => {
      /** フロントマターのみのファイルでヘッダーは出力され本文が空になることを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-02 - フロントマターのみのファイルは本文が空になる', () => {
        it('T-FL-BP-02-01: [Edgecase] "=== FILE 1:" ヘッダーは出力される', async () => {
          const file = `${chatlogsDir}/empty.md`;
          await Deno.writeTextFile(file, makeFrontmatter('空'));

          const result = await buildBatchPrompt([file]);

          assertStringIncludes(result, '=== FILE 1:');
        });

        it('T-FL-BP-02-02: [Edgecase] ヘッダーに続く本文が空になる', async () => {
          const file = `${chatlogsDir}/empty.md`;
          await Deno.writeTextFile(file, makeFrontmatter('空'));

          const result = await buildBatchPrompt([file]);

          assertEquals(result.split('===\n')[1].trim(), '');
        });
      });

      /**
       * `### User`/`### Assistant` マーカーのない生テキスト本文では
       * `parseConversation` がターンを検出しないため本文が空になることを検証する。
       */
      describe('Then: [Edgecase] T-FL-BP-03 - ターンマーカーのないファイルは本文が空になる', () => {
        it('T-FL-BP-03-01: [Edgecase] "=== FILE 1:" ヘッダーは出力される', async () => {
          const file = `${chatlogsDir}/plain.md`;
          await Deno.writeTextFile(file, makePlainContent('生テキスト', 'これは会話形式でない生テキストです。'));

          const result = await buildBatchPrompt([file]);

          assertStringIncludes(result, '=== FILE 1:');
        });

        it('T-FL-BP-03-02: [Edgecase] ヘッダーに続く本文が空になる', async () => {
          const file = `${chatlogsDir}/plain.md`;
          await Deno.writeTextFile(file, makePlainContent('生テキスト', 'これは会話形式でない生テキストです。'));

          const result = await buildBatchPrompt([file]);

          assertEquals(result.split('===\n')[1].trim(), '');
        });
      });

      /** `MAX_BODY_CHARS`（8000）を超える本文は切り詰められ、出力が肥大化しないことを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-04 - 長大な本文は切り詰められる', () => {
        it('T-FL-BP-04-01: [Edgecase] 結果の長さが無制限に増大しない', async () => {
          const longText = 'x'.repeat(OVER_MAX_CHARS_LENGTH);
          const file = `${chatlogsDir}/long.md`;
          await Deno.writeTextFile(file, makeValidContent('Long', longText, '回答'));

          const result = await buildBatchPrompt([file]);

          // MAX_BODY_CHARS=8000 + ヘッダー分で合理的な範囲内に収まる
          assertEquals(result.length < MAX_PROMPT_LENGTH, true);
        });
      });
    });
  });

  /**
   * 複数（2 件）の .md ファイルを渡す前提条件グループ。
   *
   * 複数ファイルの結合動作を検証する最小ケース。
   */
  describe('Given: 複数（2 件）の .md ファイルを渡す', () => {
    let tempDir: string;
    let chatlogsDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogsDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    describe('When: 正常系 - 2 ファイルが \\n\\n 区切りで結合され FILE 1/2 ヘッダーが出力される', () => {
      /** 2 ファイルが `\n\n` 区切りで順番に結合されることを検証する。 */
      describe('Then: [Normal] T-FL-BP-05 - 2 ファイルが \\n\\n 区切りで結合される', () => {
        it('T-FL-BP-05-01: [Normal] FILE 1/2 のヘッダーにそれぞれのファイル名が対応して出力される', async () => {
          const file1 = `${chatlogsDir}/chat-a.md`;
          const file2 = `${chatlogsDir}/chat-b.md`;
          await Deno.writeTextFile(file1, makeValidContent('A', '質問A', '回答A'));
          await Deno.writeTextFile(file2, makeValidContent('B', '質問B', '回答B'));

          const result = await buildBatchPrompt([file1, file2]);

          assertStringIncludes(result, '=== FILE 1: chat-a.md ===');
          assertStringIncludes(result, '=== FILE 2: chat-b.md ===');
        });

        it('T-FL-BP-05-02: [Normal] FILE 2 ヘッダーの直前が \\n\\n で区切られる', async () => {
          const file1 = `${chatlogsDir}/chat-a.md`;
          const file2 = `${chatlogsDir}/chat-b.md`;
          await Deno.writeTextFile(file1, makeValidContent('A', '質問A', '回答A'));
          await Deno.writeTextFile(file2, makeValidContent('B', '質問B', '回答B'));

          const result = await buildBatchPrompt([file1, file2]);

          assertStringIncludes(result, '\n\n=== FILE 2:');
        });
      });
    });
  });

  /**
   * CHUNK_SIZE（10 件）の .md ファイルを渡す前提条件グループ。
   *
   * 実運用の最大バッチサイズ（`CHUNK_SIZE=10`）での動作を検証する境界値テスト。
   */
  describe(`Given: CHUNK_SIZE（${CHUNK_SIZE} 件）の .md ファイルを渡す`, () => {
    let tempDir: string;
    let chatlogsDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogsDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    describe(`When: 正常系 - FILE 1〜${CHUNK_SIZE} が正しくナンバリングされて出力される`, () => {
      /** FILE 1 〜 FILE 10 まで正しくナンバリングされて出力されることを検証する。 */
      describe(`Then: [Normal] T-FL-BP-06 - FILE 1 〜 FILE ${CHUNK_SIZE} が正しく出力される`, () => {
        it(`T-FL-BP-06-01: [Normal] "=== FILE ${CHUNK_SIZE}:" が含まれる`, async () => {
          const files: string[] = [];
          for (let i = 1; i <= CHUNK_SIZE; i++) {
            const file = `${chatlogsDir}/chat-${i}.md`;
            await Deno.writeTextFile(file, makeValidContent(`タイトル${i}`, `質問${i}`, `回答${i}`));
            files.push(file);
          }

          const result = await buildBatchPrompt(files);

          assertStringIncludes(result, `=== FILE ${CHUNK_SIZE}:`);
        });

        it('T-FL-BP-06-02: [Normal] すべての FILE ヘッダーが連続して含まれる', async () => {
          const files: string[] = [];
          for (let i = 1; i <= CHUNK_SIZE; i++) {
            const file = `${chatlogsDir}/chat-${i}.md`;
            await Deno.writeTextFile(file, makeValidContent(`タイトル${i}`, `質問${i}`, `回答${i}`));
            files.push(file);
          }

          const result = await buildBatchPrompt(files);

          for (let i = 1; i <= CHUNK_SIZE; i++) {
            assertStringIncludes(result, `=== FILE ${i}:`);
          }
        });
      });
    });
  });

  /**
   * 存在しないファイルパスが渡される前提条件グループ。
   *
   * fail-fast で `ChatlogError('FileDirNotFound')` を throw することを検証する。
   */
  describe('Given: 存在しないファイルパスが渡される', () => {
    describe('When: 異常系 - 存在しないパスのみで ChatlogError(FileDirNotFound) が throw される', () => {
      /** `ChatlogError(FileDirNotFound)` が throw されることを検証する。 */
      describe('Then: [Error] T-FL-BP-07 - ChatlogError(FileDirNotFound) が throw される', () => {
        it('T-FL-BP-07-01: [Error] ChatlogError(FileDirNotFound) を throw する', async () => {
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
   * 有効ファイルと存在しないファイルが混在する前提条件グループ。
   *
   * 有効ファイルの後に存在しないパスがあるとき逐次 fail-fast で throw することを検証する。
   */
  describe('Given: 有効ファイルと存在しないファイルが混在する', () => {
    let tempDir: string;
    let chatlogsDir: string;

    beforeEach(async () => {
      ({ tempDir, chatlogsDir } = await makeTestDirs());
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    describe('When: 異常系 - 有効ファイルの後に存在しないパスがあり fail-fast で ChatlogError が throw される', () => {
      /** `ChatlogError(FileDirNotFound)` が throw されることを検証する。 */
      describe('Then: [Error] T-FL-BP-08 - ChatlogError(FileDirNotFound) が throw される', () => {
        it('T-FL-BP-08-01: [Error] ChatlogError(FileDirNotFound) を throw する', async () => {
          const validFile = `${chatlogsDir}/valid.md`;
          await Deno.writeTextFile(validFile, makeValidContent('有効'));
          const nonExistent = '/nonexistent/missing.md';

          const err = await assertRejects(
            () => buildBatchPrompt([validFile, nonExistent]),
            ChatlogError,
          );

          assertEquals((err as ChatlogError).kind, 'FileDirNotFound');
        });
      });
    });
  });

  /**
   * 空の配列が渡される前提条件グループ。
   *
   * I/O を行わず空文字列を返すことを検証する。
   */
  describe('Given: 空の配列が渡される', () => {
    describe('When: エッジケース - ファイル 0 件で I/O なしに空文字列が返される', () => {
      /** 空文字列が返されることを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-09 - 空文字列が返される', () => {
        it('T-FL-BP-09-01: [Edgecase] 戻り値が "" である', async () => {
          const result = await buildBatchPrompt([]);

          assertEquals(result, '');
        });
      });
    });
  });
});
