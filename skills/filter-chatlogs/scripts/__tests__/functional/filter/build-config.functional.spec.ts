// src: scripts/__tests__/functional/filter/build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
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
import { buildConfig } from '../../../filter-chatlogs.ts';
// types
import type { FilterConfig, FilterParsedConfig } from '../../../types/filter.types.ts';

// ─── Helpers
// constants
import { DEFAULT_FILTER_CONFIG } from '../../../constants/common.constants.ts';
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
    readTextFileProvider: () => yaml,
    configFile: 'dummy.yaml',
  });
};

/** 空の FilterParsedConfig。 */
const _EMPTY_PARSED: FilterParsedConfig = {};

/** `DEFAULT_FILTER_CONFIG` と異なる値を持つカスタムデフォルト設定。`defaults` パラメータの注入テストに使用する。 */
const _CUSTOM_DEFAULTS: FilterConfig = {
  ...DEFAULT_FILTER_CONFIG,
  agent: 'chatgpt',
};

// ─── Tests

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(parsed, globalConfig, defaults?)` は
 * `FilterParsedConfig`・`GlobalConfig`・デフォルト値の 3 層から `FilterConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`      : parsed > globalConfig > defaults
 * - `chatlogsDir`: globalConfig.chatlogsDir（基準ディレクトリ）
 * - `inputDir`   : parsed.inputDir（指定時のみ設定される）
 * - `dryRun`     : parsed > defaults (false)
 * - `period`     : parsed のみ（GlobalConfig 連携なし）
 * - `configFile` は FilterConfig に存在しないため結果に含まれない
 *
 * - `chunkSize`   : parsed > globalConfig.chunkSize > defaults
 * - `concurrency` : parsed > globalConfig.concurrency > defaults
 *
 * テスト ID 範囲: T-FL-BC-01 〜 T-FL-BC-32
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
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
      describe('Then: T-FL-BC-01 - parsed.agent が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: codex');
        });
        it('T-FL-BC-01: parsed.agent=chatgpt → result.agent === chatgpt', () => {
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
      describe('Then: T-FL-BC-02 - GlobalConfig の agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-FL-BC-02: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    describe('When: GlobalConfig にも agent が設定されていない', () => {
      /** DEFAULT_FILTER_CONFIG.agent が使われることを検証する。 */
      describe('Then: T-FL-BC-03 - DEFAULT_FILTER_CONFIG.agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /some/dir');
        });
        it('T-FL-BC-03: agent 未設定 → result.agent === DEFAULT_FILTER_CONFIG.agent', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, DEFAULT_FILTER_CONFIG.agent);
        });
      });
    });
  });

  // ─── inputDir / chatlogsDir ─────────────────────────────────────────────────

  /**
   * `parsed.inputDir` がセットされている前提条件グループ。
   *
   * `parsed.inputDir` が結果にそのまま反映されることを検証する。
   */
  describe('Given: parsed.inputDir が指定されている', () => {
    describe('When: GlobalConfig にも chatlogsDir が設定されている', () => {
      /** `parsed.inputDir` が結果に反映されることを検証する。 */
      describe('Then: T-FL-BC-30 - parsed.inputDir が結果に反映される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-30: parsed.inputDir=/custom → result.inputDir === /custom', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, inputDir: '/custom' }, globalConfig);
          assertEquals(result.inputDir, '/custom');
        });
      });
    });
  });

  /**
   * `parsed.inputDir` が未指定の前提条件グループ。
   *
   * GlobalConfig.chatlogsDir がそのまま `chatlogsDir` として使われることを検証する。
   */
  describe('Given: parsed.inputDir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** GlobalConfig.chatlogsDir が chatlogsDir に使われることを検証する。 */
      describe('Then: T-FL-BC-31 - GlobalConfig の chatlogsDir が chatlogsDir に使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-31: globalConfig.chatlogsDir=/global → result.chatlogsDir === /global', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chatlogsDir, '/global');
        });
      });
    });

    describe('When: GlobalConfig にもデフォルトの chatlogsDir のみ設定されている', () => {
      /** DEFAULT_CHATLOGS_DIR が chatlogsDir に使われることを検証する。 */
      describe('Then: T-FL-BC-32 - DEFAULT_CHATLOGS_DIR が chatlogsDir に使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-32: chatlogsDir 未設定 → result.chatlogsDir === DEFAULT_CHATLOGS_DIR', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chatlogsDir, DEFAULT_FILTER_CONFIG.chatlogsDir);
        });
      });
    });
  });

  // ─── dryRun ─────────────────────────────────────────────────────────────────

  /**
   * `parsed.dryRun` がセットされている前提条件グループ。
   */
  describe('Given: parsed.dryRun=true が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.dryRun === true` になることを検証する。 */
      describe('Then: T-FL-BC-07 - result.dryRun === true', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-07: parsed.dryRun=true → result.dryRun === true', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, dryRun: true }, globalConfig);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  /**
   * `parsed.dryRun` が未指定の前提条件グループ。
   */
  describe('Given: parsed.dryRun が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** デフォルト値 false が使われることを検証する。 */
      describe('Then: T-FL-BC-08 - result.dryRun === false', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-08: dryRun 未指定 → result.dryRun === false', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.dryRun, false);
        });
      });
    });
  });

  // ─── period (parsed のみ) ────────────────────────────────────────────────────

  /**
   * `parsed.period` の引き継ぎを検証するグループ。
   */
  describe('Given: parsed.period が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` に parsed の値が反映されることを検証する。 */
      describe('Then: T-FL-BC-09 - result.period === parsed.period', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-09: parsed.period=2026-03 → result.period === 2026-03', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, period: '2026-03' }, globalConfig);
          assertEquals(result.period, '2026-03');
        });
      });
    });
  });

  describe('Given: parsed.period が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period === undefined` になることを検証する。 */
      describe('Then: T-FL-BC-10 - result.period === undefined', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-10: period 未指定 → result.period === undefined', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── chunkSize 優先順位 ──────────────────────────────────────────────────────

  /**
   * `parsed.chunkSize` がセットされている前提条件グループ。
   *
   * CLI 引数が明示的に chunkSize を指定したケースを表す。
   * GlobalConfig に chunkSize が設定されていても `parsed.chunkSize` が優先されることを検証する。
   */
  describe('Given: parsed.chunkSize が指定されている', () => {
    describe('When: GlobalConfig にも chunkSize が設定されている', () => {
      /** `parsed.chunkSize` が GlobalConfig より優先されることを検証する。 */
      describe('Then: T-FL-BC-11 - parsed.chunkSize が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chunkSize: 8');
        });
        it('T-FL-BC-11: parsed.chunkSize=5 → result.chunkSize === 5', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, chunkSize: 5 }, globalConfig);
          assertEquals(result.chunkSize, 5);
        });
      });
    });
  });

  /**
   * `parsed.chunkSize` が未指定の前提条件グループ。
   *
   * GlobalConfig に chunkSize がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.chunkSize が未指定', () => {
    describe('When: GlobalConfig に chunkSize が設定されている', () => {
      /** GlobalConfig の chunkSize が使われることを検証する。 */
      describe('Then: T-FL-BC-12 - GlobalConfig の chunkSize が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chunkSize: 8');
        });
        it('T-FL-BC-12: globalConfig.chunkSize=8 → result.chunkSize === 8', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chunkSize, 8);
        });
      });
    });

    describe('When: GlobalConfig にも chunkSize が設定されていない', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.chunkSize が使われることを検証する。 */
      describe('Then: T-FL-BC-11b - GlobalConfig のデフォルト chunkSize が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-11b: chunkSize 未設定 → result.chunkSize === GlobalConfig デフォルト値', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.chunkSize, DEFAULT_FILTER_CONFIG.chunkSize);
        });
      });
    });
  });

  // ─── concurrency 優先順位 ─────────────────────────────────────────────────────

  /**
   * `parsed.concurrency` がセットされている前提条件グループ。
   *
   * CLI 引数が明示的に concurrency を指定したケースを表す。
   * GlobalConfig に concurrency が設定されていても `parsed.concurrency` が優先されることを検証する。
   */
  describe('Given: parsed.concurrency が指定されている', () => {
    describe('When: GlobalConfig にも concurrency が設定されている', () => {
      /** `parsed.concurrency` が GlobalConfig より優先されることを検証する。 */
      describe('Then: T-FL-BC-14 - parsed.concurrency が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('concurrency: 6');
        });
        it('T-FL-BC-14: parsed.concurrency=2 → result.concurrency === 2', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, concurrency: 2 }, globalConfig);
          assertEquals(result.concurrency, 2);
        });
      });
    });
  });

  /**
   * `parsed.concurrency` が未指定の前提条件グループ。
   *
   * GlobalConfig に concurrency がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.concurrency が未指定', () => {
    describe('When: GlobalConfig に concurrency が設定されている', () => {
      /** GlobalConfig の concurrency が使われることを検証する。 */
      describe('Then: T-FL-BC-15 - GlobalConfig の concurrency が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('concurrency: 6');
        });
        it('T-FL-BC-15: globalConfig.concurrency=6 → result.concurrency === 6', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.concurrency, 6);
        });
      });
    });

    describe('When: GlobalConfig にも concurrency が設定されていない', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.concurrency が使われることを検証する。 */
      describe('Then: T-FL-BC-16 - GlobalConfig のデフォルト concurrency が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-16: concurrency 未設定 → result.concurrency === GlobalConfig デフォルト値', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.concurrency, DEFAULT_FILTER_CONFIG.concurrency);
        });
      });
    });
  });

  // ─── minCharCount 優先順位 ───────────────────────────────────────────────────

  /**
   * `parsed.minCharCount` がセットされている前提条件グループ。
   *
   * CLI 引数または呼び出しコードが明示的に minCharCount を指定したケースを表す。
   * GlobalConfig に minCharCount が設定されていても `parsed.minCharCount` が優先されることを検証する。
   */
  describe('Given: parsed.minCharCount が指定されている', () => {
    describe('When: GlobalConfig にも minCharCount が設定されている', () => {
      /** `parsed.minCharCount` が GlobalConfig より優先されることを検証する。 */
      describe('Then: T-FL-BC-21 - parsed.minCharCount が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('minCharCount: 2000');
        });
        it('T-FL-BC-21: parsed.minCharCount=500 → result.minCharCount === 500', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, minCharCount: 500 }, globalConfig);
          assertEquals(result.minCharCount, 500);
        });
      });
    });
  });

  /**
   * `parsed.minCharCount` が未指定の前提条件グループ。
   *
   * GlobalConfig に minCharCount がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.minCharCount が未指定', () => {
    describe('When: GlobalConfig に minCharCount が設定されている', () => {
      /** GlobalConfig の minCharCount が使われることを検証する。 */
      describe('Then: T-FL-BC-22 - GlobalConfig の minCharCount が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('minCharCount: 2000');
        });
        it('T-FL-BC-22: globalConfig.minCharCount=2000 → result.minCharCount === 2000', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.minCharCount, 2000);
        });
      });
    });

    describe('When: GlobalConfig にも minCharCount が設定されていない', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.minCharCount が使われることを検証する。 */
      describe('Then: T-FL-BC-23 - GlobalConfig のデフォルト minCharCount が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-23: minCharCount 未設定 → result.minCharCount === DEFAULT_FILTER_CONFIG.minCharCount', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.minCharCount, DEFAULT_FILTER_CONFIG.minCharCount);
        });
      });
    });
  });

  // ─── minAssistantChars 優先順位 ──────────────────────────────────────────────

  /**
   * `parsed.minAssistantChars` がセットされている前提条件グループ。
   *
   * CLI 引数または呼び出しコードが明示的に minAssistantChars を指定したケースを表す。
   * GlobalConfig に minAssistantChars が設定されていても `parsed.minAssistantChars` が優先されることを検証する。
   */
  describe('Given: parsed.minAssistantChars が指定されている', () => {
    describe('When: GlobalConfig にも minAssistantChars が設定されている', () => {
      /** `parsed.minAssistantChars` が GlobalConfig より優先されることを検証する。 */
      describe('Then: T-FL-BC-24 - parsed.minAssistantChars が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('minAssistantChars: 600');
        });
        it('T-FL-BC-24: parsed.minAssistantChars=100 → result.minAssistantChars === 100', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, minAssistantChars: 100 }, globalConfig);
          assertEquals(result.minAssistantChars, 100);
        });
      });
    });
  });

  /**
   * `parsed.minAssistantChars` が未指定の前提条件グループ。
   *
   * GlobalConfig に minAssistantChars がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.minAssistantChars が未指定', () => {
    describe('When: GlobalConfig に minAssistantChars が設定されている', () => {
      /** GlobalConfig の minAssistantChars が使われることを検証する。 */
      describe('Then: T-FL-BC-25 - GlobalConfig の minAssistantChars が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('minAssistantChars: 600');
        });
        it('T-FL-BC-25: globalConfig.minAssistantChars=600 → result.minAssistantChars === 600', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.minAssistantChars, 600);
        });
      });
    });

    describe('When: GlobalConfig にも minAssistantChars が設定されていない', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.minAssistantChars が使われることを検証する。 */
      describe('Then: T-FL-BC-26 - GlobalConfig のデフォルト minAssistantChars が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-26: minAssistantChars 未設定 → result.minAssistantChars === DEFAULT_FILTER_CONFIG.minAssistantChars', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.minAssistantChars, DEFAULT_FILTER_CONFIG.minAssistantChars);
        });
      });
    });
  });

  // ─── discardThreshold 優先順位 ──────────────────────────────────────────────

  /**
   * GlobalConfig に discardThreshold が設定されている前提条件グループ。
   *
   * config.yaml の discardThreshold が buildConfig の結果に反映されることを検証する。
   */
  describe('Given: GlobalConfig に discardThreshold が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の discardThreshold が使われることを検証する。 */
      describe('Then: T-FL-BC-27 - GlobalConfig の discardThreshold が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('discardThreshold: 0.85');
        });
        it('T-FL-BC-27: globalConfig.discardThreshold=0.85 → result.discardThreshold === 0.85', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.discardThreshold, 0.85);
        });
      });
    });
  });

  /**
   * GlobalConfig に discardThreshold が設定され、defaults にも別の値がある前提条件グループ。
   *
   * GlobalConfig が defaults より優先されることを検証する。
   */
  describe('Given: GlobalConfig に discardThreshold=0.85、defaults に discardThreshold=0.6 が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig が defaults より優先されることを検証する。 */
      describe('Then: T-FL-BC-28 - GlobalConfig が defaults より優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('discardThreshold: 0.85');
        });
        it('T-FL-BC-28: globalConfig=0.85, defaults=0.6 → result.discardThreshold === 0.85', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig, { ..._CUSTOM_DEFAULTS, discardThreshold: 0.6 });
          assertEquals(result.discardThreshold, 0.85);
        });
      });
    });
  });

  /**
   * GlobalConfig に discardThreshold が設定されていない前提条件グループ。
   *
   * defaults の discardThreshold が使われることを検証する。
   */
  describe('Given: GlobalConfig に discardThreshold が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** DEFAULT_FILTER_CONFIG.discardThreshold が使われることを検証する。 */
      describe('Then: T-FL-BC-29 - DEFAULT_FILTER_CONFIG.discardThreshold が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-29: discardThreshold 未設定 → result.discardThreshold === DEFAULT_FILTER_CONFIG.discardThreshold', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.discardThreshold, DEFAULT_FILTER_CONFIG.discardThreshold);
        });
      });
    });
  });

  // ─── configFile が結果に含まれない ───────────────────────────────────────────

  /**
   * `parsed.configFile` が結果に含まれないことを検証するグループ。
   *
   * `configFile` は `FilterConfig` に存在しないため、buildConfig の結果に含まれてはならない。
   */
  describe('Given: parsed.configFile が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `configFile` フィールドが含まれないことを検証する。 */
      describe('Then: T-FL-BC-13 - result に configFile フィールドが含まれない', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-13: parsed.configFile=cfg.yaml → configFile in result === false', () => {
          const result: FilterConfig = buildConfig(
            { ..._EMPTY_PARSED, configFile: 'cfg.yaml' },
            globalConfig,
          );
          assertEquals('configFile' in result, false);
        });
      });
    });
  });

  /**
   * `parsed.inputDir` が結果に含まれることを検証するグループ。
   *
   * `inputDir` は `FilterConfig` に追加されたため、buildConfig の結果に含まれる。
   */
  describe('Given: parsed.inputDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `inputDir` フィールドが含まれることを検証する。 */
      describe('Then: T-FL-BC-19 - result に inputDir フィールドが含まれる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-19: parsed.inputDir=/base → result.inputDir === /base', () => {
          const result: FilterConfig = buildConfig(
            { ..._EMPTY_PARSED, inputDir: '/base' },
            globalConfig,
          );
          assertEquals(result.inputDir, '/base');
        });
      });
    });
  });
});
