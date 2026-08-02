// src: skills/_scripts/libs/text/slug-utils.ts
// @(#): スラッグ生成ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * テキストからファイル名用の URL セーフなスラッグ文字列を生成する。
 * 英小文字・数字・ハイフンのみからなる 3〜50 文字のスラッグ、または `fallback` を返す。
 */
export const textToSlug = (text: string, fallback = 'session'): string => {
  let s = text.trim().split('\n\n')[0].slice(0, 200);
  s = s.split('\n')[0].trim();
  s = s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-').trim().toLowerCase();
  s = s.replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '');
  return s.length >= 3 ? s : fallback;
};
