// src: skills/_scripts/types/config.types.ts
// @(#): GlobalConfig で使うスキーマ型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 設定フィールドに許容される値の型名。 */
export type FieldType = 'string' | 'number';

/** 設定キー → 型名 のマッピング。GlobalConfig のスキーマとして使う。 */
export type ConfigSchema = Record<string, FieldType>;
