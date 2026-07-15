// src: scripts/modules/filter/__tests__/functional/process-chunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       Deno.Command モック + 実 tempdir を使用したチャンク処理の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
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
import { ChatlogError } from '../../../../../../_scripts/classes/ChatlogError.class.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../../../../_scripts/constants/config-schema.constants.ts';
// types
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
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

/**
 * stderr にレートリミット文言を含む非ゼロ終了コードを模倣する `DenoCommandLike` を生成する。
 *
 * `runAI` はこの stderr を検知して `ChatlogError('AiError', 'RateLimit', ...)` を投げる。
 * @returns レートリミット失敗を模倣する `DenoCommandLike`
 */
function _makeRateLimitMock(): DenoCommandLike {
  return class {
    spawn() {
      return {
        stdin: {
          getWriter: () => ({
            write: (_d: Uint8Array) => Promise.resolve(),
            close: () => Promise.resolve(),
          }),
        },
        output: () =>
          Promise.resolve({
            success: false,
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode('rate limit exceeded (429)'),
          }),
      };
    }
  } as unknown as DenoCommandLike;
}

// ─── Tests

/**
 * `processChunk` 関数の機能テストスイート。
 *
 * `processChunk(files, stats, discardThreshold, cache, ctl)` は Claude CLI にバッチ判定を依頼し、
 * 判定結果を `cache.write` へ書き込む（mark-then-sweep 方式）。ファイル削除は行わず、
 * KEEP 扱いの場合のみ `stats.keep` を更新する。実ファイルの削除は `sweepDiscards` が別途行う。
 *
 * ## 判定ルール
 * - `decision === 'DISCARD'` かつ `confidence >= DEFAULT_CONFIG_VALUES.discardThreshold` → cache に `decision: DISCARD` を書き込む（削除はしない）
 * - `confidence < DEFAULT_CONFIG_VALUES.discardThreshold` → DISCARD 判定でも未確定のグレーゾーンのため cache には `decision: EMPTY` を書き込み、stats.skip に計上（未確定のため次回再判定される。confidence/reason は元の値を保持）
 * - ファイル名不一致 → 判定不能として stats.skip に計上（cache へは書き込まず、次回再判定される）
 * - CLI エラー（`ChatlogError`）・JSON パース失敗 → 全件 `stats.error` に計上し `ChatlogError` を返す（cache へは書き込まない）。RateLimit の場合は `ctl.abort()` を呼ぶ
 * - 非 `ChatlogError`（CLI バイナリ不在等）→ 握りつぶさず throw する
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
   * ファイルは削除されず、判定結果のみ cache へ書き込まれることを検証する（マーク専念化）。
   */
  describe('Given: DISCARD 判定を返す Claude モック', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** ファイルは削除されず、cache へ判定結果が書き込まれることを検証する。 */
      describe('Then: T-FL-PCK-02 - ファイルは削除されず cache へ判定結果が書き込まれる', () => {
        it('T-FL-PCK-02-01: ファイルは削除されずに残る', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();
          logStub.restore();

          assertEquals(await fileOrDirExists(filePath), true);
        });

        it('T-FL-PCK-02-02: stats.remove・stats.keep は増えない', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();
          logStub.restore();

          assertEquals(stats.remove, 0);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-02-03: cache へ判定結果が書き込まれる', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(cache.read(filePath), { decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' });
        });
      });
    });
  });

  /**
   * DISCARD 判定だが `confidence` が `DEFAULT_CONFIG_VALUES.discardThreshold`（0.7）未満の前提条件グループ。
   *
   * 信頼度不足の DISCARD は未確定のグレーゾーンとして cache に EMPTY で書き込まれ、
   * stats.skip 集計上は未確定として計上されることを検証する。
   */
  describe('Given: DISCARD 判定だが confidence が 0.7 未満', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** 未確定として stats.skip が増えることを検証する。 */
      describe('Then: T-FL-PCK-04 - 未確定で stats.skip が増える', () => {
        it('T-FL-PCK-04-01: confidence=0.6 の DISCARD → stats.skip が 1 になる', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(stats.skip, 1);
          assertEquals(stats.keep, 0);
          assertEquals(stats.remove, 0);
        });

        it('T-FL-PCK-04-02: confidence=0.6 の DISCARD → cache へは decision=EMPTY かつ confidence/reason を保持して書き込まれる', async () => {
          const filePath = await _createTempFile('e2.md');
          const response = JSON.stringify([
            { file: 'e2.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'low conf' },
          ]);
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(cache.read(filePath), { decision: FILTER_DECISIONS.EMPTY, confidence: 0.6, reason: 'low conf' });
        });
      });
    });
  });

  /**
   * Claude CLI が終了コード非 0 で失敗するモックの前提条件グループ。
   *
   * CLI 失敗（ExitFailure）時はチャンク内ファイルをすべて `stats.error` に計上し、
   * `ChatlogError` を返す。ファイルは削除されず cache へも書き込まれない。
   */
  describe('Given: Claude CLI が終了コード非 0 で失敗するモック', () => {
    /** processChunk([file1, file2], stats, threshold, cache, ctl) を呼び出すとき。 */
    describe('When: processChunk([file1, file2], stats, threshold, cache, ctl) を呼び出す', () => {
      /** stats.error が入力ファイル数分加算され、ChatlogError(AiError) が返ることを検証する。 */
      describe('Then: T-FL-PCK-05 - stats.error が加算され ChatlogError を返す', () => {
        it('T-FL-PCK-05-01: stats.error が 2 になる', async () => {
          const file1 = await _createTempFile('f1.md');
          const file2 = await _createTempFile('f2.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([file1, file2], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(stats.error, 2);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-05-02: ChatlogError(kind=AiError) を返す', async () => {
          const file1 = await _createTempFile('f3.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk(
            [file1],
            stats,
            DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
          );
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).kind, 'AiError');
        });

        it('T-FL-PCK-05-03: cache へは書き込まれない', async () => {
          const file1 = await _createTempFile('f4.md');
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([file1], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(cache.read(file1), {});
        });
      });
    });
  });

  /**
   * Claude CLI がレートリミット(429)で失敗するモックの前提条件グループ。
   *
   * RateLimit 時は他の AiError と同様 `stats.error` に計上・`ChatlogError` を返すことに加え、
   * `ctl.abort()` を呼び以後の未着手チャンクの AI 呼び出しをスキップさせることを検証する。
   */
  describe('Given: レートリミット(429)で失敗する Claude モック', () => {
    /** processChunk([file], stats, threshold, cache, ctl) を呼び出すとき。 */
    describe('When: processChunk([file], stats, threshold, cache, ctl) を呼び出す', () => {
      /** ChatlogError(subindex=RateLimit) を返し ctl.abort() が呼ばれることを検証する。 */
      describe('Then: T-FL-PCK-10 - RateLimit エラーで ctl.abort() が呼ばれる', () => {
        it('T-FL-PCK-10-01: RateLimit エラー → ChatlogError(subindex=RateLimit) を返し ctl.aborted が true になる', async () => {
          const filePath = await _createTempFile('r1.md');
          commandHandle = installCommandMock(_makeRateLimitMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk(
            [filePath],
            stats,
            DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
          );
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).subindex, 'RateLimit');
          assertEquals(ctl.signal.aborted, true);
        });
      });
    });
  });

  /**
   * Claude が JSON でないテキストを返すモックの前提条件グループ。
   *
   * JSON パース失敗時はチャンク内ファイルをすべて `stats.error` に計上し、
   * `ChatlogError(kind=InvalidFormat)` を返す。cache へは書き込まれない。
   */
  describe('Given: JSON でないテキストを返す Claude モック', () => {
    /** processChunk([file], stats, threshold, cache, ctl) を呼び出すとき。 */
    describe('When: processChunk([file], stats, threshold, cache, ctl) を呼び出す', () => {
      /** stats.error が加算され、ChatlogError(InvalidFormat) が返ることを検証する。 */
      describe('Then: T-FL-PCK-06 - stats.error が加算され ChatlogError(InvalidFormat) を返す', () => {
        it('T-FL-PCK-06-01: stats.error が 1 になる', async () => {
          const filePath = await _createTempFile('g.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-06-02: ChatlogError(kind=InvalidFormat) を返す', async () => {
          const filePath = await _createTempFile('g2.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk(
            [filePath],
            stats,
            DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
          );
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).kind, 'InvalidFormat');
        });

        it('T-FL-PCK-06-03: cache へは書き込まれない', async () => {
          const filePath = await _createTempFile('g3.md');
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(cache.read(filePath), {});
        });
      });
    });
  });

  /**
   * 対象ファイルと異なるファイル名を含む結果を返すモックの前提条件グループ。
   *
   * ファイル名不一致の場合は判定不能として該当ファイルを stats.skip に計上することを検証する。
   */
  describe('Given: 対象ファイルと異なるファイル名の結果を返す Claude モック', () => {
    /** processChunk([file], stats) を呼び出すとき。 */
    describe('When: processChunk([file], stats) を呼び出す', () => {
      /** 判定不能として stats.skip が増えることを検証する。 */
      describe('Then: T-FL-PCK-07 - 判定不能で stats.skip が増える', () => {
        it('T-FL-PCK-07-01: ファイル名不一致 → stats.skip が 1 になる', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl);
          errStub.restore();

          assertEquals(stats.skip, 1);
          assertEquals(stats.keep, 0);
        });
      });
    });
  });

  /**
   * `claude` CLI が見つからない（NotFound エラー）モックの前提条件グループ。
   *
   * `Deno.errors.NotFound` は `ChatlogError` ではない想定外の異常のため、
   * 握りつぶさず throw して呼び出し元へ伝播することを検証する。
   */
  describe('Given: claude CLI が見つからないモック', () => {
    /** processChunk([file], stats, threshold, cache, ctl) を呼び出すとき。 */
    describe('When: processChunk([file], stats, threshold, cache, ctl) を呼び出す', () => {
      /** ChatlogError ではないため throw され、呼び出し元まで伝播することを検証する。 */
      describe('Then: T-FL-PCK-08 - 非 ChatlogError は throw される', () => {
        it('T-FL-PCK-08-01: NotFound エラー → throw される', async () => {
          const filePath = await _createTempFile('i.md');
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await assertRejects(
            () => processChunk([filePath], stats, DEFAULT_CONFIG_VALUES.discardThreshold as number, cache, ctl),
            Deno.errors.NotFound,
          );
          errStub.restore();
        });
      });
    });
  });

  /**
   * カスタム discardThreshold=0.5 を使い、confidence=0.6 の DISCARD が確定として cache に書き込まれることを検証するグループ。
   *
   * discardThreshold が引数で制御できることを確認する（削除は行わないため cache 書き込みのみ検証する）。
   */
  describe('Given: DISCARD 判定 confidence=0.6 と discardThreshold=0.5', () => {
    /** processChunk([file], stats, 0.5) を呼び出すとき。 */
    describe('When: processChunk([file], stats, 0.5) を呼び出す', () => {
      /** confidence(0.6) >= threshold(0.5) なので DISCARD 確定として cache に書き込まれ、stats は変化しない。 */
      describe('Then: T-FL-PCK-09 - DISCARD 確定が cache に書き込まれる', () => {
        it('T-FL-PCK-09-01: threshold=0.5, confidence=0.6 → cache に DISCARD が書き込まれる', async () => {
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
          const ctl = new AbortController();

          await processChunk([filePath], stats, 0.5, cache, ctl);
          errStub.restore();
          logStub.restore();

          assertEquals(cache.read(filePath).decision, FILTER_DECISIONS.DISCARD);
          assertEquals(stats.remove, 0);
          assertEquals(stats.keep, 0);
        });
      });
    });
  });
});
