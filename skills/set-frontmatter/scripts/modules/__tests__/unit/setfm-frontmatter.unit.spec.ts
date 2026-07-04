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
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { generateFrontmatter } from '../../setfm-frontmatter.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeFirstNFailMock,
  makeSequencedSuccessMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
// types
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

/** テスト用最小 Prompts。'meta' キーにシステム・ユーザープロンプトを持つ。 */
const _mockPrompts: Prompts = {
  categoryPrompts: new Map(),
  prompts: new Map([
    ['meta', { system: 'You are assistant.', user: 'Classify: {{body}}' }],
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
 * `generateFrontmatter` のユニットテストスイート。
 *
 * AI 出力に応じた frontmatter セット・リトライ・エラー伝播を検証する。
 *
 * テスト ID 範囲: T-SF-FM-01 〜 T-SF-FM-04
 *
 * @see generateFrontmatter
 */
describe('generateFrontmatter', () => {
  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
  });

  /**
   * `runAI` が有効な YAML を返すとき frontmatter がセットされ `true` を返すことを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FM-01-01: runAI が有効な YAML を返す → true を返し entry.frontmatter に title がセットされる', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('title: "test title"\ntopics:\n  - ai\n')),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 'test title');
    });

    it('[Normal] T-SF-FM-01-02: runAI が type/category を含む YAML を返す → それらは entry.frontmatter に上書きされない', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('title: "overwrite test"\ntype: "new-type"\ncategory: "new-cat"\n'),
        ),
      );

      const _entry = _makeChatlogEntry({ type: 'original-type', category: 'original-cat' });
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('type'), 'original-type');
      assertEquals(_entry.frontmatter.get('category'), 'original-cat');
      assertEquals(_entry.frontmatter.get('title'), 'overwrite test');
    });
  });

  /**
   * リトライ後に成功するケース。
   */
  describe('When: リトライ成功', () => {
    it('[Normal] T-SF-FM-04-01: maxRetry=1, 1回目が AiError, 2回目成功 → true を返す', async () => {
      commandHandle = installCommandMock(
        makeFirstNFailMock(1, 'title: "retry success"\n'),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 1);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 'retry success');
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
        makeSuccessMock(_enc.encode('title: test\n  invalid_indent: bad\n')),
      );

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2),
        ChatlogError,
      );
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
      const _goodYaml = 'title: "finally succeeded"\n';
      commandHandle = installCommandMock(
        makeSequencedSuccessMock([_badYaml, _badYaml, _goodYaml]),
      );

      const _entry = _makeChatlogEntry();
      const result = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 2);

      assertEquals(result, true);
      assertEquals(_entry.frontmatter.get('title'), 'finally succeeded');
    });

    it('[Edge] T-SF-FM-03-01: maxRetry=0, runAI が空文字列を返す → ChatlogError(InvalidYaml) を throw', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('')),
      );

      const _entry = _makeChatlogEntry();
      await assertRejects(
        () => generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _mockDics, _mockPrompts, 0),
        ChatlogError,
      );
    });

    it('[Edge] T-SF-FM-03-02: extractYaml が { ok: false } を返す → logger.warn が呼ばれ ChatlogError を throw', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('')),
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
});
