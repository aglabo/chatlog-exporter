// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/line-utils.unit.spec.ts
// @(#): line-utils モジュールのユニットテスト
//       対象: extractLines, repairSegmentCoverage
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractLines, repairSegmentCoverage } from '../../line-utils.ts';

// ─── Helpers
// types
import type { CachedSegment } from '../../../types/cache.const.type.ts';

// ─── Internal Helpers

// types

/** `repairSegmentCoverage` の不変条件を検証する入力 1 組。 */
interface _InvariantCase {
  /** テスト ID。 */
  id: string;
  /** 入力の特徴を表すラベル（`it` の説明に埋め込む）。 */
  label: string;
  /** 本文を行分割したもの。 */
  lines: string[];
  /** 修復前のセグメント境界。 */
  segments: CachedSegment[];
}

// functions

/**
 * テスト用 `CachedSegment` を生成する。
 *
 * `title` / `summary` は入力の行範囲から機械的に導出する。修復で `startLine` /
 * `endLine` が動いてもこの 2 つは元の値のまま残るはずなので、生成時の値が
 * そのまま残っているかで「title/summary 不変」を照合できる。
 *
 * @param startLine - 1-based の開始行
 * @param endLine - 1-based の終了行（inclusive）
 * @returns 指定範囲を持つ `CachedSegment`
 */
const _seg = (startLine: number, endLine: number): CachedSegment => ({
  title: `title-${startLine}-${endLine}`,
  summary: `summary-${startLine}-${endLine}`,
  startLine,
  endLine,
});

/**
 * セグメント列を `[startLine, endLine]` の組の配列へ写す。
 *
 * 範囲だけを 1 つの `assertEquals` で比較するためのヘルパー。`title` / `summary` は
 * 落とすので、範囲の期待値とメタデータの期待値を別々に書ける。
 *
 * @param segments - 写す対象のセグメント列
 * @returns 入力と同じ順序の `[startLine, endLine]` 配列
 */
const _ranges = (segments: CachedSegment[]): number[][] =>
  segments.map(({ startLine, endLine }) => [startLine, endLine]);

/**
 * 修復後のセグメント列が `1..total` を隙間なく・重複なく覆っていることを検証する。
 *
 * 隣接境界を `currentStart === previousEnd + 1` で照合するため、隙間（差が 2 以上）と
 * 重複（差が 0 以下）の両方を 1 つの assert で検出する。
 *
 * @param segments - 修復後のセグメント列（`startLine` 昇順であること）
 * @param total - 覆うべき行数（`lines.length`）
 */
const _assertFullCoverage = (segments: CachedSegment[], total: number): void => {
  assertEquals(segments[0].startLine, 1, '先頭セグメントは 1 行目から始まる');
  assertEquals(segments[segments.length - 1].endLine, total, '末尾セグメントは最終行で終わる');
  const _brokenBoundaries = segments
    .slice(1)
    .map((segment, index) => ({ previousEnd: segments[index].endLine, currentStart: segment.startLine }))
    .filter(({ previousEnd, currentStart }) => currentStart !== previousEnd + 1);
  assertEquals(_brokenBoundaries, [], '隣接セグメントに隙間も重複も無い');
};

// constants

/**
 * `startLine === endLine`（1 行だけのセグメント）を抽出する入力の一覧。
 *
 * 先頭・中央・末尾の 3 位置を並べる。`startLine > endLine` の早期 return が `>=` に
 * 緩むと、どの位置でも抽出結果が空文字列へ落ちる。
 */
const _singleLineCases = [
  { startLine: 1, endLine: 1, expected: 'a', label: '先頭行' },
  { startLine: 2, endLine: 2, expected: 'b', label: '中央行' },
  { startLine: 3, endLine: 3, expected: 'c', label: '末尾行' },
] as const;

/**
 * 不変条件（隙間なし・重複なし・件数不変・title/summary 不変）を検証する入力の一覧。
 *
 * 欠落箇所（head / tail / 内部）・件数・入力順・範囲超過を変えた複数入力を並べ、
 * どの形の入力でも 4 つの不変条件が成立することを固定する。
 */
const _invariantCases: _InvariantCase[] = [
  {
    id: 'T-NC-RSC-03-01',
    label: '既に全体を覆う 2 件',
    lines: ['a', 'b', 'c', 'd'],
    segments: [_seg(1, 2), _seg(3, 4)],
  },
  {
    id: 'T-NC-RSC-03-02',
    label: 'head と tail の両方が欠けた 2 件',
    lines: ['head', 'b', 'c', 'd', 'tail'],
    segments: [_seg(2, 2), _seg(3, 4)],
  },
  {
    id: 'T-NC-RSC-03-03',
    label: '内部ギャップが 2 箇所ある 3 件',
    lines: ['a', 'gap1', 'c', 'gap2', 'e', 'f'],
    segments: [_seg(1, 1), _seg(3, 3), _seg(5, 6)],
  },
  {
    id: 'T-NC-RSC-03-04',
    label: '降順で渡され、かつ範囲が lines.length を超過する 3 件',
    lines: ['a', 'b', 'c', 'd'],
    segments: [_seg(3, 99), _seg(1, 1), _seg(2, 2)],
  },
  {
    id: 'T-NC-RSC-03-05',
    label: '1 件のみで中央だけを指す',
    lines: ['a', 'b', 'c', 'd', 'e'],
    segments: [_seg(3, 3)],
  },
];

// ─── Tests

/**
 * `extractLines` のユニットテストスイート。
 *
 * lines から [startLine, endLine]（1-based, inclusive）の範囲を境界値クランプして
 * 抽出する関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-EL-01-01 〜 T-EL-06-01
 *
 * @see extractLines
 */
describe('extractLines', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-EL-01-01: 通常範囲 startLine=2, endLine=3 のとき該当行を \\n 結合して返す', () => {
      // arrange
      const lines = ['a', 'b', 'c', 'd'];

      // act
      const result = extractLines(lines, 2, 3);

      // assert
      assertEquals(result, 'b\nc');
    });
  });

  describe('When: エッジケース', () => {
    /** entry.content が空文字列のとき `_rebuildSegments`（phase-write.ts）は
     *  `''.split('\n')` = `['']` を extractLines に渡す（実際に到達する呼び出し形状）。
     *  total===0 となる真の空配列 `[]` はどの呼び出し元からも到達しない防御的ガード。 */
    it("[Edge] T-EL-02-01: entry.content が空文字列のとき split('\\n') で得られる [''] を渡すと空文字列を返す", () => {
      // arrange — ''.split('\n') は [] ではなく [''] になる（_rebuildSegments が実際に渡す形状）
      const lines = ''.split('\n');

      // act
      const result = extractLines(lines, 1, 1);

      // assert
      assertEquals(result, '');
    });

    /** startLine > endLine は正常なAI応答では発生しない（segmentChatlogsのsystem promptが
     *  "contiguous and non-overlapping" な範囲を要求している）。AIのハルシネーションや不正な
     *  キャッシュデータに対する防御的ガードの検証。 */
    it('[Edge] T-EL-03-01: startLine=3, endLine=1（startLine > endLine）のとき空文字列を返す', () => {
      // arrange
      const lines = ['a', 'b', 'c'];

      // act
      const result = extractLines(lines, 3, 1);

      // assert
      assertEquals(result, '');
    });

    const _clampCases = [
      { startLine: 0, endLine: 2, expected: 'a\nb', label: 'startLine=0 は 1 にクランプされる' },
      { startLine: -1, endLine: 2, expected: 'a\nb', label: 'startLine=-1 は 1 にクランプされる' },
      { startLine: 2, endLine: 100, expected: 'b\nc', label: 'endLine=100 は total にクランプされる' },
    ] as const;

    for (const { startLine, endLine, expected, label } of _clampCases) {
      it(`[Edge] T-EL-04-01: ${label} (startLine=${startLine}, endLine=${endLine} → '${expected}')`, () => {
        // arrange
        const lines = ['a', 'b', 'c'];

        // act
        const result = extractLines(lines, startLine, endLine);

        // assert
        assertEquals(result, expected);
      });
    }

    /** 空配列ガードの対象は「行が 1 本も無い」入力だけであり、行数が 1 の入力を
     *  巻き込んではならない。`total === 0` のガードが `total === 1` へずれると
     *  T-EL-05-02 が空文字列を受け取って落ちる。 */
    it('[Edge] T-EL-05-01: lines が真の空配列 [] のとき空文字列を返す', () => {
      // arrange
      const lines: string[] = [];

      // act
      const result = extractLines(lines, 1, 1);

      // assert
      assertEquals(result, '');
    });

    it('[Edge] T-EL-05-02: lines が 1 行だけのときその行を返す（空配列ガードに巻き込まれない）', () => {
      // arrange
      const lines = ['only'];

      // act
      const result = extractLines(lines, 1, 1);

      // assert — 行数 1 は「空」ではないので、内容がそのまま返る
      assertEquals(result, 'only');
    });

    for (const { startLine, endLine, expected, label } of _singleLineCases) {
      it(`[Edge] T-EL-06-01: startLine === endLine の 1 行セグメントはその 1 行を返す — ${label} (startLine=${startLine}, endLine=${endLine} → '${expected}')`, () => {
        // arrange
        const lines = ['a', 'b', 'c'];

        // act
        const result = extractLines(lines, startLine, endLine);

        // assert — 逆転範囲ガードは startLine > endLine のときだけ働く
        assertEquals(result, expected);
      });
    }
  });
});

/**
 * `repairSegmentCoverage` のユニットテストスイート。
 *
 * AI が返した行範囲が本文全体を覆わないとき、`1..lines.length` を隙間なく覆うよう
 * 範囲を補正し、補正で救われた非空行の行番号を報告する関数を検証する。
 *
 * テスト ID 範囲: T-NC-RSC-01-01 〜 T-NC-RSC-03-05
 *
 * @see repairSegmentCoverage
 */
describe('repairSegmentCoverage', () => {
  /**
   * 範囲補正そのものの動作テスト。
   *
   * head / tail / 内部ギャップの 3 箇所の欠落（avalon 実測でいずれも発生）と、
   * 補正不要な入力・境界値入力の扱いを検証する。
   */
  describe('coverage repair', () => {
    /** 補正が必要なカバレッジ欠落を与え、期待どおりの範囲へ補正されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-NC-RSC-01-01: 既に 1..lines.length を覆っているとき範囲は変化せず repairedNonBlankLines は空', () => {
        // arrange
        const lines = ['a', 'b', 'c', 'd'];
        const segments = [_seg(1, 2), _seg(3, 4)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(result.segments, [_seg(1, 2), _seg(3, 4)]);
        assertEquals(result.repairedNonBlankLines, []);
      });

      it('[Normal] T-NC-RSC-01-02: head が欠けているとき先頭 startLine が 1 になり欠けていた非空行が報告される', () => {
        // arrange — 1..2 行目がどのセグメントにも含まれていない
        const lines = ['head1', 'head2', 'b', 'c', 'd'];
        const segments = [_seg(3, 4), _seg(5, 5)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(_ranges(result.segments), [[1, 4], [5, 5]]);
        assertEquals(result.repairedNonBlankLines, [1, 2]);
      });

      it('[Normal] T-NC-RSC-01-03: tail が欠けているとき末尾 endLine が lines.length になり欠けていた非空行が報告される', () => {
        // arrange — 4..5 行目がどのセグメントにも含まれていない
        const lines = ['a', 'b', 'c', 'tail1', 'tail2'];
        const segments = [_seg(1, 2), _seg(3, 3)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(_ranges(result.segments), [[1, 2], [3, 5]]);
        assertEquals(result.repairedNonBlankLines, [4, 5]);
      });

      it('[Normal] T-NC-RSC-01-04: 内部ギャップは前側の endLine が延長され、後側の startLine は変わらない', () => {
        // arrange — 3..4 行目が 2 つのセグメントの間で抜けている
        const lines = ['a', 'b', 'gap1', 'gap2', 'e', 'f'];
        const segments = [_seg(1, 2), _seg(5, 6)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert — 後側を前へ伸ばすのではなく前側の endLine を 2 → 4 へ延長する
        assertEquals(_ranges(result.segments), [[1, 4], [5, 6]]);
        assertEquals(result.repairedNonBlankLines, [3, 4]);
      });
    });

    /** 境界値・空入力・順序異常など、AI 応答としては想定外だが到達しうる入力のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-NC-RSC-02-01: 欠けているのが空行だけのとき範囲は修復されるが repairedNonBlankLines は空', () => {
        // arrange — 未カバーの 1 行目は空文字列、4 行目は空白のみ（実害が無いので報告しない）
        const lines = ['', 'a', 'b', '   '];
        const segments = [_seg(2, 3)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(_ranges(result.segments), [[1, 4]]);
        assertEquals(result.repairedNonBlankLines, []);
      });

      it('[Edge] T-NC-RSC-02-02: endLine が lines.length を超えているとき lines.length へクランプされる', () => {
        // arrange — 2 つめのセグメントが存在しない 10 行目まで伸びている
        const lines = ['a', 'b', 'c'];
        const segments = [_seg(1, 2), _seg(3, 10)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(_ranges(result.segments), [[1, 2], [3, 3]]);
        assertEquals(result.repairedNonBlankLines, []);
      });

      it('[Edge] T-NC-RSC-02-03: セグメント 1 件で範囲が中央だけのとき (1, lines.length) まで広がる', () => {
        // arrange
        const lines = ['a', 'b', 'c', 'd', 'e'];
        const segments = [_seg(3, 3)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(_ranges(result.segments), [[1, 5]]);
        assertEquals(result.repairedNonBlankLines, [1, 2, 4, 5]);
      });

      /** `segments` が空の呼び出しは `_processChunk` 側で弾かれている。覆う対象が決まらないため
       *  行を拾わずそのまま空を返す（件数を増やして勝手にセグメントを作らない）。 */
      it('[Edge] T-NC-RSC-02-04: segments が空のとき空配列を返し repairedNonBlankLines も空', () => {
        // arrange
        const lines = ['a', 'b', 'c'];

        // act
        const result = repairSegmentCoverage(lines, []);

        // assert — 覆うセグメントが無い状態で全行を「修復した」と報告してはならない
        assertEquals(result.segments, []);
        assertEquals(result.repairedNonBlankLines, []);
      });

      /** 覆うべき行が 1 行も無いので修復の余地がない。件数不変の不変条件を守るため
       *  セグメントは削らずそのまま返す。 */
      it('[Edge] T-NC-RSC-02-05: lines が空のとき segments をそのまま返し repairedNonBlankLines も空', () => {
        // arrange
        const lines: string[] = [];
        const segments = [_seg(1, 5)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert
        assertEquals(result.segments, [_seg(1, 5)]);
        assertEquals(result.repairedNonBlankLines, []);
      });

      it('[Edge] T-NC-RSC-02-06: startLine 降順で渡されたとき昇順に並べ替えて処理される', () => {
        // arrange — AI は昇順で返すが、順序に依存しないことを固定する
        const lines = ['a', 'b', 'gap', 'd', 'e', 'f'];
        const segments = [_seg(4, 6), _seg(1, 2)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert — 昇順に並び、title は元のセグメントに付いたまま移動する
        assertEquals(_ranges(result.segments), [[1, 3], [4, 6]]);
        assertEquals(result.segments.map((segment) => segment.title), ['title-1-2', 'title-4-6']);
        assertEquals(result.repairedNonBlankLines, [3]);
      });

      /** `startLine > endLine` は正常な AI 応答では起きないが、ハルシネーションや古いキャッシュから
       *  到達しうる（`extractLines` も T-EL-03-01 で同じ入力を空として扱う）。 */
      it('[Edge] T-NC-RSC-02-07: startLine > endLine の逆転範囲は何も覆っていない扱いになる', () => {
        // arrange — 2 つめのセグメントが (4, 3) で逆転している
        const lines = ['a', 'b', 'c', 'd'];
        const segments = [_seg(1, 2), _seg(4, 3)];

        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert — 逆転セグメントは 1 行も覆っていないので 3..4 行目が未カバー扱いになる
        assertEquals(_ranges(result.segments), [[1, 3], [4, 4]]);
        assertEquals(result.repairedNonBlankLines, [3, 4]);
      });
    });
  });

  /**
   * 修復結果が常に満たすべき不変条件のテスト。
   *
   * 欠落の形・件数・入力順を変えた複数入力に対して、覆い漏れと重複が無いこと、
   * セグメントをマージ／分割していないこと、本文メタデータを書き換えていないことを確認する。
   */
  describe('不変条件', () => {
    for (const { id, label, lines, segments } of _invariantCases) {
      it(`[Normal] ${id}: ${label} — 隙間なく重複なく覆い、件数と title/summary が変わらない`, () => {
        // act
        const result = repairSegmentCoverage(lines, segments);

        // assert — 1..lines.length を隙間なく・重複なく覆う
        _assertFullCoverage(result.segments, lines.length);

        // assert — マージも分割もしていない
        assertEquals(result.segments.length, segments.length, 'セグメント件数は変わらない');

        // assert — title/summary は startLine 昇順に並べ替えた入力と 1 対 1 で一致する
        const expectedMeta = [...segments]
          .sort((a, b) => a.startLine - b.startLine)
          .map(({ title, summary }) => ({ title, summary }));
        assertEquals(
          result.segments.map(({ title, summary }) => ({ title, summary })),
          expectedMeta,
          'title/summary は書き換えられない',
        );
      });
    }
  });
});
