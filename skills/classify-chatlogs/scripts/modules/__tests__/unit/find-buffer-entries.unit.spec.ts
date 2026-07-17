// src: scripts/modules/__tests__/unit/find-buffer-entries.unit.spec.ts
// @(#): findBufferEntries の単体テスト
//       対象: findBufferEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findBufferEntries, findChatlogFilePaths, loadClassifyEntries } from '../../find-buffer-entries.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { FrontmatterFields } from '../../../../../_scripts/types/frontmatter.types.ts';
import type { ClassifyBufferEntry, FindBufferEntriesOptions } from '../../../types/classify.types.ts';

// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

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
 * `opts.loadMeta` 用のスタブを生成する。
 *
 * `errorPaths` に含まれるパスに対しては `action: CLASSIFY_ACTIONS.ERROR` のエントリを返し、
 * それ以外は正常エントリを返す。呼び出し回数は `callCounter` に加算される。
 *
 * @param errorPaths - エラーエントリとして扱うファイルパスの集合
 * @param callCounter - 呼び出し回数を記録するオブジェクト（`count` フィールドをインクリメントする）
 * @returns `path => Promise<ClassifyBufferEntry>` 互換のスタブ関数
 */
const _makeLoadMeta = (
  errorPaths: Set<string>,
  callCounter: { count: number },
): FindBufferEntriesOptions['loadMeta'] =>
(path: string): Promise<ClassifyBufferEntry> => {
  callCounter.count++;
  if (errorPaths.has(path)) {
    return Promise.resolve({
      file: new ChatlogEntry('', { filePath: path }),
      action: CLASSIFY_ACTIONS.ERROR,
      reason: 'load failed',
    });
  }
  return Promise.resolve({ file: _makeEntry(path) });
};

// ─── Tests

/**
 * `findBufferEntries` のユニットテストスイート。
 *
 * `.md` ファイル収集とメタデータ読み込み結果に基づく振る舞いを検証する。
 *
 * テスト ID 範囲: T-CL-FBE-01 〜 T-CL-FBE-05
 *
 * @see findBufferEntries
 */
describe('findBufferEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-FBE-01: loadMeta が全件正常エントリを返す → 全件がバッファに含まれ stats.error は 0', async () => {
      const _paths = ['/tmp/input/a.md', '/tmp/input/b.md'];
      const _callCounter = { count: 0 };
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob(_paths),
        loadMeta: _makeLoadMeta(new Set(), _callCounter),
      };
      const _stats = _makeStats();

      const _result = await findBufferEntries('/tmp/input', _opts, _stats);

      assertEquals(_result.map((e) => e.file.filePath).sort(), _paths);
      assertEquals(_stats.error, 0);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-FBE-02: loadMeta が一部エントリで ERROR を返す → 該当エントリは除外され stats.error がインクリメントされる', async () => {
      const _paths = ['/tmp/input/a.md', '/tmp/input/b.md', '/tmp/input/c.md'];
      const _errorPaths = new Set(['/tmp/input/b.md']);
      const _callCounter = { count: 0 };
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob(_paths),
        loadMeta: _makeLoadMeta(_errorPaths, _callCounter),
      };
      const _stats = _makeStats();

      const _result = await findBufferEntries('/tmp/input', _opts, _stats);

      assertEquals(_result.map((e) => e.file.filePath).sort(), ['/tmp/input/a.md', '/tmp/input/c.md']);
      assertEquals(_stats.error, 1);
    });

    it('[Edge] T-CL-FBE-03: 全エントリが ERROR を返す → 戻り値は空配列、stats.error は件数分インクリメントされる', async () => {
      const _paths = ['/tmp/input/a.md', '/tmp/input/b.md'];
      const _callCounter = { count: 0 };
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob(_paths),
        loadMeta: _makeLoadMeta(new Set(_paths), _callCounter),
      };
      const _stats = _makeStats();

      const _result = await findBufferEntries('/tmp/input', _opts, _stats);

      assertEquals(_result, []);
      assertEquals(_stats.error, 2);
    });

    it('[Edge] T-CL-FBE-04: stats を渡さない場合でも例外にならず、ERROR エントリは除外のみされる', async () => {
      const _paths = ['/tmp/input/a.md', '/tmp/input/b.md'];
      const _errorPaths = new Set(['/tmp/input/b.md']);
      const _callCounter = { count: 0 };
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob(_paths),
        loadMeta: _makeLoadMeta(_errorPaths, _callCounter),
      };

      const _result = await findBufferEntries('/tmp/input', _opts);

      assertEquals(_result.map((e) => e.file.filePath), ['/tmp/input/a.md']);
    });

    it('[Edge] T-CL-FBE-05: 対象ディレクトリに .md ファイルが1件もない → 空配列が返り loadMeta は呼び出されない', async () => {
      const _callCounter = { count: 0 };
      const _opts: FindBufferEntriesOptions = {
        glob: _makeGlob([]),
        loadMeta: _makeLoadMeta(new Set(), _callCounter),
      };
      const _stats = _makeStats();

      const _result = await findBufferEntries('/tmp/input', _opts, _stats);

      assertEquals(_result, []);
      assertEquals(_callCounter.count, 0);
      assertEquals(_stats.error, 0);
    });
  });
});

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
 * ファイルパス一覧から `ChatlogEntry` を読み込み、既存 project frontmatter があれば
 * キャッシュへ書き込み、読み込み失敗エントリはキャッシュへエラー記録のうえ除外する振る舞いを検証する。
 *
 * テスト ID 範囲: T-CL-LCE-01 〜 T-CL-LCE-05
 *
 * @see loadClassifyEntries
 */
describe('loadClassifyEntries', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-LCE-01: frontmatter に project あり → cache に project が書き込まれ戻り値に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () =>
          Promise.resolve({
            file: _makeEntry(_filePath, { project: 'proj-a' }),
          }),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).project, 'proj-a');
    });

    it('[Normal] T-CL-LCE-04: frontmatter に project なし → cache に書き込まれず戻り値に含まれる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/a.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () => Promise.resolve({ file: _makeEntry(_filePath, {}) }),
      };

      const _result = await loadClassifyEntries([_filePath], _cache, _opts);

      assertEquals(_result.map((e) => e.filePath), [_filePath]);
      assertEquals(_cache.read(_filePath).project, undefined);
    });

    it('[Normal] T-CL-LCE-05: 正常/異常混在 → 正常分のみ順序を保って戻り値に含まれ、各cache書き込みとstats.errorが個別に反映される', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _withProject = '/tmp/input/with-project.md';
      const _errorPath = '/tmp/input/error.md';
      const _noProject = '/tmp/input/no-project.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: (path: string) => {
          if (path === _errorPath) {
            return Promise.resolve({
              file: new ChatlogEntry('', { filePath: path }),
              action: CLASSIFY_ACTIONS.ERROR,
              reason: 'load failed',
            });
          }
          const _frontmatter: FrontmatterFields = path === _withProject ? { project: 'proj-a' } : {};
          return Promise.resolve({ file: _makeEntry(path, _frontmatter) });
        },
      };
      const _stats = _makeStats();

      const _result = await loadClassifyEntries(
        [_withProject, _errorPath, _noProject],
        _cache,
        _opts,
        _stats,
      );

      assertEquals(_result.map((e) => e.filePath), [_withProject, _noProject]);
      assertEquals(_cache.read(_withProject).project, 'proj-a');
      assertEquals(_cache.read(_errorPath).status, CLASSIFY_ACTIONS.ERROR);
      assertEquals(_cache.read(_noProject).project, undefined);
      assertEquals(_stats.error, 1);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-LCE-02: loadMeta が ERROR エントリを返す → cache に status: error が書き込まれ戻り値から除外・stats.error がインクリメントされる', async () => {
      const _cache = await _makeEmptyClassifyCache();
      const _filePath = '/tmp/input/b.md';
      const _opts: FindBufferEntriesOptions = {
        loadMeta: () =>
          Promise.resolve({
            file: new ChatlogEntry('', { filePath: _filePath }),
            action: CLASSIFY_ACTIONS.ERROR,
            reason: 'load failed',
          }),
      };
      const _stats = _makeStats();

      const _result = await loadClassifyEntries([_filePath], _cache, _opts, _stats);

      assertEquals(_result, []);
      assertEquals(_cache.read(_filePath).status, CLASSIFY_ACTIONS.ERROR);
      assertEquals(_stats.error, 1);
    });

    it('[Edge] T-CL-LCE-03: デフォルト読み込み（loadClassifyEntry）経由のフロントマターパースエラー → cache に status: error が書き込まれ戻り値から除外される', async () => {
      const _tempDir = await Deno.makeTempDir();
      try {
        const _cache = await _makeEmptyClassifyCache();
        const _filePath = `${_tempDir}/bad-yaml.md`;
        await Deno.writeTextFile(_filePath, '---\ntitle: [unclosed\n---\n本文');

        const _result = await loadClassifyEntries([_filePath], _cache);

        assertEquals(_result, []);
        assertEquals(_cache.read(_filePath).status, CLASSIFY_ACTIONS.ERROR);
      } finally {
        await Deno.remove(_tempDir, { recursive: true });
      }
    });
  });
});
