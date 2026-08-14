// src: scripts/libs/__tests__/unit/strip-classify.unit.spec.ts
// @(#): strip 判定カスケードのユニットテスト
//       対象: classifyStrip / StripStats / STRIP_CACHE_STATUSES
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyStrip } from '../../strip-classify.ts';
// constants
import { STRIP_CACHE_STATUSES } from '../../../types/strip-cache-status.const.types.ts';
// types
import type { StripStats } from '../../../types/stats.types.ts';
import type { StripCacheStatus } from '../../../types/strip-cache-status.const.types.ts';

// ─── Helpers
// functions
import { findBoundaryLine } from '../../strip-boundary.ts';
// constants
import { CACHE_STATUSES } from '../../../../../_cle-libs/types/cache-status.const.types.ts';
import { STRIP_BOUNDARY_HEADING, STRIP_TEMPLATE_MARKER } from '../../../constants/strip.constants.ts';
// types
import type { ReadTextFileProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { StripDecision } from '../../../types/strip.types.ts';

// ─── Internal Helpers

// constants
/** 5 分類すべてを 0 で初期化した `StripStats` の値。フィールドの存在確認に使用する。 */
const _emptyStripStats: StripStats = {
  total: 0,
  stripped: 0,
  done: 0,
  passthrough: 0,
  error: 0,
};

/** テスト内で `classifyStrip` に渡す代表パス。`readProvider` 注入時は実ファイルを読まない。 */
const _PATH = '/tmp/strip-target.md';

/** 4 行からなる frontmatter ブロック。本文はファイル行 4 から始まる（`_fmLines === 4`）。 */
const _FRONTMATTER = ['---', 'title: サンプル', 'date: 2026-08-14', '---'].join('\n') + '\n';

/** `_FRONTMATTER` と本文が同一で、行数だけが大きい frontmatter ブロック。除去率の分母基準の検証に使う。 */
const _LONG_FRONTMATTER = [
  '---',
  'title: サンプル',
  'date: 2026-08-14',
  ...Array.from({ length: 40 }, (_, i) => `pad${i}: "${'x'.repeat(60)}"`),
  '---',
].join('\n') + '\n';

/**
 * 先頭に定型部を持ち `## Summary` が続く本文（除去対象の代表例）。
 *
 * 本文内の行インデックス: 0 = マーカー, 1 = ルール本文, 2 = 空行, 3 = 境界見出し。
 * マルチバイト文字を含むため、`removedBytes` の UTF-8 換算誤り（`String.length` 使用）を検出できる。
 */
const _strippableBody = [
  STRIP_TEMPLATE_MARKER,
  '日本語のルール本文',
  '',
  STRIP_BOUNDARY_HEADING,
  '要約本文',
].join('\n') + '\n';

/** `_strippableBody` の除去対象範囲（本文先頭〜境界の直前）。`removedBytes` の期待値算出に使う。 */
const _strippableRemovalRange = [STRIP_TEMPLATE_MARKER, '日本語のルール本文', ''].join('\n');

/** frontmatter を持つ除去対象ファイルの全文。`classifyStrip` の stripped 系ケースで使用する。 */
const _strippableFile = _FRONTMATTER + _strippableBody;

/** frontmatter を持たない除去対象の全文。R-002 が他規則に優先することの検証に使用する。 */
const _noFrontmatterFile = _strippableBody;

/** 境界見出しを持たず、本文中にマーカーのみが存在するファイル。passthrough が R-005 に帰属することの検証に使用する。 */
const _markerWithoutBoundaryFile = _FRONTMATTER
  + ['# タイトル', '', STRIP_TEMPLATE_MARKER, 'ルール本文'].join('\n') + '\n';

/**
 * 除去条件を満たすが境界見出しより後ろに内容が無いファイル（合成 fixture）。
 *
 * 除去範囲は常に境界の直前までであり境界行自体は残るため、「除去後の本文が空」は
 * 「境界見出しより後ろが空」として判定する。R-007 が R-008 に優先することの検証に使用する。
 */
const _emptyAfterStripFile = _FRONTMATTER
  + [STRIP_TEMPLATE_MARKER, 'ルール本文', '', STRIP_BOUNDARY_HEADING].join('\n') + '\n';

/**
 * 除去率が 99% を超える本文（合成 fixture）。実測最大は 96.23% のため実データでは発火しない。
 *
 * 除去範囲 3028 バイトに対し本文全体は 3043 バイトで、除去率は約 99.5%。
 */
const _highRemovalRateBody = [STRIP_TEMPLATE_MARKER, 'x'.repeat(3000), '', STRIP_BOUNDARY_HEADING, 'ok'].join('\n')
  + '\n';

/** `_highRemovalRateBody` に通常の frontmatter を付けたファイル。R-007 の除去率判定に使用する。 */
const _highRemovalRateFile = _FRONTMATTER + _highRemovalRateBody;

/** `_highRemovalRateBody` と本文が同一で frontmatter だけが長いファイル。除去率の分母基準の検証に使用する。 */
const _highRemovalRateLongFmFile = _LONG_FRONTMATTER + _highRemovalRateBody;

/** 閉じ `---` を欠いた壊れた frontmatter を持つファイル。`divideEntry` は throw するが判定は継続すべきケース。 */
const _unclosedFrontmatterFile = ['---', 'title: サンプル'].join('\n') + '\n' + _strippableBody;

/** YAML 構文エラーを含む frontmatter を持つファイル。`divideEntry` は throw するが判定は継続すべきケース。 */
const _invalidYamlFrontmatterFile = ['---', 'title: [1,', '---'].join('\n') + '\n' + _strippableBody;

/** 未知フィールドを持つ frontmatter の除去対象ファイル。R-002 で弾かれず stripped に到達すべきケース。 */
const _unknownFieldFile = ['---', 'title: サンプル', 'date: 2026-08-14', 'zzz_unknown_field: 任意の値', '---']
  .join('\n') + '\n' + _strippableBody;

/** `_strippableFile` の CRLF 版。`readTextFile` の正規化により LF 版と同一の判定になるべきケース。 */
const _crlfStrippableFile = _strippableFile.replace(/\n/g, '\r\n');

/**
 * マーカーを持たず `## Summary` から始まるユーザー発話のファイル。
 *
 * 偶然の一致による誤 strip をマーカー不在（R-006）が防ぐことを検証する。
 */
const _accidentalBoundaryFile = _FRONTMATTER
  + [STRIP_BOUNDARY_HEADING, 'ユーザーが偶然この見出しで書き始めた発話'].join('\n') + '\n';

/**
 * 定型部マーカーが最初の `## Summary` より後ろにあるファイル。
 *
 * 先頭アンカー方式の対象外であり passthrough になるべきケース。除去対象範囲を限定せず
 * `hasTemplateMarker(content)` をそのまま呼ぶ実装では誤って stripped になる。
 */
const _markerAfterBoundaryFile = _FRONTMATTER
  + ['# タイトル', '', STRIP_BOUNDARY_HEADING, '要約本文', '', STRIP_TEMPLATE_MARKER, 'ルール本文'].join('\n') + '\n';

/**
 * 先頭の定型部を除去した後も 2 個目以降の `## Summary` 以降にマーカーが残るファイル（合成 fixture）。
 *
 * 最初の境界のみが除去対象であることを検証する。実測 0 件のため合成 fixture が必須。
 */
const _markerRemainsAfterStripFile = _FRONTMATTER
  + [
    STRIP_TEMPLATE_MARKER,
    'ルール本文',
    '',
    STRIP_BOUNDARY_HEADING,
    '要約本文',
    '',
    STRIP_BOUNDARY_HEADING,
    STRIP_TEMPLATE_MARKER,
    '2 個目以降に残るマーカー',
  ].join('\n') + '\n';

/** `## Summary` を 1 つも含まない本文。R-005 の passthrough を検証する。 */
const _noBoundaryFile = _FRONTMATTER + ['# タイトル', '', '通常の会話本文'].join('\n') + '\n';

/** `## Summary` を持つが除去対象範囲にマーカーが無い本文。R-006 の passthrough を検証する。 */
const _noMarkerFile = _FRONTMATTER + ['# タイトル', '', STRIP_BOUNDARY_HEADING, '要約本文'].join('\n') + '\n';

// functions
/** 指定テキストを常に返す `ReadTextFileProvider` を作る。合成 fixture の注入に使用する。 */
const _readProviderOf = (text: string): ReadTextFileProvider => () => Promise.resolve(text);

/**
 * `classifyStrip` の `deps` を組み立てる。既定は「キャッシュ記録なし・退避なし」。
 *
 * @param text - `readProvider` が返す入力テキスト
 * @param overrides - `isProcessed` / `hasBackup` の上書き
 * @returns `classifyStrip` に渡す `deps`
 */
const _depsOf = (
  text: string,
  overrides: { isProcessed?: boolean; hasBackup?: boolean } = {},
) => ({
  readProvider: _readProviderOf(text),
  isProcessed: () => overrides.isProcessed ?? false,
  hasBackup: () => Promise.resolve(overrides.hasBackup ?? false),
});

/** 非 stripped の判定結果が除去範囲フィールドを `-1` / `-1` / `0` で返しているかを判定する。 */
const _hasNoRemovalFields = (decision: StripDecision): boolean =>
  decision.removalStartLine === -1 && decision.removalEndLine === -1 && decision.removedBytes === 0;

// ─── Tests

/**
 * `classifyStrip` のユニットテストスイート。
 *
 * R-002 〜 R-008 の判定カスケードを検証する。評価順序は仕様上変更できないため（Section 4.2）、
 * 各規則が単独で成立する場合に加え、規則どうしが同時に成立する場合の優先順位も検証する。
 *
 * テスト ID 範囲: T-FL-SCC-01-01 〜 T-FL-SCC-04-06
 *
 * @see classifyStrip
 */
describe('classifyStrip', () => {
  /**
   * 各規則が単独で成立する場合の判定テスト。
   *
   * R-003 / R-004 の done、R-005 / R-006 の passthrough、R-008 の stripped と、
   * stripped 時に返る除去範囲・除去バイト数・判定理由を検証する。
   */
  describe('When: 正常系', () => {
    /** キャッシュに処理済み記録があり退避を持たない場合（R-003）。 */
    it('[Normal] T-FL-SCC-01-01: キャッシュに処理済み記録がある → outcome === done', async () => {
      // arrange
      const deps = _depsOf(_strippableFile, { isProcessed: true, hasBackup: false });

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'done');
    });

    /** 退避ファイルが既に存在しキャッシュ記録が無い場合（R-004）。 */
    it('[Normal] T-FL-SCC-01-02: 退避ファイルが既に存在する → outcome === done', async () => {
      // arrange
      const deps = _depsOf(_strippableFile, { isProcessed: false, hasBackup: true });

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-004');
    });

    /** 本文に境界見出しが 1 つも存在しない場合（R-005）。 */
    it('[Normal] T-FL-SCC-01-03: `## Summary` を 1 つも持たない → outcome === passthrough', async () => {
      // arrange
      const deps = _depsOf(_noBoundaryFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-005');
    });

    /** 境界は存在するが除去対象範囲にマーカーが無い場合（R-006）。 */
    it('[Normal] T-FL-SCC-01-04: 境界の手前にマーカーが無い → outcome === passthrough', async () => {
      // arrange
      const deps = _depsOf(_noMarkerFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 先頭に定型部を持ち境界が続く、除去条件をすべて満たす場合（R-008）。 */
    it('[Normal] T-FL-SCC-01-05: 全条件を満たす → outcome === stripped', async () => {
      // arrange
      const deps = _depsOf(_strippableFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'stripped');
    });

    /**
     * 除去範囲の行番号がファイル全体基準（frontmatter の行を含む）で返る場合。
     *
     * `_FRONTMATTER` は 4 行のため `removalStartLine` は 0 ではなく 4 になる。
     * 0 が返る場合は本文基準の実装であり誤り。
     */
    it('[Normal] T-FL-SCC-01-06: 複数行 frontmatter → 除去範囲がファイル全体基準の行番号で返る', async () => {
      // arrange
      const deps = _depsOf(_strippableFile);
      const fmLines = 4;
      const boundaryIdx = findBoundaryLine(_strippableBody);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(boundaryIdx, 3);
      assertEquals(result.removalStartLine, fmLines);
      assertEquals(result.removalStartLine, 4);
      assertEquals(result.removalEndLine, fmLines + boundaryIdx - 1);
      assertEquals(result.removalEndLine, 6);
    });

    /**
     * 除去バイト数が除去範囲の UTF-8 バイト数と一致する場合。
     *
     * 期待値 55 は手計算した UTF-8 バイト数。`String.length`（UTF-16 コード単位）なら 37 になるため、
     * この literal がバイト数算出の基準誤りを検出する。
     */
    it('[Normal] T-FL-SCC-01-07: マルチバイト本文 → removedBytes が除去範囲の UTF-8 バイト数と一致する', async () => {
      // arrange
      const deps = _depsOf(_strippableFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.removedBytes, 55);
      assertEquals(_strippableRemovalRange.length, 37);
    });

    /** 判定結果に成立した規則を識別できる `reason.rule` が含まれる場合。 */
    it('[Normal] T-FL-SCC-01-08: 判定結果 → reason.rule に成立した規則が入る', async () => {
      // arrange
      const strippedDeps = _depsOf(_strippableFile);
      const doneDeps = _depsOf(_strippableFile, { isProcessed: true });

      // act
      const stripped = await classifyStrip(_PATH, strippedDeps);
      const done = await classifyStrip(_PATH, doneDeps);

      // assert
      assertEquals(stripped.reason.rule, 'R-008');
      assertEquals(done.reason.rule, 'R-003');
    });
  });

  /**
   * カスケードの評価順序が保たれることを検証するテスト。
   *
   * 2 つの規則が同時に成立する入力を与え、先行する規則の結果が返ることを表明する。
   * 順序を入れ替えると後続規則の結果になるため、これらが順序を固定するテスト群になる。
   */
  describe('When: 正常系（カスケード順序）', () => {
    /** frontmatter 欠落とキャッシュ記録が同時に成立する場合（R-002 > R-003）。 */
    it('[Normal] T-FL-SCC-02-01: frontmatter 無し + キャッシュ記録あり → outcome === error (R-002 が勝つ)', async () => {
      // arrange
      const deps = _depsOf(_noFrontmatterFile, { isProcessed: true });

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-002');
    });

    /** キャッシュ記録と退避の存在が同時に成立する場合（R-003 > R-004）。 */
    it('[Normal] T-FL-SCC-02-02: キャッシュ記録あり + 退避あり → reason が R-003 由来 (R-004 ではない)', async () => {
      // arrange
      const deps = _depsOf(_strippableFile, { isProcessed: true, hasBackup: true });

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-003');
    });

    /** 境界不在とマーカー存在が同時に成立する場合（R-005 > R-006）。 */
    it('[Normal] T-FL-SCC-02-03: 境界無し + マーカーあり → reason が R-005 由来の passthrough', async () => {
      // arrange
      const deps = _depsOf(_markerWithoutBoundaryFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-005');
    });

    /** 除去条件を満たすが安全弁も成立する場合（R-007 > R-008）。 */
    it('[Normal] T-FL-SCC-02-04: 除去後の本文が空になる → outcome === error (stripped にならない)', async () => {
      // arrange
      const deps = _depsOf(_emptyAfterStripFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
    });
  });

  /**
   * 安全弁の発動と前提が破れた入力に対する判定テスト。
   *
   * 個別ファイルの異常は `outcome: 'error'` として計上し、実行全体を中断させない（DD-03）。
   * ただし I/O 起因でない例外は握りつぶさず伝播させる（fail-first / DR-21）。
   */
  describe('When: 異常系', () => {
    /** 境界見出しより後ろに内容が無く、除去後の本文が空になる場合（R-007）。 */
    it('[Error] T-FL-SCC-03-01: 除去後の本文が空になる合成入力 → outcome === error', async () => {
      // arrange
      const deps = _depsOf(_emptyAfterStripFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
    });

    /** 除去率が上限 99% を超える場合（R-007）。 */
    it('[Error] T-FL-SCC-03-02: 除去率が 99% を超える合成入力 → outcome === error', async () => {
      // arrange
      const deps = _depsOf(_highRemovalRateFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
    });

    /**
     * frontmatter を持たない、または frontmatter が壊れている場合（R-002）。
     *
     * `divideEntry` は閉じ `---` 欠落・YAML 構文エラーで throw するため、判定には
     * `hasFrontmatter` を使う。壊れた frontmatter も「持たない」と同じく error に計上して継続する。
     */
    it('[Error] T-FL-SCC-03-03: frontmatter 欠落・破損 → throw せず outcome === error', async () => {
      // arrange
      const files = [_noFrontmatterFile, _unclosedFrontmatterFile, _invalidYamlFrontmatterFile];

      // act
      const results = await Promise.all(files.map((file) => classifyStrip(_PATH, _depsOf(file))));

      // assert
      assertEquals(results.map((result) => result.outcome), ['error', 'error', 'error']);
      assertEquals(results.map((result) => result.reason.rule), ['R-002', 'R-002', 'R-002']);
    });

    /** 読み取りが I/O エラー（`PermissionDenied`）を返す場合。error に計上し例外を伝播させない。 */
    it('[Error] T-FL-SCC-03-04: 読み取りが PermissionDenied → error に計上され例外を投げない', async () => {
      // arrange
      const deps = {
        readProvider: () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
        isProcessed: () => false,
        hasBackup: () => Promise.resolve(false),
      };

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-002');
      assertEquals('path' in result.reason ? result.reason.path : undefined, _PATH);
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /** 読み取りが I/O 以外の例外を投げる場合。error に丸め込まず伝播させる（fail-first）。 */
    it('[Error] T-FL-SCC-03-05: 読み取りが I/O 以外の例外 → 例外が伝播し error に丸め込まれない', async () => {
      // arrange
      const deps = {
        readProvider: () => Promise.reject(new TypeError('not an io error')),
        isProcessed: () => false,
        hasBackup: () => Promise.resolve(false),
      };

      // act & assert
      await assertRejects(() => classifyStrip(_PATH, deps), TypeError, 'not an io error');
    });

    /** 1 件目が error になっても後続 2 件の判定が行われる場合（DD-03）。 */
    it('[Error] T-FL-SCC-03-06: 3 件中 1 件目が error → 2 件目・3 件目も判定される', async () => {
      // arrange
      const files = [_noFrontmatterFile, _strippableFile, _noBoundaryFile];

      // act（逐次呼び出し。バッチ関数は新設しない）
      const first = await classifyStrip('/tmp/first.md', _depsOf(files[0]));
      const second = await classifyStrip('/tmp/second.md', _depsOf(files[1]));
      const third = await classifyStrip('/tmp/third.md', _depsOf(files[2]));

      // assert
      assertEquals([first.outcome, second.outcome, third.outcome], ['error', 'stripped', 'passthrough']);
    });
  });

  /**
   * 境界的な入力に対する判定テスト。
   *
   * 未知フィールド・CRLF・偶然の見出し一致・マーカー位置・除去率の分母基準を検証する。
   */
  describe('When: エッジケース', () => {
    /**
     * frontmatter に未知フィールドを持つ除去対象の場合。
     *
     * 検証範囲は `outcome === 'stripped'` に到達すること（= R-002 で弾かれないこと）に限定する。
     * 未知フィールドが実際に保存されることの検証は書き込みを伴う T-06 の射程。
     */
    it('[Edge] T-FL-SCC-04-01: 未知フィールドを持つ frontmatter → outcome === stripped', async () => {
      // arrange
      const deps = _depsOf(_unknownFieldFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'stripped');
    });

    /** 改行コードが CRLF の除去対象の場合。`readTextFile` の正規化により LF 版と同一結果になる。 */
    it('[Edge] T-FL-SCC-04-02: CRLF 入力 → stripped かつ LF 版と同じ除去範囲になる', async () => {
      // arrange
      const crlfDeps = _depsOf(_crlfStrippableFile);
      const lfDeps = _depsOf(_strippableFile);

      // act
      const crlf = await classifyStrip(_PATH, crlfDeps);
      const lf = await classifyStrip(_PATH, lfDeps);

      // assert
      assertEquals(crlf.outcome, 'stripped');
      assertEquals(crlf.removalStartLine, lf.removalStartLine);
      assertEquals(crlf.removalEndLine, lf.removalEndLine);
      assertEquals(crlf.removedBytes, lf.removedBytes);
    });

    /** ユーザー発話が偶然 `## Summary` で始まりマーカーが無い場合。R-006 が保護弁として機能する。 */
    it('[Edge] T-FL-SCC-04-03: 偶然 `## Summary` で始まる発話 → outcome === passthrough', async () => {
      // arrange
      const deps = _depsOf(_accidentalBoundaryFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 定型部が最初の `## Summary` より後ろにある場合。先頭アンカー方式の対象外となる。 */
    it('[Edge] T-FL-SCC-04-04: マーカーが境界より後ろ → outcome === passthrough', async () => {
      // arrange
      const deps = _depsOf(_markerAfterBoundaryFile);

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 先頭 strip 後も 2 個目以降の境界以降にマーカーが残る場合。最初の境界のみが除去対象となる。 */
    it('[Edge] T-FL-SCC-04-05: 先頭 strip 後もマーカーが残る合成入力 → outcome === stripped', async () => {
      // arrange
      const deps = _depsOf(_markerRemainsAfterStripFile);
      const boundaryIdx = 3;
      const fmLines = 4;

      // act
      const result = await classifyStrip(_PATH, deps);

      // assert
      assertEquals(result.outcome, 'stripped');
      assertEquals(result.removalEndLine, fmLines + boundaryIdx - 1);
    });

    /**
     * 本文が同一で frontmatter の長さのみ異なる 2 入力の場合。
     *
     * 除去率の分母は本文（frontmatter 除外）基準のため、いずれも 99% 超で error になる。
     * 分母をファイル全体にした誤実装では frontmatter が長い方の除去率が閾値を下回り stripped に転ぶ。
     */
    it('[Edge] T-FL-SCC-04-06: frontmatter 長のみ異なる 2 入力 → 除去率が一致し双方 error になる', async () => {
      // arrange
      const shortFmDeps = _depsOf(_highRemovalRateFile);
      const longFmDeps = _depsOf(_highRemovalRateLongFmFile);

      // act
      const shortFm = await classifyStrip(_PATH, shortFmDeps);
      const longFm = await classifyStrip(_PATH, longFmDeps);

      // assert
      assertEquals(shortFm.outcome, 'error');
      assertEquals(longFm.outcome, 'error');
      assertEquals(shortFm.reason.rule, 'R-007');
      assertEquals(longFm.reason.rule, 'R-007');
    });
  });
});

/**
 * strip 処理の統計カウンター型 `StripStats` のユニットテストスイート。
 *
 * 5 分類の件数フィールドを持ち、`BaseStats` のフィールドを継承しないことを検証する。
 *
 * テスト ID 範囲: T-FL-SCC-05-01 〜 T-FL-SCC-05-02
 *
 * @see StripStats
 */
describe('StripStats', () => {
  /** 型が要求する 5 分類のフィールドを保持することを確認する。 */
  describe('When: エッジケース', () => {
    /** `total` / `stripped` / `done` / `passthrough` / `error` の 5 フィールドを持つ。 */
    it('[Edge] T-FL-SCC-05-01: StripStats の値 → 5 分類の件数フィールドを持つ', () => {
      // arrange
      const stats = _emptyStripStats;

      // act
      const keys = Object.keys(stats).sort();

      // assert
      assertEquals(keys, ['done', 'error', 'passthrough', 'stripped', 'total']);
    });

    /** `BaseStats` の `keep` / `skip` / `remove` を持たない（`skip` が `done` と衝突するため）。 */
    it('[Edge] T-FL-SCC-05-02: StripStats の値 → keep / skip / remove を持たない', () => {
      // arrange
      const stats: Record<string, unknown> = { ..._emptyStripStats };

      // act
      const baseStatsKeys = ['keep', 'skip', 'remove'].filter((key) => key in stats);

      // assert
      assertEquals(baseStatsKeys, []);
    });
  });
});

/**
 * strip キャッシュのステータス識別子定数 `STRIP_CACHE_STATUSES` のユニットテストスイート。
 *
 * `CACHE_STATUSES` と同じ `as const` + 派生 union の形であることを検証する。
 *
 * テスト ID 範囲: T-FL-SCC-05-03
 *
 * @see STRIP_CACHE_STATUSES
 */
describe('STRIP_CACHE_STATUSES', () => {
  /** 参照元 `CACHE_STATUSES` と同一の定数形状であることを確認する。 */
  describe('When: エッジケース', () => {
    /**
     * すべての値が文字列であり、`as const` により値がリテラル型として凍結されている。
     *
     * 派生 union が `string` に退化していないことは型レベルで固定する。`@ts-expect-error` は
     * 未定義リテラルの代入を拒否できなければ「未使用の抑制」として型検査エラーになるため、
     * `StripCacheStatus` が `string` になった時点でこのテストはコンパイルに失敗する。
     */
    it('[Edge] T-FL-SCC-05-03: STRIP_CACHE_STATUSES → CACHE_STATUSES と同じ as const + 派生 union の形である', () => {
      // arrange
      const statuses: Record<string, string> = STRIP_CACHE_STATUSES;
      const reference: Record<string, string> = CACHE_STATUSES;
      const validStatus: StripCacheStatus = STRIP_CACHE_STATUSES.STRIPPED;
      // @ts-expect-error 派生 union のため未定義のリテラルは代入できない（string へ退化していれば通ってしまう）
      const invalidStatus: StripCacheStatus = 'not-a-status';

      // act
      const allStringValues = Object.values(statuses).every((value) => typeof value === 'string');
      const hasUpperSnakeKeys = Object.keys(statuses).every((key) => /^[A-Z][A-Z0-9_]*$/.test(key));

      // assert
      assertEquals(allStringValues, Object.values(reference).every((value) => typeof value === 'string'));
      assertEquals(hasUpperSnakeKeys, true);
      assertEquals(validStatus, 'stripped');
      assertEquals(invalidStatus, 'not-a-status');
      assertEquals(STRIP_CACHE_STATUSES.EMPTY, '');
    });
  });
});
