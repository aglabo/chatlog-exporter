// src: scripts/modules/__tests__/unit/setfm-assets-loader.unit.spec.ts
// @(#): loadDics / loadPrompts のユニットテスト
//       対象: loadDics, loadPrompts, resolveDicsDir, findLegacyPlaceholders
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { findLegacyPlaceholders, loadDics, loadPrompts, resolveDicsDir } from '../../setfm-assets-loader.ts';

// ─── Helpers
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
// constants
import { DEFAULT_CONFIG_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';
// types
import type { PromptTemplate } from '../../../types/dics.types.ts';

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

/** テンプレート: 固定部プレースホルダが user 節に残る旧形式の meta.yaml の内容。 */
const _LEGACY_META_YAML = `\
system: "You extract metadata."
user: "Topics: \${topic_list} Tags: \${tags_list} Body: \${body}"
`;

/** テンプレート: 固定部プレースホルダを system 節で描画する新形式の meta.yaml の内容。 */
const _NEW_META_YAML = `\
system: "Topics: \${topic_list} Tags: \${tags_list}"
user: "Body: \${body}"
`;

/** テンプレート: 固定部プレースホルダを system 節で描画する新形式の review.yaml の内容。 */
const _NEW_REVIEW_YAML = `\
system: "\${type_dics} \${topic_list} \${category_list} \${tags_list}"
user: "Review: \${result_yaml}"
`;

/** 旧形式テンプレート警告の識別文字列。他の warn（ファイル欠落等）と区別するために使う。 */
const _LEGACY_WARN_MARKER = '旧形式';

// types
/** `findLegacyPlaceholders` のテーブル駆動ケース。 */
interface _LegacyCase {
  /** テスト ID。 */
  id: string;
  /** ケースの説明。 */
  label: string;
  /** 入力テンプレート（テンプレート名 → `{ system, user }`）。 */
  templates: Record<string, PromptTemplate>;
  /** 期待結果（テンプレート名 → 検出した変数名の初出順リスト）。 */
  expected: Record<string, string[]>;
}

// constants (cases)
/** 旧形式・新形式テンプレートを渡す正常ケース。 */
const _normalCases: readonly _LegacyCase[] = [
  {
    id: 'T-SF-LP-01-01',
    label: '旧 meta（user に topic_list / tags_list / body）→ meta: [topic_list, tags_list]',
    templates: { meta: { system: 'sys', user: '${topic_list} ${tags_list} ${body}' } },
    expected: { meta: ['topic_list', 'tags_list'] },
  },
  {
    id: 'T-SF-LP-01-02',
    label: '旧 review（user に固定部 4 本と result_yaml）→ review: 4 本',
    templates: {
      review: { system: 'sys', user: '${type_dics} ${topic_list} ${category_list} ${tags_list} ${result_yaml}' },
    },
    expected: { review: ['type_dics', 'topic_list', 'category_list', 'tags_list'] },
  },
  {
    id: 'T-SF-LP-01-03',
    label: '新形式 meta / review（固定部は system のみ）→ 空',
    templates: {
      meta: { system: '${topic_list} ${tags_list}', user: '${log_type} ${log_category} ${body}' },
      review: {
        system: '${type_dics} ${topic_list} ${category_list} ${tags_list}',
        user: '${result_type} ${result_category} ${result_yaml}',
      },
    },
    expected: {},
  },
];

/** 空・欠落・対象外テンプレートなど境界のケース。 */
const _edgeCases: readonly _LegacyCase[] = [
  {
    id: 'T-SF-LP-02-01',
    label: '空テンプレート { system: "", user: "" } → 空',
    templates: { meta: { system: '', user: '' }, review: { system: '', user: '' } },
    expected: {},
  },
  {
    id: 'T-SF-LP-02-02',
    label: '固定部は system のみで user は ${body} だけ → エントリなし',
    templates: { meta: { system: '${topic_list}', user: '${body}' } },
    expected: {},
  },
  {
    id: 'T-SF-LP-02-03',
    label: 'meta / review を含まない Map → 空',
    templates: { category: { system: 'sys', user: '${body}' } },
    expected: {},
  },
  {
    id: 'T-SF-LP-02-04',
    label: '対象外テンプレート type の user に ${topic_list} → 無視される',
    templates: { type: { system: 'sys', user: '${topic_list} ${body}' } },
    expected: {},
  },
  {
    id: 'T-SF-LP-02-05',
    label: 'user での出現順が tags_list → topic_list → その順で返る',
    templates: { meta: { system: 'sys', user: '${tags_list} ${body} ${topic_list} ${tags_list}' } },
    expected: { meta: ['tags_list', 'topic_list'] },
  },
];

// functions
/**
 * テーブルケースの `Record` を `findLegacyPlaceholders` の入力 `Map` に変換する。
 *
 * @param templates - テンプレート名 → `PromptTemplate`
 * @returns `loadPrompts().prompts` と同形の `Map`
 */
const _toTemplateMap = (templates: Record<string, PromptTemplate>): Map<string, PromptTemplate> =>
  new Map(Object.entries(templates));

/**
 * `logger.warn` スタブの呼び出しのうち、旧形式テンプレート警告だけを文字列で取り出す。
 *
 * @param warnStub - `logger.warn` のスタブ
 * @returns 旧形式警告メッセージの配列
 */
const _legacyWarnings = (warnStub: Stub<typeof logger>): string[] =>
  warnStub.calls
    .map((call) => String(call.args[0]))
    .filter((message) => message.includes(_LEGACY_WARN_MARKER));

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
 * テスト ID 範囲: T-SF-AL-01 〜 T-SF-AL-08
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
   * `resolveDicsDir` のテストスイート。
   *
   * 辞書ディレクトリを `loadDics` と同じ規則で解決することを検証する。
   */
  describe('resolveDicsDir', () => {
    /** 絶対パスを渡す正常ケース。 */
    describe('When: dicsDir に絶対パスを指定する', () => {
      it('[Normal] T-SF-AL-07-01: 区切りが混在した絶対パス → 正規化されたパスがそのまま返る', () => {
        assertEquals(resolveDicsDir('C:\\dics\\sub/dir'), 'C:/dics/sub/dir');
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

    /**
     * 固定部プレースホルダが user 節に残る旧形式テンプレートの警告（`cle-kju.6.6`）。
     *
     * 旧形式でも描画は成功するが prefix キャッシュが効かないため、読み込み時に warn し処理は続ける。
     */
    describe('When: 旧形式テンプレートを読み込む', () => {
      let promptsDir: string;
      let warnStub: Stub<typeof logger>;

      beforeEach(async () => {
        promptsDir = `${tempDir}/prompts-legacy`;
        await Deno.mkdir(promptsDir);
        warnStub = stub(logger, 'warn');
      });

      afterEach(() => {
        warnStub.restore();
      });

      it('[Normal] T-SF-AL-08-01: 旧形式 meta.yaml → "meta" / ${topic_list} / /setup-chatlogs --force を含む warn が 1 回', async () => {
        await _writePromptFiles(promptsDir);
        await _writeFile(promptsDir, 'meta.yaml', _LEGACY_META_YAML);

        await loadPrompts(promptsDir);

        const _warnings = _legacyWarnings(warnStub);
        assertEquals(_warnings.length, 1);
        assertStringIncludes(_warnings[0], '"meta"');
        assertStringIncludes(_warnings[0], '${topic_list}, ${tags_list}');
        assertStringIncludes(_warnings[0], '/setup-chatlogs --force');
      });

      it('[Normal] T-SF-AL-08-02: 新形式 meta.yaml / review.yaml → 旧形式の warn は出ない', async () => {
        await _writePromptFiles(promptsDir);
        await Promise.all([
          _writeFile(promptsDir, 'meta.yaml', _NEW_META_YAML),
          _writeFile(promptsDir, 'review.yaml', _NEW_REVIEW_YAML),
        ]);

        await loadPrompts(promptsDir);

        assertEquals(_legacyWarnings(warnStub), []);
      });

      it('[Edge] T-SF-AL-08-03: 旧形式 meta.yaml → throw せず meta テンプレートをそのまま返す', async () => {
        await _writePromptFiles(promptsDir);
        await _writeFile(promptsDir, 'meta.yaml', _LEGACY_META_YAML);

        const result = await loadPrompts(promptsDir);

        assertEquals(result.prompts.get('meta'), {
          system: 'You extract metadata.',
          user: 'Topics: ${topic_list} Tags: ${tags_list} Body: ${body}',
        });
      });
    });
  });
});

/**
 * `findLegacyPlaceholders` のユニットテストスイート。
 *
 * `meta` / `review` テンプレートの user 節に残った固定部プレースホルダ（DR-36 で system へ移したもの）を
 * テンプレートごとに初出順で列挙することを検証する。純関数のためファイル I/O を伴わない。
 *
 * テスト ID 範囲: T-SF-LP-01-01 〜 T-SF-LP-02-05
 *
 * @see findLegacyPlaceholders
 */
describe('findLegacyPlaceholders', () => {
  /** 旧形式・新形式テンプレートを渡す正常ケース。 */
  describe('When: 正常系', () => {
    for (const { id, label, templates, expected } of _normalCases) {
      it(`[Normal] ${id}: ${label}`, () => {
        const result = findLegacyPlaceholders(_toTemplateMap(templates));

        assertEquals(Object.fromEntries(result), expected);
      });
    }
  });

  /** 空・欠落・対象外テンプレートなど境界のケース。 */
  describe('When: エッジケース', () => {
    for (const { id, label, templates, expected } of _edgeCases) {
      it(`[Edge] ${id}: ${label}`, () => {
        const result = findLegacyPlaceholders(_toTemplateMap(templates));

        assertEquals(Object.fromEntries(result), expected);
      });
    }
  });
});
