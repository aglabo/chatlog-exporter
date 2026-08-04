// src: skills/_cle-libs/libs/file-ops/__tests__/unit/backup-old-path.unit.spec.ts
// @(#): backupOldPath ユニットテスト（file-ops）
//       対象: backupOldPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
import { backupOldPath } from '../../backup-old-path.ts';

// ─── Internal Helpers

// functions
/** スロット 01〜99 が全て使用中（+ 元ファイル自身）を返す `GlobProvider` フェイク。 */
// deno-lint-ignore require-await
const _fakeGlobFull = async (_pattern: string): Promise<string[]> => [
  'output.md',
  ...Array.from({ length: 99 }, (_, i) => `output.old-${String(i + 1).padStart(2, '0')}.md`),
];

/** ファイルが存在しない（空配列）を返す `GlobProvider` フェイク。 */
// deno-lint-ignore require-await
const _fakeGlobEmpty = async (_pattern: string): Promise<string[]> => [];

// ─── Tests

/**
 * `backupOldPath` のユニットテストスイート（file-ops）。
 *
 * Fake の GlobProvider を使い、Deno ファイルシステムに依存せず
 * エラー処理ロジックおよびファイル不在時の正常終了をカバーする。
 *
 * テスト ID 範囲: T-LIB-B-05-01 〜 T-LIB-B-06-01
 *
 * @see backupOldPath
 */
describe('backupOldPath', () => {
  /**
   * `backupOldPath` の異常系・正常系テスト。
   *
   * スロット超過エラーとファイル不在の正常終了を検証する。
   */
  describe('backupOldPath', () => {
    /** バックアップスロットが 99 まで全て埋まっている場合のエラーケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-B-05-01: スロット 99 超過 → "too many backups" を含む Error がスローされる', async () => {
        // arrange
        const outputPath = '/fake/output.md';

        // act & assert
        const _err = await assertRejects(
          () => backupOldPath(outputPath, _fakeGlobFull),
          Error,
          'too many backups',
        ) as ChatlogError;
        assertEquals(_err.subindex, 'IndexOverflow');
      });
    });

    /** outputPath が存在しない場合の正常終了ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-B-06-01: ファイル不在（GlobProvider が空配列） → 例外なし正常終了', async () => {
        // arrange
        const outputPath = '/fake/nonexistent.md';

        // act & assert (例外がスローされないことを確認)
        await backupOldPath(outputPath, _fakeGlobEmpty);
      });
    });
  });
});
