// src: scripts/testing/mutation/report.ts
// @(#): 変異テスト実行結果の報告の整形
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  EXIT_CODE_FAILURE,
  EXIT_CODE_INTERRUPTED,
  EXIT_CODE_OK,
  MUTANT_STATUSES,
  REPORT_COUNT_UNIT,
  REPORT_HEADING_DRIFT,
  REPORT_HEADING_INTERRUPTED,
  REPORT_HEADING_LEFTOVERS,
  REPORT_HEADING_STALE,
  REPORT_HEADING_UNALLOWED,
  REPORT_INDENT,
  REPORT_LABEL_ALLOWED,
  REPORT_LABEL_EFFECTIVE_RATE,
  REPORT_LABEL_KILL_RATE,
  REPORT_LABEL_UNALLOWED,
  REPORT_NO_MUTANTS,
  REPORT_RATE_UNDEFINED,
  REPORT_REPLACE_ARROW,
  REPORT_WARNING_ALL_SURVIVED,
  REPORT_WARNING_INEFFECTIVE,
  REPORT_WARNING_LEFTOVERS,
  REPORT_WARNING_PREFIX,
} from './constants/mutation.constants.ts';

import type { AllowlistEntry, Mutant, MutantResult, MutantStatus, MutationRunReport } from './types/mutation.types.ts';

export type { MutationRunReport } from './types/mutation.types.ts';

/**
 * 1 つの判定の件数を数える。
 *
 * @param summary - 変異テスト実行の要約
 * @param status - 件数を数える判定
 * @returns 判定が `status` の結果の件数
 */
const _countOf = (summary: MutationRunReport, status: MutantStatus): number =>
  summary.results.filter((result) => result.status === status).length;

/**
 * survived の内訳の行を作る。件数は `summary.match` から取り、照合はやり直さない (R-607 / DR-04)。
 *
 * @param summary - 変異テスト実行の要約
 * @returns 許容済み・未許容の件数行
 */
const _survivedBreakdown = (summary: MutationRunReport): string[] => [
  `${REPORT_INDENT}${REPORT_LABEL_ALLOWED}: ${summary.match.allowed.length}`,
  `${REPORT_INDENT}${REPORT_LABEL_UNALLOWED}: ${summary.match.unallowed.length}`,
];

/**
 * 1 つの判定の件数行を作る。survived には内訳の行を続ける。
 *
 * @param summary - 変異テスト実行の要約
 * @param status - 件数を数える判定
 * @returns 件数行 (survived は内訳の行を含む)
 */
const _statusLines = (summary: MutationRunReport, status: MutantStatus): string[] => {
  const _countLine = `${status}: ${_countOf(summary, status)}`;
  return status === 'survived' ? [_countLine, ..._survivedBreakdown(summary)] : [_countLine];
};

/**
 * 有効な判定 (killed + survived) の件数を数える (R-608 / DD-05)。
 *
 * @param summary - 変異テスト実行の要約
 * @returns killed と survived の件数の和
 */
const _effectiveCountOf = (summary: MutationRunReport): number =>
  _countOf(summary, 'killed') + _countOf(summary, 'survived');

/**
 * 割合を小数点以下 1 桁の百分率の文字列にする (`75.0%`)。分母が 0 なら `算出不能` を返す (R-608)。
 *
 * @param numerator - 分子
 * @param denominator - 分母
 * @returns 百分率の文字列。分母が 0 なら `算出不能`
 */
const _percentOf = (numerator: number, denominator: number): string =>
  denominator === 0 ? REPORT_RATE_UNDEFINED : `${(numerator / denominator * 100).toFixed(1)}%`;

/**
 * kill 率の行を作る。分母は有効な判定 (killed + survived) で、他の判定は含めない (R-608 / DD-05)。
 *
 * @param summary - 変異テスト実行の要約
 * @returns kill 率の行
 */
const _killRateLine = (summary: MutationRunReport): string =>
  `${REPORT_LABEL_KILL_RATE}: ${_percentOf(_countOf(summary, 'killed'), _effectiveCountOf(summary))}`;

/**
 * 有効判定率の分母を決める。通常は生成件数、中断時は判定済みの件数 (R-608 / R-605)。
 *
 * 中断時は未判定の変異体が残るため、生成件数を分母にすると率が不当に下がる。
 *
 * @param summary - 変異テスト実行の要約
 * @returns 有効判定率の分母
 */
const _effectiveRateDenominatorOf = (summary: MutationRunReport): number =>
  summary.interrupted ? summary.results.length : summary.generatedCount;

/**
 * 有効判定率の行を作る。分子は有効な判定 (killed + survived)、分母は通常は生成件数、
 * 中断時は判定済みの件数 (R-608 / R-605 / DD-05)。
 *
 * @param summary - 変異テスト実行の要約
 * @returns 有効判定率の行
 */
const _effectiveRateLine = (summary: MutationRunReport): string =>
  `${REPORT_LABEL_EFFECTIVE_RATE}: ${_percentOf(_effectiveCountOf(summary), _effectiveRateDenominatorOf(summary))}`;

/**
 * 置換の表記を作る (`<op> <before> → <after>`)。変異体と許容リストのエントリで共通に使う。
 *
 * @param replacement - 変異演算子の種別と置換前後の字句
 * @returns 置換の表記
 */
const _replacementText = ({ op, before, after }: Pick<Mutant, 'op' | 'before' | 'after'>): string =>
  `${op} ${before} ${REPORT_REPLACE_ARROW} ${after}`;

/**
 * 変異体 1 件を一覧の 1 行にする (`<file>:<line>:<column> <op> <before> → <after>`、R-609)。
 *
 * @param mutant - 変異体
 * @returns 字下げを含まない一覧の 1 行
 */
const _mutantLine = (mutant: Mutant): string =>
  `${mutant.file}:${mutant.line}:${mutant.column} ${_replacementText(mutant)}`;

/**
 * 古い許容エントリ 1 件を一覧の 1 行にする
 * (`<file>: <lineText> (<op> <before> → <after>, #<occurrence>)`、R-610)。行テキストは前後の空白を除く。
 *
 * @param entry - 古い許容エントリ
 * @returns 字下げを含まない一覧の 1 行
 */
const _staleEntryLine = (entry: AllowlistEntry): string =>
  `${entry.file}: ${entry.lineText.trim()} (${_replacementText(entry)}, #${entry.occurrence})`;

/**
 * 2 つの文字列をコード単位の順で比べる。ロケールに依存しない (結果を決定的にするため)。
 *
 * @param left - 比べる文字列
 * @param right - 比べる文字列
 * @returns `left` が前なら負、後なら正、等しければ 0
 */
const _compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/**
 * 変異体をファイル (文字列順)・行・桁 (数値順) の昇順に比べる (R-609)。
 *
 * @param left - 比べる変異体
 * @param right - 比べる変異体
 * @returns `left` が前なら負、後なら正、同じ位置なら 0
 */
const _compareMutantPosition = (left: Mutant, right: Mutant): number =>
  _compareText(left.file, right.file) || left.line - right.line || left.column - right.column;

/**
 * 一覧の本体を作る。`<見出し> (<n> 件):` の行・字下げした項目行の順に並べる。
 *
 * @param heading - セクションの見出し
 * @param items - 字下げを含まない項目行の列
 * @returns 見出しと項目の行
 */
const _listLines = (heading: string, items: readonly string[]): string[] => [
  `${heading} (${items.length} ${REPORT_COUNT_UNIT}):`,
  ...items.map((item) => `${REPORT_INDENT}${item}`),
];

/**
 * 一覧のセクションを作る。空行に続けて一覧の本体を並べる。
 *
 * @param heading - セクションの見出し
 * @param items - 字下げを含まない項目行の列
 * @returns セクションの行
 */
const _sectionLines = (heading: string, items: readonly string[]): string[] => ['', ..._listLines(heading, items)];

/**
 * 残骸のセクションを作る。空行・警告の行・`残骸 (<n> 件):` の行・字下げしたパスの行の順に並べる。
 * 残骸が無ければセクションを出さない (R-612 / DD-07)。
 *
 * @param leftovers - 後始末で削除できなかったファイルのパス
 * @returns セクションの行。残骸が無ければ空配列
 */
const _leftoverLines = (leftovers: readonly string[]): string[] =>
  leftovers.length > 0 ? ['', REPORT_WARNING_LEFTOVERS, ..._listLines(REPORT_HEADING_LEFTOVERS, leftovers)] : [];

/**
 * 判定が有効 (killed または survived) かを返す (R-608 / DD-05)。
 *
 * @param result - 変異体 1 件の判定
 * @returns killed または survived なら true
 */
const _isEffective = (result: MutantResult): boolean => result.status === 'killed' || result.status === 'survived';

/**
 * 有効な判定を変異体のファイルごとにまとめる。有効な判定が無いファイルは含まない。
 *
 * @param results - 変異体の判定の列
 * @returns ファイルのパスと、そのファイルの有効な判定の列の組 (ファイルの文字列順)
 */
const _effectiveResultsByFile = (results: readonly MutantResult[]): [string, MutantResult[]][] =>
  Object.entries(Object.groupBy(results.filter(_isEffective), (result) => result.mutant.file))
    .map(([file, fileResults]): [string, MutantResult[]] => [file, fileResults ?? []])
    .toSorted(([left], [right]) => _compareText(left, right));

/**
 * 差し替えが効いていない可能性の警告を作る。有効な判定が 1 件以上あり、すべて survived のファイルごとに 1 行出す
 * (R-613 / DD-08)。該当するファイルが無ければ警告を出さない。
 *
 * @param results - 変異体の判定の列
 * @returns 空行と警告の行。該当するファイルが無ければ空配列
 */
const _ineffectiveLines = (results: readonly MutantResult[]): string[] => {
  const _warnings = _effectiveResultsByFile(results)
    .filter(([, fileResults]) => fileResults.every((result) => result.status === 'survived'))
    .map(([file]) => `${REPORT_WARNING_PREFIX}${file} ${REPORT_WARNING_ALL_SURVIVED}（${REPORT_WARNING_INEFFECTIVE}）`);
  return _warnings.length > 0 ? ['', ..._warnings] : [];
};

/**
 * 中断時の見出しの行を作る。中断していなければ何も出さない (R-605 / DD-06)。
 *
 * @param interrupted - SIGINT で中断したか
 * @returns 中断時は見出しの行、中断していなければ空配列
 */
const _interruptedLines = (interrupted: boolean): string[] => interrupted ? [REPORT_HEADING_INTERRUPTED] : [];

/**
 * 変異体 0 件の行を作る。生成件数が 0 のときだけ出し、判定済みの件数は見ない (R-606)。
 *
 * 中断で判定済みが 0 件でも、生成件数が 1 以上なら出さない。
 *
 * @param generatedCount - 生成した変異体の件数
 * @returns 生成件数が 0 なら `変異体 0 件` の行、それ以外は空配列
 */
const _noMutantLines = (generatedCount: number): string[] => generatedCount === 0 ? [REPORT_NO_MUTANTS] : [];

/**
 * 1 回の変異テスト実行の要約を、人が読む報告の文字列に整形する (report-cli R-605 / R-606 / R-607 / R-608 / R-609 / R-610 / R-611 / R-612 / R-613)。
 * I/O・時刻・乱数を使わない純粋関数。
 *
 * @param summary - 変異テスト実行の要約
 * @returns 報告の文字列
 */
export const formatReport = (summary: MutationRunReport): string => {
  return [
    ..._interruptedLines(summary.interrupted),
    ..._noMutantLines(summary.generatedCount),
    ...MUTANT_STATUSES.flatMap((status) => _statusLines(summary, status)),
    _killRateLine(summary),
    _effectiveRateLine(summary),
    ..._sectionLines(
      REPORT_HEADING_UNALLOWED,
      summary.match.unallowed.toSorted(_compareMutantPosition).map(_mutantLine),
    ),
    ..._sectionLines(REPORT_HEADING_STALE, summary.match.stale.map(_staleEntryLine)),
    ..._sectionLines(REPORT_HEADING_DRIFT, summary.drift),
    ..._leftoverLines(summary.leftovers),
    ..._ineffectiveLines(summary.results),
  ].join('\n');
};

/**
 * 監査が成立しなかったかを返す。drift または監査単位の失敗 (execution DD-14) があれば成立しない (R-615)。
 *
 * @param summary - 変異テスト実行の要約
 * @returns drift または監査単位の失敗が 1 件以上あれば true
 */
const _isAuditBroken = (summary: MutationRunReport): boolean =>
  summary.drift.length > 0 || summary.auditFailures.length > 0;

/**
 * `--strict` の検査に掛かるかを返す。未許容の生存 (R-617)、変異体が 1 件以上あるのに有効な判定が 0 件 (R-618)、
 * 古い許容エントリ (R-619) のいずれかがあれば掛かる。
 *
 * @param summary - 変異テスト実行の要約
 * @returns `--strict` の検査に掛かれば true
 */
const _failsStrictCheck = (summary: MutationRunReport): boolean =>
  summary.match.unallowed.length > 0
  || (summary.generatedCount > 0 && _effectiveCountOf(summary) === 0)
  || summary.match.stale.length > 0;

/**
 * 変異テスト実行の要約と `--strict` の有無から、プロセスの終了コードを決める (report-cli 4.3)。
 * I/O・時刻・乱数を使わない純粋関数。
 *
 * 次の順に評価し、最初に該当した規則で終了コードが決まる。
 *
 * 1. 中断した → `EXIT_CODE_INTERRUPTED` (R-614)
 * 2. drift または監査単位の失敗がある → `EXIT_CODE_FAILURE` (R-615)
 * 3. `--strict` なし → `EXIT_CODE_OK` (R-616)
 * 4. `--strict` で未許容の生存がある → `EXIT_CODE_FAILURE` (R-617)
 * 5. `--strict` で変異体が 1 件以上あるのに有効な判定が 0 件 → `EXIT_CODE_FAILURE` (R-618)
 * 6. `--strict` で古い許容エントリがある → `EXIT_CODE_FAILURE` (R-619)
 * 7. いずれにも該当しない → `EXIT_CODE_OK` (R-620)
 *
 * @param summary - 変異テスト実行の要約
 * @param strict - `--strict` を指定したか
 * @returns 終了コード
 */
export const decideExitCode = (summary: MutationRunReport, strict: boolean): number => {
  if (summary.interrupted) {
    return EXIT_CODE_INTERRUPTED;
  }
  if (_isAuditBroken(summary)) {
    return EXIT_CODE_FAILURE;
  }
  if (!strict) {
    return EXIT_CODE_OK;
  }
  return _failsStrictCheck(summary) ? EXIT_CODE_FAILURE : EXIT_CODE_OK;
};
