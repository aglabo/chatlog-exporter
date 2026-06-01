// src: scripts/libs/template-utils.ts
// @(#): set-frontmatter テンプレートユーティリティ
//       対象: renderPrompt
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// テンプレート変数置換
// ─────────────────────────────────────────────

/**
 * テンプレート内の ${varname} を vars で置換する。
 * varname が [a-z_]+ 以外の場合はエラー終了（インジェクション防止）。
 */
export const renderPrompt = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
    if (!/^[a-z_]+$/.test(name)) {
      throw new ChatlogError('InvalidArgs', 'InvalidSyntax', `不正な変数名 "${name}" — 英小文字と "_" のみ使用可能`);
    }
    if (!(name in vars)) {
      throw new ChatlogError('InvalidArgs', 'NotDefined', `未定義の変数 "${name}"`);
    }
    return vars[name];
  });
};
