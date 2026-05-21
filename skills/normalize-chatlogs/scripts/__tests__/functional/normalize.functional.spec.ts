#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/functional/normalize-chatlogs.functional.spec.ts
// @(#): 複数関数を組み合わせた機能テスト
//       対象: segmentChatlogs (runAI モック経由)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNull } from '../../../../_scripts/__tests__/helpers/assert.ts';

// test helpers
import {
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// test target
import { segmentChatlogs } from '../../modules/segment-io.ts';

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

          assertNull(result);
        });

        it('T-09-02-02: runAI が "not json" を返す場合に null を返す', async () => {
          const mock = makeSuccessMock(new TextEncoder().encode('not json'));
          (Deno as unknown as Record<string, unknown>).Command = mock;

          const result = await segmentChatlogs('path/to/file.md', 'some chat content');

          assertNull(result);
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
