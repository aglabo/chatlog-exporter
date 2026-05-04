// src: scripts/__tests__/_helpers/chatlog-fixtures.ts
// @(#): filter-chatlog E2E テスト用フィクスチャ生成
//       テスト用チャットログ本文・ディレクトリ構造の生成
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * frontmatter 付きチャットログ Markdown を生成する。
 *
 * User/Assistant 各 `minLength` 文字の会話テキストを含む最小構成を返す。
 *
 * @param minLength - User/Assistant 各テキストの文字数
 * @param title - フロントマターの title 値（デフォルト: 'テスト'）
 * @returns frontmatter 付き Markdown 文字列
 */
export function makeValidContent(minLength: number, title = 'テスト'): string {
  const userText = 'u'.repeat(minLength);
  const assistantText = 'a'.repeat(minLength);
  return `---\ntitle: ${title}\n---\n### User\n${userText}\n\n### Assistant\n${assistantText}\n`;
}

/**
 * テスト用の一時ディレクトリ構造を作成する。
 *
 * `tempDir/agent/YYYY/YYYY-MM` 形式のディレクトリを作成し、
 * tempDir と chatlogDir を返す。
 *
 * @param agent - エージェント名（デフォルト: 'claude'）
 * @param period - 対象月（YYYY-MM 形式、デフォルト: '2026-03'）
 * @returns 作成したディレクトリのパス群
 */
export async function makeTestDirs(agent = 'claude', period = '2026-03'): Promise<{
  tempDir: string;
  chatlogDir: string;
}> {
  const tempDir = await Deno.makeTempDir();
  const yyyy = period.slice(0, 4);
  const chatlogDir = `${tempDir}/${agent}/${yyyy}/${period}`;
  await Deno.mkdir(chatlogDir, { recursive: true });
  return { tempDir, chatlogDir };
}
