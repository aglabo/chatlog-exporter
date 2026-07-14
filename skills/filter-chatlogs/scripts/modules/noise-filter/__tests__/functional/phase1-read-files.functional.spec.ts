// src: scripts/modules/noise-filter/__tests__/functional/phase1-read-files.functional.spec.ts
// @(#): process-noise-files.ts の機能テスト
//       対象: _phase1ReadFiles — ファイル並列読み込み・成功/失敗振り分け
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { _phase1ReadFiles } from '../../process-noise-files.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { getUserTurns } from '../../../../../../_scripts/libs/chatlogs/conversation-utils.ts';
import { makeRepeatedContent } from '../../../../__tests__/_helpers/fixtures.ts';
// types
import type { LoggerStub } from '../../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { NOISE_FILTER_MIN_CONTENT_LENGTH } from '../../../../__tests__/_helpers/constants.ts';
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';

// ─── Tests

/**
 * `_phase1ReadFiles` 関数の機能テストスイート。
 *
 * ファイルパス配列を並列に読み込み、成功エントリ（`filePath`/`filename`/`conversation`）と
 * 失敗エントリ（`NoiseDiscardFile`、`decision: FILTER_DECISIONS.ERROR`）に振り分ける。
 *
 * テスト ID 範囲: T-PF-P1-01 〜 T-PF-P1-07
 *
 * @see _phase1ReadFiles
 */
describe('_phase1ReadFiles', () => {
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

  // ─── T-PF-P1-01: 実在する単一ファイル → readOk に格納 ────────────────────────

  describe('Given: 実在する単一ファイル', () => {
    describe('When: _phase1ReadFiles([filePath]) を呼び出す', () => {
      describe('Then: T-PF-P1-01 - readOk に filePath/filename/conversation が含まれる', () => {
        it('T-PF-P1-01-01: readOk[0] が filePath/filename/conversation を持ち readError は空になる', async () => {
          const filePath = `${tempDir}/valid.md`;
          const content = makeRepeatedContent(NOISE_FILTER_MIN_CONTENT_LENGTH);
          await Deno.writeTextFile(filePath, content);

          const { readOk, readError } = await _phase1ReadFiles([filePath]);

          assertEquals(readOk.length, 1);
          assertEquals(readOk[0].filePath, filePath);
          assertEquals(readOk[0].filename, 'valid.md');
          assertEquals(getUserTurns(readOk[0].conversation)[0].content, 'u'.repeat(NOISE_FILTER_MIN_CONTENT_LENGTH));
          assertEquals(readError, []);
        });
      });
    });
  });

  // ─── T-PF-P1-02: 存在しないファイル → readError に振り分け ───────────────────

  describe('Given: 存在しないファイル', () => {
    describe('When: _phase1ReadFiles([filePath]) を呼び出す', () => {
      describe('Then: T-PF-P1-02 - readError に NoiseDiscardFile が含まれる', () => {
        it('T-PF-P1-02-01: readOk は空、readError[0] が filePath/filename/decision=ERROR を持つ', async () => {
          const filePath = `${tempDir}/non-existent.md`;

          const { readOk, readError } = await _phase1ReadFiles([filePath]);

          assertEquals(readOk, []);
          assertEquals(readError.length, 1);
          assertEquals(readError[0].filePath, filePath);
          assertEquals(readError[0].filename, 'non-existent.md');
          assertEquals(readError[0].decision, FILTER_DECISIONS.ERROR);
          assertNotEquals(readError[0].reason, '');
        });
      });

      // ─── T-PF-P1-06: 読み込み失敗があってもログ副作用を持たない ────────────────

      describe('Then: T-PF-P1-06 - ログ出力を一切行わない', () => {
        it('T-PF-P1-06-01: readError に振り分けられても loggerStub.errorLogs は空のまま', async () => {
          const filePath = `${tempDir}/no-log.md`;

          await _phase1ReadFiles([filePath]);

          assertEquals(loggerStub.errorLogs, []);
        });
      });
    });
  });

  // ─── T-PF-P1-03: 正常ファイル1件と読み込み失敗ファイル1件が混在 ──────────────

  describe('Given: 正常ファイル1件と読み込み失敗ファイル1件が混在するファイルリスト', () => {
    describe('When: _phase1ReadFiles([validPath, missingPath]) を呼び出す', () => {
      describe('Then: T-PF-P1-03 - 正常分と失敗分が振り分けられる', () => {
        it('T-PF-P1-03-01: readOk に正常分のみ、readError に失敗分のみが含まれる', async () => {
          const validPath = `${tempDir}/mixed-valid.md`;
          const missingPath = `${tempDir}/mixed-missing.md`;
          await Deno.writeTextFile(validPath, makeRepeatedContent(NOISE_FILTER_MIN_CONTENT_LENGTH));

          const { readOk, readError } = await _phase1ReadFiles([validPath, missingPath]);

          assertEquals(readOk.length, 1);
          assertEquals(readOk[0].filePath, validPath);
          assertEquals(readError.length, 1);
          assertEquals(readError[0].filePath, missingPath);
          assertEquals(readError[0].decision, FILTER_DECISIONS.ERROR);
        });
      });
    });
  });

  // ─── T-PF-P1-04: 空配列 ───────────────────────────────────────────────────────

  describe('Given: files が空配列', () => {
    describe('When: _phase1ReadFiles([]) を呼び出す', () => {
      describe('Then: T-PF-P1-04 - readOk・readError ともに空配列を返す', () => {
        it('T-PF-P1-04-01: readOk: [], readError: [] を返す', async () => {
          const { readOk, readError } = await _phase1ReadFiles([]);

          assertEquals(readOk, []);
          assertEquals(readError, []);
        });
      });
    });
  });

  // ─── T-PF-P1-05: ファイル I/O 起因ではない例外 → catch せず伝播 ──────────────

  describe('Given: readTextFile がファイル I/O 起因ではない例外を throw する', () => {
    describe('When: _phase1ReadFiles([filePath]) を呼び出す', () => {
      describe('Then: T-PF-P1-05 - 例外を catch せずそのまま伝播する', () => {
        it('T-PF-P1-05-01: 素の Error が throw される場合、_phase1ReadFiles も reject する', async () => {
          using _readStub = stub(Deno, 'readTextFile', () => Promise.reject(new Error('unexpected bug')));
          const filePath = `${tempDir}/any.md`;

          await assertRejects(() => _phase1ReadFiles([filePath]), Error, 'unexpected bug');
        });
      });
    });
  });

  // ─── T-PF-P1-07: readConversation が ChatlogError を throw する不正フォーマット → readError に振り分け ──

  describe('Given: readConversation が ChatlogError を throw する不正フォーマットファイル', () => {
    describe('When: _phase1ReadFiles([filePath]) を呼び出す', () => {
      describe('Then: T-PF-P1-07 - readError に NoiseDiscardFile が含まれる', () => {
        it('T-PF-P1-07-01: readOk は空、readError[0] が filePath/decision=ERROR/非空 reason を持つ', async () => {
          const filePath = `${tempDir}/invalid-frontmatter.md`;
          await Deno.writeTextFile(filePath, '---');

          const { readOk, readError } = await _phase1ReadFiles([filePath]);

          assertEquals(readOk, []);
          assertEquals(readError.length, 1);
          assertEquals(readError[0].filePath, filePath);
          assertEquals(readError[0].decision, FILTER_DECISIONS.ERROR);
          assertNotEquals(readError[0].reason, '');
        });
      });
    });
  });
});
