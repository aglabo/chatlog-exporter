// src: scripts/modules/__tests__/unit/setfm-frontmatter.unit.spec.ts
// @(#): generateFrontmatter のユニットテスト
//       対象: generateFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm sess

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { buildFrontmatterOutputContract, generateFrontmatter } from '../../setfm-frontmatter.ts';
// functions
import { reviewFrontmatter } from '../../setfm-review.ts';

// ─── Helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeClaudeJsonMock,
  makeFailMock,
  makeFirstNFailMock,
  makeSequencedSuccessMock,
  wrapClaudeJson,
} from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { useDefaultGlobalConfig } from '../../../../../_cle-libs/__tests__/helpers/global-config-setup.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { assertOutputContractValues } from '../../../../../_cle-libs/libs/ai/json-schema-builder.ts';
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
// types
import type { RunAIOptions } from '../../../../../_cle-libs/types/providers.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants
const _enc = new TextEncoder();
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用最小 Dics。topicEntries は空（formatDicEntries の入力として使用）。 */
const _mockDics: Dics = {
  category: 'tech,life',
  tags: 'typescript',
  categoryEntries: [],
  typeEntries: [],
  topicEntries: [],
};

/** 出力契約テスト用 Dics。topics / tags の値域を契約定義へ導出できるよう、それぞれ 2 件のキーを持つ。 */
const _contractDics: Dics = {
  category: 'development,tooling',
  tags: 'typescript,deno',
  categoryEntries: [],
  typeEntries: [],
  topicEntries: [
    { key: 'ai', def: 'AI', desc: 'AI 関連', rules: {} },
    { key: 'tooling', def: 'Tooling', desc: 'ツール関連', rules: {} },
  ],
};

/** テスト用最小 Prompts。'meta' キーにシステム・ユーザープロンプトを持つ。 */
const _mockPrompts: Prompts = {
  categoryPrompts: new Map(),
  prompts: new Map([
    ['meta', { system: 'You are assistant.', user: 'Classify: {{body}}' }],
  ]),
};

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

  constructor(_cmd: string, opts: { signal?: AbortSignal }, stdout: Uint8Array) {
    super();
    this.stdout = stdout;
    this.signal = opts.signal;
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: this.stdout });
  }
}

/**
 * 常に rate limit エラー（非ゼロ exit + stderr に "rate limit"）を返し、構築回数を数えるモック。
 *
 * `runAI` の `_isRateLimit` 判定を発火させて `ChatlogError('AiError', 'RateLimit', ...)` を
 * throw させる。`counter.calls` で `runAI` 呼び出し回数を検証し、RateLimit がリトライを
 * 発生させないこと（1回で throw されること）を判別する。
 */
class _CountingRateLimitMock extends BaseMockCommand {
  constructor(_cmd: string, _opts: unknown, counter: { calls: number }) {
    super();
    counter.calls++;
  }

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
 * 分類される。fatal 伝播（リトライで成功に化けないこと）を検証する。
 */
class _RateLimitFailMock extends BaseMockCommand {
  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return Promise.resolve({
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: _enc.encode(_RATE_LIMIT_STDERR),
    });
  }
}

/**
 * 常に exit 1（rate limit 文字列なし）を返し、構築回数を数えるモック。
 *
 * `runAI` に `ChatlogError('AiError', 'ExitFailure', ...)` を throw させる。
 * `counter.calls` で `Deno.Command` の生成回数（= `runAI` 呼び出し回数）を検証し、
 * 転送エラーが `maxRetry` ループでリトライされないことを判別する。
 */
class _CountingExitFailureMock extends BaseMockCommand {
  /** 構築のたびにカウンタを加算する。 */
  constructor(_cmd: string, _opts: unknown, counter: { calls: number }) {
    super();
    counter.calls++;
  }

  /** 常に exit 1 + 空 stdout を返す（stderr なし → ExitFailure 判定）。 */
  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: false, code: 1, stdout: new Uint8Array() });
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
 * `_CountingRateLimitMock` を `DenoCommandLike` として返すファクトリヘルパー。
 *
 * @param counter - `runAI` 呼び出し回数のカウンタ（構築ごとに `calls` を加算）
 * @returns `DenoCommandLike` クラス
 */
const _makeCountingRateLimitMock = (counter: { calls: number }): DenoCommandLike => {
  return class extends _CountingRateLimitMock {
    constructor(cmd: string, opts: unknown) {
      super(cmd, opts, counter);
    }
  } as unknown as DenoCommandLike;
};

/**
 * `_CountingExitFailureMock` を `DenoCommandLike` として返すファクトリヘルパー。
 *
 * @param counter - `Deno.Command` 生成回数のカウンタ（構築ごとに `calls` を加算）
 * @returns `DenoCommandLike` クラス
 */
const _makeCountingExitFailureMock = (counter: { calls: number }): DenoCommandLike => {
  return class extends _CountingExitFailureMock {
    constructor(cmd: string, opts: unknown) {
      super(cmd, opts, counter);
    }
  } as unknown as DenoCommandLike;
};

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * frontmatter に任意のフィールドをセットした状態で返す。
 *
 * @param overrides - 初期 frontmatter フィールドのマップ
 * @returns 指定フィールドを持つ `ChatlogEntry`
 */
const _makeChatlogEntry = (overrides: Record<string, string> = {}): ChatlogEntry => {
  const text = [
    '---',
    'session_id: sess-001',
    'type: research',
    'category: ai',
    '---',
    '',
    '# テスト\n本文',
  ].join('\n');
  const entry = new ChatlogEntry(text, { filePath: '/tmp/test.md' });
  for (const [key, val] of Object.entries(overrides)) {
    entry.frontmatter.set(key, val);
  }
  return entry;
};

/**
 * GlobalConfig を DEFAULT_CONFIG_VALUES で初期化する beforeEach / afterEach を登録する。
 *
 * ローカルの `.config/chatlog-exporter/config.yaml`（model / llamaEndpoint 等）を読ませないため、
 * 各テスト前に空 YAML でシングルトンを作り直し、テスト後にリセットする。
 */
const _useDefaultGlobalConfig = (): void => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
    GlobalConfig.getInstance({ yaml: '' });
  });
  afterEach(() => {
    GlobalConfig.resetInstance();
  });
};

// ─── Tests

/**
 * `generateFrontmatter` のユニットテストスイート。
 *
 * AI 出力に応じた frontmatter セット・リトライ・エラー伝播を検証する。
 *
 * テスト ID 範囲: T-SF-FM-01 〜 T-SF-FM-04
 *
 * @see generateFrontmatter
 */
describe('generateFrontmatter', () => {
  useDefaultGlobalConfig();

  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
    GlobalConfig.resetInstance();
  });

  /**
   * `runAI` が有効な YAML を返すとき frontmatter がセットされ `true` を返すことを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FM-01-01: runAI が有効な YAML を返す → true を返し entry.frontmatter に title がセットされる', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('title: "test title"\ntopics:\n  - ai\ntags:\n  - test\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 'test title');
    });

    it('[Normal] T-SF-FM-01-02: runAI が type/category を含む YAML を返す → それらは entry.frontmatter に上書きされない', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'title: "overwrite test"\ntype: "new-type"\ncategory: "new-cat"\ntopics:\n  - ai\ntags:\n  - test\n',
        ),
      );

      const _entry = _makeChatlogEntry({ type: 'original-type', category: 'original-cat' });
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('type'), 'original-type');
      assertEquals(_entry.frontmatter.get('category'), 'original-cat');
      assertEquals(_entry.frontmatter.get('title'), 'overwrite test');
    });

    it('[Normal] T-SF-FM-01-03: aiRunnerProvider が tags 空配列を返す → true を返し entry.frontmatter の tags に [] がセットされる', async () => {
      const _runner = (): Promise<string> => Promise.resolve('title: "t"\ntopics:\n  - ai\ntags: []\n');

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(
        _entry,
        _MAX_CONTENT_LENGTH,
        _mockDics,
        _mockPrompts,
        0,
        'sonnet',
        undefined,
        _runner,
      );

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 't');
      assertEquals(_entry.frontmatter.get('topics'), ['ai']);
      assertEquals(_entry.frontmatter.get('tags'), []);
    });
  });

  /**
   * AiError（CLI 非0終了）はリトライで救済されず、2回目が成功しうる設定でも即 throw されるケース。
   *
   * rate limit を content 起因の単発失敗と区別できないため、fail-first で 1回目の AiError を
   * そのまま throw する（リトライして成功に化けさせない）。
   */
  describe('When: AiError はリトライで救済されない', () => {
    it('[Error] T-SF-FM-04-01: maxRetry=1, 1回目が AiError（2回目は成功しうる） → 救済せず ChatlogError(AiError) を throw', async () => {
      commandHandle = installCommandMock(
        makeFirstNFailMock(1, wrapClaudeJson('title: "retry success"\ntopics:\n  - ai\ntags:\n  - test\n')),
      );

      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 1),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
      // 救済されていれば title がセットされるはず → セットされていないことを確認
      assertEquals(_entry.frontmatter.get('title'), undefined);
    });

    it('[Error] T-SF-FM-04-03: CLI が exit 1 + rate limit 文字列のみ → ChatlogError(AiError/RateLimit) を throw', async () => {
      commandHandle = installCommandMock(_RateLimitFailMock as unknown as DenoCommandLike);

      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
      assertEquals(_err.subindex, 'RateLimit');
    });
  });

  /**
   * リトライ上限に達したとき throw するケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-SF-FM-02-01: maxRetry=0, runAI が AiError → AiError を throw', async () => {
      commandHandle = installCommandMock(makeFailMock(1));

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0),
        ChatlogError,
      );
    });

    it('[Error] T-SF-FM-02-02: maxRetry=2, 3回すべて YAML パース失敗 → ChatlogError(InvalidYaml) を throw', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('title: test\n  invalid_indent: bad\n'),
      );

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2),
        ChatlogError,
      );
    });

    it('[Error] T-SF-FM-02-04: AI が必須フィールド不足の YAML を返す → false を返す', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('title: null\ntopics: null\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      assertEquals(result, false);
    });

    it('[Error] T-SF-FM-02-05: aiRunnerProvider が topics 空配列を返す → false を返し entry.frontmatter は未更新', async () => {
      const _runner = (): Promise<string> => Promise.resolve('title: "t"\ntopics: []\ntags: []\n');

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(
        _entry,
        _MAX_CONTENT_LENGTH,
        _mockDics,
        _mockPrompts,
        0,
        'sonnet',
        undefined,
        _runner,
      );

      assertEquals(result, false);
      assertEquals(_entry.frontmatter.get('title'), undefined);
    });

    it('[Error] T-SF-FM-02-03: AiError 以外の例外(TimedOut) → 即 throw (リトライしない)', async () => {
      // Deno.errors.NotFound は AiError ではないので即 throw
      const _notFoundMock = class {
        constructor(_cmd: string, _opts: unknown) {}
        spawn(): never {
          throw new Deno.errors.NotFound('claude: not found');
        }
        output(): never {
          throw new Deno.errors.NotFound('claude: not found');
        }
      };
      // deno-lint-ignore no-explicit-any
      commandHandle = installCommandMock(_notFoundMock as any);

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2),
        Deno.errors.NotFound,
      );
    });
  });

  /**
   * YAML パース失敗後にリトライして成功するエッジケース。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-FM-04-02: maxRetry=2, 最初の2回が YAML パース失敗, 3回目成功 → true を返す', async () => {
      const _badYaml = 'title: test\n  invalid_indent: bad\n';
      const _goodYaml = 'title: "finally succeeded"\ntopics:\n  - ai\ntags:\n  - test\n';
      commandHandle = installCommandMock(
        makeSequencedSuccessMock([_badYaml, _badYaml, _goodYaml].map(wrapClaudeJson)),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 'finally succeeded');
    });

    it('[Edge] T-SF-FM-03-01: maxRetry=0, runAI が空文字列を返す → ChatlogError(InvalidYaml) を throw', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(''),
      );

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0),
        ChatlogError,
      );
    });

    it('[Edge] T-SF-FM-03-02: extractYaml が { ok: false } を返す → logger.warn が呼ばれ ChatlogError を throw', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(''),
      );
      let warnStub: Stub<typeof logger, [string], void> | undefined;
      try {
        warnStub = stub(logger, 'warn', () => {});
        const _entry = _makeChatlogEntry();
        await assertRejects(
          () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0),
          ChatlogError,
        );
        assertEquals(warnStub.calls.length >= 1, true);
      } finally {
        warnStub?.restore();
      }
    });
  });

  /**
   * `model` 引数が claude CLI の起動引数にそのまま渡ることを検証するケース。
   */
  describe('When: model を指定/省略して呼び出す', () => {
    it('[Normal] T-SF-FM-05-01: model="haiku" を指定 → capturedArgs に --model haiku が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeClaudeJsonMock('title: "t"\ntopics:\n  - ai\ntags:\n  - test\n', capturedArgs),
      );

      const _entry = _makeChatlogEntry();
      await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0, 'haiku');

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], 'haiku');
    });

    it('[Normal] T-SF-FM-05-02: model 省略 → capturedArgs に GlobalConfig の model が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeClaudeJsonMock('title: "t"\ntopics:\n  - ai\ntags:\n  - test\n', capturedArgs),
      );
      GlobalConfig.resetInstance();
      GlobalConfig.getInstance({ yaml: 'model: sonnet\n' });

      const _entry = _makeChatlogEntry();
      await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], 'sonnet');
    });
  });

  /**
   * RateLimit エラーの即時伝播と `signal` 転送を検証するケース。
   *
   * RateLimit はリトライ対象外として即 throw され、外部 `AbortSignal` は `runAI` へリレーされる。
   */
  describe('When: RateLimit / signal 転送', () => {
    it('[Error] T-SF-FM-06-01: runAI が RateLimit → リトライせず即 throw（maxRetry=2 でも runAI は 1 回のみ）', async () => {
      const counter = { calls: 0 };
      commandHandle = installCommandMock(_makeCountingRateLimitMock(counter));

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2),
        ChatlogError,
      );
      assertEquals(counter.calls, 1);
    });

    it('[Normal] T-SF-FM-06-02: signal を渡すと runAI に転送され、外部 abort で内部 signal も aborted になる', async () => {
      const _goodYaml = _enc.encode(wrapClaudeJson('title: "t"\ntopics:\n  - ai\ntags:\n  - test\n'));
      const captured: { instance: _SignalCaptureMock | null } = { instance: null };
      commandHandle = installCommandMock(_makeSignalCaptureMock(_goodYaml, captured));
      const controller = new AbortController();

      const _entry = _makeChatlogEntry();
      await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0, undefined, controller.signal);
      controller.abort();

      assert(captured.instance !== null, 'mock was not instantiated');
      assertEquals(captured.instance.signal?.aborted, true);
    });
  });
});

/**
 * `generateFrontmatter` / `reviewFrontmatter` の `maxRetry` ループが
 * 転送エラー（AI CLI 呼び出しの失敗）を retry 対象にしないことを固定するユニットテストスイート。
 *
 * `maxRetry` ループが retry するのは `InvalidYaml/ParseFailed` のみで、
 * `runAI` の throw はループ外へ即伝播する。
 *
 * テスト ID 範囲: T-SF-LAB-03-01
 *
 * @see generateFrontmatter
 * @see reviewFrontmatter
 */
describe('generateFrontmatter / reviewFrontmatter — maxRetry ループは転送エラーを retry しない', () => {
  useDefaultGlobalConfig();

  let commandHandle: CommandMockHandle | undefined;

  afterEach(() => {
    commandHandle?.restore();
    commandHandle = undefined;
    GlobalConfig.resetInstance();
  });

  it('[Edge] T-SF-LAB-03-01: maxRetry=3 で runAI が AiError/ExitFailure → 両関数とも即伝播し Deno.Command 生成は 1 回', async () => {
    // generateFrontmatter
    const _generateCounter = { calls: 0 };
    commandHandle = installCommandMock(_makeCountingExitFailureMock(_generateCounter));
    const _generateError = await assertRejects(
      () => generateFrontmatter(_makeChatlogEntry(), _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 3),
      ChatlogError,
    );
    assertEquals(_generateError.kind, 'AiError');
    assertEquals(_generateCounter.calls, 1);
    commandHandle.restore();

    // reviewFrontmatter
    const _reviewCounter = { calls: 0 };
    commandHandle = installCommandMock(_makeCountingExitFailureMock(_reviewCounter));
    const _reviewError = await assertRejects(
      () => reviewFrontmatter(_makeChatlogEntry(), _mockDics, _mockPrompts, 3),
      ChatlogError,
    );
    assertEquals(_reviewError.kind, 'AiError');
    assertEquals(_reviewCounter.calls, 1);
  });
});

/**
 * `generateFrontmatter` が `aiRunnerProvider` へ出力契約（structured-output §4.3.1 #4）を渡すことを検証するスイート。
 *
 * `options` を捕捉するスタブを注入し、`options.outputContract` を契約定義と丸ごと比較する。
 *
 * テスト ID 範囲: T-SF-OCT-01 〜 T-SF-OCT-04
 *
 * @see generateFrontmatter
 */
describe('generateFrontmatter — 出力契約（outputContract）', () => {
  useDefaultGlobalConfig();

  describe('When: aiRunnerProvider を呼び出す', () => {
    it('[Normal] T-SF-OCT-01-01: options に #4 yaml 契約（firstField title、topics / tags 要素 enum）が渡り true を返す', async () => {
      let captured: RunAIOptions | undefined;
      const _runner = (_system: string, _user: string, options?: RunAIOptions): Promise<string> => {
        captured = options;
        return Promise.resolve('title: T\ntopics:\n  - ai\ntags:\n  - typescript\n');
      };

      const _result = await generateFrontmatter(
        _makeChatlogEntry(),
        30000,
        _contractDics,
        _mockPrompts,
        0,
        'sonnet',
        undefined,
        _runner,
      );

      assertEquals(captured?.outputContract, {
        contract: 'yaml',
        firstField: 'title',
        properties: {
          title: { type: 'string' },
          topics: { type: 'array', items: { type: 'string', values: ['ai', 'tooling'] } },
          tags: { type: 'array', items: { type: 'string', values: ['typescript', 'deno'] } },
        },
      });
      assertEquals(_result, true);
    });
  });

  /** 出力契約違反（ResponseSchemaViolation）が maxRetry ループの外へ抜けるケース。 */
  describe('When: aiRunnerProvider が ResponseSchemaViolation を throw する', () => {
    it('[Error] T-SF-OCT-04-01: maxRetry=3 でもリトライせず ChatlogError(AiError/ResponseSchemaViolation) で reject し、呼び出しは 1 回', async () => {
      let calls = 0;
      const _runner = (): Promise<string> => {
        calls++;
        throw new ChatlogError('AiError', 'ResponseSchemaViolation', 'schema violation');
      };

      const _error = await assertRejects(
        () =>
          generateFrontmatter(
            _makeChatlogEntry(),
            30000,
            _contractDics,
            _mockPrompts,
            3,
            'sonnet',
            undefined,
            _runner,
          ),
        ChatlogError,
      );

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'ResponseSchemaViolation');
      assertEquals(calls, 1);
    });
  });
});

/**
 * `buildFrontmatterOutputContract` が辞書から `topics` / `tags` の値域を導出することを検証するスイート。
 *
 * テスト ID 範囲: T-SF-OCT-07
 *
 * @see buildFrontmatterOutputContract
 */
describe('buildFrontmatterOutputContract', () => {
  useDefaultGlobalConfig();

  describe('When: 正常系', () => {
    it("[Normal] T-SF-OCT-07-01: tags: 'typescript,deno' → tags の値域が ['typescript', 'deno'] になる", () => {
      const _contract = buildFrontmatterOutputContract({ ..._contractDics, tags: 'typescript,deno' });

      assertEquals(_contract.properties.tags, {
        type: 'array',
        items: { type: 'string', values: ['typescript', 'deno'] },
      });
    });
  });

  describe('When: エッジケース', () => {
    it("[Edge] T-SF-OCT-07-02: tags: ''（空辞書）→ tags の値域が [] になり、値域検査を通過する", () => {
      const _contract = buildFrontmatterOutputContract({ ..._contractDics, tags: '' });

      assertEquals(_contract.properties.tags, { type: 'array', items: { type: 'string', values: [] } });
      assertOutputContractValues(_contract);
    });

    it("[Edge] T-SF-OCT-07-03: tags: 'typescript,,deno,'（途中・末尾の空要素）→ tags の値域が ['typescript', 'deno'] になる", () => {
      const _contract = buildFrontmatterOutputContract({ ..._contractDics, tags: 'typescript,,deno,' });

      assertEquals(_contract.properties.tags, {
        type: 'array',
        items: { type: 'string', values: ['typescript', 'deno'] },
      });
    });
  });
});
