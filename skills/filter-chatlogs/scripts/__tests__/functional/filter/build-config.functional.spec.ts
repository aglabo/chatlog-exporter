// src: scripts/__tests__/functional/filter/build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../../filter-chatlogs.ts';
// types
import type { FilterConfig } from '../../../types/filter.types.ts';

// ─── Helpers
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../../../_scripts/constants/config-schema.constants.ts';
import { DEFAULT_FILTER_CONFIG } from '../../../constants/common.constants.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
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

/** `DEFAULT_FILTER_CONFIG` と異なる値を持つカスタムデフォルト設定。`defaults` パラメータの注入テストに使用する。 */
const _CUSTOM_DEFAULTS: FilterConfig = {
  ...DEFAULT_FILTER_CONFIG,
  agent: 'chatgpt',
};

// ─── Tests

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(args, defaults?)` は CLI 引数・GlobalConfig・デフォルト値の 3 層から
 * `FilterConfig` を構築する（内部で共通ライブラリ `parseArgs` が
 * 「CLI > GlobalConfig > defaults」の優先度マージを行う）。
 *
 * ## 優先順位ルール
 * - `agent`      : CLI > GlobalConfig > defaults
 * - `chatlogsDir`: GlobalConfig.chatlogsDir（基準ディレクトリ）
 * - `inputDir`   : CLI の `--input-dir`（指定時のみ設定される）
 * - `dryRun`     : CLI の `--dry-run` > defaults (false)
 * - `period`     : CLI のみ（GlobalConfig 連携なし）
 * - `configFile` は FilterConfig に存在しないため結果に含まれない
 *
 * - `chunkSize` は `_SCHEMA` に `--chunk-size` の CLI オプション定義があり、
 *   CLI > GlobalConfig > defaults の優先順位で検証する。
 * - `concurrency`/`minCharCount`/`minAssistantChars`/`discardThreshold` は
 *   `_SCHEMA` に CLI オプション定義が無いため、GlobalConfig > defaults の優先順位のみ検証する。
 *
 * テスト ID 範囲: T-FL-BC-01 〜 T-FL-BC-40
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  /**
   * CLI 引数で agent が指定されている前提条件グループ。
   *
   * CLI 引数が明示的にエージェントを指定したケースを表す。
   * `globalConfig` に agent が設定されていても CLI 引数が優先されることを検証する。
   */
  describe('Given: CLI 引数で agent が指定されている', () => {
    describe('When: GlobalConfig にも agent が設定されている', () => {
      /** CLI 引数の agent が `globalConfig.agent` より優先されることを検証する。 */
      describe('Then: T-FL-BC-01 - CLI 引数の agent が優先される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('agent: codex');
        });
        it('T-FL-BC-01: args=[chatgpt] → result.agent === chatgpt', () => {
          const result = buildConfig(['chatgpt']);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });
  });

  /**
   * CLI 引数で agent が未指定の前提条件グループ。
   *
   * CLI 引数でエージェントが省略されたケースを表す。
   * GlobalConfig にある場合はその値が、ない場合はデフォルト値が使われることを検証する。
   */
  describe('Given: CLI 引数で agent が未指定', () => {
    describe('When: GlobalConfig に agent が設定されている', () => {
      /** GlobalConfig の agent が使われることを検証する。 */
      describe('Then: T-FL-BC-02 - GlobalConfig の agent が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-FL-BC-02: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig([]);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    describe('When: GlobalConfig にも agent が設定されていない', () => {
      /** DEFAULT_FILTER_CONFIG.agent が使われることを検証する。 */
      describe('Then: T-FL-BC-03 - DEFAULT_FILTER_CONFIG.agent が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chatlogsDir: /some/dir');
        });
        it('T-FL-BC-03: agent 未設定 → result.agent === DEFAULT_FILTER_CONFIG.agent', () => {
          const result = buildConfig([]);
          assertEquals(result.agent, DEFAULT_FILTER_CONFIG.agent);
        });
      });
    });
  });

  // ─── inputDir / chatlogsDir ─────────────────────────────────────────────────

  /**
   * CLI 引数で `--input-dir` が指定されている前提条件グループ。
   *
   * `--input-dir` が結果にそのまま反映されることを検証する。
   */
  describe('Given: CLI 引数で --input-dir が指定されている', () => {
    describe('When: GlobalConfig にも chatlogsDir が設定されている', () => {
      /** `--input-dir` が結果に反映されることを検証する。 */
      describe('Then: T-FL-BC-30 - --input-dir が結果に反映される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-30: args=[--input-dir, /custom] → result.inputDir === /custom', () => {
          const result = buildConfig(['--input-dir', '/custom']);
          assertEquals(result.inputDir, '/custom');
        });
      });
    });
  });

  /**
   * CLI 引数で `--input-dir` が未指定の前提条件グループ。
   *
   * GlobalConfig.chatlogsDir がそのまま `chatlogsDir` として使われることを検証する。
   */
  describe('Given: CLI 引数で --input-dir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** GlobalConfig.chatlogsDir が chatlogsDir に使われることを検証する。 */
      describe('Then: T-FL-BC-31 - GlobalConfig の chatlogsDir が chatlogsDir に使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-FL-BC-31: globalConfig.chatlogsDir=/global → result.chatlogsDir === /global', () => {
          const result = buildConfig([]);
          assertEquals(result.chatlogsDir, '/global');
        });
      });
    });

    describe('When: GlobalConfig にもデフォルトの chatlogsDir のみ設定されている', () => {
      /** DEFAULT_CHATLOGS_DIR が chatlogsDir に使われることを検証する。 */
      describe('Then: T-FL-BC-32 - DEFAULT_CHATLOGS_DIR が chatlogsDir に使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-32: chatlogsDir 未設定 → result.chatlogsDir === DEFAULT_CHATLOGS_DIR', () => {
          const result = buildConfig([]);
          assertEquals(result.chatlogsDir, DEFAULT_FILTER_CONFIG.chatlogsDir);
        });
      });
    });
  });

  // ─── dryRun ─────────────────────────────────────────────────────────────────

  /**
   * CLI 引数で `--dry-run` が指定されている前提条件グループ。
   */
  describe('Given: CLI 引数で --dry-run が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.dryRun === true` になることを検証する。 */
      describe('Then: T-FL-BC-07 - result.dryRun === true', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-07: args=[--dry-run] → result.dryRun === true', () => {
          const result = buildConfig(['--dry-run']);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  /**
   * CLI 引数で `--dry-run` が未指定の前提条件グループ。
   */
  describe('Given: CLI 引数で --dry-run が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** デフォルト値 false が使われることを検証する。 */
      describe('Then: T-FL-BC-08 - result.dryRun === false', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-08: dryRun 未指定 → result.dryRun === false', () => {
          const result = buildConfig([]);
          assertEquals(result.dryRun, false);
        });
      });
    });
  });

  // ─── period (CLI のみ) ───────────────────────────────────────────────────────

  /**
   * CLI 引数で period が結果に反映されることを検証するグループ。
   *
   * period は GlobalConfig と連携しない。
   */
  describe('Given: CLI 引数で period が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` に CLI の period が設定されることを検証する。 */
      describe('Then: T-FL-BC-09 - result.period === CLI の period', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-09: args=[claude, 2026-03] → result.period === 2026-03', () => {
          const result = buildConfig(['claude', '2026-03']);
          assertEquals(result.period, '2026-03');
        });
      });
    });
  });

  describe('Given: CLI 引数で period が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period === undefined` になることを検証する。 */
      describe('Then: T-FL-BC-10 - result.period === undefined', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-10: period 未指定 → result.period === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── chunkSize 優先順位（GlobalConfig 経由。CLI スキーマ未定義） ─────────────

  /**
   * GlobalConfig に chunkSize が設定されている前提条件グループ。
   *
   * `_SCHEMA` に chunkSize の CLI オプション定義が無いため、
   * GlobalConfig の値がそのまま結果に反映されることを検証する。
   */
  describe('Given: GlobalConfig に chunkSize が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の chunkSize が使われることを検証する。 */
      describe('Then: T-FL-BC-12 - GlobalConfig の chunkSize が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chunkSize: 8');
        });
        it('T-FL-BC-12: globalConfig.chunkSize=8 → result.chunkSize === 8', () => {
          const result = buildConfig([]);
          assertEquals(result.chunkSize, 8);
        });
      });
    });
  });

  describe('Given: GlobalConfig にも chunkSize が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.chunkSize が使われることを検証する。 */
      describe('Then: T-FL-BC-11b - GlobalConfig のデフォルト chunkSize が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-11b: chunkSize 未設定 → result.chunkSize === GlobalConfig デフォルト値', () => {
          const result = buildConfig([]);
          assertEquals(result.chunkSize, DEFAULT_FILTER_CONFIG.chunkSize);
        });
      });
    });
  });

  /**
   * CLI 引数 `--chunk-size` と GlobalConfig の chunkSize が両方設定されている前提条件グループ。
   *
   * CLI 引数が GlobalConfig より優先されることを検証する（優先度マージの回帰防止）。
   */
  describe('Given: CLI 引数で --chunk-size が指定されている、GlobalConfig にも chunkSize が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** CLI 引数の --chunk-size が GlobalConfig.chunkSize より優先されることを検証する。 */
      describe('Then: T-FL-BC-33 - CLI 引数の --chunk-size が優先される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chunkSize: 8');
        });
        it('T-FL-BC-33: args=[--chunk-size, 1], globalConfig.chunkSize=8 → result.chunkSize === 1', () => {
          const result = buildConfig(['--chunk-size', '1']);
          assertEquals(result.chunkSize, 1);
        });
      });
    });
  });

  /**
   * CLI 引数 `--chunk-size` に整数以外の値を指定した前提条件グループ。
   */
  describe('Given: CLI 引数の --chunk-size に整数以外の値を指定している', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `ChatlogError('InvalidArgs', 'NotAnInteger', ...)` が throw されることを検証する。 */
      describe('Then: T-FL-BC-34 - ChatlogError(InvalidArgs, NotAnInteger) が throw される', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-34: args=[--chunk-size, abc] → ChatlogError(InvalidArgs, NotAnInteger)', () => {
          assertThrows(
            () => buildConfig(['--chunk-size', 'abc']),
            ChatlogError,
          );
        });
      });
    });
  });

  /**
   * CLI 引数 `--chunk-size=1`（`=` 区切り記法）を指定した前提条件グループ。
   */
  describe('Given: CLI 引数で --chunk-size=1（=区切り記法）が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `=` 区切り記法でも正しく chunkSize に反映されることを検証する。 */
      describe('Then: T-FL-BC-35 - result.chunkSize === 1', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-35: args=[--chunk-size=1] → result.chunkSize === 1', () => {
          const result = buildConfig(['--chunk-size=1']);
          assertEquals(result.chunkSize, 1);
        });
      });
    });
  });

  /**
   * CLI 引数 `--chunk-size` に範囲外の値を指定した前提条件グループ。
   *
   * `chunkSize` は 1〜10 の範囲のみ許容する。範囲外の値は
   * `ChatlogError('InvalidArgs', 'OutOfRange', ...)` を throw する。
   */
  describe('Given: CLI 引数の --chunk-size に範囲外の値を指定している', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-FL-BC-36 - ChatlogError(InvalidArgs, OutOfRange) が throw される', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-36: args=[--chunk-size, 0] → ChatlogError(InvalidArgs, OutOfRange)', () => {
          assertThrows(
            () => buildConfig(['--chunk-size', '0']),
            ChatlogError,
          );
        });

        it('T-FL-BC-37: args=[--chunk-size, -1] → ChatlogError(InvalidArgs, OutOfRange)', () => {
          assertThrows(
            () => buildConfig(['--chunk-size', '-1']),
            ChatlogError,
          );
        });

        it('T-FL-BC-38: args=[--chunk-size, 11] → ChatlogError(InvalidArgs, OutOfRange)', () => {
          assertThrows(
            () => buildConfig(['--chunk-size', '11']),
            ChatlogError,
          );
        });
      });
    });
  });

  // ─── concurrency 優先順位（GlobalConfig 経由） ───────────────────────────────

  describe('Given: GlobalConfig に concurrency が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の concurrency が使われることを検証する。 */
      describe('Then: T-FL-BC-15 - GlobalConfig の concurrency が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('concurrency: 6');
        });
        it('T-FL-BC-15: globalConfig.concurrency=6 → result.concurrency === 6', () => {
          const result = buildConfig([]);
          assertEquals(result.concurrency, 6);
        });
      });
    });
  });

  describe('Given: GlobalConfig にも concurrency が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.concurrency が使われることを検証する。 */
      describe('Then: T-FL-BC-16 - GlobalConfig のデフォルト concurrency が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-16: concurrency 未設定 → result.concurrency === GlobalConfig デフォルト値', () => {
          const result = buildConfig([]);
          assertEquals(result.concurrency, DEFAULT_FILTER_CONFIG.concurrency);
        });
      });
    });
  });

  // ─── minCharCount 優先順位（GlobalConfig 経由） ──────────────────────────────

  describe('Given: GlobalConfig に minCharCount が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の minCharCount が使われることを検証する。 */
      describe('Then: T-FL-BC-22 - GlobalConfig の minCharCount が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('minCharCount: 2000');
        });
        it('T-FL-BC-22: globalConfig.minCharCount=2000 → result.minCharCount === 2000', () => {
          const result = buildConfig([]);
          assertEquals(result.minCharCount, 2000);
        });
      });
    });
  });

  describe('Given: GlobalConfig にも minCharCount が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.minCharCount が使われることを検証する。 */
      describe('Then: T-FL-BC-23 - GlobalConfig のデフォルト minCharCount が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-23: minCharCount 未設定 → result.minCharCount === DEFAULT_FILTER_CONFIG.minCharCount', () => {
          const result = buildConfig([]);
          assertEquals(result.minCharCount, DEFAULT_FILTER_CONFIG.minCharCount);
        });
      });
    });
  });

  // ─── minAssistantChars 優先順位（GlobalConfig 経由） ─────────────────────────

  describe('Given: GlobalConfig に minAssistantChars が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の minAssistantChars が使われることを検証する。 */
      describe('Then: T-FL-BC-25 - GlobalConfig の minAssistantChars が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('minAssistantChars: 600');
        });
        it('T-FL-BC-25: globalConfig.minAssistantChars=600 → result.minAssistantChars === 600', () => {
          const result = buildConfig([]);
          assertEquals(result.minAssistantChars, 600);
        });
      });
    });
  });

  describe('Given: GlobalConfig にも minAssistantChars が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** GlobalConfig の DEFAULT_CONFIG_VALUES.minAssistantChars が使われることを検証する。 */
      describe('Then: T-FL-BC-26 - GlobalConfig のデフォルト minAssistantChars が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-26: minAssistantChars 未設定 → result.minAssistantChars === DEFAULT_FILTER_CONFIG.minAssistantChars', () => {
          const result = buildConfig([]);
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
        beforeEach(async () => {
          await _makeGlobalConfig('discardThreshold: 0.85');
        });
        it('T-FL-BC-27: globalConfig.discardThreshold=0.85 → result.discardThreshold === 0.85', () => {
          const result = buildConfig([]);
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
        beforeEach(async () => {
          await _makeGlobalConfig('discardThreshold: 0.85');
        });
        it('T-FL-BC-28: globalConfig=0.85, defaults=0.6 → result.discardThreshold === 0.85', () => {
          const result = buildConfig([], { ..._CUSTOM_DEFAULTS, discardThreshold: 0.6 });
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
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-29: discardThreshold 未設定 → result.discardThreshold === DEFAULT_FILTER_CONFIG.discardThreshold', () => {
          const result = buildConfig([]);
          assertEquals(result.discardThreshold, DEFAULT_FILTER_CONFIG.discardThreshold);
        });
      });
    });
  });

  // ─── model 優先順位 ─────────────────────────────────────────────────────────

  /**
   * CLI 引数で `--model` が指定されている前提条件グループ。
   *
   * CLI 引数の model が GlobalConfig より優先されることを検証する。
   */
  describe('Given: CLI 引数で --model が指定されている', () => {
    describe('When: GlobalConfig にも model が設定されている', () => {
      /** CLI 引数の model が優先されることを検証する。 */
      describe('Then: T-FL-BC-39 - CLI 引数の model が優先される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('model: haiku');
        });
        it('T-FL-BC-39: args=[--model, opus] → result.model === opus', () => {
          const result = buildConfig(['--model', 'opus']);
          assertEquals(result.model, 'opus');
        });
      });
    });
  });

  /**
   * CLI 引数で `--model` が未指定の前提条件グループ。
   *
   * GlobalConfig の model が使われることを検証する。
   */
  describe('Given: CLI 引数で --model が未指定', () => {
    describe('When: GlobalConfig に model が設定されている', () => {
      /** GlobalConfig の model が使われることを検証する。 */
      describe('Then: T-FL-BC-40 - GlobalConfig の model が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('model: haiku');
        });
        it('T-FL-BC-40: globalConfig.model=haiku → result.model === haiku', () => {
          const result = buildConfig([]);
          assertEquals(result.model, 'haiku');
        });
      });
    });

    describe('When: GlobalConfig にも model が設定されていない', () => {
      /** GlobalConfig のデフォルト model（DEFAULT_CONFIG_VALUES.model）が使われることを検証する。 */
      describe('Then: T-FL-BC-41 - GlobalConfig のデフォルト model が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-41: model 未設定 → result.model === DEFAULT_CONFIG_VALUES.model', () => {
          const result = buildConfig([]);
          assertEquals(result.model, DEFAULT_CONFIG_VALUES.model);
        });
      });
    });
  });

  // ─── singleFile ─────────────────────────────────────────────────────────────

  /**
   * CLI 引数で `--single-file` が指定されている前提条件グループ。
   */
  describe('Given: CLI 引数で --single-file が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result.singleFile === true` になることを検証する。 */
      describe('Then: T-FL-BC-39 - result.singleFile === true', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-39: args=[--single-file] → result.singleFile === true', () => {
          const result = buildConfig(['--single-file']);
          assertEquals(result.singleFile, true);
        });
      });
    });
  });

  /**
   * CLI 引数で `--single-file` が未指定の前提条件グループ。
   */
  describe('Given: CLI 引数で --single-file が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** デフォルト値 false が使われることを検証する。 */
      describe('Then: T-FL-BC-40 - result.singleFile === false', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-40: singleFile 未指定 → result.singleFile === false', () => {
          const result = buildConfig([]);
          assertEquals(result.singleFile, false);
        });
      });
    });
  });

  // ─── configFile が結果に含まれない ───────────────────────────────────────────

  /**
   * CLI 引数で `--config` が指定されている前提条件グループ。
   *
   * `configFile` は `FilterConfig` に存在しないため、buildConfig の結果に含まれてはならない。
   */
  describe('Given: CLI 引数で --config が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `configFile` フィールドが含まれないことを検証する。 */
      describe('Then: T-FL-BC-13 - result に configFile フィールドが含まれない', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance();
        });
        it('T-FL-BC-13: args=[--config, cfg.yaml] → configFile in result === false', () => {
          const result: FilterConfig = buildConfig(['--config', 'cfg.yaml']);
          assertEquals('configFile' in result, false);
        });
      });
    });
  });
});
