// src: scripts/__tests__/unit/prefilter-chatlog.unit.spec.ts
// @(#): prefilter-chatlog.ts のユニットテスト
//       checkFilename / checkUserContent / checkAssistantContent / parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertNotEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  buildConfig,
  checkAssistantContent,
  checkFilename,
  checkUserContent,
  parseArgs,
} from '../../prefilter-chatlog.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { MIN_ASSISTANT_CHARS } from '../../constants/filter.constants.ts';
// types
import type { Turn } from '../../../../_scripts/types/conversation.types.ts';
// types
import type { CommandProvider } from '../../../../_scripts/types/providers.types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// checkFilename
// ─────────────────────────────────────────────────────────────────────────────

describe('checkFilename', () => {
  // ─── T-PF-CF-01: 除外パターン一致 → null でない文字列を返す ─────────────────

  describe('Given: NOISE_FILENAME_PATTERNS に含まれるファイル名', () => {
    describe('When: checkFilename(filename) を呼び出す', () => {
      describe('Then: T-PF-CF-01 - null でない文字列が返される', () => {
        it('T-PF-CF-01-01: you-are-a-topic-and-tag-extraction-assistant.md → null でない', () => {
          const result = checkFilename('you-are-a-topic-and-tag-extraction-assistant.md');

          assertNotEquals(result, null);
        });

        it('T-PF-CF-01-02: say-ok-and-nothing-else.md → null でない', () => {
          const result = checkFilename('say-ok-and-nothing-else.md');

          assertNotEquals(result, null);
        });

        it('T-PF-CF-01-03: command-message-claude-idd-framework.md → null でない', () => {
          const result = checkFilename('command-message-claude-idd-framework.md');

          assertNotEquals(result, null);
        });

        it('T-PF-CF-01-04: command-message-deckrd-deckrd.md → null でない', () => {
          const result = checkFilename('command-message-deckrd-deckrd.md');

          assertNotEquals(result, null);
        });

        it('T-PF-CF-01-05: command-message-deckrd-coder.md → null でない', () => {
          const result = checkFilename('command-message-deckrd-coder.md');

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-CF-02: 一致しないファイル名 → null ─────────────────────────────────

  describe('Given: 通常のファイル名', () => {
    describe('When: checkFilename(filename) を呼び出す', () => {
      describe('Then: T-PF-CF-02 - null が返される', () => {
        it('T-PF-CF-02-01: "my-chat-log.md" → null', () => {
          const result = checkFilename('my-chat-log.md');

          assertEquals(result, null);
        });

        it('T-PF-CF-02-02: 空文字列 "" → null', () => {
          const result = checkFilename('');

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-CF-03: 大文字小文字を区別しない ────────────────────────────────────

  describe('Given: 除外パターンを大文字化したファイル名', () => {
    describe('When: checkFilename(filename) を呼び出す', () => {
      describe('Then: T-PF-CF-03 - 大文字小文字を区別せず null でない文字列を返す', () => {
        it('T-PF-CF-03-01: "Say-Ok-And-Nothing-Else.md" → null でない', () => {
          const result = checkFilename('Say-Ok-And-Nothing-Else.md');

          assertNotEquals(result, null);
        });

        it('T-PF-CF-03-02: "SAY-OK-AND-NOTHING-ELSE.md" → null でない', () => {
          const result = checkFilename('SAY-OK-AND-NOTHING-ELSE.md');

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-CF-04: reason に "ファイル名パターン:" が含まれる ─────────────────

  describe('Given: 除外パターン一致ファイル名', () => {
    describe('When: checkFilename(filename) を呼び出す', () => {
      describe('Then: T-PF-CF-04 - reason に "ファイル名パターン:" が含まれる', () => {
        it('T-PF-CF-04-01: reason に "ファイル名パターン:" が含まれる', () => {
          const result = checkFilename('say-ok-and-nothing-else.md');

          assertEquals(result!.includes('ファイル名パターン:'), true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUserContent
// ─────────────────────────────────────────────────────────────────────────────

describe('checkUserContent', () => {
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; text: string }>): Turn[] {
    return turns;
  }

  // ─── T-PF-UC-01: User ターンなし → reason を返す ────────────────────────────

  describe('Given: Assistant ターンのみ（User ターン 0 件）', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-01 - "Userターンが存在しない" を含む reason を返す', () => {
        it('T-PF-UC-01-01: "Userターンが存在しない" を含む reason を返す', () => {
          const turns = _makeTurns([{ role: 'assistant', text: '回答' }]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
          assertEquals(result!.includes('Userターンが存在しない'), true);
        });
      });
    });
  });

  // ─── T-PF-UC-02: 全 User ターンがシステムタグのみ → reason を返す ────────────

  describe('Given: システムタグのみの User ターン', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-02 - reason を返す', () => {
        it('T-PF-UC-02-01: 単一 User ターンで <system-reminder> のみ → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '<system-reminder>システムメッセージ</system-reminder>' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-02-02: 複数 User ターン全てが <system-reminder> → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '<system-reminder>msg1</system-reminder>' },
            { role: 'assistant', text: '回答' },
            { role: 'user', text: '<command-name>cmd</command-name>' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-02-03: 1ターン目はシステムタグ、2ターン目は通常テキスト → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '<system-reminder>msg</system-reminder>' },
            { role: 'assistant', text: '回答' },
            { role: 'user', text: '通常の質問テキスト' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-03: 全 User ターンが /コマンドのみ → reason を返す ─────────────

  describe('Given: /コマンドのみの User ターン', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-03 - reason を返す', () => {
        it('T-PF-UC-03-01: 単一 User ターンで /commit のみ → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '/commit' },
            { role: 'assistant', text: '了解しました' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-03-02: 複数 User ターン全てが /コマンド → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '/commit' },
            { role: 'assistant', text: '回答1' },
            { role: 'user', text: '/export-log' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-03-03: 1ターン目は /コマンド、2ターン目は通常テキスト → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '/commit' },
            { role: 'assistant', text: '回答' },
            { role: 'user', text: '通常の質問テキスト' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-04: 1 ターン限定 — NOISE_USER_PREFIX_PATTERNS 一致 ─────────────

  describe('Given: 1 件の User ターンで NOISE_USER_PREFIX_PATTERNS に一致するテキスト', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-04 - reason を返す', () => {
        it('T-PF-UC-04-01: "=== GIT LOGS ===" で始まる → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '=== GIT LOGS ===\ngit log --oneline' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-04-02: "---\\nname: commit-message-generator" で始まる → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '---\nname: commit-message-generator\n---' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-04-03: "Based on the issue title" で始まる → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'Based on the issue title, generate a branch name' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-04-04: "Implement the following plan" で始まる → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'Implement the following plan:\n1. step one' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-05: 1 ターン限定ルール — 2 件以上なら PREFIX_PATTERNS が適用されない

  describe('Given: 2 件の User ターンで 1 件目が NOISE_USER_PREFIX_PATTERNS 一致', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-05 - 複数 User ターンの場合は prefix パターンが適用されず null', () => {
        it('T-PF-UC-05-01: 複数 User ターンでは prefix パターンが適用されず null を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '=== GIT LOGS ===\ngit log --oneline' },
            { role: 'assistant', text: '回答1' },
            { role: 'user', text: '通常の質問' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-06: 1 ターン限定 — NOISE_USER_EXACT_PATTERNS 一致 ──────────────

  describe('Given: 1 件の User ターンで Windows/Unix パスのみ', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-06 - reason を返す', () => {
        it('T-PF-UC-06-01: "C:\\\\Users\\\\foo\\\\bar.md" → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'C:\\Users\\foo\\bar.md' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-UC-06-02: "docs/readme.md" → reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'docs/readme.md' },
            { role: 'assistant', text: '回答' },
          ]);
          const result = checkUserContent(turns);

          assertNotEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-07: 1 ターン限定ルール — 2 件以上なら EXACT_PATTERNS が適用されない

  describe('Given: 2 件の User ターンで 1 件目が Windows パスのみ', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-07 - 複数 User ターンでは exact パターンが適用されず null', () => {
        it('T-PF-UC-07-01: 複数 User ターンでは exact パターンが適用されず null を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'C:\\Users\\foo\\bar.md' },
            { role: 'assistant', text: '回答' },
            { role: 'user', text: '通常の質問' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-UC-08: 正常な User ターン → null ──────────────────────────────────

  describe('Given: 通常のテキストを含む User ターン', () => {
    describe('When: checkUserContent(turns) を呼び出す', () => {
      describe('Then: T-PF-UC-08 - null が返される', () => {
        it('T-PF-UC-08-01: 通常テキストの単一 User ターン → null を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: 'この機能の設計についてどう思いますか？' },
            { role: 'assistant', text: '良い設計だと思います。' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });

        it('T-PF-UC-08-02: 複数の通常 User ターン → null を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問1' },
            { role: 'assistant', text: '回答1' },
            { role: 'user', text: '質問2' },
            { role: 'assistant', text: '回答2' },
          ]);
          const result = checkUserContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkAssistantContent
// ─────────────────────────────────────────────────────────────────────────────

describe('checkAssistantContent', () => {
  function _makeTurns(turns: Array<{ role: 'user' | 'assistant'; text: string }>): Turn[] {
    return turns;
  }

  // ─── T-PF-AC-01: User=1 + Assistant 合計 < MIN_ASSISTANT_CHARS → reason ───

  describe('Given: 1 件の User ターン + 短い Assistant ターン', () => {
    describe('When: checkAssistantContent(turns) を呼び出す', () => {
      describe('Then: T-PF-AC-01 - reason を返す', () => {
        it('T-PF-AC-01-01: null でない reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: '短い' },
          ]);
          const result = checkAssistantContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-AC-01-02: reason に文字数情報が含まれる', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: '短い' },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result!.includes(`${MIN_ASSISTANT_CHARS}`), true);
        });
      });
    });
  });

  // ─── T-PF-AC-02: User=1 + Assistant 合計 >= MIN_ASSISTANT_CHARS → null ────

  describe('Given: 1 件の User ターン + 十分な長さの Assistant ターン', () => {
    describe('When: checkAssistantContent(turns) を呼び出す', () => {
      describe('Then: T-PF-AC-02 - null が返される', () => {
        it('T-PF-AC-02-01: ちょうど MIN_ASSISTANT_CHARS 文字 → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: 'a'.repeat(MIN_ASSISTANT_CHARS) },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });

        it('T-PF-AC-02-02: MIN_ASSISTANT_CHARS より多い文字数 → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: 'a'.repeat(MIN_ASSISTANT_CHARS + 50) },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-AC-03: User=1 + Assistant なし → null（Assistantなし OK） ────────

  describe('Given: 1 件の User ターンのみ（Assistant ターン 0 件）', () => {
    describe('When: checkAssistantContent(turns) を呼び出す', () => {
      describe('Then: T-PF-AC-03 - null が返される（Assistantなし OK）', () => {
        it('T-PF-AC-03-01: null を返す', () => {
          const turns = _makeTurns([{ role: 'user', text: '質問のみ' }]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-AC-04: User 複数ターン → null（1 ターン限定ルール） ───────────────

  describe('Given: 2 件以上の User ターン + 短い Assistant ターン', () => {
    describe('When: checkAssistantContent(turns) を呼び出す', () => {
      describe('Then: T-PF-AC-04 - null が返される（複数 User ターンには長さチェック適用なし）', () => {
        it('T-PF-AC-04-01: User=2, Assistant 短い → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問1' },
            { role: 'assistant', text: '短い' },
            { role: 'user', text: '質問2' },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });

        it('T-PF-AC-04-02: User=3, Assistant 1 文字 → null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問1' },
            { role: 'user', text: '質問2' },
            { role: 'user', text: '質問3' },
            { role: 'assistant', text: 'a' },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });

  // ─── T-PF-AC-05: 複数 Assistant ターンの合計で判定 ──────────────────────────

  describe('Given: 1 件の User ターン + 複数の Assistant ターン', () => {
    describe('When: checkAssistantContent(turns) を呼び出す', () => {
      describe('Then: T-PF-AC-05 - 合計文字数で判定される', () => {
        it('T-PF-AC-05-01: 各 40 文字 × 2 件（合計 80 < 100）→ reason を返す', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: 'a'.repeat(40) },
            { role: 'assistant', text: 'b'.repeat(40) },
          ]);
          const result = checkAssistantContent(turns);

          assertNotEquals(result, null);
        });

        it('T-PF-AC-05-02: 各 60 文字 × 2 件（合計 120 >= 100）→ null', () => {
          const turns = _makeTurns([
            { role: 'user', text: '質問' },
            { role: 'assistant', text: 'a'.repeat(60) },
            { role: 'assistant', text: 'b'.repeat(60) },
          ]);
          const result = checkAssistantContent(turns);

          assertEquals(result, null);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs (prefilter)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArgs (prefilter)', () => {
  // ─── T-PF-PA-01: 引数なし → デフォルト値 ────────────────────────────────────

  describe('Given: 引数なしの空配列', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-PF-PA-01 - デフォルト値が適用される', () => {
        it('T-PF-PA-01-01: agent が undefined になる', () => {
          const result = parseArgs([]);

          assertEquals(result.agent, undefined);
        });

        it('T-PF-PA-01-02: dryRun が false になる', () => {
          const result = parseArgs([]);

          assertEquals(result.dryRun, false);
        });

        it('T-PF-PA-01-03: chatlogsDir が undefined になる', () => {
          const result = parseArgs([]);

          assertEquals(result.chatlogsDir, undefined);
        });

        it('T-PF-PA-01-04: period が undefined になる', () => {
          const result = parseArgs([]);

          assertEquals(result.period, undefined);
        });

        it('T-PF-PA-01-05: report が false になる', () => {
          const result = parseArgs([]);

          assertEquals(result.report, false);
        });
      });
    });
  });

  // ─── T-PF-PA-02: agent 引数 ──────────────────────────────────────────────────

  describe('Given: ["codex"] を渡す', () => {
    describe('When: parseArgs(["codex"]) を呼び出す', () => {
      describe('Then: T-PF-PA-02 - agent=codex', () => {
        it('T-PF-PA-02-01: agent が "codex" になる', () => {
          const result = parseArgs(['codex']);

          assertEquals(result.agent, 'codex');
        });
      });
    });
  });

  // ─── T-PF-PA-03: period の解析 ───────────────────────────────────────────────

  describe('Given: ["2026-03"] を渡す', () => {
    describe('When: parseArgs(["2026-03"]) を呼び出す', () => {
      describe('Then: T-PF-PA-03 - period=2026-03', () => {
        it('T-PF-PA-03-01: period が "2026-03" になる', () => {
          const result = parseArgs(['2026-03']);

          assertEquals(result.period, '2026-03');
        });
      });
    });
  });

  // ─── T-PF-PA-04: agent と period の組み合わせ ────────────────────────────────

  describe('Given: ["claude", "2026-03"] を渡す', () => {
    describe('When: parseArgs(["claude", "2026-03"]) を呼び出す', () => {
      describe('Then: T-PF-PA-04 - agent=claude かつ period=2026-03', () => {
        it('T-PF-PA-04-01: agent="claude", period="2026-03" が正しく解析される', () => {
          const result = parseArgs(['claude', '2026-03']);

          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
        });
      });
    });
  });

  // ─── T-PF-PA-05: --dry-run フラグ ────────────────────────────────────────────

  describe('Given: ["--dry-run"] を渡す', () => {
    describe('When: parseArgs(["--dry-run"]) を呼び出す', () => {
      describe('Then: T-PF-PA-05 - dryRun=true, report=false', () => {
        it('T-PF-PA-05-01: dryRun が true になる', () => {
          const result = parseArgs(['--dry-run']);

          assertEquals(result.dryRun, true);
        });

        it('T-PF-PA-05-02: report が false のまま', () => {
          const result = parseArgs(['--dry-run']);

          assertEquals(result.report, false);
        });
      });
    });
  });

  // ─── T-PF-PA-06: --report フラグ → report=true かつ dryRun=true ─────────────

  describe('Given: ["--report"] を渡す', () => {
    describe('When: parseArgs(["--report"]) を呼び出す', () => {
      describe('Then: T-PF-PA-06 - report=true かつ dryRun=true', () => {
        it('T-PF-PA-06-01: report が true になる', () => {
          const result = parseArgs(['--report']);

          assertEquals(result.report, true);
        });

        it('T-PF-PA-06-02: dryRun が true になる（--report は dryRun も暗示）', () => {
          const result = parseArgs(['--report']);

          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  // ─── T-PF-PA-07: --report + --dry-run の組み合わせ ──────────────────────────

  describe('Given: ["--report", "--dry-run"] を渡す', () => {
    describe('When: parseArgs(["--report", "--dry-run"]) を呼び出す', () => {
      describe('Then: T-PF-PA-07 - report=true かつ dryRun=true', () => {
        it('T-PF-PA-07-01: report=true、dryRun=true になる', () => {
          const result = parseArgs(['--report', '--dry-run']);

          assertEquals(result.report, true);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  // ─── T-PF-PA-08: --input <path> オプション（chatlogsDir に吸収） ───────────────

  describe('Given: ["--input", "/path/to/input"] を渡す', () => {
    describe('When: parseArgs(["--input", "/path/to/input"]) を呼び出す', () => {
      describe('Then: T-PF-PA-08 - chatlogsDir=/path/to/input', () => {
        it('T-PF-PA-08-01: chatlogsDir が "/path/to/input" になる', () => {
          const result = parseArgs(['--input', '/path/to/input']);

          assertEquals(result.chatlogsDir, '/path/to/input');
        });
      });
    });
  });

  // ─── T-PF-PA-09: --input=value 形式 ──────────────────────────────────────────

  describe('Given: ["--input=/path/to/input"] を渡す', () => {
    describe('When: parseArgs(["--input=/path/to/input"]) を呼び出す', () => {
      describe('Then: T-PF-PA-09 - --input=value 形式のパース', () => {
        it('T-PF-PA-09-01: chatlogsDir が "/path/to/input" になる', () => {
          const result = parseArgs(['--input=/path/to/input']);

          assertEquals(result.chatlogsDir, '/path/to/input');
        });
      });
    });
  });

  // ─── T-PF-PA-10: 複数オプション組み合わせ ────────────────────────────────────

  describe('Given: codex 2026-03 --report --input ./in を渡す', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-PF-PA-10 - 全フィールドが正しく解析される', () => {
        it('T-PF-PA-10-01: 全フィールドが正しく解析される', () => {
          const result = parseArgs(['codex', '2026-03', '--report', '--input', './in']);

          assertEquals(result.agent, 'codex');
          assertEquals(result.period, '2026-03');
          assertEquals(result.report, true);
          assertEquals(result.dryRun, true);
          assertEquals(result.chatlogsDir, './in');
        });
      });
    });
  });

  // ─── T-PF-PA-11: 未知オプション → ChatlogError(InvalidArgs) ──────────────────────────────

  describe('Given: 未知のオプション ["--unknown"]', () => {
    describe('When: parseArgs(["--unknown"]) を呼び出す', () => {
      describe('Then: T-PF-PA-11 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PF-PA-11-01: ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => parseArgs(['--unknown']),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PF-PA-12: --chatlogs-dir オプション ───────────────────────────────────

  describe('Given: --chatlogs-dir オプション付き引数', () => {
    describe('When: parseArgs(["--chatlogs-dir", "/path/to/chatlogs"]) を呼び出す', () => {
      describe('Then: T-PF-PA-12 - chatlogsDir が設定される', () => {
        it('T-PF-PA-12-01: chatlogsDir が "/path/to/chatlogs" になる', () => {
          const result = parseArgs(['--chatlogs-dir', '/path/to/chatlogs']);

          assertEquals(result.chatlogsDir, '/path/to/chatlogs');
        });
      });
    });
  });

  // ─── T-PF-PA-13: --chatlogs-dir にパスでない値 ───────────────────────────────

  describe('Given: --chatlogs-dir にディレクトリパスでない値', () => {
    describe('When: parseArgs(["--chatlogs-dir", "notapath"]) を呼び出す', () => {
      describe('Then: T-PF-PA-13 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PF-PA-13-01: ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgs(['--chatlogs-dir', 'notapath']),
            ChatlogError,
          );
        });
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfig', () => {
  /**
   * git コマンドを実行しない `CommandProvider` モック。
   *
   * `GlobalConfig.getInstance()` に渡す `commandProvider` として使用し、
   * 実際の git rev-parse を発行せずに成功レスポンスを返す。
   */
  class _NoopCommandProvider {
    /** コマンドと引数を受け取るが何も実行しない（インターフェース互換用）。 */
    constructor(_cmd: string, _opts: { args: string[] }) {}

    /** 常に `{ success: true, code: 0, stdout: 空バイト列 }` を返す。 */
    output(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
      return Promise.resolve({ success: true, code: 0, stdout: new Uint8Array() });
    }
  }

  /**
   * 空の GlobalConfig インスタンスを生成する。
   *
   * `GlobalConfig.resetInstance()` でリセットしてから空 YAML で初期化する。
   *
   * @returns 初期化済みの `GlobalConfig` インスタンス（空設定）
   */
  const _makeEmptyGlobalConfig = async (): Promise<GlobalConfig> => {
    GlobalConfig.resetInstance();
    return await GlobalConfig.getInstance({
      readTextFileProvider: () => Promise.resolve('{}'),
      commandProvider: _NoopCommandProvider as unknown as CommandProvider,
      configFile: 'dummy.yaml',
      schema: {},
    });
  };

  let globalConfig: GlobalConfig;
  beforeEach(async () => {
    globalConfig = await _makeEmptyGlobalConfig();
  });
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── T-PF-BC-01: 空の Args → デフォルト値が適用される ───────────────────────

  describe('Given: 空の Args オブジェクト', () => {
    describe('When: buildConfig({ dryRun: false, report: false }, globalConfig) を呼び出す', () => {
      describe('Then: T-PF-BC-01 - デフォルト値が適用される', () => {
        it('T-PF-BC-01-01: agent が "claude" になる', () => {
          assertEquals(buildConfig({ dryRun: false, report: false }, globalConfig).agent, 'claude');
        });

        it('T-PF-BC-01-02: chatlogsDir が "./chatlogs" になる', () => {
          assertEquals(buildConfig({ dryRun: false, report: false }, globalConfig).chatlogsDir, './chatlogs');
        });

        it('T-PF-BC-01-03: dryRun が false になる', () => {
          assertEquals(buildConfig({ dryRun: false, report: false }, globalConfig).dryRun, false);
        });
      });
    });
  });

  // ─── T-PF-BC-02: agent を指定 → 指定値が優先される ──────────────────────────

  describe('Given: agent を指定した Args', () => {
    describe('When: buildConfig({ agent: "codex", dryRun: false, report: false }, globalConfig) を呼び出す', () => {
      describe('Then: T-PF-BC-02 - 指定した agent が使われる', () => {
        it('T-PF-BC-02-01: agent が "codex" になる', () => {
          assertEquals(buildConfig({ agent: 'codex', dryRun: false, report: false }, globalConfig).agent, 'codex');
        });
      });
    });
  });

  // ─── T-PF-BC-03: dryRun/report フラグ ────────────────────────────────────────

  describe('Given: dryRun=true, report=true の Args', () => {
    describe('When: buildConfig({ dryRun: true, report: true }, globalConfig) を呼び出す', () => {
      describe('Then: T-PF-BC-03 - フラグが反映される', () => {
        it('T-PF-BC-03-01: dryRun が true になる', () => {
          assertEquals(buildConfig({ dryRun: true, report: true }, globalConfig).dryRun, true);
        });

        it('T-PF-BC-03-02: report が true になる', () => {
          assertEquals(buildConfig({ dryRun: true, report: true }, globalConfig).report, true);
        });
      });
    });
  });

  // ─── T-PF-BC-04: chatlogsDir を指定 ─────────────────────────────────────────

  describe('Given: chatlogsDir を指定した Args', () => {
    describe('When: buildConfig({ chatlogsDir: "/chat", ... }, globalConfig) を呼び出す', () => {
      describe('Then: T-PF-BC-04 - chatlogsDir が設定される', () => {
        it('T-PF-BC-04-01: chatlogsDir が "/chat" になる', () => {
          assertEquals(
            buildConfig({ chatlogsDir: '/chat', dryRun: false, report: false }, globalConfig).chatlogsDir,
            '/chat',
          );
        });
      });
    });
  });
});
