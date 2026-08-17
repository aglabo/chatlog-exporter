// src: scripts/types/strip-config.types.ts
// @(#): strip-chatlogs スクリプト固有の設定型定義
//       対象: StripConfig / StripParsedConfig / StripMainDeps
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// types
import type { ChatlogCacheProviders } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import type { DefaultArgFields, ParsedArgs } from '../../../_cle-libs/types/args-schema.types.ts';
import type { GlobProvider, RemoveProvider, RenameProvider } from '../../../_cle-libs/types/providers.types.ts';

/** `strip-chatlogs` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export type StripConfig = DefaultArgFields & {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** `true` のときファイルを書き換えず判定結果のみ表示する（REQ-F-005）。 */
  dryRun: boolean;
  /** `true` のとき復帰専用モードで動作する（R-015）。strip は一切行わない。 */
  recoverOrphans: boolean;
  /** 同時実行する判定・書き込み処理の最大並列数。 */
  concurrency: number;
};

/** `strip-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type StripParsedConfig = Partial<StripConfig>;

/**
 * `strip-chatlogs` の `main` に注入する依存。
 *
 * テストから「実行経路そのもの」を観測可能にするための注入口であり、既定値は実物を指す。
 * 判定・書き込み・一括削除のフェーズ関数（`classifyStrip` / `writeStripped` / `sweepBackups`）は
 * **意図的に含めない**。差し替え可能にすると「通常実行と同じ経路を通る」保証が失われるため。
 */
export interface StripMainDeps {
  /** ファイル列挙・孤立退避検出・退避一覧取得に使う glob。 */
  glob?: GlobProvider;
  /** 復帰リネーム（R-015）に使うリネーム関数。 */
  rename?: RenameProvider;
  /** 退避の一括削除（R-010）に使う削除関数。 */
  removeProvider?: RemoveProvider;
  /** 処理済み記録キャッシュの I/O プロバイダ。 */
  cacheProviders?: ChatlogCacheProviders;
  /**
   * 処理済み記録キャッシュのルートディレクトリ。
   *
   * 省略時は `GlobalConfig` の `cacheDir` を使う（実運用の既定）。テストでは実運用の
   * キャッシュディレクトリを汚染しないよう、また `GlobalConfig` 経由の環境変数展開を
   * 回避するため絶対パスを与える。
   */
  cacheRoot?: string;
}

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** StripConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _StripConfigCheck = _Assert<StripConfig>;
