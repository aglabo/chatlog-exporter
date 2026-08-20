// src: scripts/__tests__/functional/filter/build-batch-prompt.functional.spec.ts
// @(#): buildBatchPrompt の機能テスト
//       ChatlogEntry[] を入力としたバッチプロンプト構築の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../../libs/batch-prompt.ts';

// ─── Helpers
import { makeFrontmatter, makePlainContent, makeValidContent } from '../../_helpers/fixtures.ts';
// classes
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// constants
import { CHATLOG_BLOCK_CLOSE, CHATLOG_BLOCK_OPEN_TEMPLATE } from '../../../constants/common.constants.ts';
import { CHUNK_SIZE, MAX_PROMPT_LENGTH, OVER_MAX_CHARS_LENGTH } from '../../_helpers/constants.ts';

// ─── Internal Helpers

// constants
/** 開始デリミタ行の末尾。本文の開始位置を求めるために使う。 */
const _DELIMITER_TAIL = '">>>';

// functions
/** ファイル名から開始デリミタ行を組み立てる。 */
const _openTag = (filename: string): string => CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', filename);

/** 開始デリミタ行と終了デリミタに挟まれた本文を取り出す。 */
const _bodyOf = (prompt: string): string =>
  prompt.slice(prompt.indexOf(_DELIMITER_TAIL) + _DELIMITER_TAIL.length, prompt.indexOf(CHATLOG_BLOCK_CLOSE));

// ─── Tests

/**
 * `buildBatchPrompt` 関数の機能テストスイート。
 *
 * `buildBatchPrompt(entries)` は読み込み済み `ChatlogEntry[]` を受け取り、
 * 各ログを `<<<CHATLOG file="NAME">>>` 〜 `<<<END_CHATLOG>>>` で囲んだバッチプロンプト文字列を同期的に生成する。
 * 本文が `MAX_BODY_CHARS`（8000）を超える場合は切り詰める。
 *
 * テスト ID 範囲: T-FL-BP-01 〜 T-FL-BP-09
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
  /**
   * 単一の `ChatlogEntry` を渡す前提条件グループ。
   *
   * エントリ内容の種別（正常・エッジケース）ごとに When で分類する。
   */
  describe('Given: 単一の ChatlogEntry を渡す', () => {
    describe('When: 正常系 - フロントマターが除外され本文とファイル名が出力に含まれる', () => {
      /** フロントマターが除外され本文が抽出されることを検証する。 */
      describe('Then: [Normal] T-FL-BP-01 - フロントマターが除外され本文が抽出される', () => {
        it('T-FL-BP-01-01: [Normal] フロントマターの "title:" が出力に含まれない', () => {
          const entry = new ChatlogEntry(makeValidContent('テスト', '質問', '回答'), { filePath: '/chatlogs/chat.md' });

          const result = buildBatchPrompt([entry]);

          assert(!result.includes('title:'));
        });

        it('T-FL-BP-01-02: [Normal] 本文テキスト "質問" が出力に含まれる', () => {
          const entry = new ChatlogEntry(makeValidContent('テスト', '質問', '回答'), { filePath: '/chatlogs/chat.md' });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, '質問');
        });

        it('T-FL-BP-01-04: [Normal] 開始デリミタが "<<<CHATLOG file="<filename>">>>" の形式で出力される', () => {
          const entry = new ChatlogEntry(makeValidContent('テスト', '質問', '回答'), { filePath: '/chatlogs/chat.md' });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, _openTag('chat.md'));
        });

        it('T-FL-BP-01-05: [Normal] ブロックが終了デリミタで閉じられる', () => {
          const entry = new ChatlogEntry(makeValidContent('テスト', '質問', '回答'), { filePath: '/chatlogs/chat.md' });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, CHATLOG_BLOCK_CLOSE);
        });

        it('T-FL-BP-01-03: [Normal] サブディレクトリ内ファイルでもファイル名のみが抽出される', () => {
          const entry = new ChatlogEntry(makeValidContent('テスト'), { filePath: '/chatlogs/sub/deep.md' });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, 'deep.md');
          assert(!result.includes('sub/'));
        });
      });
    });

    describe('When: エッジケース - フロントマターのみ・ターンマーカーなし・長大本文で本文が空または切り詰められる', () => {
      /** フロントマターのみのエントリでヘッダーは出力され本文が空になることを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-02 - フロントマターのみのエントリは本文が空になる', () => {
        it('T-FL-BP-02-01: [Edgecase] 開始デリミタは出力される', () => {
          const entry = new ChatlogEntry(makeFrontmatter('空'), { filePath: '/chatlogs/empty.md' });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, _openTag('empty.md'));
        });

        it('T-FL-BP-02-02: [Edgecase] デリミタに挟まれた本文が空になる', () => {
          const entry = new ChatlogEntry(makeFrontmatter('空'), { filePath: '/chatlogs/empty.md' });

          const result = buildBatchPrompt([entry]);

          assertEquals(_bodyOf(result).trim(), '');
        });
      });

      /**
       * `### User`/`### Assistant` マーカーのない生テキスト本文では
       * `parseConversation` がターンを検出しないため本文が空になることを検証する。
       */
      describe('Then: [Edgecase] T-FL-BP-03 - ターンマーカーのないエントリは本文が空になる', () => {
        it('T-FL-BP-03-01: [Edgecase] "=== " ヘッダーは出力される', () => {
          const entry = new ChatlogEntry(makePlainContent('生テキスト', 'これは会話形式でない生テキストです。'), {
            filePath: '/chatlogs/plain.md',
          });

          const result = buildBatchPrompt([entry]);

          assertStringIncludes(result, _openTag('plain.md'));
        });

        it('T-FL-BP-03-02: [Edgecase] デリミタに挟まれた本文が空になる', () => {
          const entry = new ChatlogEntry(makePlainContent('生テキスト', 'これは会話形式でない生テキストです。'), {
            filePath: '/chatlogs/plain.md',
          });

          const result = buildBatchPrompt([entry]);

          assertEquals(_bodyOf(result).trim(), '');
        });
      });

      /** `MAX_BODY_CHARS`（8000）を超える本文は切り詰められ、出力が肥大化しないことを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-04 - 長大な本文は切り詰められる', () => {
        it('T-FL-BP-04-01: [Edgecase] 結果の長さが無制限に増大しない', () => {
          const longText = 'x'.repeat(OVER_MAX_CHARS_LENGTH);
          const entry = new ChatlogEntry(makeValidContent('Long', longText, '回答'), { filePath: '/chatlogs/long.md' });

          const result = buildBatchPrompt([entry]);

          // MAX_BODY_CHARS=8000 + ヘッダー分で合理的な範囲内に収まる
          assertEquals(result.length < MAX_PROMPT_LENGTH, true);
        });
      });
    });
  });

  /**
   * 複数（2 件）の `ChatlogEntry` を渡す前提条件グループ。
   *
   * 複数エントリの結合動作を検証する最小ケース。
   */
  describe('Given: 複数（2 件）の ChatlogEntry を渡す', () => {
    describe('When: 正常系 - 2 エントリが結合されファイル名がヘッダーに出力される', () => {
      /** 2 エントリのヘッダーがそれぞれ出力されることを検証する。 */
      describe('Then: [Normal] T-FL-BP-05 - 2 エントリのヘッダーが出力される', () => {
        it('T-FL-BP-05-01: [Normal] 各ファイル名がヘッダーに対応して出力される', () => {
          const entry1 = new ChatlogEntry(makeValidContent('A', '質問A', '回答A'), { filePath: '/chatlogs/chat-a.md' });
          const entry2 = new ChatlogEntry(makeValidContent('B', '質問B', '回答B'), { filePath: '/chatlogs/chat-b.md' });

          const result = buildBatchPrompt([entry1, entry2]);

          assertStringIncludes(result, _openTag('chat-a.md'));
          assertStringIncludes(result, _openTag('chat-b.md'));
        });

        it('T-FL-BP-05-02: [Normal] 2 つ目の開始デリミタの直前に改行が含まれる', () => {
          const entry1 = new ChatlogEntry(makeValidContent('A', '質問A', '回答A'), { filePath: '/chatlogs/chat-a.md' });
          const entry2 = new ChatlogEntry(makeValidContent('B', '質問B', '回答B'), { filePath: '/chatlogs/chat-b.md' });

          const result = buildBatchPrompt([entry1, entry2]);

          assertStringIncludes(result, '\n' + _openTag('chat-b.md'));
        });
      });
    });
  });

  /**
   * CHUNK_SIZE（10 件）の `ChatlogEntry` を渡す前提条件グループ。
   *
   * 実運用の最大バッチサイズ（`CHUNK_SIZE=10`）での動作を検証する境界値テスト。
   */
  describe(`Given: CHUNK_SIZE（${CHUNK_SIZE} 件）の ChatlogEntry を渡す`, () => {
    describe(`When: 正常系 - ${CHUNK_SIZE} エントリのヘッダーがすべて出力される`, () => {
      /** すべてのファイル名がヘッダーとして出力されることを検証する。 */
      describe(`Then: [Normal] T-FL-BP-06 - ${CHUNK_SIZE} エントリのヘッダーが出力される`, () => {
        it(`T-FL-BP-06-01: [Normal] chat-${CHUNK_SIZE}.md の開始デリミタが含まれる`, () => {
          const entries: ChatlogEntry[] = [];
          for (let i = 1; i <= CHUNK_SIZE; i++) {
            entries.push(
              new ChatlogEntry(makeValidContent(`タイトル${i}`, `質問${i}`, `回答${i}`), {
                filePath: `/chatlogs/chat-${i}.md`,
              }),
            );
          }

          const result = buildBatchPrompt(entries);

          assertStringIncludes(result, _openTag(`chat-${CHUNK_SIZE}.md`));
        });

        it('T-FL-BP-06-02: [Normal] すべてのエントリの開始デリミタが含まれる', () => {
          const entries: ChatlogEntry[] = [];
          for (let i = 1; i <= CHUNK_SIZE; i++) {
            entries.push(
              new ChatlogEntry(makeValidContent(`タイトル${i}`, `質問${i}`, `回答${i}`), {
                filePath: `/chatlogs/chat-${i}.md`,
              }),
            );
          }

          const result = buildBatchPrompt(entries);

          for (let i = 1; i <= CHUNK_SIZE; i++) {
            assertStringIncludes(result, _openTag(`chat-${i}.md`));
          }
        });
      });
    });
  });

  /**
   * 空の配列が渡される前提条件グループ。
   *
   * I/O を行わず空文字列を返すことを検証する。
   */
  describe('Given: 空の配列が渡される', () => {
    describe('When: エッジケース - エントリ 0 件で空文字列が返される', () => {
      /** 空文字列が返されることを検証する。 */
      describe('Then: [Edgecase] T-FL-BP-09 - 空文字列が返される', () => {
        it('T-FL-BP-09-01: [Edgecase] 戻り値が "" である', () => {
          const result = buildBatchPrompt([]);

          assertEquals(result, '');
        });
      });
    });
  });
});
