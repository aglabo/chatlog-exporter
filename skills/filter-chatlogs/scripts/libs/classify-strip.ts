// src: scripts/libs/classify-strip.ts
// @(#): strip 判定カスケード（R-002 〜 R-008）
//       対象: classifyStrip
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { isFileIoError, readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { fileExists } from '../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { divideEntry, hasFrontmatter } from '../../../_cle-libs/libs/text/frontmatter-utils.ts';
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import type { ReadTextFileProvider } from '../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// functions
import { findBoundaryLine, hasTemplateMarker } from './strip-boundary.ts';
// constants
import { BAK_SUFFIX } from '../constants/common.constants.ts';
import { STRIP_MAX_REMOVAL_RATE } from '../constants/strip.constants.ts';
import { STRIP_CACHE_STATUSES } from '../types/strip-cache-status.const.types.ts';
// types
import type { StripCache } from '../types/cache.types.ts';
import type { StripCacheStatus } from '../types/strip-cache-status.const.types.ts';
import type { StripDecision, StripReason } from '../types/strip.types.ts';

// ─── constants ───

/** 除去範囲を持たない分類（`done` / `passthrough` / `error`）の除去範囲フィールド。不在を `-1` / `0` で表す。 */
const _NO_REMOVAL = { removalStartLine: -1, removalEndLine: -1, removedBytes: 0, contentBytes: 0 } as const;

/**
 * R-003 が「処理済み」とみなすキャッシュのステータス（DR-31 決定 2）。
 *
 * `stripped` は除去して書き込みまで完了した記録、`passthrough` は除去対象を持たないと
 * 判定済みの記録であり、いずれもファイルが変更されない限り再判定しても結果が変わらない。
 * `error` は含めない。次回実行で再判定されるべき状態だからである。
 *
 * 要素型を `StripCacheStatus | undefined` に広げるのは、`cache.read` が `Partial<StripCache>` を
 * 返し記録の無いファイルでは `status` が `undefined` になるためである（キャストを避ける）。
 */
const _PROCESSED_STATUSES: readonly (StripCacheStatus | undefined)[] = [
  STRIP_CACHE_STATUSES.STRIPPED,
  STRIP_CACHE_STATUSES.PASSTHROUGH,
];

// ─── types ───

/**
 * `classifyStrip` の任意オプション。いずれもテストから実 I/O を切り離すための注入口であり、
 * 省略時は実物の既定実装が使われる。
 *
 * R-003 のキャッシュ参照はここに含めない。判定に使うキャッシュは `cache` 引数として必須で受け取り、
 * 「処理済みか」の評価は本関数の内部責務とする（呼び出し側ごとに判定規則がぶれないようにする）。
 */
type ClassifyStripOptions = {
  /** テスト用に注入可能な読み込み関数（既定: `Deno.readTextFile`）。 */
  readProvider?: ReadTextFileProvider;
  /**
   * R-004: 対応する退避ファイルが既に存在するかの判定（既定: `<path>.bak` の存在確認）。
   *
   * キャッシュとは別軸の「実 FS 上の退避の有無」を見るため、`cache` とは独立した注入口として残す。
   */
  hasBackup?: (path: string) => Promise<boolean>;
};

// ─── functions ───

/** 除去を伴わない判定結果を組み立てる。除去範囲フィールドは常に `-1` / `-1` / `0`。 */
const _decide = (
  outcome: Exclude<StripDecision['outcome'], 'stripped' | 'skipped'>,
  reason: StripReason,
): StripDecision => ({
  outcome,
  reason,
  ..._NO_REMOVAL,
});

/**
 * I/O エラーから R-002 / R-004 共通の判定理由を組み立てる（DR-21 決定 2 の形式）。
 *
 * `ChatlogError` は自身の `kind` / `subindex` を、それ以外の `Error` はクラス名とメッセージを担ぐ。
 *
 * @param error - I/O 起因のエラー
 * @param rule - 付随情報を担ぐ規則 ID
 * @param path - 判定対象ファイルのパス
 * @returns `kind` / `subindex` / `path` を含む判定理由
 */
const _ioReason = (error: Error, rule: 'R-002' | 'R-004', path: string): StripReason => {
  const { kind, subindex } = error instanceof ChatlogError ? error : { kind: error.name, subindex: error.message };
  return { rule, kind, subindex, path };
};

/** UTF-8 バイト数を返す。`String.length`（UTF-16 コード単位）とは異なる点に注意。 */
const _utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** frontmatter ブロックの行数を返す。本文先頭のファイル全体基準の行番号と一致する。 */
const _frontmatterLines = (frontmatter: string): number => frontmatter === '' ? 0 : frontmatter.split('\n').length - 1;

/**
 * strip 判定カスケード（R-002 〜 R-008）を評価し、単一ファイルの判定結果を返す。
 *
 * 評価順序は仕様上変更できない（specifications.md Section 4.2）ため、早期 return の連鎖として実装する。
 * R-002 (error) → R-003 (done: 処理済み記録) → R-004 (done) → R-005 (passthrough) → R-006 (passthrough)
 * → R-007 (error) → R-008 (stripped / skipped)。
 *
 * frontmatter の有無判定には `hasFrontmatter` を使う。`divideEntry` は壊れた frontmatter で throw し、
 * 1 件の異常が実行全体を中断させて DD-03 に反するため、R-002 通過後にのみ呼ぶ。
 *
 * ## 本関数は副作用を持たない
 *
 * 判定のみを行い、書き込み・退避・キャッシュ記録は一切行わない。分類結果を受けて実際に
 * 書き込むかどうかは**呼び出し側が決める**（`strip-chatlogs.ts` の `_classifyFile`）。
 * `dryRun` を受け取るのは書き込みを抑止するためではなく、**分類を 1 箇所で確定させる**ためである。
 *
 * ## `dryRun` が分類へ与える影響
 *
 * 影響を受けるのは R-008 に到達した場合のみで、`stripped` が `skipped` へ振り替わる。
 * 除去を伴わない判定（R-002〜R-007）は dry-run の有無で変化しない。除去対象でないファイルまで
 * `skipped` にすると、呼び出し側の件数加算が `stats.skipped` を不当に押し上げるためである。
 *
 * `skipped` は除去範囲を `stripped` と**同値**で担ぐ。dry-run 明細は除去範囲を表示するため、
 * `-1` / `0` へ潰すと 6000 件規模の事前レビューが成立しない。
 *
 * ## R-003 の「処理済み記録」（DR-31 決定 2）
 *
 * `status` が `stripped`（除去して書き込み済み）または `passthrough`（除去対象を持たないと
 * 判定済み）のときに処理済みとみなす。いずれもファイルが変更されない限り再判定の結果が
 * 変わらないためであり、`passthrough` を除外すると毎回全ファイルを読み直すことになる。
 * `error` の記録は処理済みとみなさない（次回実行で再判定されるべき状態である）。
 *
 * ## 再 export による記録の陳腐化は運用で解く
 *
 * キャッシュのキーはファイル名（`ChatlogCache` の内部キー = basename）であり、内容の同一性は
 * 検証しない。そのため同一セッションを再 export して同じパスへ定型部つきの内容を上書きすると、
 * 記録は `stripped` / `passthrough` のまま残り、R-003 が `done` を返して定型部が残る。
 * 退避は Phase 6 の一括削除で消えているため R-004 も成立せず、陳腐化する記録はキャッシュのみである。
 *
 * これは設計上の想定であり、**strip キャッシュ（`<cacheDir>/strip-cache/`）を手動で削除してから
 * strip を再実行する**運用で解く。再 export はログを作り直す操作であり、filter・strip もやり直す
 * 前提のためである。内容ハッシュや mtime を記録して自動無効化する方式は採らない。判定を省くための
 * キャッシュに全件の再ハッシュ・stat を課すことになり、6000 件規模で目的と逆行する。
 *
 * @param filePath - 判定対象ファイルの絶対パス
 * @param cache - R-003 の処理済み記録を参照するキャッシュ（本関数は読むだけで書かない）
 * @param dryRun - 真なら R-008 の分類を `stripped` ではなく `skipped` として返す
 * @param options - 読み込み関数・退避存在確認の注入（省略時は実物の既定実装）
 * @returns 判定結果。読み取り（R-002）・退避存在確認（R-004）いずれの I/O エラーも throw せず
 *   `outcome: 'error'` として返し、`reason` に `kind` / `subindex` / `path` を担ぐ。
 *   I/O 起因でない例外のみ伝播する（fail-first / DR-21 決定 3）
 */
export const classifyStrip = async (
  filePath: string,
  cache: ChatlogCache<StripCache>,
  dryRun: boolean,
  options: ClassifyStripOptions = {},
): Promise<StripDecision> => {
  const _hasBackup = options.hasBackup ?? ((path: string) => fileExists(`${path}${BAK_SUFFIX}`));

  // R-002: 読み取り失敗。I/O エラーのみ Error 値として返り、I/O 以外は readTextFile が再 throw する（DR-21 決定 3）
  const _read = await readTextFile(filePath, { readProvider: options.readProvider, throwFileIoError: false });
  if (_read instanceof Error) { return _decide('error', _ioReason(_read, 'R-002', filePath)); }

  // R-002: frontmatter を持たない（壊れた frontmatter も「持たない」として扱う）
  if (!hasFrontmatter(_read)) { return _decide('error', { rule: 'R-002' }); }

  // R-003: キャッシュに処理済み記録（`stripped` または `passthrough`）が存在する（DR-31 決定 2）
  if (_PROCESSED_STATUSES.includes(cache.read(filePath).status)) { return _decide('done', { rule: 'R-003' }); }

  // R-004: 対応する退避ファイルが既に存在する。
  // 既定の `fileExists` は `NotFound` 以外の I/O エラーを再 throw し、1 件の stat 失敗が実行全体を
  // 中断させて DD-03 に反するため、I/O エラーは error 判定へ丸め込む。
  // I/O 起因でない例外は握りつぶさず伝播させる（fail-first / DR-21 決定 3）。
  try {
    if (await _hasBackup(filePath)) { return _decide('done', { rule: 'R-004' }); }
  } catch (e) {
    if (!(e instanceof Error) || !isFileIoError(e)) { throw e; }
    return _decide('error', _ioReason(e, 'R-004', filePath));
  }

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

  // R-008: 上記すべてに該当しない → 除去する（行番号はファイル全体基準、バイト数は本文基準）。
  // dry-run は書き込みを見送るため分類のみ `skipped` へ振り替え、除去範囲は同値のまま担ぐ
  const _fmLines = _frontmatterLines(frontmatter);
  return {
    outcome: dryRun ? 'skipped' : 'stripped',
    reason: { rule: 'R-008' },
    removalStartLine: _fmLines,
    removalEndLine: _fmLines + _boundaryIdx - 1,
    removedBytes: _removedBytes,
    contentBytes: _contentBytes,
  };
};
