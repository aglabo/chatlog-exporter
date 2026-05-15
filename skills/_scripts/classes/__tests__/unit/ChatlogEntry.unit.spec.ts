// src: skills/_scripts/classes/__tests__/unit/ChatlogEntry.unit.spec.ts
// @(#): ChatlogEntry ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { ChatlogEntry } from '../../ChatlogEntry.class.ts';
// error class
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─────────────────────────────────────────────
// ChatlogEntry
// ─────────────────────────────────────────────

describe('ChatlogEntry', () => {
  /**
   * @description コンストラクタのユニットテスト。
   * frontmatter フィールドのパース・content 抽出・CRLF 正規化・改行正規化を検証する。
   */
  describe('コンストラクタ', () => {
    const _ctorCases: {
      id: string;
      label: string;
      input: string;
      expectedFrontmatter?: Record<string, string | string[] | undefined>;
      expectedContent?: string;
    }[] = [
      {
        id: 'T-CLS-CE-01',
        label: 'frontmatter フィールドのパース',
        input: '---\ntitle: Hello\ncategory: dev\n---\nbody text\n',
        expectedFrontmatter: { title: 'Hello', category: 'dev' },
      },
      {
        id: 'T-CLS-CE-02',
        label: 'content に本文のみが格納される',
        input: '---\ntitle: Hello\n---\nbody text\n',
        expectedContent: 'body text\n',
      },
      {
        id: 'T-CLS-CE-03',
        label: 'frontmatter なし入力',
        input: 'plain text without frontmatter',
        expectedFrontmatter: { title: undefined },
        expectedContent: 'plain text without frontmatter\n',
      },
      {
        id: 'T-CLS-CE-04',
        label: '空文字列入力',
        input: '',
        expectedFrontmatter: { title: undefined },
        expectedContent: '',
      },
      {
        id: 'T-CLS-CE-05',
        label: 'CRLF 改行の正規化',
        input: '---\r\ntitle: Hello\r\n---\r\nbody text\r\n',
        expectedFrontmatter: { title: 'Hello' },
        expectedContent: 'body text\n',
      },
      {
        id: 'T-CLS-CE-10',
        label: '配列フィールドのパース',
        input: '---\ntags:\n  - foo\n  - bar\n---\nbody',
        expectedFrontmatter: { tags: ['foo', 'bar'] },
      },
      {
        id: 'T-CLS-CE-11',
        label: '数値フィールドが文字列に変換される',
        input: '---\ncount: 42\n---\nbody',
        expectedFrontmatter: { count: '42' },
      },
      {
        id: 'T-CLS-CE-12',
        label: 'Date フィールドが YYYY-MM-DD 文字列に変換される',
        input: '---\ndate: 2026-03-15\n---\nbody',
        expectedFrontmatter: { date: '2026-03-15' },
      },
      {
        id: 'T-CLS-CE-15',
        label: 'null 混入配列の null 要素が空文字列に変換される',
        input: '---\ntags:\n  - foo\n  - ~\n  - bar\n---\nbody',
        expectedFrontmatter: { tags: ['foo', '', 'bar'] },
      },
      {
        id: 'T-CLS-CE-16',
        label: '先頭複数改行の削除',
        input: '---\ntitle: T\n---\n\n\nbody\n',
        expectedContent: 'body\n',
      },
      {
        id: 'T-CLS-CE-17',
        label: '末尾複数改行の正規化',
        input: '---\ntitle: T\n---\nbody\n\n\n',
        expectedContent: 'body\n',
      },
      {
        id: 'T-CLS-CE-18',
        label: '改行のみの本文は空文字列に正規化される',
        input: '---\ntitle: T\n---\n\n\n',
        expectedContent: '',
      },
      {
        id: 'T-CLS-CE-19',
        label: '本文中空行の保持',
        input: '---\ntitle: T\n---\nline1\n\nline2\n',
        expectedContent: 'line1\n\nline2\n',
      },
      {
        id: 'T-CLS-CE-20',
        label: '末尾改行なし入力への \\n 付与',
        input: '---\ntitle: T\n---\nbody',
        expectedContent: 'body\n',
      },
    ];

    for (const tc of _ctorCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const entry = new ChatlogEntry(tc.input);
        if (tc.expectedFrontmatter) {
          for (const [k, v] of Object.entries(tc.expectedFrontmatter)) {
            assertEquals(entry.frontmatter.get(k), v);
          }
        }
        if (tc.expectedContent !== undefined) {
          assertEquals(entry.content, tc.expectedContent);
        }
      });
    }
  });

  /**
   * @description renderEntry() のユニットテスト。
   * 標準出力形式・body 空・fieldOrder 指定・改行正規化後の出力を検証する。
   */
  describe('renderEntry()', () => {
    const _renderCases: {
      id: string;
      label: string;
      input: string;
      fieldOrder: string[];
      expected: string;
    }[] = [
      {
        id: 'T-CLS-CE-06',
        label: 'renderEntry() の基本出力形式',
        input: '---\ntitle: Hello\n---\nbody text\n',
        fieldOrder: ['title'],
        expected: '---\ntitle: "Hello"\n---\n\nbody text\n',
      },
      {
        id: 'T-CLS-CE-07',
        label: 'body が空の場合の renderEntry() 出力',
        input: '---\ntitle: Hello\n---\n',
        fieldOrder: ['title'],
        expected: '---\ntitle: "Hello"\n---\n',
      },
      {
        id: 'T-CLS-CE-09',
        label: 'fieldOrder 指定が renderEntry() に反映される',
        input: '---\ntitle: Hello\ncategory: dev\n---\nbody\n',
        fieldOrder: ['title'],
        expected: '---\ntitle: "Hello"\n---\n\nbody\n',
      },
      {
        id: 'T-CLS-CE-21',
        label: '先頭複数改行入力でも renderEntry() の出力は標準形',
        input: '---\ntitle: T\n---\n\n\n\nbody\n',
        fieldOrder: ['title'],
        expected: '---\ntitle: "T"\n---\n\nbody\n',
      },
      {
        id: 'T-CLS-CE-22',
        label: '末尾余剰改行入力でも renderEntry() の末尾は単一 \\n',
        input: '---\ntitle: T\n---\nbody\n\n\n',
        fieldOrder: ['title'],
        expected: '---\ntitle: "T"\n---\n\nbody\n',
      },
    ];

    for (const tc of _renderCases) {
      it(`${tc.id}: ${tc.label}`, () => {
        const entry = new ChatlogEntry(tc.input);
        assertEquals(entry.renderEntry(tc.fieldOrder), tc.expected);
      });
    }
  });

  /**
   * @description frontmatter 変更後の renderEntry() のユニットテスト。
   * set() による変更が renderEntry() 出力に反映されることを検証する。
   */
  describe('frontmatter 変更後の renderEntry()', () => {
    it('T-CLS-CE-08: frontmatter 変更が renderEntry() に反映される', () => {
      const entry = new ChatlogEntry('---\ntitle: Old\n---\nbody\n');
      entry.frontmatter.set('title', 'New');
      assertEquals(entry.renderEntry(['title']), '---\ntitle: "New"\n---\n\nbody\n');
    });
  });

  /**
   * @description コンストラクタ 異常系のユニットテスト。
   * 不正な frontmatter 入力で ChatlogError をスローすることを検証する。
   */
  describe('コンストラクタ 異常系', () => {
    it(`T-CLS-CE-13: 閉じ --- なし入力では InvalidFormat を throw し subindex が NotClosed になる`, () => {
      const _err = assertThrows(
        () => new ChatlogEntry('---\ntitle: Hello\nno closing separator'),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'InvalidFormat');
      assertEquals(_err.subindex, 'NotClosed');
    });

    it(`T-CLS-CE-14: YAML パース失敗時は InvalidYaml を throw する`, () => {
      const err = assertThrows(() => new ChatlogEntry('---\n: invalid: yaml: {\n---\nbody'), ChatlogError);
      assertEquals(err.kind, 'InvalidYaml');
    });
  });
});
