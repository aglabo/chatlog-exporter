// src: scripts/libs/session-writer.ts
// @(#): セッション Markdown 書き出しユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// libs
import { generateHash } from '../../../_scripts/libs/io/hash.ts';
import { getDirectory } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';
import { textToSlug } from '../../../_scripts/libs/text/slug-utils.ts';
import { quoteString } from '../../../_scripts/libs/text/string-utils.ts';
// constants
import { ConversationRole } from '../../../_scripts/types/conversation-role.const.types.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { Turn } from '../../../_scripts/types/conversation.types.ts';
import type { ExportedSession, SessionMeta } from '../types/session.types.ts';

/** sessionId が欠落している場合に使用するフォールバックのハッシュ生成ベース文字列。 */
const SESSION_ID_FALLBACK = 'unknown';

/** sessionId が欠落している場合、generateHash で一意な代替値を生成する。 */
export const resolveSessionId = async (sessionId: string | undefined): Promise<string> =>
  sessionId ? sessionId : await generateHash(SESSION_ID_FALLBACK);

/** セッションの Markdown ファイル出力パスを生成する。 */
export const buildOutputPath = (
  outputBase: string,
  agent: string,
  meta: SessionMeta,
  slug: string,
): string => {
  const yearMonth = meta.date.slice(0, 7);
  const year = meta.date.slice(0, 4);
  const sessionId8 = meta.sessionId.replace(/-/g, '').slice(0, 8);
  const filename = `${meta.date}-${slug}-${sessionId8}.md`;
  return `${outputBase}/${agent}/${year}/${yearMonth}/${filename}`;
};

/** セッションメタ情報と会話ターン一覧から Markdown 文字列を生成する。 */
export const renderMarkdown = (meta: SessionMeta, turns: Turn[]): string => {
  const _lines: string[] = [];
  _lines.push('---');
  _lines.push(`session_id: ${quoteString(meta.sessionId)}`);
  _lines.push(`date: ${quoteString(meta.date)}`);
  if (meta.project) { _lines.push(`project: ${quoteString(meta.project)}`); }
  if (meta.slug) { _lines.push(`slug: ${quoteString(meta.slug)}`); }
  _lines.push('---');
  _lines.push('');
  _lines.push(`# ${meta.firstUserText.replace(/\n/g, ' ').slice(0, 100)}`);
  _lines.push('');
  _lines.push('## 会話ログ');
  _lines.push('');
  for (const turn of turns) {
    const label = turn.role === ConversationRole.user ? 'User' : 'Assistant';
    _lines.push(`### ${label}`);
    _lines.push('');
    _lines.push(turn.content.trim().replace(/\n{3,}/g, '\n\n'));
    _lines.push('');
  }
  return _lines.join('\n');
};

/** エクスポートセッションを Markdown ファイルとして書き出す。 */
export const writeSession = async (
  outputBase: string,
  agent: string,
  session: ExportedSession,
): Promise<string> => {
  const slug = textToSlug(session.meta.firstUserText, session.meta.slug || 'session');
  const outPath = buildOutputPath(outputBase, agent, session.meta, slug);
  const content = renderMarkdown(session.meta, session.turns);

  const dir = getDirectory(outPath);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(outPath, normalizeLine(content));
  return outPath;
};
