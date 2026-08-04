// src: skills/_cle-libs/types/path-utils.types.ts
// @(#): path-utils ライブラリ専用の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { GlobalConfig } from '../classes/GlobalConfig.class.ts';
// ─────────────────────────────────────────────
// パス解決系
// ─────────────────────────────────────────────

/** resolveConfigPath のオプション引数。 */
export interface ResolveConfigPathOptions {
  /** 設定ファイル/ディレクトリのパス */
  configPath?: string;
  /** デフォルトパス */
  defaultPath: string;
  /** 相対パス解決の基準ディレクトリ（絶対パス） */
  config?: GlobalConfig;
}
