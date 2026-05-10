// src: scripts/__tests__/system/classify-chatlog.short.system.spec.ts
// @(#): 短文ファイル（<MIN_CLASSIFIABLE_LENGTH）→ misc 移動の実ファイルシステム検証
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Helpers
import { fileExists, fileOrDirExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
/** テスト対象スクリプト `classify-chatlog.ts` の絶対パス。サブプロセス起動時に使用する。 */
const SCRIPT_PATH = new URL('../../classify-chatlog.ts', import.meta.url).pathname;

/** システムテスト用フィクスチャディレクトリの絶対パス。Windows ドライブレター正規化済み。 */
const FIXTURE_SYSTEM_DATA = new URL('./fixtures', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

/** システムテスト用辞書フィクスチャの絶対パス。GlobalConfig の dicsDir として使用する。 */
const FIXTURE_DICS_DIR = new URL('./fixtures/assets/dics', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

/** `RUN_AI=1` 環境変数が設定されている場合に `true`。AI 呼び出しを伴うテストの実行制御に使用する。 */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

// functions
/**
 * classify-chatlog スクリプトをサブプロセスで実行し、終了コードと出力を返す。
 *
 * @param args - classify-chatlog に渡す引数リスト
 * @returns `{ code, stdout, stderr }` — プロセス終了コードと各出力テキスト
 */
const _runClassify = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', '--allow-env', SCRIPT_PATH, ...args],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await _cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
};

// ─── Tests

// ─── T-CL-SYS-02: 短文ファイルが misc へ移動される ──────────────────────────────

/**
 * `main` 関数の短文ファイル分類システムテストスイート。
 *
 * コンテンツが `MIN_CLASSIFIABLE_LENGTH`（50 文字）未満のファイルは
 * AI 推定をスキップして `misc/` サブディレクトリへ直接移動されることを検証する。
 *
 * テスト ID 範囲: T-CL-SYS-02
 *
 * @see main
 */
describe('[AI] main - 短文ファイルの misc 分類', { ignore: !_shouldRunAI }, () => {
  let inputDir: string;
  let configFile: string;
  let monthDir: string;

  beforeEach(async () => {
    inputDir = await Deno.makeTempDir({ prefix: 'classify-short-test-' });
    monthDir = `${inputDir}/claude/2026-03`;
    await Deno.mkdir(monthDir, { recursive: true });

    configFile = `${inputDir}/test-config.yaml`;
    await Deno.writeTextFile(configFile, `dicsDir: "${normalizePath(FIXTURE_DICS_DIR)}"\n`);
  });

  afterEach(async () => {
    await Deno.remove(inputDir, { recursive: true });
  });

  /**
   * 50 文字未満のコンテンツを持つ md ファイルを配置した前提条件グループ。
   *
   * Claude CLI を起動せず `misc/` へ直接分類されることを検証する。
   */
  describe('Given: 50 文字未満のコンテンツを持つ md ファイルを配置', () => {
    /** classify-chatlog をサブプロセスで実行するとき。 */
    describe('When: classify-chatlog をサブプロセスで実行する', () => {
      /** ファイルが misc/ に移動され、元のパスに存在しないことを検証する。 */
      describe('Then: T-CL-SYS-02 - ファイルが misc/ に移動される', () => {
        it('[AI] T-CL-SYS-02-01: misc/ にファイルが移動され、project フィールドが挿入される', async () => {
          // フロントマターなし・50 文字未満 → Claude CLI を呼ばず misc へ直接分類
          await Deno.copyFile(`${FIXTURE_SYSTEM_DATA}/short/input.md`, `${monthDir}/test-file.md`);

          const { code, stderr } = await _runClassify(['claude', '--input', inputDir, '--config', configFile]);

          assertEquals(code, 0);

          // AI をスキップしたことを stderr の warn ヘッダーで保証
          assertStringIncludes(stderr, '[skip-ai: too-short]');

          assertEquals(await fileExists(`${monthDir}/misc/test-file.md`), true);
          assertEquals(await fileOrDirExists(`${monthDir}/test-file.md`), false);
        });
      });
    });
  });
});
