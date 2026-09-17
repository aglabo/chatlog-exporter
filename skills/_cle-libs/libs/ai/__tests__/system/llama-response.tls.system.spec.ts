// src: skills/_cle-libs/libs/ai/__tests__/system/llama-response.tls.system.spec.ts
// @(#): llama fetch 失敗写像 システムテスト（実 TLS 検証失敗）
//       対象: mapLlamaFetchFailure
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
// 対象 `mapLlamaFetchFailure` は子 Deno プロセスが `_TARGET_URL` から動的 import する。

// ─── Helpers
import { joinPath } from '../../../path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
/** `RUN_AI=1` が設定されている場合に `true`。実測テストの実行制御に使用する。 */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

/** 本テストの cause 文言（rustls の `invalid peer certificate`）を実測した Deno のバージョン。 */
const _VERIFIED_DENO_VERSION = '2.9.6';

/** TLS 検証失敗時に Deno が cause に載せる文言。Deno のバージョンに依存する。 */
const _TLS_CAUSE_MARKER = 'invalid peer certificate';

/** `mapLlamaFetchFailure` が runtime 由来の失敗に付けるメッセージ上のマーカー（unit spec と同じ）。 */
const _RUNTIME_FAILURE_MESSAGE_MARKER = 'Deno runtime';

/** 子プロセスが動的 import するテスト対象モジュールの file URL。 */
const _TARGET_URL = new URL('../../llama-response.ts', import.meta.url).href;

/** 子 Deno プロセスの実行上限（ms）。超えたら子を abort してテストを失敗させる。 */
const _CHILD_TIMEOUT_MS = 30_000;

/**
 * 証明書生成で openssl に `-config` で渡す最小設定。
 *
 * 環境の `OPENSSL_CONF` が別バージョンの openssl 用設定を指していると、`req -x509` が既定で読む
 * `v3_ca` セクションを解釈できず失敗する（例: 3.5.x は 4.x 記法の `keyid:nonss` を解釈できない）。
 * `x509_extensions` を持たない設定を渡し、実行環境の設定ファイルに依存しないようにする。
 */
const _OPENSSL_MIN_CONFIG = '[req]\ndistinguished_name = req_dn\n[req_dn]\n';

/**
 * 子 Deno プロセスで実行するコード。
 *
 * 引数 `[certPath, keyPath, targetUrl]` を受け取り、自己署名証明書の TLS サーバへ fetch した
 * reject 値の cause チェーンと、`mapLlamaFetchFailure` が throw した error の分類を JSON 1 行で出力する。
 */
const _CHILD_CODE = `
const [certPath, keyPath, targetUrl] = Deno.args;
const controller = new AbortController();
const server = Deno.serve({
  port: 0,
  hostname: '127.0.0.1',
  cert: Deno.readTextFileSync(certPath),
  key: Deno.readTextFileSync(keyPath),
  signal: controller.signal,
  onListen: () => {},
}, () => new Response('ok'));
const result = { fetched: false, causes: [], subindex: null, message: null };
try {
  const response = await fetch('https://127.0.0.1:' + server.addr.port + '/');
  await response.body?.cancel();
  result.fetched = true;
} catch (e) {
  for (let current = e; current instanceof Error; current = current.cause) {
    result.causes.push({
      name: current.name,
      message: current.message,
      notCapable: current instanceof Deno.errors.NotCapable,
    });
  }
  const { mapLlamaFetchFailure } = await import(targetUrl);
  try {
    mapLlamaFetchFailure(e);
  } catch (mapped) {
    result.subindex = mapped.subindex ?? null;
    result.message = String(mapped.message);
  }
}
console.log(JSON.stringify(result));
controller.abort();
await server.finished;
`;

// types
/** 子プロセスが出力する観測結果。 */
type _TlsObservation = {
  readonly fetched: boolean;
  readonly causes: readonly { readonly name: string; readonly message: string; readonly notCapable: boolean }[];
  readonly subindex: string | null;
  readonly message: string | null;
};

/**
 * 失敗メッセージに付ける Deno バージョン情報を組み立てる。
 *
 * @param detail - 失敗内容
 * @returns 検証済み版と実行中の版を併記したメッセージ
 */
const _versionNote = (detail: string): string =>
  `${detail} (verified on Deno ${_VERIFIED_DENO_VERSION}, running Deno ${Deno.version.deno})`;

/**
 * openssl で `/CN=localhost` の自己署名証明書と秘密鍵を生成する。
 *
 * openssl が解決できない、または非 0 終了した場合は理由を添えて throw する（テストを FAIL させる）。
 *
 * @param dir - 証明書を書き出すディレクトリ
 * @returns 生成した証明書と秘密鍵のパス
 */
async function _generateSelfSignedCert(dir: string): Promise<{ certPath: string; keyPath: string }> {
  const _certPath = joinPath(dir, 'cert.pem');
  const _keyPath = joinPath(dir, 'key.pem');
  const _configPath = joinPath(dir, 'openssl.cnf');
  await Deno.writeTextFile(_configPath, _OPENSSL_MIN_CONFIG);
  const _args = [
    'req',
    '-x509',
    '-config',
    _configPath,
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    _keyPath,
    '-out',
    _certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
  ];
  // 起動失敗（NotFound）は reject ではなく同期 throw になるため、try/catch で包む。
  let _output: Deno.CommandOutput;
  try {
    _output = await new Deno.Command('openssl', { args: _args, stdout: 'piped', stderr: 'piped' }).output();
  } catch (e) {
    throw new Error(`openssl could not be started (is it installed and on PATH?): ${String(e)}`);
  }
  if (!_output.success) {
    const _stderr = new TextDecoder().decode(_output.stderr);
    throw new Error(`openssl failed to generate a self-signed certificate (exit ${_output.code}): ${_stderr}`);
  }
  return { certPath: _certPath, keyPath: _keyPath };
}

/**
 * 子 Deno プロセスで自己署名証明書サーバへ fetch し、観測結果を返す。
 *
 * @param certPath - 証明書のパス
 * @param keyPath - 秘密鍵のパス
 * @returns 子プロセスが出力した観測結果
 */
async function _observeTlsFailure(certPath: string, keyPath: string): Promise<_TlsObservation> {
  const _signal = AbortSignal.timeout(_CHILD_TIMEOUT_MS);
  const _output = await new Deno.Command(Deno.execPath(), {
    args: ['eval', '--no-config', _CHILD_CODE, certPath, keyPath, _TARGET_URL],
    stdout: 'piped',
    stderr: 'piped',
    signal: _signal,
  }).output();
  const _stdout = new TextDecoder().decode(_output.stdout);
  const _stderr = new TextDecoder().decode(_output.stderr);
  assert(!_signal.aborted, _versionNote(`child deno process timed out after ${_CHILD_TIMEOUT_MS}ms`));
  assert(_output.success, _versionNote(`child deno process failed (exit ${_output.code}): ${_stderr}`));
  return JSON.parse(_stdout.trim()) as _TlsObservation;
}

// ─── Tests

/**
 * `mapLlamaFetchFailure` の実 TLS 検証失敗に対するシステムテスト。
 *
 * error-handling R-001 / DR-26 決定 1 に基づき、実際の Deno runtime が自己署名証明書を拒否した
 * reject 値が runtime 由来の `BackendUnavailable` に分類されることを回帰検証する。
 * cause 文言は Deno（rustls）のバージョンに依存するため、失敗時は検証済み版と実行中の版を示す。
 * ループバックの実通信と openssl を伴う実測テストのため、`RUN_AI=1`（`--use-ai`）指定時のみ実行する
 * （DR-21 決定 5 の例外）。
 *
 * テスト ID: T-LIB-AI-LRI-13-01
 *
 * @see mapLlamaFetchFailure
 */
describe('mapLlamaFetchFailure', { ignore: !_shouldRunAI }, () => {
  /** 自己署名証明書の TLS サーバへの実 fetch が reject されるケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-AI-LRI-13-01: 自己署名証明書サーバへの実 fetch の reject 値 → runtime 由来の BackendUnavailable', async () => {
      const _dir = await Deno.makeTempDir({ prefix: 'llama-tls-' });
      try {
        const { certPath, keyPath } = await _generateSelfSignedCert(_dir);
        const _observed = await _observeTlsFailure(certPath, keyPath);
        const _causes = JSON.stringify(_observed.causes);

        assert(!_observed.fetched, _versionNote('fetch to a self-signed TLS server unexpectedly succeeded'));
        assert(
          _observed.causes.some((cause) => cause.message.includes(_TLS_CAUSE_MARKER)),
          _versionNote(`no cause contains '${_TLS_CAUSE_MARKER}': ${_causes}`),
        );
        assert(
          _observed.causes.every((cause) => !cause.notCapable),
          _versionNote(`cause chain contains Deno.errors.NotCapable: ${_causes}`),
        );
        assertEquals(_observed.subindex, 'BackendUnavailable', _versionNote(`unexpected subindex: ${_causes}`));
        assertStringIncludes(
          _observed.message ?? '',
          _RUNTIME_FAILURE_MESSAGE_MARKER,
          _versionNote('mapped message lacks the runtime failure marker'),
        );
      } finally {
        await Deno.remove(_dir, { recursive: true });
      }
    });
  });
});
