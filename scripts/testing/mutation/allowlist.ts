// src: scripts/testing/mutation/allowlist.ts
// @(#): 許容リスト (等価変異体の判断記録) の読み込みと検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words unallowed

import { fromFileUrl, join } from '@std/path';
import { isAbsolute as isAbsolutePosix } from '@std/path/posix';
import { isAbsolute as isAbsoluteWindows } from '@std/path/windows';
import { parse as parseYaml } from '@std/yaml';

import { ChatlogError } from '../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { readTextFile } from '../../../skills/_cle-libs/libs/file-io/read-utils.ts';

import type {
  AllowlistEntry,
  AllowlistMatch,
  LoadAllowlistOptions,
  Mutant,
  MutantResult,
  MutationOp,
} from './types/mutation.types.ts';

export type { AllowlistEntry, AllowlistMatch, LoadAllowlistOptions } from './types/mutation.types.ts';

/** 許容リストの既定の読み込み元 (`scripts/testing/mutation/allowlist/`)。 */
const _DEFAULT_ALLOWLIST_DIR = fromFileUrl(new URL('./allowlist/', import.meta.url));

/**
 * `MutationOp` の各値の表。キーの過不足は型検査で検出されるため、`MutationOp` と食い違わない。
 * 値の並びは `MutationOp` の宣言順に揃える (エラーメッセージの許可値一覧に使う)。
 */
const _MUTATION_OP_TABLE: Readonly<Record<MutationOp, true>> = {
  relational: true,
  equality: true,
  logical: true,
  boolean: true,
  number: true,
  negation: true,
};

/** `op` として受け付ける値の一覧。 */
const _MUTATION_OPS = Object.keys(_MUTATION_OP_TABLE) as MutationOp[];

/**
 * 許容リストの本文を YAML として解釈する (allowlist R-502)。
 *
 * @param text - 許容リストの本文
 * @param filePath - 許容リストのパス (エラーメッセージに含める)
 * @returns 解釈した YAML 文書
 * @throws {ChatlogError} YAML として解釈できないとき (`InvalidYaml`)
 */
const _parseDocument = (text: string, filePath: string): unknown => {
  try {
    return parseYaml(text);
  } catch (e) {
    const _reason = e instanceof Error ? e.message : String(e);
    throw new ChatlogError(
      'InvalidYaml',
      'YamlSyntaxError',
      `許容リストを YAML として解釈できない: ${filePath}: ${_reason}`,
    );
  }
};

/**
 * エラーメッセージに埋め込むために属性の値を文字列にする。文字列はそのまま、それ以外は JSON 表記で返す。
 * 文字列化できない値 (循環参照・`toString` を持たないオブジェクト等) でも例外を投げず、
 * 型名の表記に落とすことで、メッセージ生成が `TypeError` になって一括報告 (DD-05) が崩れるのを防ぐ。
 *
 * @param value - 属性の値
 * @returns メッセージ用の文字列
 */
const _formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

/** 文字列であることだけを検証する属性。 */
const _STRING_KEYS = ['file', 'lineText', 'before', 'after'] as const satisfies readonly (keyof AllowlistEntry)[];

/**
 * 文字列の属性を検証する。欠落と文字列以外の値を不正とする (allowlist R-504 / impl §3.4 #2)。
 *
 * @param key - 属性名
 * @param value - 属性の値
 * @returns 不正の説明 (正しければ空配列)
 */
const _checkString = (key: keyof AllowlistEntry, value: unknown): string[] => {
  if (value === undefined) {
    return [`${key} が無い`];
  }
  return typeof value === 'string' ? [] : [`${key} が文字列でない: ${_formatValue(value)}`];
};

/**
 * `file` の形式を検証する。`/` 区切りのリポジトリルート相対パスだけを受け付ける (allowlist R-504 / impl §3.4 #3)。
 * 文字列でない値は `_checkString` が報告するため、ここでは扱わない。
 *
 * @param value - `file` の値
 * @returns 不正の説明 (正しければ空配列)
 */
const _checkFilePath = (value: unknown): string[] =>
  typeof value === 'string' && (value.includes('\\') || isAbsolutePosix(value) || isAbsoluteWindows(value))
    ? [`file が / 区切りのリポジトリルート相対パスでない: ${_formatValue(value)}`]
    : [];

/**
 * `reason` を検証する。欠落 (`null` を含む)・文字列以外・空・空白のみを不正とする (allowlist R-503 / impl §3.4 #1)。
 *
 * @param value - `reason` の値
 * @returns 不正の説明 (正しければ空配列)
 */
const _checkReason = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return ['reason が無い'];
  }
  if (typeof value !== 'string') {
    return [`reason が文字列でない: ${_formatValue(value)}`];
  }
  return value.trim() === '' ? ['reason が空'] : [];
};

/**
 * `occurrence` を検証する。1 以上の整数だけを受け付ける (allowlist R-504 / DD-03)。
 *
 * @param value - `occurrence` の値
 * @returns 不正の説明 (正しければ空配列)
 */
const _checkOccurrence = (value: unknown): string[] =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? []
    : [`occurrence が 1 以上の整数でない: ${_formatValue(value)}`];

/**
 * `op` を検証する。`MutationOp` の値だけを受け付ける (allowlist R-504)。
 *
 * @param value - `op` の値
 * @returns 不正の説明 (正しければ空配列)
 */
const _checkOp = (value: unknown): string[] =>
  _MUTATION_OPS.includes(value as MutationOp)
    ? []
    : [`op が MutationOp に無い: ${_formatValue(value)} (許可値: ${_MUTATION_OPS.join(', ')})`];

/**
 * 値がマッピング (`null` でも配列でもないオブジェクト) かを判定する。
 *
 * @param value - 許容リストの列の要素
 * @returns マッピングなら `true`
 */
const _isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * エントリ 1 件を検証し、見つかった不正をすべて返す (allowlist R-503 / R-504)。
 * マッピングでないエントリは属性を検証せず、その旨だけを返す。
 *
 * @param entry - 許容リストの列の要素
 * @returns 不正の説明 (正しければ空配列)
 */
const _validateEntry = (entry: unknown): string[] => {
  if (!_isMapping(entry)) {
    return ['エントリがマッピングでない'];
  }
  return [
    ..._STRING_KEYS.flatMap((key) => _checkString(key, entry[key])),
    ..._checkFilePath(entry.file),
    ..._checkReason(entry.reason),
    ..._checkOp(entry.op),
    ..._checkOccurrence(entry.occurrence),
  ];
};

/** 照合キーを構成する属性 (`reason` を除く 6 属性、DR-04)。 */
const _MATCH_KEYS = ['file', 'lineText', 'op', 'before', 'after', 'occurrence'] as const satisfies readonly (
  keyof AllowlistEntry
)[];

/**
 * 照合キーの属性値を比較用に正規化する。`lineText` は前後の空白を除いて比べる (DD-01)。
 *
 * @param key - 照合キーの属性名
 * @param value - 属性の値
 * @returns 比較用の値
 */
const _normalizeMatchValue = (key: (typeof _MATCH_KEYS)[number], value: unknown): unknown =>
  key === 'lineText' && typeof value === 'string' ? value.trim() : value;

/**
 * エントリ (または出現順を付けた変異体) の照合キーを比較用の文字列にする。マッピングでないエントリは照合の対象外とする。
 *
 * @param entry - 許容リストの列の要素、または出現順を付けた変異体
 * @returns 照合キーの 6 属性を並べた JSON 文字列 (マッピングでなければ `null`)
 */
const _toMatchKey = (entry: unknown): string | null =>
  _isMapping(entry) ? JSON.stringify(_MATCH_KEYS.map((key) => _normalizeMatchValue(key, entry[key]))) : null;

/**
 * 出現順を数える範囲 (同一 `file` + 同一 `line` + 同一 `before`) を表す比較用の文字列にする。
 *
 * @param mutant - 変異体
 * @returns `file` / `line` / `before` を並べた JSON 文字列
 */
const _toOccurrenceGroup = (mutant: Mutant): string => JSON.stringify([mutant.file, mutant.line, mutant.before]);

/**
 * 生成された全変異体から、変異体の行内の出現順を引く関数を作る (allowlist DD-03)。
 * 同一 `file` + 同一 `line` で `before` が同じ生成済み変異体の、相異なる `column` を昇順に並べた 1 始まりの順位とする。
 * 置換後の字句 (`after`) は順位に影響せず、`before` が異なる箇所 (`<` に対する `<=` 等) は数えない。
 * 全変異体を 1 回だけ走査して順位表を作り、変異体ごとの全走査を避ける。
 *
 * @param mutants - 生成された全変異体
 * @returns 変異体を受け取り 1 始まりの出現順を返す関数 (表に無い変異体は 1)
 */
const _buildOccurrenceOf = (mutants: readonly Mutant[]): (mutant: Mutant) => number => {
  const _columnsByGroup = mutants.reduce((acc, mutant) => {
    const _group = _toOccurrenceGroup(mutant);
    return acc.set(_group, (acc.get(_group) ?? new Set<number>()).add(mutant.column));
  }, new Map<string, Set<number>>());
  const _rankByGroup = new Map(
    [..._columnsByGroup].map(([group, columns]) => [
      group,
      new Map([...columns].sort((a, b) => a - b).map((column, index) => [column, index + 1])),
    ]),
  );
  return (mutant) => _rankByGroup.get(_toOccurrenceGroup(mutant))?.get(mutant.column) ?? 1;
};

/**
 * 照合キーが先行エントリと重複するエントリを、両方の位置とともに報告する (allowlist R-504 / impl §3.4 #4)。
 *
 * @param entries - 許容リストの列
 * @returns 不正の説明 (重複が無ければ空配列)
 */
const _findDuplicates = (entries: readonly unknown[]): string[] => {
  const _keys = entries.map(_toMatchKey);
  return _keys.flatMap((key, index) => {
    const _first = key === null ? index : _keys.indexOf(key);
    return _first < index ? [`${index + 1} 件目: 照合キーが ${_first + 1} 件目と重複している`] : [];
  });
};

/** 空白だけ、またはコメントだけの行。 */
const _BLANK_LINE_PATTERN = /^\s*(#.*)?$/;

/**
 * 本文が空 (内容なし・空白とコメントの行だけ) かを判定する。
 * `@std/yaml` は空文書と明示的な `null` 文書 (`~` / `null` / `---`) をどちらも `null` で返すため、本文で区別する。
 *
 * @param text - 許容リストの本文
 * @returns 全行が空白またはコメントなら `true`
 */
const _isBlankDocument = (text: string): boolean => text.split(/\r?\n/).every((line) => _BLANK_LINE_PATTERN.test(line));

/**
 * 許容リストのファイルを読み、エントリの列 (未検証) を取り出す (allowlist R-501 / R-502)。
 * ファイルが無い・本文が空 (内容なし・空白とコメントの行だけ) のときはエントリ 0 件とする (DD-04)。
 * `~` / `null` / `---` のような明示的な `null` 文書は空とみなさず、最上位が列でない読み込みエラーとする (impl §3.4 #5)。
 *
 * @param filePath - 許容リストのパス
 * @returns 未検証のエントリの列
 * @throws {ChatlogError} YAML として解釈できない・最上位が列でないとき
 */
const _readEntries = async (filePath: string): Promise<unknown[]> => {
  const _text = await readTextFile(filePath, { throwFileIoError: false });
  if (_text instanceof ChatlogError && _text.kind === 'FileDirNotFound') {
    return [];
  }
  if (_text instanceof Error) {
    throw _text;
  }
  const _document = _parseDocument(_text, filePath);
  if (_document === null && _isBlankDocument(_text)) {
    return [];
  }
  if (!Array.isArray(_document)) {
    throw new ChatlogError(
      'InvalidFormat',
      'InvalidAllowlist',
      `許容リストの最上位がエントリの列ではない: ${filePath}`,
    );
  }
  return _document;
};

/**
 * 全エントリを検証し、見つかった不正をエントリ位置付きですべて返す (allowlist R-503〜R-505 / DD-05)。
 *
 * @param entries - 未検証のエントリの列
 * @returns 不正の説明 (正しければ空配列)
 */
const _collectErrors = (entries: readonly unknown[]): string[] => [
  ...entries.flatMap((entry, index) => _validateEntry(entry).map((message) => `${index + 1} 件目: ${message}`)),
  ..._findDuplicates(entries),
];

/**
 * 対象モジュールの許容リスト `<allowlistDir>/<module>.yaml` を読み込む (allowlist R-501〜R-505)。
 * ファイルが無ければエントリ 0 件として扱い、エラーにしない (DD-04)。
 * 全エントリを先に検証し、不正が 1 件でもあれば部分的に返さず、すべての不正を 1 つの `ChatlogError` に列挙する (DD-05)。
 *
 * @param module - 対象モジュールの短縮名 (ファイル名の stem)
 * @param options - 読み込み元ディレクトリ
 * @returns 許容リストのエントリ
 * @throws {ChatlogError} YAML として解釈できない・最上位が列でない・不正なエントリがあるとき
 */
export const loadAllowlist = async (
  module: string,
  options: LoadAllowlistOptions = {},
): Promise<AllowlistEntry[]> => {
  const { allowlistDir = _DEFAULT_ALLOWLIST_DIR } = options;
  const _filePath = join(allowlistDir, `${module}.yaml`);
  const _entries = await _readEntries(_filePath);
  const _errors = _collectErrors(_entries);
  if (_errors.length > 0) {
    throw new ChatlogError(
      'InvalidFormat',
      'InvalidAllowlist',
      `許容リストに不正なエントリがある: ${_filePath}\n${_errors.join('\n')}`,
    );
  }
  return _entries as AllowlistEntry[];
};

/** 変異体の同一性を構成する属性 (`Mutant` の全 7 属性)。 */
const _MUTANT_IDENTITY_KEYS = [
  'file',
  'line',
  'column',
  'op',
  'before',
  'after',
  'lineText',
] as const satisfies readonly (
  keyof Mutant
)[];

/**
 * 変異体の全属性を固定順に並べた比較用の文字列にする。参照ではなく値で同一性を判定するために使う。
 *
 * @param mutant - 変異体
 * @returns 全 7 属性を並べた JSON 文字列
 */
const _toMutantIdentity = (mutant: Mutant): string => JSON.stringify(_MUTANT_IDENTITY_KEYS.map((key) => mutant[key]));

/**
 * 判定の変異体がすべて生成された変異体に含まれることを確かめる (cle-kju.17.2.2)。
 * 出現順は生成された全変異体から求めるため、含まれない変異体は出現順 1 として黙って一致してしまう。
 *
 * @param mutants - 生成された全変異体
 * @param results - 変異体の判定
 * @throws {ChatlogError} 生成されていない変異体の判定があるとき (`MutantNotGenerated`)
 */
const _assertResultsGenerated = (mutants: readonly Mutant[], results: readonly MutantResult[]): void => {
  const _generated = new Set(mutants.map(_toMutantIdentity));
  const _unknown = results.map((result) => result.mutant).filter((mutant) =>
    !_generated.has(_toMutantIdentity(mutant))
  );
  if (_unknown.length > 0) {
    const _locations = _unknown.map((mutant) => `${mutant.file}:${mutant.line}:${mutant.column}`);
    throw new ChatlogError(
      'InvalidArgs',
      'MutantNotGenerated',
      `生成されていない変異体の判定が ${_unknown.length} 件ある: ${_locations.join(', ')}`,
    );
  }
};

/**
 * survived の変異体を許容リストと照合し、許容済み・未許容の生存と古いエントリに振り分ける (allowlist R-506〜R-510)。
 * 照合キーは `file` + 前後の空白を除いた `lineText` + `op` + `before` + `after` + 出現順で、行番号は含めない (DD-01 / DR-04)。
 * 変異体の出現順は生成された全変異体から求める (DD-03)。1 エントリは複数の変異体に一致しうる (DD-02)。
 *
 * - `allowed` / `unallowed`: `status === 'survived'` の判定だけが対象。1 件以上のエントリに一致すれば許容済み
 * - `stale`: 生成されたどの変異体 (判定の有無・種類を問わない) にも一致しないエントリ (DD-06)
 *
 * 前提: `results` の変異体はすべて `mutants` に含まれる (全属性の値で比較し、参照は問わない)。
 * 含まれない変異体は出現順を正しく求められず allowed と stale が同時に立ちうるため、判定の種類を問わず照合前に拒否する。
 *
 * @param mutants - 生成された全変異体 (中断で判定の無い変異体を含む)
 * @param results - 変異体の判定
 * @param entries - 許容リストのエントリ
 * @returns 許容済みの生存・未許容の生存・古いエントリ
 * @throws {ChatlogError} `results` に生成されていない変異体の判定があるとき (`InvalidArgs` / `MutantNotGenerated`)
 */
export const matchAllowlist = (
  mutants: readonly Mutant[],
  results: readonly MutantResult[],
  entries: readonly AllowlistEntry[],
): AllowlistMatch => {
  _assertResultsGenerated(mutants, results);
  const _entryKeys = new Set(entries.map(_toMatchKey));
  const _occurrenceOf = _buildOccurrenceOf(mutants);
  const _mutantKey = (mutant: Mutant): string | null => _toMatchKey({ ...mutant, occurrence: _occurrenceOf(mutant) });
  const _generatedKeys = new Set(mutants.map(_mutantKey));
  const _isAllowed = (mutant: Mutant): boolean => _entryKeys.has(_mutantKey(mutant));
  const _survivors = results.filter((result) => result.status === 'survived').map((result) => result.mutant);
  const _allowedFlags = _survivors.map(_isAllowed);
  return {
    allowed: _survivors.filter((_mutant, index) => _allowedFlags[index]),
    unallowed: _survivors.filter((_mutant, index) => !_allowedFlags[index]),
    stale: entries.filter((entry) => !_generatedKeys.has(_toMatchKey(entry))),
  };
};
