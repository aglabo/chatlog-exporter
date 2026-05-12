// src: scripts/__tests__/unit/set-frontmatter.parse-frontmatter.unit.spec.ts
// @(#): parseFrontmatterEntries のユニットテスト
//       Markdownテキストからフロントマターを抽出する関数の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { parseFrontmatterEntries } from '../../../../_scripts/libs/text/frontmatter-utils.ts';

// ─── フロントマターなしのテキスト ─────────────────────────────────────────────

describe('parseFrontmatterEntries', () => {
  describe('Given: フロントマターのないテキスト "# タイトル\\n本文"', () => {
    describe('When: parseFrontmatter を呼び出す', () => {
      describe('Then: T-SF-PF-01 - meta={}、body=元テキスト', () => {
        const text = '# タイトル\n本文';

        it('T-SF-PF-01-01: meta が空オブジェクトになる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta, {});
        });

        it('T-SF-PF-01-02: body が元テキスト全体になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, text);
        });
      });
    });
  });

  // ─── 基本的なフロントマター ───────────────────────────────────────────────

  describe('Given: "---\\nkey: val\\n---\\n本文" というテキスト', () => {
    describe('When: parseFrontmatter を呼び出す', () => {
      describe('Then: T-SF-PF-02 - key=val, body=本文', () => {
        const text = '---\nkey: val\n---\n本文';

        it('T-SF-PF-02-01: meta.key が "val" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['key'], 'val');
        });

        it('T-SF-PF-02-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文');
        });
      });
    });
  });

  // ─── 複数フィールドのフロントマター ──────────────────────────────────────

  describe('Given: 複数フィールドを持つフロントマター', () => {
    describe('When: parseFrontmatter を呼び出す', () => {
      describe('Then: T-SF-PF-03 - 全フィールドが正しく抽出される', () => {
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

        it('T-SF-PF-03-01: session_id が "sess-001" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['session_id'], 'sess-001');
        });

        it('T-SF-PF-03-02: date が "2026-03-15" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['date'], '2026-03-15');
        });

        it('T-SF-PF-03-03: project が "my-project" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['project'], 'my-project');
        });

        it('T-SF-PF-03-04: slug が "test-slug" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['slug'], 'test-slug');
        });
      });
    });
  });

  // ─── CRLF 改行の正規化 ────────────────────────────────────────────────────

  describe('Given: CRLF 改行 ("\\r\\n") を含むテキスト', () => {
    describe('When: parseFrontmatter を呼び出す', () => {
      describe('Then: T-SF-PF-04 - LF に正規化されて解析される', () => {
        const text = '---\r\nkey: val\r\n---\r\n本文';

        it('T-SF-PF-04-01: meta.key が "val" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['key'], 'val');
        });

        it('T-SF-PF-04-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文');
        });
      });
    });
  });

  // ─── 空のフロントマター ───────────────────────────────────────────────────

  describe('Given: 空のフロントマター "---\\n---\\n本文"', () => {
    describe('When: parseFrontmatter を呼び出す', () => {
      describe('Then: T-SF-PF-05 - meta={}、body=本文', () => {
        const text = '---\n---\n本文';

        it('T-SF-PF-05-01: meta が空オブジェクトになる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta, {});
        });

        it('T-SF-PF-05-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文');
        });
      });
    });
  });

  // ─── YAML block scalar（正当な multiline）のパース ────────────────────────

  describe('Given: YAML block scalar (|) を含むフロントマター', () => {
    describe('When: parseFrontmatterEntries を呼び出す', () => {
      describe('Then: T-SF-PF-06 - summary が複数行文字列として取得できる', () => {
        const text = [
          '---',
          'summary: |',
          '  line1',
          '  line2',
          '---',
          '本文',
        ].join('\n');

        it('T-SF-PF-06-01: summary が "line1\\nline2\\n" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.meta['summary'], 'line1\nline2\n');
        });

        it('T-SF-PF-06-02: body が "本文" になる', () => {
          const result = parseFrontmatterEntries(text);

          assertEquals(result.content, '本文');
        });
      });
    });
  });
});
