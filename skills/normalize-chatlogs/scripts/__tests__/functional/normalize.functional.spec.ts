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
import { afterEach, describe, it } from '@std/testing/bdd';
import { assertNull } from '../../../../_scripts/__tests__/helpers/assert.ts';

// test helpers
import {
  installCommandMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// test target
import { segmentChatlogs } from '../../modules/segment-io.ts';
// types
import type { Segment } from '../../types/normalize.types.ts';

// ─── segmentChatlogs tests ─────────────────────────────────────────────────────

/**
 * segmentChatlogs のユニットテスト。
 * チャットログコンテンツを AI に渡してセグメント Map を取得する関数の
 * 正常系・エラー耐性・上限制御を検証する。
 */
describe('segmentChatlogs', () => {
  /** 正常系: runAI が有効な JSON 配列を返したときセグメント配列を返す */
  describe('Given: runAI が有効な JSON セグメント配列を返す', () => {
    describe('When: segmentChatlogs([{filePath, content}]) を呼び出す', () => {
      /**
       * Task T-09-01: 正常なセグメント配列の返却。
       * セグメントが正しく配列として返され、runAI がちょうど1回呼ばれることを確認する。
       */
      describe('Then: Task T-09-01 - 正常なセグメント配列の返却', () => {
        let mockHandle: CommandMockHandle;

        afterEach(() => {
          mockHandle.restore();
        });

        it('T-09-01-01: {title, summary, body}[] の2件以上の配列を返す', async () => {
          const filePath = 'path/to/file.md';
          const aiSegments = [
            {
              filePath,
              segments: [
                { title: 'Topic A', summary: 'Summary A', startLine: 1, endLine: 1 },
                { title: 'Topic B', summary: 'Summary B', startLine: 2, endLine: 2 },
              ],
            },
          ];
          mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(JSON.stringify(aiSegments))));

          const resultMap = await segmentChatlogs([{ filePath, content: 'Body A\nBody B' }]);
          const result = resultMap.get(filePath);

          assertEquals(Array.isArray(result), true);
          assertEquals((result as Segment[]).length >= 2, true);
          assertEquals((result as Segment[])[0].title, 'Topic A');
          assertEquals((result as Segment[])[0].summary, 'Summary A');
        });

        it('T-09-01-02: 1呼び出しにつき runAI をちょうど1回だけ呼び出す', async () => {
          const filePath = 'path/to/file.md';
          const counter = { calls: 0 };
          const aiSegments = [
            {
              filePath,
              segments: [
                { title: 'Topic A', summary: 'Summary A', startLine: 1, endLine: 1 },
                { title: 'Topic B', summary: 'Summary B', startLine: 2, endLine: 2 },
              ],
            },
          ];
          mockHandle = installCommandMock(makeCountingMock(JSON.stringify(aiSegments), counter));

          await segmentChatlogs([{ filePath, content: 'some chat content' }]);

          assertEquals(counter.calls, 1);
        });
      });
    });
  });

  /** 異常系: runAI がエラーまたは非 JSON を返した場合は null を返す */
  describe('Given: runAI がエラーをスローする', () => {
    describe('When: segmentChatlogs([{filePath, content}]) を呼び出す', () => {
      /**
       * Task T-09-02: エラー時の null 返却。
       * runAI がエラーをスロー、または非 JSON を返した場合に null が返ることを確認する。
       */
      describe('Then: Task T-09-02 - エラー時の null 返却', () => {
        let mockHandle: CommandMockHandle;

        afterEach(() => {
          mockHandle.restore();
        });

        it('T-09-02-01: null を返す', async () => {
          const filePath = 'path/to/file.md';
          mockHandle = installCommandMock(makeFailMock(1));

          const resultMap = await segmentChatlogs([{ filePath, content: 'some chat content' }]);

          assertNull(resultMap.get(filePath));
        });

        it('T-09-02-02: runAI が "not json" を返す場合に null を返す', async () => {
          const filePath = 'path/to/file.md';
          mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode('not json')));

          const resultMap = await segmentChatlogs([{ filePath, content: 'some chat content' }]);

          assertNull(resultMap.get(filePath));
        });
      });
    });
  });

  /** 正常系: セグメント数が上限 (5件) を超えた場合は最初の5件のみ返す */
  describe('Given: runAI が 8件のセグメントを返す', () => {
    describe('When: segmentChatlogs([{filePath, content}]) を呼び出す', () => {
      /**
       * Task T-09-03: セグメント数の上限適用。
       * runAI が10件を超えるセグメントを返した場合、最初の10件のみに絞られることを確認する。
       */
      describe('Then: Task T-09-03 - セグメント数の上限適用', () => {
        let mockHandle: CommandMockHandle;

        afterEach(() => {
          mockHandle.restore();
        });

        it('T-09-03-01: ちょうど5件のみ返される', async () => {
          const filePath = 'path/to/file.md';
          const content = Array.from({ length: 8 }, (_, i) => `Body ${i + 1}`).join('\n');
          const aiSegments = [
            {
              filePath,
              segments: Array.from({ length: 8 }, (_, i) => ({
                title: `Topic ${i + 1}`,
                summary: `Summary ${i + 1}`,
                startLine: i + 1,
                endLine: i + 1,
              })),
            },
          ];
          mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(JSON.stringify(aiSegments))));

          const resultMap = await segmentChatlogs([{ filePath, content }]);
          const result = resultMap.get(filePath);

          assertEquals((result as Segment[]).length, 5);
        });
      });
    });
  });
});
