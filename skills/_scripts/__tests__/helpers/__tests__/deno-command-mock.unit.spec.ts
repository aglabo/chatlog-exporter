// src: skills/_scripts/__tests__/helpers/__tests__/deno-command-mock.unit.spec.ts
// @(#): deno-command-mock ヘルパー関数ユニットテスト
//       対象: wrapClaudeJson
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { wrapClaudeJson } from '../deno-command-mock.ts';

// ─── Internal Helpers

// constants
/** `wrapClaudeJson` の入力 payload と期待エンベロープの対応表。 */
const _cases = [
  { payload: 'hello', expected: '{"result":"hello"}' },
  { payload: '[{"a":1}]', expected: '{"result":"[{\\"a\\":1}]"}' },
] as const;

// ─── Tests

/**
 * `wrapClaudeJson` のユニットテストスイート。
 *
 * claude `--output-format json` の成功 stdout エンベロープ組み立てを検証する。
 *
 * テスト ID 範囲: T-DCM-WCJ-01 〜 T-DCM-WCJ-02
 *
 * @see wrapClaudeJson
 */
describe('wrapClaudeJson', () => {
  /** payload を `{"result":<payload>}` エンベロープに変換する正常系。 */
  describe('When: 正常系', () => {
    for (const { payload, expected } of _cases) {
      it(`[Normal] T-DCM-WCJ: payload=${payload} → ${expected}`, () => {
        // act & assert
        assertEquals(wrapClaudeJson(payload), expected);
      });
    }
  });
});
