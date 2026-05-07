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

/** ファイル存在チェックを常に `true` で返すスタブ。テスト環境で `statProvider` として使用する。 */
const _existsStat = (_path: string) => Promise.resolve({ isFile: true } as Deno.FileInfo);

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
    statProvider: _existsStat,
    commandProvider: _NoopCommandProvider as unknown as CommandProvider,
    configFile: 'dummy.yaml',
  });
};

/** 空の ParsedConfig。 */
const _EMPTY_PARSED: ParsedConfig = {};

// ─── Tests

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(parsed, globalConfig, defaults?)` は
 * `ParsedConfig`・`GlobalConfig`・デフォルト値の 3 層から `FilterConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`    : parsed > globalConfig > defaults
 * - `inputDir` : parsed > globalConfig.chatlogDir > defaults
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
          globalConfig = await _makeGlobalConfig('chatlogDir: /some/dir');
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
   * GlobalConfig.chatlogDir がある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: parsed.inputDir が未指定', () => {
    describe('When: GlobalConfig に chatlogDir が設定されている', () => {
      /** GlobalConfig.chatlogDir が使われることを検証する。 */
      describe('Then: T-FL-BC-05 - GlobalConfig の chatlogDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogDir: /global');
        });
        it('T-FL-BC-05: globalConfig.chatlogDir=/global → result.inputDir === /global', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, '/global');
        });
      });
    });

    describe('When: GlobalConfig に chatlogDir が設定されていない', () => {
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
      /** DEFAULT_FILTER_CONFIG.chunkSize が使われることを検証する。 */
      describe('Then: T-FL-BC-11b - DEFAULT_FILTER_CONFIG.chunkSize が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-FL-BC-11b: chunkSize 未設定 → result.chunkSize === DEFAULT_FILTER_CONFIG.chunkSize', () => {
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
      /** DEFAULT_FILTER_CONFIG.concurrency が使われることを検証する。 */
      describe('Then: T-FL-BC-16 - DEFAULT_FILTER_CONFIG.concurrency が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-FL-BC-16: concurrency 未設定 → result.concurrency === DEFAULT_FILTER_CONFIG.concurrency', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.concurrency, DEFAULT_FILTER_CONFIG.concurrency);
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
});
