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

/** Claude CLI が返す1ファイルあたりの分類結果。キャッシュへの保存にも使う。 */
export interface ClassifyCache {
  /** 対象ファイル名（パスなし）。 */
  file: string;
  /** 割り当てられたプロジェクト名。`FALLBACK_PROJECT` の場合もある。 */
  project: string;
  /** 分類の確信度（0.0〜1.0）。 */
  confidence: number;
  /** 分類根拠の説明文。 */
  reason: string;
  /** 実行するアクション（例: ファイル読み込み失敗時の `CLASSIFY_ACTIONS.ERROR`）。 */
  action?: ClassifyAction;
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
  /** プロジェクト辞書ファイルのパス。省略時は buildProjectsDicPath(DEFAULT_APP_NAME)。 */
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

/** ファイルエントリのみを運ぶ薄いバッファエントリ。 */
export type ClassifyBufferEntry = {
  /** 分類対象のファイルエントリ。 */
  file: ChatlogEntry;
};

/** `preClassify` および `processChunk` が返すバッファ。 */
export type ClassifyBuffer = ClassifyBufferEntry[];

/** `partitionClassifyEntries` が返す、分類候補ファイルエントリの分割結果。 */
export type ClassifyPartition = {
  /** 今回発見した全ファイルパス。 */
  filePaths: string[];
  /** ファイルパスから対応する `ChatlogEntry` へのマップ。 */
  entries: Map<string, ChatlogEntry>;
  /** AI 分類が必要な `ChatlogEntry` のみ。 */
  uncached: ChatlogEntry[];
};

// ─────────────────────────────────────────────
// findBufferEntries オプション型
// ─────────────────────────────────────────────

/** `loadMeta` が返す読み込み結果。エラー時は `action`/`reason` を伴う。 */
export type ClassifyLoadResult = {
  /** 読み込み対象のファイルエントリ。 */
  file: ChatlogEntry;
  /** 読み込み失敗時のアクション（例: `CLASSIFY_ACTIONS.ERROR`）。 */
  action?: ClassifyAction;
  /** 読み込み失敗時の理由。 */
  reason?: string;
};

/** `findBufferEntries` のオプション。テスト時に glob / loadMeta を差し替えられる。 */
export type FindBufferEntriesOptions = {
  glob?: GlobProvider;
  loadMeta?: (path: string) => Promise<ClassifyLoadResult>;
};

// ─────────────────────────────────────────────
// 分類エントリ型
// ─────────────────────────────────────────────

/** `loadClassifyEntries` が返す、読み込みに成功したエントリ。`file` は non-null。 */
export type ClassifyEntry = {
  /** 読み込み済みのファイルエントリ。 */
  file: ChatlogEntry;
  /** エントリのファイルパス。 */
  filePath: string;
};
