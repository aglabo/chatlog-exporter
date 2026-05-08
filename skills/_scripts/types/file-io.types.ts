// src: skills/_scripts/types/file-io.types.ts
// @(#): file-io ライブラリ専用の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { CommandProvider } from './providers.types.ts';

// ─────────────────────────────────────────────
// パス解決系
// ─────────────────────────────────────────────

/** resolveConfigPath のオプション引数。 */
export interface ResolveConfigPathOptions {
  /** 設定ファイル/ディレクトリのパス */
  configPath?: string;
  /** デフォルトパス */
  defaultPath: string;
  /** コマンドプロバイダ: `Git`用 (テスト用に置き換え可能) */
  commandProvider?: CommandProvider;
}
