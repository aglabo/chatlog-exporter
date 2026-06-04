// src: scripts/modules/__tests__/unit/judge-category.unit.spec.ts
// @(#): judgeCategory のユニットテスト
//       対象: judgeCategory
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm sess

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _buildCategorySystemPromptForTest as buildCategorySystemPrompt, judgeCategory } from '../../setfm-category.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { DicEntry, Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants
const _enc = new TextEncoder();
const _MAX_CONTENT_LENGTH = 5000;

// functions

/**
 * テスト用 `DicEntry` を生成する。
 *
 * @param overrides - 上書きするフィールド
 * @returns デフォルト値を持つ `DicEntry`
 */
const _makeCategoryEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'development',
  def: 'Software development log',
  desc: 'ソフトウェア開発が主体のログ',
  rules: { when: ['コード実装が主目的'], not: ['ツール設定のみ'] },
  ...overrides,
});

/**
 * テスト用 `Dics` を生成する。
 *
 * @param categoryEntries - 上書きする categoryEntries（省略時はデフォルト3エントリ）
 * @returns 3エントリ（development / tooling / ai）を持つ `Dics`
 */
const _makeDics = (categoryEntries?: DicEntry[]): Dics => ({
  category: 'development,tooling,ai',
  tags: 'lang:typescript',
  categoryEntries: categoryEntries ?? [
    _makeCategoryEntry({
      key: 'development',
      def: 'Software development log',
      desc: 'ソフトウェア開発が主体のログ',
      rules: { when: ['コード実装'], not: ['ツール設定のみ'] },
    }),
    _makeCategoryEntry({
      key: 'tooling',
      def: 'Tool setup log',
      desc: 'ツール設定・環境構築が主体のログ',
      rules: { when: ['ツール設定'], not: ['コード実装'] },
    }),
    _makeCategoryEntry({
      key: 'ai',
      def: 'AI utilization log',
      desc: 'AI活用が主体のログ',
      rules: { when: ['AI活用'], not: ['通常開発'] },
    }),
  ],
  typeEntries: [],
  topicEntries: [],
});

/**
 * テスト用 `Prompts` を生成する。
 *
 * system プロンプトに `${category_dics}` を、user プロンプトに `${focus_guide}` と `${body}` を含む。
 *
 * @returns category フェーズのプロンプトテンプレートを持つ `Prompts`
 */
const _makePrompts = (): Prompts => ({
  categoryPrompts: new Map([['research', 'focus guide for research']]),
  prompts: new Map([
    ['category', { system: 'Categorize logs.\n${category_dics}', user: '${focus_guide}\n---\n${body}' }],
  ]),
});

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param body - 本文テキスト
 * @returns 指定本文を持つ `ChatlogEntry`
 */
const _makeChatlogEntry = (body: string): ChatlogEntry => {
  const text = [
    '---',
    'session_id: sess-001',
    '---',
    '',
    body,
  ].join('\n');
  return new ChatlogEntry(text, { filePath: '/tmp/test.md' });
};

// ─── Tests

/**
 * `judgeCategory` のユニットテストスイート。
 *
 * AI 出力に対する category マッピング・フォールバック・エラー耐性を検証する。
 *
 * テスト ID 範囲: T-SF-JC-01 〜 T-SF-JC-06
 *
 * @see judgeCategory
 */
describe('judgeCategory', () => {
  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
  });

  // ─── category マッピング（正常系）────────────────────────────────────────────────

  /**
   * 有効な category キーを AI が返したとき、その category が結果に使われることを検証する。
   *
   * development / tooling / ai の各キーを個別に検証する。
   */
  describe('category マッピング', () => {
    /** AI が有効な category キーを返す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases = [
        { category: 'development', label: 'development' },
        { category: 'tooling', label: 'tooling' },
        { category: 'ai', label: 'ai' },
      ] as const;

      for (const { category, label } of _cases) {
        it(`[Normal] T-SF-JC-01: AI が "${label}" を返す → 結果が "${label}" になる`, async () => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(category)),
          );

          const _result = await judgeCategory(
            _makeChatlogEntry('# テスト\n本文'),
            _MAX_CONTENT_LENGTH,
            'research',
            _makeDics(),
            _makePrompts(),
          );

          assertEquals(_result, category);
        });
      }
    });

    /** 無効な category キーが返ったときのフォールバックケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-JC-02: 無効な category キー → フォールバック "development" が返る', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('unknown_category')),
        );

        const _result = await judgeCategory(
          _makeChatlogEntry('# テスト\n本文'),
          _MAX_CONTENT_LENGTH,
          'research',
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result, 'development');
      });
    });

    /** スペース混じり・大文字の category など特殊ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-JC-03: スペース混じりの category → 正規化して有効キーに一致する', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode(' tooling ')),
        );

        const _result = await judgeCategory(
          _makeChatlogEntry('# テスト\n本文'),
          _MAX_CONTENT_LENGTH,
          'research',
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result, 'tooling');
      });

      it('[Edge] T-SF-JC-04: 大文字混じりの category → 小文字化して有効キーに一致する', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('DEVELOPMENT')),
        );

        const _result = await judgeCategory(
          _makeChatlogEntry('# テスト\n本文'),
          _MAX_CONTENT_LENGTH,
          'research',
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result, 'development');
      });
    });
  });

  // ─── エラー耐性 ─────────────────────────────────────────────────────────────

  /**
   * AI が失敗（例外）したとき、"development" フォールバックになり例外が投げられないことを検証する。
   */
  describe('エラー耐性', () => {
    /** AI CLI が失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-JC-05: AI が失敗（exit code=1） → フォールバック "development" が返る（例外なし）', async () => {
        commandHandle = installCommandMock(makeFailMock(1));

        const _result = await judgeCategory(
          _makeChatlogEntry('# テスト\n本文'),
          _MAX_CONTENT_LENGTH,
          'research',
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result, 'development');
      });
    });
  });

  // ─── プロンプトテンプレート欠落 ─────────────────────────────────────────────

  /**
   * `'category'` キーを持たない `Prompts` を渡したとき、`ChatlogError` がスローされることを検証する。
   */
  describe('プロンプトテンプレート欠落', () => {
    /** `'category'` キーがない Prompts で ChatlogError がスローされるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-JC-06: "category" キーがない Prompts → ChatlogError がスローされる', async () => {
        const _promptsWithoutCategory: Prompts = {
          categoryPrompts: new Map(),
          prompts: new Map(),
        };

        await assertRejects(
          () =>
            judgeCategory(
              _makeChatlogEntry('# テスト\n本文'),
              _MAX_CONTENT_LENGTH,
              'research',
              _makeDics(),
              _promptsWithoutCategory,
            ),
          ChatlogError,
        );
      });
    });
  });
});

/**
 * `_buildCategorySystemPrompt` のユニットテストスイート。
 *
 * categoryEntries の各フィールドが system prompt に正しく展開されることを検証する。
 *
 * テスト ID 範囲: T-SF-JC-07 〜 T-SF-JC-11
 *
 * @see _buildCategorySystemPromptForTest
 */
describe('_buildCategorySystemPrompt', () => {
  /** categoryEntries の各フィールドが system prompt に含まれる正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-JC-07: categoryEntries の def が system prompt に含まれる', () => {
      const _result = buildCategorySystemPrompt('Categorize logs.\n${category_dics}', _makeDics());
      assertStringIncludes(_result, 'Software development log');
    });

    it('[Normal] T-SF-JC-08: categoryEntries の desc が system prompt に含まれる', () => {
      const _result = buildCategorySystemPrompt('Categorize logs.\n${category_dics}', _makeDics());
      assertStringIncludes(_result, 'ソフトウェア開発が主体のログ');
    });

    it('[Normal] T-SF-JC-09: categoryEntries の rules.when が system prompt に含まれる', () => {
      const _result = buildCategorySystemPrompt('Categorize logs.\n${category_dics}', _makeDics());
      assertStringIncludes(_result, 'コード実装');
    });

    it('[Normal] T-SF-JC-10: categoryEntries の rules.not が system prompt に含まれる', () => {
      const _result = buildCategorySystemPrompt('Categorize logs.\n${category_dics}', _makeDics());
      assertStringIncludes(_result, 'ツール設定のみ');
    });
  });

  /** categoryEntries が空のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-JC-11: categoryEntries が空のとき ${category_dics} が空文字に展開される', () => {
      const _result = buildCategorySystemPrompt('Categorize logs.\n${category_dics}', _makeDics([]));
      assertStringIncludes(_result, 'Categorize logs.\n');
    });
  });
});
