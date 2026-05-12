#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/functional/normalize-chatlogs.functional.spec.ts
// @(#): 複数関数を組み合わせた機能テスト
//       対象: segmentChatlogs (runAI モック経由),
//             writeOutput (Deno.stat/rename モック, _backupOldPath を内部利用)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';

// test helpers
import {
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// test target
import {
  segmentChatlogs,
  writeOutput,
} from '../../normalize-chatlogs.ts';
import type { Stats } from '../../normalize-chatlogs.ts';

// ─── segmentChatlogs tests ─────────────────────────────────────────────────────

/**
 * segmentChatlogs のユニットテスト。
 * チャットログコンテンツを AI に渡してセグメント配列 `{title, summary, body}[]` を取得する関数の
 * 正常系・エラー耐性・上限制御を検証する。
 */
describe('segmentChatlogs', () => {
  /** 正常系: runAI が有効な JSON 配列を返したときセグメント配列を返す */
  describe('Given: runAI が有効な JSON セグメント配列を返す', () => {
    describe('When: segmentChatlogs(filePath, content) を呼び出す', () => {
      /**
       * Task T-09-01: 正常なセグメント配列の返却。
       * セグメントが正しく配列として返され、runAI がちょうど1回呼ばれることを確認する。
       */
      describe('Then: Task T-09-01 - 正常なセグメント配列の返却', () => {
        let savedCommand: unknown;
        beforeEach(() => {
          savedCommand = (Deno as unknown as Record<string, unknown>).Command;
        });
        afterEach(() => {
          (Deno as unknown as Record<string, unknown>).Command = savedCommand;
        });

        it('T-09-01-01: {title, summary, body}[] の2件以上の配列を返す', async () => {
          const segments = [
            { title: 'Topic A', summary: 'Summary A', content: 'Body A' },
            { title: 'Topic B', summary: 'Summary B', content: 'Body B' },
          ];
          const mock = makeSuccessMock(new TextEncoder().encode(JSON.stringify(segments)));
          (Deno as unknown as Record<string, unknown>).Command = mock;

          const result = await segmentChatlogs('path/to/file.md', 'some chat content');

          assertEquals(Array.isArray(result), true);
          assertEquals((result as unknown[]).length >= 2, true);
          assertEquals((result as { title: string }[])[0].title, 'Topic A');
          assertEquals((result as { summary: string }[])[0].summary, 'Summary A');
          assertEquals((result as { content: string }[])[0].content, 'Body A');
        });

        it('T-09-01-02: 1呼び出しにつき runAI をちょうど1回だけ呼び出す', async () => {
          const counter = { calls: 0 };
          const segments = [
            { title: 'Topic A', summary: 'Summary A', content: 'Body A' },
            { title: 'Topic B', summary: 'Summary B', content: 'Body B' },
          ];
          const mock = makeCountingMock(JSON.stringify(segments), counter);
          (Deno as unknown as Record<string, unknown>).Command = mock;

          await segmentChatlogs('path/to/file.md', 'some chat content');

          assertEquals(counter.calls, 1);
        });
      });
    });
  });

  /** 異常系: runAI がエラーまたは非 JSON を返した場合は null を返す */
  describe('Given: runAI がエラーをスローする', () => {
    describe('When: segmentChatlogs(filePath, content) を呼び出す', () => {
      /**
       * Task T-09-02: エラー時の null 返却。
       * runAI がエラーをスロー、または非 JSON を返した場合に null が返ることを確認する。
       */
      describe('Then: Task T-09-02 - エラー時の null 返却', () => {
        let savedCommand: unknown;
        beforeEach(() => {
          savedCommand = (Deno as unknown as Record<string, unknown>).Command;
        });
        afterEach(() => {
          (Deno as unknown as Record<string, unknown>).Command = savedCommand;
        });

        it('T-09-02-01: null を返す', async () => {
          (Deno as unknown as Record<string, unknown>).Command = makeFailMock(1);

          const result = await segmentChatlogs('path/to/file.md', 'some chat content');

          assertEquals(result, null);
        });

        it('T-09-02-02: runAI が "not json" を返す場合に null を返す', async () => {
          const mock = makeSuccessMock(new TextEncoder().encode('not json'));
          (Deno as unknown as Record<string, unknown>).Command = mock;

          const result = await segmentChatlogs('path/to/file.md', 'some chat content');

          assertEquals(result, null);
        });
      });
    });
  });

  /** 正常系: セグメント数が上限 (10件) を超えた場合は最初の10件のみ返す */
  describe('Given: runAI が 15件のセグメントを返す', () => {
    describe('When: segmentChatlogs(filePath, content) を呼び出す', () => {
      /**
       * Task T-09-03: セグメント数の上限適用。
       * runAI が10件を超えるセグメントを返した場合、最初の10件のみに絞られることを確認する。
       */
      describe('Then: Task T-09-03 - セグメント数の上限適用', () => {
        let savedCommand: unknown;
        beforeEach(() => {
          savedCommand = (Deno as unknown as Record<string, unknown>).Command;
        });
        afterEach(() => {
          (Deno as unknown as Record<string, unknown>).Command = savedCommand;
        });

        it('T-09-03-01: ちょうど10件のみ返される', async () => {
          const segments = Array.from({ length: 15 }, (_, i) => ({
            title: `Topic ${i + 1}`,
            summary: `Summary ${i + 1}`,
            content: `Body ${i + 1}`,
          }));
          const mock = makeSuccessMock(new TextEncoder().encode(JSON.stringify(segments)));
          (Deno as unknown as Record<string, unknown>).Command = mock;

          const result = await segmentChatlogs('path/to/file.md', 'some chat content');

          assertEquals((result as unknown[]).length, 10);
        });
      });
    });
  });
});

// ─── writeOutput tests ────────────────────────────────────────────────────────

// ─── Internal Helpers

/** ファイルとして存在することを示す `stat` スタブ返し値。`fileExists` が `true` を返す前提条件に使用する。 */
const _existingFileStat = () => Promise.resolve({ isFile: true } as Deno.FileInfo);

/**
 * writeOutput の機能テスト。
 * Deno.stat / Deno.rename / Deno.writeTextFile をモック化し、
 * ファイル書き込み、既存ファイルのリネーム、ドライランモードを検証する。
 */
describe('writeOutput', () => {
  let statStub: Stub | null = null;
  let renameStub: Stub | null = null;
  let writeTextFileStub: Stub | null = null;

  afterEach(() => {
    statStub?.restore();
    statStub = null;
    renameStub?.restore();
    renameStub = null;
    writeTextFileStub?.restore();
    writeTextFileStub = null;
  });

  /** 正常系: 存在しない出力パスにアトミックにファイルを書き込む */
  describe('Given: 存在しない出力パスと dryRun=false', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-01 - アトミックなファイル書き込み', () => {
        it('T-13-01-01: stats.success がインクリメントされる', async () => {
          // stat → NotFound (ファイル未存在)
          statStub = stub(Deno, 'stat', () => Promise.reject(new Deno.errors.NotFound('not found')));
          const writtenPaths: string[] = [];
          writeTextFileStub = stub(Deno, 'writeTextFile', (path: string | URL) => {
            writtenPaths.push(String(path));
            return Promise.resolve();
          });
          renameStub = stub(Deno, 'rename', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/entry.md', 'content', false, stats);

          assertEquals(stats.success, 1);
          // .tmp ファイルに書いて rename するアトミック書き込みを確認
          assertEquals(writtenPaths.includes('output/entry.md.tmp'), true);
        });

        it('T-13-01-02: .tmp パスに書き込んでから outputPath にリネームする', async () => {
          statStub = stub(Deno, 'stat', () => Promise.reject(new Deno.errors.NotFound('not found')));
          const writtenPaths: string[] = [];
          writeTextFileStub = stub(Deno, 'writeTextFile', (path: string | URL) => {
            writtenPaths.push(String(path));
            return Promise.resolve();
          });
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/entry.md', 'content', false, stats);

          assertEquals(writtenPaths[0], 'output/entry.md.tmp');
          assertEquals(renamedArgs[renamedArgs.length - 1], ['output/entry.md.tmp', 'output/entry.md']);
        });
      });
    });
  });

  /** 正常系: すでに存在するファイルを .old-01.md にリネームしてから新規書き込みする */
  describe('Given: すでに存在する出力パス', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-02 - 既存ファイルのリネームと新規書き込み', () => {
        it('T-13-02-01: 既存ファイルを .old-01.md にリネームしてから書き込む', async () => {
          statStub = stub(Deno, 'stat', _existingFileStat);
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          // バックアップファイルなし → old-01.md に
          await writeOutput('output/existing.md', 'new content', false, stats, () => Promise.resolve([]));

          // 1回目のリネームが既存ファイル → old-01.md であること
          assertEquals(renamedArgs[0], ['output/existing.md', 'output/existing.old-01.md']);
          assertEquals(stats.success, 1);
          assertEquals(stats.skip, 0);
        });

        it('T-13-02-02: .old-01.md が既にある場合は .old-02.md にリネームする', async () => {
          statStub = stub(Deno, 'stat', _existingFileStat);
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          // old-01.md が既存 → old-02.md に
          await writeOutput(
            'output/existing.md',
            'new content',
            false,
            stats,
            () => Promise.resolve(['existing.old-01.md']),
          );

          assertEquals(renamedArgs[0], ['output/existing.md', 'output/existing.old-02.md']);
          assertEquals(stats.success, 1);
        });
      });
    });
  });

  /** 正常系: dryRun=true のときファイル操作を行わない */
  describe('Given: dryRun=true', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-03 - ドライランモード', () => {
        it('T-13-03-01: Deno.writeTextFile が呼ばれず stats.success が 0 のまま', async () => {
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/dry.md', '## Summary\nbody', true, stats);

          assertEquals((writeTextFileStub as unknown as { calls: unknown[] }).calls.length, 0);
          assertEquals(stats.success, 0);
        });
      });
    });
  });

  /** 異常系: R-010 ガード — chatlogs/ 配下への書き込みはエラーをスローする */
  describe('[異常] Error Cases', () => {
    describe('Given: chatlogs/ 配下の入力パスを出力先に指定する', () => {
      describe('When: writeOutput(inputPath, content, false, stats) を呼び出す', () => {
        describe('Then: Task T-13-04 - R-010 ガードによるエラー', () => {
          it('T-13-04-01: chatlogs/ 配下のパスへの書き込みが行われない (R-010)', async () => {
            const stats: Stats = { success: 0, skip: 0, fail: 0 };
            const inputPath = 'chatlogs/claude/2026/2026-03/sample.md';

            await assertRejects(
              async () => {
                await writeOutput(inputPath, 'overwrite', false, stats);
              },
              Error,
              'Forbidden Output',
            );
          });
        });
      });
    });

    /** 異常系: バックアップスロット 01〜99 がすべて埋まっている場合は Error をスローする */
    describe('Given: outputPath と old-01〜old-99 が全て存在する', () => {
      describe('When: writeOutput を呼び出す', () => {
        describe('Then: Task T-13-05 - バックアップスロット上限超過で Error をスローする', () => {
          it('T-13-05-01: "too many backups" エラーをスローする', async () => {
            statStub = stub(Deno, 'stat', _existingFileStat);
            renameStub = stub(Deno, 'rename', () => Promise.resolve());
            const allSlots = Array.from({ length: 99 }, (_, i) => `entry.old-${String(i + 1).padStart(2, '0')}.md`);
            const stats: Stats = { success: 0, skip: 0, fail: 0 };

            await assertRejects(
              () => writeOutput('output/entry.md', 'content', false, stats, () => Promise.resolve(allSlots)),
              Error,
              'too many backups',
            );
          });
        });
      });
    });
  });
});
