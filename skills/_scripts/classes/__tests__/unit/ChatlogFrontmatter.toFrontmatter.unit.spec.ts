// src: skills/_scripts/classes/__tests__/unit/ChatlogFrontmatter.toFrontmatter.unit.spec.ts
// @(#): ChatlogFrontmatter#toFrontmatter ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// -- error class --
import { ChatlogError } from '../../ChatlogError.class.ts';
// -- test target --
import { ChatlogFrontmatter } from '../../ChatlogFrontmatter.class.ts';

// ─────────────────────────────────────────────
// ChatlogFrontmatter#toFrontmatter
// ─────────────────────────────────────────────
describe('ChatlogFrontmatter', () => {
  describe('toFrontmatter()', () => {
    describe('正常ケース', () => {
      it('T-CLS-CF-21: set で追加したフィールドが toFrontmatter に反映される', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('title', 'Hello');
        const result = fm.toFrontmatter(['title']);
        assertEquals(result, '---\ntitle: "Hello"\n---\n');
      });

      it('T-CLS-CF-22: remove で削除したフィールドが toFrontmatter に含まれない', () => {
        const fm = new ChatlogFrontmatter('---\ntitle: "Hello"\n---\n');
        fm.remove('title');
        const result = fm.toFrontmatter(['title']);
        assertEquals(result, '---\n\n---\n');
      });

      it('T-CLS-CF-23: fieldOrder 省略時は _DEFAULT_ORDERED_FIELDS が使われる', () => {
        const fm = new ChatlogFrontmatter('---\ntitle: "Hello"\ncategory: "dev"\n---\n');
        const result = fm.toFrontmatter();
        assertEquals(result, '---\ntitle: "Hello"\ncategory: "dev"\n---\n');
      });

      const _normalCases: {
        id: string;
        label: string;
        init: string;
        setup?: (fm: ChatlogFrontmatter) => void;
        fieldOrder: string[];
        expected: string;
      }[] = [
        {
          id: 'T-CLS-CF-37',
          label: '複数フィールドの出力順序は fieldOrder の順序に従う',
          init: '',
          setup: (fm) => {
            fm.set('date', '2026-01-01');
            fm.set('title', 'My Title');
          },
          fieldOrder: ['date', 'title'],
          expected: '---\ndate: "2026-01-01"\ntitle: "My Title"\n---\n',
        },
        {
          id: 'T-CLS-CF-40',
          label: 'fieldOrder 外のフィールドは出力に含まれない',
          init: '',
          setup: (fm) => {
            fm.set('title', 'Hello');
            fm.set('extra', 'hidden');
          },
          fieldOrder: ['title'],
          expected: '---\ntitle: "Hello"\n---\n',
        },
        {
          id: 'T-CLS-CF-42',
          label: '値内の " と \\ がエスケープされる',
          init: '',
          setup: (fm) => {
            fm.set('title', 'Say "hello" and C:\\path');
          },
          fieldOrder: ['title'],
          expected: '---\ntitle: "Say \\"hello\\" and C:\\\\path"\n---\n',
        },
        {
          id: 'T-CLS-CF-43',
          label: '配列値は2スペースインデント＋引用符でフォーマットされる',
          init: '',
          setup: (fm) => {
            fm.set('topics', ['foo', 'bar', 'baz']);
          },
          fieldOrder: ['topics'],
          expected: '---\ntopics:\n  - "foo"\n  - "bar"\n  - "baz"\n---\n',
        },
      ];

      for (const tc of _normalCases) {
        it(`${tc.id}: ${tc.label}`, () => {
          const fm = new ChatlogFrontmatter(tc.init);
          tc.setup?.(fm);
          assertEquals(fm.toFrontmatter(tc.fieldOrder), tc.expected);
        });
      }

      it('T-CLS-CF-46: addTagHashes:true 指定時、tags の各要素に # が付与されて出力される', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('tags', ['foo', 'bar']);
        const result = fm.toFrontmatter(['tags'], { addTagHashes: true });
        assertEquals(result, '---\ntags:\n  - "#foo"\n  - "#bar"\n---\n');
      });

      it('T-CLS-CF-47: addTagHashes:true 指定時、tags 以外のフィールドには # が付与されない', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('topics', ['foo', 'bar']);
        fm.set('tags', ['baz']);
        const result = fm.toFrontmatter(['topics', 'tags'], { addTagHashes: true });
        assertEquals(result, '---\ntopics:\n  - "foo"\n  - "bar"\ntags:\n  - "#baz"\n---\n');
      });

      it('T-CLS-CF-48: addTagHashes:true 指定後も get で取得する内部値は # なしのまま', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('tags', ['foo', 'bar']);
        fm.toFrontmatter(['tags'], { addTagHashes: true });
        assertEquals(fm.get('tags'), ['foo', 'bar']);
      });

      it('T-CLS-CF-49: opts 未指定時は tags に # が付与されない（デフォルト false）', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('tags', ['foo', 'bar']);
        const result = fm.toFrontmatter(['tags']);
        assertEquals(result, '---\ntags:\n  - "foo"\n  - "bar"\n---\n');
      });

      it('T-CLS-CF-50: addTagHashes:false 明示指定時も tags に # が付与されない', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('tags', ['foo', 'bar']);
        const result = fm.toFrontmatter(['tags'], { addTagHashes: false });
        assertEquals(result, '---\ntags:\n  - "foo"\n  - "bar"\n---\n');
      });
    });

    describe('エッジケース', () => {
      const _edgeCases: {
        id: string;
        label: string;
        init: string;
        setup?: (fm: ChatlogFrontmatter) => void;
        fieldOrder: string[];
        expected: string;
      }[] = [
        {
          id: 'T-CLS-CF-38',
          label: '空文字列フィールドはスキップされる',
          init: '',
          setup: (fm) => {
            fm.set('title', '');
            fm.set('date', '2026-01-01');
          },
          fieldOrder: ['title', 'date'],
          expected: '---\ndate: "2026-01-01"\n---\n',
        },
        {
          id: 'T-CLS-CF-39',
          label: '空配列フィールドはスキップされる',
          init: '',
          setup: (fm) => {
            fm.set('tags', []);
            fm.set('title', 'Hello');
          },
          fieldOrder: ['tags', 'title'],
          expected: '---\ntitle: "Hello"\n---\n',
        },
        {
          id: 'T-CLS-CF-41',
          label: 'fieldOrder の重複フィールドは1度だけ出力される',
          init: '',
          setup: (fm) => {
            fm.set('title', 'Hello');
          },
          fieldOrder: ['title', 'title', 'title'],
          expected: '---\ntitle: "Hello"\n---\n',
        },
        {
          id: 'T-CLS-CF-44',
          label: 'すべてのフィールドが空の場合は空の frontmatter を出力する',
          init: '',
          setup: (fm) => {
            fm.set('title', '');
            fm.set('tags', []);
          },
          fieldOrder: ['title', 'tags'],
          expected: '---\n\n---\n',
        },
      ];

      for (const tc of _edgeCases) {
        it(`${tc.id}: ${tc.label}`, () => {
          const fm = new ChatlogFrontmatter(tc.init);
          tc.setup?.(fm);
          assertEquals(fm.toFrontmatter(tc.fieldOrder), tc.expected);
        });
      }
    });

    describe('エラーケース', () => {
      it('T-CLS-CF-45: [エラー] fieldOrder が空配列の場合は InvalidArgs をスローする', () => {
        const fm = new ChatlogFrontmatter('');
        fm.set('title', 'Hello');
        const err = assertThrows(() => fm.toFrontmatter([]), ChatlogError);
        assertEquals(err.kind, 'InvalidArgs');
      });
    });
  });
});
