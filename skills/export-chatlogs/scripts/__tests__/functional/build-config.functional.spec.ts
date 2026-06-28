// src: scripts/__tests__/functional/export-chatlogs.build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
//       ParsedConfig + GlobalConfig + デフォルト値から ExportConfig を構築するロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { buildConfig } from '../../export-chatlogs.ts';
// classes
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_EXPORT_CONFIG, DEFAULT_OUTPUT_DIR } from '../../constants/defaults.constants.ts';
// types
import type { ParsedConfig } from '../../types/export-config.types.ts';
// helpers
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

/**
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * 毎回 `GlobalConfig.resetInstance()` でシングルトンをリセットしてから
 * `resetProjectRoot` でプロジェクトルートをシードして初期化する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト（例: `'agent: chatgpt'`）
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
async function _makeGlobalConfig(yaml: string): Promise<GlobalConfig> {
  resetProjectRoot('/home/user/project');
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({
    readTextFileProvider: () => Promise.resolve(yaml),
    configFile: 'dummy.yaml',
  });
}

/**
 * 全フィールドが未指定の空の `ParsedConfig`。
 *
 * 各テストで「parsed 側が何も指定されていない」ケースを表すベース値として使用する。
 * スプレッド構文で特定フィールドだけ上書きして部分指定のケースも表現する。
 */
const _EMPTY_PARSED: ParsedConfig = {};

// ─── buildConfig テストスイート ────────────────────────────────────────────────

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(parsed, globalConfig, defaults?)` は
 * `ParsedConfig`・`GlobalConfig`・デフォルト値の 3 層から `ExportConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`     : parsed > globalConfig > defaults
 * - `outputDir` : parsed > globalConfig.chatlogsDir > defaults
 * - `baseDir`   : parsed のみ（GlobalConfig 連携なし）
 * - `inputDir`  : parsed のみ（GlobalConfig 連携なし）
 * - `period`    : parsed のみ
 *
 * テスト ID 範囲: T-EC-BC-01 〜 T-EC-BC-14
 */
describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  /**
   * `parsed.agent` がセットされている前提条件グループ。
   *
   * CLI 引数または呼び出しコードが明示的にエージェントを指定したケースを表す。
   * `globalConfig` に agent が設定されていても `parsed.agent` が優先されることを検証する。
   */
  describe('Given: parsed.agent が指定されている', () => {
    /** `globalConfig` にも `agent` が設定されているとき。 */
    describe('When: GlobalConfig にも agent が設定されている', () => {
      /** `parsed.agent` が `globalConfig.agent` より優先されることを検証する。 */
      describe('Then: T-EC-BC-01 - parsed.agent が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-EC-BC-01-01: parsed.agent=codex → result.agent === codex', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, agent: 'codex' }, globalConfig);
          assertEquals(result.agent, 'codex');
        });
      });
    });
  });

  /**
   * `parsed.agent` が未設定である前提条件グループ。
   *
   * CLI 引数でエージェントが指定されなかったケースを表す。
   * `globalConfig` の agent 設定、さらに未設定の場合はデフォルト値にフォールバックすることを検証する。
   */
  describe('Given: parsed.agent が未指定', () => {
    /** `globalConfig` に `agent` が設定されているとき。 */
    describe('When: GlobalConfig に agent が設定されている', () => {
      /** `globalConfig.agent` が採用されることを検証する。 */
      describe('Then: T-EC-BC-02 - GlobalConfig の agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-EC-BC-02-01: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    /** `globalConfig` にも `agent` が設定されていないとき。 */
    describe('When: GlobalConfig にも agent が設定されていない', () => {
      /** `DEFAULT_EXPORT_CONFIG.agent` にフォールバックされることを検証する。 */
      describe('Then: T-EC-BC-03 - DEFAULT_EXPORT_CONFIG.agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('model: haiku');
        });
        it("T-EC-BC-03-01: agent 未設定 → result.agent === DEFAULT_EXPORT_CONFIG.agent ('claude')", () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, DEFAULT_EXPORT_CONFIG.agent);
        });
      });
    });
  });

  // ─── outputDir 優先順位 ─────────────────────────────────────────────────────

  /**
   * `parsed.outputDir` がセットされている前提条件グループ。
   *
   * CLI 引数 `--output` で出力ディレクトリが明示されたケースを表す。
   * `globalConfig.chatlogsDir` より `parsed.outputDir` が優先されることを検証する。
   */
  describe('Given: parsed.outputDir が指定されている', () => {
    /** `globalConfig` に `chatlogsDir` が設定されているとき。 */
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** `parsed.outputDir` が `globalConfig.chatlogsDir` より優先されることを検証する。 */
      describe('Then: T-EC-BC-04 - parsed.outputDir が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-EC-BC-04-01: parsed.outputDir=/out → result.outputDir === /out', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, outputDir: '/out' }, globalConfig);
          assertEquals(result.outputDir, '/out');
        });
      });
    });
  });

  /**
   * `parsed.outputDir` が未設定である前提条件グループ。
   *
   * CLI 引数 `--output` が省略されたケースを表す。
   * `globalConfig.chatlogsDir` が設定されていればそれを使い、
   * なければ `DEFAULT_OUTPUT_DIR` にフォールバックすることを検証する。
   */
  describe('Given: parsed.outputDir が未指定', () => {
    /** `globalConfig` に `chatlogsDir` が設定されているとき。 */
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** `globalConfig.chatlogsDir` が採用されることを検証する。 */
      describe('Then: T-EC-BC-05 - GlobalConfig の chatlogsDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it('T-EC-BC-05-01: globalConfig.chatlogsDir=/global/chatlog → result.outputDir === /global/chatlog', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.outputDir, '/global/chatlog');
        });
      });
    });

    /** `globalConfig` のスキーマに `chatlogsDir` が登録されていないとき。 */
    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      /** `DEFAULT_OUTPUT_DIR` にフォールバックされることを検証する。 */
      describe('Then: T-EC-BC-06 - DEFAULT_OUTPUT_DIR が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it("T-EC-BC-06-01: outputDir 未設定, chatlogsDir 未登録 → result.outputDir === DEFAULT_OUTPUT_DIR ('./chatlogs')", () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.outputDir, DEFAULT_OUTPUT_DIR);
        });
      });
    });
  });

  // ─── baseDir 優先順位 ───────────────────────────────────────────────────────

  /**
   * `parsed.baseDir` がセットされている前提条件グループ。
   *
   * CLI 引数 `--base` でベースディレクトリが明示されたケースを表す。
   * `baseDir` は `GlobalConfig` 連携がなく `parsed` の値のみが反映されることを検証する。
   */
  describe('Given: parsed.baseDir が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.baseDir` が `parsed.baseDir` と一致することを検証する。 */
      describe('Then: T-EC-BC-07 - result.baseDir === parsed.baseDir', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-07-01: parsed.baseDir=/data → result.baseDir === /data', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, baseDir: '/data' }, globalConfig);
          assertEquals(result.baseDir, '/data');
        });
      });
    });
  });

  /**
   * `parsed.baseDir` が未設定である前提条件グループ。
   *
   * CLI 引数 `--base` が省略されたケースを表す。
   * `baseDir` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: parsed.baseDir が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.baseDir` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-08 - result.baseDir === undefined', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-08-01: baseDir 未指定 → result.baseDir === undefined', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.baseDir, undefined);
        });
      });
    });
  });

  // ─── inputDir 優先順位 ──────────────────────────────────────────────────────

  /**
   * `parsed.inputDir` がセットされている前提条件グループ。
   *
   * CLI 引数 `--input` または位置引数でパスが指定されたケースを表す。
   * `inputDir` は `GlobalConfig` 連携がなく `parsed` の値のみが反映されることを検証する。
   */
  describe('Given: parsed.inputDir が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.inputDir` が `parsed.inputDir` と一致することを検証する。 */
      describe('Then: T-EC-BC-09 - result.inputDir === parsed.inputDir', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-09-01: parsed.inputDir=/input → result.inputDir === /input', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, inputDir: '/input' }, globalConfig);
          assertEquals(result.inputDir, '/input');
        });
      });
    });
  });

  /**
   * `parsed.inputDir` が未設定である前提条件グループ。
   *
   * CLI 引数 `--input` が省略されたケースを表す。
   * `inputDir` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: parsed.inputDir が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.inputDir` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-10 - result.inputDir === undefined', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-10-01: inputDir 未指定 → result.inputDir === undefined', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, undefined);
        });
      });
    });
  });

  // ─── period フィールド（parsedのみ） ─────────────────────────────────────────

  /**
   * `parsed.period` がセットされている前提条件グループ。
   *
   * CLI 引数で `YYYY-MM` または `YYYY` 形式の期間が指定されたケースを表す。
   * `period` は `GlobalConfig` 連携がなく `parsed` の値のみが反映されることを検証する。
   */
  describe('Given: parsed.period が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` が `parsed.period` と一致することを検証する。 */
      describe('Then: T-EC-BC-11 - result.period === parsed.period', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-11-01: parsed.period=2026-01 → result.period === 2026-01', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, period: '2026-01' }, globalConfig);
          assertEquals(result.period, '2026-01');
        });
      });
    });
  });

  /**
   * `parsed.period` が未設定である前提条件グループ。
   *
   * CLI 引数で期間が指定されなかったケースを表す。
   * `period` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: parsed.period が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-12 - result.period === undefined', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-EC-BC-12-01: period 未指定 → result.period === undefined', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── defaults 引数 ──────────────────────────────────────────────────────────

  /**
   * `buildConfig` の第 3 引数 `defaults` が省略されている前提条件グループ。
   *
   * 省略時は内部で `DEFAULT_EXPORT_CONFIG` が使われる。
   * `chatlogsDir` も未登録の場合に `DEFAULT_OUTPUT_DIR` にフォールバックすることを検証する。
   */
  describe('Given: defaults 引数が省略されている', () => {
    /** `globalConfig` のスキーマに `chatlogsDir` が登録されていないとき。 */
    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      /** `DEFAULT_OUTPUT_DIR` が採用されることを検証する。 */
      describe('Then: T-EC-BC-13 - DEFAULT_OUTPUT_DIR が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it("T-EC-BC-13-01: defaults 省略, chatlogsDir 未登録 → result.outputDir === DEFAULT_OUTPUT_DIR ('./chatlogs')", () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.outputDir, DEFAULT_OUTPUT_DIR);
        });
      });
    });
  });

  // ─── configFile の ExportConfig 混入防止 ─────────────────────────────────────

  /**
   * configFile フィールドが ExportConfig に混入しないことを確認する。
   *
   * ParsedConfig の configFile は GlobalConfig 初期化専用フィールドであり、
   * buildConfig の戻り値 ExportConfig には含まれてはならない。
   */
  describe('Given: ParsedConfig に configFile が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `configFile` フィールドが含まれないことを検証する。 */
      describe('Then: T-EC-BC-15 - result に configFile フィールドが含まれない', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-15-01: configFile を含む ParsedConfig → result に configFile が含まれない', () => {
          const _parsed: ParsedConfig = { agent: 'claude', configFile: '/path/to/config.yaml' };
          const result = buildConfig(_parsed, globalConfig);
          assertEquals((result as unknown as Record<string, unknown>).configFile, undefined);
        });
      });
    });
  });
});
