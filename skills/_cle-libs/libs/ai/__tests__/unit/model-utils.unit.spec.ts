// src: skills/_cle-libs/libs/__tests__/ai/unit/model-utils.unit.spec.ts
// @(#): isValidModel ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { getAiBackend, isValidModel, parseModel } from '../../model-utils.ts';

// types
import type { AiModelSpec } from '../../../../types/ai.const.types.ts';

// ─── Internal Helpers

describe('isValidModel', () => {
  // 有効なショートエイリアス
  it('T-LIB-AI-01: returns true for "opus"', () => {
    assert(isValidModel('opus'));
  });

  it('T-LIB-AI-02: returns true for "sonnet"', () => {
    assert(isValidModel('sonnet'));
  });

  it('T-LIB-AI-03: returns true for "haiku"', () => {
    assert(isValidModel('haiku'));
  });

  it('T-LIB-AI-04: returns true for "default"', () => {
    assert(isValidModel('default'));
  });

  it('T-LIB-AI-05: returns true for "best"', () => {
    assert(isValidModel('best'));
  });

  // 有効な特殊エイリアス
  it('T-LIB-AI-06: returns true for "sonnet[1m]"', () => {
    assert(isValidModel('sonnet[1m]'));
  });

  it('T-LIB-AI-07: returns true for "opusplan"', () => {
    assert(isValidModel('opusplan'));
  });

  // 有効なバージョン付き
  it('T-LIB-AI-08: returns true for "claude-opus-4-7"', () => {
    assert(isValidModel('claude-opus-4-7'));
  });

  it('T-LIB-AI-09: returns true for "claude-sonnet-4-6"', () => {
    assert(isValidModel('claude-sonnet-4-6'));
  });

  it('T-LIB-AI-10: returns true for "claude-haiku-4-5-20251001"', () => {
    assert(isValidModel('claude-haiku-4-5-20251001'));
  });

  // 無効
  it('T-LIB-AI-11: returns false for "invalid-model"', () => {
    assertFalse(isValidModel('invalid-model'));
  });

  it('T-LIB-AI-12: returns false for "Opus" (case sensitive)', () => {
    assertFalse(isValidModel('Opus'));
  });

  it('T-LIB-AI-13: returns false for empty string', () => {
    assertFalse(isValidModel(''));
  });

  it('T-LIB-AI-14: returns false for "opus-" (partial match)', () => {
    assertFalse(isValidModel('opus-'));
  });
});

/**
 * `getAiBackend` のユニットテストスイート。
 *
 * モデル名からバックエンド種別（'claude' | 'codex' | 'copilot' | 'opencode' | null）を返すことを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-15 〜 T-LIB-AI-25
 *
 * @see getAiBackend
 */
describe('getAiBackend', () => {
  /** VALID_AI_MODELS に含まれるモデル名 → 'claude' を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('T-LIB-AI-15: getAiBackend("sonnet") → "claude"', () => {
      assertEquals(getAiBackend('sonnet'), 'claude');
    });

    it('T-LIB-AI-16: getAiBackend("opus") → "claude"', () => {
      assertEquals(getAiBackend('opus'), 'claude');
    });

    it('T-LIB-AI-17: getAiBackend("haiku") → "claude"', () => {
      assertEquals(getAiBackend('haiku'), 'claude');
    });

    it('T-LIB-AI-18: getAiBackend("claude-sonnet-4-6") → "claude"', () => {
      assertEquals(getAiBackend('claude-sonnet-4-6'), 'claude');
    });

    it('T-LIB-AI-20: getAiBackend("gpt-5") → "codex"', () => {
      assertEquals(getAiBackend('gpt-5'), 'codex');
    });

    it('T-LIB-AI-22: getAiBackend("copilot/gpt-4") → "copilot"', () => {
      assertEquals(getAiBackend('copilot/gpt-4'), 'copilot');
    });

    it('T-LIB-AI-23: getAiBackend("openai/gpt-4") → "codex"', () => {
      assertEquals(getAiBackend('openai/gpt-4'), 'codex');
    });

    it('T-LIB-AI-24: getAiBackend("unknown") → null', () => {
      assertEquals(getAiBackend('unknown'), null);
    });

    it('T-LIB-AI-30: getAiBackend("google/gemini") → "antigravity" (mapped provider)', () => {
      assertEquals(getAiBackend('google/gemini'), 'antigravity');
    });

    it('T-LIB-AI-31: getAiBackend("antigravity/foo") → "antigravity" (mapped provider)', () => {
      assertEquals(getAiBackend('antigravity/foo'), 'antigravity');
    });

    it('T-LIB-AI-32: getAiBackend("claude/claude-3") → "claude" (via provider map)', () => {
      assertEquals(getAiBackend('claude/claude-3'), 'claude');
    });

    it('T-LIB-AI-33: getAiBackend("codex/gpt-4") → "codex" (via provider map)', () => {
      assertEquals(getAiBackend('codex/gpt-4'), 'codex');
    });

    it('T-LIB-AI-54: getAiBackend("foobar/baz") → null (unknown provider)', () => {
      assertEquals(getAiBackend('foobar/baz'), null);
    });
  });

  /** 境界値・特殊エイリアスのエッジケース。 */
  describe('When: エッジケース', () => {
    it('T-LIB-AI-19: getAiBackend("sonnet[1m]") → "claude"', () => {
      assertEquals(getAiBackend('sonnet[1m]'), 'claude');
    });

    it('T-LIB-AI-25: getAiBackend("") → null', () => {
      assertEquals(getAiBackend(''), null);
    });
  });
});

/**
 * `isValidModel` のマルチバックエンド対応ユニットテストスイート。
 *
 * getAiBackend が null でないモデルは true を返すことを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-26 〜 T-LIB-AI-29
 *
 * @see isValidModel
 */
describe('isValidModel (multi-backend)', () => {
  /** getAiBackend が非 null を返すモデル → true の正常ケース。 */
  describe('When: 正常系', () => {
    it('T-LIB-AI-26: isValidModel("gpt-5") → true', () => {
      assert(isValidModel('gpt-5'));
    });

    it('T-LIB-AI-27: isValidModel("copilot/gpt-4") → true', () => {
      assert(isValidModel('copilot/gpt-4'));
    });

    it('T-LIB-AI-28: isValidModel("openai/gpt-4") → true', () => {
      assert(isValidModel('openai/gpt-4'));
    });
  });

  /** getAiBackend が null を返すモデル → false の異常ケース。 */
  describe('When: 異常系', () => {
    it('T-LIB-AI-29: isValidModel("unknown") → false', () => {
      assertFalse(isValidModel('unknown'));
    });

    it('T-LIB-AI-55: isValidModel("foobar/baz") → false (unknown provider)', () => {
      assertFalse(isValidModel('foobar/baz'));
    });
  });
});

/**
 * `parseModel` のユニットテストスイート。
 *
 * モデル名から `{ provider, model }` または `null` を返すことを検証する。
 *
 * テスト ID 範囲: T-LIB-AI-40 〜 T-LIB-AI-47
 *
 * @see parseModel
 */
describe('parseModel', () => {
  /** provider/model 形式・bare モデル・gpt-/o1- プレフィックスの正常ケース。 */
  describe('When: 正常系', () => {
    it('T-LIB-AI-40: parseModel("openai/gpt-4") → { provider:"openai", model:"gpt-4" }', () => {
      const _expected: AiModelSpec = { provider: 'openai', model: 'gpt-4' };
      assertEquals(parseModel('openai/gpt-4'), _expected);
    });

    it('T-LIB-AI-41: parseModel("google/gemini") → { provider:"google", model:"gemini" }', () => {
      const _expected: AiModelSpec = { provider: 'google', model: 'gemini' };
      assertEquals(parseModel('google/gemini'), _expected);
    });

    it('T-LIB-AI-51: parseModel("antigravity/foo") → { provider:"antigravity", model:"foo" }', () => {
      const _expected: AiModelSpec = { provider: 'antigravity', model: 'foo' };
      assertEquals(parseModel('antigravity/foo'), _expected);
    });

    it('T-LIB-AI-52: parseModel("anthropic/claude-3") → { provider:"anthropic", model:"claude-3" }', () => {
      const _expected: AiModelSpec = { provider: 'anthropic', model: 'claude-3' };
      assertEquals(parseModel('anthropic/claude-3'), _expected);
    });

    it('T-LIB-AI-42: parseModel("copilot/gpt-4") → { provider:"copilot", model:"gpt-4" }', () => {
      const _expected: AiModelSpec = { provider: 'copilot', model: 'gpt-4' };
      assertEquals(parseModel('copilot/gpt-4'), _expected);
    });

    it('T-LIB-AI-43: parseModel("claude/claude-3") → { provider:"claude", model:"claude-3" }', () => {
      const _expected: AiModelSpec = { provider: 'claude', model: 'claude-3' };
      assertEquals(parseModel('claude/claude-3'), _expected);
    });

    it('T-LIB-AI-44: parseModel("sonnet") → { provider:"claude", model:"sonnet" }', () => {
      const _expected: AiModelSpec = { provider: 'claude', model: 'sonnet' };
      assertEquals(parseModel('sonnet'), _expected);
    });

    it('T-LIB-AI-45: parseModel("gpt-5") → { provider:"codex", model:"gpt-5" }', () => {
      const _expected: AiModelSpec = { provider: 'codex', model: 'gpt-5' };
      assertEquals(parseModel('gpt-5'), _expected);
    });
  });

  /** バックエンドが特定できないモデル → null のエッジケース。 */
  describe('When: エッジケース', () => {
    it('T-LIB-AI-46: parseModel("unknown") → null', () => {
      assertEquals(parseModel('unknown'), null);
    });

    it('T-LIB-AI-47: parseModel("") → null', () => {
      assertEquals(parseModel(''), null);
    });

    it('T-LIB-AI-56: parseModel("foobar/baz") → null (unknown provider)', () => {
      assertEquals(parseModel('foobar/baz'), null);
    });
  });
});
