// Copyright (c) 2026- atsushifx. MIT License.
import { assert, assertEquals, assertRejects } from '@std/assert';
import { makeLlamaOkResponse } from '../../../../__tests__/helpers/llama-fetch-mock.ts';
import { makeLoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';
import { runAI } from '../../run-ai.ts';

for (const debug of [true, false]) {
  Deno.test(`AI diagnostic debug=${debug}: stage timing without prompt or response text`, async () => {
    GlobalConfig.resetInstance();
    GlobalConfig.getInstance({ yaml: `model: llama/avalon\nllamaEndpoint: http://avalon:8080/\ndebug: ${debug}` });
    const logs = makeLoggerStub();
    try {
      await runAI('secret-system', 'secret-user', {
        outputContract: { contract: 'line-prefixed', properties: { type: { type: 'string' } }, maxTokens: 256 },
        fetchProvider: () => Promise.resolve(makeLlamaOkResponse('{"type":"secret-response"}')),
      });
      if (!debug) { assertEquals(logs.infoLogs, []); }
      else {
        const text = logs.debugLogs.join('\n');
        for (
          const stage of [
            'start backend=llama',
            'http-send endpoint=http://avalon:8080',
            'http-headers status=200',
            'http-body-complete',
            'complete',
          ]
        ) {
          assert(text.includes(stage));
        }
        assert(!text.includes('secret-'));
        assert(logs.debugLogs.every((line) => /elapsedMs=\d+/.test(line)));
        assertEquals(new Set(logs.debugLogs.map((line) => /request=([^ ]+)/.exec(line)?.[1])).size, 1);
      }
    } finally {
      logs.restore();
      GlobalConfig.resetInstance();
    }
  });
}

Deno.test('AI diagnostic timeout is distinct from backend unavailability', async () => {
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: 'model: llama/avalon\nllamaEndpoint: http://avalon:8080/\ndebug: true' });
  const logs = makeLoggerStub();
  try {
    await assertRejects(() =>
      runAI('sys', 'user', {
        timeoutMs: 10,
        outputContract: { contract: 'line-prefixed', properties: { type: { type: 'string' } }, maxTokens: 256 },
        fetchProvider: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
          }),
      })
    );
    assert(logs.debugLogs.some((line) => line.includes('failure category=Timeout')));
  } finally {
    logs.restore();
    GlobalConfig.resetInstance();
  }
});

/**
 * finish_reason と usage を指定した llama 応答を生成する（`makeLlamaOkResponse` は 'stop' 固定・usage 無しのため）。
 *
 * @param content - assistant メッセージの本文
 * @param finishReason - `choices[0].finish_reason` に入れる値
 * @param usage - 応答本文の `usage`。省略時はキーごと載せない
 * @returns status 200 / application/json の `Response`
 */
const _makeLlamaResponse = (content: string, finishReason: string, usage?: Record<string, number>): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
      ...(usage === undefined ? {} : { usage }),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/**
 * finish_reason 'length' の llama 応答を生成する（`makeLlamaOkResponse` は 'stop' 固定のため使えない）。
 *
 * @param content - assistant メッセージの本文
 * @param usage - 応答本文の `usage`。省略時はキーごと載せない
 * @returns status 200 / application/json の `Response`
 */
const _makeLlamaLengthResponse = (content: string, usage?: Record<string, number>): Response =>
  _makeLlamaResponse(content, 'length', usage);

/**
 * debug 診断を有効にした llama 経路で `runAI` を失敗させ、出力された debug ログを返す。
 *
 * `runAI` が reject することを assert し、logger stub と GlobalConfig は必ず後始末する。
 *
 * @param response - fetchProvider が返す `Response`
 * @param systemPrompt - `runAI` に渡す system prompt
 * @param userPrompt - `runAI` に渡す user prompt
 * @param debug - GlobalConfig の `debug` 設定値
 * @returns 失敗までに出力された debug ログ行
 */
const _collectLlamaFailureLogs = async (
  response: Response,
  systemPrompt = 'sys',
  userPrompt = 'user',
  debug = true,
): Promise<string[]> => {
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: `model: llama/avalon\nllamaEndpoint: http://avalon:8080/\ndebug: ${debug}` });
  const logs = makeLoggerStub();
  try {
    await assertRejects(() =>
      runAI(systemPrompt, userPrompt, {
        outputContract: { contract: 'line-prefixed', properties: { type: { type: 'string' } }, maxTokens: 256 },
        fetchProvider: () => Promise.resolve(response),
      })
    );
    return logs.debugLogs;
  } finally {
    logs.restore();
    GlobalConfig.resetInstance();
  }
};

Deno.test('[Normal] T-LIB-RAD-01-01: llama ExitFailure → failure trace に detail=<message> を付ける', async () => {
  const _logs = await _collectLlamaFailureLogs(_makeLlamaLengthResponse('x'));
  assert(
    _logs.some((line) =>
      line.includes(
        "failure category=AiError/ExitFailure detail=AI Error: llama response finish_reason is not 'stop': length",
      )
    ),
  );
});

Deno.test('[Error] T-LIB-RAD-01-02: llama HTTP 503 (RateLimit) → failure trace に detail= を付けない', async () => {
  const _logs = await _collectLlamaFailureLogs(new Response('overloaded', { status: 503 }));
  const _failureLines = _logs.filter((line) => line.includes('failure category=AiError/RateLimit'));
  assertEquals(_failureLines.length, 1);
  assert(!_failureLines[0].includes('detail='));
});

Deno.test('[Edge] T-LIB-RAD-01-03: detail 付与後も system / user prompt は debug ログに出ない', async () => {
  const _text = (await _collectLlamaFailureLogs(
    _makeLlamaLengthResponse('response-body'),
    'secret-system',
    'secret-user',
  )).join('\n');
  assert(_text.includes('detail='));
  assert(!_text.includes('secret-system'));
  assert(!_text.includes('secret-user'));
});

Deno.test('[Normal] T-LIB-RAD-02-01: llama finish_reason=length → failure-response 行に max_tokens / completion_tokens / content 全文を出す', async () => {
  const _logs = await _collectLlamaFailureLogs(
    _makeLlamaLengthResponse('partial', { prompt_tokens: 10, completion_tokens: 256, total_tokens: 266 }),
  );
  const _expected = 'failure-response max_tokens=256 finish_reason=length completion_tokens=256 content="partial"';
  assertEquals(_logs.filter((line) => line.includes(_expected)).length, 1);
});

Deno.test('[Normal] T-LIB-RAD-02-02: failure-response 行は failure category= 行より前に出る', async () => {
  const _logs = await _collectLlamaFailureLogs(_makeLlamaLengthResponse('partial'));
  const _responseIndex = _logs.findIndex((line) => line.includes('failure-response '));
  const _categoryIndex = _logs.findIndex((line) => line.includes('failure category='));
  assert(_responseIndex >= 0, 'failure-response 行が無い');
  assert(_categoryIndex >= 0, 'failure category= 行が無い');
  assert(_responseIndex < _categoryIndex);
});

Deno.test('[Error] T-LIB-RAD-02-03: finish_reason=stop で契約不一致 → failure-response 行に finish_reason=stop を出す', async () => {
  const _logs = await _collectLlamaFailureLogs(makeLlamaOkResponse('not-json-at-all'));
  const _lines = _logs.filter((line) => line.includes('failure-response '));
  assertEquals(_lines.length, 1);
  assert(_lines[0].includes('finish_reason=stop'));
});

Deno.test('[Error] T-LIB-RAD-02-04: llama HTTP 503 → 応答本文を parse していないので failure-response 行を出さない', async () => {
  const _logs = await _collectLlamaFailureLogs(new Response('overloaded', { status: 503 }));
  assert(_logs.some((line) => line.includes('failure category=AiError/RateLimit')));
  assert(!_logs.some((line) => line.includes('failure-response')));
});

Deno.test('[Edge] T-LIB-RAD-02-05: debug=false → finish_reason=length でも debug ログを出さない', async () => {
  const _logs = await _collectLlamaFailureLogs(
    _makeLlamaLengthResponse('partial', { prompt_tokens: 10, completion_tokens: 256, total_tokens: 266 }),
    'sys',
    'user',
    false,
  );
  assertEquals(_logs, []);
});

Deno.test('[Normal] T-LIB-RAD-02-07: llama finish_reason=length → failure-response 行の直後に failure-response-raw 行を出す', async () => {
  const _usage = { prompt_tokens: 10, completion_tokens: 256, total_tokens: 266 };
  const _logs = await _collectLlamaFailureLogs(_makeLlamaLengthResponse('partial', _usage));
  const _expected = `failure-response-raw ${
    JSON.stringify({ usage: _usage, finish_reason: 'length', message: { role: 'assistant', content: 'partial' } })
  }`;
  const _rawIndex = _logs.findIndex((line) => line.includes(_expected));
  const _responseIndex = _logs.findIndex((line) => line.includes('failure-response '));
  assertEquals(_logs.filter((line) => line.includes('failure-response-raw ')).length, 1);
  assert(_rawIndex >= 0, 'failure-response-raw 行が無い');
  assertEquals(_rawIndex, _responseIndex + 1);
});

Deno.test('[Error] T-LIB-RAD-02-08: llama HTTP 503 → failure-response-raw 行を出さない', async () => {
  const _logs = await _collectLlamaFailureLogs(new Response('overloaded', { status: 503 }));
  assert(!_logs.some((line) => line.includes('failure-response-raw')));
});

Deno.test('[Edge] T-LIB-RAD-02-06: 成功時は failure-response 行を出さない', async () => {
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: 'model: llama/avalon\nllamaEndpoint: http://avalon:8080/\ndebug: true' });
  const _logs = makeLoggerStub();
  try {
    await runAI('sys', 'user', {
      outputContract: { contract: 'line-prefixed', properties: { type: { type: 'string' } }, maxTokens: 256 },
      fetchProvider: () => Promise.resolve(makeLlamaOkResponse('{"type":"ok"}')),
    });
    assert(_logs.debugLogs.some((line) => line.includes('complete')));
    assert(!_logs.debugLogs.some((line) => line.includes('failure-response')));
  } finally {
    _logs.restore();
    GlobalConfig.resetInstance();
  }
});
