#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/fixtures/normalize-chatlogs.fixtures-markdown.spec.ts
// @(#): ファイル駆動fixturesテスト（markdown 本文検証）
//       対象: generateSegmentFile() — fixtures-data/runai-markdown/ 下の各ディレクトリを自動スキャンし
//             同一ディレクトリの input.md を入力、output-<N>.md の START_BODY_HEADING 以降を期待本文として照合する
//       責務: generateSegmentFile() が生成する markdown 本文の完全一致のみ検証する
//             フロントマター・セグメント構造検証は別テストで行う
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';

// test target
import { generateSegmentFile, segmentChatlogs, START_BODY_HEADING } from '../../modules/segment-io.ts';
import type { Segment } from '../../types/normalize.types.ts';

// ─── fixtures ルートパス ──────────────────────────────────────────────────────

const RUNAI_MARKDOWN_DIR = new URL('./fixtures-data/runai-markdown', import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  '$1',
);

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * runai-markdown fixture から START_BODY_HEADING 以降の本文を抽出する。
 */
function _extractBodyFromFixture(content: string): string {
  const marker = START_BODY_HEADING + '\n';
  const idx = content.indexOf(marker);
  if (idx === -1) { return ''; }
  return content.slice(idx + marker.length).replace(/^\n+/, '');
}

/** runai-markdown fixture の output-<N>.md から body のみを持つ Segment を構築する（モック注入用） */
async function _loadOutputSegment(filePath: string): Promise<Segment> {
  const content = await readTextFile(filePath);
  const marker = START_BODY_HEADING + '\n';
  const idx = content.indexOf(marker);
  return {
    title: '',
    summary: '',
    content: idx === -1 ? '' : content.slice(idx + marker.length).replace(/^\n+/, ''),
  };
}

/**
 * fixtures ディレクトリ下の output-<N>.md を番号順に収集して返す。
 * N は 1 から始まる整数とする。
 */
async function _collectOutputFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && /^output-\d+\.md$/.test(entry.name)) {
      files.push(`${dir}/${entry.name}`);
    }
  }
  return files.sort((a, b) => {
    const _numA = parseInt(a.match(/output-(\d+)\.md$/)![1]);
    const _numB = parseInt(b.match(/output-(\d+)\.md$/)![1]);
    return _numA - _numB;
  });
}

/** fixtures ルートディレクトリ下のサブディレクトリ名を収集して返す */
async function _collectFixtureDirs(rootDir: string): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(rootDir)) {
    if (entry.isDirectory) {
      dirs.push(entry.name);
    }
  }
  return dirs.sort();
}

// ─── ファイル駆動 fixtures-markdown tests ─────────────────────────────────────

const _fixtureDirs = await _collectFixtureDirs(RUNAI_MARKDOWN_DIR);

for (const _dirName of _fixtureDirs) {
  const _bodyDir = `${RUNAI_MARKDOWN_DIR}/${_dirName}`;
  const _inputPath = `${_bodyDir}/input.md`;
  const _bodyOutputFiles = await _collectOutputFiles(_bodyDir);

  // output-*.md が存在しないディレクトリはフィクスチャ欠損としてテスト失敗させる
  if (_bodyOutputFiles.length === 0) {
    describe(`generateSegmentFile — runai-markdown/${_dirName}`, () => {
      it(`SFM-${_dirName}-fixture-error: output-*.md が存在しない（フィクスチャ定義漏れ）`, () => {
        throw new Error(
          `runai-markdown/${_dirName} に output-*.md がありません。`
            + `正常系なら output-N.md を、異常系なら runai-segments/error/ で管理してください。`,
        );
      });
    });
    continue;
  }

  describe(`generateSegmentFile — runai-markdown/${_dirName}`, () => {
    describe(`Given: ${_dirName}/input.md と ${_bodyOutputFiles.length} 件の body fixture`, () => {
      let _segments: Segment[];
      let _expectedSegments: Segment[];
      let _bodyFixtureContents: string[];
      let _mockHandle: ReturnType<typeof installCommandMock>;

      beforeEach(async () => {
        _expectedSegments = await Promise.all(_bodyOutputFiles.map(_loadOutputSegment));
        _bodyFixtureContents = await Promise.all(
          _bodyOutputFiles.map((f) => readTextFile(f)),
        );

        const _stdout = new TextEncoder().encode(JSON.stringify(_expectedSegments));
        _mockHandle = installCommandMock(makeSuccessMock(_stdout));

        const _inputContent = await readTextFile(_inputPath);
        const _result = await segmentChatlogs(_inputPath, _inputContent);
        _segments = _result ?? [];
      });

      afterEach(() => {
        _mockHandle.restore();
      });

      describe('When: generateSegmentFile(segment) を呼び出す', () => {
        for (let _i = 0; _i < _bodyOutputFiles.length; _i++) {
          const _idx = _i;
          const _n = _idx + 1;

          it(`SFM-${_dirName}-${_n}-body: 生成した本文が runai-markdown/output-${_n} の START_BODY_HEADING 以降と完全一致する`, () => {
            const _generated = generateSegmentFile(_segments[_idx]);
            const _actual = _extractBodyFromFixture(_generated);
            const _expected = _extractBodyFromFixture(_bodyFixtureContents[_idx]);
            assertEquals(_actual, _expected);
          });
        }
      });
    });
  });
}
