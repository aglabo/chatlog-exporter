// src: scripts/__tests__/e2e/classify-chatlogs.main.e2e.spec.ts
// @(#): classify-chatlogs main() の E2E テスト
//       main() 経由でのファイル分類フロー（Deno.Command モック・実 tempdir）
//
//       classify-chatlogs の動作:
//         入力: baseDir/originalLogs/agent/YYYY/YYYY-MM/*.md
//         出力: ファイルを baseDir/originalLogs/agent/YYYY/YYYY-MM/<project>/ サブディレクトリに移動
//               (normalize-chatlog と異なり、別出力ディレクトリはない)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ---  BDD modules  ---
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stubs
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ---  Test target  ---
import { main } from '../../classify-chatlogs.ts';

// --- Helpers
// mocks
import {
  installCommandMock,
  makeClaudeJsonMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// logger stub
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';
// exists
import { readTextFile } from '../../../../_cle-libs/libs/file-io/read-utils.ts';
import { fileExists, fileOrDirExists } from '../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { resetProjectRoot } from '../../../../_cle-libs/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';

// ─── テスト用一時ディレクトリセットアップ ─────────────────────────────────────

/**
 * inputDir / configsDir を作成して返す。
 * - configsDir/config.yaml: 空の設定ファイル（GlobalConfig 用）
 * - configsDir/projects.dic: テスト用プロジェクト辞書（YAML 形式）
 * - inputDir/originalLogs/agent/YYYY/YYYY-MM/: 月別ディレクトリ（入れ子形式）
 */
async function _makeTestDirs(agent = 'claude', period = '2026-03'): Promise<{
  inputDir: string;
  configsDir: string;
  configFile: string;
  monthDir: string;
}> {
  const inputDir = normalizePath(await Deno.makeTempDir());
  const configsDir = normalizePath(await Deno.makeTempDir());
  const configFile = `${configsDir}/config.yaml`;
  const year = period.slice(0, 4);
  const monthDir = `${inputDir}/originalLogs/${agent}/${year}/${period}`;
  await Deno.mkdir(monthDir, { recursive: true });
  await Deno.writeTextFile(
    configFile,
    `dicsDir: "${configsDir}"\nprojectsDic: "${configsDir}/projects.dic"\ncacheDir: "${configsDir}/cache"\n`,
  );
  await Deno.writeTextFile(
    `${configsDir}/projects.dic`,
    'app1:\n  def: Test project 1\napp2:\n  def: Test project 2\n',
  );
  return { inputDir, configsDir, configFile, monthDir };
}

// ─── T-CL-E2E-01: dry-run モード ─────────────────────────────────────────────

describe('main - dry-run モード', () => {
  describe('Given: 1件の .md ファイルと claude agent', () => {
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-E2E-01 - dry-run → ファイルが移動しない', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );
          const response = JSON.stringify([
            { file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          loggerStub = makeLoggerStub();
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-01-01: 元ファイルが移動せず残っている', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileExists(`${monthDir}/chat.md`), true);
        });

        it('T-CL-E2E-01-02: dryrun ログが出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(loggerStub.dryrunLogs.length > 0, true);
        });
      });
    });
  });
});

// ─── T-CL-E2E-02: 正常分類 → ファイルがサブディレクトリに移動 ───────────────

describe('main - 正常分類', () => {
  describe('Given: 1件の .md ファイルと有効な分類結果', () => {
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      describe('Then: T-CL-E2E-02 - ファイルがプロジェクトサブディレクトリに移動', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );
          const response = JSON.stringify([
            { file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          errStub = stub(console, 'error', () => {});
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-02-01: ファイルが app1/ サブディレクトリに移動している', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileExists(`${monthDir}/app1/chat.md`), true);
        });

        it('T-CL-E2E-02-02: 移動先ファイルに "project: \\"app1\\"" が含まれる', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          const content = await readTextFile(`${monthDir}/app1/chat.md`);
          assertStringIncludes(content, 'project: "app1"');
        });
      });
    });
  });
});

// ─── T-CL-E2E-03: project 設定済みファイル（フラット配置）→ dry-run では移動されずスキップされる ─

describe('main - project 設定済みファイルの dry-run スキップ', () => {
  describe('Given: project が設定済みの .md ファイル（月ディレクトリ直下）', () => {
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-E2E-03 - dry-run のため AI 不使用・移動なしでスキップされる', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errLogs: string[];
        let errStub: Stub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\nproject: existing-project\n---\n本文',
          );
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('[]')),
          );
          errLogs = [];
          errStub = stub(console, 'error', (...args: unknown[]) => {
            errLogs.push(args.map(String).join(' '));
          });
          exitStub = stub(Deno, 'exit');
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          exitStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-03-01: dry-run のため moveChatlogEntry は呼ばれず、完了ログに skip=1 が含まれる', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('skip=1')), true);
        });

        it('T-CL-E2E-03-02: 完了ログに error=0 が含まれる', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('error=0')), true);
        });
      });
    });
  });

  describe('Given: project 設定済みファイル（CountingMockCommand で AI 呼び出し検証）', () => {
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-E2E-03-03 - Deno.Command が呼ばれない', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let counter: { calls: number };
        let errStub: Stub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\nproject: existing-project\n---\n本文',
          );
          counter = { calls: 0 };
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          errStub = stub(console, 'error', () => {});
          exitStub = stub(Deno, 'exit');
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          exitStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-03-03: Deno.Command が一度も構築されない（counter.calls === 0）', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(counter.calls, 0);
        });
      });
    });
  });
});

// ─── T-CL-E2E-08: project 設定済みファイルを正しいサブディレクトリに実際に移動 ─

describe('main - project 設定済みファイルの実移動', () => {
  describe('Given: project が設定済みの .md ファイル（月ディレクトリ直下）', () => {
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      describe('Then: T-CL-E2E-08 - existing-project/ サブディレクトリに移動される', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\nproject: existing-project\n---\n本文',
          );
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('[]')),
          );
          errStub = stub(console, 'error', () => {});
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-08-01: existing-project/ にファイルが移動している', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileExists(`${monthDir}/existing-project/chat.md`), true);
        });

        it('T-CL-E2E-08-02: 元のパスにファイルが存在しない', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileOrDirExists(`${monthDir}/chat.md`), false);
        });
      });
    });
  });
});

// ─── T-CL-E2E-09: サブディレクトリ内のファイルは走査対象外（直下1階層のみ走査） ─

describe('main - サブディレクトリ内のファイルは走査対象外', () => {
  describe('Given: project=app1 のファイルが月ディレクトリ/app1/ に存在（月ディレクトリ直下には .md なし）', () => {
    describe('When: main([...args]) を呼び出す', () => {
      describe('Then: T-CL-E2E-09 - 直下1階層のみ走査され、対象ファイルなしとして完了する', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errLogs: string[];
        let errStub: Stub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          // 既に app1/ サブディレクトリに配置済み（月ディレクトリ直下には .md ファイルなし）
          const app1Dir = `${inputDir}/originalLogs/claude/2026/2026-03/app1`;
          await Deno.mkdir(app1Dir, { recursive: true });
          await Deno.writeTextFile(
            `${app1Dir}/chat.md`,
            '---\ntitle: テスト\nproject: app1\n---\n本文',
          );
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('[]')),
          );
          errLogs = [];
          errStub = stub(console, 'error', (...args: unknown[]) => {
            errLogs.push(args.map(String).join(' '));
          });
          exitStub = stub(Deno, 'exit');
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          exitStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-09-01: 完了ログに moved=0 movedByAI=0 error=0 が含まれる（サブディレクトリは走査対象外）', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('moved=0 movedByAI=0 error=0')), true);
        });

        it('T-CL-E2E-09-02: app1/ 内のファイルは移動されず、そのまま残る', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(
            await fileOrDirExists(`${inputDir}/originalLogs/claude/2026/2026-03/app1/chat.md`),
            true,
          );
        });
      });
    });
  });
});

// ─── T-CL-E2E-04: 対象ファイルなし → エラーなし終了 ─────────────────────────

describe('main - 対象ファイルなし', () => {
  describe('Given: .md ファイルが存在しない月別ディレクトリ', () => {
    describe('When: main([...args]) を呼び出す', () => {
      describe('Then: T-CL-E2E-04 - moved=0 error=0 が出力される', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errLogs: string[];
        let errStub: Stub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          // monthDir は _makeTestDirs で作成済み、.md ファイルは置かない
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('[]')),
          );
          errLogs = [];
          errStub = stub(console, 'error', (...args: unknown[]) => {
            errLogs.push(args.map(String).join(' '));
          });
          exitStub = stub(Deno, 'exit');
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          exitStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-04-01: "moved=0 movedByAI=0 error=0" がログに出力される', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('moved=0 movedByAI=0 error=0')), true);
        });
      });
    });
  });
});

// ─── T-CL-E2E-05: 存在しない --input-dir パス → exit(1) ──────────────────────

describe('main - InputNotFound エラー', () => {
  describe('Given: 存在しない --input-dir パス', () => {
    describe('When: main([...args]) を呼び出す', () => {
      describe('Then: T-CL-E2E-05 - InputNotFound → ChatlogError で reject される', () => {
        let configsDir: string;
        let configFile: string;

        beforeEach(async () => {
          configsDir = normalizePath(await Deno.makeTempDir());
          configFile = `${configsDir}/defaults.yaml`;
          await Deno.writeTextFile(configFile, `dicsDir: "${configsDir}"\n`);
          await Deno.writeTextFile(
            `${configsDir}/projects.dic`,
            'app1:\n  def: Test project 1\n',
          );
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          GlobalConfig.resetInstance();
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-05-01: ChatlogError で main() が reject される', async () => {
          await assertRejects(
            () => main(['claude', '2026-03', '--input-dir', '/nonexistent/path/xyz', '--config', configFile]),
            ChatlogError,
          );
        });

        it('T-CL-E2E-05-02: エラーメッセージに "入力ディレクトリが見つかりません" が含まれる', async () => {
          const rejected = await assertRejects(
            () => main(['claude', '2026-03', '--input-dir', '/nonexistent/path/xyz', '--config', configFile]),
            ChatlogError,
          );

          assertStringIncludes((rejected as ChatlogError).message, '入力ディレクトリが見つかりません');
        });
      });
    });
  });
});

// ─── T-CL-E2E-06: AI 失敗 → ファイルは移動せず remaining=1 ─────────────────

describe('main - AI 失敗フォールバック', () => {
  describe('Given: 1件の .md ファイルと CLI 失敗モック', () => {
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      describe('Then: T-CL-E2E-06 - AI 失敗 → project 未確定のためファイルは移動されず、次回実行に残る', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let errLogs: string[];
        let errStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(makeFailMock(1));
          errLogs = [];
          errStub = stub(console, 'error', (...args: unknown[]) => {
            errLogs.push(args.map(String).join(' '));
          });
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-06-01: ファイルが元の場所に残っている', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileExists(`${monthDir}/chat.md`), true);
        });

        it('T-CL-E2E-06-02: 完了ログに moved=0 movedByAI=0 error=0 が含まれる（project 未確定のため remaining 扱い）', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(
            errLogs.some((l) => l.includes('moved=0 movedByAI=0 error=0')),
            true,
            '完了ログに moved=0 movedByAI=0 error=0 が含まれていない',
          );
        });
      });
    });
  });
});

// ─── T-CL-E2E-07: 期間フィルタ ───────────────────────────────────────────────

describe('main - 期間フィルタ', () => {
  describe('Given: 2026-02 と 2026-03 の両方に .md ファイルが存在', () => {
    describe('When: main(["claude", "2026-03", "--dry-run", ...]) を呼び出す', () => {
      describe('Then: T-CL-E2E-07 - 2026-03 のみ処理される', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let errStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs('claude', '2026-03'));
          // chatlogsDir を GlobalConfig 経由で inputDir に設定し、period による通常解決経路を通す
          await Deno.writeTextFile(
            configFile,
            `chatlogsDir: "${inputDir}"\ndicsDir: "${configsDir}"\nprojectsDic: "${configsDir}/projects.dic"\ncacheDir: "${configsDir}/cache"\n`,
          );
          // 2026-03 の対象ファイル
          await Deno.writeTextFile(
            `${monthDir}/in-scope.md`,
            '---\ntitle: 対象\ncategory: dev\n---\n本文',
          );
          // 2026-02 の期間外ファイル（resolveChatlogsDir で解決可能なツリー上に配置）
          const outOfScopeDir = `${inputDir}/originalLogs/claude/2026/2026-02`;
          await Deno.mkdir(outOfScopeDir, { recursive: true });
          await Deno.writeTextFile(
            `${outOfScopeDir}/out-of-scope.md`,
            '---\ntitle: 期間外\ncategory: dev\n---\n本文',
          );
          const response = JSON.stringify([
            { file: 'in-scope.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          loggerStub = makeLoggerStub();
          errStub = stub(console, 'error', () => {});
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          loggerStub.restore();
          errStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-07-01: 期間外ファイル（out-of-scope.md）がログに出力されない', async () => {
          await main(['claude', '2026-03', '--dry-run', '--config', configFile]);

          const allInfoLogs = loggerStub.infoLogs.join('\n');
          assertEquals(allInfoLogs.includes('out-of-scope.md'), false);
        });

        it('T-CL-E2E-07-02: 期間内ファイルのみが対象となり、dryrun AI 分類スキップログに 1件と出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--config', configFile]);

          assertEquals(
            loggerStub.dryrunLogs.some((l) => l.includes('1件')),
            true,
          );
        });
      });
    });
  });
});

// ─── T-CL-E2E-11: 存在しない period → InputNotFound ─────────────────────────

/**
 * `main` 関数の E2E テストスイート（存在しない period ディレクトリ）。
 *
 * period を指定したとき、その月ディレクトリが存在しない場合に
 * InputNotFound エラーになることを検証する。
 *
 * テスト ID 範囲: T-CL-E2E-11
 *
 * @see main
 */
describe('main - 存在しない period ディレクトリ → InputNotFound', () => {
  /**
   * agent ディレクトリは存在するが、period ディレクトリ（2026-99）が存在しない前提。
   *
   * period 込みで存在確認を行い、存在しない場合は InputNotFound エラーと
   * Deno.exit(1) が発生することを確認する。
   */
  describe('Given: agent ディレクトリは存在するが period ディレクトリが存在しない', () => {
    /** `main(["claude", "2026-99", "--config", configFile])` を呼び出すとき（GlobalConfig の chatlogsDir 経由で解決）。 */
    describe('When: main(["claude", "2026-99", "--config", configFile]) を呼び出す', () => {
      /** InputNotFound エラーが発生し ChatlogError で reject されること。 */
      describe('Then: T-CL-E2E-11 - InputNotFound → ChatlogError で reject される', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;

        beforeEach(async () => {
          // 2026-03 ディレクトリは作成されるが、2026-99 は存在しない
          ({ inputDir, configsDir, configFile } = await _makeTestDirs('claude', '2026-03'));
          // chatlogsDir を GlobalConfig 経由で inputDir に設定し、resolveChatlogsDir の通常解決経路を通す
          await Deno.writeTextFile(
            configFile,
            `chatlogsDir: "${inputDir}"\ndicsDir: "${configsDir}"\n`,
          );
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-11-01: ChatlogError で main() が reject される', async () => {
          await assertRejects(
            () => main(['claude', '2026-99', '--config', configFile]),
            ChatlogError,
          );
        });

        it('T-CL-E2E-11-02: エラーメッセージに "入力ディレクトリが見つかりません" が含まれる', async () => {
          const rejected = await assertRejects(
            () => main(['claude', '2026-99', '--config', configFile]),
            ChatlogError,
          );

          assertStringIncludes((rejected as ChatlogError).message, '入力ディレクトリが見つかりません');
        });
      });
    });
  });
});

// ─── T-CL-E2E-10: --input-dir フルパス直接指定 ───────────────────────────────

describe('main - --input-dir フルパス直接指定', () => {
  describe('Given: --input-dir に月ディレクトリのフルパスを指定', () => {
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-E2E-10 - dry-run でファイルが移動しない', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );
          const response = JSON.stringify([
            { file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          loggerStub = makeLoggerStub();
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-10-01: --input-dir フルパス dry-run → 元ファイルが残る', async () => {
          await main(['--input-dir', monthDir, '--dry-run', '--config', configFile]);
          assertEquals(await fileExists(`${monthDir}/chat.md`), true);
        });

        it('T-CL-E2E-10-02: dryrun ログが出力される', async () => {
          await main(['--input-dir', monthDir, '--dry-run', '--config', configFile]);
          assertEquals(loggerStub.dryrunLogs.length > 0, true);
        });
      });
    });
  });
});

// ─── T-CL-E2E-12: 非 ChatlogError 例外 → exit せず再スロー ───────────────────

/**
 * `main` 関数の E2E テストスイート（非 `ChatlogError` 例外の再スローパス）。
 *
 * `projects.dic` 読み込み時に `ChatlogError` ではない例外（`TypeError`）が
 * 発生した場合、`main()` は catch せず、`Deno.exit` を呼ばずに
 * そのまま呼び出し元へ再スローすることを検証する。
 *
 * テスト ID 範囲: T-CL-E2E-12
 *
 * @see main
 */
describe('main - 非 ChatlogError 例外の再スロー', () => {
  /** 入力ディレクトリは存在するが、projects.dic 読み込み時に予期しない TypeError が発生する前提。 */
  describe('Given: projects.dic 読み込み時に TypeError が発生する', () => {
    /** `main(["claude", "2026-03", "--input-dir", monthDir, "--config", configFile])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 非 ChatlogError 例外が再スローされ、Deno.exit は呼ばれないこと。 */
      describe('Then: T-CL-E2E-12 - 非 ChatlogError → exit せず再スロー', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let readStub: Stub;
        let errStub: Stub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );
          resetProjectRoot(inputDir);
          const originalReadTextFile = Deno.readTextFile.bind(Deno);
          readStub = stub(
            Deno,
            'readTextFile',
            ((path: string | URL, options?: Deno.ReadFileOptions) => {
              if (String(path).includes('projects.dic')) {
                throw new TypeError('予期しないエラー');
              }
              return originalReadTextFile(path, options);
            }) as typeof Deno.readTextFile,
          );
          errStub = stub(console, 'error', () => {});
          exitStub = stub(Deno, 'exit');
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          readStub.restore();
          resetProjectRoot();
          errStub.restore();
          exitStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-12-01: main の呼び出しが TypeError で reject し、ChatlogError ではない', async () => {
          const error = await assertRejects(() =>
            main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile])
          );

          assertEquals(error instanceof TypeError, true);
          assertEquals(error instanceof ChatlogError, false);
        });

        it('T-CL-E2E-12-02: Deno.exit が呼ばれない', async () => {
          try {
            await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);
          } catch { /* TypeError が再スローされる想定 */ }

          assertEquals(exitStub.calls.length, 0, 'Deno.exit が呼ばれてはいけない');
        });
      });
    });
  });
});

// ─── T-CL-E2E-13: キャッシュ済みファイル → claude CLI 未呼び出し ─────────────

/**
 * `main` 関数の E2E テストスイート（キャッシュ済み AI 分類判定）。
 *
 * `classify-cache` に対象ファイルの判定結果（`project`）が既に書き込まれている場合、
 * `processClassify` が AI 呼び出し前にそのファイルを除外し、claude CLI を呼ばずに
 * キャッシュの `project` でファイルを移動することを検証する。
 *
 * テスト ID 範囲: T-CL-E2E-13
 *
 * @see main
 */
describe('main - キャッシュ済み AI 分類判定', () => {
  /**
   * `chat.md` に対する分類結果として `project: 'app1'` が `classify-cache` に既に書き込まれている前提。
   *
   * キャッシュ済みファイルは claude CLI 呼び出し前に除外され、キャッシュの project で移動されることを確認する。
   */
  describe('Given: classify-cache に chat.md の判定結果（project: app1）を配置', () => {
    /** `main(["claude", "2026-03", "--input-dir", monthDir, "--config", configFile])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      /** claude CLI が呼び出されず、ファイルが app1/ サブディレクトリに移動されること。 */
      describe('Then: T-CL-E2E-13 - claude CLI 未呼び出し・キャッシュの project で移動される', () => {
        let inputDir: string;
        let configsDir: string;
        let configFile: string;
        let monthDir: string;
        let commandHandle: CommandMockHandle;
        let counter: { calls: number };
        let errStub: Stub;

        beforeEach(async () => {
          ({ inputDir, configsDir, configFile, monthDir } = await _makeTestDirs());
          await Deno.writeTextFile(
            `${monthDir}/chat.md`,
            '---\ntitle: テスト\ncategory: development\n---\n本文',
          );

          const cacheDir = `${configsDir}/cache/classify-cache`;
          await Deno.mkdir(cacheDir, { recursive: true });
          await Deno.writeTextFile(
            `${cacheDir}/chat.json`,
            JSON.stringify({ project: 'app1', confidence: 0.9, reason: 'cached decision' }),
          );

          counter = { calls: 0 };
          resetProjectRoot(inputDir);
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          errStub = stub(console, 'error', () => {});
          GlobalConfig.resetInstance();
        });

        afterEach(async () => {
          commandHandle.restore();
          resetProjectRoot();
          errStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(inputDir, { recursive: true });
          await Deno.remove(configsDir, { recursive: true });
        });

        it('T-CL-E2E-13-01: claude CLI が呼び出されない', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(counter.calls, 0);
        });

        it('T-CL-E2E-13-02: ファイルが app1/ サブディレクトリに移動している', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileExists(`${monthDir}/app1/chat.md`), true);
        });
      });
    });
  });
});
