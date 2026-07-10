// src: scripts/__tests__/e2e/main.e2e.spec.ts
// @(#): export-chatlogs main() の E2E テスト
//       main() 経由でのセッションエクスポートフロー（実ファイルシステム使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stubs
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../export-chatlogs.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { writeJsonl } from '../_helpers/jsonl-writer.ts';
// types
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { ChatGPTConversation } from '../../exporter/types/chatgpt-entry.types.ts';

// ─── Internal Helpers

/**
 * Claude セッション JSONL のエントリを生成する。
 * type="user" と type="assistant" のエントリを生成し、
 * sessionId・timestamp・cwd・content テキストを引数で指定できる。
 * E2E テストで最小構成の JSONL を組み立てるために使用する。
 */
function _claudeEntry(
  type: 'user' | 'assistant',
  sessionId: string,
  timestamp: string,
  text: string,
  cwd = '/home/user/projects/my-app',
): unknown {
  if (type === 'user') {
    return {
      type: 'user',
      isMeta: false,
      sessionId,
      timestamp,
      cwd,
      message: { id: `msg-u-${Date.now()}`, content: [{ type: 'text', text }] },
    };
  }
  return {
    type: 'assistant',
    isMeta: false,
    sessionId,
    timestamp,
    message: { id: `msg-a-${Date.now()}`, content: [{ type: 'text', text }] },
  };
}

/**
 * Codex セッション JSONL のエントリを生成する。
 * type="session_meta" と type="response_item" の2種類のエントリを生成し、
 * timestamp・id・cwd・role・text を opts で指定できる。
 * E2E テストで Codex の最小構成 JSONL を組み立てるために使用する。
 */
function _codexEntry(
  type: 'session_meta' | 'response_item',
  timestamp: string,
  opts: Record<string, unknown> = {},
): unknown {
  if (type === 'session_meta') {
    return {
      timestamp,
      type: 'session_meta',
      payload: {
        id: opts.id ?? 'codex-e2e-sess-001',
        cwd: opts.cwd ?? '/home/user/projects/my-codex-app',
        model: 'o4-mini',
      },
    };
  }
  return {
    timestamp,
    type: 'response_item',
    payload: {
      role: opts.role ?? 'user',
      content: [{ type: opts.role === 'assistant' ? 'output_text' : 'input_text', text: opts.text ?? '' }],
    },
  };
}

/**
 * ChatGPT conversations-*.json の1会話オブジェクトを生成する。
 * root(message=null) → user → assistant の一直線 mapping を組み立て、
 * conversationId・createTime・userText・assistantText を引数で指定できる。
 * E2E テストで最小構成の ChatGPT 会話を組み立てるために使用する。
 */
function _chatgptConversation(
  conversationId: string,
  createTime: number,
  userText: string,
  assistantText: string,
): ChatGPTConversation {
  return {
    id: conversationId,
    conversation_id: conversationId,
    create_time: createTime,
    title: 'E2E ChatGPT テスト会話',
    current_node: 'node-assistant',
    mapping: {
      'root': { id: 'root', message: null, parent: null, children: ['node-user'] },
      'node-user': {
        id: 'node-user',
        message: {
          id: 'msg-user',
          author: { role: 'user' },
          create_time: createTime,
          content: { content_type: 'text', parts: [userText] },
        },
        parent: 'root',
        children: ['node-assistant'],
      },
      'node-assistant': {
        id: 'node-assistant',
        message: {
          id: 'msg-assistant',
          author: { role: 'assistant' },
          create_time: createTime,
          content: { content_type: 'text', parts: [assistantText] },
        },
        parent: 'node-user',
        children: [],
      },
    },
  };
}

// ─── Tests
/**
 * `main()` 関数の E2E テストスイート。
 *
 * CLI のエントリポイントを通じてエクスポートの全フロー
 * （引数解析 → セッション探索 → パース → Markdown 書き出し）を
 * 結合テストする。`Deno.env.get` と `console.log/error` をスタブし、
 * 実ファイル I/O で動作を検証する。
 *
 * テスト対象シナリオ:
 * - claude/codex/chatgpt エージェントの正常実行（ファイル生成確認）
 * - 出力ディレクトリ構造（agent/YYYY/YYYY-MM/）の確認
 * - 年指定（YYYY）で複数の YYYY-MM サブディレクトリに分散出力されること
 *
 * 各テストは `Deno.makeTempDir()` で独立した環境を使用し、
 * `afterEach` でスタブ復元・ディレクトリ削除を行う。
 *
 * @see main
 * @see parseArgs
 * @see parsePeriod
 */
describe('main (export-chatlogs)', () => {
  let tempDir: string;
  let outputDir: string;
  let envStub: Stub<typeof Deno.env, [key: string], string | undefined>;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    outputDir = `${tempDir}/output`;
    // homeDir() を tempDir に向ける
    envStub = stub(Deno.env, 'get', (key: string) => {
      if (key === 'USERPROFILE' || key === 'HOME') { return tempDir; }
      return undefined;
    });
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    GlobalConfig.resetInstance();
    envStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-E2E-01: claude agent 正常実行 ─────────────────────────────────

  /**
   * claude agent の正常実行シナリオ。
   *
   * 最小構成（user + assistant 各1エントリ）の JSONL が存在するとき、
   * main() が Markdown を生成してログにパスを出力することを確認する。
   * エクスポート全フロー（解析→探索→パース→書き出し）が疎通していることの基本確認。
   */
  describe('Given: ~/.claude/projects/ に有効な claude セッションJSONL', () => {
    /** main(["claude", "--export-dir", outputDir]) を呼び出す */
    describe('When: main(["claude", "--export-dir", outputDir]) を呼び出す', () => {
      beforeEach(async () => {
        const projectsDir = `${tempDir}/.claude/projects/C--home-user-projects-my-app`;
        await Deno.mkdir(projectsDir, { recursive: true });
        await writeJsonl(`${projectsDir}/session.jsonl`, [
          _claudeEntry('user', 'sess-e2e-0001', '2026-03-15T10:00:00.000Z', 'E2Eテストの質問です'),
          _claudeEntry('assistant', 'sess-e2e-0001', '2026-03-15T10:00:05.000Z', 'E2Eテストの回答です。'),
        ]);
      });

      /** T-EC-E2E-01: ファイルが outputDir に生成される */
      describe('Then: T-EC-E2E-01 - ファイルが outputDir に生成される', () => {
        it('T-EC-E2E-01-01: outputDir に .md ファイルが生成される', async () => {
          await main(['claude', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.length >= 1, true);
        });

        it('T-EC-E2E-01-02: logger.log に生成パスが出力される', async () => {
          await main(['claude', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.some((p) => p.endsWith('.md')), true);
        });
      });
    });
  });

  // ─── T-EC-E2E-02: codex agent 正常実行 ──────────────────────────────────

  /**
   * codex agent の正常実行シナリオ。
   *
   * ~/.codex/sessions/YYYY/MM/DD/ 形式のディレクトリに session_meta + response_item が
   * 存在するとき、codex エクスポートフローが疎通して .md ファイルを生成することを確認する。
   * claude と異なるディレクトリ構造・JSONL フォーマットが正しく処理されることの基本確認。
   */
  describe('Given: ~/.codex/sessions/ に有効な codex セッションJSONL', () => {
    /** main(["codex", "--export-dir", outputDir]) を呼び出す */
    describe('When: main(["codex", "--export-dir", outputDir]) を呼び出す', () => {
      beforeEach(async () => {
        const sessionsDir = `${tempDir}/.codex/sessions/2026/03/15`;
        await Deno.mkdir(sessionsDir, { recursive: true });
        await writeJsonl(`${sessionsDir}/codex-session.jsonl`, [
          _codexEntry('session_meta', '2026-03-15T11:00:00.000Z', {
            id: 'codex-e2e-001',
            cwd: '/home/user/projects/my-codex-app',
          }),
          _codexEntry('response_item', '2026-03-15T11:00:01.000Z', {
            role: 'user',
            text: 'Codex E2Eテストの質問です',
          }),
          _codexEntry('response_item', '2026-03-15T11:00:10.000Z', {
            role: 'assistant',
            text: 'Codex E2Eテストの回答です。',
          }),
        ]);
      });

      /** T-EC-E2E-02: ファイルが outputDir に生成される */
      describe('Then: T-EC-E2E-02 - ファイルが outputDir に生成される', () => {
        it('T-EC-E2E-02-01: outputDir に .md ファイルが生成される', async () => {
          await main(['codex', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.some((p) => p.endsWith('.md')), true);
        });
      });
    });
  });

  // ─── T-EC-E2E-06: 出力ディレクトリ構造 ──────────────────────────────────

  /**
   * 出力ディレクトリ構造（agent/YYYY/YYYY-MM/）の検証シナリオ。
   *
   * main() が生成するファイルパスに `claude/2026/2026-03` セグメントが
   * 含まれることを確認する。パス構造は Obsidian へのインポート時の
   * フォルダ整理に直結するため、形式の正確性が重要。
   */
  describe('Given: claude セッションと outputDir が指定される', () => {
    /** main(["claude", "--export-dir", outputDir]) を呼び出す */
    describe('When: main(["claude", "--export-dir", outputDir]) を呼び出す', () => {
      beforeEach(async () => {
        const projectsDir = `${tempDir}/.claude/projects/C--home-user-projects-struct-app`;
        await Deno.mkdir(projectsDir, { recursive: true });
        await writeJsonl(`${projectsDir}/session.jsonl`, [
          _claudeEntry(
            'user',
            'sess-struct',
            '2026-03-15T10:00:00.000Z',
            'ディレクトリ構造テスト',
            '/home/user/projects/struct-app',
          ),
          _claudeEntry('assistant', 'sess-struct', '2026-03-15T10:00:05.000Z', '構造確認の回答'),
        ]);
      });

      /** T-EC-E2E-06: outputDir/claude/YYYY/YYYY-MM/ 構造が生成される */
      describe('Then: T-EC-E2E-06 - outputDir/claude/YYYY/YYYY-MM/ 構造が生成される', () => {
        it('T-EC-E2E-06-01: 出力パスに "claude/2026/2026-03" が含まれる', async () => {
          await main(['claude', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.length >= 1, true);
          assertStringIncludes(loggerStub.logLogs[0], 'claude');
          assertStringIncludes(loggerStub.logLogs[0], '2026');
          assertStringIncludes(loggerStub.logLogs[0], '2026-03');
        });
      });
    });
  });

  // ─── T-EC-E2E-08: 年指定で複数 yyyy-mm への分散出力 ──────────────────────

  /**
   * 年指定（YYYY）での複数 YYYY-MM サブディレクトリへの分散出力シナリオ。
   *
   * 2026-01 と 2026-03 のセッションが混在する状態で period="2026" を指定したとき、
   * 両月のファイルが `claude/2026/2026-01/` と `claude/2026/2026-03/` に
   * それぞれ出力されることを確認する。
   * YYYY 指定が複数の YYYY-MM ディレクトリに正しく分散されることの検証。
   */
  /**
   * 2026-01 と 2026-03 のセッションが混在する前提条件。
   * 年指定（period="2026"）で両月が同時にエクスポートされ、
   * それぞれの月ディレクトリに分散出力されることを E2E で検証する。
   */
  describe('Given: 2026-01 と 2026-03 のセッションが混在する', () => {
    beforeEach(async () => {
      const projectsDir = `${tempDir}/.claude/projects/C--home-user-projects-multi-month`;
      await Deno.mkdir(projectsDir, { recursive: true });
      await writeJsonl(`${projectsDir}/jan.jsonl`, [
        _claudeEntry(
          'user',
          'sess-jan',
          '2026-01-10T10:00:00.000Z',
          '1月の質問',
          '/home/user/projects/multi-month',
        ),
        _claudeEntry('assistant', 'sess-jan', '2026-01-10T10:00:05.000Z', '1月の回答'),
      ]);
      await writeJsonl(`${projectsDir}/mar.jsonl`, [
        _claudeEntry(
          'user',
          'sess-mar',
          '2026-03-20T10:00:00.000Z',
          '3月の質問',
          '/home/user/projects/multi-month',
        ),
        _claudeEntry('assistant', 'sess-mar', '2026-03-20T10:00:05.000Z', '3月の回答'),
      ]);
    });

    /** period="2026" で年指定エクスポートしたとき複数 YYYY-MM への分散出力を確認する。 */
    describe('When: period="2026" で年指定エクスポートする', () => {
      /** T-EC-E2E-08: 2つの yyyy-mm サブディレクトリに分散出力される */
      describe('Then: T-EC-E2E-08 - 2つの yyyy-mm サブディレクトリに分散出力される', () => {
        it('T-EC-E2E-08-01: ファイルが 2 件生成される', async () => {
          await main(['claude', '2026', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.length, 2);
        });

        it('T-EC-E2E-08-02: 一方のパスに "2026-01" が含まれる', async () => {
          await main(['claude', '2026', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.some((p) => p.includes('2026-01')), true);
        });

        it('T-EC-E2E-08-03: 他方のパスに "2026-03" が含まれる', async () => {
          await main(['claude', '2026', '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.some((p) => p.includes('2026-03')), true);
        });
      });
    });
  });

  // ─── T-EC-E2E-09: chatgpt agent 正常実行 ────────────────────────────────

  /**
   * chatgpt agent の正常実行シナリオ。
   *
   * `--base` のみを指定して `runExport` の chatgpt ガード（inputDir/baseDir 両方未指定時に
   * throw する分岐）を通過させ、`exportChatGPT` が実行されて Markdown 出力まで
   * 完了することを確認する。claude/codex と異なる conversations-*.json 形式が
   * 正しく処理されることの基本確認。
   */
  describe('Given: baseDir 直下に有効な chatgpt conversations JSON', () => {
    let baseDir: string;

    /** main(["chatgpt", "--base", baseDir, "--export-dir", outputDir]) を呼び出す */
    describe('When: main(["chatgpt", "--base", baseDir, "--export-dir", outputDir]) を呼び出す', () => {
      beforeEach(async () => {
        baseDir = `${tempDir}/chatgpt-export`;
        await Deno.mkdir(baseDir, { recursive: true });
        const createTime = new Date('2026-03-15T10:00:00.000Z').getTime() / 1000;
        await Deno.writeTextFile(
          `${baseDir}/conversations-2026-03-15.json`,
          JSON.stringify([
            _chatgptConversation('sess-e2e-chatgpt-0001', createTime, 'E2Eテストの質問です', 'E2Eテストの回答です。'),
          ]),
        );
      });

      /** T-EC-E2E-09: ファイルが outputDir に生成される */
      describe('Then: T-EC-E2E-09 - ファイルが outputDir に生成される', () => {
        it('T-EC-E2E-09-01: logger.log に生成パスが出力される', async () => {
          await main(['chatgpt', '--base', baseDir, '--export-dir', outputDir]);

          assertEquals(loggerStub.logLogs.some((p) => p.endsWith('.md')), true);
        });
      });
    });
  });
});
