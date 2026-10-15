// src: skills/_cle-libs/libs/io/logger.ts
// @(#): ログ出力ユーティリティ
//       logger.log → stdout (prefix なし)
//       logger.info/warn/error → stderr (::info:: / ::warn:: / ::error:: prefix 付き)
//       logger.debug → stderr (::debug:: prefix 付き、出力可否は呼び出し側が判定)
//       logger.dryrun → stderr (::info:: <<dry-run>> prefix 付き、logger.info に委譲)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { LOGGER_PREFIX } from '../../constants/logger.constants.ts';

/**
 * logger — ログレベルごとに prefix を付けて出力するユーティリティ。
 *
 * - `log`   : prefix なし、stdout へ出力（結果・ファイルパス等）
 * - `info`  : `::info::` prefix を付けて stderr へ出力（進捗情報）
 * - `warn`  : `::warn::` prefix を付けて stderr へ出力（警告）
 * - `error` : `::error::` prefix を付けて stderr へ出力（エラー）
 * - `debug` : `::debug::` prefix を付けて stderr へ出力（debug 時の診断。出力可否は呼び出し側が判定する）
 * - `dryrun`: `::info:: <<dry-run>>` prefix を付けて stderr へ出力（dry-run 時の予定操作）
 *
 * `const logger = {...}` 形式で export することで、`@std/testing/mock` の `stub()` による
 * テスト時のメソッド差し替えが可能。
 */
export const logger = {
  log(msg: string): void {
    console.log(msg);
  },
  info(msg: string): void {
    console.error(`${LOGGER_PREFIX.INFO} ${msg}`);
  },
  warn(msg: string): void {
    console.error(`${LOGGER_PREFIX.WARN} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${LOGGER_PREFIX.ERROR} ${msg}`);
  },
  debug(msg: string): void {
    console.error(`${LOGGER_PREFIX.DEBUG} ${msg}`);
  },
  dryrun(msg: string): void {
    this.info(`${LOGGER_PREFIX.DRYRUN} ${msg}`);
  },
};
