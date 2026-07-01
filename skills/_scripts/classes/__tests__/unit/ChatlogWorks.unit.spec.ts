// src: skills/_scripts/classes/__tests__/unit/ChatlogWorks.unit.spec.ts
// @(#): ChatlogWorks クラス ユニットテスト
//       対象: ChatlogWorks
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogWorks } from '../../ChatlogWorks.class.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';
import { GlobalConfig } from '../../GlobalConfig.class.ts';

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
});

// ─── Tests

/**
 * `ChatlogWorks` クラスのユニットテストスイート。
 *
 * コンストラクタ・read・write メソッドの動作を検証する。
 *
 * テスト ID 範囲: T-CLS-CC-01 〜 T-CLS-CC-36
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
        const _cache = new ChatlogWorks('test', '/tmp/test-cle-cache', { cache: _makeBufferProviders() }, {
          yaml: 'key:\n  v: 1\n',
        });
        assertEquals(_cache instanceof ChatlogWorks, true);
      });
    });

    /** 環境変数が存在しない場合・mkdir 失敗のエラーケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-CC-04: TEMP が未設定のとき ready が ChatlogError(EnvVarNotSet) で reject される', async () => {
        const _cache = new ChatlogWorks('set-frontmatter', '${TEMP}/cle-cache', { env: _noEnv });
        const _err = await assertRejects(() => _cache.ready, ChatlogError);
        assertEquals(_err.kind, 'EnvVarNotSet');
      });

      it('[Error] T-CLS-CC-20: mkdir が失敗したとき ready が reject される', async () => {
        const _err = new Error('mkdir failed');
        const _cache = new ChatlogWorks('sub', '${TEMP}/cle-cache', {
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
          { env: _fakeEnv, cache: _makeBufferProviders() },
          { yaml: _FIXTURE_YAML },
        );
        await _cache.ready;
        assertEquals(_cache.read('chat-a'), { value: 'hello', count: 1 });
        assertEquals(_cache.read('chat-b'), { value: 'world', count: 2 });
      });

      it('[Edge] T-CLS-CC-41: initializer.yaml が空文字列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>(
          'test',
          '${TEMP}/cle-cache',
          { env: _fakeEnv, cache: _makeBufferProviders() },
          { yaml: '' },
        );
        await _cache.ready;
        assertEquals(_cache.read('chat-a'), {});
      });
    });

    /** コンストラクタでキャッシュディレクトリを作成するケース。 */
    describe('When: ディレクトリ作成', () => {
      it('[Normal] T-CLS-CC-10: new ChatlogWorks() でキャッシュディレクトリが作成される', async () => {
        let _mkdirPath = '';
        const _cache = new ChatlogWorks('sub', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks('/tmp/abs-subdir', '/tmp/ignored-root', {
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
        const _cache = new ChatlogWorks('${TEMP}/abs-subdir', '/tmp/ignored-root', {
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
        const _cache = new ChatlogWorks('sub', '', {
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
        const _cache = new ChatlogWorks('sub', '/tmp/explicit-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat.md', { value: 'hello' });
        const _result = await _cache.read('chat.md');
        assertEquals(_result, { value: 'hello' });
      });

      it('[Normal] T-CLS-CC-03: 同一ファイルを write() 2回すると2回目の値で上書きされる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ a?: string; b?: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ key: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        const _result = await _cache.read('nonexistent.md');
        assertEquals(_result, {});
      });

      it('[Edge] T-CLS-CC-07: 拡張子あり/なしは同一キーとして扱われる', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(_buf),
        });
        await _cache.write('chat.md', { value: 'from-md' });
        const _result = await _cache.read('chat');
        assertEquals(_result, { value: 'from-md' });
      });

      it('[Edge] T-CLS-CC-08: 異なるファイルは独立して保持され値が混在しない', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ x: number }>('sub', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string; count: number }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml(_FIXTURE_YAML);
        assertEquals(await _cache.read('chat-a'), { value: 'hello', count: 1 });
        assertEquals(await _cache.read('chat-b'), { value: 'world', count: 2 });
      });

      it('[Normal] T-CLS-CC-12: loadFromYaml() は既存の _hash を上書きする', async () => {
        const _buf = new Map<string, string>();
        const _cache = new ChatlogWorks<{ value: string; count: number }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('');
        assertEquals(await _cache.read('chat-a'), {});
      });

      it('[Edge] T-CLS-CC-29: YAML が配列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('- a\n- b\n');
        assertEquals(await _cache.read('a'), {});
      });

      it('[Edge] T-CLS-CC-30: YAML がスカラー文字列のとき _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
          env: _fakeEnv,
          cache: _makeBufferProviders(),
        });
        _cache.loadFromYaml('hello');
        assertEquals(await _cache.read('hello'), {});
      });

      it('[Edge] T-CLS-CC-32: YAML の value が null のとき {} として格納される', async () => {
        const _cache = new ChatlogWorks<{ value: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', {
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
    });

    /** glob がファイルを返さない場合のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-15: glob が空リストを返すと _hash は空のまま', async () => {
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', {
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
        const _cache = new ChatlogWorks<{ type: string }>('test', '${TEMP}/cle-cache', {
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
    });
  });
});
