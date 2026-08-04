// src: skills/_cle-libs/libs/text/yaml-utils.ts
// @(#): YAML シリアライズユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { FrontmatterFields } from '../../types/frontmatter.types.ts';

const _quoteString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const _serializeValue = (key: string, value: string | string[]): string =>
  Array.isArray(value)
    ? `${key}:\n${value.map((item) => `  - ${_quoteString(item)}`).join('\n')}\n`
    : `${key}: ${_quoteString(value)}\n`;

export const stringifyFrontmatter = (fields: FrontmatterFields): string =>
  Object.entries(fields).map(([k, v]) => _serializeValue(k, v)).join('');
