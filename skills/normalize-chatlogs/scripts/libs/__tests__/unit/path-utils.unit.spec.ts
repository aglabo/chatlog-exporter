// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/path-utils.unit.spec.ts
// @(#): path-utils モジュールのユニットテスト
//       対象: extractSegmentBaseName
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractSegmentBaseName } from '../../path-utils.ts';

// ─── Internal Helpers

// constants

/**
 * 数字 `0` を含む 7 桁 hex ハッシュを持つファイルパスの一覧。
 *
 * ハッシュは `git rev-parse --short` 由来なので `0` を含む値が普通に出る。
 * 除去パターンの文字クラスが `[0-9a-f]` から `[1-9a-f]` へ狭まると、これらの
 * ハッシュが除去されずベース名に残る。先頭・中央・末尾・全桁の 4 位置を並べ、
 * どの桁が落ちても検出できるようにする。
 */
const _zeroHexHashCases = [
  { filePath: 'path/to/2026-03-11-api-0a1b2c3.md', label: 'ハッシュ先頭が 0' },
  { filePath: 'path/to/2026-03-11-api-a1b0c2d.md', label: 'ハッシュ中央が 0' },
  { filePath: 'path/to/2026-03-11-api-a1b2c30.md', label: 'ハッシュ末尾が 0' },
  { filePath: 'path/to/2026-03-11-api-0000000.md', label: 'ハッシュ全桁が 0' },
] as const;

// ─── Tests

/**
 * `extractSegmentBaseName` のユニットテストスイート。
 *
 * ファイルパスからディレクトリ・拡張子・末尾ハッシュ(-XXXXXXX)を除去して
 * ベース名を返す純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-NC-ESB-05-01-01 〜 T-NC-ESB-05-02-02
 * （うち T-NC-ESB-05-01-04 は `0` を含むハッシュ 4 パターンのテーブル駆動）
 *
 * @see extractSegmentBaseName
 */
describe('extractSegmentBaseName', () => {
  /** ディレクトリ・.md 拡張子・末尾 7 桁ハッシュを除去する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-NC-ESB-05-01-01: ディレクトリと .md 拡張子を除去したファイル名を返す', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, 'test-file');
    });

    it('[Normal] T-NC-ESB-05-01-02: 末尾の -XXXXXXX (7桁 hex) を除去する', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });

    it('[Normal] T-NC-ESB-05-01-03: 末尾が 7 桁 hex でない場合はハッシュ除去しない', () => {
      const filePath = 'path/to/2026-03-11-topic.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });

    for (const { filePath, label } of _zeroHexHashCases) {
      it(`[Normal] T-NC-ESB-05-01-04: 0 を含む 7 桁 hex ハッシュも除去する — ${label} (${filePath})`, () => {
        const result = extractSegmentBaseName(filePath);

        assertEquals(result, '2026-03-11-api');
      });
    }
  });

  /** ディレクトリなし・拡張子なしの境界条件ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-NC-ESB-05-02-01: ディレクトリなしでも .md 拡張子を除去して返す', () => {
      const result = extractSegmentBaseName('simple-file.md');

      assertEquals(result, 'simple-file');
    });

    it('[Edge] T-NC-ESB-05-02-02: 拡張子がない場合はファイル名をそのまま返す', () => {
      const result = extractSegmentBaseName('no-extension');

      assertEquals(result, 'no-extension');
    });
  });
});
