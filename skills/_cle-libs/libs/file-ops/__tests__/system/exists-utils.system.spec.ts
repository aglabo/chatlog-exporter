// src: skills/_cle-libs/libs/file-ops/__tests__/system/exists-utils.system.spec.ts
// @(#): dirExistsSync のシステムテスト（Deno ファイルシステム実使用）
//       対象: dirExistsSync
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { dirExistsSync } from '../../exists-utils.ts';

// ─── Tests

/**
 * `dirExistsSync` のシステムテストスイート。
 *
 * `statProvider` を注入せず、デフォルト実装（`Deno.statSync`）で実ディレクトリの存在を判定することを検証する。
 *
 * テスト ID 範囲: T-LIB-SU-17 〜 T-LIB-SU-18
 *
 * @see dirExistsSync
 */
describe('dirExistsSync', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'exists-utils-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /** デフォルトの statProvider で実在ディレクトリを判定する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-SU-17-01: statProvider 未指定で実在ディレクトリを渡すと true が返る', () => {
      assertEquals(dirExistsSync(tempDir), true);
    });
  });

  /** デフォルトの statProvider で存在しないパスを判定するエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-SU-18-01: statProvider 未指定で存在しないパスを渡すと false が返る', () => {
      assertEquals(dirExistsSync(`${tempDir}/nonexistent`), false);
    });
  });
});
