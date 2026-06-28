// src: skills/_scripts/types/path-utils.types.ts
// @(#): path-utils ライブラリ専用の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// パス解決系
// ─────────────────────────────────────────────

/** resolveConfigPath のオプション引数。 */
export interface ResolveConfigPathOptions {
  /** 設定ファイル/ディレクトリのパス */
  configPath?: string;
  /** デフォルトパス */
  defaultPath: string;
}
