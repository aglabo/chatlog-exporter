// src: scripts/modules/setfm-write.ts
// @(#): set-frontmatter Phase 4 Markdown書き込みモジュール
//       対象: writeFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { join, relative } from '@std/path';
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { extractChatlogBaseDir } from '../../../_scripts/libs/file-io/resolve-directory.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getDirectory, getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local
import { DEFAULT_ORDERED_FIELDS } from '../../../_scripts/constants/common.constants.ts';
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import type { FrontmatterFields } from '../../../_scripts/types/frontmatter.types.ts';
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';

// ─────────────────────────────────────────────
// frontmatter 抽出
// ─────────────────────────────────────────────

/**
 * エントリの frontmatter から DEFAULT_ORDERED_FIELDS のフィールドを抽出し、
 * null / 空文字列 / undefined のフィールドを除いた FrontmatterFields を返す。
 *
 * @param entry - 抽出元の `ChatlogEntry`
 * @returns フィルタ済みの frontmatter フィールドマップ
 */
export const extractEntryFrontmatter = (entry: ChatlogEntry): FrontmatterFields =>
  Object.fromEntries(
    DEFAULT_ORDERED_FIELDS
      .map((k) => [k, entry.frontmatter.get(k)] as [string, string | string[] | undefined])
      .filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as FrontmatterFields;

/**
 * FrontmatterFields から空・null・空配列のフィールドを除いたコピーを返す。
 *
 * @param fields - フィルタ対象の frontmatter フィールドマップ
 * @returns フィルタ済みのフィールドマップ
 */
export const filterFrontmatterFields = (fields: FrontmatterFields): FrontmatterFields =>
  Object.fromEntries(
    Object.entries(fields).filter(([, v]) => {
      if (Array.isArray(v)) { return v.length > 0; }
      return v !== undefined && v !== null && v !== '';
    }),
  ) as FrontmatterFields;

// ─────────────────────────────────────────────
// キャッシュ適用
// ─────────────────────────────────────────────

/**
 * キャッシュから frontmatter・type・category を `entry.frontmatter` に適用する。
 *
 * 値が空文字・null・undefined のフィールドはスキップし、既存の entry 値を上書きしない。
 *
 * @param entry - 適用対象の `ChatlogEntry`
 * @param fmCache - フェーズキャッシュデータ（`cache.read()` の戻り値）
 */
export const applyCacheToEntry = (
  entry: ChatlogEntry,
  fmCache: Partial<SetfmCache>,
): void => {
  if (fmCache.frontmatter) {
    Object.entries(fmCache.frontmatter)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .forEach(([k, v]) => entry.frontmatter.set(k, v));
  }
  if (fmCache.type) { entry.frontmatter.set('type', fmCache.type); }
  if (fmCache.category) { entry.frontmatter.set('category', fmCache.category); }
};

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

/**
 * エントリのフロントマターを Markdown ファイルに書き込む。
 *
 * `cache` からフロントマター・type・category を適用した後、6フィールド充足チェックを行い、
 * 全フィールドありの場合は実際のファイル書き込みを実施する。
 * 書き込み成功後は `cache.status` を `WRITTEN` に更新する。
 * I/O エラーが発生した場合は一時ファイル（.tmp）を削除して例外を再 throw する。
 *
 * @param entry - 書き込み対象の `ChatlogEntry`
 * @param cache - フェーズキャッシュ（frontmatter・type・category の供給元）
 * @param outputDir - 出力先ディレクトリ
 * @param inputDir - 入力元ディレクトリ（相対パス計算用）
 * @returns 書き込みに成功したとき `true`、フィールド不足のとき `false`
 * @throws フィールド充足チェック通過後にファイル I/O エラーが発生した場合
 */
export const writeFrontmatter = async (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
  outputDir: string,
  inputDir: string,
): Promise<boolean> => {
  const _inputPath = entry.filePath!;
  if (!entry.frontmatter.hasRequiredFields()) {
    logger.error(`${LOGGER_TEXT.INDENT}FAIL (yaml空): ${getFilename(_inputPath)}`);
    return false;
  }

  const _baseDir = extractChatlogBaseDir(_inputPath);
  const _resolvedInputDir = _baseDir || inputDir;
  const _resolvedOutputDir = _baseDir && _baseDir.endsWith('normalizelogs')
    ? _baseDir.replace(/normalizelogs$/, 'outputLogs')
    : outputDir;

  const _relPath = relative(_resolvedInputDir, _inputPath);
  const _outputPath = join(_resolvedOutputDir, _relPath);
  const _outputSubDir = getDirectory(_outputPath);
  const _tmpFile = _outputPath + '.tmp';
  try {
    await Deno.mkdir(_outputSubDir, { recursive: true });
    await Deno.writeTextFile(_tmpFile, entry.renderEntry());
    await Deno.rename(_tmpFile, _outputPath);
    const _cached = cache.read(_inputPath);
    await cache.write(_inputPath, { ..._cached, status: SETFM_CACHE_STATUSES.WRITTEN });
    return true;
  } catch (e) {
    await Deno.remove(_tmpFile).catch(() => {});
    throw e;
  }
};
