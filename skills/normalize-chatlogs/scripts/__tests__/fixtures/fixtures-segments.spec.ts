#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/fixtures/normalize-chatlogs.fixtures-segments.spec.ts
// @(#): ファイル駆動fixturesテスト
//       対象: segmentChatlogs() — fixtures-data/runai-segments/ 下の各ディレクトリを再帰スキャンし
//             input.md を入力、output.yaml の count を期待セグメント数として照合する
//       責務: セグメント数のみ検証する
//             セグメントフィールド・markdown 生成・フロントマター検証は別テストで行う
//
//       フィクスチャ分類:
//         runai-segments/             … 正常系 (count > 0)
//         runai-segments/fallback/    … 入力欠損でも成立するケース (count: 1)
//         runai-segments/error/external/ … 外部依存エラー (AI呼び出し失敗など)
//         runai-segments/error/internal/ … 内部パースエラー (JSON不正など)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals, assertExists, assertMatch } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';
import { assertNull } from '../../../../_cle-libs/__tests__/helpers/assert.ts';

// test helpers
import {
  installCommandMock,
  makeClaudeJsonMock,
  makeFailMock,
  makeNotFoundMock,
} from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { DenoCommandLike } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { findFixtureDirs } from '../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
// exists
import { readTextFile } from '../../../../_cle-libs/libs/file-io/read-utils.ts';

// test target
import { segmentChatlogs } from '../../modules/segment-ai.ts';
// classes
import { ChatlogEntry } from '../../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── fixtures ルートパス ──────────────────────────────────────────────────────

const RUNAI_FIXTURES_DIR = new URL('./fixtures-data/runai-segments', import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  '$1',
);

// ─── 型定義 ───────────────────────────────────────────────────────────────────

type FixtureOutput =
  | { kind: 'success'; count: number }
  | { kind: 'error'; error: string; expectedResult: null };

// ─── helpers ─────────────────────────────────────────────────────────────────

/** output.yaml から期待セグメント数またはエラー種別を読み込む */
async function _loadOutput(dir: string): Promise<FixtureOutput> {
  const content = await readTextFile(`${dir}/output.yaml`);
  const parsed = parseYaml(content) as Record<string, unknown>;
  if (parsed.error !== undefined) {
    return { kind: 'error', error: String(parsed.error), expectedResult: null };
  }
  return { kind: 'success', count: Number(parsed.count) };
}

/** output の種別に応じたモックを生成する */
function _buildMock(output: FixtureOutput, filePath: string): DenoCommandLike {
  if (output.kind === 'error') {
    switch (output.error) {
      case 'external/ai-fail':
        return makeFailMock(1);
      case 'external/not-found':
        return makeNotFoundMock();
      case 'internal/invalid-json':
        return makeClaudeJsonMock('not-json');
      default:
        return makeFailMock(1);
    }
  }
  const _mockSegments = Array.from({ length: output.count }, (_, i) => ({
    title: `title-${i}`,
    summary: `summary-${i}`,
    content: `content-${i}`,
  }));
  const _aiResult = [{ filePath, segments: _mockSegments }];
  return makeClaudeJsonMock(JSON.stringify(_aiResult));
}

// ─── ファイル駆動 fixtures tests ──────────────────────────────────────────────

const _fixtureDirs = await findFixtureDirs(RUNAI_FIXTURES_DIR);
const _fixtureEntries = await Promise.all(
  _fixtureDirs.map(async (_relPath) => {
    const _fixtureDir = `${RUNAI_FIXTURES_DIR}/${_relPath}`;
    const _output = await _loadOutput(_fixtureDir);
    return { _relPath, _fixtureDir, _output };
  }),
);

describe('segmentChatlogs — runai-segments', () => {
  describe('Given: runai-segments/* の各 fixture', () => {
    describe('When: 正常系', () => {
      for (const { _relPath, _fixtureDir, _output } of _fixtureEntries) {
        if (_output.kind !== 'success') { continue; }

        const _inputPath = `${_fixtureDir}/input.md`;

        it(`SF-${_relPath}-count: セグメント数が output.yaml の count と一致する`, async () => {
          const _mockHandle = installCommandMock(_buildMock(_output, _inputPath));
          try {
            const _inputContent = await readTextFile(_inputPath);
            const _map = await segmentChatlogs([new ChatlogEntry(_inputContent, { filePath: _inputPath })]);
            const _segments = _map.get(_inputPath) ?? [];
            assertEquals(_segments.length, _output.count);
          } finally {
            _mockHandle.restore();
          }
        });

        it(`SF-${_relPath}-structure: 各セグメントが title/summary フィールドを持つ`, async () => {
          const _mockHandle = installCommandMock(_buildMock(_output, _inputPath));
          try {
            const _inputContent = await readTextFile(_inputPath);
            const _map = await segmentChatlogs([new ChatlogEntry(_inputContent, { filePath: _inputPath })]);
            const _segments = _map.get(_inputPath) ?? [];
            for (const seg of _segments) {
              assertExists(seg.title);
              assertExists(seg.summary);
              assertMatch(seg.title, /^title-\d+$/);
            }
          } finally {
            _mockHandle.restore();
          }
        });
      }
    });

    describe('When: 異常系', () => {
      for (const { _relPath, _fixtureDir, _output } of _fixtureEntries) {
        if (_output.kind !== 'error') { continue; }

        const _inputPath = `${_fixtureDir}/input.md`;

        it(`SF-${_relPath}-error: segmentChatlogs が null を返す`, async () => {
          const _mockHandle = installCommandMock(_buildMock(_output, _inputPath));
          try {
            const _inputContent = await readTextFile(_inputPath);
            const _map = await segmentChatlogs([new ChatlogEntry(_inputContent, { filePath: _inputPath })]);
            assertNull(_map.get(_inputPath));
          } finally {
            _mockHandle.restore();
          }
        });
      }
    });
  });
});
