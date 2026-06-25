// src: skills/_scripts/types/action-status-entry.types.ts
// @(#): エントリー処理状態の型定義
//       ActionStatusOptions と ActionStatusEntry 型
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { ChatlogEntry } from '../classes/ChatlogEntry.class.ts';
import type { EntryAction, EntryStatus } from './action-status.types.ts';

/** エントリーの処理オプション。`filePath` は必須、その他はオプション。 */
export type ActionStatusOptions = {
  filePath: string;
  action?: EntryAction;
  status?: EntryStatus;
  reason?: string;
  targetPath?: string;
};

/** チャットログエントリーと処理オプションをまとめたラッパー型。 */
export type ActionStatusEntry = {
  entry: ChatlogEntry;
  options: ActionStatusOptions;
};
