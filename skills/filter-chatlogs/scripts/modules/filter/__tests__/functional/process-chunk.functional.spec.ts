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
import type { FilterStats } from '../../../../types/stats.types.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogCache } from '../../../../../../_scripts/classes/ChatlogCache.class.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../../../../_scripts/constants/config-schema.constants.ts';
// types
import type { CommandMockHandle } from '../../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makePeriodDir } from '../../../../__tests__/_helpers/fixtures.ts';
// exists
import { fileOrDirExists } from '../../../../../../_scripts/libs/file-ops/exists-utils.ts';
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../../../../types/cache.types.ts';

// ─── Internal Helpers

// functions
/**
 * テスト用の空キャッシュ（バッファバック）を生成する。
 *
 * ファイル I/O をせずにインメモリバッファで動作する `ChatlogCache<CLEResult>` を返す。
 * @returns 初期化済みの空キャッシュ
 */
const _makeEmptyCache = async (): Promise<ChatlogCache<CLEResult>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogCache<CLEResult>(
    'filter-cache',
    '/fake/cache',
    undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
        glob: () => Promise.resolve([]),
      },
    },
  );
  await cache.ready;
  return cache;
};

// ─── Tests

/**
 * `processChunk` 関数の機能テストスイート。
 *
 * `processChunk(files, stats, discardThreshold, cache)` は Claude CLI にバッチ判定を依頼し、
 * DISCARD/KEEP 判定に応じてファイル削除と統計更新を行う。判定結果は `removeFile` 呼び出し前に
 * `cache.write` へ書き込まれる。
 *
 * ## 判定ルール
 * - `decision === 'DISCARD'` かつ `confidence >= DEFAULT_CONFIG_VALUES.discardThreshold` → ファイルを削除
 * - `confidence < DEFAULT_CONFIG_VALUES.discardThreshold` → DISCARD 判定でも KEEP 扱い
 * - CLI エラー・JSON パース失敗・ファイル名不一致 → 全件 KEEP 扱い（cache へは書き込まない）
 *
 * テスト ID 範囲: T-FL-PCK-01 〜 T-FL-PCK-10
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
   * @returns `{ keep: 0, skip: 0, remove: 0, error: 0 }` の FilterStats
   */
  function _makeStats(): FilterStats {
    return { keep: 0, skip: 0, remove: 0, error: 0 };
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
   * DISCARD 判定を返す Claude モックの前提条件グループ。
   *
   * ファイルが物理削除され、stats.remove がインクリメントされることを検証する。
   */
  describe('Given: DISCARD 判定を返す Claude モック', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** ファイルが削除され、stats.remove が増えることを検証する。 */
      describe('Then: T-FL-PCK-02 - ファイルが削除され stats.remove が増える', () => {
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
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();
          logStub.restore();

          assertEquals(await fileOrDirExists(filePath), false);
        });

        it('T-FL-PCK-02-02: stats.remove が 1 になる', async () => {
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
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.remove, 1);
        });

        it('T-FL-PCK-02-03: removeFile 呼び出し前に cache へ判定結果が書き込まれる', async () => {
          const filePath = await _createTempFile('c2.md');
          const response = JSON.stringify([
            {
              file: 'c2.md',
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
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();
          logStub.restore();

          assertEquals(cache.read(filePath), {
            decision: FILTER_DECISIONS.DISCARD,
            confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
            reason: 'trivial',
          });
        });
      });
    });
  });

  /**
   * KEEP 判定を返す Claude モックの前提条件グループ。
   *
   * ファイルが削除されず、stats.keep がインクリメントされることを検証する。
   */
  describe('Given: KEEP 判定を返す Claude モック', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** ファイルが残り、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PCK-03 - ファイルが残り stats.keep が増える', () => {
        it('T-FL-PCK-03-01: stats.keep が 1 になる', async () => {
          const filePath = await _createTempFile('d.md');
          const response = JSON.stringify([
            { file: 'd.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 1);
        });

        it('T-FL-PCK-03-02: KEEP 確定時も cache へ判定結果が書き込まれる', async () => {
          const filePath = await _createTempFile('d2.md');
          const response = JSON.stringify([
            { file: 'd2.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(cache.read(filePath), { decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' });
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
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PCK-04 - KEEP 扱いで stats.keep が増える', () => {
        it('T-FL-PCK-04-01: confidence=0.6 の DISCARD → stats.keep が 1 になる', async () => {
          const filePath = await _createTempFile('e.md');
          const response = JSON.stringify([
            { file: 'e.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'low conf' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 1);
          assertEquals(stats.remove, 0);
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
    /** processChunk([file1, file2], stats) を呼び出すとき。 */
    describe('When: processChunk([file1, file2], stats) を呼び出す', () => {
      /** 全件 KEEP 扱いとなり、stats.keep が入力ファイル数と一致することを検証する。 */
      describe('Then: T-FL-PCK-05 - 全件 KEEP 扱いで stats.keep が増える', () => {
        it('T-FL-PCK-05-01: stats.keep が 2 になる（全件 KEEP）', async () => {
          const file1 = await _createTempFile('f1.md');
          const file2 = await _createTempFile('f2.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([file1, file2], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 2);
        });

        it('T-FL-PCK-05-02: cache へは書き込まれない', async () => {
          const file1 = await _createTempFile('f3.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([file1], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(cache.read(file1), {});
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
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** 全件 KEEP 扱いとなり、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PCK-06 - 全件 KEEP 扱いで stats.keep が増える', () => {
        it('T-FL-PCK-06-01: stats.keep が 1 になる', async () => {
          const filePath = await _createTempFile('g.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 1);
        });

        it('T-FL-PCK-06-02: cache へは書き込まれない', async () => {
          const filePath = await _createTempFile('g2.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(cache.read(filePath), {});
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
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PCK-07 - KEEP 扱いで stats.keep が増える', () => {
        it('T-FL-PCK-07-01: ファイル名不一致 → stats.keep が 1 になる', async () => {
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
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 1);
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
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** KEEP 扱いとなり、stats.keep が増えることを検証する。 */
      describe('Then: T-FL-PCK-08 - KEEP 扱いで stats.keep が増える', () => {
        it('T-FL-PCK-08-01: NotFound エラー → stats.keep が 1 になる', async () => {
          const filePath = await _createTempFile('i.md');
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();

          assertEquals(stats.keep, 1);
        });
      });
    });
  });

  /**
   * DISCARD 判定だが対象ファイルが削除実行前に既に存在しない前提条件グループ。
   *
   * `removeFile` が `false` を返すケースで stats.error がインクリメントされることを検証する。
   */
  describe('Given: DISCARD 判定だが対象ファイルが既に存在しない', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** stats.error が増え、stats.remove は増えないことを検証する。 */
      describe('Then: T-FL-PCK-10 - stats.error が 1 になる', () => {
        it('T-FL-PCK-10-01: removeFile が失敗 → stats.error === 1', async () => {
          const filePath = await _createTempFile('k.md');
          const response = JSON.stringify([
            {
              file: 'k.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const warnStub = stub(console, 'warn', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          // removeFile 内部の Deno.remove が NotFound を投げるようにし、"File not found" 分岐を発生させる
          const removeStub = stub(Deno, 'remove', () => Promise.reject(new Deno.errors.NotFound()));

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache);
          errStub.restore();
          warnStub.restore();
          logStub.restore();
          removeStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.remove, 0);
          // removeFile が失敗しても cache.write は完了している（write-before-remove の再開可能性を保証する）
          assertEquals(cache.read(filePath).decision, FILTER_DECISIONS.DISCARD);
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
    /** processChunk([file], stats, 0.5) を呼び出すとき。 */
    describe('When: processChunk([file], stats, 0.5) を呼び出す', () => {
      /** confidence(0.6) >= threshold(0.5) なので DISCARD → stats.remove が 1 になる。 */
      describe('Then: T-FL-PCK-09 - stats.remove が 1 になる', () => {
        it('T-FL-PCK-09-01: threshold=0.5, confidence=0.6 → stats.remove === 1', async () => {
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
          const cache = await _makeEmptyCache();

          await processChunk([filePath], stats, 0.5, cache);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.remove, 1);
        });
      });
    });
  });
});
