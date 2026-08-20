// src: scripts/__tests__/integration/strip/strip-main.integration.spec.ts
// @(#): strip-chatlogs main() の統合テスト（R-001 受理ゲート・実行モード分岐・dry-run 非破壊・サマリー）
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../../strip-chatlogs.ts';

// ─── Helpers
import { agentPath } from '../../../../../_cle-libs/libs/file-io/resolve-directory.ts';
import { fileExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { getDirectory, normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';
import { LOGGER_TEXT } from '../../../../../_cle-libs/constants/logger.constants.ts';
import { BAK_SUFFIX } from '../../../constants/common.constants.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { GlobProvider, RemoveProvider, RenameProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { StripMainDeps } from '../../../types/strip-config.types.ts';

// ─── Internal Helpers

// constants

/** テスト対象の agent。共通 `parseArgs` が既知エージェントとして受理する値を使う。 */
const _AGENT = 'claude';

/** テスト対象の期間。受理ゲートを通過させるために `<agent> <YYYY-MM>` の形で与える。 */
const _PERIOD = '2026-03';

/**
 * 出力先の override として与えるパス。受理ゲート（R-001）が列挙より前に拒否するため
 * 実在する必要はなく、共通 `parseArgs` が directory 形式として受理する形だけを満たす。
 */
const _OUTPUT_DIR = './safe-copy';

/**
 * `--input-dir` の対象として使うディレクトリ名（`<tempDir>` 直下）。
 * 既定解決パスの `originalLogs/` 枝の外側に置き、override の有無で処理対象が変わることを観測する。
 */
const _INPUT_DIR_NAME = 'external';

/**
 * 対象ディレクトリを明示する引数の与え方。いずれも同じ対象へ解決されなければならない。
 * `argv` は `_setupInputDir` が返すパスから `main` へ渡す引数列を組み立てる。
 */
const _inputDirCases = [
  {
    id: 'T-FL-SEP-02-02',
    label: '--input-dir を指定すると対象がそのディレクトリになる',
    argv: (inputDir: string): string[] => [_AGENT, _PERIOD, '--input-dir', inputDir],
  },
  {
    id: 'T-FL-SEP-02-08',
    label: '--input-dir 指定時は年月を省略しても受理される',
    argv: (inputDir: string): string[] => [_AGENT, '--input-dir', inputDir],
  },
  {
    id: 'T-FL-SEP-02-09',
    label: '位置引数のパスも --input-dir と同じ対象へ解決される',
    argv: (inputDir: string): string[] => [inputDir],
  },
] as const;

/**
 * `_setup` が作成しない期間。形式は妥当なため受理ゲート（R-001）を通過し、
 * 対象ディレクトリだけが存在しない状態を作れる。
 * （`2026-13` のような不正月は共通 `parseArgs` が `InvalidPeriodRange` として拒否するため、ここでは扱わない）
 */
const _MISSING_PERIOD = '2026-05';

/** strip 対象となる原文。定型部マーカー → 境界見出し `## Summary` → 本文の構成で R-008 に到達する。 */
const _STRIPPABLE = `---
type: chatlog
category: dev
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
category: dev
title: Plain
---

Just body text without any boundary heading.
`;

/** frontmatter を持たない原文。R-002 により error となる。 */
const _NO_FRONTMATTER = `Just a plain text file with no frontmatter at all.\n`;

/**
 * キャッシュルート。**絶対パスであることが必須**。
 *
 * `ChatlogCache` は `cacheRoot` が falsy のとき `GlobalConfig` から `cacheDir` を引き、
 * 環境変数展開のため `--allow-env` を要求する（ChatlogCache.class.ts:176-177）。
 * 実 I/O はプロバイダ側で無効化するため、このパスにファイルは作られない。
 */
const _CACHE_ROOT = 'W:/temp/strip-main-cache';

// types

/** `_setup` が返すテスト用ディレクトリ一式。 */
interface _Fixture {
  /** `chatlogsDir` として渡す一時ディレクトリのルート。 */
  tempDir: string;
  /** 実際に走査される対象ディレクトリ（`<tempDir>/originalLogs/<agent>/<YYYY>/<YYYY-MM>`）。 */
  targetDir: string;
}

// functions

/**
 * 対象ディレクトリを作成し、指定したファイルを書き出す。
 *
 * 実 FS 上に `<tempDir>/originalLogs/<agent>/<YYYY>/<YYYY-MM>/` を作るため、`main` は
 * `resolveChatlogsDir` の通常経路（override なし）で同じディレクトリへ到達する。
 * `originalLogs` 段は `main` が `addOnDir: DEFAULT_ORIGINAL_LOGS_DIR` を渡すことに対応する
 * （`export-chatlogs` が生成する実運用のレイアウトと同じ）。
 *
 * キーに `projA/log.md` のような相対パスを与えるとサブディレクトリごと作成する。
 * classify-chatlogs がログをプロジェクト別サブディレクトリへ移動した後のレイアウトを再現する。
 *
 * @param files - ファイル名（対象ディレクトリからの相対パス）→ 内容の対応表
 * @returns 作成した一時ディレクトリと対象ディレクトリ
 */
const _setup = async (files: Record<string, string>): Promise<_Fixture> => {
  const tempDir = normalizePath(await Deno.makeTempDir());
  const targetDir = `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/${agentPath(_AGENT, _PERIOD)}`;
  await Deno.mkdir(targetDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([name, body]) => {
      const _path = `${targetDir}/${name}`;
      await Deno.mkdir(getDirectory(_path), { recursive: true });
      await Deno.writeTextFile(_path, body);
    }),
  );

  // `main` は override 未指定時に `config.chatlogsDir` を基準に対象を解決する。
  // 実運用の設定ファイルを読ませずに一時ディレクトリを基準にするため GlobalConfig 経由で与える
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: `chatlogsDir: ${tempDir}` });

  return { tempDir, targetDir };
};

/**
 * `--input-dir` の対象となるディレクトリを、既定解決パスの外側に作成する。
 *
 * `_setup` が作る `<tempDir>/originalLogs/<agent>/<YYYY>/<YYYY-MM>/` とは別の枝に置くため、
 * override が結線されていなければ `main` はここへ到達しない。既定側にも同じ性質のファイルを
 * 置いておくことで、「override が効いた」ことと「たまたま両方処理された」ことを区別できる。
 *
 * @param tempDir - `_setup` が返した一時ディレクトリ（`chatlogsDir` の基準）
 * @param files - ファイル名 → 内容の対応表
 * @returns 作成した `--input-dir` 用ディレクトリのパス
 */
const _setupInputDir = async (tempDir: string, files: Record<string, string>): Promise<string> => {
  const _inputDir = `${tempDir}/${_INPUT_DIR_NAME}`;
  await Deno.mkdir(_inputDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, body]) => Deno.writeTextFile(`${_inputDir}/${name}`, body)),
  );
  return _inputDir;
};

/**
 * 列挙・退避走査に使う glob の呼び出しを記録するスパイを生成する。
 *
 * 実 FS を走査する既定実装へ委譲したうえでパターンだけを記録する。R-001 の要点は
 * ゲートの存在ではなく**評価順序**（列挙より前）であるため、「呼ばれた回数」を
 * 観測できる形にしておく必要がある。
 *
 * @returns glob プロバイダと、渡されたパターンの記録
 */
const _makeGlobSpy = (): { glob: GlobProvider; patterns: string[] } => {
  const patterns: string[] = [];
  const glob: GlobProvider = async (pattern: string) => {
    patterns.push(pattern);
    const _results: string[] = [];
    const { expandGlob } = await import('@std/fs');
    for await (const entry of expandGlob(pattern)) {
      _results.push(normalizePath(entry.path));
    }
    return _results;
  };
  return { glob, patterns };
};

/**
 * 実 FS へ書き出さないキャッシュ依存を生成する。
 *
 * `ChatlogCache` は `cacheRoot` が falsy のとき `GlobalConfig` の `cacheDir` を引き、
 * その解決に環境変数展開（`normalizePath`）を伴う。注入しないと実運用のキャッシュ
 * ディレクトリを汚染し、かつテスト実行に `--allow-env` を要求してしまう。
 * 絶対パスの `cacheRoot` と組み合わせて両方を回避する（ホスト安全性）。
 *
 * 書き込み内容はメモリ上に記録し、dry-run の非破壊検証（キャッシュ記録なし）に用いる。
 * 削除も同様に記録し、dry-run でキャッシュ削除が起きないことの検証に用いる。
 *
 * `failBasename` を与えると、その拡張子なしベース名のキャッシュ書き込みだけを失敗させる。
 * `ChatlogCache` は `<cacheDir>/<拡張子なしベース名>.json` へ書き込むため、権限エラー・
 * ディスクフルで 1 件だけ記録に失敗した状態を再現できる。
 *
 * @param failBasename - 書き込みを失敗させる拡張子なしベース名（例: `'strip'`）。省略時は全件成功
 * @returns `main` へ渡すキャッシュ関連の依存と、書き込み・削除されたキャッシュファイルの記録
 */
const _makeCacheDeps = (failBasename?: string): { deps: StripMainDeps; written: string[]; removed: string[] } => {
  const written: string[] = [];
  const removed: string[] = [];
  return {
    deps: {
      cacheRoot: _CACHE_ROOT,
      cacheProviders: {
        cache: {
          mkdir: () => Promise.resolve(),
          glob: () => Promise.resolve([]),
          writeTextFile: (path: string) => {
            if (failBasename !== undefined && path.includes(`${failBasename}.json`)) {
              return Promise.reject(new Error('cache write failed'));
            }
            written.push(path);
            return Promise.resolve();
          },
          removeFile: (path: string) => {
            removed.push(path);
            return Promise.resolve();
          },
        },
      },
    },
    written,
    removed,
  };
};

/**
 * 退避の一括削除（Phase 6）の呼び出しを記録する削除プロバイダを生成する。
 *
 * `sweepBackups` は `removeProvider` 経由でのみ `.bak` を削除するため、この記録が
 * 空であることは Phase 6 の削除が 1 件も実行されなかったことを意味する。
 *
 * @returns 削除プロバイダと、削除要求されたパスの記録
 */
const _makeRemoveSpy = (): { removeProvider: RemoveProvider; removedPaths: string[] } => {
  const removedPaths: string[] = [];
  const removeProvider: RemoveProvider = (path: string) => {
    removedPaths.push(path);
    return Deno.remove(path);
  };
  return { removeProvider, removedPaths };
};

/**
 * 復帰リネーム（R-015）の呼び出しを記録するリネームプロバイダを生成する。
 *
 * `recoverOrphans` は `rename` 経由でのみ `.bak` を本体名へ戻すため、この記録が空である
 * ことは復帰が 1 件も実行されなかったことを意味する。復帰が起きた場合も実 FS に反映させ、
 * 「呼ばれたか」と「結果として復帰したか」を同一のテストで観測できるようにする。
 *
 * @returns リネームプロバイダと、リネーム要求された `[復帰元, 復帰先]` の記録
 */
const _makeRenameSpy = (): { rename: RenameProvider; renamedPairs: [string, string][] } => {
  const renamedPairs: [string, string][] = [];
  const rename: RenameProvider = (oldPath: string, newPath: string) => {
    renamedPairs.push([oldPath, newPath]);
    return Deno.rename(oldPath, newPath);
  };
  return { rename, renamedPairs };
};

/**
 * 復帰リネームが常に失敗するリネームプロバイダ。
 *
 * ファイルロックによる復帰失敗（recover-orphans.ts の `failed` 分類）を再現する。
 * 実 FS では OS 依存のロックを移植性のある形で作れないため、プロバイダの注入で代替する。
 */
const _failingRename: RenameProvider = (oldPath: string) =>
  Promise.reject(new Deno.errors.PermissionDenied(`denied: ${oldPath}`));

/**
 * キャッシュ削除だけが恒久的に失敗するキャッシュ依存を生成する。
 *
 * `ChatlogCache.delete` は `Deno.errors.NotFound` 以外の例外を再送出するため（ChatlogCache.class.ts:281）、
 * `removeFile` を `PermissionDenied` で reject させるだけで DR-24 の「復帰は完了したがキャッシュが
 * 乖離した」状態を再現できる。エントリのシードは不要（削除前にメモリ上の削除が済んでおり、
 * 失敗は常にファイル削除側で起きる）。
 *
 * `_makeCacheDeps` は書き込み失敗しか再現できないため拡張せず、復帰専用モード専用の依存として分ける。
 * `mkdir` / `glob` / `writeTextFile` は `cache.ready` が実 I/O へ落ちないよう no-op のまま残す。
 *
 * @returns `main` へ渡すキャッシュ関連の依存
 */
const _makeDeleteFailingCacheDeps = (): StripMainDeps => ({
  cacheRoot: _CACHE_ROOT,
  cacheProviders: {
    cache: {
      mkdir: () => Promise.resolve(),
      glob: () => Promise.resolve([]),
      writeTextFile: () => Promise.resolve(),
      removeFile: (path: string) => Promise.reject(new Deno.errors.PermissionDenied(`denied: ${path}`)),
    },
  },
});

/**
 * キャッシュ初期化（`ChatlogCache.ready`）の実行有無を観測できる依存を生成する。
 *
 * `ChatlogCache` は初期化時に必ず `mkdir` を呼ぶため、その記録が空であることは
 * キャッシュ処理が 1 度も走らなかったことを意味する。存在ゲートが列挙だけでなく
 * キャッシュ初期化よりも前に評価されることの検証に使う。
 *
 * @returns `main` へ渡すキャッシュ関連の依存と、`mkdir` 要求されたパスの記録
 */
const _makeCacheMkdirSpy = (): { deps: StripMainDeps; mkdirPaths: string[] } => {
  const mkdirPaths: string[] = [];
  return {
    deps: {
      cacheRoot: _CACHE_ROOT,
      cacheProviders: {
        cache: {
          mkdir: (path: string) => {
            mkdirPaths.push(path);
            return Promise.resolve();
          },
          glob: () => Promise.resolve([]),
          writeTextFile: () => Promise.resolve(),
          removeFile: () => Promise.resolve(),
        },
      },
    },
    mkdirPaths,
  };
};

/** サマリー行から `key=value` の並びを抽出し、キー → 件数の対応表として返す。 */
const _countsOf = (summary: string): Record<string, number> =>
  Object.fromEntries(
    [...summary.matchAll(/(\w+)=(\d+)/g)].map(([, key, value]) => [key, Number(value)]),
  );

/** サマリー行（`完了` を含む info ログ）を返す。存在しない場合は空文字列。 */
const _summaryOf = (loggerStub: LoggerStub): string => loggerStub.infoLogs.find((msg) => msg.includes('完了')) ?? '';

/** `<agent> <YYYY-MM>` を与えた受理される引数列を組み立てる。 */
const _acceptedArgs = (...extra: string[]): string[] => [_AGENT, _PERIOD, ...extra];

/**
 * 対象ディレクトリのサブディレクトリに、同じファイル名のファイルを 2 件作成する。
 *
 * `ChatlogCache` のキーは拡張子なしベース名であるため、別ディレクトリの同名ファイルは
 * 同一キャッシュエントリを共有してしまう。実ファイルとして作ることで、中断時に
 * 「本体が書き換わっていない」「`.bak` が作られていない」ことを実際に観測できる。
 *
 * @param targetDir - `_setup` が返した対象ディレクトリ
 * @param dirs - 作成するサブディレクトリ名の並び
 * @param filename - 各サブディレクトリに作るファイル名（拡張子込み）
 * @returns 作成したファイルの絶対パス配列（`dirs` と同じ順）
 */
const _setupCollidingFiles = async (
  targetDir: string,
  dirs: readonly string[],
  filename: string,
): Promise<string[]> => {
  const _paths = dirs.map((dir) => `${targetDir}/${dir}/${filename}`);
  await Promise.all(dirs.map((dir) => Deno.mkdir(`${targetDir}/${dir}`, { recursive: true })));
  await Promise.all(_paths.map((path) => Deno.writeTextFile(path, _STRIPPABLE)));
  return _paths;
};

/**
 * 列挙 glob だけが指定パス一覧を返すスタブを生成する。
 *
 * 列挙結果そのものを注入することで、検査対象を衝突する 2 パスだけに限定する。
 * 退避走査（`findOrphans`）とサブディレクトリ列挙（末尾が `/` のパターン）には空配列を返し、
 * 実 FS の内容がゲートの検証へ混入しないようにする。
 *
 * @param files - 列挙結果として返すファイルパス配列
 * @returns glob プロバイダ
 */
const _makeFixedGlob = (files: readonly string[]): GlobProvider => (pattern: string) =>
  Promise.resolve(pattern.endsWith('/*.md') ? [...files] : []);

// ─── 共通セットアップ

let loggerStub: LoggerStub;

// ─── Tests

/**
 * `strip-chatlogs` の `main` の統合テストスイート。
 *
 * 受理ゲート（R-001）・通常モード（R-014）・復帰専用モード（R-015）・dry-run（REQ-F-005）・
 * サマリー（REQ-F-006）を実 FS 上で検証する。
 *
 * テスト ID 範囲: T-FL-SEP-01-01 〜 T-FL-SEP-04-09、T-FL-SEP-07-01 〜 T-FL-SEP-07-02、
 * T-FL-SEP-08-01 〜 T-FL-SEP-08-03、T-FL-SEP-09-01 〜 T-FL-SEP-09-05、T-FL-SBS-*-B（T-07 繰り越し）
 *
 * @see main
 */
describe('main (strip-chatlogs)', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
    // 実在する config.yaml を読み込ませず、chatlogsDir をテスト側から与えられる状態にする
    GlobalConfig.getInstance({ yaml: '' });
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
    GlobalConfig.resetInstance();
  });

  /**
   * R-001 受理ゲート。
   *
   * 出力先の指定と、`--input-dir` 未指定時の年月の省略を、**対象の列挙より前に**拒否する。
   * 列挙後に拒否すると未検証範囲のファイル一覧が出力に現れ、拒否の意味が失われる。
   *
   * 入力ディレクトリは他スキルと同じく `--input-dir`（および位置引数のパス）で指定でき、
   * その場合は agent / period ではなく指定されたディレクトリが対象になる。
   */
  describe('受理ゲート (R-001)', () => {
    /** `--input-dir` で対象ディレクトリを指定する受理されるケース。 */
    describe('When: 正常系', () => {
      for (const { id, label, argv } of _inputDirCases) {
        it(`[Normal] ${id}: ${label}`, async () => {
          const { tempDir, targetDir } = await _setup({ 'default.md': _STRIPPABLE });
          const _inputDir = await _setupInputDir(tempDir, { 'external.md': _STRIPPABLE });

          await main(argv(_inputDir), _makeCacheDeps().deps);

          // 指定した対象が strip される
          assertFalse(
            (await Deno.readTextFile(`${_inputDir}/external.md`)).includes('## TOPICS ASSIGNMENT RULES'),
          );
          // agent / period から解決される既定の対象は処理されない
          assertEquals(await Deno.readTextFile(`${targetDir}/default.md`), _STRIPPABLE);

          await Deno.remove(tempDir, { recursive: true });
        });
      }

      it('[Normal] T-FL-SEP-02-10: --recover-orphans でも --input-dir の対象が復帰される', async () => {
        // 既定の対象にも孤立退避を置く。置かないと rename spy の検査が override の結線に
        // よらず成立し、対象ディレクトリの取り違えを検出できない
        const { tempDir, targetDir } = await _setup({ 'default-orphan.md.bak': _PASSTHROUGH });
        const _inputDir = await _setupInputDir(tempDir, { 'external-orphan.md.bak': _PASSTHROUGH });
        const { rename, renamedPairs } = _makeRenameSpy();

        await main([_AGENT, '--input-dir', _inputDir, '--recover-orphans'], {
          ..._makeCacheDeps().deps,
          rename,
        });

        assertEquals(renamedPairs, [[
          `${_inputDir}/external-orphan.md.bak`,
          `${_inputDir}/external-orphan.md`,
        ]]);
        assert(await fileExists(`${targetDir}/default-orphan.md.bak`), '既定の対象は復帰されない');

        await Deno.remove(tempDir, { recursive: true });
      });
    });

    /** 受理範囲外の起動で実行が拒否されるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-02-01: --input-dir 未指定で年月を省略すると ChatlogError で拒否され 1 件も変更されない', async () => {
        const { tempDir, targetDir } = await _setup({ 'a.md': _STRIPPABLE });
        const _before = await Deno.readTextFile(`${targetDir}/a.md`);

        await assertRejects(
          () => main([_AGENT], _makeCacheDeps().deps),
          ChatlogError,
        );

        assertEquals(await Deno.readTextFile(`${targetDir}/a.md`), _before);
        assertFalse(await fileExists(`${targetDir}/a.md.bak`));
        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-02-06: 第 3 位置引数の出力先を指定すると ChatlogError で拒否され 1 件も変更されない', async () => {
        const { tempDir, targetDir } = await _setup({ 'a.md': _STRIPPABLE });
        const _before = await Deno.readTextFile(`${targetDir}/a.md`);

        await assertRejects(
          () => main([_AGENT, _PERIOD, _OUTPUT_DIR], _makeCacheDeps().deps),
          ChatlogError,
          'strip は出力ディレクトリの指定を受理しません',
        );

        assertEquals(await Deno.readTextFile(`${targetDir}/a.md`), _before);
        assertFalse(await fileExists(`${targetDir}/a.md.bak`));
        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-02-07: --output-dir を指定すると ChatlogError で拒否され 1 件も変更されない', async () => {
        const { tempDir, targetDir } = await _setup({ 'a.md': _STRIPPABLE });
        const _before = await Deno.readTextFile(`${targetDir}/a.md`);

        await assertRejects(
          () => main([_AGENT, _PERIOD, `--output-dir=${_OUTPUT_DIR}`], _makeCacheDeps().deps),
          ChatlogError,
          'strip は出力ディレクトリの指定を受理しません',
        );

        assertEquals(await Deno.readTextFile(`${targetDir}/a.md`), _before);
        assertFalse(await fileExists(`${targetDir}/a.md.bak`));
        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-02-03: --input-dir 未指定の年月省略時に列挙 glob が 1 度も呼ばれない（列挙より前に評価される）', async () => {
        const { tempDir } = await _setup({ 'a.md': _STRIPPABLE });
        const { glob, patterns } = _makeGlobSpy();

        await assertRejects(
          () => main([_AGENT], { ..._makeCacheDeps().deps, glob }),
          ChatlogError,
        );

        assertEquals(patterns, []);
        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * 対象ディレクトリ存在ゲート。
   *
   * 存在しないディレクトリを走査すると、件数 0 のサマリーと終了コード 0 が
   * 「本当に対象が無かった実行」と区別できなくなる。打ち間違いを沈黙で成功として
   * 報告しないため、受理ゲート（R-001）の直後・列挙とキャッシュ初期化より前に拒否する。
   */
  describe('対象ディレクトリ存在ゲート', () => {
    /** 解決された対象ディレクトリが存在しないケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-07-01: 通常モードで対象ディレクトリが無いと拒否され列挙もキャッシュ初期化も走らない', async () => {
        const { tempDir } = await _setup({ 'a.md': _STRIPPABLE });
        const { glob, patterns } = _makeGlobSpy();
        const { deps, mkdirPaths } = _makeCacheMkdirSpy();

        await assertRejects(
          () => main([_AGENT, _MISSING_PERIOD], { ...deps, glob }),
          ChatlogError,
          // 受理ゲート（R-001）の拒否と取り違えないよう、存在ゲート由来であることまで確認する
          'ディレクトリが見つかりません',
        );

        assertEquals(patterns, []);
        assertEquals(mkdirPaths, []);
        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-07-02: --recover-orphans でも対象ディレクトリが無いと拒否され復帰も走らない', async () => {
        const { tempDir } = await _setup({ 'a.md': _STRIPPABLE });
        const { glob, patterns } = _makeGlobSpy();
        const { deps, mkdirPaths } = _makeCacheMkdirSpy();
        const { rename, renamedPairs } = _makeRenameSpy();

        await assertRejects(
          () => main([_AGENT, _MISSING_PERIOD, '--recover-orphans'], { ...deps, glob, rename }),
          ChatlogError,
          // 受理ゲート（R-001）の拒否と取り違えないよう、存在ゲート由来であることまで確認する
          'ディレクトリが見つかりません',
        );

        assertEquals(renamedPairs, []);
        assertEquals(patterns, []);
        assertEquals(mkdirPaths, []);
        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * ベース名衝突ゲート。
   *
   * `ChatlogCache` のキーは拡張子なしベース名であるため、列挙結果に同名ファイルが複数あると
   * 同一エントリを共有し、先に `passthrough` を書いた側の判定によってもう一方が `done` として
   * 一切検査されなくなる。`runConcurrent` 下では実行順に依存し警告も出ないため、列挙直後に
   * fail-fast で中断する。
   */
  describe('ベース名衝突ゲート', () => {
    /** 列挙結果に拡張子なしベース名が重複するファイルが含まれるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-08-01: ベース名が重複すると ChatlogError で中断し衝突名と全パスが報告される', async () => {
        const { tempDir, targetDir } = await _setup({});
        const [_pathA, _pathB] = await _setupCollidingFiles(targetDir, ['projA', 'projB'], 'foo.md');

        const _error = await assertRejects(
          () => main(_acceptedArgs(), { ..._makeCacheDeps().deps, glob: _makeFixedGlob([_pathA, _pathB]) }),
          ChatlogError,
          // 衝突を放置した結果として起きる退避一括削除の失敗（`BackupSweepFailed`）も
          // ChatlogError かつ衝突パスを含むため、ゲート由来であることまで確認する
          'ベース名が重複しています',
        );

        // 衝突したベース名と、衝突しているファイルの全パスが揃って提示される
        assertStringIncludes(_error.message, 'foo');
        assertStringIncludes(_error.message, _pathA);
        assertStringIncludes(_error.message, _pathB);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-08-02: ベース名が重複すると本体も退避もキャッシュも書き換わらない', async () => {
        const { tempDir, targetDir } = await _setup({});
        const [_pathA, _pathB] = await _setupCollidingFiles(targetDir, ['projA', 'projB'], 'foo.md');
        const { deps, written } = _makeCacheDeps();

        await assertRejects(
          () => main(_acceptedArgs(), { ...deps, glob: _makeFixedGlob([_pathA, _pathB]) }),
          ChatlogError,
        );

        // 判定にも書き込みにも進んでいない（本体そのまま・`.bak` なし・キャッシュ記録なし）
        assertEquals(await Deno.readTextFile(_pathA), _STRIPPABLE);
        assertEquals(await Deno.readTextFile(_pathB), _STRIPPABLE);
        assertFalse(await fileExists(`${_pathA}${BAK_SUFFIX}`));
        assertFalse(await fileExists(`${_pathB}${BAK_SUFFIX}`));
        assertEquals(written, []);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-08-03: --dry-run でも中断し件数・判定明細・サマリーを 1 行も出力しない', async () => {
        const { tempDir, targetDir } = await _setup({});
        const [_pathA, _pathB] = await _setupCollidingFiles(targetDir, ['projA', 'projB'], 'foo.md');

        await assertRejects(
          () =>
            main(_acceptedArgs('--dry-run'), {
              ..._makeCacheDeps().deps,
              glob: _makeFixedGlob([_pathA, _pathB]),
            }),
          ChatlogError,
        );

        // 列挙直後に中断するため、件数報告より後の出力は一切現れない
        assertFalse(loggerStub.infoLogs.some((msg) => msg.includes('対象ファイル数')));
        assertEquals(loggerStub.dryrunLogs, []);
        assertEquals(_summaryOf(loggerStub), '');

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * 通常モード（R-014）の実行とサマリー報告（REQ-F-006）。
   *
   * 受理される起動で対象を列挙し、R-002 以降の判定カスケードを適用したうえで
   * 5 分類の件数を出力する。
   */
  describe('通常モード (R-014) とサマリー (REQ-F-006)', () => {
    /** 受理される起動で分類・集計が成立するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-01-01: 対象を列挙し R-002 以降が適用され定型部が除去される', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        // R-008 に到達したファイルは定型部が消え、境界見出し以降のみが残る
        const _stripped = await Deno.readTextFile(`${targetDir}/strip.md`);
        assertFalse(_stripped.includes('## TOPICS ASSIGNMENT RULES'));
        assertStringIncludes(_stripped, '## Summary');
        assert(await fileExists(`${targetDir}/strip.md.bak`) === false, '退避は一括削除される');

        // R-005 で passthrough としたファイルは一切変更されない
        assertEquals(await Deno.readTextFile(`${targetDir}/pass.md`), _PASSTHROUGH);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-01-02: サマリーに stripped/skipped/done/passthrough/error の 5 件数が含まれる', async () => {
        const { tempDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _summary = _summaryOf(loggerStub);
        assertStringIncludes(_summary, 'total=3');
        assertStringIncludes(_summary, 'stripped=1');
        // 通常実行のため書き込みを見送った件は無い（DR-30: dry-run と排他）
        assertStringIncludes(_summary, 'skipped=0');
        assertStringIncludes(_summary, 'done=0');
        assertStringIncludes(_summary, 'passthrough=1');
        assertStringIncludes(_summary, 'error=1');

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-01-03: 全件正常時に stripped+skipped+done+passthrough === total かつ error === 0', async () => {
        const { tempDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _summary = _summaryOf(loggerStub);
        const _countOf = (key: string): number => Number(_summary.match(new RegExp(`${key}=(\\d+)`))?.[1] ?? NaN);
        const _total = _countOf('total');

        assertEquals(
          _countOf('stripped') + _countOf('skipped') + _countOf('done') + _countOf('passthrough'),
          _total,
        );
        assertEquals(_countOf('error'), 0);
        assertEquals(_total, 2);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-01-04: dry-run の skipped が通常実行の stripped と一致し両者は排他になる', async () => {
        const _files = {
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        };

        // dry-run 実行。判定は全件について行われ、書き込みは一切発生しない
        const { tempDir: _dryDir } = await _setup(_files);
        await main(_acceptedArgs('--dry-run'), _makeCacheDeps().deps);
        const _dryCounts = _countsOf(_summaryOf(loggerStub));
        await Deno.remove(_dryDir, { recursive: true });

        // 同一入力に対する通常実行。書き込みが全件成功するため分類は dry-run と一致する
        loggerStub.restore();
        loggerStub = makeLoggerStub();
        const { tempDir: _realDir } = await _setup(_files);
        await main(_acceptedArgs(), _makeCacheDeps().deps);
        const _realCounts = _countsOf(_summaryOf(loggerStub));
        await Deno.remove(_realDir, { recursive: true });

        // 集計構造（キー集合）は両モードで一致すること
        assertEquals(Object.keys(_dryCounts).sort(), Object.keys(_realCounts).sort());

        // DR-30: dry-run の「実行すれば strip される件数」は skipped が担い、通常実行の stripped と一致する
        assertEquals(_dryCounts.skipped, _realCounts.stripped);
        assertEquals(_dryCounts.skipped, 1);

        // 両者は排他。dry-run は 1 件も書き換えず、通常実行は 1 件も見送らない
        assertEquals(_dryCounts.stripped, 0);
        assertEquals(_realCounts.skipped, 0);

        // 書き込みを伴わない分類と総数はモードに依存しない
        assertEquals(_dryCounts.done, _realCounts.done);
        assertEquals(_dryCounts.passthrough, _realCounts.passthrough);
        assertEquals(_dryCounts.error, _realCounts.error);
        assertEquals(_dryCounts.total, _realCounts.total);
        assertEquals(_dryCounts.total, 3);
      });

      it('[Normal] T-FL-SEP-01-05: サマリーの bytesBefore/bytesAfter の差が実ファイルの縮小量と一致する', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        });
        const _sizeBefore = (await Deno.stat(`${targetDir}/strip.md`)).size;

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _counts = _countsOf(_summaryOf(loggerStub));
        const _sizeAfter = (await Deno.stat(`${targetDir}/strip.md`)).size;

        // 集計は本文基準（frontmatter を除く）のため実ファイル長とは一致しないが、
        // 除去量（bytesBefore - bytesAfter）は実ファイルの縮小量から行区切り 1 バイトを
        // 引いた値と一致する（`removedBytes` は除去範囲最終行の行末終端子を含まない）
        assertEquals(_counts.bytesBefore - _counts.bytesAfter, _sizeBefore - _sizeAfter - 1);
        assert(_counts.bytesAfter > 0, `除去後も本文が残ること: ${_summaryOf(loggerStub)}`);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-01-06: dry-run の bytesBefore/bytesAfter が通常実行と一致する', async () => {
        const _files = {
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        };

        // dry-run は 1 件も書き換えないが、実行した場合の除去規模を同値で報告する
        const { tempDir: _dryDir } = await _setup(_files);
        await main(_acceptedArgs('--dry-run'), _makeCacheDeps().deps);
        const _dryCounts = _countsOf(_summaryOf(loggerStub));
        await Deno.remove(_dryDir, { recursive: true });

        loggerStub.restore();
        loggerStub = makeLoggerStub();
        const { tempDir: _realDir } = await _setup(_files);
        await main(_acceptedArgs(), _makeCacheDeps().deps);
        const _realCounts = _countsOf(_summaryOf(loggerStub));
        await Deno.remove(_realDir, { recursive: true });

        assertEquals(_dryCounts.bytesBefore, _realCounts.bytesBefore);
        assertEquals(_dryCounts.bytesAfter, _realCounts.bytesAfter);
        assert(_realCounts.bytesBefore > _realCounts.bytesAfter, '除去により本文が縮むこと');
      });
    });

    /** 除去対象を 1 件も含まない実行など、バイト数が退化するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-01-07: 除去対象が 1 件も無い実行では bytesBefore/bytesAfter が 0 になる', async () => {
        const { tempDir } = await _setup({
          'pass.md': _PASSTHROUGH,
          'broken.md': _NO_FRONTMATTER,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.bytesBefore, 0);
        assertEquals(_counts.bytesAfter, 0);

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * 孤立退避が一括削除を止めること（R-014 / R-011 / DR-23）。
   *
   * 孤立退避は `.md` を持たないため列挙されず判定カスケードに到達しない。error として
   * 計上されなければ Phase 6 の一括削除が走り、唯一の復旧材料である `.bak` が失われる。
   */
  describe('孤立退避と一括削除の保持ゲート (R-014 / R-011)', () => {
    /** 孤立退避が存在する状態で終了処理に到達するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-03-02: 孤立退避 1 件と全件成功が併存すると退避が 1 件も削除されない', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
          // 本体 `orphan.md` を伴わない孤立退避。R-014 により error として計上される
          'orphan.md.bak': _STRIPPABLE,
        });
        const { removeProvider, removedPaths } = _makeRemoveSpy();

        await main(_acceptedArgs(), { ..._makeCacheDeps().deps, removeProvider });

        // R-011: error が 1 件以上あるため退避の削除が一切行われない
        assertEquals(removedPaths, []);
        assert(await fileExists(`${targetDir}/orphan.md.bak`), '孤立退避が復旧材料として保持される');
        assert(await fileExists(`${targetDir}/strip.md.bak`), '当該実行が作った退避も保持される');

        // 孤立退避が error として計上されていること
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.error, 1);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-03-04: キャッシュ書き込み失敗 1 件が他ファイルの処理とサマリー報告を止めない', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'other.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
        });
        const { removeProvider, removedPaths } = _makeRemoveSpy();
        const { deps, written } = _makeCacheDeps('strip');

        // DD-03: 1 件の error が全件を止めない。main は reject せず Phase 6・7 へ到達する
        await main(_acceptedArgs(), { ...deps, removeProvider });

        // 失敗しなかった側は最後まで処理され、キャッシュにも記録される
        assert(written.some((path) => path.includes('other.json')), 'other.md の記録は成功する');
        const _other = await Deno.readTextFile(`${targetDir}/other.md`);
        assertFalse(_other.includes('## TOPICS ASSIGNMENT RULES'));

        // R-011: error が 1 件以上あるため退避は 1 件も削除されず復旧材料が残る
        assertEquals(removedPaths, []);
        assert(await fileExists(`${targetDir}/strip.md.bak`), '記録に失敗した側の退避が保持される');

        // Phase 7 に到達し、失敗が error として計上されている
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.total, 3);
        assertEquals(_counts.error, 1);
        assertEquals(_counts.stripped, 1);
        assertEquals(_counts.passthrough, 1);

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * dry-run の非破壊性と報告内容（REQ-F-005 / AC-007 / AC-012）。
   *
   * dry-run は 6000 件規模の破壊的書き換えに対する事前レビュー手段であるため、
   * 副作用が一切ないことと、レビューに足る内訳が出力されることの双方を要する。
   */
  describe('dry-run (REQ-F-005 / AC-007)', () => {
    /** `--dry-run` 付きで実行するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-04-07: 内容・退避・キャッシュのいずれも変化しない', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
        });
        const { deps, written, removed } = _makeCacheDeps();

        await main(_acceptedArgs('--dry-run'), deps);

        // 内容: 除去対象であっても本体が書き換わらない
        assertEquals(await Deno.readTextFile(`${targetDir}/strip.md`), _STRIPPABLE);
        assertEquals(await Deno.readTextFile(`${targetDir}/pass.md`), _PASSTHROUGH);

        // 退避: `.bak` / `.tmp` のいずれも生成されない
        assertFalse(await fileExists(`${targetDir}/strip.md.bak`));
        assertFalse(await fileExists(`${targetDir}/strip.md.tmp`));

        // キャッシュ: 記録も削除も行われない
        assertEquals(written, []);
        assertEquals(removed, []);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-04-08: Phase 3〜6 の副作用が 1 つも観測されない', async () => {
        // 本体を伴う `.bak` を混在させ、Phase 6 の削除対象が実在する状態を作る。
        //
        // 本体 `stale.md` を必ず併置するのが要点。`.bak` のみを置くと孤立退避として
        // error に計上され、R-011 の保持ゲートが通常モードでも削除を止めてしまうため、
        // 「削除されなかった」ことが dry-run の効果として観測できなくなる（偽陽性）。
        // 本体を伴えば error=0 となり、Phase 6 に到達すれば実際に削除が要求される。
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'stale.md': _PASSTHROUGH,
          'stale.md.bak': _PASSTHROUGH,
        });
        const { deps, written, removed } = _makeCacheDeps();
        const { removeProvider, removedPaths } = _makeRemoveSpy();
        const _bakBefore = await Deno.readTextFile(`${targetDir}/stale.md.bak`);

        await main(_acceptedArgs('--dry-run'), { ...deps, removeProvider });

        // Phase 3〜5: 本体書き換え・退避生成・キャッシュ記録が発生しない
        assertEquals(await Deno.readTextFile(`${targetDir}/strip.md`), _STRIPPABLE);
        assertFalse(await fileExists(`${targetDir}/strip.md.bak`));
        assertEquals(written, []);

        // 保持ゲート（R-011）が働いていないこと。error があると削除は dry-run と無関係に
        // 止まるため、この前提が崩れると以降の assert が意味を失う
        assertEquals(_countsOf(_summaryOf(loggerStub)).error, 0);

        // Phase 6: 退避の一括削除が要求されず、既存の退避も残る
        assertEquals(removedPaths, []);
        assertEquals(removed, []);
        assertEquals(await Deno.readTextFile(`${targetDir}/stale.md.bak`), _bakBefore);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-04-09: 出力にパスと判定結果が含まれ理由は error のみに付く', async () => {
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'pass.md': _PASSTHROUGH,
        });

        await main(_acceptedArgs('--dry-run'), _makeCacheDeps().deps);

        const _dryRunLogs = loggerStub.dryrunLogs.join('\n');

        // 除去対象と判定したファイル: パスと判定結果。dry-run では書き込みを見送るため
        // 判定は `skipped` になり、明細では `stripped (skip)` と表示される
        const _strippedLine = loggerStub.dryrunLogs.find((msg) => msg.includes('strip.md')) ?? '';
        assertStringIncludes(_strippedLine, `${targetDir}/strip.md`);
        assertStringIncludes(_strippedLine, 'outcome=stripped (skip)');
        // 除去を伴う判定でも理由・除去範囲・除去バイト数は明細へ出さない
        assert(!_strippedLine.includes('rule='), `error 以外に理由を出さないこと: ${_strippedLine}`);
        assert(!_strippedLine.includes('lines='), `除去範囲を出さないこと: ${_strippedLine}`);
        assert(!_strippedLine.includes('removedBytes='), `除去バイト数を出さないこと: ${_strippedLine}`);

        // 除去対象ではないファイルもパスと判定結果が報告される
        assertStringIncludes(_dryRunLogs, 'pass.md');
        assertStringIncludes(_dryRunLogs, 'outcome=passthrough');

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * 復帰専用モード（R-015 / DR-23 決定 3〜5）。
   *
   * `--recover-orphans` 指定時の `main` は Phase 0（受理ゲート）→ 復帰 → Phase 7（報告）で
   * 終了し、R-002〜R-013 を一切評価しない。中断した実行の復旧手段であるため、復帰の
   * ついでに strip が走ると復旧対象そのものが書き換わり、`.bak` という唯一の原文が失われる。
   */
  describe('復帰専用モード (R-015)', () => {
    /** `--recover-orphans` 付きで実行するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-04-02: 除去対象が併存しても strip されず分類サマリーも出力されない', async () => {
        // 孤立退避（復帰対象）と除去対象を同居させる。復帰専用モードが実行フェーズ 2〜6 へ
        // 進むと `strip.md` が書き換わるため、「復帰だけを行う」ことが観測できる配置になる
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'orphan.md.bak': _PASSTHROUGH,
        });
        const { deps, written } = _makeCacheDeps();
        const { rename, renamedPairs } = _makeRenameSpy();

        await main(_acceptedArgs('--recover-orphans'), { ...deps, rename });

        // 復帰は行われる（このモードが no-op でないことの前提。崩れると以降が偽陽性になる）
        assertEquals(renamedPairs, [[`${targetDir}/orphan.md.bak`, `${targetDir}/orphan.md`]]);
        assertEquals(await Deno.readTextFile(`${targetDir}/orphan.md`), _PASSTHROUGH);

        // R-002〜R-013 に到達しない: 除去対象が書き換わらず、退避も生成されない
        assertEquals(await Deno.readTextFile(`${targetDir}/strip.md`), _STRIPPABLE);
        assertFalse(await fileExists(`${targetDir}/strip.md.bak`));
        assertFalse(await fileExists(`${targetDir}/strip.md.tmp`));

        // 処理済み記録も行われない（Phase 3〜5 を通らない）
        assertEquals(written, []);

        // 分類を行わないため REQ-F-006 の分類件数は出力しない。
        // `_summaryOf` は `完了` を含む行を拾うため復帰専用の報告行にも一致する。
        // ここで見たいのは「分類件数が出ていないこと」なので分類キーの不在で判定する。
        // `skipped` は検査キーに含めない。復帰専用の報告行も `skipped=` を持つため、
        // 加えると復帰専用モードが正しく動いていても不在検査が破れる（DR-30）
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(
          ['total', 'stripped', 'done', 'passthrough'].filter((key) => key in _counts),
          [],
        );

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-04-05: 年月を省略すると受理ゲートで拒否され復帰も行われない', async () => {
        // 年月省略時に解決されるのは `<tempDir>/originalLogs/<agent>` である。この agent 直下に
        // 孤立退避を置くことで、ゲートを飛ばした場合に確実に復帰が走る状態を作る
        // （置かないと rename spy の assert がゲートの有無によらず成立し無意味になる）。
        // 列挙は `findFiles` により再帰的であり、`_setup` が作る `<YYYY>/<YYYY-MM>/` 配下も
        // 走査対象に入る。ゲートの検証はそこに依存しない
        const { tempDir } = await _setup({ 'a.md': _STRIPPABLE });
        const _agentDir = `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/${_AGENT}`;
        await Deno.writeTextFile(`${_agentDir}/orphan.md.bak`, _PASSTHROUGH);
        const { rename, renamedPairs } = _makeRenameSpy();

        await assertRejects(
          () => main([_AGENT, '--recover-orphans'], { ..._makeCacheDeps().deps, rename }),
          ChatlogError,
        );

        // 復帰専用モードでも Phase 0 は評価される（DR-23 決定 5）
        assertEquals(renamedPairs, []);
        assert(await fileExists(`${_agentDir}/orphan.md.bak`), '拒否時は復帰元が保持される');
        assertFalse(await fileExists(`${_agentDir}/orphan.md`));

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Edge] T-FL-SEP-04-06: --dry-run と併用すると復帰せず対象件数とパスの報告にとどまる', async () => {
        // `.bak` を持つ孤立と、`.tmp` 単独のファイルを併置する。後者は孤立として
        // 検出されないため（DR-26）、報告件数は前者のみとなる。dry-run の件数は
        // 実行時の recovered と一致していなければならない
        const { tempDir, targetDir } = await _setup({
          'strip.md': _STRIPPABLE,
          'orphan.md.bak': _PASSTHROUGH,
          'orphan2.md.tmp': _PASSTHROUGH,
        });
        const { rename, renamedPairs } = _makeRenameSpy();

        await main(_acceptedArgs('--recover-orphans', '--dry-run'), {
          ..._makeCacheDeps().deps,
          rename,
        });

        // 復帰は 1 件も実行されず、退避も本体も動かない
        assertEquals(renamedPairs, []);
        assert(await fileExists(`${targetDir}/orphan.md.bak`));
        assertFalse(await fileExists(`${targetDir}/orphan.md`));
        assert(await fileExists(`${targetDir}/orphan2.md.tmp`));
        assertFalse(await fileExists(`${targetDir}/orphan2.md`));
        assertEquals(await Deno.readTextFile(`${targetDir}/strip.md`), _STRIPPABLE);

        // 復帰対象は `.bak` を持つ 1 件のみ（実行時の recovered と一致する）
        const _logs = [...loggerStub.infoLogs, ...loggerStub.dryrunLogs].join('\n');
        const _counts = _countsOf(loggerStub.infoLogs.find((msg) => msg.includes('復帰対象')) ?? '');
        assertEquals(_counts.recovered, 1);
        // dry-run では復帰を行わないため、復帰予定の全件が skipped として立つ
        assertEquals(_counts.skipped, 1);

        // 復帰対象のパスは提示され、検出対象外の `.tmp` は現れない
        assertStringIncludes(_logs, `${targetDir}/orphan.md.bak`);
        assertFalse(_logs.includes(`${targetDir}/orphan2.md.tmp`));

        await Deno.remove(tempDir, { recursive: true });
      });
    });

    /** 復帰は成立するがキャッシュ削除が失敗するケース（DR-24）。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-03-05: キャッシュ削除失敗が error に計上され main 層が失敗パスのみを報告する', async () => {
        const { tempDir, targetDir } = await _setup({ 'orphan.md.bak': _PASSTHROUGH });
        const { rename, renamedPairs } = _makeRenameSpy();
        const _orphanPath = `${targetDir}/orphan.md`;

        // DR-33: error > 0 の復帰専用モードは非成功終了する。報告は throw に先行するため
        // （DR-20 決定 3）、以降の報告内容の assert は reject 後もそのまま成立する
        await assertRejects(
          () => main(_acceptedArgs('--recover-orphans'), { ..._makeDeleteFailingCacheDeps(), rename }),
          ChatlogError,
        );

        // 復帰そのものは成立している（崩れると以降の assert が偽陽性になる）
        assertEquals(renamedPairs, [[`${targetDir}/orphan.md.bak`, _orphanPath]]);

        // DR-24: 復帰は完了したがキャッシュが乖離したため error として計上される
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.recovered, 1);
        assertEquals(_counts.error, 1);
        // 通常実行では復帰を実際に行うため skipped は 0（SKILL.md の報告形式に一致させる）
        assertEquals(_counts.skipped, 0);

        // main 層の最終 error 一覧。モジュール層の個別失敗詳細（`キャッシュ削除に失敗しました:`）とは
        // 別行であるため、接頭辞ではなく行全体の一致で判定する
        assert(
          loggerStub.errorLogs.includes(`${LOGGER_TEXT.INDENT}キャッシュ削除に失敗: ${_orphanPath}`),
          `main 層の error 一覧に失敗パスが含まれること: ${loggerStub.errorLogs.join(' | ')}`,
        );

        // 復帰したパスの列挙は `recoverOrphans` の責務であり、main 層は再出力しない
        assert(
          loggerStub.infoLogs.includes(`${LOGGER_TEXT.INDENT}復帰しました: ${_orphanPath}`),
          `モジュール層が復帰パスを報告すること: ${loggerStub.infoLogs.join(' | ')}`,
        );
        assertFalse(
          loggerStub.infoLogs.includes(`${LOGGER_TEXT.INDENT}復帰: ${_orphanPath}`),
          `main 層は復帰パスを再出力しないこと: ${loggerStub.infoLogs.join(' | ')}`,
        );

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-03-06: 復帰リネーム失敗も error として非成功終了し報告は throw に先行する', async () => {
        // キャッシュ削除失敗と並ぶもう 1 つの error 経路。復帰そのものが成立しないため
        // `recovered` は加算されず、`error` だけが立つ（recover-orphans.ts の `failed` 分類）
        const { tempDir, targetDir } = await _setup({ 'orphan.md.bak': _PASSTHROUGH });

        await assertRejects(
          () =>
            main(_acceptedArgs('--recover-orphans'), {
              ..._makeCacheDeps().deps,
              rename: _failingRename,
            }),
          ChatlogError,
        );

        // 復帰は成立していない（退避が残り本体は生まれない）
        assert(await fileExists(`${targetDir}/orphan.md.bak`));
        assertFalse(await fileExists(`${targetDir}/orphan.md`));

        // 報告は throw より前に出る（DR-20 決定 3）
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.recovered, 0);
        assertEquals(_counts.error, 1);

        await Deno.remove(tempDir, { recursive: true });
      });
    });

    /** 復帰が全件成功するケース。error を 1 件も出さない実行は成功終了しなければならない。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-03-07: error が 0 件の復帰は正常終了する', async () => {
        const { tempDir, targetDir } = await _setup({ 'orphan.md.bak': _PASSTHROUGH });
        const { rename, renamedPairs } = _makeRenameSpy();

        // reject しないこと自体が検証対象。throw されれば `it` がそのまま失敗する
        await main(_acceptedArgs('--recover-orphans'), { ..._makeCacheDeps().deps, rename });

        assertEquals(renamedPairs, [[`${targetDir}/orphan.md.bak`, `${targetDir}/orphan.md`]]);
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.recovered, 1);
        assertEquals(_counts.error, 0);

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });

  /**
   * サブツリーの再帰走査。
   *
   * classify-chatlogs がログをプロジェクト別サブディレクトリへ移動するため、対象ディレクトリ
   * 直下の `.md` は実データでは 0 件になる。列挙・孤立退避の検出・退避の一括削除の 3 者が
   * 揃って再帰的でなければ、到達しないか復旧材料を失うかのいずれかになる。
   */
  describe('サブディレクトリの再帰走査', () => {
    /** 対象がサブディレクトリ配下にのみ存在するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-09-01: サブディレクトリ配下（深さ 2 を含む）の .md が列挙され除去される', async () => {
        const { tempDir, targetDir } = await _setup({
          'projA/strip.md': _STRIPPABLE,
          'projB/nested/deep.md': _STRIPPABLE,
          'projB/nested/pass.md': _PASSTHROUGH,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _stripped = await Deno.readTextFile(`${targetDir}/projA/strip.md`);
        assertFalse(_stripped.includes('## TOPICS ASSIGNMENT RULES'));
        const _deep = await Deno.readTextFile(`${targetDir}/projB/nested/deep.md`);
        assertFalse(_deep.includes('## TOPICS ASSIGNMENT RULES'));
        assertEquals(await Deno.readTextFile(`${targetDir}/projB/nested/pass.md`), _PASSTHROUGH);

        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.total, 3);
        assertEquals(_counts.stripped, 2);
        assertEquals(_counts.passthrough, 1);

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Normal] T-FL-SEP-09-02: サブディレクトリの stripped でも R-013 の包含検査が成立し退避が削除される', async () => {
        // 列挙だけを再帰化して退避の探索を直下に残すと、ここで全件 missing となり
        // `BackupMissing` で sweep が中止される（退避が残り続ける）
        const { tempDir, targetDir } = await _setup({ 'projA/strip.md': _STRIPPABLE });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        // 退避が作られた（= 判定 stripped が成立した）ことを件数で押さえないと、
        // 列挙 0 件で `.bak` が存在しないだけの実行と区別できない
        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.stripped, 1);
        assertEquals(_counts.error, 0);
        assertFalse(
          await fileExists(`${targetDir}/projA/strip.md${BAK_SUFFIX}`),
          'サブディレクトリの退避も一括削除の対象になること',
        );

        await Deno.remove(tempDir, { recursive: true });
      });
    });

    /** サブディレクトリ配下に孤立退避が残っているケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-09-03: サブディレクトリ配下の孤立退避が error に計上され退避が保持される', async () => {
        // 孤立退避の検出だけを直下に残すと error が 0 件となり、R-011 の保持ゲートを
        // 通過した R-010 が復旧材料である `.bak` を削除してしまう
        const { tempDir, targetDir } = await _setup({
          'projA/strip.md': _STRIPPABLE,
          'projB/orphan.md.bak': _PASSTHROUGH,
        });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.error, 1);
        assert(await fileExists(`${targetDir}/projB/orphan.md.bak`), '孤立退避は保持される');
        assert(
          await fileExists(`${targetDir}/projA/strip.md${BAK_SUFFIX}`),
          'error があるため当該実行の退避も保持される',
        );

        await Deno.remove(tempDir, { recursive: true });
      });

      it('[Error] T-FL-SEP-09-04: --recover-orphans がサブディレクトリ配下の孤立退避を復帰する', async () => {
        const { tempDir, targetDir } = await _setup({ 'projA/nested/orphan.md.bak': _PASSTHROUGH });
        const { rename, renamedPairs } = _makeRenameSpy();

        await main(_acceptedArgs('--recover-orphans'), { ..._makeCacheDeps().deps, rename });

        assertEquals(renamedPairs, [[
          `${targetDir}/projA/nested/orphan.md.bak`,
          `${targetDir}/projA/nested/orphan.md`,
        ]]);
        assertEquals(_countsOf(_summaryOf(loggerStub)).recovered, 1);

        await Deno.remove(tempDir, { recursive: true });
      });
    });

    /** 走査対象に空のサブディレクトリが含まれるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-09-05: 空のサブディレクトリがあっても完走する', async () => {
        const { tempDir, targetDir } = await _setup({ 'projA/strip.md': _STRIPPABLE });
        await Deno.mkdir(`${targetDir}/empty/nested`, { recursive: true });

        await main(_acceptedArgs(), _makeCacheDeps().deps);

        const _counts = _countsOf(_summaryOf(loggerStub));
        assertEquals(_counts.total, 1);
        assertEquals(_counts.stripped, 1);
        assertEquals(_counts.error, 0);

        await Deno.remove(tempDir, { recursive: true });
      });
    });
  });
});
