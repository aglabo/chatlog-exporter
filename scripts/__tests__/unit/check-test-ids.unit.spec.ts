// src: scripts/__tests__/unit/check-test-ids.unit.spec.ts
// @(#): check-test-ids のユニットテスト（テスト ID 重複検査そのものの検査）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import {
  collectSpecSources,
  extractLiteralIds,
  extractTableIds,
  findDuplicateIds,
} from '../../check-test-ids.ts';

// ─────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────

// constants
/**
 * fixture が使う合成テスト ID。
 *
 * ここで **1 回だけ** リテラルとして宣言し、以降はテンプレートへ補間して使う。
 * fixture のソース断片に `'T-...'` を直書きすると、本ファイル自身が
 * `collectSpecSources` の走査対象（`*.spec.ts`）であるため、同じ ID が
 * 2 回出現して「リポジトリ全体で重複 0 件」の断言が自分の fixture で落ちる。
 */
const _ID_TABLE_ONLY_DUP = 'T-ZZ-TBL-41';
/** literal 同士の重複を再現する合成 ID。 */
const _ID_LITERAL_DUP = 'T-ZZ-LIT-42';
/** 同一ファイル内で 2 回割り当てる合成 ID。 */
const _ID_SAME_FILE_DUP = 'T-ZZ-SMF-43';
/** 重複しない合成 ID（対照）。 */
const _ID_UNIQUE_A = 'T-ZZ-UNQ-44';
/** 重複しない合成 ID（対照）。 */
const _ID_UNIQUE_B = 'T-ZZ-UNQ-45';
/** 説明文なしで `it` に渡す合成 ID（2 系統に同時に乗る境界値）。 */
const _ID_BARE_IT = 'T-ZZ-BAR-46';
/** JSDoc からの相互参照にのみ現れる合成 ID。 */
const _ID_JSDOC_ONLY = 'T-ZZ-DOC-47';
/** prefix 付きの連結トークンを再現する合成 ID。 */
const _ID_CONCAT_TOKEN = 'T-ZZ-CT-01-01';

// functions
/** `it` ラベルに ID を literal で書いたソース断片を組み立てる。 */
const _litSource = (id: string): string => `it('${id}: 何かを検証する', () => {});`;

/** テーブル駆動の `_cases` に ID を書いたソース断片を組み立てる。 */
const _tableSource = (id: string): string =>
  [
    'const _cases = [',
    `  { id: '${id}', label: '何かのケース' },`,
    '];',
    'for (const tc of _cases) {',
    '  it(`${tc.id}: ${tc.label}`, () => {});',
    '}',
  ].join('\n');

// ─────────────────────────────────────────────
// extractLiteralIds
// ─────────────────────────────────────────────

/**
 * `extractLiteralIds` は `it(` 以降に literal で書かれたテスト ID を抽出する。
 *
 * `grep -rhoE 'it[(].*' | tr -c 'A-Za-z0-9-' '\n' | grep -xE '<ID>'` と同じ意味を持つ。
 *
 * テスト ID 範囲: T-CTI-EL-01 〜 T-CTI-EL-05
 *
 * @see extractLiteralIds
 */
describe('extractLiteralIds', () => {
  describe('When: 正常系', () => {
    it('T-CTI-EL-01-01: it ラベルの literal ID を抽出する', () => {
      assertEquals(extractLiteralIds(_litSource(_ID_UNIQUE_A)), [_ID_UNIQUE_A]);
    });
  });

  describe('When: エッジケース', () => {
    it('T-CTI-EL-02-01: it( を含まない行の ID は抽出しない（JSDoc の相互参照）', () => {
      const _source = ` * 基本構造は ${_ID_JSDOC_ONLY} を参照する。`;
      assertEquals(extractLiteralIds(_source), []);
    });

    it('T-CTI-EL-03-01: it( より前に現れる ID は抽出しない', () => {
      const _source = `// ${_ID_JSDOC_ONLY} 参照\n`
        + `const x = 1; /* ${_ID_JSDOC_ONLY} */ it('${_ID_UNIQUE_A}: x', () => {});`;
      assertEquals(extractLiteralIds(_source), [_ID_UNIQUE_A]);
    });

    it('T-CTI-EL-05-01: テーブル駆動のソースからは 1 件も抽出しない', () => {
      // この系統だけで検査するとテーブル駆動テストの ID が丸ごと見逃されることを固定する
      assertEquals(extractLiteralIds(_tableSource(_ID_UNIQUE_B)), []);
    });

    it('T-CTI-EL-04-01: prefix 付き ID の内部一致を prefix-less ID と誤認しない', () => {
      // トークン全体で照合しないと、連結トークンの内部に含まれる prefix-less ID を拾ってしまう
      const _source = `it('${_ID_CONCAT_TOKEN}: 連結トークン', () => {});`;
      assertEquals(extractLiteralIds(_source), [_ID_CONCAT_TOKEN]);
    });
  });
});

// ─────────────────────────────────────────────
// extractTableIds
// ─────────────────────────────────────────────

/**
 * `extractTableIds` はテーブル・対応表にシングルクォートで書かれたテスト ID を抽出する。
 *
 * `it(` の外側にあり変数展開されるため `extractLiteralIds` では拾えない系統を担う。
 *
 * テスト ID 範囲: T-CTI-ET-01 〜 T-CTI-ET-02
 *
 * @see extractTableIds
 */
describe('extractTableIds', () => {
  describe('When: 正常系', () => {
    it('T-CTI-ET-01-01: _cases の id に書かれた ID を抽出する', () => {
      assertEquals(extractTableIds(_tableSource(_ID_UNIQUE_A)), [_ID_UNIQUE_A]);
    });
  });

  describe('When: エッジケース', () => {
    it('T-CTI-ET-02-01: 説明文が続く it ラベルは抽出しない（閉じクォートが ID 直後にない）', () => {
      assertEquals(extractTableIds(_litSource(_ID_UNIQUE_A)), []);
    });
  });
});

// ─────────────────────────────────────────────
// findDuplicateIds
// ─────────────────────────────────────────────

/**
 * `findDuplicateIds` は 2 系統の抽出結果を突き合わせ、2 回以上割り当てられた ID を報告する。
 *
 * ここに置く fixture は、検査の判別力を **恒久的に** 固定するための境界値である。
 * 実装を旧方式（literal 系統のみ）へ戻すと T-CTI-FD-01-01 が落ちる。
 *
 * テスト ID 範囲: T-CTI-FD-01 〜 T-CTI-FD-05
 *
 * @see findDuplicateIds
 */
describe('findDuplicateIds', () => {
  describe('When: 異常系', () => {
    it('T-CTI-FD-01-01: 表経由でだけ見える重複を検出する（literal 系統のみでは見逃す）', () => {
      const _sources = [_litSource(_ID_TABLE_ONLY_DUP), _tableSource(_ID_TABLE_ONLY_DUP)];
      assertEquals(findDuplicateIds(_sources), [_ID_TABLE_ONLY_DUP]);
    });

    it('T-CTI-FD-02-01: literal 同士の重複を検出する', () => {
      const _sources = [_litSource(_ID_LITERAL_DUP), _litSource(_ID_LITERAL_DUP)];
      assertEquals(findDuplicateIds(_sources), [_ID_LITERAL_DUP]);
    });

    it('T-CTI-FD-03-01: 同一ファイル内で 2 回割り当てた重複を検出する', () => {
      const _source = `${_litSource(_ID_SAME_FILE_DUP)}\n${_litSource(_ID_SAME_FILE_DUP)}`;
      assertEquals(findDuplicateIds([_source]), [_ID_SAME_FILE_DUP]);
    });
  });

  describe('When: 正常系', () => {
    it('T-CTI-FD-04-01: 重複がなければ空配列を返す', () => {
      const _sources = [_litSource(_ID_UNIQUE_A), _tableSource(_ID_UNIQUE_B)];
      assertEquals(findDuplicateIds(_sources), []);
    });
  });

  describe('When: エッジケース', () => {
    it('T-CTI-FD-05-01: 説明文なしの it ラベルは 2 系統に同時に乗っても重複としない', () => {
      // it('T-XX-01') は literal 系統とテーブル系統の両方が同じ位置を拾う。
      // 出現位置で重複排除しないと、割り当て 1 件が 2 件に数えられて誤検出になる。
      const _source = `it('${_ID_BARE_IT}', () => {});`;
      assertEquals(findDuplicateIds([_source]), []);
    });
  });
});

// ─────────────────────────────────────────────
// リポジトリ全体ガード
// ─────────────────────────────────────────────

/**
 * リポジトリ内の全 `*.spec.ts` を走査し、テスト ID の重複が 0 件であることを保証する。
 *
 * `docs/rules/testing-conventions.md` 4-3 の手動コマンドを自動化したもの。
 * 重複した ID を追加すると本ケースが落ちる。
 *
 * テスト ID 範囲: T-CTI-RP-01
 *
 * @see collectSpecSources
 * @see findDuplicateIds
 */
describe('リポジトリ全体のテスト ID', () => {
  describe('When: 正常系', () => {
    it('T-CTI-RP-01-01: 全 *.spec.ts を通してテスト ID の重複が 0 件である', async () => {
      const _specs = await collectSpecSources(Deno.cwd());
      const _duplicates = findDuplicateIds(_specs.map((s) => s.source));

      assertEquals(
        _duplicates,
        [],
        `テスト ID が重複している: ${_duplicates.join(', ')}\n`
          + `割り当て箇所は grep -rn "<ID>" --include=*.spec.ts . で特定する`,
      );
    });

    it('T-CTI-RP-01-02: 走査結果が空でない（パイプラインが壊れていない）', async () => {
      const _specs = await collectSpecSources(Deno.cwd());
      assertEquals(_specs.length > 0, true, '*.spec.ts が 1 件も収集できていない');
    });
  });
});
