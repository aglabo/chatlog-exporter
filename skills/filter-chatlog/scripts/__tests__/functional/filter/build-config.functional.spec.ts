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
import { buildConfig } from '../../../filter-chatlog.ts';
// types
import type { FilterConfig, ParsedConfig } from '../../../types/filter.types.ts';

// ─── Helpers
// constants
import { DEFAULT_FILTER_CONFIG } from '../../../constants/filter.constants.ts';
// types
import type { CommandProvider } from '../../../../../_scripts/types/providers.types.ts';
// classes
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';

// ─── Internal Helpers

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
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * 毎回 `GlobalConfig.resetInstance()` でシングルトンをリセットしてから
 * `_NoopCommandProvider` と `_existsStat` を注入して初期化する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト（例: `'agent: chatgpt'`）
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
const _makeGlobalConfig = async (yaml: string): Promise<GlobalConfig> => {
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({
    readTextFileProvider: () => Promise.resolve(yaml),
    commandProvider: _NoopCommandProvider as unknown as CommandProvider,
    configFile: 'dummy.yaml',
  });
};

/** 空の ParsedConfig。 */
const _EMPTY_PARSED: ParsedConfig = {};

/** `DEFAULT_FILTER_CONFIG` と異なる値を持つカスタムデフォルト設定。`defaults` パラメータの注入テストに使用する。 */
const _CUSTOM_DEFAULTS: FilterConfig = {
  ...DEFAULT_FILTER_CONFIG,
  agent: 'chatgpt',
  inputDir: '/custom-default',
};

// ─── Tests

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(parsed, globalConfig, defaults?)` は
 * `ParsedConfig`・`GlobalConfig`・デフォルト値の 3 層から `FilterConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`    : parsed > globalConfig > defaults
 * - `inputDir` : parsed > globalConfig.chatlogsDir > defaults
 * - `dryRun`   : parsed > defaults (false)
 * - `period`   : parsed のみ（GlobalConfig 連携なし）
 * - `configFile` は FilterConfig に存在しないため結果に含まれない
 *
 * - `chunkSize`   : parsed > globalConfig.chunkSize > defaults
 * - `concurrency` : parsed > globalConfig.concurrency > defaults
 *
 * テスト ID 範囲: T-FL-BC-01 〜 T-FL-BC-16
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

  // ─── inputDir 優先順位 ───────────────────────────────────────────────────────

  /**
   * `parsed.inputDir` がセットされている前提条件グループ。
   *
   * `parsed.inputDir` が GlobalConfig/defaults より優先されることを検証する。
   */
  describe('Given: parsed.inputDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `parsed.inputDir` が最優先されることを検証する。 */
      describe('Then: T-FL-BC-04 - parsed.inputDir が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-04: parsed.inputDir=/custom → result.inputDir === /custom', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, inputDir: '/custom' }, globalConfig);
          assertEquals(result.inputDir, '/custom');
        });
      });
    });
  });

  /**
   * `parsed.inputDir` が未指定の前提条件グループ。
   *
   * GlobalConfig.chatlogsDir がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.inputDir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** GlobalConfig.chatlogsDir が使われることを検証する。 */
      describe('Then: T-FL-BC-05 - GlobalConfig の chatlogsDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-05: globalConfig.chatlogsDir=/global → result.inputDir === /global', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, '/global');
        });
      });
    });

    describe('When: GlobalConfig に chatlogsDir が設定されていない', () => {
      /** DEFAULT_FILTER_CONFIG.inputDir が使われることを検証する。 */
      describe('Then: T-FL-BC-06 - DEFAULT_FILTER_CONFIG.inputDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-FL-BC-06: inputDir 未設定 → result.inputDir === DEFAULT_FILTER_CONFIG.inputDir', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, DEFAULT_FILTER_CONFIG.inputDir);
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
      /** GlobalConfig の DEFAULT_VALUES.chunkSize が使われることを検証する。 */
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
      /** GlobalConfig の DEFAULT_VALUES.concurrency が使われることを検証する。 */
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
      /** GlobalConfig の DEFAULT_VALUES.minCharCount が使われることを検証する。 */
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
      /** GlobalConfig の DEFAULT_VALUES.minAssistantChars が使われることを検証する。 */
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

  // ─── chatlogsDir の解決と inputDir へのフォールバック ───────────────────────

  /**
   * `parsed.chatlogsDir` が `inputDir` のフォールバックとして機能し、かつ結果に保持されることを検証するグループ。
   *
   * `parsed.inputDir` が未指定のとき `parsed.chatlogsDir` が `inputDir` に使われる。
   * 同時に `chatlogsDir` も結果に含まれることを検証する。
   * 優先順位: `parsed.inputDir` > `parsed.chatlogsDir` > `globalConfig.chatlogsDir` > `defaults.inputDir`
   */
  describe('Given: parsed.inputDir が未指定で parsed.chatlogsDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `parsed.chatlogsDir` が `inputDir` として使われ、結果に `chatlogsDir` が含まれることを検証する。 */
      describe('Then: T-FL-BC-17 - parsed.chatlogsDir が inputDir に使われ、結果に保持される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-17-01: parsed.chatlogsDir=/base → result.inputDir === /base', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, chatlogsDir: '/base' }, globalConfig);
          assertEquals(result.inputDir, '/base');
        });
        it('T-FL-BC-17-02: parsed.chatlogsDir=/base → result.chatlogsDir === /base', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, chatlogsDir: '/base' }, globalConfig);
          assertEquals(result.chatlogsDir, '/base');
        });
      });
    });
  });

  /**
   * `parsed.inputDir` と `parsed.chatlogsDir` の両方が指定された前提条件グループ。
   *
   * `parsed.inputDir`（`--input`）が `parsed.chatlogsDir`（`--chatlogs-dir`）より優先されることを検証する。
   * `chatlogsDir` は結果にそのまま保持される。
   */
  describe('Given: parsed.inputDir と parsed.chatlogsDir の両方が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `parsed.inputDir` が優先され、`chatlogsDir` も保持されることを検証する。 */
      describe('Then: T-FL-BC-18 - parsed.inputDir が parsed.chatlogsDir より優先され、chatlogsDir は保持される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-FL-BC-18-01: inputDir=/custom, chatlogsDir=/base → result.inputDir === /custom', () => {
          const result = buildConfig(
            { ..._EMPTY_PARSED, inputDir: '/custom', chatlogsDir: '/base' },
            globalConfig,
          );
          assertEquals(result.inputDir, '/custom');
        });
        it('T-FL-BC-18-02: inputDir=/custom, chatlogsDir=/base → result.chatlogsDir === /base', () => {
          const result = buildConfig(
            { ..._EMPTY_PARSED, inputDir: '/custom', chatlogsDir: '/base' },
            globalConfig,
          );
          assertEquals(result.chatlogsDir, '/base');
        });
      });
    });
  });

  /**
   * `parsed.chatlogsDir` が結果に含まれることを検証するグループ。
   *
   * `chatlogsDir` は `FilterConfig` に追加されたため、buildConfig の結果に含まれる。
   */
  describe('Given: parsed.chatlogsDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `chatlogsDir` フィールドが含まれることを検証する。 */
      describe('Then: T-FL-BC-19 - result に chatlogsDir フィールドが含まれる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-FL-BC-19: parsed.chatlogsDir=/base → result.chatlogsDir === /base', () => {
          const result: FilterConfig = buildConfig(
            { ..._EMPTY_PARSED, chatlogsDir: '/base' },
            globalConfig,
          );
          assertEquals(result.chatlogsDir, '/base');
        });
      });
    });
  });

  /**
   * カスタム `defaults` が第3引数として渡されている前提条件グループ。
   *
   * `parsed` も `globalConfig` も値を持たない場合、`defaults` の値が使われることを検証する。
   * これにより `defaults` パラメータがテスト注入用として機能していることを確認する。
   */
  describe('Given: カスタム defaults が渡されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `defaults` の agent・inputDir が parsed・globalConfig より低優先で使われることを検証する。 */
      describe('Then: T-FL-BC-20 - defaults の値がフォールバックとして使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-FL-BC-20-01: parsed.agent 未指定・globalConfig 未設定 → defaults.agent が使われる', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig, _CUSTOM_DEFAULTS);
          assertEquals(result.agent, 'chatgpt');
        });
        it('T-FL-BC-20-02: parsed.inputDir 未指定・globalConfig 未設定 → defaults.inputDir が使われる', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig, _CUSTOM_DEFAULTS);
          assertEquals(result.inputDir, '/custom-default');
        });
      });
    });
  });
});
