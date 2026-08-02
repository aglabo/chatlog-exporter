// src: _scripts/constants/agents.constants.ts
// @(#): サポートする AI エージェント識別子の共通定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** サポートする AI エージェント識別子の一覧。CLI 引数のバリデーションに使用する。 */
export const KNOWN_AGENTS = ['claude', 'chatgpt', 'codex'] as const;

/** サポートする AI エージェント識別子のユニオン型。 */
export type KnownAgent = typeof KNOWN_AGENTS[number];

/** 与えられた文字列が KnownAgent かどうかを判定する型ガード。 */
export function isKnownAgent(agent: string): agent is KnownAgent {
  return (KNOWN_AGENTS as readonly string[]).includes(agent);
}
