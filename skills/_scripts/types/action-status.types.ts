// src: skills/_scripts/types/action-status.types.ts
// @(#): エントリーアクション識別子の定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** エントリーアクション識別子の定数オブジェクト。`EntryAction` のリテラル直書きを置き換える。 */
export const ENTRY_ACTIONS = {
  KEEP: 'keep',
  SKIP: 'skip',
  MOVE: 'move',
  REMOVE: 'remove',
  WRITE: 'write',
  MOVEBYAI: 'move-by-ai',
  PENDING: 'pending',
  ERROR: 'error',
} as const;

/** `ENTRY_ACTIONS` の値から派生したユニオン型。`'keep' | 'skip' | 'move' | 'remove' | 'write'` と等価。 */
export type EntryAction = typeof ENTRY_ACTIONS[keyof typeof ENTRY_ACTIONS];

/** エントリーステータス識別子の定数オブジェクト。`EntryStatus` のリテラル直書きを置き換える。 */
export const ENTRY_STATUSES = {
  PRE_SKIPPED: 'pre-skipped',
  SKIPPED: 'skipped',
  KEPT: 'kept',
  MOVED: 'moved',
  REMOVED: 'removed',
  WRITTEN: 'written',
  ERROR: 'error',
} as const;

/** `ENTRY_STATUSES` の値から派生したユニオン型。`'pre-skipped' | 'skipped' | 'kept' | 'moved' | 'removed' | 'written' | 'error'` と等価。 */
export type EntryStatus = typeof ENTRY_STATUSES[keyof typeof ENTRY_STATUSES];
