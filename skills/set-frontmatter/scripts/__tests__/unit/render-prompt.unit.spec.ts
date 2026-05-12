// src: scripts/__tests__/unit/set-frontmatter.render-prompt.unit.spec.ts
// @(#): renderPrompt のユニットテスト
//       テンプレート変数置換とインジェクション防止の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { renderPrompt } from '../../set-frontmatter.ts';

// ─── 基本的な変数置換 ─────────────────────────────────────────────────────────

describe('renderPrompt', () => {
  describe('Given: テンプレート "Hello ${name}" と変数 { name: "World" }', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-01 - "Hello World" に変換される', () => {
        it('T-SF-RP-01-01: 返り値が "Hello World" になる', () => {
          const result = renderPrompt('Hello ${name}', { name: 'World' });

          assertEquals(result, 'Hello World');
        });
      });
    });
  });

  // ─── 複数変数の置換 ───────────────────────────────────────────────────────

  describe('Given: テンプレート "${a} and ${b}" と変数 { a: "foo", b: "bar" }', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-02 - "foo and bar" に変換される', () => {
        it('T-SF-RP-02-01: 返り値が "foo and bar" になる', () => {
          const result = renderPrompt('${a} and ${b}', { a: 'foo', b: 'bar' });

          assertEquals(result, 'foo and bar');
        });
      });
    });
  });

  // ─── 変数なしテンプレート ─────────────────────────────────────────────────

  describe('Given: 変数のないテンプレート "Plain text"', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-03 - そのままの文字列が返る', () => {
        it('T-SF-RP-03-01: 返り値が "Plain text" になる', () => {
          const result = renderPrompt('Plain text', {});

          assertEquals(result, 'Plain text');
        });
      });
    });
  });

  // ─── アンダースコアを含む変数名 ──────────────────────────────────────────

  describe('Given: テンプレート "${type_list}" と変数 { type_list: "value" }', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-04 - アンダースコアを含む変数名が正常に置換される', () => {
        it('T-SF-RP-04-01: 返り値が "value" になる', () => {
          const result = renderPrompt('${type_list}', { type_list: 'value' });

          assertEquals(result, 'value');
        });
      });
    });
  });

  // ─── 不正な変数名（大文字含む）で ChatlogError がスローされる ────────────────────────────────

  describe('Given: テンプレート "${BadName}" と変数 { BadName: "val" }', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-05 - 大文字含む変数名 → ChatlogError(InvalidArgs)', () => {
        it('T-SF-RP-05-01: ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => renderPrompt('${BadName}', { BadName: 'val' }),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── 未定義変数で ChatlogError がスローされる ────────────────────────────────────────────────

  describe('Given: テンプレート "${missing}" と空の変数マップ {}', () => {
    describe('When: renderPrompt を呼び出す', () => {
      describe('Then: T-SF-RP-06 - 未定義変数 → ChatlogError(InvalidArgs)', () => {
        it('T-SF-RP-06-01: ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => renderPrompt('${missing}', {}),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });
});
