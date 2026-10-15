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
 * finish_reason 'length' の llama 応答を生成する（`makeLlamaOkResponse` は 'stop' 固定のため使えない）。
 *
 * @param content - assistant メッセージの本文
 * @returns status 200 / application/json の `Response`
 */
const _makeLlamaLengthResponse = (content: string): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'length' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/**
 * debug 診断を有効にした llama 経路で `runAI` を失敗させ、出力された debug ログを返す。
 *
 * `runAI` が reject することを assert し、logger stub と GlobalConfig は必ず後始末する。
 *
 * @param response - fetchProvider が返す `Response`
 * @param systemPrompt - `runAI` に渡す system prompt
 * @param userPrompt - `runAI` に渡す user prompt
 * @returns 失敗までに出力された debug ログ行
 */
const _collectLlamaFailureLogs = async (
  response: Response,
  systemPrompt = 'sys',
  userPrompt = 'user',
): Promise<string[]> => {
  GlobalConfig.resetInstance();
  GlobalConfig.getInstance({ yaml: 'model: llama/avalon\nllamaEndpoint: http://avalon:8080/\ndebug: true' });
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

Deno.test('[Edge] T-LIB-RAD-01-03: detail 付与後も prompt / 応答本文は debug ログに出ない', async () => {
  const _text = (await _collectLlamaFailureLogs(
    _makeLlamaLengthResponse('secret-response'),
    'secret-system',
    'secret-user',
  )).join('\n');
  assert(_text.includes('detail='));
  assert(!_text.includes('secret-'));
});
