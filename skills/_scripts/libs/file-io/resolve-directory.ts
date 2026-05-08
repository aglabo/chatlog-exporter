// src: skills/_scripts/libs/file-io/resolve-directory.ts
// @(#): チャットログディレクトリ解決ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared modules ---

// classes
import { globalConfig } from '../../classes/GlobalConfig.class.ts';

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

/**
 * `globalConfig` の `chatlogsDir` を参照してチャットログディレクトリを解決する。
 *
 * - `chatlogsDir` が設定済み → `chatlogsDir` をそのまま返す（agent/period は無視）
 * - `chatlogsDir` が未定義 → `DEFAULT_CHATLOG_DIR + "/" + agentPath(agent, period)` を返す
 *
 * @param agent - エージェント名
 * @param period - 期間文字列（YYYY または YYYY-MM）、省略可
 * @returns チャットログディレクトリのパス
 */
export const resolveChatlogsDir = (chatlogsDir: string | undefined, agent: string, period?: string): string => {
  const _baseDir = globalConfig.get('chatlogsDir') as string;
  return chatlogsDir ?? `${_baseDir}/${agentPath(agent, period)}`;
};
