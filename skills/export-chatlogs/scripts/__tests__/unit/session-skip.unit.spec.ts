// src: scripts/__tests__/unit/session-skip.unit.spec.ts
// @(#): セッション単位スキップ判定関数のユニットテスト
//       対象: isSkippableSession
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isSkippableSession } from '../../libs/skip-rules.ts';

// ─── Tests
/**
 * `isSkippableSession` のユニットテストスイート。
 *
 * セッションの最初のユーザーテキストの先頭行にある `name:` または `title:` の
 * value に SESSION_SKIP_KEYWORDS のいずれかが含まれる場合に true を返すことを検証する。
 *
 * @see isSkippableSession
 * @see SESSION_SKIP_KEYWORDS
 */
describe('isSkippableSession', () => {
  /**
   * name: フィールドにスキップキーワードが含まれる基本ケース。
   * セッション先頭の YAML メタ情報から commit-message 系のセッションを自動除外する。
   */
  describe('Given: name: の value にスキップキーワードを含む YAML 行', () => {
    /** isSkippableSession("name: commit-message-generator\n...") を呼び出す */
    describe('When: isSkippableSession("name: commit-message-generator\\n...") を呼び出す', () => {
      it('T-SS-01: Then: [正常] - true を返す（セッションをスキップ）', () => {
        const text = 'name: commit-message-generator\ndescription: ...';
        assert(isSkippableSession(text));
      });
    });
  });

  /**
   * キーワード一致が大文字小文字を問わないことを確認するケース。
   * ユーザーが大文字で書いた name: の値でもスキップされる。
   */
  describe('Given: name: の value に大文字を含むスキップキーワード', () => {
    /** isSkippableSession("name: Commit Message Generator\n...") を呼び出す */
    describe('When: isSkippableSession("name: Commit Message Generator\\n...") を呼び出す', () => {
      it('T-SS-02: Then: [正常] - true を返す（大文字小文字不問）', () => {
        const text = 'name: Commit Message Generator\ndescription: ...';
        assert(isSkippableSession(text));
      });
    });
  });

  /**
   * name: の代わりに title: フィールドを使ったケースでもスキップされることを確認。
   * Claude Code skill の YAML は name: と title: が混在するため両方チェックが必要。
   */
  describe('Given: title: の value にスキップキーワードを含む YAML 行', () => {
    /** isSkippableSession("title: Git Commit Message Generator\n...") を呼び出す */
    describe('When: isSkippableSession("title: Git Commit Message Generator\\n...") を呼び出す', () => {
      it('T-SS-03: Then: [正常] - true を返す（セッションをスキップ）', () => {
        const text = 'title: Git Commit Message Generator\ndescription: AI agent';
        assert(isSkippableSession(text));
      });
    });
  });

  /** スキップキーワードを含まない name: の値は通常セッションとしてエクスポートされる */
  describe('Given: name: の value がスキップキーワードを含まない YAML 行', () => {
    /** isSkippableSession("name: my-agent\n...") を呼び出す */
    describe('When: isSkippableSession("name: my-agent\\n...") を呼び出す', () => {
      it('T-SS-04: Then: [正常] - false を返す（スキップ対象外）', () => {
        const text = 'name: my-agent\ndescription: ...';
        assertFalse(isSkippableSession(text));
      });
    });
  });

  /**
   * 先頭 10 行のみを対象とする範囲制限の境界ケース。
   * 11 行目以降にキーワードが現れても false になることを確認する。
   */
  describe('Given: name: の value にスキップキーワードを含む行が 11 行目にある', () => {
    /** isSkippableSession(text) を呼び出す */
    describe('When: isSkippableSession(text) を呼び出す', () => {
      it('T-SS-07: Then: [エッジケース] - false を返す（先頭 10 行対象外）', () => {
        const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
        lines.push('name: commit-message-generator');
        const text = lines.join('\n');
        assertFalse(isSkippableSession(text));
      });
    });
  });

  /**
   * YAML コメント行（#）が先行しても name: フィールドを正しく検出できるケース。
   * Claude Code skill の YAML 冒頭にはコメントが付くことが多い。
   */
  describe('Given: YAML コメント行のあとに name: の value が commit-message のテキスト', () => {
    /** isSkippableSession("# Claude Code 必須要素\nname: commit-message\n...") を呼び出す */
    describe('When: isSkippableSession("# Claude Code 必須要素\\nname: commit-message\\n...") を呼び出す', () => {
      it('T-SS-08: Then: [正常] - true を返す（value が commit-message にマッチ）', () => {
        const text = '# Claude Code 必須要素\nname: commit-message\ndescription: ...';
        assert(isSkippableSession(text));
      });
    });
  });

  /**
   * YAML キーなしでも本文全体にキーワードが含まれる場合のフォールバック検出ケース。
   * system prompt として直接書かれた commit message generator の指示文を検出する。
   */
  describe('Given: name:/title: がなく本文に "commit message generator" を含むテキストを渡す', () => {
    /** isSkippableSession(text) を呼び出す */
    describe('When: isSkippableSession(text) を呼び出す', () => {
      it('T-SS-09: Then: [正常] - true を返す（セッションをスキップ）', () => {
        const text =
          '// Copyright (c) 2025 atsushifx\n//\nYou are a Git commit message generator.\n- Analyze the provided logs and diff.';
        assert(isSkippableSession(text));
      });
    });
  });
});
