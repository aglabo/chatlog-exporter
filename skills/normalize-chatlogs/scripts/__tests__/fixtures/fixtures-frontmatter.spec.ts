#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/fixtures/normalize-chatlogs.fixtures-frontmatter.spec.ts
// @(#): ファイル駆動fixturesテスト（フロントマター検証）
//       対象: attachFrontmatter() — fixtures-data/runai-frontmatter/ 下の各ディレクトリを自動スキャンし
//             同一ディレクトリの input.md を入力、output-<N>.md を期待フロントマターとして各フィールドを照合する
//       責務: フロントマターフィールド（title / summary）の完全一致のみ検証する
//             log_id は generateOutputFileName() が生成するランダム値を含むため、このテストでは検証しない
//             log_id の生成ルールは normalize-chatlogs.file-gen.unit.spec.ts で検証する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { findFixtureDirs } from '../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { collectOutputFiles } from './helpers/fixture-helpers.ts';

// test target
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { parseFrontmatterEntries as parseFrontmatter } from '../../../../_scripts/libs/text/frontmatter-utils.ts';
import {
  attachFrontmatter,
  generateSegmentFile,
  segmentChatlogs,
} from '../../modules/segment-io.ts';
import type { Segment } from '../../types/normalize.types.ts';

// ─── フロントマター検証対象フィールド ────────────────────────────────────────

// log_id はランダムハッシュを含むためここでは検証しない（file-gen.unit.spec.ts で検証）
const FRONTMATTER_KEYS = ['title', 'summary'] as const;

// ─── fixtures ルートパス ──────────────────────────────────────────────────────

const RUNAI_FRONTMATTER_DIR = new URL('./fixtures-data/runai-frontmatter', import.meta.url).pathname
  .replace(/^\/([A-Z]:)/, '$1');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** frontmatter fixture から指定フィールドの値を抽出する */
function _extractFrontmatterField(content: string, key: string): string {
  const match = content.match(new RegExp(`^${key}: (.+)$`, 'm'));
  return match ? match[1].trim() : '';
}

/** output-<N>.md のフロントマターからフィールド値を抽出して Segment を構築する */
async function _loadOutputSegment(filePath: string): Promise<Segment> {
  const content = await readTextFile(filePath);
  return {
    title: _extractFrontmatterField(content, 'title'),
    summary: _extractFrontmatterField(content, 'summary'),
    content: '',
  };
}

/**
 * Segment と ChatlogEntry から attachFrontmatter + generateSegmentFile で
 * フロントマター付き出力テキストを生成する。
 * log_id は検証対象外のためダミー値を使用する。
 *
 * @param segment - テスト対象セグメント
 * @param entry - ソースファイルの ChatlogEntry（フロントマターを保持）
 * @returns フロントマター付き Markdown 文字列
 */
function _buildOutput(
  segment: Segment,
  entry: ChatlogEntry,
): string {
  const segmentContent = generateSegmentFile(segment);
  return attachFrontmatter(segmentContent, entry.frontmatter, {
    title: segment.title,
    log_id: 'dummy',
    summary: segment.summary,
  });
}

// ─── ファイル駆動 fixtures-frontmatter tests ──────────────────────────────────

const _fixtureDirs = await findFixtureDirs(RUNAI_FRONTMATTER_DIR);
const _fixtureEntries = await Promise.all(
  _fixtureDirs.map(async (_dirName) => {
    const _frontmatterDir = `${RUNAI_FRONTMATTER_DIR}/${_dirName}`;
    const _outputFiles = await collectOutputFiles(_frontmatterDir);
    return { _dirName, _frontmatterDir, _outputFiles };
  }),
);

describe('attachFrontmatter — runai-frontmatter', () => {
  describe('Given: runai-frontmatter/* の各 fixture', () => {
    describe('When: attachFrontmatter(generateSegmentFile(segment), entry, segmentMeta) を呼び出す', () => {
      for (const { _dirName, _frontmatterDir, _outputFiles } of _fixtureEntries) {
        const _inputPath = `${_frontmatterDir}/input.md`;

        if (_outputFiles.length === 0) {
          it(`SFF-${_dirName}-fixture-error: output-*.md が存在しない（フィクスチャ定義漏れ）`, () => {
            throw new Error(
              `runai-frontmatter/${_dirName} に output-*.md がありません。`
                + `正常系なら output-N.md を、異常系なら runai-segments/error/ で管理してください。`,
            );
          });
          continue;
        }

        for (let _i = 0; _i < _outputFiles.length; _i++) {
          const _idx = _i;
          const _n = _idx + 1;

          for (const _key of FRONTMATTER_KEYS) {
            it(`SFF-${_dirName}-${_n}-${_key}: フロントマターの ${_key} が output-${_n} と一致する`, async () => {
              const _expectedSegments = await Promise.all(_outputFiles.map(_loadOutputSegment));
              const _fixtureContents = await Promise.all(_outputFiles.map((f) => readTextFile(f)));

              const _stdout = new TextEncoder().encode(JSON.stringify(_expectedSegments));
              const _mockHandle = installCommandMock(makeSuccessMock(_stdout));

              try {
                const _inputContent = await readTextFile(_inputPath);
                const _entry = new ChatlogEntry(_inputContent);
                const _result = await segmentChatlogs(_inputPath, _inputContent);
                const _segments = _result ?? [];

                const _actual = _buildOutput(_segments[_idx], _entry);
                const { meta: _actualMeta } = parseFrontmatter(_actual);
                const { meta: _expectedMeta } = parseFrontmatter(_fixtureContents[_idx]);
                assertEquals(_actualMeta[_key], _expectedMeta[_key]);
              } finally {
                _mockHandle.restore();
              }
            });
          }
        }
      }
    });
  });
});
