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
}

/** parseArgs に渡すスキーマ。オプション定義の配列（複数スキーマを結合してから使う）。 */
export type ArgsSchema<T = Record<string, unknown>> = ArgSchemaEntry<keyof T & string>[];
