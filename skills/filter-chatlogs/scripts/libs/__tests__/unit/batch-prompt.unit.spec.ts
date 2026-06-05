// src: skills/filter-chatlogs/scripts/libs/__tests__/unit/batch-prompt.unit.spec.ts
// @(#): buildBatchPrompt のユニットテスト
//       対象: buildBatchPrompt
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertFalse, assertMatch, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../batch-prompt.ts';

// ─── Internal Helpers

// constants
/** テスト用の単純な会話形式本文（frontmatter なし）。 */
const _SIMPLE_BODY = `### User\nHello world\n\n### Assistant\nHi there`;

/** frontmatter 付きの本文。ChatlogEntry で frontmatter が除去されることを確認する。 */
const _BODY_WITH_FRONTMATTER = `---\ntitle: Test\ndate: 2026-01-01\n---\n\n${_SIMPLE_BODY}`;

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
 * `buildBatchPrompt` のユニットテストスイート。
 *
 * ファイルパスの配列を受け取り、本文を連結したバッチプロンプト文字列を返す動作を検証する。
 * ヘッダー形式は `=== <filename> ===` で、各ブロックは `\n` で結合される。
 *
 * テスト ID 範囲: T-PF-BP-01 〜 T-PF-BP-03
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
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
   * `正常系` のテスト。
   *
   * 単一ファイル・複数ファイルの動作を検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-BP-01-01: 単一ファイル → "=== <filename> ===" ヘッダを含む文字列を返す', async () => {
      const path = await _makeTempFile(_SIMPLE_BODY);
      tempFiles.push(path);
      const filename = path.split(/[/\\]/).pop()!;

      const result = await buildBatchPrompt([path]);

      assertMatch(result, new RegExp(`^=== ${filename} ===`));
    });

    it('[Normal] T-PF-BP-01-02: 複数ファイル → 各ブロックが含まれる文字列を返す', async () => {
      const path1 = await _makeTempFile(_SIMPLE_BODY);
      const path2 = await _makeTempFile(_SIMPLE_BODY);
      tempFiles.push(path1, path2);
      const filename1 = path1.split(/[/\\]/).pop()!;
      const filename2 = path2.split(/[/\\]/).pop()!;

      const result = await buildBatchPrompt([path1, path2]);

      assertMatch(result, new RegExp(`=== ${filename1} ===`));
      assertMatch(result, new RegExp(`=== ${filename2} ===`));
    });
  });

  /**
   * `エッジケース` のテスト。
   *
   * 空配列・frontmatter 付き内容を検証する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-BP-02-01: 空の files 配列 → 空文字列を返す', async () => {
      const result = await buildBatchPrompt([]);

      assertEquals(result, '');
    });

    it('[Edge] T-PF-BP-02-03: frontmatter 付きの内容 → frontmatter が除去されて本文のみ返す', async () => {
      const path = await _makeTempFile(_BODY_WITH_FRONTMATTER);
      tempFiles.push(path);

      const result = await buildBatchPrompt([path]);

      // frontmatter のキーが出力に含まれないことを確認する
      assertFalse(result.includes('title: Test'));
      assertFalse(result.includes('date: 2026-01-01'));
    });
  });

  /**
   * `異常系` のテスト。
   *
   * 存在しないファイルパスを渡した場合の例外伝播を検証する。
   */
  describe('When: 異常系', () => {
    it('[Error] T-PF-BP-03-01: 存在しないファイルパス → 例外が propagate される', async () => {
      await assertRejects(
        () => buildBatchPrompt(['/nonexistent/path/file.md']),
      );
    });
  });
});
