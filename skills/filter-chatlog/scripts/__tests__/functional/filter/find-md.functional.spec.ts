// src: scripts/__tests__/functional/filter/find-md.functional.spec.ts
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

// ─── Helpers
import { makePeriodDir } from '../../_helpers/chatlog-fixtures.ts';

// ─── Internal Helpers

// ─── Tests

/**
 * `findMdFiles` 関数の機能テストスイート。
 *
 * `findMdFiles(baseDir, period?)` は YYYY/YYYY-MM/ 構造の
 * ディレクトリから .md ファイルをソート済みで列挙する。
 * `period` 指定で対象月を絞り込む。
 *
 * テスト ID 範囲: T-FL-FM-01, T-FL-FM-02, T-FL-FM-04
 *
 * @see findMdFiles
 */
describe('findMdFiles', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** エージェントディレクトリのパス（tempDir/claude）。findMdFiles の baseDir に渡す。 */
  let agentDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス（2026-03）。 */
  let periodDir1: string;

  /** period 絞り込みテスト用の追加月ディレクトリのパス（2026-04）。 */
  let periodDir2: string;

  beforeEach(async () => {
    ({ tempDir, periodDir1, periodDir2 } = await makePeriodDir('claude', '2026-03', '2026-04'));
    agentDir = `${tempDir}/claude`;
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

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
          await Deno.writeTextFile(`${periodDir1}/chat-a.md`, '# A');
          await Deno.writeTextFile(`${periodDir1}/chat-b.md`, '# B');

          const result = await findMdFiles(agentDir);

          assertEquals(result.length, 2);
        });

        it('T-FL-FM-01-02: ソート済みで返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat-b.md`, '# B');
          await Deno.writeTextFile(`${periodDir1}/chat-a.md`, '# A');

          const result = await findMdFiles(agentDir);

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
          await Deno.writeTextFile(`${periodDir1}/chat.md`, '# March');
          await Deno.writeTextFile(`${periodDir2}/chat.md`, '# April');

          const result = await findMdFiles(agentDir, '2026-03');

          assertEquals(result.length, 1);
          assertEquals(result[0].includes('2026-03'), true);
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
          const result = await findMdFiles(`${agentDir}/nonexistent`);

          assertEquals(result.length, 0);
        });
      });
    });
  });
});
