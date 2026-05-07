// src: scripts/__tests__/_helpers/output-validator.ts
// @(#): 正規化出力ファイルの構造検証ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { readTextFile } from '../../libs/file-io/read-utils.ts';

/**
 * 正規化セグメント出力ファイルの構造を検証する。
 * YAML frontmatter の存在と ## Summary セクション、任意の追加フィールドを確認する。
 *
 * @param filePath - 検証対象ファイルのパス
 * @param options  - 追加検証オプション
 */
export async function assertOutputFile(
  filePath: string,
  options?: {
    expectFrontmatterField?: { key: string; value: string };
  },
): Promise<void> {
  const content = await readTextFile(filePath);

  assertEquals(
    content.startsWith('---\n'),
    true,
    `${filePath}: YAML frontmatter (---\\n) で始まる必要がある`,
  );

  assertEquals(
    content.includes('## Summary'),
    true,
    `${filePath}: ## Summary セクションが必要`,
  );

  if (options?.expectFrontmatterField) {
    const { key, value } = options.expectFrontmatterField;
    assertEquals(
      content.includes(`${key}: '${value}'`),
      true,
      `${filePath}: frontmatter に ${key}: '${value}' が必要`,
    );
  }
}

/**
 * ファイルパス配列の全件に対して assertOutputFile を実行する。
 *
 * @param files   - 検証対象ファイルパス配列
 * @param options - 各ファイルに適用する検証オプション
 */
export async function assertAllOutputFiles(
  files: string[],
  options?: Parameters<typeof assertOutputFile>[1],
): Promise<void> {
  for (const filePath of files) {
    await assertOutputFile(filePath, options);
  }
}
