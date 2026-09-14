// src: skills/_cle-libs/libs/ai/__tests__/helpers/allow-net-check.ts
// @(#): --allow-net 付与範囲の静的検査ヘルパー（テスト専用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// libs
import { expandGlob } from '@std/fs';
import { basename, dirname } from '@std/path';
import { normalizePath } from '../../../path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

/** 対象行に `--allow-net` が必要（`required`）か、付与してはならない（`forbidden`）か。 */
export type AllowNetExpectation = 'required' | 'forbidden';

/** `checkAllowNet` の結果。フラグ列を記述しない行は判定対象外（excluded）となる。 */
export type AllowNetCheckResult =
  | { readonly excluded: true }
  | { readonly excluded: false; readonly flags: ReadonlySet<string>; readonly conforming: boolean };

/** 検査対象行の出所。`skill-md` は SKILL.md の `deno run` 行、`shebang` はスクリプト 1 行目の shebang 行。 */
export type TargetLineSource = 'skill-md' | 'shebang';

/** `enumerateTargetLines` が列挙する検査対象行。 */
export type TargetLine = {
  readonly skill: string;
  readonly source: TargetLineSource;
  readonly filePath: string;
  readonly line: string;
};

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** フラグ列の開始位置を示すコマンド。 */
const _DENO_RUN = 'deno run';

/** フラグ列を省略したことを示すトークン。 */
const _OMITTED = '...';

/** shebang 行の接頭辞。 */
const _SHEBANG = '#!';

/** 行区切り（CRLF / LF）。 */
const _LINE_BREAK = /\r?\n/;

// ─────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────

/** スクリプト引数トークン（`"` / `$` 始まり、または `.ts` 終わり）かどうか。 */
const _isScriptArg = (token: string): boolean =>
  token.startsWith('"') || token.startsWith('$') || token.endsWith('.ts');

// ─────────────────────────────────────────────
// 純関数
// ─────────────────────────────────────────────

/**
 * `deno run` 行からスクリプト引数より前の `--` フラグ集合を抽出する。
 *
 * @param line - SKILL.md の `deno run` 行、または shebang 行
 * @returns フラグ集合。`deno run` を含まない行・フラグ列を `...` で省略した行・`--` フラグが無い行は `null`
 */
export const extractDenoRunFlags = (line: string): ReadonlySet<string> | null => {
  const _start = line.indexOf(_DENO_RUN);
  if (_start < 0) { return null; }

  const _tokens = line.slice(_start + _DENO_RUN.length).replaceAll(/[`\\]/g, ' ').trim().split(/\s+/);
  const _scriptIndex = _tokens.findIndex(_isScriptArg);
  const _head = _scriptIndex < 0 ? _tokens : _tokens.slice(0, _scriptIndex);
  if (_head.includes(_OMITTED)) { return null; }

  const _flags = _head.filter((token) => token.startsWith('--'));
  return _flags.length === 0 ? null : new Set(_flags);
};

/**
 * `deno run` 行の `--allow-net` 付与が期待値に適合するかを判定する。
 *
 * @param line - 検査対象の行
 * @param expectation - `--allow-net` が必要か禁止か
 * @returns 適合判定、またはフラグ列を記述しない行の場合は `{ excluded: true }`
 */
export const checkAllowNet = (line: string, expectation: AllowNetExpectation): AllowNetCheckResult => {
  const _flags = extractDenoRunFlags(line);
  if (_flags === null) { return { excluded: true }; }

  return { excluded: false, flags: _flags, conforming: _flags.has('--allow-net') === (expectation === 'required') };
};

// ─────────────────────────────────────────────
// 薄い I/O
// ─────────────────────────────────────────────

/**
 * リポジトリルートからの glob に一致するファイルを列挙し、正規化済みパスと本文の組を返す。
 *
 * @param repoRoot - リポジトリルートの絶対パス
 * @param glob - リポジトリルート相対の glob（`*` はディレクトリを跨がない）
 * @returns 正規化済みファイルパスとファイル本文の組
 */
const _readGlob = async (
  repoRoot: string,
  glob: string,
): Promise<readonly { readonly filePath: string; readonly text: string }[]> => {
  const _walked = await Array.fromAsync(expandGlob(glob, { root: repoRoot, includeDirs: false }));
  return await Promise.all(
    _walked.map(async (entry) => ({ filePath: normalizePath(entry.path), text: await Deno.readTextFile(entry.path) })),
  );
};

/**
 * `skills/*\/SKILL.md` の `deno run` 行と、`skills/*\/scripts/*.ts` のうち 1 行目が `#!` で始まる shebang 行を列挙する。
 *
 * @param repoRoot - リポジトリルートの絶対パス
 * @returns 検査対象行（スキル名・出所・ファイルパス・行文字列）
 */
export const enumerateTargetLines = async (repoRoot: string): Promise<readonly TargetLine[]> => {
  const [_skillMds, _scripts] = await Promise.all([
    _readGlob(repoRoot, 'skills/*/SKILL.md'),
    _readGlob(repoRoot, 'skills/*/scripts/*.ts'),
  ]);

  const _skillMdLines = _skillMds.flatMap(({ filePath, text }) =>
    text.split(_LINE_BREAK)
      .filter((line) => line.includes(_DENO_RUN))
      .map((line): TargetLine => ({ skill: basename(dirname(filePath)), source: 'skill-md', filePath, line }))
  );
  const _shebangLines = _scripts
    .map(({ filePath, text }): TargetLine => ({
      skill: basename(dirname(dirname(filePath))),
      source: 'shebang',
      filePath,
      line: text.split(_LINE_BREAK, 1)[0],
    }))
    .filter((entry) => entry.line.startsWith(_SHEBANG));

  return [..._skillMdLines, ..._shebangLines];
};
