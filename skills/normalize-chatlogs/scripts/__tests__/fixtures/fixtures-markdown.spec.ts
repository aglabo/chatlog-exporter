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
import { describe, it } from '@std/testing/bdd';

// test helpers
import { findFixtureDirs } from '../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { collectOutputFiles } from './helpers/fixture-helpers.ts';

// test target
import { generateSegmentFile, START_BODY_HEADING } from '../../modules/segment-io.ts';
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

// ─── ファイル駆動 fixtures-markdown tests ─────────────────────────────────────

const _fixtureDirs = await findFixtureDirs(RUNAI_MARKDOWN_DIR);
const _fixtureEntries = await Promise.all(
  _fixtureDirs.map(async (_dirName) => {
    const _bodyDir = `${RUNAI_MARKDOWN_DIR}/${_dirName}`;
    const _bodyOutputFiles = await collectOutputFiles(_bodyDir);
    return { _dirName, _bodyDir, _bodyOutputFiles };
  }),
);

describe('generateSegmentFile — runai-markdown', () => {
  describe('Given: runai-markdown/* の各 fixture', () => {
    describe('When: generateSegmentFile(segment) を呼び出す', () => {
      for (const { _dirName, _bodyOutputFiles } of _fixtureEntries) {
        if (_bodyOutputFiles.length === 0) {
          it(`SFM-${_dirName}-fixture-error: output-*.md が存在しない（フィクスチャ定義漏れ）`, () => {
            throw new Error(
              `runai-markdown/${_dirName} に output-*.md がありません。`
                + `正常系なら output-N.md を、異常系なら runai-segments/error/ で管理してください。`,
            );
          });
          continue;
        }

        for (let _i = 0; _i < _bodyOutputFiles.length; _i++) {
          const _idx = _i;
          const _n = _idx + 1;

          it(`SFM-${_dirName}-${_n}-body: 生成した本文が runai-markdown/output-${_n} の START_BODY_HEADING 以降と完全一致する`, async () => {
            const _expectedSegments = await Promise.all(_bodyOutputFiles.map(_loadOutputSegment));
            const _bodyFixtureContents = await Promise.all(_bodyOutputFiles.map((f) => readTextFile(f)));

            const _generated = generateSegmentFile(_expectedSegments[_idx]);
            const _actual = _extractBodyFromFixture(_generated);
            const _expected = _extractBodyFromFixture(_bodyFixtureContents[_idx]);
            assertEquals(_actual, _expected);
          });
        }
      }
    });
  });
});
