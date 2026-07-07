// src: skills/_scripts/classes/__tests__/unit/ChatlogWorks.unit.spec.ts
// @(#): ChatlogWorks クラス ユニットテスト
//       対象: ChatlogWorks
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// テスト ID 範囲: T-CLS-CC-01 〜 T-CLS-CC-81

// ─── BDD modules
import { assertEquals, assertRejects, assertStrictEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogWorks } from '../../ChatlogWorks.class.ts';
// functions
import { parseFrontmatter } from '../../../libs/text/frontmatter-utils.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';
import { GlobalConfig } from '../../GlobalConfig.class.ts';
// functions
import { makeLoggerStub } from '../../../__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../__tests__/helpers/logger-stub.ts';

// ─── Internal Helpers

// constants

/** TEMP ディレクトリを固定値で返す `EnvProvider` スタブ。 */
const _fakeEnv = (key: string): string | undefined => (key === 'TEMP' ? '/tmp/test-cle-cache' : undefined);

/**
 * `loadFromYaml()` テスト用フィクスチャ。
 *
 * `chat-a` / `chat-b` の 2エントリを持つ YAML 文字列。
 * キーがそのまま `_hash` のキーになる。
 */
const _FIXTURE_YAML = `
chat-a:
  value: hello
  count: 1
chat-b:
  value: world
  count: 2
`;

/** TEMP/TMP 両方 undefined を返す `EnvProvider` スタブ（env なし状態）。 */
const _noEnv = (_key: string): string | undefined => undefined;

// functions

/** `Map<string, string>` をバッファとして使うファイル読み書きプロバイダーを生成する。 */
const _makeBufferProviders = (buf: Map<string, string> = new Map()) => ({
  readTextFile: (path: string): Promise<string> => {
    const _val = buf.get(path);
    return _val !== undefined ? Promise.resolve(_val) : Promise.reject(new Deno.errors.NotFound(path));
  },
  writeTextFile: (path: string, data: string): Promise<void> => {
    buf.set(path, data);
    return Promise.resolve();
  },
  mkdir: (_path: string, _opts?: { recursive?: boolean }): Promise<void> => Promise.resolve(),
  removeFile: (path: string): Promise<void> => {
    buf.delete(path);
    return Promise.resolve();
  },
});

/**
 * `.md` パターンと `.json` パターンで異なるリストを返す glob プロバイダーを生成する。
 *
 * `loadAll()` は `*.json` パターンで呼ぶため、`mdList` と `jsonList` を分けることで
 * コンストラクタの loadAll とテスト対象の initFromOutputDir 呼び出しを独立させる。
 *
 * @param mdList - `*.md` パターンで返すファイルパス一覧
 * @param jsonList - `*.json` パターンで返すファイルパス一覧（loadAll 用）
 * @returns GlobProvider
 */
const _makePatternGlob = (mdList: string[], jsonList: string[] = []) => (pattern: string): Promise<string[]> =>
  pattern.endsWith('.md') ? Promise.resolve(mdList) : Promise.resolve(jsonList);

// ─── Tests

/**
 * `ChatlogWorks` クラスのユニットテストスイート。
 *
 * コンストラクタ・read・write・initFromOutputDir・delete・update メソッドの動作を検証する。
 *
 * テスト ID 範囲: T-CLS-CC-01 〜 T-CLS-CC-81
 *
 * @see ChatlogWorks
 */
describe('ChatlogWorks', () => {
  /**
   * `constructor` のインスタンス生成テスト。
   *
   * TEMP 環境変数あり・なしのケースを検証する。
   */
  describe('constructor', () => {
    /** 有効な環境変数でインスタンスを生成するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-01: providers を省略しても new ChatlogWorks() でインスタンスが生成される', () => {
        const _cache = new ChatlogWorks('set-frontmatter', '/tmp/test-cle-cache');
        assertEquals(_cache instanceof ChatlogWorks, true);
      });

      it('[Normal] T-CLS-CC-37: initializer に yaml を指定して new ChatlogWorks() がインスタンスを生成する', () => {
        const _cache = new ChatlogWorks('test', '/tmp/test-cle-cache', { yaml: 'key:\n  v: 1\n' }, {
          cache: _makeBufferProviders(),
        });
        assertEquals(_cache instanceof ChatlogWorks, true);
      });
    });

    /** 環境変数が存在しない場合・mkdir 失敗のエラーケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-04: TEMP が未設定のとき ready が ChatlogError(EnvVarNotSet) で reject される', async () => {
        const _cache = new ChatlogWorks('set-frontmatter', '${TEMP}/cle-cache', undefined, { env: _noEnv });
        const _err = await assertRejects(() => _cache.ready, ChatlogError);
        assertEquals(_err.kind, 'EnvVarNotSet');
      });

      it('[Error] T-CLS-CC-20: mkdir が失敗したとき ready が reject される', async () => {
        const _err = new Error('mkdir failed');
        const _cache = new ChatlogWorks('sub', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            mkdir: (_path: string, _opts?: { recursive?: boolean }): Promise<void> => Promise.reject(_err),
          },
        });
        await assertRejects(() => _cache.ready);
      });
    });

    /** initializer.yaml 指定時にキャッシュが自動初期化されるケース。 */
    describe('When: initializer yaml 指定', () => {
      it('[Normal] T-CLS-CC-40: initializer.yaml を指定すると ready 完了後に YAML 内容で _hash が初期化される', async () => {
        const _cache = new ChatlogWorks<{ value: string; count: number }>(
          'test',
          '${TEMP}/cle-cache',
          { yaml: _FIXTURE_YAML },
          { env: _fakeEnv, cache: _makeBufferProviders() },
        );
        await _cache.ready;
        assertEquals(_cache.read('chat-a'), { value: 'hello', count: 1 });
        assertEquals(_cache.read('chat-b'), { value: 'world', count: 2 });
      });

      it('[Edge] T-CLS-CC-41: initializer.yaml が空文字列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>(
          'test',
          '${TEMP}/cle-cache',
          { yaml: '' },
          { env: _fakeEnv, cache: _makeBufferProviders() },
        );
        await _cache.ready;
        assertEquals(_cache.read('chat-a'), {});
      });
    });

    /** コンストラクタでキャッシュディレクトリを作成するケース。 */
    describe('When: ディレクトリ作成', () => {
      it('[Normal] T-CLS-CC-10: new ChatlogWorks() でキャッシュディレクトリが作成される', async () => {
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('sub', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            mkdir: (path: string, _opts?: { recursive?: boolean }): Promise<void> => {
              _mkdirPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        assertEquals(_mkdirPath, '/tmp/test-cle-cache/cle-cache/sub');
      });
    });

    /**
     * `subDir` が絶対パスに展開される場合のケース。
     *
     * `normalizePath(subDir, env)` が絶対パスのとき `cacheRoot` を無視して `subDir` を `_cacheDir` に使うことを検証する。
     *
     * テスト ID 範囲: T-CLS-CC-18 〜 T-CLS-CC-19
     */
    describe('When: subDir が絶対パス', () => {
      it('[Normal] T-CLS-CC-18: subDir が絶対パスのとき cacheRoot を無視して subDir が _cacheDir になる', async () => {
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('/tmp/abs-subdir', '/tmp/ignored-root', undefined, {
          cache: {
            ..._makeBufferProviders(),
            mkdir: (path: string, _opts?: { recursive?: boolean }): Promise<void> => {
              _mkdirPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        assertEquals(_mkdirPath, '/tmp/abs-subdir');
      });

      it('[Normal] T-CLS-CC-19: subDir に環境変数プレースホルダーを含み展開後が絶対パスのとき cacheRoot を無視する', async () => {
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('${TEMP}/abs-subdir', '/tmp/ignored-root', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            mkdir: (path: string, _opts?: { recursive?: boolean }): Promise<void> => {
              _mkdirPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        assertEquals(_mkdirPath, '/tmp/test-cle-cache/abs-subdir');
      });
    });

    /**
     * `cacheRoot` 省略時に GlobalConfig の cacheDir を使うケース。
     *
     * cacheRoot が falsy のとき、ready 完了後に GlobalConfig から cacheDir を取得して解決することを検証する。
     *
     * テスト ID 範囲: T-CLS-CC-16 〜 T-CLS-CC-17
     */
    describe('When: cacheRoot 省略', () => {
      beforeEach(() => {
        GlobalConfig.resetInstance();
      });
      afterEach(() => {
        GlobalConfig.resetInstance();
      });

      it('[Normal] T-CLS-CC-16: cacheRoot を省略すると GlobalConfig の cacheDir が使われる', async () => {
        await GlobalConfig.getInstance({ yaml: 'cacheDir: /tmp/gc-cache\n' });
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('sub', '', undefined, {
          cache: {
            ..._makeBufferProviders(),
            mkdir: (path: string, _opts?: { recursive?: boolean }): Promise<void> => {
              _mkdirPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        assertEquals(_mkdirPath, '/tmp/gc-cache/sub');
      });

      it('[Normal] T-CLS-CC-17: cacheRoot を明示指定すると GlobalConfig は無視される', async () => {
        await GlobalConfig.getInstance({ yaml: 'cacheDir: /tmp/gc-cache\n' });
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('sub', '/tmp/explicit-cache', undefined, {
          cache: {
            ..._makeBufferProviders(),
            mkdir: (path: string, _opts?: { recursive?: boolean }): Promise<void> => {
              _mkdirPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        assertEquals(_mkdirPath, '/tmp/explicit-cache/sub');
      });
    });
  });

  /**
   * `_hash` インメモリストアのテスト。
   *
   * ファイルパスを引数に取り、拡張子なしのファイル名をキーとして値を保持することを検証する。
   *
   * テスト ID 範囲: T-CLS-CC-02 〜 T-CLS-CC-09
   */
  describe('_hash store', () => {
    /** write → read でデータが取得できるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-02: write() した値を read() で取得できる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat.md', { value: 'hello' });
        const _result = await _cache.read('chat.md');
        assertEquals(_result, { value: 'hello' });
      });

      it('[Normal] T-CLS-CC-03: 同一ファイルを write() 2回すると2回目の値で上書きされる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ a?: string; b?: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat.md', { a: 'first' });
        await _cache.write('chat.md', { b: 'second' });
        const _result = await _cache.read('chat.md');
        assertEquals(_result, { b: 'second' });
      });

      it('[Normal] T-CLS-CC-24: write() 後の read() は _hash ヒットしてファイルを読まない', async () => {
        let _readCount = 0;
        const _buf = new Map<string, string>();
        const _baseProv = _makeBufferProviders(_buf);
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._baseProv,
            readTextFile: (path: string): Promise<string> => {
              _readCount++;
              return _baseProv.readTextFile(path);
            },
          },
        });
        await _cache.write('chat.md', { value: 'cached' });
        const _result = await _cache.read('chat.md');
        assertEquals(_result, { value: 'cached' });
        assertEquals(_readCount, 0);
      });

      it('[Normal] T-CLS-CC-06: 拡張子なしのキーで write() した値を拡張子なしの read() でも取得できる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat', { value: 'no-ext' });
        const _result = await _cache.read('chat');
        assertEquals(_result, { value: 'no-ext' });
      });

      it('[Normal] T-CLS-CC-34: _hash ミス時（loadAll 未使用）は {} を返す', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/chat.json', JSON.stringify({ value: 'from-disk' })],
        ]);
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        const _result = _cache.read('chat.md');
        assertEquals(_result, {});
      });

      it('[Normal] T-CLS-CC-35: loadAll() 後の read は _hash ヒットしてファイルを読む', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/chat.json', JSON.stringify({ value: 'from-disk' })],
        ]);
        const _baseProv = _makeBufferProviders(_buf);
        let _readCount = 0;
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._baseProv,
            readTextFile: (path: string): Promise<string> => {
              _readCount++;
              return _baseProv.readTextFile(path);
            },
            glob: (_pattern: string) => {
              const _results: string[] = [];
              for (const key of _buf.keys()) {
                if (key.endsWith('.json')) { _results.push(key); }
              }
              return Promise.resolve(_results);
            },
          },
        });
        await _cache.ready;
        const _result = _cache.read('chat.md');
        assertEquals(_result, { value: 'from-disk' });
        assertEquals(_readCount, 1);
      });
    });

    /** ファイルが存在しない（未 write）の場合のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-05: 未 write のキーを read() すると {} を返す', async () => {
        const _cache = new ChatlogWorks<{ key: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        const _result = await _cache.read('nonexistent.md');
        assertEquals(_result, {});
      });

      it('[Edge] T-CLS-CC-07: 拡張子あり/なしは同一キーとして扱われる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat.md', { value: 'from-md' });
        const _result = await _cache.read('chat');
        assertEquals(_result, { value: 'from-md' });
      });

      it('[Edge] T-CLS-CC-08: 異なるファイルは独立して保持され値が混在しない', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('file-a.md', { type: 'A' });
        await _cache.write('file-b.md', { type: 'B' });
        assertEquals(await _cache.read('file-a.md'), { type: 'A' });
        assertEquals(await _cache.read('file-b.md'), { type: 'B' });
      });

      it('[Edge] T-CLS-CC-09: write() は <cacheDir>/<key>.json にデータを書き込む', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ x: number }>('sub', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('data.md', { x: 42 });
        const _written = _buf.get('/tmp/test-cle-cache/cle-cache/sub/data.json');
        assertEquals(JSON.parse(_written ?? 'null'), { x: 42 });
      });
    });

    /** ファイル I/O が失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-25: loadAll() で JSON が壊れているファイルは _hash に載らず read() は {} を返す', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/chat.json', 'invalid json {{{'],
        ]);
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(_buf),
            glob: (_pattern: string) => Promise.resolve(['/tmp/test-cle-cache/cle-cache/test/chat.json']),
          },
        });
        await _cache.ready;
        const _result = _cache.read('chat.md');
        assertEquals(_result, {});
      });

      it('[Error] T-CLS-CC-26: writeTextFile が失敗したとき write() が reject される', async () => {
        const _writeErr = new Error('disk full');
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            writeTextFile: (_path: string, _data: string): Promise<void> => Promise.reject(_writeErr),
          },
        });
        const _err = await assertRejects(() => _cache.write('chat.md', { value: 'x' }));
        assertStrictEquals(_err, _writeErr);
      });

      it('[Error] T-CLS-CC-42: JSON が壊れていたファイルを write() で上書きすると read() が正常値を返す', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/chat.json', 'invalid json {{{'],
        ]);
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(_buf),
            glob: (_pattern: string) => Promise.resolve(['/tmp/test-cle-cache/cle-cache/test/chat.json']),
          },
        });
        await _cache.ready;
        assertEquals(_cache.read('chat.md'), {});
        await _cache.write('chat.md', { value: 'fixed' });
        assertEquals(_cache.read('chat.md'), { value: 'fixed' });
      });
    });
  });

  /**
   * `loadFromYaml()` メソッドのテスト。
   *
   * YAML 文字列を解析して `_hash` に展開することを検証する。
   * ファイル I/O は発生しない。
   *
   * テスト ID 範囲: T-CLS-CC-11 〜 T-CLS-CC-13
   */
  describe('loadFromYaml', () => {
    /** YAML フィクスチャから _hash が正しく展開されるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-11: YAML の各キーが _hash に展開され read() で取得できる', async () => {
        const _cache = new ChatlogWorks<{ value: string; count: number }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml(_FIXTURE_YAML);
        assertEquals(await _cache.read('chat-a'), { value: 'hello', count: 1 });
        assertEquals(await _cache.read('chat-b'), { value: 'world', count: 2 });
      });

      it('[Normal] T-CLS-CC-12: loadFromYaml() は既存の _hash を上書きする', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string; count: number }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat-a', { value: 'old', count: 0 });
        _cache.loadFromYaml(_FIXTURE_YAML);
        assertEquals(await _cache.read('chat-a'), { value: 'hello', count: 1 });
      });
    });

    /** YAML が空・非オブジェクトの場合のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-13: 空 YAML を渡すと _hash は空のまま（未 read は {} を返す）', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('');
        assertEquals(await _cache.read('chat-a'), {});
      });

      it('[Edge] T-CLS-CC-29: YAML が配列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('- a\n- b\n');
        assertEquals(await _cache.read('a'), {});
      });

      it('[Edge] T-CLS-CC-30: YAML がスカラー文字列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('hello');
        assertEquals(await _cache.read('hello'), {});
      });

      it('[Edge] T-CLS-CC-32: YAML の value が null のとき {} として格納される', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('chat-a: ~\n');
        assertEquals(await _cache.read('chat-a'), {});
      });
    });
  });

  /**
   * `loadAll()` メソッドのテスト。
   *
   * `<cacheDir>/*.json` を全読み込みして `_hash` を初期化することを検証する。
   * `glob` プロバイダーでファイル一覧を差し替えてテストする。
   *
   * テスト ID 範囲: T-CLS-CC-14 〜 T-CLS-CC-15
   */
  describe('loadAll', () => {
    /** バッファに複数の JSON ファイルがある場合に全て読み込むケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-14: cacheDir の *.json を全て読み込んで _hash に展開する', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/file-a.json', JSON.stringify({ type: 'A' })],
          ['/tmp/test-cle-cache/cle-cache/test/file-b.json', JSON.stringify({ type: 'B' })],
        ]);
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(_buf),
            glob: (_pattern: string) =>
              Promise.resolve([
                '/tmp/test-cle-cache/cle-cache/test/file-a.json',
                '/tmp/test-cle-cache/cle-cache/test/file-b.json',
              ]),
          },
        });
        await _cache.loadAll();
        assertEquals(await _cache.read('file-a'), { type: 'A' });
        assertEquals(await _cache.read('file-b'), { type: 'B' });
      });

      it('[Normal] T-CLS-CC-57: 全読み込み成功時は logger.warn が呼ばれない', async () => {
        const _buf = new Map<string, string>([
          ['/fake/file-ok.json', '{"type":"OK"}'],
        ]);
        const loggerStub: LoggerStub = makeLoggerStub();
        try {
          const _cache = new ChatlogWorks<{ type: string }>('test', '/fake', undefined, {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: (_pattern: string) => Promise.resolve(['/fake/file-ok.json']),
            },
          });
          await _cache.ready;
          assertEquals(_cache.read('file-ok'), { type: 'OK' });
          assertEquals(loggerStub.warnLogs.length, 0);
        } finally {
          loggerStub.restore();
        }
      });
    });

    /** glob がファイルを返さない場合のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-15: glob が空リストを返すと _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            glob: (_pattern: string) => Promise.resolve([]),
          },
        });
        await _cache.loadAll();
        assertEquals(await _cache.read('file-a'), {});
      });

      it('[Edge] T-CLS-CC-36: loadAll() は既存の _hash をクリアする（事前 loadFromYaml した値が消える）', async () => {
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            glob: (_pattern: string) => Promise.resolve([]),
          },
        });
        _cache.loadFromYaml('old:\n  type: OLD\n');
        await _cache.loadAll();
        const _result = await _cache.read('old');
        assertEquals(_result, {});
      });
    });

    /** JSON が壊れたファイルが混在する場合のケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-33: JSON が壊れたファイルはスキップされ、正常なファイルは _hash に展開される', async () => {
        const _buf = new Map<string, string>([
          ['/tmp/test-cle-cache/cle-cache/test/file-ok.json', JSON.stringify({ type: 'OK' })],
          ['/tmp/test-cle-cache/cle-cache/test/file-bad.json', 'invalid json {{{'],
        ]);
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(_buf),
            glob: (_pattern: string) =>
              Promise.resolve([
                '/tmp/test-cle-cache/cle-cache/test/file-ok.json',
                '/tmp/test-cle-cache/cle-cache/test/file-bad.json',
              ]),
          },
        });
        await _cache.loadAll();
        assertEquals(await _cache.read('file-ok'), { type: 'OK' });
        assertEquals(await _cache.read('file-bad'), {});
      });

      it('[Error] T-CLS-CC-58: readTextFile reject 時に logger.warn が呼ばれる', async () => {
        const loggerStub: LoggerStub = makeLoggerStub();
        try {
          const _cache = new ChatlogWorks<{ type: string }>('test', '/fake', undefined, {
            cache: {
              ..._makeBufferProviders(),
              readTextFile: (_path: string): Promise<string> =>
                Promise.reject(new Deno.errors.NotFound('missing.json')),
              glob: (_pattern: string) => Promise.resolve(['/fake/missing.json']),
            },
          });
          await _cache.ready;
          assertEquals(_cache.read('missing'), {});
          assertEquals(loggerStub.warnLogs.length, 1);
          assertStringIncludes(loggerStub.warnLogs[0], 'missing.json');
          assertStringIncludes(loggerStub.warnLogs[0], 'skip');
        } finally {
          loggerStub.restore();
        }
      });

      it('[Error] T-CLS-CC-59: JSON.parse 失敗時に logger.warn が呼ばれる', async () => {
        const _buf = new Map<string, string>([
          ['/fake/bad.json', 'invalid json {{{'],
        ]);
        const loggerStub: LoggerStub = makeLoggerStub();
        try {
          const _cache = new ChatlogWorks<{ type: string }>('test', '/fake', undefined, {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: (_pattern: string) => Promise.resolve(['/fake/bad.json']),
            },
          });
          await _cache.ready;
          assertEquals(_cache.read('bad'), {});
          assertEquals(loggerStub.warnLogs.length, 1);
          assertStringIncludes(loggerStub.warnLogs[0], 'bad.json');
          assertStringIncludes(loggerStub.warnLogs[0], 'skip');
        } finally {
          loggerStub.restore();
        }
      });
    });
  });

  /**
   * `initFromOutputDir()` メソッドのテスト。
   *
   * outputDir の `.md` ファイルを `isComplete(text)` 述語でフィルタし、true のファイルのみ書き込むことを検証する。
   * デフォルト述語は `hasFrontmatter`。glob プロバイダーは `.md` と `.json` パターンで返値を分岐させる。
   *
   * テスト ID 範囲: T-CLS-CC-43 〜 T-CLS-CC-56, T-CLS-CC-82 〜 T-CLS-CC-83
   */
  describe('initFromOutputDir', () => {
    /** outputDir の .md ファイルをフロントマターありのもののみ書き込むケース。 */
    describe('When: 正常系', () => {
      it("[Normal] T-CLS-CC-43: outputDir に .md 2件（基本3フィールドのみ）、キャッシュなし → meta+status:'' が各ファイルに作成される", async () => {
        const _buf = new Map<string, string>([
          ['/out/a.md', '---\ntitle: A\ntype: tech\ncategory: dev\n---\nContent A\n'],
          ['/out/b.md', '---\ntitle: B\ntype: tech\ncategory: dev\n---\nContent B\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/a.md', '/out/b.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('a.md'), { title: 'A', type: 'tech', category: 'dev', status: '' });
        assertEquals(_cache.read('b.md'), { title: 'B', type: 'tech', category: 'dev', status: '' });
      });

      it("[Normal] T-CLS-CC-52: .md にフロントマターあり（title/type/category のみ）→ _hasBaseFields true・isComplete false → meta+status:'' が書き込まれる", async () => {
        const _buf = new Map<string, string>([
          ['/out/has-fm.md', '---\ntitle: Test\ntype: tech\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/has-fm.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('has-fm.md'), { title: 'Test', type: 'tech', category: 'dev', status: '' });
      });

      it('[Normal] T-CLS-CC-69: 全5フィールド（title/type/category/topics/tags）→ isComplete true → meta+status:written が書き込まれる', async () => {
        const _buf = new Map<string, string>([
          [
            '/out/full.md',
            '---\ntitle: A\ntype: tech\ncategory: dev\ntopics:\n  - topic1\ntags:\n  - tag1\n---\n',
          ],
        ]);
        const _cache = new ChatlogWorks<{
          title?: string;
          type?: string;
          category?: string;
          topics?: string[];
          tags?: string[];
          status: string;
        }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/full.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('full.md'), {
          title: 'A',
          type: 'tech',
          category: 'dev',
          topics: ['topic1'],
          tags: ['tag1'],
          status: 'written',
        });
      });

      it("[Normal] T-CLS-CC-82: tags が #付きハッシュタグ形式（['#tag1', '#tag2']）→ 先頭の # が除去され ['tag1', 'tag2'] でキャッシュされる", async () => {
        const _buf = new Map<string, string>([
          [
            '/out/hashtag.md',
            '---\ntitle: A\ntype: tech\ncategory: dev\ntopics:\n  - topic1\ntags:\n  - "#tag1"\n  - "#tag2"\n---\n',
          ],
        ]);
        const _cache = new ChatlogWorks<{
          title?: string;
          type?: string;
          category?: string;
          topics?: string[];
          tags?: string[];
          status: string;
        }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/hashtag.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('hashtag.md'), {
          title: 'A',
          type: 'tech',
          category: 'dev',
          topics: ['topic1'],
          tags: ['tag1', 'tag2'],
          status: 'written',
        });
      });

      it("[Normal] T-CLS-CC-83: tags が #なし（['tag1']）→ 変化せず ['tag1'] のままキャッシュされる（回帰確認）", async () => {
        const _buf = new Map<string, string>([
          [
            '/out/no-hashtag.md',
            '---\ntitle: A\ntype: tech\ncategory: dev\ntopics:\n  - topic1\ntags:\n  - tag1\n---\n',
          ],
        ]);
        const _cache = new ChatlogWorks<{
          title?: string;
          type?: string;
          category?: string;
          topics?: string[];
          tags?: string[];
          status: string;
        }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/no-hashtag.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('no-hashtag.md'), {
          title: 'A',
          type: 'tech',
          category: 'dev',
          topics: ['topic1'],
          tags: ['tag1'],
          status: 'written',
        });
      });

      it("[Normal] T-CLS-CC-70: title/type/category のみ（topics/tags なし）→ isComplete false・_hasBaseFields true → meta+status:'' が書き込まれる", async () => {
        const _buf = new Map<string, string>([
          ['/out/base.md', '---\ntitle: B\ntype: tech\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/base.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('base.md'), { title: 'B', type: 'tech', category: 'dev', status: '' });
      });

      it('[Normal] T-CLS-CC-55: カスタム述語 title 必須 → title 有ファイルのみ meta+status:written が書き込まれる', async () => {
        const _buf = new Map<string, string>([
          ['/out/with-title.md', '---\ntitle: Hello\n---\n'],
          ['/out/no-title.md', '---\ndate: 2026-01-01\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; date?: string; status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/with-title.md', '/out/no-title.md']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir(
          '/out',
          (text) => parseFrontmatter(text).meta['title'] !== undefined,
        );
        assertEquals(_cache.read('with-title.md'), { title: 'Hello', status: 'written' });
        assertEquals(_cache.read('no-title.md'), {});
      });

      it('[Normal] T-CLS-CC-72: キャッシュ済みファイルは initFromOutputDir で上書きされない（全5フィールドあり）', async () => {
        const _buf = new Map<string, string>([
          ['/cache/sub/existing.json', JSON.stringify({ status: 'reviewed' })],
          ['/out/existing.md', '---\ntitle: A\ntype: tech\ncategory: dev\ntopics:\n  - t1\ntags:\n  - g1\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{
          title?: string;
          type?: string;
          category?: string;
          topics?: string[];
          tags?: string[];
          status: string;
        }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/existing.md'], ['/cache/sub/existing.json']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        // キャッシュ済みのため上書きされず { status: 'reviewed' } が保持される
        assertEquals(_cache.read('existing.md'), { status: 'reviewed' });
      });

      it('[Normal] T-CLS-CC-44: outputDir に .md 1件、フロントマターなし → isComplete false → 書き込まれない', async () => {
        const _buf = new Map<string, string>([
          ['/cache/sub/a.json', JSON.stringify({ status: 'kept' })],
          ['/out/a.md', 'No frontmatter here.\n'],
        ]);
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            // loadAll: *.json で a.json を返す。initFromOutputDir: *.md で a.md を返す。
            glob: _makePatternGlob(['/out/a.md'], ['/cache/sub/a.json']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        // a.md はフロントマターなし → isComplete false → 上書きされない
        assertEquals(_cache.read('a'), { status: 'kept' });
      });
    });

    /** 境界条件と特殊入力の振る舞い。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-CLS-CC-73: キャッシュなし・基本3フィールドのみ → 通常の4段階判定が適用され status:'' が書き込まれる", async () => {
        const _buf = new Map<string, string>([
          ['/out/new.md', '---\ntitle: New\ntype: tech\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/new.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('new.md'), { title: 'New', type: 'tech', category: 'dev', status: '' });
      });

      it('[Edge] T-CLS-CC-51: .md にフロントマターなし → デフォルト述語 false → _hash に書き込まれない', async () => {
        const _buf = new Map<string, string>([
          ['/out/no-fm.md', 'No frontmatter here.\n'],
        ]);
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/no-fm.md']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('no-fm.md'), {});
      });

      it('[Edge] T-CLS-CC-53: 空フロントマター (---\\n---\\n) → meta: {} → 書き込まれない', async () => {
        const _buf = new Map<string, string>([
          ['/out/empty-fm.md', '---\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/empty-fm.md']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('empty-fm.md'), {});
      });

      it('[Edge] T-CLS-CC-54: 不正 YAML フロントマター → parseFrontmatter は meta:{} を返す → 書き込まれない', async () => {
        const _buf = new Map<string, string>([
          ['/out/bad-yaml.md', '---\nkey: [unclosed\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/bad-yaml.md']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('bad-yaml.md'), {});
      });

      it('[Edge] T-CLS-CC-46: glob が空リスト（outputDir が空）→ _hash 変更なし', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob([]),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('any'), {});
      });

      it('[Edge] T-CLS-CC-71: 4種混在（フロントマターなし/全5フィールド/基本3フィールド/type欠如）→ 各ファイルが正しいブランチに分岐する', async () => {
        const _buf = new Map<string, string>([
          ['/out/fm-none.md', 'No frontmatter here.\n'],
          [
            '/out/fm-full.md',
            '---\ntitle: Full\ntype: tech\ncategory: dev\ntopics:\n  - t1\ntags:\n  - g1\n---\n',
          ],
          ['/out/fm-base.md', '---\ntitle: Base\ntype: tech\ncategory: dev\n---\n'],
          ['/out/fm-invalid.md', '---\ntitle: Invalid\ncategory: dev\n---\n'],
        ]);
        // *.json: fm-none.json が既存キャッシュとして存在する（削除されないことを確認）
        const _existingKey = '/cache/sub/fm-none.json';
        _buf.set(_existingKey, JSON.stringify({ status: 'kept' }));
        const _cache = new ChatlogWorks<{
          title?: string;
          type?: string;
          category?: string;
          topics?: string[];
          tags?: string[];
          status: string;
        }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(
                ['/out/fm-none.md', '/out/fm-full.md', '/out/fm-base.md', '/out/fm-invalid.md'],
                [_existingKey],
              ),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        // フロントマターなし → スキップ（既存キャッシュ保持）
        assertEquals(_cache.read('fm-none.md'), { status: 'kept' });
        // 全5フィールド → status:written
        assertEquals(_cache.read('fm-full.md'), {
          title: 'Full',
          type: 'tech',
          category: 'dev',
          topics: ['t1'],
          tags: ['g1'],
          status: 'written',
        });
        // 基本3フィールドのみ → status:''
        assertEquals(_cache.read('fm-base.md'), { title: 'Base', type: 'tech', category: 'dev', status: '' });
        // type欠如 → delete
        assertEquals(_cache.read('fm-invalid.md'), {});
      });

      it('[Edge] T-CLS-CC-48: .md なし（.json のみ）→ _hash 変更なし', async () => {
        // *.md パターンは [] を返すが *.json パターンでは json ファイルを返す（.md にはマッチしない）
        const _buf = new Map<string, string>([
          ['/cache/sub/existing.json', JSON.stringify({ status: 'kept' })],
        ]);
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob([], ['/cache/sub/existing.json']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        // *.md が空なので新規書き込みは発生しない
        assertEquals(_cache.read('any-new'), {});
      });
    });

    /** ファイル操作失敗時の振る舞い。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-49: glob が reject → initFromOutputDir が reject', async () => {
        // *.md パターンで reject、*.json パターン（loadAll 用）は [] を返す
        const _globErr = new Error('glob failed');
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(),
            glob: (pattern: string): Promise<string[]> =>
              pattern.endsWith('.md') ? Promise.reject(_globErr) : Promise.resolve([]),
          },
        });
        await _cache.ready;
        await assertRejects(() => _cache.initFromOutputDir('/out'));
      });

      it('[Error] T-CLS-CC-50: writeTextFile 失敗 → initFromOutputDir が reject', async () => {
        const _buf = new Map<string, string>([
          ['/out/a.md', '---\ntitle: A\ntype: tech\ncategory: dev\n---\n'],
        ]);
        const _writeErr = new Error('disk full');
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/a.md']),
            writeTextFile: (_path: string, _data: string): Promise<void> => Promise.reject(_writeErr),
          },
        });
        await _cache.ready;
        await assertRejects(() => _cache.initFromOutputDir('/out'));
      });

      it('[Error] T-CLS-CC-56: readTextFile が reject → initFromOutputDir が reject', async () => {
        const _readErr = new Error('read failed');
        const _cache = new ChatlogWorks<{ status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(),
            glob: _makePatternGlob(['/out/a.md']),
            readTextFile: (_path: string): Promise<string> => Promise.reject(_readErr),
          },
        });
        await _cache.ready;
        await assertRejects(() => _cache.initFromOutputDir('/out'));
      });
    });
  });

  /**
   * `initFromOutputDir()` の デフォルト述語による4方向分岐チェックのテスト。
   *
   * デフォルト述語は全5フィールド揃いのみ written、基本3フィールドのみは ''、フィールド不足は delete。
   *
   * テスト ID 範囲: T-CLS-CC-66 〜 T-CLS-CC-68
   */
  describe('initFromOutputDir default predicate required fields', () => {
    /** title/type/category が揃っているファイルが status:EMPTY で書き込まれるケース。 */
    describe('When: 正常系', () => {
      it("[Normal] T-CLS-CC-66: title/type/category のみの .md → status:'' 登録、type 欠如 .md → delete されキャッシュなし", async () => {
        const _buf = new Map<string, string>([
          ['/out/complete.md', '---\ntitle: A\ntype: tech\ncategory: dev\n---\n'],
          ['/out/missing-type.md', '---\ntitle: B\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/complete.md', '/out/missing-type.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('complete.md'), { title: 'A', type: 'tech', category: 'dev', status: '' });
        assertEquals(_cache.read('missing-type.md'), {});
      });
    });

    /** 必須フィールドが null のファイルはスキップされるケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-CLS-CC-67: type が null（→ ''）→ _hasBaseFields false → delete されキャッシュなし", async () => {
        const _buf = new Map<string, string>([
          ['/out/null-type.md', '---\ntitle: A\ntype: null\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          undefined,
          {
            cache: {
              ..._makeBufferProviders(_buf),
              glob: _makePatternGlob(['/out/null-type.md']),
            },
          },
        );
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('null-type.md'), {});
      });

      it('[Edge] T-CLS-CC-68: title のみある .md（type/category なし）→ _hasBaseFields false → delete されキャッシュなし', async () => {
        const _buf = new Map<string, string>([
          ['/out/title-only.md', '---\ntitle: A\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; status: string }>('sub', '/cache', undefined, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/title-only.md']),
          },
        });
        await _cache.ready;
        await _cache.initFromOutputDir('/out');
        assertEquals(_cache.read('title-only.md'), {});
      });
    });
  });

  /**
   * `delete()` メソッドのテスト。
   *
   * `_hash` からエントリを削除し、対応する `.json` ファイルを削除することを検証する。
   * エントリやファイルが存在しない場合は no-op（冪等）であることも検証する。
   *
   * テスト ID 範囲: T-CLS-CC-60 〜 T-CLS-CC-64
   */
  describe('delete', () => {
    /** delete() 後に read() が {} を返す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-60: write() 後に delete(filePath) を呼ぶと read() が {} を返す', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        await _cache.write('chat.md', { value: 'hello' });
        await _cache.delete('chat.md');
        assertEquals(_cache.read('chat.md'), {});
      });

      it('[Normal] T-CLS-CC-61: delete(filePath) を呼ぶと <cacheDir>/<key>.json が削除される', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('sub', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        await _cache.write('data.md', { value: 'stored' });
        const _jsonPath = '/tmp/test-cle-cache/cle-cache/sub/data.json';
        assertEquals(_buf.has(_jsonPath), true);
        await _cache.delete('data.md');
        assertEquals(_buf.has(_jsonPath), false);
      });

      it('[Normal] T-CLS-CC-62: removeFile プロバイダーがモックに差し替えられた場合、そのモックが呼ばれる', async () => {
        let _removedPath = '';
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(_buf),
            removeFile: (path: string): Promise<void> => {
              _removedPath = path;
              return Promise.resolve();
            },
          },
        });
        await _cache.ready;
        await _cache.write('chat.md', { value: 'x' });
        await _cache.delete('chat.md');
        assertEquals(_removedPath, '/tmp/test-cle-cache/cle-cache/test/chat.json');
      });
    });

    /** removeFile が NotFound 以外のエラーで reject するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-65: removeFile が NotFound 以外のエラーで reject すると delete() が reject する', async () => {
        const _permErr = new Error('permission denied');
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            removeFile: (_path: string): Promise<void> => Promise.reject(_permErr),
          },
        });
        await _cache.ready;
        await _cache.write('chat.md', { value: 'x' });
        const _err = await assertRejects(() => _cache.delete('chat.md'));
        assertStrictEquals(_err, _permErr);
      });
    });

    /** ファイル不在・_hash 不在などの境界条件のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-63: キャッシュファイルが存在しない (NotFound) 場合でも delete() は例外を throw しない', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._makeBufferProviders(),
            removeFile: (_path: string): Promise<void> => Promise.reject(new Deno.errors.NotFound('no file')),
          },
        });
        await _cache.ready;
        await _cache.write('chat.md', { value: 'x' });
        // NotFound でも例外なし
        await _cache.delete('chat.md');
        assertEquals(_cache.read('chat.md'), {});
      });

      it('[Edge] T-CLS-CC-64: _hash にキーが存在しない場合でも delete() は例外を throw しない', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        await _cache.ready;
        // write() なし → _hash にキーなし
        await _cache.delete('nonexistent.md');
        assertEquals(_cache.read('nonexistent.md'), {});
      });
    });
  });

  /**
   * `update()` メソッドのテスト。
   *
   * 既存キャッシュとのマージ動作を検証する。
   * トップレベルは浅いマージ、`frontmatter` フィールドは既存値がオブジェクトの場合のみ内部マージする。
   *
   * テスト ID 範囲: T-CLS-CC-74 〜 T-CLS-CC-81
   */
  describe('update', () => {
    /** update で新規追加・既存マージ・frontmatter 2段階マージを検証する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-74: 未書き込みキーへの update → data がそのまま書き込まれる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ status: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        await _cache.update('new-file.md', { status: 'reviewed' });
        assertEquals(_cache.read('new-file.md'), { status: 'reviewed' });
      });

      it('[Normal] T-CLS-CC-75: 既存キャッシュに disjoint なキーを追加マージする', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ status?: string; type?: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        await _cache.write('chat.md', { status: 'reviewed' });
        await _cache.update('chat.md', { type: 'tech' });
        assertEquals(_cache.read('chat.md'), { status: 'reviewed', type: 'tech' });
      });

      it('[Normal] T-CLS-CC-76: 同一トップレベルキーは data の値で上書きされ、他のキーは保持される', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ status?: string; type?: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.ready;
        await _cache.write('chat.md', { status: 'reviewed', type: 'tech' });
        await _cache.update('chat.md', { status: 'written' });
        assertEquals(_cache.read('chat.md'), { status: 'written', type: 'tech' });
      });

      it('[Normal] T-CLS-CC-77: 既存に frontmatter あり + data に frontmatter → 内部マージ（2段階）', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ frontmatter?: Record<string, string> }>(
          'test',
          '${TEMP}/cle-cache',
          undefined,
          {
            env: _fakeEnv,
            cache: _makeBufferProviders(_buf),
          },
        );
        await _cache.ready;
        await _cache.write('chat.md', { frontmatter: { title: 'Old', type: 'tech' } });
        await _cache.update('chat.md', { frontmatter: { title: 'New', category: 'dev' } });
        assertEquals(_cache.read('chat.md'), { frontmatter: { title: 'New', type: 'tech', category: 'dev' } });
      });
    });

    /** 境界値・特殊フィールド組み合わせのケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-78: 既存に frontmatter なし + data に frontmatter → data.frontmatter をそのまま上書き', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ status?: string; frontmatter?: Record<string, string> }>(
          'test',
          '${TEMP}/cle-cache',
          undefined,
          { env: _fakeEnv, cache: _makeBufferProviders(_buf) },
        );
        await _cache.ready;
        await _cache.write('chat.md', { status: 'reviewed' });
        await _cache.update('chat.md', { frontmatter: { title: 'New', type: 'tech' } });
        assertEquals(_cache.read('chat.md'), { status: 'reviewed', frontmatter: { title: 'New', type: 'tech' } });
      });

      it('[Edge] T-CLS-CC-79: data に frontmatter なし → 既存の frontmatter は保持される', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ frontmatter?: Record<string, string>; status?: string }>(
          'test',
          '${TEMP}/cle-cache',
          undefined,
          { env: _fakeEnv, cache: _makeBufferProviders(_buf) },
        );
        await _cache.ready;
        await _cache.write('chat.md', { frontmatter: { title: 'Old', type: 'tech' }, status: 'reviewed' });
        await _cache.update('chat.md', { status: 'written' });
        assertEquals(_cache.read('chat.md'), { frontmatter: { title: 'Old', type: 'tech' }, status: 'written' });
      });

      it('[Edge] T-CLS-CC-80: 未書き込みキー（read が {}）+ data に frontmatter → 2段階マージ条件は発火しない', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ frontmatter?: Record<string, string>; status?: string }>(
          'test',
          '${TEMP}/cle-cache',
          undefined,
          { env: _fakeEnv, cache: _makeBufferProviders(_buf) },
        );
        await _cache.ready;
        await _cache.update('missing.md', { frontmatter: { title: 'X' }, status: 'reviewed' });
        assertEquals(_cache.read('missing.md'), { frontmatter: { title: 'X' }, status: 'reviewed' });
      });
    });

    /** I/O エラー時の振る舞い。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-81: writeTextFile が reject → update() が reject を伝播する', async () => {
        const _writeErr = new Error('disk full');
        const _buf = new Map<string, string>();
        const _baseProv = _makeBufferProviders(_buf);
        let _failNext = false;
        const _cache = new ChatlogWorks<{ status?: string }>('test', '${TEMP}/cle-cache', undefined, {
          env: _fakeEnv,
          cache: {
            ..._baseProv,
            writeTextFile: (path: string, data: string): Promise<void> => {
              if (_failNext) { return Promise.reject(_writeErr); }
              return _baseProv.writeTextFile(path, data);
            },
          },
        });
        await _cache.ready;
        await _cache.write('chat.md', { status: 'reviewed' });
        _failNext = true;
        const _err = await assertRejects(() => _cache.update('chat.md', { status: 'written' }));
        assertStrictEquals(_err, _writeErr);
      });
    });
  });

  /**
   * `constructor` の `initializer.outputDir` 指定テスト。
   *
   * `_initCacheDir` の outputDir 分岐と yaml 優先度を検証する。
   *
   * テスト ID 範囲: T-CLS-CC-45, T-CLS-CC-47
   */
  describe('constructor outputDir', () => {
    /** outputDir 指定時のコンストラクタ経由初期化ケース。 */
    describe('When: 正常系', () => {
      it("[Normal] T-CLS-CC-45: initializer.outputDir 指定 → initFromOutputDir 後 loadAll が JSON を読み込み meta+status:'' が反映される（基本3フィールドのみ）", async () => {
        const _buf = new Map<string, string>([
          ['/out/a.md', '---\ntitle: A\ntype: tech\ncategory: dev\n---\n'],
        ]);
        const _cache = new ChatlogWorks<{ title?: string; type?: string; category?: string; status: string }>(
          'sub',
          '/cache',
          { outputDir: '/out' },
          {
            cache: {
              ..._makeBufferProviders(_buf),
              // initFromOutputDir: *.md → a.md を返す。loadAll: *.json → 書き込まれた a.json を返す。
              glob: _makePatternGlob(['/out/a.md'], ['/cache/sub/a.json']),
            },
          },
        );
        await _cache.ready;
        assertEquals(_cache.read('a'), { title: 'A', type: 'tech', category: 'dev', status: '' });
      });
    });

    /** yaml と outputDir 両方指定時の優先度ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-47: yaml と outputDir 両方指定 → yaml 優先、outputDir は処理されない', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ type?: string; status?: string }>('sub', '/cache', {
          yaml: 'chat-a:\n  type: tech\n',
          outputDir: '/out',
        }, {
          cache: {
            ..._makeBufferProviders(_buf),
            glob: _makePatternGlob(['/out/a.md']),
          },
        });
        await _cache.ready;
        // yaml ブランチに入るので outputDir は無視される
        assertEquals(_cache.read('chat-a'), { type: 'tech' });
        // a.md は initFromOutputDir が呼ばれないので status:written は設定されない
        assertEquals(_cache.read('a'), {});
      });
    });
  });
});
