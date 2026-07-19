// src: scripts/libs/__tests__/unit/find-files-flat.unit.spec.ts
// @(#): findChatlogFilePaths の単体テスト
//       対象: findChatlogFilePaths
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findChatlogFilePaths } from '../../find-files-flat.ts';

// ─── Helpers
// types
import type { FindBufferEntriesOptions } from '../../../types/classify.types.ts';

// ─── Internal Helpers

// functions

/**
 * `opts.glob` 用のスタブを生成する。
 *
 * 渡された `paths` を、glob パターン引数を無視してそのまま返す。
 *
 * @param paths - 返却するファイルパス配列
 * @returns `GlobProvider` 互換のスタブ関数
 */
const _makeGlob = (paths: string[]): FindBufferEntriesOptions['glob'] => (_pattern: string) => Promise.resolve(paths);

// ─── Tests

/**
 * `findChatlogFilePaths` のユニットテストスイート。
 *
 * ディレクトリ直下の `.md` ファイルパス一覧取得を検証する。
 *
 * テスト ID 範囲: T-CL-FCP-01 〜 T-CL-FCP-02
 *
 * @see findChatlogFilePaths
 */
describe('findChatlogFilePaths', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-FCP-01: glob が複数パスを返す → そのままファイルパス配列として返る', async () => {
      const _paths = ['/tmp/input/a.md', '/tmp/input/b.md'];

      const _result = await findChatlogFilePaths('/tmp/input', { glob: _makeGlob(_paths) });

      assertEquals(_result, _paths);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-FCP-02: 対象ディレクトリに .md ファイルが1件もない → 空配列が返る', async () => {
      const _result = await findChatlogFilePaths('/tmp/input', { glob: _makeGlob([]) });

      assertEquals(_result, []);
    });
  });
});
