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

// ─── Types

/** HTTP ステータスから引く失敗分類（error-handling §4.1 Step 2〜5）。 */
type _StatusFailure = {
  subindex: 'RateLimit' | 'BackendUnavailable' | 'ResponseFormatRejected';
  /** `: HTTP <status>` を除いたメッセージ本体。status は throw 時に埋め込む */
  message: string;
  /** 本文で追加判定する場合のみ持つ（Step 5: 400 は response_format 拒否と判別できたときだけ該当） */
  matches?: (raw: string) => boolean;
};

// ─── Constants
// markers
/**
 * `response_format` の拒否を示す `error.message` の接頭辞（DR-33 決定 1）。
 *
 * llama-server が JSON schema を grammar へ変換できなかったときの文言。後続に改行と詳細が続くため、
 * 正規表現ではなく `startsWith` で照合する。
 */
const _MARKER_RESPONSE_FORMAT_REJECTION = 'JSON schema conversion failed';

/**
 * TLS 証明書の検証失敗を示す、`fetch` の原因エラーメッセージ中の語（DR-26 決定 1）。
 *
 * Deno が用いる rustls の文言。自己署名証明書のサーバへ `fetch` して実測した
 * `... client error (Connect): invalid peer certificate: Other(...)` に由来する。
 */
const _MARKER_TLS_VERIFICATION_FAILURE = 'invalid peer certificate';

// status failures（error-handling §4.1 Step 2〜5）
/**
 * Step 2 / R-002: 429 はレート制限、503 / 504 はモデルロード・キュー詰まり等による一時的な過負荷。
 * 恒久的な失敗と区別して呼び出し元の並列実行の中断ロジックへ伝えるため `RateLimit` に写像する（DD-01 / DR-18）。
 */
const _FAILURE_OVERLOADED: _StatusFailure = { subindex: 'RateLimit', message: 'llama backend is overloaded' };

/**
 * Step 3 / R-006: 404 はパスにエンドポイントが無い、501 はサーバが操作を実装していない。
 * 後続の呼び出しも同じ結果になるため中断側として扱う（DR-18）。
 */
const _FAILURE_ENDPOINT_NOT_IMPLEMENTED: _StatusFailure = {
  subindex: 'BackendUnavailable',
  message: 'llama endpoint is not implemented',
};

/**
 * Step 4 / R-007: 401 は認証情報が無い・無効、403 は認証情報では許可されない操作。
 * 仕様 §2 Assumptions の「認証を要求しない構成」という前提が崩れた場合にあたり、設定を変えない限り
 * 後続もすべて失敗するため中断側として扱う（DR-18）。404 や到達不能と読み分けられるよう
 * メッセージに前提の崩れを記す（Edge error-handling-9）。
 */
const _FAILURE_AUTH_REQUIRED: _StatusFailure = {
  subindex: 'BackendUnavailable',
  message: 'llama backend requires authentication, but the configuration assumes no authentication',
};

/**
 * Step 5 / R-008: 400 のうち本文から `response_format` の拒否と判別できたものだけを中断側にする（DR-33）。
 * 判別できないものは Step 6 で続行側の `ExitFailure` になる。
 */
const _FAILURE_RESPONSE_FORMAT_REJECTED: _StatusFailure = {
  subindex: 'ResponseFormatRejected',
  message: 'llama backend rejected the requested response_format',
  // 関数は定数より後方で定義される const のため、評価時の TDZ を避けて呼び出し時に参照する
  matches: (raw) => _isResponseFormatRejection(raw),
};

/** 中断側に写像する HTTP ステータスの表（error-handling §4.1 Step 2〜5）。ここに無いステータスは Step 6 へ落ちる */
const _FAILURE_BY_STATUS: Readonly<Record<number, _StatusFailure>> = {
  400: _FAILURE_RESPONSE_FORMAT_REJECTED,
  401: _FAILURE_AUTH_REQUIRED,
  403: _FAILURE_AUTH_REQUIRED,
  404: _FAILURE_ENDPOINT_NOT_IMPLEMENTED,
  429: _FAILURE_OVERLOADED,
  501: _FAILURE_ENDPOINT_NOT_IMPLEMENTED,
  503: _FAILURE_OVERLOADED,
  504: _FAILURE_OVERLOADED,
};

// ─── Response interpretation（error-handling §4.1 Step 2〜7）

/**
 * HTTP 400 の応答本文が `response_format` の拒否を示すかを判定する（error-handling §4.1 Step 5 / R-008）。
 *
 * 本文を JSON として parse でき、`error.message` が文字列で、かつ
 * `JSON schema conversion failed` で始まる場合だけを拒否と判別する（DR-33 決定 1）。
 * `error.type` は判別に使わない。`messages` 欠落など入力起因の 400 も同じ `invalid_request_error` を
 * 返すため（DR-33 決定 2）。`response_format type must be one of` も本コードベースから到達しないため
 * 条件に含めない（DR-33 決定 3）。
 *
 * 本文が JSON でない・`error.message` が無いか文字列でない・接頭辞が一致しない場合は `false` を返し、
 * Step 6 の `ExitFailure`（続行）へ落とす。例外は投げない（DR-33 決定 4 / DR-18 決定 1）。
 *
 * 判別条件は実測したサーバビルドの文言に依存する。llama.cpp server のビルドを変えるときは、
 * 測定レポート §4 の手順で文言を再確認する（DR-33 決定 5）。
 *
 * @param body - HTTP 400 応答の生本文
 * @returns `response_format` の拒否と判別できれば `true`
 * @see docs/.deckrd/libs/ai-backend/decision-records.md DR-33
 * @see docs/.deckrd/libs/ai-backend/workspaces/measurements-response-format-rejection-2026-09-15.md
 */
const _isResponseFormatRejection = (body: string): boolean => {
  let _payload: unknown;
  try {
    _payload = JSON.parse(body);
  } catch {
    return false;
  }
  const _message = (_payload as { error?: { message?: unknown } | null } | null)?.error?.message;
  return typeof _message === 'string' && _message.startsWith(_MARKER_RESPONSE_FORMAT_REJECTION);
};

/**
 * HTTP ステータスを失敗分類へ写像し、非成功なら throw する（error-handling §4.1 Step 2〜6）。
 *
 * Step 2〜5 は `_FAILURE_BY_STATUS` をステータスで引き、該当すれば（本文判定を持つものはそれも満たせば）
 * 中断側として throw する。本文の形によらずステータスで打ち切る。
 * 中断側（`RateLimit` / `BackendUnavailable` / `ResponseFormatRejected`）に当たらない非成功ステータス
 * （判別できない 400 や 3xx を含む）は、Step 6 で続行側の `ExitFailure` になる（R-003 / DR-18）。
 *
 * @param response - chat completions の応答
 * @param raw - 応答の生本文（Step 5 の判別に使う）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'RateLimit'`（中断側、Step 2）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'BackendUnavailable'`（中断側、Step 3 / Step 4）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ResponseFormatRejected'`（中断側、Step 5）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ExitFailure'`（続行側、Step 6）
 */
const _assertSuccessStatus = (response: Response, raw: string): void => {
  const _status = response.status;
  // Step 2〜5: 表に該当し、本文判定を持つ場合はそれも満たすときだけ中断側にする
  const _failure = _FAILURE_BY_STATUS[_status];
  if (_failure && (_failure.matches?.(raw) ?? true)) {
    throw new ChatlogError('AiError', _failure.subindex, `${_failure.message}: HTTP ${_status}`);
  }

  // Step 6 / R-003: 上記いずれにも該当しない非成功ステータスは続行側（DR-18）。
  if (!response.ok) {
    throw new ChatlogError('AiError', 'ExitFailure', `llama request failed: HTTP ${_status}`);
  }
};

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
 * 成功応答の本文を JSON として解釈する（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
 *
 * `Content-Type` が JSON 系でない・ヘッダが欠落している・本文を JSON として parse できない場合は、
 * サーバが送信したフィールドを honour しておらず後続の呼び出しも同じ結果になるため、
 * 中断側の `BackendUnavailable` として throw する。
 *
 * @param response - chat completions の応答（ステータス分類済み）
 * @param raw - 応答の生本文
 * @returns JSON パース済みの応答ボディ
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'BackendUnavailable'`（中断側）
 */
const _parseJsonResponse = (response: Response, raw: string): unknown => {
  const _contentType = response.headers.get('Content-Type');
  if (!_isJsonContentType(_contentType)) {
    throw new ChatlogError(
      'AiError',
      'BackendUnavailable',
      `llama response Content-Type is not JSON: ${_contentType ?? '(missing)'}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ChatlogError('AiError', 'BackendUnavailable', 'llama response body is not valid JSON');
  }
};

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
 * Step 2〜6 のステータス分類は `_assertSuccessStatus`、Step 6.5 のゲートは `_parseJsonResponse`、
 * Step 7 の本文解釈は `_extractAssistantText`（R-004）が担う。
 *
 * Step 6.5 で本文を JSON として parse できた直後、Step 7 の前に `onPayload` を呼ぶ。
 * Step 7 で失敗する応答の診断（`formatLlamaFailureDiagnostics`）に parse 済み本文を渡すためで、
 * 分類と throw には影響しない（gh-528）。
 *
 * @param response - chat completions の応答
 * @param onPayload - parse 済み応答本文を受け取るコールバック。Step 6.5 を通過した場合のみ 1 回呼ばれる
 * @returns `choices[0]` のアシスタントテキスト
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'RateLimit'`（中断側、Step 2）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'BackendUnavailable'`（中断側、Step 3 / Step 4 / Step 6.5）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ResponseFormatRejected'`（中断側、Step 5）
 * @throws {ChatlogError} `kind: 'AiError'` / `subindex: 'ExitFailure'`（続行側、Step 6 / Step 7）
 */
export const interpretLlamaResponse = async (
  response: Response,
  onPayload?: (payload: unknown) => void,
): Promise<string> => {
  let _raw = '';
  try {
    _raw = await response.text();
  } catch {
    // 本文を取得できない場合もステータスによる分類（Step 2〜6）は成立する。
    // 成功ステータスなら空文字が Step 6.5 の JSON.parse で SyntaxError となり
    // BackendUnavailable に落ちる（サーバが本文を送り切れなかったことの正しい分類）。
  }

  _assertSuccessStatus(response, _raw);
  const _payload = _parseJsonResponse(response, _raw);
  onPayload?.(_payload);
  return _extractAssistantText(_payload);
};

// ─── Fetch failure mapping（error-handling §4.1 Step 1）

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
    error instanceof Deno.errors.NotCapable || error.message.includes(_MARKER_TLS_VERIFICATION_FAILURE)
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

// ─── Failure diagnostics（debug 用, gh-528）

/**
 * debug 時の失敗診断用に、parse 済み応答本文を 1 行の文字列へまとめる（gh-528）。
 *
 * `finish_reason=length` による打ち切りで `max_tokens` を見直す根拠を取るため、
 * `usage.completion_tokens` と打ち切られた本文を突き合わせられるよう、
 * `max_tokens`・`finish_reason`・`completion_tokens`・`content` 全文をこの順で並べる。
 * `completion_tokens` が数値でない（`usage` 欠落を含む）場合と `content` が文字列でない場合は `(missing)` と示す。
 * `content` は切り詰めずに `JSON.stringify` で引用・エスケープし、改行を含んでも 1 行に収める。
 *
 * @param payload - JSON パース済みの応答ボディ
 * @param maxTokens - リクエストに指定した `max_tokens`
 * @returns 診断用の 1 行文字列
 */
export const formatLlamaFailureDiagnostics = (payload: unknown, maxTokens: number): string => {
  const _body = payload as LlamaResponseBody | null | undefined;
  const _choice = _body?.choices?.[0];
  const _content = _choice?.message?.content;
  const _completionTokens = _body?.usage?.completion_tokens;
  const _tokensText = typeof _completionTokens === 'number' ? String(_completionTokens) : '(missing)';
  const _contentText = typeof _content === 'string' ? JSON.stringify(_content) : '(missing)';
  return `max_tokens=${maxTokens} finish_reason=${_choice?.finish_reason} completion_tokens=${_tokensText} content=${_contentText}`;
};

/**
 * debug 時の失敗診断用に、parse 済み応答本文の `usage`・`finish_reason`・`message` を生のまま 1 行の JSON にする（gh-528）。
 *
 * `formatLlamaFailureDiagnostics` が数値・文字列に絞って出す項目を補い、`usage` 全体と
 * `message` 全体（`tool_calls` 等の `content` 以外のキーを含む）をサーバ応答のまま残す。
 * 欠落した項目は `JSON.stringify` によりキーごと省かれる。
 *
 * @param payload - JSON パース済みの応答ボディ
 * @returns 診断用の 1 行 JSON 文字列
 */
export const formatLlamaFailureRawResponse = (payload: unknown): string => {
  const _body = payload as LlamaResponseBody | null | undefined;
  const _choice = _body?.choices?.[0];
  return JSON.stringify({ usage: _body?.usage, finish_reason: _choice?.finish_reason, message: _choice?.message });
};
