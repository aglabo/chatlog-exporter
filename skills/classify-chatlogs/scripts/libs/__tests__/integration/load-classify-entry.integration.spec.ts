// src: scripts/libs/__tests__/integration/load-classify-entry.integration.spec.ts
// @(#): loadClassifyEntry の統合テスト（実ファイルシステム使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── test target

import { loadClassifyEntry } from '../../load-classify-entry.ts';

// ─── helpers
// errors
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── test

describe('loadClassifyEntry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-CL-LFM-01: frontmatter 付き md の全フィールド確認 ─────────────────

  describe('Given: frontmatter 付き .md ファイル（project なし）', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-01 - 全フィールドが正しく設定される', () => {
        it('T-CL-LFM-01-01: filename が正しく設定される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntitle: テストタイトル\ncategory: development\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;

          assertEquals(_result.filename, 'test.md');
        });

        it('T-CL-LFM-01-02: frontmatter の title が正しく設定される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntitle: テストタイトル\ncategory: development\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _title = _result.frontmatter.get('title');

          assertEquals(typeof _title === 'string' ? _title : '', 'テストタイトル');
        });

        it('T-CL-LFM-01-03: frontmatter の category が正しく設定される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntitle: テストタイトル\ncategory: development\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _category = _result.frontmatter.get('category');

          assertEquals(typeof _category === 'string' ? _category : '', 'development');
        });

        it('T-CL-LFM-01-04: frontmatterText と content が正しく設定される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntitle: テストタイトル\ncategory: development\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;

          assertEquals(
            _result.frontmatterText,
            '---\ntitle: テストタイトル\ncategory: development\n---\n',
          );
          assertEquals(_result.content, '本文\n');
        });
      });
    });
  });

  // ─── T-CL-LFM-02: 存在しないファイル → スロー ──────────────────────────────

  describe('Given: 存在しないファイルパス', () => {
    describe('When: loadClassifyEntry("/nonexistent/file.md") を呼び出す', () => {
      describe('Then: T-CL-LFM-02 - ChatlogError(FileDirNotFound) がスローされる', () => {
        it('[Error] T-CL-LFM-02-01: 存在しないファイルの場合 ChatlogError(FileDirNotFound) がスローされる', async () => {
          await assertRejects(
            () => loadClassifyEntry('/nonexistent/file.md'),
            ChatlogError,
          );
        });
      });
    });
  });

  // ─── T-CL-LFM-03: project なし → entry.frontmatter.get('project') が undefined ────

  describe('Given: project フィールドのない frontmatter の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-03 - entry.frontmatter.get("project") が undefined（分類対象）', () => {
        it('T-CL-LFM-03-01: entry.frontmatter.get("project") が undefined である', async () => {
          const filePath = `${tempDir}/no-project.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n---\n本文');

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _project = _result.frontmatter.get('project');

          assertEquals(_project, undefined);
        });
      });
    });
  });

  // ─── T-CL-LFM-04: project 設定済み → entry.frontmatter.get('project') = "my-app" ──

  describe('Given: project: my-app を含む frontmatter の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-04 - entry.frontmatter.get("project") が "my-app"（スキップ対象）', () => {
        it('T-CL-LFM-04-01: entry.frontmatter.get("project") が "my-app" である', async () => {
          const filePath = `${tempDir}/with-project.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntitle: テスト\nproject: my-app\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _project = _result.frontmatter.get('project');

          assertEquals(typeof _project === 'string' ? _project : '', 'my-app');
        });
      });
    });
  });

  // ─── T-CL-LFM-05: topics 配列の取得 ─────────────────────────────────────

  describe('Given: topics を含む frontmatter の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-05 - topics が正しく取得される', () => {
        it('T-CL-LFM-05-01: entry.frontmatter.get("topics") が ["TypeScript", "Deno"] である', async () => {
          const filePath = `${tempDir}/with-topics.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntopics:\n  - TypeScript\n  - Deno\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _topics = _result.frontmatter.get('topics');

          assertEquals(Array.isArray(_topics) ? _topics as string[] : [], ['TypeScript', 'Deno']);
        });
      });
    });
  });

  // ─── T-CL-LFM-06: tags 配列の取得 ────────────────────────────────────────

  describe('Given: tags を含む frontmatter の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-06 - tags が正しく取得される', () => {
        it('T-CL-LFM-06-01: entry.frontmatter.get("tags") が ["refactoring", "bdd"] である', async () => {
          const filePath = `${tempDir}/with-tags.md`;
          await Deno.writeTextFile(
            filePath,
            '---\ntags:\n  - refactoring\n  - bdd\n---\n本文',
          );

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;
          const _tags = _result.frontmatter.get('tags');

          assertEquals(Array.isArray(_tags) ? _tags as string[] : [], ['refactoring', 'bdd']);
        });
      });
    });
  });

  // ─── T-CL-LFM-07: 閉じない frontmatter → LoadClassifyEntryFailure ─────────────────

  describe('Given: 閉じない frontmatter の .md ファイル（終端 --- なし）', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-07 - LoadClassifyEntryFailure が返される', () => {
        it('[Error] T-CL-LFM-07-01: 閉じない frontmatter の場合、戻り値の filePath が一致する', async () => {
          const filePath = `${tempDir}/unclosed-fm.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n本文'); // 閉じる --- がない

          const _result = await loadClassifyEntry(filePath) as { filePath: string; error: Error };

          assertEquals(_result.filePath, filePath);
        });

        it('[Error] T-CL-LFM-07-03: error に ChatlogError のメッセージが含まれる', async () => {
          const filePath = `${tempDir}/unclosed-fm.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: テスト\n本文');

          const _result = await loadClassifyEntry(filePath) as { filePath: string; error: Error };

          assertEquals(_result.error.message.length > 0, true);
        });
      });
    });
  });

  // ─── T-CL-LFM-08: 壊れた YAML → LoadClassifyEntryFailure ──────────────────

  describe('Given: 壊れた YAML を含む frontmatter の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-08 - LoadClassifyEntryFailure が返される', () => {
        it('[Error] T-CL-LFM-08-01: 壊れた YAML の場合、戻り値の filePath が一致する', async () => {
          const filePath = `${tempDir}/bad-yaml.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

          const _result = await loadClassifyEntry(filePath) as { filePath: string; error: Error };

          assertEquals(_result.filePath, filePath);
        });

        it('[Error] T-CL-LFM-08-03: error に ChatlogError のメッセージが含まれる', async () => {
          const filePath = `${tempDir}/bad-yaml.md`;
          await Deno.writeTextFile(filePath, '---\ntitle: [unclosed\n---\n本文');

          const _result = await loadClassifyEntry(filePath) as { filePath: string; error: Error };

          assertEquals(_result.error.message.length > 0, true);
        });
      });
    });
  });

  // ─── T-CL-LFM-09: frontmatter なし・空本文 → インスタンスあり ────────────

  describe('Given: frontmatter なし・空本文（改行のみ）の .md ファイル', () => {
    describe('When: loadClassifyEntry(filePath) を呼び出す', () => {
      describe('Then: T-CL-LFM-09 - インスタンスが返され、project は undefined', () => {
        it('T-CL-LFM-09-02: entry.frontmatter.get("project") が undefined（スキップされない）', async () => {
          const filePath = `${tempDir}/empty-body.md`;
          await Deno.writeTextFile(filePath, '\n');

          const _result = await loadClassifyEntry(filePath) as ChatlogEntry;

          assertEquals(_result.frontmatter.get('project'), undefined);
        });
      });
    });
  });
});
