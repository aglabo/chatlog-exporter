// src: scripts/types/classify.types.ts
// @(#): classify-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI
//
// ─── Imports
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';
import type { GlobProvider } from '../../../_scripts/types/providers.types.ts';

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
  /** AI を呼び出さずに移動した件数（フロントマター設定済み移動 + too-short fallback）。 */
  moved: number;
  /** AI を呼び出して分類・移動した件数（成功・失敗・パース失敗いずれも含む）。 */
  movedByAI: number;
  /** 既にプロジェクト設定済みかつ対応ディレクトリ内でスキップした件数。 */
  skipped: number;
  /** 読み込み・移動に失敗した件数。 */
  error: number;
  /** AI 処理が必要なエントリとしてスキップした件数。 */
  remaining: number;
}

// ─────────────────────────────────────────────
// 分類設定型
// ─────────────────────────────────────────────

/** `main` が使用する分類処理の設定。すべてのフィールドに値が入る。 */
export type ClassifyConfig = DefaultArgFields & {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** `true` のときファイルを移動せず分類結果のみ表示する。 */
  dryRun: boolean;
  /** `projects.dic` が置かれた辞書ディレクトリのパス。 */
  dicsDir: string;
  /** プロジェクト辞書ファイルのパス。省略時は DEFAULT_PROJECTS_DIC_PATH。 */
  projectsDic?: string;
  /** claude CLI に渡すモデル名。 */
  model: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** バッチリクエスト1回あたりの最大ファイル数。 */
  chunkSize: number;
  /** 同時実行する並列タスク数の上限。 */
  concurrency: number;
};

/** `classify-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type ClassifyParsedConfig = Partial<ClassifyConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** ClassifyConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _ClassifyConfigCheck = _Assert<ClassifyConfig>;

// ─────────────────────────────────────────────
// 分類バッファ型
// ─────────────────────────────────────────────
export const CLASSIFY_ACTIONS = {
  MOVE: 'move',
  MOVEBYAI: 'move-by-ai',
  SKIP: 'skip',
  REMAINING: 'remaining',
  ERROR: 'error',
} as const;

/** `CLASSIFY_ACTIONS` の値の型。 */
export type ClassifyAction = typeof CLASSIFY_ACTIONS[keyof typeof CLASSIFY_ACTIONS];

/** `preClassify` および `processChunk` が返す1件分のバッファエントリ。 */
export type ClassifyBufferEntry = {
  /** 分類対象のファイルエントリ。エラー時は `null`。 */
  file: ChatlogEntry | null;
  /** エントリのファイルパス。エラー時も参照できるよう `file` とは別に保持する。 */
  filePath: string;
  /** 割り当てるプロジェクト名。 */
  project?: string;
  /** 実行するアクション。`'move'` はファイル移動、`'skip'` はスキップ（カウントのみ）。 */
  action?: ClassifyAction;
  /** `action === 'error'` のときのエラーメッセージ。 */
  reason?: string;
};

/** `preClassify` および `processChunk` が返すバッファ。 */
export type ClassifyBuffer = ClassifyBufferEntry[];

// ─────────────────────────────────────────────
// findBufferEntries オプション型
// ─────────────────────────────────────────────

/** `findBufferEntries` のオプション。テスト時に glob / loadMeta を差し替えられる。 */
export type FindBufferEntriesOptions = {
  glob?: GlobProvider;
  loadMeta?: (path: string) => Promise<ClassifyBufferEntry>;
};
