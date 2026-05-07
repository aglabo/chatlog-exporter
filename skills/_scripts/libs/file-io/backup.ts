// src: skills/_scripts/libs/file-io/backup.ts
// @(#): ファイルバックアップユーティリティ
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

// --- hared modules
// functions
import { fileExists } from './exists-utils.ts';
// types
import type { ListDirProvider } from '../../types/providers.types.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────

/**
 * ディレクトリ内のファイル名一覧を返すデフォルト実装。
 * `Deno.readDir` を使用する。
 *
 * @param dir - スキャンするディレクトリパス
 * @returns ファイル名の配列
 */
export const defaultListDir = async (dir: string): Promise<string[]> => {
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    names.push(entry.name);
  }
  return names;
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
 * 例:
 * - `entry.md`（バックアップなし）→ `entry.old-01.md` にリネーム
 * - `entry.md`（`entry.old-01.md` 既存）→ `entry.old-02.md` にリネーム
 *
 * @param outputPath - バックアップ対象のファイルパス（`.md` 拡張子推奨）
 * @param listDir    - ディレクトリ一覧取得関数（テスト用インジェクション可能、デフォルト: `defaultListDir`）
 * @returns void
 * @throws {Error} バックアップスロットが 99 を超えた場合
 */
export const backupOldPath = async (
  outputPath: string,
  listDir: ListDirProvider = defaultListDir,
): Promise<void> => {
  if (!await fileExists(outputPath)) {
    return;
  }

  const base = outputPath.endsWith('.md') ? outputPath.slice(0, -3) : outputPath;
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '.';
  const baseName = base.includes('/') ? base.slice(base.lastIndexOf('/') + 1) : base;
  const backupPattern = new RegExp(`^${baseName}\\.old-(\\d{2})\\.md$`);

  const files = await listDir(dir);
  const usedSlots = files
    .map((name) => backupPattern.exec(name))
    .filter((m) => m !== null)
    .map((m) => Number(m![1]));

  const next = usedSlots.length === 0 ? 1 : Math.max(...usedSlots) + 1;
  if (next > 99) { throw new ChatlogError('TooManyBackups', `too many backups for: ${outputPath}`); }

  const idx = String(next).padStart(2, '0');
  await Deno.rename(outputPath, `${base}.old-${idx}.md`);
};
