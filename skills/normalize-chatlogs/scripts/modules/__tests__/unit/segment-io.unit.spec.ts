// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/segment-io.unit.spec.ts
// @(#): segment-io モジュールのユニットテスト
//       対象: extractSegmentBaseName, generateOutputFileName, generateSegmentFile, attachFrontmatter, writeSegmentToFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words aaabbbb

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  attachFrontmatter,
  extractSegmentBaseName,
  generateOutputFileName,
  generateSegmentFile,
  START_BODY_HEADING,
  writeSegmentToFile,
} from '../../segment-io.ts';

// ─── Helpers
import { assertFileExist } from '../../../../../_scripts/__tests__/helpers/assert.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../../../_scripts/classes/ChatlogFrontmatter.class.ts';

// ─── Tests

// ─── extractSegmentBaseName tests ────────────────────────────────────────────────────

/**
 * `extractSegmentBaseName` のユニットテストスイート。
 *
 * ファイルパスからディレクトリ・拡張子・末尾ハッシュ(-XXXXXXX)を除去して
 * ベース名を返す純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-05-01-01 〜 T-05-02-02
 *
 * @see extractSegmentBaseName
 */
describe('extractSegmentBaseName', () => {
  /** ディレクトリ・.md 拡張子・末尾 7 桁ハッシュを除去する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-05-01-01: ディレクトリと .md 拡張子を除去したファイル名を返す', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, 'test-file');
    });

    it('[Normal] T-05-01-02: 末尾の -XXXXXXX (7桁 hex) を除去する', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });

    it('[Normal] T-05-01-03: 末尾が 7 桁 hex でない場合はハッシュ除去しない', () => {
      const filePath = 'path/to/2026-03-11-topic.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });
  });

  /** ディレクトリなし・拡張子なしの境界条件ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-05-02-01: ディレクトリなしでも .md 拡張子を除去して返す', () => {
      const result = extractSegmentBaseName('simple-file.md');

      assertEquals(result, 'simple-file');
    });

    it('[Edge] T-05-02-02: 拡張子がない場合はファイル名をそのまま返す', () => {
      const result = extractSegmentBaseName('no-extension');

      assertEquals(result, 'no-extension');
    });
  });
});

// ─── generateOutputFileName tests ─────────────────────────────────────────────

/**
 * `generateOutputFileName` のユニットテストスイート。
 *
 * `<baseName>-<XX>-<hash7>.md` 形式の出力ファイル名を生成する関数の
 * フォーマット・連番・ハッシュ注入を検証する。
 *
 * hash7 は `hashFn` 引数として注入した値が使われる。
 * `hashFn` 未指定時は `generateHash(baseName, { length: 7 })` で SHA-256 由来の 7 文字ハッシュを返す。
 *
 * テスト ID 範囲: T-06-01-01 〜 T-06-04-01
 *
 * @see generateOutputFileName
 */
describe('generateOutputFileName', () => {
  let hashFn: () => string;

  beforeEach(() => {
    hashFn = () => 'abc1234';
  });

  /** 標準的な chatlog ファイルパスと index から正しいフォーマットのファイル名を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-06-01-01: index=0 のとき hashFn 戻り値を使い <baseName>-01-<hash7>.md を返す', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 0, hashFn);

      assertEquals(result, 'test-file-01-abc1234.md');
    });

    it('[Normal] T-06-01-02: index=1 のとき連番が "02" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 1, hashFn);

      assertEquals(result, 'test-file-02-abc1234.md');
    });

    it('[Normal] T-06-01-03: index=9 のとき連番が "10" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 9, hashFn);

      assertEquals(result, 'test-file-10-abc1234.md');
    });

    it('[Normal] T-06-04-01: ソースの末尾ハッシュを除去したベース名で出力名を生成する', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = await generateOutputFileName(filePath, 0, hashFn);

      assertEquals(result, '2026-03-11-topic-01-abc1234.md');
    });
  });
});

// ─── generateSegmentFile tests ────────────────────────────────────────────────

/**
 * `generateSegmentFile` のユニットテストスイート。
 *
 * セグメントオブジェクト `{title, summary, content}` から Markdown ファイルコンテンツを生成する関数の
 * 正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-11-01-01 〜 T-11-02-01
 *
 * @see generateSegmentFile
 */
describe('generateSegmentFile', () => {
  /** summary・content フィールドが正しいセクションとして出力される正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-11-01-01: 返却文字列に `## Summary\\nFix CI pipeline` が含まれる', () => {
      const seg = { title: 'Fix CI pipeline', summary: 'Fix CI pipeline', content: '### User\nHow do I fix CI?' };

      const result = generateSegmentFile(seg);

      assert(result.includes('## Summary\n\nFix CI pipeline'));
    });

    it('[Normal] T-11-01-02: 返却文字列に START_BODY_HEADING + "\\n### User\\nHow do I..." が含まれる', () => {
      const seg = { title: 'Debug session', summary: 'Debug session', content: '### User\nHow do I...' };

      const result = generateSegmentFile(seg);

      assert(result.includes(START_BODY_HEADING + '\n\n### User\nHow do I...'));
    });
  });

  /** 全フィールドが空でも両セクション見出しを含む文字列を返すエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-11-02-01: 返却文字列に `## Summary` と START_BODY_HEADING の両セクション見出しが含まれる', () => {
      const seg = { title: '', summary: '', content: '' };

      const result = generateSegmentFile(seg);

      assert(result.includes('## Summary'));
      assert(result.includes(START_BODY_HEADING));
    });
  });
});

// ─── attachFrontmatter tests ──────────────────────────────────────────────────

/**
 * `attachFrontmatter` のユニットテストスイート。
 *
 * ChatlogFrontmatter インスタンスとセグメントメタデータを合成して `---` デリミタ付きフロントマターを
 * コンテンツの先頭に付加する関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-12-01-01 〜 T-12-03-02
 *
 * @see attachFrontmatter
 */
describe('attachFrontmatter', () => {
  /** project フィールドを引き継ぎ、AI 生成フィールドを付加する正常ケース。 */
  describe('When: 正常系', () => {
    let fm: ChatlogFrontmatter;

    beforeEach(() => {
      fm = new ChatlogFrontmatter('');
    });

    it('[Normal] T-12-01-01: 出力フロントマターに project: "ci-platform" が含まれる', () => {
      fm.set('project', 'ci-platform');
      fm.set('date', '2026-03-01');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('project: "ci-platform"'));
    });

    it('[Normal] T-12-01-02: 出力フロントマターに title・log_id が含まれ summary は含まれない', () => {
      fm.set('project', 'ci-platform');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('title: "Fix CI"'));
      assert(result.includes('log_id: "abc1234"'));
      assertFalse(result.includes('summary:'));
    });

    it('[Normal] T-12-03-01: 出力が `---\\n` で始まりフロントマターブロックが `\\n---\\n` で終わる', () => {
      fm.set('project', 'test');
      const segmentMeta = { title: 'T', log_id: 'x' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.startsWith('---\n'));
      assert(result.includes('\n---\n'));
    });

    it('[Normal] T-12-03-02: コンテンツボディがフロントマターブロックの後に重複なく続く', () => {
      const segmentMeta = { title: 'T', log_id: 'x' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      const contentOccurrences = result.split('## Summary\ntext').length - 1;
      assertEquals(contentOccurrences, 1);
    });
  });

  /** frontmatter が空の場合は AI 生成フィールドのみを含むエッジケース。 */
  describe('When: エッジケース', () => {
    let fm: ChatlogFrontmatter;

    beforeEach(() => {
      fm = new ChatlogFrontmatter('');
    });

    it('[Edge] T-12-02-01: 出力フロントマターが AI 生成フィールド（title・log_id）のみを含む', () => {
      const segmentMeta = { title: 'Topic', log_id: 'aaabbbb' };
      const content = '## Summary\nTopic content';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('title: "Topic"'));
      assert(result.includes('log_id: "aaabbbb"'));
      assertFalse(result.includes('summary:'));
      assertFalse(result.includes('project:'));
    });
  });
});

// ─── writeSegmentToFile tests ────────────────────────────────────────────────

/**
 * `writeSegmentToFile` のユニットテストスイート。
 *
 * 1セグメントをファイルに書き出すロジック（バックアップ動作）を検証する。
 * dryRun 判定・`stats` 加算は呼び出し元（`phase-write.ts`）の責務であり、この関数は
 * 出力のみを行う。
 *
 * テスト ID 範囲: T-SIO-WS-01 〜 T-SIO-WS-07
 *
 * @see writeSegmentToFile
 */
describe('writeSegmentToFile', () => {
  let outputDir: string;
  let filePath: string;
  let segment: { title: string; summary: string; content: string };
  let frontmatter: ChatlogFrontmatter;
  let hashFn: () => string;

  beforeEach(async () => {
    outputDir = await Deno.makeTempDir({ prefix: 'write-segment-test-' });
    filePath = `${outputDir}/sample.md`;
    segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
    frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
    hashFn = () => 'testhash';
  });

  afterEach(async () => {
    await Deno.remove(outputDir, { recursive: true });
  });

  /** 正常系: ファイル書き込みを検証する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SIO-WS-01: outputFileName のファイルが書き込まれる', async () => {
      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, hashFn);

      // assert
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await assertFileExist(expectedFile);
    });

    it('[Normal] T-SIO-WS-02: 既存ファイルがある場合 .old-01.md にバックアップされ新ファイルが書かれる', async () => {
      // arrange — 既存ファイルを事前作成
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'old content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, hashFn);

      // assert
      await assertFileExist(`${outputDir}/sample-01-testhash.old-01.md`);
      await assertFileExist(expectedFile);
    });

    it('[Normal] T-SIO-WS-04: 返されたパスが元の filePath とは異なる（入力ファイルを上書きしていない）', async () => {
      // act
      const returnedPath = await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, hashFn);

      // assert
      assertNotEquals(returnedPath, filePath);
      assertFalse(returnedPath.includes(filePath));
    });
  });

  /** 異常系: outputPath が filePath を含む場合は ChatlogError をスローする。 */
  describe('When: 異常系', () => {
    it('[Error] T-SIO-WS-05: outputPath が filePath を含むとき ChatlogError(ForbiddenOutput) をスローする', async () => {
      // filePath を outputDir として渡すと outputPath = `${filePath}/${outputFileName}` になり
      // outputPath.includes(filePath) が true になる
      const err = await assertRejects(
        () => writeSegmentToFile(filePath, filePath, 0, segment, frontmatter, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'OverwriteInput');
    });
  });

  /** エッジケース: バックアップの境界値を検証する。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SIO-WS-06: old-98.md が存在するとき old-99.md にバックアップして成功する', async () => {
      // arrange — old-98.md を事前作成（これが最大 index → next=99）
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(`${outputDir}/sample-01-testhash.old-98.md`, 'backup 98 content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, hashFn);

      // assert
      await assertFileExist(`${outputDir}/sample-01-testhash.old-99.md`);
    });

    it('[Error] T-SIO-WS-07: old-99.md が存在するとき TooManyBackups エラーをスローする', async () => {
      // arrange — old-99.md を事前作成（next=100 > 99 → エラー）
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(`${outputDir}/sample-01-testhash.old-99.md`, 'backup 99 content');

      // act / assert
      const err = await assertRejects(
        () => writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'IndexOverflow');
    });
  });
});
