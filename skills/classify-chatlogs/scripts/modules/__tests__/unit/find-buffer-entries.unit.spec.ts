// src: scripts/modules/__tests__/unit/find-buffer-entries.unit.spec.ts
// @(#): findChatlogFilePaths / loadClassifyEntries の単体テスト
//       対象: findChatlogFilePaths, loadClassifyEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findChatlogFilePaths, loadClassifyEntries } from '../../find-buffer-entries.ts';

// ─── Helpers
// types
import type { FrontmatterFields } from '../../../../../_scripts/types/frontmatter.types.ts';
import type { FindBufferEntriesOptions } from '../../../types/classify.types.ts';
import type { LoadClassifyEntryFailure } from '../../../types/load-classify-entry.types.ts';

// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

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

/**
 * エラーとして扱う `LoadClassifyEntryFailure` を生成する。
 * `loadMeta` スタブが読み込み失敗を表現するために使う。
 *
 * @param path - エラーとなったファイルパス
 * @returns `LoadClassifyEntryFailure`
 */
const _makeErrorResult = (path: string): LoadClassifyEntryFailure => ({
  filePath: path,
  error: new Error('load failed'),
});

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

/**
 * `loadClassifyEntries` のユニットテストスイート。
 *
 * ファイルパス一覧から `ChatlogEntry` を読み込み、成功分（`entries`）と失敗分（`errors`）に分離する。
 * 成功エントリについては必ず `action`（既定値 `EMPTY`）をキャッシュへ書き込み、既存 project frontmatter が
 * あれば同じ書き込みに含める。読み込み失敗エントリはキャッシュへエラー記録したうえで `errors` に含める。
 *
 * テスト ID 範囲: T-CL-LCE-01 〜 T-CL-LCE-05
 *
 * @see loadClassifyEntries
 */
describe('loadClassifyEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-LCE-01: frontmatter に project あり → cache に project と action: EMPTY が書き込まれ entries に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve(_makeEntry(_filePath, { project: 'proj-a' })),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.entries.map((e) => e.filePath), [_filePath]);
      assertEquals(_result.errors.length, 0);
      assertEquals(_cache.read(_filePath).project, 'proj-a');
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.EMPTY);
    });

    it('[Normal] T-CL-LCE-04: frontmatter に project なし → cache に action: EMPTY のみ書き込まれ entries に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve(_makeEntry(_filePath, {})),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.entries.map((e) => e.filePath), [_filePath]);
      assertEquals(_result.errors.length, 0);
      assertEquals(_cache.read(_filePath).project, undefined);
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.EMPTY);
    });

    it('[Normal] T-CL-LCE-05: 正常/異常混在 → 正常分は順序を保って entries に、異常分は errors に分離される', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _withProject = '/tmp/input/with-project.md';
      const _errorPath = '/tmp/input/error.md';
      const _noProject = '/tmp/input/no-project.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: (path: string) => {
          if (path === _errorPath) {
            return Promise.resolve(_makeErrorResult(path));
          }
          const _frontmatter: FrontmatterFields = path === _withProject ? { project: 'proj-a' } : {};
          return Promise.resolve(_makeEntry(path, _frontmatter));
        },
      };

      const _result = await loadClassifyEntries(
        [_withProject, _errorPath, _noProject],
        _cache,
        _opts,
      );

      assertEquals(_result.entries.map((e) => e.filePath), [_withProject, _noProject]);
      assertEquals(_result.errors.map((e) => e.filePath), [_errorPath]);
      assertEquals(_cache.read(_withProject).project, 'proj-a');
      assertEquals(_cache.read(_withProject).action, CLASSIFY_ACTIONS.EMPTY);
      assertEquals(_cache.read(_errorPath).action, CLASSIFY_ACTIONS.ERROR);
      assertEquals(_cache.read(_noProject).project, undefined);
      assertEquals(_cache.read(_noProject).action, CLASSIFY_ACTIONS.EMPTY);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-LCE-02: loadMeta が ERROR エントリを返す → cache に action: error が書き込まれ errors に含まれる（entries は空）', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/b.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve(_makeErrorResult(_filePath)),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.entries.length, 0);
      assertEquals(_result.errors.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.ERROR);
    });

    it('[Edge] T-CL-LCE-03: デフォルト読み込み（loadClassifyEntry）経由のフロントマターパースエラー → errors に分離され entries には含まれない', async () => {
      const _tempDir = await Deno.makeTempDir();
      try {
        const _cache = await _makeEmptyClassifyCache();
        const _filePath = `${_tempDir}/bad-yaml.md`;
        await Deno.writeTextFile(_filePath, '---\ntitle: [unclosed\n---\n本文');

        const _result = await loadClassifyEntries([_filePath], _cache);

        assertEquals(_result.entries.length, 0);
        assertEquals(_result.errors.map((e) => e.filePath), [_filePath]);
        assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.ERROR);
      } finally {
        await Deno.remove(_tempDir, { recursive: true });
      }
    });
  });
});
