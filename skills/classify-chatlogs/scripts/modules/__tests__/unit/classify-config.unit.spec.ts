// src: scripts/modules/__tests__/unit/classify-config.unit.spec.ts
// @(#): buildConfig の CLI 引数解析ユニットテスト
//       classify 固有オプション（--input-dir, --config, --model, --dry-run, --period）の解析結果を検証する

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assert, assertEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// -- modules for test --
// test target
import { buildConfig } from '../../classify-config.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';

describe('buildConfig (CLI 引数解析)', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── T-CL-PA-02: --input-dir オプション ─────────────────────────────────────

  describe('Given: --input-dir または --input-dir=VALUE', () => {
    describe('When: buildConfig(args) を呼び出す', () => {
      describe('Then: T-CL-PA-02 - inputDir に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          [
            'T-CL-PA-02-01: --input-dir VALUE → inputDir が設定される',
            ['--input-dir', '/data/chatlog'],
            '/data/chatlog',
          ],
          [
            'T-CL-PA-02-02: --input-dir=VALUE → inputDir が設定される',
            ['--input-dir=/data/chatlog'],
            '/data/chatlog',
          ],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = buildConfig(args);
            assertEquals(result.inputDir, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-07: --input-dir フルパス直接指定オプション ──────────────────────

  describe('Given: --input-dir に月ディレクトリのフルパス', () => {
    describe('When: buildConfig(args) を呼び出す', () => {
      describe('Then: T-CL-PA-07 - inputDir に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          [
            'T-CL-PA-07-01: --input-dir VALUE → inputDir が設定される',
            ['--input-dir', '/data/chatlog/claude/2026/2026-04'],
            '/data/chatlog/claude/2026/2026-04',
          ],
          [
            'T-CL-PA-07-02: --input-dir=VALUE → inputDir が設定される',
            ['--input-dir=/data/chatlog/claude/2026/2026-04'],
            '/data/chatlog/claude/2026/2026-04',
          ],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = buildConfig(args);
            assertEquals(result.inputDir, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-05: --model 正常系（有効モデル名） ──────────────────────────────

  describe('Given: --model または --model=VALUE（有効モデル名）', () => {
    describe('When: buildConfig(args) を呼び出す', () => {
      describe('Then: T-CL-PA-05 - model に値が設定される（スローされない）', () => {
        const _cases: Array<[string, string[], string]> = [
          ['T-CL-PA-05-01: --model VALUE → model が設定される', ['--model', 'opus'], 'opus'],
          ['T-CL-PA-05-02: --model=VALUE → model が設定される', ['--model=haiku'], 'haiku'],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = buildConfig(args);
            assertEquals(result.model, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-06: --dry-run フラグ ───────────────────────────────────────────

  describe('Given: --dry-run フラグ', () => {
    describe('When: buildConfig(["--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-PA-06 - dryRun が true になる', () => {
        it('T-CL-PA-06-01: --dry-run → dryRun が true になる', () => {
          const result = buildConfig(['--dry-run']);
          assert(result.dryRun);
        });
      });
    });
  });

  // ─── 正常系: --model 未指定時は GlobalConfig のデフォルト値が自動マージされる ─────

  describe('Given: --model 未指定', () => {
    describe('When: buildConfig([]) を呼び出す', () => {
      describe('Then: T-CL-PA-13 - model が GlobalConfig のデフォルト値になる（内部で自動マージ）', () => {
        it('T-CL-PA-13-01: --model 未指定時、model は GlobalConfig のデフォルト値 "sonnet" になる', () => {
          const result = buildConfig([]);
          assertEquals(result.model, 'sonnet');
        });
      });
    });
  });

  // ─── T-CL-PA-08: --period オプション ────────────────────────────────────────

  describe('Given: --period オプション', () => {
    describe('When: buildConfig(args) を呼び出す', () => {
      describe('Then: T-CL-PA-08 - period に値が設定される、または不正値でエラー', () => {
        it('T-CL-PA-08-01: --period VALUE → period が設定される', () => {
          const result = buildConfig(['--period', '2026-04']);
          assertEquals(result.period, '2026-04');
        });

        it('T-CL-PA-08-02: --period=2026（年のみ形式） → ChatlogError がスローされる', () => {
          assertThrows(
            () => buildConfig(['--period=2026']),
            ChatlogError,
          );
        });

        it('T-CL-PA-08-03: --period 不正形式 → ChatlogError がスローされる', () => {
          assertThrows(
            () => buildConfig(['--period', 'invalid-format']),
            ChatlogError,
          );
        });
      });
    });
  });

  // ─── T-CL-PA-03: period 位置引数 ────────────────────────────────────────────

  describe('Given: YYYY-MM または YYYY 形式の位置引数（agent 省略）', () => {
    describe('When: buildConfig(args) を呼び出す', () => {
      describe('Then: T-CL-PA-03 - period 単独は不明な引数としてエラーになる', () => {
        const _cases: Array<[string, string[]]> = [
          ['T-CL-PA-03-01: YYYY-MM 形式 → ChatlogError(InvalidArgs)', ['2026-04']],
          ['T-CL-PA-03-02: YYYY 形式 → ChatlogError(InvalidArgs)', ['2026']],
        ];
        for (const [id, args] of _cases) {
          it(id, () => {
            assertThrows(() => buildConfig(args), ChatlogError);
          });
        }

        it('T-CL-PA-03-03: 引数なし → period が undefined になる', () => {
          const result = buildConfig([]);
          assertEquals(result.period, undefined);
        });
      });
    });
  });
});
