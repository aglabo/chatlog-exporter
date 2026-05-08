// src: scripts/libs/claude-runner.ts
// @(#): Claude CLI プロセスの起動と結果取得
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// ─── internal ───
import { SYSTEM_PROMPT } from '../constants/filter.constants.ts';

// ─────────────────────────────────────────────
// Claude CLI 呼び出し
// ─────────────────────────────────────────────

export const runClaude = async (prompt: string): Promise<string> => {
  const cmd = new Deno.Command('claude', {
    args: ['-p', SYSTEM_PROMPT, '--output-format', 'text'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'null',
  });

  const process = cmd.spawn();

  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const output = await process.output();
  if (!output.success) {
    throw new ChatlogError('CliError', `claude CLI がエラーで終了しました (code=${output.code})`);
  }

  return new TextDecoder().decode(output.stdout);
};
