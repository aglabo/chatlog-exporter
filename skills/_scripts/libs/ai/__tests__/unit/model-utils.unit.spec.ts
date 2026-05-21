// src: skills/_scripts/libs/__tests__/ai/unit/model-utils.unit.spec.ts
// @(#): isValidModel ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { isValidModel } from '../../model-utils.ts';

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
