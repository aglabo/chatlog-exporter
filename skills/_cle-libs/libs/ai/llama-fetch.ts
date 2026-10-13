// src: skills/_cle-libs/libs/ai/llama-fetch.ts
// @(#): Retry only pre-connection DNS failures within the caller's timeout.
// Copyright (c) 2026- atsushifx. MIT License.
import type { FetchProvider } from '../../types/providers.types.ts';

/** DNS failures happen before the request reaches the server. Never retry ambiguous transport failures. */
const isDnsFailure = (error: unknown): boolean => {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    const code = (error as Error & { code?: string }).code;
    if (code === 'EAI_AGAIN' || code === 'ENOTFOUND' || /\bdns error: /i.test(error.message)) {
      return true;
    }
    error = error.cause;
  }
  return false;
};

/** Abort-aware backoff; always release both timer and listener. */
const waitForRetry = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** At most two DNS retries (1s, 2s), sharing runAI's total deadline and external signal. */
export const fetchLlama = async (
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  provider: FetchProvider,
  trace: (message: string) => void = () => {},
): Promise<Response> => {
  for (let attempt = 0;; attempt++) {
    signal.throwIfAborted();
    try {
      return await provider(url, { ...init, signal });
    } catch (error) {
      if (signal.aborted || attempt >= 2 || !isDnsFailure(error)) { throw error; }
      trace(`dns-retry attempt=${attempt + 1}/2 delayMs=${1000 * (attempt + 1)}`);
      await waitForRetry(1000 * (attempt + 1), signal);
    }
  }
};
