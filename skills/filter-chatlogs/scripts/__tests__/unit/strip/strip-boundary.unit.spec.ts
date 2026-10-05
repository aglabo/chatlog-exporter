// src: scripts/__tests__/unit/strip/strip-boundary.unit.spec.ts
// @(#): strip の前置き区間検出（R-018）と貼り付けマーカー行判定のユニットテスト
//       対象: findPasteWrapperRange / isPasteMarkerLine
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findPasteWrapperRange, isPasteMarkerLine } from '../../../libs/strip-boundary.ts';

// ─── Helpers
// constants
import { CHATLOG_BLOCK_OPEN_TEMPLATE } from '../../../constants/common.constants.ts';

// ─── Internal Helpers

// types

/** `findPasteWrapperRange` の 1 ケース分の入出力。`expected` の `undefined` は R-018 不成立を表す。 */
interface _RangeCase {
  /** テスト ID（`T-FL-PWR-NN-NN`）。 */
  id: string;
  /** `it` ラベルに埋め込むケースの説明（入力の特徴と期待の要約）。 */
  label: string;
  /** 本文テキスト。frontmatter は含めない。 */
  content: string;
  /** 期待する除去範囲。R-018 が不成立なら `undefined`。 */
  expected: { start: number; end: number } | undefined;
}

/** `isPasteMarkerLine` の 1 ケース分の入出力。`line` は改行文字を含まない 1 行。 */
interface _MarkerLineCase {
  /** テスト ID（`T-FL-IPM-NN-NN`）。 */
  id: string;
  /** `it` ラベルに埋め込むケースの説明（入力の特徴と期待の要約）。 */
  label: string;
  /** 判定対象の 1 行（改行文字を含まない）。 */
  line: string;
  /** 期待する判定結果。貼り付けマーカー行なら `true`。 */
  expected: boolean;
}

// constants

/** ラッパー前置き区間に貼り付けマーカーがあり、除去範囲が確定する正常系ケース。 */
const _normalCases: readonly _RangeCase[] = [
  {
    id: 'T-FL-PWR-01-01',
    label: 'Excerpt 直後に `<<<CHATLOG file="x.md">>>` が 1 行 → { start: 1, end: 1 }',
    content: '## Excerpt\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-01-02',
    label: 'ラッパー見出し（`## 会話ログ` / `### User`）を跨いでマーカー 2 行 → { start: 1, end: 5 }',
    content:
      '## Excerpt\n# <<<CHATLOG file="a.md">>>\n\n## 会話ログ\n### User\n<<<CHATLOG file="b.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 5 },
  },
  {
    id: 'T-FL-PWR-01-03',
    label: 'Excerpt 直後に `=== x.md ===` が 1 行 → { start: 1, end: 1 }',
    content: '## Excerpt\n=== x.md ===\n実内容のテキスト\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-01-04',
    label: '2 種のマーカーが混在 → 最後のマーカー行が end になる { start: 1, end: 3 }',
    content: '## Excerpt\n<<<CHATLOG file="a.md">>>\n\n=== b.md ===\n実内容のテキスト\n',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-01-05',
    label: 'CRLF の本文 → LF と同じ { start: 1, end: 1 }',
    content: '## Excerpt\r\n<<<CHATLOG file="x.md">>>\r\n実内容のテキスト\r\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-01-06',
    label: '`## Excerpt` が本文先頭でなく（frontmatter と `## Summary` が先行）行 7 にある → { start: 8, end: 8 }',
    content:
      '---\ntitle: サンプル\n---\n\n## Summary\n要約のテキスト\n\n## Excerpt\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 8, end: 8 },
  },
  {
    id: 'T-FL-PWR-01-07',
    label: '前置き区間に `### Assistant` が挟まる → 区間が伸びて最後のマーカーまで { start: 1, end: 4 }',
    content: '## Excerpt\n<<<CHATLOG file="a.md">>>\n\n### Assistant\n=== b.md ===\n実内容のテキスト\n',
    expected: { start: 1, end: 4 },
  },
  {
    id: 'T-FL-PWR-01-08',
    label: 'Excerpt 直後が空行 + `## 会話ログ` で最初のマーカーは 2 行あと → { start: 1, end: 3 }'
      + '（start は常に `## Excerpt` の次の行であり、区間内の最初のマーカー行へすり替える変異を検出する）',
    content: '## Excerpt\n\n## 会話ログ\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-01-09',
    label: 'Excerpt 直後が `#` と `#` で挟まれた見出し化マーカー行 → { start: 1, end: 1 }'
      + '（exporter が見出し化した形（`>>> #`）は引き続きマーカーとして認定する。'
      + 'マーカー行を行全体一致へ厳格化する修正が、この形まで巻き込んで認定をやめる退行を検出する）',
    content: '## Excerpt\n# <<<CHATLOG file="x.md">>> #\n本文のテキスト\n',
    expected: { start: 1, end: 1 },
  },
];

/** R-018 の成立条件を満たさず、除去範囲が確定しない異常系ケース。 */
const _errorCases: readonly _RangeCase[] = [
  {
    id: 'T-FL-PWR-02-01',
    label: '`## Excerpt` が無い（`## Summary` のみ）→ undefined',
    content: '## Summary\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-02-02',
    label: '`## Excerpt` はあるが区間内にマーカーが 1 つも無い → undefined',
    content: '## Excerpt\n\n## 会話ログ\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-02-03',
    label: '`## Excerpt` が無く本文先頭がマーカー行 → undefined'
      + '（`_excerptIdx < 0` ガードを外して起点を本文先頭とみなす変異を検出する。'
      + '先頭が非ラッパー行の T-FL-PWR-02-01 では区間が即打ち切られて検出できない）',
    content: '<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: undefined,
  },
];

/**
 * 区間の起点・打ち切り・終端・EOF 到達・見出しの行全体一致・空行判定の境界を見るエッジケース。
 *
 * いずれも「実内容を除去範囲へ含めてはならない」形であり、誤削除防止の要となる。
 * 除去範囲が確定する形（`expected` が範囲）も、区間がどこで止まるかを固定するために置く。
 * 起点・打ち切りの判定はいずれも見出しの行全体一致で行う。`## Excerpt` 以降がすべてラッパー行であれば、
 * 末尾改行の有無によらず区間を EOF まで伸ばす（末尾改行が作る空文字列の要素もラッパー行である）。
 * 空行判定は行を trim した結果で行うため、`trim()` が除去する空白文字全般
 * （ASCII の半角空白・タブに限らず、全角空白 U+3000 を含む）だけの行も
 * 空行と同じラッパー行として扱い、区間を打ち切らない（R-018 判定手順 2）。
 */
const _edgeCases: readonly _RangeCase[] = [
  {
    id: 'T-FL-PWR-03-01',
    label: 'マーカーが前置き区間の外（実内容の後ろ）にしか無い → undefined（本文中の引用を除去しない）',
    content: '## Excerpt\n本文の実内容です\n\n<<<CHATLOG file="x.md">>>\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-02',
    label: '区間途中の実内容で打ち切られ、その後ろのマーカーは見ない → undefined',
    content: '## Excerpt\n\n## 会話ログ\n本文の実内容です\n<<<CHATLOG file="x.md">>>\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-03',
    label: '`## Excerpt` が最終行（次の行が無い）→ undefined',
    content: '## Summary\n本文の実内容です\n## Excerpt',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-04',
    label: 'マーカーが行中にあり行頭一致しない → ラッパーともマーカーともみなさず undefined',
    content: '## Excerpt\n引用として <<<CHATLOG file="x.md">>> と書いた行\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-05',
    label:
      '区間のマーカーの後ろに実内容が続き、その先に再びマーカーがある → 最初の実内容で打ち切り { start: 1, end: 1 }'
      + '（DR-41 が却下した Option B = 本文全体からマーカーを拾う形への退行を検出する）',
    content:
      '## Excerpt\n<<<CHATLOG file="a.md">>>\n実内容のテキスト A\n実内容のテキスト B\n<<<CHATLOG file="b.md">>>\n末尾のテキスト\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-03-06',
    label:
      '区間内の最後のマーカーの後ろにラッパー行（`### User`）が続く → end はマーカー行で止まり { start: 1, end: 1 }',
    content: '## Excerpt\n<<<CHATLOG file="x.md">>>\n\n### User\n実内容のテキスト\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-03-07',
    label: '`## Excerpt` が本文中に 2 回現れる → 最初の出現を起点とし { start: 1, end: 1 }',
    content:
      '## Excerpt\n<<<CHATLOG file="a.md">>>\n実内容のテキスト\n\n## Excerpt\n<<<CHATLOG file="b.md">>>\n別の実内容のテキスト\n',
    expected: { start: 1, end: 1 },
  },
  {
    id: 'T-FL-PWR-03-08',
    label: '`=== x.md ===` の後ろに本文が続く行 → 行全体が一致しないためマーカーとみなさず undefined',
    content: '## Excerpt\n=== x.md === と書いた引用行\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-09',
    label: '`=== x.md ===` が行末にあり行頭から始まらない → マーカーとみなさず undefined',
    content: '## Excerpt\n引用として === x.md ===\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-10',
    label: '行の途中に U+2028 を挟んで `=== x.md ===` が続く → 行全体はマーカーではないため undefined'
      + '（`m` フラグ下で U+2028 が行終端として扱われ、前半の実内容ごと除去範囲に入る誤判定を検出する）',
    content: '## Excerpt\nreal content\u2028=== x.md ===\nretained\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-11',
    label: 'U+2028 を挟んだ行が 2 行続く → 1 行目の実内容で区間が打ち切られ undefined'
      + '（実内容を越えて走査が続く＝打ち切り保証そのものの破れを検出する）',
    content: '## Excerpt\nprose A\u2028=== a.md ===\nprose B\u2028=== b.md ===\nreal\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-12',
    label: 'Excerpt 直後がラッパーでない `##` 見出し → 区間が即打ち切られ undefined'
      + '（ラッパー見出しの判定を完全一致リストから `#` 始まりへ広げ、実内容の見出しを巻き込む変異を検出する）',
    content: '## Excerpt\n## 実内容の見出し\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-13',
    label: '`## Excerpt について` は `## Excerpt` と行全体が一致しない → 起点が見つからず undefined'
      + '（`## Excerpt` の行全体一致を前方一致検索へ緩める変異を検出する）',
    content: '## Excerpt について\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-14',
    label: '区間がマーカーを含んだまま EOF に達する（末尾に改行が無い）→ { start: 1, end: 3 }'
      + '（EOF 到達時に区間を末尾まで伸ばす分岐を落とす変異を検出する。末尾改行を足すと分割後の末尾要素が'
      + '空文字列になり、変異体の `slice(0, -1)` がその空要素だけを落としてマーカーを残すため検出できない）',
    content: '## Excerpt\n\n### User\n<<<CHATLOG file="x.md">>>',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-03-15',
    label: '空行の代わりに半角空白 3 個だけの行が挟まる → ラッパー行として区間が伸び { start: 1, end: 3 }'
      + '（空行判定から `trim()` を落として素の空文字列比較へ狭める変異を検出する）',
    content: '## Excerpt\n   \n### User\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-03-16',
    label: '空行の代わりに半角空白 + タブの行が挟まる → ラッパー行として区間が伸び { start: 1, end: 3 }'
      + '（空行判定を先頭の半角空白のみ除去する形（`line.replace(/^ +/, ...)`）へ狭める変異を検出する。'
      + '半角空白だけの T-FL-PWR-03-15 はこの変異でも空文字列になるため落とせず、'
      + 'タブを含む本ケースだけが差を観測できる）',
    content: '## Excerpt\n \t\n### User\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-03-17',
    label: '空行の代わりに全角空白 (U+3000) 1 個だけの行が挟まる → ラッパー行として区間が伸び { start: 1, end: 3 }'
      + '（空行判定を ASCII の半角空白・タブのみを許す形へ狭める変異を検出する。'
      + '半角空白のみの T-FL-PWR-03-15 / 半角空白 + タブの T-FL-PWR-03-16 は ASCII の範囲内であり、'
      + '変異体でも空と判定されるため落とせず、`trim()` が除去する非 ASCII の空白だけの行を見る）',
    content: '## Excerpt\n\u3000\n### User\n<<<CHATLOG file="x.md">>>\n実内容のテキスト\n',
    expected: { start: 1, end: 3 },
  },
  {
    id: 'T-FL-PWR-03-18',
    label: 'マーカーの後ろに実内容（`### User …`）が続く行 → 行全体がマーカーではないため undefined'
      + '（この行をマーカーと認定すると、後ろに続く実内容ごと除去範囲へ入って削除される。'
      + '実データにも同型の行が実在する（`# <<<CHATLOG file="...">>> ### User …` 等））',
    content: '## Excerpt\n<<<CHATLOG file="x.md">>> ### User 実内容の行\n本文のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-19',
    label: 'マーカーの後ろに U+2028 を挟んで実内容が続く行 → 行全体がマーカーではないため undefined'
      + '（U+2028 は行の分割対象外であり、1 行にマーカーと実内容が同居しうる。'
      + 'この行をマーカーと認定すると U+2028 より後ろの実内容が除去範囲へ入って削除される）',
    content: '## Excerpt\n<<<CHATLOG file="x.md">>>' + String.fromCharCode(0x2028) + '実内容の行\n本文のテキスト\n',
    expected: undefined,
  },
  {
    id: 'T-FL-PWR-03-20',
    label: 'マーカーの直後に見出し文字列で始まる実内容行（`### User が書いた…`）が続く → マーカー 1 行のみ除去'
      + '（見出し判定を完全一致から前方一致（`line.startsWith(h)`）へ緩める変異を検出する。'
      + '変異体では実内容行がラッパー見出しと誤認されて除去範囲が { start: 1, end: 3 } へ広がり、実内容が削除される。'
      + 'T-FL-PWR-03-12 は「`#` 始まりへ広げる」方向のみを見ており、この緩和を検出できない）',
    content: '## Excerpt\n<<<CHATLOG file="a.md">>>\n### User が書いた実内容の行\n=== b.md ===\n本文\n',
    expected: { start: 1, end: 1 },
  },
];

/** exporter のログブロック開始デリミタが貼り付けられたマーカー行。`CHATLOG_BLOCK_OPEN_TEMPLATE` から組み立てる。 */
const _chatlogMarkerLine = CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', 'x.md');

/** exporter の貼り付け本文由来のマーカー行（`=== <ファイル名> ===` 形）。 */
const _exporterMarkerLine = '=== x.md ===';

/** normalize が見出し化したマーカー行（行頭の `#` と空白を許容する形。REQ-F-012）。 */
const _headingMarkerLine = `## ${_chatlogMarkerLine}`;

/** マーカーを一切含まない実内容の行。 */
const _plainContentLine = '実内容のテキスト';

/**
 * 実内容の後ろに U+2028 を挟んでマーカー相当の並びが続く 1 行。
 *
 * U+2028 のリテラルをソースへ書くと編集ツールが黙ってデコードすることがあるため、
 * `String.fromCharCode(0x2028)` で組み立てる。
 */
const _lineSeparatorLine = `実内容${String.fromCharCode(0x2028)}${_exporterMarkerLine}`;

/**
 * マーカーの後ろに実内容（`### User` 以降）が続く 1 行。
 *
 * exporter の貼り付け結果には同型の行が実在する（`# <<<CHATLOG file="...">>> ### User …` 等）。
 */
const _markerWithTrailingContentLine = `${_chatlogMarkerLine} ### User 実内容の行`;

/**
 * マーカーの後ろに U+2028 を挟んで実内容が続く 1 行。
 *
 * U+2028 は行の分割対象外であり、1 行にマーカーと実内容が同居しうる。
 * リテラルをソースへ書くと編集ツールが黙ってデコードすることがあるため、
 * `_lineSeparatorLine` と同じく `String.fromCharCode(0x2028)` で組み立てる。
 */
const _markerWithLineSeparatorContentLine = `${_chatlogMarkerLine}${String.fromCharCode(0x2028)}実内容の行`;

/** exporter が見出し化したマーカー行（前後を `#` / `##` で囲んだ形。REQ-F-012）。 */
const _hashWrappedMarkerLine = `# ${_chatlogMarkerLine} ##`;

/** 2 系統のマーカー形式（normalize による見出し化を含む）を `true` と判定する正常系ケース。 */
const _markerNormalCases: readonly _MarkerLineCase[] = [
  {
    id: 'T-FL-IPM-01-01',
    label: '`<<<CHATLOG file="x.md">>>` 形のマーカー行 → true',
    line: _chatlogMarkerLine,
    expected: true,
  },
  {
    id: 'T-FL-IPM-01-02',
    label: '`=== x.md ===` 形のマーカー行 → true',
    line: _exporterMarkerLine,
    expected: true,
  },
  {
    id: 'T-FL-IPM-01-03',
    label: 'normalize が見出し化したマーカー行（`## <<<CHATLOG file="x.md">>>`）→ true（REQ-F-012）',
    line: _headingMarkerLine,
    expected: true,
  },
  {
    id: 'T-FL-IPM-01-04',
    label: '前後を `#` で囲んだ見出し化マーカー行（`# <<<CHATLOG file="x.md">>> ##`）→ true'
      + '（exporter が見出し化した形（`>>> ##`）は引き続きマーカーとして認定する。'
      + '行全体一致への厳格化がこの形まで巻き込んで落とす退行を検出する）',
    line: _hashWrappedMarkerLine,
    expected: true,
  },
];

/** マーカーを含まない行を `false` と判定する異常系ケース。 */
const _markerErrorCases: readonly _MarkerLineCase[] = [
  {
    id: 'T-FL-IPM-02-01',
    label: 'マーカーを一切含まない実内容の行 → false',
    line: _plainContentLine,
    expected: false,
  },
  {
    id: 'T-FL-IPM-02-02',
    label: 'マーカーの後ろに実内容（`### User …`）が続く行 → false'
      + '（この行をマーカーと認定すると、R-018 の除去範囲へ後ろの実内容が入って削除される。'
      + '実データにも同型の行が実在する）',
    line: _markerWithTrailingContentLine,
    expected: false,
  },
  {
    id: 'T-FL-IPM-02-03',
    label: 'マーカーの後ろに U+2028 を挟んで実内容が続く行 → false'
      + '（U+2028 は行の分割対象外であり、1 行にマーカーと実内容が同居しうる。'
      + 'この行をマーカーと認定すると U+2028 より後ろの実内容が削除される）',
    line: _markerWithLineSeparatorContentLine,
    expected: false,
  },
];

/** 行中の U+2028 を行終端として扱わないことを述語単体で見るエッジケース。 */
const _markerEdgeCases: readonly _MarkerLineCase[] = [
  {
    id: 'T-FL-IPM-03-01',
    label: '行中に U+2028 を挟んで `=== x.md ===` が続く 1 行 → false'
      + '（`STRIP_EXPORTER_PASTE_MARKER_LINE_REGEX` へ `m` フラグが復活する退行を検出する。'
      + '範囲関数を見る T-FL-PWR-03-10 / 03-11 に対し、こちらは述語単体を見る）',
    line: _lineSeparatorLine,
    expected: false,
  },
];

// ─── Tests

/**
 * `findPasteWrapperRange` のユニットテストスイート。
 *
 * R-018（`## Excerpt` 直後のラッパー前置き区間に貼り付けマーカーがある）が
 * 確定する除去範囲を検証する。範囲は両端を含む 0 起点の行インデックスであり、
 * `start` は常に `## Excerpt` の次の行（見出しそのものは含めない）。
 *
 * テスト ID 範囲: T-FL-PWR-01-01 〜 T-FL-PWR-03-20
 *
 * @see findPasteWrapperRange
 */
describe('findPasteWrapperRange', () => {
  /**
   * R-018 の成立・不成立と、確定する除去範囲の検証。
   *
   * `## Excerpt` の次の行からラッパー行である間だけ区間を伸ばし、
   * 区間内の最後の貼り付けマーカー行を終了行とすることを確認する。
   */
  describe('前置き区間の除去範囲の確定', () => {
    /** 区間内に貼り付けマーカーがあり、除去範囲が確定するケース。 */
    describe('When: 正常系', () => {
      for (const { id, label, content, expected } of _normalCases) {
        it(`[Normal] ${id}: ${label}`, () => {
          assertEquals(findPasteWrapperRange(content), expected);
        });
      }
    });

    /** R-018 の成立条件を満たさない本文で `undefined` を返すケース。 */
    describe('When: 異常系', () => {
      for (const { id, label, content, expected } of _errorCases) {
        it(`[Error] ${id}: ${label}`, () => {
          assertEquals(findPasteWrapperRange(content), expected);
        });
      }
    });

    /** 区間の起点・打ち切り・終端・EOF 到達・見出しの行全体一致・空行判定の境界を見るケース。 */
    describe('When: エッジケース', () => {
      for (const { id, label, content, expected } of _edgeCases) {
        it(`[Edge] ${id}: ${label}`, () => {
          assertEquals(findPasteWrapperRange(content), expected);
        });
      }
    });
  });
});

/**
 * `isPasteMarkerLine` のユニットテストスイート。
 *
 * 貼り付けマーカー行かどうかを 1 行単位で判定する公開述語を検証する。
 * 2 系統のマーカー（`<<<CHATLOG file=` 形 / `=== <ファイル名> ===` 形）を 1 つの述語で扱い、
 * いずれも行全体一致で判定する（CHATLOG 形は DR-44）。そのため行中に現れる引用も、
 * マーカーの後ろに実内容が続く行も `false` になる。
 *
 * テスト ID 範囲: T-FL-IPM-01-01 〜 T-FL-IPM-01-04 / T-FL-IPM-02-01 〜 T-FL-IPM-02-03 /
 * T-FL-IPM-03-01
 *
 * @see isPasteMarkerLine
 */
describe('isPasteMarkerLine', () => {
  /**
   * 1 行がマーカー行かどうかの判定。
   *
   * 2 系統のマーカー形式と normalize による見出し化を `true` と判定し、
   * マーカーを含まない行・行中に U+2028 を挟んだ行を `false` と判定することを確認する。
   */
  describe('貼り付けマーカー行の判定', () => {
    /** 2 系統のマーカー形式（見出し化を含む）を `true` と判定するケース。 */
    describe('When: 正常系', () => {
      for (const { id, label, line, expected } of _markerNormalCases) {
        it(`[Normal] ${id}: ${label}`, () => {
          assertEquals(isPasteMarkerLine(line), expected);
        });
      }
    });

    /** マーカーを含まない行を `false` と判定するケース。 */
    describe('When: 異常系', () => {
      for (const { id, label, line, expected } of _markerErrorCases) {
        it(`[Error] ${id}: ${label}`, () => {
          assertEquals(isPasteMarkerLine(line), expected);
        });
      }
    });

    /** 行中の U+2028 を行終端として扱わない境界を見るケース。 */
    describe('When: エッジケース', () => {
      for (const { id, label, line, expected } of _markerEdgeCases) {
        it(`[Edge] ${id}: ${label}`, () => {
          assertEquals(isPasteMarkerLine(line), expected);
        });
      }
    });
  });
});
