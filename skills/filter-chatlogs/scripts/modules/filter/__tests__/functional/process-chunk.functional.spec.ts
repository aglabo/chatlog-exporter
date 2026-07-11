// src: scripts/modules/filter/__tests__/functional/process-chunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       Deno.Command モック + 実 tempdir を使用したチャンク処理の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { processChunk } from '../../process-chunk.ts';
// types
import type { FilterStats } from '../../../../types/filter.types.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../../../../_scripts/constants/config-schema.constants.ts';
// types
import type { CommandMockHandle } from '../../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makePeriodDir } from '../../../../__tests__/_helpers/fixtures.ts';
// exists
import { fileExists, fileOrDirExists } from '../../../../../../_scripts/libs/file-ops/exists-utils.ts';
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';

// ─── Internal Helpers

// ─── Tests

/**
 * `processChunk` 関数の機能テストスイート。
 *
 * `processChunk(files, dryRun, stats, discardThreshold)` は Claude CLI にバッチ判定を依頼し、
 * DISCARD/KEEP 判定に応じてファイル削除と統計更新を行う。
 *
 * ## 判定ルール
 * - `decision === 'DISCARD'` かつ `confidence >= DEFAULT_CONFIG_VALUES.discardThreshold` → ファイルを削除（dryRun=false 時）
 * - `confidence < DEFAULT_CONFIG_VALUES.discardThreshold` → DISCARD 判定でも KEEP 扱い
 * - CLI エラー・JSON パース失敗・ファイル名不一致 → 全件 KEEP 扱い
 *
 * テスト ID 範囲: T-FL-PCK-01 〜 T-FL-PCK-08
 *
 * @see processChunk
 */
describe('processChunk', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス。 */
  let periodDir1: string;

  /** Deno.Command モックのハンドル。afterEach で restore する。 */
  let commandHandle: CommandMockHandle;

  /**
   * 初期値がすべて 0 の `FilterStats` オブジェクトを生成する。
   *
   * @returns `{ kept: 0, discarded: 0, skipped: 0, preSkipped: 0, error: 0 }` の FilterStats
   */
  function _makeStats(): FilterStats {
    return { kept: 0, discarded: 0, skipped: 0, preSkipped: 0, error: 0 };
  }

  /**
   * テスト用 .md ファイルを一時ディレクトリに作成し、そのパスを返す。
   *
   * @param name - ファイル名（例: `a.md`）
   * @returns 作成したファイルの絶対パス
   */
  async function _createTempFile(name: string): Promise<string> {
    const filePath = `${periodDir1}/${name}`;
    const content = '---\ntitle: テスト\n---\n### User\n質問\n\n### Assistant\n回答\n';
    await Deno.writeTextFile(filePath, content);
    return filePath;
  }

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    commandHandle?.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * DISCARD 判定を返す Claude モックと `dryRun=true` の前提条件グループ。
   *
   * dryRun モードではファイルを物理削除しないが、stats.discarded がインクリメントされることを検証する。
   */
  describe('Given: DISCARD 判定を返す Claude モックと dryRun=true', () => {
    /** processChunk([file], true, stats) を呼び出すとき。 */
    describe('When: processChunk([file], true, stats) を呼び出す', () => {
      /** ファイルが残り、stats.discarded が増えることを検証する。 */
      describe('Then: T-FL-PCK-01 - ファイルが削除されず stats.discarded が増える', () => {
        it('T-FL-PCK-01-01: ファイルが残っている', async () => {
          const filePath = await _createTempFile('a.md');
          const response = JSON.stringify([
            {
              file: 'a.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();

          await processChunk([filePath], true, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();
          logStub.restore();

          assertEquals(await fileExists(filePath), true);
        });

        it('T-FL-PCK-01-02: stats.discarded が 1 になる', async () => {
          const filePath = await _createTempFile('a.md');
          const response = JSON.stringify([
            {
              file: 'a.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();

          await processChunk([filePath], true, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.discarded, 1);
        });
      });
    });
  });

  /**
   * DISCARD 判定を返す Claude モックと `dryRun=false` の前提条件グループ。
   *
   * dryRun=false 時にはファイルが物理削除され、stats.discarded がインクリメントされることを検証する。
   */
  describe('Given: DISCARD 判定を返す Claude モックと dryRun=false', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** ファイルが削除され、stats.discarded が増えることを検証する。 */
      describe('Then: T-FL-PCK-02 - ファイルが削除され stats.discarded が増える', () => {
        it('T-FL-PCK-02-01: ファイルが削除される', async () => {
          const filePath = await _createTempFile('b.md');
          const response = JSON.stringify([
            {
              file: 'b.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();
          logStub.restore();

          assertEquals(await fileOrDirExists(filePath), false);
        });

        it('T-FL-PCK-02-02: stats.discarded が 1 になる', async () => {
          const filePath = await _createTempFile('c.md');
          const response = JSON.stringify([
            {
              file: 'c.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.discarded, 1);
        });
      });
    });
  });

  /**
   * KEEP 判定を返す Claude モックの前提条件グループ。
   *
   * ファイルが削除されず、stats.kept がインクリメントされることを検証する。
   */
  describe('Given: KEEP 判定を返す Claude モック', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** ファイルが残り、stats.kept が増えることを検証する。 */
      describe('Then: T-FL-PCK-03 - ファイルが残り stats.kept が増える', () => {
        it('T-FL-PCK-03-01: stats.kept が 1 になる', async () => {
          const filePath = await _createTempFile('d.md');
          const response = JSON.stringify([
            { file: 'd.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 1);
        });
      });
    });
  });

  /**
   * DISCARD 判定だが `confidence` が `DEFAULT_CONFIG_VALUES.discardThreshold`（0.7）未満の前提条件グループ。
   *
   * 信頼度不足の DISCARD は KEEP 扱いとなることを検証する。
   */
  describe('Given: DISCARD 判定だが confidence が 0.7 未満', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.kept が増えることを検証する。 */
      describe('Then: T-FL-PCK-04 - KEEP 扱いで stats.kept が増える', () => {
        it('T-FL-PCK-04-01: confidence=0.6 の DISCARD → stats.kept が 1 になる', async () => {
          const filePath = await _createTempFile('e.md');
          const response = JSON.stringify([
            { file: 'e.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'low conf' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 1);
          assertEquals(stats.discarded, 0);
        });
      });
    });
  });

  /**
   * Claude CLI が終了コード非 0 で失敗するモックの前提条件グループ。
   *
   * CLI 失敗時は全件 KEEP 扱いとなり、ファイルが削除されないことを検証する。
   */
  describe('Given: Claude CLI が失敗するモック', () => {
    /** processChunk([file1, file2], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file1, file2], false, stats) を呼び出す', () => {
      /** 全件 KEEP 扱いとなり、stats.kept が入力ファイル数と一致することを検証する。 */
      describe('Then: T-FL-PCK-05 - 全件 KEEP 扱いで stats.kept が増える', () => {
        it('T-FL-PCK-05-01: stats.kept が 2 になる（全件 KEEP）', async () => {
          const file1 = await _createTempFile('f1.md');
          const file2 = await _createTempFile('f2.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([file1, file2], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 2);
        });
      });
    });
  });

  /**
   * Claude が JSON でないテキストを返すモックの前提条件グループ。
   *
   * JSON パース失敗時は全件 KEEP 扱いとなることを検証する。
   */
  describe('Given: JSON でないテキストを返す Claude モック', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** 全件 KEEP 扱いとなり、stats.kept が増えることを検証する。 */
      describe('Then: T-FL-PCK-06 - 全件 KEEP 扱いで stats.kept が増える', () => {
        it('T-FL-PCK-06-01: stats.kept が 1 になる', async () => {
          const filePath = await _createTempFile('g.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 1);
        });
      });
    });
  });

  /**
   * 対象ファイルと異なるファイル名を含む結果を返すモックの前提条件グループ。
   *
   * ファイル名不一致の場合は該当ファイルを KEEP 扱いとすることを検証する。
   */
  describe('Given: 対象ファイルと異なるファイル名の結果を返す Claude モック', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.kept が増えることを検証する。 */
      describe('Then: T-FL-PCK-07 - KEEP 扱いで stats.kept が増える', () => {
        it('T-FL-PCK-07-01: ファイル名不一致 → stats.kept が 1 になる', async () => {
          const filePath = await _createTempFile('h.md');
          // 対象は h.md だが結果は other.md
          const response = JSON.stringify([
            { file: 'other.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 1);
        });
      });
    });
  });

  /**
   * `claude` CLI が見つからない（NotFound エラー）モックの前提条件グループ。
   *
   * CLI 未インストール時は KEEP 扱いとなり、ファイルが安全に保持されることを検証する。
   */
  describe('Given: claude CLI が見つからないモック', () => {
    /** processChunk([file], false, stats) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.kept が増えることを検証する。 */
      describe('Then: T-FL-PCK-08 - KEEP 扱いで stats.kept が増える', () => {
        it('T-FL-PCK-08-01: NotFound エラー → stats.kept が 1 になる', async () => {
          const filePath = await _createTempFile('i.md');
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, DEFAULT_CONFIG_VALUES.discardThreshold as number);
          errStub.restore();

          assertEquals(stats.kept, 1);
        });
      });
    });
  });

  /**
   * カスタム discardThreshold=0.5 を使い、confidence=0.6 の DISCARD が削除されることを検証するグループ。
   *
   * discardThreshold が引数で制御できることを確認する。
   */
  describe('Given: DISCARD 判定 confidence=0.6 と discardThreshold=0.5', () => {
    /** processChunk([file], false, stats, 0.5) を呼び出すとき。 */
    describe('When: processChunk([file], false, stats, 0.5) を呼び出す', () => {
      /** confidence(0.6) >= threshold(0.5) なので DISCARD → stats.discarded が 1 になる。 */
      describe('Then: T-FL-PCK-09 - stats.discarded が 1 になる', () => {
        it('T-FL-PCK-09-01: threshold=0.5, confidence=0.6 → stats.discarded === 1', async () => {
          const filePath = await _createTempFile('j.md');
          const response = JSON.stringify([
            { file: 'j.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'trivial' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();

          await processChunk([filePath], false, stats, 0.5);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.discarded, 1);
        });
      });
    });
  });
});
