// src: skills/normalize-chatlogs/scripts/__tests__/unit/build-config.unit.spec.ts
// @(#): buildConfig のユニットテスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../modules/normalize-config.ts';

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * NormalizeParsedConfig にデフォルト値を適用して NormalizeConfig を生成する処理を検証する。
 *
 * テスト ID 範囲: T-NC-BC-01 〜 T-NC-BC-02
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  /** デフォルト値が適用されるケース。 */
  describe('When: 正常系', () => {
    describe('Given: 空の parsed', () => {
      describe('When: buildConfig({}) を呼び出す', () => {
        describe('Then: T-NC-BC-01 - デフォルト値が適用される', () => {
          it('T-NC-BC-01-01: concurrency が 4 になる', () => {
            assertEquals(buildConfig({}).concurrency, 4);
          });
          it('T-NC-BC-01-02: dryRun が false になる', () => {
            assertEquals(buildConfig({}).dryRun, false);
          });
        });
      });
    });

    describe('Given: 値を持つ parsed', () => {
      describe('When: buildConfig(parsed) を呼び出す', () => {
        describe('Then: T-NC-BC-02 - parsed の値が defaults より優先される', () => {
          it('T-NC-BC-02-01: concurrency = 8 が適用される', () => {
            assertEquals(buildConfig({ concurrency: 8 }).concurrency, 8);
          });
          it('T-NC-BC-02-02: dryRun = true が適用される', () => {
            assertEquals(buildConfig({ dryRun: true }).dryRun, true);
          });
        });
      });
    });

    describe('Given: baseDir を含む parsed', () => {
      describe('When: buildConfig(parsed) を呼び出す', () => {
        describe('Then: T-NC-BC-03 - フィールドが適用される', () => {
          it('T-NC-BC-03-01: baseDir = "./base" が適用される', () => {
            assertEquals(buildConfig({ baseDir: './base' }).baseDir, './base');
          });
        });
      });
    });

    describe('Given: 空の parsed', () => {
      describe('When: buildConfig({}) を呼び出す', () => {
        describe('Then: T-NC-BC-04 - normalizeDir のデフォルト値が適用される', () => {
          it('T-NC-BC-04-01: normalizeDir が "temp/normalize_logs" になる', () => {
            assertEquals(buildConfig({}).normalizeDir, 'temp/normalize_logs');
          });
        });
      });
    });
  });
});
