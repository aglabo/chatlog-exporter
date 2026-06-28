// src: skills/_scripts/libs/io/parse-args.ts
// @(#): CLI 引数の汎用パーサー
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared modules ---
// functions
import { isKnownAgent } from '../../constants/agents.constants.ts';
import { normalizePath, toSlashPath } from '../path-utils/path-utils.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
// types
import type { ArgSchemaEntry, ArgsSchema } from '../../types/args-schema.types.ts';

// -- internal modules ---
// functions
/** `YYYY-MM` または `YYYY` 形式の文字列の場合 `true` を返す（CLI 位置引数の期間判定）。 */
export const isArgPeriod = (arg: string): boolean => /^\d{4}-\d{2}$/.test(arg) || /^\d{4}$/.test(arg);

/** バックスラッシュをスラッシュに変換後に `/` を含む場合 `true` を返す（CLI 位置引数のディレクトリパス判定）。 */
export const isArgDirectory = (arg: string): boolean => {
  return toSlashPath(arg).includes('/');
};

// --- Public API ---

/** デフォルトで有効な位置引数フィールド定義。 */
const _DEFAULT_SCHEMA: ArgsSchema = [
  { option: 'period', field: 'period', type: 'period' },
  { option: 'agent', field: 'agent', type: 'agent' },
  { option: 'chatlogsDir', field: 'chatlogsDir', type: 'directory' },
];

/**
 * デフォルトスキーマと呼び出し元スキーマを結合して `Map` を返す純粋関数。
 *
 * @param schema - 呼び出し元が追加するスキーマ
 * @returns オプション名をキーとする `ArgSchemaEntry` の Map
 */
const _initSchema = (schema: ArgsSchema): Map<string, ArgSchemaEntry> => {
  const _merged = [..._DEFAULT_SCHEMA, ...schema];
  return new Map(_merged.map((e) => [e.option, e]));
};

/**
 * エントリと生の文字列値を受け取り、型ごとに変換・検証してから `config` にセットする。
 * `flag` 型は `rawValue` 不要で呼び出せる（フラグはそのまま `true` をセットする）。
 * `negated=true` の場合、`flag` 型は `false` をセットし、非 `flag` 型はエラーを返す。
 *
 * @param config - 値をセット対象となる設定オブジェクト（参照渡し、副作用あり）
 * @param entry  - スキーマエントリ
 * @param rawValue - CLI から取得した生文字列。`flag` 型では省略可能
 * @param negated - `--no-<xx>` 形式の否定フラグの場合 `true`
 * @returns 成功時 `null`、失敗時 `ChatlogError`
 */
const _setByType = (
  config: Record<string, string | boolean | number>,
  entry: ArgSchemaEntry,
  rawValue?: string,
  negated?: boolean,
): ChatlogError | null => {
  // flag は rawValue 不要。rawValue が渡された場合はエラー
  if (entry.type === 'flag') {
    if (rawValue !== undefined) {
      return new ChatlogError('InvalidArgs', `フラグに値は指定できません: ${entry.option}`);
    }
    config[entry.field] = !negated;
    return null;
  }
  // flag 以外に negated を指定した場合はエラー
  if (negated) {
    return new ChatlogError('InvalidArgs', `--no- は flag 型にのみ使用できます: ${entry.option}`);
  }
  switch (entry.type) {
    case 'string':
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      config[entry.field] = rawValue;
      return null;
    case 'agent':
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      if (!isKnownAgent(rawValue)) {
        return new ChatlogError('InvalidArgs', `不明なエージェント: ${rawValue}`);
      }
      config[entry.field] = rawValue;
      return null;
    case 'integer': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      const _n = parseInt(rawValue, 10);
      if (isNaN(_n)) {
        return new ChatlogError('InvalidArgs', `整数ではありません: ${rawValue}`);
      }
      config[entry.field] = _n;
      return null;
    }
    case 'number': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      const _n = parseFloat(rawValue);
      if (isNaN(_n)) {
        return new ChatlogError('InvalidArgs', `数値ではありません: ${rawValue}`);
      }
      config[entry.field] = _n;
      return null;
    }
    case 'period': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      if (!isArgPeriod(rawValue)) {
        return new ChatlogError('InvalidArgs', `期間形式ではありません（YYYY または YYYY-MM）: ${rawValue}`);
      }
      config[entry.field] = rawValue;
      return null;
    }
    case 'directory': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', `値が空です: ${entry.option}`);
      }
      if (!isArgDirectory(rawValue)) {
        return new ChatlogError('InvalidArgs', `ディレクトリ形式ではありません: ${rawValue}`);
      }
      const _dir = normalizePath(rawValue);
      config[entry.field] = _dir;
      return null;
    }
  }
};

/**
 * `args[i]` を `--key`/`--key=value`/`--key next` 形式で分解して返す。
 *
 * - `--key` の場合（flag 型）: `_option=--key`, `_rawValue=undefined`, `_nextIndex=i`
 * - `--key=value` の場合（flag 型）: `_option=--key`, `_rawValue=value`, `_nextIndex=i`（エラー判定は呼び出し元）
 * - `--key=value` の場合（非 flag 型）: `_option=--key`, `_rawValue=value`, `_nextIndex=i`（`i` を進めない）
 * - `--key next` の場合: `_option=--key`, `_rawValue=next`, `_nextIndex=i+1`（次トークンを消費）
 * - 次トークンがない場合: `_rawValue=undefined`, `_nextIndex=i`
 *
 * @param args - CLI 引数配列全体
 * @param i - 現在のインデックス。`_nextIndex` を `i` に代入することで消費済みトークンをスキップできる
 * @param schemaMap - オプション名をキーとするスキーマ Map（flag 型の判定に使用）
 * @returns `_option`（`--key` 部分）、`_rawValue`（値、取得不能時 `undefined`）、`_nextIndex`（次に処理すべきインデックス）
 */
const _getOptionAndValue = (
  args: string[],
  i: number,
  schemaMap: Map<string, ArgSchemaEntry>,
): { _option: string; _rawValue?: string; _nextIndex: number } => {
  const arg = args[i];
  const _eqIdx = arg.indexOf('=');

  // flag 型: = あり・なし両方を処理し、_rawValue に値を含めて返す
  const _optionName = _eqIdx !== -1 ? arg.slice(0, _eqIdx) : arg;
  const _exactEntry = schemaMap.get(_optionName);
  if (_exactEntry?.type === 'flag') {
    const _rawValue = _eqIdx !== -1 ? arg.slice(_eqIdx + 1) : undefined;
    return { _option: _optionName, _rawValue, _nextIndex: i };
  }
  if (_eqIdx !== -1) {
    return { _option: arg.slice(0, _eqIdx), _rawValue: arg.slice(_eqIdx + 1), _nextIndex: i };
  }
  if (i + 1 < args.length) {
    return { _option: arg, _rawValue: args[i + 1], _nextIndex: i + 1 };
  }
  return { _option: arg, _rawValue: undefined, _nextIndex: i };
};

/** テスト専用エクスポート: `_setByType` の型検証・変換ロジックを直接テストするためのラッパー。 */
export const _setByTypeForTest = _setByType;

/** テスト専用エクスポート: `_initSchema` を直接テストするためのラッパー。 */
export const _initSchemaForTest = _initSchema;

/**
 * CLI 引数を解析して Partial<T> を返す汎用パーサー。
 *
 * 位置引数の解釈は T が `period`/`agent`/`chatlogsDir` を持つことを前提とする。
 * - `YYYY-MM` 形式 → `period`
 * - 既知エージェント名 → `agent`
 * - ディレクトリパス → `chatlogsDir`
 */
export const parseArgsToConfig = <T extends { period?: string; agent?: string; chatlogsDir?: string }>(
  args: string[],
  schema: ArgsSchema,
): Partial<T> => {
  const _config: Record<string, string | boolean | number> = {};
  const _schemaMap = _initSchema(schema);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const _isNegation = arg.startsWith('--no-') && !_schemaMap.has(arg.split('=')[0]);
      const _lookupKey = _isNegation ? '--' + arg.slice('--no-'.length) : arg;

      if (_isNegation && arg.includes('=')) {
        throw new ChatlogError('InvalidArgs', `--no- フラグに値は指定できません: ${arg}`);
      }

      const { _option, _rawValue, _nextIndex } = _isNegation
        ? { _option: arg, _rawValue: undefined, _nextIndex: i }
        : _getOptionAndValue(args, i, _schemaMap);
      const _entry = _schemaMap.get(_isNegation ? _lookupKey : _option);

      if (_entry === undefined) {
        throw new ChatlogError('InvalidArgs', `不明なオプション: ${arg}`);
      }

      const err = _setByType(_config, _entry, _rawValue, _isNegation);
      if (err) { throw err; }
      i = _nextIndex;
      continue;
    }

    // 位置パラメータ解釈
    if (isArgPeriod(arg)) {
      const err = _setByType(_config, _schemaMap.get('period')!, arg);
      if (err) { throw err; }
    } else if (isKnownAgent(arg)) {
      const err = _setByType(_config, _schemaMap.get('agent')!, arg);
      if (err) { throw err; }
    } else if (isArgDirectory(arg)) {
      const err = _setByType(_config, _schemaMap.get('chatlogsDir')!, arg);
      if (err) { throw err; }
    } else {
      throw new ChatlogError('InvalidArgs', `不明な引数: ${arg}`);
    }
  }

  return _config as Partial<T>;
};
