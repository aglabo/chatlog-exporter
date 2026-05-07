// src: scripts/__tests__/functional/set-frontmatter.write-frontmatter.functional.spec.ts
// @(#): writeFrontmatter の機能テスト
//       実ファイルを使ったフロントマター書き込みの検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';

// test target
import type { FrontmatterFileMeta, FrontmatterResult, Stats } from '../../set-frontmatter.ts';
import { writeFrontmatter } from '../../set-frontmatter.ts';

// exists
import { fileOrDirExists } from '../../../../_scripts/libs/file-io/exists-utils.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';

// ─── テスト共通セットアップ ───────────────────────────────────────────────────

let tempDir: string;
let errStub: Stub<Console>;
let logStub: Stub<Console>;

function _makeFrontmatterFileMeta(filePath: string): FrontmatterFileMeta {
  return {
    file: filePath,
    sessionId: 'sess-001',
    date: '2026-03-15',
    project: 'my-project',
    slug: 'test-slug',
    content: '# テスト\n本文テキスト',
    fullBody: '# テスト\n本文テキスト',
  };
}

function _makeResult(filePath: string, yaml = 'title: テスト\nsummary: テスト概要'): FrontmatterResult {
  return {
    file: filePath,
    type: 'research',
    category: 'development',
    yaml,
  };
}

function _makeStats(): Stats {
  return { total: 1, success: 0, fail: 0, skip: 0 };
}

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
  errStub = stub(console, 'error', () => {});
  logStub = stub(console, 'log', () => {});
});

afterEach(async () => {
  errStub.restore();
  logStub.restore();
  await Deno.remove(tempDir, { recursive: true });
});

// ─── dryRun=false: ファイルが更新される ──────────────────────────────────────

describe('writeFrontmatter', () => {
  describe('Given: 有効な yaml と dryRun=false', () => {
    describe('When: writeFrontmatter(fm, result, false, stats) を呼び出す', () => {
      describe('Then: T-SF-WF-01 - ファイルが更新され stats.success が増える', () => {
        it('T-SF-WF-01-01: ファイルが更新される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('---'), true);
        });

        it('T-SF-WF-01-02: stats.success が 1 になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          assertEquals(stats.success, 1);
        });

        it('T-SF-WF-01-03: ファイルに "type: research" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes("type: 'research'"), true);
        });

        it('T-SF-WF-01-04: ファイルに "category: development" が含まれる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes("category: 'development'"), true);
        });

        it('T-SF-WF-01-05: fullBody が末尾に保持される', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated.includes('# テスト'), true);
        });
      });
    });
  });

  // ─── dryRun=true: ファイルは変更されない ─────────────────────────────────

  describe('Given: 有効な yaml と dryRun=true', () => {
    describe('When: writeFrontmatter(fm, result, true, stats) を呼び出す', () => {
      describe('Then: T-SF-WF-02 - ファイルは変更されず stats.success が増える', () => {
        it('T-SF-WF-02-01: ファイルが変更されない', async () => {
          const filePath = `${tempDir}/test.md`;
          const originalContent = '# テスト\n本文';
          await Deno.writeTextFile(filePath, originalContent);
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, true, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated, originalContent);
        });

        it('T-SF-WF-02-02: stats.success が 1 になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, true, stats);

          assertEquals(stats.success, 1);
        });
      });
    });
  });

  // ─── yaml が空文字の場合 ──────────────────────────────────────────────────

  describe('Given: yaml が空文字の result', () => {
    describe('When: writeFrontmatter(fm, result, false, stats) を呼び出す', () => {
      describe('Then: T-SF-WF-03 - stats.fail が増える', () => {
        it('T-SF-WF-03-01: stats.fail が 1 になる', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath, '');
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          assertEquals(stats.fail, 1);
        });

        it('T-SF-WF-03-02: ファイルが変更されない', async () => {
          const filePath = `${tempDir}/test.md`;
          const originalContent = '# テスト\n本文';
          await Deno.writeTextFile(filePath, originalContent);
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath, '');
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          const updated = await readTextFile(filePath);
          assertEquals(updated, originalContent);
        });
      });
    });
  });

  // ─── 一時ファイルが残らない ───────────────────────────────────────────────

  describe('Given: 正常な書き込み完了後', () => {
    describe('When: writeFrontmatter(fm, result, false, stats) を呼び出す', () => {
      describe('Then: T-SF-WF-04 - .tmp ファイルが残らない', () => {
        it('T-SF-WF-04-01: .tmp ファイルが残らない', async () => {
          const filePath = `${tempDir}/test.md`;
          await Deno.writeTextFile(filePath, '# テスト\n本文');
          const fm = _makeFrontmatterFileMeta(filePath);
          const result = _makeResult(filePath);
          const stats = _makeStats();

          await writeFrontmatter(fm, result, false, stats);

          assertEquals(await fileOrDirExists(`${filePath}.tmp`), false);
        });
      });
    });
  });
});
