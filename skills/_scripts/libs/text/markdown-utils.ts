// src: skills/_scripts/libs/text/markdown-utils.ts
// @(#): Markdown パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** コードフェンス（\`\`\`）を除去し、指定フィールドから始まる YAML 文字列を返す。 */
export const cleanYaml = (raw: string, firstField: string): string => {
  if (raw === '') { return ''; }
  const _lines = raw.split('\n').filter((l) => !l.startsWith('```'));
  const firstIndex = _lines.findIndex((l) => l.startsWith(`${firstField}:`));
  return (firstIndex >= 0 ? _lines.slice(firstIndex) : _lines).join('\n').trim();
};
