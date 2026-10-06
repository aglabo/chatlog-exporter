// src: _cle-libs/constants/llama-max-tokens.constants.ts
// @(#): 出力契約ごとの生成トークン上限（max_tokens）定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * 出力契約ごとに llama-server へ渡す生成トークン上限（`max_tokens`）。
 *
 * サーバ既定の `n_predict: -1`（無制限）に対する暴走の **安全弁** であり、出力長を整える目的ではない。
 * 値は「正常応答の実測最大 × 1.5 を 256 単位で切り上げ、下限 256」の規則で決める。
 *
 * 出典: `docs/.deckrd/libs/ai-backend/workspaces/measurements-generation-length-2026-10-06.md` / ai-backend DR-37。
 * config キーは設けない（DR-37 決定 1）。
 *
 * `*_PER_FILE` は 1 ファイルあたりの上限で、呼び出し側がその呼び出しに実際に載せたファイル数を掛ける
 * （`chunkSize` ではない。DR-37 実装時の決定 2）。
 */
export const LLAMA_MAX_TOKENS = {
  /** filter の判定。実測最大: 1 ファイルあたり 473 tok。 */
  FILTER_PER_FILE: 768,
  /** classify の分類。実測最大: 1 ファイルあたり 111 tok。 */
  CLASSIFY_PER_FILE: 256,
  /** normalize のセグメント分割。実測最大: 1 ファイルあたり 790 tok（production 検証を通った要素過多応答を含む最大）。 */
  SEGMENT_PER_FILE: 1280,
  /** set-frontmatter の meta 生成。実測最大: 151 tok。 */
  FRONTMATTER: 256,
  /** set-frontmatter の type / category 判定。実測最大: 20 tok。 */
  TYPE_CATEGORY: 256,
  /** set-frontmatter のレビュー。実測最大: 328 tok（`review.yaml` に errors の件数上限と反復禁止を入れた後の 40 本）。
   *  旧 `review.yaml` では正常応答が 512 を超えうるため、テンプレートの更新が必要（ai-backend DR-37 実装時の決定 5）。 */
  REVIEW: 512,
} as const;
