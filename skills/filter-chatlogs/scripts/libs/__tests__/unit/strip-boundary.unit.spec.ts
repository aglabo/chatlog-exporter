// src: scripts/libs/__tests__/unit/strip-boundary.unit.spec.ts
// @(#): strip 境界検出のユニットテスト
//       対象: findBoundaryLine / hasTemplateMarker
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findBoundaryLine, hasTemplateMarker } from '../../strip-boundary.ts';

// ─── Helpers
// constants
import { STRIP_BOUNDARY_HEADING, STRIP_TEMPLATE_MARKER } from '../../../constants/strip.constants.ts';

// ─── Internal Helpers

// constants
/** `## Summary` を 2 箇所（行インデックス 2 と 5）に持つ本文。最初の出現の検出を検証する。 */
const _twoSummaries = [
  '# タイトル',
  '',
  '## Summary',
  '最初の要約',
  '',
  '## Summary',
  '2 番目の要約',
].join('\n');

/** 定型部マーカーを行頭完全一致で含む本文。マーカー検出の正常系に使用する。 */
const _withTemplateMarker = [
  '# タイトル',
  '',
  '## TOPICS ASSIGNMENT RULES',
  'ルール本文',
].join('\n');

/** 境界見出しもマーカーも含まない本文。不在判定に使用する。 */
const _noBoundary = [
  '# タイトル',
  '',
  '本文のみで見出しは存在しない',
].join('\n');

/**
 * 見出しとマーカーの双方を含む LF 版の本文。
 *
 * `_crlfContent` と対で用い、改行コードの違いが検出結果に影響しないことを検証する。
 */
const _lfContent = [
  '# タイトル',
  '',
  '## Summary',
  '要約本文',
  '',
  '## TOPICS ASSIGNMENT RULES',
  'ルール本文',
].join('\n');

/** `_lfContent` と同一内容の CRLF 版の本文。 */
const _crlfContent = _lfContent.replace(/\n/g, '\r\n');

/** 境界見出しが行途中に現れる本文。行頭完全一致でないため不在と判定されるべきケース。 */
const _headingMidLine = [
  '# タイトル',
  '',
  'text ## Summary',
].join('\n');

/** 境界見出しに後置テキストが付く本文。完全一致でないため不在と判定されるべきケース。 */
const _headingWithSuffix = [
  '# タイトル',
  '',
  '## Summary of work',
].join('\n');

/** 定型部マーカーが行途中に現れる本文。行頭完全一致でないため不在と判定されるべきケース。 */
const _markerMidLine = [
  '# タイトル',
  '',
  'text ## TOPICS ASSIGNMENT RULES',
].join('\n');

/**
 * 境界見出し行を `STRIP_BOUNDARY_HEADING` 定数から組み立てた本文（見出しは行インデックス 2）。
 *
 * リテラルを直書きしないため、実装が定数以外のリテラルを参照するようになると検出に失敗する。
 */
const _boundaryFromConstant = [
  '# タイトル',
  '',
  STRIP_BOUNDARY_HEADING,
  '要約本文',
].join('\n');

/**
 * 定型部マーカー行を `STRIP_TEMPLATE_MARKER` 定数から組み立てた本文。
 *
 * リテラルを直書きしないため、実装が定数以外のリテラルを参照するようになると検出に失敗する。
 */
const _markerFromConstant = [
  '# タイトル',
  '',
  STRIP_TEMPLATE_MARKER,
  'ルール本文',
].join('\n');

/** コードフェンス内に定型部マーカーを持つ本文。フェンスを解釈しないため存在ありと判定されるべきケース。 */
const _markerInCodeFence = [
  '# タイトル',
  '',
  '```markdown',
  '## TOPICS ASSIGNMENT RULES',
  '```',
].join('\n');

// ─── Tests

/**
 * `findBoundaryLine` のユニットテストスイート。
 *
 * 本文から境界見出し `## Summary` の最初の出現行を行頭完全一致で探す動作を検証する。
 *
 * テスト ID 範囲: T-FL-SBD-01-01・01-03-01・02-01・02-02・03-01-01・03-02-01・03-03
 *
 * @see findBoundaryLine
 */
describe('findBoundaryLine', () => {
  /**
   * 境界見出しが存在する場合の検出テスト。
   *
   * 複数出現時に最初の出現位置が返ることを検証する。
   */
  describe('When: 正常系', () => {
    /** 境界見出しが複数存在する場合、最初の出現位置を返す。 */
    it('[Normal] T-FL-SBD-01-01: `## Summary` が 2 箇所 → 最初の出現の行インデックスを返す', () => {
      // arrange
      const content = _twoSummaries;

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(result, 2);
    });

    /** 境界見出し定数のリテラル固定と、実装がその定数を実際に参照していることを確認する。 */
    it('[Normal] T-FL-SBD-01-03-01: `STRIP_BOUNDARY_HEADING` 由来の見出し行 → その行インデックスを返す', () => {
      // arrange
      const content = _boundaryFromConstant;

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(STRIP_BOUNDARY_HEADING, '## Summary');
      assertEquals(result, 2);
    });
  });

  /**
   * 境界見出しが存在しない場合のテスト。
   *
   * 不在は例外ではなく `-1` で表されることを検証する。
   */
  describe('When: 異常系', () => {
    /** 境界見出しを 1 つも含まない本文の場合。 */
    it('[Error] T-FL-SBD-02-01: `## Summary` を含まない → -1 を返し例外を投げない', () => {
      // arrange
      const content = _noBoundary;

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(result, -1);
    });

    /** 空文字列の本文の場合。 */
    it('[Error] T-FL-SBD-02-02: 空文字列の本文 → -1 を返し例外を投げない', () => {
      // arrange
      const content = '';

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(result, -1);
    });
  });

  /**
   * 改行コードの差異・行頭完全一致の境界を検証するテスト。
   */
  describe('When: エッジケース', () => {
    /** CRLF 版と LF 版で見出しの検出結果が一致する場合。 */
    it('[Edge] T-FL-SBD-03-01-01: CRLF 版と LF 版 → 見出しの検出結果が一致する', () => {
      // arrange
      const lf = _lfContent;
      const crlf = _crlfContent;

      // act
      const lfResult = findBoundaryLine(lf);
      const crlfResult = findBoundaryLine(crlf);

      // assert
      assertEquals(lfResult, 2);
      assertEquals(crlfResult, lfResult);
    });

    /** 境界見出しが行途中に現れる場合。 */
    it('[Edge] T-FL-SBD-03-02-01: `text ## Summary` のように行途中に現れる → -1 を返す', () => {
      // arrange
      const content = _headingMidLine;

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(result, -1);
    });

    /** 境界見出しに後置テキストが付く場合。 */
    it('[Edge] T-FL-SBD-03-03: `## Summary of work` の後置テキスト付き見出し → -1 を返す', () => {
      // arrange
      const content = _headingWithSuffix;

      // act
      const result = findBoundaryLine(content);

      // assert
      assertEquals(result, -1);
    });
  });
});

/**
 * `hasTemplateMarker` のユニットテストスイート。
 *
 * 本文に定型部マーカー `## TOPICS ASSIGNMENT RULES` が
 * 行頭完全一致で存在するかを判定する動作を検証する。
 *
 * テスト ID 範囲: T-FL-SBD-01-02・01-03-02・03-01-02・03-02-02・03-04
 *
 * @see hasTemplateMarker
 */
describe('hasTemplateMarker', () => {
  /**
   * 定型部マーカーが存在する場合の判定テスト。
   */
  describe('When: 正常系', () => {
    /** マーカー行が行頭完全一致で存在する場合。 */
    it('[Normal] T-FL-SBD-01-02: `## TOPICS ASSIGNMENT RULES` を含む → true を返す', () => {
      // arrange
      const content = _withTemplateMarker;

      // act
      const result = hasTemplateMarker(content);

      // assert
      assertEquals(result, true);
    });

    /** 定型部マーカー定数のリテラル固定と、実装がその定数を実際に参照していることを確認する。 */
    it('[Normal] T-FL-SBD-01-03-02: `STRIP_TEMPLATE_MARKER` 由来のマーカー行 → true を返す', () => {
      // arrange
      const content = _markerFromConstant;

      // act
      const result = hasTemplateMarker(content);

      // assert
      assertEquals(STRIP_TEMPLATE_MARKER, '## TOPICS ASSIGNMENT RULES');
      assertEquals(result, true);
    });
  });

  /**
   * 改行コードの差異・Markdown 構文を解釈しないことを検証するテスト。
   */
  describe('When: エッジケース', () => {
    /** CRLF 版と LF 版でマーカーの検出結果が一致する場合。 */
    it('[Edge] T-FL-SBD-03-01-02: CRLF 版と LF 版 → マーカーの検出結果が一致する', () => {
      // arrange
      const lf = _lfContent;
      const crlf = _crlfContent;

      // act
      const lfResult = hasTemplateMarker(lf);
      const crlfResult = hasTemplateMarker(crlf);

      // assert
      assertEquals(lfResult, true);
      assertEquals(crlfResult, lfResult);
    });

    /** マーカーが行途中に現れる場合。 */
    it('[Edge] T-FL-SBD-03-02-02: `text ## TOPICS ASSIGNMENT RULES` のように行途中に現れる → false を返す', () => {
      // arrange
      const content = _markerMidLine;

      // act
      const result = hasTemplateMarker(content);

      // assert
      assertEquals(result, false);
    });

    /** コードフェンス内にマーカーがある場合（フェンスを解釈しない仕様）。 */
    it('[Edge] T-FL-SBD-03-04: コードフェンス内のマーカー → フェンスを解釈せず true を返す', () => {
      // arrange
      const content = _markerInCodeFence;

      // act
      const result = hasTemplateMarker(content);

      // assert
      assertEquals(result, true);
    });
  });
});
