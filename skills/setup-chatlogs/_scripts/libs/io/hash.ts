// src: skills/_scripts/libs/io/hash.ts
// @(#): SHA-256ハッシュ生成ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * hash.ts — ファイル名ベース文字列からSHA-256ハッシュを生成するユーティリティ
 *
 * filenameBase・現在のタイムスタンプ・ランダム英数字文字列を組み合わせた
 * シード文字列から SHA-256 ハッシュを計算し、指定長の16進数文字列を返す。
 */

// -- constants --
import {
  DEFAULT_HASH_LENGTH,
  DEFAULT_MAX_RANDOM_LENGTH,
  MIN_RANDOM_LENGTH,
} from '../../constants/defaults.constants.ts';

// -- types --
import type { GenerateHashOptions } from '../../types/common.types.ts';

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** ランダム文字列の生成に使用する文字セット（英小文字+数字）。 */
const _RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────

/**
 * 現在時刻を `yyyyMMddHHmmss` 形式の14桁数字文字列として返す。
 *
 * @returns `yyyyMMddHHmmss` 形式の14桁文字列
 */
const _buildTimestamp = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const MM = now.getMonth().toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const HH = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
};

/**
 * `[a-z0-9]` からランダムな長さの文字列を生成する。
 *
 * 文字列長は `MIN_RANDOM_LENGTH` 以上 `maxLength` 以下のランダムな値となる。
 *
 * @param maxLength 生成する文字列の最大長（`MIN_RANDOM_LENGTH` 以上であること）
 * @returns ランダムな長さの英小文字・数字からなる文字列
 */
const _buildRandomString = (maxLength: number): string => {
  const range = maxLength - MIN_RANDOM_LENGTH + 1;
  const maxUnbiasedLen = Math.floor(256 / range) * range;
  let lenOffset: number;
  do {
    lenOffset = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (lenOffset >= maxUnbiasedLen);
  const len = MIN_RANDOM_LENGTH + (lenOffset % range);
  const charsetLen = _RANDOM_CHARS.length;
  const maxUnbiased = Math.floor(256 / charsetLen) * charsetLen;
  const _out: string[] = [];

  while (_out.length < len) {
    const remaining = len - _out.length;
    const buf = crypto.getRandomValues(new Uint8Array(remaining));

    for (const b of buf) {
      if (b >= maxUnbiased) { continue; }
      _out.push(_RANDOM_CHARS[b % charsetLen]);
      if (_out.length === len) { break; }
    }
  }

  return _out.join('');
};

/**
 * SHA-256 ハッシュを計算し、16進数文字列として返す。
 *
 * @param input ハッシュ計算の入力文字列
 * @returns SHA-256 ハッシュの64文字16進数文字列
 */
const _sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * シード文字列を生成する。
 *
 * シード形式: `{filenameBase}-{yyyyMMddHHmmss}-{ランダム英数字}`
 *
 * @param filenameBase ハッシュ計算のベースとなる文字列
 * @param maxRandomLength ランダム文字列の最大長
 * @returns シード文字列
 */
const _buildSeed = (filenameBase: string, maxRandomLength: number): string => {
  const _timestamp = _buildTimestamp();
  const _random = _buildRandomString(maxRandomLength);
  return `${filenameBase}-${_timestamp}-${_random}`;
};

// ─────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────

/**
 * ファイル名ベース文字列からSHA-256ハッシュ文字列を生成する。
 *
 * filenameBase・現在のタイムスタンプ（`yyyyMMddHHmmss`）・ランダム英数字文字列を
 * 組み合わせたシード文字列から SHA-256 ハッシュを計算し、
 * 先頭 `length` 文字の16進数文字列として返す。
 * 同じ `filenameBase` でも呼び出しのたびに異なる値が返る。
 *
 * @param filenameBase ハッシュ計算のベースとなる文字列（例: "my-project"）
 * @param options オプション引数
 * @param options.length 返す16進数文字列の長さ（デフォルト: `DEFAULT_HASH_LENGTH` = 8）
 * @param options.maxRandomLength ランダム文字列の最大長（デフォルト: `DEFAULT_MAX_RANDOM_LENGTH` = 16）
 * @returns 先頭 `length` 文字の16進数ハッシュ文字列
 */
export const generateHash = async (
  filenameBase: string,
  options: GenerateHashOptions = {},
): Promise<string> => {
  const length = options.length ?? DEFAULT_HASH_LENGTH;
  const maxRandomLength = options.maxRandomLength ?? DEFAULT_MAX_RANDOM_LENGTH;
  const seed = _buildSeed(filenameBase, maxRandomLength);
  const hex = await _sha256Hex(seed);
  return hex.slice(0, length);
};

/**
 * 入力文字列から決定的な SHA-256 ハッシュを生成する。
 * `generateHash` と異なりタイムスタンプ・乱数を混ぜないため、同じ input なら常に同じ値を返す。
 *
 * @param input ハッシュ計算の入力文字列（例: sessionId）
 * @param length 返す16進数文字列の長さ（デフォルト: 12）
 * @returns 先頭 `length` 文字の16進数ハッシュ文字列
 */
export const sessionHash = async (input: string, length = 12): Promise<string> => {
  const hex = await _sha256Hex(input);
  return hex.slice(0, length);
};
