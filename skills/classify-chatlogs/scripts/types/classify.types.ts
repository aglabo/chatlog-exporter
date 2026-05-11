// src: scripts/types/classify.types.ts
// @(#): classify-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// プロジェクトエントリ型
// ─────────────────────────────────────────────

/** projects.dic 全体。プロジェクト名をキー、プロパティ（string→string マップ）を値とする辞書。 */
export type ProjectDicEntry = Record<string, Record<string, string>>;

// ─────────────────────────────────────────────
// 分類結果型
// ─────────────────────────────────────────────

/** Claude CLI が返す1ファイルあたりの分類結果。 */
export interface ClassifyResult {
  /** 対象ファイル名（パスなし）。 */
  file: string;
  /** 割り当てられたプロジェクト名。`FALLBACK_PROJECT` の場合もある。 */
  project: string;
  /** 分類の確信度（0.0〜1.0）。 */
  confidence: number;
  /** 分類根拠の説明文。 */
  reason: string;
}

// ─────────────────────────────────────────────
// 処理統計型
// ─────────────────────────────────────────────

/** 処理全体の集計カウンター。`main` 関数が完了時に出力する。 */
export interface ClassifyStats {
  /** 移動（または dry-run での移動予定）件数。 */
  moved: number;
  /** 既にプロジェクト設定済みでスキップした件数。 */
  skipped: number;
  /** 読み込み・移動に失敗した件数。 */
  error: number;
}

// ─────────────────────────────────────────────
// 分類設定型
// ─────────────────────────────────────────────

/** `main` が使用する分類処理の設定。すべてのフィールドに値が入る。 */
export interface ClassifyConfig {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** 対象年月（`YYYY-MM` 形式）。省略時は全期間。 */
  period?: string;
  /** `true` のときファイルを移動せず分類結果のみ表示する。 */
  dryRun: boolean;
  /** チャットログが格納された入力ディレクトリのパス。 */
  inputDir: string;
  /** `projects.dic` が置かれた辞書ディレクトリのパス。 */
  dicsDir: string;
  /** プロジェクト辞書ファイルのパス。省略時は DEFAULT_PROJECTS_DIC_PATH。 */
  projectsDic?: string;
  /** claude CLI に渡すモデル名。 */
  model: string;
  /** チャットログ格納ディレクトリ。位置引数のディレクトリパスが設定される。 */
  chatlogsDir?: string;
}

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。`dicsDir` は GlobalConfig で管理するため含まない。 */
export type ParsedConfig = Omit<Partial<ClassifyConfig>, 'dicsDir'> & {
  /** `--config` で指定された設定ファイルのパス。省略時は `undefined`。 */
  configFile?: string;
};
