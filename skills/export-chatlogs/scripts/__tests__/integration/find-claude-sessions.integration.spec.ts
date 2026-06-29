// src: scripts/__tests__/integration/find-claude-sessions.integration.spec.ts
// @(#): findClaudeSessions の統合テスト（実ファイルシステム使用）
//       対象: findClaudeSessions
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
import { findClaudeSessions } from '../../exporter/claude-exporter.ts';
import { parsePeriod } from '../../libs/period-filter.ts';

// ─── Helpers
// types
import type { PeriodRange } from '../../types/filter.types.ts';

// ─── Internal Helpers

/** 期間フィルタを設定しない（全期間対象）`PeriodRange` 定数。テスト内で期間外除外を行わない場合に使用する。 */
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

// ─── Tests

/**
 * `findClaudeSessions` の統合テストスイート（実ファイルシステム使用）。
 *
 * `Deno.env.get` をスタブして `homeDir()` を一時ディレクトリに向け、
 * 実際のディレクトリ構造を作成して動作を検証する。以下のケースをカバーする:
 * - ~/.claude/projects/ 配下の複数プロジェクトディレクトリの走査
 * - subagents/ サブディレクトリ内ファイルの除外
 * - projects ディレクトリが存在しない場合の空配列返却（エラーなし）
 * - 結果の辞書順ソート
 *
 * 各テストは `Deno.makeTempDir()` で独立した home 環境を使用し、
 * `afterEach` で `envStub.restore()` とディレクトリ削除を行う。
 *
 * @see findClaudeSessions
 * @see homeDir
 */
describe('findClaudeSessions', () => {
  let tempDir: string;
  let envStub: Stub<typeof Deno.env, [key: string], string | undefined>;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    // homeDir() を tempDir に向ける
    envStub = stub(Deno.env, 'get', (key: string) => {
      if (key === 'USERPROFILE' || key === 'HOME') { return tempDir; }
      return undefined;
    });
  });

  afterEach(async () => {
    envStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-FS-01: projectsDir 走査 ─────────────────────────────────────────

  /**
   * 複数プロジェクトディレクトリの全ファイル収集シナリオ。
   * proj-a と proj-b に計 3 件の .jsonl があるとき、全件が収集されることを確認する。
   */
  describe('Given: ~/.claude/projects/ に2つのプロジェクトディレクトリと .jsonl ファイルがある', () => {
    /** findClaudeSessions(allPeriod) を呼び出す */
    describe('When: findClaudeSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const projectsDir = `${tempDir}/.claude/projects`;
        await Deno.mkdir(`${projectsDir}/proj-a`, { recursive: true });
        await Deno.mkdir(`${projectsDir}/proj-b`, { recursive: true });
        await Deno.writeTextFile(`${projectsDir}/proj-a/session1.jsonl`, '{}');
        await Deno.writeTextFile(`${projectsDir}/proj-a/session2.jsonl`, '{}');
        await Deno.writeTextFile(`${projectsDir}/proj-b/session3.jsonl`, '{}');
      });

      /** T-EC-FS-01: 全プロジェクトの .jsonl ファイルを収集する */
      describe('Then: T-EC-FS-01 - 全プロジェクトの .jsonl ファイルを収集する', () => {
        it('T-EC-FS-01-01: 収集ファイル数が 3', async () => {
          const results = await findClaudeSessions(ALL_PERIOD);
          assertEquals(results.length, 3);
        });

        it('T-EC-FS-01-02: 全パスが .jsonl で終わる', async () => {
          const results = await findClaudeSessions(ALL_PERIOD);
          assertEquals(results.every((f: string) => f.endsWith('.jsonl')), true);
        });
      });
    });
  });

  // ─── T-EC-FS-02: subagents/ ディレクトリの除外 ────────────────────────────

  /**
   * subagents/ ディレクトリ内ファイルを除外するシナリオ。
   * Claude Code がサブエージェント用に作成する subagents/ フォルダは
   * エクスポート対象外として除外されることを確認する。
   */
  describe('Given: プロジェクト内に subagents/ サブディレクトリがある', () => {
    /** findClaudeSessions(allPeriod) を呼び出す */
    describe('When: findClaudeSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const projectsDir = `${tempDir}/.claude/projects`;
        await Deno.mkdir(`${projectsDir}/proj-a/subagents`, { recursive: true });
        await Deno.writeTextFile(`${projectsDir}/proj-a/main.jsonl`, '{}');
        await Deno.writeTextFile(`${projectsDir}/proj-a/subagents/sub.jsonl`, '{}');
      });

      /** T-EC-FS-02: subagents/ 内ファイルは除外される */
      describe('Then: T-EC-FS-02 - subagents/ 内ファイルは除外される', () => {
        it('T-EC-FS-02-01: 収集ファイル数が 1（subagents 除外）', async () => {
          const results = await findClaudeSessions(ALL_PERIOD);
          assertEquals(results.length, 1);
        });

        it('T-EC-FS-02-02: 収集パスに "subagents" が含まれない', async () => {
          const results = await findClaudeSessions(ALL_PERIOD);
          assertEquals(results.every((f: string) => !f.includes('subagents')), true);
        });
      });
    });
  });

  // ─── T-EC-FS-04: projectsDir が存在しない → 空配列 ───────────────────────

  /**
   * projects ディレクトリが存在しない場合のエラーなし空配列返却シナリオ。
   * 初回実行や未セットアップ環境でもクラッシュせず空配列を返すことを確認する。
   */
  describe('Given: ~/.claude/projects/ が存在しない', () => {
    /** findClaudeSessions(allPeriod) を呼び出す */
    describe('When: findClaudeSessions(allPeriod) を呼び出す', () => {
      /** T-EC-FS-04: 空配列を返す（エラーなし） */
      describe('Then: T-EC-FS-04 - 空配列を返す（エラーなし）', () => {
        it('T-EC-FS-04-01: 空配列が返される', async () => {
          // tempDir に .claude/projects/ を作らない
          const results = await findClaudeSessions(ALL_PERIOD);
          assertEquals(results.length, 0);
        });
      });
    });
  });

  // ─── T-EC-FS-05: 結果がソートされている ──────────────────────────────────

  /**
   * 複数ファイルの辞書順ソート仕様の検証。
   * proj-z と proj-a をこの順で作成し、返却結果が辞書順（proj-a → proj-z）に
   * 並ぶことを確認する。エクスポート結果の再現性（冪等性）に必要な仕様。
   */
  describe('Given: 複数のファイルが存在する', () => {
    /** findClaudeSessions(allPeriod) を呼び出す */
    describe('When: findClaudeSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const projectsDir = `${tempDir}/.claude/projects`;
        await Deno.mkdir(`${projectsDir}/proj-z`, { recursive: true });
        await Deno.mkdir(`${projectsDir}/proj-a`, { recursive: true });
        await Deno.writeTextFile(`${projectsDir}/proj-z/session.jsonl`, '{}');
        await Deno.writeTextFile(`${projectsDir}/proj-a/session.jsonl`, '{}');
      });

      /** T-EC-FS-05: 結果がソートされている */
      describe('Then: T-EC-FS-05 - 結果がソートされている', () => {
        it('T-EC-FS-05-01: 返却パスが辞書順', async () => {
          const results = await findClaudeSessions(ALL_PERIOD);
          const sorted = [...results].sort();
          assertEquals(results, sorted);
        });
      });
    });
  });

  // ─── T-EC-FS-06: projectDir 引数で任意ディレクトリを指定 ─────────────────

  /**
   * projectDir 引数で任意ディレクトリを指定するシナリオ。
   * デフォルトの ~/.claude/projects ではなく指定パスを参照することで、
   * --base オプションによるカスタムベースディレクトリが機能することを確認する。
   */
  describe('Given: projectDir 引数に任意のディレクトリを指定する', () => {
    let customProjectsDir: string;

    beforeEach(async () => {
      customProjectsDir = normalizePath(await Deno.makeTempDir());
      await Deno.mkdir(`${customProjectsDir}/proj-x`, { recursive: true });
      await Deno.writeTextFile(`${customProjectsDir}/proj-x/session.jsonl`, '{}');
    });

    afterEach(async () => {
      await Deno.remove(customProjectsDir, { recursive: true });
    });

    /** findClaudeSessions(allPeriod, customProjectsDir) を呼び出す */
    describe('When: findClaudeSessions(allPeriod, customProjectsDir) を呼び出す', () => {
      /** T-EC-FS-06: 指定ディレクトリを参照してファイルを収集する */
      describe('Then: T-EC-FS-06 - 指定ディレクトリを参照してファイルを収集する', () => {
        it('T-EC-FS-06-01: 収集ファイル数が 1', async () => {
          const results = await findClaudeSessions(ALL_PERIOD, customProjectsDir);
          assertEquals(results.length, 1);
        });

        it('T-EC-FS-06-02: デフォルトの ~/.claude/projects は参照しない', async () => {
          const results = await findClaudeSessions(ALL_PERIOD, customProjectsDir);
          assertEquals(results.every((f: string) => f.includes(customProjectsDir)), true);
        });
      });
    });
  });
});
