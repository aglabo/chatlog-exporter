// src: scripts/types/dics.types.ts
// @(#): set-frontmatter 辞書関連型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// 辞書エントリ型
// ─────────────────────────────────────────────

/** 辞書エントリの適用・除外ルール。各フィールドはキーワード配列。when / not / always 等、辞書ファイルに実在するフィールドをすべて保持する。 */
export type DicRules = Record<string, string[]>;

/** category / topic / tag 辞書の1エントリ。`.config/<app-name>/dics/` 配下の YAML から読み込む。 */
export interface DicEntry {
  /** 辞書キー（フロントマターに書き込む値）。 */
  key: string;
  /** エントリの定義（短い説明）。 */
  def: string;
  /** AI への説明文（用途・文脈など）。 */
  desc: string;
  /** 適用・除外ルール。 */
  rules: DicRules;
  /** 会話の構造パターン（スカラー文字列、types.dic の structure フィールド）。 */
  structure?: string;
}

// ─────────────────────────────────────────────
// プロンプトテンプレート型
// ─────────────────────────────────────────────

/** フェーズごとの AI プロンプトテンプレート。`.config/<app-name>/prompts/` から読み込む。 */
export interface PromptTemplate {
  /** システムプロンプト（AI の役割・制約を定義する）。 */
  system: string;
  /** ユーザープロンプト（具体的な指示と入力データを含む）。 */
  user: string;
}

// ─────────────────────────────────────────────
// 辞書集約型
// ─────────────────────────────────────────────

/** `loadDics` が返す辞書データ集約（プロンプトを含まない）。全フェーズで共有される。 */
export interface Dics {
  /** category キー一覧（カンマ区切り、AI スキーマ制約用）。 */
  category: string;
  /** tag キー一覧（カンマ区切り、AI スキーマ制約用）。 */
  tags: string;
  /** category 辞書のエントリ配列。 */
  categoryEntries: DicEntry[];
  /** type 辞書のエントリ配列。 */
  typeEntries: DicEntry[];
  /** topic 辞書のエントリ配列。 */
  topicEntries: DicEntry[];
}

/** `loadPrompts` が返すプロンプトデータ集約。 */
export interface Prompts {
  /** type ごとの category 判定プロンプト。キーは type 名。 */
  categoryPrompts: Map<string, string>;
  /** フェーズ別プロンプトテンプレート。キーはフェーズ名。 */
  prompts: Map<string, PromptTemplate>;
}
