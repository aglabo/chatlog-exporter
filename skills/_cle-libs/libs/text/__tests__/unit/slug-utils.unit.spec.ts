// src: skills/_cle-libs/libs/__tests__/text/unit/slug-utils.unit.spec.ts
// @(#): textToSlug ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { textToSlug } from '../../slug-utils.ts';

// ─────────────────────────────────────────────
// textToSlug
// ─────────────────────────────────────────────

describe('textToSlug', () => {
  describe('Given: 通常の英語テキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-01 - 英小文字・ハイフンのスラッグが返る', () => {
        it('T-LIB-U-10-01: 英語テキストがスラッグに変換される', () => {
          assertEquals(textToSlug('Hello World'), 'hello-world');
        });
      });
    });
  });

  describe('Given: 特殊文字・記号を含むテキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-02 - 特殊文字がハイフンに変換される', () => {
        it('T-LIB-U-10-02: 特殊文字がハイフンに置換されスラッグが返る', () => {
          assertEquals(textToSlug('Hello, World! foo@bar'), 'hello-world-foo-bar');
        });
      });
    });
  });

  describe('Given: 日本語のみのテキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-03 - fallback が返る', () => {
        it('T-LIB-U-10-03: ASCII 非対応テキストは fallback を返す', () => {
          assertEquals(textToSlug('こんにちは'), 'session');
        });
      });
    });
  });

  describe('Given: 変換後 3 文字未満になるテキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-04 - fallback が返る', () => {
        it('T-LIB-U-10-04: 変換結果が短すぎる場合は fallback を返す', () => {
          assertEquals(textToSlug('ab'), 'session');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-05 - fallback が返る', () => {
        it('T-LIB-U-10-05: 空文字列は fallback を返す', () => {
          assertEquals(textToSlug(''), 'session');
        });
      });
    });
  });

  describe('Given: カスタム fallback 指定', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-06 - 指定した fallback が返る', () => {
        it('T-LIB-U-10-06: 空文字列でカスタム fallback を返す', () => {
          assertEquals(textToSlug('', 'custom-fallback'), 'custom-fallback');
        });
      });
    });
  });

  describe('Given: 50 文字を超えるテキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-07 - 50 文字に切り詰められる', () => {
        it('T-LIB-U-10-07: 長いテキストは 50 文字以下のスラッグになる', () => {
          const long = 'this is a very long text that should be truncated to fifty characters maximum';
          const result = textToSlug(long);
          assert(result.length <= 50);
        });
      });
    });
  });

  describe('Given: 複数段落（\\n\\n 区切り）テキスト', () => {
    describe('When: textToSlug を実行する', () => {
      describe('Then: T-LIB-U-10-08 - 第 1 段落のみが使われる', () => {
        it('T-LIB-U-10-08: 2 段落目以降は無視されスラッグが返る', () => {
          assertEquals(textToSlug('first paragraph\n\nsecond paragraph'), 'first-paragraph');
        });
      });
    });
  });
});
