// src: scripts/libs/session-writer.ts
// @(#): セッション Markdown 書き出しユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── External modules ───────────────────────────────────────────────────────
import { getDirectory } from '../../../_scripts/libs/file-io/path-utils.ts';
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';
import { textToSlug } from '../../../_scripts/libs/text/slug-utils.ts';
import { quoteString } from '../../../_scripts/libs/text/string-utils.ts';

// ─── Types ──────────────────────────────────────────────────────────────────
import type { ExportedSession, SessionMeta, Turn } from '../types/session.types.ts';

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
  _lines.push(`project: ${quoteString(meta.project)}`);
  if (meta.slug) { _lines.push(`slug: ${quoteString(meta.slug)}`); }
  _lines.push('---');
  _lines.push('');
  _lines.push(`# ${meta.firstUserText.replace(/\n/g, ' ').slice(0, 100)}`);
  _lines.push('');
  _lines.push('## 会話ログ');
  _lines.push('');
  for (const turn of turns) {
    const label = turn.role === 'user' ? 'User' : 'Assistant';
    _lines.push(`### ${label}`);
    _lines.push('');
    _lines.push(turn.text.trim().replace(/\n{3,}/g, '\n\n'));
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
