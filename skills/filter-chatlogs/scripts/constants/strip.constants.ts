// src: scripts/constants/strip.constants.ts
// @(#): strip 処理の境界検出・安全弁・再試行に用いる定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── internal ───
// constants
import { CHATLOG_DELIMITER_MARK, EXPORTER_PASTE_MARKER_REGEX } from './common.constants.ts';

// ─────────────────────────────────────────────
// strip 境界検出定数
// ─────────────────────────────────────────────

/** strip の除去境界となる見出し行（行頭完全一致で判定する）。 */
export const STRIP_BOUNDARY_HEADING = '## Summary';

/** 定型部の存在を示すマーカー行（行頭完全一致で判定する）。 */
export const STRIP_TEMPLATE_MARKER = '## TOPICS ASSIGNMENT RULES';

// ─────────────────────────────────────────────
// R-018 前置き区間検出定数
// ─────────────────────────────────────────────

/** R-018 の前置き区間の起点となる見出し行（行頭完全一致で判定する）。 */
export const STRIP_EXCERPT_HEADING = '## Excerpt';

/** normalize が生成する会話ログ見出し行。前置き区間のラッパー行として扱う。 */
export const STRIP_CHATLOG_SECTION_HEADING = '## 会話ログ';

/** normalize が生成する User ターン見出し行。前置き区間のラッパー行として扱う。 */
export const STRIP_USER_TURN_HEADING = '### User';

/** normalize が生成する Assistant ターン見出し行。前置き区間のラッパー行として扱う。 */
export const STRIP_ASSISTANT_TURN_HEADING = '### Assistant';

/**
 * 前置き区間のラッパー行とみなす見出し行の一覧（行頭完全一致で判定する）。
 *
 * いずれも normalize が生成する構造であり、貼り付けマーカーの間に挟まることがある。
 */
export const STRIP_WRAPPER_HEADINGS: readonly string[] = [
  STRIP_CHATLOG_SECTION_HEADING,
  STRIP_USER_TURN_HEADING,
  STRIP_ASSISTANT_TURN_HEADING,
];

/**
 * exporter のログブロック開始デリミタが貼り付けられた行の正規表現。
 *
 * `CHATLOG_DELIMITER_MARK` から組み立て、行頭の `#`（見出し化）と空白を許容する。
 * 行頭一致のみを判定し、行中に現れる引用は拾わない。
 */
export const STRIP_CHATLOG_PASTE_MARKER_REGEX = new RegExp(`^#*[ ]*${CHATLOG_DELIMITER_MARK}CHATLOG file=`);

/**
 * `EXPORTER_PASTE_MARKER_REGEX` の行単位判定用バリアント（`m` フラグなし）。
 *
 * 共有定数の `source` をそのまま再利用し、フラグだけを落とす（DR-41 決定 3）。
 *
 * `m` を落とす理由: JavaScript は `m` フラグ下で U+2028 / U+2029 も行終端として扱い、
 * `^` / `$` がそこに一致する。一方 `normalizeLine` と `split('\n')` は U+2028 / U+2029 で
 * 行を分割しないため、`real content\u2028=== x.md ===` のような 1 行がマーカー行と
 * 誤判定され、前半の実内容ごと除去範囲に入ってしまう。
 * この定数は `STRIP_PASTE_MARKER_REGEXES` 経由で **1 行ずつ**評価される用途に限られ、
 * `m` は元々不要なので、落としても行全体一致の意味は変わらない。
 *
 * 共有定数側（`common.constants.ts`）が `m` を保つ理由: あちらは
 * `constants/patterns/filename.constants.ts` が **本文全体**に対して使っており、
 * 複数行から該当行を拾うために `m` が必要である。
 */
export const STRIP_EXPORTER_PASTE_MARKER_LINE_REGEX = new RegExp(EXPORTER_PASTE_MARKER_REGEX.source);

/**
 * 前置き区間で貼り付けマーカー行とみなす正規表現の一覧（2 種）。
 *
 * exporter が残す区切りはバッチプロンプト由来と貼り付け本文由来の 2 系統あるため、
 * 判定をこの 1 箇所へ集約する。いずれも行単位で評価すること。
 */
export const STRIP_PASTE_MARKER_REGEXES: readonly RegExp[] = [
  STRIP_CHATLOG_PASTE_MARKER_REGEX,
  STRIP_EXPORTER_PASTE_MARKER_LINE_REGEX,
];

// ─────────────────────────────────────────────
// strip 安全弁定数
// ─────────────────────────────────────────────

/** 除去率の上限。本文に対する除去バイト数の比がこれを超える場合、安全弁 R-007 により error とする。 */
export const STRIP_MAX_REMOVAL_RATE = 0.99;

// ─────────────────────────────────────────────
// strip 再試行定数
// ─────────────────────────────────────────────

/** 復帰後のキャッシュ削除の最大試行回数。一時的なファイルロックを想定した固定 2 回とする（DR-27）。 */
export const STRIP_CACHE_DELETE_ATTEMPTS = 2;

/** キャッシュ削除の再試行前に挟む待機時間（ミリ秒）。最終試行の後には待機しない（DR-27）。 */
export const STRIP_CACHE_DELETE_RETRY_WAIT_MS = 100;
