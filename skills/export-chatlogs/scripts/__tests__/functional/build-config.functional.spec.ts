// src: scripts/__tests__/functional/export-chatlogs.build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
//       CLI 引数 + GlobalConfig + デフォルト値から ExportConfig を構築するロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { buildConfig } from '../../export-chatlogs.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import {
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_ORIGINAL_LOGS_DIR,
} from '../../../../_scripts/constants/defaults.constants.ts';
import { DEFAULT_EXPORT_CONFIG } from '../../constants/defaults.constants.ts';
// helpers
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';
import { joinPath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

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
    readTextFileProvider: () => yaml,
    configFile: 'dummy.yaml',
  });
}

// ─── buildConfig テストスイート ────────────────────────────────────────────────

/**
 * `buildConfig` 関数の機能テストスイート。
 *
 * `buildConfig(args, defaults?)` は CLI 引数配列を共通 `parseArgs`（CLI > GlobalConfig >
 * defaults の優先度でマージ）に通し、`ExportConfig` を構築する。
 *
 * ## 優先順位ルール
 * - `agent`     : CLI > GlobalConfig > defaults
 * - `exportDir` : CLI(--export-dir) > (GlobalConfig.chatlogsDir > defaults.chatlogsDir) + 'originalLogs'
 *                 （共通スキーマ由来の `--output-dir` は破棄され `exportDir` には影響しない）
 * - `baseDir`   : CLI(--base) のみ（GlobalConfig 連携なし）
 * - `inputDir`  : CLI(--input-dir) のみ（GlobalConfig 連携なし）
 * - `period`    : CLI 位置引数のみ
 *
 * テスト ID 範囲: T-EC-BC-01 〜 T-EC-BC-20
 */
describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  /**
   * CLI で agent が指定されている前提条件グループ。
   *
   * `--agent` 相当の位置引数が明示的にエージェントを指定したケースを表す。
   * `globalConfig` に agent が設定されていても CLI 指定が優先されることを検証する。
   */
  describe('Given: CLI 引数に agent が指定されている', () => {
    /** `globalConfig` にも `agent` が設定されているとき。 */
    describe('When: GlobalConfig にも agent が設定されている', () => {
      /** CLI の agent が `globalConfig.agent` より優先されることを検証する。 */
      describe('Then: T-EC-BC-01 - CLI の agent が優先される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-EC-BC-01-01: args=["codex"] → result.agent === codex', () => {
          const result = buildConfig(['codex']);
          assertEquals(result.agent, 'codex');
        });
      });
    });
  });

  /**
   * CLI で agent が未指定である前提条件グループ。
   *
   * CLI 引数でエージェントが指定されなかったケースを表す。
   * `globalConfig` の agent 設定、さらに未設定の場合はデフォルト値にフォールバックすることを検証する。
   */
  describe('Given: CLI 引数に agent が未指定', () => {
    /** `globalConfig` に `agent` が設定されているとき。 */
    describe('When: GlobalConfig に agent が設定されている', () => {
      /** `globalConfig.agent` が採用されることを検証する。 */
      describe('Then: T-EC-BC-02 - GlobalConfig の agent が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-EC-BC-02-01: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig([]);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    /** `globalConfig` にも `agent` が設定されていないとき。 */
    describe('When: GlobalConfig にも agent が設定されていない', () => {
      /** `DEFAULT_EXPORT_CONFIG.agent` にフォールバックされることを検証する。 */
      describe('Then: T-EC-BC-03 - DEFAULT_EXPORT_CONFIG.agent が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('model: haiku');
        });
        it("T-EC-BC-03-01: agent 未設定 → result.agent === DEFAULT_EXPORT_CONFIG.agent ('claude')", () => {
          const result = buildConfig([]);
          assertEquals(result.agent, DEFAULT_EXPORT_CONFIG.agent);
        });
      });
    });
  });

  // ─── exportDir 優先順位 ─────────────────────────────────────────────────────

  /**
   * CLI で exportDir が指定されている前提条件グループ。
   *
   * CLI 引数 `--export-dir` で出力ディレクトリが明示されたケースを表す。
   * `globalConfig.chatlogsDir` より CLI 指定が優先されることを検証する。
   */
  describe('Given: CLI 引数に --export-dir が指定されている', () => {
    /** `globalConfig` に `chatlogsDir` が設定されているとき。 */
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** CLI の exportDir が `globalConfig.chatlogsDir` より優先されることを検証する。 */
      describe('Then: T-EC-BC-04 - CLI の exportDir が優先される', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chatlogsDir: /global');
        });
        it('T-EC-BC-04-01: args=["--export-dir", "/out"] → result.exportDir === /out', () => {
          const result = buildConfig(['--export-dir', '/out']);
          assertEquals(result.exportDir, '/out');
        });
      });
    });
  });

  /**
   * CLI で exportDir が未指定である前提条件グループ。
   *
   * CLI 引数 `--export-dir` が省略されたケースを表す。
   * `globalConfig.chatlogsDir` が設定されていればそれを基準に `originalLogs` を付加し、
   * なければ `DEFAULT_CHATLOGS_DIR` を基準に `originalLogs` を付加した値にフォールバックすることを検証する。
   */
  describe('Given: CLI 引数に --export-dir が未指定', () => {
    /** `globalConfig` に `chatlogsDir` が設定されているとき。 */
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      /** `globalConfig.chatlogsDir` + `originalLogs` が採用されることを検証する。 */
      describe('Then: T-EC-BC-05 - GlobalConfig の chatlogsDir + originalLogs が使われる', () => {
        beforeEach(async () => {
          await _makeGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it(
          'T-EC-BC-05-01: globalConfig.chatlogsDir=/global/chatlog → result.exportDir === /global/chatlog/originalLogs',
          () => {
            const result = buildConfig([]);
            assertEquals(result.exportDir, joinPath('/global/chatlog', DEFAULT_ORIGINAL_LOGS_DIR));
          },
        );
      });
    });

    /** `globalConfig` のスキーマに `chatlogsDir` が登録されていないとき。 */
    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      /** `DEFAULT_CHATLOGS_DIR` + `originalLogs` にフォールバックされることを検証する。 */
      describe('Then: T-EC-BC-06 - DEFAULT_CHATLOGS_DIR + originalLogs が使われる', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it("T-EC-BC-06-01: exportDir 未設定, chatlogsDir 未登録 → result.exportDir === DEFAULT_CHATLOGS_DIR + '/originalLogs'", () => {
          const result = buildConfig([]);
          assertEquals(result.exportDir, joinPath(DEFAULT_CHATLOGS_DIR, DEFAULT_ORIGINAL_LOGS_DIR));
        });
      });
    });
  });

  /**
   * CLI で --export-dir が指定されている前提条件グループ。
   *
   * `--export-dir` は独立した `exportDir` フィールドにマッピングされる。
   * `--output-dir` を指定しない場合でも `--export-dir` 単独で `exportDir` が反映されることを検証する。
   */
  describe('Given: CLI 引数に --export-dir が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.exportDir` が `--export-dir` の値と一致することを検証する。 */
      describe('Then: T-EC-BC-19 - result.exportDir === CLI の --export-dir', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-19-01: args=["--export-dir", "/foo"] → result.exportDir === /foo', () => {
          const result = buildConfig(['--export-dir', '/foo']);
          assertEquals(result.exportDir, '/foo');
        });
      });
    });
  });

  /**
   * CLI で --output-dir が指定されている前提条件グループ。
   *
   * `--output-dir` は共通スキーマ由来のパースは通るが、export-chatlogs では
   * `exportDir` の算出に一切使用されず破棄されることを検証する。
   */
  describe('Given: CLI 引数に --output-dir が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `--output-dir` の値が `result.exportDir` に反映されないことを検証する。 */
      describe('Then: T-EC-BC-20 - --output-dir は exportDir に影響しない', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-20-01: args=["--output-dir", "/foo"] → result.exportDir !== /foo（chatlogsDir 由来の導出値になる）', () => {
          const result = buildConfig(['--output-dir', '/foo']);
          assertEquals(result.exportDir, joinPath(DEFAULT_CHATLOGS_DIR, DEFAULT_ORIGINAL_LOGS_DIR));
        });
      });
    });
  });

  // ─── baseDir 優先順位 ───────────────────────────────────────────────────────

  /**
   * CLI で baseDir が指定されている前提条件グループ。
   *
   * CLI 引数 `--base` でベースディレクトリが明示されたケースを表す。
   * `baseDir` は `GlobalConfig` 連携がなく CLI の値のみが反映されることを検証する。
   */
  describe('Given: CLI 引数に --base が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.baseDir` が CLI の値と一致することを検証する。 */
      describe('Then: T-EC-BC-07 - result.baseDir === CLI の baseDir', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-07-01: args=["--base", "/data"] → result.baseDir === /data', () => {
          const result = buildConfig(['--base', '/data']);
          assertEquals(result.baseDir, '/data');
        });
      });
    });
  });

  /**
   * CLI で baseDir が未指定である前提条件グループ。
   *
   * CLI 引数 `--base` が省略されたケースを表す。
   * `baseDir` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: CLI 引数に --base が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.baseDir` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-08 - result.baseDir === undefined', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-08-01: baseDir 未指定 → result.baseDir === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.baseDir, undefined);
        });
      });
    });
  });

  // ─── inputDir 優先順位 ──────────────────────────────────────────────────────

  /**
   * CLI で inputDir が指定されている前提条件グループ。
   *
   * CLI 引数 `--input-dir` でパスが指定されたケースを表す。
   * `inputDir` は `GlobalConfig` 連携がなく CLI の値のみが反映されることを検証する。
   */
  describe('Given: CLI 引数に --input-dir が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.inputDir` が CLI の値と一致することを検証する。 */
      describe('Then: T-EC-BC-09 - result.inputDir === CLI の inputDir', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-09-01: args=["--input-dir", "/input"] → result.inputDir === /input', () => {
          const result = buildConfig(['--input-dir', '/input']);
          assertEquals(result.inputDir, '/input');
        });
      });
    });
  });

  /**
   * CLI で inputDir が未指定である前提条件グループ。
   *
   * CLI 引数 `--input-dir` が省略されたケースを表す。
   * `inputDir` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: CLI 引数に --input-dir が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.inputDir` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-10 - result.inputDir === undefined', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-10-01: inputDir 未指定 → result.inputDir === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.inputDir, undefined);
        });
      });
    });
  });

  // ─── period フィールド（CLIのみ） ─────────────────────────────────────────────

  /**
   * CLI で period が指定されている前提条件グループ。
   *
   * CLI 引数で `YYYY-MM` または `YYYY` 形式の期間が指定されたケースを表す。
   * `period` は `GlobalConfig` 連携がなく CLI の値のみが反映されることを検証する。
   */
  describe('Given: CLI 引数に period が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` が CLI の値と一致することを検証する。 */
      describe('Then: T-EC-BC-11 - result.period === CLI の period', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-11-01: args=["claude", "2026-01"] → result.period === 2026-01', () => {
          const result = buildConfig(['claude', '2026-01']);
          assertEquals(result.period, '2026-01');
        });
      });
    });
  });

  /**
   * CLI で period が未指定である前提条件グループ。
   *
   * CLI 引数で期間が指定されなかったケースを表す。
   * `period` は `GlobalConfig` 連携がないため、未指定時は `undefined` になることを検証する。
   */
  describe('Given: CLI 引数に period が未指定', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.period` が `undefined` になることを検証する。 */
      describe('Then: T-EC-BC-12 - result.period === undefined', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-12-01: period 未指定 → result.period === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── defaults 引数 ──────────────────────────────────────────────────────────

  /**
   * `buildConfig` の第 2 引数 `defaults` が省略されている前提条件グループ。
   *
   * 省略時は内部で `DEFAULT_EXPORT_CONFIG` が使われる。
   * `chatlogsDir` も未登録の場合に `DEFAULT_CHATLOGS_DIR` + `originalLogs` にフォールバックすることを検証する。
   */
  describe('Given: defaults 引数が省略されている', () => {
    /** `globalConfig` のスキーマに `chatlogsDir` が登録されていないとき。 */
    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      /** `DEFAULT_CHATLOGS_DIR` + `originalLogs` が採用されることを検証する。 */
      describe('Then: T-EC-BC-13 - DEFAULT_CHATLOGS_DIR + originalLogs が使われる', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it("T-EC-BC-13-01: defaults 省略, chatlogsDir 未登録 → result.exportDir === DEFAULT_CHATLOGS_DIR + '/originalLogs'", () => {
          const result = buildConfig([]);
          assertEquals(result.exportDir, joinPath(DEFAULT_CHATLOGS_DIR, DEFAULT_ORIGINAL_LOGS_DIR));
        });
      });
    });
  });

  // ─── configFile の ExportConfig 混入防止 ─────────────────────────────────────

  /**
   * configFile フィールドが ExportConfig に混入しないことを確認する。
   *
   * `--config` は GlobalConfig 初期化専用フィールドであり、
   * buildConfig の戻り値 ExportConfig には含まれてはならない。
   */
  describe('Given: CLI 引数に --config が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result` に `configFile` フィールドが含まれないことを検証する。 */
      describe('Then: T-EC-BC-15 - result に configFile フィールドが含まれない', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-15-01: --config を含む CLI 引数 → result に configFile が含まれない', () => {
          const result = buildConfig(['claude', '--config', '/path/to/config.yaml']);
          assertEquals((result as unknown as Record<string, unknown>).configFile, undefined);
        });
      });
    });
  });

  // ─── dryRun の引き継ぎ ────────────────────────────────────────────────────────

  /**
   * CLI の `--dry-run` が `result.dryRun` にそのまま引き継がれることを確認する。
   *
   * `--dry-run` は共通スキーマ経由で解析され、`buildConfig` のスプレッドで
   * `ExportConfig` にそのまま反映される。
   */
  describe('Given: CLI 引数に --dry-run が指定されている', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** `result.dryRun` が `true` になることを検証する。 */
      describe('Then: T-EC-BC-16 - result.dryRun === true', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-16-01: args=["claude", "--dry-run"] → result.dryRun === true', () => {
          const result = buildConfig(['claude', '--dry-run']);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  // ─── 異常系: 不正な引数 ────────────────────────────────────────────────────────

  /**
   * 未知のオプション・未知の位置引数に対するエラー仕様の検証。
   * サイレントに無視するのではなく明示的に失敗する設計の確認。
   */
  describe('Given: 不正な CLI 引数', () => {
    /** `buildConfig` を呼び出すとき。 */
    describe('When: buildConfig を呼び出す', () => {
      /** ChatlogError(InvalidArgs) がスローされることを確認する。 */
      describe('Then: T-EC-BC-17/18 - ChatlogError(InvalidArgs) がスローされる', () => {
        beforeEach(async () => {
          resetProjectRoot('/home/user/project');
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-EC-BC-17-01: args=["--unknown"] → ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(() => buildConfig(['--unknown']), ChatlogError, 'Invalid Args');
        });
        it('T-EC-BC-18-01: args=["my-project"] → ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(() => buildConfig(['my-project']), ChatlogError, 'Invalid Args');
        });
        it('T-EC-PA-03-01: args=["2026-03"]（period 単独・agent なし） → ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(() => buildConfig(['2026-03']), ChatlogError, 'Invalid Args');
        });
      });
    });
  });
});
