// src: scripts/libs/strip-classify.ts
// @(#): strip 判定カスケード（R-002 〜 R-008）
//       対象: classifyStrip
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { divideEntry, hasFrontmatter } from '../../../_cle-libs/libs/text/frontmatter-utils.ts';
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ReadTextFileProvider } from '../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// functions
import { findBoundaryLine, hasTemplateMarker } from './strip-boundary.ts';
// constants
import { STRIP_MAX_REMOVAL_RATE } from '../constants/strip.constants.ts';
// types
import type { StripDecision, StripReason } from '../types/strip.types.ts';

// ─── constants ───

/** `outcome !== 'stripped'` のときの除去範囲フィールド。範囲の不在を `-1` / `0` で表す。 */
const _NO_REMOVAL = { removalStartLine: -1, removalEndLine: -1, removedBytes: 0 } as const;

// ─── types ───

/** `classifyStrip` が要求する依存。キャッシュ参照と退避存在確認は述語関数として注入する。 */
type ClassifyStripDeps = {
  /** テスト用に注入可能な読み込み関数（既定: `Deno.readTextFile`）。 */
  readProvider?: ReadTextFileProvider;
  /** R-003: キャッシュに処理済み記録が存在するか。 */
  isProcessed: (path: string) => boolean;
  /** R-004: 対応する退避ファイルが既に存在するか。 */
  hasBackup: (path: string) => Promise<boolean>;
};

// ─── functions ───

/** 非 stripped の判定結果を組み立てる。除去範囲フィールドは常に `-1` / `-1` / `0`。 */
const _decide = (outcome: Exclude<StripDecision['outcome'], 'stripped'>, reason: StripReason): StripDecision => ({
  outcome,
  reason,
  ..._NO_REMOVAL,
});

/** UTF-8 バイト数を返す。`String.length`（UTF-16 コード単位）とは異なる点に注意。 */
const _utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** frontmatter ブロックの行数を返す。本文先頭のファイル全体基準の行番号と一致する。 */
const _frontmatterLines = (frontmatter: string): number => frontmatter === '' ? 0 : frontmatter.split('\n').length - 1;

/**
 * strip 判定カスケード（R-002 〜 R-008）を評価し、単一ファイルの判定結果を返す。
 *
 * 評価順序は仕様上変更できない（specifications.md Section 4.2）ため、早期 return の連鎖として実装する。
 * R-002 (error) → R-003 (done) → R-004 (done) → R-005 (passthrough) → R-006 (passthrough)
 * → R-007 (error) → R-008 (stripped)。
 *
 * frontmatter の有無判定には `hasFrontmatter` を使う。`divideEntry` は壊れた frontmatter で throw し、
 * 1 件の異常が実行全体を中断させて DD-03 に反するため、R-002 通過後にのみ呼ぶ。
 *
 * @param filePath - 判定対象ファイルの絶対パス
 * @param deps - 読み込み関数・キャッシュ記録の参照・退避存在確認の注入
 * @returns 判定結果。I/O エラーも throw せず `outcome: 'error'` として返す
 */
export const classifyStrip = async (
  filePath: string,
  deps: ClassifyStripDeps,
): Promise<StripDecision> => {
  // R-002: 読み取り失敗。I/O エラーのみ Error 値として返り、I/O 以外は readTextFile が再 throw する（DR-21 決定 3）
  const _read = await readTextFile(filePath, { readProvider: deps.readProvider, throwFileIoError: false });
  if (_read instanceof Error) {
    const { kind, subindex } = _read instanceof ChatlogError
      ? _read
      : { kind: _read.name, subindex: _read.message };
    return _decide('error', { rule: 'R-002', kind, subindex, path: filePath });
  }

  // R-002: frontmatter を持たない（壊れた frontmatter も「持たない」として扱う）
  if (!hasFrontmatter(_read)) { return _decide('error', { rule: 'R-002' }); }

  // R-003: キャッシュに処理済み記録が存在する
  if (deps.isProcessed(filePath)) { return _decide('done', { rule: 'R-003' }); }

  // R-004: 対応する退避ファイルが既に存在する
  if (await deps.hasBackup(filePath)) { return _decide('done', { rule: 'R-004' }); }

  const { frontmatter, content } = divideEntry(_read);
  const _lines = content.split('\n');
  const _boundaryIdx = findBoundaryLine(content);

  // R-005: 本文に境界見出しが 1 つも存在しない
  if (_boundaryIdx === -1) { return _decide('passthrough', { rule: 'R-005' }); }

  // R-006: 本文先頭〜境界の直前に定型部マーカーが無い（範囲を限定しないと Edge 13 を誤判定する）
  const _removalRange = _lines.slice(0, _boundaryIdx).join('\n');
  if (!hasTemplateMarker(_removalRange)) { return _decide('passthrough', { rule: 'R-006' }); }

  // R-007: 安全弁。境界見出しより後ろが空、または除去率が上限を超える
  const _removedBytes = _utf8Length(_removalRange);
  const _contentBytes = _utf8Length(content);
  const _afterBoundary = _lines.slice(_boundaryIdx + 1).join('\n');
  const _removalRate = _contentBytes === 0 ? 1 : _removedBytes / _contentBytes;
  if (_afterBoundary.trim() === '' || _removalRate > STRIP_MAX_REMOVAL_RATE) {
    return _decide('error', { rule: 'R-007' });
  }

  // R-008: 上記すべてに該当しない → 除去する（行番号はファイル全体基準、バイト数は本文基準）
  const _fmLines = _frontmatterLines(frontmatter);
  return {
    outcome: 'stripped',
    reason: { rule: 'R-008' },
    removalStartLine: _fmLines,
    removalEndLine: _fmLines + _boundaryIdx - 1,
    removedBytes: _removedBytes,
  };
};
