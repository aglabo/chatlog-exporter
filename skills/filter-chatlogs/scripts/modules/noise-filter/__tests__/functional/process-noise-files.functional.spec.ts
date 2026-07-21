// src: scripts/modules/noise-filter/__tests__/functional/process-noise-files.functional.spec.ts
// @(#): noise-filter-chatlogs.ts の機能テスト
//       対象: processNoiseFiles — filelist ループ処理（分類→削除/dry-run）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processNoiseFiles } from '../../process-noise-files.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { ChatlogEntry } from '../../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { fileExists } from '../../../../../../_scripts/libs/file-ops/exists-utils.ts';
import { makeRepeatedContent } from '../../../../__tests__/_helpers/fixtures.ts';
// types
import type { LoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { NOISE_FILTER_MIN_CONTENT_LENGTH } from '../../../../__tests__/_helpers/constants.ts';

// ─── Internal Helpers

// constants
/** ノイズ判定されるファイル名。 */
const _NOISE_FILENAME = 'say-ok-and-nothing-else.md';

/** keep 判定されるファイル名。 */
const _KEEP_FILENAME = 'valid-chat.md';

// functions
/** KEEP 判定を通過する最小コンテンツを生成する。 */
const _makeValidContent = () => makeRepeatedContent(NOISE_FILTER_MIN_CONTENT_LENGTH);

/**
 * 指定パスに実ファイルを書き込み、対応する `ChatlogEntry` を返す。
 *
 * `processNoiseFiles` の削除処理（`_phase3DiscardOrSkip` の `removeFile`）は実ファイルを
 * 操作するため、`ChatlogEntry` 構築と同時に実ファイルを書き込む。
 */
const _writeEntry = async (filePath: string, content: string): Promise<ChatlogEntry> => {
  await Deno.writeTextFile(filePath, content);
  return new ChatlogEntry(content, { filePath });
};

// ─── Tests

/**
 * `processNoiseFiles` 関数の機能テストスイート。
 *
 * `processNoiseFiles(entries, counts, { dryRun, concurrency })` は `ChatlogEntry` 配列を受け取り、
 * 各エントリを分類してノイズを削除（または dry-run 出力）し、counts を更新する。
 *
 * テスト ID 範囲: T-PF-PNF-01 〜 T-PF-PNF-05
 *
 * @see processNoiseFiles
 */
describe('processNoiseFiles', () => {
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

  // ─── T-PF-PNF-01: ノイズファイル + 通常モード → 削除、counts.remove 加算 ──────

  /**
   * ノイズファイルが通常モードで処理される前提グループ。
   *
   * ファイルが削除され、`counts.remove` が加算されることを検証する。
   */
  describe('Given: ノイズファイル 1 件', () => {
    /** `processNoiseFiles(files, counts, { dryRun: false })` を呼び出すとき。 */
    describe('When: processNoiseFiles を通常モードで呼び出す', () => {
      /** ファイルが削除され、counts.remove=1 になること。 */
      describe('Then: T-PF-PNF-01 - ファイルが削除され、counts.remove が 1 になる', () => {
        it('T-PF-PNF-01-01: ノイズファイルが削除される', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: false, concurrency: Infinity });

          assertEquals(await fileExists(filePath), false);
        });

        it('T-PF-PNF-01-02: counts.remove が 1 になる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: false, concurrency: Infinity });

          assertEquals(counts.remove, 1);
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
    /** `processNoiseFiles(files, counts, { dryRun: false })` を呼び出すとき。 */
    describe('When: processNoiseFiles を通常モードで呼び出す', () => {
      /** ファイルが削除されず、counts.keep=1 になること。 */
      describe('Then: T-PF-PNF-02 - ファイルが残り、counts.keep が 1 になる', () => {
        it('T-PF-PNF-02-01: 正常ファイルが削除されずに残る', async () => {
          const filePath = `${tempDir}/${_KEEP_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: false, concurrency: Infinity });

          assertEquals(await fileExists(filePath), true);
        });

        it('T-PF-PNF-02-02: counts.keep が 1 になる', async () => {
          const filePath = `${tempDir}/${_KEEP_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: false, concurrency: Infinity });

          assertEquals(counts.keep, 1);
        });
      });
    });
  });

  // ─── T-PF-PNF-03: ノイズファイル + dry-run → 削除なし、パスをログ出力 ─────────

  /**
   * ノイズファイルが dry-run モードで処理される前提グループ。
   *
   * ファイルが削除されず、パスが dryrun ログに出力されることを検証する。
   */
  describe('Given: ノイズファイル 1 件と dryRun=true', () => {
    /** `processNoiseFiles(files, counts, { dryRun: true })` を呼び出すとき。 */
    describe('When: processNoiseFiles を dry-run モードで呼び出す', () => {
      /** ファイルが削除されず、dryrun ログにファイルパスが含まれること。 */
      describe('Then: T-PF-PNF-03 - ファイルが削除されずパスが dryrun ログに出力される', () => {
        it('T-PF-PNF-03-01: ファイルが削除されずに残る', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: true, concurrency: Infinity });

          assertEquals(await fileExists(filePath), true);
        });

        it('T-PF-PNF-03-02: dryrunLogs にファイルパスが含まれる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: true, concurrency: Infinity });

          assertEquals(loggerStub.dryrunLogs.some((line) => line.includes(_NOISE_FILENAME)), true);
        });

        it('T-PF-PNF-03-03: counts.skip が 1 になる', async () => {
          const filePath = `${tempDir}/${_NOISE_FILENAME}`;
          const entry = await _writeEntry(filePath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([entry], counts, { dryRun: true, concurrency: Infinity });

          assertEquals(counts.skip, 1);
        });
      });
    });
  });

  // ─── T-PF-PNF-05: ノイズ 1 件 + 正常 1 件 → counts が両方加算 ─────────────────

  /**
   * ノイズと正常ファイルが混在する前提グループ。
   *
   * `counts.remove` と `counts.keep` がそれぞれ正しく加算されることを検証する。
   */
  describe('Given: ノイズ 1 件 + 正常 1 件', () => {
    /** `processNoiseFiles(files, counts, { dryRun: false })` を呼び出すとき。 */
    describe('When: processNoiseFiles を通常モードで呼び出す', () => {
      /** counts.remove=1、counts.keep=1 になること。 */
      describe('Then: T-PF-PNF-05 - remove=1, keep=1 になる', () => {
        it('T-PF-PNF-05-01: counts.remove=1, counts.keep=1 になる', async () => {
          const noisePath = `${tempDir}/${_NOISE_FILENAME}`;
          const keepPath = `${tempDir}/${_KEEP_FILENAME}`;
          const noiseEntry = await _writeEntry(noisePath, _makeValidContent());
          const keepEntry = await _writeEntry(keepPath, _makeValidContent());
          const counts = { keep: 0, skip: 0, remove: 0, error: 0 };

          await processNoiseFiles([noiseEntry, keepEntry], counts, { dryRun: false, concurrency: Infinity });

          assertEquals(counts.remove, 1);
          assertEquals(counts.keep, 1);
        });
      });
    });
  });
});
