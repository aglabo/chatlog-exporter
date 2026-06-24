// src: scripts/__tests__/unit/setfm-write.unit.spec.ts
// @(#): writeFrontmatter ユニットテスト
//       対象: writeFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { writeFrontmatter } from '../../modules/setfm-write.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { Stats } from '../../types/phase.types.ts';

// ─── Internal Helpers

// functions
/** テスト用 ChatlogEntry を markdown 文字列から生成する */
const _makeEntry = (md: string, filePath: string): ChatlogEntry => {
  return new ChatlogEntry(md, { filePath });
};

/** Stats の初期値を生成する */
const _makeStats = (): Stats => ({ total: 0, success: 0, fail: 0, skip: 0 });

// ─── Tests

/**
 * `writeFrontmatter` のユニットテストスイート。
 *
 * ファイル書き込み・dryRun・既存フロントマター保持・type/category 設定・title ガードを検証する。
 */
describe('writeFrontmatter', () => {
  let tempFile: string;

  beforeEach(async () => {
    tempFile = await Deno.makeTempFile({ suffix: '.md' });
  });

  afterEach(async () => {
    try {
      await Deno.remove(tempFile);
    } catch { /* ignore */ }
    try {
      await Deno.remove(tempFile + '.tmp');
    } catch { /* ignore */ }
  });

  // ─── T-01: dryRun=false でファイルが書き込まれる

  /**
   * title あり dryRun=false でファイルが書き込まれる
   */
  describe('When: dryRun=false で呼び出す', () => {
    /** 有効な title とともに dryRun=false で呼び出す正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-01-01: title フィールドが出力ファイルに反映される', async () => {
        const _md = '---\ntitle: "Old Title"\n---\n\nContent here.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('title', 'My Title');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('My Title'), true, 'title: "My Title" が出力ファイルに含まれていない');
      });

      it('[Normal] T-SF-WR-01-02: stats.success が 1 増加する', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.success, 1);
      });

      it('[Normal] T-SF-WR-01-03: stats.fail は増加しない', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 0);
      });
    });

    /** title がないとき fail が増加するエラーケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-01-04: title なし → stats.fail が 1 増加する、ファイル書き込みは行われない', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 1);
        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written, _original, 'ファイルが変更されている');
      });
    });

    /** frontmatter に複数フィールドがあるエッジケース */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-WR-01-05: frontmatter に複数フィールドが含まれる → すべてが出力 frontmatter に反映される', async () => {
        const _md = '---\ntitle: "A"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('title', 'A');
        _entry.frontmatter.set('summary', 'B');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('A'), true, 'title フィールドが含まれていない');
        assertEquals(_written.includes('B'), true, 'summary フィールドが含まれていない');
      });
    });
  });

  // ─── T-02: dryRun=true でファイルが変更されない

  /**
   * title あり dryRun=true でファイルが変更されない
   */
  describe('When: dryRun=true で呼び出す', () => {
    /** dryRun=true での正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-02-01: dryRun=true → 元のファイルは変更されない', async () => {
        const _original = '---\ntitle: "Original"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, true, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written, _original, 'dryRun=true でファイルが変更された');
      });

      it('[Normal] T-SF-WR-02-02: dryRun=true → stats.success が 1 増加する', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, true, _stats);

        assertEquals(_stats.success, 1);
      });
    });

    /** dryRun=true でも title なしはエラー */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-02-03: dryRun=true, title なし → stats.fail が 1 増加する', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, true, _stats);

        assertEquals(_stats.fail, 1);
      });
    });

    /** dryRun=true でも stats.skip は増加しない */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-WR-02-04: dryRun=true → stats.skip は増加しない（stats.success が増加する）', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, true, _stats);

        assertEquals(_stats.skip, 0);
        assertEquals(_stats.success, 1);
      });
    });
  });

  // ─── T-03: 既存の session_id / date / project / slug が出力に保持される

  /**
   * 既存の session_id / date / project / slug が出力に保持される
   */
  describe('When: 既存フロントマターフィールドが設定されている', () => {
    const _baseMd = [
      '---',
      'session_id: "abc123"',
      'date: "2026-01-15"',
      'project: "myProject"',
      'slug: "my-session"',
      '---',
      '',
      'Content.',
      '',
    ].join('\n');

    /** 既存フィールドが保持される正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-03-01: session_id が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _entry.frontmatter.set('title', 'Test');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('abc123'), true, 'session_id が含まれていない');
      });

      it('[Normal] T-SF-WR-03-02: date が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _entry.frontmatter.set('title', 'Test');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('2026-01-15'), true, 'date が含まれていない');
      });

      it('[Normal] T-SF-WR-03-03: project が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _entry.frontmatter.set('title', 'Test');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('myProject'), true, 'project が含まれていない');
      });

      it('[Normal] T-SF-WR-03-04: slug が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _entry.frontmatter.set('title', 'Test');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('my-session'), true, 'slug が含まれていない');
      });
    });

    /** すべての既存フィールドが保持されるエッジケース */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-WR-03-05: 4フィールドすべてが出力ファイルに保持される', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _entry.frontmatter.set('title', 'Test');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('abc123'), true, 'session_id が含まれていない');
        assertEquals(_written.includes('2026-01-15'), true, 'date が含まれていない');
        assertEquals(_written.includes('myProject'), true, 'project が含まれていない');
        assertEquals(_written.includes('my-session'), true, 'slug が含まれていない');
      });
    });

    /** title なしのとき既存フィールドは書き込まれない */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-03-06: title なし → 既存フィールドは書き込まれない（stats.fail が増加する）', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 1);
        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written, _baseMd, 'ファイルが変更されている');
      });
    });
  });

  // ─── T-04: entry.frontmatter の type / category が出力ファイルに反映される

  /**
   * entry.frontmatter の type / category が出力ファイルに反映される
   */
  describe('When: type と category を entry.frontmatter に設定して呼び出す', () => {
    /** type/category が出力ファイルに反映される正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-04-01: type="refactoring" → 出力ファイルに type: refactoring が含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('type', 'refactoring');
        _entry.frontmatter.set('category', 'architecture');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('refactoring'), true, 'type: refactoring が含まれていない');
      });

      it('[Normal] T-SF-WR-04-02: category="architecture" → 出力ファイルに category: architecture が含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('type', 'refactoring');
        _entry.frontmatter.set('category', 'architecture');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('architecture'), true, 'category: architecture が含まれていない');
      });
    });

    /** title なしのとき type/category は設定されない */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-04-04: title なし → type / category は設定されない（stats.fail が増加する）', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        _entry.frontmatter.set('type', 'refactoring');
        _entry.frontmatter.set('category', 'architecture');
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 1);
        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('refactoring'), false, 'type が設定されている');
        assertEquals(_written.includes('architecture'), false, 'category が設定されている');
      });
    });
  });

  // ─── T-05: title がないとき fail が増加しファイル書き込みが行われない

  /**
   * title がないとき stats.fail が増加しファイル書き込みが行われない
   */
  describe('When: entry.frontmatter に title がない', () => {
    /** title なしでエラーになるケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-05-01: title なし, dryRun=false → stats.fail が 1 増加する', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 1);
      });

      it('[Error] T-SF-WR-05-02: title なし, dryRun=false → ファイルへの書き込みは行われない', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written, _original, 'ファイルが変更されている');
      });
    });

    /** title がある場合は fail が増加しない正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-05-03: title あり → stats.fail は増加しない', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 0);
      });
    });
  });

  // ─── T-06: ファイル書き込みに失敗する（catch ブロック）

  /**
   * writeTextFile / rename が失敗したとき catch ブロックが実行される
   */
  describe('When: ファイル書き込みに失敗する', () => {
    /** 存在しないディレクトリへの書き込みが失敗するエラーケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-06-01: 存在しないディレクトリのパス → stats.fail が 1 増加する', async () => {
        const _filePath = '/nonexistent-dir-setfm-test/file.md';
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        const _entry = _makeEntry(_md, _filePath);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.fail, 1);
      });

      it('[Error] T-SF-WR-06-02: 存在しないディレクトリのパス → stats.success は増加しない', async () => {
        const _filePath = '/nonexistent-dir-setfm-test/file.md';
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        const _entry = _makeEntry(_md, _filePath);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        assertEquals(_stats.success, 0);
      });
    });
  });

  // ─── T-08: entry.frontmatter に配列値が含まれる

  /**
   * entry.frontmatter に配列値（tags/topics）が含まれるとき、出力ファイルに正しく反映される
   */
  describe('When: entry.frontmatter に配列値が含まれる', () => {
    /** frontmatter 配列値が出力ファイルに反映される正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-08-01: tags 配列 → 出力ファイルに各タグが含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('tags', ['tag1', 'tag2', 'tag3']);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('tag1'), true, 'tag1 が含まれていない');
        assertEquals(_written.includes('tag2'), true, 'tag2 が含まれていない');
        assertEquals(_written.includes('tag3'), true, 'tag3 が含まれていない');
      });

      it('[Normal] T-SF-WR-08-02: topics 配列 → 出力ファイルに各トピックが含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('topics', ['topic-a', 'topic-b']);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('topic-a'), true, 'topic-a が含まれていない');
        assertEquals(_written.includes('topic-b'), true, 'topic-b が含まれていない');
      });
    });

    /** tags と topics の両方が含まれるエッジケース */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-WR-08-03: tags と topics の両方が設定される → 両配列値が出力ファイルに含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('tags', ['tag1', 'tag2']);
        _entry.frontmatter.set('topics', ['topic-a', 'topic-b']);
        const _stats = _makeStats();

        await writeFrontmatter(_entry, false, _stats);

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('tag1'), true, 'tag1 が含まれていない');
        assertEquals(_written.includes('tag2'), true, 'tag2 が含まれていない');
        assertEquals(_written.includes('topic-a'), true, 'topic-a が含まれていない');
        assertEquals(_written.includes('topic-b'), true, 'topic-b が含まれていない');
      });
    });
  });
});
