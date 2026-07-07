// src: skills/_scripts/libs/file-io/resolve-directory.ts
// @(#): チャットログディレクトリ解決ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// functions
import { joinPath, normalizePath } from '../path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// チャットログパス構築
// ─────────────────────────────────────────────

/**
 * 期間文字列をディレクトリパス断片に変換する。
 * - YYYY-MM 形式 → `YYYY/YYYY-MM`
 * - YYYY 形式 → `YYYY`
 */
export const periodToPath = (period: string): string => {
  if (period.length === 4) {
    return period;
  }
  return `${period.slice(0, 4)}/${period}`;
};

/**
 * エージェントのチャットログサブパスを構築する。
 * - period 未指定 → `agent`
 * - period = YYYY → `agent/YYYY`
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
  chatlogsDir?: string;
  baseDir: string;
  agent: string;
  period?: string;
  addOnDir?: string;
};

/**
 * チャットログディレクトリを解決する。
 *
 * - `chatlogsDir` が指定済み → そのまま返す（agent/period/addOnDir は無視）
 * - `chatlogsDir` が未定義 → `baseDir` と `agentPath(agent, period)` の間に
 *   `addOnDir`（指定時のみ）を挟んだパスを返す
 */
export const resolveChatlogsDir = (
  { chatlogsDir, baseDir, agent, period, addOnDir }: ResolveChatlogsDirOptions,
): string => {
  if (chatlogsDir) { return chatlogsDir; }
  const _base = addOnDir ? joinPath(baseDir, addOnDir) : baseDir;
  return `${_base}/${agentPath(agent, period)}`;
};

// ─────────────────────────────────────────────
// チャットログパス抽出
// ─────────────────────────────────────────────

/**
 * Extracts the `<agent>/<yyyy>/<yyyy-mm>` path segment from a file path.
 *
 * Normalizes the path, then matches the `chatlogs/<agent>/<yyyy>/<yyyy-mm>`
 * pattern and returns `<agent>/<yyyy>/<yyyy-mm>`. Returns `''` if the pattern is not found.
 *
 * @param filePath - Path to the source chatlog file
 * @returns Path segment like `'claude/2026/2026-04'`, or `''`
 */
export const extractChatlogPath = (filePath: string): string => {
  const match = normalizePath(filePath).match(/chatlogs\/([^/]+)\/(\d{4})\/(\d{4}-\d{2})/);
  if (match) {
    const [, agent, year, yearMonth] = match;
    return `${agent}/${year}/${yearMonth}`;
  }
  return '';
};
