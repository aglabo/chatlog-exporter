// src: scripts/modules/__tests__/functional/load-all-entries.functional.spec.ts
// @(#): loadAllEntries の機能テスト
//       対象: loadAllEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadAllEntries } from '../../setfm-entry-loader.ts';

// ─── Helpers
// types
import type { Stats } from '../../../types/phase.types.ts';

// ─── Internal Helpers

// functions
/** `Stats` の初期値を生成する。 */
const _makeStats = (): Stats => ({ total: 0, success: 0, fail: 0, skip: 0, written: 0 });

/** 有効な `.md` ファイルを tempDir に書き込む（`#` ヘッダーあり）。 */
const _writeValidMd = async (dir: string, filename: string): Promise<string> => {
  const filePath = `${dir}/${filename}`;
  await Deno.writeTextFile(filePath, `# タイトル\n本文テキスト`);
  return filePath;
};

/** スキップされる `.md` ファイルを tempDir に書き込む（`#` ヘッダーなし）。 */
const _writeSkipMd = async (dir: string, filename: string): Promise<string> => {
  const filePath = `${dir}/${filename}`;
  await Deno.writeTextFile(filePath, 'ヘッダーなしの本文テキスト');
  return filePath;
};

// ─── Tests

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

/**
 * `loadAllEntries` のユニットテストスイート。
 *
 * ファイル一覧取得・エントリ読み込み・スキップカウント・stats更新を検証する。
 *
 * テスト ID 範囲: T-SF-LAE-01 〜 T-SF-LAE-03
 *
 * @see loadAllEntries
 */
describe('loadAllEntries', () => {
  /**
   * 有効ファイルのみのディレクトリに対する正常系テスト。
   *
   * `entries` に全件が入り、`stats.total` と `stats.skip` が正しく設定されることを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-LAE-01-01: 有効 3件 → entries の件数が 3 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeValidMd(tempDir, 'c.md');
      const stats = _makeStats();

      const entries = await loadAllEntries(tempDir, stats);

      assertEquals(entries.length, 3);
    });

    it('[Normal] T-SF-LAE-01-02: 有効 3件 → stats.total が 3 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeValidMd(tempDir, 'c.md');
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.total, 3);
    });

    it('[Normal] T-SF-LAE-01-03: 有効 3件 → stats.skip が 0 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeValidMd(tempDir, 'c.md');
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.skip, 0);
    });
  });

  /**
   * 有効ファイルとスキップファイルが混在するディレクトリに対するテスト。
   *
   * スキップされたファイルが `entries` に含まれず、`stats.skip` がインクリメントされることを検証する。
   */
  describe('When: 正常系（スキップあり）', () => {
    it('[Normal] T-SF-LAE-02-01: 有効 2件 + スキップ 1件 → entries の件数が 2 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeSkipMd(tempDir, 'skip.md');
      const stats = _makeStats();

      const entries = await loadAllEntries(tempDir, stats);

      assertEquals(entries.length, 2);
    });

    it('[Normal] T-SF-LAE-02-02: 有効 2件 + スキップ 1件 → stats.total が 3 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeSkipMd(tempDir, 'skip.md');
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.total, 3);
    });

    it('[Normal] T-SF-LAE-02-03: 有効 2件 + スキップ 1件 → stats.skip が 1 になる', async () => {
      await _writeValidMd(tempDir, 'a.md');
      await _writeValidMd(tempDir, 'b.md');
      await _writeSkipMd(tempDir, 'skip.md');
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.skip, 1);
    });
  });

  /**
   * エッジケース: 空ディレクトリに対するテスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-LAE-03-01: 空ディレクトリ → entries が空になる', async () => {
      const stats = _makeStats();

      const entries = await loadAllEntries(tempDir, stats);

      assertEquals(entries.length, 0);
    });

    it('[Edge] T-SF-LAE-03-02: 空ディレクトリ → stats.total が 0 になる', async () => {
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.total, 0);
    });

    it('[Edge] T-SF-LAE-03-03: 空ディレクトリ → stats.skip が 0 になる', async () => {
      const stats = _makeStats();

      await loadAllEntries(tempDir, stats);

      assertEquals(stats.skip, 0);
    });
  });
});
