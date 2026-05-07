// src: scripts/libs/__tests__/unit/backup-old-path.unit.spec.ts
// @(#): backupOldPath のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { backupOldPath } from '../../backup-old-path.ts';

// ─── Internal Helpers

// functions
/** ファイルが常に存在するように見せる `StatProvider` フェイク。 */
const _fakeStatExists = (_path: string): Promise<Deno.FileInfo> => Promise.resolve({ isFile: true } as Deno.FileInfo);

// ─── Tests

/**
 * `backupOldPath` のユニットテストスイート。
 *
 * Fake の listDir / statProvider を使い、Deno ファイルシステムに依存せず
 * エラー処理ロジックをカバーする。
 *
 * @see backupOldPath
 */
describe('backupOldPath', () => {
  // ─── グループ05: バックアップスロット上限超過 ──────────────────────────────

  describe('Given: バックアップスロット 99 まで全て埋まっている', () => {
    describe('When: backupOldPath を呼ぶ', () => {
      describe('Then: T-LIB-B-05 - Error をスローする', () => {
        it('T-LIB-B-05-01: "too many backups" を含む Error がスローされる', async () => {
          // arrange
          const outputPath = '/fake/output.md';

          // フェイクの listDir: スロット 01〜99 が全て使用中を返す
          // deno-lint-ignore require-await
          const fakeListDir = async (_dir: string): Promise<string[]> => {
            return Array.from({ length: 99 }, (_, i) => `output.old-${String(i + 1).padStart(2, '0')}.md`);
          };

          // act & assert
          await assertRejects(
            () => backupOldPath(outputPath, fakeListDir, _fakeStatExists),
            Error,
            'too many backups',
          );
        });
      });
    });
  });
});
