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
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { reviewFrontmatter } from '../../setfm-review.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeFirstNFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
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

// functions

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
        makeSuccessMock(_enc.encode('validity: pass\n')),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'pass', errors: [] });
    });
  });

  /**
   * リトライ後に成功するケース。
   */
  describe('When: リトライ成功', () => {
    it('[Normal] T-SF-RV-11-01: maxRetry=1, 1回目が AiError, 2回目成功 → { validity: pass, errors: [] } を返す', async () => {
      commandHandle = installCommandMock(
        makeFirstNFailMock(1, 'validity: pass\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 1);

      assertEquals(result, { validity: 'pass', errors: [] });
    });
  });

  /**
   * AiError → retry 枯渇後 error を返すケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-SF-RV-01-01: maxRetry=0, runAI が AiError → { validity: error } を返す (throw しない)', async () => {
      commandHandle = installCommandMock(makeFailMock(1));

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'error');
    });

    it('[Error] T-SF-RV-03-01: runAI が validity: fail + errors を返す (corrected_frontmatter なし) → { validity: error, errors: [wrong type] } を返す', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong type\n'),
        ),
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
        makeSuccessMock(_enc.encode('type: research\ncategory: ai\n')),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'pass', errors: [] });
    });

    it('[Edge] T-SF-RV-06-01: runAI が validity: fail + errors 2件を返す (corrected_frontmatter なし) → { validity: error, errors に2件 }', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong type\n  - wrong category\n'),
        ),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(result, { validity: 'error', errors: ['wrong type', 'wrong category'] });
    });

    it('[Edge] T-SF-RV-08-01: runAI が validity: pass + corrected_frontmatter.topics を含む → entry.frontmatter.get(topics) は変更されない', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode(
            'validity: pass\nerrors: []\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n',
          ),
        ),
      );

      const _entry = _makeChatlogEntry();
      _entry.frontmatter.set('topics', ['existing-topic']);
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      assertEquals(_entry.frontmatter.get('topics'), ['existing-topic']);
    });

    it('[Edge] T-SF-RV-10-01: runAI が不正 YAML（インデント不整合）を返す → parseYaml が fail → { validity: error } を返す', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode(
            'validity: fail\ncorrected_frontmatter:\n  topics:\n - bad-indent\n',
          ),
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
        makeSuccessMock(_enc.encode(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  type: tech\n  category: ai\n  title: New Title\n',
        )),
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
        makeSuccessMock(_enc.encode(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n  tags:\n    - lang:typescript\n',
        )),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals((result.corrected as Record<string, unknown>)?.['topics'], ['software-engineering']);
      assertEquals((result.corrected as Record<string, unknown>)?.['tags'], ['lang:typescript']);
    });

    it('[Normal] T-02-01-03: corrected_frontmatter 存在時 entry.frontmatter は変更されない', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  type: tech\n',
        )),
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
        makeSuccessMock(_enc.encode('validity: fail\nerrors:\n  - wrong type\n')),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'error');
      assertEquals(result.errors, ['wrong type']);
    });
  });

  /**
   * retry 枯渇 → throw ではなく { validity: 'error' } を返す。
   */
  describe('When: retry 枯渇 → error 返却', () => {
    it('[Error] T-02-04-01: maxRetry=0, AI が AiError → { validity: error } を返す (throw しない)', async () => {
      commandHandle = installCommandMock(makeFailMock(1));
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'error');
    });
  });

  /**
   * corrected フィールドの trim/filter エッジケース。
   */
  describe('When: corrected フィールドの trim/filter', () => {
    it('[Edge] T-02-05-01: corrected_frontmatter.title が空白のみ → r.corrected に title 含まれない', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  title: "   "\n  type: tech\n',
        )),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals('title' in (result.corrected ?? {}), false);
    });

    it('[Edge] T-02-05-02: corrected_frontmatter.topics に空文字列混在 → r.corrected.topics から除外', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode(
          'validity: fail\nerrors:\n  - wrong\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n    - ""\n    - behavior\n',
        )),
      );
      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);
      assertEquals(result.validity, 'corrected');
      assertEquals(result.corrected?.['topics'], ['software-engineering', 'behavior']);
    });

    it('[Edge] T-02-06-01: corrected オブジェクトのみ (corrected_frontmatter なし) → entry.frontmatter 変化なし + validity=error', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('validity: fail\nerrors:\n  - wrong\ncorrected:\n  type: tech\n')),
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
        makeSuccessMock(_enc.encode('validity: pass\n'), capturedArgs),
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
        makeSuccessMock(_enc.encode('validity: pass\n'), capturedArgs),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts, 0);

      const modelIndex = capturedArgs.value.indexOf('--model');
      assertEquals(modelIndex !== -1, true);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });
});
