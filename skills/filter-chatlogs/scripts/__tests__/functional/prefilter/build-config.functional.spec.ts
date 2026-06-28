// src: scripts/__tests__/functional/prefilter/build-config.functional.spec.ts
// @(#): prefilter buildConfig の機能テスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../../configs/prefilter-config.ts';
// types
import type { PrefilterConfig, PrefilterParsedConfig } from '../../../types/prefilter.types.ts';

// ─── Helpers
// constants
import { DEFAULT_PREFILTER_CONFIG } from '../../../constants/common.constants.ts';
// classes
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
// helpers
import { resetProjectRoot } from '../../../../../_scripts/libs/path-utils/dir-utils.ts';

// ─── Internal Helpers

/**
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * 毎回 `GlobalConfig.resetInstance()` でシングルトンをリセットしてから
 * `resetProjectRoot` でプロジェクトルートをシードして初期化する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト（例: `'agent: chatgpt'`）
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
const _makeGlobalConfig = async (yaml: string): Promise<GlobalConfig> => {
  resetProjectRoot('/home/user/project');
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({
    readTextFileProvider: () => Promise.resolve(yaml),
    configFile: 'dummy.yaml',
  });
};

/** 空の PrefilterParsedConfig。 */
const _EMPTY_PARSED: PrefilterParsedConfig = {};

/** `DEFAULT_PREFILTER_CONFIG` と異なる値を持つカスタムデフォルト設定。`defaults` パラメータの注入テストに使用する。 */
const _CUSTOM_DEFAULTS: PrefilterConfig = {
  ...DEFAULT_PREFILTER_CONFIG,
  agent: 'chatgpt',
  chatlogsDir: '/custom-default',
};

// ─── Tests

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(parsed, globalConfig, defaults?)` は
 * `PrefilterParsedConfig`・`GlobalConfig`・デフォルト値の 3 層から `PrefilterConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`      : parsed > globalConfig > defaults
 * - `chatlogsDir`: parsed > globalConfig.chatlogsDir > defaults.chatlogsDir
 * - `period`     : parsed のみ（GlobalConfig 連携なし）
 * - `dryRun`     : parsed > defaults (false)
 * - `report`     : parsed > defaults (false)
 * - `configFile` は PrefilterConfig に存在しないため結果に含まれない
 *
 * テスト ID 範囲: T-PF-BC-06 〜 T-PF-BC-16
 *
 * @see buildConfig
 */
describe('buildConfig (prefilter functional)', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  /**
   * `parsed.agent` がセットされている前提条件グループ。
   *
   * CLI 引数が明示的にエージェントを指定したケースを表す。
   * `globalConfig` に agent が設定されていても `parsed.agent` が優先されることを検証する。
   */
  describe('Given: parsed.agent が指定されている', () => {
    describe('When: GlobalConfig にも agent が設定されている', () => {
      /** `parsed.agent` が `globalConfig.agent` より優先されることを検証する。 */
      describe('Then: T-PF-BC-06 - parsed.agent が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: codex');
        });
        it('T-PF-BC-06: parsed.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, agent: 'chatgpt' }, globalConfig);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });
  });

  /**
   * `parsed.agent` が未指定の前提条件グループ。
   *
   * CLI 引数でエージェントが省略されたケースを表す。
   * GlobalConfig にある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.agent が未指定', () => {
    describe('When: GlobalConfig に agent が設定されている', () => {
      /** GlobalConfig の agent が使われることを検証する。 */
      describe('Then: T-PF-BC-07 - GlobalConfig の agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-PF-BC-07: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    describe('When: GlobalConfig にも agent が設定されていない', () => {
      /** DEFAULT_PREFILTER_CONFIG.agent が使われることを検証する。 */
      describe('Then: T-PF-BC-08 - defaults.agent にフォールバック', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /some/dir');
        });
        it('T-PF-BC-08: agent 未設定 → result.agent === DEFAULT_PREFILTER_CONFIG.agent', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, DEFAULT_PREFILTER_CONFIG.agent);
        });
      });
    });
  });

  // ─── chatlogsDir 優先順位 ────────────────────────────────────────────────────

  /**
   * `parsed.chatlogsDir` がセットされている前提条件グループ。
   *
   * `parsed.chatlogsDir` が GlobalConfig/defaults より優先されることを検証する。
   */
  describe('Given: parsed.chatlogsDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `parsed.chatlogsDir` が最優先されることを検証する。 */
      describe('Then: T-PF-BC-09 - parsed.chatlogsDir が最優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-PF-BC-09: parsed.chatlogsDir=/custom → result.chatlogsDir === /custom', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, chatlogsDir: '/custom' }, globalConfig);
          assertEquals(result.chatlogsDir, '/custom');
        });
      });
    });
  });

  /**
   * `parsed.chatlogsDir` が未指定の前提条件グループ。
   *
   * GlobalConfig.chatlogsDir がある場合はその値が chatlogsDir になることを検証する。
   */
  describe('Given: parsed.chatlogsDir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** GlobalConfig.chatlogsDir が chatlogsDir に使われることを検証する。 */
      describe('Then: T-PF-BC-10 - GlobalConfig の chatlogsDir が chatlogsDir になる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-PF-BC-10: globalConfig.chatlogsDir=/global → result.chatlogsDir === /global', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chatlogsDir, '/global');
        });
      });
    });

    describe('When: GlobalConfig にも chatlogsDir が設定されていない', () => {
      /** DEFAULT_PREFILTER_CONFIG.chatlogsDir が使われることを検証する。 */
      describe('Then: T-PF-BC-11 - defaults.chatlogsDir にフォールバック', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: claude');
        });
        it('T-PF-BC-11: chatlogsDir 未設定 → result.chatlogsDir === DEFAULT_PREFILTER_CONFIG.chatlogsDir', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chatlogsDir, DEFAULT_PREFILTER_CONFIG.chatlogsDir);
        });
      });
    });
  });

  // ─── baseDir 優先順位 ─────────────────────────────────────────────────────────

  /**
   * `parsed.baseDir` がセットされている前提条件グループ。
   *
   * `parsed.baseDir` が GlobalConfig.chatlogsDir より優先されることを検証する。
   */
  describe('Given: parsed.baseDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `parsed.baseDir` が最優先されることを検証する。 */
      describe('Then: T-PF-BC-16 - parsed.baseDir が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-PF-BC-16-01: parsed.baseDir=/custom → result.baseDir === /custom', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, baseDir: '/custom' }, globalConfig);
          assertEquals(result.baseDir, '/custom');
        });
      });
    });
  });

  /**
   * `parsed.baseDir` が未指定の前提条件グループ。
   *
   * GlobalConfig.chatlogsDir が baseDir にフォールバックすることを検証する。
   */
  describe('Given: parsed.baseDir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** GlobalConfig.chatlogsDir が baseDir になることを検証する。 */
      describe('Then: T-PF-BC-16-02 - GlobalConfig の chatlogsDir が baseDir になる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-PF-BC-16-02: globalConfig.chatlogsDir=/global → result.baseDir === /global', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.baseDir, '/global');
        });
      });
    });
  });

  // ─── period (parsed のみ) ────────────────────────────────────────────────────

  /**
   * `parsed.period` が結果に反映されることを検証するグループ。
   *
   * period は GlobalConfig と連携しない。
   */
  describe('Given: parsed.period が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` に `parsed.period` が設定されることを検証する。 */
      describe('Then: T-PF-BC-15 - 結果の period に反映される（GlobalConfig 無関係）', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: claude');
        });
        it('T-PF-BC-15: parsed.period=2026-03 → result.period === 2026-03', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, period: '2026-03' }, globalConfig);
          assertEquals(result.period, '2026-03');
        });
      });
    });
  });
});
