// src: skills/_scripts/classes/__tests__/unit/ChatlogFrontmatter.unit.spec.ts
// @(#): ChatlogFrontmatter ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// -- test target --
import { ChatlogFrontmatter } from '../../ChatlogFrontmatter.class.ts';
//  error class
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─────────────────────────────────────────────
// ChatlogFrontmatter
// ─────────────────────────────────────────────
/**
 * @description ChatlogFrontmatter クラスのユニットテストスイート。
 * get / set / remove / toFrontmatter および各コンストラクタ入力形式を網羅的に検証する。
 */
describe('ChatlogFrontmatter', () => {
  /**
   * @description get() メソッドのユニットテスト。
   * キーの存在有無・型（string/string[]）に応じた取得動作を検証する。
   */
  describe('get()', () => {
    const _getCases: {
      id: string;
      label: string;
      init: string;
      key: string;
      expected: string | string[] | undefined;
    }[] = [
      {
        id: 'T-CLS-CF-11',
        label: '[正常] 存在するキーの文字列値を返す',
        init: '---\ntitle: "Hello"\n---\n',
        key: 'title',
        expected: 'Hello',
      },
      {
        id: 'T-CLS-CF-12',
        label: '[正常] 存在するキーの配列値を返す',
        init: '---\ntags:\n  - "foo"\n  - "bar"\n---\n',
        key: 'tags',
        expected: ['foo', 'bar'],
      },
      {
        id: 'T-CLS-CF-13',
        label: '[正常] 存在しないキーは undefined を返す',
        init: '---\ntitle: "Hello"\n---\n',
        key: 'missing',
        expected: undefined,
      },
    ];

    for (const tc of _getCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const fm = new ChatlogFrontmatter(tc.init);
        assertEquals(fm.get(tc.key), tc.expected);
      });
    }
  });

  /**
   * @description set() メソッドのユニットテスト。
   * 新規キー追加・既存キー上書き・空値のセットを検証する。
   */
  describe('set()', () => {
    const _setCases: {
      id: string;
      label: string;
      init: string;
      key: string;
      value: string | string[];
      expected: string | string[];
    }[] = [
      {
        id: 'T-CLS-CF-14',
        label: '[正常] 新規キーに文字列をセットできる',
        init: '',
        key: 'title',
        value: 'Hello',
        expected: 'Hello',
      },
      {
        id: 'T-CLS-CF-15',
        label: '[正常] 既存キーを上書きできる',
        init: '---\ntitle: "Old"\n---\n',
        key: 'title',
        value: 'New',
        expected: 'New',
      },
      {
        id: 'T-CLS-CF-16',
        label: '[正常] 新規キーに配列をセットできる',
        init: '',
        key: 'tags',
        value: ['foo', 'bar'],
        expected: ['foo', 'bar'],
      },
      {
        id: 'T-CLS-CF-17',
        label: '[エッジケース] 空文字列をセットできる',
        init: '',
        key: 'title',
        value: '',
        expected: '',
      },
      {
        id: 'T-CLS-CF-18',
        label: '[エッジケース] 空配列をセットできる',
        init: '',
        key: 'tags',
        value: [],
        expected: [],
      },
    ];

    for (const tc of _setCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const fm = new ChatlogFrontmatter(tc.init);
        fm.set(tc.key, tc.value);
        assertEquals(fm.get(tc.key), tc.expected);
      });
    }
  });

  /**
   * @description remove() メソッドのユニットテスト。
   * キー削除と存在しないキーへの呼び出しを検証する。
   */
  describe('remove()', () => {
    const _removeCases: {
      id: string;
      label: string;
      init: string;
      key: string;
    }[] = [
      {
        id: 'T-CLS-CF-19',
        label: '[正常] 存在するキーを削除できる',
        init: '---\ntitle: "Hello"\n---\n',
        key: 'title',
      },
      {
        id: 'T-CLS-CF-20',
        label: '[エッジケース] 存在しないキーへの呼び出しはエラーにならない',
        init: '',
        key: 'missing',
      },
    ];

    for (const tc of _removeCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const fm = new ChatlogFrontmatter(tc.init);
        fm.remove(tc.key);
        assertEquals(fm.get(tc.key), undefined);
      });
    }
  });

  /**
   * @description コンストラクタへの文字列入力（正常系）のユニットテスト。
   * 空文字列・空ブロック・文字列/配列フィールドのパースを検証する。
   */
  describe('コンストラクタ - 文字列入力 正常系', () => {
    const _parseCases: {
      id: string;
      label: string;
      input: string;
      fields: { key: string; expected: string | string[] | undefined }[];
    }[] = [
      {
        id: 'T-CLS-CF-26',
        label: '[正常] 空文字列はエラーにならず entries が空になる',
        input: '',
        fields: [{ key: 'title', expected: undefined }],
      },
      {
        id: 'T-CLS-CF-27',
        label: '[正常] 空の frontmatter ブロックはエラーにならず entries が空になる',
        input: '---\n---\n',
        fields: [{ key: 'title', expected: undefined }],
      },
      {
        id: 'T-CLS-CF-28',
        label: '[正常] 文字列フィールドを含む frontmatter 文字列をパースできる',
        input: '---\ntitle: Hello\n---\n',
        fields: [{ key: 'title', expected: 'Hello' }],
      },
      {
        id: 'T-CLS-CF-29',
        label: '[正常] 配列フィールドを含む frontmatter 文字列をパースできる',
        input: '---\ntitle: Hello\ntags:\n  - a\n  - b\n---\n',
        fields: [{ key: 'title', expected: 'Hello' }, { key: 'tags', expected: ['a', 'b'] }],
      },
    ];

    for (const tc of _parseCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const fm = new ChatlogFrontmatter(tc.input);
        for (const field of tc.fields) {
          assertEquals(fm.get(field.key), field.expected);
        }
      });
    }
  });

  /**
   * @description コンストラクタへの文字列入力（異常系）のユニットテスト。
   * 不正フォーマット・YAML 構文エラーで ChatlogError がスローされることを検証する。
   */
  describe('コンストラクタ - 文字列入力 異常系', () => {
    const _invalidInputCases: { id: string; label: string; input: string; kind: string; subindex: string }[] = [
      {
        id: 'T-CLS-CF-30',
        label: '[異常] "---" で始まらない非空文字列は InvalidFormat',
        input: 'title: Hello',
        kind: 'InvalidFormat',
        subindex: 'Delimiter',
      },
      {
        id: 'T-CLS-CF-31',
        label: '[異常] 閉じ区切り記号のない frontmatter 文字列は InvalidFormat',
        input: '---\ntitle: Hello',
        kind: 'InvalidFormat',
        subindex: 'Delimiter',
      },
      {
        id: 'T-CLS-CF-32',
        label: '[異常] YAML 構文エラーのある frontmatter 文字列は InvalidYaml',
        input: '---\nfoo: : bad\n---\n',
        kind: 'InvalidYaml',
        subindex: 'FrontmatterYaml',
      },
      {
        id: 'T-CLS-CF-33',
        label: '[異常] YAML が配列の frontmatter 文字列は InvalidFormat',
        input: '---\n- a\n- b\n---\n',
        kind: 'InvalidFormat',
        subindex: 'FrontmatterYaml',
      },
      {
        id: 'T-CLS-CF-34',
        label: '[異常] YAML がスカラーの frontmatter 文字列は InvalidFormat',
        input: '---\nhello\n---\n',
        kind: 'InvalidFormat',
        subindex: 'FrontmatterYaml',
      },
      {
        id: 'T-CLS-CF-35',
        label: '[エッジケース] 開き区切り記号のみの文字列は InvalidFormat',
        input: '---\n',
        kind: 'InvalidFormat',
        subindex: 'Delimiter',
      },
      {
        id: 'T-CLS-CF-36',
        label: '[エッジケース] YAML が null の frontmatter 文字列は InvalidFormat',
        input: '---\nnull\n---\n',
        kind: 'InvalidFormat',
        subindex: 'FrontmatterYaml',
      },
    ];

    for (const tc of _invalidInputCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const err = assertThrows(() => new ChatlogFrontmatter(tc.input), ChatlogError);
        assertEquals(err.kind, tc.kind);
        assertEquals(err.subindex, tc.subindex);
      });
    }
  });

  /**
   * @description toFrontmatter() メソッドの異常系ユニットテスト。
   * fieldOrder が空の場合に ChatlogError がスローされることを検証する。
   */
  describe('toFrontmatter() - 異常系', () => {
    it('T-CLS-CF-41: [異常] fieldOrder が空配列のとき InvalidArgs(FieldOrder) をスローする', () => {
      const fm = new ChatlogFrontmatter('');
      const err = assertThrows(() => fm.toFrontmatter([]), ChatlogError);
      assertEquals(err.kind, 'InvalidArgs');
      assertEquals(err.subindex, 'FieldOrder');
    });
  });
});
