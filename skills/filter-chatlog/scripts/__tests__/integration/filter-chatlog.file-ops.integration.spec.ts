// src: scripts/__tests__/integration/filter-chatlog.fileOps.integration.spec.ts
// @(#): filter-chatlog ファイル操作の統合テスト
//       findMdFiles → prefilterFiles → buildBatchPrompt パイプライン検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { stub } from '@std/testing/mock';

// test target
import { buildBatchPrompt, findMdFiles, prefilterFiles } from '../../../../filter-chatlog/scripts/filter-chatlog.ts';

// ─── Helpers
import { makeRepeatedContent } from '../_helpers/chatlog-fixtures.ts';
// constants
import { FILTER_MIN_CONTENT_LENGTH } from '../_helpers/constants.ts';

// ─── 共通セットアップ ──────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

/** `FILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = (title: string) => makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH, title);

// ─── T-FL-IO-01: findMdFiles → prefilterFiles パイプライン ───────────────────

describe('findMdFiles → prefilterFiles パイプライン', () => {
  describe('Given: 有効なファイルと無効なファイルが混在するディレクトリ', () => {
    describe('When: findMdFiles で列挙し prefilterFiles でフィルタする', () => {
      describe('Then: T-FL-IO-01 - 有効なファイルのみ通過する', () => {
        it('T-FL-IO-01-01: 有効な 2 件のみが prefilterFiles を通過する', async () => {
          const monthDir = `${tempDir}/2026/2026-03`;
          await Deno.mkdir(monthDir, { recursive: true });

          // 有効なファイル
          await Deno.writeTextFile(`${monthDir}/valid-1.md`, _makeValidContent('Valid 1'));
          await Deno.writeTextFile(`${monthDir}/valid-2.md`, _makeValidContent('Valid 2'));
          // 無効なファイル（短すぎる）
          await Deno.writeTextFile(`${monthDir}/short.md`, '---\ntitle: Short\n---\n短い\n');
          // 除外ファイル名
          await Deno.writeTextFile(
            `${monthDir}/say-ok-and-nothing-else.md`,
            _makeValidContent('Excluded'),
          );

          const allFiles = await findMdFiles(tempDir);
          const errStub = stub(console, 'error', () => {});
          const passed = await prefilterFiles(allFiles);
          errStub.restore();

          assertEquals(passed.length, 2);
        });
      });
    });
  });
});

// ─── T-FL-IO-02: prefilterFiles → buildBatchPrompt パイプライン ─────────────

describe('prefilterFiles → buildBatchPrompt パイプライン', () => {
  describe('Given: prefilterFiles を通過したファイルリスト', () => {
    describe('When: buildBatchPrompt でプロンプトを構築する', () => {
      describe('Then: T-FL-IO-02 - 各ファイルが === FILE N: === 形式で含まれる', () => {
        it('T-FL-IO-02-01: buildBatchPrompt の結果に各ファイルのヘッダーが含まれる', async () => {
          const file1 = `${tempDir}/chat-1.md`;
          const file2 = `${tempDir}/chat-2.md`;
          await Deno.writeTextFile(file1, _makeValidContent('Chat 1'));
          await Deno.writeTextFile(file2, _makeValidContent('Chat 2'));

          const errStub = stub(console, 'error', () => {});
          const passed = await prefilterFiles([file1, file2]);
          errStub.restore();

          const prompt = await buildBatchPrompt(passed);

          assertStringIncludes(prompt, '=== FILE 1:');
          assertStringIncludes(prompt, '=== FILE 2:');
        });
      });
    });
  });
});

// ─── T-FL-IO-03: 空ファイルリスト → 空プロンプト ────────────────────────────

describe('buildBatchPrompt 空リスト', () => {
  describe('Given: 空のファイルリスト', () => {
    describe('When: buildBatchPrompt([]) を呼び出す', () => {
      describe('Then: T-FL-IO-03 - 空文字列が返される', () => {
        it('T-FL-IO-03-01: 空リスト → 空文字列', async () => {
          const result = await buildBatchPrompt([]);

          assertEquals(result, '');
        });
      });
    });
  });
});
