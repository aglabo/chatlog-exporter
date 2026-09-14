// src: skills/_cle-libs/libs/ai/llama-request-builder.ts
// @(#): llama (OpenAI 互換) chat completions のリクエストを構築する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
// types
import type { OutputContract } from '../../types/json-schema.types.ts';
import type { LlamaChatMessage, LlamaRequestBody, LlamaRequestParams } from '../../types/llama-request.types.ts';
// libs
import { buildJsonSchema } from './json-schema-builder.ts';
import { parseModel } from './model-utils.ts';

/**
 * `response_format.json_schema` に載せるスキーマ名。
 *
 * 仕様は名前の値を定めていない。OpenAI 互換の `json_schema` ブロックが `name` を伴う形であり、
 * 本構築関数が 3 契約すべてを 1 経路で扱うため、契約によらない固定の識別子とする。
 */
const _JSON_SCHEMA_NAME = 'chatlog_output';

/**
 * `stream` フィールドに固定で載せる値（transport R-009 / DR-15）。
 *
 * 省略するとサーバ実装の既定値によってストリーミング応答へ入る経路が残るため、
 * 常に明示して塞ぐ。この構築関数に非ストリーミング以外の経路は無い。
 */
const _STREAM_DISABLED = false;

/**
 * リクエストに載せる `Content-Type`（transport R-008 / §4.2）。
 *
 * ボディを UTF-8 で符号化して送るため、charset を省略せず明示する。
 * 省略するとサーバ側の既定符号化に解釈が委ねられ、非 ASCII のプロンプトが
 * 文字化けする経路が残る。
 */
const _CONTENT_TYPE_JSON_UTF8 = 'application/json; charset=utf-8';

/**
 * system テキストと user テキストを別ロールの別メッセージ要素として構成する（transport R-003）。
 *
 * system を先・user を後に置き、両者を連結しない（AC-006）。
 *
 * @param system - system ロールに載せるテキスト
 * @param user - user ロールに載せるテキスト
 * @returns system 先・user 後の 2 要素メッセージ配列
 */
const _buildMessages = (system: string, user: string): LlamaChatMessage[] => [
  { role: 'system', content: system },
  { role: 'user', content: user },
];

/**
 * モデル指定文字列から provider prefix を除いた識別子を取り出す（transport R-009）。
 *
 * 解析は `parseModel` を唯一の経路とし、`split('/')` で組み直さない。
 * `parseModel` が解決できない値（unknown provider 等）に対しては `null` を返すため、
 * その場合は指定値をそのまま載せる。構築関数を total に保ち、契約未指定以外の
 * 新たな例外分類を持ち込まないための扱いである。
 *
 * @param model - `provider/model` 形式を含むモデル指定文字列
 * @returns provider prefix を除いたモデル識別子（解決できない場合は指定値そのまま）
 */
const _resolveModelId = (model: string): string => parseModel(model)?.model ?? model;

/**
 * 出力契約が渡されていることを確かめ、渡されていなければ失敗させる（structured-output R-001 / DR-19）。
 *
 * 出力契約を指定しない llama 呼び出しは仕様上想定しない（REQ-F-003 / DR-19）ため、
 * 既定の契約で補わず構築の時点で失敗させる。
 *
 * 分類は `kind` を `AiError`、subindex を続行側の `ResponseSchemaViolation` に固定する。
 * DR-18 決定 1 が「llama 経路が throw する `ChatlogError` の kind は一律 `AiError` とし、
 * 呼び出し元の最後の分岐（非 `AiError` → フォールバック値）へ落ちる経路を作らない」と
 * 定めるためである。`InvalidArgs` は `isAbortingAiError`（`abort-utils.ts`）にも
 * `isFatalAiError`（`rate-limit-utils.ts`）にも該当しない — いずれも `kind === 'AiError'` を
 * 要求するため、呼び出し元 catch の最終分岐へ落ち、設定ミスが既定値の一括書き込みとして
 * 現れる（DR-18 が DR-12 を supersede した当の述語ギャップ）。
 *
 * 契約渡し忘れの一次ゲートは DR-27 決定 3・4 の静的検査（production の `runAI(` 呼び出しを
 * 列挙し、全件が契約を指定していることを確かめる system テスト）であり、この throw は
 * それを前提にした最後の防御にあたる。DR-27 は Alternatives Considered で実行時例外を
 * 静的検査の「代替」としては不採用としつつ、「静的検査をすり抜ける経路（動的に組み立てた
 * オプション等）が現れた場合は再検討する」と明記している（DR-26 Non-Goal が保留した案を
 * DR-27 が引き取った経緯）。したがって §3.2 が本経路に当たる分類を持たないのは欠落ではなく、
 * 検査を仕様側の分類ではなく静的検査に置いた設計の帰結である。
 *
 * subindex は新設せず、契約定義自身の不備を続行側 `ResponseSchemaViolation` に固定した
 * `output-contract.ts` `_assertFirstField` と同じ扱いに揃える（DR-26「既存の分類が
 * 当てはまるなら subindex を増やさない」）。中断側 4 分類は `abort-utils.ts` の
 * `_ABORT_REASON_LABELS` が単独所有する（DR-16 決定 1）ため増やさない。
 *
 * @param contract - 呼び出し元が指定した出力契約。未指定なら `undefined`
 * @returns 指定された出力契約
 * @throws {ChatlogError} 出力契約が指定されていない場合
 */
const _requireOutputContract = (contract: OutputContract | undefined): OutputContract => {
  if (!contract) {
    throw new ChatlogError('AiError', 'ResponseSchemaViolation', '出力契約が指定されていません');
  }
  return contract;
};

/**
 * 出力契約から `response_format` を構築する（structured-output R-001 / DR-04）。
 *
 * スキーマ本体は `buildJsonSchema` が唯一の生成経路であり、ここでは組み立て直さない。
 * `strict` を `true` で送るのは、対象サーバの準拠を確認した実測が `json_schema` /
 * `strict: true` の組で行われているため（measurements-response-format-2026-09-12.md §結論 / DR-25）。
 *
 * @param contract - この呼び出しに適用する出力契約
 * @returns json_schema 形式の `response_format`
 */
const _buildResponseFormat = (contract: OutputContract): Record<string, unknown> => ({
  type: 'json_schema',
  json_schema: {
    name: _JSON_SCHEMA_NAME,
    schema: buildJsonSchema(contract),
    strict: true,
  },
});

/**
 * llama chat completions へ送るリクエストを構築する。
 *
 * 構築のみを行い、送信は行わない（`FetchProvider` を受け取らない）。
 *
 * @param params - モデル指定・system / user テキスト・出力契約
 * @returns `FetchProvider` にそのまま渡せる `RequestInit`
 * @throws {ChatlogError} 出力契約が指定されていない場合
 */
export const buildLlamaRequest = (params: LlamaRequestParams): RequestInit => {
  const _body: LlamaRequestBody = {
    model: _resolveModelId(params.model),
    messages: _buildMessages(params.system, params.user),
    stream: _STREAM_DISABLED,
    response_format: _buildResponseFormat(_requireOutputContract(params.outputContract)),
  };

  return {
    method: 'POST',
    headers: { 'Content-Type': _CONTENT_TYPE_JSON_UTF8 },
    // `JSON.stringify` の結果をそのまま載せ、送信時に UTF-8 として符号化させる（transport R-008 / §4.2）。
    // 非 ASCII をエスケープや別符号化へ落とさないため、`_CONTENT_TYPE_JSON_UTF8` が宣言する
    // charset と符号化が一致する。両者は同じ条項に由来する。
    body: JSON.stringify(_body),
  };
};
