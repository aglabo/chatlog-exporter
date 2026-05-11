// src: scripts/constants/skip-rules.ts
// @(#): スキップ判定ルールの定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * ユーザー入力テキストを「短文肯定」と判定するための文字数上限。
 *
 * `isShortAffirmation()` がこの値を参照し、テキストの長さがこの値以下かつ
 * `SKIP_EXACT` に含まれる場合にスキップ対象と判定する。
 * 値は 20 文字で、「ありがとうございます」（9文字）等の最長語を余裕を持って包含する設計。
 *
 * @see isShortAffirmation
 * @see SKIP_EXACT
 */
export const SHORT_AFFIRMATION_MAX_LEN = 20;

/**
 * スキップ対象と判定する完全一致語のセット（小文字正規化後に照合）。
 *
 * ユーザー入力が実質的な質問ではなく、単純な承認・謝意・操作指示にすぎない場合に
 * チャットログから除外するための語彙集。英語・日本語両方の慣用表現を網羅する。
 * `isShortAffirmation()` が `text.trim().toLowerCase()` 後に参照する。
 *
 * @see isShortAffirmation
 * @see SHORT_AFFIRMATION_MAX_LEN
 */
export const SKIP_EXACT = new Set([
  'y',
  'yes',
  'はい',
  'うん',
  'ok',
  'sure',
  'yep',
  'yeah',
  '進めて',
  'やって',
  'do it',
  'doit',
  'go',
  'go ahead',
  'proceed',
  'それで',
  'それでいい',
  'それでお願いします',
  'お願いします',
  'いいよ',
  'いいです',
  '大丈夫',
  'ありがとう',
  'ありがとうございます',
  'thanks',
  'thx',
]);

/**
 * セッションの先頭行にある `name:` または `title:` の value にこれらのキーワードのいずれかが
 * 含まれる場合（大文字小文字不問）、セッション全体をエクスポート対象から除外する。
 *
 * SESSION_SKIP_KEYWORDS_HEAD_LINES 行以内の `name:`/`title:` 行を対象とする。
 *
 * @see isSkippableSession
 */
export const SESSION_SKIP_KEYWORDS: string[] = [
  'commit message generator',
  'commit-message',
];

/**
 * SESSION_SKIP_KEYWORDS の検索対象とする先頭行数。
 */
export const SESSION_SKIP_KEYWORDS_HEAD_LINES = 10;

export const SKIP_PREFIXES = [
  '/clear',
  '/help',
  '/reset',
  '/exit',
  '/quit',
  '<system-reminder',
  '<command-name',
  '<command-message',
  '[Request interrupted',
  'Tool loaded.',
  'Unknown skill:',
  "Say 'OK' and nothing else.",
];
