// src: scripts/modules/__tests__/functional/load-entry-meta.functional.spec.ts
// @(#): loadEntryMeta の機能テスト
//       実ファイルを使ったメタデータ読み込みの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words setfm nofm noheader

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';

// ───  test target
import { loadEntryMeta } from '../../setfm-loader.ts';

// ─── テスト共通セットアップ ───────────────────────────────────────────────────
const MAX_BODY_CHARS = 1000; // loadEntryMeta 内の定数と同じ値を使用

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── フロントマターありのファイル ────────────────────────────────────────────

describe('loadEntryMeta', () => {
  describe('Given: フロントマターありの .md ファイル', () => {
    describe('When: loadEntryMeta(filePath) を呼び出す', () => {
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

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.sessionId, 'sess-001');
        });

        it('T-SF-LFM-01-02: date が "2026-03-15" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.date, '2026-03-15');
        });

        it('T-SF-LFM-01-03: project が "my-project" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.project, 'my-project');
        });

        it('T-SF-LFM-01-04: slug が "test-slug" になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.slug, 'test-slug');
        });

        it('T-SF-LFM-01-05: body が "# テスト" で始まる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, content);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.content.includes('# テスト'), true);
        });
      });
    });
  });

  // ─── 本文が MAX_BODY_CHARS を超える場合 ──────────────────────────────────

  describe('Given: 本文が MAX_BODY_CHARS を超えるファイル', () => {
    describe('When: loadEntryMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-02 - body が制限され fullBody は全文', () => {
        it('T-SF-LFM-02-01: body が MAX_BODY_CHARS 以下になる', async () => {
          const filePath = `${tempDir}/long.md`;
          const longBody = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 100);
          await Deno.writeTextFile(filePath, longBody);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('T-SF-LFM-02-02: fullBody が MAX_BODY_CHARS を超える', async () => {
          const filePath = `${tempDir}/long.md`;
          const longBody = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 100);
          await Deno.writeTextFile(filePath, longBody);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.fullBody.length > MAX_BODY_CHARS, true);
        });
      });
    });
  });

  // ─── ヘッダー行なし → null ───────────────────────────────────────────────

  describe('Given: "#" ヘッダー行のないファイル', () => {
    describe('When: loadEntryMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-03 - null が返る', () => {
        it('T-SF-LFM-03-01: null が返る', async () => {
          const filePath = `${tempDir}/noheader.md`;
          await Deno.writeTextFile(filePath, 'ヘッダーなしの本文テキスト');

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNull(result);
        });
      });
    });
  });

  // ─── 存在しないファイル → null ───────────────────────────────────────────

  describe('Given: 存在しないファイルパス', () => {
    describe('When: loadEntryMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-04 - null が返る（例外なし）', () => {
        it('T-SF-LFM-04-01: null が返る', async () => {
          const result = await loadEntryMeta(`${tempDir}/nonexistent.md`, MAX_BODY_CHARS);

          assertNull(result);
        });
      });
    });
  });

  // ─── フロントマターなし（ヘッダーのみ）→ meta フィールドが空文字 ─────────

  describe('Given: フロントマターのない .md ファイル（ヘッダーのみ）', () => {
    describe('When: loadEntryMeta(filePath) を呼び出す', () => {
      describe('Then: T-SF-LFM-05 - meta フィールドが空文字になる', () => {
        it('T-SF-LFM-05-01: sessionId が空文字になる', async () => {
          const filePath = `${tempDir}/nofm.md`;
          await Deno.writeTextFile(filePath, '# タイトル\n本文');

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.sessionId, '');
        });

        it('T-SF-LFM-05-02: date が空文字になる', async () => {
          const filePath = `${tempDir}/nofm.md`;
          await Deno.writeTextFile(filePath, '# タイトル\n本文');

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertEquals(result!.date, '');
        });
      });
    });
  });

  // ─── content の境界値エッジケース ────────────────────────────────────────

  describe('Given: 本文長が MAX_BODY_CHARS の境界値のファイル', () => {
    describe('When: loadEntryMeta(filePath, MAX_BODY_CHARS) を呼び出す', () => {
      describe('When: エッジケース', () => {
        it('[Edge] T-SF-LFM-06-01: 本文が MAX_BODY_CHARS-1 文字 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge1.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS - 1);
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('[Edge] T-SF-LFM-06-02: 本文が MAX_BODY_CHARS-1 文字 + 末尾改行 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge2.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS - 1) + '\n';
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('[Edge] T-SF-LFM-06-03: 本文が MAX_BODY_CHARS 文字 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge3.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS);
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('[Edge] T-SF-LFM-06-04: 本文が MAX_BODY_CHARS 文字 + 末尾改行 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge4.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS) + '\n';
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('[Edge] T-SF-LFM-06-05: 本文が MAX_BODY_CHARS+1 文字 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge5.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 1);
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });

        it('[Edge] T-SF-LFM-06-06: 本文が MAX_BODY_CHARS+1 文字 + 末尾改行 → content が MAX_BODY_CHARS 以下', async () => {
          const filePath = `${tempDir}/edge6.md`;
          const body = '# タイトル\n' + 'x'.repeat(MAX_BODY_CHARS + 1) + '\n';
          await Deno.writeTextFile(filePath, body);

          const result = await loadEntryMeta(filePath, MAX_BODY_CHARS);

          assertNotNull(result);
          assertEquals(result!.content.length <= MAX_BODY_CHARS, true);
        });
      });
    });
  });
});
