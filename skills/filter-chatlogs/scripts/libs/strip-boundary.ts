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
import { STRIP_BOUNDARY_HEADING, STRIP_TEMPLATE_MARKER } from '../constants/strip.constants.ts';

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
