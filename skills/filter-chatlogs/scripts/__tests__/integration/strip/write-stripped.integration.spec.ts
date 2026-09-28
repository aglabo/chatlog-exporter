// src: scripts/__tests__/integration/strip/write-stripped.integration.spec.ts
// @(#): strip 書き込みパイプライン（R-009: tmp → 退避 → スワップ）の統合テスト
//       対象: writeStripped
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { writeStripped } from '../../../modules/strip/write-stripped.ts';
// functions
import { classifyStrip } from '../../../libs/classify-strip.ts';

// ─── Helpers
import { fileExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { divideEntry, frontmatterLines } from '../../../../../_cle-libs/libs/text/frontmatter-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../../../_cle-libs/classes/ChatlogFrontmatter.class.ts';
// constants
import { STRIP_BOUNDARY_HEADING, STRIP_EXCERPT_HEADING } from '../../../constants/strip.constants.ts';
import { STRIP_CACHE_STATUSES } from '../../../types/strip-cache-status.const.types.ts';
import { STRIP_REMOVAL_KINDS } from '../../../types/strip-removal-kind.const.types.ts';
// types
import type { StripCache } from '../../../types/cache.types.ts';
import type { StripRemovalKind } from '../../../types/strip-removal-kind.const.types.ts';
import type { StripDecision } from '../../../types/strip.types.ts';

// ─── Internal Helpers

// constants

/** strip 対象となる原文。frontmatter → 定型部マーカー → 境界見出し `## Summary` → 本文の構成。 */
const _STRIPPED_SOURCE = `---
type: chatlog
category: dev
title: Sample
---

## TOPICS ASSIGNMENT RULES

Some boilerplate line A.
Some boilerplate line B.

## Summary

Real content here.
More real content.
`;

/** `_STRIPPED_SOURCE` の改行を CRLF にした原文。`writeTextFile` の LF 正規化検証に使用する。 */
const _CRLF_SOURCE = _STRIPPED_SOURCE.replace(/\n/g, '\r\n');

/**
 * `_STRIPPED_SOURCE` の定型部へ 1 行挿入し、境界見出し `## Summary` を index 11 → 12 へずらした原文。
 *
 * frontmatter は不変（`frontmatterLines` は `5` のまま）であるため、除去範囲の第 1 条件では
 * 捕まらず、境界見出しの照合でのみ不整合が検出される。
 */
const _SHIFTED_SOURCE = _STRIPPED_SOURCE.replace(
  'Some boilerplate line B.\n',
  'Some boilerplate line B.\nSome boilerplate line C.\n',
);

/**
 * `_STRIPPED_SOURCE` の frontmatter へ 1 キー追加した原文。`frontmatterLines` が `5` → `6` になる。
 *
 * **frontmatter 行数の辺（`start === fmLines`）を単独では切り分けない。** 1 行増えた分だけ本文全体が
 * 1 行下へずれるため、`## Summary` は index 11 → 12 へ動き、終了辺 `lines[end + 1] === '## Summary'`
 * も同時に不成立になる。開始辺だけを壊す検証は `T-FL-STW-07-02`（`_FRONTMATTER_SHIFTED_SOURCE`）が担う。
 */
const _EXTRA_KEY_SOURCE = _STRIPPED_SOURCE.replace('title: Sample\n', 'title: Sample\ntags: sample\n');

/** 開き `---` を持つが閉じ `---` を持たない、壊れた frontmatter の原文。`divideEntry` は throw する。 */
const _BROKEN_FRONTMATTER_SOURCE = `---
type: chatlog
category: dev

## Summary

Real content here.
`;

/** frontmatter を持たず 1 行目が境界見出しである原文。 */
const _NO_FRONTMATTER_SOURCE = `## Summary

Real content here.
`;

/**
 * R-018（`paste`）の除去対象となる原文。frontmatter → `## Summary` → `## Excerpt` → 前置き区間 → 実内容。
 *
 * frontmatter は `_STRIPPED_SOURCE` と同じ 5 行（`frontmatterLines` は `5`）。
 * ファイル全体基準の行インデックスは次のとおり。
 *
 * 0-4 = frontmatter / 5 = 空行 / 6 = `## Summary` / 7 = 空行 / 8 = 要約 / 9 = 空行 /
 * 10 = `## Excerpt` / 11 = 空行 / 12 = 貼り付けマーカー / 13-14 = 実内容
 *
 * `findPasteWrapperRange` は content 基準で `{ start: 6, end: 7 }` を返すため、判定は
 * `removalStartLine = 11` / `removalEndLine = 12` / `removalKind = 'paste'` となる。
 * 除去範囲が frontmatter 行数（`5`）と一致しないため、`head` 用のアンカーでは通過できない。
 */
const _PASTE_SOURCE = `---
type: chatlog
category: dev
title: Sample
---

## Summary

Real summary text.

## Excerpt

<<<CHATLOG file="x.md">>>
Real pasted content.
More real content.
`;

/** `_PASTE_SOURCE` に対する R-018 の除去開始行（ファイル全体基準・0 起点）。`## Excerpt` の次の行。 */
const _PASTE_REMOVAL_START = 11;

/** `_PASTE_SOURCE` に対する R-018 の除去終了行（ファイル全体基準・0 起点）。前置き区間の最後の貼り付けマーカー行。 */
const _PASTE_REMOVAL_END = 12;

/** `_PASTE_SOURCE` の貼り付けマーカー行（file index 12）。派生 fixture の置換対象に使う。 */
const _PASTE_MARKER_LINE = _PASTE_SOURCE.split('\n')[_PASTE_REMOVAL_END];

/** `_PASTE_SOURCE` から前置き区間（index 11-12）だけを取り除いた、strip 成功後に期待される本体。 */
const _PASTE_STRIPPED_EXPECTED = _PASTE_SOURCE.split('\n')
  .filter((_line, index) => index < _PASTE_REMOVAL_START || index > _PASTE_REMOVAL_END)
  .join('\n');

/**
 * `_PASTE_SOURCE` の `## Excerpt`（index 10）を非見出しの 1 行へその場で置換した原文。
 *
 * 1 行を 1 行へ置き換えるだけで**行数を変えない**ため、壊れるのは開始辺
 * （`removalStartLine - 1` 行目が `## Excerpt`）**だけ**である。
 * index 12 は貼り付けマーカー行のままなので、終了辺は成立し続ける。
 */
const _PASTE_BROKEN_EXCERPT_SOURCE = _PASTE_SOURCE.replace(
  `${STRIP_EXCERPT_HEADING}\n`,
  'Excerpt heading was rewritten.\n',
);

/**
 * `_PASTE_SOURCE` の貼り付けマーカー行（index 12）を非マーカーの 1 行へその場で置換した原文。
 *
 * 1 行を 1 行へ置き換えるだけで**行数を変えない**ため、壊れるのは終了辺
 * （`removalEndLine` 行目が貼り付けマーカー行）**だけ**である。
 * index 10 は `## Excerpt` のままなので、開始辺は成立し続ける。
 * 置換後の行は `<<<CHATLOG file=` 形にも `=== <ファイル名> ===` 形にも一致しない。
 */
const _PASTE_BROKEN_MARKER_SOURCE = _PASTE_SOURCE.replace(
  `${_PASTE_MARKER_LINE}\n`,
  'Paste marker was rewritten.\n',
);

/** `_PASTE_SOURCE` から frontmatter ブロックを取り除いた本文のみの原文。frontmatter 存在の共通検証で落ちる。 */
const _PASTE_NO_FRONTMATTER_SOURCE = divideEntry(_PASTE_SOURCE).content;

/**
 * `## Excerpt` より **前** にも貼り付けマーカーがある原文（`_PASTE_SOURCE` の要約行をマーカー行へ置換）。
 *
 * ファイル全体基準の行インデックス（実測値。`frontmatterLines` は `5`）:
 *
 * 0-4 = frontmatter / 5 = 空行 / 6 = `## Summary` / 7 = 空行 /
 * 8 = 貼り付けマーカー / 9 = 空行 / 10 = `## Excerpt` / 11 = 空行 /
 * 12 = 貼り付けマーカー / 13-14 = 実内容 / 15 = 末尾の空行
 *
 * 判定結果は `_PASTE_SOURCE` と同じ `paste` / `removalStartLine = 11` / `removalEndLine = 12` である
 * （index 8 のマーカーは `## Excerpt` より前にあり、前置き区間に含まれない）。実測値。
 *
 * `## Excerpt` より前後にマーカーが 1 本ずつあるため、paste の 2 辺を**片方ずつ**崩す差し替えに使える。
 *
 * - `start = 11` / `end = 8`: `lines[start - 1]` = `lines[10]` は `## Excerpt`、`lines[end]` = `lines[8]`
 *   は貼り付けマーカーであり、**両アンカーが成立したまま `end < start`** になる。共通の順序検査
 *   `_end < _start` だけがこの組を弾ける（`T-FL-STW-07-01`）
 * - `start = 9` / `end = 12`: `lines[end]` = `lines[12]` は貼り付けマーカーなので**終了辺は成立**し、
 *   `lines[start - 1]` = `lines[8]` は `## Excerpt` より前のマーカーなので**開始辺だけが崩れる**。
 *   `## Excerpt` は index 10 に残るため、開始辺を包含チェックへ弱める変異はこの組を通してしまう
 *   （`T-FL-STW-07-03`）
 */
const _PASTE_EARLY_MARKER_SOURCE = _PASTE_SOURCE.replace(
  'Real summary text.\n',
  '<<<CHATLOG file="earlier.md">>>\n',
);

/** `_PASTE_EARLY_MARKER_SOURCE` で `## Excerpt` より前にある貼り付けマーカー行の index（実測値）。 */
const _EARLY_PASTE_MARKER_LINE = 8;

/**
 * `_PASTE_EARLY_MARKER_SOURCE` に対し、paste の開始辺だけを崩す除去開始行（ファイル全体基準・0 起点）。
 *
 * 直前の行が `## Excerpt` より前にある貼り付けマーカー行（index 8）になるため、
 * `lines[start - 1] === '## Excerpt'` が不成立になる。
 */
const _EARLY_MARKER_SHIFTED_START = _EARLY_PASTE_MARKER_LINE + 1;

/**
 * `_STRIPPED_SOURCE` の frontmatter を 1 行増やし、同時に定型部の本文を 1 行減らした原文。
 *
 * ファイル全体基準の行インデックス（実測値。`frontmatterLines` は `5` → **`6`**）:
 *
 * 0-5 = frontmatter / 6 = 空行 / 7 = `## TOPICS ASSIGNMENT RULES` / 8 = 空行 /
 * 9 = `Some boilerplate line A.` / 10 = 空行 / **11 = `## Summary`** / 12 = 空行 /
 * 13-14 = 実内容 / 15 = 末尾の空行
 *
 * `_STRIPPED_SOURCE` に対する判定（`head` / `start = 5` / `end = 10`）をこの内容へ当てると、
 * `## Summary` の絶対 index が `11` のままなので**終了辺 `lines[end + 1] === '## Summary'` は成立し続け**、
 * 開始辺 `start === fmLines` だけが `5 === 6` で不成立になる。
 * `head` アンカーの開始辺だけがこの組を弾ける。
 */
const _FRONTMATTER_SHIFTED_SOURCE = _STRIPPED_SOURCE
  .replace('title: Sample\n', 'title: Sample\ntags: sample\n')
  .replace('Some boilerplate line B.\n', '');

/**
 * `_STRIPPED_SOURCE` の frontmatter 行数（`5`）。`writeStripped` が `fmLines` を求める式と同じ式で導く。
 *
 * `head` アンカーの開始辺 `start === fmLines` の基準であり、素の判定の `removalStartLine` と一致する。
 */
const _STRIPPED_FRONTMATTER_LINES = frontmatterLines(divideEntry(_STRIPPED_SOURCE).frontmatter);

/**
 * `_STRIPPED_SOURCE` に対する R-008 の除去終了行（ファイル全体基準・0 起点。`10`）。
 *
 * 直後の行（index 11）が境界見出し `## Summary` になるため、`head` の終了辺
 * `lines[end + 1] === '## Summary'` が成立する行である。見出しの index から導く。
 */
const _HEAD_REMOVAL_END = _STRIPPED_SOURCE.split('\n').indexOf(STRIP_BOUNDARY_HEADING) - 1;

/**
 * `_STRIPPED_SOURCE` に対し、`head` アンカーの**開始辺だけ**を `fmLines` より大きい側へ崩す除去開始行。
 *
 * `fmLines + 1` であるため開始辺 `start === fmLines` は不成立になる一方、除去終了行を
 * `_HEAD_REMOVAL_END` に据え置けば終了辺 `lines[end + 1] === '## Summary'` は成立し続け、
 * `end >= start` も保たれるため共通の順序検査でも弾かれない。
 * `T-FL-STW-07-02` が踏む `start < fmLines` 側とは反対方向の崩し方である。
 */
const _HEAD_SHIFTED_START = _STRIPPED_FRONTMATTER_LINES + 1;

/**
 * `_PASTE_SOURCE` の `## Excerpt` 直後の空行（index 11）を取り除き、前置き区間を
 * 貼り付けマーカー 1 行だけにした原文。
 *
 * ファイル全体基準の行インデックス（実測値。`frontmatterLines` は `5`、総行数 15）:
 *
 * 0-4 = frontmatter / 5 = 空行 / 6 = `## Summary` / 7 = 空行 / 8 = 要約 / 9 = 空行 /
 * 10 = `## Excerpt` / **11 = 貼り付けマーカー** / 12-13 = 実内容 / 14 = 末尾の空行
 *
 * `classifyStrip` はこの内容に対し `paste` / `removalStartLine = removalEndLine = 11` を返す（実測値）。
 * 開始辺 `lines[10] === '## Excerpt'` と終了辺 `isPasteMarkerLine(lines[11])` の**両辺が成立したまま、
 * 除去範囲が 1 行**（`start === end`）になる境界寸法である。
 */
const _PASTE_TIGHT_WRAPPER_SOURCE = _PASTE_SOURCE.replace(
  `${STRIP_EXCERPT_HEADING}\n\n`,
  `${STRIP_EXCERPT_HEADING}\n`,
);

/** `_PASTE_TIGHT_WRAPPER_SOURCE` の除去対象行（ファイル全体基準・0 起点）。除去開始行と終了行が一致する。 */
const _PASTE_TIGHT_REMOVAL_LINE = 11;

/** `_PASTE_TIGHT_WRAPPER_SOURCE` からマーカー 1 行だけを取り除いた、strip 成功後に期待される本体。 */
const _PASTE_TIGHT_STRIPPED_EXPECTED = _PASTE_TIGHT_WRAPPER_SOURCE.split('\n')
  .filter((_line, index) => index !== _PASTE_TIGHT_REMOVAL_LINE)
  .join('\n');

/**
 * `_PASTE_SOURCE` を貼り付けマーカー行で終端させ、**末尾改行を持たせない**原文。
 *
 * ファイル全体基準の行インデックス（実測値。`frontmatterLines` は `5`、総行数 13）:
 *
 * 0-4 = frontmatter / 5 = 空行 / 6 = `## Summary` / 7 = 空行 / 8 = 要約 / 9 = 空行 /
 * 10 = `## Excerpt` / 11 = 空行 / **12 = 貼り付けマーカー（`lines.length - 1`）**
 *
 * 除去終了行が行配列の最終 index になる境界寸法である。paste の終了辺は `lines[end]` だけを読むため
 * 両辺は成立し、`lines[end + 1]` が存在しないことは判定に影響しない。
 *
 * **素の `classifyStrip` は使えない。** 除去範囲より後ろが空になるため R-007 が先に成立し、
 * `outcome: 'error'` / `removalStartLine = removalEndLine = -1` / `removalKind = 'none'` が返る（実測値）。
 * そのため除去範囲と除去種別の両方を差し替えて判定を組み立てる。
 */
const _PASTE_TAIL_MARKER_SOURCE = _PASTE_SOURCE.split('\n')
  .slice(0, _PASTE_REMOVAL_END + 1)
  .join('\n');

/** `_PASTE_TAIL_MARKER_SOURCE` から前置き区間（index 11-12）を取り除いた、strip 成功後に期待される本体。 */
const _PASTE_TAIL_STRIPPED_EXPECTED = _PASTE_TAIL_MARKER_SOURCE.split('\n')
  .filter((_line, index) => index < _PASTE_REMOVAL_START || index > _PASTE_REMOVAL_END)
  .join('\n');

// types

/** `_setup` が返すテスト対象ファイル一式。 */
interface _Fixture {
  /** 対象 `.md` の絶対パス。 */
  filePath: string;
  /** 対象の退避先 `<path>.bak` の絶対パス。 */
  bakPath: string;
  /** 書き込み途中に生成される `<path>.tmp` の絶対パス。 */
  tmpPath: string;
}

// functions

/**
 * `tempDir` 配下に `.md` を書き出し、関連パスをまとめて返す。
 *
 * @param name - 拡張子を含むファイル名（例: `'sample.md'`）
 * @param source - 書き出す原文テキスト
 * @returns 対象ファイル・退避先・一時ファイルのパス
 */
const _setup = async (name: string, source: string): Promise<_Fixture> => {
  const filePath = `${tempDir}/${name}`;
  await Deno.writeTextFile(filePath, source);
  return { filePath, bakPath: `${filePath}.bak`, tmpPath: `${filePath}.tmp` };
};

/**
 * `classifyStrip` を「キャッシュ記録なし・退避なし・通常実行」の前提で呼び出し、判定結果を返す。
 *
 * 退避の存在確認は注入で無効化する。ここでの関心は `writeStripped` の書き込み挙動であり、
 * R-004 で done に落ちると書き込み経路へ到達しないため。
 */
const _classifyFresh = (filePath: string): Promise<StripDecision> =>
  classifyStrip(filePath, cache, false, { hasBackup: () => Promise.resolve(false) });

/**
 * `_PASTE_SOURCE` を書き出し、その内容に整合する `paste` 判定まで得た状態を返す。
 *
 * DR-42 の paste アンカーを検証するケースはすべてこの前提から始まるため、
 * 書き出しと判定の組み立てを 1 箇所へまとめる。
 *
 * @returns 対象ファイル一式と、`removalKind: 'paste'` / 除去範囲 11-12 の判定結果
 */
const _setupPasteFixture = async (): Promise<_Fixture & { decision: StripDecision }> => {
  const fixture = await _setup('paste.md', _PASTE_SOURCE);
  return { ...fixture, decision: await _classifyFresh(fixture.filePath) };
};

/** テキストの frontmatter ブロックのみを `ChatlogFrontmatter` として取り出す。 */
const _frontmatterOf = (text: string): ChatlogFrontmatter => new ChatlogFrontmatter(text);

/**
 * 最終スワップ（`*.tmp` → 本体）だけを失敗させる `Deno.rename` スタブを張る。
 *
 * `backupToBak` による退避リネーム（本体 → `*.bak`）は素通しするため、
 * 手順 2 が完了し手順 3 が失敗した状態を再現できる。
 * `Deno.errors.AlreadyExists` は `writeTextFile` 側で捕捉・再試行されるため使用しない。
 *
 * @returns 張ったスタブ。呼び出し側で `restore()` すること
 */
const _stubFinalRenameFailure = () => {
  const _origRename = Deno.rename.bind(Deno);
  return stub(
    Deno,
    'rename',
    (from: string | URL, to: string | URL) =>
      String(from).endsWith('.tmp')
        ? Promise.reject(new Error('rename failed'))
        : _origRename(from, to),
  );
};

/**
 * 手順 1（`*.tmp` への書き出し）だけを失敗させる `Deno.writeTextFile` スタブを張る。
 *
 * 対象の一時ファイルへの書き出しのみを拒否し、それ以外の書き出し（キャッシュ等）は素通しするため、
 * 手順 1 の途中で中断した状態を再現できる。
 *
 * @param tmpPath - 失敗させる一時ファイルの絶対パス
 * @returns 張ったスタブ。呼び出し側で `restore()` すること
 */
const _stubTmpWriteFailure = (tmpPath: string) => {
  const _origWrite = Deno.writeTextFile.bind(Deno);
  return stub(
    Deno,
    'writeTextFile',
    (path: string | URL, data: Parameters<typeof Deno.writeTextFile>[1], options?: Deno.WriteFileOptions) =>
      String(path) === tmpPath
        ? Promise.reject(new Error('tmp write failed'))
        : _origWrite(path, data, options),
  );
};

/**
 * 手順 2（本体 → `*.bak` の退避リネーム）だけを失敗させる `Deno.rename` スタブを張る。
 *
 * 退避リネームが試みられた瞬間に `onAttempt` を呼び出してから失敗させるため、
 * 「原文を動かす前に置換内容が一時ファイルへ退避済みか」を観測してから中断を再現できる。
 *
 * @param bakPath - 失敗させる退避先の絶対パス
 * @param onAttempt - 退避リネーム直前に実行する観測処理
 * @returns 張ったスタブ。呼び出し側で `restore()` すること
 */
const _stubBackupRenameFailure = (bakPath: string, onAttempt: () => Promise<void>) => {
  const _origRename = Deno.rename.bind(Deno);
  return stub(Deno, 'rename', async (from: string | URL, to: string | URL) => {
    if (String(to) !== bakPath) { return await _origRename(from, to); }
    await onAttempt();
    throw new Error('backup rename failed');
  });
};

/**
 * `cache.write` だけを失敗させるスタブを張る。
 *
 * 権限エラー・ディスクフルでキャッシュ記録が失敗した状態を再現する。
 * R-009 の 3 手順は素通しするため、「本体の置換は成功したが記録だけ失敗した」
 * 状態を観測できる。
 *
 * @returns 張ったスタブ。呼び出し側で `restore()` すること
 */
const _stubCacheWriteFailure = () => stub(cache, 'write', () => Promise.reject(new Error('cache write failed')));

/**
 * 判定済みの `StripDecision` の除去範囲だけを差し替えた複製を返す。
 *
 * 判定確定後にファイル内容が差し替わった状況、および除去範囲を持たない分類の
 * センチネル（`-1` / `-1`）が書き込み経路へ渡された状況を再現する。
 *
 * @param decision - 元となる判定結果
 * @param removalStartLine - 差し替える除去開始行
 * @param removalEndLine - 差し替える除去終了行
 * @returns 除去範囲のみを差し替えた新しい判定結果
 */
const _withRemovalRange = (
  decision: StripDecision,
  removalStartLine: number,
  removalEndLine: number,
): StripDecision => ({ ...decision, removalStartLine, removalEndLine });

/**
 * 判定済みの `StripDecision` の除去種別だけを差し替えた複製を返す。
 *
 * `removalStartLine` / `removalEndLine` は**変えない**ため、「除去範囲は現在の内容と整合して
 * いるが種別だけが異なる」状況を再現できる。種別ごとのアンカー分岐が無い実装では範囲の整合だけで
 * 書き込みが通ってしまうため、その差を観測するために範囲を保つことが要件となる。
 *
 * @param decision - 元となる判定結果
 * @param removalKind - 差し替える除去種別
 * @returns 除去種別のみを差し替えた新しい判定結果
 */
const _withRemovalKind = (decision: StripDecision, removalKind: StripRemovalKind): StripDecision => ({
  ...decision,
  removalKind,
});

// ─── 共通セットアップ

let tempDir: string;
let cache: ChatlogCache<StripCache>;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
  cache = new ChatlogCache<StripCache>('strip-cache', `${tempDir}/.cache`);
  await cache.ready;
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── Tests

/**
 * `writeStripped` の統合テストスイート。
 *
 * R-009 の書き込み順序（1) tmp へ書き出す → 2) 元を `.bak` へ退避 → 3) tmp を本体名へ移動）を
 * 分割不能な 1 単位として検証する。実 tmp ディレクトリ上で実際の FS 操作を行う。
 *
 * テスト ID 範囲: T-FL-STW-01-01 〜 T-FL-STW-07-09
 *
 * @see writeStripped
 */
describe('writeStripped', () => {
  /**
   * 正常な書き込みと退避の検証。
   *
   * 原文が `.bak` に保存され、本体が除去後の内容へ置き換わり、
   * frontmatter が保存され、一時ファイルが残らないことを確認する。
   */
  describe('正常な書き込みと退避', () => {
    /** stripped と判定されたファイルを実際に書き込む正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-STW-01-01: `.bak` の内容が strip 前の原文と一致する', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const error = await writeStripped(filePath, decision, cache);

        assertEquals(error, undefined);
        assertEquals(await Deno.readTextFile(bakPath), _STRIPPED_SOURCE);
      });

      it('[Normal] T-FL-STW-01-02: 本体が `## Summary` から始まり以降の内容が strip 前と一致する', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        await writeStripped(filePath, decision, cache);

        // frontmatter は保持されるため、本文領域の先頭が境界見出しであることを検証する
        const { content } = divideEntry(await Deno.readTextFile(filePath));
        assert(content.startsWith(STRIP_BOUNDARY_HEADING));
        // 境界見出し以降の内容が strip 前と一致すること
        const _expectedTail = divideEntry(_STRIPPED_SOURCE).content
          .slice(divideEntry(_STRIPPED_SOURCE).content.indexOf(STRIP_BOUNDARY_HEADING));
        assertEquals(content, _expectedTail);
      });

      it('[Normal] T-FL-STW-01-03: frontmatter が strip 前と同一と判定される', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        await writeStripped(filePath, decision, cache);

        const _after = _frontmatterOf(await Deno.readTextFile(filePath));
        assert(_after.equals(_frontmatterOf(_STRIPPED_SOURCE)));
      });

      it('[Normal] T-FL-STW-01-04: 書き込み完了後に `.tmp` が残らない', async () => {
        const { filePath, tmpPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        await writeStripped(filePath, decision, cache);

        assertFalse(await fileExists(tmpPath));
      });
    });
  });

  /**
   * キャッシュ記録のタイミング検証。
   *
   * 記録は最終スワップの後に行われ、スワップが失敗した場合は記録されないことを確認する
   * （次回実行が誤って done でスキップしないための保証）。
   */
  describe('キャッシュ記録のタイミング', () => {
    /** 書き込みが正常完了し、スワップ後に記録されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-STW-02-01: キャッシュへの記録が最終リネームの後に行われる', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        // 最終スワップ（*.tmp → 本体）と cache.write の発生順を記録する
        const _order: string[] = [];
        const _origRename = Deno.rename.bind(Deno);
        const renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
          if (String(from).endsWith('.tmp')) { _order.push('swap'); }
          return _origRename(from, to);
        });
        const cacheStub = stub(cache, 'write', () => {
          _order.push('cache');
          return Promise.resolve();
        });

        try {
          await writeStripped(filePath, decision, cache);
        } finally {
          renameStub.restore();
          cacheStub.restore();
        }

        assertEquals(_order, ['swap', 'cache']);
      });

      it('[Normal] T-FL-STW-02-03: 成功時にキャッシュへ stripped が記録される', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        await writeStripped(filePath, decision, cache);

        assertEquals(cache.read(filePath).status, STRIP_CACHE_STATUSES.STRIPPED);
      });
    });

    /** 手順 3 のリネームが失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-STW-02-02: スワップ失敗時にキャッシュへ記録されない', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const renameStub = _stubFinalRenameFailure();
        try {
          await writeStripped(filePath, decision, cache);
        } finally {
          renameStub.restore();
        }

        assertEquals(cache.read(filePath).status, undefined);
      });

      it('[Error] T-FL-STW-02-04: キャッシュ書き込み失敗時に reject せず ChatlogError を返す', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const cacheStub = _stubCacheWriteFailure();
        let error: ChatlogError | undefined;
        try {
          // DD-03: 1 件の error が全件を止めないため、throw ではなく戻り値で失敗を伝える
          error = await writeStripped(filePath, decision, cache);
        } finally {
          cacheStub.restore();
        }

        assert(error instanceof ChatlogError);
      });

      it('[Error] T-FL-STW-02-05: キャッシュ書き込み失敗は CacheWriteFailed として失敗を返す', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const cacheStub = _stubCacheWriteFailure();
        let error: ChatlogError | undefined;
        try {
          error = await writeStripped(filePath, decision, cache);
        } finally {
          cacheStub.restore();
        }

        // 本体の置換は成功しているが、キャッシュ未記録のため安全側（失敗）に倒す。
        // 呼び出し側はこの戻り値を error として計上し、R-011 が復旧材料の退避を保持する。
        // どの条件で失敗したかを保つため subindex まで検証する（成功時は undefined）
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'CacheWriteFailed');
      });

      it('[Error] T-FL-STW-02-06: キャッシュ書き込み失敗でも本体の置換自体は完了している', async () => {
        const { filePath, tmpPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const cacheStub = _stubCacheWriteFailure();
        try {
          await writeStripped(filePath, decision, cache);
        } finally {
          cacheStub.restore();
        }

        // 失敗したのは記録のみで、R-009 の 3 手順は完走している
        const { content } = divideEntry(await Deno.readTextFile(filePath));
        assert(content.startsWith(STRIP_BOUNDARY_HEADING));
        assertFalse(await fileExists(tmpPath));
      });
    });
  });

  /**
   * 中断と防御的分岐の検証。
   *
   * どの時点で中断しても原文が失われないこと（REQ-NF-005 / AC-020）を保証する。
   * いずれのケースも実際に `writeStripped` を呼び、該当手順に失敗を注入して中断を再現する。
   */
  describe('中断と防御的分岐', () => {
    /** 中断・防御的分岐により原文が保全されるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-STW-03-01: 手順 1 の中断で本体に元の完全な内容が残る', async () => {
        const { filePath, tmpPath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        // 手順 1（tmp への書き出し）で中断させる
        const writeStub = _stubTmpWriteFailure(tmpPath);
        let error: ChatlogError | undefined;
        try {
          error = await writeStripped(filePath, decision, cache);
        } finally {
          writeStub.restore();
        }

        // 手順 1 で中断したため原文はまだ動かされておらず、本体に完全なまま残る
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'WriteFailed');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-03-02: 手順 2 の中断で本体か退避の一方に元の完全な内容が残る', async () => {
        const { filePath, bakPath, tmpPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        // 退避リネームが試みられた瞬間の一時ファイルの内容を控えてから中断させる
        const _stagedAtBackup: { text: string | null } = { text: null };
        const renameStub = _stubBackupRenameFailure(bakPath, async () => {
          _stagedAtBackup.text = await fileExists(tmpPath) ? await Deno.readTextFile(tmpPath) : null;
        });
        let error: ChatlogError | undefined;
        try {
          error = await writeStripped(filePath, decision, cache);
        } finally {
          renameStub.restore();
        }

        assert(error instanceof ChatlogError);
        // 原文を動かす前に置換内容が一時ファイルへ退避済みであること（これが原文保全の前提）
        const _staged = _stagedAtBackup.text;
        assert(_staged !== null, '退避リネーム時点で一時ファイルが存在しない');
        assert(_staged.includes(STRIP_BOUNDARY_HEADING));
        assertFalse(_staged.includes('Some boilerplate line A.'));

        // リネームは原子的なため、本体と退避のいずれか一方に原文が完全なまま存在する
        const _bodyExists = await fileExists(filePath);
        assert(_bodyExists || await fileExists(bakPath));
        assertEquals(await Deno.readTextFile(_bodyExists ? filePath : bakPath), _STRIPPED_SOURCE);
      });

      it('[Error] T-FL-STW-03-03: 手順 3 の中断で本体が存在せず退避に元の内容が残る', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const renameStub = _stubFinalRenameFailure();
        try {
          await writeStripped(filePath, decision, cache);
        } finally {
          renameStub.restore();
        }

        // 手順 2 は完了し手順 3 が失敗したため、原文は退避側にのみ存在する（孤立退避）
        assertFalse(await fileExists(filePath));
        assertEquals(await Deno.readTextFile(bakPath), _STRIPPED_SOURCE);
      });

      it('[Error] T-FL-STW-03-04: 退避が既存なら BackupAlreadyExists を返し本体を書き換えない', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        // 判定は退避なしの前提で得てから、書き込み直前に退避が存在する状態を作る
        const decision = await _classifyFresh(filePath);
        await Deno.writeTextFile(bakPath, '既存の退避内容');

        const error = await writeStripped(filePath, decision, cache);

        // 防御的分岐で書き込みを見送ったことを、原因を特定できる形で検証する
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'BackupAlreadyExists');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
        assertEquals(await Deno.readTextFile(bakPath), '既存の退避内容');
      });
    });
  });

  /**
   * 書き込み後の境界状態の検証。
   *
   * 孤立退避の生成・既存退避による経路到達不能・CRLF 入力での frontmatter 同一性を確認する。
   */
  describe('書き込み後の境界状態', () => {
    /** 境界的な FS 状態・入力形式のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-STW-04-01: 手順 2 と 3 の間の中断が R-014 で検出可能な孤立退避を生成する', async () => {
        // 手順 2 直後の中断状態を直接構築する: 本体が消え退避のみが残る
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        await Deno.rename(filePath, bakPath);

        // R-014 は「本体が存在せず退避のみ存在する」ことで孤立退避を検出できる
        assertFalse(await fileExists(filePath));
        assert(await fileExists(bakPath));
        assertEquals(await Deno.readTextFile(bakPath), _STRIPPED_SOURCE);
      });

      it('[Edge] T-FL-STW-04-02: 退避が既存なら R-004 で done と判定され退避が上書きされない', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        await Deno.writeTextFile(bakPath, '既存の退避内容');

        // R-004: 退避の存在を実 FS から判定させる
        // R-004: 退避の存在を実 FS から判定させる（`hasBackup` の既定実装をそのまま使う）
        const decision = await classifyStrip(filePath, cache, false);

        assertEquals(decision.outcome, 'done');
        assertEquals(decision.reason.rule, 'R-004');
        // done は書き込み経路に到達しないため、退避も本体も変化しない
        assertEquals(await Deno.readTextFile(bakPath), '既存の退避内容');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
      });

      it('[Edge] T-FL-STW-04-03: CRLF 入力でも frontmatter が同一と判定される', async () => {
        const { filePath } = await _setup('crlf.md', _CRLF_SOURCE);
        const decision = await _classifyFresh(filePath);

        await writeStripped(filePath, decision, cache);

        const _afterText = await Deno.readTextFile(filePath);
        // 本文は LF へ正規化される（バイト単位一致では判定しない）
        assertFalse(_afterText.includes('\r\n'));
        assert(_frontmatterOf(_afterText).equals(_frontmatterOf(_CRLF_SOURCE)));
      });
    });
  });

  /**
   * 除去範囲の事前検証（splice 直前ガード）の検証。
   *
   * 判定の確定後に対象ファイルの内容が差し替わった場合（Edge 17 / DR-35）、および
   * 除去範囲を持たない分類のセンチネル `-1` / `-1` が渡された場合に、書き込みを行わず
   * `ChatlogError('FailFast', 'StaleDecision')` を返すことを確認する。
   *
   * いずれのケースも throw せず戻り値で失敗を伝える（DD-03 / REQ-F-008）。
   */
  describe('除去範囲の事前検証', () => {
    /** 判定時の除去範囲が現在の内容と整合しないケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-STW-05-01: 境界行がずれた内容へ差し替わると StaleDecision を返し本体を書き換えない', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);
        // 判定の確定後に内容が差し替わる状況（Edge 17）を再現する
        await Deno.writeTextFile(filePath, _SHIFTED_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        // 書き込み経路へ入らないため、差し替え後の内容がそのまま残り退避も作られない
        assertEquals(await Deno.readTextFile(filePath), _SHIFTED_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      // frontmatter が伸びると本文も 1 行下へずれるため、実際には終了辺（`## Summary` の位置）も
      // 同時に崩れる。frontmatter 行数の辺の単独検証は `T-FL-STW-07-02` が担う。
      // 本ケースは「frontmatter が差し替わった内容を弾く」回帰テストとして有効なため残す
      it('[Error] T-FL-STW-05-02: frontmatter の行数が変わると StaleDecision を返し frontmatter を保つ', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);
        await Deno.writeTextFile(filePath, _EXTRA_KEY_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(
          divideEntry(await Deno.readTextFile(filePath)).frontmatter,
          divideEntry(_EXTRA_KEY_SOURCE).frontmatter,
        );
      });

      it('[Error] T-FL-STW-05-03: 除去範囲 -1 / -1 の判定では StaleDecision を返し末尾行を失わない', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = _withRemovalRange(await _classifyFresh(filePath), -1, -1);

        const error = await writeStripped(filePath, decision, cache);

        // ガードが無い場合 `splice(-1, 1)` は末尾要素を除去するため、原文の完全一致まで検証する
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
      });

      it('[Error] T-FL-STW-05-04: 壊れた frontmatter へ差し替わっても throw せず StaleDecision を返す', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);
        await Deno.writeTextFile(filePath, _BROKEN_FRONTMATTER_SOURCE);

        // `divideEntry` は閉じ `---` の無い内容で throw するが、`hasFrontmatter` の先行評価で到達しない
        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _BROKEN_FRONTMATTER_SOURCE);
      });

      it('[Error] T-FL-STW-05-07: frontmatter を持たないファイルへ -1 / -1 の判定が渡ると StaleDecision を返す', async () => {
        const { filePath } = await _setup('sample.md', _NO_FRONTMATTER_SOURCE);
        const decision = _withRemovalRange(await _classifyFresh(filePath), -1, -1);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
      });
    });

    /** 除去範囲がファイル末尾を超えるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-STW-05-05: 除去範囲がファイル末尾を超えても throw せず StaleDecision を返す', async () => {
        const { filePath } = await _setup('sample.md', _STRIPPED_SOURCE);
        // 総行数 16（有効 index 0〜15）に対し `removalEndLine + 1` = 21 は範囲外となる
        const decision = _withRemovalRange(await _classifyFresh(filePath), 5, 20);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
      });
    });

    /** 内容が判定時から変化していない通常経路（ガード追加によるデグレ検出）。 */
    describe('When: 正常系', () => {
      // 回帰テストのため Red ゲートは免除される（ガード追加前から PASS するのが正しい）
      it('[Normal] T-FL-STW-05-06: 整合する判定ではガードを通過し従来どおり strip して退避を作る', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);

        const error = await writeStripped(filePath, decision, cache);

        assertEquals(error, undefined);
        assert(divideEntry(await Deno.readTextFile(filePath)).content.startsWith(STRIP_BOUNDARY_HEADING));
        assert(await fileExists(bakPath));
      });
    });
  });

  /**
   * 除去種別ごとの再検証アンカー（DR-42）の検証。
   *
   * splice 直前の再検証は `removalKind` ごとに異なるアンカーで行う。`head`（R-008）は
   * 「除去開始行が frontmatter 行数と一致し、除去終了行の直後が `## Summary`」、
   * `paste`（R-018）は「除去開始行の直前が `## Excerpt` で、除去終了行が貼り付けマーカー行」。
   *
   * ここでは `paste` 経路が通過できること、その 2 辺が片方ずつ不成立になると
   * `StaleDecision` になること、frontmatter 存在と範囲の順序は除去種別によらず
   * 共通検証として先に成立することを確認する。
   * `head` 経路の非退行は `T-FL-STW-05-06` が担うため、ここでは重複して検証しない。
   */
  describe('除去種別ごとの再検証アンカー (DR-42)', () => {
    /** paste 判定がアンカーを満たし R-009 の書き込みが完結するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-STW-06-01: paste 判定ではガードを通過し前置き区間の 2 行だけが除去される', async () => {
        const { filePath, decision } = await _setupPasteFixture();
        // 判定が `paste` かつ除去範囲が 11 / 12 であることが本ブロック全体の前提となる
        assertEquals(decision.removalKind, STRIP_REMOVAL_KINDS.PASTE);
        assertEquals(decision.removalStartLine, _PASTE_REMOVAL_START);
        assertEquals(decision.removalEndLine, _PASTE_REMOVAL_END);

        const error = await writeStripped(filePath, decision, cache);

        // `## Excerpt` の直後が実内容になり、それ以外の行は 1 行も変わらない
        assertEquals(error, undefined);
        assertEquals(await Deno.readTextFile(filePath), _PASTE_STRIPPED_EXPECTED);
      });

      it('[Normal] T-FL-STW-06-02: paste の書き込みで `.bak` の内容が strip 前の原文と一致する', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();

        const error = await writeStripped(filePath, decision, cache);

        assertEquals(error, undefined);
        assertEquals(await Deno.readTextFile(bakPath), _PASTE_SOURCE);
      });

      it('[Normal] T-FL-STW-06-03: paste の書き込み後も frontmatter が strip 前と同一と判定される', async () => {
        const { filePath, decision } = await _setupPasteFixture();

        // 書き込みを見送った場合も frontmatter は当然一致するため、strip が実行されたことまで固定する
        const error = await writeStripped(filePath, decision, cache);

        // paste の除去範囲は frontmatter より後ろにあり、frontmatter を跨がない（AC-024）
        assertEquals(error, undefined);
        const _after = _frontmatterOf(await Deno.readTextFile(filePath));
        assert(_after.equals(_frontmatterOf(_PASTE_SOURCE)));
      });

      it('[Normal] T-FL-STW-06-04: paste の書き込み成功でキャッシュへ stripped が記録される', async () => {
        const { filePath, decision } = await _setupPasteFixture();

        await writeStripped(filePath, decision, cache);

        assertEquals(cache.read(filePath).status, STRIP_CACHE_STATUSES.STRIPPED);
        assertEquals(cache.read(filePath).rule, decision.reason.rule);
      });
    });

    /** paste のアンカーの片側だけが不成立になる、または除去範囲を持たない種別が渡るケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-STW-06-05: 開始辺の `## Excerpt` が失われると StaleDecision を返し本体を書き換えない', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 判定の確定後に内容が差し替わる状況（Edge 17）を再現する。終了辺は成立したままである
        await Deno.writeTextFile(filePath, _PASTE_BROKEN_EXCERPT_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        // 書き込み経路へ入らないため、差し替え後の内容がそのまま残り退避も作られない
        assertEquals(await Deno.readTextFile(filePath), _PASTE_BROKEN_EXCERPT_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-06-06: 終了辺がマーカー行でなくなると StaleDecision を返し本体を書き換えない', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 開始辺（`## Excerpt`）は成立したままで、終了辺だけが不成立になる
        await Deno.writeTextFile(filePath, _PASTE_BROKEN_MARKER_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_BROKEN_MARKER_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-06-07: removalKind が none の判定では StaleDecision を返し本体を書き換えない', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 除去範囲は内容と整合したまま種別だけを差し替える。種別の分岐が無ければ strip が通ってしまう
        const _noneDecision = _withRemovalKind(decision, STRIP_REMOVAL_KINDS.NONE);

        const error = await writeStripped(filePath, _noneDecision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_SOURCE);
        assertFalse(await fileExists(bakPath));
      });
    });

    /** 除去種別によらない共通検証が、種別ごとのアンカーより先に成立するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-STW-06-08: paste 判定でも frontmatter を失うと共通検証が先に StaleDecision を返す', async () => {
        const { filePath, decision } = await _setupPasteFixture();
        await Deno.writeTextFile(filePath, _PASTE_NO_FRONTMATTER_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        // アンカー不整合（`removal range does not match content`）ではなく frontmatter 欠落で落ちる
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assert(error.message.includes('frontmatter missing'));
      });

      // **共通の順序検査 `_end < _start` を単独では固定しない。** 範囲を逆転させると
      // `lines[start - 1]` = `lines[11]` は空行であり `## Excerpt` でないため、paste の開始辺が
      // 先に不成立になる。順序検査の単独検証は `T-FL-STW-07-01` が担う。
      // 本ケースは「逆転した範囲が書き込みへ進まない」回帰テストとして有効なため残す
      it('[Edge] T-FL-STW-06-09: paste 判定でも除去範囲の順序が逆転すると StaleDecision を返す', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 種別は `paste` のまま、範囲の順序だけを逆転させる
        const _reversed = _withRemovalRange(decision, _PASTE_REMOVAL_END, _PASTE_REMOVAL_START);

        const error = await writeStripped(filePath, _reversed, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_SOURCE);
        assertFalse(await fileExists(bakPath));
      });
    });
  });

  /**
   * splice 直前ガードを構成する各項を、**他の項を成立させたまま 1 項だけ壊して**検証する。
   *
   * ガードは `_end < _start || !_ANCHOR_CHECKS[_kind](...)` の形であり、各項は OR / AND で
   * 束ねられているため、複数項が同時に壊れる fixture では「どの項が弾いたか」を特定できない。
   * 既存の `T-FL-STW-05-02` / `T-FL-STW-06-09` がこれに当たり、意図した項より先に別の項が
   * 不成立になるため、当該項を削除しても緑のまま通過してしまう（実行可能な変異ハーネスで実測済み）。
   *
   * ここでは次の各項を単独で固定する。
   *
   * - 共通の順序検査 `_end < _start`（`T-FL-STW-07-01`。下限側は `T-FL-STW-07-06` が `start === end` で固定）
   * - `head` アンカーの開始辺 `start === fmLines` の**両方向**（`start < fmLines` は `T-FL-STW-07-02`、
   *   `start > fmLines` は `T-FL-STW-07-09`。等値を包含へ弱める変異は後者だけが検出できる）
   * - `paste` アンカーの開始辺 `lines[start - 1] === '## Excerpt'` の**位置依存性**（`T-FL-STW-07-03`）
   * - `paste` アンカーの終了辺 `isPasteMarkerLine(lines[end])` の**位置依存性**（`T-FL-STW-07-04`）
   * - `none` が恒偽であること（`T-FL-STW-07-05`。`head` 整合な範囲で固定する）
   * - 境界寸法の除去範囲がガードを通過すること（`T-FL-STW-07-06` / `T-FL-STW-07-07`）
   * - 範囲外 index でも throw せず不整合として扱うこと（`T-FL-STW-07-08`）
   *
   * 位置依存性を固定する 2 ケース（`07-03` / `07-04`）は、目印がファイル内に**残っている**まま
   * 位置だけがずれる組を渡し、**paste のもう一方の辺は成立させたままにする**
   * （`07-03` は終了辺を、`07-04` は開始辺を成立させる）。そのため、崩した側の辺を包含チェック
   * （`lines.includes(...)` / `lines.some(...)`）へ弱める変異を片側ずつ検出できる。既存の
   * `T-FL-STW-06-05` / `T-FL-STW-06-06`（目印そのものを壊す）ではこの弱化を検出できない。
   *
   * `head` の終了辺は `lines[end + 1] === '## Summary'` を要求するため、`end < lines.length - 1` は
   * 常に含意される。したがって paste 側の `T-FL-STW-07-07`（除去終了行が最終 index でも通過する）に
   * 対応する head 側のケースは**原理的に書けない**。終了辺へ `&& end < lines.length - 1` を足す変異は
   * 等価変異であり、テストが足りないのではなく kill 不能である（実行可能な変異ハーネスで実測済み）。
   */
  describe('ガードの各項の単独検証', () => {
    /** ガードの各項が成立する最小寸法の除去範囲が、書き込みまで通過するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-STW-07-06: 除去範囲が 1 行（start === end）でもガードを通過し当該行だけを除去する', async () => {
        const { filePath, bakPath } = await _setup('paste-tight.md', _PASTE_TIGHT_WRAPPER_SOURCE);
        const decision = await _classifyFresh(filePath);
        // 1 行範囲の `paste` 判定であることが本ケースの前提。別の範囲が返るなら意図を検証できていない
        assertEquals(decision.removalKind, STRIP_REMOVAL_KINDS.PASTE);
        assertEquals(decision.removalStartLine, _PASTE_TIGHT_REMOVAL_LINE);
        assertEquals(decision.removalEndLine, decision.removalStartLine);

        const error = await writeStripped(filePath, decision, cache);

        // 共通の順序検査を `_end <= _start` へ緩めると、この最小寸法だけが書き込みを失う
        assertEquals(error, undefined);
        assertEquals(await Deno.readTextFile(filePath), _PASTE_TIGHT_STRIPPED_EXPECTED);
        assertEquals(await Deno.readTextFile(bakPath), _PASTE_TIGHT_WRAPPER_SOURCE);
      });

      it('[Normal] T-FL-STW-07-07: 除去終了行が行配列の最終 index でもガードを通過し末尾まで除去する', async () => {
        const { filePath, bakPath } = await _setup('paste-tail.md', _PASTE_TAIL_MARKER_SOURCE);
        // 素の判定は R-007（除去後の本文が空）で error になり範囲・種別が `-1` / `none` へ潰れるため、
        // 範囲と種別の両方を差し替えて「最終 index が除去終了行」の判定を組み立てる
        const _tailDecision = _withRemovalKind(
          _withRemovalRange(await _classifyFresh(filePath), _PASTE_REMOVAL_START, _PASTE_REMOVAL_END),
          STRIP_REMOVAL_KINDS.PASTE,
        );

        const error = await writeStripped(filePath, _tailDecision, cache);

        // 終了辺へ `end < lines.length - 1` を足すと、末尾で終わる前置き区間だけが除去されなくなる
        assertEquals(error, undefined);
        assertEquals(await Deno.readTextFile(filePath), _PASTE_TAIL_STRIPPED_EXPECTED);
        assertEquals(await Deno.readTextFile(bakPath), _PASTE_TAIL_MARKER_SOURCE);
      });
    });

    /** ガードの 1 項だけが不成立となり、その項だけが書き込みを差し止めるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-STW-07-01: 両アンカー成立のまま除去範囲が逆転すると StaleDecision を返し何も記録しない', async () => {
        const { filePath, bakPath } = await _setup('paste-early-marker.md', _PASTE_EARLY_MARKER_SOURCE);
        // 種別・アンカーはそのままに、終了行だけを `## Excerpt` より前のマーカー行（index 8）へ倒す。
        // `lines[10]` = `## Excerpt` / `lines[8]` = 貼り付けマーカーなので paste の両辺は成立し続け、
        // 共通の順序検査だけが `end(8) < start(11)` を弾く（判定がこの組を返すことはない）
        const _reversed = _withRemovalRange(
          await _classifyFresh(filePath),
          _PASTE_REMOVAL_START,
          _EARLY_PASTE_MARKER_LINE,
        );

        const error = await writeStripped(filePath, _reversed, cache);

        // 順序検査が無いと `splice(11, -2)` の deleteCount が 0 にクランプされ、本体は byte-identical に
        // 書き戻されたうえで `.bak` が作られ `stripped` が記録される。以後 R-004 が永久に done を返し、
        // 一度も strip されていないファイルが strip 済みとして扱われる。その 3 点をまとめて固定する
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_EARLY_MARKER_SOURCE);
        assertFalse(await fileExists(bakPath));
        assertEquals(cache.read(filePath).status, undefined);
      });

      it('[Error] T-FL-STW-07-02: 終了辺が成立したまま frontmatter 行数だけが食い違うと StaleDecision を返す', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);
        // frontmatter を 1 行増やし本文を 1 行減らした内容へ差し替える。`## Summary` の絶対 index は
        // `11` のままなので `head` の終了辺は成立し続け、開始辺 `start === fmLines` だけが 5 === 6 で崩れる
        await Deno.writeTextFile(filePath, _FRONTMATTER_SHIFTED_SOURCE);

        const error = await writeStripped(filePath, decision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        // 開始辺が無いと `splice(5, 6)` が frontmatter の閉じ `---` ごと 6 行を削るため、
        // 差し替え後の内容がそのまま残ることまで固定する
        assertEquals(await Deno.readTextFile(filePath), _FRONTMATTER_SHIFTED_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-07-03: `## Excerpt` が残っていても開始辺の位置がずれると StaleDecision を返す', async () => {
        const { filePath, bakPath } = await _setup('paste-early-marker.md', _PASTE_EARLY_MARKER_SOURCE);
        // 種別は `paste` のままに、開始行だけを `## Excerpt` より前のマーカー行の次（index 9）へずらす。
        // `lines[end]` = `lines[12]` は貼り付けマーカーなので**終了辺は成立**し、順序検査も `12 < 9` が
        // false で通る。`## Excerpt` は index 10 に**残っている**が、`lines[start - 1]` = `lines[8]` は
        // `## Excerpt` より前のマーカー行なので、崩れるのは開始辺だけである
        const _shifted = _withRemovalRange(
          await _classifyFresh(filePath),
          _EARLY_MARKER_SHIFTED_START,
          _PASTE_REMOVAL_END,
        );

        const error = await writeStripped(filePath, _shifted, cache);

        // 開始辺を位置非依存な包含チェック（`lines.includes('## Excerpt')`）へ弱めるとこの組を弾けず、
        // `splice(9, 4)` が `## Excerpt` 見出しごと 4 行を消したうえで退避と `stripped` 記録を残す
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_EARLY_MARKER_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-07-04: 開始辺が成立したまま終了辺がマーカー行でないと StaleDecision を返す', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 開始辺 `lines[10] === '## Excerpt'` は成立し、共通の順序検査も `11 < 11` が false で通る。
        // マーカーは index 12 に**残っている**が、`lines[end]` = `lines[11]` は空行なので終了辺だけが崩れる
        const _markerless = _withRemovalRange(decision, _PASTE_REMOVAL_START, _PASTE_REMOVAL_START);

        const error = await writeStripped(filePath, _markerless, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-07-05: head 整合な範囲のまま種別が none だと StaleDecision を返す', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        // 範囲（`start = 5` / `end = 10`）は head の両辺を満たしたまま、種別だけを `none` へ倒す。
        // `none` を `head` と同じ条件へ置き換える変異は、paste 整合な範囲を使う `T-FL-STW-06-07` では
        // 生き残る（`start = 11` が `fmLines = 5` と一致しないため）。head 整合な範囲で恒偽を固定する
        const _noneDecision = _withRemovalKind(await _classifyFresh(filePath), STRIP_REMOVAL_KINDS.NONE);

        const error = await writeStripped(filePath, _noneDecision, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
        assertFalse(await fileExists(bakPath));
      });

      it('[Error] T-FL-STW-07-09: 終了辺が成立したまま除去開始行が frontmatter 行数を超えると StaleDecision を返す', async () => {
        const { filePath, bakPath } = await _setup('sample.md', _STRIPPED_SOURCE);
        const decision = await _classifyFresh(filePath);
        // 素の判定が head アンカーの両辺を満たす（`start === fmLines` / `lines[end + 1] === '## Summary'`）
        // ことが本ケースの前提。ここが崩れていると「開始辺だけを崩した」ことを検証できていない
        assertEquals(decision.removalKind, STRIP_REMOVAL_KINDS.HEAD);
        assertEquals(decision.removalStartLine, _STRIPPED_FRONTMATTER_LINES);
        assertEquals(decision.removalEndLine, _HEAD_REMOVAL_END);
        // 内容は差し替えず、除去開始行だけを `fmLines + 1` へずらす。終了行は据え置くため
        // `lines[end + 1]` = `lines[11]` は `## Summary` のままで終了辺は成立し、
        // 順序検査も `end(10) < start(6)` が false で通る。崩れるのは開始辺だけである
        const _shifted = _withRemovalRange(decision, _HEAD_SHIFTED_START, _HEAD_REMOVAL_END);

        const error = await writeStripped(filePath, _shifted, cache);

        // 開始辺を `start >= fmLines` へ弱めるとこの組を弾けず、`splice(6, 5)` が定型部マーカーごと
        // 5 行を消したうえで退避と `stripped` 記録を残す。`T-FL-STW-07-02` は `start < fmLines` 側しか
        // 踏まないため、この方向の弱化を検出できない（実測: 弱化変異で本ケースのみが RED）
        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _STRIPPED_SOURCE);
        assertFalse(await fileExists(bakPath));
      });
    });

    /**
     * 除去範囲が行配列の範囲外を指すケース。
     *
     * paste の終了辺は `lines[end]` を読むため、`end` が範囲外だと `undefined` になる。
     * `?? ''` でこれを空文字へ丸め、範囲外をそのまま不整合として扱うことを固定する
     * （範囲外の比較が `undefined` になるのは実装側の意図である）。
     * head 側の同等ケースは `T-FL-STW-05-05` が担い、本ブロックはその paste 側の対称形である。
     */
    describe('When: エッジケース', () => {
      // **`?? ''` の削除変異だけは kill できない。** `noUncheckedIndexedAccess` が off のため型検査を
      // 通過し、実行時も `RegExp.prototype.test(undefined)` が `undefined` を `'undefined'` へ
      // 文字列化して `false` を返すため、結果は `StaleDecision` のまま変わらない。
      // 一方で paste アンカーそのものへの変異は kill する（実測: 両辺の包含チェック化・終了辺の
      // 包含チェック化・終了辺の削除の 3 件）。`?? ''` は範囲外を不整合として扱う意図の表明であり、
      // 本ケースは `T-FL-STW-05-05` と対称な回帰テスト兼ドキュメントとして置く
      it('[Edge] T-FL-STW-07-08: paste の終了辺が配列範囲外を指しても throw せず StaleDecision を返す', async () => {
        const { filePath, bakPath, decision } = await _setupPasteFixture();
        // 総行数 16（有効 index 0〜15）に対し `end` = 999 は範囲外であり `lines[end]` は `undefined` になる
        const _outOfRange = _withRemovalRange(decision, _PASTE_REMOVAL_START, 999);

        const error = await writeStripped(filePath, _outOfRange, cache);

        assert(error instanceof ChatlogError);
        assertEquals(error.subindex, 'StaleDecision');
        assertEquals(await Deno.readTextFile(filePath), _PASTE_SOURCE);
        assertFalse(await fileExists(bakPath));
      });
    });
  });
});
