// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-load.unit.spec.ts
// @(#): phase-load モジュールのユニットテスト
//       対象: phaseLoad
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { phaseLoad } from '../../phase-load.ts';

// ─── Helpers
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { NormalizeConfig } from '../../../types/normalize.types.ts';

// ─── Tests

/**
 * `phaseLoad` のユニットテストスイート。
 *
 * `pendingFiles` の読み込み結果に応じた entries/errors の返却、読み込みエラー時の
 * logger.warn 呼び出し、failFast 設定による throw / 継続動作を検証する。
 *
 * テスト ID 範囲: T-PL-01-01 〜 T-PL-03-01
 *
 * @see phaseLoad
 */
describe('phaseLoad', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = Deno.makeTempDirSync();
  });

  afterEach(() => {
    Deno.removeSync(tempDir, { recursive: true });
  });

  describe('When: 正常系', () => {
    it('[Normal] T-PL-01-01: 全ファイルが正常に読み込めるとき entries に全件・errors が空で返る', async () => {
      // arrange
      const filePathA = normalizePath(`${tempDir}/a.md`);
      const filePathB = normalizePath(`${tempDir}/b.md`);
      await Deno.writeTextFile(filePathA, '---\ntitle: A\n---\n本文A');
      await Deno.writeTextFile(filePathB, '# 見出し\n\n本文B');
      const config: Pick<NormalizeConfig, 'failFast'> = { failFast: false };

      // act
      const result = await phaseLoad([filePathA, filePathB], config, 2);

      // assert
      assertEquals(result.entries.length, 2);
      assertEquals(result.errors.length, 0);
    });
  });

  describe('When: 異常系', () => {
    it('[Error] T-PL-02-01: 不正なYAML frontmatterのファイルを1件含むとき logger.warn が呼ばれ errors に1件含まれる', async () => {
      // arrange
      const badFilePath = normalizePath(`${tempDir}/bad-yaml.md`);
      await Deno.writeTextFile(badFilePath, '---\ntitle: [unclosed\n---\n本文');
      const config: Pick<NormalizeConfig, 'failFast'> = { failFast: false };
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        const result = await phaseLoad([badFilePath], config, 1);

        // assert
        assert(warnStub.calls.length > 0);
        assertEquals(result.errors.length, 1);
        assertEquals(result.errors[0]?.filePath, badFilePath);
      } finally {
        warnStub?.restore();
      }
    });

    it('[Error] T-PL-02-02: config.failFast:true で読み込みエラーが1件でもあると ChatlogError(FailFast) をスローする', async () => {
      // arrange
      const badFilePath = normalizePath(`${tempDir}/bad-yaml.md`);
      await Deno.writeTextFile(badFilePath, '---\ntitle: [unclosed\n---\n本文');
      const config: Pick<NormalizeConfig, 'failFast'> = { failFast: true };

      // act & assert
      const err = await assertRejects(
        () => phaseLoad([badFilePath], config, 1),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'FailFast');
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-PL-03-01: config.failFast:false で読み込みエラーがあってもスローされず正常ファイルは entries に含まれる', async () => {
      // arrange
      const badFilePath = normalizePath(`${tempDir}/bad-yaml.md`);
      const goodFilePath = normalizePath(`${tempDir}/good.md`);
      await Deno.writeTextFile(badFilePath, '---\ntitle: [unclosed\n---\n本文');
      await Deno.writeTextFile(goodFilePath, '# 見出し\n\n本文');
      const config: Pick<NormalizeConfig, 'failFast'> = { failFast: false };

      // act
      const result = await phaseLoad([badFilePath, goodFilePath], config, 2);

      // assert
      assertEquals(result.entries.length, 1);
      assertEquals(result.errors.length, 1);
    });
  });
});
