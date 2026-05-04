// src: scripts/__tests__/functional/filter/find-md-files.functional.spec.ts
// @(#): findMdFiles の機能テスト
//       実 tempdir を使用したファイル列挙の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { findMdFiles } from '../../../filter-chatlog.ts';

// ─── Internal Helpers

/** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── Tests

/**
 * `findMdFiles` 関数の機能テストスイート。
 *
 * `findMdFiles(baseDir, period?, project?)` は YYYY/YYYY-MM/ 構造または
 * フラット構造（YYYY-MM/）のディレクトリから .md ファイルをソート済みで列挙する。
 * `period` 指定で対象月を絞り込み、`project` 指定でサブディレクトリを絞り込む。
 *
 * テスト ID 範囲: T-FL-FM-01 〜 T-FL-FM-05
 *
 * @see findMdFiles
 */
describe('findMdFiles', () => {
  /**
   * `YYYY/YYYY-MM/` 構造のディレクトリに .md ファイルが 2 件ある前提条件グループ。
   *
   * ファイルが 2 件返され、かつソート済みであることを検証する。
   */
  describe('Given: YYYY/YYYY-MM/ 構造のディレクトリに .md ファイルが 2 件', () => {
    /** findMdFiles(baseDir) を呼び出すとき。 */
    describe('When: findMdFiles(baseDir) を呼び出す', () => {
      /** 2 件のファイルパスがソート済みで返されることを検証する。 */
      describe('Then: T-FL-FM-01 - 2 件のファイルパスが返される', () => {
        it('T-FL-FM-01-01: 2 件の .md ファイルが返される', async () => {
          const monthDir = `${tempDir}/2026/2026-03`;
          await Deno.mkdir(monthDir, { recursive: true });
          await Deno.writeTextFile(`${monthDir}/chat-a.md`, '# A');
          await Deno.writeTextFile(`${monthDir}/chat-b.md`, '# B');

          const result = await findMdFiles(tempDir);

          assertEquals(result.length, 2);
        });

        it('T-FL-FM-01-02: ソート済みで返される', async () => {
          const monthDir = `${tempDir}/2026/2026-03`;
          await Deno.mkdir(monthDir, { recursive: true });
          await Deno.writeTextFile(`${monthDir}/chat-b.md`, '# B');
          await Deno.writeTextFile(`${monthDir}/chat-a.md`, '# A');

          const result = await findMdFiles(tempDir);

          assertEquals(result[0].endsWith('chat-a.md'), true);
          assertEquals(result[1].endsWith('chat-b.md'), true);
        });
      });
    });
  });

  /**
   * 複数月のディレクトリが存在し、`period` を指定する前提条件グループ。
   *
   * 指定月のファイルのみ返され、他月のファイルが除外されることを検証する。
   */
  describe('Given: 複数月のディレクトリがある場合に period 指定', () => {
    /** findMdFiles(baseDir, "2026-03") を呼び出すとき。 */
    describe('When: findMdFiles(baseDir, "2026-03") を呼び出す', () => {
      /** 指定月のファイルのみ返されることを検証する。 */
      describe('Then: T-FL-FM-02 - 指定月のファイルのみ返される', () => {
        it('T-FL-FM-02-01: period="2026-03" → その月のファイルのみ', async () => {
          const march = `${tempDir}/2026/2026-03`;
          const april = `${tempDir}/2026/2026-04`;
          await Deno.mkdir(march, { recursive: true });
          await Deno.mkdir(april, { recursive: true });
          await Deno.writeTextFile(`${march}/chat.md`, '# March');
          await Deno.writeTextFile(`${april}/chat.md`, '# April');

          const result = await findMdFiles(tempDir, '2026-03');

          assertEquals(result.length, 1);
          assertEquals(result[0].includes('2026-03'), true);
        });
      });
    });
  });

  /**
   * `period` と `project` を両方指定する前提条件グループ。
   *
   * 指定プロジェクトのサブディレクトリ内のファイルのみ返されることを検証する。
   */
  describe('Given: period と project を両方指定', () => {
    /** findMdFiles(baseDir, period, project) を呼び出すとき。 */
    describe('When: findMdFiles(baseDir, period, project) を呼び出す', () => {
      /** 該当プロジェクトのファイルのみ返されることを検証する。 */
      describe('Then: T-FL-FM-03 - 該当プロジェクトのファイルのみ返される', () => {
        it('T-FL-FM-03-01: project 指定 → そのプロジェクトのファイルのみ', async () => {
          const projA = `${tempDir}/2026/2026-03/proj-a`;
          const projB = `${tempDir}/2026/2026-03/proj-b`;
          await Deno.mkdir(projA, { recursive: true });
          await Deno.mkdir(projB, { recursive: true });
          await Deno.writeTextFile(`${projA}/chat.md`, '# ProjA');
          await Deno.writeTextFile(`${projB}/chat.md`, '# ProjB');

          const result = await findMdFiles(tempDir, '2026-03', 'proj-a');

          assertEquals(result.length, 1);
          assertEquals(result[0].includes('proj-a'), true);
        });
      });
    });
  });

  /**
   * 存在しないディレクトリパスを指定する前提条件グループ。
   *
   * エラーを throw せず、空配列を返すことを検証する。
   */
  describe('Given: 存在しないディレクトリを指定', () => {
    /** findMdFiles("/nonexistent/path") を呼び出すとき。 */
    describe('When: findMdFiles("/nonexistent/path") を呼び出す', () => {
      /** 空配列が返されることを検証する。 */
      describe('Then: T-FL-FM-04 - 空配列が返される（エラーなし）', () => {
        it('T-FL-FM-04-01: 存在しないディレクトリ → 空配列', async () => {
          const result = await findMdFiles(`${tempDir}/nonexistent`);

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * `YYYY/YYYY-MM/` ではなく `YYYY-MM/` のフラット構造を持つ前提条件グループ。
   *
   * ネスト構造が存在しない場合でもファイルが収集されることを検証する。
   */
  describe('Given: YYYY/YYYY-MM/ ではなく YYYY-MM/ のフラット構造', () => {
    /** findMdFiles(baseDir, "2026-03") を呼び出すとき。 */
    describe('When: findMdFiles(baseDir, "2026-03") を呼び出す', () => {
      /** フラット構造からもファイルが収集されることを検証する。 */
      describe('Then: T-FL-FM-05 - フラット構造からもファイルを収集する', () => {
        it('T-FL-FM-05-01: フラット構造でも .md ファイルが返される', async () => {
          const flatDir = `${tempDir}/2026-03`;
          await Deno.mkdir(flatDir, { recursive: true });
          await Deno.writeTextFile(`${flatDir}/chat.md`, '# Flat');

          const result = await findMdFiles(tempDir, '2026-03');

          assertEquals(result.length, 1);
        });
      });
    });
  });
});
