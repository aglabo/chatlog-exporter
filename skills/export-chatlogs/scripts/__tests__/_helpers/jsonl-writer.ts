// src: scripts/__tests__/_helpers/jsonl-writer.ts
// @(#): export-chatlogs テスト共通ヘルパー
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Helpers
/**
 * JSONL エントリを文字列化してファイルに書き込む。
 * 各エントリを JSON.stringify して改行区切りで結合し、末尾に改行を付加する。
 * e2e / functional テストで実際の JSONL ファイルを作成するために使用する。
 */
export async function writeJsonl(filePath: string, lines: unknown[]): Promise<void> {
  const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  await Deno.writeTextFile(filePath, content);
}
