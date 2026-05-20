// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/segment-io.unit.spec.ts
// @(#): segment-io モジュールのユニットテスト
//       対象: extractSegmentBaseName, generateOutputFileName, generateSegmentFile, attachFrontmatter, segmentChatlogs, segmentChatlogsBatch, writeSegmentToFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words aaabbbb

// ─── BDD modules
import { assertEquals, assertFalse, assertMatch, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import {
  attachFrontmatter,
  extractSegmentBaseName,
  generateOutputFileName,
  generateSegmentFile,
  segmentChatlogs,
  segmentChatlogsBatch,
  START_BODY_HEADING,
  writeSegmentToFile,
} from '../../segment-io.ts';

// ─── Helpers
import { assertNull } from '../../../../../_scripts/libs/testing/assert.ts';
// mock helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../../../_scripts/classes/ChatlogFrontmatter.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import type { Stats } from '../../../types/normalize.types.ts';

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
 * フォーマット・連番・ハッシュのランダム性を検証する。
 *
 * hash7 は `<baseName>-<XX>-<timestamp12>-<random8>` の SHA-256 先頭 7 文字。
 * ランダム要素を含むため、`crypto.getRandomValues` をスタブして再現性を担保する。
 *
 * テスト ID 範囲: T-06-01-01 〜 T-06-04-01
 *
 * @see generateOutputFileName
 */
describe('generateOutputFileName', () => {
  let cryptoStub: Stub | null = null;

  /** 固定バイト列スタブをセットする。テストが自前で restore した場合は null にしておく。 */
  const _setupCryptoStub = (): void => {
    cryptoStub = stub(crypto, 'getRandomValues', (arr: ArrayBufferView) => {
      const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < u8.length; i++) {
        u8[i] = i;
      }
      return arr;
    });
  };

  beforeEach(() => {
    _setupCryptoStub();
  });

  afterEach(() => {
    if (cryptoStub !== null) {
      cryptoStub.restore();
      cryptoStub = null;
    }
  });

  /** 標準的な chatlog ファイルパスと index から正しいフォーマットのファイル名を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-06-01-01: index=0 のとき <baseName>-01-<hash7>.md 形式のファイル名を返す', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 0);

      assertMatch(result, /^test-file-01-[0-9a-f]{7}\.md$/);
    });

    it('[Normal] T-06-01-02: index=1 のとき連番が "02" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 1);

      assertMatch(result, /^test-file-02-[0-9a-f]{7}\.md$/);
    });

    it('[Normal] T-06-01-03: index=9 のとき連番が "10" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 9);

      assertMatch(result, /^test-file-10-[0-9a-f]{7}\.md$/);
    });

    it('[Normal] T-06-02-01: 同一タイムスタンプと固定ランダム値で常に同じファイル名が返る', async () => {
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

    it('[Normal] T-06-04-01: ソースの末尾ハッシュを除去したベース名で出力名を生成する', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = await generateOutputFileName(filePath, 0);

      assertMatch(result, /^2026-03-11-topic-01-[0-9a-f]{7}\.md$/);
    });
  });

  /** crypto.getRandomValues をスタブせず実際の乱数を使うランダム性ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-06-03-01: スタブなしで 2 回呼ぶと異なるファイル名が生成される', async () => {
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

      assertEquals(result.includes('## Summary\n\nFix CI pipeline'), true);
    });

    it('[Normal] T-11-01-02: 返却文字列に START_BODY_HEADING + "\\n### User\\nHow do I..." が含まれる', () => {
      const seg = { title: 'Debug session', summary: 'Debug session', content: '### User\nHow do I...' };

      const result = generateSegmentFile(seg);

      assertEquals(result.includes(START_BODY_HEADING + '\n\n### User\nHow do I...'), true);
    });
  });

  /** 全フィールドが空でも両セクション見出しを含む文字列を返すエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-11-02-01: 返却文字列に `## Summary` と START_BODY_HEADING の両セクション見出しが含まれる', () => {
      const seg = { title: '', summary: '', content: '' };

      const result = generateSegmentFile(seg);

      assertEquals(result.includes('## Summary'), true);
      assertEquals(result.includes(START_BODY_HEADING), true);
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
    it('[Normal] T-12-01-01: 出力フロントマターに project: "ci-platform" が含まれる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'ci-platform');
      fm.set('date', '2026-03-01');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.includes('project: "ci-platform"'), true);
    });

    it('[Normal] T-12-01-02: 出力フロントマターに title・log_id・summary が含まれる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'ci-platform');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.includes('title: "Fix CI"'), true);
      assertEquals(result.includes('log_id: "abc1234"'), true);
      assertEquals(result.includes('summary: "CI fix"'), true);
    });

    it('[Normal] T-12-03-01: 出力が `---\\n` で始まりフロントマターブロックが `\\n---\\n` で終わる', () => {
      const fm = new ChatlogFrontmatter('');
      fm.set('project', 'test');
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assertEquals(result.startsWith('---\n'), true);
      assertEquals(result.includes('\n---\n'), true);
    });

    it('[Normal] T-12-03-02: コンテンツボディがフロントマターブロックの後に重複なく続く', () => {
      const fm = new ChatlogFrontmatter('');
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      const contentOccurrences = result.split('## Summary\ntext').length - 1;
      assertEquals(contentOccurrences, 1);
    });
  });

  /** frontmatter が空の場合は AI 生成フィールドのみを含むエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-12-02-01: 出力フロントマターが AI 生成フィールド（title・log_id・summary）のみを含む', () => {
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
});

// ─── segmentChatlogs tests ─────────────────────────────────────────────────────

/**
 * `segmentChatlogs` のユニットテストスイート。
 *
 * Deno.Command をモックして AI 呼び出しを制御する。
 * 正常系・異常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-SC-01-01 〜 T-SC-04-01
 *
 * @see segmentChatlogs
 */
describe('segmentChatlogs', () => {
  let mockHandle: CommandMockHandle;

  afterEach(() => {
    if (mockHandle) {
      mockHandle.restore();
    }
  });

  /** AI が有効な JSON 配列を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SC-01-01: AI が有効な JSON 配列を返すとき Segment 配列を返す', async () => {
      // arrange
      const segments = [
        { title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' },
        { title: 'Topic 2', summary: 'Summary 2', content: 'Body 2' },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertEquals(result, segments);
    });
  });

  /** model オプションを指定・省略したときの Deno.Command args 検証ケース。 */
  describe('When: 正常系 — model 指定', () => {
    it('[Normal] T-SC-05-01: model を明示指定したとき Deno.Command args に --model <指定モデル> が含まれる', async () => {
      // arrange
      const segments = [{ title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' }];
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      // act
      await segmentChatlogs('test.md', 'content', { model: 'claude-sonnet-4-6' });

      // assert
      const modelIndex = capturedArgs.value.indexOf('--model');
      assertNotEquals(modelIndex, -1);
      assertEquals(capturedArgs.value[modelIndex + 1], 'claude-sonnet-4-6');
    });

    it('[Normal] T-SC-05-02: model を省略したとき Deno.Command args に --model DEFAULT_AI_MODEL が含まれる', async () => {
      // arrange
      const segments = [{ title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' }];
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      // act
      await segmentChatlogs('test.md', 'content');

      // assert
      const modelIndex = capturedArgs.value.indexOf('--model');
      assertNotEquals(modelIndex, -1);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });

  /** AI がエラー終了または非 JSON を返す異常ケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-SC-02-01: AI が非ゼロ exit code で終了するとき null を返す', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertNull(result);
    });

    it('[Error] T-SC-03-01: AI が JSON でない文字列を返すとき null を返す', async () => {
      // arrange
      const stdout = new TextEncoder().encode('This is not JSON at all.');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertNull(result);
    });
  });

  /** セグメント数が上限を超えるエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SC-04-01: 12件のセグメントが返るとき先頭10件のみに制限される', async () => {
      // arrange
      const segments = Array.from({ length: 12 }, (_, i) => ({
        title: `Topic ${i + 1}`,
        summary: `Summary ${i + 1}`,
        content: `Body ${i + 1}`,
      }));
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertEquals(result?.length, 10);
      assertEquals(result?.[0].title, 'Topic 1');
      assertEquals(result?.[9].title, 'Topic 10');
    });
  });
});

// ─── segmentChatlogsBatch tests ───────────────────────────────────────────────

/**
 * `segmentChatlogsBatch` のユニットテストスイート。
 *
 * 複数ファイルをまとめて1回のAI呼び出しでセグメント分割する関数の
 * 正常系・異常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-SCB-01-01 〜 T-SCB-04-01
 *
 * @see segmentChatlogsBatch
 */
describe('segmentChatlogsBatch', () => {
  let mockHandle: CommandMockHandle;

  afterEach(() => {
    if (mockHandle) { mockHandle.restore(); }
  });

  describe('When: 正常系', () => {
    it('[Normal] T-SCB-01-01: 2ファイル入力でAIが有効なJSONを返すとき各ファイルのSegment[]をMapで返す', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'content a' },
        { filePath: 'b.md', content: 'content b' },
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'T1', summary: 'S1', content: 'C1' }] },
        { filePath: 'b.md', segments: [{ title: 'T2', summary: 'S2', content: 'C2' }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogsBatch(inputs);

      // assert
      assertEquals(result.get('a.md'), [{ title: 'T1', summary: 'S1', content: 'C1' }]);
      assertEquals(result.get('b.md'), [{ title: 'T2', summary: 'S2', content: 'C2' }]);
    });
  });

  describe('When: 異常系', () => {
    it('[Error] T-SCB-02-01: AIが非ゼロ exit のとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'content a' },
        { filePath: 'b.md', content: 'content b' },
      ];
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await segmentChatlogsBatch(inputs);

      // assert
      assertNull(result.get('a.md'));
      assertNull(result.get('b.md'));
    });

    it('[Error] T-SCB-02-02: AIが不正JSONを返すとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [{ filePath: 'a.md', content: 'content a' }];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogsBatch(inputs);

      // assert
      assertNull(result.get('a.md'));
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SCB-03-01: 1ファイル入力でも正常動作する', async () => {
      // arrange
      const inputs = [{ filePath: 'solo.md', content: 'solo content' }];
      const aiResult = [
        { filePath: 'solo.md', segments: [{ title: 'T', summary: 'S', content: 'C' }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogsBatch(inputs);

      // assert
      assertEquals(result.get('solo.md'), [{ title: 'T', summary: 'S', content: 'C' }]);
    });

    it('[Edge] T-SCB-04-01: AIが返す filePath が inputs にない場合無視され、inputs にある filePath は null になる', async () => {
      // arrange
      const inputs = [{ filePath: 'known.md', content: 'content' }];
      const aiResult = [
        { filePath: 'unknown.md', segments: [{ title: 'T', summary: 'S', content: 'C' }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogsBatch(inputs);

      // assert
      assertNull(result.get('known.md'));
      assertEquals(result.has('unknown.md'), false);
    });
  });
});

// ─── writeSegmentToFile tests ────────────────────────────────────────────────

/**
 * `writeSegmentToFile` のユニットテストスイート。
 *
 * 1セグメントをファイルに書き出すロジック（バックアップ・dryRun 動作）を検証する。
 *
 * テスト ID 範囲: T-SIO-WS-01 〜 T-SIO-WS-07
 *
 * @see writeSegmentToFile
 */
describe('writeSegmentToFile', () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await Deno.makeTempDir({ prefix: 'write-segment-test-' });
  });

  afterEach(async () => {
    await Deno.remove(outputDir, { recursive: true });
  });

  /** 正常系: ファイル書き込みと stats 更新を検証する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SIO-WS-01: dryRun=false で outputFileName のファイルが書き込まれ stats.success が 1 増える', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      assertEquals(stats.success, 1);
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      const stat = await Deno.stat(expectedFile);
      assertEquals(stat.isFile, true);
    });

    it('[Normal] T-SIO-WS-02: 既存ファイルがある場合 .old-01.md にバックアップされ新ファイルが書かれる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';
      const expectedFile = `${outputDir}/sample-01-testhash.md`;

      // 既存ファイルを事前作成
      await Deno.writeTextFile(expectedFile, 'old content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      assertEquals(stats.success, 1);
      const backupFile = `${outputDir}/sample-01-testhash.old-01.md`;
      const backupStat = await Deno.stat(backupFile);
      assertEquals(backupStat.isFile, true);
      const newStat = await Deno.stat(expectedFile);
      assertEquals(newStat.isFile, true);
    });

    it('[Normal] T-SIO-WS-04: 返されたパスが元の filePath とは異なる（入力ファイルを上書きしていない）', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';

      // act
      const returnedPath = await writeSegmentToFile(
        outputDir,
        filePath,
        0,
        segment,
        frontmatter,
        false,
        stats,
        hashFn,
      );

      // assert
      assertNotEquals(returnedPath, filePath);
      assertFalse(returnedPath.includes(filePath));
    });
  });

  /** 異常系: outputPath が filePath を含む場合は ChatlogError をスローする。 */
  describe('When: 異常系', () => {
    it('[Error] T-SIO-WS-05: outputPath が filePath を含むとき ChatlogError(ForbiddenOutput) をスローする', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      // filePath を outputDir として渡すと outputPath = `${filePath}/${outputFileName}` になり
      // outputPath.includes(filePath) が true になる
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';

      // act / assert
      const err = await assertRejects(
        () => writeSegmentToFile(filePath, filePath, 0, segment, frontmatter, false, stats, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'OverwriteInput');
    });
  });

  /** エッジケース: dryRun=true のとき stats が増えないことを検証する。 */
  describe('When: エッジケース', () => {
    it('[Normal] T-SIO-WS-03: dryRun=true のとき stats.success が増えない', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, true, stats, hashFn);

      // assert
      assertEquals(stats.success, 0);
    });

    it('[Edge] T-SIO-WS-06: old-98.md が存在するとき old-99.md にバックアップして成功する', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      const backup98 = `${outputDir}/sample-01-testhash.old-98.md`;

      // old-98.md を事前作成（これが最大 index → next=99）
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(backup98, 'backup 98 content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      const backup99 = `${outputDir}/sample-01-testhash.old-99.md`;
      const backupStat = await Deno.stat(backup99);
      assertEquals(backupStat.isFile, true);
      assertEquals(stats.success, 1);
    });

    it('[Error] T-SIO-WS-07: old-99.md が存在するとき TooManyBackups エラーをスローする', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const filePath = `${outputDir}/sample.md`;
      const segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
      const frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
      const hashFn = () => 'testhash';
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      const backup99 = `${outputDir}/sample-01-testhash.old-99.md`;

      // old-99.md を事前作成（next=100 > 99 → エラー）
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(backup99, 'backup 99 content');

      // act / assert
      const err = await assertRejects(
        () => writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'IndexOverflow');
    });
  });
});
