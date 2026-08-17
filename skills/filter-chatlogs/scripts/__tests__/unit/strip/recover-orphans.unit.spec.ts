// src: scripts/__tests__/unit/strip/recover-orphans.unit.spec.ts
// @(#): strip 復帰専用モード（R-015 / DR-23 / DR-24）のユニットテスト
//       対象: recoverOrphans
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { recoverOrphans } from '../../../modules/strip/recover-orphans.ts';

// ─── Helpers
import { getBasename, normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
// helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { GlobProvider, RenameProvider, SleepProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { StripCache } from '../../../types/cache.types.ts';
import type { RecoverStats } from '../../../types/stats.types.ts';
// constants
import { LOGGER_TEXT } from '../../../../../_cle-libs/constants/logger.constants.ts';
import { BAK_SUFFIX } from '../../../constants/common.constants.ts';
import {
  STRIP_CACHE_DELETE_ATTEMPTS,
  STRIP_CACHE_DELETE_RETRY_WAIT_MS,
} from '../../../constants/strip.constants.ts';

// ─── Internal Helpers

// constants

/** テスト対象ディレクトリ。`normalizePath` 済みの形（ドライブレター大文字・スラッシュ区切り）で与える。 */
const _DIR = 'W:/temp/strip';

/**
 * キャッシュディレクトリ。**絶対パスであることが必須**。
 *
 * `ChatlogCache` は相対 `subDir` のとき `GlobalConfig` から `cacheDir` を引くため
 * （ChatlogCache.class.ts:176）、ユニットテストで実設定に依存しないよう絶対パスを渡す。
 */
const _CACHE_DIR = 'W:/temp/strip-cache';

// types

/** `_makeGlobSpy` に渡す、拡張子ごとのファイル一覧。 */
interface _GlobFiles {
  /** `<dir>/*.md` が返す本体ファイル一覧。 */
  md?: string[];
  /** `<dir>/*.md.bak` が返す退避ファイル一覧。 */
  bak?: string[];
  /** `<dir>/*.md.tmp` が返す一時ファイル一覧。 */
  tmp?: string[];
}

/** `_makeCache` が返すキャッシュと、その削除試行の記録。 */
interface _CacheSpy {
  /** `recoverOrphans` に渡す初期化済みキャッシュ。 */
  cache: ChatlogCache<StripCache>;
  /** `removeFile` が呼ばれたキャッシュファイルパスの記録。 */
  removed: string[];
}

// functions

/**
 * 受け取った glob パターンの拡張子で応答を切り替える fake `GlobProvider` を生成する。
 *
 * パターンを無視して固定配列を返すと、実装が `.bak` と `.tmp` を取り違えていても
 * 全ケースが通ってしまうため、必ず拡張子で分岐させる。
 *
 * @param files - 拡張子ごとに返すファイルパス一覧
 * @returns fake `GlobProvider` と、渡された glob パターンの記録
 */
const _makeGlobSpy = (files: _GlobFiles): { glob: GlobProvider; patterns: string[] } => {
  const patterns: string[] = [];
  const glob: GlobProvider = (pattern: string) => {
    patterns.push(pattern);
    const _ext = pattern.slice(pattern.lastIndexOf('.'));
    const _table: Record<string, string[]> = {
      '.md': files.md ?? [],
      '.bak': files.bak ?? [],
      '.tmp': files.tmp ?? [],
    };
    return Promise.resolve((_table[_ext] ?? []).map((path) => normalizePath(path)));
  };
  return { glob, patterns };
};

/** ファイル一覧のみを返す fake `GlobProvider`（glob パターンを検証しないケース用）。 */
const _makeGlob = (files: _GlobFiles): GlobProvider => _makeGlobSpy(files).glob;

/**
 * 1 つのディレクトリ実体からパターン末尾の一致でファイルを絞り込む fake `GlobProvider` を生成する。
 *
 * `_makeGlobSpy` は拡張子ごとに別々の一覧を受け取るため、`notes.bak` を渡さなければ
 * 絞り込みの有無にかかわらず同じ結果になり「無関係な `.bak` をリネームしないこと」を検証できない。
 * こちらはディレクトリの全エントリを 1 つの配列で受け取り、`expandGlob` と同じく
 * パターンの `*` 以降の接尾辞で実際に絞り込む。
 *
 * @param entries - 対象ディレクトリ直下に実在するファイルパスの一覧
 * @returns 接尾辞一致で絞り込む fake `GlobProvider`
 */
const _makeDirGlob = (entries: string[]): GlobProvider => (pattern: string) => {
  const _suffix = pattern.slice(pattern.lastIndexOf('*') + 1);
  return Promise.resolve(entries.filter((path) => path.endsWith(_suffix)).map((path) => normalizePath(path)));
};

/**
 * リネーム試行を記録するだけの `RenameProvider` を生成する。
 *
 * 全件が成功する経路の検証に使う。失敗を再現する場合は `_makeFailingRenameSpy` を使う。
 *
 * @returns リネームプロバイダと `[oldPath, newPath]` の呼び出し履歴
 */
const _makeRenameSpy = (): { rename: RenameProvider; calls: [string, string][] } => {
  const calls: [string, string][] = [];
  const rename: RenameProvider = (oldPath: string, newPath: string) => {
    calls.push([oldPath, newPath]);
    return Promise.resolve();
  };
  return { rename, calls };
};

/**
 * 指定した復帰元パスのみ `PermissionDenied` で失敗する `RenameProvider` を生成する。
 *
 * ウイルススキャナやエディタによる `.md.bak` のロックを再現する。1 件の失敗が
 * 他ファイルの復帰・集計・報告を巻き添えにしないことを検証するために使う。
 *
 * @param failBakPaths - 失敗させる復帰元パス（`<name>.md.bak`）の一覧
 * @returns リネームプロバイダと `[oldPath, newPath]` の呼び出し履歴
 */
const _makeFailingRenameSpy = (
  failBakPaths: string[],
): { rename: RenameProvider; calls: [string, string][] } => {
  const calls: [string, string][] = [];
  const _failing = new Set(failBakPaths);
  const rename: RenameProvider = (oldPath: string, newPath: string) => {
    calls.push([oldPath, newPath]);
    return _failing.has(oldPath)
      ? Promise.reject(new Deno.errors.PermissionDenied(`locked: ${oldPath}`))
      : Promise.resolve();
  };
  return { rename, calls };
};

/**
 * `.md` ファイルパスから、対応するキャッシュファイル（`<cacheDir>/<key>.json`）のパスを組み立てる。
 *
 * `ChatlogCache` のキーは `getBasename` の結果であり、`a.md` は `a` になる
 * （`a.md.bak` は `a.md` になるため、削除には復帰後の本体パスを渡す必要がある）。
 *
 * @param filePath - 本体ファイルパス（`<name>.md`）
 * @returns キャッシュファイルの絶対パス
 */
const _cachePathOf = (filePath: string): string => `${_CACHE_DIR}/${getBasename(filePath)}.json`;

/**
 * 実ファイル I/O を伴わない `ChatlogCache` を生成し、削除試行を記録する。
 *
 * 絶対パスの `subDir` と `initializer.yaml` を併用して `GlobalConfig` 参照
 * （`cacheDir` / `concurrency`）の両経路を回避する。
 * `removeFile` は `Deno.remove` を模し、シードされていないパスには
 * `Deno.errors.NotFound` を返す。常に resolve するフェイクでは
 * 「エントリ不在でも成功する（no-op）」ことを検証できないため。
 *
 * @param seededKeys - キャッシュエントリを持たせる本体ファイルパス一覧
 * @param failKeys - キャッシュ削除を `PermissionDenied` で失敗させる本体ファイルパス一覧
 * @returns 初期化済みキャッシュと削除試行の記録
 */
const _makeCache = async (seededKeys: string[], failKeys: string[] = []): Promise<_CacheSpy> => {
  const removed: string[] = [];
  const _existing = new Set(seededKeys.map((path) => _cachePathOf(path)));
  const _failing = new Set(failKeys.map((path) => _cachePathOf(path)));
  const _yaml = seededKeys.map((path) => `${getBasename(path)}: { status: stripped, rule: R-008 }`).join('\n');

  const cache = new ChatlogCache<StripCache>(_CACHE_DIR, '', { yaml: _yaml }, {
    cache: {
      mkdir: () => Promise.resolve(),
      removeFile: (path: string) => {
        removed.push(path);
        if (_failing.has(path)) { return Promise.reject(new Deno.errors.PermissionDenied(`denied: ${path}`)); }
        if (!_existing.has(path)) { return Promise.reject(new Deno.errors.NotFound(`not found: ${path}`)); }
        return Promise.resolve();
      },
    },
  });
  await cache.ready;
  return { cache, removed };
};

/**
 * 指定回数だけキャッシュ削除に失敗し、その後は成功する `ChatlogCache` を生成する。
 *
 * `_makeCache` の `failKeys` は常に失敗させるため、「再試行で回復する」ことを検証できない。
 * こちらは失敗回数を有限にすることで、リトライが実際に効いた場合のみ成功する状況を作る。
 *
 * @param filePath - キャッシュエントリを持たせる本体ファイルパス
 * @param failCount - 削除を `PermissionDenied` で失敗させる回数（これを超えたら成功する）
 * @returns 初期化済みキャッシュと削除試行の記録
 */
const _makeFlakyCache = async (filePath: string, failCount: number): Promise<_CacheSpy> => {
  const removed: string[] = [];
  const _target = _cachePathOf(filePath);
  let _attempts = 0;

  const cache = new ChatlogCache<StripCache>(_CACHE_DIR, '', {
    yaml: `${getBasename(filePath)}: { status: stripped, rule: R-008 }`,
  }, {
    cache: {
      mkdir: () => Promise.resolve(),
      removeFile: (path: string) => {
        removed.push(path);
        if (path !== _target) { return Promise.reject(new Deno.errors.NotFound(`not found: ${path}`)); }
        _attempts += 1;
        return _attempts <= failCount
          ? Promise.reject(new Deno.errors.PermissionDenied(`locked: ${path}`))
          : Promise.resolve();
      },
    },
  });
  await cache.ready;
  return { cache, removed };
};

/**
 * 初期化済みの `RecoverStats` を生成する。
 *
 * `recoverOrphans` は統計を戻り値ではなく引数のオブジェクトへ加算するため、
 * 呼び出しごとに新しいカウンターを用意し、その内容を assert する。
 *
 * @returns 全フィールドが 0 の `RecoverStats`
 */
const _makeRecoverStats = (): RecoverStats => ({ recovered: 0, skipped: 0, error: 0 });

/** 実待機を行わない `SleepProvider`。待機ミリ秒だけを記録する。 */
const _makeSleepSpy = (): { sleep: SleepProvider; waits: number[] } => {
  const waits: number[] = [];
  const sleep: SleepProvider = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { sleep, waits };
};

// ─── Tests

/**
 * `recoverOrphans` のユニットテストスイート。
 *
 * 復帰専用モード（R-015）の手順 2〜3 を検証する。
 * `.bak` を持つ孤立退避のみを本体名へ復帰させ、復帰したファイルに限り
 * キャッシュエントリを削除すること（DR-24）を、`glob` / `rename` /
 * `ChatlogCache` の注入により実 I/O なしで確認する。
 *
 * テスト ID 範囲: T-FL-SEP-03-03 / T-FL-SEP-04-01 〜 T-FL-SEP-04-20 / T-FL-SEP-05-02
 *
 * @see recoverOrphans
 */
describe('recoverOrphans', () => {
  /**
   * R-015 手順 2 の復帰リネームの検証。
   *
   * 復帰元となる原文を持つのは `.bak` だけである。孤立退避の定義が `.bak` の存在を
   * 前提とするため（DR-26）、検出されたすべての孤立が復帰対象となることを確認する。
   */
  describe('孤立退避の復帰', () => {
    /** 復帰の成立と、`.tmp` を参照しないことを確認するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-04-01: .md.bak が .md へリネームされ復帰件数に計上される', async () => {
        const { glob, patterns } = _makeGlobSpy({ bak: [`${_DIR}/orphan.md.bak`] });
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([]);
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, { glob, rename });

        assertEquals(calls, [[`${_DIR}/orphan.md.bak`, `${_DIR}/orphan.md`]]);
        assertEquals(result.recovered, [`${_DIR}/orphan.md`]);
        assertEquals(result.errors, []);
        // 通常実行では skipped は常に 0（復帰を実際に行うため）
        assertEquals(_stats, { recovered: 1, skipped: 0, error: 0 });
        // 本体・退避の 2 系統のみを列挙すること（`.md.tmp` は DR-26 により対象外）
        assertEquals(patterns.toSorted(), [`${_DIR}/*.md`, `${_DIR}/*.md.bak`].toSorted());
      });

      it('[Edge] T-FL-SEP-04-03: .tmp のみの孤立は検出されず復帰も行われない', async () => {
        // `.tmp` 単独で本体を伴わない状態は正常な処理順序では生じないため検出しない（DR-26）
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeGlob({ tmp: [`${_DIR}/orphan.md.tmp`] }),
          rename,
        });

        assertEquals(calls, []);
        assertEquals(result.recovered, []);
        assertEquals(result.errors, []);
      });

      it('[Edge] T-FL-SEP-04-04: .bak と .tmp 併存なら .bak が復帰し .tmp は残置される', async () => {
        // both は `.bak`/`.tmp` 併存、tmponly は `.tmp` のみ。両者を同時に与えることで
        // 「復帰元は常に `.bak`」と「`.tmp` は検出にも復帰にも関与しない」を 1 ケースで区別できる。
        // both だけでは `.tmp` を復帰元にする実装でも通ってしまう
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeGlob({
            bak: [`${_DIR}/both.md.bak`],
            tmp: [`${_DIR}/both.md.tmp`, `${_DIR}/tmponly.md.tmp`],
          }),
          rename,
        });

        // `.bak` のみが復帰元として使われ、いかなる `.tmp` も rename の対象にならない（残置される）
        assertEquals(calls, [[`${_DIR}/both.md.bak`, `${_DIR}/both.md`]]);
        assert(!calls.some(([oldPath]) => oldPath.endsWith('.tmp')), `.tmp がリネームされた: ${JSON.stringify(calls)}`);
        // tmponly は `.bak` を持たないため復帰対象に現れない
        assertEquals(result.recovered, [`${_DIR}/both.md`]);
      });
    });

    /** 一部のファイルで復帰リネームそのものが失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-04-19: リネーム失敗は他ファイルの復帰を止めず error として計上される', async () => {
        // `.md.bak` が AV やエディタにロックされる状況。1 件の失敗で全体が落ちると、
        // 既に復帰した他ファイルの集計・報告が出ず、オペレータが復帰済みを知る手段を失う
        const _failPath = `${_DIR}/locked.md`;
        const _firstOkPath = `${_DIR}/first.md`;
        const _secondOkPath = `${_DIR}/second.md`;
        const { rename, calls } = _makeFailingRenameSpy([`${_failPath}${BAK_SUFFIX}`]);
        const { cache } = await _makeCache([]);
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({
            bak: [
              `${_firstOkPath}${BAK_SUFFIX}`,
              `${_failPath}${BAK_SUFFIX}`,
              `${_secondOkPath}${BAK_SUFFIX}`,
            ],
          }),
          rename,
        });

        // 3 件すべてにリネームが試行される（失敗が後続の試行を止めない）
        assertEquals(calls.length, 3);
        // 復帰が成立したのは 2 件のみ。失敗した 1 件は復帰一覧に含めない
        assertEquals(result.recovered, [_firstOkPath, _secondOkPath]);
        // キャッシュ削除は成功しているため DR-24 の errors は空のまま
        assertEquals(result.errors, []);
        assertEquals(_stats, { recovered: 2, skipped: 0, error: 1 });
      });

      it('[Error] T-FL-SEP-04-20: リネームに失敗したパスが error として報告され集計行は復帰件数を示す', async () => {
        // どのファイルが復帰できなかったかを特定できなければ、オペレータは手当てできない
        const _failPath = `${_DIR}/locked.md`;
        const _okPath = `${_DIR}/fine.md`;
        const { rename } = _makeFailingRenameSpy([`${_failPath}${BAK_SUFFIX}`]);
        const { cache } = await _makeCache([]);
        const loggerStub = makeLoggerStub();

        try {
          await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
            glob: _makeGlob({ bak: [`${_failPath}${BAK_SUFFIX}`, `${_okPath}${BAK_SUFFIX}`] }),
            rename,
          });
        } finally {
          loggerStub.restore();
        }

        // 失敗したパスは error チャネルへ出す（`_deleteCacheEntry` の失敗報告と同じ形）
        assertEquals(loggerStub.errorLogs.length, 1);
        assertStringIncludes(loggerStub.errorLogs[0], _failPath);
        // 復帰報告は成立した 1 件のみ。集計行も復帰件数（失敗を除く）を示す
        assertEquals(
          loggerStub.infoLogs.toSorted(),
          [
            `${LOGGER_TEXT.INDENT}復帰しました: ${_okPath}`,
            `${LOGGER_TEXT.INDENT}復帰: 1 件`,
          ].toSorted(),
        );
      });
    });
  });

  /**
   * DR-24 のキャッシュエントリ削除の検証。
   *
   * 復帰したファイルに限りキャッシュエントリを削除すること、エントリ不在の削除が
   * no-op として成功すること、削除失敗が error として計上されることを確認する。
   */
  describe('復帰後のキャッシュ削除', () => {
    /** 削除対象の限定・エントリ不在などの境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-04-10: 復帰したファイルのキャッシュエントリが削除される', async () => {
        // 削除しないと次回実行が判定順序の手順 1 で done と誤判定し、定型部が恒久的に残る
        const _filePath = `${_DIR}/orphan.md`;
        const { rename } = _makeRenameSpy();
        const { cache, removed } = await _makeCache([_filePath]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeGlob({ bak: [`${_DIR}/orphan.md.bak`] }),
          rename,
        });

        // キャッシュキーは getBasename により `orphan`（`orphan.md.bak` の `orphan.md` ではない）
        assertEquals(removed, [_cachePathOf(_filePath)]);
        assertEquals(cache.read(_filePath), {});
        assertEquals(result.errors, []);
      });

      it('[Edge] T-FL-SEP-04-11: 復帰しなかった .tmp 単独のキャッシュは削除されない', async () => {
        // 削除対象は実際に復帰したファイルに限る。`.tmp` 単独は孤立として検出されない（DR-26）
        const _filePath = `${_DIR}/tmponly.md`;
        const { rename } = _makeRenameSpy();
        const { cache, removed } = await _makeCache([_filePath]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeGlob({ tmp: [`${_DIR}/tmponly.md.tmp`] }),
          rename,
        });

        assertEquals(removed, []);
        assertEquals(cache.read(_filePath).status, 'stripped');
        assertEquals(result.recovered, []);
      });

      it('[Edge] T-FL-SEP-04-12: キャッシュエントリが存在しない復帰は no-op として成功する', async () => {
        // 中断点によってはキャッシュが未記録のため、エントリ不在は正常
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeGlob({ bak: [`${_DIR}/nocache.md.bak`] }),
          rename,
        });

        assertEquals(calls, [[`${_DIR}/nocache.md.bak`, `${_DIR}/nocache.md`]]);
        assertEquals(result.recovered, [`${_DIR}/nocache.md`]);
        assertEquals(result.errors, []);
      });
    });

    /** 一時的なロックにより初回の削除が失敗するケース。 */
    describe('When: 異常系（リトライ）', () => {
      it('[Error] T-FL-SEP-04-13: 初回のキャッシュ削除失敗が再試行で回復し error に計上されない', async () => {
        // 削除失敗の主因は一時的なファイルロック。1 回目だけ失敗させ、再試行で成功させる
        const _filePath = `${_DIR}/locked.md`;
        const { rename } = _makeRenameSpy();
        const { cache, removed } = await _makeFlakyCache(_filePath, 1);
        const { sleep, waits } = _makeSleepSpy();
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({ bak: [`${_DIR}/locked.md.bak`] }),
          rename,
          sleep,
        });

        // 2 回試行され、2 回目で成功するため error に計上されない
        assertEquals(removed.length, 2);
        assertEquals(result.recovered, [_filePath]);
        assertEquals(result.errors, []);
        assertEquals(_stats, { recovered: 1, skipped: 0, error: 0 });
        // 再試行の前に待機を挟むこと（待機なしではロックが解けず再試行の意味がない）
        assertEquals(waits, [STRIP_CACHE_DELETE_RETRY_WAIT_MS]);
      });

      it('[Error] T-FL-SEP-04-14: 全試行が失敗すると error に計上され試行回数が上限で打ち切られる', async () => {
        const _filePath = `${_DIR}/denied.md`;
        const { rename } = _makeRenameSpy();
        // 上限を超える回数失敗させ、打ち切りが効くことを確認する
        const { cache, removed } = await _makeFlakyCache(_filePath, STRIP_CACHE_DELETE_ATTEMPTS + 1);
        const { sleep, waits } = _makeSleepSpy();
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({ bak: [`${_DIR}/denied.md.bak`] }),
          rename,
          sleep,
        });

        assertEquals(removed.length, STRIP_CACHE_DELETE_ATTEMPTS);
        assertEquals(result.errors, [_filePath]);
        // 復帰そのものは成立しているため recovered に計上され、乖離のみが error になる
        assertEquals(_stats, { recovered: 1, skipped: 0, error: 1 });
        // 待機は試行と試行の間にのみ挟む（最終試行の後には待機しない）
        assertEquals(waits.length, STRIP_CACHE_DELETE_ATTEMPTS - 1);
      });
    });

    /** キャッシュ削除が失敗し、復帰とキャッシュが乖離するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-03-03: 復帰後のキャッシュ削除失敗が error に計上されパスが報告される', async () => {
        // 復帰は完了しているがキャッシュが残るため、次回実行で strip が漏れる
        const _failPath = `${_DIR}/broken.md`;
        const _okPath = `${_DIR}/fine.md`;
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([_failPath, _okPath], [_failPath]);
        // 恒久的な失敗のため再試行しても回復しない。実待機を避けるため sleep を注入する
        const { sleep } = _makeSleepSpy();
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({ bak: [`${_DIR}/broken.md.bak`, `${_DIR}/fine.md.bak`] }),
          rename,
          sleep,
        });

        // 1 件の失敗が他の復帰を止めない（リネームは両件とも実行される）
        assertEquals(calls.length, 2);
        assertEquals(result.recovered.toSorted(), [_failPath, _okPath]);
        // 失敗したファイルのみが error として計上され、パスが報告される
        assertEquals(result.errors, [_failPath]);
        assertStringIncludes(result.errors.join(', '), 'broken.md');
        // 2 件とも復帰し、うち 1 件のみキャッシュ削除に失敗した状態
        assertEquals(_stats, { recovered: 2, skipped: 0, error: 1 });
      });

      it('[Error] T-FL-SEP-04-18: キャッシュ削除失敗時も集計行は全ての復帰報告より後に出る', async () => {
        // ファイル間は並行実行されるため、`復帰しました:` 同士の相対順序は完了順であり固定できない
        // （キャッシュ削除が再試行に入ったファイルは後ろへ回る）。一方 `復帰: N 件` は全件完了後に
        // 出る集計行であり、途中へ割り込んではならない。ここではその順序制約のみを検証する。
        // 出力の内容（行数・文言）は集合比較で固定し、行の欠落では通らないようにする。
        const _failPath = `${_DIR}/broken.md`;
        const _okPath = `${_DIR}/fine.md`;
        const { rename } = _makeRenameSpy();
        const { cache } = await _makeCache([_failPath, _okPath], [_failPath]);
        const { sleep } = _makeSleepSpy();
        const loggerStub = makeLoggerStub();

        try {
          await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
            glob: _makeGlob({ bak: [`${_failPath}${BAK_SUFFIX}`, `${_okPath}${BAK_SUFFIX}`] }),
            rename,
            sleep,
          });
        } finally {
          loggerStub.restore();
        }

        const _perFileLogs = [
          `${LOGGER_TEXT.INDENT}復帰しました: ${_failPath}`,
          `${LOGGER_TEXT.INDENT}復帰しました: ${_okPath}`,
        ];
        const _summaryLog = `${LOGGER_TEXT.INDENT}復帰: 2 件`;

        // 出力内容そのものは固定する（並行化しても行が欠けたり増えたりしないこと）
        assertEquals(loggerStub.infoLogs.toSorted(), [..._perFileLogs, _summaryLog].toSorted());
        // 集計行は全件完了後の総括であり、いずれの復帰報告よりも後に出なければならない
        const _summaryIndex = loggerStub.infoLogs.indexOf(_summaryLog);
        const _lastPerFileIndex = Math.max(..._perFileLogs.map((msg) => loggerStub.infoLogs.indexOf(msg)));
        assert(
          _summaryIndex > _lastPerFileIndex,
          `集計行が復帰報告より先に出た: ${loggerStub.infoLogs.join(' | ')}`,
        );
        // キャッシュ削除失敗は error チャネルへ出る（info の順序には影響しない）
        assertEquals(loggerStub.errorLogs.length, 1);
        assertStringIncludes(loggerStub.errorLogs[0], `キャッシュ削除に失敗しました: ${_failPath}`);
      });
    });
  });

  /**
   * dry-run（`--recover-orphans --dry-run` 併用）の検証（R-015 / DR-26）。
   *
   * dry-run は実行前レビューの手段であるため、`recovered` は復帰「予定」件数として
   * 実行時と同じ値を立てつつ、リネームもキャッシュ削除も一切行わないことを確認する。
   */
  describe('dry-run', () => {
    /** 復帰予定が存在するケース・存在しないケースの境界。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-04-15: dryRun では復帰予定を計上しつつリネームもキャッシュ削除も行わない', async () => {
        const _first = `${_DIR}/orphan1.md`;
        const _second = `${_DIR}/orphan2.md`;
        const { rename, calls } = _makeRenameSpy();
        const { cache, removed } = await _makeCache([_first, _second]);
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({ bak: [`${_first}.bak`, `${_second}.bak`] }),
          rename,
          dryRun: true,
        });

        // recovered は復帰「予定」件数。実行時の recovered と一致しなければならない
        assertEquals(_stats, { recovered: 2, skipped: 2, error: 0 });
        assertEquals(result.recovered.toSorted(), [_first, _second]);
        assertEquals(result.errors, []);

        // 破壊的操作が一切発生しないこと（リネーム・キャッシュ削除の双方）
        assertEquals(calls, []);
        assertEquals(removed, []);
        assertEquals(cache.read(_first).status, 'stripped');
        assertEquals(cache.read(_second).status, 'stripped');
      });

      it('[Edge] T-FL-SEP-04-16: dryRun で孤立が 0 件なら stats が全て 0 になる', async () => {
        const { rename, calls } = _makeRenameSpy();
        const { cache, removed } = await _makeCache([]);
        const _stats = _makeRecoverStats();

        const result = await recoverOrphans(_DIR, cache, _stats, {
          glob: _makeGlob({ md: [`${_DIR}/normal.md`] }),
          rename,
          dryRun: true,
        });

        assertEquals(_stats, { recovered: 0, skipped: 0, error: 0 });
        assertEquals(result.recovered, []);
        assertEquals(calls, []);
        assertEquals(removed, []);
      });

      it('[Edge] T-FL-SEP-04-17: dryRun では復帰実績の info ログを一切出さず dry-run ログのみを出す', async () => {
        // dry-run は「復帰していない」ため、復帰の実績を示す info ログ
        // （`復帰しました:` / `復帰: N 件`）を出してはならない。これらを出すと
        // 実行していない操作を実行したかのように報告することになる。
        // main 層の報告行（`復帰対象:` / `完了`）は `recoverOrphans` の責務外なので現れない。
        const _first = `${_DIR}/orphan1.md`;
        const _second = `${_DIR}/orphan2.md`;
        const { rename } = _makeRenameSpy();
        const { cache } = await _makeCache([_first, _second]);
        const loggerStub = makeLoggerStub();

        try {
          await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
            glob: _makeGlob({ bak: [`${_first}.bak`, `${_second}.bak`] }),
            rename,
            dryRun: true,
          });
        } finally {
          loggerStub.restore();
        }

        // info は 1 行も出ない（`復帰: N 件` の集計行が dry-run へ漏れていないこと）
        assertEquals(loggerStub.infoLogs, []);
        assertEquals(loggerStub.errorLogs, []);
        // dry-run ログは「宣言 1 行 + 対象 1 行 × 孤立件数」の順で出る
        assertEquals(loggerStub.dryrunLogs, [
          '復帰リネーム・キャッシュ削除を一切行いません',
          `${_first}${BAK_SUFFIX} → ${_first}`,
          `${_second}${BAK_SUFFIX} → ${_second}`,
        ]);
      });
    });
  });

  /**
   * 復帰対象を `.md` 由来の退避に限定することの検証（DR-23 決定 1・3）。
   *
   * 復帰はリネームを伴う破壊的操作のため、`.md` 由来でない `.bak` を復帰元として
   * 扱うと strip と無関係なファイルを別名に書き換えてしまう。
   */
  describe('対象外ファイルの除外', () => {
    /** `.md` 由来でない退避風ファイルが同一ディレクトリに混在するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-05-02: .md 由来でない notes.bak は notes へリネームされない', async () => {
        // notes.bak はエディタ等の産物。復帰元として扱うと無関係なファイルが破壊される。
        // work.tmp も同様に、種別を問わず `.tmp` は復帰に関与しない（DR-26）
        const { rename, calls } = _makeRenameSpy();
        const { cache } = await _makeCache([]);

        const result = await recoverOrphans(_DIR, cache, _makeRecoverStats(), {
          glob: _makeDirGlob([`${_DIR}/orphan.md.bak`, `${_DIR}/notes.bak`, `${_DIR}/work.tmp`]),
          rename,
        });

        assertEquals(calls, [[`${_DIR}/orphan.md.bak`, `${_DIR}/orphan.md`]]);
        assertEquals(result.recovered, [`${_DIR}/orphan.md`]);
      });
    });
  });
});
