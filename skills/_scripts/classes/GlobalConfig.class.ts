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
import { resolveConfigPath } from '../libs/path-utils/path-utils.ts';
import { parseNumber, parseString } from '../libs/text/string-utils.ts';
// constants
import { DEFAULT_CONFIG_FILE } from '../constants/defaults.constants.ts';
import { DEFAULT_SCHEMA, DEFAULT_VALUES } from '../constants/schema.constants.ts';
// types
import type { ConfigSchema, ConfigValues, DefaultSchemaKey, SchemaValueType } from '../constants/schema.constants.ts';
import type { ReadTextFileProvider } from '../types/providers.types.ts';
// classes
import { ChatlogError } from './ChatlogError.class.ts';

/**
 * グローバル設定シングルトン。スキーマ検証付き。
 * - `getInstance(options?)` でシングルトンインスタンスを取得する。既にインスタンスが存在する場合は既存のインスタンスを返す。
 * - `get(key: string): string | number` で値を取得する。すべてのスキーマキーはデフォルト値を持つため `undefined` は返さない。
 * - `parseYaml(raw: Record<string, unknown>): Partial<ConfigValues>` で YAML パース結果を `Partial<ConfigValues>` に変換する。スキーマにないキーは `ChatlogError('InvalidYaml')` をスローする。
 * - テスト専用の `resetInstance()` メソッドでシングルトンインスタンスをリセットできる。プロダクションコードからは呼び出さないこと。
 */
export class GlobalConfig {
  private static _instance: GlobalConfig | undefined;
  private static readonly _DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_FILE;
  private static readonly _DEFAULT_READ_TEXT_FILE: ReadTextFileProvider = (path: string) => Deno.readTextFile(path);
  private _schema: ConfigSchema;
  private _fields: ConfigValues = {} as ConfigValues;

  private constructor(schema?: ConfigSchema) {
    this._schema = schema || DEFAULT_SCHEMA;
    this._fields = { ...DEFAULT_VALUES } as ConfigValues;
  }

  /**
   * シングルトンインスタンスを返す。インスタンスが未生成の場合は `options` を使って新規生成する。
   * - `yaml` が指定されていれば YAML 文字列を直接パースして `_fields` を上書きする（`configFile` より優先）。
   * - `configFile` が指定されていれば YAML を読み込んで `_fields` を上書きする（DEFAULT_VALUES + YAML 値）。
   * - ファイルが存在しない場合 (`FileDirNotFound`) はエラーを無視して `DEFAULT_VALUES` のまま返す。
   * - 既にインスタンスが存在する場合は `options` を無視して既存インスタンスを返す。
   */
  static async getInstance(options?: {
    schema?: ConfigSchema;
    configFile?: string;
    yaml?: string;
    readTextFileProvider?: ReadTextFileProvider;
  }): Promise<GlobalConfig> {
    if (!GlobalConfig._instance) {
      GlobalConfig._instance = new GlobalConfig(options?.schema);
      if (options?.yaml !== undefined) {
        if (options.yaml !== '') {
          const _loaded = GlobalConfig._instance._parseYamlText(options.yaml);
          GlobalConfig._instance._fields = { ...DEFAULT_VALUES, ..._loaded } as ConfigValues;
        }
        // 空文字列 → DEFAULT_VALUES のまま継続
      } else if (options?.configFile) {
        try {
          const _loaded = await GlobalConfig._instance.loadConfigFile({
            configPath: options.configFile,
            readTextFileProvider: options.readTextFileProvider,
          });
          GlobalConfig._instance._fields = { ...DEFAULT_VALUES, ..._loaded } as ConfigValues;
        } catch (e) {
          if (e instanceof ChatlogError && e.kind === 'FileDirNotFound') {
            // ファイル未存在 → DEFAULT_VALUES のまま継続
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
  get(key: DefaultSchemaKey): string | number {
    return this._fields[key];
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
      const _parsed: SchemaValueType | undefined = _typeName === 'string' ? parseString(value) : parseNumber(value);
      if (_parsed !== undefined) {
        (_result as Record<string, SchemaValueType>)[key] = _parsed;
      }
    }
    return _result;
  }

  /**
   * 設定ファイルを読み込み、`Partial<ConfigValues>` を返す。
   * `_fields` は変更しない（純粋関数）。
   */
  async loadConfigFile(options?: {
    configPath?: string;
    readTextFileProvider?: ReadTextFileProvider;
  }): Promise<Partial<ConfigValues>> {
    const _readTextFile = options?.readTextFileProvider ?? GlobalConfig._DEFAULT_READ_TEXT_FILE;
    const _resolved = await resolveConfigPath({
      configPath: options?.configPath,
      defaultPath: GlobalConfig._DEFAULT_CONFIG_PATH,
    });
    let _text: string;
    try {
      _text = await _readTextFile(_resolved);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw new ChatlogError('FileDirNotFound', `設定ファイル/ディレクトリが見つかりません: ${_resolved}`);
      }
      throw e;
    }
    return this._parseYamlText(_text);
  }
}

/** アプリケーション共通の GlobalConfig インスタンス。 */
// export const globalConfig = await GlobalConfig.getInstance();
