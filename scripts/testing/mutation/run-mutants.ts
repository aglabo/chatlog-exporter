// src: scripts/testing/mutation/run-mutants.ts
// @(#): 変異体を 1 件ずつステージングしてテストを実行し、後始末を保証する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { parse } from '@std/jsonc';
import { basename, dirname, join, resolve, toFileUrl } from '@std/path';

import { logger } from '../../../skills/_cle-libs/libs/io/logger.ts';
import { classifyOutcome } from './classify-outcome.ts';
import { LEFTOVER_WARNING } from './constants/mutation.constants.ts';
import { runDenoTest } from './run-deno-test.ts';
import { removeArtifacts } from './run-safety.ts';
import { applyMutant, buildMutationConfig, toMutantPath, toMutationConfigPath } from './stage-mutant.ts';

import type {
  DenoConfig,
  Mutant,
  MutantResult,
  MutantStatus,
  RunMutantsOptions,
  RunMutantsResult,
  TestRunnerProvider,
  TestRunOptions,
  TestRunOutcome,
} from './types/mutation.types.ts';

export type { RunMutantsOptions, RunMutantsResult } from './types/mutation.types.ts';

/**
 * パスを絶対パスの file URL 文字列にする (import map のキー・値に使う)。
 *
 * @param path - ファイルのパス
 * @returns file URL 文字列
 */
const _toFileUrlHref = (path: string): string => toFileUrl(resolve(path)).href;

/**
 * 既存ファイルを上書きせずに新規作成し、作成したパスを `created` に記録する (execution R-215 / R-216)。
 * 改行を正規化しないよう `Deno.writeTextFile` をそのまま使う。
 * 書き出しの失敗 (同名ファイルの既存など) は `false` に変換する (execution R-219)。
 * 失敗したパスは自分で作成したものではないため、`created` には記録しない。
 *
 * @param path - 書き出し先のパス
 * @param text - 書き出す内容
 * @param created - 後始末の対象として作成したパスを記録する先
 * @returns 作成できたら `true`、書き出しに失敗したら `false`
 */
const _tryWriteNewFile = async (path: string, text: string, created: string[]): Promise<boolean> => {
  try {
    await Deno.writeTextFile(path, text, { createNew: true });
    created.push(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * 元の設定を JSONC として読み、変異体を指す import を足した一時設定を元の設定の隣に書き出す
 * (execution R-216 / DD-02 / DR-01)。
 *
 * @param configPath - 元の設定のパス
 * @param mutant - 適用した変異体
 * @param mutantPath - 書き出した変異体ファイルのパス
 * @param index - 1 始まりの変異体番号
 * @param created - 後始末の対象として作成したパスを記録する先
 * @returns 一時設定のパス。書き出しに失敗したら `null` (execution R-219)
 */
const _writeTempConfig = async (
  configPath: string,
  mutant: Mutant,
  mutantPath: string,
  index: number,
  created: string[],
): Promise<string | null> => {
  const _baseConfig = parse(await Deno.readTextFile(configPath)) as DenoConfig;
  const _config = buildMutationConfig(_baseConfig, _toFileUrlHref(mutant.file), _toFileUrlHref(mutantPath));
  const _tempConfigPath = join(dirname(configPath), basename(toMutationConfigPath(index)));
  return await _tryWriteNewFile(_tempConfigPath, JSON.stringify(_config, null, 2), created) ? _tempConfigPath : null;
};

/**
 * runner を呼び、例外を `{ kind: 'error' }` の結果に変換する (execution R-219)。
 * 1 件の変異体の起動失敗で変異体の並び全体を止めないため、reject させない。
 *
 * @param runner - テストを実行する runner
 * @param args - runner に渡す引数
 * @param options - 制限時間・中断信号
 * @returns テスト実行結果 (例外時は `{ kind: 'error', message }`)
 */
const _runSafely = async (
  runner: TestRunnerProvider,
  args: string[],
  options: TestRunOptions,
): Promise<TestRunOutcome> => {
  try {
    return await runner(args, options);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * 変異体ファイルと一時設定をステージングし、runner でテストを 1 回実行して判定する
 * (execution R-215 / R-216 / R-217 / R-222)。
 *
 * @param mutant - 実行する変異体
 * @param index - 1 始まりの変異体番号
 * @param options - 実行オプション
 * @param created - 後始末の対象として作成したパスを記録する先
 * @returns 変異体の判定。runner の実行中に中止された場合は判定を捨てて `null` (execution R-227)
 */
const _stageAndRun = async (
  mutant: Mutant,
  index: number,
  options: RunMutantsOptions,
  created: string[],
): Promise<MutantStatus | null> => {
  const { configPath, testArgs, timeoutMs, signal, testRunner = runDenoTest } = options;
  const _applied = applyMutant(await Deno.readTextFile(mutant.file), mutant);
  if (!_applied.ok) {
    return 'error';
  }
  const _mutantPath = toMutantPath(mutant.file, index);
  if (!await _tryWriteNewFile(_mutantPath, _applied.source, created)) {
    return 'error';
  }
  const _tempConfigPath = await _writeTempConfig(configPath, mutant, _mutantPath, index, created);
  if (_tempConfigPath === null) {
    return 'error';
  }
  const _args = [testArgs[0], '--config', _tempConfigPath, ...testArgs.slice(1)];
  const _outcome = await _runSafely(testRunner, _args, { timeoutMs, signal });
  return signal?.aborted ? null : classifyOutcome(_outcome);
};

/**
 * 変異体 1 件を実行し、作成した変異体ファイル・一時設定を必ず削除する (execution R-225)。
 * 削除できなかったパスは `leftovers` に足し、パスごとに 1 件の警告を出す (execution R-226 / DD-05)。
 * 警告をパス単位にするのは、残骸の一覧 (`leftovers`) と 1 対 1 に対応させ、どのファイルが残ったかを直接示すため。
 *
 * @param mutant - 実行する変異体
 * @param index - 1 始まりの変異体番号
 * @param options - 実行オプション
 * @param leftovers - 削除できなかったパスを足す先
 * @returns 変異体とその判定。開始前または実行中に中止された場合は `null`
 */
const _runMutant = async (
  mutant: Mutant,
  index: number,
  options: RunMutantsOptions,
  leftovers: string[],
): Promise<MutantResult | null> => {
  // 開始前に中止済みなら、ファイルを書き出さず runner も起動しない (execution R-227)。
  if (options.signal?.aborted) {
    return null;
  }
  const _created: string[] = [];
  try {
    const _status = await _stageAndRun(mutant, index, options, _created);
    return _status === null ? null : { mutant, status: _status };
  } finally {
    const _failed = await removeArtifacts(_created);
    _failed.forEach((path) => logger.warn(LEFTOVER_WARNING + path));
    leftovers.push(..._failed);
  }
};

/**
 * 変異体を 1 件ずつステージングしてテストを実行し、判定を入力順に記録する
 * (execution R-210 / R-211 / R-215 – R-217 / R-219 / R-222 / R-225 / R-227)。変異体番号は並びの位置 + 1 とする。
 * runner の例外は当該変異体の `error` として記録し、次の変異体へ進む。
 * 変異体の開始前に中止済みならそれ以降を起動せず、runner の実行中に中止されたらその変異体の判定を捨てて、
 * どちらも `interrupted: true` で打ち切る。
 *
 * @param mutants - 実行する変異体の並び
 * @param options - 元の設定・テスト引数・制限時間・runner・中断信号
 * @returns 判定・削除できなかった残骸・中断の有無
 */
export const runMutants = async (mutants: Mutant[], options: RunMutantsOptions): Promise<RunMutantsResult> => {
  const _results: MutantResult[] = [];
  const _leftovers: string[] = [];
  // deno test 自体がテストを並列に流すため、変異体どうしは逐次に実行する (DR-05)。Promise.all にしない。
  for (const [position, mutant] of mutants.entries()) {
    const _result = await _runMutant(mutant, position + 1, options, _leftovers);
    if (_result === null) {
      return { results: _results, leftovers: _leftovers, interrupted: true };
    }
    _results.push(_result);
  }
  return { results: _results, leftovers: _leftovers, interrupted: false };
};
