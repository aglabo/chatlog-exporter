#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlogs-io.e2e.spec.ts
// @(#): main() の I/O 検証 E2E テスト
//       ファイル生成・ディレクトリ解決（--input-dir / --agent --year-month）・エラー終了を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── Deno Test module
import { assertEquals, assertMatch, assertNotMatch, assertRejects, assertStringIncludes } from '@std/assert';
import { after, afterEach, before, beforeEach, describe, it } from '@std/testing/bdd';
// path
import { resolve } from '@std/path';

// ─── test target ───────────────────────────────────────────────────────────────
import { main } from '../../normalize-chatlogs.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import {
  makeTempDirs,
  removeTempDirs,
  silenceLog,
} from '../../../../_cle-libs/__tests__/helpers/e2e-setup.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { findFiles } from '../../../../_cle-libs/libs/file-ops/find-files.ts';
import { getDirectory, getRelativePath, normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';
// type
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { LogSilencer } from '../../../../_cle-libs/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { HashProvider } from '../../../../_cle-libs/types/providers.types.ts';

// ─── Internal Helpers

// functions

/**
 * `files` のすべての親ディレクトリが `dir` と一致する（サブディレクトリに振り分けられていない）かを返す。
 *
 * @param files - 検査する出力ファイルパス
 * @param dir   - 期待する親ディレクトリ
 */
const _allDirectlyUnder = (files: string[], dir: string): boolean =>
  files.every((f) => getDirectory(f) === normalizePath(dir));

/**
 * テスト用 `GlobalConfig` インスタンスを `cacheDir` 指定の YAML で生成する。
 *
 * `GlobalConfig.resetInstance()` 済みであることを前提に、`normalize-cache` を
 * `tempDir` 配下に隔離し、他テストの残留キャッシュの影響を防ぐ。
 *
 * @param tempDir - キャッシュディレクトリの起点となる一時ディレクトリパス
 */
const _makeGlobalConfig = (tempDir: string): GlobalConfig =>
  GlobalConfig.getInstance({ yaml: `cacheDir: '${tempDir}/cache'` });

/**
 * `cacheDir` に加えて `chatlogsDir` も `tempDir` 配下の存在しないパスへ隔離した `GlobalConfig` を生成する。
 *
 * `--file` を無視する実装では `main()` が `chatlogsDir` 既定 (`./chatlogs`) の入力ディレクトリへ
 * フォールバックする。そこに開発機の実ファイルがあると読んでしまうため、フォールバック先を
 * 存在しない一時パスに向け、誤った経路では `InputNotFound` で止まるようにする。
 *
 * @param tempDir - キャッシュ・chatlogsDir の起点となる一時ディレクトリパス
 */
const _makeIsolatedGlobalConfig = (tempDir: string): GlobalConfig =>
  GlobalConfig.getInstance({ yaml: `cacheDir: '${tempDir}/cache'\nchatlogsDir: '${tempDir}/no-chatlogs'` });

/**
 * `cacheDir` を `tempDir` 配下に隔離し、`chatlogsDir` を指定値にした `GlobalConfig` を生成する。
 *
 * `--output-dir` を渡さない `main()` は `chatlogsDir` から既定の出力先を組み立てる。
 * 実リポジトリの `./chatlogs` へ書き出さないよう、出力先を必ず一時ディレクトリ配下へ向ける。
 *
 * @param tempDir     - キャッシュディレクトリの起点となる一時ディレクトリパス
 * @param chatlogsDir - `chatlogsDir` に設定するパス（絶対・相対どちらも可）
 */
const _makeChatlogsGlobalConfig = (tempDir: string, chatlogsDir: string): GlobalConfig =>
  GlobalConfig.getInstance({ yaml: `cacheDir: '${tempDir}/cache'\nchatlogsDir: '${chatlogsDir}'` });

/**
 * `filePath` にチャットログを書き出し、そのファイルに 1 セグメントを返す AI モックを差し込む。
 *
 * @param filePath - 書き出し先の正規化済み絶対パス（親ディレクトリは自動作成する）
 * @returns `Deno.Command` モックの復元用ハンドル
 */
const _writeChatlogWithMock = async (filePath: string): Promise<CommandMockHandle> => {
  await Deno.mkdir(getDirectory(filePath), { recursive: true });
  await Deno.writeTextFile(filePath, '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi');
  return installCommandMock(makeClaudeJsonMock(JSON.stringify([
    { filePath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
  ])));
};

// ─── I/O テスト ────────────────────────────────────────────────────────────────

/**
 * ファイル生成・ディレクトリ解決・エラー終了の I/O 検証。
 * --input-dir / --agent --year-month によるパス解決と出力ファイル生成を確認する。
 */
describe('main - I/O', () => {
  // ─── T-NC-EIO-15-01-01: --input-dir によるファイル生成 ───────────────────────────────────

  /** 正常系: --input-dir で指定したディレクトリの MD ファイルを処理してセグメント出力ファイルを生成する */
  describe('Given: マルチトピック MD ファイルが存在するディレクトリを --input-dir で指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);

      // 2 MD files with frontmatter
      await Deno.writeTextFile(
        `${inputDir}/chat-a.md`,
        '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi',
      );
      await Deno.writeTextFile(
        `${inputDir}/chat-b.md`,
        '---\nproject: test\n---\n### User\nFix CI\n\n### AI\nSure',
      );

      const pathA = normalizePath(`${inputDir}/chat-a.md`);
      const pathB = normalizePath(`${inputDir}/chat-b.md`);
      const segmentResponse = JSON.stringify([
        { filePath: pathA, segments: [{ title: 'Topic A', summary: 'Summary A', startLine: 1, endLine: 5 }] },
        { filePath: pathB, segments: [{ title: 'Topic B', summary: 'Summary B', startLine: 1, endLine: 5 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--input-dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-01-01 - 収集した全 MD ファイルを処理してセグメント出力ファイルを生成する', () => {
        it('T-NC-EIO-15-01-01-01: outputDir 配下に 2 件以上のセグメント出力ファイルが生成される', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir]);

          const files = await findFiles(outputDir);
          assertEquals(files.length >= 2, true);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-02-01: --input-dir によるパス解決（chatlogs 形式ディレクトリ） ───────────

  /** 正常系: --input-dir で chatlogs/<agent>/<year>/<year-month>/ を指定して処理する */
  describe('Given: --input-dir で chatlogs/claude/2026/2026-03 と対応パスが存在する', () => {
    let tmpRoot: string;
    let AGENT_DIR: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    before(async () => {
      tmpRoot = await Deno.makeTempDir();
      AGENT_DIR = `${tmpRoot}/chatlogs/claude/2026/2026-03`;
      await Deno.mkdir(AGENT_DIR, { recursive: true });
      await Deno.writeTextFile(
        `${AGENT_DIR}/sample.md`,
        '### User\nHello\n\n### AI\nHi',
      );
    });

    after(async () => {
      await Deno.remove(tmpRoot, { recursive: true });
    });

    beforeEach(async () => {
      outputDir = await Deno.makeTempDir();
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);

      const samplePath = normalizePath(`${AGENT_DIR}/sample.md`);
      const segmentResponse = JSON.stringify([
        { filePath: samplePath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      loggerStub.restore();
      await Deno.remove(outputDir, { recursive: true });
    });

    describe('When: main(["--input-dir", AGENT_DIR, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-02-01 - chatlogs/<agent>/<year>/<year-month>/ から入力を解決してファイルを処理する', () => {
        it('T-NC-EIO-15-02-01-01: chatlogs/claude/2026/2026-03/ 内のファイルが処理されて出力が生成される', async () => {
          await main(['--input-dir', AGENT_DIR, '--output-dir', outputDir]);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);
        });

        it('T-NC-EIO-15-02-01-02: 入力ディレクトリと出力先が logger.info でログ出力される', async () => {
          await main(['--input-dir', AGENT_DIR, '--output-dir', outputDir]);

          const normalizedLogs = loggerStub.infoLogs.map((line) => normalizePath(line)).join('\n');
          const normalizedAgentDir = normalizePath(AGENT_DIR);
          const normalizedOutputDir = normalizePath(outputDir);
          assertEquals(normalizedLogs.includes(normalizedAgentDir), true);
          assertEquals(normalizedLogs.includes(normalizedOutputDir), true);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-05: chatlogs形式入力パスに応じた出力パス構造 ──────────────────────

  /** 正常系: chatlogs形式の入力パス (chatlogs/<agent>/<yyyy>/<yyyy-mm>) に対して
   *  project フロントマターがあっても出力は <outputBase> 直下に生成される */
  describe('Given: chatlogs形式ディレクトリ (chatlogs/claude/2026/2026-04) と project フロントマターを持つ MD ファイル', () => {
    let tmpRoot: string;
    let CHATLOG_INPUT_DIR: string;
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    before(async () => {
      tmpRoot = await Deno.makeTempDir();
      CHATLOG_INPUT_DIR = `${tmpRoot}/chatlogs/claude/2026/2026-04`;
      await Deno.mkdir(CHATLOG_INPUT_DIR, { recursive: true });
      await Deno.writeTextFile(
        `${CHATLOG_INPUT_DIR}/chat.md`,
        '---\nproject: my-app\n---\n### User\nHello\n\n### AI\nHi',
      );
    });

    after(async () => {
      await Deno.remove(tmpRoot, { recursive: true });
    });

    beforeEach(async () => {
      outputBase = await Deno.makeTempDir();
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputBase);

      const chatPath = normalizePath(`${CHATLOG_INPUT_DIR}/chat.md`);
      const segmentResponse = JSON.stringify([
        { filePath: chatPath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await Deno.remove(outputBase, { recursive: true });
    });

    describe('When: main(["--input-dir", CHATLOG_INPUT_DIR, "--output", outputBase]) を呼び出す', () => {
      describe('Then: 出力が <outputBase> 直下に生成される', () => {
        it('T-NC-EIO-15-05-01-01: 全出力ファイルの親ディレクトリが <outputBase> である', async () => {
          const fixedHash: HashProvider = () => 'abc1234';
          await main(['--input-dir', CHATLOG_INPUT_DIR, '--output-dir', outputBase], fixedHash);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          assertEquals(_allDirectlyUnder(files, outputBase), true);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-06: 任意ディレクトリ入力時は <outputBase> 直下に出力 ───

  /** 正常系: 任意パスの入力ディレクトリに対して project フロントマターがあっても出力が <outputBase> 直下に生成される */
  describe('Given: 任意パスのディレクトリと project フロントマターを持つ MD ファイル', () => {
    let inputDir: string;
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir: outputBase } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputBase);

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '---\nproject: custom-project\n---\n### User\nHello\n\n### AI\nHi',
      );

      const chatPath = normalizePath(`${inputDir}/chat.md`);
      const segmentResponse = JSON.stringify([
        { filePath: chatPath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputBase);
    });

    describe('When: main(["--input-dir", inputDir, "--output", outputBase]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-06-01 - 出力が <outputBase> 直下に生成される', () => {
        it('T-NC-EIO-15-06-01-01: 全出力ファイルの親ディレクトリが <outputBase> である', async () => {
          const fixedHash: HashProvider = () => 'def5678';
          await main(['--input-dir', inputDir, '--output-dir', outputBase], fixedHash);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          assertEquals(_allDirectlyUnder(files, outputBase), true);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-07: project なし（サブディレクトリを作らない）────────────────────

  /** エッジケース: project フィールドなしの場合も、出力が <outputBase> 直下に生成される */
  describe('Given: project フロントマターなしの MD ファイル', () => {
    let inputDir: string;
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir: outputBase } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputBase);

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '### User\nHello\n\n### AI\nHi',
      );

      const chatPath = normalizePath(`${inputDir}/chat.md`);
      const segmentResponse = JSON.stringify([
        { filePath: chatPath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputBase);
    });

    describe('When: main(["--input-dir", inputDir, "--output", outputBase]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-07-01 - project なし時もサブディレクトリを作らず <outputBase> 直下に出力される', () => {
        it('T-NC-EIO-15-07-01-01: 全出力ファイルの親ディレクトリが <outputBase> で、パスに /misc/ を含まない', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputBase]);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          assertEquals(_allDirectlyUnder(files, outputBase), true);
          assertEquals(files.some((f) => normalizePath(f).includes('/misc/')), false);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-04-04: 単一トピックから 1 件生成 ──────────────────────────────────

  /** エッジケース: 単一トピックのチャットログから出力ファイルが正確に 1 件生成される */
  describe('Given: 単一トピックのチャットログファイルを含むディレクトリ', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);

      await Deno.writeTextFile(
        `${inputDir}/single-topic.md`,
        '### User\nHow do I fix CI?\n\n### AI\nUse deno test.',
      );

      // AI returns exactly 1 segment
      const singlePath = normalizePath(`${inputDir}/single-topic.md`);
      const segmentResponse = JSON.stringify([
        {
          filePath: singlePath,
          segments: [{ title: 'Fix CI', summary: 'Fix CI pipeline', startLine: 1, endLine: 5 }],
        },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--input-dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-04-04 - 単一トピックの MD ファイルから出力ファイルが正確に 1 件生成される', () => {
        it('T-NC-EIO-15-04-04-01: outputDir 配下に正確に 1 件の .md ファイルが生成される', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir]);

          const files = await findFiles(outputDir);
          assertEquals(files.length, 1);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-08: 存在しない入力ディレクトリ ───────────────────────────────────

  /**
   * 異常系: 入力ディレクトリが存在しないとき `main()` は処理を始めずに throw する。
   *
   * 終了コード 1 はシステムテスト（`T-NC-SYS-01-01`）がサブプロセス経由で見ているが、
   * サブプロセスの実行はカバレッジにも例外の種類にも現れない。どのエラーで止まるのかは
   * ここで `main()` を直接呼んで固定する。
   */
  describe('Given: 存在しないパスを --input-dir に指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--input-dir", 存在しないパス, "--output-dir", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-08-01 - InputNotFound で中断する', () => {
        it('T-NC-EIO-15-08-01-01: ChatlogError(kind=InputNotFound, subindex=NotFound) が投げられ該当パスが message に載る', async () => {
          // arrange — 作成済み一時ディレクトリ配下の未作成パス（他テストと衝突しない）
          const missingDir = `${inputDir}/does-not-exist`;

          // act
          const error = await assertRejects(
            () => main(['--input-dir', missingDir, '--output-dir', outputDir]),
            ChatlogError,
          );

          // assert — 種別まで固定する（別の失敗で偶然 reject しても通らないようにする）
          assertEquals(error.kind, 'InputNotFound');
          assertEquals(error.subindex, 'NotFound');
          assertMatch(error.message, /does-not-exist/);
        });
      });
    });
  });

  // ─── T-NC-EIO-15-09: --file による単一ファイル指定 ───────────────────────────────

  /**
   * --file 指定: 入力ディレクトリに複数ファイルがあっても、--file で指定した 1 件だけを処理する。
   *
   * AI モックは chat-a / chat-b 両方に 1 セグメントを返す。誤ったファイルが処理された場合も
   * 出力が生じるため、出力ファイル名で取り違えを観測できる。
   */
  describe('Given: chat-a.md / chat-b.md を含む入力ディレクトリのうち 1 件を --file で指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;
    const fixedHash: HashProvider = () => 'abc1234';

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeIsolatedGlobalConfig(outputDir);

      await Deno.writeTextFile(`${inputDir}/chat-a.md`, '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi');
      await Deno.writeTextFile(`${inputDir}/chat-b.md`, '---\nproject: test\n---\n### User\nFix CI\n\n### AI\nSure');

      const segmentResponse = JSON.stringify(
        ['chat-a', 'chat-b'].map((name) => ({
          filePath: normalizePath(`${inputDir}/${name}.md`),
          segments: [{ title: `Topic ${name}`, summary: `Summary ${name}`, startLine: 1, endLine: 5 }],
        })),
      );
      commandHandle = installCommandMock(makeClaudeJsonMock(segmentResponse));
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      loggerStub.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--file", chat-a, "--output-dir", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-09-01 - --file で指定した chat-a のセグメントだけが出力される', () => {
        it('[Normal] T-NC-EIO-15-09-01-01: inputDir に 2 件あっても出力は chat-a の 1 件だけで chat-b は出力されない', async () => {
          await main(['--file', `${inputDir}/chat-a.md`, '--output-dir', outputDir], fixedHash);

          const files = (await findFiles(outputDir)).map((file) => normalizePath(file));
          assertEquals(files.length, 1);
          assertMatch(files[0], /chat-a/);
          assertNotMatch(files[0], /chat-b/);
        });
      });
    });

    describe('When: main(["--file", 存在しないパス, "--output-dir", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-09-02 - InputNotFound で中断する', () => {
        it('[Error] T-NC-EIO-15-09-02-01: ChatlogError(kind=InputNotFound, subindex=NotFound) が投げられ file not found と該当パスが message に載る', async () => {
          // act
          const error = await assertRejects(
            () => main(['--file', `${inputDir}/does-not-exist.md`, '--output-dir', outputDir]),
            ChatlogError,
          );

          // assert — 種別まで固定する（別の失敗で偶然 reject しても通らないようにする）
          assertEquals(error.kind, 'InputNotFound');
          assertEquals(error.subindex, 'NotFound');
          assertMatch(error.message, /file not found: .*does-not-exist\.md/);
        });
      });
    });

    describe('When: main(["--file", chat-a, "--output-dir", outputDir]) を呼び出しログを観測する', () => {
      describe('Then: Task T-NC-EIO-15-09-04 - 正規化済みの入力ファイルパスが logger.info に出力される', () => {
        it('[Normal] T-NC-EIO-15-09-04-01: logger.info に「入力ファイル: <正規化済み絶対パス>」が 1 行だけ出力される', async () => {
          await main(['--file', `${inputDir}/chat-a.md`, '--output-dir', outputDir], fixedHash);

          const expected = `入力ファイル: ${normalizePath(resolve(`${inputDir}/chat-a.md`))}`;
          assertEquals(loggerStub.infoLogs.filter((line) => line === expected).length, 1);
        });
      });
    });
  });

  /**
   * --input-dir と --file の同時指定: --file が優先され、--input-dir 側のファイルは処理しない。
   *
   * inputDir (= --input-dir) には chat-a、別の一時ディレクトリ dirB には chat-b だけを置く。
   * AI モックは両方のパスに 1 セグメントを返すため、どちらが処理されたかを出力名で判別できる。
   */
  describe('Given: --input-dir に chat-a.md だけのディレクトリ、--file に別ディレクトリの chat-b.md を同時に指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let dirB: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;
    const fixedHash: HashProvider = () => 'abc1234';

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      dirB = await Deno.makeTempDir();
      GlobalConfig.resetInstance();
      _makeIsolatedGlobalConfig(outputDir);

      await Deno.writeTextFile(`${inputDir}/chat-a.md`, '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi');
      await Deno.writeTextFile(`${dirB}/chat-b.md`, '---\nproject: test\n---\n### User\nFix CI\n\n### AI\nSure');

      const segmentResponse = JSON.stringify(
        [`${inputDir}/chat-a.md`, `${dirB}/chat-b.md`].map((filePath) => ({
          filePath: normalizePath(filePath),
          segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }],
        })),
      );
      commandHandle = installCommandMock(makeClaudeJsonMock(segmentResponse));
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      GlobalConfig.resetInstance();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputDir);
      await Deno.remove(dirB, { recursive: true });
    });

    describe('When: main(["--input-dir", inputDir, "--file", dirB/chat-b, "--output-dir", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-09-03 - --file が優先され chat-b のセグメントだけが出力される', () => {
        it('[Edge] T-NC-EIO-15-09-03-01: 出力は chat-b の 1 件だけで --input-dir 側の chat-a は出力されない', async () => {
          await main(['--input-dir', inputDir, '--file', `${dirB}/chat-b.md`, '--output-dir', outputDir], fixedHash);

          const files = (await findFiles(outputDir)).map((file) => normalizePath(file));
          assertEquals(files.length, 1);
          assertMatch(files[0], /chat-b/);
          assertNotMatch(files[0], /chat-a/);
        });
      });
    });
  });

  /**
   * --file 指定時の入力ディレクトリ解決: ファイルが `<agent>/<yyyy>/<yyyy-mm>/` 直下にあるときは
   * `<agent>` の親ディレクトリを、それ以外はファイルの親ディレクトリを入力ディレクトリとする。
   *
   * 解決結果は `入力ディレクトリ: <inputDir>` の logger.info で観測する。
   */
  describe('Given: 一時ディレクトリ配下の任意の位置にあるチャットログファイルを --file で指定する', () => {
    let tmpRoot: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle | undefined;
    let loggerStub: LoggerStub;
    const fixedHash: HashProvider = () => 'abc1234';

    beforeEach(async () => {
      tmpRoot = await Deno.makeTempDir();
      outputDir = await Deno.makeTempDir();
      GlobalConfig.resetInstance();
      _makeIsolatedGlobalConfig(outputDir);
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle?.restore();
      commandHandle = undefined;
      GlobalConfig.resetInstance();
      loggerStub.restore();
      await removeTempDirs(tmpRoot, outputDir);
    });

    const _cases = [
      {
        id: 'T-NC-EIO-15-09-05-01',
        label: '[Normal]',
        fileRel: 'chatlogs/claude/2026/2026-04/x.md',
        expectedRel: 'chatlogs',
        desc: '<agent>/<yyyy>/<yyyy-mm> 直下のファイルは <agent> の親',
      },
      {
        id: 'T-NC-EIO-15-09-05-02',
        label: '[Normal]',
        fileRel: 'flat/x.md',
        expectedRel: 'flat',
        desc: 'chatlogs 形式でないディレクトリのファイルはその親',
      },
      {
        id: 'T-NC-EIO-15-09-05-03',
        label: '[Edge]',
        fileRel: 'chatlogs/claude/2026/2026-04/sub/x.md',
        expectedRel: 'chatlogs/claude/2026/2026-04/sub',
        desc: '<yyyy-mm> の下にさらにサブディレクトリがあるファイルはその親 (末尾一致のみ)',
      },
      {
        id: 'T-NC-EIO-15-09-05-04',
        label: '[Edge]',
        fileRel: 'claude/2026/2026-04/b/claude/2026/2026-04/x.md',
        expectedRel: 'claude/2026/2026-04/b',
        desc: '同じ <agent>/<yyyy>/<yyyy-mm> が 2 回現れるときは末尾側の出現を基準にする',
      },
      {
        id: 'T-NC-EIO-15-09-05-05',
        label: '[Edge]',
        fileRel: 'outer/2025/2025-01/claude/2026/2026-04/x.md',
        expectedRel: 'outer/2025/2025-01',
        desc: '途中に別の <seg>/<yyyy>/<yyyy-mm> があっても末尾の claude/<yyyy>/<yyyy-mm> の claude の親',
      },
    ] as const;

    describe('When: main(["--file", <tmpRoot>/<fileRel>, "--output-dir", outputDir]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-09-05 - ファイル位置に応じた入力ディレクトリが logger.info に出力される', () => {
        for (const { id, label, fileRel, expectedRel, desc } of _cases) {
          it(`${label} ${id}: ${fileRel} → 入力ディレクトリ: <tmpRoot>/${expectedRel} (${desc})`, async () => {
            // arrange
            const filePath = normalizePath(resolve(`${tmpRoot}/${fileRel}`));
            await Deno.mkdir(getDirectory(filePath), { recursive: true });
            await Deno.writeTextFile(filePath, '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi');
            commandHandle = installCommandMock(makeClaudeJsonMock(JSON.stringify([
              { filePath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
            ])));

            // act
            await main(['--file', filePath, '--output-dir', outputDir], fixedHash);

            // assert
            const expected = `入力ディレクトリ: ${normalizePath(resolve(`${tmpRoot}/${expectedRel}`))}`;
            assertEquals(loggerStub.infoLogs.filter((line) => line === expected).length, 1);
          });
        }
      });
    });

    /** 親ディレクトリが `<seg>/<yyyy>/<yyyy-mm>` に一致するが、agent / 年 / 月のいずれかが不正なケース。 */
    describe('When: 不正な <agent>/<yyyy>/<yyyy-mm> 配下のファイルで main(["--file", <tmpRoot>/<fileRel>, "--output-dir", outputDir]) を呼び出す', () => {
      const _invalidCases = [
        {
          id: 'T-NC-EIO-15-09-06-01',
          fileRel: 'chatlogs/reports/2026/2026-04/x.md',
          subindex: 'UnknownAgent',
          invalidValue: 'reports',
          desc: '未知の agent',
        },
        {
          id: 'T-NC-EIO-15-09-06-02',
          fileRel: 'chatlogs/claude/2025/2026-04/x.md',
          subindex: 'YearMismatch',
          invalidValue: '2025',
          desc: '<yyyy> と <yyyy-mm> の年が不一致',
        },
        {
          id: 'T-NC-EIO-15-09-06-03',
          fileRel: 'chatlogs/claude/2026/2026-13/x.md',
          subindex: 'InvalidMonth',
          invalidValue: '2026-13',
          desc: '月が 12 を超える',
        },
        {
          id: 'T-NC-EIO-15-09-06-04',
          fileRel: 'chatlogs/claude/2026/2026-00/x.md',
          subindex: 'InvalidMonth',
          invalidValue: '2026-00',
          desc: '月が 00',
        },
      ] as const;

      describe('Then: Task T-NC-EIO-15-09-06 - ChatlogError(InvalidPath) で中断する', () => {
        for (const { id, fileRel, subindex, invalidValue, desc } of _invalidCases) {
          it(`[Error] ${id}: ${fileRel} → ChatlogError(kind=InvalidPath, subindex=${subindex}) (${desc})`, async () => {
            // arrange — ファイルは実在させる（InputNotFound で落ちないようにする）
            const filePath = normalizePath(resolve(`${tmpRoot}/${fileRel}`));
            const fileDir = getDirectory(filePath);
            await Deno.mkdir(fileDir, { recursive: true });
            await Deno.writeTextFile(filePath, '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi');
            commandHandle = installCommandMock(makeClaudeJsonMock(JSON.stringify([
              { filePath, segments: [{ title: 'Topic', summary: 'Summary', startLine: 1, endLine: 5 }] },
            ])));

            // act
            const error = await assertRejects(
              () => main(['--file', filePath, '--output-dir', outputDir], fixedHash),
              ChatlogError,
            );

            // assert — 種別まで固定する（別の失敗で偶然 reject しても通らないようにする）
            assertEquals(error.kind, 'InvalidPath');
            assertEquals(error.subindex, subindex);
            assertStringIncludes(error.message, fileDir);
            assertStringIncludes(error.message, invalidValue);
          });
        }
      });
    });
  });

  /**
   * --file 指定時の既定の出力先: ファイルの親ディレクトリが `<agent>/<yyyy>/<yyyy-mm>` で終わるときは、
   * そのパスの agent / period で出力先を組み立てる（config.yaml・CLI の --agent / --period より優先）。
   * パターンに一致しないときは従来どおり CLI / config の agent / period を使い、--output-dir は常に最優先する。
   *
   * 解決結果は `出力ディレクトリ: <outputBase>` の logger.info と、実際に書き出されたファイルの位置で観測する。
   */
  describe('Given: chatlogsDir を一時ディレクトリ配下の絶対パスに隔離し、--file でチャットログファイルを指定する', () => {
    let tmpRoot: string;
    let commandHandle: CommandMockHandle | undefined;
    let loggerStub: LoggerStub;
    const fixedHash: HashProvider = () => 'abc1234';

    beforeEach(async () => {
      tmpRoot = normalizePath(await Deno.makeTempDir());
      GlobalConfig.resetInstance();
      _makeChatlogsGlobalConfig(tmpRoot, `${tmpRoot}/chatlogs`);
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle?.restore();
      commandHandle = undefined;
      GlobalConfig.resetInstance();
      loggerStub.restore();
      await Deno.remove(tmpRoot, { recursive: true });
    });

    const _cases = [
      {
        logId: 'T-NC-EIO-15-10-01-01',
        fileId: 'T-NC-EIO-15-10-02-01',
        label: '[Normal]',
        fileRel: 'chatlogs/originalLogs/codex/2025/2025-03/x.md',
        args: [],
        outputDirRel: undefined,
        expectedRel: 'chatlogs/normalizeLogs/codex/2025/2025-03',
        desc: 'パスの agent / period で既定の出力先を組み立てる',
      },
      {
        logId: 'T-NC-EIO-15-10-01-02',
        fileId: 'T-NC-EIO-15-10-02-02',
        label: '[Edge]',
        fileRel: 'chatlogs/originalLogs/codex/2025/2025-03/x.md',
        args: ['--agent', 'claude', '--period', '2026-01'],
        outputDirRel: undefined,
        expectedRel: 'chatlogs/normalizeLogs/codex/2025/2025-03',
        desc: 'CLI の --agent / --period よりパスの agent / period を優先する',
      },
      {
        logId: 'T-NC-EIO-15-10-01-03',
        fileId: 'T-NC-EIO-15-10-02-03',
        label: '[Normal]',
        fileRel: 'flat/x.md',
        args: ['--agent', 'chatgpt', '--period', '2026-01'],
        outputDirRel: undefined,
        expectedRel: 'chatlogs/normalizeLogs/chatgpt/2026/2026-01',
        desc: 'パターンに一致しないときは CLI / config の agent / period を使う',
      },
      {
        logId: 'T-NC-EIO-15-10-01-04',
        fileId: 'T-NC-EIO-15-10-02-04',
        label: '[Edge]',
        fileRel: 'chatlogs/originalLogs/codex/2025/2025-03/x.md',
        args: [],
        outputDirRel: 'out',
        expectedRel: 'out',
        desc: '--output-dir はパスから推定した agent / period より優先する',
      },
    ] as const;

    /**
     * `_cases` の 1 件を実行する。`--file` に `<tmpRoot>/<fileRel>` を渡し、`outputDirRel` があれば
     * `--output-dir <tmpRoot>/<outputDirRel>` を付ける。
     *
     * @param tc - 実行するケース
     * @returns 入力ファイルの正規化済み絶対パス
     */
    const _run = async (tc: typeof _cases[number]): Promise<string> => {
      const filePath = `${tmpRoot}/${tc.fileRel}`;
      commandHandle = await _writeChatlogWithMock(filePath);
      const outputArgs = tc.outputDirRel === undefined ? [] : ['--output-dir', `${tmpRoot}/${tc.outputDirRel}`];
      await main(['--file', filePath, ...tc.args, ...outputArgs], fixedHash);
      return filePath;
    };

    describe('When: main(["--file", <tmpRoot>/<fileRel>, ...args]) を呼び出しログを観測する', () => {
      describe('Then: Task T-NC-EIO-15-10-01 - 推定した agent / period の出力先が logger.info に出力される', () => {
        for (const tc of _cases) {
          it(`${tc.label} ${tc.logId}: ${tc.fileRel} ${tc.args.join(' ')} → 出力ディレクトリ: <tmpRoot>/${tc.expectedRel} (${tc.desc})`, async () => {
            await _run(tc);

            const expected = `出力ディレクトリ: ${tmpRoot}/${tc.expectedRel}`;
            assertEquals(loggerStub.infoLogs.filter((line) => line.startsWith('出力ディレクトリ:')), [expected]);
          });
        }
      });
    });

    describe('When: main(["--file", <tmpRoot>/<fileRel>, ...args]) を呼び出し書き出し先を観測する', () => {
      describe('Then: Task T-NC-EIO-15-10-02 - セグメント出力ファイルが推定した出力先の配下に 1 件だけ書き出される', () => {
        for (const tc of _cases) {
          it(`${tc.label} ${tc.fileId}: ${tc.fileRel} ${tc.args.join(' ')} → <tmpRoot>/${tc.expectedRel}/ 配下に出力 (${tc.desc})`, async () => {
            const filePath = await _run(tc);

            const written = (await findFiles(tmpRoot))
              .map((file) => normalizePath(file))
              .filter((file) => file !== filePath);
            assertEquals(written.length, 1);
            assertEquals(written[0].startsWith(`${tmpRoot}/${tc.expectedRel}/`), true, written[0]);
          });
        }
      });
    });
  });

  /**
   * --file 指定時の containment 判定: 出力先は検証前に正規化済みの絶対パスへ解決する。
   *
   * `chatlogsDir` を相対パスで与えても、入力ディレクトリ（`--file` から導出した絶対パス）と同じ基準で
   * 比較されなければならない。相対パスは `..` を含められない（`normalizePath` が拒否する）ため、
   * 一時ディレクトリはカレントディレクトリ配下の git 管理外 `.local/tmp` に作る。
   */
  describe('Given: chatlogsDir をカレントディレクトリからの相対パスで指定し、--file でチャットログファイルを指定する', () => {
    let tmpRoot: string;
    let commandHandle: CommandMockHandle | undefined;
    let loggerStub: LoggerStub;
    const fixedHash: HashProvider = () => 'abc1234';

    beforeEach(async () => {
      const _localTmp = `${normalizePath(Deno.cwd())}/.local/tmp`;
      await Deno.mkdir(_localTmp, { recursive: true });
      tmpRoot = normalizePath(await Deno.makeTempDir({ dir: _localTmp, prefix: 'nc-eio-' }));
      GlobalConfig.resetInstance();
      _makeChatlogsGlobalConfig(tmpRoot, getRelativePath(Deno.cwd(), `${tmpRoot}/chatlogs`));
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle?.restore();
      commandHandle = undefined;
      GlobalConfig.resetInstance();
      loggerStub.restore();
      await Deno.remove(tmpRoot, { recursive: true });
    });

    describe('When: main(["--file", <chatlogs>/claude/2026/2026-04/x.md]) を呼び出す', () => {
      describe('Then: Task T-NC-EIO-15-11-01 - 出力先が入力ディレクトリ配下に解決され ForbiddenOutput で中断する', () => {
        it('[Error] T-NC-EIO-15-11-01-01: 入力ディレクトリ <chatlogs> の配下に出力先が来るため ChatlogError(ForbiddenOutput/OutputInsideInput) が投げられる', async () => {
          // arrange — originalLogs を挟まないため入力ディレクトリは <chatlogs>、出力先は <chatlogs>/normalizeLogs/...
          const filePath = `${tmpRoot}/chatlogs/claude/2026/2026-04/x.md`;
          commandHandle = await _writeChatlogWithMock(filePath);

          // act
          const error = await assertRejects(() => main(['--file', filePath], fixedHash), ChatlogError);

          // assert
          assertEquals([error.kind, error.subindex], ['ForbiddenOutput', 'OutputInsideInput']);
        });
      });
    });

    describe('When: main(["--file", <tmpRoot>/flat/x.md, "--agent", "claude", "--period", "2026-04"]) を呼び出しログを観測する', () => {
      describe('Then: Task T-NC-EIO-15-11-02 - 出力ディレクトリが正規化済みの絶対パスで logger.info に出力される', () => {
        it('[Normal] T-NC-EIO-15-11-02-01: 相対の chatlogsDir でも「出力ディレクトリ: <tmpRoot>/chatlogs/normalizeLogs/claude/2026/2026-04」(絶対パス) が出力される', async () => {
          // arrange
          const filePath = `${tmpRoot}/flat/x.md`;
          commandHandle = await _writeChatlogWithMock(filePath);

          // act
          await main(['--file', filePath, '--agent', 'claude', '--period', '2026-04'], fixedHash);

          // assert
          const expected = `出力ディレクトリ: ${tmpRoot}/chatlogs/normalizeLogs/claude/2026/2026-04`;
          assertEquals(loggerStub.infoLogs.filter((line) => line.startsWith('出力ディレクトリ:')), [expected]);
        });
      });
    });
  });
});
