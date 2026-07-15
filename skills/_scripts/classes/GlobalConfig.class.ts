// src: skills/_scripts/classes/GlobalConfig.class.ts
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
import { DEFAULT_APP_NAME } from '../constants/defaults.constants.ts';
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
 * - `parseYaml(raw: Record<string, unknown>): Partial<ConfigValues>` で YAML パース結果を `Partial<ConfigValues>` に変換する。スキーマにないキーは `ChatlogError('InvalidYaml')` をスローする。
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
   * - `yaml` が指定されていれば YAML 文字列を直接パースして `_fields` を上書きする（`configFile` より優先）。
   * - `configFile` が指定されていれば YAML を読み込んで `_fields` を上書きする（DEFAULT_CONFIG_VALUES + YAML 値）。
   * - ファイルが存在しない場合 (`FileDirNotFound`) はエラーを無視して `DEFAULT_CONFIG_VALUES` のまま返す。
   * - `appName` はオプションとして受け付け、`configDir`（設定ファイル・辞書・プロンプトの基準ディレクトリ）の組み立てに使用する。
   * - 既にインスタンスが存在する場合は `options` を無視して既存インスタンスを返す。
   */
  static getInstance(options?: {
    schema?: ConfigSchema;
    configFile?: string;
    yaml?: string;
    readTextFileProvider?: ReadTextFileSyncProvider;
    appName?: string;
  }): GlobalConfig {
    if (!GlobalConfig._instance) {
      GlobalConfig._instance = new GlobalConfig(options?.schema, options?.appName);
      if (options?.yaml !== undefined) {
        if (options.yaml !== '') {
          const _loaded = GlobalConfig._instance._parseYamlText(options.yaml);
          GlobalConfig._instance._fields = { ...DEFAULT_CONFIG_VALUES, ..._loaded } as ConfigValues;
        }
        // 空文字列 → DEFAULT_CONFIG_VALUES のまま継続
      } else if (options?.configFile) {
        try {
          const _loaded = GlobalConfig._instance.loadConfigFile({
            configPath: options.configFile,
            readTextFileProvider: options.readTextFileProvider,
          });
          GlobalConfig._instance._fields = { ...DEFAULT_CONFIG_VALUES, ..._loaded } as ConfigValues;
        } catch (e) {
          if (e instanceof ChatlogError && e.kind === 'FileDirNotFound') {
            // ファイル未存在 → DEFAULT_CONFIG_VALUES のまま継続
          } else {
            throw e;
          }
        }
      }
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
   * 空文字列のチェックは呼び出し元の責務とする。
   */
  private _parseYamlText(text: string): Partial<ConfigValues> {
    let _raw: unknown;
    try {
      _raw = parse(text);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', `YAML 構文エラー: ${e.message}`);
      }
      throw e;
    }
    if (typeof _raw !== 'object' || _raw === null || Array.isArray(_raw)) {
      throw new ChatlogError('InvalidYaml', 'NotObject', `YAML ルートはオブジェクトである必要があります`);
    }
    return this.parseYaml(_raw as Record<string, unknown>);
  }

  /** YAML パース結果を `Partial<ConfigValues>` に変換する。スキーマにないキーは `ChatlogError('InvalidYaml')` をスローする。 */
  parseYaml(raw: Record<string, unknown>): Partial<ConfigValues> {
    for (const key of Object.keys(raw)) {
      if (!(key in this._schema)) {
        throw new ChatlogError('InvalidYaml', 'UnknownKey', `不明なキー: ${key}`);
      }
    }
    const _result: Partial<ConfigValues> = {};
    for (const [key, value] of Object.entries(raw)) {
      const _typeName = this._schema[key as keyof ConfigSchema];
      const _parsed: ConfigValue | undefined = _typeName === 'string' ? parseString(value) : parseNumber(value);
      if (_parsed !== undefined) {
        (_result as Record<string, ConfigValue>)[key] = _parsed;
      }
    }
    return _result;
  }

  /**
   * 設定ファイルを読み込み、`Partial<ConfigValues>` を返す。
   * `_fields` は変更しない（純粋関数）。
   */
  loadConfigFile(options?: {
    configPath?: string;
    readTextFileProvider?: ReadTextFileSyncProvider;
  }): Partial<ConfigValues> {
    const _readTextFile = options?.readTextFileProvider ?? GlobalConfig._DEFAULT_READ_TEXT_FILE;
    const _resolved = resolveConfigPath({
      configPath: options?.configPath,
      defaultPath: `${this.configDir}/config.yaml`,
      config: this,
    });
    let _text: string;
    try {
      _text = _readTextFile(_resolved);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw new ChatlogError(
          'FileDirNotFound',
          'ConfigNotFound',
          `設定ファイル/ディレクトリが見つかりません: ${_resolved}`,
        );
      }
      throw e;
    }
    return this._parseYamlText(_text);
  }
}
