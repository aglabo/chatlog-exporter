// src: skills/_cle-libs/libs/file-io/__tests__/unit/write-utils.unit.spec.ts
// @(#): file-io モジュールのユニットテスト
//       対象: writeTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { writeTextFile } from '../../write-utils.ts';

// ─── Helpers
import { fileExists } from '../../../file-ops/exists-utils.ts';
import { readTextFile } from '../../read-utils.ts';
// types
import type { BackupProvider } from '../../../../types/providers.types.ts';

// ─── Internal Helpers

// types

/** `_makeBackupSpy` が返す、呼び出し履歴付き `BackupProvider` の組。 */
type _BackupSpy = {
  /** `provider` が呼ばれたときの引数パスを呼び出し順に記録する配列。 */
  calls: string[];
  /** テスト対象に注入する `BackupProvider`。 */
  provider: BackupProvider;
};

// functions

/**
 * 呼び出し履歴を記録する `BackupProvider` のスパイを生成する。
 *
 * 実際の退避は行わず、`result` をそのまま解決値として返す。
 * 退避の呼び出し有無・回数・引数を検証する用途に使う。
 *
 * @param result - `provider` が解決する退避先パス（退避しない場合は `null`）
 * @returns 呼び出し履歴 `calls` と `provider` を持つオブジェクト
 */
const _makeBackupSpy = (result: string | null): _BackupSpy => {
  const calls: string[] = [];
  return {
    calls,
    provider: (path: string) => {
      calls.push(path);
      return Promise.resolve(result);
    },
  };
};

// ─── Tests

/**
 * `writeTextFile` のユニットテストスイート。
 *
 * Deno.makeTempDir を使ってテンポラリディレクトリにファイルを書き込む実際のファイル操作テスト。
 *
 * テスト ID 範囲: T-WO-01-01 〜 T-WO-03-03, T-LIB-WTF-01-01 〜 T-LIB-WTF-04-01
 * （T-LIB-WTF-03-03 / 03-04 は失敗経路での `.tmp` 残置がないことを検証する）
 *
 * @see writeTextFile
 */
describe('writeTextFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'normalize-chatlogs-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /** 正常系: ファイルが書き込まれる */
  describe('When: 正常系', () => {
    it('[Normal] T-WO-01-01: ファイルが書き込まれる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = '# Test Content\nHello World';

      // act
      await writeTextFile(outputPath, content);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, content);
    });

    it('[Normal] T-WO-03-01: 既存ファイルはバックアップされず上書きされる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);

      // act
      await writeTextFile(outputPath, newContent);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, newContent);
      await assertRejects(() => Deno.stat(`${tmpDir}/output.old-01.md`), Deno.errors.NotFound);
    });

    it('[Normal] T-WO-03-02: rename が AlreadyExists で失敗しても既存ファイルを削除して上書きされる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);

      const origRename = Deno.rename.bind(Deno);
      let renameCallCount = 0;
      const renameStub = stub(Deno, 'rename', (from, to) => {
        renameCallCount++;
        if (renameCallCount === 1) {
          return Promise.reject(new Deno.errors.AlreadyExists('exists'));
        }
        return origRename(from, to);
      });

      try {
        // act
        await writeTextFile(outputPath, newContent);
      } finally {
        renameStub.restore();
      }

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, newContent);
      await assertRejects(() => Deno.stat(`${outputPath}.tmp`), Deno.errors.NotFound);
    });

    it('[Normal] T-LIB-WTF-01-01: BackupProvider が null を返す → 退避時点で tmp が実在し、原本が新内容に置換され tmp が残らない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, 'old content');
      const tmpExistsAtBackup: boolean[] = [];
      const backup: BackupProvider = async (path) => {
        tmpExistsAtBackup.push(await fileExists(`${path}.tmp`));
        return null;
      };

      // act
      await writeTextFile(outputPath, newContent, backup);

      // assert
      assertEquals(tmpExistsAtBackup, [true]);
      assertEquals(await readTextFile(outputPath), newContent);
      assertEquals(await fileExists(`${outputPath}.tmp`), false);
    });

    it('[Normal] T-LIB-WTF-01-03: BackupProvider が退避パスを返す → 戻り値がその退避パスと一致する', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const backupPath = `${tmpDir}/output.bak`;
      const spy = _makeBackupSpy(backupPath);

      // act
      const result = await writeTextFile(outputPath, 'new content', spy.provider);

      // assert
      assertEquals(result, backupPath);
      assertEquals(spy.calls, [outputPath]);
    });

    it('[Normal] T-LIB-WTF-01-02: 退避は最終リネームより先に呼ばれる → timeline が backup, rename の順になる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const timeline: string[] = [];
      const backup: BackupProvider = (_path) => {
        timeline.push('backup');
        return Promise.resolve(null);
      };

      const origRename = Deno.rename.bind(Deno);
      const renameStub = stub(Deno, 'rename', (from, to) => {
        timeline.push('rename');
        return origRename(from, to);
      });

      try {
        // act
        await writeTextFile(outputPath, 'new content', backup);
      } finally {
        renameStub.restore();
      }

      // assert
      assertEquals(timeline, ['backup', 'rename']);
    });

    it('[Normal] T-LIB-WTF-02-01: 第3引数を省略 → 内容が書き込まれ退避ファイルが作成されない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, 'old content');

      // act
      await writeTextFile(outputPath, newContent);

      // assert
      assertEquals(await readTextFile(outputPath), newContent);
      assertEquals(await fileExists(`${outputPath}.bak`), false);
    });

    it('[Normal] T-LIB-WTF-02-02: 第3引数を省略 → 戻り値が null', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;

      // act
      const result = await writeTextFile(outputPath, 'new content');

      // assert
      assertEquals(result, null);
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
        () => writeTextFile(nestedPath, content),
        Deno.errors.NotFound,
      );
    });

    it('[Error] T-WO-03-03: rename が AlreadyExists 以外で失敗した場合はそのままエラーが伝播する', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = 'content';
      const renameStub = stub(Deno, 'rename', () => Promise.reject(new Deno.errors.PermissionDenied('denied')));

      try {
        // act & assert
        await assertRejects(
          () => writeTextFile(outputPath, content),
          Deno.errors.PermissionDenied,
        );
      } finally {
        renameStub.restore();
      }
    });

    it('[Error] T-LIB-WTF-03-01: BackupProvider が例外をスロー → 例外が伝播し元ファイルの内容が変化せず tmp も残らない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      await Deno.writeTextFile(outputPath, oldContent);
      const backup: BackupProvider = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));

      // act & assert
      await assertRejects(
        () => writeTextFile(outputPath, 'new content', backup),
        Deno.errors.PermissionDenied,
      );
      assertEquals(await readTextFile(outputPath), oldContent);
      assertEquals(await fileExists(`${outputPath}.tmp`), false);
    });

    it('[Error] T-LIB-WTF-03-03: BackupProvider が例外をスロー → 一時ファイルが残置されない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      await Deno.writeTextFile(outputPath, 'old content');
      const backup: BackupProvider = () => Promise.reject(new Deno.errors.PermissionDenied('denied'));

      // act & assert
      await assertRejects(
        () => writeTextFile(outputPath, 'new content', backup),
        Deno.errors.PermissionDenied,
      );
      assertEquals(await fileExists(`${outputPath}.tmp`), false);
    });

    it('[Error] T-LIB-WTF-03-04: rename が AlreadyExists 以外で失敗 → 一時ファイルが残置されない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const renameStub = stub(Deno, 'rename', () => Promise.reject(new Deno.errors.PermissionDenied('denied')));

      try {
        // act & assert
        await assertRejects(
          () => writeTextFile(outputPath, 'new content'),
          Deno.errors.PermissionDenied,
        );
      } finally {
        renameStub.restore();
      }

      assertEquals(await fileExists(`${outputPath}.tmp`), false);
    });

    it('[Error] T-LIB-WTF-03-02: 一時ファイル書き出しが失敗 → BackupProvider が呼ばれず元ファイルの内容が変化しない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      await Deno.writeTextFile(outputPath, oldContent);
      const spy = _makeBackupSpy(`${outputPath}.bak`);

      const writeStub = stub(
        Deno,
        'writeTextFile',
        () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
      );

      try {
        // act & assert
        await assertRejects(
          () => writeTextFile(outputPath, 'new content', spy.provider),
          Deno.errors.PermissionDenied,
        );
      } finally {
        writeStub.restore();
      }

      assertEquals(spy.calls.length, 0);
      assertEquals(await readTextFile(outputPath), oldContent);
    });
  });

  /** エッジケース: 退避が行われなかった場合の戻り値・副作用 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-WTF-04-01: BackupProvider が null を返す → 例外を投げず書き込まれ戻り値が null', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const newContent = 'new content';
      const spy = _makeBackupSpy(null);

      // act
      const result = await writeTextFile(outputPath, newContent, spy.provider);

      // assert
      assertEquals(result, null);
      assertEquals(await readTextFile(outputPath), newContent);
      assertEquals(spy.calls, [outputPath]);
    });
  });
});
