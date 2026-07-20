// src: skills/_scripts/classes/ChatlogCache.class.ts
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
import { runConcurrent } from '../libs/parallel/concurrency.ts';
import { getBasename, isAbsolutePath, joinPath, normalizePath } from '../libs/path-utils/path-utils.ts';
import { hasFrontmatter, hasFrontmatterFields, parseFrontmatterEntries } from '../libs/text/frontmatter-utils.ts';
// classes
import { GlobalConfig } from './GlobalConfig.class.ts';
// constants
import { CACHE_STATUSES } from '../types/cache-status.const.types.ts';
// types
import type { FrontmatterFields } from '../types/frontmatter.types.ts';
import type {
  EnvProvider,
  GlobProvider,
  MkdirProvider,
  ReadTextFileProvider,
  RemoveProvider,
  WriteTextFileProvider,
} from '../types/providers.types.ts';

/** `meta` に `type`/`category`/`title` が全て非空文字列で存在するか判定する。 */
const _hasBaseFields = (meta: FrontmatterFields): boolean => hasFrontmatterFields(meta, ['type', 'category', 'title']);

/** テキストのフロントマターに全5フィールド（type/category/title/topics/tags）が揃っているか判定する。 */
const _isComplete = (text: string): boolean => {
  const { meta } = parseFrontmatterEntries(text);
  return hasFrontmatterFields(meta);
};

/** `initFromOutputDir` のファイル分類結果。`written`/`empty` は書き込み対象、`delete` は削除対象。 */
type _EntryStatus = 'written' | 'empty' | 'delete';

/**
 * テキストを分類して `_EntryStatus` と `meta` を返す。フロントマターなしの場合は `null` を返す（スキップ）。
 *
 * @param text - ファイルテキスト
 * @param isComplete - テキストを受け取り完全書き込み対象か判定する述語
 * @returns 分類結果と解析済み meta、またはスキップ時 `null`
 */
const _classifyEntry = (
  text: string,
  isComplete: (text: string) => boolean,
): { status: _EntryStatus; meta: FrontmatterFields } | null => {
  if (!hasFrontmatter(text)) { return null; }
  const { meta } = parseFrontmatterEntries(text);
  if (isComplete(text)) { return { status: 'written', meta }; }
  if (_hasBaseFields(meta)) { return { status: 'empty', meta }; }
  return { status: 'delete', meta };
};

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

/** `ChatlogCache` に渡すファイル操作プロバイダー。テスト時はバッファで差し替える。 */
export interface ChatlogCacheFileProviders {
  readTextFile?: ReadTextFileProvider;
  writeTextFile?: WriteTextFileProvider;
  mkdir?: MkdirProvider;
  glob?: GlobProvider;
  removeFile?: RemoveProvider;
}

/** `ChatlogCache` コンストラクタに渡す依存性注入プロバイダーのまとめ。 */
export interface ChatlogCacheProviders {
  /** ファイル操作プロバイダー（省略時は Deno デフォルト）。 */
  cache?: ChatlogCacheFileProviders;
  /** 環境変数取得関数（省略時は `Deno.env.get`）。 */
  env?: EnvProvider;
}

/** `ChatlogCache` コンストラクタに渡すキャッシュ初期化オプション。 */
export interface ChatlogCacheInitializer {
  /** YAML 文字列でキャッシュを初期化する場合に指定する。省略時はディレクトリから自動読み込み。 */
  yaml?: string;
  /** 出力ディレクトリパス。`.md` ファイルを一覧して `hasFrontmatter` が true のファイルのみキャッシュに登録する。`yaml` が指定された場合は無視される。 */
  outputDir?: string;
  /** ファイル読み込み・書き込みの並列実行数（省略時は `GlobalConfig` の `concurrency` を使用）。 */
  concurrency?: number;
}

// ─────────────────────────────────────────────
// ChatlogCache クラス
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
export class ChatlogCache<T extends object> {
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
    initializer?: ChatlogCacheInitializer,
    providers?: ChatlogCacheProviders,
  ) {
    this._initProviders(providers);
    this._hash = new Map<string, Partial<T>>();
    this.ready = this._initCacheDir(subDir, cacheRoot, providers, initializer);
  }

  /** ファイル操作プロバイダーを初期化する。省略時は Deno デフォルトを使用する。 */
  private _initProviders(providers?: ChatlogCacheProviders): void {
    this._readTextFile = providers?.cache?.readTextFile ?? ((path) => Deno.readTextFile(path));
    this._writeTextFile = providers?.cache?.writeTextFile ?? ((path, data) => Deno.writeTextFile(path, data));
    this._mkdir = providers?.cache?.mkdir ?? ((path, opts) => Deno.mkdir(path, opts));
    this._glob = providers?.cache?.glob ?? _defaultGlob;
    this._removeFile = providers?.cache?.removeFile ?? ((path) => Deno.remove(path));
  }

  /**
   * `_cacheDir` を解決してディレクトリを作成する。
   * `cacheRoot` が falsy のとき `GlobalConfig.cacheDir` を取得する。
   */
  private async _initCacheDir(
    subDir: string,
    cacheRoot: string,
    providers?: ChatlogCacheProviders,
    initializer?: ChatlogCacheInitializer,
  ): Promise<void> {
    const _expandedSubDir = normalizePath(subDir, providers?.env);
    if (isAbsolutePath(_expandedSubDir)) {
      this._cacheDir = _expandedSubDir;
    } else {
      const _root = cacheRoot || String(GlobalConfig.getInstance().get('cacheDir'));
      this._cacheDir = joinPath(normalizePath(_root, providers?.env), _expandedSubDir);
    }
    await this._mkdir(this._cacheDir, { recursive: true });
    if (initializer?.yaml != null) {
      this.loadFromYaml(initializer.yaml);
    } else {
      const _concurrency = initializer?.concurrency ?? Number(GlobalConfig.getInstance().get('concurrency'));
      await this.loadAll(_concurrency);
      if (initializer?.outputDir != null) {
        await this.initFromOutputDir(initializer.outputDir, undefined, _concurrency);
      }
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

  /** 2つの frontmatter オブジェクトを浅くマージする。どちらかが `undefined` の場合は `undefined` を返す。 */
  private _mergeFrontmatter(
    existing: object | undefined,
    incoming: object | undefined,
  ): object | undefined {
    if (existing === undefined || incoming === undefined) { return undefined; }
    return { ...existing, ...incoming };
  }

  /**
   * キャッシュエントリを既存値とマージして更新する。
   *
   * 既存エントリに `data` を浅くマージする。`data.frontmatter` が指定され、かつ既存値の
   * `frontmatter` がオブジェクトの場合のみ、`frontmatter` を内部マージ（2段階マージ）する。
   * エントリが存在しない場合は `data` をそのまま書き込む。
   *
   * @param filePath - ファイルパスまたはファイル名（拡張子あり・なし両可）
   * @param data - マージするデータ
   */
  update(filePath: string, data: Partial<T>): Promise<void> {
    const _existing = this.read(filePath) as Record<string, unknown>;
    const _dataRec = data as Record<string, unknown>;
    const _fm = this._mergeFrontmatter(
      _existing['frontmatter'] as object | undefined,
      _dataRec['frontmatter'] as object | undefined,
    );
    const _merged = {
      ..._existing,
      ..._dataRec,
      ...(_fm !== undefined && { frontmatter: _fm }),
    };
    return this.write(filePath, _merged as Partial<T>);
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
   * `outputDir` の `.md` ファイルを4段階で判定し、キャッシュを初期化する。
   *
   * フロントマターなし → スキップ（既存キャッシュ保持）。
   * フロントマターあり + `isComplete(text)` true → `{ ...meta, status: 'written' }` で書き込む。
   * フロントマターあり + `isComplete` false + 基本3フィールド（type/category/title）あり → `{ ...meta, status: '' }` で書き込む。
   * フロントマターあり + `isComplete` false + 基本3フィールド不足 → `this.delete(filePath)` で削除してスキップ。
   *
   * 並列実行するため、glob の reject や writeFile / readTextFile の reject はそのまま伝播する。
   * いずれかの操作が reject すると以降の未着手操作は中断される（`withConcurrency` の abort-on-reject 挙動）。
   *
   * @param outputDir - `.md` ファイルを探索するディレクトリパス
   * @param isComplete - テキストを受け取り完全書き込み対象か判定する述語（省略時は全5フィールド揃い判定）
   * @param concurrency - ファイル読み込み・書き込みの並列実行数
   */
  async initFromOutputDir(
    outputDir: string,
    isComplete: (text: string) => boolean = _isComplete,
    concurrency: number,
  ): Promise<void> {
    const _allFiles = await findFilesFlat(outputDir, { glob: this._glob });

    // step 1: 未キャッシュのファイルのみに絞る（同期 filter）
    const _fresh = _allFiles
      .map((filePath) => ({ filePath, key: this._toHashKey(filePath) }))
      .filter(({ key }) => !this._hash.has(key));

    // step 2: テキスト読み込み + 分類（並列）
    const _classified = (
      await runConcurrent(_fresh, async ({ filePath, key }) => {
        const _text = await this._readTextFile(filePath);
        const _entry = _classifyEntry(_text, isComplete);
        return _entry !== null ? { filePath, key, ..._entry } : null;
      }, concurrency)
    ).filter((e): e is { filePath: string; key: string; status: _EntryStatus; meta: FrontmatterFields } => e !== null);

    // step 3: 書き込み対象（written / empty）と削除対象に分けて実行
    const _toWrite = _classified.filter(({ status }) => status !== 'delete');
    const _toDelete = _classified.filter(({ status }) => status === 'delete');

    const _ops = [
      ..._toWrite.map(({ key, status, meta }) => () => {
        const _cacheStatus = status === 'written' ? CACHE_STATUSES.WRITTEN : CACHE_STATUSES.EMPTY;
        return this._writeFile(key, { ...meta, status: _cacheStatus } as unknown as Partial<T>);
      }),
      ..._toDelete.map(({ filePath }) => () => this.delete(filePath)),
    ];
    await runConcurrent(_ops, (op) => op(), concurrency);
  }

  /**
   * `<cacheDir>/*.json` を全て読み込んで `_hash` を初期化する（1段のみ、再帰なし）。
   *
   * `findFilesFlat` で `.json` ファイル一覧を取得し、各ファイルを並列読み込みして格納する。
   * 読み込みに失敗したファイルはスキップされる。
   *
   * @param concurrency - ファイル読み込みの並列実行数
   */
  async loadAll(concurrency: number): Promise<void> {
    const _paths = await findFilesFlat(this._cacheDir, { ext: '.json', glob: this._glob });
    this._hash.clear();
    await runConcurrent(_paths, async (path) => {
      try {
        const _text = await this._readTextFile(path);
        this._hash.set(getBasename(path), JSON.parse(_text) as Partial<T>);
      } catch (e) {
        logger.warn(`[ChatlogCache] loadAll: skip ${path} — ${(e as Error).message}`);
      }
    }, concurrency);
  }
}
