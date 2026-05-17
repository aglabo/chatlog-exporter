// src: scripts/__tests__/functional/parse-codex-session.functional.spec.ts
// @(#): parseCodexSession の機能テスト
//       対象: parseCodexSession
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../_scripts/libs/testing/assert.ts';

// ─── Test target
import { parseCodexSession } from '../../exporter/codex-exporter.ts';
import { parsePeriod } from '../../libs/period-filter.ts';

// ─── Helpers
// types
import type { PeriodRange } from '../../types/filter.types.ts';

// ─── Internal Helpers

/** 期間フィルタを設定しない（全期間対象）`PeriodRange` 定数。テスト内で期間外除外を行わない場合に使用する。 */
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

/**
 * 各要素を JSON.stringify して改行区切りで結合し、末尾に改行を付加して JSONL ファイルに書き込む。
 * 機能テストで実際の JSONL ファイルを一時ディレクトリに作成するために使用する。
 */
async function _writeJsonl(filePath: string, lines: unknown[]): Promise<void> {
  const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  await Deno.writeTextFile(filePath, content);
}

// ─── Tests

/**
 * `parseCodexSession` の機能テストスイート。
 *
 * 一時ディレクトリに JSONL ファイルを書き込み、実ファイル I/O を通じて
 * パース動作を検証する。以下の組み合わせ動作を対象とする:
 * - 正常系: session_meta + user + assistant エントリから ExportedSession の各フィールドを正しく抽出
 * - session_meta エントリ欠落 → null
 * - 期間外タイムスタンプ（session_meta の timestamp 基準）→ null
 * - "# AGENTS.md instructions" で始まる user ターンの除外
 * - ファイル不存在 → null
 *
 * 各テストは `Deno.makeTempDir()` で独立した作業ディレクトリを使用し、
 * `afterEach` で自動クリーンアップする。
 *
 * @see parseCodexSession
 * @see parsePeriod
 */
describe('parseCodexSession', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-PX-01: 正常パース ────────────────────────────────────────────────

  /**
   * 最小構成 JSONL の正常パースシナリオ。
   * session_meta + user + assistant 各1エントリから
   * sessionId・date・project・turns・firstUserText の全フィールドが
   * 正しく抽出されることを確認する。
   * cwd からプロジェクト名（my-codex-app）を導出するロジックも含む。
   */
  describe('Given: session_meta + user + assistant エントリのJSONL', () => {
    /** `parseCodexSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseCodexSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/codex-session.jsonl`;
        await _writeJsonl(filePath, [
          {
            timestamp: '2026-03-15T11:00:00.000Z',
            type: 'session_meta',
            payload: { id: 'codex-sess-0001', cwd: '/home/user/projects/my-codex-app', model: 'o4-mini' },
          },
          {
            timestamp: '2026-03-15T11:00:01.000Z',
            type: 'response_item',
            payload: {
              role: 'user',
              content: [{ type: 'input_text', text: 'コードレビューをお願いします' }],
            },
          },
          {
            timestamp: '2026-03-15T11:00:10.000Z',
            type: 'response_item',
            payload: {
              role: 'assistant',
              content: [{ type: 'output_text', text: 'コードを確認しました。いくつか改善点があります。' }],
            },
          },
        ]);
      });

      describe('Then: T-EC-PX-01 - 正常にパースされる', () => {
        it('T-EC-PX-01-01: null でない ExportedSession を返す', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertNotNull(result);
        });

        it('T-EC-PX-01-02: meta.sessionId が "codex-sess-0001"', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.sessionId, 'codex-sess-0001');
        });

        it('T-EC-PX-01-03: meta.date が "2026-03-15"', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.date, '2026-03-15');
        });

        it('T-EC-PX-01-04: meta.project が "my-codex-app"', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.project, 'my-codex-app');
        });

        it('T-EC-PX-01-05: turns の件数が 2', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns.length, 2);
        });

        it('T-EC-PX-01-06: firstUserText が "コードレビューをお願いします"', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.firstUserText, 'コードレビューをお願いします');
        });
      });
    });
  });

  // ─── T-EC-PX-02: session_meta なし → null ─────────────────────────────────

  /**
   * session_meta エントリが欠落している JSONL での null 返却仕様の検証。
   * Codex セッションは session_meta がなければセッション情報を特定できないため、
   * null を返してスキップ処理を促す設計の確認。
   */
  describe('Given: session_meta エントリが存在しないJSONL', () => {
    /** `parseCodexSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseCodexSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/no-meta.jsonl`;
        await _writeJsonl(filePath, [
          {
            timestamp: '2026-03-15T11:00:01.000Z',
            type: 'response_item',
            payload: {
              role: 'user',
              content: [{ type: 'input_text', text: '質問です' }],
            },
          },
          {
            timestamp: '2026-03-15T11:00:10.000Z',
            type: 'response_item',
            payload: {
              role: 'assistant',
              content: [{ type: 'output_text', text: '回答です。' }],
            },
          },
        ]);
      });

      describe('Then: T-EC-PX-02 - null を返す', () => {
        it('T-EC-PX-02-01: null を返す', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertNull(result);
        });
      });
    });
  });

  // ─── T-EC-PX-03: 期間外 → null ─────────────────────────────────────────────

  /**
   * session_meta の timestamp が期間外のときの null 返却仕様の検証。
   * 2026-03 フィルタに対して 2026-02 の session_meta は期間外と判定されることを確認する。
   * period フィルタが session_meta.timestamp を基準に動作することの検証。
   */
  describe('Given: session_meta の timestamp が期間外のJSONL', () => {
    /** 指定期間でフィルタしたときの結果を検証する。 */
    describe('When: parsePeriod("2026-03") の期間でフィルタする', () => {
      let filePath: string;
      let marchRange: PeriodRange;

      beforeEach(async () => {
        filePath = `${tempDir}/outside-period.jsonl`;
        marchRange = parsePeriod('2026-03');
        await _writeJsonl(filePath, [
          {
            timestamp: '2026-02-15T11:00:00.000Z', // 期間外: 2月
            type: 'session_meta',
            payload: { id: 'codex-sess-outside', cwd: '/home/user/projects/my-app', model: 'o4-mini' },
          },
          {
            timestamp: '2026-02-15T11:00:01.000Z',
            type: 'response_item',
            payload: {
              role: 'user',
              content: [{ type: 'input_text', text: '期間外の質問です' }],
            },
          },
          {
            timestamp: '2026-02-15T11:00:10.000Z',
            type: 'response_item',
            payload: {
              role: 'assistant',
              content: [{ type: 'output_text', text: '期間外の回答です。' }],
            },
          },
        ]);
      });

      describe('Then: T-EC-PX-03 - null を返す', () => {
        it('T-EC-PX-03-01: null を返す', async () => {
          const result = await parseCodexSession(filePath, marchRange);
          assertNull(result);
        });
      });
    });
  });

  // ─── T-EC-PX-04: AGENTS.md instructions 除外 ──────────────────────────────

  /**
   * "# AGENTS.md instructions" で始まる user ターンを除外するシナリオ。
   * Codex が AGENTS.md の内容をユーザーターンに混入させるため、
   * このプレフィックスを持つターンはエクスポート対象外として除外されることを確認する。
   * 除外後の firstUserText が次の有効な user ターンになることも検証する。
   */
  describe('Given: user ターンが "# AGENTS.md instructions" で始まるJSONL', () => {
    /** `parseCodexSession(filePath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseCodexSession(filePath, allPeriod) を呼び出す', () => {
      let filePath: string;

      beforeEach(async () => {
        filePath = `${tempDir}/agents-md.jsonl`;
        await _writeJsonl(filePath, [
          {
            timestamp: '2026-03-15T11:00:00.000Z',
            type: 'session_meta',
            payload: { id: 'codex-sess-agents', cwd: '/home/user/projects/my-app', model: 'o4-mini' },
          },
          {
            timestamp: '2026-03-15T11:00:01.000Z',
            type: 'response_item',
            payload: {
              role: 'user',
              content: [{ type: 'input_text', text: '# AGENTS.md instructions\nここは除外されます' }],
            },
          },
          {
            timestamp: '2026-03-15T11:00:02.000Z',
            type: 'response_item',
            payload: {
              role: 'user',
              content: [{ type: 'input_text', text: '実際の質問です' }],
            },
          },
          {
            timestamp: '2026-03-15T11:00:10.000Z',
            type: 'response_item',
            payload: {
              role: 'assistant',
              content: [{ type: 'output_text', text: '実際の回答です。' }],
            },
          },
        ]);
      });

      describe('Then: T-EC-PX-04 - AGENTS.md ターンが除外される', () => {
        it('T-EC-PX-04-01: turns の件数が 2（AGENTS.md 除外後）', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.turns.length, 2);
        });

        it('T-EC-PX-04-02: firstUserText が "実際の質問です"', async () => {
          const result = await parseCodexSession(filePath, ALL_PERIOD);
          assertEquals(result!.meta.firstUserText, '実際の質問です');
        });
      });
    });
  });

  // ─── T-EC-PX-06: ファイル不存在 → null ────────────────────────────────────

  /**
   * 存在しないファイルパスを渡したときの null 返却仕様の検証。
   * エラーを throw せず null を返すことで呼び出し元がスキップ処理を続けられる設計の確認。
   */
  describe('Given: 存在しないファイルパス', () => {
    /** `parseCodexSession(nonExistentPath, allPeriod)` を呼び出したときの結果を検証する。 */
    describe('When: parseCodexSession(nonExistentPath, allPeriod) を呼び出す', () => {
      describe('Then: T-EC-PX-06 - null を返す', () => {
        it('T-EC-PX-06-01: null を返す', async () => {
          const result = await parseCodexSession(`${tempDir}/no-such-file.jsonl`, ALL_PERIOD);
          assertNull(result);
        });
      });
    });
  });
});
