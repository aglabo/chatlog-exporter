#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/fixtures/normalize-chatlog.fixtures-segments.spec.ts
// @(#): ファイル駆動fixturesテスト
//       対象: segmentChatlog() — fixtures-data/runai-segments/ 下の各ディレクトリを再帰スキャンし
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
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// test helpers
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { DenoCommandLike } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// exists
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';

// test target
import { segmentChatlog } from '../../normalize-chatlog.ts';
import type { Segment } from '../../normalize-chatlog.ts';

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
function _buildMock(output: FixtureOutput): DenoCommandLike {
  if (output.kind === 'error') {
    switch (output.error) {
      case 'external/ai-fail':
        return makeFailMock(1);
      case 'external/not-found':
        return makeNotFoundMock();
      case 'internal/invalid-json':
        return makeSuccessMock(new TextEncoder().encode('not-json'));
      default:
        return makeFailMock(1);
    }
  }
  const _mockSegments = Array.from({ length: output.count }, () => ({
    title: '',
    summary: '',
    content: '',
  }));
  return makeSuccessMock(new TextEncoder().encode(JSON.stringify(_mockSegments)));
}

/**
 * rootDir 以下を再帰スキャンし、input.md を持つディレクトリのパスを収集して返す。
 * 戻り値は rootDir からの相対パス (例: "fallback/chatlog-01-empty-body")。
 */
async function _collectFixtureDirs(rootDir: string): Promise<string[]> {
  const dirs: string[] = [];

  async function _walk(dir: string, rel: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isDirectory) { continue; }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = `${dir}/${entry.name}`;
      if (await fileExists(`${childAbs}/input.md`)) {
        dirs.push(childRel);
      } else {
        await _walk(childAbs, childRel);
      }
    }
  }

  await _walk(rootDir, '');
  return dirs.sort();
}

// ─── ファイル駆動 fixtures tests ──────────────────────────────────────────────

const _fixtureDirs = await _collectFixtureDirs(RUNAI_FIXTURES_DIR);

for (const _relPath of _fixtureDirs) {
  const _fixtureDir = `${RUNAI_FIXTURES_DIR}/${_relPath}`;
  const _inputPath = `${_fixtureDir}/input.md`;
  const _output = await _loadOutput(_fixtureDir);

  describe(`segmentChatlog — runai-segments/${_relPath}`, () => {
    if (_output.kind === 'success') {
      describe(`Given: ${_relPath}/input.md と output.yaml (count: ${_output.count})`, () => {
        let _segments: Segment[];
        let _mockHandle: ReturnType<typeof installCommandMock>;

        beforeEach(async () => {
          _mockHandle = installCommandMock(_buildMock(_output));

          const _inputContent = await readTextFile(_inputPath);
          const _result = await segmentChatlog(_inputPath, _inputContent);
          _segments = _result ?? [];
        });

        afterEach(() => {
          _mockHandle.restore();
        });

        describe('When: segmentChatlog(inputPath, content) を呼び出す', () => {
          it(`SF-${_relPath}-count: セグメント数が output.yaml の count と一致する`, () => {
            assertEquals(_segments.length, _output.count);
          });
        });
      });
    } else {
      describe(`Given: ${_relPath}/input.md と output.yaml (error: ${_output.error})`, () => {
        let _result: Segment[] | null;
        let _mockHandle: ReturnType<typeof installCommandMock>;

        beforeEach(async () => {
          _mockHandle = installCommandMock(_buildMock(_output));

          const _inputContent = await readTextFile(_inputPath);
          _result = await segmentChatlog(_inputPath, _inputContent);
        });

        afterEach(() => {
          _mockHandle.restore();
        });

        describe('When: segmentChatlog(inputPath, content) を呼び出す', () => {
          it(`SF-${_relPath}-error: segmentChatlog が null を返す`, () => {
            assertEquals(_result, null);
          });
        });
      });
    }
  });
}
