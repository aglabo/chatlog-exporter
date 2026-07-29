// src: scripts/modules/__tests__/unit/setfm-review.unit.spec.ts
// @(#): reviewFrontmatter のユニットテスト
//       対象: reviewFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm sess

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { reviewFrontmatter } from '../../setfm-review.ts';

// ─── Helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeClaudeJsonMock,
  makeFailMock,
  makeFirstNFailMock,
  wrapClaudeJson,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants
const _enc = new TextEncoder();

/** テスト用最小 Dics。topicEntries は空。 */
const _mockDics: Dics = {
  category: 'tech,life',
  tags: 'typescript',
  categoryEntries: [],
  typeEntries: [],
  topicEntries: [],
};

/** テスト用最小 Prompts。'review' キーにシステム・ユーザープロンプトを持つ。 */
const _mockPrompts: Prompts = {
  categoryPrompts: new Map(),
  prompts: new Map([
    ['review', { system: 'You are reviewer.', user: 'Review: {{result_yaml}}' }],
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
 * 分類される。fatal 伝播（`{ validity: 'error' }` に握りつぶさず即 throw すること）を検証する。
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

// ─── Tests

/**
 * `reviewFrontmatter` のユニットテストスイート。
 *
 * AI 出力に応じた validity 判定・errors 抽出・frontmatter 更新・リトライを検証する。
 *
 * テスト ID 範囲: T-SF-RV-01 〜 T-SF-RV-10
 *
 * @see reviewFrontmatter
 */
describe('reviewFrontmatter', () => {
  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
  });

  /**
   * `runAI` が `validity: pass` を返すとき `{ validity: 'pass', errors: [] }` を返すことを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-RV-02-01: runAI が validity: pass を返す → { validity: pass, errors: [] } を返す', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: pass\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'pass', errors: [] });
    });
  });

  /**
   * AiError（CLI 非0終了）はリトライで救済されず、2回目が成功しうる設定でも即 throw されるケース。
   *
   * rate limit を content 起因の単発失敗と区別できないため、fail-first で 1回目の AiError を
   * そのまま throw する（リトライして pass に化けさせない）。
   */
  describe('When: AiError はリトライで救済されない', () => {
    it('[Error] T-SF-RV-11-01: maxRetry=1, 1回目が AiError（2回目は成功しうる） → 救済せず ChatlogError(AiError) を throw', async () => {
      commandHandle = installCommandMock(
        makeFirstNFailMock(1, wrapClaudeJson('validity: pass\n')),
      );

      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 1),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
    });

    it('[Error] T-SF-RV-11-02: CLI が exit 1 + rate limit 文字列のみ → ChatlogError(AiError/RateLimit) を throw', async () => {
      commandHandle = installCommandMock(_RateLimitFailMock as unknown as DenoCommandLike);

      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 2),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
      assertEquals(_err.subindex, 'RateLimit');
    });
  });

  /**
   * AiError → retry 枯渇後 error を返すケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-SF-RV-01-01: maxRetry=0, runAI が AiError → 握りつぶさず ChatlogError(AiError) を throw', async () => {
      commandHandle = installCommandMock(makeFailMock(1));

      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
    });

    it('[Error] T-SF-RV-03-01: runAI が validity: fail + errors を返す (corrected_frontmatter なし) → { validity: error, errors: [wrong type] } を返す', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: fail\nerrors:\n  - wrong type\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'error', errors: ['wrong type'] });
    });

    it('[Error] T-SF-RV-12-01: AiError 以外の例外 → 即 throw (リトライしない)', async () => {
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
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 2),
        Deno.errors.NotFound,
      );
    });
  });

  /**
   * validity キーなし・errors 複数件・YAML 不整合などのエッジケース。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-RV-05-01: runAI が validity: キーなしの YAML を返す → デフォルト pass → { validity: pass, errors: [] }', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('type: research\ncategory: ai\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'pass', errors: [] });
    });

    it('[Edge] T-SF-RV-06-01: runAI が validity: fail + errors 2件を返す (corrected_frontmatter なし) → { validity: error, errors に2件 }', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: fail\nerrors:\n  - wrong type\n  - wrong category\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'error', errors: ['wrong type', 'wrong category'] });
    });

    it('[Edge] T-SF-RV-08-01: runAI が validity: pass + corrected_frontmatter.topics を含む → entry.frontmatter.get(topics) は変更されない', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: pass\nerrors: []\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n',
        ),
      );

      const _entry = _makeChatlogEntry();
      _entry.frontmatter.set('topics', ['existing-topic']);
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(_entry.frontmatter.get('topics'), ['existing-topic']);
    });

    it('[Edge] T-SF-RV-10-01: runAI が不正 YAML（インデント不整合）を返す → parseYaml が fail → { validity: error } を返す', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\ncorrected_frontmatter:\n  topics:\n - bad-indent\n',
        ),
      );

      const _entry = _makeChatlogEntry();
      _entry.frontmatter.set('topics', ['original-topic']);
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'error');
      assertEquals(_entry.frontmatter.get('topics'), ['original-topic']);
    });
  });

  /**
   * corrected_frontmatter → r.corrected フィールドに反映される正常系。
   */
  describe('When: corrected_frontmatter → corrected フィールドへ', () => {
    it('[Normal] T-02-01-01: corrected_frontmatter に type/category/title → r.corrected に全フィールド', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  type: tech\n  category: ai\n  title: New Title\n',
        ),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals((result.corrected as Record<string, unknown>)?.['type'], 'tech');
      assertEquals((result.corrected as Record<string, unknown>)?.['category'], 'ai');
      assertEquals((result.corrected as Record<string, unknown>)?.['title'], 'New Title');
    });

    it('[Normal] T-02-01-02: corrected_frontmatter に topics/tags → r.corrected に配列フィールド', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n  tags:\n    - lang:typescript\n',
        ),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals((result.corrected as Record<string, unknown>)?.['topics'], ['software-engineering']);
      assertEquals((result.corrected as Record<string, unknown>)?.['tags'], ['lang:typescript']);
    });

    it('[Normal] T-02-01-03: corrected_frontmatter 存在時 entry.frontmatter は変更されない', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  type: tech\n',
        ),
      );
      const _entry = _makeChatlogEntry(); // initial type = 'research'
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(_entry.frontmatter.get('type'), 'research'); // must NOT be 'tech'
    });
  });

  /**
   * fail without corrected_frontmatter → validity='error'。
   */
  describe('When: fail + corrected_frontmatter なし → error', () => {
    it('[Error] T-02-03-01: validity: fail + corrected_frontmatter なし → { validity: error, errors: [...] }', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: fail\nerrors:\n  - wrong type\n'),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'error');
      assertEquals(result.errors, ['wrong type']);
    });
  });

  /**
   * AiError（CLI 非0終了）は握りつぶさず throw する（fail-first）。
   * InvalidYaml リトライ枯渇時のみ `{ validity: 'error' }` を返す（別テストで検証）。
   */
  describe('When: AiError → throw', () => {
    it('[Error] T-02-04-01: maxRetry=0, AI が AiError → 握りつぶさず ChatlogError(AiError) を throw', async () => {
      commandHandle = installCommandMock(makeFailMock(1));
      const _entry = _makeChatlogEntry();
      const _err = await assertRejects(
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0),
        ChatlogError,
      ) as ChatlogError;
      assertEquals(_err.kind, 'AiError');
    });
  });

  /**
   * corrected フィールドの trim/filter エッジケース。
   */
  describe('When: corrected フィールドの trim/filter', () => {
    it('[Edge] T-02-05-01: corrected_frontmatter.title が空白のみ → r.corrected に title 含まれない', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  title: "   "\n  type: tech\n',
        ),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals('title' in (result.corrected ?? {}), false);
    });

    it('[Edge] T-02-05-02: corrected_frontmatter.topics に空文字列混在 → r.corrected.topics から除外', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n    - ""\n    - behavior\n',
        ),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals(result.corrected?.['topics'], ['software-engineering', 'behavior']);
    });

    it('[Edge] T-02-06-01: corrected オブジェクトのみ (corrected_frontmatter なし) → entry.frontmatter 変化なし + validity=error', async () => {
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: fail\nerrors:\n  - wrong\ncorrected:\n  type: tech\n'),
      );
      const _entry = _makeChatlogEntry(); // initial type = 'research'
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(_entry.frontmatter.get('type'), 'research'); // NOT 'tech'
      assertEquals(result.validity, 'error');
    });
  });

  /**
   * `model` 引数が claude CLI の起動引数にそのまま渡ることを検証するケース。
   */
  describe('When: model を指定/省略して呼び出す', () => {
    it('[Normal] T-SF-RV-13-01: model="haiku" を指定 → capturedArgs に --model haiku が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: pass\n', capturedArgs),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0, 'haiku');

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], 'haiku');
    });

    it('[Normal] T-SF-RV-13-02: model 省略 → capturedArgs に --model DEFAULT_AI_MODEL が含まれる', async () => {
      const capturedArgs: { value: string[] } = { value: [] };
      commandHandle = installCommandMock(
        makeClaudeJsonMock('validity: pass\n', capturedArgs),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });

  /**
   * RateLimit エラーの即時伝播と `signal` 転送を検証するケース。
   *
   * 通常 AiError はリトライ枯渇後に `{ validity: 'error' }` を返すが、RateLimit は
   * リトライ対象外として即 throw される。外部 `AbortSignal` は `runAI` へリレーされる。
   */
  describe('When: RateLimit / signal 転送', () => {
    it('[Error] T-SF-RV-14-01: runAI が RateLimit → リトライせず即 throw（maxRetry=2 でも runAI は 1 回のみ）', async () => {
      const counter = { calls: 0 };
      commandHandle = installCommandMock(_makeCountingRateLimitMock(counter));

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => reviewFrontmatter(_entry, _mockDics, _mockPrompts, 2),
        ChatlogError,
      );
      assertEquals(counter.calls, 1);
    });

    it('[Normal] T-SF-RV-14-02: signal を渡すと runAI に転送され、外部 abort で内部 signal も aborted になる', async () => {
      const _goodYaml = _enc.encode(wrapClaudeJson('validity: pass\n'));
      const captured: { instance: _SignalCaptureMock | null } = { instance: null };
      commandHandle = installCommandMock(_makeSignalCaptureMock(_goodYaml, captured));
      const controller = new AbortController();

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0, undefined, controller.signal);
      controller.abort();

      assert(captured.instance !== null, 'mock was not instantiated');
      assertEquals(captured.instance.signal?.aborted, true);
    });
  });
});
