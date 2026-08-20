// src: skills/_cle-libs/classes/GlobalConfig.class.ts
// @(#): グローバル設定シングルトン（スキーマ検証付き）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- external modules
// yaml
import { parse } from '@std/yaml';

// --- local modules
// libs
import { resolveConfigPath } from '../libs/path-utils/resolve-path.ts';
import { parseNumber, parseString } from '../libs/text/string-utils.ts';
// constants
import { DEFAULT_CONFIG_SCHEMA, DEFAULT_CONFIG_VALUES } from '../constants/config-schema.constants.ts';
import { DEFAULT_APP_NAME, DEFAULT_CONFIG_FILE } from '../constants/defaults.constants.ts';
// types
import type { ConfigKey } from '../constants/config-schema.constants.ts';
import type { ConfigSchema, ConfigValue, ConfigValues } from '../types/config-schema.types.ts';
import type { ReadTextFileSyncProvider } from '../types/providers.types.ts';
// classes
import { ChatlogError } from './ChatlogError.class.ts';

/**
 * グローバル設定シングルトン。スキーマ検証付き。
 * - `getInstance(options?)` でシングルトンインスタンスを取得する。既にインスタンスが存在する場合は既存のインスタンスを返す。
 * - `get(key: string): string | number` で値を取得する。すべてのスキーマキーはデフォルト値を持つため `undefined` は返さない。
 * - `values(): ConfigValues` で全フィールドの値を `{ field: value }` 形式で返す。
 * - `parseYaml(text: string): Partial<ConfigValues>` で YAML テキストをパースし `Partial<ConfigValues>` に変換する。スキーマにないキーは `ChatlogError('InvalidYaml')` をスローする。
 * - テスト専用の `resetInstance()` メソッドでシングルトンインスタンスをリセットできる。プロダクションコードからは呼び出さないこと。
 */
export class GlobalConfig {
  private static _instance: GlobalConfig | undefined;
  private static readonly _DEFAULT_READ_TEXT_FILE: ReadTextFileSyncProvider = (path: string) =>
    Deno.readTextFileSync(path);
  private _schema: ConfigSchema;
  private _fields: ConfigValues = {} as ConfigValues;
  private _appName: string;

  private constructor(schema?: ConfigSchema, appName?: string) {
    this._schema = schema || DEFAULT_CONFIG_SCHEMA;
    this._fields = { ...DEFAULT_CONFIG_VALUES } as ConfigValues;
    this._appName = appName ?? DEFAULT_APP_NAME;
  }

  /**
   * シングルトンインスタンスを返す。インスタンスが未生成の場合は `options` を使って新規生成する。
   * 設定ソースの優先順位は `yaml` > `configFile` > `defaultConfigFile` > `DEFAULT_CONFIG_FILE` > `DEFAULT_CONFIG_VALUES`。
   * - `yaml` が指定されていれば YAML 文字列を直接パースして `_fields` を上書きする（`configFile` より優先）。
   * - `configFile` が指定されていれば YAML を読み込んで `_fields` を上書きする（DEFAULT_CONFIG_VALUES + YAML 値）。
   * - `defaultConfigFile` は `yaml`・`configFile` がいずれも未指定のときだけ読み込む既定の設定ファイルパス。
   * - `yaml`・`configFile`・`defaultConfigFile` がいずれも未指定の場合は `DEFAULT_CONFIG_FILE`
   *   （`configDir` 相対の `config.yaml`）を読み込む。
   * - `configFile` が明示指定されたときだけ、ファイルが存在しない場合に
   *   `ChatlogError('FileDirNotFound', 'ConfigNotFound')` をスローする（fail-first）。
   *   それ以外（`defaultConfigFile` 指定時・既定パス使用時）はエラーを無視して `DEFAULT_CONFIG_VALUES` のまま返す。
   * - `appName` はオプションとして受け付け、`configDir`（設定ファイル・辞書・プロンプトの基準ディレクトリ）の組み立てに使用する。
   * - 既にインスタンスが存在する場合は `options` を無視して既存インスタンスを返す。
   */
  static getInstance(options?: {
    schema?: ConfigSchema;
    configFile?: string;
    yaml?: string;
    defaultConfigFile?: string;
    readTextFileProvider?: ReadTextFileSyncProvider;
    appName?: string;
  }): GlobalConfig {
    if (GlobalConfig._instance) {
      return GlobalConfig._instance;
    }

    GlobalConfig._instance = new GlobalConfig(options?.schema, options?.appName);
    // 設定ソースの優先順位: yaml > configFile > defaultConfigFile > DEFAULT_CONFIG_VALUES
    if (options?.yaml !== undefined) {
      const _loaded = GlobalConfig._instance.parseYaml(options.yaml);
      GlobalConfig._instance._fields = { ...DEFAULT_CONFIG_VALUES, ..._loaded } as ConfigValues;
    } else {
      const _loaded = GlobalConfig._instance.loadConfigFile({
        configPath: options?.configFile ?? options?.defaultConfigFile,
        readTextFileProvider: options?.readTextFileProvider,
        throwFileNotFound: options?.configFile !== undefined,
      });
      GlobalConfig._instance._fields = { ...DEFAULT_CONFIG_VALUES, ..._loaded } as ConfigValues;
    }
    return GlobalConfig._instance;
  }

  /** テスト専用: シングルトンインスタンスをリセットする。プロダクションコードからは呼び出さないこと。 */
  static resetInstance(): void {
    GlobalConfig._instance = undefined;
  }

  /** `key` に対応する値を返す。すべてのスキーマキーはデフォルト値を持つため `undefined` は返さない。 */
  get(key: ConfigKey): string | number {
    const _value = this._fields[key];
    return _value;
  }

  /** 設定ファイル・辞書・プロンプトの基準ディレクトリ（プロジェクトルート相対）。appName を反映する。 */
  get configDir(): string {
    return `.config/${this._appName}`;
  }

  /** GlobalConfig が保持する全フィールドの値を `{ field: value }` 形式で返す。 */
  values(): ConfigValues {
    return { ...this._fields };
  }

  /**
   * YAML テキストを受け取り、`Partial<ConfigValues>` を返す。
   * ルートがオブジェクトでない場合は `ChatlogError('InvalidYaml')` をスローする。
   * 空文字列の場合は `{}` を返す。
   */
  parseYaml(text: string): Partial<ConfigValues> {
    if (text === '') {
      return {};
    }
    let _parsedYaml: unknown;
    try {
      _parsedYaml = parse(text);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', `YAML 構文エラー: ${e.message}`);
      }
      throw e;
    }
    if (typeof _parsedYaml !== 'object' || _parsedYaml === null || Array.isArray(_parsedYaml)) {
      throw new ChatlogError('InvalidYaml', 'NotObject', `YAML ルートはオブジェクトである必要があります`);
    }
    const _rawObject = _parsedYaml as Record<string, unknown>;
    this._assertKnownKeys(_rawObject);
    return this._convertFields(_rawObject);
  }

  /** `raw` のキーがすべてスキーマに存在することを検証する。スキーマにないキーは `ChatlogError('InvalidYaml')` をスローする。 */
  private _assertKnownKeys(raw: Record<string, unknown>): void {
    for (const key of Object.keys(raw)) {
      if (!(key in this._schema)) {
        throw new ChatlogError('InvalidYaml', 'UnknownKey', `不明なキー: ${key}`);
      }
    }
  }

  /** `raw` の各フィールドをスキーマの型定義に従い変換し、`Partial<ConfigValues>` を返す。 */
  private _convertFields(raw: Record<string, unknown>): Partial<ConfigValues> {
    const _result: Partial<ConfigValues> = {};
    for (const [key, value] of Object.entries(raw)) {
      const _fieldSchema = this._schema[key as keyof ConfigSchema];
      const _typeName = typeof _fieldSchema === 'string' ? _fieldSchema : _fieldSchema.type;
      const _parsed: ConfigValue | undefined = _typeName === 'string' ? parseString(value) : parseNumber(value);
      if (_parsed !== undefined) {
        if (typeof _parsed === 'number' && typeof _fieldSchema === 'object') {
          this._assertInRange(key, _parsed, _fieldSchema.min, _fieldSchema.max);
        }
        (_result as Record<string, ConfigValue>)[key] = _parsed;
      }
    }
    return _result;
  }

  /** `value` が `min`〜`max`（両端含む）の範囲内であることを検証する。範囲外の場合は `ChatlogError('InvalidYaml', 'OutOfRange')` をスローする。 */
  private _assertInRange(key: string, value: number, min: number | undefined, max: number | undefined): void {
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      throw new ChatlogError(
        'InvalidYaml',
        'OutOfRange',
        `範囲外の値です（${min ?? '-∞'}〜${max ?? '∞'}）: ${key}=${value}`,
      );
    }
  }

  /**
   * 設定ファイルを読み込み、`Partial<ConfigValues>` を返す。
   * `_fields` は変更しない（純粋関数）。
   * `throwFileNotFound` が `false` の場合、ファイル未存在時に例外をスローせず `{}` を返す（デフォルト `true`）。
   */
  loadConfigFile(options?: {
    configPath?: string;
    readTextFileProvider?: ReadTextFileSyncProvider;
    throwFileNotFound?: boolean;
  }): Partial<ConfigValues> {
    const _readTextFile = options?.readTextFileProvider ?? GlobalConfig._DEFAULT_READ_TEXT_FILE;
    const _throwFileNotFound = options?.throwFileNotFound ?? true;
    const _resolved = resolveConfigPath({
      configPath: options?.configPath,
      defaultPath: DEFAULT_CONFIG_FILE,
      config: this,
    });
    let _text: string;
    try {
      _text = _readTextFile(_resolved);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        if (!_throwFileNotFound) {
          return {};
        }
        throw new ChatlogError(
          'FileDirNotFound',
          'ConfigNotFound',
          `設定ファイル/ディレクトリが見つかりません: ${_resolved}`,
        );
      }
      throw e;
    }
    return this.parseYaml(_text);
  }
}
