// src: scripts/__tests__/functional/libs/classify-file.functional.spec.ts
// @(#): classifyFile の機能テスト
//       対象: classifyFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyFile } from '../../../libs/classify-file.ts';

// ─── Tests

/**
 * `classifyFile` 関数の機能テストスイート。
 *
 * `classifyFile(file)` は単一ファイルの `filename` にファイル名パターン一致チェックを適用し、
 * マッチした場合のみ `NoiseDiscardFile` を返す。マッチしない場合は `null` を返す。
 *
 * テスト ID 範囲: T-PF-CL-01
 *
 * @see classifyFile
 */
describe('classifyFile', () => {
  /**
   * 除外パターンに一致するファイル名（`say-ok-and-nothing-else.md`）の前提条件グループ。
   *
   * ファイル名だけで判定対象になることを検証する。
   */
  describe('Given: "say-ok-and-nothing-else.md" というファイル', () => {
    /** classifyFile(file) を呼び出すとき。 */
    describe('When: classifyFile(file) を呼び出す', () => {
      /** 戻り値が該当ファイルの NoiseDiscardFile となり、reason にファイル名パターンの説明が含まれることを検証する。 */
      describe('Then: T-PF-CL-01 - 該当ファイルが NoiseDiscardFile として返される', () => {
        it('T-PF-CL-01-01: 戻り値が該当ファイルの NoiseDiscardFile になる', () => {
          const result = classifyFile({
            filePath: '/a/say-ok-and-nothing-else.md',
            filename: 'say-ok-and-nothing-else.md',
          });

          assertEquals(result?.filePath, '/a/say-ok-and-nothing-else.md');
          assertEquals(result?.filename, 'say-ok-and-nothing-else.md');
        });

        it('T-PF-CL-01-02: reason に "ファイル名パターン:" が含まれる', () => {
          const result = classifyFile({
            filePath: '/a/say-ok-and-nothing-else.md',
            filename: 'say-ok-and-nothing-else.md',
          });

          assertEquals(result?.reason.includes('ファイル名パターン:'), true);
        });
      });
    });
  });

  /**
   * ファイル名パターンに一致しない通常ファイル名の前提条件グループ。
   *
   * 戻り値が `null` になることを検証する。
   */
  describe('Given: 通常ファイル名のファイル', () => {
    /** classifyFile(file) を呼び出すとき。 */
    describe('When: classifyFile(file) を呼び出す', () => {
      /** 戻り値が `null` であることを検証する。 */
      describe('Then: T-PF-CL-01 - null が返される', () => {
        it('T-PF-CL-01-03: 戻り値が null になる', () => {
          const result = classifyFile({ filePath: '/a/valid-chat.md', filename: 'valid-chat.md' });

          assertEquals(result, null);
        });
      });
    });
  });
});
