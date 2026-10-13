# llama DNS failures and prompt evaluation cancellation

## Findings

The supplied server log shows cancellations approximately 300 seconds apart:
06:32.937 -> 11:32.938 -> 16:33.006. The committed configuration sets
`timeoutMs: 300_000`; `runAI` aborts its HTTP request when that deadline expires.
The server is still evaluating prompts at 83–95 tokens/second when cancelled.
The log contains prompt evaluation, not completed response generation.
This strongly supports a client deadline as the cause of these cancellations;
it does not establish the cause of a separate Windows DNS error (11001).

A DNS failure occurs before connection establishment. A request already being
processed by llama-server has passed name resolution. Correlating the exact
client error timestamp and request with server logs is necessary to identify
whether DNS failed on a subsequent request. Do not label the 300-second abort
as a DNS failure, or treat a successful later health check as proof that DNS
worked at the original failure time.

## Changes

- Bundled local-server configuration: 600,000 ms total request deadline.
  An existing deployed configuration must be edited separately. The built-in
  default remains unchanged. `timeoutMs: 0` disables the application deadline.
- Retry explicit DNS failures at most twice, after 1 and 2 seconds. The retries
  share the original deadline and external abort signal. Persistent failures
  retain the original cause chain and BackendUnavailable classification.
- Do not retry TLS, TCP, generic fetch errors, HTTP responses or body-read
  failures: the server may already have received the request.
- Distribution assets are regenerated from their source.

## Diagnostic option

Set `aiLogLevel: "debug"` in the configuration used by the command. The default
is `off`. Logs go to stderr and include a client request UUID, UTC timestamp,
elapsed milliseconds, backend, total timeout, input character counts, endpoint
origin (without userinfo or query), HTTP headers/status, body completion, DNS
retry count/delay, and failure category. Prompt and response text are omitted.
Existing error messages retain the underlying fetch cause chain. The UUID is
client-local and is not llama-server's task ID.

## Verification on Windows / avalon

Update the actual configuration used by the command, including `--config`
overrides, to `timeoutMs: 600_000`. Check for command-specific timeout overrides.
If a prompt still exceeds this budget, reduce the prompt/batch size or explicitly
use `timeoutMs: 0`; do not automatically retry the same expensive request.

To isolate LAN name resolution, temporarily use
`llamaEndpoint: "http://192.168.14.108:8080/"` after confirming that avalon still
has that address. Reserve the address via DHCP before making this permanent.
At the time of failure, capture both:

```powershell
[System.Net.Dns]::GetHostAddresses("avalon")
curl.exe --max-time 10 http://192.168.14.108:8080/health
```

If direct IP succeeds while name lookup fails, repair LAN DNS or use the
reserved address. These changes mitigate transient DNS failures but do not
repair an incorrectly configured resolver. Validation against the user's
Windows resolver and actual llama-server is required after deployment.
