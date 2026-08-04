// src: skills/filter-chatlogs/scripts/libs/common-utils.ts
// @(#): filter-chatlogs モジュール共通ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// functions
import { parseConversation, renderConversation } from '../../../_cle-libs/libs/chatlogs/conversation-utils.ts';
import { dirExists } from '../../../_cle-libs/libs/file-ops/exists-utils.ts';
// types
import type { StatProvider } from '../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// constants
import { MAX_BODY_CHARS } from '../constants/common.constants.ts';

/**
 * 本文テキストを会話ターンに分解し、`maxChars` 文字以内に収めた Markdown 文字列を返す。
 *
 * バッチプロンプトに埋め込む本文の切り詰めに使用する。
 *
 * @param body - 変換元の本文テキスト（frontmatter を除いたコンテンツ部分）
 * @param maxChars - 出力の最大文字数（デフォルト: `MAX_BODY_CHARS`）
 * @returns 会話ターンを Markdown 形式に再構築した文字列（`maxChars` 文字以内）
 */
export const extractConversation = (body: string, maxChars = MAX_BODY_CHARS): string =>
  renderConversation(parseConversation(body), maxChars);

/**
 * chatlogsディレクトリの存在を確認する。
 * 存在しない場合は `ChatlogError('InputNotFound', 'ChatlogsDir', ...)` をスローする。
 *
 * @param dir - 確認するディレクトリパス
 * @param statProvider - テスト用注入可能な stat 関数（デフォルト: `Deno.stat`）
 */
export const validateChatlogsDir = async (
  dir: string,
  statProvider?: StatProvider,
): Promise<void> => {
  if (!await dirExists(dir, statProvider)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `chatlogsディレクトリが見つかりません: ${dir}`);
  }
};
