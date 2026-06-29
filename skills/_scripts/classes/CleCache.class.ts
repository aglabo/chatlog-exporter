// src: skills/_scripts/classes/CleCache.class.ts
// @(#): ファイルベース JSON キャッシュクラス（ディレクトリ状態をインスタンスに保持）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── local modules
// std
import { expandGlob } from '@std/fs';
import { parse as parseYaml } from '@std/yaml';
// libs
import { findFilesFlat } from '../libs/file-ops/find-files.ts';
import { getBasename, isAbsolutePath, joinPath, normalizePath } from '../libs/path-utils/path-utils.ts';
// classes
import { GlobalConfig } from './GlobalConfig.class.ts';
// types
import type {
  EnvProvider,
  GlobProvider,
  MkdirProvider,
  ReadTextFileProvider,
  WriteTextFileProvider,
} from '../types/providers.types.ts';

const _defaultGlob: GlobProvider = async (pattern) => {
  const _results: string[] = [];
  for await (const entry of expandGlob(pattern)) {
    _results.push(entry.path);
  }
  return _results;
};

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** `CleCache` に渡すファイル操作プロバイダー。テスト時はバッファで差し替える。 */
export interface CleCacheFileProviders {
  readTextFile?: ReadTextFileProvider;
  writeTextFile?: WriteTextFileProvider;
  mkdir?: MkdirProvider;
  glob?: GlobProvider;
}

/** `CleCache` コンストラクタに渡す依存性注入プロバイダーのまとめ。 */
export interface CleCacheProviders {
  /** ファイル操作プロバイダー（省略時は Deno デフォルト）。 */
  cache?: CleCacheFileProviders;
  /** 環境変数取得関数（省略時は `Deno.env.get`）。 */
  env?: EnvProvider;
}

// ─────────────────────────────────────────────
// CleCache クラス
// ─────────────────────────────────────────────

/**
 * ファイルベース JSON キャッシュクラス。
 *
 * `_hash` をインメモリキャッシュとして持ち、同一キーへの重複ファイル読み込みを防ぐ。
 * ファイルは `<cacheDir>/<basename>.json` として読み書きする。
 *
 * キャッシュディレクトリは `normalizePath(cacheRoot, providers?.env)/${subDir}` として解決する。
 * `cacheRoot` が falsy の場合は `GlobalConfig` の `cacheDir` を使用する。
 * `read`/`write` 前に `await cache.ready` を呼ぶこと。
 */
export class CleCache<T extends object> {
  private _cacheDir!: string;
  private readonly _hash: Map<string, Partial<T>>;

  private _readTextFile!: ReadTextFileProvider;
  private _writeTextFile!: WriteTextFileProvider;
  private _mkdir!: MkdirProvider;
  private _glob!: GlobProvider;

  /** 初期化（ディレクトリ作成）完了を待つ Promise。`read`/`write` 前に await すること。 */
  readonly ready: Promise<void>;

  /**
   * @param subDir - ベースディレクトリからの相対パス（`cacheRoot` 配下）
   * @param cacheRoot - キャッシュルートパス（falsy のとき `GlobalConfig.cacheDir` を使用）
   * @param providers - ファイル操作・環境変数プロバイダー（省略時は Deno デフォルト）
   */
  constructor(subDir: string, cacheRoot = '', providers?: CleCacheProviders) {
    this._initProviders(providers);
    this._hash = new Map<string, Partial<T>>();
    this.ready = this._initCacheDir(subDir, cacheRoot, providers);
  }

  /** ファイル操作プロバイダーを初期化する。省略時は Deno デフォルトを使用する。 */
  private _initProviders(providers?: CleCacheProviders): void {
    this._readTextFile = providers?.cache?.readTextFile ?? ((path) => Deno.readTextFile(path));
    this._writeTextFile = providers?.cache?.writeTextFile ?? ((path, data) => Deno.writeTextFile(path, data));
    this._mkdir = providers?.cache?.mkdir ?? ((path, opts) => Deno.mkdir(path, opts));
    this._glob = providers?.cache?.glob ?? _defaultGlob;
  }

  /**
   * `_cacheDir` を解決してディレクトリを作成する。
   * `cacheRoot` が falsy のとき `GlobalConfig.cacheDir` を非同期で取得する。
   */
  private async _initCacheDir(subDir: string, cacheRoot: string, providers?: CleCacheProviders): Promise<void> {
    const _expandedSubDir = normalizePath(subDir, providers?.env);
    if (isAbsolutePath(_expandedSubDir)) {
      this._cacheDir = _expandedSubDir;
    } else {
      const _root = cacheRoot || String((await GlobalConfig.getInstance()).get('cacheDir'));
      this._cacheDir = joinPath(normalizePath(_root, providers?.env), _expandedSubDir);
    }
    await this._mkdir(this._cacheDir, { recursive: true });
  }

  /** ファイルパスまたはファイル名から `_hash` キー（拡張子なしベース名）を返す。 */
  private _toHashKey(filePath: string): string {
    return getBasename(filePath);
  }

  /** `<cacheDir>/<key>.json` のパスを返す。 */
  private _cachePath(key: string): string {
    return joinPath(this._cacheDir, `${key}.json`);
  }

  /** ディスクから `<key>.json` を読み込み、`_hash` に格納して返す。ファイル不在時は `{}` を返す。 */
  private async _readFile(key: string): Promise<Partial<T>> {
    try {
      const _text = await this._readTextFile(this._cachePath(key));
      const _result = JSON.parse(_text) as Partial<T>;
      this._hash.set(key, _result);
      return _result;
    } catch {
      return {};
    }
  }

  /** `data` を `<key>.json` に書き込み、`_hash` を上書きする。 */
  private async _writeFile(key: string, data: Partial<T>): Promise<void> {
    await this._writeTextFile(this._cachePath(key), JSON.stringify(data));
    this._hash.set(key, data);
  }

  /**
   * キャッシュを読み込んで `Partial<T>` を返す。
   *
   * `_hash` にヒットすればディスクを読まずに即返す。ミス時のみ `_readFile` でファイルを読む。
   *
   * @param filePath - ファイルパスまたはファイル名（拡張子あり・なし両可）
   * @returns パース済みの `Partial<T>`、またはキャッシュなし時は `{}`
   */
  read(filePath: string): Promise<Partial<T>> {
    const _key = this._toHashKey(filePath);
    if (this._hash.has(_key)) { return Promise.resolve(this._hash.get(_key)!); }
    return this._readFile(_key);
  }

  /**
   * キャッシュに `data` を書き込む。同一キーの既存値は上書きされる。
   *
   * @param filePath - ファイルパスまたはファイル名（拡張子あり・なし両可）
   * @param data - 書き込むデータ
   */
  write(filePath: string, data: Partial<T>): Promise<void> {
    const _key = this._toHashKey(filePath);
    return this._writeFile(_key, data);
  }

  /**
   * YAML 文字列を解析して `_hash` を初期化する。ファイル I/O は発生しない。
   *
   * トップレベルのキーがそのまま `_hash` のキーになる。
   * 既存の `_hash` は完全に上書きされる。
   *
   * @param yaml - `{ key: { ...fields } }` 形式の YAML 文字列
   */
  loadFromYaml(yaml: string): void {
    const _parsed = parseYaml(yaml);
    this._hash.clear();
    if (_parsed == null || typeof _parsed !== 'object' || Array.isArray(_parsed)) { return; }
    for (const [key, value] of Object.entries(_parsed as Record<string, unknown>)) {
      this._hash.set(key, (value ?? {}) as Partial<T>);
    }
  }

  /**
   * `<cacheDir>/*.json` を全て読み込んで `_hash` を初期化する（1段のみ、再帰なし）。
   *
   * `findFilesFlat` で `.json` ファイル一覧を取得し、各ファイルを並列読み込みして格納する。
   * 読み込みに失敗したファイルはスキップされる。
   */
  async loadAll(): Promise<void> {
    const _paths = await findFilesFlat(this._cacheDir, { ext: '.json', glob: this._glob });
    this._hash.clear();
    await Promise.all(
      _paths.map(async (path) => {
        try {
          const _text = await this._readTextFile(path);
          this._hash.set(getBasename(path), JSON.parse(_text) as Partial<T>);
        } catch { /* スキップ */ }
      }),
    );
  }
}
