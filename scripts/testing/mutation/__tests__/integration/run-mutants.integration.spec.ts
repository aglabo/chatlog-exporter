// src: scripts/testing/mutation/__tests__/integration/run-mutants.integration.spec.ts
// @(#): 実際の deno test で変異体を実行する run-mutants の統合テスト
//       対象: runMutants
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runMutants } from '../../run-mutants.ts';

// ─── Helpers
import { join } from '@std/path';
import { generateMutants } from '../../generate-mutants.ts';
import { detectDrift, hashSources } from '../../run-safety.ts';
// types
import type { Mutant, MutantStatus, RunMutantsResult } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** `runMutants` に渡す変異体 1 件あたりの制限時間 (ミリ秒)。子プロセスの起動と型検査に十分な長さにする。 */
const _TIMEOUT_MS = 60_000;

/** fixture の `deno.json`。`@std/assert` をリポジトリと同じ版に解決させる。 */
const _FIXTURE_CONFIG = JSON.stringify({ imports: { '@std/assert': 'jsr:@std/assert@^1.0.19' } }, null, 2) + '\n';

/** 変異対象のソース。1 行目の `isPositive` だけがテストから呼ばれ、2 行目の `isLarge` はどのテストも触れない。 */
const _POSITIVE_SOURCE =
  'export const isPositive = (n: number) => n > 0;\nexport const isLarge = (n: number) => n > 100;\n';

/** `_POSITIVE_SOURCE` の改行コードを CRLF にしたソース。 */
const _POSITIVE_SOURCE_CRLF = _POSITIVE_SOURCE.replaceAll('\n', '\r\n');

/** `isPositive` の境界 (0 は正でない、1 は正) を検証するテスト。`./target.ts` を import する。 */
const _POSITIVE_TEST = `import { assertEquals } from '@std/assert';
import { isPositive } from './target.ts';

Deno.test('isPositive', () => {
  assertEquals(isPositive(0), false);
  assertEquals(isPositive(1), true);
});
`;

/** 型注釈が値をリテラル型 `true` に固定するソース。値の `true` を `false` に変えた変異体は型検査で落ちる。 */
const _FLAG_SOURCE = 'export const FLAG: true = true;\n';

/** `FLAG` が `true` であることを検証するテスト。`./target.ts` を import する。 */
const _FLAG_TEST = `import { assertEquals } from '@std/assert';
import { FLAG } from './target.ts';

Deno.test('FLAG', () => {
  assertEquals(FLAG, true);
});
`;

/**
 * `./target.ts` を import せず、`Deno.readTextFile` で文字列として読んで `n > 0` を含むことを検証するテスト。
 * パスはテスト自身の位置から解決する。
 */
const _READ_SOURCE_TEST = `import { assert } from '@std/assert';

Deno.test('target.ts contains n > 0', async () => {
  const _text = await Deno.readTextFile(new URL('./target.ts', import.meta.url));
  assert(_text.includes('n > 0'));
});
`;

// types
/** `_writeFixture` に渡す fixture の内容。省略したキーは既定値を使う。 */
interface _FixtureSpec {
  /** `target.ts` の内容 (既定: `_POSITIVE_SOURCE`) */
  source?: string;
  /** `target.test.ts` の内容 (既定: `_POSITIVE_TEST`) */
  test?: string;
  /** fixture を置くサブディレクトリ名。省略時は親ディレクトリ直下に置く */
  dirName?: string;
}

/** `_writeFixture` が書き出した fixture のパス (すべて絶対パス)。 */
interface _Fixture {
  /** fixture のディレクトリ */
  dir: string;
  /** 変異対象のソース `target.ts` */
  targetPath: string;
  /** テストファイル `target.test.ts` */
  testPath: string;
  /** fixture の `deno.json` */
  configPath: string;
  /** `target.ts` に書き出したソース */
  source: string;
}

// functions
/**
 * 一時ディレクトリに `target.ts` / `target.test.ts` / `deno.json` を書き出す。
 *
 * @param baseDir - テストごとの一時ディレクトリ
 * @param spec - ソース・テスト・サブディレクトリ名の指定
 * @returns 書き出した fixture のパスとソース
 */
const _writeFixture = async (baseDir: string, spec: _FixtureSpec = {}): Promise<_Fixture> => {
  const { source = _POSITIVE_SOURCE, test = _POSITIVE_TEST, dirName } = spec;
  const _dir = dirName === undefined ? baseDir : join(baseDir, dirName);
  await Deno.mkdir(_dir, { recursive: true });
  const _fixture: _Fixture = {
    dir: _dir,
    targetPath: join(_dir, 'target.ts'),
    testPath: join(_dir, 'target.test.ts'),
    configPath: join(_dir, 'deno.json'),
    source,
  };
  await Promise.all([
    Deno.writeTextFile(_fixture.targetPath, source),
    Deno.writeTextFile(_fixture.testPath, test),
    Deno.writeTextFile(_fixture.configPath, _FIXTURE_CONFIG),
  ]);
  return _fixture;
};

/**
 * fixture のソースから条件に合う変異体を 1 件だけ選ぶ。ちょうど 1 件でなければ前提違反として失敗させる。
 *
 * @param fixture - 変異対象の fixture
 * @param predicate - 変異体の選択条件
 * @returns 選ばれた変異体を 1 件だけ含む配列
 */
const _selectMutant = (fixture: _Fixture, predicate: (m: Mutant) => boolean): Mutant[] => {
  const _mutants = generateMutants(fixture.source, fixture.targetPath).filter(predicate);
  assertEquals(_mutants.length, 1, 'precondition: exactly one mutant must match');
  return _mutants;
};

/**
 * 変異体を既定の runner (実際の `deno test`) で実行する。
 * `--config` は `runMutants` が差し込むため、`testArgs` には付けない。
 *
 * @param fixture - 変異対象の fixture
 * @param mutants - 実行する変異体
 * @returns `runMutants` の結果
 */
const _runFixtureMutants = (fixture: _Fixture, mutants: Mutant[]): Promise<RunMutantsResult> =>
  runMutants(mutants, {
    configPath: fixture.configPath,
    testArgs: ['test', '--allow-read', fixture.testPath],
    timeoutMs: _TIMEOUT_MS,
  });

/**
 * 変異体 1 件の実行が中断されずに終わり、その状態が期待どおりであることを検証する。
 *
 * @param result - `runMutants` の結果
 * @param expected - 変異体に期待する状態
 */
const _assertSingleStatus = (result: RunMutantsResult, expected: MutantStatus): void => {
  assertEquals(result.results.length, 1);
  assertEquals(result.results[0].status, expected);
  assertEquals(result.interrupted, false);
};

/** 変異体の実行が作る成果物 (変異体ファイル `*.mutation-*.ts` と一時設定 `deno.mutation-*.json`) の名前。 */
const _ARTIFACT_PATTERN = /(\.mutation-.+\.ts|^deno\.mutation-.+\.json)$/;

/**
 * ディレクトリ直下にある変異体の成果物を名前順に列挙する。子の deno が作る `deno.lock` は成果物ではないので含めない。
 *
 * @param dir - 調べるディレクトリ
 * @returns 成果物のファイル名 (名前順)
 */
const _listArtifacts = async (dir: string): Promise<string[]> =>
  (await Array.fromAsync(Deno.readDir(dir)))
    .map((entry) => entry.name)
    .filter((name) => _ARTIFACT_PATTERN.test(name))
    .sort();

// cases
/** 差し替え検証のケース。`_POSITIVE_SOURCE` の指定行にある `>` → `>=` の変異体を実行し、期待する状態を示す。 */
const _swapCases: { id: string; input: string; line: number; expected: MutantStatus }[] = [
  {
    id: 'T-MUT-MTI-01-01',
    input: 'isPositive の `>` → `>=` を isPositive(0) のテストで実行',
    line: 1,
    expected: 'killed',
  },
  { id: 'T-MUT-MTI-01-02', input: 'テストが呼ばない isLarge の `>` → `>=` を実行', line: 2, expected: 'survived' },
];

/**
 * 移植性のケース。fixture の書き方 (改行コード・置き場所) だけを変え、isPositive の `>` → `>=` を実行する。
 * `precondition` は fixture がそのケースの条件を本当に満たしていることを、実行前に確かめる。
 */
const _portabilityCases: {
  id: string;
  input: string;
  spec: _FixtureSpec;
  precondition: (fixture: _Fixture, mutant: Mutant) => void;
  expected: MutantStatus;
}[] = [
  {
    id: 'T-MUT-MTI-04-01',
    input: 'CRLF の target.ts で isPositive の `>` → `>=` を実行',
    spec: { source: _POSITIVE_SOURCE_CRLF },
    precondition: (fixture, mutant) => {
      assert(fixture.source.includes('\r\n'), 'precondition: the source must use CRLF line endings');
      assert(!mutant.lineText.endsWith('\r'), 'precondition: lineText must not keep a trailing CR');
    },
    expected: 'killed',
  },
  {
    id: 'T-MUT-MTI-04-02',
    input: '空白を含むディレクトリの target.ts で isPositive の `>` → `>=` を実行',
    spec: { dirName: 'dir with space' },
    precondition: (fixture) => {
      assert(fixture.dir.includes(' '), 'precondition: the fixture directory path must contain a space');
    },
    expected: 'killed',
  },
];

// ─── Tests

/**
 * `runMutants` の統合テストスイート。
 *
 * 一時ディレクトリの fixture に対し、実際の `deno test` で変異体を実行する。
 *
 * @see runMutants
 */
describe('runMutants', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'run-mutants-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 一時設定の `imports` で元ソースを変異体へ差し替え、テストが変異体を読むことを検証する。
   *
   * @see DD-08
   * @see DR-01
   * @see R-216
   * @see R-220
   * @see REQ-F-003
   * @see REQ-F-004
   * @see AC-004
   */
  describe('When: 差し替えた変異体をテストが読む', () => {
    for (const { id, input, line, expected } of _swapCases) {
      it(`[Normal] ${id}: ${input} → ${expected}`, async () => {
        const _fixture = await _writeFixture(tempDir);
        const _mutants = _selectMutant(_fixture, (m) => m.op === 'relational' && m.line === line);

        const _result = await _runFixtureMutants(_fixture, _mutants);

        _assertSingleStatus(_result, expected);
      });
    }
  });

  /**
   * 変異体の実行が fixture を汚さないことを検証する。
   * 元ソースは実行前後の内容ハッシュの突合で、変異体ファイルと一時設定は実行後のディレクトリ列挙で確かめる。
   *
   * @see R-212
   * @see R-225
   * @see REQ-F-006
   * @see REQ-F-008
   * @see REQ-NF-001
   * @see AC-003
   * @see AC-007
   * @see AC-009
   */
  describe('When: 変異体を実行した後の fixture を調べる', () => {
    it('[Normal] T-MUT-MTI-02-01: isPositive の `>` → `>=` を実行した前後の target.ts → drift 0 件', async () => {
      const _fixture = await _writeFixture(tempDir);
      const _mutants = _selectMutant(_fixture, (m) => m.op === 'relational' && m.line === 1);
      const _before = await hashSources([_fixture.targetPath]);

      const _result = await _runFixtureMutants(_fixture, _mutants);
      assertEquals(_result.results.length, 1, 'precondition: the mutant must have run');
      const _after = await hashSources([_fixture.targetPath]);

      assertEquals(detectDrift(_before, _after), []);
    });

    it('[Normal] T-MUT-MTI-02-02: isPositive の `>` → `>=` を実行した後の fixture → 成果物 0 件、leftovers 空', async () => {
      const _fixture = await _writeFixture(tempDir);
      const _mutants = _selectMutant(_fixture, (m) => m.op === 'relational' && m.line === 1);

      const _result = await _runFixtureMutants(_fixture, _mutants);
      assertEquals(_result.results.length, 1, 'precondition: the mutant must have run');

      assertEquals(await _listArtifacts(_fixture.dir), []);
      assertEquals(_result.leftovers, []);
    });
  });

  /**
   * 型検査で落ちた変異体を、テストが検出した変異体 (killed) と区別して compile-error に分類することを検証する。
   *
   * @see R-221
   * @see DD-03
   * @see DR-02
   * @see AC-005
   */
  describe('When: 型検査が通らない変異体を実行する', () => {
    it('[Error] T-MUT-MTI-03-01: FLAG: true の値 `true` → `false` を実行 → compile-error (killed ではない)', async () => {
      const _fixture = await _writeFixture(tempDir, { source: _FLAG_SOURCE, test: _FLAG_TEST });
      const _mutants = _selectMutant(_fixture, (m) => m.op === 'boolean' && m.column === 27);

      const _result = await _runFixtureMutants(_fixture, _mutants);

      _assertSingleStatus(_result, 'compile-error');
    });
  });

  /**
   * 改行コードや置き場所が異なる fixture でも、差し替えが効いて変異体がテストに読まれることを検証する。
   *
   * @see R-215
   * @see R-216
   * @see REQ-NF-004
   */
  describe('When: 改行コードや置き場所が異なる fixture で変異体を実行する', () => {
    for (const { id, input, spec, precondition, expected } of _portabilityCases) {
      it(`[Edge] ${id}: ${input} → ${expected}`, async () => {
        const _fixture = await _writeFixture(tempDir, spec);
        const _mutants = _selectMutant(_fixture, (m) => m.op === 'relational' && m.line === 1);
        precondition(_fixture, _mutants[0]);

        const _result = await _runFixtureMutants(_fixture, _mutants);

        _assertSingleStatus(_result, expected);
      });
    }
  });

  /**
   * 差し替えは import 経由でのみ効き、ソースをファイルとして読むテストには届かないことを検証する。
   * 検出されるべき変異体が survived に残るこの前提が、report-cli の警告の根拠になる。
   *
   * @see DD-08
   * @see DR-01
   * @see R-613
   */
  describe('When: ソースを import せず文字列として読むテストで変異体を実行する', () => {
    it('[Edge] T-MUT-MTI-05-01: readTextFile で target.ts を読むテストで isPositive の `>` → `>=` を実行 → survived', async () => {
      const _fixture = await _writeFixture(tempDir, { test: _READ_SOURCE_TEST });
      const _mutants = _selectMutant(_fixture, (m) => m.op === 'relational' && m.line === 1);

      const _result = await _runFixtureMutants(_fixture, _mutants);

      _assertSingleStatus(_result, 'survived');
    });
  });
});
