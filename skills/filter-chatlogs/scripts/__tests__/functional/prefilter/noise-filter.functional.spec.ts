// Copyright (c) 2026 atsushifx <http://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// src: scripts/__tests__/functional/prefilter/noise-filter.functional.spec.ts
// @(#): prefilter-chatlogs.ts の機能テスト
//       対象: processNoiseFilterFiles — filelist ループ処理（分類→削除/dry-run/report）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processNoiseFilterFiles } from '../../../libs/noise-filter.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { fileExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';
import { makeRepeatedContent } from '../../_helpers/fixtures.ts';
// types
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { PREFILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';

// ─── Internal Helpers

// constants
/** ノイズ判定されるファイル名。 */
const _NOISE_FILENAME = 'say-ok-and-nothing-else.md';

/** keep 判定されるファイル名。 */
const _KEEP_FILENAME = 'valid-chat.md';

// functions
/** KEEP 判定を通過する最小コンテンツを生成する。 */
const _makeValidContent = () => makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH);

// ─── Tests

/**
 * `processNoiseFilterFiles` 関数の機能テストスイート。
 *
 * `processNoiseFilterFiles(files, counts, { dryRun, report })` はファイルリストを受け取り、
 * 各ファイルを分類してノイズを削除（または dry-run/report 出力）し、counts を更新する。
 *
 * テスト ID 範囲: T-PF-PNF-01 〜 T-PF-PNF-05
 *
 * @see processNoiseFilterFiles
 */
describe('processNoiseFilterFiles', () => {
  /** テスト用一時ディレクトリ。 */
  let tempDir: string;

  /** logger stub。 */
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-PF-PNF-01: ノイズファイル + 通常モード → 削除、counts.noise 加算 ───────

  /**
   * ノイズファイルが通常モードで処理される前提グループ。
   *
   * ファイルが削除され、`counts.noise` が加算されることを検証する。
   */
  describe('Given: ノイズファイル 1 件', () => {
    /** `processNoiseFilterFiles(files, counts, { dryRun: false, report: false })` を呼び出すとき。 */
    describe('When: processNoiseFilterFiles を通常モードで呼び出す', () => {
      /** ファイルが削除され、counts.noise=1 になること。 */
      describe('Then: T-PF-PNF-01 - ファイルが削除され、counts.noise が 1 になる', () => {
        it('T-PF-PNF-01-01: ノイズファイルが削除される', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: false, report: false });

          assertEquals(await fileExists(filePath), false);
        });

        it('T-PF-PNF-01-02: counts.noise が 1 になる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: false, report: false });

          assertEquals(counts.noise, 1);
        });
      });
    });
  });

  // ─── T-PF-PNF-02: 正常ファイル → 削除なし、counts.keep 加算 ─────────────────

  /**
   * 正常ファイルが通常モードで処理される前提グループ。
   *
   * ファイルが残り、`counts.keep` が加算されることを検証する。
   */
  describe('Given: 正常ファイル 1 件', () => {
    /** `processNoiseFilterFiles(files, counts, { dryRun: false, report: false })` を呼び出すとき。 */
    describe('When: processNoiseFilterFiles を通常モードで呼び出す', () => {
      /** ファイルが削除されず、counts.keep=1 になること。 */
      describe('Then: T-PF-PNF-02 - ファイルが残り、counts.keep が 1 になる', () => {
        it('T-PF-PNF-02-01: 正常ファイルが削除されずに残る', async () => {
          const filePath = `${tempDir}/${_KEEP_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: false, report: false });

          assertEquals(await fileExists(filePath), true);
        });

        it('T-PF-PNF-02-02: counts.keep が 1 になる', async () => {
          const filePath = `${tempDir}/${_KEEP_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: false, report: false });

          assertEquals(counts.keep, 1);
        });
      });
    });
  });

  // ─── T-PF-PNF-03: ノイズファイル + dry-run → 削除なし、パスをログ出力 ─────────

  /**
   * ノイズファイルが dry-run モードで処理される前提グループ。
   *
   * ファイルが削除されず、パスがログに出力されることを検証する。
   */
  describe('Given: ノイズファイル 1 件と dryRun=true', () => {
    /** `processNoiseFilterFiles(files, counts, { dryRun: true, report: false })` を呼び出すとき。 */
    describe('When: processNoiseFilterFiles を dry-run モードで呼び出す', () => {
      /** ファイルが削除されず、ログにファイルパスが含まれること。 */
      describe('Then: T-PF-PNF-03 - ファイルが削除されずパスがログに出力される', () => {
        it('T-PF-PNF-03-01: ファイルが削除されずに残る', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: true, report: false });

          assertEquals(await fileExists(filePath), true);
        });

        it('T-PF-PNF-03-02: logLogs にファイルパスが含まれる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: true, report: false });

          assertEquals(loggerStub.logLogs.some((line) => line.includes(_NOISE_FILENAME)), true);
        });
      });
    });
  });

  // ─── T-PF-PNF-04: ノイズファイル + report → NOISE\t{reason}\t{path} 形式ログ ──

  /**
   * ノイズファイルが report モードで処理される前提グループ。
   *
   * `NOISE\t{reason}\t{path}` 形式のログが出力され、ファイルが削除されないことを検証する。
   */
  describe('Given: ノイズファイル 1 件と report=true', () => {
    /** `processNoiseFilterFiles(files, counts, { dryRun: true, report: true })` を呼び出すとき。 */
    describe('When: processNoiseFilterFiles を report モードで呼び出す', () => {
      /** NOISE タブ区切り形式のログが出力され、ファイルが残ること。 */
      describe('Then: T-PF-PNF-04 - NOISE タブ区切り形式でログ出力、削除なし', () => {
        it('T-PF-PNF-04-01: logLogs に "NOISE\\t..." 形式の行が含まれる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: true, report: true });

          const noiseLine = loggerStub.logLogs.find((line) => line.startsWith('NOISE\t'));
          assertEquals(noiseLine !== undefined, true);
          assertEquals(noiseLine!.split('\t').length >= 3, true);
        });

        it('T-PF-PNF-04-02: ファイルが削除されずに残る', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          await Deno.writeTextFile(filePath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([filePath], counts, { dryRun: true, report: true });

          assertEquals(await fileExists(filePath), true);
        });
      });
    });
  });

  // ─── T-PF-PNF-05: ノイズ 1 件 + 正常 1 件 → counts が両方加算 ─────────────────

  /**
   * ノイズと正常ファイルが混在する前提グループ。
   *
   * `counts.noise` と `counts.keep` がそれぞれ正しく加算されることを検証する。
   */
  describe('Given: ノイズ 1 件 + 正常 1 件', () => {
    /** `processNoiseFilterFiles(files, counts, { dryRun: false, report: false })` を呼び出すとき。 */
    describe('When: processNoiseFilterFiles を通常モードで呼び出す', () => {
      /** counts.noise=1、counts.keep=1 になること。 */
      describe('Then: T-PF-PNF-05 - noise=1, keep=1 になる', () => {
        it('T-PF-PNF-05-01: counts.noise=1, counts.keep=1 になる', async () => {
          const noisePath = `${tempDir}/${_NOISE_FILENAME}`;
          const keepPath = `${tempDir}/${_KEEP_FILENAME}`;
          await Deno.writeTextFile(noisePath, _makeValidContent());
          await Deno.writeTextFile(keepPath, _makeValidContent());
          const counts = { noise: 0, keep: 0, error: 0 };

          await processNoiseFilterFiles([noisePath, keepPath], counts, { dryRun: false, report: false });

          assertEquals(counts.noise, 1);
          assertEquals(counts.keep, 1);
        });
      });
    });
  });
});
