// src: scripts/testing/mutation/__tests__/unit/resolve-targets.unit.spec.ts
// @(#): resolveTargets のユニットテスト
//       対象: resolveTargets, isMutationArtifact
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertArrayIncludes, assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { isMutationArtifact, type MutateModule, resolveTargets } from '../../resolve-targets.ts';

// ─── Helpers
import { dirname, join } from '@std/path';

// ─── Internal Helpers

// constants
/** 疑似リポジトリに置くファイル (リポジトリルート相対)。対象外モジュールのファイルも混ぜる。 */
const _FIXTURE_FILES: readonly string[] = [
  'skills/_cle-libs/libs/sample.ts',
  'skills/classify-chatlogs/scripts/classify.ts',
  'skills/export-chatlogs/scripts/export.ts',
  'skills/filter-chatlogs/scripts/filter.ts',
  'skills/normalize-chatlogs/scripts/normalize.ts',
  'skills/set-frontmatter/scripts/set.ts',
];

/** モジュール短縮名と、そのソース集合が置かれるディレクトリ (リポジトリルート相対) の対応。 */
const _sourceDirCases: readonly { id: string; module: MutateModule; dir: string }[] = [
  { id: 'T-MUT-RT-01-01', module: 'libs', dir: 'skills/_cle-libs' },
  { id: 'T-MUT-RT-01-02', module: 'classify', dir: 'skills/classify-chatlogs' },
  { id: 'T-MUT-RT-01-03', module: 'export', dir: 'skills/export-chatlogs' },
  { id: 'T-MUT-RT-01-04', module: 'filter', dir: 'skills/filter-chatlogs' },
  { id: 'T-MUT-RT-01-05', module: 'normalize', dir: 'skills/normalize-chatlogs' },
  { id: 'T-MUT-RT-01-06', module: 'set', dir: 'skills/set-frontmatter' },
];

/** ソース集合の候補になる実装ファイル (モジュールディレクトリ相対)。拡張子ごとに 1 件。 */
const _fileKindCases: readonly { id: string; file: string }[] = [
  { id: 'T-MUT-RT-02-01', file: 'scripts/foo.ts' },
  { id: 'T-MUT-RT-02-02', file: 'scripts/view.tsx' },
];

/** ソース集合の候補にしない TypeScript 以外のファイル (モジュールディレクトリ相対)。拡張子ごとに 1 件 (generation R-101)。 */
const _nonTsFileCases: readonly { id: string; file: string }[] = [
  { id: 'T-MUT-RT-09-01', file: 'scripts/legacy.js' },
  { id: 'T-MUT-RT-09-02', file: 'SKILL.md' },
];

/** テスト集合に入る unit テスト (リポジトリルート相対)。置き方・モジュールの違いごとに 1 件 (generation R-104 / DD-02)。 */
const _includedTestCases: readonly { id: string; module: MutateModule; file: string }[] = [
  {
    id: 'T-MUT-RT-03-04',
    module: 'classify',
    file: 'skills/classify-chatlogs/scripts/__tests__/unit/view.unit.spec.tsx',
  },
  {
    id: 'T-MUT-RT-03-05',
    module: 'classify',
    file: 'skills/classify-chatlogs/scripts/__tests__/unit/sub/foo.unit.spec.ts',
  },
  {
    id: 'T-MUT-RT-03-06',
    module: 'classify',
    file: 'skills/classify-chatlogs/scripts/__tests__/foo/unit/bar.unit.spec.ts',
  },
  { id: 'T-MUT-RT-03-07', module: 'libs', file: 'skills/_cle-libs/libs/__tests__/unit/foo.unit.spec.ts' },
];

/** テスト集合に入らないテストファイル (モジュールディレクトリ相対)。unit 以外のテスト種別ごとに 1 件。 */
const _excludedTestCases: readonly { id: string; file: string }[] = [
  { id: 'T-MUT-RT-03-02', file: 'scripts/__tests__/functional/foo.functional.spec.ts' },
  { id: 'T-MUT-RT-03-03', file: 'scripts/__tests__/integration/foo.integration.spec.ts' },
];

/** unit/ 配下にあっても spec ではないファイル (モジュールディレクトリ相対)。テスト集合に入れない (generation R-104 / DD-02)。 */
const _nonSpecUnitFileCases: readonly { id: string; file: string }[] = [
  { id: 'T-MUT-RT-12-01', file: 'scripts/__tests__/unit/helpers.ts' },
  { id: 'T-MUT-RT-12-02', file: 'scripts/__tests__/unit/fixture.json' },
  { id: 'T-MUT-RT-12-03', file: 'scripts/__tests__/unit/foo.unit.spec.sh' },
];

/** 当該モジュールと他モジュールの unit テスト (リポジトリルート相対)。テスト集合は当該モジュールのものに限る (generation R-104 / DD-02)。 */
const _crossModuleCases: readonly { id: string; module: MutateModule; own: string; other: string }[] = [
  {
    id: 'T-MUT-RT-13-01',
    module: 'classify',
    own: 'skills/classify-chatlogs/scripts/__tests__/unit/a.unit.spec.ts',
    other: 'skills/filter-chatlogs/scripts/__tests__/unit/b.unit.spec.ts',
  },
  {
    id: 'T-MUT-RT-13-02',
    module: 'libs',
    own: 'skills/_cle-libs/libs/__tests__/unit/a.unit.spec.ts',
    other: 'skills/classify-chatlogs/scripts/__tests__/unit/b.unit.spec.ts',
  },
];

/** ソース集合から除外するファイル (モジュールディレクトリ相対)。除外規則ごとに 1 件 (generation R-102 / DD-03)。 */
const _excludedSourceCases: readonly { id: string; file: string }[] = [
  { id: 'T-MUT-RT-06-01', file: 'src/__tests__/helper.ts' },
  { id: 'T-MUT-RT-06-02', file: 'src/foo.spec.ts' },
  { id: 'T-MUT-RT-06-03', file: 'src/foo.spec.tsx' },
  { id: 'T-MUT-RT-06-04', file: 'src/foo.types.ts' },
  { id: 'T-MUT-RT-06-05', file: 'src/foo.types.tsx' },
  { id: 'T-MUT-RT-06-06', file: 'src/foo.constants.ts' },
  { id: 'T-MUT-RT-06-07', file: 'src/foo.constants.tsx' },
];

/** 前回の実行が残した残骸 (モジュールディレクトリ相対)。ソース集合に入れない (generation R-103 / DD-06)。 */
const _leftoverArtifactCases: readonly { id: string; original: string; file: string }[] = [
  { id: 'T-MUT-RT-07-01', original: 'src/foo.ts', file: 'src/foo.mutation-001.ts' },
  { id: 'T-MUT-RT-07-02', original: 'src/view.tsx', file: 'src/view.mutation-002.tsx' },
  { id: 'T-MUT-RT-07-03', original: 'src/foo.ts', file: 'src/foo.mutation-1000.ts' },
  { id: 'T-MUT-RT-07-04', original: 'src/foo.ts', file: 'deno.mutation-003.json' },
];

/** 変異体・一時設定の命名に一致するファイル名 (generation R-103 / execution DD-01)。 */
const _artifactNameCases: readonly { id: string; fileName: string }[] = [
  { id: 'T-MUT-RT-05-01', fileName: 'foo.mutation-001.ts' },
  { id: 'T-MUT-RT-05-02', fileName: 'view.mutation-001.tsx' },
  { id: 'T-MUT-RT-05-03', fileName: 'foo.mutation-1000.ts' },
  { id: 'T-MUT-RT-05-04', fileName: 'deno.mutation-001.json' },
];

/** 変異体・一時設定の命名に一致しないファイル名 (generation R-103 / execution DD-01)。 */
const _nonArtifactNameCases: readonly { id: string; fileName: string }[] = [
  { id: 'T-MUT-RT-08-01', fileName: 'foo.mutation.ts' },
  { id: 'T-MUT-RT-08-02', fileName: 'foo.mutation-01.ts' },
  { id: 'T-MUT-RT-08-03', fileName: 'foo.mutation-001.js' },
  { id: 'T-MUT-RT-08-04', fileName: 'foo.mutation-abc.ts' },
];

// functions
/**
 * 疑似リポジトリのルート配下にファイルを作る。
 *
 * @param rootDir - 疑似リポジトリのルート
 * @param relPaths - 作成するファイルのルート相対パス
 */
async function _writeFiles(rootDir: string, relPaths: readonly string[]): Promise<void> {
  await Promise.all(relPaths.map(async (relPath) => {
    const _filePath = join(rootDir, relPath);
    await Deno.mkdir(dirname(_filePath), { recursive: true });
    await Deno.writeTextFile(_filePath, 'export const x = 1;\n');
  }));
}

// ─── Tests

/**
 * `resolveTargets` のユニットテストスイート。
 *
 * 一時ディレクトリに作った疑似リポジトリを探索起点にして、モジュール名からソース集合とテスト集合を導くことを検証する。
 *
 * テスト ID 範囲: T-MUT-RT-01-01 〜 T-MUT-RT-07-04, T-MUT-RT-09-01, T-MUT-RT-10-01, T-MUT-RT-11-01,
 * T-MUT-RT-12-01 〜 T-MUT-RT-12-03, T-MUT-RT-13-01 〜 T-MUT-RT-13-02
 *
 * @see resolveTargets
 */
describe('resolveTargets', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'resolve-targets-' });
    await _writeFiles(tempDir, _FIXTURE_FILES);
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * モジュール名からソース集合のディレクトリを導く (generation R-101 / DD-01 / REQ-F-012)。
   */
  describe('ソースのディレクトリ', () => {
    /** 受け付ける短縮名を渡す正常ケース。 */
    describe('When: 正常系', () => {
      for (const { id, module, dir } of _sourceDirCases) {
        it(`[Normal] ${id}: module=${module} → sources は 1 件以上かつ全件 ${dir}/ 配下`, async () => {
          const _result = await resolveTargets(module, { rootDir: tempDir });

          assert(_result.sources.length >= 1);
          assertEquals(_result.sources.filter((p) => !p.startsWith(`${dir}/`)), []);
        });
      }
    });
  });

  /**
   * TypeScript の実装ファイルをソース集合の候補にする (generation R-101)。
   */
  describe('候補にするファイル種別', () => {
    /** 疑似モジュール配下に実装ファイルを置く正常ケース。 */
    describe('When: 正常系', () => {
      for (const { id, file } of _fileKindCases) {
        it(`[Normal] ${id}: 疑似モジュール配下の ${file} → sources に含まれる`, async () => {
          const _target = `skills/classify-chatlogs/${file}`;
          await _writeFiles(tempDir, [_target]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertArrayIncludes(_result.sources, [_target]);
        });
      }
    });

    /** 疑似モジュール配下に TypeScript 以外のファイルを置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, file } of _nonTsFileCases) {
        it(`[Edge] ${id}: 疑似モジュール配下の ${file} → sources に含まれない`, async () => {
          const _target = `skills/classify-chatlogs/${file}`;
          await _writeFiles(tempDir, [_target]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertEquals(_result.sources.includes(_target), false);
        });
      }
    });
  });

  /**
   * 判定に使うテスト集合は当該モジュールの unit テストに限る (generation R-104 / DD-02)。
   */
  describe('テスト集合', () => {
    /** 疑似モジュール配下にテストファイルを置く正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RT-03-01: 疑似モジュール配下の __tests__/unit/foo.unit.spec.ts → tests に含まれる', async () => {
        const _unitSpec = 'skills/classify-chatlogs/scripts/__tests__/unit/foo.unit.spec.ts';
        await _writeFiles(tempDir, [_unitSpec]);

        const _result = await resolveTargets('classify', { rootDir: tempDir });

        assertArrayIncludes(_result.tests, [_unitSpec]);
      });

      for (const { id, module, file } of _includedTestCases) {
        it(`[Normal] ${id}: module=${module} と ${file} → tests に含まれる`, async () => {
          await _writeFiles(tempDir, [file]);

          const _result = await resolveTargets(module, { rootDir: tempDir });

          assertArrayIncludes(_result.tests, [file]);
        });
      }

      for (const { id, file } of _excludedTestCases) {
        it(`[Normal] ${id}: 疑似モジュール配下の ${file} → tests に含まれない`, async () => {
          const _spec = `skills/classify-chatlogs/${file}`;
          await _writeFiles(tempDir, [_spec]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertEquals(_result.tests.includes(_spec), false);
        });
      }
    });
  });

  /**
   * unit/ 配下でも spec ファイル以外はテスト集合に入れない (generation R-104 / DD-02)。
   */
  describe('unit/ 配下の spec 以外のファイル', () => {
    /** 疑似モジュールの unit/ 配下に spec ではないファイルを置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, file } of _nonSpecUnitFileCases) {
        it(`[Edge] ${id}: 疑似モジュール配下の ${file} → tests に含まれない`, async () => {
          const _target = `skills/classify-chatlogs/${file}`;
          await _writeFiles(tempDir, [_target]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertEquals(_result.tests.includes(_target), false);
        });
      }
    });
  });

  /**
   * 他モジュールの unit テストはテスト集合に入れない (generation R-104 / DD-02)。
   */
  describe('他モジュールのテスト', () => {
    /** 当該モジュールと他モジュールの双方に unit テストを置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, module, own, other } of _crossModuleCases) {
        it(`[Edge] ${id}: module=${module} と ${own} / ${other} → tests は ${own} のみ`, async () => {
          // 共有 fixture と混ざらないよう、専用の疑似リポジトリを作る
          const _rootDir = join(tempDir, 'cross-module');
          await _writeFiles(_rootDir, [own, other]);

          const _result = await resolveTargets(module, { rootDir: _rootDir });

          assertEquals(_result.tests, [own]);
        });
      }
    });
  });

  /**
   * 集合を決定的な順序で返す (generation R-105 / DD-07)。
   */
  describe('集合の順序', () => {
    /** 作成順と昇順が食い違うファイル構成を与える正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RT-04-01: 作成順 c/d.ts → b.ts → a.ts → sources はパスの昇順', async () => {
        // 他モジュールのファイルが混ざらないよう、専用の疑似リポジトリを作る
        const _rootDir = join(tempDir, 'ordered');
        const _moduleDir = 'skills/classify-chatlogs';
        // 作成順そのものを固定するため、1 件ずつ順に作る
        for (const file of ['c/d.ts', 'b.ts', 'a.ts']) {
          await _writeFiles(_rootDir, [`${_moduleDir}/${file}`]);
        }

        const _result = await resolveTargets('classify', { rootDir: _rootDir });

        assertEquals(_result.sources, [`${_moduleDir}/a.ts`, `${_moduleDir}/b.ts`, `${_moduleDir}/c/d.ts`]);
      });

      it('[Normal] T-MUT-RT-04-02: 作成順 z.unit.spec.ts → a.unit.spec.ts → tests は昇順', async () => {
        const _rootDir = join(tempDir, 'ordered');
        const _unitDir = 'skills/classify-chatlogs/scripts/__tests__/unit';
        // 作成順そのものを固定するため、1 件ずつ順に作る
        for (const file of ['z.unit.spec.ts', 'a.unit.spec.ts']) {
          await _writeFiles(_rootDir, [`${_unitDir}/${file}`]);
        }

        const _result = await resolveTargets('classify', { rootDir: _rootDir });

        assertEquals(_result.tests, [`${_unitDir}/a.unit.spec.ts`, `${_unitDir}/z.unit.spec.ts`]);
      });

      it('[Normal] T-MUT-RT-04-03: 同一構成で同じ module を 2 回呼ぶ → 2 回の { sources, tests } が一致する', async () => {
        const _rootDir = join(tempDir, 'ordered');
        const _moduleDir = 'skills/classify-chatlogs';
        // sources と tests の両方が空でない構成にして、双方の決定性を比べる
        await _writeFiles(_rootDir, [
          `${_moduleDir}/scripts/b.ts`,
          `${_moduleDir}/scripts/a.ts`,
          `${_moduleDir}/scripts/__tests__/unit/b.unit.spec.ts`,
          `${_moduleDir}/scripts/__tests__/unit/a.unit.spec.ts`,
        ]);

        const _first = await resolveTargets('classify', { rootDir: _rootDir });
        const _second = await resolveTargets('classify', { rootDir: _rootDir });

        assert(_first.sources.length > 0 && _first.tests.length > 0);
        assertEquals(_second, _first);
      });
    });
  });

  /**
   * テスト・型・定数のファイルをソース集合から除外する (generation R-102 / DD-03)。
   */
  describe('除外するファイル', () => {
    /** 疑似モジュール配下に除外対象のファイルを置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, file } of _excludedSourceCases) {
        it(`[Edge] ${id}: 疑似モジュール配下の ${file} → sources に含まれない`, async () => {
          const _target = `skills/classify-chatlogs/${file}`;
          await _writeFiles(tempDir, [_target]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertEquals(_result.sources.includes(_target), false);
        });
      }
    });
  });

  /**
   * 前回の実行が残した変異体・一時設定をソース集合から除く (generation R-103 / DD-06)。
   */
  describe('前回の残骸', () => {
    /** 疑似モジュール配下に元ファイルと残骸を並べて置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, original, file } of _leftoverArtifactCases) {
        it(`[Edge] ${id}: 疑似モジュール配下の ${original} と残骸 ${file} → sources は元ファイルのみ含む`, async () => {
          const _moduleDir = 'skills/classify-chatlogs';
          const _original = `${_moduleDir}/${original}`;
          const _leftover = `${_moduleDir}/${file}`;
          await _writeFiles(tempDir, [_original, _leftover]);

          const _result = await resolveTargets('classify', { rootDir: tempDir });

          assertArrayIncludes(_result.sources, [_original]);
          assertEquals(_result.sources.includes(_leftover), false);
        });
      }
    });
  });

  /**
   * 除外の結果ソース集合が空になっても、エラーにせず空のまま返す (generation R-101〜R-105 / §3.2 / REQ-F-018)。
   */
  describe('ソース集合が空になる', () => {
    /** 疑似モジュール配下に除外対象のファイルだけを置くエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RT-10-01: 疑似モジュール配下に foo.types.ts と __tests__/unit/foo.unit.spec.ts のみ → 例外なし、sources = []', async () => {
        // 共有 fixture の実装ファイルが混ざらないよう、専用の疑似リポジトリを作る
        const _rootDir = join(tempDir, 'all-excluded');
        const _moduleDir = 'skills/classify-chatlogs/scripts';
        await _writeFiles(_rootDir, [`${_moduleDir}/foo.types.ts`, `${_moduleDir}/__tests__/unit/foo.unit.spec.ts`]);

        const _result = await resolveTargets('classify', { rootDir: _rootDir });

        assertEquals(_result.sources, []);
      });
    });
  });

  /**
   * unit テストが無くテスト集合が空になっても、エラーにせず空のまま返す (generation R-104 / §3.2 / REQ-F-016)。
   */
  describe('テスト集合が空になる', () => {
    /** 疑似モジュール配下に実装ファイルだけを置き、__tests__/unit/ を作らないエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RT-11-01: 疑似モジュール配下に foo.ts のみ (__tests__/unit/ 無し) → 例外なし、tests = []', async () => {
        // 共有 fixture と混ざらないよう、専用の疑似リポジトリを作る
        const _rootDir = join(tempDir, 'no-unit-tests');
        await _writeFiles(_rootDir, ['skills/classify-chatlogs/scripts/foo.ts']);

        const _result = await resolveTargets('classify', { rootDir: _rootDir });

        assertEquals(_result.tests, []);
      });
    });
  });
});

/**
 * `isMutationArtifact` のユニットテストスイート。
 *
 * ファイル名が変異体・一時設定の命名 (`<stem>.mutation-<NNN>.<ext>` / `deno.mutation-<NNN>.json`) に一致するかを判定することを検証する。
 *
 * テスト ID 範囲: T-MUT-RT-05-01 〜 T-MUT-RT-05-04, T-MUT-RT-08-01
 *
 * @see isMutationArtifact
 */
describe('isMutationArtifact', () => {
  /**
   * 変異体と一時設定の命名を判定する (generation R-103 / execution DD-01)。
   */
  describe('命名の判定', () => {
    /** 命名に一致するファイル名を渡す正常ケース。 */
    describe('When: 正常系', () => {
      for (const { id, fileName } of _artifactNameCases) {
        it(`[Normal] ${id}: ${fileName} → true`, () => {
          assertEquals(isMutationArtifact(fileName), true);
        });
      }
    });

    /** 命名に似ているが一致しないファイル名を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, fileName } of _nonArtifactNameCases) {
        it(`[Edge] ${id}: ${fileName} → false`, () => {
          assertEquals(isMutationArtifact(fileName), false);
        });
      }
    });
  });
});
