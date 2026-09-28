// src: scripts/modules/strip/write-stripped.ts
// @(#): strip 書き込みパイプライン（R-009: tmp → 退避 → スワップ）
//       対象: writeStripped
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { readTextFile } from '../../../../_cle-libs/libs/file-io/read-utils.ts';
import { writeTextFile } from '../../../../_cle-libs/libs/file-io/write-utils.ts';
import { backupToBak } from '../../../../_cle-libs/libs/file-ops/backup-to-bak.ts';
import { fileExists } from '../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { divideEntry, frontmatterLines, hasFrontmatter } from '../../../../_cle-libs/libs/text/frontmatter-utils.ts';
// classes
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ChatlogCache } from '../../../../_cle-libs/classes/ChatlogCache.class.ts';

// ─── internal ───
// functions
import { isPasteMarkerLine } from '../../libs/strip-boundary.ts';
// constants
import { BAK_SUFFIX } from '../../constants/common.constants.ts';
import { STRIP_BOUNDARY_HEADING, STRIP_EXCERPT_HEADING } from '../../constants/strip.constants.ts';
import { STRIP_CACHE_STATUSES } from '../../types/strip-cache-status.const.types.ts';
import { STRIP_REMOVAL_KINDS } from '../../types/strip-removal-kind.const.types.ts';
// types
import type { StripCache } from '../../types/cache.types.ts';
import type { StripRemovalKind } from '../../types/strip-removal-kind.const.types.ts';
import type { StripDecision } from '../../types/strip.types.ts';

// ─── constants ───

/**
 * 除去種別ごとの「除去範囲が現在の内容と対応しているか」を判定するアンカー（DR-42）。
 *
 * `specifications.md` Section 4.2 のアンカー表と 1 対 1 で対応する。
 *
 * - `head`（R-008 / DR-01）の除去範囲は「本文先頭〜境界見出しの直前」。開始辺は除去開始行が
 *   frontmatter 行数と一致すること、終了辺は除去終了行の直後が `## Summary` であること
 * - `paste`（R-018 / DR-41）の除去範囲は「`## Excerpt` の次行〜前置き区間内の最後の
 *   貼り付けマーカー行」。開始辺は除去開始行の直前が `## Excerpt` であること、
 *   終了辺は除去終了行が貼り付けマーカー行であること
 * - `none` は除去範囲を持たない分類であり、書き込み経路へ入ること自体が不整合（防御的分岐）
 *
 * 範囲外を指す `lines[end + 1]` / `lines[end]` / `lines[start - 1]` が `undefined` になる比較は
 * **意図的**である。範囲外はそのまま不整合として扱う。
 *
 * **除去規則を追加するときはこの表にもアンカーを追加すること。** 怠るとその規則の判定は
 * 全件 `StaleDecision` となり 1 件も除去されない（DR-42 Consequences）。
 */
const _ANCHOR_CHECKS: Record<
  StripRemovalKind,
  (lines: readonly string[], start: number, end: number, fmLines: number) => boolean
> = {
  [STRIP_REMOVAL_KINDS.HEAD]: (lines, start, end, fmLines) =>
    start === fmLines && lines[end + 1] === STRIP_BOUNDARY_HEADING,
  [STRIP_REMOVAL_KINDS.PASTE]: (lines, start, end) =>
    lines[start - 1] === STRIP_EXCERPT_HEADING && isPasteMarkerLine(lines[end] ?? ''),
  [STRIP_REMOVAL_KINDS.NONE]: () => false,
};

// ─── functions ───

/**
 * `stripped` と判定されたファイルの定型部を除去し、R-009 の順序で安全に書き込む。
 *
 * `writeTextFile` が R-009 の 3 手順（1) `<path>.tmp` へ書き出す → 2) `backupToBak` で
 * 元を `<path>.bak` へ退避 → 3) tmp を本体名へ移動）を分割不能な 1 単位として実行するため、
 * どの時点で中断しても本体か退避の一方に原文が残る（REQ-NF-005 / AC-020）。
 *
 * 退避が既に存在する場合は書き込みを見送り error として計上する。`writeTextFile` は
 * `backup` が `null` を返しても最終リネームを実行し本体を置換してしまうため、
 * 戻り値の検査では原文保全を保証できず、呼び出し前の事前確認が必要となる（防御的分岐）。
 * この経路は R-004 により通常は到達不能である。
 *
 * 除去範囲は `removalStartLine` 〜 `removalEndLine` を inclusive な行番号として駆動する。
 * `removedBytes` は本文基準かつ最終行の行末終端子を含まないため、行番号との突き合わせは行わない。
 *
 * splice の直前に、除去範囲と**現在の**内容の整合を再検証する（REQ-F-008 / Edge 17 / DR-35）。
 * 判定の確定後にファイルが差し替わっていると除去範囲が現在の内容と対応しないため、
 * frontmatter の有無と範囲の順序を共通検証として確認したうえで、除去範囲の両端が現在の内容の
 * どの目印に接しているべきかを `removalKind` ごとのアンカーで確認する（DR-42。`head` は
 * frontmatter 行数と境界見出し、`paste` は `## Excerpt` と貼り付けマーカー行）。
 * 不整合の場合は書き込みを行わず `ChatlogError('FailFast', 'StaleDecision')` を返す。
 * `divideEntry` は壊れた frontmatter で throw するため、`hasFrontmatter` を先に評価する。
 *
 * DD-03 に従い throw せず `ChatlogError` を返す（1 件の error が全件を止めない）。
 * キャッシュ記録の失敗も同様に返す。本体の置換は完了しているが記録が残らないため、
 * 成功ではなく失敗として扱い、呼び出し側が error に計上することで
 * R-011 に退避を保持させ復旧材料を残す。
 *
 * 件数の加算は行わない。分類・ログ・加算の 3 つを分離し、加算を呼び出し側
 * （`strip-chatlogs.ts` の `_applyFileOutcome`）へ一本化するためであり、
 * 本関数は「書き込みの成否」を戻り値で表すことだけに責務を絞る。
 *
 * @param filePath - 書き込み対象ファイルの絶対パス
 * @param decision - `outcome: 'stripped'` の判定結果（除去範囲の行番号を担う）
 * @param cache - 処理済み記録を書き込むキャッシュ
 * @returns 失敗時は `ChatlogError`、成功時は `undefined`
 */
export const writeStripped = async (
  filePath: string,
  decision: StripDecision,
  cache: ChatlogCache<StripCache>,
): Promise<ChatlogError | undefined> => {
  // 防御的分岐: 退避が既存なら原文保全を優先し書き込みを見送る（R-004 により通常は到達不能）
  if (await fileExists(`${filePath}${BAK_SUFFIX}`)) {
    return new ChatlogError('FailFast', 'BackupAlreadyExists', `backup already exists: ${filePath}${BAK_SUFFIX}`);
  }

  const _read = await readTextFile(filePath, { throwFileIoError: false });
  if (_read instanceof Error) {
    return _read instanceof ChatlogError ? _read : new ChatlogError('FailFast', 'ReadFailed', _read.message);
  }

  // 行番号はファイル全体基準・0 起点のため、frontmatter を含む行配列にそのまま適用する
  // （`readTextFile` が LF 正規化済みのテキストを返すため、ここでの再正規化は不要）
  const _lines = _read.split('\n');

  // frontmatter 欠落は独立した早期 return とする。`_fmLines = -1` に潰すと、除去範囲を持たない
  // 分類のセンチネル `removalStartLine = -1` と一致してしまい、`splice(-1, 1)` が末尾行を
  // 削る経路を素通しさせる。
  // `divideEntry` は壊れた frontmatter で throw するため、throw しない `hasFrontmatter` を
  // 必ず先に評価する（この順序が throw を到達不能にしている）。
  if (!hasFrontmatter(_read)) {
    return new ChatlogError('FailFast', 'StaleDecision', `frontmatter missing: ${filePath}`);
  }
  const { removalStartLine: _start, removalEndLine: _end, removalKind: _kind } = decision;
  const _fmLines = frontmatterLines(divideEntry(_read).frontmatter);
  // 範囲の順序検査は除去種別によらない共通検証として左側に置く。除去範囲そのものの当て方は
  // 種別ごとに異なるため、`_ANCHOR_CHECKS` へ委ねる（DR-42）。
  if (_end < _start || !_ANCHOR_CHECKS[_kind](_lines, _start, _end, _fmLines)) {
    return new ChatlogError('FailFast', 'StaleDecision', `removal range does not match content: ${filePath}`);
  }

  _lines.splice(_start, _end - _start + 1);

  try {
    await writeTextFile(filePath, _lines.join('\n'), (path) => backupToBak(path));
  } catch (e) {
    return e instanceof ChatlogError ? e : new ChatlogError('FailFast', 'WriteFailed', String(e));
  }

  // 記録は最終スワップの後に行う。スワップが throw した場合ここへ到達しない（R-003 の誤スキップ防止）
  try {
    await cache.write(filePath, { status: STRIP_CACHE_STATUSES.STRIPPED, rule: decision.reason.rule });
  } catch (e) {
    // 本体の置換は完了しているが記録に失敗したため、次回実行で再 strip されうる。
    // 成功ではなく失敗として返して安全側に倒し、呼び出し側の error 計上により
    // R-011 で退避を保持させる
    return e instanceof ChatlogError ? e : new ChatlogError('FailFast', 'CacheWriteFailed', String(e));
  }

  return undefined;
};
