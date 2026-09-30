// src: scripts/modules/filter/__tests__/functional/process-chunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       Deno.Command モック + 実 tempdir を使用したチャンク処理の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { processChunk } from '../../process-chunk.ts';
// types
import type { FilterStats } from '../../../../types/stats.types.ts';

// ─── Helpers
import {
  installCommandMock,
  makeClaudeJsonMock,
  makeFailMock,
  makeNotFoundMock,
} from '../../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { useDefaultGlobalConfig } from '../../../../../../_cle-libs/__tests__/helpers/global-config-setup.ts';
import { ChatlogCache } from '../../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../../../../_cle-libs/constants/config-schema.constants.ts';
// types
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { makePeriodDir, makeRepeatedContent } from '../../../../__tests__/_helpers/fixtures.ts';
// exists
import { fileOrDirExists } from '../../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
// constants
import { CHATLOG_BLOCK_CLOSE, CHATLOG_BLOCK_OPEN_TEMPLATE } from '../../../../constants/common.constants.ts';
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';
// types
import type { AiRunnerProvider, RunAIOptions } from '../../../../../../_cle-libs/types/providers.types.ts';
import type { CLEResult } from '../../../../types/cache.types.ts';

// ─── Internal Helpers

// constants
/** テスト用 .md ファイル・`ChatlogEntry` に使う共通本文（frontmatter + 質問/回答 1 ターン）。 */
const _TEMP_CONTENT = '---\ntitle: テスト\n---\n### User\n質問\n\n### Assistant\n回答\n';

/** decision=ERROR が confidence に依存せず error 扱いになることを確かめる境界値（threshold=0.7 に対し 未満 / ちょうど / 上限）。 */
const _ERROR_CONFIDENCE_CASES: readonly number[] = [0.0, 0.7, 1.0];

/**
 * `T-FL-PCK-15` で `processChunk` に渡す本文最大文字数。
 *
 * 既定値（`DEFAULT_CONFIG_VALUES.maxBodyChars` = 8000）と十分に離れた小さい値を選び、
 * 引数が無視されて既定値で描画された場合に必ず超過が観測されるようにする。
 */
const _SMALL_MAX_BODY_CHARS = 50;

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

/** 与えられた例外を必ず reject する `AiRunnerProvider` スタブを返すファクトリヘルパー。 */
const _throwingRunner = (e: unknown): AiRunnerProvider => () => Promise.reject(e);

/**
 * バッチプロンプト文字列から、各ログブロックの本文（開始デリミタ〜終了デリミタの間）を取り出す。
 *
 * `buildBatchPrompt` が出力する `<<<CHATLOG file="NAME">>>` 〜 `<<<END_CHATLOG>>>` の
 * 囲みを行単位で走査し、囲まれた本文だけを配列で返す。
 *
 * @param prompt - `aiRunnerProvider` が受け取った user プロンプト文字列
 * @returns ブロック本文の配列（ブロック出現順）
 */
const _extractBlockBodies = (prompt: string): string[] => {
  const openPrefix = CHATLOG_BLOCK_OPEN_TEMPLATE.split('{file}')[0];
  return prompt
    .split(openPrefix)
    .slice(1)
    .map((block) => block.slice(block.indexOf('\n') + 1))
    .map((block) => block.split(CHATLOG_BLOCK_CLOSE)[0].trimEnd());
};

/** 判定結果配列を JSON 文字列にして resolve する `AiRunnerProvider` スタブを返すファクトリヘルパー。 */
const _resultsRunner = (results: readonly Record<string, unknown>[]): AiRunnerProvider => () =>
  Promise.resolve(JSON.stringify(results));

/** コードフェンスで囲まれた空配列応答。パーサ段 1 のフェンス経路が空配列を受理する形。 */
const _FENCED_EMPTY_ARRAY = '```json\n[]\n```';

/** 与えた文字列をそのまま resolve する `AiRunnerProvider` スタブを返すファクトリヘルパー。 */
const _rawRunner = (raw: string): AiRunnerProvider => () => Promise.resolve(raw);

/**
 * 応答文字列を順に返す `AiRunnerProvider` スタブと、その呼び出し回数を返すファクトリヘルパー。
 *
 * `responses` を先頭から 1 回ずつ返し、尽きたあとは最後の要素を返し続ける。
 * リトライ回数の検証に使う。
 *
 * @param responses - 呼び出し順に返す生応答文字列
 * @returns `runner`（注入する provider）と `calls`（呼び出し回数を返す関数）
 */
const _makeSequencedRunner = (responses: readonly string[]): { runner: AiRunnerProvider; calls: () => number } => {
  let _count = 0;
  const runner: AiRunnerProvider = () => {
    const _raw = responses[Math.min(_count, responses.length - 1)];
    _count++;
    return Promise.resolve(_raw);
  };
  return { runner, calls: () => _count };
};

/**
 * 生応答と例外を混在させて順に返す `AiRunnerProvider` スタブと、その呼び出し回数を返すファクトリヘルパー。
 *
 * `items` を先頭から 1 回ずつ消費し、`string` なら resolve、`Error` なら reject する。
 * 尽きたあとは最後の要素を繰り返す。`_makeSequencedRunner` では作れない
 * 「1 回目は throw、2 回目は正常応答」の並びを組むために使う。
 *
 * @param items - 呼び出し順に返す生応答文字列、または reject する例外
 * @returns `runner`（注入する provider）と `calls`（呼び出し回数を返す関数）
 */
const _makeMixedRunner = (
  items: readonly (string | Error)[],
): { runner: AiRunnerProvider; calls: () => number } => {
  let _count = 0;
  const runner: AiRunnerProvider = () => {
    const _item = items[Math.min(_count, items.length - 1)];
    _count++;
    return _item instanceof Error ? Promise.reject(_item) : Promise.resolve(_item);
  };
  return { runner, calls: () => _count };
};

// ─── Tests

/**
 * `processChunk` 関数の機能テストスイート。
 *
 * `processChunk(files, stats, options)` は Claude CLI にバッチ判定を依頼し、
 * 判定結果を `cache.write` へ書き込む（mark-then-sweep 方式）。ファイル削除は行わず、
 * KEEP 扱いの場合のみ `stats.keep` を更新する。実ファイルの削除は `sweepDiscards` が別途行う。
 *
 * ## 判定ルール
 * - `decision === 'DISCARD'` かつ `confidence >= DEFAULT_CONFIG_VALUES.discardThreshold` → cache に `decision: DISCARD` を書き込む（削除はしない）
 * - `confidence < DEFAULT_CONFIG_VALUES.discardThreshold` → DISCARD 判定でも未確定のグレーゾーンのため cache には `decision: EMPTY` を書き込み、stats.skip に計上（未確定のため次回再判定される。confidence/reason は元の値を保持）
 * - ファイル名不一致 → 判定不能として stats.skip に計上（cache へは書き込まず、次回再判定される）
 * - 応答の形が壊れている（JSON パース失敗 / 空配列 / 要素数がチャンク件数と不一致）→ `maxRetry` 回まで同じチャンクを再要求し、使い切ったら全件 `stats.error` に計上して `ChatlogError` を返す（cache へは書き込まない）。subindex は順に `JsonParse` / `EmptyArray` / `CountMismatch`
 * - CLI エラー（`ChatlogError`）→ 再要求せず全件 `stats.error` に計上し `ChatlogError` を返す。RateLimit の場合は `ctl.abort()` を呼ぶ
 * - 非 `ChatlogError`（CLI バイナリ不在等）→ 握りつぶさず throw する
 *
 * テスト ID 範囲: T-FL-PCK-01 〜 T-FL-PCK-17
 *
 * @see processChunk
 */
describe('processChunk', () => {
  useDefaultGlobalConfig();

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
    await Deno.writeTextFile(filePath, _TEMP_CONTENT);
    return filePath;
  }

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    commandHandle?.restore();
    GlobalConfig.resetInstance();
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
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            {
              file: 'b.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();
          logStub.restore();

          assertEquals(await fileOrDirExists(filePath), true);
        });

        it('T-FL-PCK-02-02: stats.remove・stats.keep は増えない', async () => {
          const filePath = await _createTempFile('c.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            {
              file: 'c.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();
          logStub.restore();

          assertEquals(stats.remove, 0);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-02-03: cache へ判定結果が書き込まれる', async () => {
          const filePath = await _createTempFile('c2.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            {
              file: 'c2.md',
              decision: FILTER_DECISIONS.DISCARD,
              confidence: DEFAULT_CONFIG_VALUES.discardThreshold,
              reason: 'trivial',
            },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
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
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'd.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(stats.keep, 1);
        });

        it('T-FL-PCK-03-02: KEEP 確定時も cache へ判定結果が書き込まれる', async () => {
          const filePath = await _createTempFile('d2.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'd2.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
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
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'e.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'low conf' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(stats.skip, 1);
          assertEquals(stats.keep, 0);
          assertEquals(stats.remove, 0);
        });

        it('T-FL-PCK-04-02: confidence=0.6 の DISCARD → cache へは decision=EMPTY かつ confidence/reason を保持して書き込まれる', async () => {
          const filePath = await _createTempFile('e2.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'e2.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'low conf' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
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
    /** processChunk([entry1, entry2], stats, options) を呼び出すとき。 */
    describe('When: processChunk([entry1, entry2], stats, options) を呼び出す', () => {
      /** stats.error が入力ファイル数分加算され、ChatlogError(AiError) が返ることを検証する。 */
      describe('Then: T-FL-PCK-05 - stats.error が加算され ChatlogError を返す', () => {
        it('T-FL-PCK-05-01: stats.error が 2 になる', async () => {
          const file1 = await _createTempFile('f1.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          const file2 = await _createTempFile('f2.md');
          const entry2 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file2 });
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry1, entry2], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(stats.error, 2);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-05-02: ChatlogError(kind=AiError) を返す', async () => {
          const file1 = await _createTempFile('f3.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk([entry1], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).kind, 'AiError');
        });

        it('T-FL-PCK-05-03: cache へは書き込まれない', async () => {
          const file1 = await _createTempFile('f4.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry1], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(cache.read(file1), {});
        });

        it('T-FL-PCK-05-04: error 扱いになった各ファイル名がログに出力される', async () => {
          const file1 = await _createTempFile('f5.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          const file2 = await _createTempFile('f6.md');
          const entry2 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file2 });
          commandHandle = installCommandMock(makeFailMock(1));
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry1, entry2], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          const logged = errStub.calls.map((c) => c.args.join(' ')).join('\n');
          assertEquals(logged.includes('f5.md'), true);
          assertEquals(logged.includes('f6.md'), true);
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
    /** processChunk([file], stats, options) を呼び出すとき。 */
    describe('When: processChunk([file], stats, options) を呼び出す', () => {
      /** ChatlogError(subindex=RateLimit) を返し ctl.abort() が呼ばれることを検証する。 */
      describe('Then: T-FL-PCK-10 - RateLimit エラーで ctl.abort() が呼ばれる', () => {
        it('T-FL-PCK-10-01: RateLimit エラー → ChatlogError(subindex=RateLimit) を返し ctl.aborted が true になる', async () => {
          const filePath = await _createTempFile('r1.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          commandHandle = installCommandMock(_makeRateLimitMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).subindex, 'RateLimit');
          assertEquals(ctl.signal.aborted, true);
        });
      });
    });
  });

  /**
   * `ctl` が事前に abort 済みの状態で processChunk を呼び出す前提条件グループ。
   *
   * `withConcurrency` が他タスクの reject を検知して `ctl.abort()` を呼んだ後、
   * 実行中の他チャンクが `processChunk` に入ってきた場合を模倣する。
   * `runAI` に `ctl.signal` が渡されていれば `ChatlogError('Aborted', 'ExternalAbort', ...)` を
   * throw するため、NotFound エラーではなく Aborted エラーとして扱われることを検証する。
   */
  describe('Given: ctl が事前に abort 済みの状態', () => {
    /** processChunk([entry1, entry2], stats, options) を呼び出すとき。 */
    describe('When: processChunk([entry1, entry2], stats, options) を呼び出す', () => {
      /** stats.error が入力ファイル数分加算され、ChatlogError(Aborted) が返ることを検証する。 */
      describe('Then: T-FL-PCK-11 - stats.error が加算され ChatlogError(Aborted) を返す', () => {
        it('T-FL-PCK-11-01: stats.error が 2 になり ChatlogError(kind=Aborted, subindex=ExternalAbort) を返す', async () => {
          const file1 = await _createTempFile('k1.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          const file2 = await _createTempFile('k2.md');
          const entry2 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file2 });
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();
          ctl.abort();

          const result = await processChunk([entry1, entry2], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(stats.error, 2);
          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).kind, 'Aborted');
          assertEquals((result as ChatlogError).subindex, 'ExternalAbort');
        });

        it('T-FL-PCK-11-02: error 扱いになった各ファイル名がログに出力される', async () => {
          const file1 = await _createTempFile('k3.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          const file2 = await _createTempFile('k4.md');
          const entry2 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file2 });
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();
          ctl.abort();

          await processChunk([entry1, entry2], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          const logged = errStub.calls.map((c) => c.args.join(' ')).join('\n');
          assertEquals(logged.includes('k3.md'), true);
          assertEquals(logged.includes('k4.md'), true);
        });

        it('T-FL-PCK-11-03: Aborted エラーでは ctl.abort() が再度呼ばれない', async () => {
          const file1 = await _createTempFile('k5.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();
          ctl.abort();
          const abortStub = stub(ctl, 'abort');

          await processChunk([entry1], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();
          abortStub.restore();

          assertEquals(abortStub.calls.length, 0);
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
    /** processChunk([file], stats, options) を呼び出すとき。 */
    describe('When: processChunk([file], stats, options) を呼び出す', () => {
      /** stats.error が加算され、ChatlogError(InvalidFormat) が返ることを検証する。 */
      describe('Then: T-FL-PCK-06 - stats.error が加算され ChatlogError(InvalidFormat) を返す', () => {
        it('T-FL-PCK-06-01: stats.error が 1 になる', async () => {
          const filePath = await _createTempFile('g.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          commandHandle = installCommandMock(
            makeClaudeJsonMock('これはJSONではありません'),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(stats.error, 1);
          assertEquals(stats.keep, 0);
        });

        it('T-FL-PCK-06-02: ChatlogError(kind=InvalidFormat) を返す', async () => {
          const filePath = await _createTempFile('g2.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          commandHandle = installCommandMock(
            makeClaudeJsonMock('これはJSONではありません'),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          const result = await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(result instanceof ChatlogError, true);
          assertEquals((result as ChatlogError).kind, 'InvalidFormat');
        });

        it('T-FL-PCK-06-03: cache へは書き込まれない', async () => {
          const filePath = await _createTempFile('g3.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          commandHandle = installCommandMock(
            makeClaudeJsonMock('これはJSONではありません'),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          assertEquals(cache.read(filePath), {});
        });

        it('T-FL-PCK-06-04: error 扱いになった各ファイル名がログに出力される', async () => {
          const file1 = await _createTempFile('g4.md');
          const entry1 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file1 });
          const file2 = await _createTempFile('g5.md');
          const entry2 = new ChatlogEntry(_TEMP_CONTENT, { filePath: file2 });
          commandHandle = installCommandMock(
            makeClaudeJsonMock('これはJSONではありません'),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry1, entry2], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          const logged = errStub.calls.map((c) => c.args.join(' ')).join('\n');
          assertEquals(logged.includes('g4.md'), true);
          assertEquals(logged.includes('g5.md'), true);
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
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          // 対象は h.md だが結果は other.md
          const response = JSON.stringify([
            { file: 'other.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
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
    /** processChunk([file], stats, options) を呼び出すとき。 */
    describe('When: processChunk([file], stats, options) を呼び出す', () => {
      /** ChatlogError ではないため throw され、呼び出し元まで伝播することを検証する。 */
      describe('Then: T-FL-PCK-08 - 非 ChatlogError は throw される', () => {
        it('T-FL-PCK-08-01: NotFound エラー → throw される', async () => {
          const filePath = await _createTempFile('i.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          commandHandle = installCommandMock(makeNotFoundMock());
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await assertRejects(
            () =>
              processChunk([entry], stats, {
                discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
                cache,
                ctl,
                maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
              }),
            Deno.errors.NotFound,
          );
          errStub.restore();
        });
      });
    });
  });

  /**
   * `model` を指定して processChunk を呼び出す前提条件グループ。
   *
   * 指定した `model` が claude CLI の起動引数（`--model`）にそのまま渡ることを検証する。
   */
  describe('Given: model="haiku" を指定', () => {
    /** processChunk([file], stats, { model: 'haiku', ... }) を呼び出すとき。 */
    describe('When: processChunk([file], stats, { model: "haiku", ... }) を呼び出す', () => {
      /** claude CLI の起動引数に --model haiku が含まれることを検証する。 */
      describe('Then: T-FL-PCK-12 - claude CLI の起動引数に --model haiku が含まれる', () => {
        it('T-FL-PCK-12-01: capturedArgs に --model と haiku が含まれる', async () => {
          const filePath = await _createTempFile('m1.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'm1.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          const capturedArgs: { value: string[] } = { value: [] };
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response, capturedArgs),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
            model: 'haiku',
          });
          errStub.restore();

          const modelIndex = capturedArgs.value.indexOf('--model');
          assertEquals(modelIndex !== -1, true);
          assertEquals(capturedArgs.value[modelIndex + 1], 'haiku');
        });
      });
    });
  });

  /**
   * `model` を省略して processChunk を呼び出す前提条件グループ。
   *
   * `model` 省略時は runAI 側のデフォルトモデル（DEFAULT_AI_MODEL）にフォールバックすることを検証する。
   */
  describe('Given: model を省略', () => {
    /** processChunk([file], stats, options) を呼び出すとき。 */
    describe('When: processChunk([file], stats, options) を呼び出す', () => {
      /** claude CLI の起動引数に --model DEFAULT_AI_MODEL が含まれることを検証する。 */
      describe('Then: T-FL-PCK-13 - claude CLI の起動引数に --model DEFAULT_AI_MODEL が含まれる', () => {
        it('T-FL-PCK-13-01: capturedArgs に --model と GlobalConfig の model が含まれる', async () => {
          GlobalConfig.resetInstance();
          GlobalConfig.getInstance({ yaml: 'model: sonnet\n' });
          const filePath = await _createTempFile('m2.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'm2.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
          ]);
          const capturedArgs: { value: string[] } = { value: [] };
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response, capturedArgs),
          );
          const errStub = stub(console, 'error', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
          errStub.restore();

          const modelIndex = capturedArgs.value.indexOf('--model');
          assertEquals(modelIndex !== -1, true);
          assertEquals(capturedArgs.value[modelIndex + 1], 'sonnet');
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
    /** processChunk([file], stats, { discardThreshold: 0.5 }) を呼び出すとき。 */
    describe('When: processChunk([file], stats, { discardThreshold: 0.5 }) を呼び出す', () => {
      /** confidence(0.6) >= threshold(0.5) なので DISCARD 確定として cache に書き込まれ、stats は変化しない。 */
      describe('Then: T-FL-PCK-09 - DISCARD 確定が cache に書き込まれる', () => {
        it('T-FL-PCK-09-01: threshold=0.5, confidence=0.6 → cache に DISCARD が書き込まれる', async () => {
          const filePath = await _createTempFile('j.md');
          const entry = new ChatlogEntry(_TEMP_CONTENT, { filePath });
          const response = JSON.stringify([
            { file: 'j.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.6, reason: 'trivial' },
          ]);
          commandHandle = installCommandMock(
            makeClaudeJsonMock(response),
          );
          const errStub = stub(console, 'error', () => {});
          const logStub = stub(console, 'log', () => {});
          const stats = _makeStats();
          const cache = await _makeEmptyCache();
          const ctl = new AbortController();

          await processChunk([entry], stats, {
            discardThreshold: 0.5,
            cache,
            ctl,
            maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          });
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

/**
 * `processChunk` の catch 判定を `isAbortingAiError` へ差し替えたことを検証するスイート。
 *
 * `aiRunnerProvider` 引数へ「指定の例外を投げるスタブ」を注入し、中断すべき `ChatlogError` のときだけ
 * `ctl.abort()` が呼ばれ、それ以外は従来どおり全件 `stats.error` に計上して
 * `ChatlogError` を返すことを確認する。
 *
 * テスト ID 範囲: T-FL-LAB-01 〜 T-FL-LAB-03
 *
 * @see processChunk
 * @see isAbortingAiError
 */
describe('processChunk — llama 中断側判定（isAbortingAiError）', () => {
  useDefaultGlobalConfig();

  describe('When: aiRunnerProvider が例外を投げる', () => {
    let errStub: Stub;
    let stats: FilterStats;
    let cache: ChatlogCache<CLEResult>;
    let ctl: AbortController;
    let entries: ChatlogEntry[];

    beforeEach(async () => {
      errStub = stub(console, 'error', () => {});
      stats = { keep: 0, skip: 0, remove: 0, error: 0 };
      cache = await _makeEmptyCache();
      ctl = new AbortController();
      entries = [
        new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' }),
        new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/b.md' }),
      ];
    });

    afterEach(() => {
      errStub.restore();
    });

    it('[Normal] T-FL-LAB-01-01: AiError/ExitFailure → abort されず全件 stats.error に計上され同じ ChatlogError が返る', async () => {
      const thrown = new ChatlogError('AiError', 'ExitFailure');

      const result = await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _throwingRunner(thrown),
      });

      assertEquals(ctl.signal.aborted, false);
      assertEquals(stats.error, entries.length);
      assertStrictEquals(result, thrown);
    });

    it('[Error] T-FL-LAB-02-01: AiError/RateLimit → ctl.abort() が呼ばれる', async () => {
      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _throwingRunner(new ChatlogError('AiError', 'RateLimit')),
      });

      assertEquals(ctl.signal.aborted, true);
    });

    it('[Error] T-FL-LAB-02-02: AiError/BackendUnavailable → ctl.abort() が呼ばれる', async () => {
      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _throwingRunner(new ChatlogError('AiError', 'BackendUnavailable')),
      });

      assertEquals(ctl.signal.aborted, true);
    });

    it('[Edge] T-FL-LAB-03-01: AiError/RateLimit → 差し替え前と同じく abort され stats.error も加算される', async () => {
      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _throwingRunner(new ChatlogError('AiError', 'RateLimit')),
      });

      assertEquals(ctl.signal.aborted, true);
      assertEquals(stats.error, entries.length);
    });
  });
});

/**
 * `processChunk` が `aiRunnerProvider` へ出力契約（structured-output §4.3.1 #2）を渡すことを検証するスイート。
 *
 * `options` を捕捉するスタブを注入し、`options.outputContract` を契約定義と丸ごと比較する。
 *
 * テスト ID 範囲: T-FL-OCT-01
 *
 * @see processChunk
 */
describe('processChunk — 出力契約（outputContract）', () => {
  useDefaultGlobalConfig();

  describe('When: aiRunnerProvider を呼び出す', () => {
    let errStub: Stub;
    let stats: FilterStats;
    let cache: ChatlogCache<CLEResult>;

    beforeEach(async () => {
      errStub = stub(console, 'error', () => {});
      stats = { keep: 0, skip: 0, remove: 0, error: 0 };
      cache = await _makeEmptyCache();
    });

    afterEach(() => {
      errStub.restore();
    });

    it('[Normal] T-FL-OCT-01-01: options に #2 json-array 契約が渡る', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      let captured: RunAIOptions | undefined;
      const runner: AiRunnerProvider = (_system, _user, options) => {
        captured = options;
        return Promise.resolve('[]');
      };

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl: new AbortController(),
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        model: 'sonnet',
        aiRunnerProvider: runner,
      });

      assertEquals(captured?.outputContract, {
        contract: 'json-array',
        properties: {
          file: { type: 'string' },
          decision: { type: 'string', values: ['KEEP', 'DISCARD', 'ERROR'], fallback: 'ERROR' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      });
    });
  });
});

/**
 * `processChunk` が AI 応答の `decision: ERROR`（出力契約の fallback 値）を error 扱いにすることを検証するスイート。
 *
 * `aiRunnerProvider` スタブで応答 JSON を固定し、stats・キャッシュ・ログ・戻り値を検証する。
 *
 * テスト ID 範囲: T-FL-PCK-14
 *
 * @see processChunk
 */
describe('processChunk — decision=ERROR の扱い', () => {
  useDefaultGlobalConfig();

  let errStub: Stub;
  let stats: FilterStats;
  let cache: ChatlogCache<CLEResult>;
  let ctl: AbortController;

  beforeEach(async () => {
    errStub = stub(console, 'error', () => {});
    stats = { keep: 0, skip: 0, remove: 0, error: 0 };
    cache = await _makeEmptyCache();
    ctl = new AbortController();
  });

  afterEach(() => {
    errStub.restore();
  });

  describe('When: 単一ファイルの判定結果が decision=ERROR', () => {
    const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
    const runner = _resultsRunner([{ file: 'a.md', decision: 'ERROR', confidence: 0.9, reason: 'unknown' }]);

    it('[Normal] T-FL-PCK-14-01: stats.error のみ 1 加算され keep/skip/remove は 0 のまま', async () => {
      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: runner,
      });

      assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 1 });
    });

    it('[Normal] T-FL-PCK-14-02: キャッシュへ判定結果が書き込まれない', async () => {
      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: runner,
      });

      assertEquals(cache.read('/fake/input/a.md'), {});
    });

    it('[Normal] T-FL-PCK-14-03: error扱いログにファイル名が出て kept ログは出ない', async () => {
      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: runner,
      });

      const logged = errStub.calls.map((c) => c.args.join(' '));
      assertEquals(logged.some((line) => line.includes('error扱い') && line.includes('a.md')), true);
      assertEquals(logged.some((line) => line.includes('kept')), false);
    });

    it('[Normal] T-FL-PCK-14-04: チャンク失敗扱いにならず戻り値は undefined で ctl は abort されない', async () => {
      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: runner,
      });

      assertStrictEquals(result, undefined);
      assertEquals(ctl.signal.aborted, false);
    });
  });

  describe('When: decision=ERROR の confidence が閾値 0.7 の前後', () => {
    const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];

    for (const confidence of _ERROR_CONFIDENCE_CASES) {
      it(`[Edge] T-FL-PCK-14-05: confidence=${confidence} → error=1・skip/keep=0・cache 未書き込み`, async () => {
        const runner = _resultsRunner([{ file: 'a.md', decision: 'ERROR', confidence, reason: 'unknown' }]);

        await processChunk(entries, stats, {
          discardThreshold: 0.7,
          cache,
          ctl,
          maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
          aiRunnerProvider: runner,
        });

        assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 1 });
        assertEquals(cache.read('/fake/input/a.md'), {});
      });
    }
  });

  describe('When: KEEP / ERROR / DISCARD が混在するチャンクを処理する', () => {
    const entries = ['k.md', 'e.md', 'd.md'].map((name) =>
      new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
    );
    const runner = _resultsRunner([
      { file: 'k.md', decision: 'KEEP', confidence: 0.9, reason: 'why' },
      { file: 'e.md', decision: 'ERROR', confidence: 0.9, reason: 'unknown' },
      { file: 'd.md', decision: 'DISCARD', confidence: 0.9, reason: 'what' },
    ]);

    it('[Error] T-FL-PCK-14-06: ERROR のファイルだけが error 扱いになり前後のファイルは通常どおり判定される', async () => {
      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: runner,
      });

      assertStrictEquals(result, undefined);
      assertEquals(stats, { keep: 1, skip: 0, remove: 0, error: 1 });
      assertEquals(cache.read('/fake/input/k.md'), { decision: 'KEEP', confidence: 0.9, reason: 'why' });
      assertEquals(cache.read('/fake/input/e.md'), {});
      assertEquals(cache.read('/fake/input/d.md'), { decision: 'DISCARD', confidence: 0.9, reason: 'what' });
    });
  });
});

/**
 * `processChunk` が引数で受け取った `maxBodyChars` をバッチプロンプト構築へ渡すことを検証するスイート。
 *
 * `aiRunnerProvider` を注入して user プロンプトを捕獲し、**provider が受け取った引数**を検証する
 * （`docs/rules/testing-conventions.md`「provider 注入テストは provider に何が渡されたかを検証する」）。
 *
 * テスト ID 範囲: T-FL-PCK-15
 *
 * @see processChunk
 */
describe('processChunk — 本文最大文字数（maxBodyChars）', () => {
  useDefaultGlobalConfig();

  let errStub: Stub;
  let stats: FilterStats;
  let cache: ChatlogCache<CLEResult>;

  beforeEach(async () => {
    errStub = stub(console, 'error', () => {});
    stats = { keep: 0, skip: 0, remove: 0, error: 0 };
    cache = await _makeEmptyCache();
  });

  afterEach(() => {
    errStub.restore();
  });

  /** 本文が `maxBodyChars` を大きく超えるエントリ 2 件のチャンクを入力とする前提条件グループ。 */
  describe('Given: 本文が maxBodyChars を超えるエントリ 2 件のチャンク', () => {
    /** maxBodyChars を明示して processChunk を呼び出すとき。 */
    describe('When: processChunk([entry1, entry2], stats, { maxBodyChars, aiRunnerProvider }) を呼び出す', () => {
      /** user プロンプトの全ブロック本文が maxBodyChars 以下に切り詰められることを検証する。 */
      describe('Then: T-FL-PCK-15 - user プロンプトの各ブロック本文が maxBodyChars 以下', () => {
        it('[Normal] T-FL-PCK-15-01: 渡した maxBodyChars で全ブロック本文が切り詰められる', async () => {
          const entries = ['a.md', 'b.md'].map((name) =>
            new ChatlogEntry(makeRepeatedContent(500), { filePath: `/fake/input/${name}` })
          );
          let capturedUser: string | undefined;
          const runner: AiRunnerProvider = (_system, user) => {
            capturedUser = user;
            return Promise.resolve('[]');
          };

          await processChunk(entries, stats, {
            discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
            cache,
            ctl: new AbortController(),
            maxBodyChars: _SMALL_MAX_BODY_CHARS,
            aiRunnerProvider: runner,
          });

          const bodies = _extractBlockBodies(capturedUser ?? '');
          assertEquals(bodies.length, 2);
          assertEquals(
            bodies.filter((body) => body.length > _SMALL_MAX_BODY_CHARS).map((body) => body.length),
            [],
            `maxBodyChars=${_SMALL_MAX_BODY_CHARS} を超える本文が user プロンプトに含まれている`,
          );
        });
      });
    });
  });
});

/**
 * AI が構文的に有効な空配列（`[]`）を返したときの `processChunk` の扱いを検証するスイート。
 *
 * `parseAiJsonArray` は段 1 で空配列を成功として返すため、`if (!parsed)` を素通りして
 * チャンク全員が「判定不能 skip」に落ちる（GitHub #483）。空配列応答は JSON パース失敗と
 * 同じく回復不能な応答であり、チャンク全件を `stats.error` に計上して
 * `ChatlogError('InvalidFormat', 'EmptyArray')` を返す（cache へは書き込まず、`ctl.abort()` も呼ばない）。
 *
 * テスト ID 範囲: T-FL-PCK-16
 *
 * @see processChunk
 */
describe('processChunk — 空配列応答の扱い', () => {
  useDefaultGlobalConfig();

  let errStub: Stub;
  let stats: FilterStats;
  let cache: ChatlogCache<CLEResult>;
  let ctl: AbortController;

  beforeEach(async () => {
    errStub = stub(console, 'error', () => {});
    stats = { keep: 0, skip: 0, remove: 0, error: 0 };
    cache = await _makeEmptyCache();
    ctl = new AbortController();
  });

  afterEach(() => {
    errStub.restore();
  });

  /** AI がリテラル `[]` だけを返す異常系。チャンク全件が error 扱いになることを検証する。 */
  describe('When: aiRunnerProvider がリテラル `[]` を返す', () => {
    it('[Error] T-FL-PCK-16-01: チャンク全件が stats.error に計上され skip は増えない', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );

      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _resultsRunner([]),
      });

      assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 2 });
    });

    it('[Error] T-FL-PCK-16-02: raw output と error扱いファイル名がログに出て「判定不能」は出ない', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );

      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _resultsRunner([]),
      });

      const logged = errStub.calls.map((c) => c.args.join(' '));
      assertEquals(logged.some((line) => line.includes('raw output: []')), true);
      assertEquals(logged.some((line) => line.includes('error扱い') && line.includes('a.md')), true);
      assertEquals(logged.some((line) => line.includes('error扱い') && line.includes('b.md')), true);
      assertEquals(logged.some((line) => line.includes('判定不能')), false);
      assertEquals(logged.some((line) => line.includes('JSON パース失敗')), false);
    });

    it('[Error] T-FL-PCK-16-03: ChatlogError(InvalidFormat / EmptyArray) を返し ctl は abort されない', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );

      const result = await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _resultsRunner([]),
      });

      assertEquals(result instanceof ChatlogError, true);
      assertEquals((result as ChatlogError).kind, 'InvalidFormat');
      assertEquals((result as ChatlogError).subindex, 'EmptyArray');
      assertEquals(ctl.signal.aborted, false);
    });

    it('[Error] T-FL-PCK-16-04: cache へは書き込まれない', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );

      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _resultsRunner([]),
      });

      assertEquals(cache.read('/fake/input/a.md'), {});
      assertEquals(cache.read('/fake/input/b.md'), {});
    });
  });

  /** コードフェンス越しの空配列というエッジケース。整形前の生応答がログに出ることを検証する。 */
  describe('When: コードフェンスで囲まれた空配列を返す', () => {
    it('[Edge] T-FL-PCK-16-05: 整形前の生応答がそのままログに出て全件 error になる', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/c.md' })];

      await processChunk(entries, stats, {
        discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold as number,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        aiRunnerProvider: _rawRunner(_FENCED_EMPTY_ARRAY),
      });

      const logged = errStub.calls.map((c) => c.args.join(' '));
      assertEquals(stats.error, 1);
      assertEquals(logged.some((line) => line.includes('raw output: ```json')), true);
    });
  });
});

/**
 * AI 応答の「形」が壊れているときに `processChunk` が同じチャンクを再要求することを検証するスイート。
 *
 * 同一プロンプトでも llama の応答は揺らぐため、1 回の不正応答で error を確定させると
 * 本来判定できるファイルを取りこぼす（GitHub #483 / beads cle-74a.3）。
 * `options.maxRetry`（既定 0）を受け取り、最大 `maxRetry + 1` 回まで再要求する。
 *
 * ## リトライ対象（応答の形が壊れているケースのみ）
 * - `parseAiJsonArray` が falsy → subindex `JsonParse`
 * - 配列が空（`length === 0`）→ subindex `EmptyArray`
 * - 要素数がチャンク件数と不一致（`length !== chunkEntries.length`）→ subindex `CountMismatch`
 *
 * ## リトライしないもの
 * - AI 実行そのものの失敗・中断側エラー（接続失敗 `BackendUnavailable` / レートリミット `RateLimit` /
 *   終了コード非 0 `ExitFailure` / `ResponseFormatRejected` 等）。同じ要求を繰り返しても結果が変わらず、
 *   中断側では `ctl.abort()` を先に効かせる必要があるため、従来どおり即 error 確定とする
 * - ファイル名不一致だが要素数は一致しているケース（従来どおり該当ファイルのみ「判定不能 skip」）
 *
 * `aiRunnerProvider` が throw する `ChatlogError` でも、`AiError/ResponseSchemaViolation`
 * （llama 経路で `validateOutputContract` が応答形式違反を検出して投げるもの）は応答の形が壊れている
 * ケースであり**リトライ対象**である。この経路の検証は `T-FL-PCK-18` が担当する。
 *
 * リトライを使い切った場合は `_failChunk` を 1 回だけ呼ぶため、`stats.error` はチャンク件数
 * ちょうどであり、試行回数分の多重加算は起きない。要素数不一致で使い切った場合も
 * 部分一致分を採用せず（cache へ書かず）チャンク全件を error にする。
 * 試行回数の上限は 10（`maxRetry` をこれ以上に設定してもクランプされる）。
 *
 * テスト ID 範囲: T-FL-PCK-17
 *
 * @see processChunk
 */
describe('processChunk — 応答不正時の再要求（maxRetry）', () => {
  useDefaultGlobalConfig();

  let errStub: Stub;
  let stats: FilterStats;
  let cache: ChatlogCache<CLEResult>;
  let ctl: AbortController;

  beforeEach(async () => {
    errStub = stub(console, 'error', () => {});
    stats = { keep: 0, skip: 0, remove: 0, error: 0 };
    cache = await _makeEmptyCache();
    ctl = new AbortController();
  });

  afterEach(() => {
    errStub.restore();
  });

  /** 再要求によって判定が確定し、error にならずに済むケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FL-PCK-17-01: maxRetry=2、1 回目が空配列・2 回目が正常 → 判定が確定し error にならない', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeSequencedRunner([
        '[]',
        JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
      ]);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 2,
        aiRunnerProvider: runner,
      });

      assertEquals(stats, { keep: 1, skip: 0, remove: 0, error: 0 });
      assertEquals(calls(), 2);
      assertEquals(result, undefined);
    });

    it('[Normal] T-FL-PCK-17-02: maxRetry=1、1 回目が要素数不一致・2 回目が一致 → 全件判定される', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );
      const { runner, calls } = _makeSequencedRunner([
        JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
        JSON.stringify([
          { file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' },
          { file: 'b.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' },
        ]),
      ]);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      assertEquals(stats, { keep: 2, skip: 0, remove: 0, error: 0 });
      assertEquals(calls(), 2);
    });

    it('[Normal] T-FL-PCK-17-07: リトライした試行のログに attempt 番号が出る', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner } = _makeSequencedRunner([
        '[]',
        JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
      ]);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 2,
        aiRunnerProvider: runner,
      });

      const logged = errStub.calls.map((c) => c.args.join(' '));
      assertEquals(logged.some((line) => line.includes('attempt') && line.includes('1')), true);
    });
  });

  /** 再要求を使い切って失敗が確定するケースと、そもそもリトライしないケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-FL-PCK-17-03: maxRetry=2 で要素数不一致が続く → 3 回要求し全件 error・subindex=CountMismatch', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );
      const { runner, calls } = _makeSequencedRunner([
        JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
      ]);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 2,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 3);
      assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 2 });
      assertEquals((result as ChatlogError).kind, 'InvalidFormat');
      assertEquals((result as ChatlogError).subindex, 'CountMismatch');
      assertEquals(cache.read('/fake/input/a.md'), {});
    });

    it('[Error] T-FL-PCK-17-04: maxRetry=1 で JSON パース失敗が続く → 2 回要求し subindex=JsonParse', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeSequencedRunner(['これはJSONではありません']);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 2);
      assertEquals(stats.error, 1);
      assertEquals((result as ChatlogError).subindex, 'JsonParse');
    });

    it('[Error] T-FL-PCK-17-06: AI 実行失敗（ChatlogError throw）は maxRetry=3 でもリトライしない', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      let _calls = 0;
      const runner: AiRunnerProvider = () => {
        _calls++;
        return Promise.reject(new ChatlogError('AiError', 'ExitFailure', 'boom'));
      };

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 3,
        aiRunnerProvider: runner,
      });

      assertEquals(_calls, 1);
      assertEquals(stats.error, 1);
      assertEquals((result as ChatlogError).kind, 'AiError');
    });
  });

  /** 試行回数の境界（既定値 0 と、上限 10 へのクランプ）を検証するケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FL-PCK-17-05: maxRetry=0（既定）→ 空配列でも 1 回しか要求せず即 error', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeSequencedRunner(['[]']);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 0,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 1);
      assertEquals(stats.error, 1);
      assertEquals((result as ChatlogError).subindex, 'EmptyArray');
    });

    it('[Edge] T-FL-PCK-17-08: maxRetry=20 でも上限 10 にクランプされ 11 回で打ち止め', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeSequencedRunner(['[]']);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 20,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 11);
      assertEquals(stats.error, 1);
    });
  });
});

/**
 * `aiRunnerProvider` が応答形式違反を throw する llama 経路で、`processChunk` が同じチャンクを
 * 再要求することを検証するスイート。
 *
 * `--model llama/...` の経路では `runAI` → `_runViaHttp` が送信後に自分で `parseContractPayload` /
 * `validateOutputContract` を呼び、不適合を `ChatlogError('AiError', 'ResponseSchemaViolation', ...)`
 * として throw する。生応答が `processChunk` へ返らないため `_validateResponse` に到達せず、
 * `T-FL-PCK-17` の再要求ロジックが素通しされていた（PR #493 レビュー指摘 / beads cle-dny7）。
 *
 * ## リトライ対象（throw されても応答の形が壊れているケース）
 * - `ChatlogError('AiError', 'ResponseSchemaViolation', ...)` → `_validateResponse` の失敗と同じ扱い
 *
 * ## リトライしないもの（従来どおり即 error 確定 + 中断側は `ctl.abort()`）
 * - `ResponseFormatRejected` / `BackendUnavailable` / `RateLimit` / `InvalidEndpoint`
 *   （`isAbortingAiError` の中断側一覧）。名前が `ResponseSchemaViolation` と似ている
 *   `ResponseFormatRejected` は扱いが逆であることに注意する
 *
 * 再要求を使い切った場合は既存の `_failChunk` 経路を 1 回だけ通るため、`stats.error` はチャンク件数
 * ちょうどであり、試行回数分の多重加算は起きない。生応答が手元に無いため、`_failChunk` に渡すのは
 * 例外メッセージであり、返る `ChatlogError` の detail にそれが載る。
 *
 * `maxRetry=0` のときに 1 回で確定することは `T-FL-PCK-17-05` と同趣旨のため、ここでは扱わない。
 *
 * テスト ID 範囲: T-FL-PCK-18
 *
 * @see processChunk
 */
describe('processChunk — llama 経路の応答形式違反の再要求', () => {
  useDefaultGlobalConfig();

  /** llama 経路の `validateOutputContract` が投げる応答形式違反（続行側 = リトライ対象）。 */
  const _makeSchemaViolation = (): ChatlogError =>
    new ChatlogError('AiError', 'ResponseSchemaViolation', 'response body is not valid JSON: Unexpected token');

  let errStub: Stub;
  let stats: FilterStats;
  let cache: ChatlogCache<CLEResult>;
  let ctl: AbortController;

  beforeEach(async () => {
    errStub = stub(console, 'error', () => {});
    stats = { keep: 0, skip: 0, remove: 0, error: 0 };
    cache = await _makeEmptyCache();
    ctl = new AbortController();
  });

  afterEach(() => {
    errStub.restore();
  });

  /** 再要求によって判定が確定し、error にならずに済むケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FL-PCK-18-01: maxRetry=1、1 回目が応答形式違反 throw・2 回目が正常 → 判定が確定し error にならない', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeMixedRunner([
        _makeSchemaViolation(),
        JSON.stringify([{ file: 'a.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
      ]);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 2);
      assertEquals(stats, { keep: 1, skip: 0, remove: 0, error: 0 });
      assertEquals(result, undefined);
      assertEquals(ctl.signal.aborted, false);
    });
  });

  /** 再要求を使い切って失敗が確定するケース（多重加算・detail・cache 未書き込み）。 */
  describe('When: 異常系', () => {
    it('[Error] T-FL-PCK-18-02: maxRetry=1 で応答形式違反が続く → 2 回要求し stats.error はチャンク件数ちょうど', async () => {
      const entries = ['a.md', 'b.md'].map((name) =>
        new ChatlogEntry(_TEMP_CONTENT, { filePath: `/fake/input/${name}` })
      );
      const { runner, calls } = _makeMixedRunner([_makeSchemaViolation()]);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 2);
      assertEquals(stats, { keep: 0, skip: 0, remove: 0, error: 2 });
      assertEquals((result as ChatlogError).kind, 'InvalidFormat');
      assertEquals((result as ChatlogError).subindex, 'ResponseSchemaViolation');
      assertEquals(ctl.signal.aborted, false);
    });

    it('[Error] T-FL-PCK-18-03: 使い切った場合、_failChunk 経由の detail に例外メッセージが載る', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner } = _makeMixedRunner([_makeSchemaViolation()]);

      const result = await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      // `_failChunk` は detail を `raw output: <生応答>` の形で組む。throw 経路では生応答が
      // 手元に無いため、そこへ載るのは例外メッセージである。両方を見て `_failChunk` 経由を固定する。
      const _message = (result as ChatlogError).message;
      assertEquals(_message.includes('raw output: '), true);
      assertEquals(_message.includes('response body is not valid JSON'), true);
    });

    it('[Error] T-FL-PCK-18-04: 使い切った場合、cache へ 1 件も書き込まれない', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner } = _makeMixedRunner([_makeSchemaViolation()]);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 1,
        aiRunnerProvider: runner,
      });

      assertEquals(cache.read('/fake/input/a.md'), {});
    });
  });

  /** 中断側エラーは名前が似ていてもリトライ対象にならないことを固定するケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FL-PCK-18-05: ResponseFormatRejected は maxRetry=3 でも 1 回で確定し ctl.abort() が呼ばれる', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeMixedRunner([new ChatlogError('AiError', 'ResponseFormatRejected', 'rejected')]);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 3,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 1);
      assertEquals(stats.error, 1);
      assertEquals(ctl.signal.aborted, true);
    });

    it('[Edge] T-FL-PCK-18-06: BackendUnavailable は maxRetry=3 でも 1 回で確定し ctl.abort() が呼ばれる', async () => {
      const entries = [new ChatlogEntry(_TEMP_CONTENT, { filePath: '/fake/input/a.md' })];
      const { runner, calls } = _makeMixedRunner([new ChatlogError('AiError', 'BackendUnavailable', 'connect failed')]);

      await processChunk(entries, stats, {
        discardThreshold: 0.7,
        cache,
        ctl,
        maxBodyChars: DEFAULT_CONFIG_VALUES.maxBodyChars as number,
        maxRetry: 3,
        aiRunnerProvider: runner,
      });

      assertEquals(calls(), 1);
      assertEquals(stats.error, 1);
      assertEquals(ctl.signal.aborted, true);
    });
  });
});
