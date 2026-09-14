// src: skills/_cle-libs/libs/ai/llama-response.ts
// @(#): llama (OpenAI 互換) chat completions の応答を解釈する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
// types
import type { LlamaResponseBody } from '../../types/llama-response.types.ts';

// ─── Internal helpers

// constants
/**
 * バックエンドが過負荷であることを示す HTTP ステータス（error-handling §4.1 Step 2 / R-002）。
 *
 * 429 はレート制限、503 / 504 はモデルロード・キュー詰まり等による一時的な過負荷を示す。
 * 恒久的な失敗と区別して呼び出し元の中断ロジックへ伝えるため、`RateLimit` に写像する（DD-01 / DR-18）。
 */
const _RATE_LIMIT_STATUSES: readonly number[] = [429, 503, 504];

/**
 * エンドポイントを実装していないことを示す HTTP ステータス（error-handling §4.1 Step 3 / R-006）。
 *
 * 404 は指定したパスにエンドポイントが無いこと、501 はサーバがその操作を実装していないことを示す。
 * いずれも後続の呼び出しが同じ結果になるため、中断側として扱う（DR-18）。
 */
const _UNIMPLEMENTED_ENDPOINT_STATUSES: readonly number[] = [404, 501];

/**
 * サーバが認証を要求していることを示す HTTP ステータス（error-handling §4.1 Step 4 / R-007）。
 *
 * 401 は認証情報が無い・無効であること、403 は認証情報では許可されない操作であることを示す。
 * 仕様 §2 Assumptions の「認証を要求しない構成」という前提が崩れた場合にあたり、
 * 設定を変えない限り後続もすべて失敗するため、中断側として扱う（DR-18）。
 */
const _AUTH_REQUIRED_STATUSES: readonly number[] = [401, 403];

/**
 * `response_format` の拒否を示す HTTP ステータス（error-handling §4.1 Step 5 / R-008）。
 *
 * 400 のうち本文から拒否と判別できたものだけが中断側の `ResponseFormatRejected` に落ち、
 * 判別できないものは Step 6 で続行側の `ExitFailure` になる。
 */
const _RESPONSE_FORMAT_REJECTED_STATUS = 400;

/**
 * HTTP 400 の応答本文が `response_format` の拒否を示すかを判定する（error-handling §4.1 Step 5 / R-008）。
 *
 * **判別条件は未確定であり、本実装は常に `false` を返す。** Phase 0 の実測では
 * HTTP 400 が 1 件も発生せず、`response_format` の拒否（中断）とコンテキスト長超過（続行）を
 * 読み分ける手段を決められなかったため（測定レポート §3.2）。判別できない 400 は
 * Step 6 の `ExitFailure`（続行）へ落とす既定を維持する（implementation.md §3.2）。
 *
 * 差し替えるには、実際に返った HTTP 400 の応答本文（`error.message` / `error.type` /
 * `error.param` の実値）と、そこから拒否を一意に言い当てるマッチ条件が必要になる。
 * それらが揃うまでこの関数だけを書き換えれば済むよう、判別ロジックを単独で分離してある。
 *
 * @param _body - HTTP 400 応答の生本文。判別条件が確定するまで参照しない
 * @returns `response_format` の拒否と判別できれば `true`（現状は常に `false`）
 * @see docs/.deckrd/libs/ai-backend/measurements-response-format-2026-09-12.md §3.2
 * @see docs/.deckrd/libs/ai-backend/implementation/implementation.md §3.2
 */
const _isResponseFormatRejection = (_body: string): boolean => false;

/**
 * `Content-Type` ヘッダが JSON 系を示すかを判定する（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
 *
 * 受理するのは media type が `application/json` の場合のみで、
 * `application/json; charset=utf-8` のようにパラメータが付いていても受理する。
 * media type は RFC 9110 §8.3.1 により大文字小文字を区別しないため、比較前に小文字化する。
 * `text/event-stream` などの非 JSON と、ヘッダ欠落（`null`）は拒否する。
 * ベンダー固有の `+json` サフィックスは仕様が要求していないため扱わない。
 *
 * @param value - `Content-Type` ヘッダの値。欠落時は `null`
 * @returns JSON 系であれば `true`
 */
const _isJsonContentType = (value: string | null): boolean =>
  value?.split(';')[0].trim().toLowerCase() === 'application/json';

/**
 * chat completions 応答ボディからアシスタントテキストを取り出す（error-handling §4.1 Step 7 / R-004）。
 *
 * 取り出せない場合はフォールバック値を返さず `ChatlogError` を throw する（DD-02 / DR-03）。
 * 「取り出せない」条件は R-004 の 4 つに限る。`choices` の欠落・空配列・`choices[0]` が `null`（条件 a）、
 * `content` の `null`・欠落（条件 b）、`content` が文字列でない（条件 c）、
 * `finish_reason` が `stop` 以外（条件 d / DR-15）。
 *
 * @param payload - JSON パース済みの応答ボディ
 * @returns `choices[0]` のアシスタントテキスト
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ExitFailure'`（続行側）
 */
const _extractAssistantText = (payload: unknown): string => {
  const _choice = (payload as LlamaResponseBody | null | undefined)?.choices?.[0];
  if (_choice === undefined || _choice === null) {
    throw new ChatlogError('AiError', 'ExitFailure', 'llama response has no usable choices');
  }

  const _content = _choice.message?.content;
  if (typeof _content !== 'string') {
    throw new ChatlogError('AiError', 'ExitFailure', 'llama response assistant content is missing or not a string');
  }

  if (_choice.finish_reason !== 'stop') {
    throw new ChatlogError(
      'AiError',
      'ExitFailure',
      `llama response finish_reason is not 'stop': ${_choice.finish_reason}`,
    );
  }

  return _content;
};

/**
 * llama chat completions の応答からアシスタントテキストを取り出す（transport R-007）。
 *
 * 本文は冒頭で `await response.text()` を 1 回だけ実行し、以降その文字列を使う
 * （`Response` の body は 1 度しか読めないため、分類のたびに読み直さない）。
 * ヘッダ受信後に本文ストリームが壊れた場合は読み取りが reject するが、素の `TypeError` を
 * 漏らさないよう空文字として扱い、以降の Step による分類に委ねる（DR-18 決定 1 / REQ-C-003）。
 * 採用するのは `choices[0]` のみで、2 番目以降は無視する（AC-017）。
 *
 * 分類は error-handling §4.1 の Step 順に評価する（Rule ID 順ではない。implementation §4.3）。
 * まず Step 2 で HTTP ステータスが 429 / 503 / 504 の応答を中断側の `RateLimit` として throw する
 * （error-handling §4.1 Step 2 / R-002 / DD-01）。過負荷は恒久的な設定ミスと区別して
 * 呼び出し元の並列実行の中断ロジックへ伝える必要があるため、本文の形によらずここで打ち切る。
 * 次に Step 3 で HTTP ステータスが 404 / 501 の応答を中断側の `BackendUnavailable` として throw する
 * （error-handling §4.1 Step 3 / R-006 / DR-18）。エンドポイントを実装していないことを示し、
 * 後続の呼び出しも同じ結果になるため、本文の形によらずここで打ち切る。
 * 次に Step 4 で HTTP ステータスが 401 / 403 の応答を中断側の `BackendUnavailable` として throw する
 * （error-handling §4.1 Step 4 / R-007 / DR-18）。仕様 §2 Assumptions の「認証を要求しない構成」という
 * 前提が崩れた場合にあたるため、404 や到達不能と読み分けられるようメッセージに前提の崩れを記す
 * （Edge error-handling-9）。
 * 次に Step 5 で HTTP ステータスが 400 かつ本文から `response_format` の拒否と判別できる応答を
 * 中断側の `ResponseFormatRejected` として throw する（error-handling §4.1 Step 5 / R-008）。
 * 判別は `_isResponseFormatRejection` が担うが、判別条件が未確定のため現状この分岐には到達しない。
 * 最後に Step 6 で、上記いずれにも該当しない非成功ステータス（判別できない 400 を含む）を
 * 続行側の `ExitFailure` として throw する（error-handling §4.1 Step 6 / R-003 / DR-18）。
 *
 * 次に Step 7 の本文解釈の前に、Step 6.5 のゲートを通す（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
 * `Content-Type` が JSON 系でない・ヘッダが欠落している・本文を JSON として parse できない場合は、
 * サーバが送信したフィールドを honour しておらず後続の呼び出しも同じ結果になるため、
 * 中断側の `BackendUnavailable` として throw する。
 *
 * ゲートを通った応答のみ Step 7 に進み、アシスタントテキストを取り出せない場合は
 * `_extractAssistantText` が続行側として分類する（error-handling §4.1 Step 7 / R-004）。
 *
 * @param response - chat completions の応答
 * @returns `choices[0]` のアシスタントテキスト
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'RateLimit'`（中断側、Step 2）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'BackendUnavailable'`（中断側、Step 3 / Step 4 / Step 6.5）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ResponseFormatRejected'`（中断側、Step 5）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ExitFailure'`（続行側、Step 6 / Step 7）
 */
export const interpretLlamaResponse = async (response: Response): Promise<string> => {
  let _raw = '';
  try {
    _raw = await response.text();
  } catch {
    // 本文を取得できない場合もステータスによる分類（Step 2〜6）は成立する。
    // 成功ステータスなら空文字が Step 6.5 の JSON.parse で SyntaxError となり
    // BackendUnavailable に落ちる（サーバが本文を送り切れなかったことの正しい分類）。
  }

  if (_RATE_LIMIT_STATUSES.includes(response.status)) {
    throw new ChatlogError(
      'AiError',
      'RateLimit',
      `llama backend is overloaded: HTTP ${response.status}`,
    );
  }

  if (_UNIMPLEMENTED_ENDPOINT_STATUSES.includes(response.status)) {
    throw new ChatlogError(
      'AiError',
      'BackendUnavailable',
      `llama endpoint is not implemented: HTTP ${response.status}`,
    );
  }

  if (_AUTH_REQUIRED_STATUSES.includes(response.status)) {
    throw new ChatlogError(
      'AiError',
      'BackendUnavailable',
      `llama backend requires authentication, but the configuration assumes no authentication: HTTP ${response.status}`,
    );
  }

  if (response.status === _RESPONSE_FORMAT_REJECTED_STATUS && _isResponseFormatRejection(_raw)) {
    throw new ChatlogError(
      'AiError',
      'ResponseFormatRejected',
      `llama backend rejected the requested response_format: HTTP ${response.status}`,
    );
  }

  if (!response.ok) {
    throw new ChatlogError(
      'AiError',
      'ExitFailure',
      `llama request failed: HTTP ${response.status}`,
    );
  }

  const _contentType = response.headers.get('Content-Type');

  if (!_isJsonContentType(_contentType)) {
    throw new ChatlogError(
      'AiError',
      'BackendUnavailable',
      `llama response Content-Type is not JSON: ${_contentType ?? '(missing)'}`,
    );
  }

  let _payload: unknown;
  try {
    _payload = JSON.parse(_raw);
  } catch {
    throw new ChatlogError('AiError', 'BackendUnavailable', 'llama response body is not valid JSON');
  }

  return _extractAssistantText(_payload);
};

/**
 * TLS 証明書の検証失敗を示す、`fetch` の原因エラーメッセージ中の語（DR-26 決定 1）。
 *
 * Deno が用いる rustls の文言。自己署名証明書のサーバへ `fetch` して実測した
 * `... client error (Connect): invalid peer certificate: Other(...)` に由来する。
 */
const _TLS_VERIFICATION_FAILURE_MARKER = 'invalid peer certificate';

/**
 * reject 値とその `cause` チェーンを根まで並べる（error-handling §4.1 Step 1 / DR-26 決定 1）。
 *
 * `fetch` は transport 層の失敗を `TypeError: fetch failed` に包み、原因を `cause` に載せるため、
 * 最上位の値だけを見ると原因を判別できない。`cause` が循環していても止まるよう、既に並べた値に戻ったら打ち切る。
 *
 * @param e - fetch が reject した値
 * @returns 最上位から根へ向かう `Error` の並び
 */
const _errorChain = (e: unknown): Error[] => {
  const _chain: Error[] = [];
  let _current: unknown = e;
  while (_current instanceof Error && !_chain.includes(_current)) {
    _chain.push(_current);
    _current = _current.cause;
  }
  return _chain;
};

/**
 * fetch の失敗が Deno runtime 由来かを判定する（error-handling §4.1 Step 1 / DR-26 決定 1）。
 *
 * 判別根拠は Deno 実機で観測した reject 値の形（本リポジトリでの実測）。
 *
 * - 権限不足（`--allow-net` 不足）: `Deno.errors.NotCapable` が包まれずそのまま reject 値になる
 * - TLS 証明書の検証失敗: `TypeError: fetch failed` に包まれ、`cause.message` が
 *   `... client error (Connect): invalid peer certificate: ...` になる。
 *   証明書の検証結果は専用のエラー型を持たないため、型ではなくこの語で判別する
 *
 * ネットワーク到達不能は `cause.message` が `dns error: ...` や `tcp connect error: ...` となり、
 * いずれの条件にも当たらないため runtime 由来と読み分けられる。
 * `invalid peer certificate` は Deno が用いる rustls の文言であり、Deno のバージョンに依存する。
 *
 * @param e - fetch が reject した値
 * @returns 権限不足・TLS 検証失敗であれば `true`
 */
const _isRuntimeFailure = (e: unknown): boolean =>
  _errorChain(e).some((error) =>
    error instanceof Deno.errors.NotCapable || error.message.includes(_TLS_VERIFICATION_FAILURE_MARKER)
  );

/**
 * reject 値を原因まで含む 1 行の説明に変換する（error-handling §4.1 Step 1）。
 *
 * `fetch` の reject 値は最上位が `TypeError: fetch failed` で、原因は `cause` にしか無い。
 * 最上位だけを文字列化すると失敗の切り分けに必要な情報が落ちるため、チェーン全体を連結する。
 *
 * @param e - fetch が reject した値
 * @returns 原因まで辿った説明。`Error` でない値はそのまま文字列化する
 */
const _describeFailure = (e: unknown): string => {
  const _chain = _errorChain(e);
  return _chain.length === 0 ? String(e) : _chain.map((error) => String(error)).join(' <- ');
};

/**
 * fetch が reject した値を失敗分類へ写像する（error-handling §4.1 Step 1 / R-001 / DR-18）。
 *
 * HTTP 応答が一切得られなかった場合にあたり、後続の呼び出しも同じ結果になるため、
 * 中断側の `BackendUnavailable` として throw する。正常復帰しないので戻り値型は `never`。
 *
 * 分類先は 1 つだが、DR-26 決定 1 に従い Deno runtime 由来の失敗（権限不足・TLS 検証失敗）は
 * メッセージにその旨を残し、ネットワーク到達不能と読み分けられるようにする。
 * 判別は `_isRuntimeFailure` が担う。
 *
 * @param e - fetch が reject した値
 * @returns 返らない（常に throw する）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'BackendUnavailable'`（中断側）
 */
export const mapLlamaFetchFailure = (e: unknown): never => {
  if (_isRuntimeFailure(e)) {
    throw new ChatlogError(
      'AiError',
      'BackendUnavailable',
      `llama backend is unreachable due to a Deno runtime failure, not a network outage: ${_describeFailure(e)}`,
    );
  }

  throw new ChatlogError('AiError', 'BackendUnavailable', `llama backend is unreachable: ${_describeFailure(e)}`);
};
