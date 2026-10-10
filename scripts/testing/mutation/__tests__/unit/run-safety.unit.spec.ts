// src: scripts/testing/mutation/__tests__/unit/run-safety.unit.spec.ts
// @(#): run-safety のユニットテスト
//       対象: acquireLock / releaseLock
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertNotEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { LOCK_DELETE_GUIDANCE } from '../../constants/mutation.constants.ts';
import { acquireLock, releaseLock } from '../../run-safety.ts';
import type { LockRecord } from '../../types/mutation.types.ts';

// ─── Helpers
import { join } from '@std/path';
import { makeLoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';

// ─── Internal Helpers

// constants
/** 一時ディレクトリ配下に置くロックファイルの名前。 */
const _LOCK_FILE_NAME = 'mutation.lock';

/** 他の実行が作成した、形式の正しいロック記録。 */
const _foreignRecord: LockRecord = { pid: 4242, createdAt: '2026-10-08T00:00:00Z', id: 'other-run-id' };

// functions
/**
 * ロックパスに他の実行のロック (`_foreignRecord`) を書き込む。
 *
 * @param lockPath - 書き込み先のロックパス
 */
async function _writeForeignLock(lockPath: string): Promise<void> {
  await Deno.writeTextFile(lockPath, JSON.stringify(_foreignRecord));
}

/**
 * ロックパスの記録を JSON として読み取る。
 *
 * @param lockPath - 読み取るロックパス
 * @returns ロックファイルに記録された `LockRecord`
 */
async function _readLockRecord(lockPath: string): Promise<LockRecord> {
  return JSON.parse(await Deno.readTextFile(lockPath)) as LockRecord;
}

/**
 * logger をスタブした状態で処理を実行し、終了後 (例外時も) にスタブを解除する。
 *
 * @param action - logger 出力を捕捉したい処理
 * @returns 捕捉した出力を持つ `LoggerStub` (解除済み)
 */
async function _withLoggerStub(action: () => Promise<unknown>): Promise<LoggerStub> {
  const _loggerStub = makeLoggerStub();
  try {
    await action();
  } finally {
    _loggerStub.restore();
  }
  return _loggerStub;
}

/**
 * 捕捉した error 出力が、期待する文字列をすべて含むことを検証する。
 *
 * @param loggerStub - error 出力を捕捉した `LoggerStub`
 * @param expected - error 出力に含まれるべき文字列の並び
 */
function _assertErrorLogIncludes(loggerStub: LoggerStub, expected: string[]): void {
  const _errorOutput = loggerStub.errorLogs.join('\n');
  expected.forEach((text) => assertStringIncludes(_errorOutput, text));
}

// ─── Tests

/**
 * `acquireLock` のユニットテストスイート。
 *
 * 一時ディレクトリ配下のロックパスに対して、実行ロックの取得を検証する。
 *
 * @see acquireLock
 */
describe('acquireLock', () => {
  let tempDir: string;
  let lockPath: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'run-safety-' });
    lockPath = join(tempDir, _LOCK_FILE_NAME);
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * ロックが無い状態での取得 (execution R-201 / R-203 / REQ-F-017)。
   */
  describe('ロックが無い状態での取得', () => {
    /** ロックパスにファイルが存在しない正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-01-01: ロックが無い → 例外なしでロックファイルを作成する', async () => {
        await acquireLock(lockPath);

        const _info = await Deno.stat(lockPath);
        assert(_info.isFile);
      });

      it('[Normal] T-MUT-RS-01-02: ロックが無い → PID・作成時刻・ランダム ID を記録する', async () => {
        await acquireLock(lockPath);

        const _record = await _readLockRecord(lockPath);
        assertEquals(_record.pid, Deno.pid);
        assert(!Number.isNaN(Date.parse(_record.createdAt)), `createdAt is not a date: ${_record.createdAt}`);
        assert(typeof _record.id === 'string' && _record.id.length > 0, `id is empty: ${_record.id}`);
      });

      it('[Normal] T-MUT-RS-01-03: 取得 → 解放 → 再取得 → 1 回目と 2 回目のランダム ID が異なる', async () => {
        // 1 回目の記録は解放で消えるため、取得直後に読む
        const _firstToken = await acquireLock(lockPath);
        const _firstId = (await _readLockRecord(lockPath)).id;
        await releaseLock(_firstToken);
        await acquireLock(lockPath);
        const _secondId = (await _readLockRecord(lockPath)).id;

        assertNotEquals(_firstId, _secondId);
      });
    });
  });

  /**
   * 既存のロックがある場合の中止 (execution R-202 / REQ-F-017 / AC-019 / DR-09)。
   */
  describe('既存のロックがある場合の中止', () => {
    /** 他の実行が作成したロックファイルが既にある異常ケース。 */
    describe('When: 異常系', () => {
      beforeEach(async () => {
        await _writeForeignLock(lockPath);
      });

      it('[Error] T-MUT-RS-03-01: 有効な記録を持つ他実行のロックがある → ChatlogError で reject する', async () => {
        await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));
      });

      it('[Error] T-MUT-RS-03-02: 他実行のロックがある → 取得に失敗してもロックファイルをバイト単位で保持する', async () => {
        const _before = await Deno.readFile(lockPath);

        await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

        // 削除されていれば readFile が NotFound で失敗する
        assertEquals(await Deno.readFile(lockPath), _before);
      });

      it('[Error] T-MUT-RS-03-03: 他実行のロックがある → パス・PID・作成時刻・削除案内を error 出力する', async () => {
        const _loggerStub = await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

        _assertErrorLogIncludes(_loggerStub, [lockPath, '4242', '2026-10-08T00:00:00Z', LOCK_DELETE_GUIDANCE]);
      });
    });
  });

  /**
   * 記録の可読性・保持者の生死を問わない中止 (execution R-202 / DD-07 / Edge execution-22 / execution-23)。
   */
  describe('記録の可読性・保持者の生死を問わない中止', () => {
    /** 形式は正しいが、記録された PID のプロセスが既に存在しない記録。 */
    const _deadHolderRecord: LockRecord = { pid: 999999999, createdAt: '2026-10-08T00:00:00Z', id: 'stale-run-id' };

    /** 作成時刻キーだけが欠けた記録。 */
    const _partialRecord: Omit<LockRecord, 'createdAt'> = { pid: 4242, id: 'partial-run-id' };

    /** 記録が読めない、または保持者が既に居ないロックファイル。 */
    const _abandonedLockCases: { id: string; label: string; content: string }[] = [
      { id: 'T-MUT-RS-06-01', label: '空のロックファイル', content: '' },
      { id: 'T-MUT-RS-06-02', label: 'JSON として解釈できないロックファイル', content: '{broken' },
      {
        id: 'T-MUT-RS-06-03',
        label: '実在しない PID を記録したロックファイル',
        content: JSON.stringify(_deadHolderRecord),
      },
    ];

    /** 記録の全部または一部が読めないロックファイルと、error 出力に含まれるべきパス以外の項目。 */
    const _partialOutputCases: { id: string; label: string; content: string; expectedFields: string[] }[] = [
      {
        id: 'T-MUT-RS-06-04',
        label: '空のロックファイル → パスと削除案内',
        content: '',
        expectedFields: [LOCK_DELETE_GUIDANCE],
      },
      {
        id: 'T-MUT-RS-06-05',
        label: '作成時刻キーの無い記録 → パス・PID・削除案内',
        content: JSON.stringify(_partialRecord),
        expectedFields: ['4242', LOCK_DELETE_GUIDANCE],
      },
    ];

    /** ロックファイルの記録が読めない・保持者が既に居ないエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, label, content } of _abandonedLockCases) {
        it(`[Edge] ${id}: ${label} → ChatlogError で reject し、ロックファイルを残す`, async () => {
          await Deno.writeTextFile(lockPath, content);

          await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

          // 削除されていれば readTextFile が NotFound で失敗する
          assertEquals(await Deno.readTextFile(lockPath), content);
        });
      }

      for (const { id, label, content, expectedFields } of _partialOutputCases) {
        it(`[Edge] ${id}: ${label}を error 出力し、ChatlogError で reject する`, async () => {
          await Deno.writeTextFile(lockPath, content);

          // 記録の解析失敗が別の例外に変わっていれば、ここで型不一致として失敗する
          const _loggerStub = await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

          _assertErrorLogIncludes(_loggerStub, [lockPath, ...expectedFields]);
        });
      }
    });
  });

  /**
   * 取得失敗時の副作用の不在 (execution R-201 / REQ-F-017 / AC-019 / Edge execution-21)。
   */
  describe('取得失敗時の副作用の不在', () => {
    /**
     * ディレクトリ直下のファイル名 (ソート済み) と各ファイルのバイト列を取得する。
     *
     * @param dir - 対象ディレクトリ
     * @returns ファイル名とバイト列の組の並び
     */
    const _snapshotDir = async (dir: string): Promise<[string, Uint8Array][]> => {
      const _names = (await Array.fromAsync(Deno.readDir(dir))).map((entry) => entry.name).sort();
      return await Promise.all(_names.map(async (name): Promise<[string, Uint8Array]> => [
        name,
        await Deno.readFile(join(dir, name)),
      ]));
    };

    /** ロックと同じディレクトリに変異ファイルが残っている状態で取得に失敗するエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-07-01: 既存ロックと変異ファイルがある → 取得失敗の前後でファイル一覧と内容が変わらない', async () => {
        await _writeForeignLock(lockPath);
        await Deno.writeTextFile(join(tempDir, 'foo.mutation-001.ts'), 'export const foo = 1;\n');
        await Deno.writeTextFile(join(tempDir, 'deno.mutation-001.json'), '{ "imports": {} }\n');
        const _before = await _snapshotDir(tempDir);

        await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

        assertEquals(await _snapshotDir(tempDir), _before);
      });
    });
  });
});

/**
 * `releaseLock` のユニットテストスイート。
 *
 * 一時ディレクトリ配下のロックパスに対して、実行ロックの解放を検証する。
 *
 * @see releaseLock
 */
describe('releaseLock', () => {
  let tempDir: string;
  let lockPath: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'run-safety-' });
    lockPath = join(tempDir, _LOCK_FILE_NAME);
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 自分のロックの解放 (execution R-213 / DD-13)。
   */
  describe('自分のロックの解放', () => {
    /** 取得したロックの token をそのまま渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-02-01: ランダム ID が一致 → ロックファイルを削除する', async () => {
        await releaseLock(await acquireLock(lockPath));

        await assertRejects(() => Deno.stat(lockPath), Deno.errors.NotFound);
      });
    });
  });

  /**
   * ランダム ID が一致しないロックの解放 (execution R-213 / DD-13)。
   */
  describe('ランダム ID が一致しないロックの解放', () => {
    /** 取得後に他の実行がロックを作り直し、ランダム ID だけが別の値になった異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-04-01: 記録のランダム ID が別の値 → ロックファイルを書き換え後の内容のまま残す', async () => {
        const _token = await acquireLock(lockPath);
        const _rewritten = JSON.stringify({ ...(await _readLockRecord(lockPath)), id: 'recreated-by-other-run' });
        await Deno.writeTextFile(lockPath, _rewritten);

        await releaseLock(_token);

        // 削除されていれば readTextFile が NotFound で失敗する
        assertEquals(await Deno.readTextFile(lockPath), _rewritten);
      });
    });
  });

  /**
   * 解放の失敗 (execution DD-14 / R-213)。
   */
  describe('解放の失敗', () => {
    /** 取得後にロックパスを削除できない状態 (同名の非空ディレクトリ) へ置き換えた異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-05-01: ロックを削除できない → 例外を投げず warn をちょうど 1 件出す', async () => {
        const _token = await acquireLock(lockPath);
        await Deno.remove(lockPath);
        await Deno.mkdir(lockPath);
        await Deno.writeTextFile(join(lockPath, 'child.txt'), 'child');

        // この fixture ではロックパスがディレクトリのため、削除より前の記録の読み取りで失敗する
        const _loggerStub = await _withLoggerStub(() => releaseLock(_token));

        assertEquals(_loggerStub.warnLogs.length, 1);
      });
    });
  });

  /**
   * 解放時に記録が壊れている (execution DD-13 / DD-14)。
   */
  describe('解放時に記録が壊れている', () => {
    /** 取得後にロックの内容を JSON として解釈できない文字列へ書き換えたエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-08-01: 記録を解釈できない → 削除せずに残し、warn を出す', async () => {
        const _token = await acquireLock(lockPath);
        await Deno.writeTextFile(lockPath, '{broken');

        const _loggerStub = await _withLoggerStub(() => releaseLock(_token));

        // 削除されていれば readTextFile が NotFound で失敗する
        assertEquals(await Deno.readTextFile(lockPath), '{broken');
        assert(_loggerStub.warnLogs.length >= 1);
      });
    });
  });

  /**
   * 解放時にロックが既に無い (execution DD-14 / DD-13 / R-213)。
   */
  describe('解放時にロックが既に無い', () => {
    /** 取得後にロックファイルが削除され、解放の時点でロックパスに何も無いエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-09-01: ロックファイルが既に無い → 例外を投げず、ロックを作り直さない', async () => {
        const _token = await acquireLock(lockPath);
        await Deno.remove(lockPath);

        // 例外が出れば releaseLock の await がテストを失敗させる
        await _withLoggerStub(() => releaseLock(_token));

        await assertRejects(() => Deno.stat(lockPath), Deno.errors.NotFound);
      });
    });
  });
});
