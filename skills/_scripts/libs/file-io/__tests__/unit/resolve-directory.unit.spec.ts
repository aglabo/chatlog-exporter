// src: skills/_scripts/libs/file-io/__tests__/unit/resolve-directory.unit.spec.ts
// @(#): resolve-directory.ts のユニットテスト
//       対象: periodToPath, agentPath, resolveChatlogsDir, extractChatlogPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  agentPath,
  extractChatlogPath,
  periodToPath,
  resolveChatlogsDir,
} from '../../resolve-directory.ts';
// types
import type { ResolveChatlogsDirOptions } from '../../resolve-directory.ts';

// ─── Tests

/**
 * `periodToPath` 関数のユニットテストスイート。
 *
 * `periodToPath(period)` は期間文字列をディレクトリパス断片に変換する。
 * - YYYY-MM 形式 → `YYYY/YYYY-MM`
 * - YYYY 形式 → `YYYY`
 *
 * テスト ID 範囲: T-LIB-RD-01-01 〜 T-LIB-RD-01-03
 *
 * @see periodToPath
 */
describe('periodToPath', () => {
  /**
   * YYYY-MM 形式の期間文字列 "2026-03" を渡す前提条件グループ。
   *
   * YYYY-MM 形式のとき `YYYY/YYYY-MM` 形式のパスが返ることを検証する。
   */
  describe('Given: YYYY-MM 形式の期間文字列 "2026-03"', () => {
    /** `periodToPath("2026-03")` を呼び出すとき。 */
    describe('When: periodToPath("2026-03") を呼び出す', () => {
      /** `"2026/2026-03"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-01-01 - "2026/2026-03" が返る', () => {
        it('T-LIB-RD-01-01: periodToPath("2026-03") → "2026/2026-03"', () => {
          assertEquals(periodToPath('2026-03'), '2026/2026-03');
        });
      });
    });
  });

  /**
   * YYYY 形式の期間文字列 "2026" を渡す前提条件グループ。
   *
   * YYYY 形式のとき `YYYY` がそのまま返ることを検証する。
   */
  describe('Given: YYYY 形式の期間文字列 "2026"', () => {
    /** `periodToPath("2026")` を呼び出すとき。 */
    describe('When: periodToPath("2026") を呼び出す', () => {
      /** `"2026"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-01-02 - "2026" が返る', () => {
        it('T-LIB-RD-01-02: periodToPath("2026") → "2026"', () => {
          assertEquals(periodToPath('2026'), '2026');
        });
      });
    });
  });

  /**
   * 別の YYYY-MM 形式の期間文字列 "2025-12" を渡す前提条件グループ。
   *
   * 別の YYYY-MM 形式でも `YYYY/YYYY-MM` 形式のパスが返ることを検証する。
   */
  describe('Given: YYYY-MM 形式の期間文字列 "2025-12"', () => {
    /** `periodToPath("2025-12")` を呼び出すとき。 */
    describe('When: periodToPath("2025-12") を呼び出す', () => {
      /** `"2025/2025-12"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-01-03 - "2025/2025-12" が返る', () => {
        it('T-LIB-RD-01-03: periodToPath("2025-12") → "2025/2025-12"', () => {
          assertEquals(periodToPath('2025-12'), '2025/2025-12');
        });
      });
    });
  });
});

/**
 * `agentPath` 関数のユニットテストスイート。
 *
 * `agentPath(agent, period?)` はエージェントのチャットログサブパスを構築する。
 * - period 未指定 → `agent`
 * - period = YYYY → `agent/YYYY`
 * - period = YYYY-MM → `agent/YYYY/YYYY-MM`
 *
 * テスト ID 範囲: T-LIB-RD-02-01 〜 T-LIB-RD-02-04
 *
 * @see agentPath
 */
describe('agentPath', () => {
  /**
   * `period` が未指定の前提条件グループ。
   *
   * `period` が未指定のとき `agent` がそのまま返ることを検証する。
   */
  describe('Given: period が未指定', () => {
    /** `agentPath("claude", undefined)` を呼び出すとき。 */
    describe('When: agentPath("claude", undefined) を呼び出す', () => {
      /** `"claude"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-02-01 - "claude" が返る', () => {
        it('T-LIB-RD-02-01: agentPath("claude", undefined) → "claude"', () => {
          assertEquals(agentPath('claude', undefined), 'claude');
        });
      });
    });
  });

  /**
   * `period` が YYYY-MM 形式 "2026-03" の前提条件グループ。
   *
   * YYYY-MM 形式のとき `agent/YYYY/YYYY-MM` が返ることを検証する。
   */
  describe('Given: period が YYYY-MM 形式 "2026-03"', () => {
    /** `agentPath("claude", "2026-03")` を呼び出すとき。 */
    describe('When: agentPath("claude", "2026-03") を呼び出す', () => {
      /** `"claude/2026/2026-03"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-02-02 - "claude/2026/2026-03" が返る', () => {
        it('T-LIB-RD-02-02: agentPath("claude", "2026-03") → "claude/2026/2026-03"', () => {
          assertEquals(agentPath('claude', '2026-03'), 'claude/2026/2026-03');
        });
      });
    });
  });

  /**
   * `period` が YYYY 形式 "2026" の前提条件グループ。
   *
   * YYYY 形式のとき `agent/YYYY` が返ることを検証する。
   */
  describe('Given: period が YYYY 形式 "2026"', () => {
    /** `agentPath("claude", "2026")` を呼び出すとき。 */
    describe('When: agentPath("claude", "2026") を呼び出す', () => {
      /** `"claude/2026"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-02-03 - "claude/2026" が返る', () => {
        it('T-LIB-RD-02-03: agentPath("claude", "2026") → "claude/2026"', () => {
          assertEquals(agentPath('claude', '2026'), 'claude/2026');
        });
      });
    });
  });

  /**
   * `agent` が "chatgpt" で `period` が YYYY-MM 形式 "2026-03" の前提条件グループ。
   *
   * 異なる agent でも `agent/YYYY/YYYY-MM` が返ることを検証する。
   */
  describe('Given: agent が "chatgpt" で period が YYYY-MM 形式 "2026-03"', () => {
    /** `agentPath("chatgpt", "2026-03")` を呼び出すとき。 */
    describe('When: agentPath("chatgpt", "2026-03") を呼び出す', () => {
      /** `"chatgpt/2026/2026-03"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-02-04 - "chatgpt/2026/2026-03" が返る', () => {
        it('T-LIB-RD-02-04: agentPath("chatgpt", "2026-03") → "chatgpt/2026/2026-03"', () => {
          assertEquals(agentPath('chatgpt', '2026-03'), 'chatgpt/2026/2026-03');
        });
      });
    });
  });
});

/**
 * `resolveChatlogsDir` 関数のユニットテストスイート。
 *
 * `resolveChatlogsDir(options)` はチャットログディレクトリを解決する。
 * - `chatlogsDir` 指定あり → そのまま返す（agent/period は無視）
 * - `chatlogsDir` 未定義 → `baseDir/agentPath(agent, period)` を返す
 *
 * テスト ID 範囲: T-LIB-RD-03-01 〜 T-LIB-RD-03-04
 *
 * @see resolveChatlogsDir
 */
describe('resolveChatlogsDir', () => {
  /** 正常系ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-RD-03-01: chatlogsDir 指定あり → chatlogsDir をそのまま返す', () => {
      const _opts: ResolveChatlogsDirOptions = {
        chatlogsDir: '/explicit/chatlogs',
        baseDir: '/custom/chatlogs',
        agent: 'claude',
      };
      assertEquals(resolveChatlogsDir(_opts), '/explicit/chatlogs');
    });

    it('[Normal] T-LIB-RD-03-02: chatlogsDir 未定義、period なし → baseDir/agent', () => {
      const _opts: ResolveChatlogsDirOptions = {
        baseDir: '/custom/chatlogs',
        agent: 'claude',
      };
      assertEquals(resolveChatlogsDir(_opts), '/custom/chatlogs/claude');
    });

    it('[Normal] T-LIB-RD-03-03: chatlogsDir 未定義、period=YYYY-MM → baseDir/agent/YYYY/YYYY-MM', () => {
      const _opts: ResolveChatlogsDirOptions = {
        baseDir: '/custom/chatlogs',
        agent: 'claude',
        period: '2026-03',
      };
      assertEquals(resolveChatlogsDir(_opts), '/custom/chatlogs/claude/2026/2026-03');
    });
  });

  /** エッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-RD-03-04: chatlogsDir 指定あり + period 指定 → chatlogsDir をそのまま返す（period 無視）', () => {
      const _opts: ResolveChatlogsDirOptions = {
        chatlogsDir: '/explicit/chatlogs',
        baseDir: '/custom/chatlogs',
        agent: 'claude',
        period: '2026-03',
      };
      assertEquals(resolveChatlogsDir(_opts), '/explicit/chatlogs');
    });
  });
});

/**
 * `extractChatlogPath` 関数のユニットテストスイート。
 *
 * ファイルパスから chatlogs/<agent>/<yyyy>/<yyyy-mm> セグメントを抽出する
 * 純粋関数の正常系・エッジケースを検証する。内部で normalizePath を呼ぶため
 * Windows バックスラッシュ区切りパスも正しく処理する。
 *
 * テスト ID 範囲: T-ECP-01-01 〜 T-ECP-03-02
 *
 * @see extractChatlogPath
 */
describe('extractChatlogPath', () => {
  /** chatlogs/<agent>/<yyyy>/<yyyy-mm> を含む正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-ECP-01-01: chatlogs/claude/2026/2026-04 を含むパスから claude/2026/2026-04 を返す', () => {
      assertEquals(extractChatlogPath('W:/chatlogs/claude/2026/2026-04/chat.md'), 'claude/2026/2026-04');
    });

    it('[Normal] T-ECP-01-02: chatlogs/gpt/2025/2025-12 を含むパスから gpt/2025/2025-12 を返す', () => {
      assertEquals(extractChatlogPath('/home/user/chatlogs/gpt/2025/2025-12/session.md'), 'gpt/2025/2025-12');
    });

    it('[Normal] T-ECP-01-03: 月が異なる同エージェントのパスも正しく返す', () => {
      assertEquals(extractChatlogPath('/chatlogs/claude/2026/2026-03/file.md'), 'claude/2026/2026-03');
    });

    it('[Normal] T-ECP-01-04: バックスラッシュ区切りパスも正規化して claude/2026/2026-04 を返す', () => {
      assertEquals(extractChatlogPath('W:\\chatlogs\\claude\\2026\\2026-04\\chat.md'), 'claude/2026/2026-04');
    });
  });

  /** chatlogs形式を含まないパスは空文字列を返す正常ケース。 */
  describe('When: chatlogs形式パスを含まないファイルパス', () => {
    it('[Normal] T-ECP-02-01: 任意パスのとき空文字列を返す', () => {
      assertEquals(extractChatlogPath('/tmp/arbitrary/chat.md'), '');
    });

    it('[Normal] T-ECP-02-02: chatlogs/<agent>/<yyyy> のみ（月なし）のとき空文字列を返す', () => {
      assertEquals(extractChatlogPath('/chatlogs/claude/2026/file.md'), '');
    });
  });

  /** エッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-ECP-03-01: ファイル名のみのとき空文字列を返す', () => {
      assertEquals(extractChatlogPath('chat.md'), '');
    });

    it('[Edge] T-ECP-03-02: chatlogs直下にファイルがある（agent/yyyy/yyyy-mmなし）とき空文字列を返す', () => {
      assertEquals(extractChatlogPath('/chatlogs/chat.md'), '');
    });
  });
});
