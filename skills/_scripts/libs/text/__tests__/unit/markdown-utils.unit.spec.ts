// src: skills/_scripts/libs/__tests__/unit/markdown-utils.unit.spec.ts
// @(#): markdown-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { cleanYaml } from '../../markdown-utils.ts';

// ─────────────────────────────────────────────
// cleanYaml
// ─────────────────────────────────────────────

describe('cleanYaml', () => {
  describe('Given: コードフェンスなし・firstField から始まる YAML', () => {
    describe('When: cleanYaml を実行する', () => {
      describe('Then: T-LIB-M-06 - そのまま trim されて返る', () => {
        it('T-LIB-M-06: コードフェンスなしの場合は trim して返す', () => {
          assertEquals(cleanYaml('title: foo\ntags: [a]', 'title'), 'title: foo\ntags: [a]');
        });
      });
    });
  });

  describe('Given: コードフェンスで囲まれた YAML', () => {
    describe('When: cleanYaml を実行する', () => {
      describe('Then: T-LIB-M-07 - フェンス除去されて返る', () => {
        it('T-LIB-M-07: コードフェンスが除去されて返る', () => {
          assertEquals(cleanYaml('```yaml\ntitle: foo\n```', 'title'), 'title: foo');
        });
      });
    });
  });

  describe('Given: firstField の前に余分なテキストあり', () => {
    describe('When: cleanYaml を実行する', () => {
      describe('Then: T-LIB-M-08 - firstField の行から始まる文字列が返る', () => {
        it('T-LIB-M-08: firstField より前のテキストが除去されて返る', () => {
          assertEquals(cleanYaml('junk line\ntitle: foo\ntags: [a]', 'title'), 'title: foo\ntags: [a]');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: cleanYaml を実行する', () => {
      describe('Then: T-LIB-M-09 - 空文字列が返る', () => {
        it('T-LIB-M-09: 空文字列は空文字列のまま返す', () => {
          assertEquals(cleanYaml('', 'title'), '');
        });
      });
    });
  });

  describe('Given: firstField が存在しない場合', () => {
    describe('When: cleanYaml を実行する', () => {
      describe('Then: T-LIB-M-10 - フェンス除去後の全文が返る', () => {
        it('T-LIB-M-10: firstField なしの場合はフェンス除去後全文を返す', () => {
          assertEquals(cleanYaml('tags: [a]\ncategory: b', 'title'), 'tags: [a]\ncategory: b');
        });
      });
    });
  });

  describe('Given: firstField が "title" 以外（"type"）の場合', () => {
    describe('When: cleanYaml(raw, "type") を呼び出す', () => {
      describe('Then: T-LIB-M-11 - type: 行以降のみ返る', () => {
        it('T-LIB-M-11: firstField が "type" のとき type: 行から始まる', () => {
          const result = cleanYaml('前文\ntype: research\ncategory: development', 'type');
          assertEquals(result.startsWith('type: research'), true);
          assertEquals(result.includes('category: development'), true);
        });
      });
    });
  });

  describe('Given: コードフェンスと前文テキストが両方ある場合', () => {
    describe('When: cleanYaml(raw, "title") を呼び出す', () => {
      describe('Then: T-LIB-M-12 - フェンスと前文が両方除去される', () => {
        it('T-LIB-M-12: コードフェンスと前文テキストが除去されて title: 行から始まる', () => {
          const raw = '以下の YAML を出力します:\n```yaml\ntitle: テスト\nsummary: 概要\n```\n以上です。';
          const result = cleanYaml(raw, 'title');
          assertEquals(result.startsWith('title: テスト'), true);
          assertEquals(result.includes('```'), false);
        });
      });
    });
  });
});
