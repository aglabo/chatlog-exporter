// src: scripts/__tests__/unit/session-writer.unit.spec.ts
// @(#): session-writer 純粋関数のユニットテスト
//       対象: buildOutputPath, renderMarkdown
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words sessabcd

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildOutputPath, renderMarkdown } from '../../libs/session-writer.ts';

// ─── Helpers
// types
import type { Turn } from '../../../../_scripts/types/conversation.types.ts';
import type { SessionMeta } from '../../types/session.types.ts';
// constants
import { ConversationRole } from '../../../../_scripts/types/conversation-role.const.types.ts';

// ─── Internal Helpers

// constants

/** buildOutputPath / renderMarkdown 共通のベース SessionMeta。各テストで必要フィールドのみ上書きする。 */
const BASE_META: SessionMeta = {
  sessionId: 'sess-abcdef12-3456-7890-abcd-ef1234567890',
  date: '2026-03-15',
  project: 'my-project',
  slug: 'test-question',
  firstUserText: 'What is TDD?',
};

// ─── Tests

/**
 * `buildOutputPath` のユニットテストスイート。
 *
 * sessionId からファイル名ハッシュを生成するロジックの境界値（8文字未満・
 * 複数ハイフン混在）を検証する。基本的なパス構造は functional テスト
 * （T-EC-WS-01〜06）で既にカバーされているため、ここでは重複させない。
 *
 * @see buildOutputPath
 */
describe('buildOutputPath', () => {
  /** 通常ケース1件を回帰の土台として最小限確認する。 */
  describe('Given: 通常の SessionMeta', () => {
    describe('When: buildOutputPath を呼び出す', () => {
      describe('Then: T-EC-SW-01 - 期待するパス文字列を返す', () => {
        it('T-EC-SW-01-01: outputBase/agent/year/yearMonth/date-slug-hash.md の形式になる', () => {
          const path = buildOutputPath('out', 'claude', BASE_META, 'test-question');
          assertEquals(path, 'out/claude/2026/2026-03/2026-03-15-test-question-sessabcd.md');
        });
      });
    });
  });

  /** ハイフン除去後の文字列が8文字未満になる境界ケース。 */
  describe('Given: sessionId のハイフン除去後の長さが8文字未満', () => {
    describe('When: buildOutputPath を呼び出す', () => {
      describe('Then: T-EC-SW-02 - 短い文字列がそのままファイル名に使われる', () => {
        it('T-EC-SW-02-01: sessionId="ab-cd" → ハッシュ部分が "abcd"（4文字）になる', () => {
          const meta: SessionMeta = { ...BASE_META, sessionId: 'ab-cd' };
          const path = buildOutputPath('out', 'claude', meta, 'test-question');
          assertStringIncludes(path, '2026-03-15-test-question-abcd.md');
        });
      });
    });
  });

  /** sessionId に複数のハイフンが含まれる UUID 形式のケース。 */
  describe('Given: sessionId に複数のハイフンが含まれる（UUID 形式）', () => {
    describe('When: buildOutputPath を呼び出す', () => {
      describe('Then: T-EC-SW-03 - すべてのハイフンが除去された先頭8文字が使われる', () => {
        it('T-EC-SW-03-01: sessionId="a1-b2-c3-d4-e5" → ハッシュ部分が "a1b2c3d4"（先頭8文字）になる', () => {
          const meta: SessionMeta = { ...BASE_META, sessionId: 'a1-b2-c3-d4-e5' };
          const path = buildOutputPath('out', 'claude', meta, 'test-question');
          assertStringIncludes(path, '2026-03-15-test-question-a1b2c3d4.md');
        });
      });
    });
  });
});

/**
 * `renderMarkdown` のユニットテストスイート。
 *
 * H1 タイトルの切り詰め・改行変換、turn.content の連続空行圧縮、
 * slug の有無による frontmatter 出力の分岐、turns 空配列時の出力を検証する。
 * 基本的な frontmatter・セクション構造は functional テスト（T-EC-WS-03）で
 * 既にカバーされているため、ここでは重複させない。
 *
 * @see renderMarkdown
 */
describe('renderMarkdown', () => {
  /** firstUserText が100文字を超える場合の H1 タイトル切り詰めケース。 */
  describe('Given: firstUserText が100文字を超える', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-04 - H1 タイトルが100文字に切り詰められる', () => {
        it('T-EC-SW-04-01: H1 見出しの本文が100文字ちょうどになる', () => {
          const longText = 'a'.repeat(150);
          const meta: SessionMeta = { ...BASE_META, firstUserText: longText };
          const markdown = renderMarkdown(meta, []);
          const titleLine = markdown.split('\n').find((line) => line.startsWith('# '))!;
          assertEquals(titleLine, `# ${'a'.repeat(100)}`);
        });
      });
    });
  });

  /** firstUserText に改行が含まれる場合のスペース変換ケース。 */
  describe('Given: firstUserText に改行が含まれる', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-05 - 改行がスペースに変換される', () => {
        it('T-EC-SW-05-01: "Line1\\nLine2" → "# Line1 Line2" になる', () => {
          const meta: SessionMeta = { ...BASE_META, firstUserText: 'Line1\nLine2' };
          const markdown = renderMarkdown(meta, []);
          assertStringIncludes(markdown, '# Line1 Line2');
        });
      });
    });
  });

  /** turn.content に3行以上の連続空行が含まれる場合の圧縮ケース。 */
  describe('Given: turn.content に3行以上の連続空行が含まれる', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-06 - 連続空行が2行に圧縮される', () => {
        it('T-EC-SW-06-01: "A\\n\\n\\n\\nB" → "A\\n\\nB" になる', () => {
          const turns: Turn[] = [{ role: ConversationRole.user, content: 'A\n\n\n\nB' }];
          const markdown = renderMarkdown(BASE_META, turns);
          assertStringIncludes(markdown, 'A\n\nB');
        });
      });
    });
  });

  /** meta.slug が空文字列の場合、frontmatter に slug 行が出力されないケース。 */
  describe('Given: meta.slug が空文字列', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-07 - frontmatter に slug 行が出力されない', () => {
        it('T-EC-SW-07-01: 出力に "slug:" が含まれない', () => {
          const meta: SessionMeta = { ...BASE_META, slug: '' };
          const markdown = renderMarkdown(meta, []);
          assertEquals(markdown.includes('slug:'), false);
        });
      });
    });
  });

  /** meta.slug が非空文字列の場合、frontmatter に slug 行が出力されるケース。 */
  describe('Given: meta.slug が非空文字列', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-08 - frontmatter に slug 行が出力される', () => {
        it('T-EC-SW-08-01: 出力に "slug: \'test-question\'" が含まれる', () => {
          const markdown = renderMarkdown(BASE_META, []);
          assertStringIncludes(markdown, `slug: '${BASE_META.slug}'`);
        });
      });
    });
  });

  /** meta.project が undefined の場合、frontmatter に project 行が出力されないケース。 */
  describe('Given: meta.project が undefined', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-10 - frontmatter に project 行が出力されない', () => {
        it('T-EC-SW-10-01: 出力に "project:" が含まれない', () => {
          const meta: SessionMeta = { ...BASE_META, project: undefined };
          const markdown = renderMarkdown(meta, []);
          assertEquals(markdown.includes('project:'), false);
        });
      });
    });
  });

  /** meta.project が空文字列の場合、frontmatter に project 行が出力されないケース。 */
  describe('Given: meta.project が空文字列', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-11 - frontmatter に project 行が出力されない', () => {
        it('T-EC-SW-11-01: 出力に "project:" が含まれない', () => {
          const meta: SessionMeta = { ...BASE_META, project: '' };
          const markdown = renderMarkdown(meta, []);
          assertEquals(markdown.includes('project:'), false);
        });
      });
    });
  });

  /** meta.project が非空文字列の場合、frontmatter に project 行が出力されるケース（claude/codex のデグレ防止）。 */
  describe('Given: meta.project が非空文字列', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-12 - frontmatter に project 行が出力される', () => {
        it('T-EC-SW-12-01: 出力に "project: \'my-project\'" が含まれる', () => {
          const markdown = renderMarkdown(BASE_META, []);
          assertStringIncludes(markdown, `project: '${BASE_META.project}'`);
        });
      });
    });
  });

  /** turns が空配列の場合、会話ログセクションに何も出力されないケース。 */
  describe('Given: turns が空配列', () => {
    describe('When: renderMarkdown を呼び出す', () => {
      describe('Then: T-EC-SW-09 - 会話ログセクションに User/Assistant 見出しが出力されない', () => {
        it('T-EC-SW-09-01: 出力に "### User" が含まれない', () => {
          const markdown = renderMarkdown(BASE_META, []);
          assertEquals(markdown.includes('### User'), false);
        });

        it('T-EC-SW-09-02: 出力に "### Assistant" が含まれない', () => {
          const markdown = renderMarkdown(BASE_META, []);
          assertEquals(markdown.includes('### Assistant'), false);
        });
      });
    });
  });
});
