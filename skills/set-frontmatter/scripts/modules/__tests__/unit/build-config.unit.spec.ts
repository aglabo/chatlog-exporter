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
// constants
import { DEFAULT_CHUNK_SIZE, DEFAULT_PROMPTS_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';

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
   * `targetDir` 未指定のとき `ChatlogError(InvalidArgs, NotSpecified)` がスローされることを検証する。
   */
  describe('When: targetDir が未指定', () => {
    it('[Error] T-SF-BC-01-01: targetDir undefined → ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => buildConfig({}, globalConfig),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('[Error] T-SF-BC-01-02: targetDir 空文字列 → ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => buildConfig({ targetDir: '' }, globalConfig),
        ChatlogError,
        'Invalid Args',
      );
    });
  });

  /**
   * `targetDir` が指定されているとき SetfmConfig が正しく構築されることを検証する。
   */
  describe('When: targetDir が指定されている', () => {
    /** デフォルト値が適用される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-BC-02-01: targetDir が設定される', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.targetDir, '/target');
      });

      it('[Normal] T-SF-BC-02-02: dicsDir のデフォルトは ./assets/dics', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.dicsDir, './assets/dics');
      });

      it('[Normal] T-SF-BC-02-03: dryRun のデフォルトは false', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.dryRun, false);
      });

      it('[Normal] T-SF-BC-02-04: review のデフォルトは true（--review 未指定）', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.review, true);
      });

      it('[Normal] T-SF-BC-02-05: concurrency は GlobalConfig から取得される', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.concurrency, 4);
      });

      it('[Normal] T-SF-BC-06-01: chunkSize のデフォルトは 10', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.chunkSize, DEFAULT_CHUNK_SIZE);
      });
    });

    /** 各フィールドを明示的に指定したケース。 */
    describe('When: 各フィールドを指定', () => {
      it('[Normal] T-SF-BC-03-01: parsed.dicsDir が使用される', () => {
        const result = buildConfig({ targetDir: '/target', dicsDir: '/custom/dics' }, globalConfig);
        assertEquals(result.dicsDir, '/custom/dics');
      });

      it('[Normal] T-SF-BC-03-02: dryRun=true が設定される', () => {
        const result = buildConfig({ targetDir: '/target', dryRun: true }, globalConfig);
        assertEquals(result.dryRun, true);
      });

      it('[Normal] T-SF-BC-03-03: review=false → result.review=false になる', () => {
        const result = buildConfig({ targetDir: '/target', review: false }, globalConfig);
        assertEquals(result.review, false);
      });

      it('[Normal] T-SF-BC-06-02: parsed.chunkSize=5 → result.chunkSize=5 になる', () => {
        const result = buildConfig({ targetDir: '/target', chunkSize: 5 }, globalConfig);
        assertEquals(result.chunkSize, 5);
      });
    });
  });

  /**
   * `promptsDir` フィールドの優先順位テスト。
   *
   * 優先順位: parsed.promptsDir > GlobalConfig.promptsDir > DEFAULT_PROMPTS_DIR
   */
  describe('When: promptsDir の優先順位', () => {
    /** promptsDir 未指定でデフォルト値が使われる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SFP-01-01: 引数なし + GlobalConfig 未設定 → DEFAULT_PROMPTS_DIR が使われる', () => {
        const result = buildConfig({ targetDir: '/target' }, globalConfig);
        assertEquals(result.promptsDir, DEFAULT_PROMPTS_DIR);
      });

      it('[Normal] T-SFP-02-01: parsed.promptsDir 指定 → その値が使われる', () => {
        const result = buildConfig({ targetDir: '/target', promptsDir: './custom/prompts' }, globalConfig);
        assertEquals(result.promptsDir, './custom/prompts');
      });
    });

    /** GlobalConfig の値が使われるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SFP-03-01: GlobalConfig に promptsDir 設定済み → GlobalConfig の値が使われる', async () => {
        const gc = await _makeGlobalConfig('promptsDir: ./gc/prompts');

        const result = buildConfig({ targetDir: '/target' }, gc);

        assertEquals(result.promptsDir, './gc/prompts');
      });

      it('[Edge] T-SFP-03-02: parsed.promptsDir が GlobalConfig より優先される', async () => {
        const gc = await _makeGlobalConfig('promptsDir: ./gc/prompts');

        const result = buildConfig({ targetDir: '/target', promptsDir: './parsed/prompts' }, gc);

        assertEquals(result.promptsDir, './parsed/prompts');
      });
    });
  });
});
