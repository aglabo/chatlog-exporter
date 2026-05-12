// src: scripts/__tests__/unit/normalize-chatlogs.string-utils.unit.spec.ts
// @(#): 文字列処理関数のユニットテスト
//       対象: cleanYaml, parseFrontmatterEntries, extractBaseName, parseJsonArray
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { parseFrontmatterEntries } from '../../../../_scripts/libs/text/frontmatter-utils.ts';
import { parseJsonArray } from '../../../../_scripts/libs/text/json-utils.ts';
import { cleanYaml } from '../../../../_scripts/libs/text/markdown-utils.ts';
import { extractBaseName } from '../../normalize-chatlogs.ts';

// ─── cleanYaml tests ──────────────────────────────────────────────────────────

/**
 * cleanYaml のユニットテスト。
 * AI が返す生テキストからコードフェンス・前置テキスト・末尾改行を除去し、
 * パース可能なクリーンな YAML 文字列を返す関数の正常系・エッジケースを検証する。
 */
describe('cleanYaml', () => {
  /** 正常系: コードフェンスや前置テキストを除去してクリーンな YAML を返す */
  describe('Given: ```yaml...``` コードフェンスで囲まれた YAML 文字列', () => {
    it('開始フェンス行と終了フェンス行を除去して YAML コンテンツだけを返す', () => {
      const raw = '```yaml\ntitle: foo\ndate: 2026-04-05\n```';

      const result = cleanYaml(raw, 'title');

      assertEquals(result, 'title: foo\ndate: 2026-04-05');
    });

    it('firstField より前の非 YAML 行をすべて除去する', () => {
      const raw = 'Here is the YAML:\ntitle: foo\ndate: 2026-04-05';

      const result = cleanYaml(raw, 'title');

      assertEquals(result, 'title: foo\ndate: 2026-04-05');
    });
  });

  /** エッジケース: フェンスなし・末尾改行のみの入力でも正しく trim する */
  describe('Given: フェンスも余分な行もなく末尾に改行がある YAML 文字列', () => {
    it('末尾の改行をトリムしてクリーンな YAML コンテンツを返す', () => {
      const raw = 'title: foo\ndate: 2026-04-05\n';

      const result = cleanYaml(raw, 'title');

      assertEquals(result, 'title: foo\ndate: 2026-04-05');
    });
  });

  /** エッジケース: 空文字列入力でスローされず空文字列を返す */
  describe('Given: raw が空文字列', () => {
    it('例外をスローせず空文字列を返す', () => {
      const result = cleanYaml('', 'title');

      assertEquals(result, '');
    });
  });

  /** エッジケース: firstField が存在しないケース */
  describe('Given: firstField を含まない YAML 文字列が与えられる', () => {
    it('T-CY-E-01: firstField が見つからないとき、stripped 全体を trim して返す', () => {
      const raw = 'some: value\nother: data';

      const result = cleanYaml(raw, 'nonexistent');

      assertEquals(result, 'some: value\nother: data');
    });

    it('T-CY-E-02: コードフェンスがあっても stripped してから全体を返す', () => {
      const raw = '```yaml\nsome: value\nother: data\n```';

      const result = cleanYaml(raw, 'nonexistent');

      assertEquals(result, 'some: value\nother: data');
    });
  });
});

// ─── parseFrontmatterEntries tests ───────────────────────────────────────

/**
 * parseFrontmatterEntries のユニットテスト。
 * Markdown テキストの先頭にある `---` 区切りのフロントマターを解析し、
 * meta オブジェクトと body 文字列に分解する関数の正常系・異常系を検証する。
 */
describe('parseFrontmatterEntries', () => {
  /** 正常系: `---` で囲まれたフロントマターを meta と body に分解する */
  describe('Given: フロントマターブロックを含む Markdown テキスト', () => {
    it('meta に project と date フィールドが含まれる', () => {
      const text = '---\nproject: ci-platform\ndate: 2026-03-01\n---\n# Body';

      const { meta } = parseFrontmatterEntries(text);

      assertEquals(meta, { project: 'ci-platform', date: '2026-03-01' });
    });

    it('body に閉じ --- 以降のテキストが含まれる', () => {
      const text = '---\nproject: ci-platform\ndate: 2026-03-01\n---\n# Body';

      const { content } = parseFrontmatterEntries(text);

      assertEquals(content, '# Body');
    });
  });

  /** 正常系: フロントマターなしの場合は meta を空にして body を元テキスト全体とする */
  describe('Given: --- で始まらない Markdown テキスト', () => {
    it('meta が空のレコードである', () => {
      const text = '# No Frontmatter\n\nSome content.';

      const { meta } = parseFrontmatterEntries(text);

      assertEquals(meta, {});
    });

    it('body が元のテキスト全体と等しい', () => {
      const text = '# No Frontmatter\n\nSome content.';

      const { content } = parseFrontmatterEntries(text);

      assertEquals(content, text);
    });
  });

  /** 異常系: 開き `---` はあるが閉じ `---` がない不正なフロントマターは無視する */
  describe('Given: --- で始まるが閉じ --- がない Markdown テキスト', () => {
    it('meta が空で body が元のテキスト全体を含む', () => {
      const text = '---\nproject: ci-platform\n';

      const { meta, content } = parseFrontmatterEntries(text);

      assertEquals(meta, {});
      assertEquals(content, text);
    });
  });
});

// ─── extractBaseName tests ────────────────────────────────────────────────────

/**
 * extractBaseName のユニットテスト。
 * ファイルパスからディレクトリ・拡張子・末尾ハッシュ(-XXXXXXX)を除去して
 * ベース名を返す純粋関数の正常系・エッジケースを検証する。
 */
describe('extractBaseName', () => {
  /** 正常系: ディレクトリ・.md 拡張子・末尾 7 桁ハッシュを除去する */
  describe('Given: ディレクトリパスと .md 拡張子を含むファイルパス', () => {
    it('T-05-01-01: ディレクトリと .md 拡張子を除去したファイル名を返す', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = extractBaseName(filePath);

      assertEquals(result, 'test-file');
    });

    it('T-05-01-02: 末尾の -XXXXXXX (7桁 hex) を除去する', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = extractBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });

    it('T-05-01-03: 末尾が 7 桁 hex でない場合はハッシュ除去しない', () => {
      const filePath = 'path/to/2026-03-11-topic.md';

      const result = extractBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });
  });

  /** エッジケース: ディレクトリなし・拡張子なし */
  describe('Given: ディレクトリなしのファイル名', () => {
    it('T-05-02-01: ディレクトリなしでも .md 拡張子を除去して返す', () => {
      const result = extractBaseName('simple-file.md');

      assertEquals(result, 'simple-file');
    });

    it('T-05-02-02: 拡張子がない場合はファイル名をそのまま返す', () => {
      const result = extractBaseName('no-extension');

      assertEquals(result, 'no-extension');
    });
  });
});

// ─── parseJsonArray tests ─────────────────────────────────────────────────────

/**
 * parseJsonArray のユニットテスト。
 * 生テキストから JSON 配列を抽出する関数の
 * 直接パース・フォールバック抽出（非貪欲・貪欲）・エラー耐性を検証する。
 */
describe('parseJsonArray', () => {
  /** 正常系: `[` 始まりの JSON 配列を直接パースして返す */
  describe('Given: `[` で始まる有効な JSON 配列文字列', () => {
    it('T-10-01-01: 1 オブジェクトを含む配列が返される', () => {
      const rawDirect = '[{"title":"T1","summary":"S1","content":"B1"}]';

      const result = parseJsonArray(rawDirect);

      assertEquals(Array.isArray(result), true);
      assertEquals((result as unknown[]).length, 1);
      assertEquals((result as { title: string }[])[0].title, 'T1');
    });
  });

  /** 正常系: 前置テキストがあっても正規表現フォールバックで JSON 配列を抽出する */
  describe('Given: 前置テキストを含む文字列（非貪欲マッチで JSON 配列を抽出可能）', () => {
    it('T-10-02-01: 配列が抽出されて返される', () => {
      const rawWithPrefix = 'Here is the result:\n[{"title":"T"}]';

      const result = parseJsonArray(rawWithPrefix);

      assertEquals(Array.isArray(result), true);
      assertEquals((result as unknown[]).length, 1);
      assertEquals((result as { title: string }[])[0].title, 'T');
    });
  });

  /** 正常系: 非貪欲マッチが失敗した場合は貪欲マッチで配列全体を抽出する */
  describe('Given: 非貪欲マッチでは不完全な配列しか取れない文字列（貪欲マッチが必要）', () => {
    it('T-10-02-02: 貪欲マッチの結果 length 2 の配列が返される', () => {
      const rawGreedy = 'result: [{"title":"A"},{"title":"B"}] and more text';

      const result = parseJsonArray(rawGreedy);

      assertEquals(Array.isArray(result), true);
      assertEquals((result as unknown[]).length, 2);
      assertEquals((result as { title: string }[])[0].title, 'A');
      assertEquals((result as { title: string }[])[1].title, 'B');
    });
  });

  /** 異常系: JSON 配列が見つからない入力はスローせず null を返す */
  describe('Given: 有効な JSON 配列を含まないプレーンテキスト', () => {
    it('T-10-03-01: null が返される', () => {
      const rawPlain = 'This is plain text with no JSON array';

      const result = parseJsonArray(rawPlain);

      assertEquals(result, null);
    });

    it('T-10-03-02: 空文字列でスローされずに null が返される', () => {
      const rawEmpty = '';

      const result = parseJsonArray(rawEmpty);

      assertEquals(result, null);
    });
  });
});
