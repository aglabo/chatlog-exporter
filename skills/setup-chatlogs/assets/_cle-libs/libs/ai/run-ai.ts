// src: skills/_cle-libs/libs/ai/run-ai.ts
// @(#): Claude CLI 呼び出しユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words mcps

// ─── Shared libraries
// functions
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../classes/GlobalConfig.class.ts';
import { logger } from '../io/logger.ts';
import { getAiBackend, isValidModel, parseModel } from './model-utils.ts';

// types
import type { AiBackendCommand } from '../../types/ai.const.types.ts';

// constants
import { AI_BACKEND_COMMAND_MAP } from '../../types/ai.const.types.ts';

// internal types
export type RunAIOptions = {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type _CommandSpec = { command: AiBackendCommand; args: string[]; hasSystemPromptWithArgs: boolean };

/** レートリミット検出パターン。CLI は文言を stdout / stderr のいずれにも出しうる。`i` フラグのみ（`g` を付けると `.test()` がステートフルになる）。 */
const _RATE_LIMIT_PATTERN = /rate.?limit|429|usage limit|spend limit/i;

// ─── Functions

/**
 * モデル名とシステムプロンプトから CLI コマンド仕様を生成する。
 *
 * exported for testing — internal use only (do not rely on outside tests)
 */
export const _buildCommand = (model: string, systemPrompt: string): _CommandSpec => {
  const _parsed = parseModel(model)!;
  const _backend = getAiBackend(model)!;
  const _command = AI_BACKEND_COMMAND_MAP[_backend];
  switch (_backend) {
    case 'claude':
      return {
        command: _command,
        args: [
          '--print',
          '--output-format',
          'json',
          '--safe-mode',
          '--tools=',
          '--disable-slash-commands',
          '--permission-mode',
          'acceptEdits',
          '--strict-mcp-config',
          '--mcp-config',
          '{"mcpServers":{}}',
          '--model',
          _parsed.model,
          '--system-prompt',
          systemPrompt,
        ],
        hasSystemPromptWithArgs: true,
      };
    case 'codex':
      return {
        command: _command,
        args: [
          'exec',
          '--skip-git-repo-check',
          '--append-system-prompt',
          systemPrompt,
          '--model',
          _parsed.model,
        ],
        hasSystemPromptWithArgs: true,
      };
    case 'copilot':
      return {
        command: _command,
        args: [
          '--disable-builtin-mcps',
          '--model',
          _parsed.model,
          '--prompt',
          systemPrompt,
        ],
        hasSystemPromptWithArgs: true,
      };
    case 'opencode':
      return {
        command: _command,
        args: [
          'run',
          '--pure',
          '--model',
          `${_parsed.provider}/${_parsed.model}`,
          '--prompt',
          systemPrompt,
        ],
        hasSystemPromptWithArgs: true,
      };
    case 'antigravity':
      return {
        command: _command,
        args: [
          '--model',
          _parsed.model,
          '--print',
          systemPrompt,
        ],
        hasSystemPromptWithArgs: true,
      };
    default:
      throw new ChatlogError('UnknownModel', 'InvalidModel', `"${model}" has no backend`);
  }
};

/**
 * claude CLI (`--output-format json`) の stdout を JSON 本体としてパースする。
 *
 * stdout 先頭にはサンドボックスバナー（`⚠ Sandbox disabled: ...` など）が
 * 混入しうるため、最初の `{` 以降を JSON 本体として `JSON.parse` する。
 *
 * **never-throw**: `{` が無い場合・パース失敗の場合はいずれも `null` を返す。
 * これにより exit≠0 のフォールバック（正規表現パス）が機能する。
 *
 * exported for testing — internal use only (do not rely on outside tests)
 *
 * @param stdout - trim 済みの claude CLI stdout
 * @returns JSON 本体のオブジェクト、またはパース不能なら `null`
 */
export const _parseClaudeJson = (stdout: string): Record<string, unknown> | null => {
  const _start = stdout.indexOf('{');
  if (_start === -1) {
    return null;
  }
  try {
    return JSON.parse(stdout.slice(_start)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * `is_error:true` の claude JSON からエラー詳細メッセージを整形する。
 *
 * 生 JSON 全体は含めず、`api_error_status` / `terminal_reason` / `result` の要点のみを
 * 欠損に強い形で組み立てる。status と terminal_reason は括弧内にカンマ区切りで並べ、
 * 両方欠ければ括弧を省略する。`result` が文字列なら本文として `: <result>` を付ける。
 *
 * exported for testing — internal use only (do not rely on outside tests)
 *
 * @param parsed - `_parseClaudeJson` が返した claude JSON オブジェクト
 * @returns 整形済みエラー詳細メッセージ
 */
export const _formatClaudeError = (parsed: Record<string, unknown>): string => {
  const _status = parsed.api_error_status;
  const _terminal = parsed.terminal_reason;
  const _result = parsed.result;
  const _parts = [
    typeof _status === 'number' ? `status ${_status}` : undefined,
    typeof _terminal === 'string' ? _terminal : undefined,
  ].filter((p): p is string => p !== undefined);
  const _prefix = _parts.length > 0 ? `claude API error (${_parts.join(', ')})` : 'claude API error';
  return typeof _result === 'string' ? `${_prefix}: ${_result}` : _prefix;
};

/**
 * claude JSON を解釈し、成功なら `.result` を返し、`is_error:true` なら throw する。
 *
 * exit code は一切見ない（claude CLI の exit code は信頼できないため）。判別は
 * `is_error` / `api_error_status` のみで行う。error 分岐では生 stdout を `logger.error`
 * に `(stdout):` ラベル付きで出力し、`_formatClaudeError` を詳細として throw する。
 *
 * @param parsed - `_parseClaudeJson` が返した claude JSON オブジェクト
 * @param stdout - error 分岐でログ出力する生 stdout
 * @returns 成功時の `.result` 文字列
 */
const _interpretClaudeOutput = (parsed: Record<string, unknown>, stdout: string): string => {
  if (parsed.is_error === true) {
    logger.error(`${AI_BACKEND_COMMAND_MAP.claude} error (stdout): ${stdout}`);
    const _isRateLimit = parsed.api_error_status === 429
      || (typeof parsed.result === 'string' && _RATE_LIMIT_PATTERN.test(parsed.result));
    const _subindex = _isRateLimit ? 'RateLimit' : 'ExitFailure';
    throw new ChatlogError('AiError', _subindex, _formatClaudeError(parsed));
  }
  if (typeof parsed.result !== 'string') {
    throw new ChatlogError('AiError', 'InvalidFormat', `claude JSON has no string "result" field: ${stdout}`);
  }
  return parsed.result;
};

/**
 * Runs an AI CLI subprocess with the given system prompt and user prompt.
 * Returns the trimmed stdout text on success, or throws on failure.
 */
export const runAI = async (
  systemPrompt: string,
  userPrompt: string,
  options?: RunAIOptions,
): Promise<string> => {
  const _globalConfig = GlobalConfig.getInstance();
  const _model = options?.model ?? (_globalConfig.get('model') as string);
  const _timeoutMs = options?.timeoutMs ?? (_globalConfig.get('timeoutMs') as number);
  const _options = { ...options, model: _model, timeoutMs: _timeoutMs };
  if (!isValidModel(_options.model)) {
    throw new ChatlogError(
      'UnknownModel',
      'InvalidModel',
      `"${_options.model}" is not valid. Valid models: opus, sonnet, haiku (or full IDs)`,
    );
  }
  const _spec = _buildCommand(_options.model, systemPrompt);
  const _controller = new AbortController();
  const _timer = _options.timeoutMs !== 0
    ? setTimeout(() => _controller.abort(), _options.timeoutMs)
    : undefined;
  const _signals = _options.signal ? [_controller.signal, _options.signal] : [_controller.signal];
  const _cmd = new Deno.Command(_spec.command, {
    args: _spec.args,
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    signal: AbortSignal.any(_signals),
  });
  try {
    const _process = _cmd.spawn();
    const _writer = _process.stdin.getWriter();
    const _input = _spec.hasSystemPromptWithArgs ? userPrompt : `${systemPrompt}\n\n${userPrompt}`;
    await _writer.write(new TextEncoder().encode(_input));
    await _writer.close();
    const _output = await _process.output();
    const _stdout = new TextDecoder().decode(_output.stdout).trim();
    const _stderr = new TextDecoder().decode(_output.stderr).trim();

    // claude backend: JSON がパースできれば exit code は一切見ず、is_error で判別する。
    if (_spec.command === 'claude') {
      const _parsed = _parseClaudeJson(_stdout);
      if (_parsed !== null) {
        return _interpretClaudeOutput(_parsed, _stdout);
      }
      if (_output.success) {
        throw new ChatlogError('AiError', 'InvalidFormat', `claude output is not JSON: ${_stdout}`);
      }
      // _parsed === null かつ exit≠0 → 従来の exit-code + 正規表現フォールバックへ流す。
    }

    if (!_output.success) {
      if (_stderr) { logger.error(`${_spec.command} exited with code ${_output.code} (stderr): ${_stderr}`); }
      if (_stdout) { logger.error(`${_spec.command} exited with code ${_output.code} (stdout): ${_stdout}`); }
      const _isRateLimit = _RATE_LIMIT_PATTERN.test(_stderr) || _RATE_LIMIT_PATTERN.test(_stdout);
      throw new ChatlogError(
        'AiError',
        _isRateLimit ? 'RateLimit' : 'ExitFailure',
        `${_spec.command} exited with code ${_output.code}: ${_stderr}`,
      );
    }
    return _stdout;
  } catch (e) {
    if (_options.signal?.aborted) {
      throw new ChatlogError('Aborted', 'ExternalAbort', `${_spec.command} was aborted by an external signal`);
    }
    if (_controller.signal.aborted) {
      throw new ChatlogError('TimedOut', 'Timeout', `${_spec.command} timed out after ${_options.timeoutMs}ms`);
    }
    throw e;
  } finally {
    if (_timer !== undefined) { clearTimeout(_timer); }
  }
};
