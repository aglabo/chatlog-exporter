// src: scripts/__tests__/unit/strip/strip-boundary.unit.spec.ts
// @(#): strip の前置き区間検出（R-018）のユニットテスト
//       対象: findPasteWrapperRange
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findPasteWrapperRange } from '../../../libs/strip-boundary.ts';

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
];

/**
 * 区間の起点・打ち切り・終端・行全体一致の境界を見るエッジケース。
 *
 * いずれも「実内容を除去範囲へ含めてはならない」形であり、誤削除防止の要となる。
 * 除去範囲が確定する形（`expected` が範囲）も、区間がどこで止まるかを固定するために置く。
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
];

// ─── Tests

/**
 * `findPasteWrapperRange` のユニットテストスイート。
 *
 * R-018（`## Excerpt` 直後のラッパー前置き区間に貼り付けマーカーがある）が
 * 確定する除去範囲を検証する。範囲は両端を含む 0 起点の行インデックスであり、
 * `start` は常に `## Excerpt` の次の行（見出しそのものは含めない）。
 *
 * テスト ID 範囲: T-FL-PWR-01-01 〜 T-FL-PWR-03-11
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

    /** 区間の起点・打ち切り・終端・行全体一致の境界を見るケース。 */
    describe('When: エッジケース', () => {
      for (const { id, label, content, expected } of _edgeCases) {
        it(`[Edge] ${id}: ${label}`, () => {
          assertEquals(findPasteWrapperRange(content), expected);
        });
      }
    });
  });
});
