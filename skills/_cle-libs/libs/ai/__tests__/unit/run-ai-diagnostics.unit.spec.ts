// Copyright (c) 2026- atsushifx. MIT License.
import { assert, assertEquals, assertRejects } from '@std/assert';
import { makeLlamaOkResponse } from '../../../../__tests__/helpers/llama-fetch-mock.ts';
import { makeLoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';
import { GlobalConfig } from '../../../../classes/GlobalConfig.class.ts';
import { runAI } from '../../run-ai.ts';

for (const level of ['debug', 'off']) {
  Deno.test(`AI diagnostic level ${level}: stage timing without prompt or response text`, async () => {
    GlobalConfig.resetInstance();
    GlobalConfig.getInstance({ yaml: `model: llama/avalon\nllamaEndpoint: http://avalon:8080/\naiLogLevel: ${level}` });
    const logs = makeLoggerStub();
    try {
      await runAI('secret-system', 'secret-user', {
        outputContract: { contract: 'line-prefixed', properties: { type: { type: 'string' } }, maxTokens: 256 },
        fetchProvider: () => Promise.resolve(makeLlamaOkResponse('{"type":"secret-response"}')),
      });
      assertEquals(logs.infoLogs, []);
      if (level === 'off') { assertEquals(logs.debugLogs, []); }
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
  GlobalConfig.getInstance({ yaml: 'model: llama/avalon\nllamaEndpoint: http://avalon:8080/\naiLogLevel: debug' });
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
