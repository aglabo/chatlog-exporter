// src: skills/_scripts/__tests__/helpers/find-fixture-dirs.ts
// @(#): findFixtureDirs — fixture ディレクトリ再帰収集ヘルパー
//       isFixtureDirProvider を DI で注入し、テスト可能な設計にする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { findDirectories } from '../../libs/file-io/find-entries.ts';
import { normalizePath } from '../../libs/file-io/path-utils.ts';
import { fileExists } from '../../libs/file-ops/exists-utils.ts';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** 指定ディレクトリが有効な fixture dir かを判定する関数の型。 */
export type IsFixtureDirProvider = (dir: string) => Promise<boolean>;

// ─────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────

/**
 * dir 直下に `input.md` が存在すれば true を返す。
 * ファイルが存在しない場合は false を返す。`NotFound` 以外のエラーは再スローする。
 */
export const defaultIsFixtureDir = async (dir: string): Promise<boolean> => {
  return await fileExists(`${dir}/input.md`);
};

/**
 * rootDir 以下を再帰的に走査し、isFixtureDir が true を返したディレクトリの
 * rootDir からのスラッシュ区切り相対パスを辞書順ソートして返す。
 *
 * isFixtureDir が true を返したディレクトリはそこで走査を打ち切る（内部を再帰しない）。
 * fixture ディレクトリのネストは想定しない仕様。
 */
export const findFixtureDirs = async (
  rootDir: string,
  isFixtureDir: IsFixtureDirProvider = defaultIsFixtureDir,
): Promise<string[]> => {
  const _rootNorm = normalizePath(rootDir);

  const _walk = async (dir: string): Promise<string[]> => {
    const subs = await findDirectories(dir);
    const nested = await Promise.all(
      subs.map(async (sub) => (await isFixtureDir(sub)) ? [sub] : _walk(sub)),
    );
    return nested.flat();
  };

  const _abs = await _walk(_rootNorm);
  return _abs.map((p) => p.slice(_rootNorm.length + 1)).sort();
};
