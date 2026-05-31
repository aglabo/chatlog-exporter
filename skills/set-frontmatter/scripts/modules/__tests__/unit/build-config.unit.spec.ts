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
    });
  });
});
