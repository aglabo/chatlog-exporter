// src: scripts/modules/__tests__/unit/setfm-assets-loader.unit.spec.ts
// @(#): loadDics / loadPrompts のユニットテスト
//       対象: loadDics, loadPrompts
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadDics, loadPrompts } from '../../setfm-assets-loader.ts';

// ─── Helpers
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CONFIG_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';

// ─── Internal Helpers

// constants
/** テンプレート: 2エントリを持つ category.dic の内容。 */
const _CATEGORY_DIC = `\
tech:
  def: "Technology"
  desc: "技術系のログ"
life:
  def: "Life"
  desc: "生活系のログ"
`;

/** テンプレート: 1エントリを持つ tags.dic の内容。 */
const _TAGS_DIC = `\
typescript:
  def: "TypeScript"
  desc: "TypeScript 関連"
`;

/** テンプレート: 1エントリを持つ topics.dic の内容。 */
const _TOPICS_DIC = `\
ai:
  def: "AI"
  desc: "AI 関連のトピック"
`;

/** テンプレート: 1エントリを持つ types.dic の内容。 */
const _TYPES_DIC = `\
chat:
  def: "Chat"
  desc: "チャット形式のログ"
`;

/** テンプレート: system/user キーを持つ type.yaml の内容。 */
const _TYPE_YAML = `\
system: "You are a helpful assistant."
user: "Classify the following: {{body}}"
`;

/** テンプレート: system/user キーを持つ category.yaml の内容。 */
const _CATEGORY_YAML = `\
system: "You are a category classifier."
user: "Categorize this log: {{body}}"
`;

/** テンプレート: system/user キーを持つ meta.yaml の内容。 */
const _META_YAML = `\
system: "You extract metadata."
user: "Extract metadata from: {{body}}"
`;

/** テンプレート: system/user キーを持つ review.yaml の内容。 */
const _REVIEW_YAML = `\
system: "You review frontmatter."
user: "Review this frontmatter: {{body}}"
`;

// functions
/**
 * 指定ディレクトリへファイルを書き込む。
 *
 * @param dir - 書き込み先ディレクトリ
 * @param name - ファイル名
 * @param content - ファイル内容
 */
const _writeFile = async (dir: string, name: string, content: string): Promise<void> => {
  await Deno.writeTextFile(`${dir}/${name}`, content);
};

/**
 * dics 用の一時ディレクトリに全 .dic ファイルを書き込む。
 *
 * @param dir - 書き込み先ディレクトリ
 */
const _writeDicFiles = async (dir: string): Promise<void> => {
  await Promise.all([
    _writeFile(dir, 'category.dic', _CATEGORY_DIC),
    _writeFile(dir, 'topics.dic', _TOPICS_DIC),
    _writeFile(dir, 'tags.dic', _TAGS_DIC),
    _writeFile(dir, 'types.dic', _TYPES_DIC),
  ]);
};

/**
 * prompts 用の一時ディレクトリに全 .yaml ファイルを書き込む。
 *
 * @param dir - 書き込み先ディレクトリ
 */
const _writePromptFiles = async (dir: string): Promise<void> => {
  await Promise.all([
    _writeFile(dir, 'type.yaml', _TYPE_YAML),
    _writeFile(dir, 'category.yaml', _CATEGORY_YAML),
    _writeFile(dir, 'meta.yaml', _META_YAML),
    _writeFile(dir, 'review.yaml', _REVIEW_YAML),
  ]);
};

// ─── Tests

/**
 * `loadDics` / `loadPrompts` のユニットテストスイート。
 *
 * 実ファイルシステムを使い一時ディレクトリで検証する。
 *
 * テスト ID 範囲: T-SF-AL-01 〜 T-SF-AL-04
 *
 * @see loadDics
 * @see loadPrompts
 */
describe('setfm-assets-loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * `loadDics` のテストスイート。
   *
   * dicsDir 配下の .dic ファイルを読んで `Dics` 型を返すことを検証する。
   */
  describe('loadDics', () => {
    /** 有効な .dic ファイルが揃っている正常ケース。 */
    describe('When: 正常系', () => {
      let dicsDir: string;

      beforeEach(async () => {
        dicsDir = `${tempDir}/dics`;
        await Deno.mkdir(dicsDir);
        await _writeDicFiles(dicsDir);
      });

      it('[Normal] T-SF-AL-01-02: category キーが Dics.category に抽出される', async () => {
        const result = await loadDics(dicsDir);

        assertEquals(result.category, 'tech,life');
      });

      it('[Normal] T-SF-AL-01-03: tags キーが Dics.tags に抽出される', async () => {
        const result = await loadDics(dicsDir);

        assertEquals(result.tags, 'typescript');
      });
    });

    /** 存在しない dicsDir を指定したエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-AL-02-01: 存在しない dicsDir → ChatlogError を内部で握りつぶし空の結果を返す', async () => {
        const result = await loadDics(`${tempDir}/nonexistent`);

        assertEquals(result.category, '');
        assertEquals(result.tags, '');
        assertEquals(result.categoryEntries, []);
        assertEquals(result.typeEntries, []);
        assertEquals(result.topicEntries, []);
      });
    });

    /** 相対パスを渡したとき `.config/<appName>/` 基準に解決されるケース。 */
    describe('When: dicsDir に相対パスを指定する', () => {
      let originalCwd: string;

      beforeEach(async () => {
        originalCwd = Deno.cwd();
        Deno.chdir(tempDir);
        GlobalConfig.resetInstance();
        const configDicsDir = `${tempDir}/${DEFAULT_CONFIG_DIR}/dics`;
        await Deno.mkdir(configDicsDir, { recursive: true });
        await _writeDicFiles(configDicsDir);
      });

      afterEach(() => {
        GlobalConfig.resetInstance();
        Deno.chdir(originalCwd);
      });

      it('[Normal] T-SF-AL-05-01: 相対パス "dics" → .config/<appName>/dics 配下から読み込まれる', async () => {
        const result = await loadDics('dics');

        assertEquals(result.category, 'tech,life');
        assertEquals(result.tags, 'typescript');
      });
    });
  });

  /**
   * `loadPrompts` のテストスイート。
   *
   * promptsDir 配下の .yaml ファイルを読んで `Prompts` 型を返すことを検証する。
   */
  describe('loadPrompts', () => {
    /** 有効な .yaml ファイルが揃っている正常ケース。 */
    describe('When: 正常系', () => {
      let promptsDir: string;

      beforeEach(async () => {
        promptsDir = `${tempDir}/prompts`;
        await Deno.mkdir(promptsDir);
        await _writePromptFiles(promptsDir);
      });

      it('[Normal] T-SF-AL-03-02: prompts.get("type") に PromptTemplate が入っている', async () => {
        const result = await loadPrompts(promptsDir);

        assertEquals(result.prompts.get('type'), {
          system: 'You are a helpful assistant.',
          user: 'Classify the following: {{body}}',
        });
      });
    });

    /** 異常・エッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-AL-04-01: system/user キーがない YAML → 空文字列で PromptTemplate が作られる', async () => {
        const promptsDir = `${tempDir}/prompts-empty`;
        await Deno.mkdir(promptsDir);
        await Promise.all([
          _writeFile(promptsDir, 'type.yaml', 'other_key: "value"'),
          _writeFile(promptsDir, 'category.yaml', 'other_key: "value"'),
          _writeFile(promptsDir, 'meta.yaml', 'other_key: "value"'),
          _writeFile(promptsDir, 'review.yaml', 'other_key: "value"'),
        ]);

        const result = await loadPrompts(promptsDir);

        assertEquals(result.prompts.get('type'), { system: '', user: '' });
      });

      it('[Edge] T-SF-AL-04-02: 存在しない promptsDir → 空テンプレートが返る', async () => {
        const result = await loadPrompts(`${tempDir}/nonexistent`);

        assertEquals(result.prompts.get('type'), { system: '', user: '' });
        assertEquals(result.prompts.get('category'), { system: '', user: '' });
        assertEquals(result.categoryPrompts.size, 0);
      });
    });

    /** 相対パスを渡したとき `.config/<appName>/` 基準に解決されるケース。 */
    describe('When: promptsDir に相対パスを指定する', () => {
      let originalCwd: string;

      beforeEach(async () => {
        originalCwd = Deno.cwd();
        Deno.chdir(tempDir);
        GlobalConfig.resetInstance();
        const configPromptsDir = `${tempDir}/${DEFAULT_CONFIG_DIR}/prompts`;
        await Deno.mkdir(configPromptsDir, { recursive: true });
        await _writePromptFiles(configPromptsDir);
      });

      afterEach(() => {
        GlobalConfig.resetInstance();
        Deno.chdir(originalCwd);
      });

      it('[Normal] T-SF-AL-06-01: 相対パス "prompts" → .config/<appName>/prompts 配下から読み込まれる', async () => {
        const result = await loadPrompts('prompts');

        assertEquals(result.prompts.get('type'), {
          system: 'You are a helpful assistant.',
          user: 'Classify the following: {{body}}',
        });
      });
    });
  });
});
