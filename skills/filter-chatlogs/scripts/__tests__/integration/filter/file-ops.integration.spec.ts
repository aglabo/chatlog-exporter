// src: scripts/__tests__/integration/filter/file-ops.integration.spec.ts
// @(#): filter-chatlogs ファイル操作の統合テスト
//       findMdFiles → prefilterFiles → buildBatchPrompt パイプライン検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { stub } from '@std/testing/mock';

// test target
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { findFiles } from '../../../../../_scripts/libs/file-ops/find-files.ts';
import { getFilename } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
import { buildBatchPrompt } from '../../../libs/batch-prompt.ts';
import { loadFilterEntries } from '../../../libs/load-filter-entry.ts';
import { prefilterFiles } from '../../../modules/prefilter.ts';
// constants
import { FILTER_DECISIONS } from '../../../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../../../types/cache.types.ts';
import type { BaseStats } from '../../../types/stats.types.ts';

// ─── Helpers
import { makeRepeatedContent } from '../../_helpers/fixtures.ts';
// constants
import { FILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';

// ─── 共通セットアップ ──────────────────────────────────────────────────────────

let tempDir: string;
let cache: ChatlogCache<CLEResult>;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
  cache = new ChatlogCache<CLEResult>('filter-cache', `${tempDir}/.cache`);
  await cache.ready;
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

/** `FILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = (title: string) => makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH, title);

/** テスト用の初期化済み `BaseStats` オブジェクトを返す。 */
const _makeStats = (): BaseStats => ({ keep: 0, skip: 0, remove: 0, error: 0 });

/** YAML 構文が不正な frontmatter を持つエントリ本文（`load-filter-entry.unit.spec.ts` の `_INVALID_YAML_ENTRY` と同値）。 */
const _INVALID_YAML_ENTRY = `---\ntitle: [unclosed\n---\n\n### User\nHello\n`;

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

          const allFiles = await findFiles(tempDir);
          const { entries } = await loadFilterEntries(allFiles, cache, 2);
          const errStub = stub(console, 'error', () => {});
          const passed = await prefilterFiles(entries, { stats: _makeStats() });
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
      describe('Then: T-FL-IO-02 - 各ファイルが === <filename> === 形式で含まれる', () => {
        it('T-FL-IO-02-01: buildBatchPrompt の結果に各ファイルのヘッダーが含まれる', async () => {
          const file1 = `${tempDir}/chat-1.md`;
          const file2 = `${tempDir}/chat-2.md`;
          await Deno.writeTextFile(file1, _makeValidContent('Chat 1'));
          await Deno.writeTextFile(file2, _makeValidContent('Chat 2'));

          const { entries } = await loadFilterEntries([file1, file2], cache, 2);
          const errStub = stub(console, 'error', () => {});
          const passed = await prefilterFiles(entries, { stats: _makeStats() });
          errStub.restore();

          const prompt = buildBatchPrompt(passed);

          assertStringIncludes(prompt, '=== chat-1.md ===');
          assertStringIncludes(prompt, '=== chat-2.md ===');
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
        it('T-FL-IO-03-01: 空リスト → 空文字列', () => {
          const result = buildBatchPrompt([]);

          assertEquals(result, '');
        });
      });
    });
  });
});

// ─── T-FL-IO-04: 読み込み失敗ファイルは prefilterFiles に渡さず実削除されない ──

describe('loadFilterEntries → prefilterFiles パイプライン', () => {
  describe('Given: 正常なファイルと frontmatter の YAML 構文が不正なファイルが混在するディレクトリ', () => {
    describe('When: loadFilterEntries で読み込み entries/errors に分離する', () => {
      describe('Then: T-FL-IO-04 - 読み込み失敗ファイルは prefilterFiles に渡らず実削除されない', () => {
        it('T-FL-IO-04-01: パースエラーのファイルは削除されずキャッシュに ERROR が記録される', async () => {
          const okPath = `${tempDir}/ok.md`;
          const errorPath = `${tempDir}/broken.md`;
          await Deno.writeTextFile(okPath, _makeValidContent('OK'));
          await Deno.writeTextFile(errorPath, _INVALID_YAML_ENTRY);

          const allFiles = await findFiles(tempDir);
          const { entries, errors } = await loadFilterEntries(allFiles, cache, 2);

          const errStub = stub(console, 'error', () => {});
          const passed = await prefilterFiles(entries, { stats: _makeStats() });
          errStub.restore();

          assertEquals(errors.length, 1);
          assertEquals(getFilename(errors[0].filePath), 'broken.md');
          assertEquals(passed.length, 1);
          assertEquals(passed[0].filename, 'ok.md');

          // ERROR ファイルは prefilterFiles に渡っていないため実削除されず、実在し続ける
          const fileInfo = await Deno.stat(errorPath);
          assertEquals(fileInfo.isFile, true);
          assertEquals(cache.read(errors[0].filePath).decision, FILTER_DECISIONS.ERROR);
        });
      });
    });
  });
});
