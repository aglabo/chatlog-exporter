// src: scripts/__tests__/unit/markdown.unit.spec.ts
// @(#): Markdown レンダリング関数のユニットテスト
//       対象: renderMarkdown
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { renderMarkdown } from '../../../../export-chatlog/scripts/libs/session-writer.ts';

// ─── Helpers
// types
import type { SessionMeta, Turn } from '../../../../export-chatlog/scripts/types/session.types.ts';

// ─── Internal Helpers

/**
 * テスト用の `SessionMeta` を生成するファクトリ関数。
 * デフォルト値（sessionId・date・project・slug・firstUserText）を持ち、`overrides` で任意フィールドを上書きできる。
 */
function _makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: 'sess-001',
    date: '2026-03-15',
    project: 'my-app',
    slug: 'test-slug',
    firstUserText: '質問です',
    ...overrides,
  };
}

/** 最小構成の会話ターン配列。user + assistant 各1件からなり、基本的な Markdown 出力テストに使用する。 */
const _basicTurns: Turn[] = [
  { role: 'user', text: 'ユーザーの質問' },
  { role: 'assistant', text: 'AIの回答' },
];

// ─── Tests
/**
 * `renderMarkdown` のユニットテストスイート。
 *
 * セッションメタ情報と会話ターン一覧から Markdown 文字列を生成する関数の動作を検証する。
 * YAML フロントマターの正確性（session_id・date・project・slug）・
 * 会話セクション（### User / ### Assistant）の生成・slug 空文字時の省略・
 * 改行正規化（3 連続 → 2 連続）の各ケースをカバーする。
 *
 * @see renderMarkdown
 */
describe('renderMarkdown', () => {
  /**
   * YAML フロントマター生成の基本確認シナリオ。
   * session_id・date・project・slug の各フィールドが正しくシリアライズされることと、
   * slug が空のとき slug: 行自体が省略されることを確認する。
   */
  describe('Given: 基本的な meta と 1ターン', () => {
    /** renderMarkdown(meta, turns) を呼び出す */
    describe('When: renderMarkdown(meta, turns) を呼び出す', () => {
      /** T-EC-RM-01: frontmatter が正しく出力される */
      describe('Then: T-EC-RM-01 - frontmatter が正しく出力される', () => {
        it('T-EC-RM-01-01: frontmatter が --- で囲まれている', () => {
          const result = renderMarkdown(_makeMeta(), _basicTurns);
          assertStringIncludes(result, '---\n');
        });

        it('T-EC-RM-01-02: "session_id: \'sess-001\'" が含まれる', () => {
          const result = renderMarkdown(_makeMeta({ sessionId: 'sess-001' }), _basicTurns);
          assertStringIncludes(result, "session_id: 'sess-001'");
        });

        it('T-EC-RM-01-03: "date: \'2026-03-15\'" が含まれる', () => {
          const result = renderMarkdown(_makeMeta({ date: '2026-03-15' }), _basicTurns);
          assertStringIncludes(result, "date: '2026-03-15'");
        });

        it('T-EC-RM-01-04: "project: \'my-app\'" が含まれる', () => {
          const result = renderMarkdown(_makeMeta({ project: 'my-app' }), _basicTurns);
          assertStringIncludes(result, "project: 'my-app'");
        });

        it('T-EC-RM-01-05: slug が空でない場合 "slug: \'test-slug\'" が含まれる', () => {
          const result = renderMarkdown(_makeMeta({ slug: 'test-slug' }), _basicTurns);
          assertStringIncludes(result, "slug: 'test-slug'");
        });

        it('T-EC-RM-01-06: slug が空の場合 "slug:" 行が含まれない', () => {
          const result = renderMarkdown(_makeMeta({ slug: '' }), _basicTurns);
          assertEquals(result.includes('slug:'), false);
        });
      });
    });
  });

  /**
   * 会話セクション生成の確認シナリオ。
   * ### User / ### Assistant の見出し・H1 タイトル・3連続改行の正規化と、
   * 空ターン時にも ## 会話ログ セクションが出力されることを確認する。
   */
  describe('Given: user + assistant ターン', () => {
    /** renderMarkdown(meta, turns) を呼び出す */
    describe('When: renderMarkdown(meta, turns) を呼び出す', () => {
      /** T-EC-RM-02: 会話セクションが正しく出力される */
      describe('Then: T-EC-RM-02 - 会話セクションが正しく出力される', () => {
        it('T-EC-RM-02-01: "### User" セクションが含まれる', () => {
          const result = renderMarkdown(_makeMeta(), _basicTurns);
          assertStringIncludes(result, '### User');
        });

        it('T-EC-RM-02-02: "### Assistant" セクションが含まれる', () => {
          const result = renderMarkdown(_makeMeta(), _basicTurns);
          assertStringIncludes(result, '### Assistant');
        });

        it('T-EC-RM-02-03: firstUserText "質問です" が # 見出しとして含まれる', () => {
          const result = renderMarkdown(_makeMeta({ firstUserText: '質問です' }), _basicTurns);
          assertStringIncludes(result, '# 質問です');
        });

        it('T-EC-RM-02-04: ターン内の3連続改行が2連続改行に正規化される', () => {
          const turns: Turn[] = [{ role: 'user', text: 'line1\n\n\nline2' }];
          const result = renderMarkdown(_makeMeta(), turns);
          assertEquals(result.includes('\n\n\n'), false);
        });

        it('T-EC-RM-02-05: 空ターン配列でも "## 会話ログ" セクションが含まれる', () => {
          const result = renderMarkdown(_makeMeta(), []);
          assertStringIncludes(result, '## 会話ログ');
        });
      });
    });
  });
});
