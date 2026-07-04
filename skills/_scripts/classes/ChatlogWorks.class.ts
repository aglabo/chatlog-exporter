// src: skills/_scripts/classes/ChatlogWorks.class.ts
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
import { logger } from '../libs/io/logger.ts';
import { getBasename, isAbsolutePath, joinPath, normalizePath } from '../libs/path-utils/path-utils.ts';
import { hasFrontmatter, parseFrontmatter } from '../libs/text/frontmatter-utils.ts';
// classes
import { GlobalConfig } from './GlobalConfig.class.ts';
// constants
import { CACHE_STATUSES } from '../types/cache-status.const.types.ts';
// types
import type {
  EnvProvider,
  GlobProvider,
  MkdirProvider,
  ReadTextFileProvider,
  RemoveProvider,
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

/** `ChatlogWorks` に渡すファイル操作プロバイダー。テスト時はバッファで差し替える。 */
export interface ChatlogWorksFileProviders {
  readTextFile?: ReadTextFileProvider;
  writeTextFile?: WriteTextFileProvider;
  mkdir?: MkdirProvider;
  glob?: GlobProvider;
  removeFile?: RemoveProvider;
}

/** `ChatlogWorks` コンストラクタに渡す依存性注入プロバイダーのまとめ。 */
export interface ChatlogWorksProviders {
  /** ファイル操作プロバイダー（省略時は Deno デフォルト）。 */
  cache?: ChatlogWorksFileProviders;
  /** 環境変数取得関数（省略時は `Deno.env.get`）。 */
  env?: EnvProvider;
}

/** `ChatlogWorks` コンストラクタに渡すキャッシュ初期化オプション。 */
export interface ChatlogWorksInitializer {
  /** YAML 文字列でキャッシュを初期化する場合に指定する。省略時はディレクトリから自動読み込み。 */
  yaml?: string;
  /** 出力ディレクトリパス。`.md` ファイルを一覧して `hasFrontmatter` が true のファイルのみキャッシュに登録する。`yaml` が指定された場合は無視される。 */
  outputDir?: string;
}

// ─────────────────────────────────────────────
// ChatlogWorks クラス
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
export class ChatlogWorks<T extends object> {
  private _cacheDir!: string;
  private readonly _hash: Map<string, Partial<T>>;

  private _readTextFile!: ReadTextFileProvider;
  private _writeTextFile!: WriteTextFileProvider;
  private _mkdir!: MkdirProvider;
  private _glob!: GlobProvider;
  private _removeFile!: RemoveProvider;

  /** 初期化（ディレクトリ作成）完了を待つ Promise。`read`/`write` 前に await すること。 */
  readonly ready: Promise<void>;

  /**
   * @param subDir - ベースディレクトリからの相対パス（`cacheRoot` 配下）
   * @param cacheRoot - キャッシュルートパス（falsy のとき `GlobalConfig.cacheDir` を使用）
   * @param providers - ファイル操作・環境変数プロバイダー（省略時は Deno デフォルト）
   * @param initializer - キャッシュ初期化オプション（yaml 指定時は YAML で初期化、省略時はディレクトリから読み込み）
   */
  constructor(
    subDir: string,
    cacheRoot = '',
    initializer?: ChatlogWorksInitializer,
    providers?: ChatlogWorksProviders,
  ) {
    this._initProviders(providers);
    this._hash = new Map<string, Partial<T>>();
    this.ready = this._initCacheDir(subDir, cacheRoot, providers, initializer);
  }

  /** ファイル操作プロバイダーを初期化する。省略時は Deno デフォルトを使用する。 */
  private _initProviders(providers?: ChatlogWorksProviders): void {
    this._readTextFile = providers?.cache?.readTextFile ?? ((path) => Deno.readTextFile(path));
    this._writeTextFile = providers?.cache?.writeTextFile ?? ((path, data) => Deno.writeTextFile(path, data));
    this._mkdir = providers?.cache?.mkdir ?? ((path, opts) => Deno.mkdir(path, opts));
    this._glob = providers?.cache?.glob ?? _defaultGlob;
    this._removeFile = providers?.cache?.removeFile ?? ((path) => Deno.remove(path));
  }

  /**
   * `_cacheDir` を解決してディレクトリを作成する。
   * `cacheRoot` が falsy のとき `GlobalConfig.cacheDir` を非同期で取得する。
   */
  private async _initCacheDir(
    subDir: string,
    cacheRoot: string,
    providers?: ChatlogWorksProviders,
    initializer?: ChatlogWorksInitializer,
  ): Promise<void> {
    const _expandedSubDir = normalizePath(subDir, providers?.env);
    if (isAbsolutePath(_expandedSubDir)) {
      this._cacheDir = _expandedSubDir;
    } else {
      const _root = cacheRoot || String((await GlobalConfig.getInstance()).get('cacheDir'));
      this._cacheDir = joinPath(normalizePath(_root, providers?.env), _expandedSubDir);
    }
    await this._mkdir(this._cacheDir, { recursive: true });
    if (initializer?.yaml != null) {
      this.loadFromYaml(initializer.yaml);
    } else {
      if (initializer?.outputDir != null) {
        await this.initFromOutputDir(initializer.outputDir);
      }
      await this.loadAll();
    }
  }

  /** ファイルパスまたはファイル名から `_hash` キー（拡張子なしベース名）を返す。 */
  private _toHashKey(filePath: string): string {
    return getBasename(filePath);
  }

  /** `<cacheDir>/<key>.json` のパスを返す。 */
  private _cachePath(key: string): string {
    return joinPath(this._cacheDir, `${key}.json`);
  }

  /** `data` を `<key>.json` に書き込み、`_hash` を上書きする。 */
  private async _writeFile(key: string, data: Partial<T>): Promise<void> {
    await this._writeTextFile(this._cachePath(key), JSON.stringify(data));
    this._hash.set(key, data);
  }

  /**
   * キャッシュを読み込んで `Partial<T>` を返す。
   *
   * `await cache.ready` でプリロード済みの `_hash` を参照する同期メソッド。
   * キャッシュミス時は `{}` を返す。
   *
   * @param filePath - ファイルパスまたはファイル名（拡張子あり・なし両可）
   * @returns パース済みの `Partial<T>`、またはキャッシュなし時は `{}`
   */
  read(filePath: string): Partial<T> {
    const _key = this._toHashKey(filePath);
    return this._hash.has(_key) ? (this._hash.get(_key) as Partial<T>) : {};
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
   * キャッシュエントリを削除する。
   *
   * `_hash` からエントリを削除し、対応する `.json` ファイルを削除する。
   * エントリやファイルが存在しない場合は no-op（冪等）。
   * ファイル削除が `Deno.errors.NotFound` で失敗した場合は無視する。
   *
   * @param filePath - ファイルパスまたはファイル名（拡張子あり・なし両可）
   */
  async delete(filePath: string): Promise<void> {
    const _key = this._toHashKey(filePath);
    this._hash.delete(_key);
    try {
      await this._removeFile(this._cachePath(_key));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) { throw e; }
    }
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
   * `outputDir` の `.md` ファイルを `isComplete(text)` で絞り込み、`meta + status: written` で初期化する。
   *
   * `findFilesFlat(outputDir)` でファイル一覧を取得し、テキストを読み込んで `isComplete` 述語が
   * true のファイルのみ `parseFrontmatter` で解析した `meta` に `status: written` を加えて書き込む。
   * 並列実行するため、glob の reject や writeFile / readTextFile の reject はそのまま伝播する。
   *
   * @param outputDir - `.md` ファイルを探索するディレクトリパス
   * @param isComplete - テキストを受け取り書き込み対象か判定する述語（省略時は `hasFrontmatter`）
   */
  async initFromOutputDir(
    outputDir: string,
    isComplete: (text: string) => boolean = hasFrontmatter,
  ): Promise<void> {
    const _allFiles = await findFilesFlat(outputDir, { glob: this._glob });
    const _targets = (
      await Promise.all(
        _allFiles.map(async (filePath) => {
          const _text = await this._readTextFile(filePath);
          if (!isComplete(_text)) { return null; }
          const { meta } = parseFrontmatter(_text);
          return { filePath, meta };
        }),
      )
    ).filter((entry): entry is { filePath: string; meta: Record<string, unknown> } => entry !== null);
    await Promise.all(
      _targets.map(({ filePath, meta }) =>
        this._writeFile(this._toHashKey(filePath), { ...meta, status: CACHE_STATUSES.WRITTEN } as unknown as Partial<T>)
      ),
    );
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
        } catch (e) {
          logger.warn(`[ChatlogWorks] loadAll: skip ${path} — ${(e as Error).message}`);
        }
      }),
    );
  }
}
