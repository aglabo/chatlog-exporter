// src: scripts/__tests__/functional/parse-claude-session.functional.spec.ts
// @(#): parseClaudeSession の機能テスト
//       対象: parseClaudeSession
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../_scripts/__tests__/helpers/assert.ts';

// ─── Test target
import { parseClaudeSession } from '../../exporter/claude-exporter.ts';
import { parsePeriod } from '../../libs/period-filter.ts';

// ─── Helpers
import { writeJsonl } from '../_helpers/jsonl-writer.ts';
// types
import type { PeriodRange } from '../../types/filter.types.ts';

// ─── Internal Helpers

/** 期間フィルタを設定しない（全期間対象）`PeriodRange` 定数。テスト内で期間外除外を行わない場合に使用する。 */
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

// ─── Tests

/**
 * `parseClaudeSession` の機能テストスイート。
 *
 * 一時ディレクトリに JSONL ファイルを書き込み、実ファイル I/O を通じて
 * パース動作を検証する。ユニットテストでカバーできない以下の組み合わせ動作を対象とする:
 * - 正常系: user + assistant エントリから ExportedSession の各フィールドを正しく抽出
 * - スキップ対象のみ（全ユーザーメッセージが "yes"/"ok" 等）→ null
 * - 期間外タイムスタンプ → null
 * - ファイル不存在 → null
 * - 同一 message.id の assistant 複数エントリ → テキスト連結
 *
 * 各テストは `Deno.makeTempDir()` で独立した作業ディレクトリを使用し、
 * `afterEach` で自動クリーンアップする。
 *
 * @see parseClaudeSession
 * @see parsePeriod
 */
describe('parseClaudeSession', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-PC-01: 正常パース ────────────────────────────────────────────────

  /**
   * 最小構成 JSONL の正常パースシナリオ。
   *
   * user + assistant 各1エントリから sessionId・date・project・turns・firstUserText の
   * 全フィールドが正しく抽出されることを確認する。
   * cwd からプロジェクト名（my-app）を導出するロジックも含む。
   */
  describe('Given: user + assistant 各1エントリのJSONL', () => {
    /** `parseClaudeSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseClaudeSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/session.jsonl`;
        await writeJsonl(filePath, [
          {
            type: 'user',
            isMeta: false,
            sessionId: 'sess-0001-0001-0001-0001',
            timestamp: '2026-03-15T10:00:00.000Z',
            cwd: '/home/user/projects/my-app',
            message: { id: 'msg-u-001', content: [{ type: 'text', text: 'TDDについて説明してください' }] },
          },
          {
            type: 'assistant',
            isMeta: false,
            sessionId: 'sess-0001-0001-0001-0001',
            timestamp: '2026-03-15T10:00:05.000Z',
            message: { id: 'msg-a-001', content: [{ type: 'text', text: 'TDDはテストを先に書く開発手法です。' }] },
          },
        ]);
      });

      /** T-EC-PC-01: 正常にパースされる */
      describe('Then: T-EC-PC-01 - 正常にパースされる', () => {
        it('T-EC-PC-01-01: null でない ExportedSession を返す', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertNotNull(result);
        });

        it('T-EC-PC-01-02: meta.sessionId が "sess-0001-0001-0001-0001"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.sessionId, 'sess-0001-0001-0001-0001');
        });

        it('T-EC-PC-01-03: meta.date が "2026-03-15"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.date, '2026-03-15');
        });

        it('T-EC-PC-01-04: meta.project が "my-app"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.project, 'my-app');
        });

        it('T-EC-PC-01-05: turns の件数が 2', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns.length, 2);
        });

        it('T-EC-PC-01-06: turns[0].role が "user"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns[0].role, 'user');
        });

        it('T-EC-PC-01-07: turns[1].role が "assistant"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns[1].role, 'assistant');
        });

        it('T-EC-PC-01-08: firstUserText が "TDDについて説明してください"', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.firstUserText, 'TDDについて説明してください');
        });
      });
    });
  });

  // ─── T-EC-PC-02: スキップ対象のみ → null ───────────────────────────────────

  /**
   * 全ユーザーメッセージがスキップ対象のとき null を返すシナリオ。
   * "yes"・"ok" のような短文肯定しか含まないセッションは
   * エクスポート価値がないため除外されることを確認する。
   */
  describe('Given: 全ユーザーメッセージがスキップ対象のJSONL', () => {
    /** `parseClaudeSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseClaudeSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/skipped.jsonl`;
        await writeJsonl(filePath, [
          {
            type: 'user',
            isMeta: false,
            sessionId: 'sess-skip-0001',
            timestamp: '2026-03-15T10:00:00.000Z',
            cwd: '/home/user/projects/my-app',
            message: { id: 'msg-u-001', content: [{ type: 'text', text: 'yes' }] },
          },
          {
            type: 'user',
            isMeta: false,
            sessionId: 'sess-skip-0001',
            timestamp: '2026-03-15T10:00:01.000Z',
            cwd: '/home/user/projects/my-app',
            message: { id: 'msg-u-002', content: [{ type: 'text', text: 'ok' }] },
          },
          {
            type: 'assistant',
            isMeta: false,
            sessionId: 'sess-skip-0001',
            timestamp: '2026-03-15T10:00:05.000Z',
            message: { id: 'msg-a-001', content: [{ type: 'text', text: '了解しました。' }] },
          },
        ]);
      });

      /** T-EC-PC-02: null を返す */
      describe('Then: T-EC-PC-02 - null を返す', () => {
        it('T-EC-PC-02-01: null を返す', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertNull(result);
        });
      });
    });
  });

  // ─── T-EC-PC-03: 期間外 → null ─────────────────────────────────────────────

  /**
   * 期間外タイムスタンプのセッションを null で除外するシナリオ。
   * 2026-03 フィルタに対して 2026-02 のエントリは期間外と判定されることを確認する。
   */
  describe('Given: 期間外のタイムスタンプを持つJSONL', () => {
    /** 指定期間でフィルタしたときの結果を検証する。 */
    describe('When: parsePeriod("2026-03") の期間でフィルタする', () => {
      let filePath: string;
      let marchRange: PeriodRange;

      beforeEach(async () => {
        filePath = `${tempDir}/outside-period.jsonl`;
        marchRange = parsePeriod('2026-03');
        await writeJsonl(filePath, [
          {
            type: 'user',
            isMeta: false,
            sessionId: 'sess-outside-0001',
            timestamp: '2026-02-15T10:00:00.000Z', // 期間外: 2月
            cwd: '/home/user/projects/my-app',
            message: { id: 'msg-u-001', content: [{ type: 'text', text: '期間外のメッセージです' }] },
          },
          {
            type: 'assistant',
            isMeta: false,
            sessionId: 'sess-outside-0001',
            timestamp: '2026-02-15T10:00:05.000Z',
            message: { id: 'msg-a-001', content: [{ type: 'text', text: '期間外の回答です。' }] },
          },
        ]);
      });

      /** T-EC-PC-03: null を返す */
      describe('Then: T-EC-PC-03 - null を返す', () => {
        it('T-EC-PC-03-01: null を返す', async () => {
          const result = await parseClaudeSession(filePath, marchRange);
          assertNull(result);
        });
      });
    });
  });

  // ─── T-EC-PC-05: ファイル不存在 → null ────────────────────────────────────

  /**
   * ファイルが存在しないパスを渡したとき null を返すシナリオ。
   * エラーを throw せず null を返すことで呼び出し元がスキップ処理を続けられる設計の確認。
   */
  describe('Given: 存在しないファイルパス', () => {
    /** `parseClaudeSession(nonExistentPath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseClaudeSession(nonExistentPath, allPeriod) を呼び出す', () => {
      /** T-EC-PC-05: null を返す */
      describe('Then: T-EC-PC-05 - null を返す', () => {
        it('T-EC-PC-05-01: null を返す', async () => {
          const result = await parseClaudeSession(`${tempDir}/no-such-file.jsonl`, ALL_PERIOD);
          assertNull(result);
        });
      });
    });
  });

  // ─── T-EC-PC-06: 同一msgId の assistant を連結 ────────────────────────────

  /**
   * 同一 message.id の assistant エントリが複数あるとき1件に連結するシナリオ。
   * Claude がストリーミング応答を分割して JSONL に書く場合のケース。
   * turns が user + 連結済み assistant の2件になることを確認する。
   */
  describe('Given: 同一 msgId の assistant エントリが2件連続するJSONL', () => {
    /** `parseClaudeSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseClaudeSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/duplicate-assistant.jsonl`;
        await writeJsonl(filePath, [
          {
            type: 'user',
            isMeta: false,
            sessionId: 'sess-dup-0001',
            timestamp: '2026-03-15T10:00:00.000Z',
            cwd: '/home/user/projects/my-app',
            message: { id: 'msg-u-001', content: [{ type: 'text', text: '詳しく説明してください' }] },
          },
          {
            type: 'assistant',
            isMeta: false,
            sessionId: 'sess-dup-0001',
            timestamp: '2026-03-15T10:00:05.000Z',
            message: { id: 'msg-a-001', content: [{ type: 'text', text: '前半の説明です。' }] },
          },
          {
            type: 'assistant',
            isMeta: false,
            sessionId: 'sess-dup-0001',
            timestamp: '2026-03-15T10:00:06.000Z',
            message: { id: 'msg-a-001', content: [{ type: 'text', text: '後半の説明です。' }] },
          },
        ]);
      });

      /** T-EC-PC-06: assistant ターンが1件に連結される */
      describe('Then: T-EC-PC-06 - assistant ターンが1件に連結される', () => {
        it('T-EC-PC-06-01: turns の件数が 2（user + assistant 連結）', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns.length, 2);
        });

        it('T-EC-PC-06-02: turns[1].content に "前半" と "後半" が両方含まれる', async () => {
          const result = await parseClaudeSession(filePath, ALL_PERIOD);
          const assistantText = result!.turns[1].content;
          assertEquals(assistantText.includes('前半'), true);
          assertEquals(assistantText.includes('後半'), true);
        });
      });
    });
  });
});
