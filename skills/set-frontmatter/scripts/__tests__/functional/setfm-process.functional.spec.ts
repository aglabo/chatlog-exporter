// src: scripts/__tests__/functional/setfm-process.functional.spec.ts
// @(#): _phaseTypeAndCategory / _phaseFrontmatter の functional テスト
//       対象: _phaseTypeAndCategoryForTest, _phaseFrontmatterForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  _phaseFrontmatterForTest as phaseFrontmatter,
  _phaseTypeAndCategoryForTest as phaseTypeAndCategory,
} from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';
import type { DicEntry, Dics, Prompts } from '../../types/dics.types.ts';

// ─── Internal Helpers

// constants
/** テスト用最大コンテンツ長。 */
const _MAX_CONTENT_LENGTH = 5000;

/** テスト用並列度。 */
const _CONCURRENCY = 1;

// functions

/**
 * バッファプロバイダーを使った `ChatlogWorks<SetfmCache>` インスタンスを生成する。
 *
 * ファイルシステムに依存しないテストのため、`Map<string, string>` をバッファとして使用する。
 * `cacheRoot` は固定の偽パス `'/fake/cache'` を使いディレクトリ作成をスキップする。
 * `yaml` を渡すと ready 完了時に YAML でキャッシュが初期化される。
 *
 * @param buf - 読み書きを受け持つバッファ
 * @param yaml - 初期キャッシュ内容（省略時はディレクトリ自動読み込み＝空）
 * @returns 初期化済みの `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCache = async (buf: Map<string, string>, yaml?: string): Promise<ChatlogWorks<SetfmCache>> => {
  const cache = new ChatlogWorks<SetfmCache>(
    'fm-cache',
    '/fake/cache',
    {
      cache: {
        readTextFile: (path) => {
          const data = buf.get(path);
          if (data === undefined) { return Promise.reject(new Error('not found')); }
          return Promise.resolve(data);
        },
        writeTextFile: (path, data) => {
          buf.set(path, data);
          return Promise.resolve();
        },
        mkdir: () => Promise.resolve(),
      },
    },
    yaml != null ? { yaml } : undefined,
  );
  await cache.ready;
  return cache;
};

/**
 * テスト用 `DicEntry` を生成する。
 *
 * @param overrides - 上書きするフィールド
 * @returns デフォルト値を持つ `DicEntry`
 */
const _makeDicEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'misc',
  def: 'Miscellaneous log',
  desc: 'その他のログ',
  rules: { when: ['その他'], not: [] },
  ...overrides,
});

/**
 * テスト用 `Dics` を生成する（最小限のエントリのみ含む）。
 *
 * @returns 最小限のエントリセットを持つ `Dics`
 */
const _makeDics = (): Dics => ({
  category: 'general,development',
  tags: 'lang:typescript',
  categoryEntries: [
    _makeDicEntry({ key: 'general', def: 'General log', desc: '汎用ログ', rules: { when: ['汎用'], not: [] } }),
  ],
  typeEntries: [
    _makeDicEntry({ key: 'misc', def: 'Misc log', desc: 'その他ログ', rules: { when: ['その他'], not: [] } }),
  ],
  topicEntries: [],
});

/**
 * テスト用 `Prompts` を生成する（最小限のプロンプトテンプレートのみ含む）。
 *
 * @returns 最小限のプロンプトテンプレートを持つ `Prompts`
 */
const _makePrompts = (): Prompts => ({
  categoryPrompts: new Map([['misc', 'focus guide for misc']]),
  prompts: new Map([
    [
      'type-category',
      {
        system: 'Classify.\n${type_dics}\n\n${category_dics}\n\n${category_rules}',
        user: '${entries}',
      },
    ],
    [
      'frontmatter',
      {
        system: 'Generate frontmatter.',
        user: '${entries}',
      },
    ],
  ]),
});

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * `filePath` と `body` を受け取り、最小限の frontmatter を持つエントリを返す。
 *
 * @param filePath - エントリのファイルパス
 * @param body - 本文テキスト
 * @returns 指定された filePath と body を持つ `ChatlogEntry`
 */
const _makeEntry = (filePath: string, body: string): ChatlogEntry => {
  const text = [
    '---',
    'session_id: sess-001',
    '---',
    '',
    body,
  ].join('\n');
  return new ChatlogEntry(text, { filePath });
};

// ─── Tests

/**
 * `_phaseTypeAndCategory` の functional テストスイート。
 *
 * キャッシュヒット・キャッシュミス・混在の各シナリオで
 * type/category フロントマターフィールドの設定と judgeProvider の呼び出し有無を検証する。
 *
 * テスト ID 範囲: T-SF-PA-01 〜 T-SF-PA-03
 *
 * @see _phaseTypeAndCategoryForTest
 */
describe('_phaseTypeAndCategory', () => {
  let buf: Map<string, string>;
  let cache: ChatlogWorks<SetfmCache>;
  let judgeCallCount: number;
  let judgeStub: (
    entry: ChatlogEntry,
    maxLen: number,
    dics: Dics,
    prompts: Prompts,
  ) => Promise<void>;

  beforeEach(async () => {
    buf = new Map();
    cache = await _makeCache(buf);
    judgeCallCount = 0;
    judgeStub = (entry) => {
      judgeCallCount++;
      entry.frontmatter.set('type', 'stub-type');
      entry.frontmatter.set('category', 'stub-category');
      return Promise.resolve();
    };
  });

  /**
   * `_phaseTypeAndCategory` — キャッシュヒット時の正常ケース。
   *
   * キャッシュに type/category が存在するとき、frontmatter にセットされ
   * judgeProvider は呼ばれないことを検証する。
   */
  describe('When: キャッシュヒット（事前スキップ）', () => {
    it('[Normal] T-SF-PA-01: type が設定済みのエントリ → judgeProvider 未呼び出し、frontmatter にキャッシュ値がセット', async () => {
      cache = await _makeCache(buf, 'test:\n  type: "coding"\n  category: "typescript"');
      const entry = _makeEntry('/path/to/test.md', '# test');

      await phaseTypeAndCategory(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        judgeStub,
      );

      assertEquals(entry.frontmatter.get('type'), 'coding');
      assertEquals(entry.frontmatter.get('category'), 'typescript');
      assertEquals(judgeCallCount, 0);
    });
  });

  /**
   * `_phaseTypeAndCategory` — キャッシュミス時の正常ケース。
   *
   * キャッシュが空のとき judgeProvider が呼ばれ、結果がキャッシュに書き込まれることを検証する。
   */
  describe('When: キャッシュミス 正常系', () => {
    it('[Normal] T-SF-PA-02: cache が空のエントリ → judgeProvider が呼ばれ、frontmatter にセット、キャッシュに write', async () => {
      const entry = _makeEntry('/path/to/test.md', '# test');

      await phaseTypeAndCategory(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        judgeStub,
      );

      assertEquals(entry.frontmatter.get('type'), 'stub-type');
      assertEquals(entry.frontmatter.get('category'), 'stub-category');
      assertEquals(judgeCallCount, 1);
      assertEquals(buf.size > 0, true);
    });
  });

  /**
   * `_phaseTypeAndCategory` — ヒット + ミス混在時の正常ケース。
   *
   * ヒット1件とミス1件が混在するとき、ヒット分は judgeProvider 未呼び出し、
   * ミス分のみ judgeProvider が呼ばれることを検証する。
   */
  describe('When: 混在（ヒット + ミスが混在）', () => {
    it('[Normal] T-SF-PA-03: ヒット1件 + ミス1件の混在 → ヒット分は judgeProvider 未呼び出し、ミス分のみ呼び出し', async () => {
      cache = await _makeCache(buf, 'hit:\n  type: "coding"\n  category: "typescript"');
      const hitEntry = _makeEntry('/path/to/hit.md', '# hit');
      const missEntry = _makeEntry('/path/to/miss.md', '# miss');

      await phaseTypeAndCategory(
        [hitEntry, missEntry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        judgeStub,
      );

      assertEquals(hitEntry.frontmatter.get('type'), 'coding');
      assertEquals(hitEntry.frontmatter.get('category'), 'typescript');
      assertEquals(missEntry.frontmatter.get('type'), 'stub-type');
      assertEquals(missEntry.frontmatter.get('category'), 'stub-category');
      assertEquals(judgeCallCount, 1);
    });
  });
});

/**
 * `_phaseFrontmatter` の functional テストスイート。
 *
 * キャッシュヒット・キャッシュミス（正常系・異常系）の各シナリオで
 * フロントマターの復元・生成と generateProvider の呼び出し有無を検証する。
 *
 * テスト ID 範囲: T-SF-PF-01 〜 T-SF-PF-03
 *
 * @see _phaseFrontmatterForTest
 */
describe('_phaseFrontmatter', () => {
  let buf: Map<string, string>;
  let cache: ChatlogWorks<SetfmCache>;
  let generateCallCount: number;
  let generateStub: (
    entry: ChatlogEntry,
    maxLen: number,
    dics: Dics,
    prompts: Prompts,
  ) => Promise<boolean>;

  beforeEach(async () => {
    buf = new Map();
    cache = await _makeCache(buf);
    generateCallCount = 0;
    generateStub = (entry) => {
      generateCallCount++;
      entry.frontmatter.set('title', 'Generated Title');
      return Promise.resolve(true);
    };
  });

  /**
   * `_phaseFrontmatter` — キャッシュヒット時の正常ケース。
   *
   * キャッシュに frontmatter が存在するとき、エントリに復元されて Set に追加され
   * generateProvider は呼ばれないことを検証する。
   */
  describe('When: キャッシュヒット（事前スキップ）', () => {
    it('[Normal] T-SF-PF-01: frontmatter が設定済みのエントリ → generateProvider 未呼び出し、フロントマター復元、Set に追加', async () => {
      cache = await _makeCache(buf, 'test:\n  frontmatter:\n    title: "Cached Title"\n    summary: "Cached Summary"');
      const entry = _makeEntry('/path/to/test.md', '# test');

      const result = await phaseFrontmatter(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        generateStub,
      );

      assertEquals(result.has('/path/to/test.md'), true);
      assertEquals(entry.frontmatter.get('title'), 'Cached Title');
      assertEquals(entry.frontmatter.get('summary'), 'Cached Summary');
      assertEquals(generateCallCount, 0);
    });
  });

  /**
   * `_phaseFrontmatter` — キャッシュミス時の正常ケース。
   *
   * キャッシュが空で generateProvider が有効な frontmatter を生成するとき、
   * filePath が Set に追加され、バッファに frontmatter が書き込まれることを検証する。
   */
  describe('When: キャッシュミス 正常系', () => {
    it('[Normal] T-SF-PF-02: cache が空のエントリ → generateProvider が呼ばれ、Set に追加、キャッシュに write', async () => {
      const entry = _makeEntry('/path/to/test.md', '# test');

      const result = await phaseFrontmatter(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        generateStub,
      );

      assertEquals(result.has('/path/to/test.md'), true);
      assertEquals(entry.frontmatter.get('title'), 'Generated Title');
      assertEquals(generateCallCount, 1);
      assertEquals(buf.size > 0, true);
    });
  });

  /**
   * `_phaseFrontmatter` — キャッシュミス時の異常ケース。
   *
   * generateProvider が false を返すとき、filePath が Set に追加されず
   * バッファへの書き込みが発生しないことを検証する。
   */
  describe('When: キャッシュミス 異常系', () => {
    it('[Error] T-SF-PF-03: generateProvider が false → Set に追加されない、キャッシュに書き込みなし', async () => {
      const failGenerate = (_entry: ChatlogEntry) => {
        generateCallCount++;
        return Promise.resolve(false);
      };
      const entry = _makeEntry('/path/to/test.md', '# test');

      const result = await phaseFrontmatter(
        [entry],
        cache,
        _MAX_CONTENT_LENGTH,
        _makeDics(),
        _makePrompts(),
        _CONCURRENCY,
        failGenerate,
      );

      assertEquals(result.has('/path/to/test.md'), false);
      assertEquals(buf.size, 0);
    });
  });
});
