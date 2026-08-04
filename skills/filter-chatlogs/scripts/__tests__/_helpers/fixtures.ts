// src: scripts/__tests__/_helpers/fixtures.ts
// @(#): filter-chatlogs E2E テスト用フィクスチャ生成
//       テスト用チャットログ本文・ディレクトリ構造の生成
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Helpers
// functions
import { agentPath } from '../../../../_cle-libs/libs/file-io/resolve-directory.ts';

/**
 * フロントマターのみ（本文なし）の Markdown を生成する。
 *
 * `buildBatchPrompt` においてターンが検出されず本文が空になるケースの検証に使用する。
 *
 * @param title - フロントマターの title 値
 * @returns フロントマターのみの Markdown 文字列
 */
export const makeFrontmatter = (title: string): string => {
  return `---\ntitle: ${title}\n---\n`;
};

/**
 * フロントマター付き・ターンマーカーなしの生テキスト Markdown を生成する。
 *
 * `### User`/`### Assistant` マーカーを含まないため `parseConversation` がターンを検出せず、
 * `buildBatchPrompt` において本文が空になるケースの検証に使用する。
 *
 * @param title - フロントマターの title 値
 * @param body - フロントマター後の本文テキスト（デフォルト: '生テキストです。'）
 * @returns フロントマター付き生テキスト Markdown 文字列
 */
export const makePlainContent = (title: string, content: string = '生テキストです。'): string => {
  return makeFrontmatter(title) + `\n${content.trim()}\n`;
};

/**
 * frontmatter 付きチャットログ Markdown を任意の会話テキストで生成する。
 *
 * @param title - フロントマターの title 値
 * @param question - User セクションのテキスト（デフォルト: '質問'）
 * @param answer - Assistant セクションのテキスト（デフォルト: '回答'）
 * @returns frontmatter 付き Markdown 文字列
 */
export const makeValidContent = (title: string, question = '質問', answer = '回答'): string => {
  return makePlainContent(title, `### User\n${question}\n\n### Assistant\n${answer}`);
};

/**
 * frontmatter 付きチャットログ Markdown を連続文字列で生成する。
 *
 * User/Assistant 各 `minLength` 文字の繰り返し文字列を含む最小構成を返す。
 * 文字数ベースの閾値テストに使用する。
 *
 * @param minLength - User/Assistant 各テキストの文字数
 * @param title - フロントマターの title 値（デフォルト: 'テスト'）
 * @returns frontmatter 付き Markdown 文字列
 */
export const makeRepeatedContent = (minLength: number, title = 'テスト'): string => {
  return makeValidContent(title, 'u'.repeat(minLength), 'a'.repeat(minLength));
};

/**
 * テスト用の一時ディレクトリ構造を 2 期間分作成する。
 *
 * `tempDir/agent/YYYY/YYYY-MM/` 形式のディレクトリを 2 件作成し、
 * tempDir と periodDir1・periodDir2 を返す。
 * period1 と period2 が同じ値の場合は Error を throw する。
 *
 * @param agent - エージェント名（デフォルト: 'claude'）
 * @param period1 - 対象月 1（YYYY-MM 形式、デフォルト: '2026-03'）
 * @param period2 - 対象月 2（YYYY-MM 形式、デフォルト: '2026-04'）
 * @returns 作成したディレクトリのパス群
 * @throws {Error} period1 と period2 が同じ値のとき
 */
export const makePeriodDir = async (
  agent = 'claude',
  period1 = '2026-03',
  period2 = '2026-04',
): Promise<{ tempDir: string; periodDir1: string; periodDir2: string }> => {
  if (period1 === period2) {
    throw new Error(`makePeriodDir: period1 and period2 must differ (got '${period1}')`);
  }

  const tempDir = await Deno.makeTempDir();

  const periodDir1 = `${tempDir}/${agentPath(agent, period1)}`;
  await Deno.mkdir(periodDir1, { recursive: true });

  const periodDir2 = `${tempDir}/${agentPath(agent, period2)}`;
  await Deno.mkdir(periodDir2, { recursive: true });

  return { tempDir, periodDir1, periodDir2 };
};

/**
 * テスト用の一時ディレクトリを 1 期間分作成し、chatlogsDir を返す。
 *
 * E2E テスト向けの単一期間ヘルパー。`tempDir/agent/YYYY/YYYY-MM/` を作成し、
 * そのパスを `chatlogsDir` として返す。
 *
 * @param agent - エージェント名（デフォルト: 'claude'）
 * @param period - 対象月（YYYY-MM 形式、デフォルト: '2026-03'）
 * @returns `{ tempDir, chatlogsDir }` — `chatlogsDir` = `tempDir/agent/YYYY/YYYY-MM/`
 */
export const makeTestDirs = async (agent = 'claude', period = '2026-03'): Promise<{
  tempDir: string;
  chatlogsDir: string;
}> => {
  const tempDir = await Deno.makeTempDir();
  const chatlogsDir = `${tempDir}/${agentPath(agent, period)}`;
  await Deno.mkdir(chatlogsDir, { recursive: true });
  return { tempDir, chatlogsDir };
};
