// src: scripts/__tests__/functional/filter/build-batch-prompt.functional.spec.ts
// @(#): buildBatchPrompt の機能テスト
//       実ファイルを使用したバッチプロンプト構築の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../../filter-chatlog.ts';

// ─── Helpers
import { makePeriodDir } from '../../_helpers/chatlog-fixtures.ts';

// ─── Internal Helpers

// ─── Tests

/**
 * `buildBatchPrompt` 関数の機能テストスイート。
 *
 * `buildBatchPrompt(files)` は複数の .md ファイルを読み込み、
 * `=== FILE N: filename ===` 形式のヘッダ付きバッチプロンプト文字列を生成する。
 * 本文が `MAX_BODY_CHARS`（8000）を超える場合は切り詰める。
 *
 * テスト ID 範囲: T-FL-BP-01 〜 T-FL-BP-02
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス。 */
  let periodDir1: string;

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 通常の .md ファイル（2 件）を入力とする前提条件グループ。
   *
   * 各ファイルが `=== FILE N: filename ===` 形式でプロンプトに埋め込まれることを検証する。
   */
  describe('Given: 2 つのファイル', () => {
    /** buildBatchPrompt([file1, file2]) を呼び出すとき。 */
    describe('When: buildBatchPrompt([file1, file2]) を呼び出す', () => {
      /** `=== FILE N: filename ===` 形式で結合されることを検証する。 */
      describe('Then: T-FL-BP-01 - === FILE N: filename === 形式で結合される', () => {
        it('T-FL-BP-01-01: "=== FILE 1:" を含む', async () => {
          const file1 = `${periodDir1}/chat-a.md`;
          await Deno.writeTextFile(
            file1,
            '---\ntitle: テスト\n---\n### User\n質問\n\n### Assistant\n回答\n',
          );

          const result = await buildBatchPrompt([file1]);

          assertStringIncludes(result, '=== FILE 1:');
        });

        it('T-FL-BP-01-02: ファイル名が含まれる', async () => {
          const file1 = `${periodDir1}/my-chatlog.md`;
          await Deno.writeTextFile(
            file1,
            '---\ntitle: テスト\n---\n### User\n質問\n\n### Assistant\n回答\n',
          );

          const result = await buildBatchPrompt([file1]);

          assertStringIncludes(result, 'my-chatlog.md');
        });

        it('T-FL-BP-01-03: 2 ファイルで "=== FILE 2:" も含まれる', async () => {
          const file1 = `${periodDir1}/chat-a.md`;
          const file2 = `${periodDir1}/chat-b.md`;
          await Deno.writeTextFile(
            file1,
            '---\ntitle: A\n---\n### User\n質問A\n\n### Assistant\n回答A\n',
          );
          await Deno.writeTextFile(
            file2,
            '---\ntitle: B\n---\n### User\n質問B\n\n### Assistant\n回答B\n',
          );

          const result = await buildBatchPrompt([file1, file2]);

          assertStringIncludes(result, '=== FILE 1:');
          assertStringIncludes(result, '=== FILE 2:');
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
    /** buildBatchPrompt([file]) を呼び出すとき。 */
    describe('When: buildBatchPrompt([file]) を呼び出す', () => {
      /** 本文が切り詰められ、結果長が合理的な範囲に収まることを検証する。 */
      describe('Then: T-FL-BP-02 - 本文が切り詰められる', () => {
        it('T-FL-BP-02-01: 結果の長さが無制限に増大しない', async () => {
          const longText = 'x'.repeat(20000);
          const file = `${periodDir1}/long.md`;
          await Deno.writeTextFile(
            file,
            `---\ntitle: Long\n---\n### User\n${longText}\n\n### Assistant\n回答\n`,
          );

          const result = await buildBatchPrompt([file]);

          // MAX_BODY_CHARS=8000 + ヘッダー分で合理的な範囲内に収まる
          assertEquals(result.length < 10000, true);
        });
      });
    });
  });
});
