// src: scripts/modules/__tests__/unit/judge-type-category.unit.spec.ts
// @(#): judgeTypeAndCategory のユニットテスト
//       対象: judgeTypeAndCategory, _buildTypeCategorySystemPrompt
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
import {
  _buildTypeCategorySystemPromptForTest as buildTypeCategorySystemPrompt,
  judgeTypeAndCategory,
} from '../../setfm-type-category.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
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
const _makeTypeEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'research',
  def: 'Information gathering log',
  desc: '調査・情報収集が主体のログ',
  rules: { when: ['技術調査が主目的'], not: ['実装作業'] },
  ...overrides,
});

/**
 * テスト用カテゴリ `DicEntry` を生成する。
 *
 * @param overrides - 上書きするフィールド
 * @returns デフォルト値を持つ category `DicEntry`
 */
const _makeCategoryEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'development',
  def: 'Software development log',
  desc: 'ソフトウェア開発が主体のログ',
  rules: { when: ['コード実装が主目的'], not: ['ツール設定のみ'] },
  ...overrides,
});

/**
 * テスト用 `Dics` を生成する（typeEntries と categoryEntries の両方を含む）。
 *
 * @param typeEntries - 上書きする typeEntries（省略時はデフォルト3エントリ）
 * @param categoryEntries - 上書きする categoryEntries（省略時はデフォルト3エントリ）
 * @returns 両エントリセットを持つ `Dics`
 */
const _makeDics = (typeEntries?: DicEntry[], categoryEntries?: DicEntry[]): Dics => ({
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
  typeEntries: typeEntries ?? [
    _makeTypeEntry({
      key: 'research',
      def: 'Research log',
      desc: '調査ログ',
      rules: { when: ['調査'], not: ['実装'] },
    }),
    _makeTypeEntry({
      key: 'execution',
      def: 'Execution log',
      desc: '実装ログ',
      rules: { when: ['実装'], not: ['エラー起点'] },
    }),
    _makeTypeEntry({
      key: 'discussion',
      def: 'Discussion log',
      desc: '議論ログ',
      rules: { when: ['議論'], not: ['実装'] },
    }),
  ],
  topicEntries: [],
});

/**
 * テスト用 `Prompts` を生成する（type-category 複合プロンプトを含む）。
 *
 * system プロンプトに `${type_dics}`・`${category_dics}`・`${category_rules}` を、
 * user プロンプトに `${entries}` を含む。
 *
 * @returns type-category フェーズのプロンプトテンプレートを持つ `Prompts`
 */
const _makePrompts = (): Prompts => ({
  categoryPrompts: new Map([
    ['research', 'focus guide for research'],
    ['execution', 'focus guide for execution'],
  ]),
  prompts: new Map([
    [
      'type-category',
      {
        system: 'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        user: '${entries}',
      },
    ],
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
 * `_buildTypeCategorySystemPrompt` のユニットテストスイート。
 *
 * typeEntries と categoryEntries の両方が system prompt に展開されることを検証する。
 *
 * テスト ID 範囲: T-SF-TC-01 〜 T-SF-TC-04
 *
 * @see _buildTypeCategorySystemPromptForTest
 */
describe('_buildTypeCategorySystemPrompt', () => {
  /** type_dics・category_dics・category_rules の3つが system prompt に含まれる正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-TC-01: type_dics に typeEntries の def が含まれる', () => {
      const _result = buildTypeCategorySystemPrompt(
        'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        _makeDics(),
        'focus guide text',
      );
      assertStringIncludes(_result, 'Research log');
    });

    it('[Normal] T-SF-TC-02: category_dics に categoryEntries の def が含まれる', () => {
      const _result = buildTypeCategorySystemPrompt(
        'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        _makeDics(),
        'focus guide text',
      );
      assertStringIncludes(_result, 'Software development log');
    });

    it('[Normal] T-SF-TC-05: category_rules が system prompt に含まれる', () => {
      const _result = buildTypeCategorySystemPrompt(
        'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        _makeDics(),
        'focus guide text',
      );
      assertStringIncludes(_result, 'focus guide text');
    });
  });

  /** typeEntries または categoryEntries が空のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-TC-03: typeEntries が空のとき ${type_dics} が空文字に展開される', () => {
      const _result = buildTypeCategorySystemPrompt(
        'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        _makeDics([], undefined),
        '',
      );
      assertStringIncludes(_result, 'Classify.\n');
      assertStringIncludes(_result, 'Software development log');
    });

    it('[Edge] T-SF-TC-04: categoryEntries が空のとき ${category_dics} が空文字に展開される', () => {
      const _result = buildTypeCategorySystemPrompt(
        'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        _makeDics(undefined, []),
        '',
      );
      assertStringIncludes(_result, 'Research log');
    });
  });
});

/**
 * `judgeTypeAndCategory` のユニットテストスイート。
 *
 * AI 出力に対する type+category の同時マッピング・フォールバック・エラー耐性を検証する。
 *
 * テスト ID 範囲: T-SF-TC-11 〜 T-SF-TC-15
 *
 * @see judgeTypeAndCategory
 */
describe('judgeTypeAndCategory', () => {
  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
  });

  // ─── 正常系 ─────────────────────────────────────────────────────────────────

  /**
   * AI が 2行形式 "type: X\ncategory: Y" を返したとき、両フィールドが entry.frontmatter に
   * セットされることを検証する。
   */
  describe('When: 正常系', () => {
    it(
      '[Normal] T-SF-TC-11: AI が "type: discussion\\ncategory: development" を返す → 両フィールドが entry.frontmatter にセットされる',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('type: discussion\ncategory: development')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'discussion');
        assertEquals(_entry.frontmatter.get('category') as string, 'development');
      },
    );
  });

  // ─── フォールバック（不正キー）──────────────────────────────────────────────

  /**
   * AI 出力の type や category が無効キーのとき、フォールバック値がセットされることを検証する。
   * type のみ・category のみ・逆順の返却パターンも含む。
   */
  describe('When: エッジケース', () => {
    it(
      '[Edge] T-SF-TC-16: AI が "type: research" のみ（category なし）を返す → type=research, category=development（デフォルト）',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('type: research')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'research');
        assertEquals(_entry.frontmatter.get('category') as string, 'development'); // DEFAULT_FALLBACK_CATEGORY
      },
    );

    it(
      '[Edge] T-SF-TC-17: AI が "category: development" のみ（type なし）を返す → type=research（デフォルト）, category=development',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('category: development')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'research'); // DEFAULT_FALLBACK_TYPE
        assertEquals(_entry.frontmatter.get('category') as string, 'development');
      },
    );

    it(
      '[Edge] T-SF-TC-18: AI が逆順 "category: development\\ntype: research" を返す → 両方正しくセットされる',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('category: development\ntype: research')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'research');
        assertEquals(_entry.frontmatter.get('category') as string, 'development');
      },
    );

    it(
      '[Edge] T-SF-TC-12: 不正な type キー → フォールバック type がセットされる',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('type: unknown_type\ncategory: development')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        // type はフォールバックになる
        const _type = _entry.frontmatter.get('type') as string;
        assertEquals(_type, 'research'); // DEFAULT_FALLBACK_TYPE
        // category は有効キーのままセットされる
        assertEquals(_entry.frontmatter.get('category') as string, 'development');
      },
    );

    it(
      '[Edge] T-SF-TC-13: 不正な category キー → フォールバック category がセットされる',
      async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('type: research\ncategory: unknown_category')),
        );

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'research');
        // category はフォールバックになる
        const _category = _entry.frontmatter.get('category') as string;
        assertEquals(_category, 'development'); // DEFAULT_FALLBACK_CATEGORY
      },
    );
  });

  // ─── エラー耐性 ─────────────────────────────────────────────────────────────

  /**
   * AI が失敗（例外）したとき、フォールバック値がセットされ例外が投げられないことを検証する。
   */
  describe('When: 異常系', () => {
    it(
      '[Error] T-SF-TC-14: AI が失敗（exit code=1） → フォールバック値がセットされる（例外なし）',
      async () => {
        commandHandle = installCommandMock(makeFailMock(1));

        const _entry = _makeChatlogEntry('# テスト\n本文');
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        assertEquals(_entry.frontmatter.get('type') as string, 'research');
        assertEquals(_entry.frontmatter.get('category') as string, 'development');
      },
    );
  });

  // ─── プロンプトテンプレート欠落 ─────────────────────────────────────────────

  /**
   * `'type-category'` キーを持たない `Prompts` を渡したとき、`ChatlogError` がスローされることを検証する。
   */
  describe('プロンプトテンプレート欠落', () => {
    describe('When: 異常系', () => {
      it('[Error] T-SF-TC-15: "type-category" キーがない Prompts → ChatlogError がスローされる', async () => {
        const _promptsWithoutTemplate: Prompts = {
          categoryPrompts: new Map(),
          prompts: new Map(),
        };

        await assertRejects(
          () =>
            judgeTypeAndCategory(
              _makeChatlogEntry('# テスト\n本文'),
              _MAX_CONTENT_LENGTH,
              _makeDics(),
              _promptsWithoutTemplate,
            ),
          ChatlogError,
        );
      });
    });
  });

  // ─── model 引数の配線 ───────────────────────────────────────────────────────

  /**
   * `model` 引数が claude CLI の起動引数にそのまま渡ることを検証するケース。
   */
  describe('When: model を指定/省略して呼び出す', () => {
    it('[Normal] T-SF-TC-19: model="haiku" を指定 → capturedArgs に --model haiku が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('type: discussion\ncategory: development'), capturedArgs),
      );

      const _entry = _makeChatlogEntry('# テスト\n本文');
      await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts(), 'haiku');

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], 'haiku');
    });

    it('[Normal] T-SF-TC-20: model 省略 → capturedArgs に --model DEFAULT_AI_MODEL が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('type: discussion\ncategory: development'), capturedArgs),
      );

      const _entry = _makeChatlogEntry('# テスト\n本文');
      await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });
});
