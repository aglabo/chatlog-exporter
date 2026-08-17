// src: scripts/__tests__/unit/strip/strip-phases.unit.spec.ts
// @(#): strip 通常モードのフェーズ関数（Phase 1〜6）のユニットテスト
//       対象: _processOrphanErrors / _processFiles / _logDecisionDetail
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  _logDecisionDetail,
  _processFiles,
  _processOrphanErrors,
} from '../../../strip-chatlogs.ts';

// ─── Helpers
import { fileExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
// helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { GlobProvider, RemoveProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { StripCache } from '../../../types/cache.types.ts';
import type { StripStats } from '../../../types/stats.types.ts';
import type { StripCacheStatus } from '../../../types/strip-cache-status.const.types.ts';
import type { StripDecision, StripReason } from '../../../types/strip.types.ts';
// constants
import { LOGGER_TEXT } from '../../../../../_cle-libs/constants/logger.constants.ts';
import { BAK_SUFFIX } from '../../../constants/common.constants.ts';
import { STRIP_CACHE_STATUSES } from '../../../types/strip-cache-status.const.types.ts';

// ─── Internal Helpers

// constants

/**
 * キャッシュルート。**絶対パスであることが必須**。
 *
 * `ChatlogCache` は `cacheRoot` が falsy のとき `GlobalConfig` から `cacheDir` を引くため
 * （ChatlogCache.class.ts:176）、実設定・環境変数に依存しないよう絶対パスを渡す。
 * 実 I/O はプロバイダ側で無効化するため、このパスにファイルは作られない。
 */
const _CACHE_ROOT = 'W:/temp/strip-phases-cache';

/** strip 対象となる原文。定型部マーカー → 境界見出し `## Summary` → 本文の構成で R-008 に到達する。 */
const _STRIPPABLE = `---
type: chatlog
title: Sample
---

## TOPICS ASSIGNMENT RULES

Some boilerplate line A.
Some boilerplate line B.

## Summary

Real content here.
More real content.
`;

/** 境界見出しを持たない原文。R-005 により passthrough となる。 */
const _PASSTHROUGH = `---
type: chatlog
title: Plain
---

Just body text without any boundary heading.
`;

/**
 * 境界見出しを持つが除去対象範囲に定型部マーカーが無い原文。R-006 により passthrough となる。
 *
 * `_PASSTHROUGH`（R-005）だけでは、記録される `rule` を `R-005` に固定した実装でも
 * テストが通ってしまう。成立した規則をそのまま記録していることを証明するために必要
 * （DR-31 決定 1）。
 */
const _PASSTHROUGH_NO_MARKER = `---
type: chatlog
title: NoMarker
---

# Title

## Summary

Real content only.
`;

/** frontmatter を持たない原文。R-002 により error となる。 */
const _NO_FRONTMATTER = `Just a plain text file with no frontmatter at all.\n`;

/**
 * dry-run の宣言行。
 *
 * 判定 1 件ごとの明細とは別に、`_processFiles` がループの外で 1 度だけ出す。
 * 対象ファイルが 0 件でも出力される。
 */
const _DRYRUN_BANNER = 'ファイルへの書き込み・退避・キャッシュ記録を一切行いません';

/**
 * テストで用いる並列度。
 *
 * `runConcurrent` は `Math.min(limit, n)` でワーカー数を決めるため、`undefined` や 0 を
 * 渡すとタスクが 1 件も実行されないまま空の結果が返る（副作用ゼロで「通って」しまう）。
 * 検証の前提として必ず正の整数を渡す。
 */
const _CONCURRENCY = 2;

/** `_makeFailingCache` のキャッシュ書き込みが送出するメッセージ。error ログの照合に使う。 */
const _CACHE_WRITE_FAILURE = 'cache write denied';

// types

/** `_makeCache` が返すキャッシュと、その書き込み記録。 */
interface _CacheSpy {
  /** フェーズ関数に渡す初期化済みキャッシュ。 */
  cache: ChatlogCache<StripCache>;
  /** `writeTextFile` が呼ばれたキャッシュファイルパスの記録。 */
  written: string[];
}

// functions

/** 初期化済みの `StripStats` を返す。フェーズ関数は戻り値ではなくこのオブジェクトへ加算する。 */
const _makeStats = (): StripStats => ({
  total: 0,
  stripped: 0,
  skipped: 0,
  done: 0,
  passthrough: 0,
  error: 0,
  bytesBefore: 0,
  bytesAfter: 0,
});

/**
 * `StripStats` から 5 分類の件数と `total` だけを取り出す。
 *
 * バイト数（`bytesBefore` / `bytesAfter`. REQ-F-006）は原文の長さに依存するため、
 * 件数の結線を検証するテストで期待値に含めると原文フィクスチャの変更で壊れる。
 * 件数の検証は件数だけを対象とする。
 *
 * @param stats - フェーズ関数が加算した統計カウンター
 * @returns 件数フィールドのみを持つオブジェクト
 */
const _countsOf = (
  { total, stripped, skipped, done, passthrough, error }: StripStats,
): Omit<StripStats, 'bytesBefore' | 'bytesAfter'> => ({ total, stripped, skipped, done, passthrough, error });

/**
 * 実ファイル I/O を伴わない `ChatlogCache` を生成する。
 *
 * 絶対パスの `subDir` と `initializer.yaml` を併用して `GlobalConfig` 参照を回避する。
 * 書き込みは記録のみ行い実ファイルを作らない。
 *
 * @param seeded - エントリを持たせるキャッシュキー（`.md` を除いた basename）
 * @param seededStatus - seed するエントリのステータス（既定: `stripped`）
 * @returns 初期化済みキャッシュと書き込み記録
 */
const _makeCache = async (
  seeded: string[] = [],
  seededStatus: StripCacheStatus = STRIP_CACHE_STATUSES.STRIPPED,
): Promise<_CacheSpy> => {
  const written: string[] = [];
  const _yaml = seeded.map((key) => `${key}: { status: ${seededStatus}, rule: R-008 }`).join('\n');

  const cache = new ChatlogCache<StripCache>(_CACHE_ROOT, '', { yaml: _yaml }, {
    cache: {
      mkdir: () => Promise.resolve(),
      writeTextFile: (path: string) => {
        written.push(path);
        return Promise.resolve();
      },
    },
  });
  await cache.ready;
  return { cache, written };
};

/**
 * キャッシュ書き込みが必ず失敗する `ChatlogCache` を生成する。
 *
 * 判定を通過したファイルの**書き込みだけ**を失敗させる唯一の手段である。
 * 既存退避による失敗（`BackupAlreadyExists`）は判定が R-004 で done にするため到達できず、
 * `writeStripped` が返す error を統合パイプライン上で観測するにはこの経路を使う。
 *
 * @returns 書き込みが常に throw する初期化済みキャッシュ
 */
const _makeFailingCache = async (): Promise<{ cache: ChatlogCache<StripCache> }> => {
  const cache = new ChatlogCache<StripCache>(_CACHE_ROOT, '', { yaml: '' }, {
    cache: {
      mkdir: () => Promise.resolve(),
      writeTextFile: () => Promise.reject(new Error(_CACHE_WRITE_FAILURE)),
    },
  });
  await cache.ready;
  return { cache };
};

/**
 * ファイル一覧を固定で返す fake `GlobProvider` を生成する。
 *
 * `.md.bak` パターンには退避一覧を、それ以外には本体一覧を返す。パターンを無視して
 * 同じ配列を返すと、実装が本体と退避を取り違えていても通ってしまうため必ず分岐させる。
 *
 * @param files - `md`（本体）・`bak`（退避）それぞれの一覧
 * @returns fake `GlobProvider` と、渡された glob パターンの記録
 */
const _makeGlobSpy = (
  files: { md?: string[]; bak?: string[] },
): { glob: GlobProvider; patterns: string[] } => {
  const patterns: string[] = [];
  const glob: GlobProvider = (pattern: string) => {
    patterns.push(pattern);
    const _list = pattern.endsWith('.md.bak') ? files.bak ?? [] : files.md ?? [];
    return Promise.resolve(_list.map((path) => normalizePath(path)));
  };
  return { glob, patterns };
};

/** 削除試行を記録するだけの `RemoveProvider`。実ファイルは削除しない。 */
const _makeRemoveSpy = (): { removeProvider: RemoveProvider; removed: string[] } => {
  const removed: string[] = [];
  const removeProvider: RemoveProvider = (path: string) => {
    removed.push(path);
    return Promise.resolve();
  };
  return { removeProvider, removed };
};

/**
 * 一時ディレクトリを作り、指定したファイルを書き出す。
 *
 * `classifyStrip` / `writeStripped` は `StripMainDeps` に含まれない（差し替えると
 * 「通常実行と同じ経路を通る」保証が失われるため意図的に非注入）。よってこれらを通る
 * フェーズ関数の検証には実ファイルが必要となる。
 *
 * @param files - ファイル名 → 内容の対応表
 * @returns 正規化済みの一時ディレクトリパス
 */
const _setupDir = async (files: Record<string, string>): Promise<string> => {
  const _dir = normalizePath(await Deno.makeTempDir());
  await Promise.all(
    Object.entries(files).map(([name, body]) => Deno.writeTextFile(`${_dir}/${name}`, body)),
  );
  return _dir;
};

/**
 * 判定の分類ごとの判定理由。
 *
 * `rule=` は `error` のときだけ明細へ出るため、`error` には他と区別できる規則 ID を与える。
 * 全分類で同一の規則 ID を共有すると「error 以外で rule= が漏れている」退行を検出できない。
 */
const _REASON_BY_OUTCOME: Record<StripDecision['outcome'], StripReason> = {
  stripped: { rule: 'R-008' },
  skipped: { rule: 'R-008' },
  error: { rule: 'R-002' },
  done: { rule: 'R-003' },
  passthrough: { rule: 'R-005' },
};

/**
 * `_logDecisionDetail` に渡す判定結果を組み立てる。
 *
 * `_logDecisionDetail` は実 I/O を伴わないため、判定結果を直接与えて明細の書式だけを検証できる。
 * 実 `classifyStrip` 経由では除去範囲・除去バイト数が原文依存となり書式を逐語検証できない。
 *
 * 除去範囲・除去バイト数は明細へ出力されなくなったが、`writeStripped` が除去範囲として使う
 * 必須データであるため判定結果には保持させる。明細へ再び漏れ出す退行を検出するために、
 * 除去を伴う分類では 0 以外の値を与える。
 *
 * @param filePath - 対象ファイルパス
 * @param outcome - 判定の分類結果
 * @returns `filePath` と `decision` のペア
 */
const _makeDecision = (
  filePath: string,
  outcome: StripDecision['outcome'],
): { filePath: string; decision: StripDecision } => {
  const _hasRemoval = outcome === 'stripped' || outcome === 'skipped';
  const _range = _hasRemoval
    ? { removalStartLine: 4, removalEndLine: 9, removedBytes: 42, contentBytes: 100 }
    : { removalStartLine: -1, removalEndLine: -1, removedBytes: 0, contentBytes: 0 };
  return { filePath, decision: { outcome, reason: _REASON_BY_OUTCOME[outcome], ..._range } };
};

// ─── Tests

/**
 * strip 通常モードのフェーズ関数のユニットテストスイート。
 *
 * `main` から切り出した Phase 1（孤立退避の計上）と、Phase 2〜6 を 1 ファイル単位の
 * パイプラインへ統合した `_processFiles`（判定 → 書き込み → ログ → 加算、および
 * ループ外の退避一括削除）を検証する（DR-28）。
 *
 * `_processFiles` は責務が広いため 2 つの describe に分けて扱う。判定の結線と dry-run 明細を
 * `_processFiles（判定）`（T-FL-SEP-06-03〜07 / -18〜20）に、書き込みの副作用・退避の
 * 一括削除・1 ファイル分のログ出力を `_processFiles（書き込み）`
 * （T-FL-SEP-06-10〜17 / -21〜22）に置く。
 *
 * テスト ID 範囲: T-FL-SEP-06-01 〜 T-FL-SEP-06-28（`-08` は `-08-01` 〜 `-08-04` の 4 ケース）。
 * `-24` 〜 `-27` は `passthrough` のキャッシュ記録（DR-31）。
 *
 * @see main
 */
describe('strip フェーズ関数', () => {
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
  });

  /**
   * Phase 1 の孤立退避計上の検証（R-014 / DR-23 決定 1）。
   *
   * 孤立退避は `.md` を持たないため列挙されず R-002〜R-008 に到達しない。
   * 検出せずに Phase 6 へ到達すると、一括削除で復旧材料の `.bak` が失われる。
   */
  describe('_processOrphanErrors', () => {
    /** 孤立が検出されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-06-01: 孤立 2 件で stats.error が 2 増え各件の error ログが出る', async () => {
        const _dir = 'W:/temp/strip';
        const _first = `${_dir}/orphan1.md`;
        const _second = `${_dir}/orphan2.md`;
        const _stats = _makeStats();
        _stats.error = 1;

        await _processOrphanErrors(_dir, _stats, {
          glob: _makeGlobSpy({ bak: [`${_first}${BAK_SUFFIX}`, `${_second}${BAK_SUFFIX}`] }).glob,
        });

        // 既存の error 件数へ加算する（上書きではない）
        assertEquals(_stats.error, 3);
        // 他の分類は一切変化しない
        assertEquals({ ..._stats, error: 0 }, _makeStats());
        assertEquals(loggerStub.errorLogs, [
          `${LOGGER_TEXT.INDENT}孤立した退避を検出しました: ${_first}${BAK_SUFFIX}（本体なし: ${_first}）`,
          `${LOGGER_TEXT.INDENT}孤立した退避を検出しました: ${_second}${BAK_SUFFIX}（本体なし: ${_second}）`,
        ]);
      });
    });

    /** 孤立が 1 件も無いケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-06-02: 孤立 0 件なら stats は不変でログも出ない', async () => {
        const _dir = 'W:/temp/strip';
        const _stats = _makeStats();

        await _processOrphanErrors(_dir, _stats, {
          // 本体のみ存在し、対応する退避を持たない
          glob: _makeGlobSpy({ md: [`${_dir}/normal.md`] }).glob,
        });

        assertEquals(_stats, _makeStats());
        assertEquals(loggerStub.errorLogs, []);
      });
    });
  });

  /**
   * Phase 2 の判定カスケード結線の検証（R-002〜R-008）。
   *
   * 判定そのものは `classifyStrip` の責務であり、ここでは全件へ判定を適用すること・
   * キャッシュ参照と退避存在確認を正しく結線していること・戻り値が入力と同順同数で
   * あることを検証する。
   *
   * dry-run の明細出力も `_processFiles` が担うため（宣言行 1 回 + 判定 1 件ごとの明細）、
   * その結線もここで検証する。明細 1 行の書式自体は `_logDecisionDetail` が担う。
   *
   * 書き込み・一括削除の副作用は同じ関数の別 describe（`_processFiles（書き込み）`）で扱う。
   */
  describe('_processFiles（判定）', () => {
    /** 複数ファイルへ判定を適用するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-06-03: 各ファイルの filePath と判定結果が入力と同順・同数で返る', async () => {
        // `runConcurrent` は結果を入力位置へ書き戻すため、完了順に関わらず入力順が保たれる。
        // 順序が崩れると `sweepBackups` へ渡す stripped のパス集合の由来が追えなくなる
        const _dir = await _setupDir({
          'strip.md': _STRIPPABLE,
          'plain.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        });
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();

        const { decisions } = await _processFiles(
          _dir,
          [`${_dir}/strip.md`, `${_dir}/plain.md`, `${_dir}/broken.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [`${_dir}/strip.md${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        // 判定は全件について行われ、入力と同数のペアが返る
        assertEquals(decisions.length, 3);
        assertEquals(
          decisions.map(({ filePath, decision }) => [filePath, decision.outcome]),
          [
            [`${_dir}/strip.md`, 'stripped'],
            [`${_dir}/plain.md`, 'passthrough'],
            [`${_dir}/broken.md`, 'error'],
          ],
        );

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-06-07: stripped 以外の判定が分類ごとに stats へ計上される', async () => {
        // 判定と書き込みが 1 ループに統合されても、書き込みを伴わない 3 分類の計上が
        // 落ちないことの証明（統合前は `main` 側の filter/forEach が担っていた）
        const _dir = await _setupDir({
          'plain.md': _PASSTHROUGH,
          'cached.md': _STRIPPABLE,
          'broken.md': _NO_FRONTMATTER,
        });
        const { cache } = await _makeCache(['cached']);
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [`${_dir}/plain.md`, `${_dir}/cached.md`, `${_dir}/broken.md`],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(_countsOf(_stats), { total: 0, stripped: 0, skipped: 0, done: 1, passthrough: 1, error: 1 });

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-06-18: dryRun なら宣言行に続き stripped 以外も含む全件の明細が出る', async () => {
        // 明細を `stripped` のみへ縮小すると事前レビューが成立しない（REQ-F-005）。
        // done は R-003（キャッシュ）、error は frontmatter 欠落で成立させる
        const _dir = await _setupDir({
          'strip.md': _STRIPPABLE,
          'plain.md': _PASSTHROUGH,
          'cached.md': _STRIPPABLE,
          'broken.md': _NO_FRONTMATTER,
        });
        const { cache } = await _makeCache(['cached']);
        const { removeProvider } = _makeRemoveSpy();

        await _processFiles(
          _dir,
          [`${_dir}/strip.md`, `${_dir}/plain.md`, `${_dir}/cached.md`, `${_dir}/broken.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        // 宣言行は明細より前に 1 度だけ出る
        assertEquals(loggerStub.dryrunLogs[0], _DRYRUN_BANNER);
        assertEquals(loggerStub.dryrunLogs.filter((msg) => msg === _DRYRUN_BANNER).length, 1);

        // 明細は完了順のため順序に依存させず、パスごとに引き当てて検証する
        const _detailOf = (name: string): string =>
          loggerStub.dryrunLogs.find((msg) => msg.startsWith(`${_dir}/${name}:`)) ?? '';
        // dry-run では除去対象の判定が `skipped` になり、明細には `stripped (skip)` と出る
        assertStringIncludes(_detailOf('strip.md'), 'outcome=stripped (skip)');
        assertStringIncludes(_detailOf('plain.md'), 'outcome=passthrough');
        assertStringIncludes(_detailOf('cached.md'), 'outcome=done');
        // `rule=` は原因の特定を要する error のときだけ添える
        assertStringIncludes(_detailOf('broken.md'), 'outcome=error rule=');
        assert(!_detailOf('plain.md').includes('rule='), '除去を伴わない判定に rule= を出さないこと');
        // 除去範囲・除去バイト数はすべての分類で出力しない
        const _hasRemovalField = (msg: string): boolean => msg.includes('lines=') || msg.includes('removedBytes=');
        assert(!loggerStub.dryrunLogs.some(_hasRemovalField), '明細に lines= / removedBytes= を含めないこと');
        // 明細は 1 ファイルにつき 1 行（宣言行を除いて入力と同数）
        assertEquals(loggerStub.dryrunLogs.length, 5);

        await Deno.remove(_dir, { recursive: true });
      });
    });

    /** キャッシュ・退避により done と判定される境界、および対象 0 件の境界。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-06-04: キャッシュに stripped 記録があるファイルは R-003 で done になる', async () => {
        // `isProcessed` が `STRIP_CACHE_STATUSES.STRIPPED` と照合されていなければ stripped のままになる
        const _dir = await _setupDir({ 'cached.md': _STRIPPABLE });
        const { cache } = await _makeCache(['cached']);
        const { removeProvider } = _makeRemoveSpy();

        const { decisions } = await _processFiles(
          _dir,
          [`${_dir}/cached.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(decisions[0].decision.outcome, 'done');
        assertEquals(decisions[0].decision.reason.rule, 'R-003');

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-05: 退避が既存のファイルは R-004 で done になる', async () => {
        // `hasBackup` に `${path}${BAK_SUFFIX}` を渡していなければ stripped のままになる
        const _dir = await _setupDir({
          'kept.md': _STRIPPABLE,
          [`kept.md${BAK_SUFFIX}`]: _STRIPPABLE,
        });
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();

        const { decisions } = await _processFiles(
          _dir,
          [`${_dir}/kept.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [`${_dir}/kept.md${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(decisions[0].decision.outcome, 'done');
        assertEquals(decisions[0].decision.reason.rule, 'R-004');

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-06: 対象ファイルが 0 件なら判定は空配列になる', async () => {
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();

        const { decisions } = await _processFiles(
          'W:/temp/strip',
          [],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(decisions, []);
      });

      it('[Edge] T-FL-SEP-06-19: dryRun かつ対象 0 件でも宣言行だけは出力される', async () => {
        // 宣言行をループ内へ移すと件数分重複し、0 件では消える。ループ外 1 回であることの証明
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();

        const { decisions } = await _processFiles(
          'W:/temp/strip',
          [],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        assertEquals(decisions, []);
        assertEquals(loggerStub.dryrunLogs, [_DRYRUN_BANNER]);
      });

      it('[Edge] T-FL-SEP-06-20: dryRun でなければ宣言行も明細も出力されない', async () => {
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();

        await _processFiles(
          _dir,
          [`${_dir}/strip.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [`${_dir}/strip.md${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(loggerStub.dryrunLogs, []);

        await Deno.remove(_dir, { recursive: true });
      });
    });
  });

  /**
   * dry-run 明細 1 件分の書式の検証（REQ-F-005）。
   *
   * 明細は 6000 件規模の事前レビュー手段であり、パスと判定結果が読み取れることを要件とする。
   * 除去範囲・除去見込みバイト数は明細へ出力しない。判定理由（`rule=`）は原因の特定を要する
   * `error` のときだけ添える。書式は判定結果を直接与えて逐語で検証する
   * （実 `classifyStrip` 経由では値が原文依存となり固定できない）。
   */
  describe('_logDecisionDetail', () => {
    /** 各分類の明細を逐語で検証する。`rule=` の有無が分類ごとに切り替わる。 */
    describe('When: 正常系', () => {
      /**
       * 分類ごとの期待明細。
       *
       * dry-run で除去対象と判定された `skipped` は `stripped (skip)` と表示する。
       * 「本来 strip されるが見送った」ことを表すためであり、他の分類には付けない。
       * `done` / `passthrough` / `error` は dry-run でも通常実行でも書き込みが起きず
       * 結果が変わらないため、`(skip)` を付けると「見送られた」と誤読される。
       */
      const _detailCases = [
        { id: '01', outcome: 'skipped', expected: 'a.md: outcome=stripped (skip)' },
        { id: '02', outcome: 'passthrough', expected: 'a.md: outcome=passthrough' },
        { id: '03', outcome: 'done', expected: 'a.md: outcome=done' },
        { id: '04', outcome: 'error', expected: 'a.md: outcome=error rule=R-002' },
      ] as const;

      for (const { id, outcome, expected } of _detailCases) {
        it(`[Normal] T-FL-SEP-06-08-${id}: ${outcome} は "${expected}" の 1 行が dryrun へ出力される`, () => {
          const { filePath, decision } = _makeDecision('a.md', outcome);

          _logDecisionDetail(filePath, decision);

          assertEquals(loggerStub.dryrunLogs, [expected]);
          // 書き込み経路のログ（info / error）は一切出ない
          assertEquals(loggerStub.errorLogs, []);
          assertEquals(loggerStub.infoLogs, []);
        });
      }

      it('[Normal] T-FL-SEP-06-23: 判定 stripped には (skip) を付けない', () => {
        // dry-run では R-008 が `skipped` を返すためこの経路は通らないが、判定 `stripped` と
        // dry-run の `skipped` は別の状態であり、表示を統合すると両者の区別が失われる
        const { filePath, decision } = _makeDecision('a.md', 'stripped');

        _logDecisionDetail(filePath, decision);

        assertEquals(loggerStub.dryrunLogs, ['a.md: outcome=stripped']);
      });
    });

    /** 除去範囲・除去見込みバイト数が明細へ漏れ出す退行の検出。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-06-09: 除去を伴う判定でも lines= と removedBytes= は出力されない', () => {
        // `skipped` は除去範囲（4-9）と除去バイト数（42）を保持するが、明細には出さない。
        // 判定結果から値が消えたのではなく出力しないだけであることを、保持値ごと検証する
        const { filePath, decision } = _makeDecision('a.md', 'skipped');

        _logDecisionDetail(filePath, decision);

        const _detail = loggerStub.dryrunLogs[0];
        assert(!_detail.includes('lines='), `除去範囲が明細に含まれないこと: ${_detail}`);
        assert(!_detail.includes('removedBytes='), `除去バイト数が明細に含まれないこと: ${_detail}`);
        // 判定結果側の除去範囲は `writeStripped` が使うため保持されている
        assertEquals(decision.removalStartLine, 4);
        assertEquals(decision.removedBytes, 42);
      });
    });
  });

  /**
   * Phase 3〜6 の書き込みパイプライン・`passthrough` のキャッシュ記録・退避の一括削除・
   * 1 ファイル分のログ出力の検証（R-009〜R-013 / REQ-F-005 / DR-31）。
   *
   * `writeStripped` / `sweepBackups` は `StripMainDeps` に含まれないため実経路を通す。
   * `sweepBackups` へ結線する error 件数（孤立退避を含む）が保持ゲート R-011 を
   * 正しく駆動することを確認する。
   */
  describe('_processFiles（書き込み）', () => {
    /** 除去と一括削除が最後まで成立するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-06-10: 本体が書き換えられ stripped が計上され退避が一括削除される', async () => {
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache, written } = await _makeCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        const _stats = _makeStats();

        const { sweepError } = await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          // 退避一覧は実 FS ではなく固定で与える（削除も記録のみ）
          { glob: _makeGlobSpy({ bak: [`${_filePath}${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(sweepError, undefined);
        // stripped の計上は書き込み成功の分類を受けて `_applyFileOutcome` が行う
        assertEquals(_stats.stripped, 1);
        assertEquals(_stats.error, 0);
        // 定型部が除去され境界見出し以降のみが残る
        const _body = await Deno.readTextFile(_filePath);
        assertStringIncludes(_body, '## Summary');
        assert(!_body.includes('TOPICS ASSIGNMENT RULES'), `定型部が残っている: ${_body}`);
        // 処理済み記録が残る（記録が無いと次回実行が再度 strip を試みる）
        assertEquals(cache.read(_filePath).status, 'stripped');
        assertEquals(written.length, 1);
        // 保持ゲートを通過し退避が削除される
        assertEquals(removed, [`${_filePath}${BAK_SUFFIX}`]);
      });

      /**
       * `passthrough` の記録で期待される規則（DR-31 決定 1）。
       *
       * 成立した規則をそのまま記録する。両方の規則を通すことで、`rule` を片方へ
       * 固定した実装（例: 常に `R-005`）を検出できる。
       */
      const _passthroughRuleCases = [
        { id: '24', name: 'plain', body: _PASSTHROUGH, rule: 'R-005' },
        { id: '25', name: 'nomarker', body: _PASSTHROUGH_NO_MARKER, rule: 'R-006' },
      ] as const;

      for (const { id, name, body, rule } of _passthroughRuleCases) {
        it(`[Normal] T-FL-SEP-06-${id}: 通常実行の passthrough が status=passthrough / rule=${rule} で記録される`, async () => {
          // 記録が無いと次回実行が同じファイルを読み直して再判定する（DR-31 Context）。
          // `rule` は成立した規則をそのまま担ぐ
          const _dir = await _setupDir({ [`${name}.md`]: body });
          const _filePath = `${_dir}/${name}.md`;
          const { cache, written } = await _makeCache();
          const { removeProvider } = _makeRemoveSpy();
          const _stats = _makeStats();

          await _processFiles(
            _dir,
            [_filePath],
            _stats,
            cache,
            { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
            false,
            _CONCURRENCY,
          );

          assertEquals(cache.read(_filePath).status, STRIP_CACHE_STATUSES.PASSTHROUGH);
          assertEquals(cache.read(_filePath).rule, rule);
          assertEquals(written.length, 1);
          // 記録は分類を変えない。passthrough のまま計上される
          assertEquals(_stats.passthrough, 1);
          assertEquals(_stats.error, 0);

          await Deno.remove(_dir, { recursive: true });
        });
      }

      it('[Normal] T-FL-SEP-06-21: 通常実行で stripped / passthrough のパスが 1 行ずつ出て done は出ない', async () => {
        // 通常実行が件数しか出さないと、どのファイルが書き換わったのかを事後に追えない。
        // 一方 done は「今回の実行で何もしていない」ため出力すると 6000 件規模のログが埋まる
        const _dir = await _setupDir({
          'strip.md': _STRIPPABLE,
          'plain.md': _PASSTHROUGH,
          'cached.md': _STRIPPABLE,
        });
        const { cache } = await _makeCache(['cached']);
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [`${_dir}/strip.md`, `${_dir}/plain.md`, `${_dir}/cached.md`],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [`${_dir}/strip.md${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        // 出力順は完了順のため、位置ではなく包含で検証する
        assert(
          loggerStub.infoLogs.includes(`${LOGGER_TEXT.INDENT}stripped: ${_dir}/strip.md`),
          `stripped のパスが出ていない: ${loggerStub.infoLogs.join(' | ')}`,
        );
        assert(
          loggerStub.infoLogs.includes(`${LOGGER_TEXT.INDENT}passthrough: ${_dir}/plain.md`),
          `passthrough のパスが出ていない: ${loggerStub.infoLogs.join(' | ')}`,
        );
        // done は無出力。件数のみサマリーへ計上される
        assertFalse(
          loggerStub.infoLogs.some((msg) => msg.includes('cached.md')),
          `done のパスが出ている: ${loggerStub.infoLogs.join(' | ')}`,
        );
        // 1 ファイル分の報告は上記 2 行のみ。件数を固定することで
        // done への報告追加と、同一ファイルの二重報告の双方を検出する
        // （`sweepBackups` がループ外で出す 1 行は分類報告ではないため除外する）
        assertEquals(_stats.error, 0);
        const _perFileLogs = loggerStub.infoLogs.filter((msg) => msg.includes('.md'));
        assertEquals(_perFileLogs.length, 2, `分類報告が 2 行ではない: ${_perFileLogs.join(' | ')}`);

        await Deno.remove(_dir, { recursive: true });
      });
    });

    /** 書き込み失敗・退避不足など、error が発生するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-06-11: writeStripped のエラーが INDENT 付きで error ログに出る', async () => {
        // 判定を通過させたうえで書き込みだけを失敗させる。既存退避（`BackupAlreadyExists`）は
        // 判定が R-004 で done にするため到達できないので、キャッシュ記録の失敗
        // （`CacheWriteFailed`）を用いる。本体の置換は完了するが記録が残らないため
        // `writeStripped` は error を返す（同関数の JSDoc 参照）
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache } = await _makeFailingCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        const _stats = _makeStats();

        const { sweepError } = await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [`${_filePath}${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        // 1 件の失敗は throw せず error として計上される（DD-03）
        assertEquals(_stats.error, 1);
        // 書き込みが成立していないため stripped は加算しない（R-013 の誤検出を防ぐ）
        assertEquals(_stats.stripped, 0);
        assertEquals(loggerStub.errorLogs.length, 1);
        assert(
          loggerStub.errorLogs[0].startsWith(LOGGER_TEXT.INDENT),
          `INDENT が付いていない: ${loggerStub.errorLogs[0]}`,
        );
        assertStringIncludes(loggerStub.errorLogs[0], _CACHE_WRITE_FAILURE);
        // error があるため退避は削除されない（R-011）。sweep 自体は正常終了する
        assertEquals(sweepError, undefined);
        assertEquals(removed, []);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Error] T-FL-SEP-06-28: 書き込み失敗の error 行が当該ファイルのパスを含む', async () => {
        // 失敗内容（`CacheWriteFailed` の detail）はキャッシュ層の生メッセージであり
        // chatlog のパスを含まない。パスを出さないと 6000 件規模の実行で「どの件が失敗したか」を
        // 特定できず、R-011 の退避保持ゲートを解除できないまま sweep が永久に走らない（REQ-F-006）
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache } = await _makeFailingCache();
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [`${_filePath}${BAK_SUFFIX}`] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        // 成功系の info 行（`<INDENT><outcome>: <path>`）と同じ語彙・形式で読み比べられること
        assert(
          loggerStub.errorLogs[0].startsWith(`${LOGGER_TEXT.INDENT}error: ${_filePath}`),
          `error 行が分類ラベルと対象パスで始まっていない: ${loggerStub.errorLogs[0]}`,
        );
        // パスを足しても失敗内容は落とさない
        assertStringIncludes(loggerStub.errorLogs[0], _CACHE_WRITE_FAILURE);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Error] T-FL-SEP-06-26: passthrough のキャッシュ記録失敗が error に計上される', async () => {
        // DR-31 決定 3: 記録に失敗しても本体は無傷だが、`stripped` と扱いを変えると
        // 「記録に失敗したが成功として報告される」経路が生まれる。error に倒して
        // R-011 に退避を保持させる
        const _dir = await _setupDir({ 'plain.md': _PASSTHROUGH });
        const _filePath = `${_dir}/plain.md`;
        const { cache } = await _makeFailingCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        // 二重計上を防ぐ。分類は 1 ファイルにつき 1 つであり passthrough と error は排他になる
        assertEquals(_stats.error, 1);
        assertEquals(_stats.passthrough, 0);
        assertEquals(_stats.stripped, 0);
        // 本体は passthrough のため一切変更されない
        assertEquals(await Deno.readTextFile(_filePath), _PASSTHROUGH);
        // 失敗内容が error ログへ出る
        assertEquals(loggerStub.errorLogs.length, 1);
        assertStringIncludes(loggerStub.errorLogs[0], _CACHE_WRITE_FAILURE);
        // R-011: error があるため退避は削除されない
        assertEquals(removed, []);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Error] T-FL-SEP-06-12: 事前の error 件数が sweepBackups へ渡り退避が保持される', async () => {
        // 孤立退避（Phase 1）由来の error も保持ゲートを駆動しなければ復旧材料が失われる。
        // 対象ファイルが 0 件でも退避が残るのは、この結線が効いている場合のみ
        const _dir = 'W:/temp/strip';
        const { cache } = await _makeCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        const _stats = _makeStats();
        _stats.error = 1;

        const { sweepError } = await _processFiles(
          _dir,
          [],
          _stats,
          cache,
          {
            glob: _makeGlobSpy({ bak: [`${_dir}/orphan.md${BAK_SUFFIX}`] }).glob,
            removeProvider,
          },
          false,
          _CONCURRENCY,
        );

        assertEquals(sweepError, undefined);
        assertEquals(removed, []);
        assertStringIncludes(loggerStub.infoLogs.join(' | '), 'error 1 件のため退避を保持します');
      });

      it('[Error] T-FL-SEP-06-13: 退避不足時は ChatlogError が throw されず返る', async () => {
        // サマリー出力の後に throw する順序は `main` の責務。ここでは値として返すことを確認する。
        // 書き込みは成功させ error を 0 に保つ（R-011 の保持ゲートで打ち切られると R-013 に到達しない）
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache } = await _makeCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        const _stats = _makeStats();

        // stripped と計上したのに退避が存在しない状態（R-013 の包含検査が破れる）
        const { sweepError } = await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          false,
          _CONCURRENCY,
        );

        assertEquals(_stats.error, 0);

        assert(sweepError !== undefined, '退避不足にもかかわらず error が返らなかった');
        assertEquals(sweepError.subindex, 'BackupMissing');
        // 削除は一切行わない
        assertEquals(removed, []);

        await Deno.remove(_dir, { recursive: true });
      });
    });

    /**
     * dry-run で書き込み系の副作用が一切発生しないことの検証（REQ-F-005 / AC-007）。
     *
     * dry-run が Phase 3〜6 を「呼ばない」構造的保証は廃され、`_processFiles` 内部の
     * 1 ファイルごとの分岐と、ループ後の `sweepBackups` 判定へ置き換わった。
     * 保証の担い手がここへ移っているため、これらのケースを削除・骨抜きにしてはならない。
     */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-06-14: dry-run では本体が書き換わらず .bak / .tmp も作られない', async () => {
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache, written } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        const { sweepError } = await _processFiles(
          _dir,
          [_filePath],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        assertEquals(sweepError, undefined);
        // 本体は原文のまま（`writeStripped` が呼ばれていれば定型部が消える）
        assertEquals(await Deno.readTextFile(_filePath), _STRIPPABLE);
        // 退避・一時ファイルのいずれも生成されない
        assertFalse(await fileExists(`${_filePath}${BAK_SUFFIX}`));
        assertFalse(await fileExists(`${_filePath}.tmp`));
        // キャッシュへの書き込みも発生しない
        assertEquals(written, []);
        assertEquals(cache.read(_filePath).status, undefined);
        // 書き込みエラーのログも出ない
        assertEquals(loggerStub.errorLogs, []);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-27: dry-run では passthrough がキャッシュへ記録されない', async () => {
        // DR-31 決定 5: dry-run は事前レビュー手段であり一切の副作用を持たない。
        // 記録すると次回の通常実行が R-003 で done と判定し、strip が永久に行われない
        const _dir = await _setupDir({ 'plain.md': _PASSTHROUGH, 'nomarker.md': _PASSTHROUGH_NO_MARKER });
        const { cache, written } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [`${_dir}/plain.md`, `${_dir}/nomarker.md`],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        assertEquals(written, []);
        assertEquals(cache.read(`${_dir}/plain.md`).status, undefined);
        assertEquals(cache.read(`${_dir}/nomarker.md`).status, undefined);
        // 分類は通常実行と同じく passthrough のまま（記録の有無は分類を変えない）
        assertEquals(_stats.passthrough, 2);
        assertEquals(_stats.error, 0);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-15: dry-run では sweepBackups へ到達せず退避が削除されない', async () => {
        const _dir = await _setupDir({ 'strip.md': _STRIPPABLE });
        const _filePath = `${_dir}/strip.md`;
        const { cache } = await _makeCache();
        const { removeProvider, removed } = _makeRemoveSpy();
        // 退避一覧を非空で与える。到達すれば削除が要求される状態にしておく
        const { glob, patterns } = _makeGlobSpy({ bak: [`${_filePath}${BAK_SUFFIX}`] });

        const { sweepError } = await _processFiles(
          _dir,
          [_filePath],
          _makeStats(),
          cache,
          { glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        assertEquals(sweepError, undefined);
        // 退避の列挙自体が行われない。`removed` が空なだけでは R-011 の保持ゲートで
        // 止まった場合と区別できないため、glob 未呼び出しで短絡を証明する
        assertEquals(patterns, []);
        assertEquals(removed, []);

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-16: dry-run では stripped 判定の件数が stats.skipped へ計上される', async () => {
        // dry-run は事前レビュー手段であり、「実行すれば何件 strip されるか」を知る必要がある。
        // DR-30 によりその件数は `skipped` が担い、`stripped`（書き換えた実績）は 0 になる。
        // 非 stripped の判定は同じループ内で本来の分類へ計上される
        const _dir = await _setupDir({ 'a.md': _STRIPPABLE, 'b.md': _PASSTHROUGH, 'c.md': _STRIPPABLE });
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();
        const _stats = _makeStats();

        await _processFiles(
          _dir,
          [`${_dir}/a.md`, `${_dir}/b.md`, `${_dir}/c.md`],
          _stats,
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        // 通常実行なら stripped=2 となる件数が、dry-run では skipped=2 として計上される（両者は排他）
        assertEquals(_countsOf(_stats), { total: 0, stripped: 0, skipped: 2, done: 0, passthrough: 1, error: 0 });

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-17: dry-run 明細は 1 ファイルにつきちょうど 1 行になる', async () => {
        // 判定と書き込みが 1 ループへ統合されたため、「書き込み側は何も出さない」という
        // 旧来の前提は消えた。代わりに担保すべきは、同一ファイルの明細行が二重に出ないこと。
        // 分類ごと（stripped / 非 stripped）に別々の dryrun 行を足すとこの検査が破れる
        const _dir = await _setupDir({
          'strip.md': _STRIPPABLE,
          'plain.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        });
        const { cache } = await _makeCache();
        const { removeProvider } = _makeRemoveSpy();
        const _files = [`${_dir}/strip.md`, `${_dir}/plain.md`, `${_dir}/broken.md`];

        await _processFiles(
          _dir,
          _files,
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        // 宣言行 1 行 + ファイル数分の明細
        assertEquals(loggerStub.dryrunLogs.length, _files.length + 1);
        // 各ファイルの明細はちょうど 1 行ずつ
        _files.forEach((filePath) => {
          assertEquals(
            loggerStub.dryrunLogs.filter((msg) => msg.startsWith(`${filePath}:`)).length,
            1,
            `明細が 1 行ではない: ${filePath}`,
          );
        });

        await Deno.remove(_dir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-06-22: dry-run では通常実行用の info 行が出ず明細のみになる', async () => {
        // 通常実行の分類報告（`stripped:` / `passthrough:`）を dry-run にも出すと、
        // 同一ファイルが明細と分類報告の 2 行で報告され T-FL-SEP-06-17 の前提が崩れる。
        // さらに未実施の書き換えを実施したかのように読ませてしまう
        const _dir = await _setupDir({
          'strip.md': _STRIPPABLE,
          'plain.md': _PASSTHROUGH,
          'cached.md': _STRIPPABLE,
        });
        const { cache } = await _makeCache(['cached']);
        const { removeProvider } = _makeRemoveSpy();

        await _processFiles(
          _dir,
          [`${_dir}/strip.md`, `${_dir}/plain.md`, `${_dir}/cached.md`],
          _makeStats(),
          cache,
          { glob: _makeGlobSpy({ bak: [] }).glob, removeProvider },
          true,
          _CONCURRENCY,
        );

        assertEquals(loggerStub.infoLogs, []);

        await Deno.remove(_dir, { recursive: true });
      });
    });
  });
});
