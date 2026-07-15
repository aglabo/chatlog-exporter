// src: scripts/modules/__tests__/unit/build-config.unit.spec.ts
// @(#): buildConfig のユニットテスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../setfm-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
import { getProjectRoot } from '../../../../../_scripts/libs/path-utils/dir-utils.ts';
import { joinPath } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_CHATLOGS_DIR, DEFAULT_CONFIG_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';

// ─── Internal Helpers

// functions
/**
 * テスト用 GlobalConfig インスタンスを YAML 文字列から生成する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト
 * @returns 初期化済みの GlobalConfig インスタンス
 */
const _makeGlobalConfig = async (yaml = ''): Promise<GlobalConfig> => {
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({ yaml });
};

/**
 * `DEFAULT_CONFIG_DIR` を基準に相対パスを絶対パスへ解決した期待値を組み立てる。
 * `buildConfig` の dicsDir/promptsDir 解決規則をテスト側で再現する。
 *
 * @param relativePath - `DEFAULT_CONFIG_DIR` からの相対パス（例: `'dics'`）
 * @returns 解決済みの絶対パス文字列
 */
const _resolvedConfigDir = (relativePath: string): string =>
  joinPath(getProjectRoot(), DEFAULT_CONFIG_DIR, relativePath);

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * ParsedConfig・GlobalConfig から完全な SetfmConfig を構築することを検証する。
 *
 * テスト ID 範囲: T-SF-BC-01 〜 T-SF-BC-05
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  let globalConfig: GlobalConfig;

  beforeEach(async () => {
    globalConfig = await _makeGlobalConfig();
  });

  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * `outputDir` 未指定のとき `joinPath(chatlogsDir, 'outputLogs')` が使われることを検証する。
   */
  describe('When: outputDir が未指定', () => {
    it('[Normal] T-SF-BC-01-01: outputDir undefined → joinPath(chatlogsDir, outputLogs) が使われる', () => {
      const result = buildConfig({}, globalConfig);
      assertEquals(result.outputDir, joinPath(DEFAULT_CHATLOGS_DIR, 'outputLogs'));
    });

    it('[Edge] T-SF-BC-01-02: outputDir 空文字列 → joinPath(chatlogsDir, outputLogs) が使われる', () => {
      const result = buildConfig({ outputDir: '' }, globalConfig);
      assertEquals(result.outputDir, joinPath(DEFAULT_CHATLOGS_DIR, 'outputLogs'));
    });

    it('[Normal] T-SF-BC-01-03: GlobalConfig.chatlogsDir=./custom → outputDir=joinPath(./custom, outputLogs)', async () => {
      const gc = await _makeGlobalConfig('chatlogsDir: ./custom');
      const result = buildConfig({}, gc);
      assertEquals(result.outputDir, joinPath('./custom', 'outputLogs'));
    });
  });

  /**
   * `outputDir` が指定されているとき SetfmConfig が正しく構築されることを検証する。
   */
  describe('When: outputDir が指定されている', () => {
    /** デフォルト値が適用される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-02-01: outputDir が設定される', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.outputDir, '/target');
      });

      it('[Normal] T-SF-BC-02-02: dicsDir のデフォルトは .config/chatlog-exporter/dics に解決される', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.dicsDir, _resolvedConfigDir('dics'));
      });

      it('[Normal] T-SF-BC-02-03: dryRun のデフォルトは false', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.dryRun, false);
      });

      it('[Normal] T-SF-BC-02-04: review のデフォルトは true（--review 未指定）', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.review, true);
      });

      it('[Normal] T-SF-BC-02-05: concurrency は GlobalConfig から取得される', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.concurrency, 4);
      });
    });

    /**
     * `outputDir` の絶対パス・相対パス判定テスト。
     *
     * 絶対パスはそのまま使用し、相対パスは chatlogsDir と join する。
     */
    describe('When: outputDir の絶対パス・相対パス判定', () => {
      it('[Normal] T-SF-BC-09-01: 絶対パス指定 → そのまま使われる', () => {
        const result = buildConfig({ outputDir: '/abs/output' }, globalConfig);
        assertEquals(result.outputDir, '/abs/output');
      });

      it('[Normal] T-SF-BC-09-02: 相対パス指定 → joinPath(chatlogsDir, outputDir) が使われる', () => {
        const result = buildConfig({ outputDir: './rel/output' }, globalConfig);
        assertEquals(result.outputDir, joinPath(DEFAULT_CHATLOGS_DIR, './rel/output'));
      });

      it('[Normal] T-SF-BC-09-03: 相対パス + GlobalConfig.chatlogsDir=./custom → joinPath(./custom, outputDir)', async () => {
        const gc = await _makeGlobalConfig('chatlogsDir: ./custom');
        const result = buildConfig({ outputDir: 'myout' }, gc);
        assertEquals(result.outputDir, joinPath('./custom', 'myout'));
      });
    });

    /**
     * `dicsDir` の優先順位テスト。
     *
     * 優先順位: parsed.dicsDir > GlobalConfig.dicsDir > `'dics'`。
     * いずれも相対パスは `.config/<appName>/` 基準の絶対パスに解決される。
     */
    describe('When: dicsDir の優先順位', () => {
      it('[Edge] T-SF-BC-08-01: GlobalConfig に dicsDir 設定済み → GlobalConfig の値が .config/ 基準で解決される', async () => {
        const gc = await _makeGlobalConfig('dicsDir: gc/dics');

        const result = buildConfig({ outputDir: '/target' }, gc);

        assertEquals(result.dicsDir, _resolvedConfigDir('gc/dics'));
      });

      it('[Edge] T-SF-BC-08-02: parsed.dicsDir が GlobalConfig より優先され .config/ 基準で解決される', async () => {
        const gc = await _makeGlobalConfig('dicsDir: gc/dics');

        const result = buildConfig({ outputDir: '/target', dicsDir: 'parsed/dics' }, gc);

        assertEquals(result.dicsDir, _resolvedConfigDir('parsed/dics'));
      });
    });

    /** 各フィールドを明示的に指定したケース。 */
    describe('When: 各フィールドを指定', () => {
      it('[Normal] T-SF-BC-03-01: parsed.dicsDir が使用される', () => {
        const result = buildConfig({ outputDir: '/target', dicsDir: '/custom/dics' }, globalConfig);
        assertEquals(result.dicsDir, '/custom/dics');
      });

      it('[Normal] T-SF-BC-03-02: dryRun=true が設定される', () => {
        const result = buildConfig({ outputDir: '/target', dryRun: true }, globalConfig);
        assertEquals(result.dryRun, true);
      });

      it('[Normal] T-SF-BC-03-03: review=false → result.review=false になる', () => {
        const result = buildConfig({ outputDir: '/target', review: false }, globalConfig);
        assertEquals(result.review, false);
      });
    });
  });

  /**
   * `inputDir`・`agent`・`period`・`chatlogsDir` フィールドのテスト。
   *
   * `inputDir` の実際の解決（`resolveChatlogsDir` によるagent/period絞り込み）は
   * main() 側の責務になったため、buildConfig は `parsed.inputDir` をそのまま通し、
   * agent/period/chatlogsDir を「生の材料」として config に含めるだけになった。
   */
  describe('When: inputDir の設定', () => {
    /** inputDir 未指定 → 空文字列（main() 側で resolveChatlogsDir により解決される）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-07-01: inputDir undefined → 空文字列になる（main() が resolveChatlogsDir で解決する）', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.inputDir, '');
      });

      it('[Normal] T-SF-BC-07-02: parsed.inputDir 指定 → その値がそのまま使われる', () => {
        const result = buildConfig({ inputDir: '/custom/input' }, globalConfig);
        assertEquals(result.inputDir, '/custom/input');
      });
    });
  });

  /**
   * `agent`/`period`/`chatlogsDir` フィールドの解決ロジックテスト。
   *
   * これらは `resolveChatlogsDir` の材料として main() 側で使われる。
   */
  describe('When: agent/period/chatlogsDir の設定', () => {
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-12-01: agent 未指定 + GlobalConfig 未設定 → DEFAULT_AGENT が使われる', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.agent, 'claude');
      });

      it('[Normal] T-SF-BC-12-02: parsed.agent 指定 → その値が使われる', () => {
        const result = buildConfig({ agent: 'chatgpt' }, globalConfig);
        assertEquals(result.agent, 'chatgpt');
      });

      it('[Normal] T-SF-BC-12-03: GlobalConfig.agent=chatgpt → agent=chatgpt が使われる', async () => {
        const gc = await _makeGlobalConfig('agent: chatgpt');
        const result = buildConfig({}, gc);
        assertEquals(result.agent, 'chatgpt');
      });

      it('[Normal] T-SF-BC-12-04: parsed.period 指定 → その値がそのまま設定される', () => {
        const result = buildConfig({ period: '2026-01' }, globalConfig);
        assertEquals(result.period, '2026-01');
      });

      it('[Normal] T-SF-BC-12-05: period 未指定 → undefined になる', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.period, undefined);
      });

      it('[Normal] T-SF-BC-12-06: chatlogsDir 未指定 → GlobalConfig.chatlogsDir が使われる', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.chatlogsDir, DEFAULT_CHATLOGS_DIR);
      });

      it('[Normal] T-SF-BC-12-10: GlobalConfig.chatlogsDir=/custom/chatlogs → その値が使われる', async () => {
        const gc = await _makeGlobalConfig('chatlogsDir: /custom/chatlogs');
        const result = buildConfig({}, gc);
        assertEquals(result.chatlogsDir, '/custom/chatlogs');
      });
    });
  });

  /**
   * `promptsDir` フィールドの優先順位テスト。
   *
   * 優先順位: parsed.promptsDir > GlobalConfig.promptsDir > `'prompts'`。
   * いずれも相対パスは `.config/<appName>/` 基準の絶対パスに解決される。
   */
  describe('When: promptsDir の優先順位', () => {
    /** promptsDir 未指定でデフォルト値が使われる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SFP-01-01: 引数なし + GlobalConfig 未設定 → .config/chatlog-exporter/prompts に解決される', () => {
        const result = buildConfig({ outputDir: '/target' }, globalConfig);
        assertEquals(result.promptsDir, _resolvedConfigDir('prompts'));
      });

      it('[Normal] T-SFP-02-01: parsed.promptsDir 指定 → .config/ 基準で解決される', () => {
        const result = buildConfig({ outputDir: '/target', promptsDir: 'custom/prompts' }, globalConfig);
        assertEquals(result.promptsDir, _resolvedConfigDir('custom/prompts'));
      });
    });

    /** GlobalConfig の値が使われるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SFP-03-01: GlobalConfig に promptsDir 設定済み → GlobalConfig の値が .config/ 基準で解決される', async () => {
        const gc = await _makeGlobalConfig('promptsDir: gc/prompts');

        const result = buildConfig({ outputDir: '/target' }, gc);

        assertEquals(result.promptsDir, _resolvedConfigDir('gc/prompts'));
      });

      it('[Edge] T-SFP-03-02: parsed.promptsDir が GlobalConfig より優先され .config/ 基準で解決される', async () => {
        const gc = await _makeGlobalConfig('promptsDir: gc/prompts');

        const result = buildConfig({ outputDir: '/target', promptsDir: 'parsed/prompts' }, gc);

        assertEquals(result.promptsDir, _resolvedConfigDir('parsed/prompts'));
      });
    });
  });

  /**
   * `cacheDir` フィールドのデフォルト値と CLI 指定値テスト。
   *
   * 優先順位: parsed.cacheDir > joinPath(TEMP環境変数, 'setfm-cache')
   */
  describe('When: cacheDir の設定', () => {
    /** cacheDir 未指定でデフォルト値が使われる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-08-01: cacheDir 未指定 → joinPath(TEMP, setfm-cache) が使われる', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.cacheDir, joinPath(Deno.env.get('TEMP') ?? '.', 'setfm-cache'));
      });

      it('[Normal] T-SF-BC-08-02: parsed.cacheDir 指定 → その値が使われる', () => {
        const result = buildConfig({ cacheDir: '/custom/cache' }, globalConfig);
        assertEquals(result.cacheDir, '/custom/cache');
      });
    });
  });

  /**
   * `maxRetry` の解決ロジックテスト。
   *
   * GlobalConfig.maxRetry を読み取る。未設定時は DEFAULT_MAX_RETRY (2) を使う。
   */
  describe('When: maxRetry の解決', () => {
    /** GlobalConfig に maxRetry が設定されている正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-11-01: globalConfig に maxRetry:3 → buildConfig().maxRetry === 3', async () => {
        const gc = await _makeGlobalConfig('maxRetry: 3');
        const result = buildConfig({}, gc);
        assertEquals(result.maxRetry, 3);
      });

      it('[Normal] T-SF-BC-11-02: globalConfig に maxRetry 未設定 → DEFAULT_MAX_RETRY(2) が使われる', () => {
        const result = buildConfig({}, globalConfig);
        assertEquals(result.maxRetry, 2);
      });
    });
  });

  /**
   * `concurrency` の解決ロジックテスト。
   *
   * 優先順位: parsed.concurrency > GlobalConfig.concurrency
   * clamp: Math.max(1, Math.floor(value)) で 1 未満を防ぐ
   */
  describe('When: concurrency の解決', () => {
    /** 正常系: CLI値とGlobalConfig値の優先順位テスト。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-10-01: parsed.concurrency=4, gc=8 → config.concurrency=4 (CLI wins)', async () => {
        const gc = await _makeGlobalConfig('concurrency: 8');
        const result = buildConfig({ outputDir: '/target', concurrency: 4 }, gc);
        assertEquals(result.concurrency, 4);
      });

      it('[Normal] T-SF-BC-10-02: parsed.concurrency 未指定, gc=8 → config.concurrency=8', async () => {
        const gc = await _makeGlobalConfig('concurrency: 8');
        const result = buildConfig({ outputDir: '/target' }, gc);
        assertEquals(result.concurrency, 8);
      });
    });

    /** 異常系: 0・負数は ChatlogError(InvalidArgs) を throw する。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-BC-10-03: parsed.concurrency=0 → ChatlogError(InvalidArgs)', () => {
        assertThrows(
          () => buildConfig({ outputDir: '/target', concurrency: 0 }, globalConfig),
          ChatlogError,
        );
      });

      it('[Error] T-SF-BC-10-04: parsed.concurrency=-3 → ChatlogError(InvalidArgs)', () => {
        assertThrows(
          () => buildConfig({ outputDir: '/target', concurrency: -3 }, globalConfig),
          ChatlogError,
        );
      });
    });
  });
});
