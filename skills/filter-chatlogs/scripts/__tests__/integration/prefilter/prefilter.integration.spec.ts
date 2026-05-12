// src: scripts/__tests__/integration/prefilter/prefilter.integration.spec.ts
// @(#): prefilter-chatlogs.ts の統合テスト
//       findMdFiles → classifyFile パイプライン
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { classifyFile } from '../../../libs/classify-file.ts';

// ─── Helpers
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { resolveChatlogsDir } from '../../../../../_scripts/libs/file-io/resolve-directory.ts';
import { findFiles } from '../../../../../_scripts/libs/file-ops/find-files.ts';
import { makeRepeatedContent } from '../../_helpers/fixtures.ts';
// constants
import { PREFILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';

// ─── 共通セットアップ ──────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

/** `PREFILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = () => makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH);

const _makeTestFile = async (path: string, content: string): Promise<void> => {
  const dir = path.replace(/\/[^/]+$/, '');
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(path, content);
};

const _runPipeline = async (
  baseDir: string,
  agent: string,
  period?: string,
): Promise<{ noise: number; keep: number }> => {
  const _searchDir = resolveChatlogsDir({ baseDir, agent, period });
  const files = await findFiles(_searchDir);
  let noise = 0;
  let keep = 0;

  for (const filePath of files) {
    const filename = filePath.split(/[/\\]/).pop()!;
    const text = await readTextFile(filePath);
    const { isNoise } = classifyFile(filename, text);
    if (isNoise) { noise++; }
    else { keep++; }
  }

  return { noise, keep };
};

// ─────────────────────────────────────────────────────────────────────────────
// findMdFiles → classifyFile パイプライン
// ─────────────────────────────────────────────────────────────────────────────

describe('findMdFiles → classifyFile パイプライン', () => {
  // ─── T-PF-INT-01: 混在ディレクトリ → noise/keep を正しく分類 ────────────────

  describe('Given: ノイズと正常ファイルが混在するディレクトリ', () => {
    describe('When: findMdFiles → classifyFile パイプラインを実行', () => {
      describe('Then: T-PF-INT-01 - noise=3, keep=2 になる', () => {
        it('T-PF-INT-01-01: noise 判定が 3 件、keep 判定が 2 件になる', async () => {
          const baseDir = `${tempDir}/claude/2026/2026-03`;

          // ノイズファイル: ファイル名パターン
          await _makeTestFile(`${baseDir}/say-ok-and-nothing-else.md`, _makeValidContent());
          // ノイズファイル: User がシステムタグのみ
          const systemTagContent = '### User\n<system-reminder>msg</system-reminder>\n\n### Assistant\n'
            + 'a'.repeat(200) + '\n';
          await _makeTestFile(`${baseDir}/system-tag-only.md`, systemTagContent);
          // ノイズファイル: Assistant 短い
          const shortAssistantContent = '### User\n' + 'u'.repeat(200) + '\n\n### Assistant\n短い\n';
          await _makeTestFile(`${baseDir}/short-assistant.md`, shortAssistantContent);
          // 正常ファイル
          await _makeTestFile(`${baseDir}/valid-1.md`, _makeValidContent());
          await _makeTestFile(`${baseDir}/valid-2.md`, _makeValidContent());

          const { noise, keep } = await _runPipeline(tempDir, 'claude');

          assertEquals(noise, 3);
          assertEquals(keep, 2);
        });
      });
    });
  });

  // ─── T-PF-INT-02: period 指定 → 指定月のみパイプラインを通過 ─────────────────

  describe('Given: 2026-03 と 2026-04 に各 1 件の正常ファイル', () => {
    describe('When: findMdFiles(tempDir, "claude", "2026-03") → classifyFile パイプライン', () => {
      describe('Then: T-PF-INT-02 - 2026-03 の 1 件のみが処理される', () => {
        it('T-PF-INT-02-01: パイプラインに渡されるのは 2026-03 の 1 件のみ', async () => {
          await _makeTestFile(`${tempDir}/claude/2026/2026-03/chat.md`, _makeValidContent());
          await _makeTestFile(`${tempDir}/claude/2026/2026-04/chat.md`, _makeValidContent());

          const files = await findFiles(resolveChatlogsDir({ baseDir: tempDir, agent: 'claude', period: '2026-03' }));

          assertEquals(files.length, 1);
          assertEquals(files[0].includes('2026-03'), true);
        });

        it('T-PF-INT-02-02: 2026-04 のファイルはパイプラインに現れない', async () => {
          await _makeTestFile(`${tempDir}/claude/2026/2026-03/chat.md`, _makeValidContent());
          await _makeTestFile(`${tempDir}/claude/2026/2026-04/chat.md`, _makeValidContent());

          const files = await findFiles(resolveChatlogsDir({ baseDir: tempDir, agent: 'claude', period: '2026-03' }));

          assertEquals(files.some((f) => f.includes('2026-04')), false);
        });
      });
    });
  });

  // ─── T-PF-INT-03: 全ファイルが正常 → 全件 keep ───────────────────────────────

  describe('Given: 3 件の正常ファイル', () => {
    describe('When: findMdFiles → classifyFile パイプラインを実行', () => {
      describe('Then: T-PF-INT-03 - 全 3 件が keep になる', () => {
        it('T-PF-INT-03-01: noise=0, keep=3 になる', async () => {
          const baseDir = `${tempDir}/claude/2026/2026-03`;
          await _makeTestFile(`${baseDir}/valid-1.md`, _makeValidContent());
          await _makeTestFile(`${baseDir}/valid-2.md`, _makeValidContent());
          await _makeTestFile(`${baseDir}/valid-3.md`, _makeValidContent());

          const { noise, keep } = await _runPipeline(tempDir, 'claude');

          assertEquals(noise, 0);
          assertEquals(keep, 3);
        });
      });
    });
  });

  // ─── T-PF-INT-04: 全ファイルがノイズ → 全件 noise ────────────────────────────

  describe('Given: 3 件の除外パターンファイル名ファイル', () => {
    describe('When: findMdFiles → classifyFile パイプラインを実行', () => {
      describe('Then: T-PF-INT-04 - 全 3 件が noise になる', () => {
        it('T-PF-INT-04-01: noise=3, keep=0 になる', async () => {
          const baseDir = `${tempDir}/claude/2026/2026-03`;
          await _makeTestFile(`${baseDir}/say-ok-and-nothing-else.md`, _makeValidContent());
          await _makeTestFile(`${baseDir}/command-message-claude-idd-framework.md`, _makeValidContent());
          await _makeTestFile(`${baseDir}/command-message-deckrd-deckrd.md`, _makeValidContent());

          const { noise, keep } = await _runPipeline(tempDir, 'claude');

          assertEquals(noise, 3);
          assertEquals(keep, 0);
        });
      });
    });
  });

  // ─── T-PF-INT-05: ディレクトリなし → パイプラインが空を処理 ─────────────────

  describe('Given: agent ディレクトリが存在しない', () => {
    describe('When: findMdFiles → classifyFile パイプラインを実行', () => {
      describe('Then: T-PF-INT-05 - findMdFiles が空配列を返す', () => {
        it('T-PF-INT-05-01: noise=0, keep=0 になる', async () => {
          const { noise, keep } = await _runPipeline(tempDir, 'claude');

          assertEquals(noise, 0);
          assertEquals(keep, 0);
        });
      });
    });
  });
});
