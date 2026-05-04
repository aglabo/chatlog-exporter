// src: scripts/__tests__/functional/filter/prefilter-files.functional.spec.ts
// @(#): prefilterFiles の機能テスト
//       実 tempdir を使用した事前フィルタリングの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { prefilterFiles } from '../../../filter-chatlog.ts';

// ─── Internal Helpers

/** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

/**
 * 最小限の有効な会話コンテンツ文字列を生成する。
 *
 * User ターン 500 文字 + Assistant ターン 500 文字で合計 1000 文字を超え、
 * `prefilterFiles` の本文長チェックを通過する標準的な .md コンテンツを返す。
 *
 * @returns frontmatter + User/Assistant ターンを含む Markdown 文字列
 */
function _makeValidContent(): string {
  const userText = 'u'.repeat(500);
  const assistantText = 'a'.repeat(500);
  return `---\ntitle: テスト\n---\n### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
}

// ─── Tests

/**
 * `prefilterFiles` 関数の機能テストスイート。
 *
 * `prefilterFiles(files)` はファイル名パターンと本文長の 2 段階でノイズを除外し、
 * 通過したファイルパスの配列を返す。
 *
 * ## 除外条件
 * - ファイル名が除外パターンに一致する（例: `say-ok-and-nothing-else.md`）
 * - 本文（frontmatter を除いた部分）が空または 1000 文字未満
 *
 * テスト ID 範囲: T-FL-PFF-01 〜 T-FL-PFF-04
 *
 * @see prefilterFiles
 */
describe('prefilterFiles', () => {
  /**
   * 除外パターンに一致するファイル名を持つファイルを入力とする前提条件グループ。
   *
   * ファイルの内容が有効であっても、ファイル名パターンによってスキップされることを検証する。
   */
  describe('Given: 除外パターンのファイル名を持つファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-01 - ファイルがスキップされる', () => {
        it('T-FL-PFF-01-01: say-ok-and-nothing-else.md は通過しない', async () => {
          const filePath = `${tempDir}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath]);
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * frontmatter のみで本文が空のファイルを入力とする前提条件グループ。
   *
   * 本文なし（0 文字）のファイルが除外されることを検証する。
   */
  describe('Given: frontmatter のみで本文がないファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-02 - ファイルがスキップされる', () => {
        it('T-FL-PFF-02-01: body が空のファイルは通過しない', async () => {
          const filePath = `${tempDir}/empty-body.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath]);
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * 本文が 1000 文字未満の短すぎるファイルを入力とする前提条件グループ。
   *
   * 本文が短すぎるファイルが除外されることを検証する。
   */
  describe('Given: 本文が短すぎるファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルがスキップされ、結果に含まれないことを検証する。 */
      describe('Then: T-FL-PFF-03 - ファイルがスキップされる', () => {
        it('T-FL-PFF-03-01: 短い本文のファイルは通過しない', async () => {
          const filePath = `${tempDir}/short.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath]);
          errStub.restore();

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * ファイル名が正常かつ本文が十分な長さを持つファイルを入力とする前提条件グループ。
   *
   * 有効なファイルが通過し、複数ファイル混在時は有効なファイルのみ通過することを検証する。
   */
  describe('Given: 正常なコンテンツを持つファイル', () => {
    /** prefilterFiles([file]) を呼び出すとき。 */
    describe('When: prefilterFiles([file]) を呼び出す', () => {
      /** ファイルが通過し、結果に含まれることを検証する。 */
      describe('Then: T-FL-PFF-04 - ファイルが通過する', () => {
        it('T-FL-PFF-04-01: 正常なファイルは通過する', async () => {
          const filePath = `${tempDir}/normal.md`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([filePath]);
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0], filePath);
        });

        it('T-FL-PFF-04-02: 複数ファイルのうち正常なものだけ通過する', async () => {
          const validPath = `${tempDir}/valid.md`;
          const shortPath = `${tempDir}/short.md`;
          await Deno.writeTextFile(validPath, _makeValidContent());
          await Deno.writeTextFile(shortPath, '---\ntitle: 短い\n---\n短い本文\n');
          const errStub = stub(console, 'error', () => {});

          const result = await prefilterFiles([validPath, shortPath]);
          errStub.restore();

          assertEquals(result.length, 1);
          assertEquals(result[0], validPath);
        });
      });
    });
  });
});
