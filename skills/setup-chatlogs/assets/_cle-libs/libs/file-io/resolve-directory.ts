// src: skills/_cle-libs/libs/file-io/resolve-directory.ts
// @(#): チャットログディレクトリ解決ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// functions
import { isAbsolutePath, joinPath, normalizePath } from '../path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// チャットログパス構築
// ─────────────────────────────────────────────

/**
 * 期間文字列（`YYYY-MM` 形式）をディレクトリパス断片 `YYYY/YYYY-MM` に変換する。
 *
 * CLI は `YYYY-MM` 形式のみを受理するため、`YYYY` 単体は入力されない。
 */
export const periodToPath = (period: string): string => {
  // TODO(cle-6tz): YYYY 非対応確定により到達不能。コード削除は後続作業。
  if (period.length === 4) {
    return period;
  }
  return `${period.slice(0, 4)}/${period}`;
};

/**
 * エージェントのチャットログサブパスを構築する。
 * - period 未指定 → `agent`
 * - period = YYYY-MM → `agent/YYYY/YYYY-MM`
 */
export const agentPath = (agent: string, period?: string): string => {
  if (!period) {
    return agent;
  }
  return `${agent}/${periodToPath(period)}`;
};

// ─────────────────────────────────────────────
// チャットログディレクトリ解決
// ─────────────────────────────────────────────

export type ResolveChatlogsDirOptions = {
  chatlogsDir: string;
  agent: string;
  period?: string;
  addOnDir?: string;
  override?: string;
};

/**
 * チャットログディレクトリを解決する。
 *
 * - `override` が指定済み → そのまま返す（agent/period/addOnDir は無視）
 * - `override` が未定義 → `chatlogsDir` と `agentPath(agent, period)` の間に
 *   `addOnDir`（指定時のみ）を挟んだパスを返す
 */
export const resolveChatlogsDir = (
  { chatlogsDir, agent, period, addOnDir, override }: ResolveChatlogsDirOptions,
): string => {
  if (override) { return override; }
  const _base = addOnDir ? joinPath(chatlogsDir, addOnDir) : chatlogsDir;
  return `${_base}/${agentPath(agent, period)}`;
};

export type ResolveOutputBaseOptions = {
  chatlogsDir: string;
  agent: string;
  period?: string;
  addOnDir?: string;
  outputDir?: string;
};

/**
 * 出力先ベースディレクトリを解決する。
 *
 * - `outputDir` が絶対パス → そのまま返す
 * - `outputDir` が相対パス → `chatlogsDir` と結合して返す
 * - `outputDir` が未指定 → `resolveChatlogsDir`（override なし）のデフォルト解決に委譲する
 */
export const resolveOutputBase = (
  { chatlogsDir, agent, period, addOnDir, outputDir }: ResolveOutputBaseOptions,
): string => {
  if (outputDir) {
    return isAbsolutePath(outputDir) ? outputDir : joinPath(chatlogsDir, outputDir);
  }
  return resolveChatlogsDir({ chatlogsDir, agent, period, addOnDir });
};

// ─────────────────────────────────────────────
// チャットログパス抽出
// ─────────────────────────────────────────────

/**
 * Extracts the `<agent>/<yyyy>/<yyyy-mm>` path segment from a file path.
 *
 * Normalizes the path, then matches the `<segment>/<yyyy>/<yyyy-mm>`
 * structure (independent of any fixed `chatlogs/`/`originalLogs/` literal,
 * so it also works with arbitrary `--chatlogs-dir` paths and any add-on
 * directory name) and returns `<agent>/<yyyy>/<yyyy-mm>`. Returns `''` if
 * the pattern is not found.
 *
 * @param filePath - Path to the source chatlog file
 * @returns Path segment like `'claude/2026/2026-04'`, or `''`
 */
export const extractChatlogPath = (filePath: string): string => {
  const match = normalizePath(filePath).match(/([^/]+)\/(\d{4})\/(\d{4}-\d{2})/);
  if (match) {
    const [, agent, year, yearMonth] = match;
    return `${agent}/${year}/${yearMonth}`;
  }
  return '';
};

/**
 * Extracts the base directory that precedes the `<agent>/<yyyy>/<yyyy-mm>`
 * path segment in a file path.
 *
 * Normalizes the path, then matches the same `<agent>/<yyyy>/<yyyy-mm>`
 * structure as `extractChatlogPath` and returns everything before that
 * segment (with the trailing separator stripped). Returns `''` if the
 * pattern is not found, or if it matches at the start of the path.
 *
 * @param filePath - Path to the source chatlog file
 * @returns Base directory like `'chatlogs/normalizeLogs'`, or `''`
 */
export const extractChatlogBaseDir = (filePath: string): string => {
  const _normalized = normalizePath(filePath);
  const match = _normalized.match(/([^/]+)\/(\d{4})\/(\d{4}-\d{2})/);
  if (match && match.index) {
    return _normalized.slice(0, match.index - 1);
  }
  return '';
};
