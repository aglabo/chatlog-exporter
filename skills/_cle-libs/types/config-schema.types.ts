// src: skills/_cle-libs/types/config-schema.types.ts
// @(#): GlobalConfig スキーマ型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

export type ConfigValue = string | number;
export type ConfigFieldType = 'string' | 'number';

/** number フィールドの値範囲を指定するスキーマ定義。 */
export type ConfigFieldSchema = {
  type: ConfigFieldType;
  min?: number;
  max?: number;
};

/** GlobalConfig のスキーマ型。 */
export type ConfigSchema = Record<string, ConfigFieldType | ConfigFieldSchema>;

export type ConfigValues = Record<string, ConfigValue>;
