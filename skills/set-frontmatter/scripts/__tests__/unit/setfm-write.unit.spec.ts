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
import { assertEquals, assertRejects } from '@std/assert';
import { dirname } from '@std/path';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { writeFrontmatter } from '../../modules/setfm-write.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';

// ─── Internal Helpers

// functions
/** テスト用 ChatlogEntry を markdown 文字列から生成する */
const _makeEntry = (md: string, filePath: string): ChatlogEntry => {
  return new ChatlogEntry(md, { filePath });
};

/**
 * テスト用の空キャッシュ（バッファバック）を生成する。
 *
 * ファイル I/O をせずにインメモリバッファで動作する `ChatlogWorks<SetfmCache>` を返す。
 * @returns 初期化済みの空キャッシュ
 */
const _makeEmptyCache = async (): Promise<ChatlogWorks<SetfmCache>> => {
  const buf = new Map<string, string>();
  const cache = new ChatlogWorks<SetfmCache>(
    'fm-cache',
    '/fake/cache',
    undefined,
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
        glob: () => Promise.resolve([]),
      },
    },
  );
  await cache.ready;
  return cache;
};

/** 5フィールドをすべて entry.frontmatter にセットするヘルパー。 */
const _setAllFields = (
  entry: ChatlogEntry,
  overrides: Partial<
    { type: string; category: string; title: string; topics: string[]; tags: string[] }
  > = {},
): void => {
  entry.frontmatter.set('type', overrides.type ?? 'tech');
  entry.frontmatter.set('category', overrides.category ?? 'backend');
  entry.frontmatter.set('title', overrides.title ?? 'Test Title');
  entry.frontmatter.set('topics', overrides.topics ?? ['topic-a']);
  entry.frontmatter.set('tags', overrides.tags ?? ['tag1']);
};

// ─── Tests

/**
 * `writeFrontmatter` のユニットテストスイート。
 *
 * ファイル書き込み・dryRun・既存フロントマター保持・type/category 設定・6フィールドガードを検証する。
 */
describe('writeFrontmatter', () => {
  let tempFile: string;
  let cacheDir: string;
  let cache: ChatlogWorks<SetfmCache>;

  beforeEach(async () => {
    tempFile = await Deno.makeTempFile({ suffix: '.md' });
    cacheDir = await Deno.makeTempDir();
    cache = await _makeEmptyCache();
  });

  afterEach(async () => {
    try {
      await Deno.remove(tempFile);
    } catch { /* ignore */ }
    try {
      await Deno.remove(tempFile + '.tmp');
    } catch { /* ignore */ }
    await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
  });

  // ─── T-00: 戻り値（成功時 true、失敗時 false）

  /**
   * writeFrontmatter が成功時に true、失敗時に false を返す
   */
  describe('When: 戻り値を確認する', () => {
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-00-01: 6フィールドあり → true を返す', async () => {
        const _md = '---\ntitle: "Test"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry);

        const result = await writeFrontmatter(
          _entry,
          await _makeEmptyCache(),
          dirname(tempFile),
          dirname(tempFile),
        );

        assertEquals(result, true);
      });
    });

    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-00-02: title なし → false を返す', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);

        const result = await writeFrontmatter(
          _entry,
          await _makeEmptyCache(),
          dirname(tempFile),
          dirname(tempFile),
        );

        assertEquals(result, false);
      });
    });
  });

  // ─── T-01: ファイルが書き込まれる

  /**
   * 6フィールドあり でファイルが書き込まれる
   */
  describe('When: 6フィールドありで呼び出す', () => {
    /** 有効な6フィールドとともに呼び出す正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-01-01: title フィールドが出力ファイルに反映される', async () => {
        const _md = '---\ntitle: "Old Title"\n---\n\nContent here.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry, { title: 'My Title' });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('My Title'), true, 'title: "My Title" が出力ファイルに含まれていない');
      });

      it('[Normal] T-SF-WR-01-02: 成功時に true を返す', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, true);
      });

      it('[Normal] T-SF-WR-01-03: 成功時に false を返さない', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok !== false, true);
      });
    });

    /** title がないとき false が返るエラーケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-01-04: title なし → false を返す、ファイル書き込みは行われない', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, false);
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
        _setAllFields(_entry, { title: 'A', topics: ['topic-x'] });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('A'), true, 'title フィールドが含まれていない');
        assertEquals(_written.includes('topic-x'), true, 'topics フィールドが含まれていない');
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
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('abc123'), true, 'session_id が含まれていない');
      });

      it('[Normal] T-SF-WR-03-02: date が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('2026-01-15'), true, 'date が含まれていない');
      });

      it('[Normal] T-SF-WR-03-03: project が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('myProject'), true, 'project が含まれていない');
      });

      it('[Normal] T-SF-WR-03-04: slug が出力ファイルの frontmatter に含まれる', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('my-session'), true, 'slug が含まれていない');
      });
    });

    /** すべての既存フィールドが保持されるエッジケース */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-WR-03-05: 4フィールドすべてが出力ファイルに保持される', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('abc123'), true, 'session_id が含まれていない');
        assertEquals(_written.includes('2026-01-15'), true, 'date が含まれていない');
        assertEquals(_written.includes('myProject'), true, 'project が含まれていない');
        assertEquals(_written.includes('my-session'), true, 'slug が含まれていない');
      });
    });

    /** title なしのとき既存フィールドは書き込まれない */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-03-06: title なし → 既存フィールドは書き込まれない（false を返す）', async () => {
        await Deno.writeTextFile(tempFile, _baseMd);
        const _entry = _makeEntry(_baseMd, tempFile);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, false);
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
        _setAllFields(_entry, { type: 'refactoring', category: 'architecture' });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('refactoring'), true, 'type: refactoring が含まれていない');
      });

      it('[Normal] T-SF-WR-04-02: category="architecture" → 出力ファイルに category: architecture が含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry, { type: 'refactoring', category: 'architecture' });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('architecture'), true, 'category: architecture が含まれていない');
      });
    });

    /** title なしのとき type/category は設定されない */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-04-04: title なし → type / category は設定されない（false を返す）', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);
        _entry.frontmatter.set('type', 'refactoring');
        _entry.frontmatter.set('category', 'architecture');

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, false);
        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('refactoring'), false, 'type が設定されている');
        assertEquals(_written.includes('architecture'), false, 'category が設定されている');
      });
    });
  });

  // ─── T-05: title がないとき false が返りファイル書き込みが行われない

  /**
   * title がないとき false が返りファイル書き込みが行われない
   */
  describe('When: entry.frontmatter に title がない', () => {
    /** title なしでエラーになるケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-05-01: title なし, dryRun=false → false を返す', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, false);
      });

      it('[Error] T-SF-WR-05-02: title なし, dryRun=false → ファイルへの書き込みは行われない', async () => {
        const _original = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _original);
        const _entry = _makeEntry(_original, tempFile);

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written, _original, 'ファイルが変更されている');
      });
    });

    /** title がある場合は true が返る正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-05-03: 6フィールドあり → true を返す', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry);

        const _ok = await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        assertEquals(_ok, true);
      });
    });
  });

  // ─── T-06: outputDir が存在しないサブディレクトリでも自動作成される

  /**
   * outputDir 配下の存在しないサブディレクトリは自動作成されてファイルが書き込まれる
   */
  describe('When: outputDir が存在しないサブディレクトリを含む', () => {
    let tempInputDir: string;
    let tempOutputDir: string;

    beforeEach(async () => {
      tempInputDir = await Deno.makeTempDir();
      tempOutputDir = await Deno.makeTempDir();
    });

    afterEach(async () => {
      await Deno.remove(tempInputDir, { recursive: true }).catch(() => {});
      await Deno.remove(tempOutputDir, { recursive: true }).catch(() => {});
    });

    /** outputDir 配下のサブディレクトリが自動作成される正常ケース */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-WR-06-01: outputDir 配下のサブディレクトリが自動作成されて true が返る', async () => {
        const _subDir = `${tempInputDir}/sub`;
        await Deno.mkdir(_subDir);
        const _filePath = `${_subDir}/file.md`;
        const _md = '---\ntitle: "Test"\n---\n\nContent.\n';
        await Deno.writeTextFile(_filePath, _md);
        const _entry = _makeEntry(_md, _filePath);
        _setAllFields(_entry);

        const _ok = await writeFrontmatter(_entry, cache, tempOutputDir, tempInputDir);

        assertEquals(_ok, true);
      });

      it('[Normal] T-SF-WR-06-02: outputDir 配下のサブディレクトリに出力ファイルが作成される', async () => {
        const _subDir = `${tempInputDir}/sub`;
        await Deno.mkdir(_subDir);
        const _filePath = `${_subDir}/file.md`;
        const _md = '---\ntitle: "Test"\n---\n\nContent.\n';
        await Deno.writeTextFile(_filePath, _md);
        const _entry = _makeEntry(_md, _filePath);
        _setAllFields(_entry);

        await writeFrontmatter(_entry, cache, tempOutputDir, tempInputDir);

        const _outputPath = `${tempOutputDir}/sub/file.md`;
        const _written = await Deno.readTextFile(_outputPath);
        assertEquals(_written.includes('Test'), true);
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
        _setAllFields(_entry, { tags: ['tag1', 'tag2', 'tag3'] });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('tag1'), true, 'tag1 が含まれていない');
        assertEquals(_written.includes('tag2'), true, 'tag2 が含まれていない');
        assertEquals(_written.includes('tag3'), true, 'tag3 が含まれていない');
      });

      it('[Normal] T-SF-WR-08-02: topics 配列 → 出力ファイルに各トピックが含まれる', async () => {
        const _md = '---\ntitle: "Old"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry, { topics: ['topic-a', 'topic-b'] });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

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
        _setAllFields(_entry, { tags: ['tag1', 'tag2'], topics: ['topic-a', 'topic-b'] });

        await writeFrontmatter(_entry, cache, dirname(tempFile), dirname(tempFile));

        const _written = await Deno.readTextFile(tempFile);
        assertEquals(_written.includes('tag1'), true, 'tag1 が含まれていない');
        assertEquals(_written.includes('tag2'), true, 'tag2 が含まれていない');
        assertEquals(_written.includes('topic-a'), true, 'topic-a が含まれていない');
        assertEquals(_written.includes('topic-b'), true, 'topic-b が含まれていない');
      });
    });
  });

  // ─── T-15: 6フィールドなし (cache にも6フィールドなし) → false を返し cache.status は WRITTEN にならない

  /**
   * cache も含め6フィールドなしの場合 false を返し cache.status は WRITTEN にならない
   */
  describe('When: cache 空で entry に6フィールドもない', () => {
    /** 6フィールドなしで false を返し cache は更新されない異常ケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-15-01: cache 空, entry に title なし → false を返す, cache.status !== "written"', async () => {
        const _md = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        const _cache = await _makeEmptyCache();

        const result = await writeFrontmatter(_entry, _cache, dirname(tempFile), dirname(tempFile));

        assertEquals(result, false, 'false を返さなかった');
        assertEquals(_cache.read(tempFile).status !== 'written', true, 'cache.status が written になった');
      });
    });
  });

  // ─── T-16: ファイル書き込みエラー時に例外が throw される

  /**
   * ファイル書き込みで I/O エラーが発生した場合に例外が throw される。
   * 一時ファイル（.tmp）はクリーンアップされる。
   */
  describe('When: ファイル書き込みで I/O エラーが発生する', () => {
    /** I/O エラー時に throw するエラーケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-16-01: Deno.rename が失敗 → 例外が throw され .tmp は削除される', async () => {
        const _md = '---\ntitle: "T"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _setAllFields(_entry);

        const _ioError = new Error('rename failed');
        const _renameStub = stub(Deno, 'rename', () => Promise.reject(_ioError));
        const _cache = await _makeEmptyCache();
        try {
          await assertRejects(
            () => writeFrontmatter(_entry, _cache, dirname(tempFile), dirname(tempFile)),
            Error,
            'rename failed',
          );
        } finally {
          _renameStub.restore();
        }

        // .tmp ファイルが削除されていることを確認
        const _tmpPath = tempFile + '.tmp';
        let _tmpExists = false;
        try {
          await Deno.stat(_tmpPath);
          _tmpExists = true;
        } catch {
          _tmpExists = false;
        }
        assertEquals(_tmpExists, false, '.tmp ファイルが残っている');
      });
    });
  });

  // ─── T-17: 5フィールド不足時に false を返す

  /**
   * 5フィールド（type/category/title/topics/tags）のいずれかが欠けているとき false を返す。
   */
  describe('When: 6フィールドの一部が欠けている', () => {
    /** フィールド不足でフィールドチェックを通過しないエラーケース */
    describe('When: 異常系', () => {
      it('[Error] T-SF-WR-17-01: title のみ → false を返す（topics/tags/type/category 欠如）', async () => {
        const _md = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('title', 'OnlyTitle');

        const result = await writeFrontmatter(
          _entry,
          await _makeEmptyCache(),
          dirname(tempFile),
          dirname(tempFile),
        );

        assertEquals(result, false, 'フィールド不足なのに true を返した');
      });

      it('[Error] T-SF-WR-17-02: 4フィールドあり（tags 欠如）→ false を返す', async () => {
        const _md = '---\nsession_id: "x"\n---\n\nContent.\n';
        await Deno.writeTextFile(tempFile, _md);
        const _entry = _makeEntry(_md, tempFile);
        _entry.frontmatter.set('type', 'tech');
        _entry.frontmatter.set('category', 'backend');
        _entry.frontmatter.set('title', 'T');
        _entry.frontmatter.set('topics', ['topic-a']);
        // tags なし

        const result = await writeFrontmatter(
          _entry,
          await _makeEmptyCache(),
          dirname(tempFile),
          dirname(tempFile),
        );

        assertEquals(result, false, 'tags 欠如なのに true を返した');
      });
    });
  });
});
