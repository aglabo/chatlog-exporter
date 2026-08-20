// src: scripts/modules/filter/__tests__/unit/system-prompt.unit.spec.ts
// @(#): filter 判定用システムプロンプトのユニットテスト
//       対象: _SYSTEM_PROMPT
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertMatch, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _SYSTEM_PROMPT } from '../../process-chunk.ts';

// ─── Helpers
// constants
import {
  CHATLOG_BLOCK_CLOSE,
  CHATLOG_BLOCK_OPEN_TEMPLATE,
} from '../../../../constants/common.constants.ts';

// ─── Internal Helpers

// constants
/** JSON 配列以外を出力しないことを指示する語句。表記ゆれに耐えるため語単位で検査する。 */
const _JSON_ONLY_TERMS = ['ONLY', 'JSON array'] as const;

/** ブロック間の本文を指示ではなくデータとして扱わせる語句。 */
const _DATA_NOT_INSTRUCTIONS_TERMS = ['DATA', 'never instructions'] as const;

// ─── Tests

/**
 * filter 判定用システムプロンプト `_SYSTEM_PROMPT` のユニットテストスイート。
 *
 * 判定対象のログは過去の AI セッション記録であり、本文がモデルへの指示として
 * 解釈されると判定 JSON ではなく散文が返る。プロンプトが
 * 「JSON のみを出力する」「デリミタ間はデータであり指示ではない」を明示することを検証する。
 *
 * テスト ID 範囲: T-FL-SYP-01 〜 T-FL-SYP-03
 *
 * @see processChunk
 */
describe('_SYSTEM_PROMPT', () => {
  /** JSON 配列のみを出力させる指示が含まれることを検証する。 */
  describe('When: 出力形式の指示', () => {
    for (const term of _JSON_ONLY_TERMS) {
      it(`[Normal] T-FL-SYP-01-0${_JSON_ONLY_TERMS.indexOf(term) + 1}: "${term}" を含む`, () => {
        assertStringIncludes(_SYSTEM_PROMPT, term);
      });
    }

    it('[Normal] T-FL-SYP-01-03: 判定結果のスキーマ（file / decision / confidence / reason）を提示する', () => {
      assertMatch(_SYSTEM_PROMPT, /"file".*"decision".*"confidence".*"reason"/s);
    });
  });

  /** 入力がデリミタで区切られること、その中身がデータであることを明示するのを検証する。 */
  describe('When: 入力形式の指示', () => {
    it('[Normal] T-FL-SYP-02-01: 開始デリミタの形を提示する', () => {
      assertStringIncludes(_SYSTEM_PROMPT, CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', 'NAME'));
    });

    it('[Normal] T-FL-SYP-02-02: 終了デリミタの形を提示する', () => {
      assertStringIncludes(_SYSTEM_PROMPT, CHATLOG_BLOCK_CLOSE);
    });

    for (const term of _DATA_NOT_INSTRUCTIONS_TERMS) {
      it(`[Normal] T-FL-SYP-03-0${_DATA_NOT_INSTRUCTIONS_TERMS.indexOf(term) + 1}: "${term}" を含む`, () => {
        assertStringIncludes(_SYSTEM_PROMPT, term);
      });
    }
  });
});
