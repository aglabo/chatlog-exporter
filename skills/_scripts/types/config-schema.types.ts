// src: skills/_scripts/types/config-schema.types.ts
// @(#): GlobalConfig スキーマ型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

export type ConfigValue = string | number;
export type ConfigFieldType = 'string' | 'number';

/** GlobalConfig のスキーマ型。 */
export type ConfigSchema = Record<string, ConfigFieldType>;

export type ConfigValues = Record<string, ConfigValue>;
