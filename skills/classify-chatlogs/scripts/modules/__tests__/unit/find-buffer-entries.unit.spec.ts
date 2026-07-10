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
import { findBufferEntries } from '../../find-buffer-entries.ts';

// ─── Helpers
// types
import type { ClassifyBufferEntry, FindBufferEntriesOptions } from '../../../types/classify.types.ts';

// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

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
    return Promise.resolve({ file: null, filePath: path, action: CLASSIFY_ACTIONS.ERROR, reason: 'load failed' });
  }
  return Promise.resolve({ file: _makeEntry(path), filePath: path });
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

      assertEquals(_result.map((e) => e.filePath).sort(), _paths);
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

      assertEquals(_result.map((e) => e.filePath).sort(), ['/tmp/input/a.md', '/tmp/input/c.md']);
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

      assertEquals(_result.map((e) => e.filePath), ['/tmp/input/a.md']);
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
