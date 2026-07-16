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
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// logger stub
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// exists
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { fileExists, fileOrDirExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

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
  await Deno.writeTextFile(configFile, `dicsDir: "${configsDir}"\n`);
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
            makeSuccessMock(new TextEncoder().encode(response)),
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

        it('T-CL-E2E-01-02: "[dry-run]" がログに出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('[dry-run]')), true);
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
            makeSuccessMock(new TextEncoder().encode(response)),
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

// ─── T-CL-E2E-03: project 設定済みファイル（フラット配置）→ サブディレクトリに移動 ─

describe('main - project 設定済みファイルの移動', () => {
  describe('Given: project が設定済みの .md ファイル（月ディレクトリ直下）', () => {
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-E2E-03 - AI 不使用でサブディレクトリに移動される', () => {
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

        it('T-CL-E2E-03-01: 完了ログに moved=1 が含まれる', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('moved=1')), true);
        });

        it('T-CL-E2E-03-02: 完了ログに skipped=0 が含まれる', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('skipped=0')), true);
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

// ─── T-CL-E2E-09: 既に正しいサブディレクトリにある → skipped ────────────────

describe('main - 既に正しいサブディレクトリにあるファイル → skipped', () => {
  describe('Given: project=app1 のファイルが月ディレクトリ/app1/ に存在', () => {
    describe('When: main([...args]) を呼び出す', () => {
      describe('Then: T-CL-E2E-09 - 二重ネストせず skipped になる', () => {
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
          // 既に app1/ サブディレクトリに配置済み
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

        it('T-CL-E2E-09-01: 完了ログに skipped=1 が含まれる（二重ネストしない）', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('skipped=1')), true);
        });

        it('T-CL-E2E-09-02: app1/app1/ ディレクトリが作成されない', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(await fileOrDirExists(`${inputDir}/originalLogs/claude/2026/2026-03/app1/app1`), false);
        });
      });
    });
  });
});

// ─── T-CL-E2E-04: 対象ファイルなし → エラーなし終了 ─────────────────────────

describe('main - 対象ファイルなし', () => {
  describe('Given: .md ファイルが存在しない月別ディレクトリ', () => {
    describe('When: main([...args]) を呼び出す', () => {
      describe('Then: T-CL-E2E-04 - moved=0 skipped=0 error=0 が出力される', () => {
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

        it('T-CL-E2E-04-01: "moved=0 movedByAI=0 skipped=0 error=0" がログに出力される', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(errLogs.some((l) => l.includes('moved=0 movedByAI=0 skipped=0 error=0')), true);
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

// ─── T-CL-E2E-06: AI 失敗 → ファイルは移動せず error=1 ─────────────────────

describe('main - AI 失敗フォールバック', () => {
  describe('Given: 1件の .md ファイルと CLI 失敗モック', () => {
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      describe('Then: T-CL-E2E-06 - AI 失敗 → ファイルは移動せず error=1', () => {
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

        it('T-CL-E2E-06-02: 完了ログに error=1 が含まれる', async () => {
          await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

          assertEquals(
            errLogs.some((l) => l.includes('error=1')),
            true,
            '完了ログに error=1 が含まれていない',
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
            `chatlogsDir: "${inputDir}"\ndicsDir: "${configsDir}"\n`,
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
            makeSuccessMock(new TextEncoder().encode(response)),
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

        it('T-CL-E2E-07-02: 期間内ファイル（in-scope.md）の [dry-run] ログが出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--config', configFile]);

          assertEquals(
            loggerStub.infoLogs.some((l) => l.includes('[dry-run]') && l.includes('in-scope.md')),
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
            makeSuccessMock(new TextEncoder().encode(response)),
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

        it('T-CL-E2E-10-02: "[dry-run]" がログに出力される', async () => {
          await main(['--input-dir', monthDir, '--dry-run', '--config', configFile]);
          assertEquals(loggerStub.infoLogs.some((l) => l.includes('[dry-run]')), true);
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
