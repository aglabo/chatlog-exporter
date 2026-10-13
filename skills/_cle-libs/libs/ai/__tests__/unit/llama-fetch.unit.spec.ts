// Copyright (c) 2026- atsushifx. MIT License.
import { assertEquals, assertRejects } from '@std/assert';
import { fetchLlama } from '../../llama-fetch.ts';

const dnsFailure = () =>
  new TypeError('fetch failed', {
    cause: new Error('client error (Connect): dns error: host not found (os error 11001)'),
  });

Deno.test('DNS recovers on the next attempt with the same request and signal', async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const response = await fetchLlama('http://avalon:8080/', { method: 'POST', body: 'prompt' }, signal, (_url, init) => {
    assertEquals(init?.body, 'prompt');
    assertEquals(init?.signal, signal);
    if (++calls === 1) { throw dnsFailure(); }
    return Promise.resolve(new Response('ok'));
  });
  assertEquals(await response.text(), 'ok');
  assertEquals(calls, 2);
});

Deno.test('persistent DNS failure stops after three attempts and preserves the cause', async () => {
  let calls = 0;
  const error = dnsFailure();
  const result = await assertRejects(() =>
    fetchLlama('http://avalon:8080/', {}, new AbortController().signal, () => {
      calls++;
      return Promise.reject(error);
    }), TypeError);
  assertEquals(result, error);
  assertEquals(calls, 3);
});

Deno.test('connection reset, generic fetch failure and TLS failure are never retried', async () => {
  for (const message of ['tcp connect error: reset', 'fetch failed', 'invalid peer certificate']) {
    let calls = 0;
    await assertRejects(() =>
      fetchLlama('http://avalon:8080/', {}, new AbortController().signal, () => {
        calls++;
        return Promise.reject(new TypeError(message));
      }), TypeError);
    assertEquals(calls, 1);
  }
});

Deno.test('abort during DNS backoff prevents retry and releases its timer', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = fetchLlama('http://avalon:8080/', {}, controller.signal, () => {
    calls++;
    setTimeout(() => controller.abort(), 20);
    return Promise.reject(dnsFailure());
  });
  await assertRejects(() => pending, DOMException);
  assertEquals(calls, 1);
});

Deno.test('already aborted request is never sent', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assertRejects(() =>
    fetchLlama('http://avalon:8080/', {}, controller.signal, () => {
      calls++;
      return Promise.resolve(new Response(''));
    }), DOMException);
  assertEquals(calls, 0);
});

Deno.test('DNS retry diagnostic reports attempt and delay', async () => {
  const logs: string[] = [];
  let calls = 0;
  const response = await fetchLlama(
    'http://avalon:8080/',
    {},
    new AbortController().signal,
    () => ++calls === 1 ? Promise.reject(dnsFailure()) : Promise.resolve(new Response('ok')),
    (message) => logs.push(message),
  );
  await response.text();
  assertEquals(logs, ['dns-retry attempt=1/2 delayMs=1000']);
});
