// src: scripts/exporter/__tests__/functional/export-chatgpt.functional.spec.ts
// @(#): exportChatGPT の機能テスト（Provider 注入使用）
//       対象: exportChatGPT
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { exportChatGPT } from '../../chatgpt-exporter.ts';

// ─── Helpers
// types
import type { ExportConfig } from '../../../types/export-config.types.ts';
import type { PeriodRange } from '../../../types/filter.types.ts';
import type { ExportedSession } from '../../../types/session.types.ts';
import type { ChatGPTConversation } from '../../types/chatgpt-entry.types.ts';

// ─── Internal Helpers

/** 有効な ExportedSession を返す parseConversation Provider */
function _makeValidSession(): ExportedSession {
  return {
    meta: {
      sessionId: 'test-session-id',
      date: '2025-03-14',
      project: 'テスト会話',
      slug: '',
      firstUserText: 'コードレビューをお願いします',
    },
    turns: [
      { role: 'user', content: 'コードレビューをお願いします' },
      { role: 'assistant', content: 'コードを確認しました。' },
    ],
  };
}

/** 有効な ChatGPTConversation を含む JSON ファイルを作成するヘルパー */
async function _writeConvFile(filePath: string, conversations: ChatGPTConversation[]): Promise<void> {
  await Deno.writeTextFile(filePath, JSON.stringify(conversations));
}

// ─── Specification
// ExportResult カウンタの仕様（この定義がテスト全体の基準）:
//   exportedCount : writeSession が成功した呼び出し回数（= outputPaths.length）
//   skippedCount  : parseConversation が null を返した会話数（期間外・内容なし）
//   errorCount    : ファイル読み込み失敗 または writeSession 例外 の件数
//
// ParseConversationProvider は同期関数:
//   型: (conv: ChatGPTConversation, range: PeriodRange) => ExportedSession | null
//   I/O・副作用なし。Promise.all の並列実行下でもシングルスレッド（Deno）のため安全。
//   テスト内で Promise を返してはならない。

// ─── Tests

/**
 * `exportChatGPT` の機能テストスイート（Provider 注入使用）。
 *
 * findFiles / parseConversation / writeSession の各 Provider を差し替えることで、
 * 実ファイルシステムへの依存を最小化しつつ動作を検証する。
 * ExportResult の3カウンタ（exportedCount / skippedCount / errorCount）と
 * outputPaths の正確性・決定論的な順序保証を検証する。
 *
 * テストケース分類:
 * 正常系: T-EC-GE-01（1件）/ T-EC-GE-06（3件並列）/ T-EC-GE-10（順序保証）
 * スキップ: T-EC-GE-02（parseConversation が null）
 * 境界値: T-EC-GE-03（0件）/ T-EC-GE-04（baseDir 未設定）
 * エラー系: T-EC-GE-05（writeSession 例外）/ T-EC-GE-09（全ファイル読み込み失敗）
 * 混在: T-EC-GE-07（エラー・正常・スキップ混在）/ T-EC-GE-08（複数会話・複数ファイル）
 *
 * @see exportChatGPT
 */
describe('exportChatGPT', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    outputDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
    await Deno.remove(outputDir, { recursive: true });
  });

  // ─── T-EC-GE-01: 有効な会話1件 → exportedCount=1, outputPaths=['/fake/path.md'] ─

  /**
   * 正常系の基本ケース。
   * 1ファイル1会話が parseConversation → writeSession の全工程を通過することを検証する。
   * exportedCount=1 かつ outputPaths に writeSession の返却パスが含まれることを確認する。
   */
  describe('Given: 有効な会話1件を含む Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-01: exportedCount=1, skippedCount=0, errorCount=0, outputPaths=["/fake/path.md"]', async () => {
        const convFile = `${tempDir}/conversations-000.json`;
        const dummyConv: ChatGPTConversation = {
          id: 'conv-001',
          conversation_id: 'conv-uuid-0001',
          create_time: 1742000000,
          title: 'テスト',
          mapping: {},
          current_node: undefined,
        };
        await _writeConvFile(convFile, [dummyConv]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();

        const result = await exportChatGPT(config, {
          // FindFilesProvider: (baseDir: string) => Promise<string[]>
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([convFile]),
          // ParseConversationProvider: 同期 (conv, range) => ExportedSession | null
          parseConversation: (_conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => validSession,
          // WriteSessionProvider: (outputDir, agent, session) => Promise<string>
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> =>
            Promise.resolve('/fake/path.md'),
        });

        assertEquals(result.exportedCount, 1);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 0);
        // outputPaths[0] は writeSession が返したパスと一致する（内容破損検出）
        assertEquals(result.outputPaths, ['/fake/path.md']);
      });
    });
  });

  // ─── T-EC-GE-02: parseConversation が null → skippedCount=1, outputPaths=[] ─

  /**
   * parseConversation が null を返すスキップ仕様の検証。
   * 期間外・内容なしなどの理由でパース結果が null になった場合、
   * skippedCount が正確にカウントされ writeSession が呼ばれないことを確認する。
   */
  describe('Given: parseConversation が null を返す Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-02: skippedCount=1, exportedCount=0, outputPaths=[]', async () => {
        const convFile = `${tempDir}/conversations-000.json`;
        const dummyConv: ChatGPTConversation = {
          id: 'conv-001',
          conversation_id: 'conv-uuid-0001',
          create_time: 1742000000,
          title: 'テスト',
          mapping: {},
        };
        await _writeConvFile(convFile, [dummyConv]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const result = await exportChatGPT(config, {
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([convFile]),
          // null を返す → skippedCount に計上される（仕様）
          parseConversation: (_conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => null,
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> =>
            Promise.resolve('/fake/path.md'),
        });

        assertEquals(result.skippedCount, 1);
        assertEquals(result.exportedCount, 0);
        // スキップ時は writeSession が呼ばれないため outputPaths は空
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-GE-03: findFiles が0件 → 全カウント0, outputPaths=[] ─────────────

  /**
   * 入力ファイルが0件の境界値ケース。
   * findFiles が空配列を返す状況で、全カウンタが0のまま空結果を返すことを検証する。
   * 処理対象なしでも正常終了（例外なし）することを確認する。
   */
  describe('Given: findFiles が 0 件を返す Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-03: exportedCount=0, skippedCount=0, errorCount=0, outputPaths=[]', async () => {
        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const result = await exportChatGPT(config, {
          // 対象ファイルが0件 → 処理対象なし
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([]),
          parseConversation: (_conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => null,
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> =>
            Promise.resolve('/fake/path.md'),
        });

        assertEquals(result.exportedCount, 0);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 0);
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-GE-04: config.baseDir が undefined → エラースロー ─────────────

  /**
   * config.baseDir が未設定の必須パラメータ検証ケース。
   * ChatGPT エクスポートは入力ディレクトリが必須であるため、
   * baseDir=undefined のときエラーがスローされることを検証する。
   */
  describe('Given: config.baseDir が undefined', () => {
    /** `exportChatGPT` を呼び出したときにエラーがスローされることを検証する。 */
    describe('When: exportChatGPT(config) を呼び出す', () => {
      it('T-EC-GE-04: エラーをスローする', async () => {
        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: undefined,
          period: undefined,
        };

        await assertRejects(
          () => exportChatGPT(config),
          Error,
          'ChatGPT エクスポートには --input/--base でディレクトリを指定してください',
        );
      });
    });
  });

  // ─── T-EC-GE-05: writeSession が例外 → errorCount=1, outputPaths=[] ────────

  /**
   * writeSession が例外を投げるエラー系ケース。
   * parseConversation は成功するが writeSession で失敗する状況を想定する。
   * errorCount に計上され outputPaths には追加されないことを検証する。
   */
  describe('Given: writeSession が例外をスローする Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-05: errorCount=1, exportedCount=0, outputPaths=[]', async () => {
        const convFile = `${tempDir}/conversations-000.json`;
        const dummyConv: ChatGPTConversation = {
          id: 'conv-001',
          conversation_id: 'conv-uuid-0001',
          create_time: 1742000000,
          title: 'テスト',
          mapping: {},
        };
        await _writeConvFile(convFile, [dummyConv]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();

        const result = await exportChatGPT(config, {
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([convFile]),
          parseConversation: (_conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => validSession,
          // writeSession の例外は errorCount に計上され、outputPaths には追加されない（仕様）
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> => {
            throw new Error('write error');
          },
        });

        assertEquals(result.errorCount, 1);
        assertEquals(result.exportedCount, 0);
        // write 失敗時は outputPaths が空（内容破損なし）
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-GE-06: 複数ファイルの並列処理（全成功）→ outputPaths 内容と順序を検証 ─

  /**
   * 3ファイル全成功の並列処理ケース。
   * 各ファイルに異なる conv.id を設定することで outputPaths の内容を識別可能にし、
   * exportedCount=3 かつ outputPaths がファイル入力順に並ぶことを検証する。
   */
  describe('Given: 有効な会話を1件ずつ含む3ファイルの Provider（各ファイルに異なる conv.id）', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-06: exportedCount=3, outputPaths=[session-a.md, session-b.md, session-c.md]（入力順）', async () => {
        // 各ファイルにユニークな conv.id を設定して、writeSession の返却パスで識別する
        const convA: ChatGPTConversation = {
          id: 'a',
          conversation_id: 'conv-uuid-a',
          create_time: 1742000000,
          title: 'テスト A',
          mapping: {},
        };
        const convB: ChatGPTConversation = {
          id: 'b',
          conversation_id: 'conv-uuid-b',
          create_time: 1742000000,
          title: 'テスト B',
          mapping: {},
        };
        const convC: ChatGPTConversation = {
          id: 'c',
          conversation_id: 'conv-uuid-c',
          create_time: 1742000000,
          title: 'テスト C',
          mapping: {},
        };
        const file1 = `${tempDir}/conversations-001.json`;
        const file2 = `${tempDir}/conversations-002.json`;
        const file3 = `${tempDir}/conversations-003.json`;
        await Promise.all([
          _writeConvFile(file1, [convA]),
          _writeConvFile(file2, [convB]),
          _writeConvFile(file3, [convC]),
        ]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();

        const result = await exportChatGPT(config, {
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([file1, file2, file3]),
          // conv.id ベースで sessionId を生成し、outputPaths で識別可能にする
          parseConversation: (conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => ({
            ...validSession,
            meta: { ...validSession.meta, sessionId: `session-${conv.id}` },
          }),
          writeSession: (_outputDir: string, _agent: string, session: ExportedSession): Promise<string> =>
            Promise.resolve(`/fake/${session.meta.sessionId}.md`),
        });

        assertEquals(result.exportedCount, 3);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 0);
        // outputPaths はファイル入力順 [file1, file2, file3] に対応して決定論的
        assertEquals(result.outputPaths, ['/fake/session-a.md', '/fake/session-b.md', '/fake/session-c.md']);
      });
    });
  });

  // ─── T-EC-GE-07: エラーファイルと正常ファイルの混在 ──────────────────────
  // errorFile は読み込みエラー → parseConversation は呼ばれない → errorCount に計上
  // validFile の conv.id='valid' → validSession を返す → exportedCount に計上
  // skipFile の conv.id='skip' → null を返す → skippedCount に計上

  /**
   * エラー・正常・スキップの3種混在ケース。
   * JSONパース不能ファイル（errorCount）・有効ファイル（exportedCount）・
   * スキップファイル（skippedCount）が混在したとき、各カウンタが正確になることを検証する。
   */
  describe('Given: JSONパース不能ファイル・有効ファイル・スキップファイルの混在Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-07: exportedCount=1, skippedCount=1, errorCount=1, outputPaths=["/fake/path.md"]', async () => {
        const errorFile = `${tempDir}/conversations-001.json`;
        const validFile = `${tempDir}/conversations-002.json`;
        const skipFile = `${tempDir}/conversations-003.json`;
        // conv.id で同定: 'valid' → session, 'skip' → null
        const dummyConvValid: ChatGPTConversation = {
          id: 'valid',
          conversation_id: 'conv-uuid-valid',
          create_time: 1742000000,
          title: 'valid',
          mapping: {},
        };
        const dummyConvSkip: ChatGPTConversation = {
          id: 'skip',
          conversation_id: 'conv-uuid-skip',
          create_time: 1742000000,
          title: 'skip',
          mapping: {},
        };
        await Promise.all([
          Deno.writeTextFile(errorFile, 'not valid json'),
          _writeConvFile(validFile, [dummyConvValid]),
          _writeConvFile(skipFile, [dummyConvSkip]),
        ]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();

        const result = await exportChatGPT(config, {
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([errorFile, validFile, skipFile]),
          // conv.id で同定（callCount は使わない — Promise.all 並列処理で呼び出し順序が不定になるため）
          parseConversation: (conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => {
            return conv.id === 'valid' ? validSession : null;
          },
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> =>
            Promise.resolve('/fake/path.md'),
        });

        assertEquals(result.exportedCount, 1);
        assertEquals(result.skippedCount, 1);
        assertEquals(result.errorCount, 1);
        // exportedCount=1 に対応して outputPaths も1件
        assertEquals(result.outputPaths, ['/fake/path.md']);
      });
    });
  });

  // ─── T-EC-GE-08: 複数ファイル・各ファイルに複数会話 ─────────────────────

  /**
   * 複数ファイル・各ファイルに複数会話が含まれる最複合ケース。
   * file1=[有効, スキップ]・file2=[有効, writeSessionエラー] の構成で、
   * exportedCount=2, skippedCount=1, errorCount=1 になることを検証する。
   */
  describe('Given: 複数会話を含む2ファイルの Provider（一部スキップ・writeSessionエラー混在）', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-08: exportedCount=2, skippedCount=1, errorCount=1', async () => {
        // file1: [有効, スキップ] file2: [有効, writeSessionエラー]
        // 各ファイルの conversation には id で区別できる値を設定する
        const convValid: ChatGPTConversation = {
          id: 'valid',
          conversation_id: 'conv-uuid-valid',
          create_time: 1742000000,
          title: 'valid',
          mapping: {},
        };
        const convSkip: ChatGPTConversation = {
          id: 'skip',
          conversation_id: 'conv-uuid-skip',
          create_time: 1742000000,
          title: 'skip',
          mapping: {},
        };
        const convError: ChatGPTConversation = {
          id: 'error',
          conversation_id: 'conv-uuid-error',
          create_time: 1742000000,
          title: 'error',
          mapping: {},
        };

        const file1 = `${tempDir}/conversations-001.json`;
        const file2 = `${tempDir}/conversations-002.json`;
        await Promise.all([
          _writeConvFile(file1, [convValid, convSkip]),
          _writeConvFile(file2, [convValid, convError]),
        ]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();
        const errorSession: ExportedSession = {
          ...validSession,
          meta: { ...validSession.meta, sessionId: 'conv-uuid-error' },
        };

        const result = await exportChatGPT(config, {
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([file1, file2]),
          parseConversation: (conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => {
            if (conv.id === 'skip') { return null; }
            if (conv.id === 'error') { return errorSession; }
            return validSession;
          },
          writeSession: (_outputDir: string, _agent: string, session: ExportedSession): Promise<string> => {
            if (session.meta.sessionId === 'conv-uuid-error') {
              throw new Error('write error');
            }
            return Promise.resolve('/fake/path.md');
          },
        });

        assertEquals(result.exportedCount, 2);
        assertEquals(result.skippedCount, 1);
        assertEquals(result.errorCount, 1);
        // exportedCount=2 に対応して outputPaths も2件
        // 'conv-uuid-error' は write 失敗のため outputPaths に含まれない
        assertEquals(result.outputPaths.length, 2);
        assertEquals(result.outputPaths.every((p) => p === '/fake/path.md'), true);
      });
    });
  });

  // ─── T-EC-GE-09: 全ファイルが読み込みエラー → errorCount=2, outputPaths=[] ─

  /**
   * 全ファイルが読み込みエラーになるケース。
   * findFiles が存在しないパスを返すとき、2件すべてが errorCount に計上され
   * outputPaths が空配列になることを検証する。
   */
  describe('Given: 全ファイルが存在しないパスを返す findFiles Provider', () => {
    /** `exportChatGPT` を呼び出したときの戻り値を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-09: exportedCount=0, skippedCount=0, errorCount=2, outputPaths=[]', async () => {
        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const result = await exportChatGPT(config, {
          // 存在しないパスを返す → ファイル読み込み失敗 → errorCount に計上（仕様）
          findFiles: (_baseDir: string): Promise<string[]> =>
            Promise.resolve([
              `${tempDir}/nonexistent-001.json`,
              `${tempDir}/nonexistent-002.json`,
            ]),
          parseConversation: (_conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => null,
          writeSession: (_outputDir: string, _agent: string, _session: ExportedSession): Promise<string> =>
            Promise.resolve('/fake/path.md'),
        });

        assertEquals(result.exportedCount, 0);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 2);
        // ファイル読み込みエラー時は outputPaths は空
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-GE-10: Promise.all 並列処理でも outputPaths はファイル入力順に決定論的 ─
  // ECMAScript 仕様: Promise.all は入力配列の順序で結果を返す。
  // _mergeResults はその順序を維持して outputPaths をマージする。
  // （実装: results.forEach(r => outputPaths.push(...r.outputPaths))）

  /**
   * Promise.all 並列処理での outputPaths 順序保証の検証。
   * ECMAScript 仕様では Promise.all は入力配列の順序で結果を返す。
   * 並列処理であっても outputPaths がファイル入力順 [x.md, y.md, z.md] に
   * 決定論的に並ぶことを検証する。
   */
  describe('Given: id が "x"/"y"/"z" の会話を1件ずつ含む3ファイル（Promise.all 並列処理）', () => {
    /** `exportChatGPT` を呼び出したときの outputPaths の順序を検証する。 */
    describe('When: exportChatGPT(config, providers) を呼び出す', () => {
      it('T-EC-GE-10: outputPaths がファイル入力順 [x.md, y.md, z.md] で決定論的', async () => {
        const convX: ChatGPTConversation = {
          id: 'x',
          conversation_id: 'conv-uuid-x',
          create_time: 1742000000,
          title: 'テスト X',
          mapping: {},
        };
        const convY: ChatGPTConversation = {
          id: 'y',
          conversation_id: 'conv-uuid-y',
          create_time: 1742000000,
          title: 'テスト Y',
          mapping: {},
        };
        const convZ: ChatGPTConversation = {
          id: 'z',
          conversation_id: 'conv-uuid-z',
          create_time: 1742000000,
          title: 'テスト Z',
          mapping: {},
        };
        const fileX = `${tempDir}/conversations-010.json`;
        const fileY = `${tempDir}/conversations-020.json`;
        const fileZ = `${tempDir}/conversations-030.json`;
        await Promise.all([
          _writeConvFile(fileX, [convX]),
          _writeConvFile(fileY, [convY]),
          _writeConvFile(fileZ, [convZ]),
        ]);

        const config: ExportConfig = {
          agent: 'chatgpt',
          exportDir: outputDir,
          baseDir: tempDir,
          period: undefined,
        };

        const validSession = _makeValidSession();

        const result = await exportChatGPT(config, {
          // findFiles は [fileX, fileY, fileZ] の順序で返す（入力順を固定）
          findFiles: (_baseDir: string): Promise<string[]> => Promise.resolve([fileX, fileY, fileZ]),
          // conv.id で sessionId を生成（並列処理でも各ファイルの conv は独立）
          parseConversation: (conv: ChatGPTConversation, _range: PeriodRange): ExportedSession | null => ({
            ...validSession,
            meta: { ...validSession.meta, sessionId: `session-${conv.id}` },
          }),
          // sessionId ベースでパスを返すことで outputPaths の内容が検証可能になる
          writeSession: (_outputDir: string, _agent: string, session: ExportedSession): Promise<string> =>
            Promise.resolve(`/fake/${session.meta.sessionId}.md`),
        });

        // Promise.all は入力順 [fileX, fileY, fileZ] で結果を集約するため、
        // outputPaths も [session-x.md, session-y.md, session-z.md] の順序になる（決定論的）
        assertEquals(result.outputPaths, [
          '/fake/session-x.md',
          '/fake/session-y.md',
          '/fake/session-z.md',
        ]);
        assertEquals(result.exportedCount, 3);
      });
    });
  });
});
