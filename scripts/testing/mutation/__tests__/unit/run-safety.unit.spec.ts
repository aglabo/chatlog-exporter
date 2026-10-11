// src: scripts/testing/mutation/__tests__/unit/run-safety.unit.spec.ts
// @(#): run-safety のユニットテスト
//       対象: acquireLock / acquireLockEnsuringDir / releaseLock
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertNotEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { assertSpyCallArgs, assertSpyCalls, stub } from '@std/testing/mock';

// ─── Test target
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import {
  LOCK_CREATED_AT_LABEL,
  LOCK_DELETE_GUIDANCE,
  LOCK_HELD_MESSAGE,
  LOCK_PID_LABEL,
} from '../../constants/mutation.constants.ts';
import { acquireLock, acquireLockEnsuringDir, releaseLock } from '../../run-safety.ts';
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

/**
 * 捕捉した error 出力が、指定した文字列をどれも含まないことを検証する。
 *
 * @param loggerStub - error 出力を捕捉した `LoggerStub`
 * @param unexpected - error 出力に含まれてはならない文字列の並び
 */
function _assertErrorLogExcludes(loggerStub: LoggerStub, unexpected: string[]): void {
  const _errorOutput = loggerStub.errorLogs.join('\n');
  unexpected.forEach((text) => assert(!_errorOutput.includes(text), `error output must not include: ${text}`));
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

      it('[Error] T-MUT-RS-03-01: 有効な記録を持つ他実行のロックがある → ChatlogError(ParallelExecutionError / LockHeld) で reject する', async () => {
        let _error: ChatlogError | undefined;
        await _withLoggerStub(async () => {
          _error = await assertRejects(() => acquireLock(lockPath), ChatlogError);
        });

        assertEquals(_error?.kind, 'ParallelExecutionError');
        assertEquals(_error?.subindex, 'LockHeld');
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
   * ロックの作成自体の失敗 (execution R-201 / R-202)。
   */
  describe('ロックの作成自体の失敗', () => {
    /** ロックパスの親ディレクトリが存在せず、既存ロックとは別の理由で作成に失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-03-04: 親ディレクトリが無い → Deno.errors.NotFound で reject し、ロック保持の報告を出さない', async () => {
        const _missingPath = join(tempDir, 'missing-dir', _LOCK_FILE_NAME);

        // ChatlogError に変換されていれば型不一致として失敗する
        const _loggerStub = await _withLoggerStub(() =>
          assertRejects(() => acquireLock(_missingPath), Deno.errors.NotFound)
        );

        _assertErrorLogExcludes(_loggerStub, [LOCK_HELD_MESSAGE]);
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

    /** 記録の全部または一部が読めないロックファイルと、error 出力に含まれるべきパス以外の項目・含まれてはならない項目名。 */
    const _partialOutputCases: {
      id: string;
      label: string;
      content: string;
      expectedFields: string[];
      absentLabels: string[];
    }[] = [
      {
        id: 'T-MUT-RS-06-04',
        label: '空のロックファイル → パスと削除案内',
        content: '',
        expectedFields: [LOCK_DELETE_GUIDANCE],
        absentLabels: [LOCK_PID_LABEL, LOCK_CREATED_AT_LABEL],
      },
      {
        id: 'T-MUT-RS-06-05',
        label: '作成時刻キーの無い記録 → パス・PID・削除案内',
        content: JSON.stringify(_partialRecord),
        expectedFields: ['4242', LOCK_DELETE_GUIDANCE],
        absentLabels: [LOCK_CREATED_AT_LABEL],
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

      for (const { id, label, content, expectedFields, absentLabels } of _partialOutputCases) {
        it(`[Edge] ${id}: ${label}を error 出力し (読めない項目の行は出さず)、ChatlogError で reject する`, async () => {
          await Deno.writeTextFile(lockPath, content);

          // 記録の解析失敗が別の例外に変わっていれば、ここで型不一致として失敗する
          const _loggerStub = await _withLoggerStub(() => assertRejects(() => acquireLock(lockPath), ChatlogError));

          _assertErrorLogIncludes(_loggerStub, [lockPath, ...expectedFields]);
          _assertErrorLogExcludes(_loggerStub, absentLabels);
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
 * `acquireLockEnsuringDir` のユニットテストスイート。
 *
 * ロックパスの親ディレクトリを作成してから実行ロックを取得することを検証する。
 * 親ディレクトリが無いと `Deno.errors.NotFound` になる `acquireLock` の契約 (T-MUT-RS-03-04) は変えず、
 * 新しいクローン (`temp/` が無い) での初回実行を通すための入口。
 *
 * テスト ID 範囲: T-MUT-RS-20-01 〜 T-MUT-RS-20-03
 *
 * @see acquireLockEnsuringDir
 */
describe('acquireLockEnsuringDir', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'run-safety-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 親ディレクトリの有無を問わない取得。
   */
  describe('親ディレクトリの作成とロックの取得', () => {
    /** 親ディレクトリが無い、または既にある正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-20-01: 多段の親ディレクトリが無い → 親を作成し、PID・作成時刻・ランダム ID を記録して token と一致させる', async () => {
        const _nestedPath = join(tempDir, 'missing', 'nested', 'dir', _LOCK_FILE_NAME);

        const _token = await acquireLockEnsuringDir(_nestedPath);

        const _record = await _readLockRecord(_nestedPath);
        assertEquals(_record.pid, Deno.pid);
        assert(!Number.isNaN(Date.parse(_record.createdAt)), `createdAt is not a date: ${_record.createdAt}`);
        assert(typeof _record.id === 'string' && _record.id.length > 0, `id is empty: ${_record.id}`);
        assertEquals(_token.path, _nestedPath);
        assertEquals(_token.id, _record.id);
      });

      it('[Normal] T-MUT-RS-20-02: 親ディレクトリが既にある → 例外なしでロックファイルを作成する', async () => {
        const _lockPath = join(tempDir, _LOCK_FILE_NAME);

        const _token = await acquireLockEnsuringDir(_lockPath);

        assert((await Deno.stat(_lockPath)).isFile);
        assertEquals(_token.id, (await _readLockRecord(_lockPath)).id);
      });
    });

    /** 他の実行が作成したロックファイルが既にある異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-20-03: 他実行のロックがある → ChatlogError(ParallelExecutionError / LockHeld) で reject し、ロックファイルをバイト単位で保持する', async () => {
        const _lockPath = join(tempDir, _LOCK_FILE_NAME);
        await _writeForeignLock(_lockPath);
        const _before = await Deno.readFile(_lockPath);

        let _error: ChatlogError | undefined;
        await _withLoggerStub(async () => {
          _error = await assertRejects(() => acquireLockEnsuringDir(_lockPath), ChatlogError);
        });

        assertEquals(_error?.kind, 'ParallelExecutionError');
        assertEquals(_error?.subindex, 'LockHeld');
        // 削除されていれば readFile が NotFound で失敗する
        assertEquals(await Deno.readFile(_lockPath), _before);
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

      it('[Error] T-MUT-RS-05-02: 記録は読めるが削除だけが失敗する → 例外を投げず warn をちょうど 1 件出し、ロックを残す', async () => {
        const _token = await acquireLock(lockPath);
        // 記録の読み取りは通し、Deno.remove だけを失敗させる
        const _removeStub = stub(
          Deno,
          'remove',
          () => Promise.reject(new Deno.errors.PermissionDenied('remove denied')),
        );
        let _loggerStub: LoggerStub;
        try {
          // 例外が出れば releaseLock の await がテストを失敗させる
          _loggerStub = await _withLoggerStub(() => releaseLock(_token));
        } finally {
          _removeStub.restore();
        }

        assertEquals(_loggerStub.warnLogs.length, 1);
        assertSpyCalls(_removeStub, 1);
        assertSpyCallArgs(_removeStub, 0, [_token.path]);
        assert((await Deno.stat(lockPath)).isFile);
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
        assertEquals(_loggerStub.warnLogs.length, 1);
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
