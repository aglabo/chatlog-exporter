// src: skills/filter-chatlogs/scripts/libs/common-utils.ts
// @(#): filter-chatlogs モジュール共通ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { dirExists } from '../../../_scripts/libs/file-ops/exists-utils.ts';
import type { StatProvider } from '../../../_scripts/types/providers.types.ts';

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
