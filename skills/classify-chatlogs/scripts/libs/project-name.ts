// src: scripts/libs/project-name.ts
// @(#): classify-chatlogs プロジェクト名検証ユーティリティ
//       対象: isSafeProjectName
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 相対参照として解釈されるため、プロジェクト名に使えない値。 */
const _RESERVED_NAMES: readonly string[] = ['.', '..'];

/** パス区切り（`/` `\`）とドライブ指定（`:`）を検出する。 */
const _UNSAFE_CHARS = /[/\\:]/;

/**
 * `value` が出力先ディレクトリ直下の 1 セグメントとして安全なプロジェクト名か判定する。
 * 非空文字列で、`.` / `..` でなく、`/` `\` `:` のいずれも含まないときに `true` を返す。
 */
export const isSafeProjectName = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && !_RESERVED_NAMES.includes(value) && !_UNSAFE_CHARS.test(value);
