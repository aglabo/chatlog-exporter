// src: skills/_scripts/libs/ai/run-ai.ts
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
import { getAiBackend, isValidModel, parseModel } from './model-utils.ts';

// types
import type { AiBackendCommand } from '../../types/ai.const.types.ts';

// constants
import { DEFAULT_AI_MODEL, DEFAULT_TIMEOUT_MS } from '../../constants/defaults.constants.ts';
import { AI_BACKEND_COMMAND_MAP } from '../../types/ai.const.types.ts';

// internal types
export type RunAIOptions = {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type _CommandSpec = { command: AiBackendCommand; args: string[]; hasSystemPromptWithArgs: boolean };

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
 * Runs an AI CLI subprocess with the given system prompt and user prompt.
 * Returns the trimmed stdout text on success, or throws on failure.
 */
export const runAI = async (
  systemPrompt: string,
  userPrompt: string,
  options?: RunAIOptions,
): Promise<string> => {
  const _options = { model: DEFAULT_AI_MODEL, timeoutMs: DEFAULT_TIMEOUT_MS, ...options };
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
    if (!_output.success) {
      const _stderr = new TextDecoder().decode(_output.stderr).trim();
      const _isRateLimit = /rate.?limit|429/i.test(_stderr);
      throw new ChatlogError(
        'AiError',
        _isRateLimit ? 'RateLimit' : 'ExitFailure',
        `${_spec.command} exited with code ${_output.code}: ${_stderr}`,
      );
    }
    return new TextDecoder().decode(_output.stdout).trim();
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
