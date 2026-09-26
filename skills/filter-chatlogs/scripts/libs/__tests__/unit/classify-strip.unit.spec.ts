// src: scripts/libs/__tests__/unit/classify-strip.unit.spec.ts
// @(#): strip 判定カスケードのユニットテスト
//       対象: classifyStrip / StripStats / STRIP_CACHE_STATUSES / STRIP_REMOVAL_KINDS
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyStrip } from '../../classify-strip.ts';
// constants
import { STRIP_CACHE_STATUSES } from '../../../types/strip-cache-status.const.types.ts';
// types
import type { StripStats } from '../../../types/stats.types.ts';
import type { StripCacheStatus } from '../../../types/strip-cache-status.const.types.ts';

// ─── Helpers
// functions
import { getBasename } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
import { findBoundaryLine } from '../../strip-boundary.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
// constants
import { CACHE_STATUSES } from '../../../../../_cle-libs/types/cache-status.const.types.ts';
import { BAK_SUFFIX, CHATLOG_BLOCK_OPEN_TEMPLATE } from '../../../constants/common.constants.ts';
import {
  STRIP_BOUNDARY_HEADING,
  STRIP_EXCERPT_HEADING,
  STRIP_MAX_REMOVAL_RATE,
  STRIP_TEMPLATE_MARKER,
  STRIP_USER_TURN_HEADING,
} from '../../../constants/strip.constants.ts';
import { STRIP_REMOVAL_KINDS } from '../../../types/strip-removal-kind.const.types.ts';
// types
import type { ReadTextFileProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { StripCache } from '../../../types/cache.types.ts';
import type { StripDecision } from '../../../types/strip.types.ts';

// ─── Internal Helpers

// constants
/** 5 分類の件数とバイト数すべてを 0 で初期化した `StripStats` の値。フィールドの存在確認に使用する。 */
const _emptyStripStats: StripStats = {
  total: 0,
  stripped: 0,
  skipped: 0,
  done: 0,
  passthrough: 0,
  error: 0,
  bytesBefore: 0,
  bytesAfter: 0,
};

/** テスト内で `classifyStrip` に渡す代表パス。`readProvider` 注入時は実ファイルを読まない。 */
const _PATH = '/tmp/strip-target.md';

/**
 * キャッシュルート。**絶対パスであることが必須**。
 *
 * `ChatlogCache` は `subDir` が相対パスのとき `GlobalConfig` から `cacheDir` を引くため
 * （ChatlogCache.class.ts:171-178）、実設定・環境変数に依存しないよう絶対パスを渡す。
 * 実 I/O はプロバイダ側で無効化するため、このパスにファイルは作られない。
 */
const _CACHE_ROOT = 'W:/temp/classify-strip-cache';

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

/**
 * `## Excerpt` 直後に現れる貼り付けマーカー行（R-018 の前置き区間の代表例）。
 *
 * exporter が出力するログブロック開始デリミタと同一形式であるため、リテラルを直書きせず
 * `CHATLOG_BLOCK_OPEN_TEMPLATE` から組み立てる。ASCII のみで UTF-8 換算 25 バイト。
 */
const _PASTE_MARKER_LINE = CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', 'x.md');

/**
 * `## Excerpt` 直後に貼り付け前置きを持つ本文（R-018 の除去対象の代表例）。
 *
 * 本文内の行インデックス: 0 = 境界見出し, 1 = 要約, 2 = 空行, 3 = `## Excerpt`,
 * 4 = 貼り付けマーカー, 5 = 実内容。前置き区間は `{ start: 4, end: 4 }` になる。
 * 境界の手前にマーカーが無いため R-006 は成立せず、R-018 の経路へ進む。
 */
const _pasteStrippableBody = [
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  _PASTE_MARKER_LINE,
  '実内容のテキスト',
].join('\n') + '\n';

/** frontmatter を持つ R-018 除去対象ファイルの全文。paste 経路の stripped 系ケースで使用する。 */
const _pasteStrippableFile = _FRONTMATTER + _pasteStrippableBody;

/**
 * 貼り付け前置きより後ろに内容が無い本文（合成 fixture）。
 *
 * 除去率は約 0.40 で上限 0.99 に届かないため、error の根拠が「除去範囲より後ろが空」だけで
 * あることを固定する。境界見出し（行 0）より後ろは非空であり、HEAD 形の空判定
 * （`_lines.slice(_boundaryIdx + 1)`）では空と判定されない。
 */
const _emptyAfterPasteBody = [
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  _PASTE_MARKER_LINE,
].join('\n') + '\n';

/** `_emptyAfterPasteBody` に frontmatter を付けたファイル。paste 経路の R-007 検証に使用する。 */
const _emptyAfterPasteFile = _FRONTMATTER + _emptyAfterPasteBody;

/**
 * 頭部の定型部と `## Excerpt` 直後の貼り付け前置きを併せ持つ本文（合成 fixture）。
 *
 * 本文内の行インデックス: 0 = マーカー, 1 = ルール本文, 2 = 空行, 3 = 境界見出し,
 * 4 = 要約, 5 = 空行, 6 = `## Excerpt`, 7 = 貼り付けマーカー, 8 = 実内容。
 * R-006 が優先するため除去範囲は頭部側（行 0〜2 / 55 バイト）であり、
 * paste 側の `{ start: 7, end: 7 }` は採用されてはならない（DR-41 決定 2）。
 */
const _headAndPasteBody = [
  STRIP_TEMPLATE_MARKER,
  '日本語のルール本文',
  '',
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  _PASTE_MARKER_LINE,
  '実内容のテキスト',
].join('\n') + '\n';

/** `_headAndPasteBody` に frontmatter を付けたファイル。R-006 と R-018 の排他を検証する。 */
const _headAndPasteFile = _FRONTMATTER + _headAndPasteBody;

/**
 * 貼り付けマーカーが前置き区間の外（実内容より後ろ）にのみ存在する本文。
 *
 * `## Excerpt` の直後が実内容であるため前置き区間は即座に打ち切られ、
 * `findPasteWrapperRange` は `undefined` を返す。本文中の引用を除去しないことを検証する。
 */
const _deepPasteOnlyBody = [
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  '本文の実内容です',
  '',
  _PASTE_MARKER_LINE,
].join('\n') + '\n';

/** `_deepPasteOnlyBody` に frontmatter を付けたファイル。R-018 不成立の passthrough を検証する。 */
const _deepPasteOnlyFile = _FRONTMATTER + _deepPasteOnlyBody;

/**
 * 境界見出しを持たず、貼り付け前置きだけを持つ本文。
 *
 * `findPasteWrapperRange` は `{ start: 3, end: 3 }` を返すが R-005 が先に成立するため到達しない。
 * R-018 を R-005 より前へ動かすと誤って stripped に転ぶ。
 */
const _pasteWithoutBoundaryBody = [
  '# タイトル',
  '',
  STRIP_EXCERPT_HEADING,
  _PASTE_MARKER_LINE,
  '実内容のテキスト',
].join('\n') + '\n';

/** `_pasteWithoutBoundaryBody` に frontmatter を付けたファイル。R-005 が R-018 に優先することを検証する。 */
const _pasteWithoutBoundaryFile = _FRONTMATTER + _pasteWithoutBoundaryBody;

/**
 * `## Excerpt` 直後に現れる 2 本目の貼り付けマーカー行。`_PASTE_MARKER_LINE` と同形式でファイル名だけが異なる。
 *
 * 前置き区間が複数行に伸びる fixture で、終端行を開始行と区別できるようにするために使う。
 * ASCII のみで UTF-8 換算 25 バイト。
 */
const _PASTE_MARKER_LINE_2 = CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', 'y.md');

/**
 * 貼り付け前置きが複数行にわたる本文（合成 fixture）。
 *
 * 本文内の行インデックス: 0 = 境界見出し, 1 = 要約, 2 = 空行, 3 = `## Excerpt`, 4 = 空行,
 * 5 = User ターン見出し, 6 = 貼り付けマーカー, 7 = 2 本目の貼り付けマーカー, 8 = 実内容。
 * 前置き区間は `{ start: 4, end: 7 }` になり、**開始行と終了行が一致しない**。
 * 除去範囲が 1 行の fixture では終了行を開始行で代用しても結果が変わらないため、
 * 除去範囲の終端側の結線を固定するにはこの複数行 fixture が要る。
 */
const _multiLinePasteBody = [
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  '',
  STRIP_USER_TURN_HEADING,
  _PASTE_MARKER_LINE,
  _PASTE_MARKER_LINE_2,
  '実内容のテキスト',
].join('\n') + '\n';

/** `_multiLinePasteBody` の除去対象範囲（空行〜最後の貼り付けマーカー）。`removedBytes` の期待値算出に使う。 */
const _multiLinePasteRemovalRange = ['', STRIP_USER_TURN_HEADING, _PASTE_MARKER_LINE, _PASTE_MARKER_LINE_2].join('\n');

/** `_multiLinePasteBody` に frontmatter を付けたファイル。複数行の paste 除去範囲の検証に使用する。 */
const _multiLinePasteFile = _FRONTMATTER + _multiLinePasteBody;

/**
 * 複数行の貼り付け前置きより後ろに内容が無い本文（合成 fixture）。
 *
 * 本文内の行インデックス: 0 = 境界見出し, 1 = 要約, 2 = 空行, 3 = `## Excerpt`,
 * 4 = User ターン見出し, 5 = 貼り付けマーカー, 6 = 2 本目の貼り付けマーカー。
 * 前置き区間は `{ start: 4, end: 6 }` で、その後ろは空である。除去率は約 0.62 で上限 0.99 に
 * 届かないため、error の根拠は「除去範囲より後ろが空」だけになる。
 */
const _emptyAfterMultiLinePasteBody = [
  STRIP_BOUNDARY_HEADING,
  '要約本文',
  '',
  STRIP_EXCERPT_HEADING,
  STRIP_USER_TURN_HEADING,
  _PASTE_MARKER_LINE,
  _PASTE_MARKER_LINE_2,
].join('\n') + '\n';

/** `_emptyAfterMultiLinePasteBody` の除去対象範囲。除去率が安全弁に触れていないことの確認に使う。 */
const _emptyAfterMultiLinePasteRemovalRange = [STRIP_USER_TURN_HEADING, _PASTE_MARKER_LINE, _PASTE_MARKER_LINE_2]
  .join('\n');

/** `_emptyAfterMultiLinePasteBody` に frontmatter を付けたファイル。複数行 paste の R-007 検証に使用する。 */
const _emptyAfterMultiLinePasteFile = _FRONTMATTER + _emptyAfterMultiLinePasteBody;

// functions
/** 指定テキストを常に返す `ReadTextFileProvider` を作る。合成 fixture の注入に使用する。 */
const _readProviderOf = (text: string): ReadTextFileProvider => () => Promise.resolve(text);

/**
 * 実ファイル I/O を伴わない `ChatlogCache` を生成する。
 *
 * `subDir` へ絶対パスを渡すと `_initCacheDir` が `GlobalConfig` 参照を短絡するため、
 * 実設定・環境変数に依存しない（ChatlogCache.class.ts:171-178）。`initializer.yaml` の併用で
 * ディレクトリ読み込みも回避する。実 I/O はプロバイダ側で無効化するため実ファイルは作られない。
 *
 * キャッシュのキーは `getBasename(filePath)`（拡張子なしベース名）であり、パス全体ではない。
 * そのため seed は `_PATH` のベース名（`strip-target`）で行う必要がある。
 *
 * @param seeded - 記録を持たせるキー（拡張子なしベース名）
 * @param status - 記録するステータス（既定: `stripped`）。DR-31 の `passthrough` 記録の検証に使う
 * @returns 初期化済みキャッシュ
 */
const _makeCache = async (
  seeded: string[] = [],
  status: StripCacheStatus = STRIP_CACHE_STATUSES.STRIPPED,
): Promise<ChatlogCache<StripCache>> => {
  const _yaml = seeded.map((key) => `${key}: { status: ${status}, rule: R-008 }`).join('\n');
  const cache = new ChatlogCache<StripCache>(_CACHE_ROOT, '', { yaml: _yaml }, {
    cache: {
      mkdir: () => Promise.resolve(),
      writeTextFile: () => Promise.resolve(),
    },
  });
  await cache.ready;
  return cache;
};

/**
 * `classifyStrip` を「キャッシュ記録なし・退避なし・通常実行」の既定前提で呼び出す。
 *
 * 判定カスケード（R-002〜R-008）そのものを検証する大半のケースはこの前提を共有するため、
 * 呼び出しごとの定型を 1 箇所へ寄せる。
 *
 * @param text - `readProvider` が返す入力テキスト
 * @param overrides - 既定前提からの逸脱（処理済み記録・記録のステータス・退避の存在・dry-run・対象パス）
 * @returns 判定結果
 */
const _classify = async (
  text: string,
  overrides: {
    isProcessed?: boolean;
    /** 処理済み記録のステータス（既定: `stripped`）。`isProcessed: true` のときのみ効く。 */
    cachedStatus?: StripCacheStatus;
    hasBackup?: boolean;
    dryRun?: boolean;
    path?: string;
  } = {},
): Promise<StripDecision> => {
  const _path = overrides.path ?? _PATH;
  const _cache = await _makeCache(
    overrides.isProcessed ? [getBasename(_path)] : [],
    overrides.cachedStatus ?? STRIP_CACHE_STATUSES.STRIPPED,
  );
  return classifyStrip(_path, _cache, overrides.dryRun ?? false, {
    readProvider: _readProviderOf(text),
    hasBackup: () => Promise.resolve(overrides.hasBackup ?? false),
  });
};

/**
 * 除去範囲を持たない判定結果（`done` / `passthrough` / `error`）の形を満たすかを判定する。
 *
 * 行番号は `-1`、バイト数は `0`、除去種別は `'none'` が揃っていることを見る。
 * `removalKind` まで含めるのは、行番号だけ潰して種別が残る中途半端な退行を通さないため。
 */
const _hasNoRemovalFields = (decision: StripDecision): boolean =>
  decision.removalStartLine === -1 && decision.removalEndLine === -1 && decision.removedBytes === 0
  && decision.contentBytes === 0 && decision.removalKind === STRIP_REMOVAL_KINDS.NONE;

// ─── Tests

/**
 * `classifyStrip` のユニットテストスイート。
 *
 * R-002 〜 R-008 の判定カスケードを検証する。評価順序は仕様上変更できないため（Section 4.2）、
 * 各規則が単独で成立する場合に加え、規則どうしが同時に成立する場合の優先順位も検証する。
 *
 * テスト ID 範囲: T-FL-SCC-01-01 〜 T-FL-SCC-07-15（`01-09` / `01-10` は R-003 の処理済み判定、
 * `07-01` 〜 `07-15` は R-018 の前置き区間と `removalKind`）
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
      // act
      const result = await _classify(_strippableFile, { isProcessed: true, hasBackup: false });

      // assert
      assertEquals(result.outcome, 'done');
    });

    /**
     * R-003 が処理済みとみなすステータス（DR-31 決定 2）。
     *
     * `stripped`（除去して書き込み済み）と `passthrough`（除去対象を持たないと判定済み）の
     * いずれも「判定が確定しており再判定を要さない」記録であり、どちらも `done` とする。
     * `passthrough` を落とすと 6000 件規模で毎回全ファイルを読み直すことになる。
     */
    const _processedStatuses = [
      { id: '09', status: STRIP_CACHE_STATUSES.STRIPPED },
      { id: '10', status: STRIP_CACHE_STATUSES.PASSTHROUGH },
    ] as const;

    for (const { id, status } of _processedStatuses) {
      it(`[Normal] T-FL-SCC-01-${id}: キャッシュ記録が ${status} → outcome === done (R-003)`, async () => {
        // act
        const result = await _classify(_strippableFile, {
          isProcessed: true,
          cachedStatus: status,
          hasBackup: false,
        });

        // assert
        assertEquals(result.outcome, 'done');
        assertEquals(result.reason.rule, 'R-003');
      });
    }

    /** 退避ファイルが既に存在しキャッシュ記録が無い場合（R-004）。 */
    it('[Normal] T-FL-SCC-01-02: 退避ファイルが既に存在する → outcome === done', async () => {
      // act
      const result = await _classify(_strippableFile, { isProcessed: false, hasBackup: true });

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-004');
    });

    /** 本文に境界見出しが 1 つも存在しない場合（R-005）。 */
    it('[Normal] T-FL-SCC-01-03: `## Summary` を 1 つも持たない → outcome === passthrough', async () => {
      // act
      const result = await _classify(_noBoundaryFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-005');
    });

    /** 境界は存在するが除去対象範囲にマーカーが無い場合（R-006）。 */
    it('[Normal] T-FL-SCC-01-04: 境界の手前にマーカーが無い → outcome === passthrough', async () => {
      // act
      const result = await _classify(_noMarkerFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 先頭に定型部を持ち境界が続く、除去条件をすべて満たす場合（R-008）。 */
    it('[Normal] T-FL-SCC-01-05: 全条件を満たす → outcome === stripped', async () => {
      // act
      const result = await _classify(_strippableFile);

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
      const fmLines = 4;
      const boundaryIdx = findBoundaryLine(_strippableBody);

      // act
      const result = await _classify(_strippableFile);

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
      // act
      const result = await _classify(_strippableFile);

      // assert
      assertEquals(result.removedBytes, 55);
      assertEquals(_strippableRemovalRange.length, 37);
    });

    /** 判定結果に成立した規則を識別できる `reason.rule` が含まれる場合。 */
    it('[Normal] T-FL-SCC-01-08: 判定結果 → reason.rule に成立した規則が入る', async () => {
      // act
      const stripped = await _classify(_strippableFile);
      const done = await _classify(_strippableFile, { isProcessed: true });

      // assert
      assertEquals(stripped.reason.rule, 'R-008');
      assertEquals(done.reason.rule, 'R-003');
    });

    /**
     * 頭部に定型部を持たず、`## Excerpt` 直後に貼り付け前置きがある場合（R-018 → R-008）。
     *
     * R-006 が不成立でも前置き区間が見つかれば除去対象であり、除去種別は `paste` になる。
     */
    it('[Normal] T-FL-SCC-07-01: `## Excerpt` 直後の貼り付け前置き → stripped / removalKind === paste', async () => {
      // act
      const result = await _classify(_pasteStrippableFile);

      // assert
      assertEquals(result.outcome, 'stripped');
      assertEquals(result.reason.rule, 'R-008');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.PASTE);
    });

    /**
     * R-018 の除去範囲がファイル全体基準（frontmatter の行を含む）で返る場合。
     *
     * `findPasteWrapperRange` は content 基準の `{ start: 4, end: 4 }` を返すため、
     * `_FRONTMATTER` の 4 行を加算した `8` / `8` になる。`4` / `4` が返る場合は
     * 本文基準のまま担いでおり、書き込み側が実内容を削る位置ずれになる。
     */
    it('[Normal] T-FL-SCC-07-02: paste の除去範囲がファイル全体基準の行番号で返る', async () => {
      // arrange
      const fmLines = 4;
      const pasteRange = { start: 4, end: 4 };

      // act
      const result = await _classify(_pasteStrippableFile);

      // assert
      assertEquals(result.removalStartLine, fmLines + pasteRange.start);
      assertEquals(result.removalStartLine, 8);
      assertEquals(result.removalEndLine, fmLines + pasteRange.end);
      assertEquals(result.removalEndLine, 8);
    });

    /**
     * R-018 の除去バイト数・本文バイト数が UTF-8 基準で返る場合。
     *
     * 期待値 25 は貼り付けマーカー行 1 行分、87 はマルチバイトを含む本文全体の UTF-8 バイト数。
     * `removedBytes` が 0 のままなら頭部側（空の除去範囲）を測っており、
     * `contentBytes` が本文長と食い違うなら基準がファイル全体に寄っている。
     */
    it('[Normal] T-FL-SCC-07-03: paste の removedBytes / contentBytes が UTF-8 バイト数で返る', async () => {
      // arrange
      const encoder = new TextEncoder();

      // act
      const result = await _classify(_pasteStrippableFile);

      // assert
      assertEquals(result.removedBytes, encoder.encode(_PASTE_MARKER_LINE).length);
      assertEquals(result.removedBytes, 25);
      assertEquals(result.contentBytes, encoder.encode(_pasteStrippableBody).length);
      assertEquals(result.contentBytes, 87);
    });

    /**
     * 貼り付け前置きが複数行にわたる場合の除去範囲（R-018 → R-008）。
     *
     * 前置き区間は `## Excerpt` の次行から**最後の**貼り付けマーカー行までであり、この入力では
     * 終了行が開始行と一致しない。期待値はファイル全体基準で `8` / `11`、除去バイト数 61
     * （空行 + User ターン見出し + 貼り付けマーカー 2 本）である。
     * 終了行に区間の開始行を担ぐ実装では `11` / `61` が `8` / `0` に落ち、
     * 2 本目のマーカーと User ターン見出しが本文へ残る。
     */
    it('[Normal] T-FL-SCC-07-14: 複数行の貼り付け前置き → 除去範囲の終端が最後のマーカー行になる', async () => {
      // arrange
      const encoder = new TextEncoder();

      // act
      const result = await _classify(_multiLinePasteFile);

      // assert
      assertEquals(result.outcome, 'stripped');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.PASTE);
      assertEquals(result.removedBytes, encoder.encode(_multiLinePasteRemovalRange).length);
      assertEquals(result.contentBytes, encoder.encode(_multiLinePasteBody).length);
      assertEquals(
        [result.removalStartLine, result.removalEndLine, result.removedBytes, result.contentBytes],
        [8, 11, 61, 123],
      );
    });

    /**
     * R-006 が成立する HEAD 経路に `removalKind === 'head'` が付く場合（非退行）。
     *
     * R-018 の結線後も除去範囲・除去バイト数は現行と完全に同一でなければならない。
     * 期待値は既存 `T-FL-SCC-01-06` / `01-07` と同じ `4` / `6` / `55` を実値で固定する。
     */
    it('[Normal] T-FL-SCC-07-06: 頭部マーカー → removalKind === head かつ除去範囲は現行と同一', async () => {
      // act
      const result = await _classify(_strippableFile);

      // assert
      assertEquals(result.outcome, 'stripped');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.HEAD);
      assertEquals(
        [result.removalStartLine, result.removalEndLine, result.removedBytes],
        [4, 6, 55],
      );
    });
  });

  /**
   * dry-run における判定テスト（`skipped`）。
   *
   * `classifyStrip` は書き込みを行わないため、dry-run が影響するのは **分類のみ** である。
   * 除去対象（R-008）だけが `skipped` へ振り替わり、他の規則の判定は dry-run の有無で変化しない。
   */
  describe('When: 正常系（dry-run）', () => {
    /** 除去対象を dry-run で判定した場合。書き込みを見送る分類として `skipped` を返す。 */
    it('[Normal] T-FL-SCC-06-01: dry-run + 除去対象 → outcome === skipped（rule は R-008 のまま）', async () => {
      // act
      const result = await _classify(_strippableFile, { dryRun: true });

      // assert
      assertEquals(result.outcome, 'skipped');
      // 分類が変わっても成立した規則は R-008 のままである（見送りは規則ではない）
      assertEquals(result.reason.rule, 'R-008');
    });

    /**
     * `skipped` が除去範囲を保持する場合。
     *
     * dry-run 明細は除去範囲を表示するため、`-1` / `0` へ潰すと事前レビューが成立しない。
     * 同一入力の通常実行（`stripped`）と完全に同値であることを表明する。
     */
    it('[Normal] T-FL-SCC-06-02: skipped の除去範囲・除去バイト数が stripped と同値になる', async () => {
      // act
      const skipped = await _classify(_strippableFile, { dryRun: true });
      const stripped = await _classify(_strippableFile, { dryRun: false });

      // assert
      assertEquals(skipped.removalStartLine, stripped.removalStartLine);
      assertEquals(skipped.removalEndLine, stripped.removalEndLine);
      assertEquals(skipped.removedBytes, stripped.removedBytes);
      // 潰されていないことを実値でも固定する（両者が揃って -1 / 0 になる退行を検出する）
      assertEquals(skipped.removalStartLine, 4);
      assertEquals(skipped.removedBytes, 55);
    });

    /**
     * R-018 の除去対象を dry-run で判定した場合。
     *
     * dry-run が振り替えるのは分類だけであり、除去種別は経路が決めるものなので影響を受けない。
     * `removalKind` が `'none'` へ潰れると、書き込み側は除去の当て方を復元できなくなる。
     */
    it('[Normal] T-FL-SCC-07-04: dry-run + paste 除去対象 → skipped だが removalKind は paste のまま', async () => {
      // act
      const result = await _classify(_pasteStrippableFile, { dryRun: true });

      // assert
      assertEquals(result.outcome, 'skipped');
      assertEquals(result.reason.rule, 'R-008');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.PASTE);
    });

    /**
     * paste 経路の `skipped` が除去範囲を保持する場合（HEAD 側 `T-FL-SCC-06-02` の paste 版）。
     *
     * dry-run 明細は除去範囲を表示するため、`-1` / `0` へ潰すと事前レビューが成立しない。
     */
    it('[Normal] T-FL-SCC-07-05: paste の skipped の除去範囲・除去種別が stripped と同値になる', async () => {
      // act
      const skipped = await _classify(_pasteStrippableFile, { dryRun: true });
      const stripped = await _classify(_pasteStrippableFile, { dryRun: false });

      // assert
      assertEquals(skipped.removalStartLine, stripped.removalStartLine);
      assertEquals(skipped.removalEndLine, stripped.removalEndLine);
      assertEquals(skipped.removedBytes, stripped.removedBytes);
      assertEquals(skipped.contentBytes, stripped.contentBytes);
      assertEquals(skipped.removalKind, stripped.removalKind);
      // 潰されていないことを実値でも固定する（両者が揃って -1 / 0 / 'none' になる退行を検出する）
      assertEquals(
        [skipped.removalStartLine, skipped.removalEndLine, skipped.removedBytes, skipped.contentBytes],
        [8, 8, 25, 87],
      );
      assertEquals(skipped.removalKind, STRIP_REMOVAL_KINDS.PASTE);
    });

    /**
     * 除去対象ではないファイルを dry-run で判定した場合。
     *
     * `skipped` は「除去対象だが見送った」ことのみを表す。除去を伴わない判定まで `skipped` に
     * すると、`_applyFileOutcome` が `stats.skipped` を不当に押し上げる。
     */
    it('[Normal] T-FL-SCC-06-03: dry-run + 非除去対象 → 判定の分類がそのまま返り skipped にならない', async () => {
      // act
      const passthrough = await _classify(_noBoundaryFile, { dryRun: true });
      const error = await _classify(_noFrontmatterFile, { dryRun: true });
      const done = await _classify(_strippableFile, { dryRun: true, isProcessed: true });

      // assert
      assertEquals(
        [passthrough.outcome, error.outcome, done.outcome],
        ['passthrough', 'error', 'done'],
      );
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
      // act
      const result = await _classify(_noFrontmatterFile, { isProcessed: true });

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-002');
    });

    /** キャッシュ記録と退避の存在が同時に成立する場合（R-003 > R-004）。 */
    it('[Normal] T-FL-SCC-02-02: キャッシュ記録あり + 退避あり → reason が R-003 由来 (R-004 ではない)', async () => {
      // act
      const result = await _classify(_strippableFile, { isProcessed: true, hasBackup: true });

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-003');
    });

    /** 境界不在とマーカー存在が同時に成立する場合（R-005 > R-006）。 */
    it('[Normal] T-FL-SCC-02-03: 境界無し + マーカーあり → reason が R-005 由来の passthrough', async () => {
      // act
      const result = await _classify(_markerWithoutBoundaryFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-005');
    });

    /** 除去条件を満たすが安全弁も成立する場合（R-007 > R-008）。 */
    it('[Normal] T-FL-SCC-02-04: 除去後の本文が空になる → outcome === error (stripped にならない)', async () => {
      // act
      const result = await _classify(_emptyAfterStripFile);

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
      // act
      const result = await _classify(_emptyAfterStripFile);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
    });

    /** 除去率が上限 99% を超える場合（R-007）。 */
    it('[Error] T-FL-SCC-03-02: 除去率が 99% を超える合成入力 → outcome === error', async () => {
      // act
      const result = await _classify(_highRemovalRateFile);

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
      const results = await Promise.all(files.map((file) => _classify(file)));

      // assert
      assertEquals(results.map((result) => result.outcome), ['error', 'error', 'error']);
      assertEquals(results.map((result) => result.reason.rule), ['R-002', 'R-002', 'R-002']);
    });

    /** 読み取りが I/O エラー（`PermissionDenied`）を返す場合。error に計上し例外を伝播させない。 */
    it('[Error] T-FL-SCC-03-04: 読み取りが PermissionDenied → error に計上され例外を投げない', async () => {
      // arrange
      const cache = await _makeCache();

      // act
      const result = await classifyStrip(_PATH, cache, false, {
        readProvider: () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
        hasBackup: () => Promise.resolve(false),
      });

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-002');
      assertEquals('path' in result.reason ? result.reason.path : undefined, _PATH);
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /** 読み取りが I/O 以外の例外を投げる場合。error に丸め込まず伝播させる（fail-first）。 */
    it('[Error] T-FL-SCC-03-05: 読み取りが I/O 以外の例外 → 例外が伝播し error に丸め込まれない', async () => {
      // arrange
      const cache = await _makeCache();

      // act & assert
      await assertRejects(
        () =>
          classifyStrip(_PATH, cache, false, {
            readProvider: () => Promise.reject(new TypeError('not an io error')),
            hasBackup: () => Promise.resolve(false),
          }),
        TypeError,
        'not an io error',
      );
    });

    /** 1 件目が error になっても後続 2 件の判定が行われる場合（DD-03）。 */
    it('[Error] T-FL-SCC-03-06: 3 件中 1 件目が error → 2 件目・3 件目も判定される', async () => {
      // arrange
      const files = [_noFrontmatterFile, _strippableFile, _noBoundaryFile];

      // act（逐次呼び出し。バッチ関数は新設しない）
      const first = await _classify(files[0], { path: '/tmp/first.md' });
      const second = await _classify(files[1], { path: '/tmp/second.md' });
      const third = await _classify(files[2], { path: '/tmp/third.md' });

      // assert
      assertEquals([first.outcome, second.outcome, third.outcome], ['error', 'stripped', 'passthrough']);
    });

    /**
     * R-004 の退避存在確認が I/O エラー（`PermissionDenied`）を投げる場合。
     *
     * 既定の `hasBackup` は `fileExists` を呼び、その内部は `NotFound` 以外を再 throw する。
     * 保護しないと 1 ファイルの stat 失敗が `runConcurrent` 経由で実行全体を中断させ、DD-03 に反する。
     */
    it('[Error] T-FL-SCC-03-07: 退避確認が PermissionDenied → error に計上され例外を投げない', async () => {
      // arrange
      const cache = await _makeCache();

      // act
      const result = await classifyStrip(_PATH, cache, false, {
        readProvider: _readProviderOf(_strippableFile),
        hasBackup: () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
      });

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-004');
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /** R-004 の I/O エラーが R-002 と同形式の `kind` / `subindex` / `path` を担ぐ場合。 */
    it('[Error] T-FL-SCC-03-08: 退避確認の I/O エラー → reason に kind / subindex / path が入る', async () => {
      // arrange
      const cache = await _makeCache();

      // act
      const result = await classifyStrip(_PATH, cache, false, {
        readProvider: _readProviderOf(_strippableFile),
        hasBackup: () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
      });

      // assert
      assertEquals('kind' in result.reason ? result.reason.kind : undefined, 'PermissionDenied');
      assertEquals('subindex' in result.reason ? result.reason.subindex : undefined, 'denied');
      assertEquals('path' in result.reason ? result.reason.path : undefined, _PATH);
    });

    /** R-004 の退避確認が I/O 以外の例外を投げる場合。error に丸め込まず伝播させる（fail-first）。 */
    it('[Error] T-FL-SCC-03-09: 退避確認が I/O 以外の例外 → 例外が伝播し error に丸め込まれない', async () => {
      // arrange
      const cache = await _makeCache();

      // act & assert
      await assertRejects(
        () =>
          classifyStrip(_PATH, cache, false, {
            readProvider: _readProviderOf(_strippableFile),
            hasBackup: () => Promise.reject(new TypeError('not an io error')),
          }),
        TypeError,
        'not an io error',
      );
    });

    /**
     * R-018 の除去範囲より後ろに内容が無い場合（R-007 > R-008 の paste 版）。
     *
     * 構造上のアンカー見出しは HEAD では範囲の後ろ（`## Summary`）、PASTE では範囲の前
     * （`## Excerpt`）にあるため、両者で対応するのは「除去範囲より後ろの末尾が空か」である。
     * この入力の除去率は約 0.40 で上限 0.99 に届かないため、error の根拠は空判定のみになる。
     * HEAD 形の `_lines.slice(_boundaryIdx + 1)` で判定すると境界（行 0）より後ろは非空であり、
     * error にならず stripped に転ぶ。
     */
    it('[Error] T-FL-SCC-07-11: paste の除去範囲より後ろが空 → outcome === error (R-007)', async () => {
      // arrange（除去率が安全弁に触れていないこと自体を先に固定する）
      const encoder = new TextEncoder();
      const removalRate = encoder.encode(_PASTE_MARKER_LINE).length
        / encoder.encode(_emptyAfterPasteBody).length;

      // act
      const result = await _classify(_emptyAfterPasteFile);

      // assert
      assertEquals(removalRate < STRIP_MAX_REMOVAL_RATE, true);
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /**
     * 複数行の貼り付け前置きより後ろに内容が無い場合（`T-FL-SCC-07-11` の複数行版）。
     *
     * 空判定の起点は除去範囲の**終端**の次行である。開始行の次行を起点にすると、除去される
     * はずのラッパー行（User ターン見出し・2 本目のマーカー）が末尾に残って非空と判定され、
     * error にならず stripped に転ぶ。この入力の除去率は約 0.62 で上限 0.99 に届かないため、
     * error の根拠は空判定のみになる。
     */
    it('[Error] T-FL-SCC-07-15: 複数行の paste 除去範囲より後ろが空 → outcome === error (R-007)', async () => {
      // arrange（除去率が安全弁に触れていないこと自体を先に固定する）
      const encoder = new TextEncoder();
      const removalRate = encoder.encode(_emptyAfterMultiLinePasteRemovalRange).length
        / encoder.encode(_emptyAfterMultiLinePasteBody).length;

      // act
      const result = await _classify(_emptyAfterMultiLinePasteFile);

      // assert
      assertEquals(removalRate < STRIP_MAX_REMOVAL_RATE, true);
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-007');
      assertEquals(_hasNoRemovalFields(result), true);
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
      // act
      const result = await _classify(_unknownFieldFile);

      // assert
      assertEquals(result.outcome, 'stripped');
    });

    /** 改行コードが CRLF の除去対象の場合。`readTextFile` の正規化により LF 版と同一結果になる。 */
    it('[Edge] T-FL-SCC-04-02: CRLF 入力 → stripped かつ LF 版と同じ除去範囲になる', async () => {
      // act
      const crlf = await _classify(_crlfStrippableFile);
      const lf = await _classify(_strippableFile);

      // assert
      assertEquals(crlf.outcome, 'stripped');
      assertEquals(crlf.removalStartLine, lf.removalStartLine);
      assertEquals(crlf.removalEndLine, lf.removalEndLine);
      assertEquals(crlf.removedBytes, lf.removedBytes);
    });

    /** ユーザー発話が偶然 `## Summary` で始まりマーカーが無い場合。R-006 が保護弁として機能する。 */
    it('[Edge] T-FL-SCC-04-03: 偶然 `## Summary` で始まる発話 → outcome === passthrough', async () => {
      // act
      const result = await _classify(_accidentalBoundaryFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 定型部が最初の `## Summary` より後ろにある場合。先頭アンカー方式の対象外となる。 */
    it('[Edge] T-FL-SCC-04-04: マーカーが境界より後ろ → outcome === passthrough', async () => {
      // act
      const result = await _classify(_markerAfterBoundaryFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
    });

    /** 先頭 strip 後も 2 個目以降の境界以降にマーカーが残る場合。最初の境界のみが除去対象となる。 */
    it('[Edge] T-FL-SCC-04-05: 先頭 strip 後もマーカーが残る合成入力 → outcome === stripped', async () => {
      // arrange
      const boundaryIdx = 3;
      const fmLines = 4;

      // act
      const result = await _classify(_markerRemainsAfterStripFile);

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
      // act
      const shortFm = await _classify(_highRemovalRateFile);
      const longFm = await _classify(_highRemovalRateLongFmFile);

      // assert
      assertEquals(shortFm.outcome, 'error');
      assertEquals(longFm.outcome, 'error');
      assertEquals(shortFm.reason.rule, 'R-007');
      assertEquals(longFm.reason.rule, 'R-007');
    });

    /**
     * `hasBackup` を省略した場合の既定実装。
     *
     * 既定は `<path>.bak` の存在確認である。R-004 はキャッシュとは別軸の「実 FS 上の退避の有無」を
     * 見る規則であり、既定が誤ったパスを見ると退避済みファイルを再 strip して原文を失う。
     * 実 FS を使わずに検証するため、参照されたパスを記録する `readProvider` 相当の注入は行わず、
     * 実在する一時ファイルで判定させる。
     */
    it('[Edge] T-FL-SCC-04-07: hasBackup 省略 → `<path>.bak` の存在で R-004 done になる', async () => {
      // arrange
      const _dir = await Deno.makeTempDir();
      const _filePath = `${_dir}/backed-up.md`;
      await Deno.writeTextFile(_filePath, _strippableFile);
      await Deno.writeTextFile(`${_filePath}${BAK_SUFFIX}`, '既存の退避内容');
      const _cache = await _makeCache();

      // act（readProvider も hasBackup も省略し、実 FS の既定経路を通す）
      const result = await classifyStrip(_filePath, _cache, false);

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-004');

      await Deno.remove(_dir, { recursive: true });
    });

    /**
     * 頭部の定型部と `## Excerpt` 直後の貼り付け前置きが同時に存在する場合（R-006 > R-018）。
     *
     * 1 ファイルから 2 箇所を同時に除去しないため、両者は排他で R-006 が優先する（DR-41 決定 2）。
     * 除去範囲を実値で固定し、paste 側の `{ start: 7, end: 7 }`（= ファイル基準 11 / 25 バイト）を
     * 採用する退行を検出する。
     */
    it('[Edge] T-FL-SCC-07-07: 頭部マーカー + 貼り付け前置き → R-006 が優先し removalKind === head', async () => {
      // act
      const result = await _classify(_headAndPasteFile);

      // assert
      assertEquals(result.outcome, 'stripped');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.HEAD);
      assertEquals(
        [result.removalStartLine, result.removalEndLine, result.removedBytes],
        [4, 6, 55],
      );
    });

    /**
     * 頭部マーカーも貼り付け前置きも持たない場合（R-006 / R-018 いずれも不成立）。
     *
     * R-018 の導入後も `reason.rule` は `'R-006'` のままとする。既存の strip キャッシュには
     * `rule: R-006` の passthrough 記録が残っており、`'R-018'` へ変えると記録の互換が壊れる。
     */
    it('[Edge] T-FL-SCC-07-08: 頭部マーカーも貼り付け前置きも無い → passthrough / rule は R-006 のまま', async () => {
      // act
      const result = await _classify(_noMarkerFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /**
     * 貼り付けマーカーが前置き区間の外（実内容より後ろ）にしかない場合。
     *
     * 前置き区間は実内容で打ち切られるため R-018 は不成立であり、本文中の引用は除去しない
     * （DR-41 が Option B を却下した根拠。実測 14 件がこの形に該当する）。
     */
    it('[Edge] T-FL-SCC-07-09: 貼り付けマーカーが本文の深い位置のみ → passthrough で除去しない', async () => {
      // act
      const result = await _classify(_deepPasteOnlyFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-006');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
    });

    /**
     * 境界見出しが無く貼り付け前置きだけがある場合（R-005 > R-018）。
     *
     * この入力に対し `findPasteWrapperRange` は `{ start: 3, end: 3 }` を返すため、
     * R-018 を R-005 より前で評価すると誤って stripped になる。評価位置を固定するケース。
     */
    it('[Edge] T-FL-SCC-07-10: `## Summary` 無し + 貼り付け前置き → R-005 が優先し passthrough', async () => {
      // act
      const result = await _classify(_pasteWithoutBoundaryFile);

      // assert
      assertEquals(result.outcome, 'passthrough');
      assertEquals(result.reason.rule, 'R-005');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
    });

    /**
     * 除去範囲を持たない `done`（R-003）の除去種別。
     *
     * 判定が確定しているだけで除去は行わないため `'none'` を担ぐ。`'head'` が漏れると
     * 書き込み側が除去済みファイルへ再び除去を当てる根拠を得てしまう。
     */
    it('[Edge] T-FL-SCC-07-12: キャッシュ処理済み記録の done → removalKind === none', async () => {
      // act
      const result = await _classify(_strippableFile, { isProcessed: true });

      // assert
      assertEquals(result.outcome, 'done');
      assertEquals(result.reason.rule, 'R-003');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
      assertEquals(_hasNoRemovalFields(result), true);
    });

    /** 除去範囲を持たない `error`（R-002: frontmatter 欠落）の除去種別も `'none'` になる。 */
    it('[Edge] T-FL-SCC-07-13: frontmatter 欠落の error → removalKind === none', async () => {
      // act
      const result = await _classify(_noFrontmatterFile);

      // assert
      assertEquals(result.outcome, 'error');
      assertEquals(result.reason.rule, 'R-002');
      assertEquals(result.removalKind, STRIP_REMOVAL_KINDS.NONE);
      assertEquals(_hasNoRemovalFields(result), true);
    });
  });
});

/**
 * strip 処理の統計カウンター型 `StripStats` のユニットテストスイート。
 *
 * 5 分類の件数フィールドと除去前後のバイト数を持ち、`BaseStats` のフィールドを継承しないことを検証する。
 *
 * テスト ID 範囲: T-FL-SCC-05-01 〜 T-FL-SCC-05-02
 *
 * @see StripStats
 */
describe('StripStats', () => {
  /** 型が要求する 5 分類の件数・`total`・除去前後のバイト数を保持することを確認する（DR-30 / REQ-F-006）。 */
  describe('When: エッジケース', () => {
    /**
     * `total` / `stripped` / `skipped` / `done` / `passthrough` / `error` の 6 件数フィールドに加え、
     * REQ-F-006 の `bytesBefore` / `bytesAfter` を持つ。
     */
    it('[Edge] T-FL-SCC-05-01: StripStats の値 → 5 分類の件数フィールドと除去前後のバイト数を持つ', () => {
      // arrange
      const stats = _emptyStripStats;

      // act
      const keys = Object.keys(stats).sort();

      // assert
      assertEquals(keys, [
        'bytesAfter',
        'bytesBefore',
        'done',
        'error',
        'passthrough',
        'skipped',
        'stripped',
        'total',
      ]);
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
