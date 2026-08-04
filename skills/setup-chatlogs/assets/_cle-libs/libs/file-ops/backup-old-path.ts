// src: skills/_cle-libs/libs/file-ops/backup-old-path.ts
// @(#): 既存ファイルを連番バックアップ (.old-NN.md) にリネームするユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * backup.ts — 既存ファイルを連番バックアップ (.old-NN.md) するユーティリティ
 *
 * outputPath が存在する場合、最初の空きスロット <basename>.old-NN.md (01〜99) に
 * リネームする。outputPath が存在しない場合は何もしない。
 */

// --- shared modules
// functions
import { expandGlob } from '@std/fs';
// types
import type { GlobProvider } from '../../types/providers.types.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────

/**
 * glob パターンでファイル名一覧を返すデフォルト実装。
 * `expandGlob` を使用し、ファイル名のみを返す。
 *
 * @param pattern - glob パターン
 * @returns ファイル名の配列
 */
const _defaultGlob: GlobProvider = (pattern: string): Promise<string[]> =>
  Array.fromAsync(expandGlob(pattern), (e) => e.name);

/**
 * ファイル名一覧から `<baseName>.old-NN.md` 形式のスロット番号を検索し、
 * 次の空きスロット番号を返す。
 *
 * @param files    - ディレクトリ内のファイル名一覧
 * @param baseName - バックアップ対象のベース名（拡張子なし）
 * @returns 次の空きスロット番号（1〜100、100 は上限超過を示す）
 */
const _findNextSlot = (files: string[], baseName: string): number => {
  const _pattern = new RegExp(`^${baseName}\\.old-(\\d{2})\\.md$`);
  const _backups = files.filter((f) => _pattern.test(f)).sort();
  if (_backups.length === 0) { return 1; }
  return Number(_backups.at(-1)!.match(_pattern)![1]) + 1;
};

// ─────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────

/**
 * 既存ファイルを連番バックアップ (.old-NN.md) にリネームする。
 *
 * - `outputPath` が存在しない → 何もせず即時 return
 * - `outputPath` が存在する  → `<basename>.old-NN.md` の最初の空きスロット (01〜99) にリネーム
 *
 * glob 1回で元ファイルの存在確認とバックアップ一覧取得を兼ねる。
 *
 * 例:
 * - `entry.md`（バックアップなし）→ `entry.old-01.md` にリネーム
 * - `entry.md`（`entry.old-01.md` 既存）→ `entry.old-02.md` にリネーム
 *
 * @param outputPath - バックアップ対象のファイルパス（`.md` 拡張子推奨）
 * @param glob       - glob パターンでファイル名一覧を取得する関数（テスト用インジェクション可能、デフォルト: `_defaultGlob`）
 * @returns void
 * @throws {ChatlogError} バックアップスロットが 99 を超えた場合
 */
export const backupOldPath = async (
  outputPath: string,
  glob: GlobProvider = _defaultGlob,
): Promise<void> => {
  const base = outputPath.endsWith('.md') ? outputPath.slice(0, -3) : outputPath;
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '.';
  const baseName = base.includes('/') ? base.slice(base.lastIndexOf('/') + 1) : base;

  const _files = await glob(`${dir}/${baseName}*.md`);
  if (!_files.includes(`${baseName}.md`)) { return; }

  const next = _findNextSlot(_files, baseName);
  if (next > 99) { throw new ChatlogError('TooManyBackups', 'IndexOverflow', `too many backups for: ${outputPath}`); }

  const idx = String(next).padStart(2, '0');
  await Deno.rename(outputPath, `${base}.old-${idx}.md`);
};
