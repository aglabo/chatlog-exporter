// src: scripts/configs/__tests__/unit/strip-config.unit.spec.ts
// @(#): strip-config.ts のユニットテスト
//       対象: buildConfig (strip)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../../configs/strip-config.ts';
// functions
import { buildConfig as buildNoiseFilterConfig } from '../../../configs/noise-filter-config.ts';
import { buildConfig as buildFilterConfig } from '../../../filter-chatlogs.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';

// ─── Internal Helpers

// constants

/** strip 側にのみ追加したフラグ。DD-04 の非漏洩検証で他スキーマにも渡す。 */
const _RECOVER_FLAG = '--recover-orphans';

/** `buildConfig` を他モードと横断で比較するためのケース表。 */
const _foreignBuilders = [
  { name: 'noise-filter', build: buildNoiseFilterConfig },
  { name: 'filter', build: buildFilterConfig },
] as const;

// ─── Tests

// ─────────────────────────────────────────────────────────────────────────────
// buildConfig (strip)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildConfig`（strip）のユニットステスト。
 *
 * `--recover-orphans` の受理と、その追加が `filter` / `noise-filter` の
 * 引数解析へ漏れないこと（DD-04）を検証する。
 *
 * テスト ID 範囲: T-FL-SEP-02-05
 *
 * @see buildConfig
 */
describe('buildConfig (strip)', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
    // 実在する config.yaml を読み込ませず DEFAULT_CONFIG_VALUES を基準にする
    GlobalConfig.getInstance({ yaml: '' });
  });

  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * strip 固有スキーマの受理動作。
   *
   * `--recover-orphans` は strip 側スキーマにのみ `flag` 型で定義され、
   * 未指定時は `false` に既定化される。
   */
  describe('recoverOrphans フラグ', () => {
    /** フラグの指定・省略が正しく解釈されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-FL-SEP-02-05-01: --recover-orphans 指定で recoverOrphans が true になる', () => {
        assert(buildConfig(['claude', '2026-03', _RECOVER_FLAG]).recoverOrphans);
      });

      it('[Normal] T-FL-SEP-02-05-02: 未指定のとき recoverOrphans が false になる', () => {
        assertFalse(buildConfig(['claude', '2026-03']).recoverOrphans);
      });

      it('[Normal] T-FL-SEP-02-05-03: agent / period / dryRun が共通スキーマ経由で解析される', () => {
        const result = buildConfig(['codex', '2026-03', '--dry-run']);

        assertEquals(result.agent, 'codex');
        assertEquals(result.period, '2026-03');
        assert(result.dryRun);
      });
    });
  });

  /**
   * DD-04: 受理範囲の検査を strip 側に閉じ込め、共通 `parseArgs` を変更しないことの検証。
   *
   * 「既存ケースが引き続き解析できる」ことの確認では不十分である。共通スキーマへ
   * フラグが漏れていてもそれらは通ってしまうため、**他モードが当該フラグを拒否すること**を
   * 直接検証する。
   */
  describe('他モードへの非漏洩 (DD-04)', () => {
    /** strip 固有フラグを他モードへ渡すと未知オプションとして拒否されるケース。 */
    describe('When: 異常系', () => {
      for (const { name, build } of _foreignBuilders) {
        it(`[Error] T-FL-SEP-02-05-04: ${name} は ${_RECOVER_FLAG} を ChatlogError で拒否する`, () => {
          assertThrows(
            () => build([_RECOVER_FLAG]),
            ChatlogError,
            'Invalid Args',
          );
        });
      }
    });
  });
});
