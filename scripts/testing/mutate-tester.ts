// src: scripts/testing/mutate-tester.ts
// @(#): 変異テストの CLI エントリ (引数解析)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { parseOptions } from '../../skills/_cle-libs/libs/io/parse-args.ts';
import type { ArgSchema, ArgValue } from '../../skills/_cle-libs/types/args-schema.types.ts';
import {
  DEFAULT_TIMEOUT_SEC,
  INVALID_TIMEOUT_MESSAGE,
  MISSING_MODULE_MESSAGE,
  MUTATE_MODULES,
  MUTATE_MODULES_NOTE,
  UNKNOWN_MODULE_MESSAGE,
} from './mutation/constants/mutation.constants.ts';
import type { MutateArgs, MutateModule } from './mutation/types/mutation.types.ts';

export type { MutateArgs } from './mutation/types/mutation.types.ts';

/** `parseOptions` が解釈するオプションのフィールド。 */
type _MutateOptionFields = {
  /** `--strict` の指定有無。 */
  strict: boolean;
  /** `--timeout` の生の値。整数の検査は `parseOptions` に任せず自前で行う (`integer` 型は `30s` を受理するため)。 */
  timeout: string;
};

/** mutate-tester のオプションのスキーマ。 */
const _MUTATE_ARG_SCHEMA: ArgSchema<_MutateOptionFields> = [
  { option: '--strict', field: 'strict', type: 'flag' },
  { option: '--timeout', field: 'timeout', type: 'string' },
];

/**
 * 値が変異テストの許可するモジュール名かを判定する。
 *
 * @param value - 位置引数のモジュール名
 * @returns 許可リストに含まれるとき `true`
 */
const _isMutateModule = (value: string): value is MutateModule => MUTATE_MODULES.some((m) => m === value);

/**
 * モジュール名の引数エラーの詳細に許可値の一覧を添える。
 *
 * @param detail - 例外の詳細
 * @returns 許可値の一覧を後ろに添えた詳細
 */
const _withMutateModules = (detail: string): string => `${detail} (${MUTATE_MODULES_NOTE})`;

/**
 * 位置引数のモジュール名を検証して返す。
 *
 * @param value - 位置引数のモジュール名 (欠落時は `undefined`)
 * @returns 許可されたモジュール名
 * @throws {ChatlogError} 欠落しているとき (`InvalidArgs` / `MissingModule`)
 * @throws {ChatlogError} 許可リストに無いとき (`InvalidArgs` / `UnknownModule`)
 */
const _toMutateModule = (value: string | undefined): MutateModule => {
  if (value === undefined) {
    throw new ChatlogError('InvalidArgs', 'MissingModule', _withMutateModules(MISSING_MODULE_MESSAGE));
  }
  if (!_isMutateModule(value)) {
    throw new ChatlogError('InvalidArgs', 'UnknownModule', _withMutateModules(`${UNKNOWN_MODULE_MESSAGE}${value}`));
  }
  return value;
};

/** 符号・小数点・単位を含まない数字だけの並び。 */
const _DIGITS_ONLY = /^[0-9]+$/;

/**
 * `--timeout` の生の値が正の整数かを判定する。
 *
 * @param raw - `--timeout` の生の値
 * @returns 数字だけで構成され、かつ 0 より大きいとき `true`
 */
const _isPositiveInteger = (raw: string): boolean => _DIGITS_ONLY.test(raw) && Number(raw) > 0;

/**
 * `--timeout` の値を検証して秒数に変換する。
 *
 * @param value - `--timeout` の生の値 (スキーマ上は文字列。省略時は `undefined`)
 * @returns 制限時間 (秒)。省略時は既定値
 * @throws {ChatlogError} 正の整数でないとき (`InvalidArgs` / `InvalidTimeout`)
 */
const _toTimeoutSec = (value: ArgValue | undefined): number => {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_SEC;
  }
  const _raw = String(value);
  if (!_isPositiveInteger(_raw)) {
    throw new ChatlogError('InvalidArgs', 'InvalidTimeout', `${INVALID_TIMEOUT_MESSAGE}${_raw}`);
  }
  return Number(_raw);
};

/**
 * mutate-tester の CLI 引数から実行条件を確定する (report-cli R-604)。
 *
 * @param argv - CLI 引数 (`<module> [--strict] [--timeout <sec>]`)
 * @returns 対象モジュール・`--strict`・制限時間
 * @throws {ChatlogError} 引数が不正なとき (`InvalidArgs`)
 */
export const parseMutateArgs = (argv: string[]): MutateArgs => {
  const { config: _config, positionals: _positionals } = parseOptions<_MutateOptionFields>(argv, _MUTATE_ARG_SCHEMA);
  // モジュールの検査 (R-601 / R-602) を `--timeout` の検査 (R-603) より先に行う
  const _module = _toMutateModule(_positionals[0]);
  const _timeoutSec = _toTimeoutSec(_config.timeout);
  return { module: _module, strict: _config.strict === true, timeoutSec: _timeoutSec };
};
