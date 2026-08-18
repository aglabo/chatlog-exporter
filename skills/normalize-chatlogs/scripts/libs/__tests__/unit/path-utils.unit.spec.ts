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

// ─── Tests

/**
 * `extractSegmentBaseName` のユニットテストスイート。
 *
 * ファイルパスからディレクトリ・拡張子・末尾ハッシュ(-XXXXXXX)を除去して
 * ベース名を返す純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-NC-ESB-05-01-01 〜 T-NC-ESB-05-02-02
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
