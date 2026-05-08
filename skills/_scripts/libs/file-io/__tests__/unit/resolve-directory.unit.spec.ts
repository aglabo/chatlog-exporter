// src: skills/_scripts/libs/file-io/__tests__/unit/resolve-directory.unit.spec.ts
// @(#): resolve-directory.ts のユニットテスト
//       対象: periodToPath, agentPath, resolveChatlogsDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { agentPath, periodToPath, resolveChatlogsDir } from '../../resolve-directory.ts';

// ─── Helpers
import { globalConfig } from '../../../../classes/GlobalConfig.class.ts';

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
 * `resolveChatlogsDir(chatlogsDir, agent, period?)` は `globalConfig.chatlogsDir` を参照して
 * チャットログディレクトリを解決する。
 * - `chatlogsDir` が定義済み → `chatlogsDir` をそのまま返す（agent/period は無視）
 * - `chatlogsDir` が未定義 → `globalConfig.chatlogsDir + "/" + agentPath(agent, period)` を返す
 *
 * テスト ID 範囲: T-LIB-RD-03-01 〜 T-LIB-RD-03-04
 *
 * @see resolveChatlogsDir
 */
describe('resolveChatlogsDir', () => {
  /**
   * `chatlogsDir` が定義済みの前提条件グループ。
   *
   * `chatlogsDir` が設定されているとき、agent/period は無視され `chatlogsDir` をそのまま返す。
   */
  describe('Given: chatlogsDir が定義済み', () => {
    /** `resolveChatlogsDir("/chatlogs/claude", "claude")` を呼び出すとき。 */
    describe('When: resolveChatlogsDir("/chatlogs/claude", "claude") を呼び出す', () => {
      /** `chatlogsDir` をそのまま返すことを検証する。 */
      describe('Then: T-LIB-RD-03-01 - chatlogsDir をそのまま返す', () => {
        it('T-LIB-RD-03-01: chatlogsDir="/chatlogs/claude" → "/chatlogs/claude" を返す', () => {
          const result = resolveChatlogsDir('/chatlogs/claude', 'claude');
          assertEquals(result, '/chatlogs/claude');
        });
      });
    });
  });

  /**
   * `chatlogsDir` が未定義で `globalConfig.chatlogsDir` が設定されている前提条件グループ。
   *
   * `chatlogsDir` が未定義のとき `globalConfig.chatlogsDir/agent` を返すことを検証する。
   */
  describe('Given: chatlogsDir が未定義で globalConfig.chatlogsDir が "/custom/chatlogs"', () => {
    /** `resolveChatlogsDir(undefined, "claude")` を呼び出すとき。 */
    describe('When: resolveChatlogsDir(undefined, "claude") を呼び出す', () => {
      /** `"/custom/chatlogs/claude"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-03-02 - globalConfig.chatlogsDir/agent を返す', () => {
        it('T-LIB-RD-03-02: chatlogsDir=undefined, globalConfig="/custom/chatlogs" → "/custom/chatlogs/claude"', () => {
          using _stub = stub(
            globalConfig,
            'get',
            (key: string) => key === 'chatlogsDir' ? '/custom/chatlogs' : undefined,
          );
          const result = resolveChatlogsDir(undefined, 'claude');
          assertEquals(result, '/custom/chatlogs/claude');
        });
      });
    });
  });

  /**
   * `chatlogsDir` が未定義で `period` が指定されている前提条件グループ。
   *
   * `period` が指定されているとき `globalConfig.chatlogsDir/agent/YYYY/YYYY-MM` を返すことを検証する。
   */
  describe('Given: chatlogsDir が未定義で period が "2026-03"', () => {
    /** `resolveChatlogsDir(undefined, "claude", "2026-03")` を呼び出すとき。 */
    describe('When: resolveChatlogsDir(undefined, "claude", "2026-03") を呼び出す', () => {
      /** `"/custom/chatlogs/claude/2026/2026-03"` が返ることを検証する。 */
      describe('Then: T-LIB-RD-03-03 - globalConfig.chatlogsDir/agent/YYYY/YYYY-MM を返す', () => {
        it('T-LIB-RD-03-03: period="2026-03" → "/custom/chatlogs/claude/2026/2026-03" を返す', () => {
          using _stub = stub(
            globalConfig,
            'get',
            (key: string) => key === 'chatlogsDir' ? '/custom/chatlogs' : undefined,
          );
          const result = resolveChatlogsDir(undefined, 'claude', '2026-03');
          assertEquals(result, '/custom/chatlogs/claude/2026/2026-03');
        });
      });
    });
  });

  /**
   * `chatlogsDir` が定義済みで `period` が指定されている前提条件グループ。
   *
   * `chatlogsDir` が設定済みのとき `period` は無視されて `chatlogsDir` をそのまま返す。
   */
  describe('Given: chatlogsDir が "/explicit" で period が "2026-03"', () => {
    /** `resolveChatlogsDir("/explicit", "claude", "2026-03")` を呼び出すとき。 */
    describe('When: resolveChatlogsDir("/explicit", "claude", "2026-03") を呼び出す', () => {
      /** `"/explicit"` が返ることを検証する（period は無視）。 */
      describe('Then: T-LIB-RD-03-04 - "/explicit" が返る（period 無視）', () => {
        it('T-LIB-RD-03-04: chatlogsDir="/explicit", period="2026-03" → "/explicit" を返す', () => {
          const result = resolveChatlogsDir('/explicit', 'claude', '2026-03');
          assertEquals(result, '/explicit');
        });
      });
    });
  });
});
