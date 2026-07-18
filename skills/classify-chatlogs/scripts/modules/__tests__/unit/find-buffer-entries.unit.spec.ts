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
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import type { FrontmatterFields } from '../../../../../_scripts/types/frontmatter.types.ts';
import type { ClassifyCache, FindBufferEntriesOptions } from '../../../types/classify.types.ts';

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
 * エラーとして扱う `ChatlogEntry` を生成する。
 *
 * 実装のローダーが担う「読み込み失敗時に `cache` へ `action: ERROR` を書き込む」責務を、
 * `loadMeta` スタブ側で `cache` への書き込みとして代替する。
 *
 * @param path - エラーとなったファイルパス
 * @param cache - 書き込み先の `ChatlogCache`
 * @returns エラー扱いの `ChatlogEntry`
 */
const _makeErrorResult = async (
  path: string,
  cache: ChatlogCache<ClassifyCache>,
): Promise<ChatlogEntry> => {
  await cache.write(path, { action: CLASSIFY_ACTIONS.ERROR, reason: 'load failed' });
  return new ChatlogEntry('', { filePath: path });
};

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
 * ファイルパス一覧から `ChatlogEntry` を読み込み、各エントリについて必ず `action`（既定値 `EMPTY`）を
 * キャッシュへ書き込み、既存 project frontmatter があれば同じ書き込みに含める。
 * 読み込み失敗エントリはキャッシュへエラー記録したうえで、戻り値には含める振る舞いを検証する。
 *
 * テスト ID 範囲: T-CL-LCE-01 〜 T-CL-LCE-05
 *
 * @see loadClassifyEntries
 */
describe('loadClassifyEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-LCE-01: frontmatter に project あり → cache に project と action: EMPTY が書き込まれ戻り値に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve(_makeEntry(_filePath, { project: 'proj-a' })),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).project, 'proj-a');
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.EMPTY);
    });

    it('[Normal] T-CL-LCE-04: frontmatter に project なし → cache に action: EMPTY のみ書き込まれ戻り値に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve(_makeEntry(_filePath, {})),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).project, undefined);
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.EMPTY);
    });

    it('[Normal] T-CL-LCE-05: 正常/異常混在 → 全件が順序を保って戻り値に含まれ、正常分は action: EMPTY、エラー分は action: ERROR が個別に反映される', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _withProject = '/tmp/input/with-project.md';
      const _errorPath = '/tmp/input/error.md';
      const _noProject = '/tmp/input/no-project.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: (path: string) => {
          if (path === _errorPath) {
            return _makeErrorResult(path, _cache);
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

      assertEquals(_result.map((e) => e.filePath), [_withProject, _errorPath, _noProject]);
      assertEquals(_cache.read(_withProject).project, 'proj-a');
      assertEquals(_cache.read(_withProject).action, CLASSIFY_ACTIONS.EMPTY);
      assertEquals(_cache.read(_errorPath).action, CLASSIFY_ACTIONS.ERROR);
      assertEquals(_cache.read(_noProject).project, undefined);
      assertEquals(_cache.read(_noProject).action, CLASSIFY_ACTIONS.EMPTY);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-LCE-02: loadMeta が ERROR エントリを返す → cache に action: error が書き込まれるが戻り値には含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/b.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => _makeErrorResult(_filePath, _cache),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.ERROR);
    });

    it('[Edge] T-CL-LCE-03: デフォルト読み込み（loadClassifyEntry）経由のフロントマターパースエラー → cache に action: error が書き込まれるが戻り値には含まれる', async () => {
      const _tempDir = await Deno.makeTempDir();
      try {
        const _cache = await _makeEmptyClassifyCache();
        const _filePath = `${_tempDir}/bad-yaml.md`;
        await Deno.writeTextFile(_filePath, '---\ntitle: [unclosed\n---\n本文');

        const _result = await loadClassifyEntries([_filePath], _cache);

        assertEquals(_result.map((e) => e.filePath), [_filePath]);
        assertEquals(_cache.read(_filePath).action, CLASSIFY_ACTIONS.ERROR);
      } finally {
        await Deno.remove(_tempDir, { recursive: true });
      }
    });
  });
});
