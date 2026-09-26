// src: scripts/libs/strip-boundary.ts
// @(#): strip 処理の境界検出ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { normalizeLine } from '../../../_cle-libs/libs/text/line-utils.ts';

// ─── internal ───
// constants
import {
  STRIP_BOUNDARY_HEADING,
  STRIP_EXCERPT_HEADING,
  STRIP_PASTE_MARKER_REGEXES,
  STRIP_TEMPLATE_MARKER,
  STRIP_WRAPPER_HEADINGS,
} from '../constants/strip.constants.ts';

/**
 * 本文から境界見出し `## Summary` の最初の出現行を探し、その行インデックス（0 起点）を返す。
 *
 * 行頭完全一致で判定し、Markdown の構文解析は行わない
 * （コードフェンス内・引用内・リスト内かは一切解釈しない）。
 *
 * @param content - 検索対象の本文テキスト（CRLF / LF いずれも可）
 * @returns 最初の出現の行インデックス。存在しない場合は `-1`
 */
export const findBoundaryLine = (content: string): number =>
  normalizeLine(content).split('\n').findIndex((line) => line === STRIP_BOUNDARY_HEADING);

/**
 * 本文に定型部マーカー `## TOPICS ASSIGNMENT RULES` が行頭完全一致で存在するかを返す。
 *
 * `findBoundaryLine` と同様に Markdown の構文解析は行わないため、
 * コードフェンス内のマーカーも「存在あり」と判定する。
 *
 * @param content - 検索対象の本文テキスト（CRLF / LF いずれも可）
 * @returns マーカー行が存在すれば `true`
 */
export const hasTemplateMarker = (content: string): boolean =>
  normalizeLine(content).split('\n').some((line) => line === STRIP_TEMPLATE_MARKER);

/**
 * 貼り付けマーカー行かを判定する（2 種の形式をまとめて扱う）。
 *
 * いずれの形式も行頭からの一致のみを見るため、行中に現れる引用はマーカーとみなさない。
 *
 * @param line - 判定対象の 1 行（改行文字を含まない）
 * @returns 貼り付けマーカー行であれば `true`
 */
const _isPasteMarkerLine = (line: string): boolean => STRIP_PASTE_MARKER_REGEXES.some((pattern) => pattern.test(line));

/**
 * R-018 の前置き区間を伸ばしてよいラッパー行かを判定する。
 *
 * ラッパー行は、空行・貼り付けマーカー行・normalize が生成する見出し行のいずれか。
 * いずれも行頭完全一致（見出し）または行頭一致（マーカー）で判定し、Markdown の構文解析は行わない。
 *
 * @param line - 判定対象の 1 行（改行文字を含まない）
 * @returns ラッパー行であれば `true`
 */
const _isWrapperLine = (line: string): boolean =>
  line.trim() === '' || STRIP_WRAPPER_HEADINGS.includes(line) || _isPasteMarkerLine(line);

/**
 * `## Excerpt` 直後のラッパー前置き区間から、除去対象となる行範囲を求める（R-018）。
 *
 * `## Excerpt` の最初の出現の次の行から、ラッパー行である間だけ区間を伸ばし、
 * その区間内の **最後の** 貼り付けマーカー行を終了行とする。
 * 区間は非ラッパー行（実内容）で必ず打ち切られるため、除去範囲が実内容へ到達することはない。
 *
 * @param content - 本文テキスト（frontmatter を除く。CRLF / LF いずれも可）
 * @returns 除去する開始行と終了行（いずれも 0 起点、content 基準、両端含む）。
 *          R-018 が成立しない場合は `undefined`
 */
export const findPasteWrapperRange = (content: string): { start: number; end: number } | undefined => {
  const _lines = normalizeLine(content).split('\n');
  const _excerptIdx = _lines.indexOf(STRIP_EXCERPT_HEADING);
  if (_excerptIdx < 0) {
    return undefined;
  }

  // ラッパー行である間だけ区間を伸ばす。非ラッパー行（実内容）に達した時点で打ち切り、
  // それ以降のマーカーは一切見ない（本文中の引用を除去しないための要。DR-41 が Option B を却下した点）
  const _start = _excerptIdx + 1;
  const _afterExcerpt = _lines.slice(_start);
  const _breakIdx = _afterExcerpt.findIndex((line) => !_isWrapperLine(line));
  const _wrapperSection = _breakIdx < 0 ? _afterExcerpt : _afterExcerpt.slice(0, _breakIdx);

  const _lastMarkerIdx = _wrapperSection.reduce(
    (last, line, idx) => _isPasteMarkerLine(line) ? idx : last,
    -1,
  );

  return _lastMarkerIdx < 0 ? undefined : { start: _start, end: _start + _lastMarkerIdx };
};
