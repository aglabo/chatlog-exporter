// src: skills/_scripts/types/args-schema.types.ts
// @(#): parseArgs で使う型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** parseArgs オプションに指定できるフィールド型名。 */
export type ArgFieldType = 'string' | 'agent' | 'integer' | 'directory' | 'number' | 'flag' | 'period';

/** 1つのオプション定義。CLIオプション名・フィールド名・フィールド型を持つ。 */
export interface ArgSchemaEntry<K extends string = string> {
  option: string; // CLI オプション名。例: '--input', '--dry-run'
  field: K; // マッピング先フィールド名。例: 'inputDir', 'dryRun'
  type: ArgFieldType;
  min?: number; // 'integer' 型のみ実装済み。指定時、値がこれ未満なら OutOfRange エラー（'number' 型は未対応）
  max?: number; // 'integer' 型のみ実装済み。指定時、値がこれを超えると OutOfRange エラー（'number' 型は未対応）
}

/** parseArgs に渡すスキーマ。オプション定義の配列（複数スキーマを結合してから使う）。 */
export type ArgSchema<T = Record<string, unknown>> = ArgSchemaEntry<keyof T & string>[];

/** `parseArgs` の `_DEFAULT_ARG_SCHEMA` が生成するフィールド定義。全 parseArgs 呼び出しに共通で追加される。 */
export type DefaultArgFields = {
  period?: string;
  agent?: string;
  configFile?: string;
  dryRun?: boolean;
  inputDir?: string;
  outputDir?: string;
};

/** parseArgs 内部でパース中に使う値の型（文字列・真偽値・数値のいずれか）。 */
export type ArgValue = string | boolean | number;

/** parseArgs 内部でパース中に構築される config オブジェクトの型。 */
export type ParsedArgs = Record<string, ArgValue>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** DefaultArgFields が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _DefaultArgFieldsCheck = _Assert<DefaultArgFields>;
