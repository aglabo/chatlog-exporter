// src: scripts/__tests__/functional/load-frontmatter-file-meta.functional.spec.ts
// @(#): loadFrontmatterFileMeta の機能テスト
//       実ファイルを使ったメタデータ読み込みの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../_scripts/__tests__/helpers/assert.ts';

// test target
import { loadFrontmatterFileMeta, MAX_BODY_CHARS } from '../../set-frontmatter.ts';

// ─── テスト共通セットアップ ───────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── フロントマターありのファイル ────────────────────────────────────────────

describe('loadFrontmatterFileMeta', () => {
  describe('Given: フロントマターありの .md ファイル', () => {
    describe('When: loadFrontmatterFileMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-01 - フロントマターフィールドが正しく読み込まれる', () => {
        const content = [
          '---',
          'session_id: sess-001',
          'date: 2026-03-15',
          'project: my-project',
          'slug: test-slug',
          '---',
          '',
          '# テスト',
          '本文テキスト',
        ].join('\n');

        it('T-SF-LFM-01-01: sessionId が "sess-001" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadFrontmatterFileMeta(filePath);

          assertNotNull(result);
          assertEquals(result!.sessionId, 'sess-001');
        });

        it('T-SF-LFM-01-02: date が "2026-03-15" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.date, '2026-03-15');
        });

        it('T-SF-LFM-01-03: project が "my-project" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.project, 'my-project');
        });

        it('T-SF-LFM-01-04: slug が "test-slug" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.slug, 'test-slug');
        });

        it('T-SF-LFM-01-05: body が "# テスト" で始まる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.content.includes('# テスト'), true);
        });
      });
    });
  });

  // ─── 本文が MAX_BODY_CHARS を超える場合 ──────────────────────────────────

  describe('Given: 本文が MAX_BODY_CHARS を超えるファイル', () => {
    describe('When: loadFrontmatterFileMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-02 - body が制限され fullBody は全文', () => {
        it('T-SF-LFM-02-01: body が MAX_BODY_CHARS 以下になる', async () => {
          const filePath = `${tempDir}/long.md`;
          const longBody = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 100);
          await Deno.writeTextFile(filePath, longBody);

          const result = await loadFrontmatterFileMeta(filePath);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('T-SF-LFM-02-02: fullBody が MAX_BODY_CHARS を超える', async () => {
          const filePath = `${tempDir}/long.md`;
          const longBody = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 100);
          await Deno.writeTextFile(filePath, longBody);

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.fullBody.length > MAX_BODY_CHARS, true);
        });
      });
    });
  });

  // ─── ヘッダー行なし → null ───────────────────────────────────────────────

  describe('Given: "#" ヘッダー行のないファイル', () => {
    describe('When: loadFrontmatterFileMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-03 - null が返る', () => {
        it('T-SF-LFM-03-01: null が返る', async () => {
          const filePath = `${tempDir}/noheader.md`;
          await Deno.writeTextFile(filePath, 'ヘッダーなしの本文テキスト');

          const result = await loadFrontmatterFileMeta(filePath);

          assertNull(result);
        });
      });
    });
  });

  // ─── 存在しないファイル → null ───────────────────────────────────────────

  describe('Given: 存在しないファイルパス', () => {
    describe('When: loadFrontmatterFileMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-04 - null が返る（例外なし）', () => {
        it('T-SF-LFM-04-01: null が返る', async () => {
          const result = await loadFrontmatterFileMeta(`${tempDir}/nonexistent.md`);

          assertNull(result);
        });
      });
    });
  });

  // ─── フロントマターなし（ヘッダーのみ）→ meta フィールドが空文字 ─────────

  describe('Given: フロントマターのない .md ファイル（ヘッダーのみ）', () => {
    describe('When: loadFrontmatterFileMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-05 - meta フィールドが空文字になる', () => {
        it('T-SF-LFM-05-01: sessionId が空文字になる', async () => {
          const filePath = `${tempDir}/nofm.md`;
          await Deno.writeTextFile(filePath, '# タイトル\n本文');

          const result = await loadFrontmatterFileMeta(filePath);

          assertNotNull(result);
          assertEquals(result!.sessionId, '');
        });

        it('T-SF-LFM-05-02: date が空文字になる', async () => {
          const filePath = `${tempDir}/nofm.md`;
          await Deno.writeTextFile(filePath, '# タイトル\n本文');

          const result = await loadFrontmatterFileMeta(filePath);

          assertEquals(result!.date, '');
        });
      });
    });
  });
});
