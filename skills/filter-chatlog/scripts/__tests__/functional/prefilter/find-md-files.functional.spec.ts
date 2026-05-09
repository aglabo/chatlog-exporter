// src: scripts/__tests__/functional/prefilter/find-md-files.functional.spec.ts
// @(#): prefilter-chatlog.ts の機能テスト
//       対象: findMdFiles — 実 tempdir を使用
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { findMdFiles } from '../../../prefilter-chatlog.ts';

// ─── Helpers
import { makePeriodDir } from '../../_helpers/chatlog-fixtures.ts';

// ─── Internal Helpers

/**
 * `tempDir` 内に codex エージェントの period ディレクトリを追加作成する。
 *
 * 2エージェント混在テスト（T-PF-FM-07）専用。claude 側の tempDir に codex のパスを追加する。
 *
 * @param tempDir - `makePeriodDir` で作成済みの一時ディレクトリ
 * @param period - 対象月（YYYY-MM 形式、例: '2026-03'）
 * @returns 作成した codex の月別ディレクトリの絶対パス
 */
const _makeCodexDir = async (tempDir: string, period: string): Promise<string> => {
  const yyyy = period.slice(0, 4);
  const dir = `${tempDir}/codex/${yyyy}/${period}`;
  await Deno.mkdir(dir, { recursive: true });
  return dir;
};

// ─── Tests

/**
 * `findMdFiles`（prefilter-chatlog 版）の機能テストスイート。
 *
 * `findMdFiles(baseDir, agent, period?)` は `baseDir/agent/YYYY/YYYY-MM/` 構造から
 * .md ファイルをソート済みで列挙する。`period` 指定で対象月を絞り込む。
 *
 * テスト ID 範囲: T-PF-FM-01 〜 T-PF-FM-07
 *
 * @see findMdFiles
 */
describe('findMdFiles (prefilter)', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス（claude/2026-03）。 */
  let periodDir1: string;

  /** period 絞り込みテスト用の追加月ディレクトリのパス（claude/2026-04）。 */
  let periodDir2: string;

  beforeEach(async () => {
    ({ tempDir, periodDir1, periodDir2 } = await makePeriodDir('claude', '2026-03', '2026-04'));
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * `tempDir/claude/2026/2026-03/` に .md ファイルが 2 件ある前提条件グループ。
   *
   * 2 件のファイルパスがソート済みで返されることを検証する。
   */
  describe('Given: tempDir/claude/2026/2026-03/ に .md ファイル 2 件', () => {
    /** findMdFiles(tempDir, "claude") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude") を呼び出す', () => {
      /** 2 件のファイルパスがソート済みで返されることを検証する。 */
      describe('Then: T-PF-FM-01 - 2 件のファイルパスがソート済みで返される', () => {
        it('T-PF-FM-01-01: 2 件のファイルパスが返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat-a.md`, '# A');
          await Deno.writeTextFile(`${periodDir1}/chat-b.md`, '# B');

          const result = await findMdFiles(tempDir, 'claude');

          assertEquals(result.length, 2);
        });

        it('T-PF-FM-01-02: ソート済みで返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat-b.md`, '# B');
          await Deno.writeTextFile(`${periodDir1}/chat-a.md`, '# A');

          const result = await findMdFiles(tempDir, 'claude');

          assertEquals(result[0].endsWith('chat-a.md'), true);
          assertEquals(result[1].endsWith('chat-b.md'), true);
        });
      });
    });
  });

  /**
   * 2026-03 と 2026-04 に各 1 件ずつファイルがある前提条件グループ。
   *
   * `period` 指定により、指定月のファイルのみ返されることを検証する。
   */
  describe('Given: 2026-03 と 2026-04 に各 1 件', () => {
    /** findMdFiles(tempDir, "claude", "2026-03") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude", "2026-03") を呼び出す', () => {
      /** 2026-03 のファイルのみ返されることを検証する。 */
      describe('Then: T-PF-FM-02 - 2026-03 のファイルのみ返される', () => {
        it('T-PF-FM-02-01: 1 件のみ返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat.md`, '# March');
          await Deno.writeTextFile(`${periodDir2}/chat.md`, '# April');

          const result = await findMdFiles(tempDir, 'claude', '2026-03');

          assertEquals(result.length, 1);
          assertEquals(result[0].includes('2026-03'), true);
        });
      });
    });
  });

  /**
   * 2026-03 と 2026-04 に各 1 件あり、`period` を指定しない前提条件グループ。
   *
   * `period` 未指定時は agent 配下の全ファイルが返されることを検証する。
   */
  describe('Given: 2026-03 と 2026-04 に各 1 件（period 指定なし）', () => {
    /** findMdFiles(tempDir, "claude") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude") を呼び出す', () => {
      /** 2 件全て返されることを検証する。 */
      describe('Then: T-PF-FM-04 - 2 件全て返される', () => {
        it('T-PF-FM-04-01: 2 件全て返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat.md`, '# March');
          await Deno.writeTextFile(`${periodDir2}/chat.md`, '# April');

          const result = await findMdFiles(tempDir, 'claude');

          assertEquals(result.length, 2);
        });
      });
    });
  });

  /**
   * `tempDir/claude/` ディレクトリが存在しない前提条件グループ。
   *
   * エラーを throw せず、空配列を返すことを検証する。
   */
  describe('Given: tempDir/claude/ が存在しない', () => {
    /** findMdFiles(tempDir, "claude") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude") を呼び出す', () => {
      /** 空配列が返されることを検証する。 */
      describe('Then: T-PF-FM-05 - 空配列が返される（エラーなし）', () => {
        it('T-PF-FM-05-01: 空配列が返される', async () => {
          const result = await findMdFiles(tempDir, 'codex');

          assertEquals(result.length, 0);
        });
      });
    });
  });

  /**
   * .md ファイルと .txt ファイルが混在する前提条件グループ。
   *
   * .md のみが返され、.txt が除外されることを検証する。
   */
  describe('Given: .md 1 件と .txt 1 件が混在', () => {
    /** findMdFiles(tempDir, "claude") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude") を呼び出す', () => {
      /** .md のみが返されることを検証する。 */
      describe('Then: T-PF-FM-06 - .md のみ返される', () => {
        it('T-PF-FM-06-01: 1 件のみ（.md のみ）返される', async () => {
          await Deno.writeTextFile(`${periodDir1}/chat.md`, '# MD');
          await Deno.writeTextFile(`${periodDir1}/note.txt`, 'text');

          const result = await findMdFiles(tempDir, 'claude');

          assertEquals(result.length, 1);
          assertEquals(result[0].endsWith('.md'), true);
        });
      });
    });
  });

  /**
   * `claude` と `codex` の 2 エージェントに各 1 件ずつファイルがある前提条件グループ。
   *
   * `agent` 指定により、別エージェントのファイルが除外されることを検証する。
   */
  describe('Given: tempDir/claude/ と tempDir/codex/ に各 1 件', () => {
    /** findMdFiles(tempDir, "claude") を呼び出すとき。 */
    describe('When: findMdFiles(tempDir, "claude") を呼び出す', () => {
      /** claude 配下の 1 件のみが返されることを検証する。 */
      describe('Then: T-PF-FM-07 - claude 配下の 1 件のみ返される', () => {
        it('T-PF-FM-07-01: claude 配下の 1 件のみが返される', async () => {
          const codexDir = await _makeCodexDir(tempDir, '2026-03');
          await Deno.writeTextFile(`${periodDir1}/claude-chat.md`, '# Claude');
          await Deno.writeTextFile(`${codexDir}/codex-chat.md`, '# Codex');

          const result = await findMdFiles(tempDir, 'claude');

          assertEquals(result.length, 1);
          assertEquals(result[0].includes('claude'), true);
        });
      });
    });
  });
});
