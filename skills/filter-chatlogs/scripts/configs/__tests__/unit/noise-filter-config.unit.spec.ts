// src: scripts/configs/__tests__/unit/noise-filter-config.unit.spec.ts
// @(#): noise-filter-config.ts のユニットテスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../../configs/noise-filter-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';

// ─── Tests

// ─────────────────────────────────────────────────────────────────────────────
// buildConfig
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildConfig` のユニットテストスイート。
 *
 * デフォルト値・agent/period・フラグ/オプション形式・エラーケースを検証する。
 *
 * テスト ID 範囲: T-PF-BC-20 〜 T-PF-BC-33
 *
 * @see buildConfig
 */
describe('buildConfig (noise-filter)', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
    // 実在する config.yaml を読み込ませず DEFAULT_CONFIG_VALUES を基準にする
    GlobalConfig.getInstance({ yaml: '' });
  });

  /** 引数なし・agent/period・フラグ・オプション形式の正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-BC-20-01: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
      assertEquals(buildConfig([]).agent, 'claude');
    });

    it('[Normal] T-PF-BC-20-02: dryRun が false になる', () => {
      assertFalse(buildConfig([]).dryRun);
    });

    it('[Normal] T-PF-BC-20-03: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
      assertEquals(buildConfig([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
    });

    it('[Normal] T-PF-BC-20-04: period が undefined になる', () => {
      assertEquals(buildConfig([]).period, undefined);
    });

    it('[Normal] T-PF-BC-21-01: agent が "codex" になる', () => {
      assertEquals(buildConfig(['codex']).agent, 'codex');
    });

    it('[Normal] T-PF-BC-22-01: agent="claude", period="2026-03" が正しく解析される', () => {
      const result = buildConfig(['claude', '2026-03']);

      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
    });

    it('[Normal] T-PF-BC-23-01: dryRun が true になる', () => {
      assert(buildConfig(['--dry-run']).dryRun);
    });

    it('[Normal] T-PF-BC-24-01: 全フィールドが正しく解析される', () => {
      const result = buildConfig(['codex', '2026-03', '--dry-run', '--input-dir', '/path/to/input']);

      assertEquals(result.agent, 'codex');
      assertEquals(result.period, '2026-03');
      assert(result.dryRun);
      assertEquals(result.inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-BC-25-01: inputDir が "/path/to/input" になる', () => {
      assertEquals(buildConfig(['--input-dir', '/path/to/input']).inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-BC-25-02: --input-dir=value 形式のパース', () => {
      assertEquals(buildConfig(['--input-dir=/path/to/input']).inputDir, '/path/to/input');
    });

    it('[Normal] T-PF-BC-26-01: inputDir が "/path/to/chatlogs" になる', () => {
      assertEquals(buildConfig(['--input-dir', '/path/to/chatlogs']).inputDir, '/path/to/chatlogs');
    });
  });

  /** 未知オプション・不正値のエラーケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-BC-30-01: ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => buildConfig(['--unknown']),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('[Error] T-PF-BC-30-02: --input を渡すと ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => buildConfig(['--input', '/path/to/input']),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('[Error] T-PF-BC-31-01: --input-dir にパスでない値 → ChatlogError がスローされる', () => {
      assertThrows(
        () => buildConfig(['--input-dir', 'notapath']),
        ChatlogError,
      );
    });

    it('[Error] T-PF-BC-32-01: period 単独指定（agent 省略）→ ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => buildConfig(['2026-03']),
        ChatlogError,
      );
    });
  });
});
