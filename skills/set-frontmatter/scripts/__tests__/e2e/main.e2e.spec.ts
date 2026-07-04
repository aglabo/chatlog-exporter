// src: scripts/__tests__/e2e/set-frontmatter.main.e2e.spec.ts
// @(#): main() の E2E テスト
//       main() 経由でのフロントマター付加フロー（Deno.Command モック・実 tempdir）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { main } from '../../set-frontmatter.ts';

// helpers
import type { CommandMockHandle, DenoCommandLike } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  BaseMockCommand,
  installCommandMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';

// ─── テスト用一時ディレクトリセットアップ ─────────────────────────────────────

const _enc = new TextEncoder();

/**
 * dics + prompts ディレクトリを作成し、最低限のファイルを配置する。
 * loadDics は dicsDir の末尾 "dics" を "prompts" に置換して promptsDir を決定するため、
 * baseDir/dics の形式でディレクトリを作成する。
 */
async function _makeDicsDir(): Promise<string> {
  const baseDir = await Deno.makeTempDir();
  const dicsDir = `${baseDir}/dics`;
  const promptsDir = `${baseDir}/prompts`;
  await Deno.mkdir(dicsDir, { recursive: true });
  await Deno.mkdir(promptsDir, { recursive: true });

  // 辞書ファイル（最低限の内容）
  await Deno.writeTextFile(
    `${dicsDir}/types.dic`,
    'research:\n  def: 調査\n  desc: 調査\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(
    `${dicsDir}/category.dic`,
    'development:\n  def: 開発\n  desc: 開発\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(
    `${dicsDir}/topics.dic`,
    'development:\n  def: 開発\n  desc: 開発\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(`${dicsDir}/tags.dic`, '"lang:typescript":\n  def: TypeScript\n');

  // プロンプトファイル
  await Deno.writeTextFile(`${promptsDir}/type.yaml`, 'system: "type ${type_dics}"\nuser: "${entries}"\n');
  await Deno.writeTextFile(
    `${promptsDir}/category.yaml`,
    'system: "category"\nuser: "${category_list} ${focus_guide} ${body}"\n',
  );
  await Deno.writeTextFile(
    `${promptsDir}/meta.yaml`,
    'system: "meta"\nuser: "${log_type} ${log_category} ${topic_list} ${tags_list} ${body}"\n',
  );
  await Deno.writeTextFile(
    `${promptsDir}/review.yaml`,
    'system: "review"\nuser: "${type_dics} ${topic_list} ${category_list} ${tags_list} ${result_type} ${result_category} ${result_yaml}"\n',
  );

  return dicsDir;
}

/** .md ファイルを持つ targetDir を作成する */
async function _makeTargetDir(content?: string): Promise<string> {
  const targetDir = await Deno.makeTempDir();
  const mdContent = content ?? '# テスト\n本文テキスト';
  await Deno.writeTextFile(`${targetDir}/test.md`, mdContent);
  return targetDir;
}

// ─── T-SF-E2E-01: dry-run → ファイル変更なし ─────────────────────────────────

describe('main - dry-run モード', () => {
  describe('Given: 1件の .md ファイルと dry-run フラグ', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--dry-run", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-01 - ファイルが変更されない', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();

          // 各フェーズの応答を順番に返す（全呼び出しで成功）
          const callIdx = 0;
          const phaseResponses = [
            'research',
            'development',
            'title: テスト\nsummary: 概要',
            'validity: pass',
          ];
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(phaseResponses.join('\n')), { value: [] }),
          );
          void callIdx;

          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-01-01: ファイルの内容が変更されない', async () => {
          const originalContent = await readTextFile(`${inputDir}/test.md`);

          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          const updatedContent = await readTextFile(`${inputDir}/test.md`);
          assertEquals(updatedContent, originalContent);
        });

        it('T-SF-E2E-01-02: "[dry-run]" がログに出力される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('[dry-run]')), true);
        });

        it('T-SF-E2E-01-03: Phase 2 (type判定) が実行されない', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.every((l) => !l.includes('Phase 2')), true);
        });
      });
    });
  });

  // ─── T-SF-E2E-01-04: status=written ファイルは dry-run 後も変わらない ────────
  describe('Given: status=written のファイルと dry-run フラグ', () => {
    describe('When: main([--input-dir, --output-dir, --cache-dir, --dry-run, --no-review, --dics]) を呼び出す', () => {
      describe('Then: T-SF-E2E-01-04 - status=written ファイルの内容が変わらない', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir('---\ntitle: Test\n---\n# body\n');
          outputDir = await Deno.makeTempDir();
          cacheDir = await _makeCacheDir(['test']);
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Normal] T-SF-E2E-01-04: status=written のファイルは --dry-run 実行後も内容が変わらない', async () => {
          const originalContent = await readTextFile(`${inputDir}/test.md`);

          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          const updatedContent = await readTextFile(`${inputDir}/test.md`);
          assertEquals(updatedContent, originalContent);
        });
      });
    });
  });
});

// ─── T-SF-E2E-02: --no-review → Phase 3.5 スキップ ───────────────────────────

describe('main - --no-review モード', () => {
  describe('Given: 1件の .md ファイルと --no-review フラグ', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-02 - Phase 3.5 スキップのログが出力される', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('research')),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-02-01: "--no-review" または "スキップ" がログに含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(
            loggerStub.infoLogs.some((l) =>
              l.includes('no-review') || l.includes('スキップ') || l.includes('Phase 3.5')
            ),
            true,
          );
        });
      });
    });
  });
});

// ─── T-SF-E2E-05: yaml 生成失敗 → stats.fail が出力される ───────────────────

describe('main - yaml 生成失敗', () => {
  describe('Given: Claude CLI がすべて成功するが yaml が空になるモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-05 - fail=1 のサマリーが出力される', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          // 全フェーズで空文字を返す（title: なし → cleanYaml で空になる）
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('')),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-05-01: "fail=1" がサマリーに出力される', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir, '--no-review', '--dics', dicsDir]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('fail=1')), true);
        });
      });
    });
  });
});

// ─── T-SF-E2E-10: --cache-dir が ChatlogWorks に渡される ─────────────────────────

/**
 * フェーズごとに異なる stdout を返す sequential mock ファクトリ。
 *
 * `responses` の順番に応答し、範囲外のインデックスは最後の応答を返す。
 */
const _makeSequentialMock = (responses: Uint8Array[]): DenoCommandLike => {
  let callCount = 0;
  return class extends BaseMockCommand {
    private readonly _stdout: Uint8Array;
    constructor(_cmd: string, _opts: unknown) {
      super();
      const idx = callCount < responses.length ? callCount : responses.length - 1;
      this._stdout = responses[idx];
      callCount++;
    }
    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
      return Promise.resolve({ success: true, code: 0, stdout: this._stdout });
    }
  } as unknown as DenoCommandLike;
};

describe('main - --cache-dir オプション', () => {
  describe('Given: inputDir に test.md を配置し、--cache-dir を明示指定', () => {
    describe('When: main() を呼び出す', () => {
      describe('Then: T-SF-E2E-10 - cacheDir が ChatlogWorks に渡され、出力ファイルが生成される', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await Deno.makeTempDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();

          await Deno.writeTextFile(`${inputDir}/test.md`, '# テスト\n本文テキスト');

          commandHandle = installCommandMock(
            _makeSequentialMock([
              _enc.encode('research\ndevelopment'),
              _enc.encode(
                'title: Generated Title\nsummary: テスト概要\ntopics:\n  - development\ntags:\n  - lang:typescript\n',
              ),
            ]),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-10-01: outputDir に test.md が生成される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          let exists = false;
          try {
            await Deno.stat(`${outputDir}/test.md`);
            exists = true;
          } catch { /* noop */ }
          assertEquals(exists, true);
        });

        it('T-SF-E2E-10-02: 出力ファイルのフロントマターに type, category, title, summary が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          const content = await readTextFile(`${outputDir}/test.md`);
          assertStringIncludes(content, 'type:');
          assertStringIncludes(content, 'category:');
          assertStringIncludes(content, 'title:');
          assertStringIncludes(content, 'summary:');
        });

        it('T-SF-E2E-10-03: cacheDir/fm-cache/test.json が生成される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          let exists = false;
          try {
            await Deno.stat(`${cacheDir}/fm-cache/test.json`);
            exists = true;
          } catch { /* noop */ }
          assertEquals(exists, true);
        });
      });
    });
  });
});

// ─── T-SF-DR: dry-run 完了ログと dry-run ループ対象 ──────────────────────────

/**
 * 2件の .md ファイルを持つ inputDir を作成する。
 * `written.md` と `target.md` を配置する。
 */
const _makeTwoFileDir = async (): Promise<string> => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${dir}/written.md`, '# written\n本文');
  await Deno.writeTextFile(`${dir}/target.md`, '# target\n本文');
  return dir;
};

/**
 * キャッシュディレクトリを作成し、指定キーに `{ status: 'written' }` の JSON を書き込む。
 * @param basenames - 拡張子なしファイル名（例: `['written']`）
 */
const _makeCacheDir = async (basenames: string[]): Promise<string> => {
  const cacheDir = await Deno.makeTempDir();
  const fmCacheDir = `${cacheDir}/fm-cache`;
  await Deno.mkdir(fmCacheDir, { recursive: true });
  await Promise.all(
    basenames.map((name) => Deno.writeTextFile(`${fmCacheDir}/${name}.json`, JSON.stringify({ status: 'written' }))),
  );
  return cacheDir;
};

describe('main - dry-run 完了ログ (T-SF-DR)', () => {
  /**
   * `dry-run` 時の完了ログと `[dry-run]` ループ対象の検証。
   *
   * Fix 1: dry-run ループを `targetEntries` に限定。
   * Fix 2: 完了ログに `written=N target=N` を追加。
   *
   * テスト ID 範囲: T-SF-DR-01 〜 T-SF-DR-05
   */

  // ─── T-SF-DR-01: written=1/target=1 混在 ─────────────────────────────────
  describe('Given: 2件の .md と cache に 1件 written', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-01 - 完了ログに written=1 target=1 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTwoFileDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await _makeCacheDir(['written']);
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-DR-01-01: 完了ログに "written=1 target=1" が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=1 target=1')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-02: すべて written → target=0 ──────────────────────────────
  describe('Given: 1件の .md と cache に 1件 written（全件 written）', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-02 - 完了ログに written=1 target=0 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await _makeCacheDir(['test']);
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-DR-02-01: 完了ログに "written=1 target=0" が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=1 target=0')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-03: すべて target → written=0 ──────────────────────────────
  describe('Given: 1件の .md と cache エントリなし（全件 target）', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-03 - 完了ログに written=0 target=1 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-DR-03-01: 完了ログに "written=0 target=1" が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=0 target=1')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-04: [dry-run] ログが targetEntries のみを含む ───────────────
  describe('Given: 2件の .md と cache に 1件 written', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-04 - [dry-run] ログが target ファイル名を含み written を含まない', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTwoFileDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await _makeCacheDir(['written']);
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-DR-04-01: [dry-run] ログに target.md のファイル名が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('[dry-run]') && l.includes('target.md')), true);
        });

        it('T-SF-DR-04-02: [dry-run] ログに written.md のファイル名が含まれない', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.every((l) => !(l.includes('[dry-run]') && l.includes('written.md'))), true);
        });
      });
    });
  });

  // ─── T-SF-DR-05: すべて written → [dry-run] ログなし ────────────────────
  describe('Given: 1件の .md と全件 written のキャッシュ', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-05 - [dry-run] ログが0件', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await _makeCacheDir(['test']);
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-DR-05-01: [dry-run] を含むログが0件', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.every((l) => !l.includes('[dry-run]')), true);
        });
      });
    });
  });
});

// ─── T-SF-E2E-DR-05: dry-run → FAIL(yaml空) が出ない ────────────────────────

describe('main - dry-run FAIL抑制 (T-SF-E2E-DR-05)', () => {
  /**
   * `--dry-run` 実行時は Phase 4 の FAIL 判定をスキップし、
   * `FAIL (yaml空)` のエラーログが出力されないことを検証する。
   *
   * テスト ID 範囲: T-SF-E2E-DR-05-01 〜 T-SF-E2E-DR-05-02
   */
  describe('Given: Claude CLI が空レスポンスを返し --dry-run フラグがある', () => {
    describe('When: main([--input-dir, --output-dir, --dry-run, --no-review, --dics]) を呼び出す', () => {
      describe('Then: T-SF-E2E-DR-05 - FAIL(yaml空) ログが出ない', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          // 全フェーズで空文字を返す（status が空になる条件）
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('')),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Normal] T-SF-E2E-DR-05-01: errorLogs に "FAIL (yaml空)" が含まれない', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.errorLogs.every((l) => !l.includes('FAIL (yaml空)')), true);
        });

        it('[Normal] T-SF-E2E-DR-05-02: infoLogs に "fail=0" が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('fail=0')), true);
        });
      });
    });
  });
});
