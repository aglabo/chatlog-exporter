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
import { divideEntry } from '../../../../../_cle-libs/libs/text/frontmatter-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../../../_cle-libs/classes/ChatlogFrontmatter.class.ts';
// constants
import { STRIP_BOUNDARY_HEADING } from '../../../constants/strip.constants.ts';
import { STRIP_CACHE_STATUSES } from '../../../types/strip-cache-status.const.types.ts';
// types
import type { StripCache } from '../../../types/cache.types.ts';
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

/** `_STRIPPED_SOURCE` の frontmatter へ 1 キー追加した原文。`frontmatterLines` が `5` → `6` になる。 */
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
 * テスト ID 範囲: T-FL-STW-01-01 〜 T-FL-STW-05-07
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
});
