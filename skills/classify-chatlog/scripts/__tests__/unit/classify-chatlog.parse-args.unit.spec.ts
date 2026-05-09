// src: scripts/__tests__/unit/classify-chatlog.parseArgs.unit.spec.ts
// @(#): parseArgs のユニットテスト
//       classify 固有オプションのモデル名バリデーション

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- modules for test --
// test target
import { parseArgs } from '../../classify-chatlog.ts';
// types
import type { ParsedConfig } from '../../types/classify.types.ts';

describe('parseArgs', () => {
  // ─── T-CL-PA-01: デフォルト値（未指定時は undefined） ───────────────────────

  describe('Given: 空の引数配列 []', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-CL-PA-01 - 各フィールドが undefined になる', () => {
        const _cases: Array<[string, keyof ParsedConfig]> = [
          ['T-CL-PA-01-01: inputDir → undefined', 'inputDir'],
          ['T-CL-PA-01-02: configFile → undefined', 'configFile'],
          ['T-CL-PA-01-03: dryRun → undefined', 'dryRun'],
        ];
        for (const [id, key] of _cases) {
          it(id, () => {
            const result = parseArgs([]);
            assertEquals(result[key], undefined);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-02: --input オプション ─────────────────────────────────────────

  describe('Given: --input または --input=VALUE', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-02 - inputDir に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          ['T-CL-PA-02-01: --input VALUE → inputDir が設定される', ['--input', '/data/chatlog'], '/data/chatlog'],
          ['T-CL-PA-02-02: --input=VALUE → inputDir が設定される', ['--input=/data/chatlog'], '/data/chatlog'],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.inputDir, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-04: --config オプション ───────────────────────────────────────

  describe('Given: --config または --config=VALUE', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-04 - configFile に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          [
            'T-CL-PA-04-01: --config VALUE → configFile が設定される',
            ['--config', '/etc/classify.yaml'],
            '/etc/classify.yaml',
          ],
          [
            'T-CL-PA-04-02: --config=VALUE → configFile が設定される',
            ['--config=/etc/classify.yaml'],
            '/etc/classify.yaml',
          ],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.configFile, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-05: --model 正常系（有効モデル名） ──────────────────────────────

  describe('Given: --model または --model=VALUE（有効モデル名）', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-05 - model に値が設定される（スローされない）', () => {
        const _cases: Array<[string, string[], string]> = [
          ['T-CL-PA-05-01: --model VALUE → model が設定される', ['--model', 'opus'], 'opus'],
          ['T-CL-PA-05-02: --model=VALUE → model が設定される', ['--model=haiku'], 'haiku'],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.model, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-06: --dry-run フラグ ───────────────────────────────────────────

  describe('Given: --dry-run フラグ', () => {
    describe('When: parseArgs(["--dry-run"]) を呼び出す', () => {
      describe('Then: T-CL-PA-06 - dryRun が true になる', () => {
        it('T-CL-PA-06-01: --dry-run → dryRun が true になる', () => {
          const result = parseArgs(['--dry-run']);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  // ─── 正常系: --model 未指定時は undefined（globalConfig 解決は main() で行う） ─────

  describe('Given: --model 未指定', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-CL-PA-13 - model が undefined になる（globalConfig 解決は main() で行う）', () => {
        it('T-CL-PA-13-01: --model 未指定時、model は undefined になる', () => {
          const result = parseArgs([]);
          assertEquals(result.model, undefined);
        });

        it('T-CL-PA-13-02: --model 明示指定は優先される', () => {
          const result = parseArgs(['--model', 'sonnet']);
          assertEquals(result.model, 'sonnet');
        });
      });
    });
  });
});
