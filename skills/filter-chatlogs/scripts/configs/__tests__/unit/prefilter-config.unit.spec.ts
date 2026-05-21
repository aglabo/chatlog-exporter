// src: scripts/configs/__tests__/unit/prefilter-config.unit.spec.ts
// @(#): prefilter-config.ts のユニットテスト
//       対象: parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig, parseArgs } from '../../../configs/prefilter-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
// types
import type { CommandProvider } from '../../../../../_scripts/types/providers.types.ts';

// ─── Tests

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs (prefilter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `parseArgs` のユニットテストスイート。
 *
 * デフォルト値・agent/period/フラグ/オプション形式・エラーケースを検証する。
 *
 * テスト ID 範囲: T-PF-PA-01 〜 T-PF-PA-14
 *
 * @see parseArgs
 */
describe('parseArgs (prefilter)', () => {
  /** 引数なし・agent/period・フラグ・オプション形式の正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-PA-01-01: agent が undefined になる', () => {
      assertEquals(parseArgs([]).agent, undefined);
    });

    it('[Normal] T-PF-PA-01-02: dryRun が false になる', () => {
      assertFalse(parseArgs([]).dryRun);
    });

    it('[Normal] T-PF-PA-01-03: chatlogsDir が undefined になる', () => {
      assertEquals(parseArgs([]).chatlogsDir, undefined);
    });

    it('[Normal] T-PF-PA-01-04: period が undefined になる', () => {
      assertEquals(parseArgs([]).period, undefined);
    });

    it('[Normal] T-PF-PA-01-05: report が false になる', () => {
      assertFalse(parseArgs([]).report);
    });

    it('[Normal] T-PF-PA-02-01: agent が "codex" になる', () => {
      assertEquals(parseArgs(['codex']).agent, 'codex');
    });

    it('[Normal] T-PF-PA-03-01: period が "2026-03" になる', () => {
      assertEquals(parseArgs(['2026-03']).period, '2026-03');
    });

    it('[Normal] T-PF-PA-04-01: agent="claude", period="2026-03" が正しく解析される', () => {
      const result = parseArgs(['claude', '2026-03']);

      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
    });

    it('[Normal] T-PF-PA-05-01: dryRun が true になる', () => {
      assert(parseArgs(['--dry-run']).dryRun);
    });

    it('[Normal] T-PF-PA-05-02: report が false のまま', () => {
      assertFalse(parseArgs(['--dry-run']).report);
    });

    it('[Normal] T-PF-PA-06-01: report が true になる', () => {
      assert(parseArgs(['--report']).report);
    });

    it('[Normal] T-PF-PA-06-02: dryRun が true になる（--report は dryRun も暗示）', () => {
      assert(parseArgs(['--report']).dryRun);
    });

    it('[Normal] T-PF-PA-07-01: report=true、dryRun=true になる', () => {
      const result = parseArgs(['--report', '--dry-run']);

      assert(result.report);
      assert(result.dryRun);
    });

    it('[Normal] T-PF-PA-10-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(['codex', '2026-03', '--report', '--base-dir', '/path/to/base']);

      assertEquals(result.agent, 'codex');
      assertEquals(result.period, '2026-03');
      assert(result.report);
      assert(result.dryRun);
      assertEquals(result.baseDir, '/path/to/base');
    });

    it('[Normal] T-PF-PA-14-01: baseDir が "/path/to/base" になる', () => {
      assertEquals(parseArgs(['--base-dir', '/path/to/base']).baseDir, '/path/to/base');
    });

    it('[Normal] T-PF-PA-14-02: --base-dir=value 形式のパース', () => {
      assertEquals(parseArgs(['--base-dir=/path/to/base']).baseDir, '/path/to/base');
    });

    it('[Normal] T-PF-PA-12-01: chatlogsDir が "/path/to/chatlogs" になる', () => {
      assertEquals(parseArgs(['--chatlogs-dir', '/path/to/chatlogs']).chatlogsDir, '/path/to/chatlogs');
    });
  });

  /** 未知オプション・不正値のエラーケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-PA-11-01: ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['--unknown']),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('[Error] T-PF-PA-11-02: --input を渡すと ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['--input', '/path/to/input']),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('[Error] T-PF-PA-13-01: --chatlogs-dir にパスでない値 → ChatlogError がスローされる', () => {
      assertThrows(
        () => parseArgs(['--chatlogs-dir', 'notapath']),
        ChatlogError,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildConfig
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildConfig` のユニットテストスイート。
 *
 * 空 Args のデフォルト値・agent 指定・フラグ反映・chatlogsDir 指定を検証する。
 *
 * テスト ID 範囲: T-PF-BC-01 〜 T-PF-BC-04
 *
 * @see buildConfig
 */
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

  /** 空 Args・agent/chatlogsDir 指定・フラグ反映の正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-BC-01-01: agent が "claude" になる', () => {
      assertEquals(buildConfig({ dryRun: false, report: false }, globalConfig).agent, 'claude');
    });

    it('[Normal] T-PF-BC-01-02: chatlogsDir が "./chatlogs" になる', () => {
      assertEquals(buildConfig({ dryRun: false, report: false }, globalConfig).chatlogsDir, './chatlogs');
    });

    it('[Normal] T-PF-BC-01-03: dryRun が false になる', () => {
      assertFalse(buildConfig({ dryRun: false, report: false }, globalConfig).dryRun);
    });

    it('[Normal] T-PF-BC-02-01: agent が "codex" になる', () => {
      assertEquals(buildConfig({ agent: 'codex', dryRun: false, report: false }, globalConfig).agent, 'codex');
    });

    it('[Normal] T-PF-BC-03-01: dryRun が true になる', () => {
      assert(buildConfig({ dryRun: true, report: true }, globalConfig).dryRun);
    });

    it('[Normal] T-PF-BC-03-02: report が true になる', () => {
      assert(buildConfig({ dryRun: true, report: true }, globalConfig).report);
    });

    it('[Normal] T-PF-BC-04-01: chatlogsDir が "/chat" になる', () => {
      assertEquals(
        buildConfig({ chatlogsDir: '/chat', dryRun: false, report: false }, globalConfig).chatlogsDir,
        '/chat',
      );
    });
  });
});
