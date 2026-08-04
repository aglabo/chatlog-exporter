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
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { joinPath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_CACHE_ROOT, DEFAULT_CHATLOGS_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';

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

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * CLI 引数・GlobalConfig から完全な SetfmConfig を構築することを検証する。
 *
 * テスト ID 範囲: T-SF-BC-01 〜 T-SF-BC-15
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  beforeEach(async () => {
    await _makeGlobalConfig();
  });

  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * `outputDir` 未指定のとき `joinPath(chatlogsDir, 'outputLogs')` が使われることを検証する。
   */
  describe('When: outputDir が未指定', () => {
    it('[Normal] T-SF-BC-01-01: outputDir 未指定 → joinPath(chatlogsDir, outputLogs) が使われる', () => {
      const result = buildConfig([]);
      assertEquals(result.outputDir, joinPath(DEFAULT_CHATLOGS_DIR, 'outputLogs'));
    });

    it('[Normal] T-SF-BC-01-03: GlobalConfig.chatlogsDir=./custom → outputDir=joinPath(./custom, outputLogs)', async () => {
      await _makeGlobalConfig('chatlogsDir: ./custom');
      const result = buildConfig([]);
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
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.outputDir, '/target');
      });

      it('[Normal] T-SF-BC-02-02: dicsDir のデフォルトは単純な "dics" になる', () => {
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.dicsDir, 'dics');
      });

      it('[Normal] T-SF-BC-02-03: dryRun のデフォルトは false', () => {
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.dryRun, false);
      });

      it('[Normal] T-SF-BC-02-04: review のデフォルトは true（--review 未指定）', () => {
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.review, true);
      });

      it('[Normal] T-SF-BC-02-05: concurrency は GlobalConfig から取得される', () => {
        const result = buildConfig(['--output-dir', '/target']);
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
        const result = buildConfig(['--output-dir', '/abs/output']);
        assertEquals(result.outputDir, '/abs/output');
      });

      it('[Normal] T-SF-BC-09-02: 相対パス指定 → joinPath(chatlogsDir, outputDir) が使われる', () => {
        const result = buildConfig(['--output-dir', 'rel/output']);
        assertEquals(result.outputDir, joinPath(DEFAULT_CHATLOGS_DIR, 'rel/output'));
      });

      it('[Normal] T-SF-BC-09-03: 相対パス + GlobalConfig.chatlogsDir=./custom → joinPath(./custom, outputDir)', async () => {
        await _makeGlobalConfig('chatlogsDir: ./custom');
        const result = buildConfig(['--output-dir', 'my/out']);
        assertEquals(result.outputDir, joinPath('./custom', 'my/out'));
      });
    });

    /**
     * `dicsDir` の優先順位テスト。
     *
     * 優先順位: CLI `--dics` > GlobalConfig.dicsDir > `'dics'`。
     * パス解決は行わず、値をそのまま透過する。
     */
    describe('When: dicsDir の優先順位', () => {
      it('[Edge] T-SF-BC-08-01: GlobalConfig に dicsDir 設定済み → GlobalConfig の値がそのまま使われる', async () => {
        await _makeGlobalConfig('dicsDir: gc/dics');

        const result = buildConfig(['--output-dir', '/target']);

        assertEquals(result.dicsDir, 'gc/dics');
      });

      it('[Edge] T-SF-BC-08-02: --dics が GlobalConfig より優先され、その値がそのまま使われる', async () => {
        await _makeGlobalConfig('dicsDir: gc/dics');

        const result = buildConfig(['--output-dir', '/target', '--dics', 'parsed/dics']);

        assertEquals(result.dicsDir, 'parsed/dics');
      });
    });

    /** 各フィールドを明示的に指定したケース。 */
    describe('When: 各フィールドを指定', () => {
      it('[Normal] T-SF-BC-03-01: --dics が使用される', () => {
        const result = buildConfig(['--output-dir', '/target', '--dics', '/custom/dics']);
        assertEquals(result.dicsDir, '/custom/dics');
      });

      it('[Normal] T-SF-BC-03-02: --dry-run → result.dryRun=true になる', () => {
        const result = buildConfig(['--output-dir', '/target', '--dry-run']);
        assertEquals(result.dryRun, true);
      });

      it('[Normal] T-SF-BC-03-03: --no-review → result.review=false になる', () => {
        const result = buildConfig(['--output-dir', '/target', '--no-review']);
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
      it('[Normal] T-SF-BC-07-01: inputDir 未指定 → 空文字列になる（main() が resolveChatlogsDir で解決する）', () => {
        const result = buildConfig([]);
        assertEquals(result.inputDir, '');
      });

      it('[Normal] T-SF-BC-07-02: --input-dir 指定 → その値がそのまま使われる', () => {
        const result = buildConfig(['--input-dir', '/custom/input']);
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
        const result = buildConfig([]);
        assertEquals(result.agent, 'claude');
      });

      it('[Normal] T-SF-BC-12-02: agent 位置引数 "chatgpt" → agent=chatgpt が使われる', () => {
        const result = buildConfig(['chatgpt']);
        assertEquals(result.agent, 'chatgpt');
      });

      it('[Normal] T-SF-BC-12-03: GlobalConfig.agent=chatgpt → agent=chatgpt が使われる', async () => {
        await _makeGlobalConfig('agent: chatgpt');
        const result = buildConfig([]);
        assertEquals(result.agent, 'chatgpt');
      });

      it('[Normal] T-SF-BC-12-04: agent/period 位置引数 → period がそのまま設定される', () => {
        const result = buildConfig(['claude', '2026-01']);
        assertEquals(result.period, '2026-01');
      });

      it('[Normal] T-SF-BC-12-05: period 未指定 → undefined になる', () => {
        const result = buildConfig([]);
        assertEquals(result.period, undefined);
      });

      it('[Normal] T-SF-BC-12-06: chatlogsDir 未指定 → GlobalConfig.chatlogsDir が使われる', () => {
        const result = buildConfig([]);
        assertEquals(result.chatlogsDir, DEFAULT_CHATLOGS_DIR);
      });

      it('[Normal] T-SF-BC-12-10: GlobalConfig.chatlogsDir=/custom/chatlogs → その値が使われる', async () => {
        await _makeGlobalConfig('chatlogsDir: /custom/chatlogs');
        const result = buildConfig([]);
        assertEquals(result.chatlogsDir, '/custom/chatlogs');
      });

      it('[Normal] T-SF-BC-13-01: agent 位置引数 "claude" → agent="claude" になる', () => {
        const result = buildConfig(['claude']);
        assertEquals(result.agent, 'claude');
      });
    });

    describe('When: 異常系', () => {
      it('[Error] T-SF-BC-13-02: period 単独の位置引数（agent 省略） → ChatlogError(InvalidArgs)', () => {
        assertThrows(() => buildConfig(['2026-01']), ChatlogError);
      });
    });
  });

  /**
   * `promptsDir` フィールドの優先順位テスト。
   *
   * 優先順位: CLI `--prompts` > GlobalConfig.promptsDir > `'prompts'`。
   * パス解決は行わず、値をそのまま透過する。
   */
  describe('When: promptsDir の優先順位', () => {
    /** promptsDir 未指定でデフォルト値が使われる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SFP-01-01: 引数なし + GlobalConfig 未設定 → デフォルト値 "prompts" になる', () => {
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.promptsDir, 'prompts');
      });

      it('[Normal] T-SFP-02-01: --prompts 指定 → その値がそのまま使われる', () => {
        const result = buildConfig(['--output-dir', '/target', '--prompts', 'custom/prompts']);
        assertEquals(result.promptsDir, 'custom/prompts');
      });
    });

    /** GlobalConfig の値が使われるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SFP-03-01: GlobalConfig に promptsDir 設定済み → GlobalConfig の値がそのまま使われる', async () => {
        await _makeGlobalConfig('promptsDir: gc/prompts');

        const result = buildConfig(['--output-dir', '/target']);

        assertEquals(result.promptsDir, 'gc/prompts');
      });

      it('[Edge] T-SFP-03-02: --prompts が GlobalConfig より優先され、その値がそのまま使われる', async () => {
        await _makeGlobalConfig('promptsDir: gc/prompts');

        const result = buildConfig(['--output-dir', '/target', '--prompts', 'parsed/prompts']);

        assertEquals(result.promptsDir, 'parsed/prompts');
      });
    });
  });

  /**
   * `cacheDir` フィールドのデフォルト値と CLI 指定値テスト。
   *
   * 優先順位: CLI `--cache-dir` > GlobalConfig.cacheDir（DEFAULT_CACHE_ROOT）
   */
  describe('When: cacheDir の設定', () => {
    /** cacheDir 未指定で GlobalConfig のデフォルト値が使われる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-14-01: cacheDir 未指定 → GlobalConfig のデフォルト値（DEFAULT_CACHE_ROOT）が使われる', () => {
        const result = buildConfig([]);
        assertEquals(result.cacheDir, DEFAULT_CACHE_ROOT);
      });

      it('[Normal] T-SF-BC-14-02: --cache-dir 指定 → その値が使われる', () => {
        const result = buildConfig(['--cache-dir', '/custom/cache']);
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
        await _makeGlobalConfig('maxRetry: 3');
        const result = buildConfig([]);
        assertEquals(result.maxRetry, 3);
      });

      it('[Normal] T-SF-BC-11-02: globalConfig に maxRetry 未設定 → DEFAULT_MAX_RETRY(2) が使われる', () => {
        const result = buildConfig([]);
        assertEquals(result.maxRetry, 2);
      });
    });
  });

  /**
   * `concurrency` の解決ロジックテスト。
   *
   * 優先順位: CLI `--concurrency` > GlobalConfig.concurrency
   * 範囲検証（1 以上）はスキーマの `min: 1` に委譲する。
   */
  describe('When: concurrency の解決', () => {
    /** 正常系: CLI値とGlobalConfig値の優先順位テスト。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-10-01: --concurrency 4, gc=8 → config.concurrency=4 (CLI wins)', async () => {
        await _makeGlobalConfig('concurrency: 8');
        const result = buildConfig(['--output-dir', '/target', '--concurrency', '4']);
        assertEquals(result.concurrency, 4);
      });

      it('[Normal] T-SF-BC-10-02: --concurrency 未指定, gc=8 → config.concurrency=8', async () => {
        await _makeGlobalConfig('concurrency: 8');
        const result = buildConfig(['--output-dir', '/target']);
        assertEquals(result.concurrency, 8);
      });

      it('[Normal] T-SF-BC-15-01: --concurrency 1 → config.concurrency=1', () => {
        const result = buildConfig(['--output-dir', '/target', '--concurrency', '1']);
        assertEquals(result.concurrency, 1);
      });
    });

    /** 異常系: 0・負数は ChatlogError(InvalidArgs) を throw する。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-BC-10-03: --concurrency 0 → ChatlogError(InvalidArgs)', () => {
        assertThrows(
          () => buildConfig(['--output-dir', '/target', '--concurrency', '0']),
          ChatlogError,
        );
      });

      it('[Error] T-SF-BC-15-02: --concurrency abc（非数値） → ChatlogError(InvalidArgs)', () => {
        assertThrows(
          () => buildConfig(['--output-dir', '/target', '--concurrency', 'abc']),
          ChatlogError,
        );
      });
    });
  });

  /** 未知オプションを渡したときの異常系。 */
  describe('When: 未知のオプション', () => {
    it('[Error] T-SF-BC-16-01: --unknown → ChatlogError(InvalidArgs)', () => {
      assertThrows(() => buildConfig(['--unknown']), ChatlogError, 'Invalid Args');
    });
  });
});
