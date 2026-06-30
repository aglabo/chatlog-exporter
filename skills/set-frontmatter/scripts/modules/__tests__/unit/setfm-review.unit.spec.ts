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
import { assertEquals } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { reviewFrontmatter } from '../../setfm-review.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
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
 * AI 出力に応じた validity 判定・errors 抽出・frontmatter 更新・フェイルセーフを検証する。
 *
 * テスト ID 範囲: T-SF-RV-01 〜 T-SF-RV-04
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
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(result, { validity: 'pass', errors: [] });
    });
  });

  /**
   * `runAI` が例外を throw するとき `{ validity: 'pass', errors: [] }` を返すことを検証する（フェイルセーフ）。
   * `runAI` が fail かつ errors: を含む YAML を返すとき errors を抽出して返すことを検証する。
   */
  describe('When: 異常系', () => {
    it('[Error] T-SF-RV-01-01: runAI が例外を throw → { validity: pass, errors: [] } を返す（フェイルセーフ）', async () => {
      commandHandle = installCommandMock(makeFailMock(1));

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(result, { validity: 'pass', errors: [] });
    });

    it('[Error] T-SF-RV-03-01: runAI が validity: fail + errors を返す → { validity: fail, errors: [wrong type] } を返す', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong type\n'),
        ),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(result, { validity: 'fail', errors: ['wrong type'] });
    });
  });

  /**
   * `runAI` が `fail` かつ corrected フィールドを含むとき entry.frontmatter が更新されることを検証する。
   * また validity キーなし・errors 複数件のエッジケースも検証する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-RV-05-01: runAI が validity: キーなしの YAML を返す → デフォルト pass → { validity: pass, errors: [] }', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(_enc.encode('type: research\ncategory: ai\n')),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(result, { validity: 'pass', errors: [] });
    });

    it('[Edge] T-SF-RV-06-01: runAI が validity: fail + errors 2件を返す → errors に2件が含まれる', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong type\n  - wrong category\n'),
        ),
      );

      const _entry = _makeChatlogEntry();
      const result = await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(result, { validity: 'fail', errors: ['wrong type', 'wrong category'] });
    });

    it('[Edge] T-SF-RV-04-01: runAI が fail かつ corrected type: tech を含む → entry.frontmatter.get(type) が tech に更新される', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong type\ncorrected:\n  type: tech\n'),
        ),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(_entry.frontmatter.get('type'), 'tech');
    });

    it('[Edge] T-SF-RV-04-02: runAI が fail かつ corrected category: life を含む → entry.frontmatter.get(category) が life に更新される', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode('validity: fail\nerrors:\n  - wrong category\ncorrected:\n  category: life\n'),
        ),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(_entry.frontmatter.get('category'), 'life');
    });

    it('[Edge] T-SF-RV-07-01: runAI が validity: fail + corrected_frontmatter.topics を含む → entry.frontmatter.get(topics) が更新される', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode(
            'validity: fail\nerrors:\n  - wrong topics\ncorrected_frontmatter:\n  topics:\n    - software-engineering\n    - behavior\n',
          ),
        ),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(_entry.frontmatter.get('topics'), ['software-engineering', 'behavior']);
    });

    it('[Edge] T-SF-RV-07-02: runAI が validity: fail + corrected_frontmatter.tags を含む → entry.frontmatter.get(tags) が更新される', async () => {
      commandHandle = installCommandMock(
        makeSuccessMock(
          _enc.encode(
            'validity: fail\nerrors:\n  - wrong tags\ncorrected_frontmatter:\n  tags:\n    - lang:typescript\n',
          ),
        ),
      );

      const _entry = _makeChatlogEntry();
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(_entry.frontmatter.get('tags'), ['lang:typescript']);
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
      await reviewFrontmatter(_entry, _mockDics, _mockPrompts);

      assertEquals(_entry.frontmatter.get('topics'), ['existing-topic']);
    });
  });
});
