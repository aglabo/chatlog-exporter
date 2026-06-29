// src: scripts/__tests__/integration/find-codex-sessions.integration.spec.ts
// @(#): findCodexSessions の統合テスト（実ファイルシステム使用）
//       対象: findCodexSessions
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
import { findCodexSessions } from '../../exporter/codex-exporter.ts';
import { parsePeriod } from '../../libs/period-filter.ts';

// ─── Helpers
// types
import type { PeriodRange } from '../../types/filter.types.ts';

// ─── Internal Helpers
/** 期間フィルタを設定しない（全期間対象）`PeriodRange` 定数。テスト内で期間外除外を行わない場合に使用する。 */
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

// ─── Tests

/**
 * `findCodexSessions` の統合テストスイート（実ファイルシステム使用）。
 *
 * `Deno.env.get` をスタブして `homeDir()` を一時ディレクトリに向け、
 * 実際のディレクトリ構造を作成して動作を検証する。以下のケースをカバーする:
 * - ~/.codex/sessions/YYYY/MM/DD/ 配下の .jsonl ファイル収集
 * - sessions ディレクトリが存在しない場合の空配列返却（エラーなし）
 * - 複数の年月ディレクトリにわたる全ファイルの収集
 * - 結果の辞書順ソート
 *
 * 各テストは `Deno.makeTempDir()` で独立した home 環境を使用し、
 * `afterEach` で `envStub.restore()` とディレクトリ削除を行う。
 *
 * @see findCodexSessions
 * @see homeDir
 */
describe('findCodexSessions', () => {
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

  // ─── T-EC-FX-01: sessionsDir 走査 ─────────────────────────────────────────

  /**
   * YYYY/MM/DD 階層の sessionsDir を再帰走査するシナリオ。
   * 複数日付ディレクトリにわたる全 .jsonl ファイルが収集されることを確認する。
   */
  describe('Given: ~/.codex/sessions/YYYY/MM/DD/ に .jsonl ファイルが存在する', () => {
    /** findCodexSessions(allPeriod) を呼び出す */
    describe('When: findCodexSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const sessionsDir = `${tempDir}/.codex/sessions`;
        await Deno.mkdir(`${sessionsDir}/2026/03/15`, { recursive: true });
        await Deno.mkdir(`${sessionsDir}/2026/03/16`, { recursive: true });
        await Deno.writeTextFile(`${sessionsDir}/2026/03/15/session1.jsonl`, '{}');
        await Deno.writeTextFile(`${sessionsDir}/2026/03/15/session2.jsonl`, '{}');
        await Deno.writeTextFile(`${sessionsDir}/2026/03/16/session3.jsonl`, '{}');
      });

      /** T-EC-FX-01: 全ての .jsonl ファイルを収集する */
      describe('Then: T-EC-FX-01 - 全ての .jsonl ファイルを収集する', () => {
        it('T-EC-FX-01-01: 収集ファイル数が 3', async () => {
          const results = await findCodexSessions(ALL_PERIOD);
          assertEquals(results.length, 3);
        });

        it('T-EC-FX-01-02: 全パスが .jsonl で終わる', async () => {
          const results = await findCodexSessions(ALL_PERIOD);
          assertEquals(results.every((f: string) => f.endsWith('.jsonl')), true);
        });
      });
    });
  });

  // ─── T-EC-FX-02: sessionsDir が存在しない → 空配列 ────────────────────────

  /**
   * sessions ディレクトリが存在しない場合のエラーなし空配列返却シナリオ。
   * codex 未使用の環境でもクラッシュせず空配列を返すことを確認する。
   */
  describe('Given: ~/.codex/sessions/ が存在しない', () => {
    /** findCodexSessions(allPeriod) を呼び出す */
    describe('When: findCodexSessions(allPeriod) を呼び出す', () => {
      /** T-EC-FX-02: 空配列を返す（エラーなし） */
      describe('Then: T-EC-FX-02 - 空配列を返す（エラーなし）', () => {
        it('T-EC-FX-02-01: 空配列が返される', async () => {
          // tempDir に .codex/sessions/ を作らない
          const results = await findCodexSessions(ALL_PERIOD);
          assertEquals(results.length, 0);
        });
      });
    });
  });

  // ─── T-EC-FX-03: 複数月にわたるセッション走査 ────────────────────────────

  /**
   * 複数年月にまたがるセッションが全件収集されるシナリオ。
   * 2025-12-31・2026-02-28・2026-03-01 に分散したファイルが
   * 再帰走査によりすべて収集されることを確認する。
   */
  describe('Given: 複数の年月ディレクトリに .jsonl ファイルが存在する', () => {
    /** findCodexSessions(allPeriod) を呼び出す */
    describe('When: findCodexSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const sessionsDir = `${tempDir}/.codex/sessions`;
        await Deno.mkdir(`${sessionsDir}/2026/02/28`, { recursive: true });
        await Deno.mkdir(`${sessionsDir}/2026/03/01`, { recursive: true });
        await Deno.mkdir(`${sessionsDir}/2025/12/31`, { recursive: true });
        await Deno.writeTextFile(`${sessionsDir}/2026/02/28/a.jsonl`, '{}');
        await Deno.writeTextFile(`${sessionsDir}/2026/03/01/b.jsonl`, '{}');
        await Deno.writeTextFile(`${sessionsDir}/2025/12/31/c.jsonl`, '{}');
      });

      /** T-EC-FX-03: 全月のファイルを収集する */
      describe('Then: T-EC-FX-03 - 全月のファイルを収集する', () => {
        it('T-EC-FX-03-01: 収集ファイル数が 3（全月）', async () => {
          const results = await findCodexSessions(ALL_PERIOD);
          assertEquals(results.length, 3);
        });
      });
    });
  });

  // ─── T-EC-FX-04: 結果がソートされている ──────────────────────────────────

  /**
   * 異なる日付ディレクトリにあるファイルの辞書順ソート仕様の検証。
   * 2026/03/16 と 2026/03/15 を逆順で作成し、返却結果が辞書順（15 → 16）に
   * 並ぶことを確認する。エクスポート結果の再現性（冪等性）に必要な仕様。
   */
  describe('Given: 複数のファイルが異なる日付ディレクトリに存在する', () => {
    /** findCodexSessions(allPeriod) を呼び出す */
    describe('When: findCodexSessions(allPeriod) を呼び出す', () => {
      beforeEach(async () => {
        const sessionsDir = `${tempDir}/.codex/sessions`;
        await Deno.mkdir(`${sessionsDir}/2026/03/16`, { recursive: true });
        await Deno.mkdir(`${sessionsDir}/2026/03/15`, { recursive: true });
        await Deno.writeTextFile(`${sessionsDir}/2026/03/16/session.jsonl`, '{}');
        await Deno.writeTextFile(`${sessionsDir}/2026/03/15/session.jsonl`, '{}');
      });

      /** T-EC-FX-04: 結果がソートされている */
      describe('Then: T-EC-FX-04 - 結果がソートされている', () => {
        it('T-EC-FX-04-01: 返却パスが辞書順', async () => {
          const results = await findCodexSessions(ALL_PERIOD);
          const sorted = [...results].sort();
          assertEquals(results, sorted);
        });
      });
    });
  });
});
