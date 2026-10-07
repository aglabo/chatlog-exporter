// src: scripts/testing/mutation/types/mutation.types.ts
// @(#): ミューテーションテストで扱う変異体 (Mutant) の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 変異演算子の種別。 */
export type MutationOp = 'relational' | 'equality' | 'logical' | 'boolean' | 'number' | 'negation';

/**
 * ソース中の 1 箇所を置換する変異体。
 *
 * 適用 = (`line`, `column`) にある `before` を `after` に置き換えること。
 */
export type Mutant = {
  /** 対象ファイルのパス。 */
  file: string;
  /** 1 始まりの行番号。 */
  line: number;
  /** 1 始まりの桁番号。 */
  column: number;
  /** 変異演算子の種別。 */
  op: MutationOp;
  /** 置換前の字句。 */
  before: string;
  /** 置換後の字句 (除去は空文字列)。 */
  after: string;
  /** 元の行全体 (改行・`\r` を含まない)。 */
  lineText: string;
};
