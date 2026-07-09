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
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import { resetProjectRoot } from '../../../../../_scripts/libs/path-utils/dir-utils.ts';

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
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  /** 引数なし・agent/period・フラグ・オプション形式の正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-PA-01-01: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
      assertEquals(parseArgs([]).agent, 'claude');
    });

    it('[Normal] T-PF-PA-01-02: dryRun が false になる', () => {
      assertFalse(parseArgs([]).dryRun);
    });

    it('[Normal] T-PF-PA-01-03: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
      assertEquals(parseArgs([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
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
      const result = parseArgs(['codex', '2026-03', '--report', '--input-dir', '/path/to/input']);

      assertEquals(result.agent, 'codex');
      assertEquals(result.period, '2026-03');
      assert(result.report);
      assert(result.dryRun);
      assertEquals(result.inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-PA-14-01: inputDir が "/path/to/input" になる', () => {
      assertEquals(parseArgs(['--input-dir', '/path/to/input']).inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-PA-14-02: --input-dir=value 形式のパース', () => {
      assertEquals(parseArgs(['--input-dir=/path/to/input']).inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-PA-12-01: inputDir が "/path/to/chatlogs" になる', () => {
      assertEquals(parseArgs(['--input-dir', '/path/to/chatlogs']).inputDir, '/path/to/chatlogs');
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

    it('[Error] T-PF-PA-13-01: --input-dir にパスでない値 → ChatlogError がスローされる', () => {
      assertThrows(
        () => parseArgs(['--input-dir', 'notapath']),
        ChatlogError,
      );
    });

    it('[Error] T-PF-PA-03-01: period 単独指定（agent 省略）→ ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['2026-03']),
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
   * 空の GlobalConfig インスタンスを生成する。
   *
   * `GlobalConfig.resetInstance()` でリセットしてから
   * `resetProjectRoot` でプロジェクトルートをシードして初期化する。
   *
   * @returns 初期化済みの `GlobalConfig` インスタンス（空設定）
   */
  const _makeEmptyGlobalConfig = (): GlobalConfig => {
    resetProjectRoot('/home/user/project');
    GlobalConfig.resetInstance();
    return GlobalConfig.getInstance({
      readTextFileProvider: () => '{}',
      configFile: 'dummy.yaml',
      schema: {},
    });
  };

  let globalConfig: GlobalConfig;
  beforeEach(() => {
    globalConfig = _makeEmptyGlobalConfig();
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

    it('[Normal] T-PF-BC-04-01: inputDir が "/chat" になる', () => {
      assertEquals(
        buildConfig({ inputDir: '/chat', dryRun: false, report: false }, globalConfig).inputDir,
        '/chat',
      );
    });
  });
});
