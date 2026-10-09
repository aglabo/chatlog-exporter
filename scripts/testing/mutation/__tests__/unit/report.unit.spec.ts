// src: scripts/testing/mutation/__tests__/unit/report.unit.spec.ts
// @(#): report のユニットテスト
//       対象: formatReport, decideExitCode
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words unallowed

// ─── BDD modules
import { assertArrayIncludes, assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { decideExitCode, formatReport } from '../../report.ts';

// ─── Helpers
// constants
import {
  EXIT_CODE_FAILURE,
  EXIT_CODE_INTERRUPTED,
  EXIT_CODE_OK,
  REPORT_HEADING_UNALLOWED,
} from '../../constants/mutation.constants.ts';
// types
import type { MutationRunReport } from '../../report.ts';
import type { AllowlistEntry, Mutant, MutantResult, MutantStatus } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 結果の基準にする関係演算子の変異体 (`if (a > b) {` の `>` → `>=`)。 */
const _BASE_MUTANT: Mutant = {
  file: 'skills/_cle-libs/libs/a.ts',
  line: 12,
  column: 9,
  op: 'relational',
  before: '>',
  after: '>=',
  lineText: 'if (a > b) {',
};

/** 古いエントリの基準にする許容リストのエントリ (`_BASE_MUTANT` と同じ適用箇所)。 */
const _BASE_ENTRY: AllowlistEntry = {
  file: 'skills/_cle-libs/libs/a.ts',
  lineText: 'if (a > b) {',
  op: 'relational',
  before: '>',
  after: '>=',
  occurrence: 1,
  reason: '境界値が等しいとき両分岐の結果が同じ',
};

// types
/** `decideExitCode` のテーブル駆動ケース (テスト ID・ラベルの説明・渡す要約)。 */
type _ExitCodeCase = { id: string; title: string; summary: MutationRunReport };

/** `--strict` の有無を合わせて渡す `decideExitCode` のテーブル駆動ケース。 */
type _StrictExitCodeCase = _ExitCodeCase & { strict: boolean };

// functions
/**
 * `_BASE_MUTANT` を基に、属性を上書きした変異体を作る。
 *
 * @param overrides - 上書きする属性
 * @returns 変異体
 */
function _makeMutant(overrides: Partial<Mutant> = {}): Mutant {
  return { ..._BASE_MUTANT, ...overrides };
}

/**
 * `_BASE_ENTRY` を基に、属性を上書きした許容リストのエントリを作る。
 *
 * @param overrides - 上書きする属性
 * @returns 許容リストのエントリ
 */
function _makeEntry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return { ..._BASE_ENTRY, ...overrides };
}

/**
 * 変異体 1 件の判定を作る。
 *
 * @param status - 判定
 * @param mutant - 変異体の上書きする属性
 * @returns 変異体 1 件の判定
 */
function _makeResult(status: MutantStatus, mutant: Partial<Mutant> = {}): MutantResult {
  return { mutant: _makeMutant(mutant), status };
}

/**
 * 属性を上書きした実行結果の要約を作る。`generatedCount` は上書きしない限り `results.length` になる。
 *
 * @param overrides - 上書きする属性
 * @returns `formatReport` / `decideExitCode` に渡す実行結果の要約
 */
function _makeReport(overrides: Partial<MutationRunReport> = {}): MutationRunReport {
  const _results = overrides.results ?? [];
  return {
    generatedCount: _results.length,
    results: _results,
    match: { allowed: [], unallowed: [], stale: [] },
    drift: [],
    leftovers: [],
    interrupted: false,
    auditFailures: [],
    ...overrides,
  };
}

/**
 * 出力を行に分け、各行の前後の空白を除く。
 *
 * @param output - `formatReport` の出力
 * @returns 前後の空白を除いた行の列
 */
function _linesOf(output: string): string[] {
  return output.split('\n').map((line) => line.trim());
}

/**
 * 出力から 1 つのセクションの項目行を取り出す。見出し行の次の行から、空行または出力の末尾までを返す。
 *
 * @param output - `formatReport` の出力
 * @param heading - セクションの見出し (件数を除いた前方部分。例: `未許容の生存`)
 * @returns 前後の空白を除いた項目行の列。見出しが無ければ空配列
 */
function _sectionOf(output: string, heading: string): string[] {
  const _lines = _linesOf(output);
  const _headingIndex = _lines.findIndex((line) => line.startsWith(`${heading} (`));
  if (_headingIndex < 0) {
    return [];
  }
  const _rest = _lines.slice(_headingIndex + 1);
  const _endIndex = _rest.indexOf('');
  return _endIndex < 0 ? _rest : _rest.slice(0, _endIndex);
}

// ─── Tests

/**
 * `formatReport` のユニットテストスイート。
 *
 * 1 回の変異テスト実行の要約を、人が読む報告の文字列に整形することを確認する。
 *
 * テスト ID 範囲: T-MUT-RP-01-01 〜
 *
 * @see formatReport
 */
describe('formatReport', () => {
  /**
   * 判定ごとの件数 (report-cli R-607 / DR-02 / REQ-F-011)。
   */
  describe('判定ごとの件数', () => {
    /** 5 種の判定を混在させた正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RP-01-01: killed 3・survived 2・timeout 1・error 1・compile-error 1 → 5 種の件数行がそれぞれ出る', () => {
        const _survived = [_makeResult('survived', { line: 1 }), _makeResult('survived', { line: 2 })];
        const _summary = _makeReport({
          generatedCount: 8,
          results: [
            _makeResult('killed', { line: 3 }),
            _makeResult('killed', { line: 4 }),
            _makeResult('killed', { line: 5 }),
            ..._survived,
            _makeResult('timeout', { line: 6 }),
            _makeResult('error', { line: 7 }),
            _makeResult('compile-error', { line: 8 }),
          ],
          match: { allowed: [], unallowed: _survived.map((result) => result.mutant), stale: [] },
        });

        const _lines = _linesOf(formatReport(_summary));

        assertArrayIncludes(_lines, [
          'killed: 3',
          'survived: 2',
          'timeout: 1',
          'error: 1',
          'compile-error: 1',
        ]);
      });

      it('[Normal] T-MUT-RP-01-02: survived 3 (許容済み 1・未許容 2) → survived の内訳に 許容済み 1・未許容 2 が出る', () => {
        const _survived = [1, 2, 3].map((line) => _makeResult('survived', { line }));
        const _summary = _makeReport({
          results: _survived,
          match: {
            allowed: [_survived[0].mutant],
            unallowed: [_survived[1].mutant, _survived[2].mutant],
            stale: [],
          },
        });

        const _lines = _linesOf(formatReport(_summary));
        const _survivedIndex = _lines.indexOf('survived: 3');

        assertEquals(_lines.slice(_survivedIndex, _survivedIndex + 3), ['survived: 3', '許容済み: 1', '未許容: 2']);
      });
    });
  });

  /**
   * kill 率と有効判定率 (report-cli R-608 / DD-05)。
   */
  describe('kill 率と有効判定率', () => {
    /** 有効な判定が 1 件以上ある正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RP-02-01: killed 3・survived 1 → kill 率 75.0% の行が出る', () => {
        const _summary = _makeReport({
          results: [
            _makeResult('killed', { line: 1 }),
            _makeResult('killed', { line: 2 }),
            _makeResult('killed', { line: 3 }),
            _makeResult('survived', { line: 4 }),
          ],
        });

        const _lines = _linesOf(formatReport(_summary));

        assertArrayIncludes(_lines, ['kill 率: 75.0%']);
      });

      it('[Normal] T-MUT-RP-02-02: 生成 8 件・killed 3・survived 1・timeout 4 (中断なし) → 有効判定率 50.0% の行が出る', () => {
        const _summary = _makeReport({
          generatedCount: 8,
          results: [
            ...[1, 2, 3].map((line) => _makeResult('killed', { line })),
            _makeResult('survived', { line: 4 }),
            ...[5, 6, 7, 8].map((line) => _makeResult('timeout', { line })),
          ],
        });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line.startsWith('有効判定率')), ['有効判定率: 50.0%']);
      });

      it('[Normal] T-MUT-RP-02-03: killed 1・compile-error 1 → kill 率 100.0% で、compile-error 1 件は別に数えられる', () => {
        const _summary = _makeReport({
          results: [_makeResult('killed', { line: 1 }), _makeResult('compile-error', { line: 2 })],
        });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line.startsWith('kill 率')), ['kill 率: 100.0%']);
        assertArrayIncludes(_lines, ['compile-error: 1']);
      });
    });
  });

  /**
   * 一覧の出力 (report-cli R-609 / REQ-F-011 / AC-013)。
   */
  describe('一覧の出力', () => {
    /** 一覧に項目が 1 件以上ある正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RP-03-01: a.ts 12 行目 relational > → >= の未許容 1 件 → 未許容の生存の一覧に file:line・op・置換前後の字句が出る', () => {
        const _survived = _makeResult('survived');
        const _summary = _makeReport({
          results: [_survived],
          match: { allowed: [], unallowed: [_survived.mutant], stale: [] },
        });

        const _section = _sectionOf(formatReport(_summary), '未許容の生存');

        const _fragments = ['skills/_cle-libs/libs/a.ts:12', 'relational', '>', '>='];

        assertEquals(_section.length, 1);
        assertEquals(_fragments.filter((fragment) => !_section[0].includes(fragment)), []);
      });

      it('[Normal] T-MUT-RP-03-02: a.ts 12 行目の許容済み 1 件・未許容 0 件 → 未許容の生存の一覧に a.ts:12 が出ない', () => {
        const _survived = _makeResult('survived');
        const _summary = _makeReport({
          results: [_survived],
          match: { allowed: [_survived.mutant], unallowed: [], stale: [] },
        });

        const _output = formatReport(_summary);
        const _section = _sectionOf(_output, '未許容の生存');

        // 見出しが無いと _sectionOf は空配列を返し、検証が空振りする。見出しの存在を先に固定する
        assertEquals(_linesOf(_output).filter((line) => line.startsWith('未許容の生存 (')).length, 1);
        assertEquals(_section.filter((line) => line.includes('skills/_cle-libs/libs/a.ts:12')), []);
      });

      it('[Normal] T-MUT-RP-03-03: 未許容 b.ts:3:5・a.ts:10:2・a.ts:3:9・a.ts:3:4 の順 → 一覧は a.ts:3:4・a.ts:3:9・a.ts:10:2・b.ts:3:5 の順に並ぶ', () => {
        const _survived = [
          { file: 'b.ts', line: 3, column: 5 },
          { file: 'a.ts', line: 10, column: 2 },
          { file: 'a.ts', line: 3, column: 9 },
          { file: 'a.ts', line: 3, column: 4 },
        ].map((position) => _makeResult('survived', position));
        const _summary = _makeReport({
          results: _survived,
          match: { allowed: [], unallowed: _survived.map((result) => result.mutant), stale: [] },
        });

        const _section = _sectionOf(formatReport(_summary), '未許容の生存');

        // 行 10 は行 3 の後に並ぶ (字句順ではなく数値順)
        assertEquals(_section.map((line) => line.split(' ')[0]), ['a.ts:3:4', 'a.ts:3:9', 'a.ts:10:2', 'b.ts:3:5']);
      });

      it('[Normal] T-MUT-RP-03-04: 古いエントリ a.ts の `if (a > b) {` 1 件 → 古い許容エントリの一覧に file と lineText が出る', () => {
        const _summary = _makeReport({
          match: { allowed: [], unallowed: [], stale: [_makeEntry()] },
        });

        const _section = _sectionOf(formatReport(_summary), '古い許容エントリ');

        const _fragments = ['skills/_cle-libs/libs/a.ts', 'if (a > b) {'];

        assertEquals(_section.length, 1);
        assertEquals(_fragments.filter((fragment) => !_section[0].includes(fragment)), []);
      });

      it('[Normal] T-MUT-RP-03-05: drift に a.ts 1 件 → drift の一覧に skills/_cle-libs/libs/a.ts が出る', () => {
        const _summary = _makeReport({ drift: ['skills/_cle-libs/libs/a.ts'] });

        const _section = _sectionOf(formatReport(_summary), 'drift');

        assertEquals(_section, ['skills/_cle-libs/libs/a.ts']);
      });
    });
  });

  /**
   * 実行上の異常の報告 (report-cli R-612 / DD-07、execution DD-05)。
   *
   * 後始末で削除できなかったファイルを残骸として列挙し、警告することを検証する。
   * 有効な判定がすべて survived のファイルを、差し替えが効いていない可能性として警告することを検証する (R-613 / DD-08)。
   */
  describe('実行上の異常の報告', () => {
    /** 実行中に異常が起きた要約を渡すケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RP-04-01: leftovers に a.mutation-003.ts → 残骸の一覧に a.mutation-003.ts が出て、警告の行がある', () => {
        const _summary = _makeReport({ leftovers: ['skills/_cle-libs/libs/a.mutation-003.ts'] });

        const _output = formatReport(_summary);

        assertEquals(_sectionOf(_output, '残骸'), ['skills/_cle-libs/libs/a.mutation-003.ts']);
        assertEquals(_linesOf(_output).filter((line) => line.startsWith('警告: ')).length, 1);
      });

      it('[Error] T-MUT-RP-04-02: a.ts の判定が survived 3 件だけ → a.ts について差し替えが効いていない可能性の警告がある', () => {
        const _summary = _makeReport({
          results: [1, 2, 3].map((line) => _makeResult('survived', { file: 'a.ts', line })),
        });

        const _warnings = _linesOf(formatReport(_summary)).filter((line) =>
          line.includes('a.ts') && line.includes('差し替えが効いていない可能性')
        );

        assertEquals(_warnings.length, 1);
      });

      it('[Error] T-MUT-RP-04-03: 中断あり・生成 5 件・killed 1・survived 1 → 出力の 1 行目が 中断（途中結果） の見出しになる', () => {
        const _summary = _makeReport({
          generatedCount: 5,
          results: [_makeResult('killed', { line: 1 }), _makeResult('survived', { line: 2 })],
          interrupted: true,
        });

        // 先頭行は字下げ・前置きを許さない。trim せずに生の 1 行目を比べる
        assertEquals(formatReport(_summary).split('\n')[0], '中断（途中結果）');
      });

      it('[Error] T-MUT-RP-04-04: a.ts の判定が survived 2 件・timeout 1 件 → timeout を有効な判定に数えず、a.ts について差し替えが効いていない可能性の警告がある', () => {
        const _summary = _makeReport({
          results: [
            _makeResult('survived', { file: 'a.ts', line: 1 }),
            _makeResult('survived', { file: 'a.ts', line: 2 }),
            _makeResult('timeout', { file: 'a.ts', line: 3 }),
          ],
        });

        const _warnings = _linesOf(formatReport(_summary)).filter((line) =>
          line.includes('a.ts') && line.includes('差し替えが効いていない可能性')
        );

        assertEquals(_warnings.length, 1);
      });

      it('[Error] T-MUT-RP-04-05: a.ts の判定が survived 2 件・b.ts の判定が killed 1 件・survived 1 件 → 差し替えが効いていない可能性の警告は a.ts だけに出る', () => {
        // 一方のパスが他方の部分文字列にならないパスを使い、includes の取り違えを防ぐ
        const _fileA = 'skills/x/a.ts';
        const _fileB = 'skills/x/b.ts';
        const _summary = _makeReport({
          results: [
            _makeResult('survived', { file: _fileA, line: 1 }),
            _makeResult('survived', { file: _fileA, line: 2 }),
            _makeResult('killed', { file: _fileB, line: 1 }),
            _makeResult('survived', { file: _fileB, line: 2 }),
          ],
        });

        const _warnings = _linesOf(formatReport(_summary)).filter((line) =>
          line.includes('差し替えが効いていない可能性')
        );

        assertEquals(_warnings.map((line) => [_fileA, _fileB].filter((file) => line.includes(file))), [[_fileA]]);
      });
    });
  });

  /**
   * 0 件の明示 (report-cli R-609 / R-610 / R-611)。
   *
   * 一覧が空でもセクションを省略せず、見出しに `0 件` を出すことを検証する。
   */
  describe('0 件の明示', () => {
    /** 一覧の項目が 0 件の境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RP-05-01: killed 1 件・未許容 0 件 → 未許容の生存のセクションが省略されず、見出しに 0 件と出る', () => {
        const _summary = _makeReport({ results: [_makeResult('killed')] });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line === '未許容の生存 (0 件):').length, 1);
      });

      it('[Edge] T-MUT-RP-05-02: killed 1 件・古いエントリ 0 件 → 古いエントリのセクションが省略されず、見出しに 0 件と出る', () => {
        const _summary = _makeReport({
          results: [_makeResult('killed')],
          match: { allowed: [], unallowed: [], stale: [] },
        });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line === '古い許容エントリ (0 件):').length, 1);
      });

      it('[Edge] T-MUT-RP-05-03: killed 1 件・drift 0 件 → drift のセクションが省略されず、見出しに 0 件と出る', () => {
        const _summary = _makeReport({ results: [_makeResult('killed')], drift: [] });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line === 'drift (0 件):').length, 1);
      });
    });
  });

  /**
   * 出さないセクション・警告 (report-cli R-612 / DD-07)。
   *
   * 該当する事象が無いとき、条件付きのセクションや警告を出さないことを検証する。
   */
  describe('出さないセクション・警告', () => {
    /** 条件付きセクションの対象が 0 件の境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RP-06-01: killed 1 件・leftovers 0 件 → 残骸のセクションも残骸の警告も出ない', () => {
        // killed のみにして、同じ `警告:` で始まる差し替えの警告 (R-613) が出ない入力にする
        const _summary = _makeReport({ results: [_makeResult('killed')], leftovers: [] });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line.startsWith('残骸 (')), []);
        assertEquals(_lines.filter((line) => line.includes('削除できなかったファイルがあります')), []);
      });

      it('[Edge] T-MUT-RP-06-02: a.ts の判定が timeout 2 件だけ → 有効な判定が 0 件なので a.ts について差し替えの警告が出ない', () => {
        const _summary = _makeReport({
          results: [1, 2].map((line) => _makeResult('timeout', { file: 'a.ts', line })),
        });

        const _warnings = _linesOf(formatReport(_summary)).filter((line) =>
          line.includes('a.ts') && line.includes('差し替えが効いていない可能性')
        );

        assertEquals(_warnings, []);
      });

      it('[Edge] T-MUT-RP-06-03: a.ts の判定が killed 1 件・survived 2 件 → killed を含むので a.ts について差し替えの警告が出ない', () => {
        const _summary = _makeReport({
          results: [
            _makeResult('killed', { file: 'a.ts', line: 1 }),
            ...[2, 3].map((line) => _makeResult('survived', { file: 'a.ts', line })),
          ],
        });

        const _warnings = _linesOf(formatReport(_summary)).filter((line) =>
          line.includes('a.ts') && line.includes('差し替えが効いていない可能性')
        );

        assertEquals(_warnings, []);
      });
    });
  });

  /**
   * kill 率の算出不能 (report-cli R-608 / Edge report-cli-14 / Edge report-cli-27)。
   *
   * 割合の分母が 0 のとき、0 除算の `NaN` や `Infinity` を出さず「算出不能」と出すことを検証する。
   */
  describe('kill 率の算出不能', () => {
    /** 有効な判定 (killed + survived) が 0 件の境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RP-07-01: timeout 2 件だけ → kill 率は 算出不能 と出て、出力に NaN も Infinity も無い', () => {
        const _summary = _makeReport({
          results: [1, 2].map((line) => _makeResult('timeout', { line })),
        });

        const _output = formatReport(_summary);

        assertEquals(_linesOf(_output).filter((line) => line.startsWith('kill 率')), ['kill 率: 算出不能']);
        assertEquals(['NaN', 'Infinity'].filter((token) => _output.includes(token)), []);
      });

      it('[Edge] T-MUT-RP-07-02: 生成 0 件・中断なし → 有効判定率の分母が 0 でも、出力に NaN も Infinity も無い', () => {
        const _summary = _makeReport({ generatedCount: 0, results: [], interrupted: false });

        const _output = formatReport(_summary);

        assertEquals(['NaN', 'Infinity'].filter((token) => _output.includes(token)), []);
      });

      it('[Edge] T-MUT-RP-07-03: 生成 5 件・中断あり・判定済み 0 件 → 有効判定率の分母が 0 でも、出力に NaN も Infinity も無い', () => {
        const _summary = _makeReport({ generatedCount: 5, results: [], interrupted: true });

        const _output = formatReport(_summary);

        assertEquals(['NaN', 'Infinity'].filter((token) => _output.includes(token)), []);
      });
    });
  });

  /**
   * 変異体 0 件 (report-cli R-606 / REQ-F-018 / AC-021 / Edge report-cli-8)。
   *
   * 生成件数が 0 のとき「変異体 0 件」を明示し、判定の件数を 0 として出すことを検証する。
   */
  describe('変異体 0 件', () => {
    /** 生成件数が 0 の境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RP-08-01: 生成 0 件・中断なし → 変異体 0 件 と出て、5 種の判定の件数がすべて 0 と出る', () => {
        const _summary = _makeReport({ generatedCount: 0, results: [], interrupted: false });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line === '変異体 0 件').length, 1);
        assertArrayIncludes(_lines, ['killed: 0', 'survived: 0', 'timeout: 0', 'error: 0', 'compile-error: 0']);
      });

      it('[Edge] T-MUT-RP-08-02: 生成 5 件・中断あり・判定済み 0 件 → 変異体 0 件 と出ず、中断（途中結果） の見出しが出る', () => {
        const _summary = _makeReport({ generatedCount: 5, results: [], interrupted: true });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line === '変異体 0 件').length, 0);
        assertArrayIncludes(_lines, ['中断（途中結果）']);
      });

      it('[Edge] T-MUT-RP-08-03: 生成 0 件・古いエントリ 2 件 → 変異体 0 件 と出て、古い許容エントリの一覧に 2 件の lineText がそれぞれ出る', () => {
        const _stale = [
          _makeEntry({ lineText: 'if (a > b) {' }),
          _makeEntry({ lineText: 'return x === 0;', op: 'equality', before: '===', after: '!==' }),
        ];
        const _summary = _makeReport({
          generatedCount: 0,
          results: [],
          match: { allowed: [], unallowed: [], stale: _stale },
        });

        const _output = formatReport(_summary);
        const _section = _sectionOf(_output, '古い許容エントリ');

        assertEquals(_linesOf(_output).filter((line) => line === '変異体 0 件').length, 1);
        assertEquals(_section.length, 2);
        assertEquals(_section.map((line, index) => line.includes(_stale[index].lineText)), [true, true]);
      });

      it('[Edge] T-MUT-RP-08-04: 生成 0 件・drift 1 件 → 変異体 0 件 と出て、drift の一覧に skills/_cle-libs/libs/a.ts が出る', () => {
        const _summary = _makeReport({ generatedCount: 0, results: [], drift: ['skills/_cle-libs/libs/a.ts'] });

        const _output = formatReport(_summary);

        assertEquals(_linesOf(_output).filter((line) => line === '変異体 0 件').length, 1);
        assertEquals(_sectionOf(_output, 'drift'), ['skills/_cle-libs/libs/a.ts']);
      });

      it('[Edge] T-MUT-RP-08-05: 生成 0 件・残骸 1 件 → 変異体 0 件 と出て、残骸の一覧に skills/_cle-libs/libs/a.mutation-001.ts が出る', () => {
        const _summary = _makeReport({
          generatedCount: 0,
          results: [],
          leftovers: ['skills/_cle-libs/libs/a.mutation-001.ts'],
        });

        const _output = formatReport(_summary);

        assertEquals(_linesOf(_output).filter((line) => line === '変異体 0 件').length, 1);
        assertEquals(_sectionOf(_output, '残骸'), ['skills/_cle-libs/libs/a.mutation-001.ts']);
      });
    });
  });

  /**
   * 分母・決定性・重複一致 (report-cli R-608 / report-cli R-605)。
   */
  describe('分母・決定性・重複一致', () => {
    /** 割合の分母や出力の安定性に関わる境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RP-09-01: 中断あり・生成 10 件・killed 1・survived 1・timeout 2 → 有効判定率は判定済み 4 件を分母に 50.0% で、20.0% でない', () => {
        const _summary = _makeReport({
          generatedCount: 10,
          results: [
            _makeResult('killed', { line: 1 }),
            _makeResult('survived', { line: 2 }),
            ...[3, 4].map((line) => _makeResult('timeout', { line })),
          ],
          interrupted: true,
        });

        const _lines = _linesOf(formatReport(_summary));

        assertEquals(_lines.filter((line) => line.startsWith('有効判定率')), ['有効判定率: 50.0%']);
      });

      it('[Edge] T-MUT-RP-09-02: 全セクション入りの同じ summary で 2 回呼ぶ → 2 回の戻り値が完全に一致し、summary は変更されない', () => {
        // a.ts は有効な判定がすべて survived (差し替えの警告)、b.ts は killed を含む
        const _allowed = _makeResult('survived', { file: 'a.ts', line: 5, column: 1 });
        const _unallowed = [
          _makeResult('survived', { file: 'b.ts', line: 3, column: 5 }),
          _makeResult('survived', { file: 'a.ts', line: 3, column: 4 }),
        ];
        const _summary = _makeReport({
          generatedCount: 10,
          results: [
            _makeResult('killed', { file: 'b.ts', line: 1, column: 1 }),
            _allowed,
            ..._unallowed,
            _makeResult('timeout', { file: 'b.ts', line: 7 }),
            _makeResult('error', { file: 'b.ts', line: 8 }),
            _makeResult('compile-error', { file: 'b.ts', line: 9 }),
          ],
          // unallowed は位置の降順に置き、並べ替えの経路を通す
          match: {
            allowed: [_allowed.mutant],
            unallowed: _unallowed.map((result) => result.mutant),
            stale: [_makeEntry()],
          },
          drift: ['a.ts'],
          leftovers: ['a.mutation-001.ts'],
          interrupted: true,
        });
        const _snapshot = structuredClone(_summary);

        const _first = formatReport(_summary);
        const _second = formatReport(_summary);

        // 入力が条件付きのセクション (中断・差し替えの警告・残骸) まで実際に通ることを先に固定する
        assertEquals(
          ['中断（途中結果）', '差し替えが効いていない可能性', '残骸 ('].filter((token) => !_first.includes(token)),
          [],
        );
        assertEquals(_second, _first);
        assertEquals(_summary, _snapshot);
      });

      it('[Edge] T-MUT-RP-09-03: 1 エントリに一致した同テキスト別行の survived 2 (a.ts:3:7・a.ts:9:7) → survived の内訳に 許容済み 2・未許容 0 が出る', () => {
        // 同じ lineText の別行が 1 エントリに一致しても、許容済みは変異体ごとに数える
        const _survived = [3, 9].map((line) =>
          _makeResult('survived', { file: 'a.ts', line, column: 7, lineText: 'if (a > b) {' })
        );
        const _summary = _makeReport({
          results: _survived,
          match: { allowed: _survived.map((result) => result.mutant), unallowed: [], stale: [] },
        });

        const _lines = _linesOf(formatReport(_summary));
        const _survivedIndex = _lines.indexOf('survived: 2');

        assertEquals(_lines.slice(_survivedIndex, _survivedIndex + 3), ['survived: 2', '許容済み: 2', '未許容: 0']);
      });
    });
  });
});

/**
 * `decideExitCode` のユニットテストスイート。
 *
 * 変異テスト実行の要約と `--strict` の有無から終了コードを決めることを確認する (report-cli 4.3)。
 *
 * テスト ID 範囲: T-MUT-RP-10-01 〜 T-MUT-RP-19-02
 *
 * @see decideExitCode
 */
describe('decideExitCode', () => {
  /**
   * `--strict` なしの終了コード (report-cli 4.3)。
   *
   * 監査が成立すれば、未許容の生存・古いエントリ・有効な判定の欠如があっても 0 を返すことを検証する。
   */
  describe('--strict なし', () => {
    /** 監査が成立する要約を渡す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: _ExitCodeCase[] = [
        {
          id: 'T-MUT-RP-10-01',
          title: '未許容の生存 1 件',
          summary: _makeReport({
            results: [_makeResult('survived')],
            match: { allowed: [], unallowed: [_makeMutant()], stale: [] },
          }),
        },
        {
          id: 'T-MUT-RP-10-02',
          title: '古いエントリ 1 件',
          summary: _makeReport({
            results: [_makeResult('killed')],
            match: { allowed: [], unallowed: [], stale: [_makeEntry()] },
          }),
        },
        {
          id: 'T-MUT-RP-10-03',
          title: '全件 timeout',
          summary: _makeReport({ results: [_makeResult('timeout'), _makeResult('timeout', { line: 13 })] }),
        },
        {
          id: 'T-MUT-RP-10-04',
          title: '全件 error',
          summary: _makeReport({ results: [_makeResult('error'), _makeResult('error', { line: 13 })] }),
        },
        {
          id: 'T-MUT-RP-10-05',
          title: '全件 compile-error',
          summary: _makeReport({ results: [_makeResult('compile-error'), _makeResult('compile-error', { line: 13 })] }),
        },
        {
          id: 'T-MUT-RP-10-06',
          title: '残骸 1 件',
          summary: _makeReport({ results: [_makeResult('killed')], leftovers: ['temp/mutation/a.mutant-1.ts'] }),
        },
        {
          id: 'T-MUT-RP-10-07',
          title: '差し替えの警告対象 (許容済みの survived だけ) のファイル',
          summary: _makeReport({
            results: [_makeResult('survived')],
            match: { allowed: [_makeMutant()], unallowed: [], stale: [] },
          }),
        },
        {
          id: 'T-MUT-RP-10-08',
          title: '変異体 0 件',
          summary: _makeReport({ generatedCount: 0, results: [] }),
        },
      ];

      for (const { id, title, summary } of _cases) {
        it(`[Normal] ${id}: ${title}・strict なし → ${EXIT_CODE_OK}`, () => {
          assertEquals(decideExitCode(summary, false), EXIT_CODE_OK);
        });
      }
    });
  });

  /**
   * `--strict` ありの終了コード (report-cli 4.3)。
   *
   * 未許容の生存・古いエントリ・有効な判定の欠如が無ければ、`--strict` でも 0 を返すことを検証する。
   */
  describe('--strict', () => {
    /** `--strict` の検査を通過する要約を渡す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: _ExitCodeCase[] = [
        {
          id: 'T-MUT-RP-11-01',
          title: 'すべての生存が許容済み',
          summary: _makeReport({
            results: [_makeResult('survived'), _makeResult('survived', { line: 13 })],
            match: { allowed: [_makeMutant(), _makeMutant({ line: 13 })], unallowed: [], stale: [] },
          }),
        },
        {
          id: 'T-MUT-RP-11-02',
          title: 'killed だけで問題が無い',
          summary: _makeReport({
            results: [_makeResult('killed'), _makeResult('killed', { line: 13 }), _makeResult('killed', { line: 14 })],
          }),
        },
      ];

      for (const { id, title, summary } of _cases) {
        it(`[Normal] ${id}: ${title}・strict → ${EXIT_CODE_OK}`, () => {
          assertEquals(decideExitCode(summary, true), EXIT_CODE_OK);
        });
      }
    });
  });

  /**
   * 中断時の終了コード (report-cli 4.3)。
   *
   * 中断は他のどの失敗条件よりも先に評価され、`--strict` の有無にかかわらず 130 を返すことを検証する。
   */
  describe('中断', () => {
    /** 中断した要約を渡す異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: _StrictExitCodeCase[] = [
        {
          id: 'T-MUT-RP-12-01',
          title: '中断',
          summary: _makeReport({ results: [_makeResult('killed')], interrupted: true }),
          strict: false,
        },
        {
          id: 'T-MUT-RP-12-02',
          title: '中断と drift が重なる',
          summary: _makeReport({
            results: [_makeResult('killed')],
            interrupted: true,
            drift: ['skills/_cle-libs/libs/a.ts'],
          }),
          strict: false,
        },
        {
          id: 'T-MUT-RP-12-03',
          title: '中断と未許容の生存が重なる',
          summary: _makeReport({
            results: [_makeResult('survived')],
            match: { allowed: [], unallowed: [_makeMutant()], stale: [] },
            interrupted: true,
          }),
          strict: true,
        },
      ];

      for (const { id, title, summary, strict } of _cases) {
        it(`[Error] ${id}: ${title}・${strict ? 'strict' : 'strict なし'} → ${EXIT_CODE_INTERRUPTED}`, () => {
          assertEquals(decideExitCode(summary, strict), EXIT_CODE_INTERRUPTED);
        });
      }
    });
  });

  /**
   * 監査が成立しないときの終了コード (report-cli 4.3)。
   *
   * drift・監査単位の失敗は `--strict` の判定より先に評価され、`--strict` の有無にかかわらず 1 を返すことを検証する。
   */
  describe('監査不成立', () => {
    /** 監査が成立しない要約を渡す異常ケース。 */
    describe('When: 異常系', () => {
      /** `--strict` の有無だけを変えて渡す、drift のある要約。 */
      const _driftSummary = _makeReport({ results: [_makeResult('killed')], drift: ['skills/_cle-libs/libs/a.ts'] });

      const _cases: _StrictExitCodeCase[] = [
        {
          id: 'T-MUT-RP-13-01',
          title: 'drift 1 件',
          summary: _driftSummary,
          strict: false,
        },
        {
          id: 'T-MUT-RP-13-02',
          title: '監査単位の失敗 (残骸掃除の削除失敗) 1 件',
          summary: _makeReport({
            results: [_makeResult('killed')],
            auditFailures: ['残骸掃除で temp/mutation/a.mutant-1.ts を削除できなかった'],
          }),
          strict: false,
        },
        {
          id: 'T-MUT-RP-13-03',
          title: 'drift 1 件',
          summary: _driftSummary,
          strict: true,
        },
      ];

      for (const { id, title, summary, strict } of _cases) {
        it(`[Error] ${id}: ${title}・${strict ? 'strict' : 'strict なし'} → ${EXIT_CODE_FAILURE}`, () => {
          assertEquals(decideExitCode(summary, strict), EXIT_CODE_FAILURE);
        });
      }
    });
  });

  /**
   * `--strict` の検査に落ちるときの終了コード (report-cli 4.3)。
   *
   * 監査が成立していても、`--strict` の検査に掛かる要約では 1 を返すことを検証する。
   */
  describe('--strict の失敗', () => {
    /** `--strict` の検査に掛かる要約を渡す異常ケース。 */
    describe('When: 異常系', () => {
      /** 2 件の変異体がどちらも `status` と判定された要約を作る (有効でない判定だけの要約に使う)。 */
      const _reportOfAll = (status: MutantStatus): MutationRunReport =>
        _makeReport({ results: [_makeResult(status), _makeResult(status, { line: 13 })] });

      const _cases: _ExitCodeCase[] = [
        {
          id: 'T-MUT-RP-14-01',
          title: '未許容の生存 1 件',
          summary: _makeReport({
            results: [_makeResult('survived')],
            match: { allowed: [], unallowed: [_makeMutant()], stale: [] },
          }),
        },
        {
          id: 'T-MUT-RP-15-01',
          title: '全件 timeout で有効な判定が 0 件',
          summary: _reportOfAll('timeout'),
        },
        {
          id: 'T-MUT-RP-15-02',
          title: '全件 error で有効な判定が 0 件',
          summary: _reportOfAll('error'),
        },
        {
          id: 'T-MUT-RP-15-03',
          title: '全件 compile-error で有効な判定が 0 件',
          summary: _reportOfAll('compile-error'),
        },
        {
          id: 'T-MUT-RP-16-01',
          title: '古いエントリ 1 件',
          summary: _makeReport({
            results: [_makeResult('killed')],
            match: { allowed: [], unallowed: [], stale: [_makeEntry()] },
          }),
        },
      ];

      for (const { id, title, summary } of _cases) {
        it(`[Error] ${id}: ${title}・strict → ${EXIT_CODE_FAILURE}`, () => {
          assertEquals(decideExitCode(summary, true), EXIT_CODE_FAILURE);
        });
      }
    });
  });

  /**
   * 変異体 0 件のときの `--strict` の終了コード (report-cli 4.3)。
   *
   * 有効な判定 0 件の失敗は変異体が 1 件以上あるときだけ掛かり、古いエントリの検査は変異体 0 件でも掛かることを検証する。
   */
  describe('変異体 0 件', () => {
    /** 変異体を 1 件も生成しなかった要約を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it(`[Edge] T-MUT-RP-17-01: 変異体 0 件・strict → ${EXIT_CODE_OK}`, () => {
        const _summary = _makeReport({ generatedCount: 0, results: [] });

        assertEquals(decideExitCode(_summary, true), EXIT_CODE_OK);
      });

      it(`[Edge] T-MUT-RP-17-02: 変異体 0 件で古いエントリ 2 件・strict → ${EXIT_CODE_FAILURE}`, () => {
        const _summary = _makeReport({
          generatedCount: 0,
          results: [],
          match: { allowed: [], unallowed: [], stale: [_makeEntry(), _makeEntry({ occurrence: 2 })] },
        });

        assertEquals(decideExitCode(_summary, true), EXIT_CODE_FAILURE);
      });
    });
  });

  /**
   * 有効な判定の最小値での `--strict` の終了コード (report-cli 4.3)。
   *
   * 有効な判定 (killed + survived) が 1 件あれば、timeout が多数でも有効な判定 0 件の失敗に該当しないことを検証する。
   */
  describe('有効な判定の最小値', () => {
    /** 有効な判定がちょうど 1 件の要約を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it(`[Edge] T-MUT-RP-18-01: killed 1・timeout 3 (有効な判定 1 件)・strict → ${EXIT_CODE_OK}`, () => {
        const _summary = _makeReport({
          results: [
            _makeResult('killed'),
            _makeResult('timeout', { line: 13 }),
            _makeResult('timeout', { line: 14 }),
            _makeResult('timeout', { line: 15 }),
          ],
        });

        assertEquals(decideExitCode(_summary, true), EXIT_CODE_OK);
      });
    });
  });

  /**
   * 終了コードの値とレポートとの一貫性 (report-cli R-615 / R-617 / DD-09 / §2.3)。
   *
   * `--strict` の失敗が中断の 130 と区別できる非 0 であること、
   * および同じ要約から作ったレポートと終了コードが食い違わないことを検証する。
   */
  describe('終了コードの値とレポートとの一貫性', () => {
    /** 未許容の生存 1 件を持つ、中断していない要約を渡す FN確認ケース。 */
    describe('When: FN確認（未許容の生存 1 件・strict）', () => {
      /** 中断せず、未許容の生存を 1 件持つ要約。 */
      const _summary = _makeReport({
        results: [_makeResult('survived')],
        match: { allowed: [], unallowed: [_makeMutant()], stale: [] },
      });

      it('[FN] T-MUT-RP-19-01: 未許容の生存 1 件・strict → 0 でも 130 でもない非 0', () => {
        const _exitCode = decideExitCode(_summary, true);

        assertNotEquals(_exitCode, EXIT_CODE_OK);
        assertNotEquals(_exitCode, EXIT_CODE_INTERRUPTED);
      });

      it('[FN] T-MUT-RP-19-02: 同じ要約で formatReport と strict の decideExitCode → 未許容の生存の一覧が 1 件で、終了コードが非 0', () => {
        const _section = _sectionOf(formatReport(_summary), REPORT_HEADING_UNALLOWED);

        assertEquals(_section.length, 1);
        assertNotEquals(decideExitCode(_summary, true), EXIT_CODE_OK);
      });
    });
  });
});
