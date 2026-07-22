// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/file-io.unit.spec.ts
// @(#): file-io モジュールのユニットテスト
//       対象: writeOutput, reportResults
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { reportResults, writeOutput } from '../../file-io.ts';

// ─── Helpers
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
// types
import type { Stats } from '../../../types/normalize.types.ts';

// ─── Tests

/**
 * `writeOutput` のユニットテストスイート。
 *
 * Deno.makeTempDir を使ってテンポラリディレクトリにファイルを書き込む実際のファイル操作テスト。
 *
 * テスト ID 範囲: T-WO-01-01 〜 T-WO-03-01
 *
 * @see writeOutput
 */
describe('writeOutput', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'normalize-chatlogs-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /** 正常系: dryRun=false のとき、ファイルが書き込まれ true を返す */
  describe('When: 正常系', () => {
    it('[Normal] T-WO-01-01: ファイルが書き込まれ true が返る', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = '# Test Content\nHello World';

      // act
      const result = await writeOutput(outputPath, content, false);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, content);
      assertEquals(result, true);
    });

    it('[Normal] T-WO-02-01: 既存ファイルが .old-01.md にバックアップされ新ファイルが書かれ true が返る', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);

      // act
      const result = await writeOutput(outputPath, newContent, false);

      // assert
      const backupPath = `${tmpDir}/output.old-01.md`;
      const backupContent = await readTextFile(backupPath);
      const written = await readTextFile(outputPath);
      assertEquals(backupContent, oldContent);
      assertEquals(written, newContent);
      assertEquals(result, true);
    });
  });

  /** 異常系: エラーをスローするケース */
  describe('When: 異常系', () => {
    it('[Error] T-WO-01-02: 出力先ディレクトリが存在しないとき NotFound エラーをスローする', async () => {
      // arrange
      const nestedPath = `${tmpDir}/sub/nested/output.md`;
      const content = '# Nested Content';

      // act & assert
      await assertRejects(
        () => writeOutput(nestedPath, content, false),
        Deno.errors.NotFound,
      );
    });

    it('[Error] T-WO-04-01: バックアップスロット(01〜99)が全て埋まっているとき Error をスローする', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      await Deno.writeTextFile(outputPath, 'existing');
      for (let i = 1; i <= 99; i++) {
        await Deno.writeTextFile(`${tmpDir}/output.old-${String(i).padStart(2, '0')}.md`, '');
      }

      // act & assert
      await assertRejects(
        () => writeOutput(outputPath, 'content', false),
        Error,
        'too many backups',
      );
    });
  });
});

/**
 * `reportResults` のユニットテストスイート。
 *
 * console.log への出力内容を LoggerStub で検証する。
 *
 * テスト ID 範囲: T-14-01-01 〜 T-14-03-01
 *
 * @see reportResults
 */
describe('reportResults', () => {
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
  });

  /** エッジケース: 全カウントが 0 でもスローせず出力する */
  describe('Given: 全カウントが 0 の stats', () => {
    it('[Edge] T-14-02-01: throw せずに stdout に出力される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 0, skip: 0 };

      reportResults(stats);

      assertNotEquals(loggerStub.infoLogs.length, 0);
      assertNotEquals(loggerStub.infoLogs.join(''), '');
    });
  });

  /** 正常系: fail が非ゼロのとき失敗件数を stdout に明示する */
  describe('Given: fail が非ゼロの stats', () => {
    it('[Normal] T-14-03-01: stdout に失敗件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 3, done: 0, error: 0, skip: 0 };

      reportResults(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /fail.*3|3.*fail|失敗.*3|3.*失敗/i);
    });
  });

  /** 正常系: 全5フィールドが出力文字列に含まれる。 */
  describe('Given: 全フィールドが異なる値を持つ stats', () => {
    it('[Normal] T-14-04-01: success/done/skip/fail/error すべてがレポートに含まれる', () => {
      const stats: Stats = { success: 1, fail: 2, done: 3, error: 4, skip: 5 };

      reportResults(stats);

      const output = loggerStub.infoLogs.join('\n');
      assertMatch(output, /success=1/);
      assertMatch(output, /done=3/);
      assertMatch(output, /skip=5/);
      assertMatch(output, /fail=2/);
      assertMatch(output, /error=4/);
    });
  });

  /** エッジケース: error が非ゼロのときエラー件数を stdout に明示する */
  describe('Given: error が非ゼロの stats', () => {
    it('[Edge] T-14-05-01: stdout にエラー件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 2, skip: 0 };

      reportResults(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /error.*2|2.*error/i);
    });
  });
});
