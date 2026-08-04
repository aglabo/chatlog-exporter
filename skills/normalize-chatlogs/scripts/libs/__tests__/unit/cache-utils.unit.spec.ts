// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/cache-utils.unit.spec.ts
// @(#): cache-utils モジュールのユニットテスト
//       対象: toCacheKey, hasSegments
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { hasSegments, toCacheKey } from '../../cache-utils.ts';

// ─── Helpers
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// types
import type { NormalizeCache } from '../../../types/cache.const.type.ts';

// ─── Internal Helpers

// functions

/** テスト用の `ChatlogEntry` を `filePath` から生成する（本文・frontmatterなし）。 */
const _makeEntry = (filePath: string): ChatlogEntry => new ChatlogEntry('content', { filePath });

// ─── Tests

/**
 * `toCacheKey` のユニットテストスイート。
 *
 * ファイルパスからキャッシュキーへの正規化（拡張子・末尾ハッシュの除去）を検証する。
 *
 * テスト ID 範囲: T-CU-00-01
 *
 * @see toCacheKey
 */
describe('toCacheKey', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CU-00-01: 末尾ハッシュ付きファイルパス → ハッシュ除去済みのキャッシュキー', () => {
      assertEquals(toCacheKey('path/to/2026-03-11-1-api-a4a8439.md'), '2026-03-11-1-api');
    });
  });
});

/**
 * `hasSegments` のユニットテストスイート。
 *
 * キャッシュに `segments` が保存済みかどうかの判定を検証する。
 *
 * テスト ID 範囲: T-CU-01-01 〜 T-CU-01-02
 *
 * @see hasSegments
 */
describe('hasSegments', () => {
  let tempDir: string;
  let cache: ChatlogCache<NormalizeCache>;

  beforeEach(async () => {
    tempDir = Deno.makeTempDirSync();
    cache = new ChatlogCache<NormalizeCache>('test-plan', tempDir, { yaml: '' });
    await cache.ready;
  });

  afterEach(() => {
    Deno.removeSync(tempDir, { recursive: true });
  });

  describe('When: 正常系', () => {
    it('[Normal] T-CU-01-01: キャッシュに segments が保存済みのとき true を返す', async () => {
      // arrange
      const entry = _makeEntry('a.md');
      await cache.write(toCacheKey('a.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 's', startLine: 1, endLine: 1 }],
      });

      // act & assert
      assertEquals(hasSegments(entry, cache), true);
    });

    it('[Normal] T-CU-01-02: キャッシュに segments が未保存のとき false を返す', () => {
      // arrange
      const entry = _makeEntry('b.md');

      // act & assert
      assertEquals(hasSegments(entry, cache), false);
    });
  });
});
