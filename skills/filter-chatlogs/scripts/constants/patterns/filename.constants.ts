// src: scripts/constants/patterns/filename.constants.ts
// @(#): filter-chatlogs ファイル名ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── internal ───
// constants
import { STRIP_TEMPLATE_MARKER } from '../strip.constants.ts';
// types
import type { ConditionalFilenamePattern } from '../../types/patterns.types.ts';

/**
 * システム/コマンドタグとして認識するプレフィックス一覧（`startsWith` 判定用）。
 *
 * ここに列挙するタグは「先頭に現れればターン全体がシステム入力」とみなせるものに限る。
 * Codex が会話冒頭に注入する `recommended_plugins` 等は本題が後続しうるため、
 * 前方一致ではなくターン全体を見る `isPreambleTurn` で判定する。
 */
export const SYSTEM_TAG_PREFIXES: string[] = [
  '<system-reminder',
  '<command-name',
  '<command-message',
  '<local-command-stdout',
  '<ide_opened_file',
  '<ide_selection',
  '---\n',
] as const;

/** ファイル名ノイズ判定の基本パターン文字列一覧（非公開）。派生定数の共通ソース。 */
const _BASE_FILENAME_PATTERNS: string[] = [
  'you-are-a-topic-and-tag-extraction-assistant',
  'say-ok-and-nothing-else',
  'command-message-claude-idd-framework',
  'command-message-deckrd-deckrd',
  'command-message-deckrd-coder',
  'pr-temp-idd-pr',
  'temp-idd-pr-pr-current-draft',
];

/**
 * ファイル名ノイズ判定の正規表現専用パターン一覧（非公開）。
 *
 * 文字列部分一致では正当なログを誤除外するため、アンカー付き正規表現で表現する必要があるものを置く。
 * `EXCLUDE_FILENAME_PATTERNS_STR`（`includes` 判定用）には含めない。
 */
const _REGEXP_ONLY_FILENAME_PATTERNS: RegExp[] = [
  // Codex プリアンブル断片がそのままタイトル化したログ。
  // session-writer の `<date>-<slug>-<hash>.md` 形式でスラッグ全体が
  // `recommended-plugins` である場合のみ一致させる（判定前に小文字化済み）。
  // 例: 2026-07-30-recommended-plugins-cfa0110de248.md → 一致
  //     2026-08-11-which-recommended-plugins-should-i-install-abc123.md → 不一致
  /^\d{4}-\d{2}-\d{2}-recommended-plugins-[0-9a-f]+\.md$/,

  // 要約プロンプト由来ログ。スラッグ全体が `summary` の場合のみ一致させる。
  // 例: 2026-07-25-summary-e2d4fc475cd1.md → 一致
  //     2026-07-25-summarize-the-following-log-in-50-words-abc123def456.md → 不一致
  /^\d{4}-\d{2}-\d{2}-summary-[0-9a-f]{12}\.md$/,

  // 二重日付形式（エクスポート日 + 元セッション日）を持つ exporter 内部セッションログ。
  // classify / filter がログ本文を貼り付けて起動するため、2 つめの日付直後に
  // プロンプト固有の語句が来る場合のみ一致させる。
  // 例: 2026-07-15-2026-06-26-file-1-c-users-atsushifx-workspaces-dev-0437ec223eed.md → 一致
  //     2026-07-15-2026-06-27-classify-the-log-file-below-050f9cb9-md-d885a1869ba7.md → 一致
  //     2026-07-15-2026-06-14-longterm-c-users-atsushifx-workspaces-d-11357bb78d91.md → 不一致
  /^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-(generate-metadata-for-the-following-eng|summary|review-the-following-frontmatter|classify-(the|each)-log-file|when-evaluating-an?-|file-\d+-c-users-)/,
];

/**
 * ファイル名だけでは正当なログと区別できないため、本文シグナルとの AND で判定するパターン一覧。
 *
 * これらのプロンプト冒頭句はユーザーが自分で入力しうる文言であり、ファイル名一致だけで
 * 削除確定すると正当なログを恒久削除する（`prefilter` は本文判定も AI 判定も通さない）。
 * exporter 内部セッションだけが本文に持つ構造的マーカーとの一致を追加条件とする。
 *
 * 既知の検出漏れ: meta プロンプト由来ログに `## Summary` があり `strip-chatlogs` 実行済みの場合、
 * 本文先頭〜`## Summary` 直前が除去済みでマーカーが残らないため一致しない。
 * 削除側ではなく保持側に倒れるため許容し、filter を strip より先に実行する運用で解く。
 */
export const CONDITIONAL_FILENAME_PATTERNS: ConditionalFilenamePattern[] = [
  // set-frontmatter のメタデータ生成プロンプト由来ログ。
  // 本文に meta.yaml の定型部見出しが行として存在することを追加条件とする。
  {
    filename: /^\d{4}-\d{2}-\d{2}-generate-metadata-for-the-following-eng/,
    body: new RegExp(`^${STRIP_TEMPLATE_MARKER}$`, 'm'),
  },

  // frontmatter レビュープロンプト由来ログ。
  // 本文に review.yaml の RULE 見出しが行として存在することを追加条件とする。
  {
    filename: /^\d{4}-\d{2}-\d{2}-review-the-following-frontmatter-against/,
    body: /^## RULE 0\b/m,
  },
];

/** 除外対象ファイル名パターン（文字列部分一致、`includes` 判定用）。 */
export const EXCLUDE_FILENAME_PATTERNS_STR: string[] = [..._BASE_FILENAME_PATTERNS];

/** noise-filter-chatlogs のファイル名除外正規表現パターン一覧。 */
export const NOISE_FILENAME_PATTERNS: RegExp[] = [
  ..._BASE_FILENAME_PATTERNS.map((p) => new RegExp(p)),
  ..._REGEXP_ONLY_FILENAME_PATTERNS,
];
