// src: skills/_cle-libs/types/providers.types.ts
// @(#): テスト用依存性注入 Provider 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { OutputContract } from './json-schema.types.ts';

// ─────────────────────────────────────────────
// 環境変数系
// ─────────────────────────────────────────────

/** 環境変数を取得する関数の型。テスト用インジェクションに利用する。 */
export type EnvProvider = (name: string) => string | undefined;

// ─────────────────────────────────────────────
// ファイルシステム系
// ─────────────────────────────────────────────

/** ディレクトリ内のファイル名一覧を返す関数の型。テスト用インジェクションに利用する。 */
export type ListDirProvider = (dir: string) => Promise<string[]>;

/** glob パターンでファイルパス一覧を返す関数の型。テスト用インジェクションに利用する。 */
export type GlobProvider = (pattern: string) => Promise<string[]>;

/** Deno.stat 互換の関数型。テスト用インジェクションに利用する。 */
export type StatProvider = (path: string) => Promise<Deno.FileInfo>;

/** Deno.statSync 互換の同期関数型。テスト用インジェクションに利用する。 */
export type StatSyncProvider = (path: string) => Deno.FileInfo;

/** テキストファイルを読み込む関数の型。テスト用インジェクションに利用する。 */
export type ReadTextFileProvider = (path: string) => Promise<string>;

/** テキストファイルを同期的に読み込む関数の型。テスト用インジェクションに利用する。 */
export type ReadTextFileSyncProvider = (path: string) => string;

/** ファイルを削除する関数の型。テスト用インジェクションに利用する。 */
export type RemoveProvider = (path: string) => Promise<void>;

/** テキストファイルを書き込む関数の型。テスト用インジェクションに利用する。 */
export type WriteTextFileProvider = (path: string, data: string) => Promise<void>;

/** ディレクトリを作成する関数の型。テスト用インジェクションに利用する。 */
export type MkdirProvider = (path: string, options?: { recursive?: boolean }) => Promise<void>;

/** ファイルをリネーム（移動）する関数の型。テスト用インジェクションに利用する。 */
export type RenameProvider = (oldPath: string, newPath: string) => Promise<void>;

/**
 * 指定ミリ秒待機する関数の型。テスト用インジェクションに利用する。
 *
 * リトライの待機に用いる。テストでは即座に解決する実装を注入し、実待機を避ける。
 */
export type SleepProvider = (ms: number) => Promise<void>;

/** ファイルを退避し、作成した退避先パス（退避しなかった場合は null）を返す関数の型。テスト用インジェクションに利用する。 */
export type BackupProvider = (path: string) => Promise<string | null>;

/** ディレクトリを結果に含めるか判定する述語関数の型。 */
export type DirProvider = (dir: string) => Promise<boolean>;

// ─────────────────────────────────────────────
// ハッシュ生成系
// ─────────────────────────────────────────────

/**
 * 短い16進数ハッシュ文字列を生成する関数の型。
 * テスト時のインジェクタブルな依存として利用する。
 */
export type HashProvider = () => string;

// ─────────────────────────────────────────────
// コマンド実行系
// ─────────────────────────────────────────────

/** git rev-parse 等の短命コマンド向け CommandProvider 型。 */
export type CommandProvider = new(
  cmd: string,
  opts: { args: string[] },
) => {
  output(): Promise<{ success: boolean; code: number; stdout: Uint8Array }>;
};

// ─────────────────────────────────────────────
// ネットワーク系
// ─────────────────────────────────────────────

/** HTTP 呼び出しを行う `fetch` 互換の関数型。テスト用インジェクションに利用する。 */
export type FetchProvider = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// ─────────────────────────────────────────────
// AI 実行系
// ─────────────────────────────────────────────

/** `runAI` に渡すオプション。 */
export type RunAIOptions = {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchProvider?: FetchProvider;
  /**
   * この呼び出しに適用する出力契約（structured-output §4.3.1）。
   *
   * 契約タグ（`json-array` / `yaml` / `line-prefixed`）は復元先の文字列表現を選ぶだけで、
   * スキーマを一意に決めない。required keys・値の型・enum の値域・フォールバック値は
   * 契約定義 `properties` が定める。したがって同じ契約タグでも呼び出し元ごとにスキーマは異なる。
   *
   * 省略時は構造化出力を要求しない。
   */
  outputContract?: OutputContract;
};

/** `runAI` 互換の関数型。テスト用インジェクションに利用する。 */
export type AiRunnerProvider = (system: string, user: string, options?: RunAIOptions) => Promise<string>;
