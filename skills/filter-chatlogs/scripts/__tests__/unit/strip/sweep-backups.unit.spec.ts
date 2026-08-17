// src: scripts/__tests__/unit/strip/sweep-backups.unit.spec.ts
// @(#): strip 退避一括削除（R-010〜R-013）のユニットテスト
//       対象: sweepBackups
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { sweepBackups } from '../../../modules/strip/sweep-backups.ts';

// ─── Helpers
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// helpers
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { GlobProvider, RemoveProvider } from '../../../../../_cle-libs/types/providers.types.ts';
// constants
import { LOGGER_TEXT } from '../../../../../_cle-libs/constants/logger.constants.ts';

// ─── Internal Helpers

// constants

/** テスト対象ディレクトリ。`normalizePath` 済みの形（ドライブレター大文字・スラッシュ区切り）で与える。 */
const _DIR = 'W:/temp/strip';

/** 並列度そのものを検証しないケースで渡す既定の並列度。ゲート・包含検査・報告の結果は並列度に依存しない。 */
const _CONCURRENCY = 4;

// types

/** `_makeRemoveProvider` が返す削除プロバイダと、その呼び出し履歴。 */
interface _RemoveSpy {
  /** `removeFile` に注入する削除プロバイダ。 */
  provider: RemoveProvider;
  /** 削除を試行したパスを呼び出し順に記録した配列。 */
  calls: string[];
}

/** `_makeLatchedRemoveProvider` が返す削除プロバイダと、同時実行数の観測手段。 */
interface _LatchedRemoveSpy extends _RemoveSpy {
  /** 観測された同時実行数の最大値を返す。 */
  maxInFlight: () => number;
  /** 保留中の削除を解放し続け、`total` 件が解放されるか打ち切り回数に達するまで待つ。 */
  releaseAll: (total: number) => Promise<void>;
}

// functions

/**
 * 退避一覧を返す fake `GlobProvider` と、受け取った glob パターンの記録配列を生成する。
 *
 * `findFilesFlat` は `_defaultGlob` のときだけ `normalizePath` を適用するため（find-files.ts:34）、
 * 注入側で正規化済みのパスを返す責務を負う。ここでは `normalizePath` を明示的に通し、
 * 期待退避パスの構成規則（`` `${strippedPath}.bak` ``）と同じ正規化基準に揃える。
 * `map((path) => normalizePath(path))` の形を保つこと（`map(normalizePath)` は
 * 添字が第 2 引数 `env` に渡ってしまう）。
 *
 * `patterns` は探索対象ディレクトリと拡張子の受け渡しを検証するために記録する。
 * これを見ないと、実装が `.bak` ではなく `.md` を列挙していても全ケースが通ってしまう。
 *
 * @param backups - この glob が返す退避パス一覧
 * @returns 正規化済みの `backups` を返す `GlobProvider` と、渡された glob パターンの記録
 */
const _makeGlobSpy = (backups: string[]): { glob: GlobProvider; patterns: string[] } => {
  const patterns: string[] = [];
  const glob: GlobProvider = (pattern: string) => {
    patterns.push(pattern);
    return Promise.resolve(backups.map((path) => normalizePath(path)));
  };
  return { glob, patterns };
};

/** 退避一覧のみを返す fake `GlobProvider`（glob パターンを検証しないケース用）。 */
const _makeGlob = (backups: string[]): GlobProvider => _makeGlobSpy(backups).glob;

/**
 * 1 つのディレクトリ実体からパターン末尾の一致でファイルを絞り込む fake `GlobProvider` を生成する。
 *
 * `_makeGlobSpy` はパターンを無視して固定配列を返すため、渡さなかったファイルは
 * 絞り込みの有無にかかわらず結果に現れず「無関係な `.bak` を削除しないこと」を検証できない。
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
 * 削除試行を記録し、指定パスだけを失敗させる `RemoveProvider` を生成する。
 *
 * 既定の失敗は `Deno.errors.PermissionDenied`（ファイル I/O エラー）で表す。
 * `removeFile` は `isFileIoError` に該当しない例外を `throwFileIoError: false` でも
 * 再 throw するため（remove-utils.ts:63-64）、file-I/O エラーだけでは
 * 「例外が `sweepBackups` の外へ漏れない」という DD-03 の no-throw 契約を検証できない。
 * 非 file-I/O エラーを注入するには `errorFactory` を渡す。
 *
 * @param failPaths - 削除に失敗させるパスの集合
 * @param errorFactory - 失敗時に reject する例外を生成する関数（省略時は `PermissionDenied`）
 * @returns 削除プロバイダと呼び出し履歴
 */
const _makeRemoveProvider = (
  failPaths: string[] = [],
  errorFactory: (path: string) => Error = (path) => new Deno.errors.PermissionDenied(`permission denied: ${path}`),
): _RemoveSpy => {
  const calls: string[] = [];
  const _failSet = new Set(failPaths);
  const provider: RemoveProvider = (path: string) => {
    calls.push(path);
    return _failSet.has(path) ? Promise.reject(errorFactory(path)) : Promise.resolve();
  };
  return { provider, calls };
};

/**
 * 削除を保留したまま同時実行数を観測する `RemoveProvider` を生成する。
 *
 * `Promise.resolve()` で即時解決するプロバイダでは、次の呼び出しの前に必ず 1 件目が
 * 完了してしまうため同時実行数が観測できず、逐次実装と並列実装を区別できない。
 * ここでは呼び出しごとに未解決の `Promise` を返して in-flight を積み上げ、
 * `releaseAll` が解放するまで保留する。
 *
 * @returns 削除プロバイダ・呼び出し履歴・同時実行数の最大値・保留の解放関数
 */
const _makeLatchedRemoveProvider = (): _LatchedRemoveSpy => {
  const calls: string[] = [];
  const _pending: (() => void)[] = [];
  let _inFlight = 0;
  let _maxInFlight = 0;
  let _released = 0;

  const provider: RemoveProvider = (path: string) => {
    calls.push(path);
    _inFlight++;
    _maxInFlight = Math.max(_maxInFlight, _inFlight);
    return new Promise<void>((resolve) => {
      _pending.push(() => {
        _inFlight--;
        _released++;
        resolve();
      });
    });
  };

  const releaseAll = async (total: number): Promise<void> => {
    // 解放は「保留の発生を待つ → 解放する」を繰り返す逐次処理であり高階関数へ置き換えられない。
    // 打ち切りが無いと、呼び出しが total 件へ届かない実装でテストが失敗せずハングする
    for (let i = 0; _released < total && i <= total; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      _pending.splice(0).forEach((release) => release());
    }
  };

  return { provider, calls, maxInFlight: () => _maxInFlight, releaseAll };
};

/** 戻り値が `ChatlogError` であることを表明し、型を絞り込む。 */
const _assertChatlogError = (error: ChatlogError | undefined): ChatlogError => {
  assert(error instanceof ChatlogError, `expected ChatlogError, got: ${error}`);
  return error;
};

/**
 * `sweepBackups` の仮引数名を宣言順に取り出す。
 *
 * 引数の有無そのものが仕様（`stats` / `dryRun` を受け取らないこと）であるため、
 * 個数だけでは `options` と `dryRun` を区別できない。関数ソースの仮引数リストを
 * 直接読み取って名前で照合する。
 *
 * @returns 仮引数名の配列（例: `['targetDir', 'strippedPaths', 'errorCount', 'options']`）
 */
const _parameterNames = (): string[] => {
  const _source = sweepBackups.toString();
  const _params = _source.slice(_source.indexOf('(') + 1, _source.indexOf(')'));
  return _params.split(',').map((param) => param.trim().split(/[\s=:]/)[0]).filter((name) => name.length > 0);
};

// ─── Tests

/**
 * `sweepBackups` のユニットテストスイート。
 *
 * 全ファイル評価後の Phase 6（退避の一括削除）を検証する。
 * R-011（error 時は全保持）→ R-013（包含検査）→ R-010（一括削除）→ R-012（削除失敗の報告）
 * の順序でゲートが働くことを、`glob` / `removeProvider` の注入により実 I/O なしで確認する。
 *
 * テスト ID 範囲: T-FL-SBS-01-01 〜 T-FL-SBS-04-05 / T-FL-SBS-05-01 / T-FL-SBS-06-01 〜 T-FL-SBS-06-03 /
 * T-FL-SBS-07-01 〜 T-FL-SBS-07-04 / T-FL-SBS-08-01 〜 T-FL-SBS-08-03
 *
 * @see sweepBackups
 */
describe('sweepBackups', () => {
  /**
   * R-010 の一括削除の検証。
   *
   * error 0 件かつ包含が成立するとき、対象ディレクトリ配下の `.bak` が
   * 当該実行の産物か否かを問わず全件削除されることを確認する。
   */
  describe('退避の一括削除', () => {
    /** error 0 件・包含成立で削除が実行されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SBS-01-01: error 0・包含成立で配下の .bak が全件削除される', async () => {
        const _stripped = [`${_DIR}/a.md`, `${_DIR}/b.md`];
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`];
        const { provider, calls } = _makeRemoveProvider();
        const { glob, patterns } = _makeGlobSpy(_backups);

        const error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, { glob, removeProvider: provider });

        assertEquals(error, undefined);
        assertEquals(calls.sort(), _backups.toSorted());
        // 対象ディレクトリ直下の `.bak` のみを列挙すること（`.md` を列挙すると本体を削除してしまう）
        assertEquals(patterns, [`${_DIR}/*.md.bak`]);
      });

      it('[Normal] T-FL-SBS-01-02: 当該実行が作らなかった退避（前回中断の残骸）も削除される', async () => {
        // stripped は a.md のみ。zombie.md.bak は前回実行が残した孤立退避で、今回の産物ではない
        const _stripped = [`${_DIR}/a.md`];
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/zombie.md.bak`];
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        assertEquals(error, undefined);
        assert(calls.includes(`${_DIR}/zombie.md.bak`));
        assertEquals(calls.length, 2);
      });

      it('[Normal] T-FL-SBS-01-03: stripped 0 件（done/passthrough のみ）でも削除が実行される', async () => {
        // 全件 done/passthrough の実行でも、残存する退避は掃除の対象になる
        const _backups = [`${_DIR}/leftover.md.bak`];
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        assertEquals(error, undefined);
        assertEquals(calls, _backups);
      });
    });
  });

  /**
   * R-011 の保持ゲートと R-012 の削除失敗報告の検証。
   *
   * error が 1 件でもあれば削除自体を行わず、削除に失敗した退避があれば
   * 中断せず全件試行した上で件数とパスを報告することを確認する。
   */
  describe('error 発生時の保持と削除失敗の報告', () => {
    /** 削除がゲートされる、または削除が失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SBS-02-01: errorCount>=1 なら removeProvider が 1 度も呼ばれない', async () => {
        const _stripped = [`${_DIR}/a.md`];
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, _stripped, 1, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/a.md.bak`]),
          removeProvider: provider,
        });

        // 退避を全保持するため正常終了し、削除は一切試行されない
        assertEquals(error, undefined);
        assertEquals(calls, []);
      });

      it('[Error] T-FL-SBS-02-02: 削除 2 件失敗で件数 2 と対象パスが ChatlogError.message に載る', async () => {
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`, `${_DIR}/c.md.bak`];
        const _failed = [`${_DIR}/a.md.bak`, `${_DIR}/c.md.bak`];
        const { provider } = _makeRemoveProvider(_failed);

        const error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        const _error = _assertChatlogError(error);
        assertEquals(_error.subindex, 'BackupSweepFailed');
        // 失敗件数を括弧付きで照合する（素の '2' はパス中の任意の数字にも一致してしまう）
        assertStringIncludes(_error.message, '(2)');
        _failed.forEach((path) => assertStringIncludes(_error.message, path));
      });

      it('[Error] T-FL-SBS-02-03: 削除失敗があれば戻り値が ChatlogError になる', async () => {
        // 終了コードは main 側の責務のため、ChatlogError を返すことを観測可能な代理として検証する
        const { provider } = _makeRemoveProvider([`${_DIR}/a.md.bak`]);

        const error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/a.md.bak`]),
          removeProvider: provider,
        });

        assert(_assertChatlogError(error) instanceof ChatlogError);
      });

      it('[Error] T-FL-SBS-02-04: 5 件中 2 件目が失敗しても残り全件の削除が試行される', async () => {
        const _backups = [1, 2, 3, 4, 5].map((n) => `${_DIR}/f${n}.md.bak`);
        const { provider, calls } = _makeRemoveProvider([`${_DIR}/f2.md.bak`]);

        await sweepBackups(_DIR, [], 0, _CONCURRENCY, { glob: _makeGlob(_backups), removeProvider: provider });

        // 失敗で中断しないため、全 5 件が試行される
        assertEquals(calls.toSorted(), _backups.toSorted());
      });

      it('[Error] T-FL-SBS-02-05: 削除失敗が分類件数を変えない（stats を受け取らない）', () => {
        // sweepBackups は stats を引数に取らないため、削除失敗が
        // stripped/done/passthrough/error の分類へ波及する経路が構造的に存在しない
        assert(!_parameterNames().includes('stats'), `stats を受け取っている: ${_parameterNames()}`);
      });
    });
  });

  /**
   * R-013 の包含検査の検証。
   *
   * `{ stripped と判定したパス } ⊆ { 存在する退避のパス }` が破れているとき、
   * 削除を一切行わず不足パスを報告することを確認する。
   */
  describe('包含検査', () => {
    /** stripped と計上したのに退避を持たないファイルが存在するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SBS-03-01: 包含不成立なら退避が 1 件も削除されない', async () => {
        // b.md は stripped だが b.md.bak が存在しない（復旧手段のない状態）
        const _stripped = [`${_DIR}/a.md`, `${_DIR}/b.md`];
        const { provider, calls } = _makeRemoveProvider();

        await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/a.md.bak`]),
          removeProvider: provider,
        });

        assertEquals(calls, []);
      });

      it('[Error] T-FL-SBS-03-02: 包含不成立なら不足する退避パスが報告される', async () => {
        const _stripped = [`${_DIR}/a.md`, `${_DIR}/b.md`];
        const { provider } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/a.md.bak`]),
          removeProvider: provider,
        });

        const _error = _assertChatlogError(error);
        assertEquals(_error.subindex, 'BackupMissing');
        assertStringIncludes(_error.message, `${_DIR}/b.md.bak`);
      });

      it('[Error] T-FL-SBS-03-03: 包含不成立なら戻り値が ChatlogError になる', async () => {
        const { provider } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, [`${_DIR}/b.md`], 0, _CONCURRENCY, {
          glob: _makeGlob([]),
          removeProvider: provider,
        });

        assert(_assertChatlogError(error) instanceof ChatlogError);
      });
    });
  });

  /**
   * 包含検査の境界条件と、その前提となるパス正規化の検証。
   *
   * 件数比較ではなく集合の包含で判定すること、大小文字を変換せずに
   * 完全一致で照合することを確認する。
   */
  describe('包含検査の境界とパス正規化', () => {
    /** 件数不一致・大小文字違い・正規化前提などの境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SBS-04-01: 退避 5 件 vs stripped 3 件でも包含が成立し削除される', async () => {
        // 件数比較なら不成立になるが、包含は成立するため削除が実行される
        const _backups = [1, 2, 3, 4, 5].map((n) => `${_DIR}/f${n}.md.bak`);
        const _stripped = [1, 2, 3].map((n) => `${_DIR}/f${n}.md`);
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        assertEquals(error, undefined);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });

      it('[Edge] T-FL-SBS-04-02: Foo.md stripped で退避が foo.md.bak のみなら包含不成立', async () => {
        // 大小文字を畳んで照合すると誤って成立してしまうケース
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, [`${_DIR}/Foo.md`], 0, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/foo.md.bak`]),
          removeProvider: provider,
        });

        assertEquals(_assertChatlogError(error).subindex, 'BackupMissing');
        assertEquals(calls, []);
      });

      it('[Edge] T-FL-SBS-04-03: 不足報告のパスが大小文字を変換しない原形である', async () => {
        const { provider } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, [`${_DIR}/Foo.md`], 0, _CONCURRENCY, {
          glob: _makeGlob([`${_DIR}/foo.md.bak`]),
          removeProvider: provider,
        });

        const _message = _assertChatlogError(error).message;
        // 原形 `Foo.md.bak` が報告され、小文字化された形は報告されない
        assertStringIncludes(_message, `${_DIR}/Foo.md.bak`);
        assert(!_message.includes(`${_DIR}/foo.md.bak`));
      });

      it('[Edge] T-FL-SBS-04-05: normalizePath がドライブレターのみ大文字化しファイル名の case を保持する', () => {
        // DR-25 の前提: 期待退避パスの構成規則と findFilesFlat の正規化基準が一致すること
        assertEquals(normalizePath(String.raw`c:\Dir\File.md`), 'C:/Dir/File.md');
        // 構成した `${path}.bak` が、正規化済みの退避一覧と完全一致で照合できる
        const _stripped = normalizePath(String.raw`c:\Dir\File.md`);
        const _backups = new Set([normalizePath(String.raw`c:\Dir\File.md.bak`)]);
        assert(_backups.has(`${_stripped}.bak`));
      });

      it('[Edge] T-FL-SBS-04-04: sweepBackups のシグネチャが dryRun を持たない', () => {
        // Phase 3〜6 は dry-run 時に main がスキップする設計のため、
        // フェーズ内部に dryRun 分岐を置かない（呼ばれた以上は必ず削除を試行する）
        assertEquals(_parameterNames(), ['targetDir', 'strippedPaths', 'errorCount', 'concurrency', 'options']);
      });
    });
  });

  /**
   * 削除対象を `.md` 由来の退避に限定することの検証（DR-23 決定 1・3）。
   *
   * 一括削除は退避一覧を無条件に消すため、`.md` 由来でない `.bak` を列挙してしまうと
   * strip と無関係なファイルを破壊する。
   */
  describe('対象外ファイルの除外', () => {
    /** `.md` 由来でない退避風ファイルが同一ディレクトリに混在するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SBS-05-01: .md 由来でない notes.bak は削除対象に含まれない', async () => {
        // notes.bak はエディタ等の産物であり strip の退避ではない。
        // 列挙してしまうと無関係なファイルを無条件に削除する
        const { provider, calls } = _makeRemoveProvider();
        const glob = _makeDirGlob([`${_DIR}/a.md`, `${_DIR}/a.md.bak`, `${_DIR}/notes.bak`]);

        const error = await sweepBackups(_DIR, [`${_DIR}/a.md`], 0, _CONCURRENCY, { glob, removeProvider: provider });

        assertEquals(error, undefined);
        assertEquals(calls, [`${_DIR}/a.md.bak`]);
      });
    });
  });

  /**
   * 当該実行に由来しない退避の警告報告の検証（DR-34 / AC-025）。
   *
   * 一括削除は退避一覧の全件に及ぶため、当該実行の `stripped` が作ったのではない退避も
   * 巻き込んで消える。削除そのものは仕様どおり（DR-08 決定 2）だが、利用者が
   * 「何が消えたか」を後から知る手段が無いため、削除の前に件数とパスを警告として報告する。
   */
  describe('当該実行に由来しない退避の報告', () => {
    /** 退避一覧が期待退避パス集合と一致し、報告すべき対象が無いケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SBS-06-01: 退避がすべて stripped 由来なら警告が出ない', async () => {
        const _stripped = [`${_DIR}/a.md`, `${_DIR}/b.md`];
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`];
        const { provider, calls } = _makeRemoveProvider();
        const loggerStub = makeLoggerStub();

        let error: ChatlogError | undefined;
        try {
          error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
            glob: _makeGlob(_backups),
            removeProvider: provider,
          });
        } finally {
          loggerStub.restore();
        }

        assertEquals(loggerStub.warnLogs, []);
        // 警告が出ないことだけでは実装の不在と区別できないため、削除が行われたことも併せて確認する
        assertEquals(error, undefined);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });
    });

    /** 期待退避パス集合に含まれない退避が混在するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SBS-06-02: stripped に含まれない退避の件数とパスが警告される', async () => {
        // orphan.md.bak は当該実行の stripped 由来ではない。a.md.bak は由来するため報告されない
        const _stripped = [`${_DIR}/a.md`];
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/orphan.md.bak`];
        const { provider, calls } = _makeRemoveProvider();
        const loggerStub = makeLoggerStub();

        let error: ChatlogError | undefined;
        try {
          error = await sweepBackups(_DIR, _stripped, 0, _CONCURRENCY, {
            glob: _makeGlob(_backups),
            removeProvider: provider,
          });
        } finally {
          loggerStub.restore();
        }

        // 全行を完全一致で照合する。部分一致では「退避を全件 foreign として報告する」実装も通ってしまう
        assertEquals(loggerStub.warnLogs, [
          '当該実行の stripped に由来しない退避を削除します（1 件）',
          `${LOGGER_TEXT.INDENT}foreign: ${_DIR}/orphan.md.bak`,
        ]);
        // 報告は削除範囲を変えない（stripped 由来も含め退避全件を削除する）
        assertEquals(error, undefined);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });

      it('[Edge] T-FL-SBS-06-03: stripped 0 件でも残存退避が警告され削除される', async () => {
        // 全件 done/passthrough の実行では期待退避パス集合が空になり、残存退避は全件が foreign になる
        const _backups = [`${_DIR}/leftover.md.bak`];
        const { provider, calls } = _makeRemoveProvider();
        const loggerStub = makeLoggerStub();

        let error: ChatlogError | undefined;
        try {
          error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, {
            glob: _makeGlob(_backups),
            removeProvider: provider,
          });
        } finally {
          loggerStub.restore();
        }

        assertEquals(loggerStub.warnLogs, [
          '当該実行の stripped に由来しない退避を削除します（1 件）',
          `${LOGGER_TEXT.INDENT}foreign: ${_DIR}/leftover.md.bak`,
        ]);
        // 報告は削除をゲートしない（警告のうえで削除は実行される）
        assertEquals(error, undefined);
        assertEquals(calls, _backups);
      });
    });
  });

  /**
   * DD-03 の no-throw 契約の検証。
   *
   * `removeFile` は `isFileIoError` に該当しない例外を `throwFileIoError: false` でも
   * 再 throw するため（remove-utils.ts:63-64）、削除ループが例外を捕捉しないと
   * 非 file-I/O エラーが `sweepBackups` の外へ漏れる。漏れると呼び出し側（`_processFiles`）が
   * `ChatlogError` を受け取れず、報告順序と終了コードの決定（`main` の責務）が成立しない。
   *
   * 併せて R-012（1 件の失敗で中断せず全件試行）が維持されることを確認する。
   */
  describe('no-throw 契約の担保', () => {
    /** 削除が非 file-I/O エラーで失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SBS-07-01: 非 file-I/O 例外でも throw せず BackupSweepFailed を返す', async () => {
        const { provider } = _makeRemoveProvider([`${_DIR}/a.md.bak`], () => new TypeError('boom'));

        const error = await sweepBackups(_DIR, [], 0, 1, {
          glob: _makeGlob([`${_DIR}/a.md.bak`]),
          removeProvider: provider,
        });

        const _error = _assertChatlogError(error);
        assertEquals(_error.kind, 'FailFast');
        assertEquals(_error.subindex, 'BackupSweepFailed');
      });

      it('[Error] T-FL-SBS-07-02: 非 file-I/O 失敗でも中断せず全件試行し detail は失敗分のみ', async () => {
        const _backups = [1, 2, 3, 4, 5].map((n) => `${_DIR}/f${n}.md.bak`);
        const _failed = [`${_DIR}/f2.md.bak`, `${_DIR}/f4.md.bak`];
        const { provider, calls } = _makeRemoveProvider(_failed, () => new TypeError('boom'));

        const error = await sweepBackups(_DIR, [], 0, 2, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        // R-012: 1 件の失敗で残タスクを中断しない（best-effort を維持する）
        assertEquals(calls.toSorted(), _backups.toSorted());
        const _message = _assertChatlogError(error).message;
        assertStringIncludes(_message, '(2)');
        _failed.forEach((path) => assertStringIncludes(_message, path));
        // 成功した退避は失敗として報告しない
        [1, 3, 5].forEach((n) => assert(!_message.includes(`${_DIR}/f${n}.md.bak`), `成功分が報告された: f${n}`));
      });

      it('[Error] T-FL-SBS-07-04: 捕捉した例外が該当パスとメッセージ付きで error 報告される', async () => {
        const { provider } = _makeRemoveProvider([`${_DIR}/a.md.bak`], () => new TypeError('boom'));
        const loggerStub = makeLoggerStub();

        try {
          await sweepBackups(_DIR, [], 0, 1, {
            glob: _makeGlob([`${_DIR}/a.md.bak`]),
            removeProvider: provider,
          });
        } finally {
          loggerStub.restore();
        }

        // 完全一致で照合する。部分一致では per-item 報告を欠き集約行しか出さない実装も通ってしまう
        assertEquals(loggerStub.errorLogs, [
          `${LOGGER_TEXT.INDENT}削除失敗 (boom): ${_DIR}/a.md.bak`,
          '退避の削除に失敗しました（1 件）',
          `${LOGGER_TEXT.INDENT}failed: ${_DIR}/a.md.bak`,
        ]);
      });
    });

    /** file-I/O エラーと非 file-I/O エラーが同一実行に混在するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SBS-07-03: file-I/O と非 file-I/O の失敗が同一経路で合流する', async () => {
        // a は removeFile が false を返す経路、b は removeFile が再 throw する経路を通る
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`, `${_DIR}/c.md.bak`];
        const { provider, calls } = _makeRemoveProvider(
          [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`],
          (path) =>
            path === `${_DIR}/b.md.bak` ? new TypeError('boom') : new Deno.errors.PermissionDenied(`denied: ${path}`),
        );

        const error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, {
          glob: _makeGlob(_backups),
          removeProvider: provider,
        });

        const _message = _assertChatlogError(error).message;
        assertStringIncludes(_message, '(2)');
        assertStringIncludes(_message, `${_DIR}/a.md.bak`);
        assertStringIncludes(_message, `${_DIR}/b.md.bak`);
        assert(!_message.includes(`${_DIR}/c.md.bak`), `成功分が報告された: c.md.bak`);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });
    });
  });

  /**
   * `concurrency` の尊重の検証。
   *
   * 退避の一括削除は対象ディレクトリ配下の全件に及ぶため、無制限に並列化すると
   * 6000 件規模の実行でファイルハンドルを使い切る。`concurrency` は同時実行数の
   * **上限**であり、件数がそれを下回る場合は件数で頭打ちになる。
   */
  describe('並列度の尊重', () => {
    /** 退避件数が `concurrency` を上回るケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SBS-08-01: concurrency=2 で 5 件を削除しても同時実行は 2 を超えない', async () => {
        const _backups = [1, 2, 3, 4, 5].map((n) => `${_DIR}/f${n}.md.bak`);
        const { provider, calls, maxInFlight, releaseAll } = _makeLatchedRemoveProvider();

        const _sweep = sweepBackups(_DIR, [], 0, 2, { glob: _makeGlob(_backups), removeProvider: provider });
        await releaseAll(_backups.length);
        const error = await _sweep;

        // 上限に「達する」ことも併せて表明する。`<= 2` では逐次実装（最大 1）も通ってしまう
        assertEquals(maxInFlight(), 2);
        assertEquals(error, undefined);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });
    });

    /** 退避件数が `concurrency` を下回るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SBS-08-02: concurrency=8 で 2 件なら同時実行が件数で頭打ちになる', async () => {
        const _backups = [`${_DIR}/a.md.bak`, `${_DIR}/b.md.bak`];
        const { provider, calls, maxInFlight, releaseAll } = _makeLatchedRemoveProvider();

        const _sweep = sweepBackups(_DIR, [], 0, 8, { glob: _makeGlob(_backups), removeProvider: provider });
        await releaseAll(_backups.length);
        const error = await _sweep;

        // `concurrency` は上限であって下限ではない
        assertEquals(maxInFlight(), 2);
        assertEquals(error, undefined);
        assertEquals(calls.toSorted(), _backups.toSorted());
      });

      it('[Edge] T-FL-SBS-08-03: 退避 0 件でも例外を出さず正常終了する', async () => {
        const { provider, calls } = _makeRemoveProvider();

        const error = await sweepBackups(_DIR, [], 0, _CONCURRENCY, { glob: _makeGlob([]), removeProvider: provider });

        assertEquals(error, undefined);
        assertEquals(calls, []);
      });
    });
  });
});
