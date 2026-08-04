// src: scripts/types/args.types.ts
// @(#): set-frontmatter コマンドライン引数型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_cle-libs/types/args-schema.types.ts';

// ─────────────────────────────────────────────
// 設定型
// ─────────────────────────────────────────────

/** `buildConfig` が返す完全な設定（すべてのフィールドが必須）。 */
export type SetfmConfig = DefaultArgFields & {
  /**
   * チャットログを読み込む入力ディレクトリのパス。
   * `--input-dir` 明示指定時のみ `buildConfig` が値を持つ（未指定時は空文字列）。
   * 実際の入力ディレクトリは `main()` が `resolveChatlogsDir` で解決する。
   */
  inputDir: string;
  /** フロントマター付きファイルの書き込み先ディレクトリのパス。 */
  outputDir: string;
  /** 対象エージェント名。 */
  agent: string;
  /** チャットログの基準ディレクトリのパス（GlobalConfig 由来）。 */
  chatlogsDir: string;
  /** 辞書ファイルが置かれたディレクトリのパス。 */
  dicsDir: string;
  /** プロンプトファイルが置かれたディレクトリのパス。 */
  promptsDir: string;
  /** `true` のときファイルを書き換えずに処理結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときレビューフェーズ（Phase 3）を実行する。 */
  review: boolean;
  /** 同時実行する並列タスク数の上限。 */
  concurrency: number;
  /** AI 呼び出し失敗時の最大リトライ回数（0=リトライなし、上限 10）。 */
  maxRetry: number;
  /** フェーズ単位のキャッシュファイルを格納するディレクトリのパス。 */
  cacheDir: string;
};

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type ParsedConfig = Partial<SetfmConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** SetfmConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _SetfmConfigCheck = _Assert<SetfmConfig>;
