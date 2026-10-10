// src: scripts/testing/mutation/run-safety.ts
// @(#): 変異テストの実行を守る仕組み (実行ロック)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../../skills/_cle-libs/libs/io/logger.ts';
import {
  LOCK_CREATED_AT_LABEL,
  LOCK_DELETE_GUIDANCE,
  LOCK_HELD_MESSAGE,
  LOCK_PID_LABEL,
  LOCK_RELEASE_WARNING,
} from './constants/mutation.constants.ts';
import type { LockRecord, LockToken } from './types/mutation.types.ts';

export type { LockRecord, LockToken } from './types/mutation.types.ts';

/**
 * 実行ロックを取得する (execution R-201 / R-202 / R-203 / REQ-F-017)。
 *
 * ロックファイルを排他作成 (`createNew`) し、PID・作成時刻・この実行のランダム ID を JSON で記録する。
 * ロックファイルが既に存在するときは取得せずに中止する (DR-09)。
 *
 * @param path - ロックファイルのパス
 * @returns 解放時に渡すロックの持ち主の証明
 * @throws {ChatlogError} ロックファイルが既に存在するとき (`ParallelExecutionError` / `LockHeld`)
 */
export const acquireLock = async (path: string): Promise<LockToken> => {
  const _record: LockRecord = { pid: Deno.pid, createdAt: new Date().toISOString(), id: crypto.randomUUID() };
  try {
    await Deno.writeTextFile(path, JSON.stringify(_record), { createNew: true });
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      await _reportLockHeld(path);
      throw new ChatlogError('ParallelExecutionError', 'LockHeld', `${LOCK_HELD_MESSAGE}${path}`);
    }
    throw e;
  }
  return { path, id: _record.id };
};

/**
 * 既存ロックの記録を読める範囲で読む。
 *
 * 記録の可読性は中止の判定に使わないため (DD-07)、読み取り・解析に失敗しても例外にせず空の記録を返す。
 *
 * @param path - ロックファイルのパス
 * @returns 読み取れた範囲の記録 (失敗時は空)
 */
const _readLockRecord = async (path: string): Promise<Partial<LockRecord>> => {
  try {
    return JSON.parse(await Deno.readTextFile(path)) ?? {};
  } catch {
    return {};
  }
};

/**
 * 既存ロックで中止するときの報告行を組み立てる。記録から読み取れなかった項目の行は出さない。
 *
 * @param path - ロックファイルのパス
 * @param record - 読み取れた範囲の記録
 * @returns 標準エラー出力へ出す行の並び
 */
const _formatLockHeld = (path: string, record: Partial<LockRecord>): string[] => {
  const _recordLines = [[LOCK_PID_LABEL, record.pid], [LOCK_CREATED_AT_LABEL, record.createdAt]]
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `${label}${value}`);
  return [`${LOCK_HELD_MESSAGE}${path}`, ..._recordLines, LOCK_DELETE_GUIDANCE];
};

/**
 * 既存ロックのパス・記録された PID と作成時刻 (読み取れた範囲)・削除の案内を標準エラー出力へ出す (execution R-202 / DD-07)。
 *
 * @param path - ロックファイルのパス
 */
const _reportLockHeld = async (path: string): Promise<void> => {
  _formatLockHeld(path, await _readLockRecord(path)).forEach((line) => logger.error(line));
};

/**
 * ロックファイルに記録されたランダム ID を読む。
 *
 * @param path - ロックファイルのパス
 * @returns 記録されたランダム ID
 */
const _readLockId = async (path: string): Promise<string> => {
  const _record: LockRecord = JSON.parse(await Deno.readTextFile(path));
  return _record.id;
};

/**
 * token の ID と記録の ID が一致するときだけ、ロックファイルを削除する (非再帰)。
 *
 * @param token - `acquireLock` が返したロックの持ち主の証明
 * @throws 記録の読み取り・解析・削除に失敗したとき (呼び出し元の `releaseLock` が警告に変える)
 */
const _removeOwnLock = async (token: LockToken): Promise<void> => {
  if (await _readLockId(token.path) === token.id) {
    await Deno.remove(token.path);
  }
};

/**
 * 実行ロックを解放する (execution R-213 / DD-13 / DD-14)。
 *
 * ロックファイルに記録されたランダム ID が token の ID と一致する場合だけ、ロックファイルを削除する (非再帰)。
 * 記録の読み取り・削除に失敗しても例外を投げず、警告を 1 件だけ標準エラー出力へ出す。
 *
 * @param token - `acquireLock` が返したロックの持ち主の証明
 */
export const releaseLock = async (token: LockToken): Promise<void> => {
  try {
    await _removeOwnLock(token);
  } catch (e) {
    logger.warn(`${LOCK_RELEASE_WARNING}${token.path}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
