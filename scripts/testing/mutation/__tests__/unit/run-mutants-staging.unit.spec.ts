// src: scripts/testing/mutation/__tests__/unit/run-mutants-staging.unit.spec.ts
// @(#): run-mutants のステージング失敗系のユニットテスト
//       対象: runMutants
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runMutants } from '../../run-mutants.ts';

// ─── Helpers
import { existsSync } from '@std/fs';
import { join, resolve, toFileUrl } from '@std/path';
import { makeLoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';
import type {
  Mutant,
  RunMutantsOptions,
  TestRunnerProvider,
  TestRunOptions,
  TestRunOutcome,
} from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 変異させる元ファイル `target.ts` の中身。 */
const _TARGET_SOURCE = 'export const f = (n: number) => n > 0;\n';

/** 元の設定 `deno.jsonc` の中身。 */
const _BASE_CONFIG = '{ "imports": { "@std/assert": "jsr:@std/assert@^1" } }';

/** コメントと末尾カンマを含む (JSON としては読めない) 元の設定 `deno.jsonc` の中身。 */
const _JSONC_CONFIG =
  '{ // 設定\n "imports": { "@std/assert": "jsr:@std/assert@^1", },\n "tasks": { "test": "deno test" },\n}';

/** 変異体が生き残る (テストが全件成功する) テスト実行結果。 */
const _SURVIVED: TestRunOutcome = { kind: 'exited', code: 0, stdout: 'ok | 1 passed | 0 failed', stderr: '' };

/** 1 件目の変異体ファイルの名前。 */
const _MUTANT_001 = 'target.mutation-001.ts';

/** 1 件目の一時設定の名前。 */
const _CONFIG_001 = 'deno.mutation-001.json';

// types
/** runner の 1 回の呼び出しで受け取った引数。 */
type _RunnerCall = {
  /** runner に渡した `deno` の引数。 */
  args: string[];
  /** runner に渡した実行の制限時間と中断信号。 */
  options: TestRunOptions;
};

// functions
/**
 * `path` に空でないディレクトリ (中に `keep.txt` を 1 件置く) を作る。
 * 同じパスへのファイルの書き出し・削除を失敗させるために使う。
 *
 * @param path - 作るディレクトリのパス
 */
const _makeNonEmptyDir = async (path: string): Promise<void> => {
  await Deno.mkdir(path);
  await Deno.writeTextFile(join(path, 'keep.txt'), 'keep');
};

/**
 * `path` のファイルが存在すればその中身を、存在しなければ `null` を返す。
 *
 * @param path - 読むファイルのパス
 * @returns ファイルの中身、またはファイルが無ければ `null`
 */
const _readTextOrNull = async (path: string): Promise<string | null> =>
  existsSync(path) ? await Deno.readTextFile(path) : null;

/**
 * `dir` 内のファイルを `file:` URL にする。一時設定の `imports` のキー・値と比べるために使う。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param name - `dir` 内のファイル名
 * @returns ファイルの `file:` URL
 */
const _fileUrl = (dir: string, name: string): string => toFileUrl(resolve(join(dir, name))).href;

/**
 * 引数に関わらず、指定のテスト実行結果を返す runner スタブを作る。
 * 実プロセスは起動しない (unit runner は `--allow-run` を持たない)。
 *
 * @param outcome - runner が返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRunnerStub = (outcome: TestRunOutcome): TestRunnerProvider => () => Promise.resolve(outcome);

/**
 * 呼び出しごとに引数・オプションを記録し、`inner` に処理を委ねる runner スタブを作る。実プロセスは起動しない。
 *
 * @param calls - 呼び出しごとに記録を足す先
 * @param inner - 結果を返す runner スタブ (既定は `_SURVIVED` を返すスタブ)
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRecordingRunnerStub = (
  calls: _RunnerCall[],
  inner: TestRunnerProvider = _makeRunnerStub(_SURVIVED),
): TestRunnerProvider =>
(args: string[], options: TestRunOptions) => {
  calls.push({ args: [...args], options });
  return inner(args, options);
};

/**
 * 1 回目の呼び出し中だけ `mutantPath` の変異体ファイルを空でないディレクトリに置き換え、
 * 毎回 `_SURVIVED` を返す runner スタブを作る。後始末の削除を失敗させるために使う。実プロセスは起動しない。
 *
 * @param mutantPath - 置き換える変異体ファイルのパス
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeDirReplacingRunnerStub = (mutantPath: string): TestRunnerProvider => {
  let _call = 0;
  return async () => {
    _call += 1;
    if (_call === 1) {
      await Deno.remove(mutantPath);
      await _makeNonEmptyDir(mutantPath);
    }
    return _SURVIVED;
  };
};

/**
 * 呼び出しごとに `capture()` の値 (呼び出し時点のファイルの中身など) を記録し、
 * `_SURVIVED` を返す runner スタブを作る。実プロセスは起動しない。
 *
 * @param captured - 呼び出しごとに捕捉した値を足す先
 * @param capture - 呼び出し時点で評価する捕捉関数
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeCapturingRunnerStub = <T>(captured: T[], capture: () => Promise<T>): TestRunnerProvider => async () => {
  captured.push(await capture());
  return _SURVIVED;
};

/**
 * logger をスタブした状態で処理を実行し、終了後 (例外時も) にスタブを解除する。
 *
 * @param action - logger 出力を捕捉したい処理
 * @returns 捕捉した出力を持つ `LoggerStub` (解除済み)
 */
const _withLoggerStub = async (action: () => Promise<unknown>): Promise<LoggerStub> => {
  const _loggerStub = makeLoggerStub();
  try {
    await action();
  } finally {
    _loggerStub.restore();
  }
  return _loggerStub;
};

/**
 * `dir` の `target.ts` 1 行目の `>` を置き換える変異体を作る。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param after - 置換後の字句 (既定は `>=`)
 * @returns `target.ts` の 1 行 35 桁を対象とする変異体
 */
const _m = (dir: string, after = '>='): Mutant => ({
  file: join(dir, 'target.ts'),
  line: 1,
  column: 35,
  op: 'relational',
  before: '>',
  after,
  lineText: 'export const f = (n: number) => n > 0;',
});

/**
 * `dir` の `deno.jsonc` を元の設定とする、既定の実行オプションを作る。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param extra - 既定値を上書き・追加するオプション
 * @returns `runMutants` の実行オプション
 */
const _opts = (dir: string, extra: Partial<RunMutantsOptions> = {}): RunMutantsOptions => ({
  configPath: join(dir, 'deno.jsonc'),
  testArgs: ['test', '--allow-read'],
  timeoutMs: 30000,
  ...extra,
});

// ─── Tests

/**
 * `runMutants` のステージング失敗系のユニットテストスイート。
 *
 * 変異体ファイル・一時設定を用意できない変異体を `error` として記録し、テストを起動しないことを検証する
 * (execution R-214 / R-215 / R-216 / R-225)。
 *
 * @see runMutants
 */
describe('runMutants', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await Deno.makeTempDir({ prefix: 'run-mutants-staging-' });
    await Deno.writeTextFile(join(dir, 'target.ts'), _TARGET_SOURCE);
    await Deno.writeTextFile(join(dir, 'deno.jsonc'), _BASE_CONFIG);
  });

  afterEach(async () => {
    await Deno.remove(dir, { recursive: true });
  });

  /**
   * 置換前の字句が指定位置に無い変異体は、書き出さず起動もせず `error` とする (execution R-214 / DD-09)。
   */
  describe('置換前の字句が指定位置に無い', () => {
    /** 変異体の `before` が元ファイルの指定位置の字句と一致しない異常ケース。 */
    describe('When: 異常系', () => {
      it("[Error] T-MUT-RM-05-01: before '<' (位置は '>') → 判定は error / runner の呼び出しは 0 回 / target.mutation-001.ts と deno.mutation-001.json が無い", async () => {
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants(
          [{ ..._m(dir, '<='), before: '<' }],
          _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }),
        );

        assertEquals(_result.results.map((r) => r.status), ['error']);
        assertEquals(_calls.length, 0);
        assertEquals(existsSync(join(dir, _MUTANT_001)), false);
        assertEquals(existsSync(join(dir, _CONFIG_001)), false);
      });

      it("[Error] T-MUT-RM-05-02: before '<' (位置は '>') → 書き出さなかった変異体ファイル・一時設定は leftovers に現れない", async () => {
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants(
          [{ ..._m(dir, '<='), before: '<' }],
          _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }),
        );

        assertEquals(_result.leftovers, []);
      });
    });
  });

  /**
   * 変異体ファイルを書き出せない変異体は、テストを起動せず `error` とする (execution R-219)。
   */
  describe('変異体ファイルの書き出し失敗', () => {
    /** 変異体ファイルのパスに空でないディレクトリがあり、書き出しが失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RM-08-01: target.mutation-001.ts が空でないディレクトリ → 判定は error / runner の呼び出しは 0 回', async () => {
        await _makeNonEmptyDir(join(dir, _MUTANT_001));
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_result.results.map((r) => r.status), ['error']);
        assertEquals(_calls.length, 0);
      });
    });
  });

  /**
   * 前回の残骸と同名の変異体ファイル・一時設定があれば上書きせず、テストを起動せず `error` とする
   * (execution R-219 / implementation §3.4)。
   */
  describe('前回の残骸と同名の通常ファイルがある', () => {
    /** 変異体ファイルまたは一時設定のパスに通常ファイルが既にある異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: { id: string; label: string; name: string; content: string }[] = [
        {
          id: 'T-MUT-RM-14-01',
          label:
            '既存の target.mutation-001.ts ("stale") → 判定は error / runner の呼び出しは 0 回 / 既存ファイルの内容は "stale" のまま残る',
          name: _MUTANT_001,
          content: 'stale',
        },
        {
          id: 'T-MUT-RM-14-02',
          label:
            '既存の deno.mutation-001.json ("{}") → 判定は error / runner の呼び出しは 0 回 / 既存の一時設定の内容は "{}" のまま残る',
          name: _CONFIG_001,
          content: '{}',
        },
      ];

      for (const { id, label, name, content } of _cases) {
        it(`[Error] ${id}: ${label}`, async () => {
          const _stalePath = join(dir, name);
          await Deno.writeTextFile(_stalePath, content);
          const _calls: _RunnerCall[] = [];

          const _result = await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

          assertEquals(_result.results.map((r) => r.status), ['error']);
          assertEquals(_calls.length, 0);
          assertEquals(await _readTextOrNull(_stalePath), content);
        });
      }
    });
  });

  /**
   * 削除できなかった変異体ファイル・一時設定は `leftovers` に集め、次の変異体へ進む (execution R-226 / DD-05)。
   */
  describe('後始末の削除失敗', () => {
    /** runner の実行中に変異体ファイルが空でないディレクトリに置き換わり、削除が失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RM-09-01: 1 回目の呼び出し中に target.mutation-001.ts を空でないディレクトリ化 → leftovers に target.mutation-001.ts / runner の呼び出しは 2 回', async () => {
        const _mutantPath = join(dir, _MUTANT_001);
        const _calls: _RunnerCall[] = [];
        const _runner = _makeRecordingRunnerStub(_calls, _makeDirReplacingRunnerStub(_mutantPath));

        // 削除失敗の警告は本ケースの検証対象外のため、logger をスタブして出力を抑える
        let _leftovers: string[] = [];
        await _withLoggerStub(async () => {
          _leftovers = (await runMutants([_m(dir, '>='), _m(dir, '<')], _opts(dir, { testRunner: _runner }))).leftovers;
        });

        assertEquals(_leftovers.includes(_mutantPath), true);
        assertEquals(_calls.length, 2);
      });

      it('[Error] T-MUT-RM-09-02: 呼び出し中に target.mutation-001.ts を空でないディレクトリ化 → target.mutation-001.ts を含む警告を出す', async () => {
        const _mutantPath = join(dir, _MUTANT_001);

        const _loggerStub = await _withLoggerStub(() =>
          runMutants([_m(dir)], _opts(dir, { testRunner: _makeDirReplacingRunnerStub(_mutantPath) }))
        );

        assertEquals(_loggerStub.warnLogs.some((msg) => msg.includes(_mutantPath)), true);
      });
    });
  });

  /**
   * 一時設定を書き出せない変異体は、テストを起動せず `error` とし、書き出し済みの変異体ファイルを削除する
   * (execution R-219 / R-225)。
   */
  describe('一時設定の書き出し失敗', () => {
    /** 一時設定のパスに空でないディレクトリがあり、書き出しが失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RM-15-01: deno.mutation-001.json が空でないディレクトリ → 判定は error / runner の呼び出しは 0 回 / target.mutation-001.ts が無い', async () => {
        await _makeNonEmptyDir(join(dir, _CONFIG_001));
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_result.results.map((r) => r.status), ['error']);
        assertEquals(_calls.length, 0);
        assertEquals(existsSync(join(dir, _MUTANT_001)), false);
      });
    });
  });

  /**
   * 変異体ファイルは元ファイルの改行コードを加工せずに書き出す (execution R-215 / REQ-NF-004)。
   */
  describe('書き出しで改行コードを保つ', () => {
    /** 元ファイルの改行コードが CRLF のエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-16-01: CRLF の target.ts → runner 呼び出し時の target.mutation-001.ts は CRLF をバイト単位で保つ', async () => {
        await Deno.writeTextFile(
          join(dir, 'target.ts'),
          'export const f = (n: number) => n > 0;\r\nexport const g = 1;\r\n',
        );
        const _mutantBytes: Uint8Array[] = [];
        const _runner = _makeCapturingRunnerStub(_mutantBytes, () => Deno.readFile(join(dir, _MUTANT_001)));

        await runMutants([_m(dir, '>=')], _opts(dir, { testRunner: _runner }));

        assertEquals(_mutantBytes, [
          new TextEncoder().encode('export const f = (n: number) => n >= 0;\r\nexport const g = 1;\r\n'),
        ]);
      });
    });
  });

  /**
   * 元の設定は JSONC として読み、全キーを保ったまま JSON の一時設定に書き出す (execution R-216 / DD-02)。
   */
  describe('JSONC の元の設定', () => {
    /** 元の設定にコメントと末尾カンマがあるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-17-01: コメント + 末尾カンマの deno.jsonc → 一時設定は JSON として読め、tasks / imports の元の値を保ち、元ファイル → 変異体ファイルの対応が加わる', async () => {
        await Deno.writeTextFile(join(dir, 'deno.jsonc'), _JSONC_CONFIG);
        const _configs: unknown[] = [];
        const _runner = _makeCapturingRunnerStub(
          _configs,
          async (): Promise<unknown> => JSON.parse(await Deno.readTextFile(join(dir, _CONFIG_001))),
        );

        await runMutants([_m(dir)], _opts(dir, { testRunner: _runner }));

        assertEquals(_configs, [{
          imports: { '@std/assert': 'jsr:@std/assert@^1', [_fileUrl(dir, 'target.ts')]: _fileUrl(dir, _MUTANT_001) },
          tasks: { test: 'deno test' },
        }]);
      });
    });
  });
});
