// src: skills/_cle-libs/libs/text/__tests__/unit/yaml-utils.unit.spec.ts
// @(#): yaml-utils ユニットテスト
//       対象: stringifyFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { stringifyFrontmatter } from '../../yaml-utils.ts';

// ─── Helpers
import { parse as parseYaml } from '@std/yaml';

// ─── Tests

/**
 * `stringifyFrontmatter` のユニットテストスイート。
 *
 * `Record<string, string | string[]>` から YAML 文字列を生成する動作を検証する。
 * `_quoteString` / `_serializeValue` のエスケープ・直列化ロジックも間接的に検証する。
 *
 * テスト ID 範囲: T-YU-SF-01 〜 T-YU-SF-11
 *
 * @see stringifyFrontmatter
 */
describe('stringifyFrontmatter', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-YU-SF-01: スカラー文字列1件 → `key: "value"\\n`', () => {
      assertEquals(stringifyFrontmatter({ title: 'Hello' }), 'title: "Hello"\n');
    });

    it('[Normal] T-YU-SF-02: 配列1件 → `key:\\n  - "item"\\n` 形式', () => {
      assertEquals(
        stringifyFrontmatter({ tags: ['alpha', 'beta'] }),
        'tags:\n  - "alpha"\n  - "beta"\n',
      );
    });

    it('[Normal] T-YU-SF-03: `"` と `\\` を含む文字列 → エスケープされる', () => {
      assertEquals(
        stringifyFrontmatter({ title: 'say "hello"', path: 'foo\\bar' }),
        'title: "say \\"hello\\""\npath: "foo\\\\bar"\n',
      );
    });

    it('[Normal] T-YU-SF-06: `"` と `\\` が同一値に混在 → 両方エスケープされる', () => {
      assertEquals(
        stringifyFrontmatter({ title: 'a\\"b' }),
        'title: "a\\\\\\"b"\n',
      );
    });

    it('[Normal] T-YU-SF-07: Unicode 文字列 → そのまま出力される', () => {
      assertEquals(
        stringifyFrontmatter({ title: 'こんにちは', category: '開発ログ' }),
        'title: "こんにちは"\ncategory: "開発ログ"\n',
      );
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-YU-SF-04: 空オブジェクト → 空文字列', () => {
      assertEquals(stringifyFrontmatter({}), '');
    });

    it('[Edge] T-YU-SF-05: スカラーと配列の混在 → 挿入順を保持', () => {
      assertEquals(
        stringifyFrontmatter({ title: 'My Title', tags: ['ts', 'deno'] }),
        'title: "My Title"\ntags:\n  - "ts"\n  - "deno"\n',
      );
    });

    it('[Edge] T-YU-SF-08: 1要素配列 → `key:\\n  - "item"\\n`', () => {
      assertEquals(
        stringifyFrontmatter({ tags: ['only'] }),
        'tags:\n  - "only"\n',
      );
    });

    it('[Edge] T-YU-SF-09: 空配列 → `key: []\\n`', () => {
      assertEquals(stringifyFrontmatter({ tags: [] }), 'tags: []\n');
    });

    it('[Edge] T-YU-SF-10: スカラー・空配列・非空配列の混在 → 挿入順を保持し非空配列の形式は不変', () => {
      assertEquals(
        stringifyFrontmatter({ title: 't', topics: [], tags: ['a'] }),
        'title: "t"\ntopics: []\ntags:\n  - "a"\n',
      );
    });

    it('[Edge] T-YU-SF-11: 空配列の出力を YAML パース → null ではなく空配列に戻る', () => {
      assertEquals(parseYaml(stringifyFrontmatter({ tags: [] })), { tags: [] });
    });
  });
});
