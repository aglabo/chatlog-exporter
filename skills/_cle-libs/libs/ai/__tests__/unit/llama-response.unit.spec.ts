// src: skills/_cle-libs/libs/ai/__tests__/unit/llama-response.unit.spec.ts
// @(#): llama 応答解釈関数 ユニットテスト
//       対象: interpretLlamaResponse / mapLlamaFetchFailure
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertFalse, assertRejects, assertStringIncludes, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { interpretLlamaResponse, mapLlamaFetchFailure } from '../../llama-response.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
// types
import type { LlamaResponseBody } from '../../../../types/llama-response.types.ts';

// ─── Internal Helpers

// constants
/** 共通フィクスチャ: 成功応答に載せるアシスタントテキスト。 */
const _CONTENT = 'This log belongs to the chatlog-exporter project.';

/** 共通フィクスチャ: 複数候補応答の `choices[0]` に載せる、採用されるべきテキスト。 */
const _CONTENT_FIRST = 'Only the first choice is adopted.';

/** 共通フィクスチャ: `choices[1]` 以降に載せる、採用されてはならないテキスト。 */
const _CONTENT_SECOND = 'This text must never be returned.';

/** 共通フィクスチャ: 非 ASCII（日本語・全角記号・絵文字）を含むアシスタントテキスト。 */
const _CONTENT_NON_ASCII = '分類結果は「開発ログ」です。全角記号（〜・※）と絵文字 🧪 を含みます。';

/** 共通フィクスチャ: 成功応答の `Content-Type`（サーバが返す形に合わせ charset を明示する）。 */
const _CONTENT_TYPE_JSON_UTF8 = 'application/json; charset=utf-8';

// types
/** 異常系ケース 1 件分の定義（テスト ID・ケース説明・応答本文）。 */
type _ExtractFailureCase = {
  /** テスト ID。 */
  id: string;
  /** `it` ラベルに埋め込むケース説明。 */
  label: string;
  /** 成功ステータスの応答に載せる chat completions 応答本文。 */
  body: LlamaResponseBody;
};

// constants
/**
 * アシスタントテキストを取り出せない応答のケース表（error-handling §4.1 R-004 条件 a〜d）。
 *
 * いずれも成功ステータス（200）で、`ChatlogError(AiError / ExitFailure)` に分類される。
 */
const _EXTRACT_FAILURE_CASES: _ExtractFailureCase[] = [
  {
    id: 'T-LIB-AI-LRI-09-01',
    label: 'choices フィールドが無い（条件 a）',
    body: {},
  },
  {
    id: 'T-LIB-AI-LRI-09-02',
    label: 'choices が空配列（条件 a）',
    body: { choices: [] },
  },
  {
    id: 'T-LIB-AI-LRI-09-03',
    label: 'choices[0].message.content が null（条件 b）',
    body: { choices: [{ message: { content: null }, finish_reason: 'stop' }] },
  },
  {
    // `tool_calls` 中心の応答も `content` が文字列でない本文として同じ経路に落ちる。
    id: 'T-LIB-AI-LRI-09-04',
    label: 'choices[0].message.content が配列（条件 c）',
    body: { choices: [{ message: { content: [{ type: 'text', text: _CONTENT }] }, finish_reason: 'stop' }] },
  },
  {
    // 正常値は `stop` のみ。切り詰めを示す `length` を正常完了として受理しない（DR-15）。
    id: 'T-LIB-AI-LRI-09-05',
    label: 'finish_reason が "length"（条件 d）',
    body: { choices: [{ message: { content: _CONTENT }, finish_reason: 'length' }] },
  },
  {
    // 要素が `null` の場合、ガードを `undefined` 限定にすると素の TypeError が漏れる（条件 a）。
    id: 'T-LIB-AI-LRI-09-06',
    label: 'choices[0] が null（条件 a）',
    body: { choices: [null] },
  },
];

/**
 * `finish_reason` の境界値ケース表（error-handling §4.1 R-004 条件 d）。
 *
 * 正常値は `stop` のみで、実装固有値も「`stop` 以外」として同じ経路に落ちる。
 * いずれも成功ステータス（200）・`content` は正常なテキストであり、
 * `finish_reason` だけが失敗要因となる。
 */
const _FINISH_REASON_EDGE_CASES: _ExtractFailureCase[] = [
  {
    // 正常値は `stop` のみ。実装固有の終了理由を正常完了として受理しない（§7 未決 #2）。
    id: 'T-LIB-AI-LRI-10-01',
    label: 'finish_reason が実装固有値 "eos"',
    body: { choices: [{ message: { content: _CONTENT }, finish_reason: 'eos' }] },
  },
  {
    // 値の存在を前提とせず `finish_reason !== 'stop'` で判定する（DR-26 決定 3）。
    id: 'T-LIB-AI-LRI-10-02-01',
    label: 'finish_reason が欠落',
    body: { choices: [{ message: { content: _CONTENT } }] },
  },
  {
    id: 'T-LIB-AI-LRI-10-02-02',
    label: 'finish_reason が null',
    body: { choices: [{ message: { content: _CONTENT }, finish_reason: null }] },
  },
];

// functions
/**
 * 成功ステータス（200）の chat completions 応答を組み立てる。
 *
 * 実ネットワークアクセスを起こさないため `Response` を直接構築する（AC-013）。
 *
 * @param body - 応答本文として載せる chat completions 応答オブジェクト
 * @returns status 200・`Content-Type: application/json; charset=utf-8` の `Response`
 */
const _successResponse = (body: LlamaResponseBody): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': _CONTENT_TYPE_JSON_UTF8 },
  });

/**
 * `choices[0].message.content` に指定テキストを載せた成功応答を組み立てる。
 *
 * @param content - `choices[0]` のアシスタントテキスト
 * @returns status 200 の `Response`
 */
const _singleChoiceResponse = (content: string): Response =>
  _successResponse({ choices: [{ message: { content }, finish_reason: 'stop' }] });

/**
 * 応答本文を UTF-8 バイト列へ符号化した成功応答を組み立てる。
 *
 * `JSON.stringify` した JS 文字列をそのまま渡すと復号経路を通らないため、
 * `TextEncoder` が作るバイト列から `Response` を構築する（transport R-008 / AC-021）。
 *
 * @param body - 応答本文として載せる chat completions 応答オブジェクト
 * @returns 本文を UTF-8 バイト列として持つ status 200 の `Response`
 */
const _encodedResponse = (body: LlamaResponseBody): Response =>
  new Response(new TextEncoder().encode(JSON.stringify(body)), {
    status: 200,
    headers: { 'Content-Type': _CONTENT_TYPE_JSON_UTF8 },
  });

// constants
/** 共通フィクスチャ: SSE 形式の応答本文（`stream: false` を無視したサーバが返す、JSON として parse できない本文）。 */
const _SSE_BODY_TEXT = 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: [DONE]\n\n';

/** 共通フィクスチャ: Step 7 を通ればテキストが返る、正常な chat completions 応答本文の JSON 文字列。 */
const _VALID_BODY_TEXT = JSON.stringify({ choices: [{ message: { content: _CONTENT }, finish_reason: 'stop' }] });

// types
/** Step 6.5 で中断される応答 1 件分の定義（テスト ID・ケース説明・ヘッダ・本文）。 */
type _ContentTypeFailureCase = {
  /** テスト ID。 */
  id: string;
  /** `it` ラベルに埋め込むケース説明。 */
  label: string;
  /** 応答に載せる `Content-Type`。`null` はヘッダ欠落を表す。 */
  contentType: string | null;
  /** 応答本文（生文字列）。 */
  bodyText: string;
  /** 他の失敗経路と取り違えないためにメッセージに含まれるべき語。 */
  messageIncludes: string;
};

// constants
/**
 * 成功ステータスだが Step 6.5 で中断される応答のケース表（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
 *
 * いずれも `ChatlogError(AiError / BackendUnavailable)`（中断側）に分類される。
 */
const _CONTENT_TYPE_FAILURE_CASES: _ContentTypeFailureCase[] = [
  {
    // `stream: false` を無視して SSE を返すサーバは、JSON を名乗っても本文を parse できない。
    id: 'T-LIB-AI-LRI-08-01',
    label: 'Content-Type は JSON 系だが本文が JSON として parse できない',
    contentType: _CONTENT_TYPE_JSON_UTF8,
    bodyText: _SSE_BODY_TEXT,
    messageIncludes: 'not valid JSON',
  },
  {
    // 本文は Step 7 を通れる正常な JSON にしておき、ヘッダ検査だけが失敗要因となるようにする。
    id: 'T-LIB-AI-LRI-08-02',
    label: 'Content-Type が text/event-stream',
    contentType: 'text/event-stream',
    bodyText: _VALID_BODY_TEXT,
    messageIncludes: 'Content-Type',
  },
  {
    // 本文は Step 7 を通ればテキストが返る正常な JSON。それでも中断することで Step 7 へ進まないことを示す。
    id: 'T-LIB-AI-LRI-08-03',
    label: 'Content-Type ヘッダが欠落している',
    contentType: null,
    bodyText: _VALID_BODY_TEXT,
    messageIncludes: 'Content-Type',
  },
];

// functions
/**
 * 任意の `Content-Type` と生本文を持つ成功ステータス（200）応答を組み立てる。
 *
 * 実ネットワークアクセスを起こさないため `Response` を直接構築する（AC-013）。
 * `contentType` が `null` の場合は、`Response` が自動付与する `text/plain` を削除して
 * ヘッダ欠落の応答を再現する。
 *
 * @param bodyText - 応答本文（生文字列。JSON として不正でもよい）
 * @param contentType - 応答に載せる `Content-Type`。`null` はヘッダ欠落
 * @returns status 200 の `Response`
 */
const _responseWithContentType = (bodyText: string, contentType: string | null): Response => {
  const _response = new Response(bodyText, { status: 200 });
  if (contentType === null) {
    _response.headers.delete('Content-Type');
  } else {
    _response.headers.set('Content-Type', contentType);
  }
  return _response;
};

/**
 * ヘッダ受信後に本文ストリームが壊れた応答を組み立てる（error-handling §4.1 Step 6.5 / Step 2）。
 *
 * 実ネットワークアクセスを起こさず（AC-013）、`await response.text()` が reject する応答を
 * 再現するため、`start` で即 error する `ReadableStream` を本文に載せる。
 *
 * @param status - 応答に載せる HTTP ステータス
 * @returns 本文の読み取りが reject する `Response`
 */
const _brokenBodyResponse = (status: number): Response =>
  new Response(
    new ReadableStream({ start: (controller) => controller.error(new TypeError('connection reset')) }),
    { status, headers: { 'Content-Type': _CONTENT_TYPE_JSON_UTF8 } },
  );

// types
/** エンドポイント未実装を示す非成功ステータス 1 件分の定義（テスト ID・ステータス）。 */
type _UnimplementedStatusCase = {
  /** テスト ID。 */
  id: string;
  /** 応答に載せる HTTP ステータス。 */
  status: number;
};

// constants
/**
 * エンドポイント未実装を示す非成功ステータスのケース表（error-handling §4.1 Step 3 / R-006 / DR-18）。
 *
 * いずれも `ChatlogError(AiError / BackendUnavailable)`（中断側）に分類される。
 */
const _UNIMPLEMENTED_STATUS_CASES: _UnimplementedStatusCase[] = [
  { id: 'T-LIB-AI-LRI-04-01', status: 404 },
  { id: 'T-LIB-AI-LRI-04-02', status: 501 },
];

// types
/** 認証要求を示す非成功ステータス 1 件分の定義（テスト ID・ステータス）。 */
type _AuthRequiredStatusCase = {
  /** テスト ID。 */
  id: string;
  /** 応答に載せる HTTP ステータス。 */
  status: number;
};

// constants
/**
 * サーバが認証を要求していることを示す非成功ステータスのケース表（error-handling §4.1 Step 4 / R-007 / DR-18）。
 *
 * いずれも `ChatlogError(AiError / BackendUnavailable)`（中断側）に分類される。
 */
/**
 * 認証要求のメッセージに含まれるべき語（error-handling §4.1 Edge 9 / DR-18）。
 *
 * 前提（認証を要求しない構成）が崩れたことを示す語であり、Step 3（404 / 501）や
 * 到達不能のメッセージには現れない。文言全体に密結合しないよう部分文字列で検証する。
 */
const _AUTH_REQUIRED_MESSAGE_MARKER = 'requires authentication';

const _AUTH_REQUIRED_STATUS_CASES: _AuthRequiredStatusCase[] = [
  { id: 'T-LIB-AI-LRI-05-01', status: 401 },
  { id: 'T-LIB-AI-LRI-05-02', status: 403 },
];

// types
/** 過負荷系を示す非成功ステータス 1 件分の定義（テスト ID・ステータス）。 */
type _RateLimitStatusCase = {
  /** テスト ID。 */
  id: string;
  /** 応答に載せる HTTP ステータス。 */
  status: number;
};

// constants
/** 共通フィクスチャ: 過負荷時にゲートウェイが返す HTML エラーページ本文（JSON として parse できない）。 */
const _GATEWAY_ERROR_BODY_TEXT = '<html><body><h1>Service Unavailable</h1></body></html>';

/** 共通フィクスチャ: 上記 HTML エラーページの `Content-Type`（JSON 系ではない）。 */
const _CONTENT_TYPE_HTML = 'text/html; charset=utf-8';

/**
 * 過負荷系として `RateLimit` に分類される非成功ステータスのケース表（error-handling §4.1 Step 2 / R-002 / DD-01）。
 *
 * いずれも `ChatlogError(AiError / RateLimit)`（中断側）に分類される。
 */
const _RATE_LIMIT_STATUS_CASES: _RateLimitStatusCase[] = [
  { id: 'T-LIB-AI-LRI-03-01', status: 429 },
  { id: 'T-LIB-AI-LRI-03-02', status: 503 },
  { id: 'T-LIB-AI-LRI-03-03', status: 504 },
];

// types
/** 続行側へ落とす非成功ステータス 1 件分の定義（テスト ID・ケース説明・ステータス）。 */
type _OtherFailureStatusCase = {
  /** テスト ID。 */
  id: string;
  /** `it` ラベルに埋め込むケース説明。 */
  label: string;
  /** 応答に載せる HTTP ステータス。 */
  status: number;
};

// constants
/**
 * R-002・R-006〜R-008 のいずれにも該当しない非成功ステータスのケース表
 * （error-handling §4.1 Step 6 / R-003 / DR-18）。
 *
 * いずれも `ChatlogError(AiError / ExitFailure)`（続行側）に分類される。
 * 400 は「`response_format` の拒否と判別できない 400」にあたり、中断側の
 * `ResponseFormatRejected` ではなく続行側へ落とすという既定を固定する
 * （implementation.md §3.2）。
 */
const _OTHER_FAILURE_STATUS_CASES: _OtherFailureStatusCase[] = [
  {
    id: 'T-LIB-AI-LRI-07-01',
    label: 'HTTP 400 だが response_format の拒否と判別できない',
    status: 400,
  },
  {
    id: 'T-LIB-AI-LRI-07-02',
    label: 'HTTP 500（R-002・R-006〜R-008 のいずれにも該当しない）',
    status: 500,
  },
];

// functions
/**
 * 指定した HTTP ステータスの応答を組み立てる。
 *
 * 実ネットワークアクセスを起こさないため `Response` を直接構築する（AC-013）。
 * 既定の本文は Step 6.5 のゲートも Step 7 の本文解釈も通る正常な JSON にしてあり、
 * ステータス分類だけが失敗要因となるようにする。
 * 本文・`Content-Type` を上書きすると、Step 6.5 で中断される応答としてステータス分類の
 * 評価順を検証できる。
 *
 * @param status - 応答に載せる HTTP ステータス
 * @param bodyText - 応答本文（既定は正常な chat completions 応答の JSON）
 * @param contentType - 応答に載せる `Content-Type`（既定は JSON 系）
 * @returns 指定ステータスの `Response`
 */
const _responseWithStatus = (
  status: number,
  bodyText: string = _VALID_BODY_TEXT,
  contentType: string = _CONTENT_TYPE_JSON_UTF8,
): Response =>
  new Response(bodyText, {
    status,
    headers: { 'Content-Type': contentType },
  });

// ─── Tests

/**
 * `interpretLlamaResponse` の成功経路テスト。
 *
 * transport R-007 / error-handling R-004 に基づき、成功応答から `choices[0]` の
 * アシスタントテキストを取り出して返すことを検証する。
 *
 * あわせて transport R-007 / AC-017 に基づき `choices[1]` 以降を無視すること、
 * transport R-008（§4.2）/ AC-021 に基づき非 ASCII を含む応答本文が
 * UTF-8 として復号され欠落しないことを検証する。
 *
 * 異常系は error-handling §4.1 Step 7 / R-004 に基づき、成功ステータスでも
 * アシスタントテキストを取り出せない応答が `AiError` / `ExitFailure` に分類されることを検証する。
 * あわせて error-handling §4.1 Step 6.5 / DR-26 決定 2 に基づき、`Content-Type` が JSON 系でない・
 * ヘッダが欠落している・本文を parse できない応答が、Step 7 へ進まず
 * `AiError` / `BackendUnavailable`（中断側）に分類されることを検証する。
 * HTTP ステータス分類は error-handling §4.1 Step 2 / R-002 / DD-01 の 429 / 503 / 504 と、
 * Step 3 / R-006 / DR-18 の 404 / 501、Step 4 / R-007 / DR-18 の 401 / 403 を扱う。
 * 401 / 403 は Edge error-handling-9 に基づき、メッセージに前提（認証を要求しない構成）の崩れが
 * 記録されることまで検証する。
 * あわせて error-handling §4.1 Step 6 / R-003 / DR-18 に基づき、上記いずれにも該当しない
 * 非成功ステータス（判別できない 400 を含む）が続行側の `ExitFailure` に分類されることを検証する。
 * Step 5（`ResponseFormatRejected`）は判別条件が未確定で到達しないため本ファイルでは検証しない。
 *
 * エッジケースは error-handling §4.1 R-004 条件 d / DR-26 決定 3 に基づき、`finish_reason` が
 * 実装固有値・欠落・`null` のいずれでも「`stop` 以外」として同じ分類に落ちること、
 * および `Content-Type` にパラメータが付いていても、media type の大文字小文字が異なっていても
 * JSON 系として受理されることを検証する（RFC 9110 §8.3.1）。
 *
 * テスト ID: T-LIB-AI-LRI-01-01 〜 T-LIB-AI-LRI-01-03 / T-LIB-AI-LRI-03-01 〜 T-LIB-AI-LRI-03-03 /
 * T-LIB-AI-LRI-04-01 〜 T-LIB-AI-LRI-04-02 / T-LIB-AI-LRI-05-01 〜 T-LIB-AI-LRI-05-03 /
 * T-LIB-AI-LRI-07-01 〜 T-LIB-AI-LRI-07-02 / T-LIB-AI-LRI-08-01 〜 T-LIB-AI-LRI-08-06 / T-LIB-AI-LRI-09-01 〜 T-LIB-AI-LRI-09-06 /
 * T-LIB-AI-LRI-10-01 〜 T-LIB-AI-LRI-10-02-02
 *
 * @see interpretLlamaResponse
 */
describe('interpretLlamaResponse', () => {
  it('[Normal] T-LIB-AI-LRI-01-01: choices[0].message.content のテキストが返る', async () => {
    const _text = await interpretLlamaResponse(_singleChoiceResponse(_CONTENT));

    assertEquals(_text, _CONTENT);
  });

  // `choices[1]` 以降を採用すると別テキストが返り、このケースだけが落ちる（AC-017）。
  it('[Normal] T-LIB-AI-LRI-01-02: choices が 2 要素以上でも choices[0] のテキストだけが返る', async () => {
    const _response = _successResponse({
      choices: [
        { message: { content: _CONTENT_FIRST }, finish_reason: 'stop' },
        { message: { content: _CONTENT_SECOND }, finish_reason: 'stop' },
      ],
    });

    assertEquals(await interpretLlamaResponse(_response), _CONTENT_FIRST);
  });

  // `JSON.stringify` した JS 文字列を往復させるだけでは UTF-8 復号を通らないため、
  // バイト列から `Response` を組み立てる（transport R-008 / AC-021）。
  it('[Normal] T-LIB-AI-LRI-01-03: 非 ASCII を含む応答本文が UTF-8 で復号され元の文字列と一致する', async () => {
    const _response = _encodedResponse({
      choices: [{ message: { content: _CONTENT_NON_ASCII }, finish_reason: 'stop' }],
    });

    assertEquals(await interpretLlamaResponse(_response), _CONTENT_NON_ASCII);
  });

  /**
   * 成功ステータスだがアシスタントテキストを取り出せない応答のケース（error-handling §4.1 Step 7 / R-004）。
   *
   * フォールバック値を返さず `ChatlogError(kind: AiError, subindex: ExitFailure)` を
   * throw することを、R-004 条件 a〜d の各応答本文について検証する。
   */
  describe('When: 異常系', () => {
    for (const { id, label, body } of _EXTRACT_FAILURE_CASES) {
      it(`[Error] ${id}: ${label} → AiError/ExitFailure`, async () => {
        const _error = await assertRejects(() => interpretLlamaResponse(_successResponse(body)), ChatlogError);

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'ExitFailure');
      });
    }
  });

  /**
   * `finish_reason` の境界値ケース（error-handling §4.1 R-004 条件 d / DR-26 決定 3）。
   *
   * 成功ステータス・正常な `content` を持つ応答でも、`finish_reason` が `stop` 以外なら
   * `ChatlogError(kind: AiError, subindex: ExitFailure)` を throw することを検証する。
   * 失敗経路は条件 a〜d で同じ error class を投げるため、メッセージに `finish_reason` が
   * 含まれることまで確認し、他条件での失敗と取り違えないようにする。
   */
  describe('When: エッジケース', () => {
    for (const { id, label, body } of _FINISH_REASON_EDGE_CASES) {
      it(`[Edge] ${id}: ${label} → AiError/ExitFailure`, async () => {
        const _error = await assertRejects(() => interpretLlamaResponse(_successResponse(body)), ChatlogError);

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'ExitFailure');
        assertStringIncludes(_error.message, 'finish_reason');
      });
    }
  });
  /**
   * 成功ステータスだが応答が JSON でないケース（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
   *
   * `Content-Type` が JSON 系でない・ヘッダが欠落している・本文を parse できない場合は、
   * サーバが `stream: false` を honour していないことを示すため `BackendUnavailable`（中断側）とし、
   * Step 7 の本文解釈へ進まないことを検証する。
   * 本文の読み取り自体が reject する場合も、素の `TypeError` を漏らさず空文字として Step 6.5 の
   * `JSON.parse` に落ち、同じ `BackendUnavailable` に分類されることを併せて検証する。
   */
  describe('When: 異常系 (Content-Type / JSON parse)', () => {
    for (const { id, label, contentType, bodyText, messageIncludes } of _CONTENT_TYPE_FAILURE_CASES) {
      it(`[Error] ${id}: ${label} → AiError/BackendUnavailable`, async () => {
        const _error = await assertRejects(
          () => interpretLlamaResponse(_responseWithContentType(bodyText, contentType)),
          ChatlogError,
        );

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'BackendUnavailable');
        assertStringIncludes(_error.message, messageIncludes);
      });
    }

    // 本文を読めない場合に素の `TypeError` が漏れると、呼び出し元は `kind` で分岐できない（DR-18 決定 1）。
    it('[Error] T-LIB-AI-LRI-08-05: 本文ストリームが error する → AiError/BackendUnavailable', async () => {
      const _error = await assertRejects(() => interpretLlamaResponse(_brokenBodyResponse(200)), ChatlogError);

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'BackendUnavailable');
    });
  });

  /**
   * `Content-Type` の受理レンジの境界ケース（error-handling §4.1 Step 6.5 / DR-26 決定 2）。
   *
   * media type にパラメータ（`; charset=utf-8`）が付いていても、media type の大文字小文字が
   * 異なっていても（RFC 9110 §8.3.1）JSON 系として受理し、
   * Step 6.5 で中断せず Step 7 の本文解釈へ進むことを検証する。
   */
  describe('When: エッジケース (Content-Type 受理レンジ)', () => {
    // 受理判定を厳密一致に狭めると、このケースが `BackendUnavailable` へ落ちる。
    it('[Edge] T-LIB-AI-LRI-08-04: Content-Type に charset パラメータが付いていても Step 7 へ進む', async () => {
      const _response = _responseWithContentType(_VALID_BODY_TEXT, _CONTENT_TYPE_JSON_UTF8);

      assertEquals(await interpretLlamaResponse(_response), _CONTENT);
    });

    // RFC 9110 §8.3.1 により media type は case-insensitive。区別すると準拠サーバを中断してしまう。
    it('[Edge] T-LIB-AI-LRI-08-06: media type の大文字小文字が異なっていても Step 7 へ進む', async () => {
      const _response = _responseWithContentType(_VALID_BODY_TEXT, 'Application/JSON; charset=utf-8');

      assertEquals(await interpretLlamaResponse(_response), _CONTENT);
    });
  });

  /**
   * エンドポイント未実装を示す非成功ステータスのケース（error-handling §4.1 Step 3 / R-006 / DR-18）。
   *
   * エンドポイントを実装していないことを示し後続の呼び出しも同じ結果になるため、
   * `BackendUnavailable`（中断側）に分類することを検証する。
   * 本文・`Content-Type` は正常な応答と同じにしてあるため、Step 3 を落とすと
   * Step 6.5 でも Step 7 でも中断されず、テキストが返ってこのケースだけが落ちる。
   * 他の `BackendUnavailable` 経路と取り違えないよう、メッセージにステータスが載ることまで確認する。
   *
   * あわせて error-handling §4.1 Step 2 / R-002 / DD-01 に基づき、過負荷系ステータス
   * （429 / 503 / 504）が中断側の `RateLimit` に分類されることを検証する。
   * 過負荷系のケースは本文・`Content-Type` を非 JSON にしてあるため、ステータス分類を
   * Step 6.5 より後ろに置くと `BackendUnavailable` へ落ちてこれらのケースだけが失敗する。
   *
   * さらに error-handling §4.1 Step 4 / R-007 / DR-18 に基づき、認証要求を示すステータス
   * （401 / 403）が中断側の `BackendUnavailable` に分類されることを検証する。
   * 本文・`Content-Type` は正常な応答と同じにしてあるため、Step 4 を落とすと throw 自体が起きず、
   * Step 6.5 の経路で偶然通ってしまうことはない。
   */
  describe('When: 異常系 (HTTP ステータス)', () => {
    for (const { id, status } of _UNIMPLEMENTED_STATUS_CASES) {
      it(`[Error] ${id}: HTTP ${status} → AiError/BackendUnavailable`, async () => {
        const _error = await assertRejects(
          () => interpretLlamaResponse(_responseWithStatus(status)),
          ChatlogError,
        );

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'BackendUnavailable');
        assertStringIncludes(_error.message, String(status));
      });
    }

    for (const { id, status } of _AUTH_REQUIRED_STATUS_CASES) {
      it(`[Error] ${id}: HTTP ${status} → AiError/BackendUnavailable`, async () => {
        const _error = await assertRejects(
          () => interpretLlamaResponse(_responseWithStatus(status)),
          ChatlogError,
        );

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'BackendUnavailable');
        assertStringIncludes(_error.message, String(status));
      });
    }

    // 前提崩れを示す語が無いと、認証要求を 404 や到達不能と読み分けられない（Edge error-handling-9）。
    it('[Error] T-LIB-AI-LRI-05-03: 認証要求の message に前提崩れが記録される', async () => {
      const _error = await assertRejects(
        () => interpretLlamaResponse(_responseWithStatus(401)),
        ChatlogError,
      );

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'BackendUnavailable');
      assertStringIncludes(_error.message, _AUTH_REQUIRED_MESSAGE_MARKER);
    });

    for (const { id, status } of _RATE_LIMIT_STATUS_CASES) {
      it(`[Error] ${id}: HTTP ${status} → AiError/RateLimit`, async () => {
        const _response = _responseWithStatus(status, _GATEWAY_ERROR_BODY_TEXT, _CONTENT_TYPE_HTML);
        const _error = await assertRejects(() => interpretLlamaResponse(_response), ChatlogError);

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'RateLimit');
        assertStringIncludes(_error.message, String(status));
      });
    }

    // 本文・`Content-Type` は正常な応答と同じにしてあるため、Step 6 を落とすと
    // テキストが返り、これらのケースだけが落ちる（Step 7 の ExitFailure と取り違えない）。
    for (const { id, label, status } of _OTHER_FAILURE_STATUS_CASES) {
      it(`[Error] ${id}: ${label} → AiError/ExitFailure`, async () => {
        const _error = await assertRejects(
          () => interpretLlamaResponse(_responseWithStatus(status)),
          ChatlogError,
        );

        assertEquals(_error.kind, 'AiError');
        assertEquals(_error.subindex, 'ExitFailure');
        assertStringIncludes(_error.message, String(status));
      });
    }
  });
});

// ─── Internal Helpers (mapLlamaFetchFailure)

// constants
/**
 * runtime 由来の失敗であることを示す、メッセージに含まれるべき語（DR-26 決定 1）。
 *
 * 権限不足・TLS 検証失敗をネットワーク到達不能と読み分けるための語であり、
 * 接続失敗のメッセージには現れてはならない。文言全体に密結合しないよう部分文字列で検証する。
 */
const _RUNTIME_FAILURE_MESSAGE_MARKER = 'Deno runtime';

/**
 * 実測した TLS 証明書検証失敗の `cause.message`（自己署名証明書のサーバへ `fetch` して観測）。
 *
 * `fetch` は transport 層の失敗を `TypeError: fetch failed` に包み、原因を `cause` に載せる。
 */
const _TLS_CAUSE_MESSAGE =
  'error sending request for url (https://127.0.0.1:54585/): client error (Connect): invalid peer certificate: Other(OtherError(CaUsedAsEndEntity))';

/** 実測した DNS 解決失敗の `cause.message`（存在しないホストへ `fetch` して観測）。 */
const _DNS_CAUSE_MESSAGE =
  'error sending request for url (http://this-host-does-not-exist.invalid/): client error (Connect): dns error';

// functions
/**
 * `fetch` が transport 層の失敗で reject したときの値を組み立てる。
 *
 * 実測どおり `TypeError: fetch failed` で包み、原因を `cause` に載せる。
 * 実ネットワークアクセスを起こさないため、reject 値を直接構築する（AC-013）。
 *
 * @param causeMessage - `cause` に載せる原因エラーのメッセージ
 * @returns `fetch` の reject 値と同じ形の `TypeError`
 */
const _fetchFailure = (causeMessage: string): TypeError =>
  new TypeError('fetch failed', { cause: new Error(causeMessage) });

// ─── Tests (mapLlamaFetchFailure)

/**
 * `mapLlamaFetchFailure` の失敗写像テスト。
 *
 * error-handling §4.1 Step 1 / R-001 / DR-18 に基づき、HTTP 応答が一切得られなかった失敗を
 * 中断側の `ChatlogError(kind: AiError, subindex: BackendUnavailable)` に写像することを検証する。
 * あわせて DR-26 決定 1 に基づき、Deno runtime 由来の失敗（権限不足・TLS 検証失敗）が
 * メッセージからネットワーク到達不能と読み分けられることを検証する。
 *
 * テスト ID: T-LIB-AI-LRI-02-01 〜 T-LIB-AI-LRI-02-03
 *
 * @see mapLlamaFetchFailure
 */
describe('mapLlamaFetchFailure', () => {
  /** HTTP 応答が一切得られなかった reject 値を受け取るケース。分類は常に中断側となる。 */
  describe('When: 異常系', () => {
    // runtime 由来マーカーを無条件に載せる実装だと、後段の否定 assertion だけが落ちる。
    it('[Error] T-LIB-AI-LRI-02-01: 接続失敗（DNS 解決失敗・到達不能）→ AiError/BackendUnavailable', () => {
      const _error = assertThrows(() => mapLlamaFetchFailure(_fetchFailure(_DNS_CAUSE_MESSAGE)), ChatlogError);

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'BackendUnavailable');
      assertFalse(_error.message.includes(_RUNTIME_FAILURE_MESSAGE_MARKER));

      // `Deno.errors.*` であることを runtime 由来の根拠にすると、この否定 assertion だけが落ちる。
      const _refused = assertThrows(
        () => mapLlamaFetchFailure(new Deno.errors.ConnectionRefused('tcp connect error: connection refused')),
        ChatlogError,
      );

      assertEquals(_refused.kind, 'AiError');
      assertEquals(_refused.subindex, 'BackendUnavailable');
      assertFalse(_refused.message.includes(_RUNTIME_FAILURE_MESSAGE_MARKER));
    });

    // 権限不足は `fetch` に包まれず `Deno.errors.NotCapable` が直接 reject 値になる（実測）。
    it('[Error] T-LIB-AI-LRI-02-02: 権限不足（Deno.errors.NotCapable）→ runtime 由来の AiError/BackendUnavailable', () => {
      const _reject = new Deno.errors.NotCapable(
        'Requires net access to "127.0.0.1:8123", run again with the --allow-net flag',
      );

      const _error = assertThrows(() => mapLlamaFetchFailure(_reject), ChatlogError);

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'BackendUnavailable');
      assertStringIncludes(_error.message, _RUNTIME_FAILURE_MESSAGE_MARKER);
    });

    // TLS 検証失敗は `TypeError: fetch failed` に包まれるため、`cause` を辿らないと判別できない（実測）。
    it('[Error] T-LIB-AI-LRI-02-03: TLS 検証失敗 → runtime 由来の AiError/BackendUnavailable', () => {
      const _error = assertThrows(() => mapLlamaFetchFailure(_fetchFailure(_TLS_CAUSE_MESSAGE)), ChatlogError);

      assertEquals(_error.kind, 'AiError');
      assertEquals(_error.subindex, 'BackendUnavailable');
      assertStringIncludes(_error.message, _RUNTIME_FAILURE_MESSAGE_MARKER);
    });
  });
});

// ─── Internal Helpers (llama 経路の失敗分類の不変条件)

// types
/** llama 経路の失敗 1 件分の定義（テスト ID・失敗条件の説明・失敗を起こす呼び出し）。 */
type _FailureKindCase = {
  /** テスト ID。 */
  id: string;
  /** `it` ラベルに埋め込む、対象の失敗条件（error-handling §4.1 の Step 番号を含む）。 */
  label: string;
  /**
   * 失敗を起こす呼び出し。
   *
   * `Response` の body は 1 度しか読めないため、応答は呼び出しのたびに内部で組み立てる。
   * `mapLlamaFetchFailure` は同期に throw するが、`assertRejects` で 1 本のループに揃えるため
   * すべて `async` にしてある。
   */
  run: () => Promise<unknown>;
};

// constants
/**
 * llama 経路が投げうる失敗を Step ごとに網羅したケース表
 * （error-handling §4.1 Step 1〜7 + Step 6.5 / DR-03 / DR-18 決定 1 / REQ-C-003）。
 *
 * `subindex` は Step ごとに異なるが、`kind` は一律 `AiError` でなければならない。
 * Step 5（`ResponseFormatRejected`）は判別条件が未確定で到達しないため含めない。
 */
const _FAILURE_KIND_CASES: _FailureKindCase[] = [
  {
    id: 'T-LIB-AI-LRI-11-01-01',
    label: 'Step 1 接続失敗（DNS 解決失敗）',
    run: () => Promise.resolve().then(() => mapLlamaFetchFailure(_fetchFailure(_DNS_CAUSE_MESSAGE))),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-02',
    label: 'Step 1 runtime 由来（TLS 検証失敗）',
    run: () => Promise.resolve().then(() => mapLlamaFetchFailure(_fetchFailure(_TLS_CAUSE_MESSAGE))),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-03',
    label: 'Step 2 過負荷（HTTP 429）',
    run: () => interpretLlamaResponse(_responseWithStatus(429)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-04',
    label: 'Step 3 エンドポイント未実装（HTTP 404）',
    run: () => interpretLlamaResponse(_responseWithStatus(404)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-05',
    label: 'Step 4 認証要求（HTTP 401）',
    run: () => interpretLlamaResponse(_responseWithStatus(401)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-06',
    label: 'Step 6 判別できない HTTP 400',
    run: () => interpretLlamaResponse(_responseWithStatus(400)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-07',
    label: 'Step 6 その他の非成功ステータス（HTTP 500）',
    run: () => interpretLlamaResponse(_responseWithStatus(500)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-08',
    label: 'Step 6.5 本文が JSON として parse できない',
    run: () => interpretLlamaResponse(_responseWithContentType(_SSE_BODY_TEXT, _CONTENT_TYPE_JSON_UTF8)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-09',
    label: 'Step 6.5 Content-Type が JSON 系でない',
    run: () => interpretLlamaResponse(_responseWithContentType(_VALID_BODY_TEXT, 'text/event-stream')),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-10',
    label: 'Step 7 choices が無い',
    run: () => interpretLlamaResponse(_successResponse({})),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-11',
    label: "Step 7 finish_reason が 'stop' 以外",
    run: () =>
      interpretLlamaResponse(
        _successResponse({ choices: [{ message: { content: _CONTENT }, finish_reason: 'length' }] }),
      ),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-12',
    label: 'Step 7 choices[0] が null',
    run: () => interpretLlamaResponse(_successResponse({ choices: [null] })),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-13',
    label: 'Step 6.5 本文ストリームが error する（HTTP 200）',
    run: () => interpretLlamaResponse(_brokenBodyResponse(200)),
  },
  {
    id: 'T-LIB-AI-LRI-11-01-14',
    label: 'Step 2 本文ストリームが error する（HTTP 503）',
    run: () => interpretLlamaResponse(_brokenBodyResponse(503)),
  },
];

// ─── Tests (llama 経路の失敗分類の不変条件)

/**
 * llama 経路が投げる失敗の `kind` を横断的に固定するテスト（DR-03 / DR-18 決定 1 / REQ-C-003）。
 *
 * 呼び出し元は `kind` で分岐し、`AiError` でない失敗は最後の分岐でフォールバック値へ落ちる。
 * llama 経路はフォールバック値を返さない決定であるため、Step 1〜7 + Step 6.5 のどの失敗条件でも
 * `kind` は一律 `AiError` でなければならない。Step ごとの `subindex` は個別ケースが固定済みで、
 * 本テストは `kind` の一様性だけを対象とする（重複ではなく、非 `AiError` を持ち込む変更に対する不変条件）。
 *
 * テスト ID: T-LIB-AI-LRI-11-01-01 〜 T-LIB-AI-LRI-11-01-14
 *
 * @see interpretLlamaResponse
 * @see mapLlamaFetchFailure
 */
describe('llama 経路の失敗分類', () => {
  /** どの Step で失敗しても呼び出し元の非 `AiError` フォールバック分岐へ落ちないことを見る。 */
  describe('When: エッジケース', () => {
    for (const { id, label, run } of _FAILURE_KIND_CASES) {
      it(`[Edge] ${id}: ${label} → kind は AiError`, async () => {
        const _error = await assertRejects(run, ChatlogError);

        assertEquals(_error.kind, 'AiError');
      });
    }
  });
});
