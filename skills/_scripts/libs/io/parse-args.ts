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
import { GlobalConfig } from '../../classes/GlobalConfig.class.ts';
// types
import type {
  ArgSchema,
  ArgSchemaEntry,
  DefaultArgFields,
  ParsedArgs,
} from '../../types/args-schema.types.ts';

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
const _DEFAULT_ARG_SCHEMA: ArgSchema<DefaultArgFields> = [
  { option: 'period', field: 'period', type: 'period' },
  { option: 'agent', field: 'agent', type: 'agent' },
  { option: '--config', field: 'configFile', type: 'string' },
  { option: '--dry-run', field: 'dryRun', type: 'flag' },
  { option: '--input-dir', field: 'inputDir', type: 'directory' },
  { option: '--output-dir', field: 'outputDir', type: 'directory' },
];

/**
 * デフォルトスキーマと呼び出し元スキーマを結合して `Map` を返す純粋関数。
 *
 * @param schema - 呼び出し元が追加するスキーマ
 * @returns オプション名をキーとする `ArgSchemaEntry` の Map
 */
const _initSchema = (schema: ArgSchema): Map<string, ArgSchemaEntry> => {
  const _merged = [..._DEFAULT_ARG_SCHEMA, ...schema];
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
  config: ParsedArgs,
  entry: ArgSchemaEntry,
  rawValue?: string,
  negated?: boolean,
): ChatlogError | null => {
  // flag は rawValue 不要。rawValue が渡された場合はエラー
  if (entry.type === 'flag') {
    if (rawValue !== undefined) {
      return new ChatlogError('InvalidArgs', 'FlagValueNotAllowed', `フラグに値は指定できません: ${entry.option}`);
    }
    config[entry.field] = !negated;
    return null;
  }
  // flag 以外に negated を指定した場合はエラー
  if (negated) {
    return new ChatlogError('InvalidArgs', 'NegatedNonFlag', `--no- は flag 型にのみ使用できます: ${entry.option}`);
  }
  switch (entry.type) {
    case 'string':
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      config[entry.field] = rawValue;
      return null;
    case 'agent':
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      if (!isKnownAgent(rawValue)) {
        return new ChatlogError('InvalidArgs', 'UnknownAgent', `不明なエージェント: ${rawValue}`);
      }
      config[entry.field] = rawValue;
      return null;
    case 'integer': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      const _n = parseInt(rawValue, 10);
      if (isNaN(_n)) {
        return new ChatlogError('InvalidArgs', 'NotAnInteger', `整数ではありません: ${rawValue}`);
      }
      config[entry.field] = _n;
      return null;
    }
    case 'number': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      const _n = parseFloat(rawValue);
      if (isNaN(_n)) {
        return new ChatlogError('InvalidArgs', 'NotANumber', `数値ではありません: ${rawValue}`);
      }
      config[entry.field] = _n;
      return null;
    }
    case 'period': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      if (!isArgPeriod(rawValue)) {
        return new ChatlogError(
          'InvalidArgs',
          'InvalidPeriodFormat',
          `期間形式ではありません（YYYY または YYYY-MM）: ${rawValue}`,
        );
      }
      config[entry.field] = rawValue;
      return null;
    }
    case 'directory': {
      if (rawValue === undefined || rawValue === '') {
        return new ChatlogError('InvalidArgs', 'EmptyValue', `値が空です: ${entry.option}`);
      }
      if (!isArgDirectory(rawValue)) {
        return new ChatlogError('InvalidArgs', 'InvalidDirectoryFormat', `ディレクトリ形式ではありません: ${rawValue}`);
      }
      const _dir = normalizePath(rawValue);
      config[entry.field] = _dir;
      return null;
    }
  }
};

/**
 * schemaMap から option キーでエントリを取得し、`_setByType` で `config` にセットする。
 * 取得失敗時（スキーマに存在しないキー）または `_setByType` がエラーを返した場合は throw する。
 *
 * @param config - 値をセット対象となる設定オブジェクト（参照渡し、副作用あり）
 * @param schemaMap - オプション名をキーとするスキーマ Map
 * @param optionKey - 取得対象のオプションキー（例: `'--input-dir'`, `'agent'`）
 * @param rawValue - CLI から取得した生文字列
 */
const _assignEntry = (
  config: ParsedArgs,
  schemaMap: Map<string, ArgSchemaEntry>,
  optionKey: string,
  rawValue: string,
): void => {
  const _entry = schemaMap.get(optionKey);
  if (_entry === undefined) {
    throw new ChatlogError('InvalidArgs', 'UnknownSchemaEntry', `スキーマに存在しないエントリです: ${optionKey}`);
  }
  const err = _setByType(config, _entry, rawValue);
  if (err) { throw err; }
};

/**
 * output-dir 用の directory 引数を `config` にセットする。1個のみ許容し、
 * 既に `outputDir` がセット済みの場合は「位置引数が多すぎます」で throw する。
 * directory 型でない値は `_assignEntry`（`_setByType` の directory 検証）でエラーになる。
 *
 * @param config - 値をセット対象となる設定オブジェクト（参照渡し、副作用あり）
 * @param schemaMap - オプション名をキーとするスキーマ Map
 * @param rawValue - CLI から取得した生文字列
 */
const _assignOutputDirEntry = (
  config: ParsedArgs,
  schemaMap: Map<string, ArgSchemaEntry>,
  rawValue: string,
): void => {
  if ('outputDir' in config) {
    throw new ChatlogError(
      'InvalidArgs',
      'TooManyOutputDir',
      `位置引数が多すぎます（output-dir は1個のみ指定可能）: ${rawValue}`,
    );
  }
  _assignEntry(config, schemaMap, '--output-dir', rawValue);
};

/**
 * 位置引数配列をインデックスベースの固定パターンで解釈し、`config` にセットする。
 *
 * 許可パターン（idx0 のみで判定、以降は無条件で output-dir 扱い）:
 * - パターンA: idx0=directory(input-dir), idx1以降=directory(output-dir, 1個のみ許容)
 * - パターンB: idx0=agent, idx1=period（存在する場合のみ）, idx2以降=directory(output-dir, 1個のみ許容)
 * それ以外の型・順序はすべて `ChatlogError('InvalidArgs', ...)` を throw する。
 *
 * @param config - 値をセット対象となる設定オブジェクト（参照渡し、副作用あり）
 * @param positionals - `parseOptions` が返す非 `--` 引数の配列（出現順）
 * @param schemaMap - `_initSchema` が返すスキーマ Map（`_assignEntry` に渡すエントリ取得用）
 */
const _parsePositionals = (
  config: ParsedArgs,
  positionals: string[],
  schemaMap: Map<string, ArgSchemaEntry>,
): void => {
  for (let idx = 0; idx < positionals.length; idx++) {
    const _arg = positionals[idx];

    if (idx === 0 && isArgDirectory(_arg)) {
      // パターンA: idx0=input-dir
      _assignEntry(config, schemaMap, '--input-dir', _arg);
      continue;
    }

    if (idx === 0 && isKnownAgent(_arg)) {
      // パターンB: idx0=agent, idx1=period(存在時は period 形式必須)
      _assignEntry(config, schemaMap, 'agent', _arg);

      if (idx + 1 < positionals.length) {
        if (!isArgPeriod(positionals[idx + 1])) {
          throw new ChatlogError(
            'InvalidArgs',
            'InvalidPeriodPosition',
            `2番目の引数は期間形式である必要があります（YYYY または YYYY-MM）: ${positionals[idx + 1]}`,
          );
        }
        _assignEntry(config, schemaMap, 'period', positionals[idx + 1]);
        idx++;
      }
      continue;
    }

    if (idx === 0) {
      // idx0 が directory でも agent でもない -> 即エラー
      throw new ChatlogError('InvalidArgs', 'UnknownPositional', `不明な引数: ${_arg}`);
    }

    // idx1以降はすべて output-dir(directory, 1個のみ許容)
    _assignOutputDirEntry(config, schemaMap, _arg);
  }
};

/**
 * CLI 引数から `--` オプションのみを解釈し、非 `--` 引数は意味付けせずに
 * `positionals` へそのまま積んで返す。
 *
 * @param args - CLI 引数配列全体
 * @param schema - 呼び出し元が追加するスキーマ
 * @returns オプション解釈結果の `config`（`Partial<T>`）と、意味付けされていない `positionals`
 */
export const parseOptions = <T>(
  args: string[],
  schema: ArgSchema<T>,
): { config: ParsedArgs; positionals: string[] } => {
  const _config: ParsedArgs = {};
  const _positionals: string[] = [];
  const _schemaMap = _initSchema(schema);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const _eqIdx = arg.indexOf('=');
      const _optionName = _eqIdx !== -1 ? arg.slice(0, _eqIdx) : arg;
      const _isNegation = _optionName.startsWith('--no-') && !_schemaMap.has(_optionName);
      const _lookupKey = _isNegation ? '--' + _optionName.slice('--no-'.length) : _optionName;

      if (_isNegation && _eqIdx !== -1) {
        throw new ChatlogError('InvalidArgs', 'NegationWithValue', `--no- フラグに値は指定できません: ${arg}`);
      }

      const _entry = _schemaMap.get(_lookupKey);
      if (_entry === undefined) {
        throw new ChatlogError('InvalidArgs', 'UnknownOption', `不明なオプション: ${arg}`);
      }

      let _rawValue: string | undefined;
      if (_isNegation) {
        _rawValue = undefined;
      } else if (_entry.type !== 'flag' && _eqIdx === -1 && i + 1 < args.length) {
        _rawValue = args[++i];
      } else if (_eqIdx !== -1) {
        _rawValue = arg.slice(_eqIdx + 1);
      }

      const err = _setByType(_config, _entry, _rawValue, _isNegation);
      if (err) { throw err; }
      continue;
    }

    _positionals.push(arg);
  }

  return { config: _config, positionals: _positionals };
};

/**
 * CLI 引数を解析して Partial<T> を返す汎用パーサー。
 *
 * 位置引数の解釈はインデックス（出現順序）に基づく固定パターン判定で行う。
 * - パターンA（directory 系）: `positionals[0]` が directory 型 → `input-dir`。
 *   `positionals[1]` 以降はすべて directory 型（`output-dir`、1個のみ許容）。
 * - パターンB（agent/period 系）: `positionals[0]` は agent 型固定、
 *   `positionals[1]` は period 型固定（存在する場合のみ検査）。
 *   `positionals[2]` 以降はすべて directory 型（`output-dir`、1個のみ許容）。
 * - 上記以外の型混在・順序違反はすべて `ChatlogError('InvalidArgs', ...)` を throw する。
 */
export const parseArgs = <T extends { period?: string; agent?: string; chatlogsDir?: string }>(
  args: string[],
  schema: ArgSchema<T>,
  defaults: Partial<T> = {},
): T => {
  const { config: _config, positionals: _positionals } = parseOptions<T>(args, schema);
  const _schemaMap = _initSchema(schema);

  _parsePositionals(_config, _positionals, _schemaMap);

  // 優先度: CLI 解析値 > GlobalConfig 値 > defaults
  const _globalConfig = GlobalConfig.getInstance({ configFile: _config.configFile as string | undefined });
  const _globalValues = _globalConfig.values();
  const _merged: ParsedArgs = {
    ...(defaults as ParsedArgs),
    ..._globalValues,
    ..._config,
  };

  return _merged as T;
};

// --- Test-only exports ---
/** テスト専用エクスポート: `_parsePositionals` を直接テストするためのラッパー。 */
export const _parsePositionalsForTest = _parsePositionals;

/** テスト専用エクスポート: `_setByType` の型検証・変換ロジックを直接テストするためのラッパー。 */
export const _setByTypeForTest = _setByType;

/** テスト専用エクスポート: `_initSchema` を直接テストするためのラッパー。 */
export const _initSchemaForTest = _initSchema;
