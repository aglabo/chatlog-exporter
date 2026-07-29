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
import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  _buildTypeCategorySystemPromptForTest as buildTypeCategorySystemPrompt,
  judgeTypeAndCategory,
} from '../../setfm-type-category.ts';

// ─── Helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeClaudeJsonMock,
  makeFailMock,
  wrapClaudeJson,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
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

/**
 * `Deno.Command` に渡された `opts.signal` をキャプチャする成功モック。
 *
 * `runAI` は内部タイムアウト用 signal を `AbortSignal.any()` で合成して渡すため、
 * 単なる `signal !== undefined` は無意味。外部 `AbortController` を `abort()` した後に
 * キャプチャした合成 signal の `.aborted === true` を確認することでリレーの有無を判別する。
 */
class _SignalCaptureMock extends BaseMockCommand {
  private readonly stdout: Uint8Array;
  readonly signal?: AbortSignal;

  /** 合成 signal と stdout を受け取り、後段の検査用に signal を保持する。 */
  constructor(_cmd: string, opts: { signal?: AbortSignal }, stdout: Uint8Array) {
    super();
    this.stdout = stdout;
    this.signal = opts.signal;
  }

  /** 常に成功レスポンス（exit 0 + 指定 stdout）を返す。 */
  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: this.stdout });
  }
}

/**
 * 常に rate limit エラー（非ゼロ exit + stderr に "rate limit"）を返すモック。
 *
 * `runAI` の rate limit 判定を発火させて `ChatlogError('AiError', 'RateLimit', ...)` を throw させる。
 */
class _RateLimitMockCommand extends BaseMockCommand {
  /** 常に exit 1 + stderr "rate limit exceeded" を返す。 */
  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return Promise.resolve({
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: _enc.encode('rate limit exceeded'),
    });
  }
}

/** claude CLI が rate limit で落ちたときの stderr。`runAI` の `_RATE_LIMIT_PATTERN` (`usage limit`) にヒットし RateLimit 判定される。 */
const _RATE_LIMIT_STDERR = 'Claude usage limit reached';

/**
 * claude CLI が exit 1 で落ち、stderr に rate limit 文字列のみを返すモック。
 *
 * stderr が `runAI` の `_RATE_LIMIT_PATTERN` にヒットし `ChatlogError('AiError', 'RateLimit', ...)` に
 * 分類される。実際に観測される rate limit 落ちを再現し、fatal 伝播を検証する。
 */
class _RateLimitFailMock extends BaseMockCommand {
  /** 常に exit 1 + stderr に rate limit 文字列のみを返す。 */
  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return Promise.resolve({
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: _enc.encode(_RATE_LIMIT_STDERR),
    });
  }
}

// functions

/**
 * `_SignalCaptureMock` を `DenoCommandLike` として返すファクトリヘルパー。
 *
 * @param stdout - AI が返す stdout バイト列
 * @param captured - モックインスタンスの受け渡し先（呼び出し後に signal を検査するための出口）
 * @returns `DenoCommandLike` クラス
 */
const _makeSignalCaptureMock = (
  stdout: Uint8Array,
  captured: { instance: _SignalCaptureMock | null },
): DenoCommandLike => {
  return class extends _SignalCaptureMock {
    constructor(cmd: string, opts: { signal?: AbortSignal }) {
      super(cmd, opts, stdout);
      captured.instance = this;
    }
  } as unknown as DenoCommandLike;
};

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
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    commandHandle?.restore();
    loggerStub.restore();
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
          makeClaudeJsonMock('type: discussion\ncategory: development'),
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
          makeClaudeJsonMock('type: research'),
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
          makeClaudeJsonMock('category: development'),
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
          makeClaudeJsonMock('category: development\ntype: research'),
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
          makeClaudeJsonMock('type: unknown_type\ncategory: development'),
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
          makeClaudeJsonMock('type: research\ncategory: unknown_category'),
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
   * AI CLI が非0終了で失敗したときのエラー分岐を検証する。
   *
   * 非 RateLimit の AI エラー（ExitFailure）は throw せず、type/category を書き込まずに skip し
   * `logger.error` へ判定失敗ログを出す。RateLimit のみ再 throw で中断する（別ケース TC-21/23）。
   */
  describe('When: 異常系', () => {
    it(
      '[Error] T-SF-TC-14: AI が失敗（exit code=1 / ExitFailure） → throw せず type/category 未設定・error ログを出す',
      async () => {
        commandHandle = installCommandMock(makeFailMock(1));

        const _entry = _makeChatlogEntry('# テスト\n本文');
        // throw しないこと（assertRejects を外し直接 await）
        await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

        // type/category は書き込まれない（skip）
        assertEquals(_entry.frontmatter.get('type'), undefined);
        assertEquals(_entry.frontmatter.get('category'), undefined);
        // 判定失敗ログが 1 件以上（runAI 内部 error ログも同 stub に乗るため部分一致・件数下限で判定）
        assertEquals(
          loggerStub.errorLogs.some((l) => l.includes('type/category 判定失敗')),
          true,
        );
      },
    );

    it(
      '[Error] T-SF-TC-23: CLI が exit 1 + rate limit 文字列のみ → ChatlogError(AiError/RateLimit) を throw',
      async () => {
        commandHandle = installCommandMock(_RateLimitFailMock as unknown as DenoCommandLike);

        const _entry = _makeChatlogEntry('# テスト\n本文');
        const _err = await assertRejects(
          () => judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts()),
          ChatlogError,
        ) as ChatlogError;
        assertEquals(_err.kind, 'AiError');
        assertEquals(_err.subindex, 'RateLimit');
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
        makeClaudeJsonMock('type: discussion\ncategory: development', capturedArgs),
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
        makeClaudeJsonMock('type: discussion\ncategory: development', capturedArgs),
      );

      const _entry = _makeChatlogEntry('# テスト\n本文');
      await judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });

  // ─── RateLimit / signal 転送 ─────────────────────────────────────────────

  /**
   * RateLimit エラーの即時伝播と `signal` 転送を検証するケース。
   *
   * RateLimit は握りつぶさず即 throw され、外部 `AbortSignal` は `runAI` へリレーされる。
   */
  describe('When: RateLimit / signal 転送', () => {
    it('[Error] T-SF-TC-21: runAI が RateLimit → フォールバックせず ChatlogError を再 throw', async () => {
      commandHandle = installCommandMock(_RateLimitMockCommand as unknown as DenoCommandLike);

      const _entry = _makeChatlogEntry('# テスト\n本文');
      await assertRejects(
        () => judgeTypeAndCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts()),
        ChatlogError,
      );
    });

    it('[Normal] T-SF-TC-22: signal を渡すと runAI に転送され、外部 abort で内部 signal も aborted になる', async () => {
      const _goodYaml = _enc.encode(wrapClaudeJson('type: discussion\ncategory: development'));
      const captured: { instance: _SignalCaptureMock | null } = { instance: null };
      commandHandle = installCommandMock(_makeSignalCaptureMock(_goodYaml, captured));
      const controller = new AbortController();

      const _entry = _makeChatlogEntry('# テスト\n本文');
      await judgeTypeAndCategory(
        _entry,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        undefined,
        controller.signal,
      );
      controller.abort();

      assert(captured.instance !== null, 'mock was not instantiated');
      assertEquals(captured.instance.signal?.aborted, true);
    });
  });
});
