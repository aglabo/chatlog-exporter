// src: scripts/constants/__tests__/unit/constants.unit.spec.ts
// @(#): classify.constants のユニットテスト
//       DEFAULT_CLASSIFY_CONFIG の定数値を検証する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

//  ───test target
import { DEFAULT_PROJECTS_DIC_PATH } from '../../../../../_scripts/constants/defaults.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';
import { DEFAULT_CLASSIFY_CONFIG } from '../../classify.constants.ts';

//  ─── Helpers
// constants
import { DEFAULT_AGENT, DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';

// ─── DEFAULT_PROJECTS_DIC_PATH の検証 ────────────────────────────────────────

describe('classify.constants', () => {
  describe('Given: DEFAULT_PROJECTS_DIC_PATH', () => {
    describe('When: 値を参照する', () => {
      describe('Then: T-CL-CONST-02 - 期待するデフォルトパスを持つ', () => {
        it('T-CL-CONST-02-01: DEFAULT_PROJECTS_DIC_PATH が "./assets/configs/projects.dic" になる', () => {
          assertEquals(DEFAULT_PROJECTS_DIC_PATH, './assets/configs/projects.dic');
        });
      });
    });
  });
});

// ─── CLASSIFY_ACTIONS の各フィールド検証 ─────────────────────────────────────

describe('classify.constants', () => {
  describe('Given: CLASSIFY_ACTIONS', () => {
    describe('When: 値を参照する', () => {
      describe('Then: T-CL-CONST-03 - 期待するアクション値を持つ', () => {
        it('T-CL-CONST-03-01: CLASSIFY_ACTIONS.MOVEBYAI が "move-by-ai" になる', () => {
          assertEquals(CLASSIFY_ACTIONS.MOVEBYAI, 'move-by-ai');
        });
      });
    });
  });
});

// ─── DEFAULT_CLASSIFY_CONFIG の各フィールド検証 ────────────────────────────────

describe('classify.constants', () => {
  describe('Given: DEFAULT_CLASSIFY_CONFIG', () => {
    describe('When: 各フィールドを参照する', () => {
      describe('Then: T-CL-CONST-01 - 期待するデフォルト値を持つ', () => {
        const _defaultCases: { id: string; field: keyof typeof DEFAULT_CLASSIFY_CONFIG; expected: unknown }[] = [
          { id: 'T-CL-CONST-01-01', field: 'agent', expected: DEFAULT_AGENT },
          { id: 'T-CL-CONST-01-02', field: 'dryRun', expected: false },
          { id: 'T-CL-CONST-01-03', field: 'baseDir', expected: './chatlogs' },
          { id: 'T-CL-CONST-01-04', field: 'dicsDir', expected: './assets/dics' },
          { id: 'T-CL-CONST-01-05', field: 'model', expected: DEFAULT_AI_MODEL },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${String(field)} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(DEFAULT_CLASSIFY_CONFIG[field], expected);
          });
        }
      });
    });
  });
});
