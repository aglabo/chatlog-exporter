// src: skills/_cle-libs/types/providers.types.ts
// @(#): テスト用依存性注入 Provider 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

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
