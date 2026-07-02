// src: scripts/modules/__tests__/unit/classify-config.unit.spec.ts
// @(#): parseArgs のユニットテスト
//       classify 固有オプションのモデル名バリデーション

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assert, assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- modules for test --
// test target
import { parseArgs } from '../../classify-config.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

describe('parseArgs', () => {
  // ─── T-CL-PA-02: --base-dir オプション ─────────────────────────────────────

  describe('Given: --base-dir または --base-dir=VALUE', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-02 - baseDir に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          ['T-CL-PA-02-01: --base-dir VALUE → baseDir が設定される', ['--base-dir', '/data/chatlog'], '/data/chatlog'],
          ['T-CL-PA-02-02: --base-dir=VALUE → baseDir が設定される', ['--base-dir=/data/chatlog'], '/data/chatlog'],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.baseDir, expected);
          });
        }
      });
    });
  });

  // ─── T-CL-PA-07: --chatlogs-dir オプション ──────────────────────────────────

  describe('Given: --chatlogs-dir または --chatlogs-dir=VALUE', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-07 - chatlogsDir に値が設定される', () => {
        const _cases: Array<[string, string[], string]> = [
          [
            'T-CL-PA-07-01: --chatlogs-dir VALUE → chatlogsDir が設定される',
            ['--chatlogs-dir', '/data/chatlog/claude/2026/2026-04'],
            '/data/chatlog/claude/2026/2026-04',
          ],
          [
            'T-CL-PA-07-02: --chatlogs-dir=VALUE → chatlogsDir が設定される',
            ['--chatlogs-dir=/data/chatlog/claude/2026/2026-04'],
            '/data/chatlog/claude/2026/2026-04',
          ],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.chatlogsDir, expected);
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
          assert(result.dryRun);
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

  // ─── T-CL-PA-08: --period オプション ────────────────────────────────────────

  describe('Given: --period オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-08 - period に値が設定される、または不正値でエラー', () => {
        it('T-CL-PA-08-01: --period VALUE → period が設定される', () => {
          const result = parseArgs(['--period', '2026-04']);
          assertEquals(result.period, '2026-04');
        });

        it('T-CL-PA-08-02: --period=VALUE → period が設定される', () => {
          const result = parseArgs(['--period=2026']);
          assertEquals(result.period, '2026');
        });

        it('T-CL-PA-08-03: --period 不正形式 → ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgs(['--period', 'invalid-format']),
            ChatlogError,
          );
        });
      });
    });
  });

  // ─── T-CL-PA-03: period 位置引数 ────────────────────────────────────────────

  describe('Given: YYYY-MM または YYYY 形式の位置引数', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-CL-PA-03 - period に値が設定される', () => {
        const _cases: Array<[string, string[], string | undefined]> = [
          ['T-CL-PA-03-01: YYYY-MM 形式 → period が設定される', ['2026-04'], '2026-04'],
          ['T-CL-PA-03-02: YYYY 形式 → period が設定される', ['2026'], '2026'],
          ['T-CL-PA-03-03: 引数なし → period が undefined になる', [], undefined],
        ];
        for (const [id, args, expected] of _cases) {
          it(id, () => {
            const result = parseArgs(args);
            assertEquals(result.period, expected);
          });
        }
      });
    });
  });
});
