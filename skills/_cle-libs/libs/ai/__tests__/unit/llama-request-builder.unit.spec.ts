// src: skills/_cle-libs/libs/ai/__tests__/unit/llama-request-builder.unit.spec.ts
// @(#): llama リクエストボディ構築関数 ユニットテスト
//       対象: buildLlamaRequest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildLlamaRequest } from '../../llama-request-builder.ts';

// ─── Shared libraries
// classes
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Helpers (実装との一致を確かめる基準)
import { buildJsonSchema } from '../../json-schema-builder.ts';

// ─── Helpers
// types
import type { OutputContract } from '../../../../types/json-schema.types.ts';
import type { LlamaChatMessage } from '../../../../types/llama-request.types.ts';
import type { FetchProvider } from '../../../../types/providers.types.ts';

// ─── Internal Helpers

// constants
/** 共通フィクスチャ: provider prefix 付きのモデル指定文字列。 */
const _MODEL = 'llama/qwen3-8b';

/** 共通フィクスチャ: system ロールに載せるテキスト。 */
const _SYSTEM = 'You are a classifier.';

/** 共通フィクスチャ: user ロールに載せるテキスト。 */
const _USER = 'Classify this log.';

/** 共通フィクスチャ: 非 ASCII（日本語）を含む system テキスト。 */
const _SYSTEM_JA = 'あなたはチャットログの分類器です。';

/** 共通フィクスチャ: 非 ASCII（日本語・全角記号）を含む user テキスト。 */
const _USER_JA = 'このログを分類してください。全角記号（〜）も含みます。';

/** 共通フィクスチャ: テストダブルへ渡す送信先。実際のアクセスは発生しない。 */
const _ENDPOINT = 'http://localhost:8080/v1/chat/completions';

/** 共通フィクスチャ: `response_format` の元になる出力契約。 */
const _CONTRACT: OutputContract = {
  contract: 'yaml',
  properties: { title: { type: 'string' } },
  firstField: 'title',
};

// functions
/**
 * 構築結果の `body` を JSON として読み、オブジェクトとして取り出す。
 *
 * `body` が文字列でない場合、または JSON がオブジェクトでない場合はテストを失敗させる。
 *
 * @param init - `buildLlamaRequest` の戻り値
 * @returns ボディを表すオブジェクト
 */
const _bodyOf = (init: RequestInit): Record<string, unknown> => {
  assert(typeof init.body === 'string', `string body expected: ${String(init.body)}`);
  const _body: unknown = JSON.parse(init.body);
  assert(typeof _body === 'object' && _body !== null && !Array.isArray(_body), `object body expected: ${init.body}`);
  return _body as Record<string, unknown>;
};

/**
 * 構築結果の `body` から `response_format` オブジェクトを取り出す。
 *
 * `response_format` が存在しない、またはオブジェクトでない場合はテストを失敗させる。
 *
 * @param init - `buildLlamaRequest` の戻り値
 * @returns ボディに載っている `response_format` オブジェクト
 */
const _responseFormatOf = (init: RequestInit): Record<string, unknown> => {
  const _body = _bodyOf(init);
  const _responseFormat = _body.response_format;
  assert(
    typeof _responseFormat === 'object' && _responseFormat !== null && !Array.isArray(_responseFormat),
    `object response_format expected: ${String(_responseFormat)}`,
  );
  return _responseFormat as Record<string, unknown>;
};

/**
 * `response_format` から `json_schema` オブジェクトを取り出す。
 *
 * `json_schema` が存在しない、またはオブジェクトでない場合はテストを失敗させる。
 *
 * @param responseFormat - ボディに載っている `response_format`
 * @returns `response_format` に載っている `json_schema` オブジェクト
 */
const _jsonSchemaOf = (responseFormat: Record<string, unknown>): Record<string, unknown> => {
  const _jsonSchema = responseFormat.json_schema;
  assert(
    typeof _jsonSchema === 'object' && _jsonSchema !== null && !Array.isArray(_jsonSchema),
    `object json_schema expected: ${String(_jsonSchema)}`,
  );
  return _jsonSchema as Record<string, unknown>;
};

/**
 * 構築結果の `body` を JSON として読み、`messages` 配列を取り出す。
 *
 * `body` が文字列でない場合、または `messages` が配列でない場合はテストを失敗させる。
 *
 * @param init - `buildLlamaRequest` の戻り値
 * @returns ボディに載っている `messages` 配列
 */
const _messagesOf = (init: RequestInit): LlamaChatMessage[] => {
  assert(typeof init.body === 'string', `string body expected: ${String(init.body)}`);
  const _body: unknown = JSON.parse(init.body);
  assert(
    typeof _body === 'object' && _body !== null && 'messages' in _body && Array.isArray(_body.messages),
    `messages array expected: ${init.body}`,
  );
  return _body.messages as LlamaChatMessage[];
};

/**
 * テストダブルが受け取った `body` をバイト列として取り出し、UTF-8 として復号したうえで
 * JSON として読む。
 *
 * `body` を `Response` に載せてから `arrayBuffer()` で取り出すことで、`fetch` が送信時に行うのと
 * 同じ符号化を経たバイト列を得る。したがって `body` が文字列でもバイト列でも、
 * 比較対象は「送信されるバイト列を復号した結果」であり空虚な表明にならない。
 * 復号器は `fatal: true` とし、UTF-8 として不正なバイト列を黙って置換文字に落とさない。
 *
 * @param init - テストダブルが受け取った `RequestInit`
 * @returns ボディを UTF-8 復号して `JSON.parse` した結果のオブジェクト
 */
const _decodeBodyOf = async (init: RequestInit | undefined): Promise<Record<string, unknown>> => {
  assert(init?.body != null, `body expected: ${String(init?.body)}`);
  const _bytes = await new Response(init.body).arrayBuffer();
  const _decoded = new TextDecoder('utf-8', { fatal: true }).decode(_bytes);
  const _body: unknown = JSON.parse(_decoded);
  assert(typeof _body === 'object' && _body !== null && !Array.isArray(_body), `object body expected: ${_decoded}`);
  return _body as Record<string, unknown>;
};

/**
 * 受け取った `input` と `init` を記録するだけの `FetchProvider` テストダブルを作る。
 *
 * ネットワークアクセスは行わず、常に空ボディの 200 応答を返す。
 * 構築関数は `FetchProvider` を受け取らないため、ダブルへ渡すのはテスト側の手順である。
 *
 * @returns ダブル本体と、受け取った引数を順に積む記録配列
 */
const _createRecordingFetchProvider = (): {
  fetchProvider: FetchProvider;
  calls: { input: string | URL | Request; init?: RequestInit }[];
} => {
  const _calls: { input: string | URL | Request; init?: RequestInit }[] = [];
  return {
    fetchProvider: (input, init) => {
      _calls.push({ input, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    },
    calls: _calls,
  };
};

// ─── Tests

/**
 * `buildLlamaRequest` のユニットテストスイート。
 *
 * transport R-003 / AC-006 に基づき、system テキストと user テキストが
 * 別ロールの別メッセージ要素として構成され、連結されないことを検証する。
 * あわせて transport R-009 / DR-15 に基づき、ボディに載るフィールドが
 * `model` / `messages` / `stream` / `response_format` の 4 つに限られることを検証する。
 *
 * 本関数は構築のみを行い `FetchProvider` を受け取らないため、
 * 構築時点でネットワークアクセスは発生しない。
 *
 * あわせて structured-output R-001 / DR-04 に基づき、`response_format` が出力契約から
 * 組み立てた json_schema を含むことを検証する。
 *
 * さらに structured-output R-001 / DR-19 に基づき、出力契約を渡さない呼び出しが
 * 構築の時点で失敗し、送信物を作らないことを検証する。
 *
 * さらに transport R-008（§4.2）/ AC-021 / REQ-NF-003 に基づき、非 ASCII を含むプロンプトが
 * UTF-8 で往復して厳密に一致することを検証する。
 *
 * テスト ID: T-LIB-AI-LRQ-01-01 / T-LIB-AI-LRQ-01-02 / T-LIB-AI-LRQ-01-03 / T-LIB-AI-LRQ-01-04 /
 *           T-LIB-AI-LRQ-01-05 / T-LIB-AI-LRQ-01-06 / T-LIB-AI-LRQ-01-07 / T-LIB-AI-LRQ-01-08 /
 *           T-LIB-AI-LRQ-02-01 / T-LIB-AI-LRQ-03-01
 *
 * @see buildLlamaRequest
 */
describe('buildLlamaRequest', () => {
  // 連結した単一要素にすると length が 1 になり、このケースだけが落ちる（AC-006）。
  it('[Normal] T-LIB-AI-LRQ-01-01: messages が system 先・user 後の別ロール 2 要素になる', () => {
    const _messages = _messagesOf(
      buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assertEquals(_messages.length, 2);
    assertEquals(_messages[0], { role: 'system', content: _SYSTEM });
    assertEquals(_messages[1], { role: 'user', content: _USER });
  });

  // 生成パラメータを 1 つでも足すとキー集合の完全一致が崩れ、このケースだけが落ちる（R-009 / DR-15）。
  it('[Normal] T-LIB-AI-LRQ-01-02: body のキーが model / messages / stream / response_format の 4 つに限られる', () => {
    const _body = _bodyOf(
      buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assertEquals(Object.keys(_body).sort(), ['messages', 'model', 'response_format', 'stream']);
    assert(!('temperature' in _body), `temperature must be absent: ${Object.keys(_body).join(', ')}`);
    assert(!('top_p' in _body), `top_p must be absent: ${Object.keys(_body).join(', ')}`);
    assert(!('max_tokens' in _body), `max_tokens must be absent: ${Object.keys(_body).join(', ')}`);
  });

  // 省略やサーバ既定への委任だと 'stream' がキーとして現れず、このケースだけが落ちる（R-009 / DR-15）。
  it('[Normal] T-LIB-AI-LRQ-01-03: body の stream が false として明示される', () => {
    const _body = _bodyOf(
      buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assert('stream' in _body, `stream key must be present: ${Object.keys(_body).join(', ')}`);
    assertEquals(_body.stream, false);
  });

  // headers を載せないと `Content-Type` が null になり、このケースだけが落ちる（transport R-008 §4.2）。
  it('[Normal] T-LIB-AI-LRQ-01-04: FetchProvider へ渡した init の Content-Type が application/json; charset=utf-8 になる', async () => {
    const { fetchProvider, calls } = _createRecordingFetchProvider();
    const _init = buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT });

    await fetchProvider(_ENDPOINT, _init);

    assertEquals(calls.length, 1);
    assertEquals(new Headers(calls[0].init?.headers).get('Content-Type'), 'application/json; charset=utf-8');
  });

  // prefix 付きの指定値をそのまま載せると 'llama/qwen3-8b' になり、このケースだけが落ちる（R-009）。
  it('[Normal] T-LIB-AI-LRQ-01-05: body の model が provider prefix を除いた識別子になる', () => {
    const _body = _bodyOf(
      buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assertEquals(_body.model, 'qwen3-8b');
  });

  // 仮値 `response_format: {}` のままだと type が undefined になり、このケースだけが落ちる（R-001）。
  it('[Normal] T-LIB-AI-LRQ-01-06: response_format が出力契約から組み立てた json_schema を含む', () => {
    const _responseFormat = _responseFormatOf(
      buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assertEquals(_responseFormat.type, 'json_schema');

    // 期待値はテスト側で組み立て直さず、契約から json_schema を構築する唯一の経路の戻り値と比較する。
    const _jsonSchema = _jsonSchemaOf(_responseFormat);
    assertEquals(_jsonSchema.schema, buildJsonSchema(_CONTRACT));

    // 実測レポート（measurements-response-format-2026-09-12.md 20〜22 行）が準拠を確認したのは
    // `strict: true` を伴う場合であり、省略や false はその実測の外にある。
    assertEquals(_jsonSchema.strict, true);
  });

  // 実装から `method: 'POST'` の行を削除する変異を当てると、他の 8 ケースは全て pass したまま
  // このケースだけが落ちる（変異を実際に適用して確認済み）。全リクエストが GET へ落ちる変異は
  // 他のどのケースも検知しない（transport R-001 / DR-01: OpenAI 互換 chat completions は POST）。
  it('[Normal] T-LIB-AI-LRQ-01-07: 構築結果の method が POST になる', () => {
    const _init = buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER, outputContract: _CONTRACT });

    assertEquals(_init.method, 'POST');
  });

  // これは「望ましい仕様」ではなく **現在の契約** を記録するテストである。
  // `parseModel` が解決できない値に対する実装のフォールバックは「指定値をそのまま載せる」であり、
  // その結果 `model` には prefix が残る（R-009「prefix 除去」の直接の否定にあたる）。
  // ただし llama 経路は `getAiBackend(model) === 'llama'` を満たす値でしか到達しないため、
  // 実運用でこの分岐が発火する見込みは無い（`getAiBackend` は `parseModel` が null の値に対し
  // null を返す）。仕様を変える判断は別途行い、そのときはこのテストの期待値も更新する。
  // フォールバックを throw / 空文字列へ変異させると、このケースだけが落ちる（確認済み）。
  it('[Edge] T-LIB-AI-LRQ-01-08: parseModel が解決できないモデル値は指定値がそのまま載る', () => {
    // `unknown` は既知 provider ではなく、bare name のパターンにも一致しないため parseModel は null。
    const _unresolvable = 'unknown/foo';
    const _body = _bodyOf(
      buildLlamaRequest({ model: _unresolvable, system: _SYSTEM, user: _USER, outputContract: _CONTRACT }),
    );

    assertEquals(_body.model, _unresolvable);
  });

  // 契約未指定を `response_format: {}` で通すと throw が起きず、このケースだけが落ちる（R-001 / DR-19）。
  it('[Error] T-LIB-AI-LRQ-02-01: 出力契約が未指定の呼び出しは構築の時点で失敗し、送信物を作らない', () => {
    // 構築関数は `FetchProvider` を受け取らないため、ダブルは渡す対象が無いことを示すためだけに用意する。
    const { calls } = _createRecordingFetchProvider();

    const _error = assertThrows(
      () => buildLlamaRequest({ model: _MODEL, system: _SYSTEM, user: _USER }),
      ChatlogError,
    );

    // DR-18 決定 1: llama 経路が throw する `ChatlogError` の kind は一律 `AiError` とし、
    // 呼び出し元 catch の最終分岐（非 `AiError` → `DEFAULT_FALLBACK_*` の一括書き込み）へ
    // 落ちる経路を作らない。DR-18 が挙げる worked example（`llamaEndpoint` 設定漏れ）は
    // ネットワークアクセス前の設定誤りであり、本経路と同じクラスにあたる。
    // 契約渡し忘れの一次ゲートは DR-27 決定 3・4 の静的検査（production の `runAI(` 呼び出しを
    // 列挙して全件の契約指定を確かめる system テスト）であり、この throw はそれを前提にした
    // 最後の防御にあたる。DR-27 は実行時例外を静的検査の「代替」としては不採用としつつ、
    // 「静的検査をすり抜ける経路が現れた場合は再検討する」と明記している。§3.2 が本経路に
    // 当たる分類を持たないのは欠落ではなく、検査を仕様側の分類ではなく静的検査に置いた設計の帰結。
    // subindex は新設せず、契約定義自身の不備を続行側の `ResponseSchemaViolation` に固定した
    // `output-contract.ts` `_assertFirstField` と同じ扱いに揃える（DR-26）。
    // 中断側 4 分類は `abort-utils.ts` が単独所有するため増やさない。
    assertEquals(_error.kind, 'AiError');
    assertEquals(_error.subindex, 'ResponseSchemaViolation');

    // 構築が throw した以上、`FetchProvider` へ渡す送信物は存在しない。
    assertEquals(calls.length, 0);
  });

  // 非 ASCII をエスケープや別符号化へ落とすと復号結果の content が一致せず、このケースだけが落ちる
  // （transport R-008 §4.2 / AC-021 / REQ-NF-003）。
  it('[Edge] T-LIB-AI-LRQ-03-01: 日本語を含む system / user が UTF-8 で往復して厳密に一致する', async () => {
    const { fetchProvider, calls } = _createRecordingFetchProvider();
    const _init = buildLlamaRequest({
      model: _MODEL,
      system: _SYSTEM_JA,
      user: _USER_JA,
      outputContract: _CONTRACT,
    });

    await fetchProvider(_ENDPOINT, _init);

    assertEquals(calls.length, 1);

    // 復号した文字列への部分一致では欠落を見逃すため、構造を解いて content を厳密比較する。
    const _decodedMessages = (await _decodeBodyOf(calls[0].init)).messages;
    assert(Array.isArray(_decodedMessages), `messages array expected: ${String(_decodedMessages)}`);
    const _messages = _decodedMessages as LlamaChatMessage[];
    assertEquals(_messages[0].content, _SYSTEM_JA);
    assertEquals(_messages[1].content, _USER_JA);
  });
});
