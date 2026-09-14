// src: scripts/modules/setfm-contracts.ts
// @(#): set-frontmatter 起動時の出力契約値域検査モジュール
//       対象: assertSetfmContracts
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { assertOutputContractValues } from '../../../_cle-libs/libs/ai/json-schema-builder.ts';
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// constants
import { ERROR_KIND_LABELS } from '../../../_cle-libs/constants/chatlog-error.constants.ts';

// ─── Local
import { buildFrontmatterOutputContract } from './setfm-frontmatter.ts';
import { buildReviewOutputContract } from './setfm-review.ts';
import { buildTypeCategoryOutputContract } from './setfm-type-category.ts';
// types
import type { Dics } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// 起動時検査: 出力契約の値域
// ─────────────────────────────────────────────

/** 出力契約フィールド名（path の末尾セグメント）と、値域の導出元辞書ファイル名の対応表。 */
const _DIC_FILES: ReadonlyMap<string, string> = new Map([
  ['type', 'types.dic'],
  ['category', 'category.dic'],
  ['topics', 'topics.dic'],
  ['tags', 'tags.dic'],
]);

/**
 * 値域規則違反の `AiError` を、辞書ファイルパス付きの設定エラーに変換する。
 *
 * message `AI Error: <path>: <理由>` から detail を取り出し、path の末尾セグメント
 * （配列要素の `[]` を除く）で辞書ファイルを特定する。変換できない例外はそのまま返す。
 *
 * @param error - `assertOutputContractValues` が投げた例外
 * @param dicsDir - 解決済みの辞書ディレクトリ
 * @returns `InvalidFormat` / `InvalidDic` の `ChatlogError`、または元の例外
 */
const _toInvalidDicError = (error: unknown, dicsDir: string): unknown => {
  const _labelPrefix = `${ERROR_KIND_LABELS.AiError}: `;
  if (!(error instanceof ChatlogError) || !error.message.startsWith(_labelPrefix)) { return error; }
  const _detail = error.message.slice(_labelPrefix.length);
  const _field = _detail.split(': ')[0].split('.').at(-1)?.replace(/\[\]$/, '') ?? '';
  const _file = _DIC_FILES.get(_field);
  return _file === undefined
    ? error
    : new ChatlogError('InvalidFormat', 'InvalidDic', `${dicsDir}/${_file}: ${_detail}`);
};

/**
 * set-frontmatter が AI 呼び出しで使う 3 つの出力契約を辞書から構築し、値域規則を起動時に検査する。
 *
 * 辞書の設定ミス（フォールバック値の欠落・空の category 辞書など）を AI を呼ぶ前に検出し、
 * 実行全体の中断に変えるためである（structured-output §4.3.1）。検査を呼び出しごとに任せると、
 * CLI 経路・llama 経路のどちらでも各エントリが続行側エラーとして扱われ、設定エラーが
 * フォールバック値の一括書き込みとして現れる。起動時に一度だけ検査することで両経路に同じ中断を与える。
 *
 * 検査順は type/category → frontmatter → review とし、最初の違反で throw する（集約しない）。
 * `topics` / `tags` のような配列要素 enum は、空辞書でも空値域として許容される。
 *
 * 違反は AI 応答の問題ではなく辞書の設定ミスなので、違反した辞書ファイルのパスを付けた
 * 設定エラーとして投げ直す。起動時検査は呼び出しごとの catch を通らないため、
 * 非 AiError が既定値での続行として扱われる述語ギャップ（DR-18）は生じない。
 *
 * @param dics - 値域の導出元辞書
 * @param dicsDir - 解決済みの辞書ディレクトリ（エラーメッセージの辞書ファイルパスに使う）
 * @throws {ChatlogError} kind `InvalidFormat` / subindex `InvalidDic`。いずれかの契約が値域規則に違反する場合
 */
export const assertSetfmContracts = (dics: Dics, dicsDir: string): void => {
  try {
    [buildTypeCategoryOutputContract, buildFrontmatterOutputContract, buildReviewOutputContract]
      .forEach((build) => assertOutputContractValues(build(dics)));
  } catch (e) {
    throw _toInvalidDicError(e, dicsDir);
  }
};
