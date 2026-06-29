// src: skills/_scripts/libs/path-utils/path-utils.ts
// @(#): パスユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// utils
import { join, relative } from '@std/path';
import { normalize as posixNormalize } from '@std/path/posix';
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import { expandEnvVars } from './path-env.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** Windowsパスの絶対パス正規表現 */
const _WIN_ABS = /^[A-Za-z]:\//;

// ─────────────────────────────────────────────
// パス正規化
// ─────────────────────────────────────────────

/** バックスラッシュをスラッシュに変換するのみの内部ヘルパー。 */
const _slashOnly = (path: string): string => path.replaceAll('\\', '/');

/** バックスラッシュをスラッシュに変換するのみ（ドット除去・パス検証は行わない）。 */
export const toSlashPath = (path: string): string => _slashOnly(path);

/** ドライブレターを大文字に正規化し、URL pathname 形式（/c:/）を修正する内部ヘルパー。 */
const _fixDriveLetter = (path: string): string => path.replace(/^\/?([A-Za-z]):\//, (_, d) => `${d.toUpperCase()}:/`);

/**
 * パスを Unix スタイルに正規化する。バックスラッシュ変換・ドライブレター大文字化・
 * URL pathname 形式修正・`..`/`./`/`//` の展開・末尾スラッシュ除去を行う。
 * `normalizePath` と異なり `..` セグメントはエラーなしで展開される。
 */
export const toUnixPath = (path: string): string => {
  if (path === '') { return path; }
  const _slashed = _slashOnly(path);
  const _fixed = _fixDriveLetter(_slashed);
  const _normalized = posixNormalize(_fixed);
  return _normalized.replace(/(.)\/+$/, '$1');
};

/**
 * パスを Unix スタイルに正規化する。`toUnixPath` でバックスラッシュ変換・ドライブレター正規化・
 * `..`/`./`/`//` の展開・末尾スラッシュ除去を行った後、展開後のパスに残る `..` や
 * 3ドット以上のセグメントは ChatlogError('InvalidPath') をスローする。
 *
 * `C:\a\..\b` のように展開可能な `..` は `toUnixPath` で `C:/b` に解決されてエラーにならない。
 * `../foo` のような先頭の不可約な `..` は展開後も残るためエラーになる。
 */
export const normalizePath = (path: string): string => {
  if (path === '') { return path; }
  const _expanded = expandEnvVars(path);
  const _normalized = toUnixPath(_expanded);
  // 展開後もドットのみのセグメントが2文字以上（..、...等）残っていれば禁止
  const _hasDotDot = _normalized.split('/').some((seg) => /^\.[.]+$/.test(seg));
  if (_hasDotDot) { throw new ChatlogError('InvalidPath', path, `Path contains forbidden dot segments: ${path}`); }
  return _normalized;
};

/** ファイルパスからディレクトリ部分を返す（末尾スラッシュなし）。 */
export const getDirectory = (path: string): string => {
  return normalizePath(path).split('/').slice(0, -1).join('/');
};

/** ファイルパスからファイル名部分を返す。 */
export const getFilename = (path: string): string => {
  return normalizePath(path).split('/').pop() ?? '';
};

/** ファイルパスから拡張子を除いたファイル名（basename）を返す。ドットファイル（.hidden）は拡張子なしと見なす。 */
export const getBasename = (path: string): string => {
  const _filename = getFilename(path);
  const _dot = _filename.lastIndexOf('.');
  if (_dot <= 0) { return _filename; }
  return _filename.slice(0, _dot);
};

// ─────────────────────────────────────────────
// パス判定
// ─────────────────────────────────────────────

/** パスが絶対パスかどうかを返す。 */
export const isAbsolutePath = (path: string): boolean => {
  if (path === '') { return false; }
  const _normalized = normalizePath(path);
  if (_WIN_ABS.test(_normalized)) { return true; }
  if (_normalized.startsWith('/')) { return true; }
  return false;
};

// ─────────────────────────────────────────────
// パス結合・相対パス
// ─────────────────────────────────────────────

/** 複数のパスを結合し、区切り文字をスラッシュに統一して返す。 */
export const joinPath = (base: string, ...parts: string[]): string => {
  return normalizePath(join(base, ...parts));
};

/** `from` から `to` への相対パスを返す。区切り文字はスラッシュに統一される。`..` を含む相対パスは ChatlogError('InvalidPath') をスローする。 */
export const getRelativePath = (from: string, to: string): string => {
  return normalizePath(relative(from, to));
};
