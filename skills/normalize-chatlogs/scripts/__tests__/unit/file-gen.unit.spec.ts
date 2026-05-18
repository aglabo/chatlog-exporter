// src: scripts/__tests__/unit/normalize-chatlogs.file-gen.unit.spec.ts
// @(#): ファイル生成・並列制御のユニットテスト
//       対象: withConcurrency, generateOutputFileName, generateSegmentFile, attachFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words aaabbbb

// Deno Test module
import { assertEquals, assertMatch, assertNotEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';

// test target
import { ChatlogFrontmatter } from '../../../../_scripts/classes/ChatlogFrontmatter.class.ts';
import { withConcurrency } from '../../../../_scripts/libs/parallel/concurrency.ts';
import {
  attachFrontmatter,
  generateOutputFileName,
  generateSegmentFile,
  START_BODY_HEADING,
} from '../../modules/segment-io.ts';

// ─── withConcurrency tests ─────────────────────────────────────────────────────

/**
 * withConcurrency のユニットテスト。
 * 指定した最大並列数でタスクを並行実行し、入力順に結果を返す関数の正常系・エッジケースを検証する。
 */
describe('withConcurrency', () => {
  /** 正常系: 並列数内のタスクを全件処理し、入力インデックス順に結果を返す */
  describe('[正常] Normal Cases', () => {
    it('T-01-01-01: Given 4タスク並列数4, When withConcurrency, Then 全4件が入力順に返る', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
        () => Promise.resolve(4),
      ];

      const result = await withConcurrency(tasks, 4);

      assertEquals(result, [1, 2, 3, 4]);
    });

    it('T-01-01-02: Given 6タスク(遅延時間が異なる)並列数2, When withConcurrency, Then 完了順に関わらず入力インデックス順に返る', async () => {
      const tasks = [0, 1, 2, 3, 4, 5].map((i) => () =>
        new Promise<number>((resolve) => setTimeout(() => resolve(i), (6 - i) * 10))
      );

      const result = await withConcurrency(tasks, 2);

      assertEquals(result, [0, 1, 2, 3, 4, 5]);
    });
  });

  /** エッジケース: 空配列・並列数超過など境界条件でも正常動作する */
  describe('[エッジケース] Edge Cases', () => {
    it('T-01-02-01: Given 空のタスク配列と並列数4, When withConcurrency, Then エラーなく空配列が返される', async () => {
      const tasks: (() => Promise<never>)[] = [];

      const result = await withConcurrency(tasks, 4);

      assertEquals(result, []);
    });

    it('T-01-02-02: Given 2タスクと並列数10, When withConcurrency, Then 両タスクが完了し結果が返される', async () => {
      const tasks = [
        () => Promise.resolve('a'),
        () => Promise.resolve('b'),
      ];

      const result = await withConcurrency(tasks, 10);

      assertEquals(result, ['a', 'b']);
    });
  });
});

// ─── generateOutputFileName tests ─────────────────────────────────────────────

/**
 * generateOutputFileName のユニットテスト。
 * `<baseName>-<XX>-<hash7>.md` 形式の出力ファイル名を生成する関数の
 * フォーマット・連番・ハッシュのランダム性を検証する。
 *
 * hash7 は `<baseName>-<XX>-<timestamp12>-<random8>` の SHA-256 先頭 7 文字。
 * ランダム要素を含むため、`crypto.getRandomValues` をスタブして再現性を担保する。
 */
describe('generateOutputFileName', () => {
  let cryptoStub: Stub | null = null;

  /** 固定バイト列スタブをセットする。テストが自前で restore した場合は null にしておく。 */
  function setupCryptoStub(): void {
    cryptoStub = stub(crypto, 'getRandomValues', (arr: ArrayBufferView) => {
      const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < u8.length; i++) {
        u8[i] = i;
      }
      return arr;
    });
  }

  beforeEach(() => {
    setupCryptoStub();
  });

  afterEach(() => {
    if (cryptoStub !== null) {
      cryptoStub.restore();
      cryptoStub = null;
    }
  });

  /** 正常系: `<baseName>-<XX>-<hash7>.md` 形式のファイル名を返す */
  describe('Given: 標準的な chatlog ファイルパスと index', () => {
    it('T-06-01-01: index=0 のとき <baseName>-01-<hash7>.md 形式のファイル名を返す', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 0);

      assertMatch(result, /^test-file-01-[0-9a-f]{7}\.md$/);
    });

    it('T-06-01-02: index=1 のとき連番が "02" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 1);

      assertMatch(result, /^test-file-02-[0-9a-f]{7}\.md$/);
    });

    it('T-06-01-03: index=9 のとき連番が "10" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 9);

      assertMatch(result, /^test-file-10-[0-9a-f]{7}\.md$/);
    });
  });

  /** 正常系: スタブ固定 + 日付固定で同一入力が同一結果を返す（再現性） */
  describe('Given: crypto と Date をスタブして固定した状態', () => {
    it('T-06-02-01: 同一タイムスタンプと固定ランダム値で常に同じファイル名が返る', async () => {
      const dateStubs = [
        stub(Date.prototype, 'getFullYear', () => 2026),
        stub(Date.prototype, 'getMonth', () => 2),
        stub(Date.prototype, 'getDate', () => 11),
        stub(Date.prototype, 'getHours', () => 10),
        stub(Date.prototype, 'getMinutes', () => 30),
        stub(Date.prototype, 'getSeconds', () => 0),
      ];

      try {
        const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

        const first = await generateOutputFileName(filePath, 0);
        const second = await generateOutputFileName(filePath, 0);

        assertEquals(first, second);
        assertMatch(first, /^test-file-01-[0-9a-f]{7}\.md$/);
      } finally {
        dateStubs.forEach((s) => s.restore());
      }
    });
  });

  /** 正常系: スタブなしで同一入力でも異なるハッシュが生成される（ランダム性） */
  describe('Given: crypto.getRandomValues をスタブせず実際の乱数を使う', () => {
    it('T-06-03-01: スタブなしで 2 回呼ぶと異なるファイル名が生成される', async () => {
      cryptoStub!.restore();
      cryptoStub = null;
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const first = await generateOutputFileName(filePath, 0);
      const second = await generateOutputFileName(filePath, 0);

      assertNotEquals(first, second);
      assertMatch(first, /^test-file-01-[0-9a-f]{7}\.md$/);
      assertMatch(second, /^test-file-01-[0-9a-f]{7}\.md$/);
    });
  });

  /** 正常系: 末尾ハッシュ付きのソースファイルでもベース名が正しく抽出される */
  describe('Given: 末尾に -XXXXXXX ハッシュを含むソースファイルパス', () => {
    it('T-06-04-01: ソースの末尾ハッシュを除去したベース名で出力名を生成する', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = await generateOutputFileName(filePath, 0);

      assertMatch(result, /^2026-03-11-topic-01-[0-9a-f]{7}\.md$/);
    });
  });
});

// ─── generateSegmentFile tests ────────────────────────────────────────────────

/**
 * generateSegmentFile のユニットテスト。
 * セグメントオブジェクト `{title, summary, body}` から Markdown ファイルコンテンツを生成する関数の
 * 正常系・エッジケースを検証する。
 */
describe('generateSegmentFile', () => {
  /** 正常系: summary フィールドが `## Summary` セクションとして出力される */
  describe('Given: { title: "Fix CI pipeline", summary: "Fix CI pipeline", body: "..." } を持つセグメント', () => {
    it('T-11-01-01: 返却文字列に `## Summary\\nFix CI pipeline` が含まれる', () => {
      const seg = { title: 'Fix CI pipeline', summary: 'Fix CI pipeline', content: '### User\nHow do I fix CI?' };

      const result = generateSegmentFile(seg);

      assertEquals(result.includes('## Summary\n\nFix CI pipeline'), true);
    });
  });

  /** 正常系: body フィールドが START_BODY_HEADING セクションとして出力される */
  describe('Given: { title: "Debug session", summary: "Debug session", body: "..." } を持つセグメント', () => {
    it('T-11-01-02: 返却文字列に START_BODY_HEADING + "\\n### User\\nHow do I..." が含まれる', () => {
      const seg = { title: 'Debug session', summary: 'Debug session', content: '### User\nHow do I...' };

      const result = generateSegmentFile(seg);

      assertEquals(result.includes(START_BODY_HEADING + '\n\n### User\nHow do I...'), true);
    });
  });

  /** エッジケース: 全フィールドが空でも `## Summary` と START_BODY_HEADING 見出しを含む文字列を返す */
  describe('Given: { title: "", summary: "", body: "" } を持つセグメント', () => {
    it('T-11-02-01: 返却文字列に `## Summary` と START_BODY_HEADING の両セクション見出しが含まれる', () => {
      const seg = { title: '', summary: '', content: '' };

      const result = generateSegmentFile(seg);

      assertEquals(result.includes('## Summary'), true);
      assertEquals(result.includes(START_BODY_HEADING), true);
    });
  });
});

// ─── attachFrontmatter tests ──────────────────────────────────────────────────

/**
 * attachFrontmatter のユニットテスト。
 * ChatlogFrontmatter インスタンスとセグメントメタデータを合成して `---` デリミタ付きフロントマターを
 * コンテンツの先頭に付加する関数の正常系・エッジケースを検証する。
 */
describe('attachFrontmatter', () => {
  /** 正常系: frontmatter の project フィールドを引き継ぎ、AI 生成フィールドを付加する */
  describe('Given: project を含む ChatlogFrontmatter と title・log_id・summary を含む segmentMeta', () => {
    it('T-12-01-01: 出力フロントマターに project: "ci-platform" が含まれる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'ci-platform');
      fm.set('date', '2026-03-01');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.includes('project: "ci-platform"'), true);
    });

    it('T-12-01-02: 出力フロントマターに title・log_id・summary が含まれる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'ci-platform');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.includes('title: "Fix CI"'), true);
      assertEquals(result.includes('log_id: "abc1234"'), true);
      assertEquals(result.includes('summary: "CI fix"'), true);
    });
  });

  /** エッジケース: frontmatter が空の場合は AI 生成フィールドのみを含む */
  describe('Given: 空の ChatlogFrontmatter と title・log_id・summary を含む segmentMeta', () => {
    it('T-12-02-01: 出力フロントマターが AI 生成フィールド（title・log_id・summary）のみを含む', () => {
      const fm = new ChatlogFrontmatter('');
      const segmentMeta = { title: 'Topic', log_id: 'aaabbbb', summary: 'Summary' };
      const content = '## Summary\nTopic content';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.includes('title: "Topic"'), true);
      assertEquals(result.includes('log_id: "aaabbbb"'), true);
      assertEquals(result.includes('summary: "Summary"'), true);
      assertEquals(result.includes('project:'), false);
    });
  });

  /** 正常系: 出力が `---` デリミタで囲まれた有効な Markdown フロントマターになる */
  describe('Given: 任意の ChatlogFrontmatter と segmentMeta', () => {
    it('T-12-03-01: 出力が `---\\n` で始まりフロントマターブロックが `\\n---\\n` で終わる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'test');
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.startsWith('---\n'), true);
      assertEquals(result.includes('\n---\n'), true);
    });

    it('T-12-03-02: コンテンツボディがフロントマターブロックの後に重複なく続く', () => {
      const fm = new ChatlogFrontmatter('');
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      const contentOccurrences = result.split('## Summary\ntext').length - 1;
      assertEquals(contentOccurrences, 1);
    });
  });
});
