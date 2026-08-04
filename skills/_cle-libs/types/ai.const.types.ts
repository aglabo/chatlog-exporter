// src: skills/_cle-libs/types/ai.const.types.ts
// @(#): AI バックエンド・プロバイダー・モデルパターン定数と型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Backend

/** 使用可能な AI バックエンド論理名。 */
export const AI_BACKENDS = ['claude', 'codex', 'copilot', 'opencode', 'antigravity'] as const;
export type AiBackend = (typeof AI_BACKENDS)[number];

/** バックエンドが使用する CLI コマンド名（実行バイナリ名）。 */
export const AI_BACKEND_CLI_COMMANDS = ['claude', 'codex', 'copilot', 'opencode', 'agy'] as const;
export type AiBackendCommand = (typeof AI_BACKEND_CLI_COMMANDS)[number];

/** バックエンド論理名 → CLI コマンド名のマッピング。 */
export const AI_BACKEND_COMMAND_MAP = {
  claude: 'claude',
  codex: 'codex',
  copilot: 'copilot',
  opencode: 'opencode',
  antigravity: 'agy',
} as const satisfies Record<AiBackend, AiBackendCommand>;

// ─── Provider

/** 認識可能なプロバイダー名（会社名・サービス名・CLI コマンド名を含む）。 */
export const AI_PROVIDERS = [
  'claude',
  'anthropic',
  'openai',
  'opencode',
  'codex',
  'copilot',
  'google',
  'antigravity',
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** プロバイダー名 → バックエンド論理名のマッピング。 */
export const AI_PROVIDER_BACKEND_MAP = {
  claude: 'claude',
  anthropic: 'claude',
  openai: 'codex',
  opencode: 'opencode',
  codex: 'codex',
  copilot: 'copilot',
  google: 'antigravity',
  antigravity: 'antigravity',
} as const satisfies Record<AiProvider, AiBackend>;

// ─── Model patterns

/** モデル名のマッチング方法と対応プロバイダーを定義するパターン。 */
export type AiModelToProvider =
  | { match: 'exact'; value: string; provider: AiProvider }
  | { match: 'regex'; pattern: RegExp; provider: AiProvider };

/** bare string モデル名からプロバイダーを解決するパターンリスト（上から優先）。 */
export const AI_MODEL_TO_PROVIDER_MAP: AiModelToProvider[] = [
  // openai codex
  { match: 'regex', pattern: /^gpt-/, provider: 'codex' },
  // Anthropic claude
  { match: 'exact', value: 'default', provider: 'claude' },
  { match: 'exact', value: 'best', provider: 'claude' },
  { match: 'exact', value: 'fable', provider: 'claude' },
  { match: 'exact', value: 'opus', provider: 'claude' },
  { match: 'exact', value: 'sonnet', provider: 'claude' },
  { match: 'exact', value: 'haiku', provider: 'claude' },
  { match: 'exact', value: 'sonnet[1m]', provider: 'claude' },
  { match: 'exact', value: 'opus[1m]', provider: 'claude' },
  { match: 'exact', value: 'opusplan', provider: 'claude' },
  // Anthropic claude / with version
  { match: 'regex', pattern: /^claude-opus-/, provider: 'claude' },
  { match: 'regex', pattern: /^claude-sonnet-/, provider: 'claude' },
  { match: 'regex', pattern: /^claude-haiku-/, provider: 'claude' },
  // Google Antigravity
  { match: 'regex', pattern: /^gemini-/, provider: 'antigravity' },
];

// ─── Model spec

/** `parseModel` の戻り値。プロバイダー・モデル名を保持する。 */
export type AiModelSpec = { provider: AiProvider; model: string };
