// src: scripts/__tests__/unit/main.unit.spec.ts
// @(#): classify-chatlogs.ts のユニットテスト
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../classify-chatlogs.ts';

// ─── Helpers
import {
  installCommandMock,
  makeCountingMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Internal Helpers

/**
 * inputDir / configsDir を作成して返す。
 * - configsDir/config.yaml: GlobalConfig 用の最小設定（dicsDir/projectsDic/cacheDir）
 * - configsDir/projects.dic: テスト用プロジェクト辞書（YAML 形式、省略時は app1/app2）
 * - inputDir/originalLogs/agent/YYYY/YYYY-MM/: 月別ディレクトリ（入れ子形式）
 */
async function _makeTestDirs(
  agent = 'claude',
  period = '2026-03',
  projectsDicText = 'app1:\n  def: Test project 1\napp2:\n  def: Test project 2\n',
): Promise<{
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
  await Deno.writeTextFile(`${configsDir}/projects.dic`, projectsDicText);
  return { inputDir, configsDir, configFile, monthDir };
}

/**
 * `_makeTestDirs` で作成した一時ディレクトリ・`GlobalConfig` を後始末する。
 *
 * @param inputDir - `_makeTestDirs` が返した inputDir
 * @param configsDir - `_makeTestDirs` が返した configsDir
 */
async function _cleanupTestDirs(inputDir: string, configsDir: string): Promise<void> {
  resetProjectRoot();
  GlobalConfig.resetInstance();
  await Deno.remove(inputDir, { recursive: true });
  await Deno.remove(configsDir, { recursive: true });
}

// ─── Tests

/**
 * `main` 関数のユニットテストスイート。
 *
 * e2e テスト（main.e2e.spec.ts）でカバーされるファイル移動の最終状態確認とは異なり、
 * ここでは main() のオーケストレーション分岐（早期return、統計集計、警告ログ、dry-run 分岐）を検証する。
 *
 * テスト ID 範囲: T-CL-MAIN-01 〜 T-CL-MAIN-05
 *
 * @see main
 */
describe('main', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-MAIN-01: AI 分類経由で移動 → 完了ログに moved=0 movedByAI=1 error=0 remaining=0 が含まれる', async () => {
      const { inputDir, configsDir, configFile, monthDir } = await _makeTestDirs();
      await Deno.writeTextFile(
        `${monthDir}/chat.md`,
        '---\ntitle: テスト\ncategory: development\n---\n本文',
      );
      const response = JSON.stringify([
        { file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      resetProjectRoot(inputDir);
      const commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));
      const errStub = stub(console, 'error', () => {});
      GlobalConfig.resetInstance();

      try {
        await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

        const errLogs = errStub.calls.map((c) => c.args.map(String).join(' ')).join('\n');
        assertStringIncludes(errLogs, 'moved=0 movedByAI=1 error=0 remaining=0');
      } finally {
        commandHandle.restore();
        errStub.restore();
        await _cleanupTestDirs(inputDir, configsDir);
      }
    });

    it('[Normal] T-CL-MAIN-05: --dry-run 指定 → dryrun ログと完了ログの "(dry-run)" サフィックスが出力される', async () => {
      const { inputDir, configsDir, configFile, monthDir } = await _makeTestDirs();
      await Deno.writeTextFile(
        `${monthDir}/chat.md`,
        '---\ntitle: テスト\ncategory: development\n---\n本文',
      );
      const response = JSON.stringify([
        { file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      resetProjectRoot(inputDir);
      const commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));
      const loggerStub = makeLoggerStub();
      GlobalConfig.resetInstance();

      try {
        await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

        assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('ファイルは移動しません')), true);
        assertEquals(loggerStub.infoLogs.some((l) => l.includes('完了 (dry-run):')), true);
      } finally {
        commandHandle.restore();
        loggerStub.restore();
        await _cleanupTestDirs(inputDir, configsDir);
      }
    });

    it('[Normal] T-CL-MAIN-06: --dry-run 指定 → claude CLI は呼び出されず、完了ログに remaining=1 が含まれる', async () => {
      const { inputDir, configsDir, configFile, monthDir } = await _makeTestDirs();
      await Deno.writeTextFile(
        `${monthDir}/chat.md`,
        '---\ntitle: テスト\ncategory: development\n---\n本文',
      );
      resetProjectRoot(inputDir);
      const counter = { calls: 0 };
      const commandHandle = installCommandMock(makeCountingMock('[]', counter));
      const loggerStub = makeLoggerStub();
      GlobalConfig.resetInstance();

      try {
        await main(['claude', '2026-03', '--dry-run', '--input-dir', monthDir, '--config', configFile]);

        assertEquals(counter.calls, 0);
        assertEquals(loggerStub.infoLogs.some((l) => l.includes('remaining=1')), true);
      } finally {
        commandHandle.restore();
        loggerStub.restore();
        await _cleanupTestDirs(inputDir, configsDir);
      }
    });
  });

  describe('When: 異常系', () => {
    it('[Error] T-CL-MAIN-02: 入力ディレクトリが存在しない → ChatlogError(InputNotFound, NotFound) がスローされる', async () => {
      const configsDir = normalizePath(await Deno.makeTempDir());
      const configFile = `${configsDir}/config.yaml`;
      await Deno.writeTextFile(configFile, `dicsDir: "${configsDir}"\n`);
      await Deno.writeTextFile(`${configsDir}/projects.dic`, 'app1:\n  def: Test project 1\n');
      GlobalConfig.resetInstance();

      try {
        const error = await assertRejects(
          () => main(['claude', '2026-03', '--input-dir', '/nonexistent/path/xyz', '--config', configFile]),
          ChatlogError,
        );

        assertEquals((error as ChatlogError).kind, 'InputNotFound');
        assertEquals((error as ChatlogError).subindex, 'NotFound');
      } finally {
        GlobalConfig.resetInstance();
        await Deno.remove(configsDir, { recursive: true });
      }
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-MAIN-03: 対象ファイル0件 → moved=0 movedByAI=0 error=0 remaining=0 で早期returnし、claude CLI が呼び出されない', async () => {
      const { inputDir, configsDir, configFile, monthDir } = await _makeTestDirs();
      resetProjectRoot(inputDir);
      const counter = { calls: 0 };
      const commandHandle = installCommandMock(makeCountingMock('[]', counter));
      const errStub = stub(console, 'error', () => {});
      GlobalConfig.resetInstance();

      try {
        await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

        const errLogs = errStub.calls.map((c) => c.args.map(String).join(' ')).join('\n');
        assertStringIncludes(errLogs, 'moved=0 movedByAI=0 error=0 remaining=0');
        assertEquals(counter.calls, 0);
      } finally {
        commandHandle.restore();
        errStub.restore();
        await _cleanupTestDirs(inputDir, configsDir);
      }
    });

    it('[Edge] T-CL-MAIN-04: projects.dic が空 → "projects.dic にプロジェクトが定義されていません" が警告ログに出力される', async () => {
      const { inputDir, configsDir, configFile, monthDir } = await _makeTestDirs('claude', '2026-03', '');
      resetProjectRoot(inputDir);
      const commandHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('[]')));
      const loggerStub = makeLoggerStub();
      GlobalConfig.resetInstance();

      try {
        await main(['claude', '2026-03', '--input-dir', monthDir, '--config', configFile]);

        assertEquals(
          loggerStub.warnLogs.some((l) => l.includes('projects.dic にプロジェクトが定義されていません')),
          true,
        );
      } finally {
        commandHandle.restore();
        loggerStub.restore();
        await _cleanupTestDirs(inputDir, configsDir);
      }
    });
  });
});
