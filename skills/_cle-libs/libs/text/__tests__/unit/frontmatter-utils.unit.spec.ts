// src: skills/_cle-libs/libs/__tests__/unit/frontmatter-utils.unit.spec.ts
// @(#): frontmatter-utils ユニットテスト（parseFrontmatter / parseFrontmatterEntries / reorderFrontmatterEntries / divideEntry / renderFrontmatter / extractYaml）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  divideEntry,
  extractYaml,
  hasFrontmatter,
  hasFrontmatterFields,
  parseFrontmatter,
  parseFrontmatterEntries,
  renderFrontmatter,
  reorderFrontmatterEntries,
  stripTagHashes,
} from '../../frontmatter-utils.ts';

// ─── Helpers
// error class
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// parseFrontmatter
// ─────────────────────────────────────────────

describe('parseFrontmatter', () => {
  describe('Given: title と category を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-01 - title, category が正しく取得できる', () => {
        it('T-LIB-FM-01: 基本フィールド（string）のパース', () => {
          const text = '---\ntitle: Hello\ncategory: dev\n---\nbody text';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['title'], 'Hello');
          assertEquals(result.meta['category'], 'dev');
        });
      });
    });
  });

  describe('Given: topics に配列を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-02 - topics が配列として取得できる', () => {
        it('T-LIB-FM-02: 配列フィールドのパース', () => {
          const text = '---\ntopics:\n  - alpha\n  - beta\n---\nbody';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['topics'], ['alpha', 'beta']);
        });
      });
    });
  });

  describe('Given: frontmatter と複数行の本文を含むテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-04 - content が frontmatter 以降の本文と一致する', () => {
        it('T-LIB-FM-04: content の正確性', () => {
          const text = '---\ntitle: Hello\n---\nThis is the body.\nSecond line.';
          const result = parseFrontmatter(text);
          assertEquals(result.content, 'This is the body.\nSecond line.\n');
        });
      });
    });
  });

  describe('Given: ---\\n で始まらないプレーンテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-05 - meta:{}, content=text が返る', () => {
        it('T-LIB-FM-05: frontmatter なし（---\\n で始まらない）', () => {
          const text = 'This is plain text without frontmatter.';
          const result = parseFrontmatter(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: 開き --- はあるが閉じ --- がないテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-06 - meta:{}, content=text が返る', () => {
        it('T-LIB-FM-06: 閉じ --- なし', () => {
          const text = '---\ntitle: Hello\nno closing separator';
          const result = parseFrontmatter(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: CRLF 改行を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-07 - CRLF でも正しくパースされる', () => {
        it('T-LIB-FM-07: CRLF 改行の正規化', () => {
          const text = '---\r\ntitle: Hello\r\ncategory: dev\r\n---\r\nbody text';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['title'], 'Hello');
          assertEquals(result.meta['category'], 'dev');
        });
      });
    });
  });

  describe('Given: 空の frontmatter ブロック（---\\n---\\n の形式）', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-08 - meta:{}, content が後続テキストになる', () => {
        it('T-LIB-FM-08: 空の frontmatter ブロック', () => {
          const text = '---\n---\nafter body';
          const result = parseFrontmatter(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, 'after body\n');
        });
      });
    });
  });

  describe('Given: 不正な YAML を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-09 - meta:{}, content=text が返る', () => {
        it('T-LIB-FM-09: YAML パース失敗（不正な YAML）', () => {
          const text = '---\n: invalid: yaml: {\n---\nbody';
          const result = parseFrontmatter(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: 数値フィールドを含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-10 - count が number として取得できる', () => {
        it('T-LIB-FM-10: 数値フィールド', () => {
          const text = '---\ncount: 42\n---\nbody';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['count'], 42);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: parseFrontmatter("") を呼び出す', () => {
      describe('Then: T-LIB-FM-11 - meta:{}, content="" が返る', () => {
        it('T-LIB-FM-11: 空文字列入力', () => {
          const result = parseFrontmatter('');
          assertEquals(result.meta, {});
          assertEquals(result.content, '');
        });
      });
    });
  });

  describe('Given: 開き --- のみで本文も閉じ --- もないテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-12 - meta:{}, content=text が返る', () => {
        it('T-LIB-FM-12: 開き --- のみ（EOF）', () => {
          const text = '---\n';
          const result = parseFrontmatter(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: 閉じ区切りが末尾改行なしのテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-13 - divideEntry がパース成功するため meta と空 content が返る', () => {
        it('T-LIB-FM-13: 末尾改行なしの閉じ ---', () => {
          const text = '---\ntitle: Hello\n---';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['title'], 'Hello');
          assertEquals(result.content, '');
        });
      });
    });
  });

  describe('Given: frontmatter のみで本文が空のテキスト', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-14 - content が空文字列になる', () => {
        it('T-LIB-FM-14: frontmatter 後の content が空', () => {
          const text = '---\ntitle: Hello\n---\n';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['title'], 'Hello');
          assertEquals(result.content, '');
        });
      });
    });
  });

  describe('Given: CRLF 改行を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-15 - content が正しく取得できる', () => {
        it('T-LIB-FM-15: CRLF 正規化後の content', () => {
          const text = '---\r\ntitle: Hi\r\n---\r\nbody text';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['title'], 'Hi');
          assertEquals(result.content, 'body text\n');
        });
      });
    });
  });

  describe('Given: YAML 値の中に --- を含む frontmatter ブロック', () => {
    describe('When: parseFrontmatter(text) を呼び出す', () => {
      describe('Then: T-LIB-FM-16 - 値内の --- を区切りと誤認しない', () => {
        it('T-LIB-FM-16: YAML 値内に --- を含む（quoted string）', () => {
          const text = '---\nsummary: "foo --- bar"\n---\nbody';
          const result = parseFrontmatter(text);
          assertEquals(result.meta['summary'], 'foo --- bar');
          assertEquals(result.content, 'body\n');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// parseFrontmatterEntries
// ─────────────────────────────────────────────

describe('parseFrontmatterEntries', () => {
  describe('Given: 基本的な文字列フィールドを持つ frontmatter', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-01 - 文字列フィールドが正しく取得できる', () => {
        it('T-LIB-FSM-01: 基本文字列フィールドのパース', () => {
          const text = '---\ntitle: Hello\nproject: my-proj\n---\nbody text';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['title'], 'Hello');
          assertEquals(result.meta['project'], 'my-proj');
        });
      });
    });
  });

  describe('Given: date フィールドを含む frontmatter', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-02 - date が YYYY-MM-DD 文字列として返る', () => {
        it('T-LIB-FSM-02: Date オブジェクトが YYYY-MM-DD 文字列に変換される', () => {
          const text = '---\ndate: 2026-03-15\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['date'], '2026-03-15');
        });
      });
    });
  });

  describe('Given: 数値フィールドを含む frontmatter', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-03 - 数値が文字列として返る', () => {
        it('T-LIB-FSM-03: 数値フィールドが文字列に変換される', () => {
          const text = '---\ncount: 42\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['count'], '42');
        });
      });
    });
  });

  describe('Given: frontmatter のないプレーンテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-04 - meta={}, content=元テキスト が返る', () => {
        it('T-LIB-FSM-04: frontmatter なし', () => {
          const text = 'plain text without frontmatter';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta, {});
          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: frontmatter と本文を含むテキスト', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-05 - content が frontmatter 後のテキストと一致する', () => {
        it('T-LIB-FSM-05: content の正確性', () => {
          const text = '---\ntitle: Hello\n---\n# 本文\n内容';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.content, '# 本文\n内容\n');
        });
      });
    });
  });

  describe('Given: 配列フィールドを含む frontmatter', () => {
    describe('When: parseFrontmatterEntries(text) を呼び出す', () => {
      describe('Then: T-LIB-FSM-06 - 配列フィールドが string[] として返る', () => {
        it('T-LIB-FSM-06-01: 複数要素配列が順序保持で string[] に変換される', () => {
          const text = '---\ntags:\n  - foo\n  - bar\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], ['foo', 'bar']);
        });

        it('T-LIB-FSM-06-02: 単一要素配列が string[] に変換される', () => {
          const text = '---\ntags:\n  - foo\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], ['foo']);
        });

        it('T-LIB-FSM-06-03: 空配列が [] として返る', () => {
          const text = '---\ntags: []\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], []);
        });

        it('T-LIB-FSM-06-04: null 混入配列の null 要素が空文字列に変換される', () => {
          const text = '---\ntags:\n  - foo\n  - ~\n  - bar\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], ['foo', '', 'bar']);
        });

        it('T-LIB-FSM-06-05: tags に # が付いていない → そのまま返る（回帰確認）', () => {
          const text = '---\ntags:\n  - foo\n  - bar\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], ['foo', 'bar']);
        });

        it('T-LIB-FSM-06-06: tags に # が付いている → 先頭の # が除去されて返る', () => {
          const text = '---\ntags:\n  - "#foo"\n  - "#bar"\n---\nbody';
          const result = parseFrontmatterEntries(text);
          assertEquals(result.meta['tags'], ['foo', 'bar']);
        });
      });
    });
  });

  describe('Given: フロントマターのないテキスト "# タイトル\\n本文"', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-01 - meta={}、body=元テキスト', () => {
        const text = '# タイトル\n本文';

        it('T-LIB-FU-01-01: meta が空オブジェクトになる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta, {});
        });

        it('T-LIB-FU-01-02: body が元テキスト全体になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, text);
        });
      });
    });
  });

  describe('Given: "---\\nkey: val\\n---\\n本文" というテキスト', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-02 - key=val, body=本文', () => {
        const text = '---\nkey: val\n---\n本文';

        it('T-LIB-FU-02-01: meta.key が "val" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['key'], 'val');
        });

        it('T-LIB-FU-02-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文\n');
        });
      });
    });
  });

  describe('Given: 複数フィールドを持つフロントマター', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-03 - 全フィールドが正しく抽出される', () => {
        const text = [
          '---',
          'session_id: sess-001',
          'date: 2026-03-15',
          'project: my-project',
          'slug: test-slug',
          '---',
          '',
          '# タイトル',
          '本文',
        ].join('\n');

        it('T-LIB-FU-03-01: session_id が "sess-001" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['session_id'], 'sess-001');
        });

        it('T-LIB-FU-03-02: date が "2026-03-15" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['date'], '2026-03-15');
        });

        it('T-LIB-FU-03-03: project が "my-project" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['project'], 'my-project');
        });

        it('T-LIB-FU-03-04: slug が "test-slug" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['slug'], 'test-slug');
        });
      });
    });
  });

  describe('Given: CRLF 改行 ("\\r\\n") を含むテキスト', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-04 - LF に正規化されて解析される', () => {
        const text = '---\r\nkey: val\r\n---\r\n本文';

        it('T-LIB-FU-04-01: meta.key が "val" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['key'], 'val');
        });

        it('T-LIB-FU-04-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文\n');
        });
      });
    });
  });

  describe('Given: 空のフロントマター "---\\n---\\n本文"', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-05 - meta={}、body=本文', () => {
        const text = '---\n---\n本文';

        it('T-LIB-FU-05-01: meta が空オブジェクトになる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta, {});
        });

        it('T-LIB-FU-05-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文\n');
        });
      });
    });
  });

  describe('Given: YAML block scalar (|) を含むフロントマター', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-LIB-FU-06 - summary が複数行文字列として取得できる', () => {
        const text = [
          '---',
          'summary: |',
          '  line1',
          '  line2',
          '---',
          '本文',
        ].join('\n');

        it('T-LIB-FU-06-01: summary が "line1\\nline2\\n" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['summary'], 'line1\nline2\n');
        });

        it('T-LIB-FU-06-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文\n');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// reorderFrontmatterEntries
// ─────────────────────────────────────────────

/**
 * `reorderFrontmatterEntries` のユニットテストスイート。
 *
 * フィールド順序固定・空値スキップ・重複スキップ・空 fieldOrder を検証する。
 *
 * テスト ID 範囲: T-FU-BOE-01 〜 T-FU-BOE-06
 *
 * @see reorderFrontmatterEntries
 */
describe('reorderFrontmatterEntries', () => {
  /**
   * `reorderFrontmatterEntries` の正常系テスト。
   *
   * フィールド順序・undefined スキップ・空文字列スキップ・空配列スキップを検証する。
   */
  describe('When: 正常系', () => {
    /** T-FU-BOE-01: entries と逆順の fieldOrder で順序が固定されることを確認する。 */
    it('[Normal] T-FU-BOE-01: fieldOrder の順にエントリが並ぶ', () => {
      const entries: Record<string, string | string[]> = { b: 'B', a: 'A' };
      const result = reorderFrontmatterEntries(entries, ['a', 'b']);
      assertEquals(Object.keys(result), ['a', 'b']);
      assertEquals(result['a'], 'A');
      assertEquals(result['b'], 'B');
    });

    /** T-FU-BOE-02: entries に存在しない（undefined な）フィールドはスキップされる。 */
    it('[Normal] T-FU-BOE-02: undefined な値はスキップされる', () => {
      const entries: Record<string, string | string[]> = { title: 'Hello' };
      const result = reorderFrontmatterEntries(entries, ['title', 'missing']);
      assertEquals(Object.keys(result), ['title']);
    });

    /** T-FU-BOE-03: 空文字列の値はスキップされる。 */
    it('[Normal] T-FU-BOE-03: 空文字列はスキップされる', () => {
      const entries: Record<string, string | string[]> = { title: 'Hello', category: '' };
      const result = reorderFrontmatterEntries(entries, ['title', 'category']);
      assertEquals(Object.keys(result), ['title']);
    });

    /** T-FU-BOE-04: 空配列の値はスキップされる。 */
    it('[Normal] T-FU-BOE-04: 空配列はスキップされる', () => {
      const entries: Record<string, string | string[]> = { title: 'Hello', tags: [] };
      const result = reorderFrontmatterEntries(entries, ['title', 'tags']);
      assertEquals(Object.keys(result), ['title']);
    });
  });

  /**
   * `reorderFrontmatterEntries` のエッジケーステスト。
   *
   * fieldOrder の重複と空配列を検証する。
   */
  describe('When: エッジケース', () => {
    /** T-FU-BOE-05: fieldOrder に重複フィールドがあっても 1 回だけ出力される。 */
    it('[Edge] T-FU-BOE-05: fieldOrder に重複があってもスキップされる', () => {
      const entries: Record<string, string | string[]> = { title: 'Hello' };
      const result = reorderFrontmatterEntries(entries, ['title', 'title']);
      assertEquals(Object.keys(result), ['title']);
      assertEquals(result['title'], 'Hello');
    });

    /** T-FU-BOE-06: fieldOrder が空のとき空 Record を返す。 */
    it('[Edge] T-FU-BOE-06: fieldOrder が空のとき空 Record を返す', () => {
      const entries: Record<string, string | string[]> = { title: 'Hello' };
      const result = reorderFrontmatterEntries(entries, []);
      assertEquals(result, {});
    });
  });
});

// ─────────────────────────────────────────────
// divideEntry
// ─────────────────────────────────────────────

/**
 * `divideEntry` のユニットテストスイート。
 *
 * frontmatter ブロックと本文への分割・エラー検出・CRLF 正規化を検証する。
 *
 * テスト ID 範囲: T-FU-DE-01 〜 T-FU-DE-10
 *
 * @see divideEntry
 */
describe('divideEntry', () => {
  /**
   * 正常系: 有効な frontmatter ブロックの分割。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-FU-DE-01: frontmatter と body を正しく分割する', () => {
      const _text = '---\ntitle: X\n---\nbody';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\ntitle: X\n---\n');
      assertEquals(_result.content, 'body\n');
    });

    it('[Normal] T-FU-DE-02: --- で始まらない入力は frontmatter="" content=normalized を返す（throw しない）', () => {
      const _text = 'plain text';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '');
      assertEquals(_result.content, 'plain text\n');
    });

    it('[Normal] T-FU-DE-03: 空文字列は frontmatter="" content="" を返す', () => {
      const _result = divideEntry('');
      assertEquals(_result.frontmatter, '');
      assertEquals(_result.content, '');
    });

    it('[Normal] T-FU-DE-04: 空の frontmatter ブロック（---\\n---\\n）を分割する', () => {
      const _text = '---\n---\nbody';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\n---\n');
      assertEquals(_result.content, 'body\n');
    });

    it('[Normal] T-FU-DE-05: CRLF 改行を正規化して分割する', () => {
      const _text = '---\r\ntitle: Hi\r\n---\r\nbody text';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\ntitle: Hi\n---\n');
      assertEquals(_result.content, 'body text\n');
    });

    it('[Normal] T-FU-DE-06: 本文が空（frontmatter のみ）でも分割できる', () => {
      const _text = '---\ntitle: T\n---\n';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\ntitle: T\n---\n');
      assertEquals(_result.content, '');
    });
  });

  /**
   * エッジケース: YAML ブロックスカラー内に --- を含む入力の分割。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-FU-DE-09: YAML ブロックスカラー内に --- を含む → 正しく分割する', () => {
      const _text = '---\ndescription: |\n  line1\n  ---\n  line2\n---\nbody';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\ndescription: |\n  line1\n  ---\n  line2\n---\n');
      assertEquals(_result.content, 'body\n');
    });

    it('[Edge] T-FU-DE-10: |1 記法でインデントなし --- が値内に現れる → |1 直後の --- が閉じ区切りになる', () => {
      // YAML |1 記法（インデント幅を明示）では直後の --- がインデントなしになる。
      // indexOf ベース実装は |1 直後の --- を閉じ区切りと解釈する。
      const _text = '---\ndescription: |1\n---\nvalue\n---\nbody';
      const _result = divideEntry(_text);
      assertEquals(_result.frontmatter, '---\ndescription: |1\n---\n');
      assertEquals(_result.content, 'value\n---\nbody\n');
    });
  });

  /**
   * 異常系: 不正な frontmatter で ChatlogError がスローされる。
   */
  describe('When: 異常系', () => {
    it('[Error] T-FU-DE-07: 閉じ --- なし → InvalidFormat(NotClosed) をスローする', () => {
      const _text = '---\ntitle: Hello\nno closing';
      const _err = assertThrows(() => divideEntry(_text), ChatlogError) as ChatlogError;
      assertEquals(_err.kind, 'InvalidFormat');
      assertEquals(_err.subindex, 'NotClosed');
    });

    it('[Error] T-FU-DE-08: 不正な YAML → InvalidYaml(YamlSyntaxError) をスローする', () => {
      const _text = '---\n: invalid: yaml: {\n---\nbody';
      const _err = assertThrows(() => divideEntry(_text), ChatlogError) as ChatlogError;
      assertEquals(_err.kind, 'InvalidYaml');
      assertEquals(_err.subindex, 'YamlSyntaxError');
    });
  });
});

// ─────────────────────────────────────────────
// renderFrontmatter
// ─────────────────────────────────────────────

/**
 * `renderFrontmatter` のユニットテストスイート。
 *
 * `Record<string, unknown>` から YAML frontmatter ブロック文字列を生成する動作を検証する。
 *
 * テスト ID 範囲: T-FU-RF-01 〜 T-FU-RF-04
 *
 * @see renderFrontmatter
 */
describe('renderFrontmatter', () => {
  /**
   * 正常系: 各種フィールドパターンの frontmatter 生成。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-FU-RF-01: 空オブジェクトを渡す → 空文字列を返す', () => {
      const _fields = {};
      const _result = renderFrontmatter(_fields);
      assertEquals(_result, '');
    });

    it('[Normal] T-FU-RF-02: スカラー値1件 → "---\\nkey: \\"value\\"\\n---\\n" を返す', () => {
      const _fields = { title: 'Test Title' };
      const _result = renderFrontmatter(_fields);
      assertEquals(_result, '---\ntitle: "Test Title"\n---\n');
    });

    it('[Normal] T-FU-RF-03: 配列値 → "---\\nkey:\\n  - \\"a\\"\\n  - \\"b\\"\\n---\\n" を返す', () => {
      const _fields = { topics: ['API', 'Deno'] };
      const _result = renderFrontmatter(_fields);
      assertEquals(_result, '---\ntopics:\n  - "API"\n  - "Deno"\n---\n');
    });

    it('[Normal] T-FU-RF-04: スカラーと配列の混在 → 挿入順通りに生成される（ダブルクォート）', () => {
      const _fields = { title: 'My Title', tags: ['ts', 'deno'] };
      const _result = renderFrontmatter(_fields);
      assertEquals(_result, '---\ntitle: "My Title"\ntags:\n  - "ts"\n  - "deno"\n---\n');
    });
  });
});

// ─────────────────────────────────────────────
// hasFrontmatter
// ─────────────────────────────────────────────

/**
 * `hasFrontmatter` のユニットテストスイート。
 *
 * テキストにフロントマターが存在し1つ以上のフィールドが設定されているか判定する動作を検証する。
 *
 * テスト ID 範囲: T-LIB-FMU-01-01 〜 T-LIB-FMU-03-03
 *
 * @see hasFrontmatter
 */
describe('hasFrontmatter', () => {
  /**
   * 正常系: フロントマターありのテキスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-FMU-01-01: title フィールドがある .md テキスト → true', () => {
      const _result = hasFrontmatter('---\ntitle: Test\n---\nContent\n');
      assertEquals(_result, true);
    });

    it('[Normal] T-LIB-FMU-02-01: プレーンテキスト → false', () => {
      const _result = hasFrontmatter('No frontmatter here.\n');
      assertEquals(_result, false);
    });
  });

  /**
   * エッジケース: 空フロントマター・空文字列・不正 YAML。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-FMU-03-01: 空フロントマター (---\\n---\\n) → false', () => {
      const _result = hasFrontmatter('---\n---\n');
      assertEquals(_result, false);
    });

    it('[Edge] T-LIB-FMU-03-02: 空文字列 → false', () => {
      const _result = hasFrontmatter('');
      assertEquals(_result, false);
    });

    it('[Edge] T-LIB-FMU-03-03: 不正 YAML フロントマター → false', () => {
      const _result = hasFrontmatter('---\n: invalid: yaml: {\n---\nbody');
      assertEquals(_result, false);
    });
  });
});

// ─────────────────────────────────────────────
// hasFrontmatterFields
// ─────────────────────────────────────────────

/**
 * `hasFrontmatterFields` のユニットテストスイート。
 *
 * `FrontmatterFields` の 5 フィールド充足チェックを検証する。
 *
 * テスト ID 範囲: T-FU-HFF-01 〜 T-FU-HFF-05
 *
 * @see hasFrontmatterFields
 */
describe('hasFrontmatterFields', () => {
  /** 5 フィールド全充足の正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FU-HFF-01: 5フィールド全充足 → true', () => {
      const _fields: Record<string, string | string[]> = {
        type: 'tech',
        category: 'backend',
        title: 'My Title',
        topics: ['topic-a'],
        tags: ['tag1'],
      };
      assertEquals(hasFrontmatterFields(_fields), true);
    });

    it('[Normal] T-FU-HFF-05: topics が複数要素 → true', () => {
      const _fields: Record<string, string | string[]> = {
        type: 'tech',
        category: 'backend',
        title: 'My Title',
        topics: ['topic-a', 'topic-b'],
        tags: ['tag1'],
      };
      assertEquals(hasFrontmatterFields(_fields), true);
    });

    it('[Normal] T-FU-HFF-06: fieldsを["title"]に限定 → titleのみチェック → true', () => {
      const _fields: Record<string, string | string[]> = { title: 'Hello' };
      assertEquals(hasFrontmatterFields(_fields, ['title']), true);
    });
  });

  /** フィールド不足・空値のエラーケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-FU-HFF-02: string フィールド(title)が空文字 → false', () => {
      const _fields: Record<string, string | string[]> = {
        type: 'tech',
        category: 'backend',
        title: '',
        topics: ['topic-a'],
        tags: ['tag1'],
      };
      assertEquals(hasFrontmatterFields(_fields), false);
    });

    it('[Error] T-FU-HFF-03: string フィールド(category)が欠如 → false', () => {
      const _fields: Record<string, string | string[]> = {
        type: 'tech',
        title: 'My Title',
        topics: ['topic-a'],
        tags: ['tag1'],
      };
      assertEquals(hasFrontmatterFields(_fields), false);
    });

    it('[Error] T-FU-HFF-04: 配列フィールド(tags)が空配列 → false', () => {
      const _fields: Record<string, string | string[]> = {
        type: 'tech',
        category: 'backend',
        title: 'My Title',
        topics: ['topic-a'],
        tags: [],
      };
      assertEquals(hasFrontmatterFields(_fields), false);
    });
  });
});

// ─────────────────────────────────────────────
// parseAiYaml
// ─────────────────────────────────────────────

/**
 * `extractYaml` のユニットテストスイート。
 *
 * AI 出力の raw 文字列を YAML パースし Result 型で返す動作を検証する。
 *
 * テスト ID 範囲: T-FU-PAY-01 〜 T-FU-PAY-06
 *
 * @see extractYaml
 */
describe('extractYaml', () => {
  /**
   * 正常系: 有効な YAML を渡すと ok:true と value が返る。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-FU-PAY-01: コードフェンスなし・有効 YAML → { ok: true, value: { title: "..." } }', () => {
      const _raw = 'title: "My Title"\ncategory: dev\n';
      const _result = extractYaml(_raw, 'title');
      assertEquals(_result.ok, true);
      if (_result.ok) {
        assertEquals(_result.value['title'], 'My Title');
      }
    });

    it('[Normal] T-FU-PAY-02: コードフェンスあり（```yaml ... ```）・有効 YAML → { ok: true, value: ... }', () => {
      const _raw = '```yaml\ntitle: "Fenced"\ncategory: ai\n```';
      const _result = extractYaml(_raw, 'title');
      assertEquals(_result.ok, true);
      if (_result.ok) {
        assertEquals(_result.value['title'], 'Fenced');
      }
    });
  });

  /**
   * 異常系: cleanYaml が空・YAML 構文エラー・トップレベル非オブジェクトのケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-FU-PAY-03: raw が空文字列 → cleanYaml が空を返す → { ok: false, error.message: "cleanYaml returned empty" }', () => {
      const _result = extractYaml('', 'title');
      assertEquals(_result.ok, false);
      if (!_result.ok) {
        assertEquals(_result.error.message, 'cleanYaml returned empty');
      }
    });

    it('[Error] T-FU-PAY-04: 構文エラー YAML → { ok: false, error が Error インスタンス }', () => {
      const _raw = 'title: test\n  invalid_indent: bad\n';
      const _result = extractYaml(_raw, 'title');
      assertEquals(_result.ok, false);
      if (!_result.ok) {
        assertEquals(_result.error instanceof Error, true);
      }
    });

    it('[Error] T-FU-PAY-05: トップレベルが配列の YAML → { ok: false, error.message: "YAML top-level is not an object" }', () => {
      const _raw = '- item1\n- item2\n';
      const _result = extractYaml(_raw, 'nonexistent');
      assertEquals(_result.ok, false);
      if (!_result.ok) {
        assertEquals(_result.error.message, 'YAML top-level is not an object');
      }
    });

    it('[Error] T-FU-PAY-06: トップレベルが null の YAML → { ok: false }', () => {
      const _raw = 'null\n';
      const _result = extractYaml(_raw, 'nonexistent');
      assertEquals(_result.ok, false);
    });
  });
});

// ─────────────────────────────────────────────
// stripTagHashes
// ─────────────────────────────────────────────

/**
 * `stripTagHashes` のユニットテストスイート。
 *
 * `tags` の各要素から先頭の `#` を除去する動作を検証する。
 *
 * テスト ID 範囲: T-FU-STH-01 〜 T-FU-STH-04
 *
 * @see stripTagHashes
 */
describe('stripTagHashes', () => {
  /** tags が配列・スカラーのいずれでも先頭の # が除去されることを確認する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FU-STH-01: tags が # 付き配列 → 各要素の # が除去される', () => {
      const _entries = { tags: ['#foo', '#bar'] };
      const _result = stripTagHashes(_entries);
      assertEquals(_result['tags'], ['foo', 'bar']);
    });

    it('[Normal] T-FU-STH-02: tags が # 付きスカラー文字列 → # が除去される', () => {
      const _entries = { tags: '#foo' };
      const _result = stripTagHashes(_entries);
      assertEquals(_result['tags'], 'foo');
    });
  });

  /** tags が未定義または # なしのケースを確認する。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FU-STH-03: tags が undefined → entries をそのまま返す', () => {
      const _entries = { title: 'Hello' };
      const _result = stripTagHashes(_entries);
      assertEquals(_result, _entries);
    });

    it('[Edge] T-FU-STH-04: tags に # が付いていない → 変化せずそのまま返る', () => {
      const _entries = { tags: ['foo', 'bar'] };
      const _result = stripTagHashes(_entries);
      assertEquals(_result['tags'], ['foo', 'bar']);
    });
  });
});
