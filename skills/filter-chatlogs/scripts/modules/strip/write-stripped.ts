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
// constants
import { BAK_SUFFIX } from '../../constants/common.constants.ts';
import { STRIP_BOUNDARY_HEADING } from '../../constants/strip.constants.ts';
import { STRIP_CACHE_STATUSES } from '../../types/strip-cache-status.const.types.ts';
// types
import type { StripCache } from '../../types/cache.types.ts';
import type { StripDecision } from '../../types/strip.types.ts';

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
 * frontmatter の有無・frontmatter 行数との一致・除去終了行の直後が境界見出しであることを確認する。
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
  const { removalStartLine: _start, removalEndLine: _end } = decision;
  const _fmLines = frontmatterLines(divideEntry(_read).frontmatter);
  // `_end + 1` が範囲外のとき `_lines[_end + 1]` は `undefined` となり、境界見出しと一致しない。
  // 範囲外を不整合として扱うため、この `undefined` 比較は意図的である。
  if (_start !== _fmLines || _end < _start || _lines[_end + 1] !== STRIP_BOUNDARY_HEADING) {
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
