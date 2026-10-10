// src: scripts/testing/mutation/__tests__/unit/mutate-tester.unit.spec.ts
// @(#): mutate-tester の引数解析のユニットテスト
//       対象: parseMutateArgs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStrictEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseMutateArgs } from '../../../mutate-tester.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
// types
import type { MutateModule } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// types
/** モジュール名の受理を検証するテーブル駆動ケース。 */
type _ModuleCase = {
  /** テスト ID。 */
  id: string;
  /** `parseMutateArgs` に渡す引数。 */
  argv: string[];
  /** 期待するモジュール名。 */
  expected: MutateModule;
};

/** 引数エラーになる入力 (許可値以外のモジュール名・`--timeout` の不正値) を検証するテーブル駆動ケース。 */
type _RejectedArgvCase = {
  /** テスト ID。 */
  id: string;
  /** `parseMutateArgs` に渡す引数。 */
  argv: string[];
};

// constants
/** モジュール名の引数エラーのメッセージに含まれるべき許可値 (実装の定数に依存せず固定する)。 */
const _ALLOWED_MODULES: readonly MutateModule[] = ['libs', 'classify', 'export', 'filter', 'normalize', 'set'];

// functions
/**
 * `parseMutateArgs` が `ChatlogError` を投げることを確認し、その例外を返す。
 *
 * 例外を投げない、または `ChatlogError` 以外を投げたときはその場でテストを失敗させる。
 *
 * @param argv - `parseMutateArgs` に渡す引数
 * @returns 投げられた `ChatlogError`
 */
function _catchMutateError(argv: string[]): ChatlogError {
  return assertThrows(() => parseMutateArgs(argv), ChatlogError);
}

/**
 * エラーメッセージに含まれていない許可値を列挙する。
 *
 * 許可値の一覧がすべてメッセージに載っていれば空配列になる。
 *
 * @param message - 検査するエラーメッセージ
 * @returns メッセージに含まれていない許可値 (出現順は `_ALLOWED_MODULES` に従う)
 */
function _modulesMissingFrom(message: string): MutateModule[] {
  return _ALLOWED_MODULES.filter((name) => !message.includes(name));
}

// ─── Tests

/**
 * `parseMutateArgs` のユニットテストスイート。
 *
 * mutate-tester の CLI 引数から、対象モジュール・`--strict`・`--timeout` を確定する純粋関数を検証する。
 *
 * @see parseMutateArgs
 */
describe('parseMutateArgs', () => {
  /**
   * 許可されたモジュール名の受理。
   *
   * 位置引数のモジュール名が許可リストに含まれるとき、例外を投げずにそのモジュール名を返すことを検証する。
   */
  describe('許可されたモジュール名の受理', () => {
    /** 許可リストに含まれるモジュール名を渡す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: _ModuleCase[] = [
        { id: 'T-MUT-MT-01-01', argv: ['libs'], expected: 'libs' },
        { id: 'T-MUT-MT-01-02', argv: ['classify'], expected: 'classify' },
        { id: 'T-MUT-MT-01-03', argv: ['export'], expected: 'export' },
        { id: 'T-MUT-MT-01-04', argv: ['filter'], expected: 'filter' },
        { id: 'T-MUT-MT-01-05', argv: ['normalize'], expected: 'normalize' },
        { id: 'T-MUT-MT-01-06', argv: ['set'], expected: 'set' },
      ];

      for (const { id, argv, expected } of _cases) {
        it(`[Normal] ${id}: ${JSON.stringify(argv)} → module === '${expected}'`, () => {
          assertEquals(parseMutateArgs(argv).module, expected);
        });
      }
    });
  });

  /**
   * `--strict` の確定。
   *
   * `--strict` を指定したとき、戻り値の `strict` が `true` になることを検証する。
   */
  describe('--strict の確定', () => {
    /** `--strict` を指定する正常ケース。 */
    describe('When: 正常系', () => {
      it(`[Normal] T-MUT-MT-02-01: ['libs', '--strict'] → strict === true`, () => {
        assertEquals(parseMutateArgs(['libs', '--strict']).strict, true);
      });

      it(`[Normal] T-MUT-MT-02-02: ['libs', '--strict', '--timeout', '30'] → strict === true, timeoutSec === 30`, () => {
        const { strict, timeoutSec } = parseMutateArgs(['libs', '--strict', '--timeout', '30']);
        assertEquals({ strict, timeoutSec }, { strict: true, timeoutSec: 30 });
      });
    });
  });

  /**
   * `--timeout` の正の整数の受理。
   *
   * `--timeout` に正の整数を指定したとき、その値を秒数として `timeoutSec` に反映することを検証する。
   */
  describe('--timeout の正の整数の受理', () => {
    /** `--timeout` に正の整数を指定する正常ケース。 */
    describe('When: 正常系', () => {
      it(`[Normal] T-MUT-MT-03-01: ['libs', '--timeout', '30'] → timeoutSec === 30`, () => {
        assertEquals(parseMutateArgs(['libs', '--timeout', '30']).timeoutSec, 30);
      });
    });
  });

  /**
   * モジュール名の欠落。
   *
   * 位置引数のモジュール名が無いとき、許可値以外の名前とは区別して引数エラー (`MissingModule`) を投げることを検証する。
   */
  describe('モジュール名の欠落', () => {
    /** モジュール名を渡さない異常ケース。 */
    describe('When: 異常系', () => {
      it(`[Error] T-MUT-MT-04-01: [] → ChatlogError (InvalidArgs / MissingModule)`, () => {
        const err = _catchMutateError([]);
        assertEquals({ kind: err.kind, subindex: err.subindex }, { kind: 'InvalidArgs', subindex: 'MissingModule' });
      });

      it(`[Error] T-MUT-MT-04-02: ['--strict'] → ChatlogError (InvalidArgs / MissingModule)`, () => {
        const err = _catchMutateError(['--strict']);
        assertEquals({ kind: err.kind, subindex: err.subindex }, { kind: 'InvalidArgs', subindex: 'MissingModule' });
      });

      it(`[Error] T-MUT-MT-04-03: [] → message に許可値 6 件 (libs, classify, export, filter, normalize, set) を含む`, () => {
        assertEquals(_modulesMissingFrom(_catchMutateError([]).message), []);
      });
    });
  });

  /**
   * 許可値以外のモジュール名。
   *
   * 位置引数のモジュール名が許可リストに無いとき、欠落とは区別して引数エラー (`UnknownModule`) を投げることを検証する。
   */
  describe('許可値以外のモジュール名', () => {
    /** 許可リストに無いモジュール名を渡す異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: _RejectedArgvCase[] = [
        { id: 'T-MUT-MT-05-01', argv: ['unknown'] },
        { id: 'T-MUT-MT-05-02', argv: ['all'] },
        { id: 'T-MUT-MT-05-03', argv: ['classes'] },
        { id: 'T-MUT-MT-05-04', argv: ['scripts'] },
        { id: 'T-MUT-MT-05-05', argv: ['normalize-chatlogs'] },
        { id: 'T-MUT-MT-05-07', argv: ['_cle-libs'] },
      ];

      for (const { id, argv } of _cases) {
        it(`[Error] ${id}: ${JSON.stringify(argv)} → ChatlogError (InvalidArgs / UnknownModule)`, () => {
          const err = _catchMutateError(argv);
          assertEquals({ kind: err.kind, subindex: err.subindex }, { kind: 'InvalidArgs', subindex: 'UnknownModule' });
        });
      }

      it(`[Error] T-MUT-MT-05-06: ['unknown'] → message に許可値 6 件 (libs, classify, export, filter, normalize, set) を含む`, () => {
        assertEquals(_modulesMissingFrom(_catchMutateError(['unknown']).message), []);
      });
    });
  });

  /**
   * `--timeout` の不正値。
   *
   * `--timeout` の値が正の整数でないとき、引数エラー (`InvalidTimeout`) を投げることを検証する。
   */
  describe('--timeout の不正値', () => {
    /** `--timeout` に正の整数以外を指定する異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: _RejectedArgvCase[] = [
        { id: 'T-MUT-MT-06-01', argv: ['libs', '--timeout', '0'] },
        { id: 'T-MUT-MT-06-02', argv: ['libs', '--timeout', '-5'] },
        { id: 'T-MUT-MT-06-03', argv: ['libs', '--timeout', '1.5'] },
        { id: 'T-MUT-MT-06-04', argv: ['libs', '--timeout', 'abc'] },
        { id: 'T-MUT-MT-06-05', argv: ['libs', '--timeout', '30s'] },
      ];

      for (const { id, argv } of _cases) {
        it(`[Error] ${id}: ${JSON.stringify(argv)} → ChatlogError (InvalidArgs / InvalidTimeout)`, () => {
          const err = _catchMutateError(argv);
          assertEquals({ kind: err.kind, subindex: err.subindex }, { kind: 'InvalidArgs', subindex: 'InvalidTimeout' });
        });
      }

      // 値の無い `--timeout` は自前の検査より先に `parseOptions` が拒否する
      it(`[Error] T-MUT-MT-06-06: ['libs', '--timeout'] → ChatlogError`, () => {
        _catchMutateError(['libs', '--timeout']);
      });

      it(`[Error] T-MUT-MT-06-07: ['libs', '--timeout', '0'] → message に --timeout を含む`, () => {
        assertStringIncludes(_catchMutateError(['libs', '--timeout', '0']).message, '--timeout');
      });
    });
  });

  /**
   * 省略時の既定値と `--timeout` の下限。
   *
   * オプションを省略したとき戻り値に既定値が入ること、および `--timeout` が受理する最小値を検証する。
   */
  describe('省略時の既定値', () => {
    /** オプションの省略と、`--timeout` の受理範囲の下限を扱うエッジケース。 */
    describe('When: エッジケース', () => {
      // 既定値の定数を参照せずリテラルで固定し、定数値の誤りも検出する
      it(`[Edge] T-MUT-MT-07-01: ['libs'] → timeoutSec === 120`, () => {
        assertEquals(parseMutateArgs(['libs']).timeoutSec, 120);
      });

      it(`[Edge] T-MUT-MT-07-02: ['libs'] → strict === false`, () => {
        assertStrictEquals(parseMutateArgs(['libs']).strict, false);
      });

      // 0 は拒否されるため、受理される最小値 1 で境界を固定する
      it(`[Edge] T-MUT-MT-07-03: ['libs', '--timeout', '1'] → timeoutSec === 1`, () => {
        assertEquals(parseMutateArgs(['libs', '--timeout', '1']).timeoutSec, 1);
      });
    });
  });

  /**
   * 規則の評価順。
   *
   * モジュール名の検査と `--timeout` の検査が同時に該当するとき、モジュール名の検査を先に判定することを検証する。
   */
  describe('規則の評価順', () => {
    /** モジュール名の不正と `--timeout` の不正が重なるエッジケース。 */
    describe('When: エッジケース', () => {
      it(`[Edge] T-MUT-MT-08-01: ['--timeout', '0'] → モジュール名の欠落を理由とし、--timeout を理由にしない`, () => {
        const err = _catchMutateError(['--timeout', '0']);
        assertEquals(
          {
            subindex: err.subindex,
            missingModules: _modulesMissingFrom(err.message),
            mentionsTimeout: err.message.includes('--timeout'),
          },
          { subindex: 'MissingModule', missingModules: [], mentionsTimeout: false },
        );
      });

      it(`[Edge] T-MUT-MT-08-02: ['unknown', '--timeout', '0'] → 不明なモジュール名を理由とし、--timeout を理由にしない`, () => {
        const err = _catchMutateError(['unknown', '--timeout', '0']);
        assertEquals(
          {
            subindex: err.subindex,
            missingModules: _modulesMissingFrom(err.message),
            mentionsTimeout: err.message.includes('--timeout'),
          },
          { subindex: 'UnknownModule', missingModules: [], mentionsTimeout: false },
        );
      });
    });
  });
});
