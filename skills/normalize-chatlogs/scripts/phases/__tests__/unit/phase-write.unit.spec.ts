// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-write.unit.spec.ts
// @(#): phase-write モジュールのユニットテスト
//       対象: _rebuildSegments
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _rebuildSegments } from '../../phase-write.ts';

// ─── Helpers
import { toCacheKey } from '../../../libs/cache-utils.ts';
import { extractLines } from '../../../libs/line-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { NormalizeCache } from '../../../types/cache.const.type.ts';

// ─── Internal Helpers

// functions

/** テスト用の `ChatlogEntry` を `filePath` と本文 `content` から生成する（frontmatterなし）。 */
const _makeEntry = (filePath: string, content: string): ChatlogEntry => new ChatlogEntry(content, { filePath });

// ─── Tests

/**
 * `_rebuildSegments` のユニットテストスイート。
 *
 * キャッシュの `segments`（title/summary/startLine/endLine）から `Segment[]` を再構築する際、
 * summary がキャッシュ値のまま復元されること、content が正しく再スライスされることを検証する。
 *
 * テスト ID 範囲: T-PW-01-01 〜 T-PW-02-02
 *
 * @see _rebuildSegments
 */
describe('_rebuildSegments', () => {
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
    it('[Normal] T-PW-01-01: キャッシュの summary がそのまま Segment.summary に復元される', async () => {
      // arrange
      const entry = _makeEntry('a.md', 'line1\nline2\nline3');
      await cache.write(toCacheKey('a.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'AI summary text', startLine: 1, endLine: 2 }],
      });

      // act
      const result = _rebuildSegments(entry, cache);

      // assert
      assertEquals(result[0]?.summary, 'AI summary text');
    });

    it('[Normal] T-PW-01-02: content が startLine/endLine に基づき extractLines と同じ結果に再スライスされる', async () => {
      // arrange
      const content = 'line1\nline2\nline3\nline4';
      const entry = _makeEntry('b.md', content);
      await cache.write(toCacheKey('b.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 's', startLine: 2, endLine: 3 }],
      });
      const expected = extractLines(content.split('\n'), 2, 3);

      // act
      const result = _rebuildSegments(entry, cache);

      // assert
      assertEquals(result[0]?.content, expected);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-PW-02-01: キャッシュの summary が空文字列の場合もそのまま空文字列として保持される', async () => {
      // arrange
      const entry = _makeEntry('c.md', 'line1\nline2');
      await cache.write(toCacheKey('c.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: '', startLine: 1, endLine: 1 }],
      });

      // act
      const result = _rebuildSegments(entry, cache);

      // assert
      assertEquals(result[0]?.summary, '');
    });

    it('[Edge] T-PW-02-02: entry.content が空文字列のとき Segment.content が空文字列になる', async () => {
      // arrange
      const entry = _makeEntry('empty.md', '');
      await cache.write(toCacheKey('empty.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
      });

      // act
      const result = _rebuildSegments(entry, cache);

      // assert
      assertEquals(result[0]?.content, '');
    });
  });
});
