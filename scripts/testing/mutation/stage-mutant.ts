// src: scripts/testing/mutation/stage-mutant.ts
// @(#): 変異体をソース文字列に適用する純粋関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { extname, join } from '@std/path';

import { REPO_ROOT } from './constants/mutation.constants.ts';
import type { ApplyMutantResult, DenoConfig, Mutant } from './types/mutation.types.ts';

export type { ApplyMutantResult, DenoConfig } from './types/mutation.types.ts';

/**
 * 変異体番号を命名規則の `<NNN>` に整形する (execution DD-01)。
 * 3 桁にゼロ埋めし、1000 以上は桁をそのまま残す。
 *
 * @param index - 1 始まりの変異体番号
 * @returns 3 桁以上の番号文字列
 */
const _formatIndex = (index: number): string => String(index).padStart(3, '0');

/**
 * ソース文字列の (`line`, `column`) にある `before` を `after` に置き換える (execution R-215 / REQ-F-003)。
 * 対象行以外の行は元の文字列のまま残す (REQ-NF-004)。
 * 指定位置の字句が `before` と一致しないとき (行番号がソースの行数を超える場合を含む) は
 * 例外を投げず error 結果を返す (execution R-214 / execution DD-09)。
 * `line` / `column` が 1 以上の整数でないとき、および `column` が行末 + 1 を超えるときも error 結果を返す。
 *
 * @param source - 変異させる前のソース全体
 * @param mutant - 適用する変異体 (`line` / `column` は 1 始まり)
 * @returns 変異体を適用したソース全体を持つ成功結果、または位置不一致を表す error 結果
 */
export const applyMutant = (source: string, mutant: Mutant): ApplyMutantResult => {
  const { line, column, before, after } = mutant;
  const _lines = source.split('\n');
  const _target = _lines[line - 1];
  const _start = column - 1;
  const _validPosition = Number.isInteger(line) && line >= 1 && Number.isInteger(column) && column >= 1;
  if (!_validPosition || _target === undefined || _start > _target.length || !_target.startsWith(before, _start)) {
    return { ok: false, reason: `${line}:${column} にある字句が '${before}' と一致しない` };
  }
  const _mutated = _target.slice(0, _start) + after + _target.slice(_start + before.length);
  return { ok: true, source: _lines.with(line - 1, _mutated).join('\n') };
};

/**
 * 変異体ファイルのパスを命名規則 `<stem>.mutation-<NNN>.<ext>` で作る (execution R-215 / execution DD-01)。
 * 番号は 3 桁にゼロ埋めし、元ファイルと同じディレクトリに置く。
 *
 * @param filePath - 変異させる元ファイルのパス
 * @param index - 1 始まりの変異体番号
 * @returns 変異体ファイルのパス
 */
export const toMutantPath = (filePath: string, index: number): string => {
  const _ext = extname(filePath);
  const _stem = filePath.slice(0, filePath.length - _ext.length);
  return `${_stem}.mutation-${_formatIndex(index)}${_ext}`;
};

/**
 * 一時設定のパスを命名規則 `deno.mutation-<NNN>.json` で作る (execution R-216 / execution DD-01)。
 * 元の設定 `deno.jsonc` と同じディレクトリ (リポジトリルート) に置く。
 *
 * @param index - 1 始まりの変異体番号
 * @returns 一時設定ファイルのパス
 */
export const toMutationConfigPath = (index: number): string =>
  join(REPO_ROOT, `deno.mutation-${_formatIndex(index)}.json`);

/**
 * 一時設定の中身を作る (execution R-216 / execution DD-02 / DR-01)。
 * 元の設定のキーをすべて保ち、`imports` に「元ファイルの file URL → 変異体ファイルの file URL」を 1 件だけ足す。
 * `--import-map` は使わない。ファイル入出力を行わず、元の設定オブジェクトも変更しない。
 *
 * @param baseConfig - 元の設定
 * @param originalUrl - 変異させる元ファイルの file URL
 * @param mutantUrl - 変異体ファイルの file URL
 * @returns 一時設定
 */
export const buildMutationConfig = (baseConfig: DenoConfig, originalUrl: string, mutantUrl: string): DenoConfig => ({
  ...baseConfig,
  imports: { ...baseConfig.imports, [originalUrl]: mutantUrl },
});
