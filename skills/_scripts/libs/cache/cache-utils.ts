// src: skills/_scripts/libs/cache/cache-utils.ts
// @(#): 汎用ファイルベース JSON キャッシュ操作ユーティリティ
//       対象: getCacheSlug / readCache / writeCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import type {
  MkdirProvider,
  ReadTextFileProvider,
  RenameProvider,
  WriteTextFileProvider,
} from '../../types/providers.types.ts';
import { getRelativePath, joinPath } from '../path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────

/** キャッシュファイルのパスを算出する。 */
const _cachePath = (cacheDir: string, slug: string): string => joinPath(cacheDir, `${slug}.cache.json`);

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** `writeCache` に渡す依存性注入プロバイダーのまとめ。 */
export interface CacheWriteProviders {
  readTextFile?: ReadTextFileProvider;
  writeTextFile?: WriteTextFileProvider;
  mkdir?: MkdirProvider;
  rename?: RenameProvider;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * 入力ディレクトリとファイルパスから、キャッシュファイル識別用の slug を算出する。
 *
 * `getRelativePath` でパスを相対化・正規化し、パス区切り文字（`/`）を
 * `_` に置換して返す。
 *
 * @param inputDir - 入力ディレクトリの絶対パス
 * @param filePath - エントリファイルの絶対パス
 * @returns パス区切りを `_` に置換した slug 文字列
 */
export const getCacheSlug = (inputDir: string, filePath: string): string =>
  getRelativePath(inputDir, filePath).replace(/\//g, '_');

/**
 * キャッシュファイルを読み込んで `T` のパーシャルオブジェクトを返す。
 *
 * ファイルが存在しない場合は `{}` を返す（エラーにしない）。
 *
 * @param cacheDir - キャッシュファイルを格納するディレクトリ
 * @param slug - `getCacheSlug` で算出した識別子
 * @param readProvider - テキストファイルを読み込む関数（デフォルト: `Deno.readTextFile`）
 * @returns パース済みの `Partial<T>`、またはファイル不在時は `{}`
 */
export const readCache = async <T extends object>(
  cacheDir: string,
  slug: string,
  readProvider: ReadTextFileProvider = (p) => Deno.readTextFile(p),
): Promise<Partial<T>> => {
  const _path = _cachePath(cacheDir, slug);
  try {
    const _text = await readProvider(_path);
    return JSON.parse(_text) as Partial<T>;
  } catch {
    return {};
  }
};

/**
 * キャッシュファイルに `patch` をマージして書き込む。
 *
 * 既存キャッシュを読み込み、`patch` で上書きしたオブジェクトをアトミックに書き込む
 * （`.tmp` ファイルへ書き込み後に rename することでデータロスを防ぐ）。
 * キャッシュディレクトリは存在しない場合に自動作成する。
 *
 * @param cacheDir - キャッシュファイルを格納するディレクトリ
 * @param slug - `getCacheSlug` で算出した識別子
 * @param patch - マージするフィールド群
 * @param providers - ファイル操作プロバイダー（テスト用インジェクション可能）
 */
export const writeCache = async <T extends object>(
  cacheDir: string,
  slug: string,
  patch: Partial<T>,
  providers: CacheWriteProviders = {},
): Promise<void> => {
  const _mkdir = providers.mkdir ?? ((p, opts) => Deno.mkdir(p, opts));
  const _writeTextFile = providers.writeTextFile ?? ((p, data) => Deno.writeTextFile(p, data));
  const _rename = providers.rename ?? ((o, n) => Deno.rename(o, n));

  await _mkdir(cacheDir, { recursive: true });
  const _existing = await readCache<T>(cacheDir, slug, providers.readTextFile);
  const _merged = { ..._existing, ...patch };
  const _path = _cachePath(cacheDir, slug);
  const _tmpPath = `${_path}.tmp`;
  await _writeTextFile(_tmpPath, JSON.stringify(_merged, null, 2));
  await _rename(_tmpPath, _path);
};
