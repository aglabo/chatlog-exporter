// src: scripts/__tests__/fixtures/helpers/fixture-helpers.ts
// @(#): normalize-chatlogs fixtures 共通ヘルパー
//       対象: collectOutputFiles — output-<N>.md を番号順に収集する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { expandGlob } from '@std/fs';

import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';

/**
 * fixtures ディレクトリ下の output-<N>.md を番号順に収集して返す。
 * N は 1 から始まる整数とする。
 */
export const collectOutputFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const entry of expandGlob(`${dir}/output-*.md`)) {
    files.push(normalizePath(entry.path));
  }
  return files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};
