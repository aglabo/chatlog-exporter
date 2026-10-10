// src: scripts/testing/mutation/run-safety.ts
// @(#): 変異テストの実行を守る仕組み (実行ロック・残骸の後始末・ソースの内容ハッシュ・drift の検出)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { walk } from 'jsr:@std/fs@^1.0.24';
import { basename } from 'jsr:@std/path@^1.1.6';
import { ChatlogError } from '../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { sessionHash } from '../../../skills/_cle-libs/libs/io/hash.ts';
import { logger } from '../../../skills/_cle-libs/libs/io/logger.ts';
import {
  LOCK_CREATED_AT_LABEL,
  LOCK_DELETE_GUIDANCE,
  LOCK_HELD_MESSAGE,
  LOCK_PID_LABEL,
  LOCK_RELEASE_WARNING,
  SOURCE_NOT_FOUND_MESSAGE,
} from './constants/mutation.constants.ts';
import { isMutationArtifact } from './resolve-targets.ts';
import type { LockRecord, LockToken, SourceHashes } from './types/mutation.types.ts';

export type { LockRecord, LockToken, SourceHashes } from './types/mutation.types.ts';

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

/**
 * 1 件の残骸を削除する (非再帰)。
 *
 * 対象が存在しない (`Deno.errors.NotFound`) ときは、残す残骸が無いため削除できたものとして扱う。
 *
 * @param path - 削除する残骸のパス
 * @returns 削除できなかったときはそのパス、削除できたとき・存在しないときは `null`
 */
const _removeArtifact = async (path: string): Promise<string | null> => {
  try {
    await Deno.remove(path);
    return null;
  } catch (e) {
    return e instanceof Deno.errors.NotFound ? null : path;
  }
};

/**
 * 変異体ファイル・一時設定などの残骸を削除する (execution R-225 / REQ-F-006)。
 *
 * 各パスを非再帰で削除し、例外は投げない。中止するかの判断は呼び出し元が行う。
 *
 * @param paths - 削除する残骸のパスの並び
 * @returns 削除できなかったパスの並び (全件削除できたときは空)
 */
export const removeArtifacts = async (paths: string[]): Promise<string[]> => {
  const _results = await Promise.all(paths.map(_removeArtifact));
  return _results.filter((path): path is string => path !== null);
};

/**
 * 1 ディレクトリ配下を再帰的に探索し、名前が変異体・一時設定の命名に一致するエントリのパスを集める。
 *
 * 削除できない残骸を報告できるよう、命名に一致するディレクトリも候補に含める。
 *
 * @param dir - 探索するディレクトリ
 * @returns 命名に一致したエントリのパスの並び
 */
const _collectArtifacts = async (dir: string): Promise<string[]> => {
  const _entries = await Array.fromAsync(walk(dir));
  return _entries.map((entry) => entry.path).filter((path) => isMutationArtifact(basename(path)));
};

/**
 * 前回の実行が残した変異体ファイル・一時設定を掃除する (execution R-205 / REQ-F-007 / AC-008)。
 *
 * 各ディレクトリを再帰的に探索し、名前が `isMutationArtifact` に一致するエントリだけを `removeArtifacts` で削除する。
 * 例外は投げない。中止するかの判断は呼び出し元が行う (DD-14)。
 *
 * @param dirs - 探索するディレクトリの並び
 * @returns 削除できなかったパスの並び (全件削除できたときは空)
 */
export const sweepArtifacts = async (dirs: string[]): Promise<string[]> => {
  const _candidates = await Promise.all(dirs.map(_collectArtifacts));
  return await removeArtifacts(_candidates.flat());
};

/**
 * ソースファイルを改行コードを正規化せずに読む (execution R-206 / R-212 / DD-14)。
 *
 * 共通の `readTextFile` は改行コードを正規化するため使わない (改行コードだけの変化も drift として検出する)。
 *
 * @param path - 読み込むソースファイルのパス
 * @returns ファイルの内容 (原文のまま)
 * @throws {ChatlogError} ファイルが存在しないとき (`FileDirNotFound` / `NotFound`)
 */
const _readSource = async (path: string): Promise<string> => {
  try {
    return await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new ChatlogError('FileDirNotFound', 'NotFound', `${SOURCE_NOT_FOUND_MESSAGE}${path}`);
    }
    throw e;
  }
};

/**
 * ソースファイルの内容ハッシュを取る (execution R-206)。
 *
 * 各ファイルを改行コードを正規化せずに読み、内容から決定的なハッシュ (`sessionHash`) を作る。
 * 実行前後の記録を比べることで、変異テスト中のソースの書き換えを検出できる。
 * 存在しないソースは drift として扱わず、エラーで中止する (execution R-212 / DD-14)。
 *
 * @param files - ハッシュを取るソースファイルのパスの並び
 * @returns パスから内容ハッシュへの記録
 * @throws {ChatlogError} ソースファイルが存在しないとき (`FileDirNotFound` / `NotFound`)
 */
export const hashSources = async (files: string[]): Promise<SourceHashes> => {
  const _entries = await Promise.all(
    files.map(async (path) => [path, await sessionHash(await _readSource(path), 64)] as const),
  );
  return Object.fromEntries(_entries);
};

/**
 * 実行前後のソースの内容ハッシュを突合し、drift したパスを返す (execution R-212 / REQ-NF-001)。
 *
 * `before` の各パスについて、`after` のハッシュと一致しないもの (`after` に無いものを含む) を drift とする。
 * 同じ入力から同じ出力を得るため (report-cli R-611)、記録のキー挿入順によらず昇順で返す。
 *
 * @param before - 変異テスト実行前の内容ハッシュの記録
 * @param after - 変異テスト実行後の内容ハッシュの記録
 * @returns ハッシュが変わったパスの昇順の並び
 */
export const detectDrift = (before: SourceHashes, after: SourceHashes): string[] =>
  Object.keys(before).filter((path) => before[path] !== after[path]).toSorted();
