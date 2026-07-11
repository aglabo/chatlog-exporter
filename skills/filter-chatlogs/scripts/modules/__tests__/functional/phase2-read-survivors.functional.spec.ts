// src: scripts/modules/__tests__/functional/phase2-read-survivors.functional.spec.ts
// @(#): _phase2ReadSurvivors の機能テスト
//       実 tempdir を使用した本文読み込み・振り分けの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase2ReadSurvivors } from '../../prefilter.ts';

// ─── Helpers
import { makePeriodDir, makeRepeatedContent } from '../../../__tests__/_helpers/fixtures.ts';
// constants
import { FILTER_MIN_CONTENT_LENGTH } from '../../../__tests__/_helpers/constants.ts';
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';

// ─── Tests

/**
 * `_phase2ReadSurvivors` 関数の機能テストスイート。
 *
 * ファイル名パターンを通過したファイルパス配列を受け取り、本文を並列に読み込んで
 * frontmatter を除いた content を取り出す。読み込みに失敗したファイルは `filePath` を
 * `readError` に振り分ける。
 *
 * テスト ID 範囲: T-FL-P2-01 〜 T-FL-P2-09
 *
 * @see _phase2ReadSurvivors
 */
describe('_phase2ReadSurvivors', () => {
  /** テスト用一時ディレクトリのパス。各テスト後に削除する。 */
  let tempDir: string;

  /** チャットログファイルを配置する月別ディレクトリのパス。 */
  let periodDir1: string;

  beforeEach(async () => {
    ({ tempDir, periodDir1 } = await makePeriodDir());
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 実在する単一ファイルを入力とする前提条件グループ。
   *
   * 本文（frontmatter を除いた content）が読み込まれ、`readOk` に含まれることを検証する。
   */
  describe('Given: 実在する単一ファイル', () => {
    /** _phase2ReadSurvivors([filePath]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([filePath]) を呼び出す', () => {
      /** readOk に本文情報が含まれ、readError が空になることを検証する。 */
      describe('Then: T-FL-P2-01 - readOk に本文情報が含まれる', () => {
        it('T-FL-P2-01-01: readOk[0] に filePath/filename/content が含まれ readError は空になる', async () => {
          const filePath = `${periodDir1}/valid.md`;
          await Deno.writeTextFile(filePath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));

          const { readOk, readError } = await _phase2ReadSurvivors([filePath]);

          assertEquals(readOk.length, 1);
          assertEquals(readOk[0].filePath, filePath);
          assertEquals(readOk[0].filename, 'valid.md');
          assertEquals(readOk[0].content.includes('title:'), false);
          assertEquals(readError, []);
        });
      });
    });
  });

  /**
   * 実在する複数ファイルを入力とする前提条件グループ。
   *
   * 全件が `readOk` に含まれ、`readError` が空になることを検証する。
   */
  describe('Given: 実在する複数ファイル', () => {
    /** _phase2ReadSurvivors([file1, file2]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([file1, file2]) を呼び出す', () => {
      /** readOk に 2 件とも含まれ、readError は空になることを検証する。 */
      describe('Then: T-FL-P2-02 - readOk に全件含まれる', () => {
        it('T-FL-P2-02-01: readOk.length === 2 かつ readError は空', async () => {
          const filePath1 = `${periodDir1}/valid1.md`;
          const filePath2 = `${periodDir1}/valid2.md`;
          await Deno.writeTextFile(filePath1, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(filePath2, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));

          const { readOk, readError } = await _phase2ReadSurvivors([filePath1, filePath2]);

          assertEquals(readOk.length, 2);
          assertEquals(readError, []);
        });
      });
    });
  });

  /**
   * 存在しないファイルを cache 未指定で処理する前提条件グループ。
   *
   * 読み込み失敗時、例外を投げず `filePath` が `readError` に振り分けられることを検証する。
   */
  describe('Given: 存在しないファイル', () => {
    /** _phase2ReadSurvivors([filePath]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([filePath]) を呼び出す', () => {
      /** readOk が空になり、readError に filePath が含まれることを検証する。 */
      describe('Then: T-FL-P2-03 - readError に DiscardFile が含まれる', () => {
        it('T-FL-P2-03-01: readOk は空、readError[0] が filePath/filename/reason/decision を持つ', async () => {
          const filePath = `${periodDir1}/missing.md`;

          const { readOk, readError } = await _phase2ReadSurvivors([filePath]);

          assertEquals(readOk, []);
          assertEquals(readError, [
            { filePath, filename: 'missing.md', reason: '読み込み失敗', decision: FILTER_DECISIONS.ERROR },
          ]);
        });
      });
    });
  });

  /**
   * 正常ファイル 1 件と読み込み失敗ファイル 1 件が混在する前提条件グループ。
   *
   * 正常分のみ readOk に、失敗分のみ readError に振り分けられることを検証する。
   */
  describe('Given: 正常ファイル1件と読み込み失敗ファイル1件が混在するファイルリスト', () => {
    /** _phase2ReadSurvivors([validPath, missingPath]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([validPath, missingPath]) を呼び出す', () => {
      /** readOk・readError がそれぞれ正しく振り分けられることを検証する。 */
      describe('Then: T-FL-P2-05 - 正常分と失敗分が振り分けられる', () => {
        it('T-FL-P2-05-01: readOk に正常分のみ、readError に失敗分のみが含まれる', async () => {
          const validPath = `${periodDir1}/mixed-valid.md`;
          const missingPath = `${periodDir1}/mixed-missing.md`;
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));

          const { readOk, readError } = await _phase2ReadSurvivors([validPath, missingPath]);

          assertEquals(readOk.length, 1);
          assertEquals(readOk[0].filePath, validPath);
          assertEquals(readError, [
            {
              filePath: missingPath,
              filename: 'mixed-missing.md',
              reason: '読み込み失敗',
              decision: FILTER_DECISIONS.ERROR,
            },
          ]);
        });
      });
    });
  });

  /**
   * frontmatter の閉じ `---` がない不正フォーマットファイルを cache 未指定で処理する前提条件グループ。
   *
   * `ChatlogEntry` コンストラクタが `ChatlogError('InvalidFormat', 'NotClosed')` を throw しても
   * 例外を伝播させず `readError` に振り分けられることを検証する。
   */
  describe('Given: frontmatterが閉じていない不正フォーマットファイル', () => {
    /** _phase2ReadSurvivors([filePath]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([filePath]) を呼び出す', () => {
      /** readOk が空になり、readError に filePath が含まれることを検証する。 */
      describe('Then: T-FL-P2-07 - readError に DiscardFile が含まれる', () => {
        it('T-FL-P2-07-01: readOk は空、readError[0] が filePath/filename/reason/decision を持つ', async () => {
          const filePath = `${periodDir1}/unclosed-frontmatter.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: test\n本文...');

          const { readOk, readError } = await _phase2ReadSurvivors([filePath]);

          assertEquals(readOk, []);
          assertEquals(readError, [
            {
              filePath,
              filename: 'unclosed-frontmatter.md',
              reason: '読み込み失敗',
              decision: FILTER_DECISIONS.ERROR,
            },
          ]);
        });
      });
    });
  });

  /**
   * 正常ファイル 1 件と不正フォーマットファイル 1 件が混在する前提条件グループ。
   *
   * 正常分のみ readOk に、不正フォーマット分のみ readError に振り分けられることを検証する。
   */
  describe('Given: 正常ファイル1件と不正フォーマットファイル1件が混在するファイルリスト', () => {
    /** _phase2ReadSurvivors([validPath, malformedPath]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([validPath, malformedPath]) を呼び出す', () => {
      /** readOk・readError がそれぞれ正しく振り分けられることを検証する。 */
      describe('Then: T-FL-P2-09 - 正常分と不正フォーマット分が振り分けられる', () => {
        it('T-FL-P2-09-01: readOk に正常分のみ、readError に不正フォーマット分のみが含まれる', async () => {
          const validPath = `${periodDir1}/mixed-valid2.md`;
          const malformedPath = `${periodDir1}/mixed-malformed.md`;
          await Deno.writeTextFile(validPath, makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH));
          await Deno.writeTextFile(malformedPath, '---\ntitle: test\n本文...');

          const { readOk, readError } = await _phase2ReadSurvivors([validPath, malformedPath]);

          assertEquals(readOk.length, 1);
          assertEquals(readOk[0].filePath, validPath);
          assertEquals(readError, [
            {
              filePath: malformedPath,
              filename: 'mixed-malformed.md',
              reason: '読み込み失敗',
              decision: FILTER_DECISIONS.ERROR,
            },
          ]);
        });
      });
    });
  });

  /**
   * 空の survivors 配列を入力とする前提条件グループ。
   *
   * readOk・readError ともに空配列を返すことを検証する。
   */
  describe('Given: survivors が空配列', () => {
    /** _phase2ReadSurvivors([]) を呼び出すとき。 */
    describe('When: _phase2ReadSurvivors([]) を呼び出す', () => {
      /** readOk・readError ともに空配列になることを検証する。 */
      describe('Then: T-FL-P2-06 - readOk・readError ともに空配列を返す', () => {
        it('T-FL-P2-06-01: readOk: [], readError: [] を返す', async () => {
          const { readOk, readError } = await _phase2ReadSurvivors([]);

          assertEquals(readOk, []);
          assertEquals(readError, []);
        });
      });
    });
  });
});
