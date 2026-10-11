// src: scripts/testing/mutation/__tests__/unit/allowlist.unit.spec.ts
// @(#): allowlist のユニットテスト
//       対象: loadAllowlist, matchAllowlist
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { loadAllowlist, matchAllowlist } from '../../allowlist.ts';

// ─── Helpers
import { join } from '@std/path';
import { stringify as stringifyYaml } from '@std/yaml';

import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';

import type { AllowlistEntry, Mutant, MutantResult, MutantStatus } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 7 属性すべてが正しい関係演算子のエントリ。 */
const _VALID_ENTRY: AllowlistEntry = {
  file: 'skills/_cle-libs/libs/a.ts',
  lineText: 'if (a > b) {',
  op: 'relational',
  before: '>',
  after: '>=',
  occurrence: 1,
  reason: 'a === b に到達しない',
};

/** 照合の基準にする関係演算子の変異体 (`if (a > b) {` の `>` → `>=`)。 */
const _BASE_MUTANT: Mutant = {
  file: 'skills/a/foo.ts',
  line: 10,
  column: 7,
  op: 'relational',
  before: '>',
  after: '>=',
  lineText: 'if (a > b) {',
};

/** `_BASE_MUTANT` に照合キーがすべて一致するエントリ。 */
const _BASE_ENTRY: AllowlistEntry = {
  file: 'skills/a/foo.ts',
  lineText: 'if (a > b) {',
  op: 'relational',
  before: '>',
  after: '>=',
  occurrence: 1,
  reason: 'a === b は到達しないため等価',
};

// functions
/**
 * 読み込み元ディレクトリに `mod.yaml` を書き出す。
 *
 * @param dir - 読み込み元ディレクトリ
 * @param text - ファイルの内容
 */
async function _writeAllowlist(dir: string, text: string): Promise<void> {
  await Deno.writeTextFile(join(dir, 'mod.yaml'), text);
}

/**
 * `_VALID_ENTRY` を基に、属性を上書き・除去したエントリを作る。
 *
 * @param overrides - 上書きする属性 (不正な型の値も渡せる)
 * @param omitKey - 除去する属性名
 * @returns YAML に書き出すエントリ
 */
function _makeEntry(overrides: Record<string, unknown> = {}, omitKey?: keyof AllowlistEntry): Record<string, unknown> {
  const _entry: Record<string, unknown> = { ..._VALID_ENTRY, ...overrides };
  return Object.fromEntries(Object.entries(_entry).filter(([key]) => key !== omitKey));
}

/**
 * 読み込み元ディレクトリに、エントリの列を YAML にした `mod.yaml` を書き出す。
 *
 * @param dir - 読み込み元ディレクトリ
 * @param entries - 書き出すエントリ
 */
async function _writeEntries(dir: string, entries: readonly Record<string, unknown>[]): Promise<void> {
  await _writeAllowlist(dir, stringifyYaml(entries));
}

/**
 * 読み込み元ディレクトリの `mod.yaml` を読み込み、投げられた `ChatlogError` を返す。
 *
 * @param dir - 読み込み元ディレクトリ
 * @returns 読み込みで投げられた `ChatlogError`
 */
async function _loadError(dir: string): Promise<ChatlogError> {
  return await assertRejects(() => loadAllowlist('mod', { allowlistDir: dir }), ChatlogError);
}

/**
 * `_BASE_MUTANT` を基に、属性を上書きした変異体を作る。
 *
 * @param overrides - 上書きする属性
 * @returns 変異体
 */
function _makeMutant(overrides: Partial<Mutant> = {}): Mutant {
  return { ..._BASE_MUTANT, ...overrides };
}

/**
 * `_BASE_ENTRY` を基に、属性を上書きした許容リストのエントリを作る。
 *
 * @param overrides - 上書きする属性
 * @returns 許容リストのエントリ
 */
function _makeAllowEntry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return { ..._BASE_ENTRY, ...overrides };
}

/**
 * 変異体の判定を作る。
 *
 * @param mutant - 判定した変異体
 * @param status - 判定
 * @returns 変異体 1 件の判定
 */
function _makeResult(mutant: Mutant, status: MutantStatus): MutantResult {
  return { mutant, status };
}

// cases
/** 不正なエントリ 1 件と、エラーメッセージに含まれるべき文言。 */
type _EntryErrorCase = {
  /** テスト ID。 */
  id: string;
  /** 入力の説明。 */
  input: string;
  /** YAML に書き出すエントリ。 */
  entry: Record<string, unknown>;
  /** エラーメッセージに含まれるべき文言 (エントリ位置を含む)。 */
  expected: string;
};

/** 理由 (`reason`) が欠けている・空のエントリ (allowlist R-503)。 */
const _reasonErrorCases: readonly _EntryErrorCase[] = [
  {
    id: 'T-MUT-AL-04-01',
    input: 'reason キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'reason'),
    expected: '1 件目: reason が無い',
  },
  {
    id: 'T-MUT-AL-04-02',
    input: 'reason が空文字列のエントリ 1 件',
    entry: _makeEntry({ reason: '' }),
    expected: '1 件目: reason が空',
  },
  {
    id: 'T-MUT-AL-04-03',
    input: 'reason が空白 3 文字のエントリ 1 件',
    entry: _makeEntry({ reason: '   ' }),
    expected: '1 件目: reason が空',
  },
  {
    id: 'T-MUT-AL-04-04',
    input: 'reason: (値なし = YAML の null) のエントリ 1 件',
    entry: _makeEntry({ reason: null }),
    expected: '1 件目: reason が無い',
  },
  {
    id: 'T-MUT-AL-04-05',
    input: 'reason: 42 (数値) のエントリ 1 件',
    entry: _makeEntry({ reason: 42 }),
    expected: '1 件目: reason が文字列でない',
  },
  {
    id: 'T-MUT-AL-04-06',
    input: 'reason: {} (マッピング) のエントリ 1 件',
    entry: _makeEntry({ reason: {} }),
    expected: '1 件目: reason が文字列でない: {}',
  },
];

/** 理由以外の必須属性が欠けている・不正なエントリ (allowlist R-504)。 */
const _attributeErrorCases: readonly _EntryErrorCase[] = [
  {
    id: 'T-MUT-AL-05-01',
    input: 'occurrence: 0 のエントリ 1 件',
    entry: _makeEntry({ occurrence: 0 }),
    expected: '1 件目: occurrence が 1 以上の整数でない',
  },
  {
    id: 'T-MUT-AL-05-02',
    input: 'occurrence: 1.5 のエントリ 1 件',
    entry: _makeEntry({ occurrence: 1.5 }),
    expected: '1 件目: occurrence が 1 以上の整数でない',
  },
  {
    id: 'T-MUT-AL-05-03',
    input: 'occurrence: "1" (文字列) のエントリ 1 件',
    entry: _makeEntry({ occurrence: '1' }),
    expected: '1 件目: occurrence が 1 以上の整数でない',
  },
  {
    id: 'T-MUT-AL-05-04',
    input: 'op: arithmetic のエントリ 1 件',
    entry: _makeEntry({ op: 'arithmetic' }),
    expected:
      '1 件目: op が MutationOp に無い: arithmetic (許可値: relational, equality, logical, boolean, number, negation)',
  },
  {
    id: 'T-MUT-AL-05-05',
    input: 'file キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'file'),
    expected: '1 件目: file が無い',
  },
  {
    id: 'T-MUT-AL-05-06',
    input: 'lineText: 42 (数値) のエントリ 1 件',
    entry: _makeEntry({ lineText: 42 }),
    expected: '1 件目: lineText が文字列でない',
  },
  {
    id: 'T-MUT-AL-05-07',
    input: 'before: true (真偽値) のエントリ 1 件',
    entry: _makeEntry({ before: true }),
    expected: '1 件目: before が文字列でない',
  },
  {
    id: 'T-MUT-AL-05-08',
    input: 'after キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'after'),
    expected: '1 件目: after が無い',
  },
  {
    id: 'T-MUT-AL-05-09',
    input: 'file が \\ 区切りのエントリ 1 件',
    entry: _makeEntry({ file: 'skills\\_cle-libs\\libs\\a.ts' }),
    expected: '1 件目: file が / 区切りのリポジトリルート相対パスでない',
  },
  {
    id: 'T-MUT-AL-05-10',
    input: 'file が絶対パス /home/user/repo/... のエントリ 1 件',
    entry: _makeEntry({ file: '/home/user/repo/skills/_cle-libs/libs/a.ts' }),
    expected: '1 件目: file が / 区切りのリポジトリルート相対パスでない',
  },
  {
    id: 'T-MUT-AL-05-13',
    input: 'lineText: [] (列) のエントリ 1 件',
    entry: _makeEntry({ lineText: [] }),
    expected: '1 件目: lineText が文字列でない: []',
  },
  {
    id: 'T-MUT-AL-05-14',
    input: 'occurrence: {a: 1} (マッピング) のエントリ 1 件',
    entry: _makeEntry({ occurrence: { a: 1 } }),
    expected: '1 件目: occurrence が 1 以上の整数でない: {"a":1}',
  },
  {
    id: 'T-MUT-AL-05-15',
    input: 'file が / 区切りの Windows 絶対パス C:/x/a.ts のエントリ 1 件',
    entry: _makeEntry({ file: 'C:/x/a.ts' }),
    expected: '1 件目: file が / 区切りのリポジトリルート相対パスでない',
  },
  {
    id: 'T-MUT-AL-05-16',
    input: 'after: 1 (数値) のエントリ 1 件',
    entry: _makeEntry({ after: 1 }),
    expected: '1 件目: after が文字列でない: 1',
  },
  {
    id: 'T-MUT-AL-05-18',
    input: 'lineText キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'lineText'),
    expected: '1 件目: lineText が無い',
  },
  {
    id: 'T-MUT-AL-05-19',
    input: 'op キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'op'),
    expected: '1 件目: op が無い',
  },
  {
    id: 'T-MUT-AL-05-20',
    input: 'before キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'before'),
    expected: '1 件目: before が無い',
  },
  {
    id: 'T-MUT-AL-05-21',
    input: 'occurrence キーを持たないエントリ 1 件',
    entry: _makeEntry({}, 'occurrence'),
    expected: '1 件目: occurrence が無い',
  },
];

/** 明示的な null 文書 (allowlist R-502 / impl §3.4 #5: 免除は内容なし・コメントのみ)。 */
const _nullDocumentCases: readonly { id: string; input: string; text: string }[] = [
  { id: 'T-MUT-AL-03-03', input: '内容が ~ だけのファイル', text: '~\n' },
  { id: 'T-MUT-AL-03-04', input: '内容が null だけのファイル', text: 'null\n' },
  { id: 'T-MUT-AL-03-05', input: '内容が --- だけのファイル', text: '---\n' },
];

/** エントリを持たない文書 (allowlist R-502 / impl §3.4 #5)。 */
const _emptyDocumentCases: readonly { id: string; input: string; text: string }[] = [
  { id: 'T-MUT-AL-08-01', input: '内容 0 バイトのファイル', text: '' },
  { id: 'T-MUT-AL-08-02', input: 'コメント 1 行だけのファイル', text: '# 等価変異体の記録\n' },
  { id: 'T-MUT-AL-08-03', input: '内容が [] のファイル', text: '[]\n' },
  { id: 'T-MUT-AL-08-04', input: 'コメント行・空行・字下げしたコメント行だけのファイル', text: '# a\n\n  # b\n' },
];

/** `file` の形式検査を通過する境界の相対パス (allowlist R-504 / impl §3.4 #3: 存在は検査しない)。 */
const _acceptedFileCases: readonly { id: string; input: string; file: string }[] = [
  { id: 'T-MUT-AL-09-03', input: "file: '' (空文字列)", file: '' },
  { id: 'T-MUT-AL-09-04', input: "file: '../a.ts' (.. で始まる相対パス)", file: '../a.ts' },
];

/** 照合キーの 1 属性だけが `_BASE_MUTANT` と異なるエントリ (allowlist R-508 / DD-01)。 */
const _keyMismatchCases: readonly { id: string; input: string; entry: AllowlistEntry }[] = [
  {
    id: 'T-MUT-AL-11-02',
    input: 'file だけ異なる (skills/a/bar.ts)',
    entry: _makeAllowEntry({ file: 'skills/a/bar.ts' }),
  },
  { id: 'T-MUT-AL-11-03', input: 'op だけ異なる (equality)', entry: _makeAllowEntry({ op: 'equality' }) },
  { id: 'T-MUT-AL-11-04', input: 'before だけ異なる (<)', entry: _makeAllowEntry({ before: '<' }) },
  { id: 'T-MUT-AL-11-05', input: 'after だけ異なる (<)', entry: _makeAllowEntry({ after: '<' }) },
];

/** survived 以外の判定 (allowlist R-506)。 */
const _nonSurvivedCases: readonly { id: string; status: MutantStatus }[] = [
  { id: 'T-MUT-AL-13-01', status: 'killed' },
  { id: 'T-MUT-AL-13-02', status: 'timeout' },
  { id: 'T-MUT-AL-13-03', status: 'error' },
  { id: 'T-MUT-AL-13-04', status: 'compile-error' },
];

/** `lineText` の前後の空白・`
` だけが異なり、照合キーが一致する変異体とエントリ (allowlist R-507 / DD-01)。 */
const _surroundingSpaceCases: readonly { id: string; input: string; mutant: Mutant; entry: AllowlistEntry }[] = [
  {
    id: 'T-MUT-AL-15-01',
    input: "変異体の lineText に行頭インデント ('    if (a > b) {')",
    mutant: _makeMutant({ lineText: '    if (a > b) {', column: 11 }),
    entry: _BASE_ENTRY,
  },
  {
    id: 'T-MUT-AL-15-02',
    input: "変異体の lineText に行末の空白 2 文字 ('if (a > b) {  ')",
    mutant: _makeMutant({ lineText: 'if (a > b) {  ' }),
    entry: _BASE_ENTRY,
  },
  {
    id: 'T-MUT-AL-15-05',
    input: "CRLF 由来で E の lineText 末尾に \r ('if (a > b) {\r')",
    mutant: _BASE_MUTANT,
    entry: _makeAllowEntry({ lineText: 'if (a > b) {\r' }),
  },
];

// ─── Tests

/**
 * `loadAllowlist` のユニットテストスイート。
 *
 * 一時ディレクトリに置いた許容リスト (`<module>.yaml`) を読み込み、全エントリを検証することを確認する。
 *
 * テスト ID 範囲: T-MUT-AL-01-01 〜 T-MUT-AL-09-04
 *
 * @see loadAllowlist
 */
describe('loadAllowlist', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'allowlist-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 許容リストのファイルが存在しない (allowlist R-501 / DD-04)。
   */
  describe('ファイルが存在しない', () => {
    /** 読み込み元ディレクトリに `<module>.yaml` を置かない正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-AL-01-01: mod.yaml が無い → [] を返し例外を投げない', async () => {
        const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

        assertEquals(_result, []);
      });
    });
  });

  /**
   * 正しい許容リストを読み込む (allowlist R-503 / R-504 / REQ-F-009)。
   */
  describe('正しい許容リスト', () => {
    /** 7 属性すべてが正しいエントリを置く正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-AL-02-01: 7 属性すべてが正しいエントリ 1 件 → 同じ 7 属性値のエントリ 1 件', async () => {
        await _writeAllowlist(
          tempDir,
          "- {file: skills/_cle-libs/libs/a.ts, lineText: 'if (a > b) {', op: relational, before: '>', after: '>=', occurrence: 1, reason: 'a === b に到達しない'}\n",
        );

        const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

        assertEquals(_result, [_VALID_ENTRY]);
      });

      it('[Normal] T-MUT-AL-02-02: after が空文字列のエントリ 1 件 → after === "" のエントリ 1 件', async () => {
        await _writeAllowlist(
          tempDir,
          "- {file: skills/_cle-libs/libs/a.ts, lineText: 'if (!done) {', op: negation, before: '!', after: '', occurrence: 1, reason: '否定の除去は等価'}\n",
        );

        const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

        assertEquals(_result.map((entry) => entry.after), ['']);
      });

      it('[Normal] T-MUT-AL-02-03: libs.yaml と classify.yaml がある → loadAllowlist("libs") は libs.yaml のエントリ 1 件だけ', async () => {
        await Deno.writeTextFile(join(tempDir, 'libs.yaml'), stringifyYaml([_VALID_ENTRY]));
        await Deno.writeTextFile(
          join(tempDir, 'classify.yaml'),
          stringifyYaml([_makeEntry({ file: 'skills/classify-chatlogs/scripts/b.ts' })]),
        );

        const _result = await loadAllowlist('libs', { allowlistDir: tempDir });

        assertEquals(_result, [_VALID_ENTRY]);
      });
    });
  });

  /**
   * 許容リストとして解釈できない内容 (allowlist R-502 / REQ-F-015)。
   */
  describe('解釈できない内容', () => {
    /** YAML 構文エラーや最上位が列でない文書を置く異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-AL-03-01: 閉じていないフロー列 - [file: a → ChatlogError (解釈できない旨とファイルパス)', async () => {
        await _writeAllowlist(tempDir, '- [file: a\n');

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '解釈できない');
        assertStringIncludes(_error.message, join(tempDir, 'mod.yaml'));
      });

      it('[Error] T-MUT-AL-03-02: 最上位がマッピング file: a.ts → ChatlogError (エントリ検証のメッセージを含まない)', async () => {
        await _writeAllowlist(tempDir, 'file: a.ts\n');

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '列ではない');
        assertEquals(_error.message.includes('件目'), false);
      });

      for (const { id, input, text } of _nullDocumentCases) {
        it(`[Error] ${id}: ${input} → ChatlogError (列ではない旨、エントリ 0 件として受理しない)`, async () => {
          await _writeAllowlist(tempDir, text);

          const _error = await _loadError(tempDir);

          assertStringIncludes(_error.message, '列ではない');
        });
      }

      it('[Error] T-MUT-AL-03-06: mod.yaml という名前のディレクトリ → 例外を投げ [] を返さない', async () => {
        await Deno.mkdir(join(tempDir, 'mod.yaml'));

        await assertRejects(() => loadAllowlist('mod', { allowlistDir: tempDir }));
      });
    });
  });

  /**
   * 理由 (`reason`) を検証する (allowlist R-503 / REQ-F-015 / AC-011)。
   */
  describe('理由の検証', () => {
    /** 理由が欠けている・空のエントリを置く異常ケース。 */
    describe('When: 異常系', () => {
      for (const { id, input, entry, expected } of _reasonErrorCases) {
        it(`[Error] ${id}: ${input} → ChatlogError (${expected})`, async () => {
          await _writeEntries(tempDir, [entry]);

          const _error = await _loadError(tempDir);

          assertStringIncludes(_error.message, expected);
        });
      }
    });
  });

  /**
   * 理由以外の必須属性を検証する (allowlist R-504 / impl §3.4 #2 / #3)。
   */
  describe('理由以外の必須属性の検証', () => {
    /** 型・値域が不正、または欠けている属性を持つエントリを置く異常ケース。 */
    describe('When: 異常系', () => {
      for (const { id, input, entry, expected } of _attributeErrorCases) {
        it(`[Error] ${id}: ${input} → ChatlogError (${expected})`, async () => {
          await _writeEntries(tempDir, [entry]);

          const _error = await _loadError(tempDir);

          assertStringIncludes(_error.message, expected);
        });
      }

      it('[Error] T-MUT-AL-05-11: 1 件目 null (- のみ)・2 件目 正常・3 件目 op: arithmetic → ChatlogError (両方を列挙)', async () => {
        await _writeAllowlist(
          tempDir,
          `-\n${stringifyYaml([_makeEntry({ occurrence: 2 }), _makeEntry({ op: 'arithmetic' })])}`,
        );

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '1 件目: エントリがマッピングでない');
        assertStringIncludes(_error.message, '3 件目: op が MutationOp に無い: arithmetic');
      });

      it('[Error] T-MUT-AL-05-12: スカラーのエントリ - foo 1 件 → ChatlogError (マッピングでない旨のみで属性ごとの不正を含まない)', async () => {
        await _writeAllowlist(tempDir, '- foo\n');

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '1 件目: エントリがマッピングでない');
        assertEquals(_error.message.includes('1 件目: file が無い'), false);
      });

      it('[Error] T-MUT-AL-05-17: after: (値なし = null) のエントリ 1 件 → ChatlogError (after が文字列でない: null)', async () => {
        await _writeAllowlist(
          tempDir,
          "- file: skills/_cle-libs/libs/a.ts\n  lineText: 'if (a > b) {'\n  op: relational\n  before: '>'\n  after:\n  occurrence: 1\n  reason: 'a === b に到達しない'\n",
        );

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '1 件目: after が文字列でない: null');
      });
    });
  });

  /**
   * 照合キーの重複を検出する (allowlist R-504 / impl §3.4 #4 / DD-01)。
   */
  describe('キーの重複', () => {
    /** 照合キーが同一のエントリを 2 件置く異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-AL-06-01: reason だけ異なる 2 エントリ → ChatlogError (1 件目と 2 件目の重複)', async () => {
        await _writeEntries(tempDir, [_makeEntry(), _makeEntry({ reason: '別の理由' })]);

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '2 件目: 照合キーが 1 件目と重複している');
      });

      it('[Error] T-MUT-AL-06-02: lineText が前後の空白だけ異なる 2 エントリ → ChatlogError (1 件目と 2 件目の重複)', async () => {
        await _writeEntries(tempDir, [
          _makeEntry({ lineText: 'return a > b;' }),
          _makeEntry({ lineText: '  return a > b;  ' }),
        ]);

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '2 件目: 照合キーが 1 件目と重複している');
      });
    });
  });

  /**
   * 不正なエントリを一括で報告する (allowlist R-505 / DD-05)。
   */
  describe('不正なエントリの一括報告', () => {
    /** 正しいエントリと不正なエントリが混在する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-AL-07-01: 正しいエントリ 2 件 + reason を欠くエントリ 1 件 → ChatlogError (部分的に返さない)', async () => {
        await _writeEntries(tempDir, [
          _makeEntry(),
          _makeEntry({ occurrence: 2 }),
          _makeEntry({ occurrence: 3 }, 'reason'),
        ]);

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '3 件目: reason が無い');
      });

      it('[Error] T-MUT-AL-07-02: 1 件目 reason 欠落・2 件目 正常・3 件目 op: arithmetic → ChatlogError (両方を列挙)', async () => {
        await _writeEntries(tempDir, [
          _makeEntry({}, 'reason'),
          _makeEntry({ occurrence: 2 }),
          _makeEntry({ op: 'arithmetic' }),
        ]);

        const _error = await _loadError(tempDir);

        assertStringIncludes(_error.message, '1 件目: reason が無い');
        assertStringIncludes(_error.message, '3 件目: op が MutationOp に無い: arithmetic');
      });
    });
  });

  /**
   * エントリを持たない文書はエントリ 0 件として扱う (allowlist R-502 / impl §3.4 #5)。
   */
  describe('エントリを持たない文書', () => {
    /** 内容の無い文書を置くエッジケース。 */
    describe('When: エッジケース', () => {
      for (const { id, input, text } of _emptyDocumentCases) {
        it(`[Edge] ${id}: ${input} → [] を返し例外を投げない`, async () => {
          await _writeAllowlist(tempDir, text);

          const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

          assertEquals(_result, []);
        });
      }
    });
  });

  /**
   * 検証の境界 (allowlist R-504 / DD-03 / impl §3.4 #4)。
   */
  describe('検証の境界', () => {
    /** 値域の下限や照合キーの差分が境界にあるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-AL-09-01: occurrence: 1 (最小値) の正しいエントリ 1 件 → occurrence === 1 のエントリ 1 件', async () => {
        await _writeEntries(tempDir, [_makeEntry({ occurrence: 1 })]);

        const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

        assertEquals(_result.map((entry) => entry.occurrence), [1]);
      });

      it('[Edge] T-MUT-AL-09-02: occurrence: 1 と 2 だけが異なる 2 エントリ → 重複とみなさずエントリ 2 件', async () => {
        await _writeEntries(tempDir, [_makeEntry({ occurrence: 1 }), _makeEntry({ occurrence: 2 })]);

        const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

        assertEquals(_result.map((entry) => entry.occurrence), [1, 2]);
      });

      for (const { id, input, file } of _acceptedFileCases) {
        it(`[Edge] ${id}: ${input} の正しいエントリ 1 件 → 受理し file を保つ`, async () => {
          await _writeEntries(tempDir, [_makeEntry({ file })]);

          const _result = await loadAllowlist('mod', { allowlistDir: tempDir });

          assertEquals(_result.map((entry) => entry.file), [file]);
        });
      }
    });
  });
});

/**
 * `matchAllowlist` のユニットテストスイート。
 *
 * survived の変異体を許容リストと照合し、許容済み・未許容の生存と古いエントリに振り分けることを確認する。
 *
 * テスト ID 範囲: T-MUT-AL-10-01 〜 T-MUT-AL-19-08
 *
 * @see matchAllowlist
 */
describe('matchAllowlist', () => {
  /**
   * 照合キーが一致する survived 変異体 (allowlist R-507 / DR-04 / REQ-F-009)。
   */
  describe('キーが一致する survived 変異体', () => {
    it('[Normal] T-MUT-AL-10-01: survived M + 照合キーがすべて一致する E → allowed に M、unallowed に無い', () => {
      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'survived')], [_BASE_ENTRY]);

      assertEquals(_result.allowed, [_BASE_MUTANT]);
      assertEquals(_result.unallowed.includes(_BASE_MUTANT), false);
    });
  });

  /**
   * 照合キーが一致しない survived 変異体 (allowlist R-508 / DD-01)。
   */
  describe('キーが一致しない survived 変異体', () => {
    it('[Normal] T-MUT-AL-11-01: survived M + エントリ 0 件 → unallowed が [M]、allowed が []', () => {
      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'survived')], []);

      assertEquals(_result.unallowed, [_BASE_MUTANT]);
      assertEquals(_result.allowed, []);
    });

    for (const { id, input, entry } of _keyMismatchCases) {
      it(`[Normal] ${id}: survived M + ${input} E → unallowed に M`, () => {
        const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'survived')], [entry]);

        assertEquals(_result.unallowed, [_BASE_MUTANT]);
      });
    }
  });

  /**
   * 生成されたどの変異体にも一致しないエントリを古いエントリとして抽出する (allowlist R-509 / R-510 / REQ-F-010)。
   */
  describe('古いエントリの抽出', () => {
    it('[Normal] T-MUT-AL-12-01: survived M + killed M2 + lineText: return x; の E → stale に E', () => {
      const _m2 = _makeMutant({
        line: 20,
        column: 7,
        op: 'equality',
        before: '===',
        after: '!==',
        lineText: 'if (x === y) {',
      });
      const _staleEntry = _makeAllowEntry({ lineText: 'return x;' });

      const _result = matchAllowlist(
        [_BASE_MUTANT, _m2],
        [_makeResult(_BASE_MUTANT, 'survived'), _makeResult(_m2, 'killed')],
        [_staleEntry],
      );

      assertEquals(_result.stale, [_staleEntry]);
    });

    it('[Normal] T-MUT-AL-12-02: survived M + 照合キーが一致する E → stale が []', () => {
      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'survived')], [_BASE_ENTRY]);

      assertEquals(_result.stale, []);
    });
  });

  /**
   * survived 以外の判定には許容を適用しない (allowlist R-506 / DR-02)。
   */
  describe('survived 以外の判定', () => {
    for (const { id, status } of _nonSurvivedCases) {
      it(`[Error] ${id}: ${status} の M + 照合キーが一致する E → allowed にも unallowed にも M が無い`, () => {
        const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, status)], [_BASE_ENTRY]);

        assertEquals(_result.allowed, []);
        assertEquals(_result.unallowed, []);
      });
    }
  });

  /**
   * 行番号は照合キーに含めない (allowlist R-507 / DR-04 / REQ-F-009 / AC-010)。
   */
  describe('行番号のずれ', () => {
    it('[Edge] T-MUT-AL-14-01: 10 行目で記録した ?? → || の E + 11 行目に移った survived Mn → allowed に Mn', () => {
      const _shifted = _makeMutant({
        line: 11,
        column: 13,
        op: 'logical',
        before: '??',
        after: '||',
        lineText: 'const v = x ?? y;',
      });
      const _entry = _makeAllowEntry({ lineText: 'const v = x ?? y;', op: 'logical', before: '??', after: '||' });

      const _result = matchAllowlist([_shifted], [_makeResult(_shifted, 'survived')], [_entry]);

      assertEquals(_result.allowed, [_shifted]);
    });
  });

  /**
   * `lineText` は前後の空白だけを除いて照合する (allowlist R-507 / R-509 / DD-01 / §3.1)。
   */
  describe('行テキストの空白と改行コード', () => {
    for (const { id, input, mutant, entry } of _surroundingSpaceCases) {
      it(`[Edge] ${id}: ${input} → allowed に含む`, () => {
        const _result = matchAllowlist([mutant], [_makeResult(mutant, 'survived')], [entry]);

        assertEquals(_result.allowed, [mutant]);
      });
    }

    describe("内部の空白が 2 文字になった survived Mw ('if (a  > b) {') + E", () => {
      const _innerSpaced = _makeMutant({ lineText: 'if (a  > b) {', column: 8 });
      const _match = () => matchAllowlist([_innerSpaced], [_makeResult(_innerSpaced, 'survived')], [_BASE_ENTRY]);

      it('[Edge] T-MUT-AL-15-03: stale に E', () => {
        assertEquals(_match().stale, [_BASE_ENTRY]);
      });

      it('[Edge] T-MUT-AL-15-04: unallowed に Mw', () => {
        assertEquals(_match().unallowed, [_innerSpaced]);
      });
    });
  });

  /**
   * エントリが指す行・ファイルが無くなったら古いエントリになる (allowlist R-509)。
   */
  describe('当該行・ファイルの消失', () => {
    it("[Edge] T-MUT-AL-16-01: 'if (a > b) {' の変異体が無く 'while (i < n) {' の Mo だけ + E → stale に E", () => {
      const _other = _makeMutant({ line: 12, column: 10, before: '<', after: '<=', lineText: 'while (i < n) {' });

      const _result = matchAllowlist([_other], [_makeResult(_other, 'survived')], [_BASE_ENTRY]);

      assertEquals(_result.stale, [_BASE_ENTRY]);
    });

    it('[Edge] T-MUT-AL-16-02: skills/a/new.ts に改名された survived M + file: skills/a/old.ts の E → stale に E', () => {
      const _renamed = _makeMutant({ file: 'skills/a/new.ts' });
      const _oldEntry = _makeAllowEntry({ file: 'skills/a/old.ts' });

      const _result = matchAllowlist([_renamed], [_makeResult(_renamed, 'survived')], [_oldEntry]);

      assertEquals(_result.stale, [_oldEntry]);
    });
  });

  /**
   * 行内の出現順で同じ字句の箇所を区別する (allowlist R-507 / R-509 / DD-03)。
   */
  describe('行内の出現順', () => {
    it("[Edge] T-MUT-AL-17-01: 'if (a < b && c < d) {' の < → <= 2 箇所 (col 7 / 16) + occurrence 1 / 2 の E → 両方 allowed、stale が []", () => {
      const _lineText = 'if (a < b && c < d) {';
      const _first = _makeMutant({ column: 7, before: '<', after: '<=', lineText: _lineText });
      const _second = _makeMutant({ column: 16, before: '<', after: '<=', lineText: _lineText });
      const _entries = [1, 2].map((occurrence) =>
        _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence })
      );

      const _result = matchAllowlist(
        [_first, _second],
        [_makeResult(_first, 'survived'), _makeResult(_second, 'survived')],
        _entries,
      );

      assertEquals(_result.allowed, [_first, _second]);
      assertEquals(_result.stale, []);
    });

    it("[Edge] T-MUT-AL-17-02: 'if (a < b) {' の < → <= 1 箇所 + occurrence 2 の E → stale に E", () => {
      const _lineText = 'if (a < b) {';
      const _only = _makeMutant({ column: 7, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 2 });

      const _result = matchAllowlist([_only], [_makeResult(_only, 'survived')], [_entry]);

      assertEquals(_result.stale, [_entry]);
    });

    it("[Edge] T-MUT-AL-17-03: 'if (a < b) {' の同じ < に < → <= と < → >= + after: >= occurrence 1 の E → allowed は >= のみ、<= は unallowed", () => {
      const _lineText = 'if (a < b) {';
      const _toLe = _makeMutant({ column: 7, before: '<', after: '<=', lineText: _lineText });
      const _toGe = _makeMutant({ column: 7, before: '<', after: '>=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '>=', occurrence: 1 });

      const _result = matchAllowlist(
        [_toLe, _toGe],
        [_makeResult(_toLe, 'survived'), _makeResult(_toGe, 'survived')],
        [_entry],
      );

      assertEquals(_result.allowed, [_toGe]);
      assertEquals(_result.unallowed, [_toLe]);
    });

    it("[Edge] T-MUT-AL-17-04: 'if (a <= b && c < d) {' の <= → < (col 7) と survived の < → <= (col 17) + before: < occurrence 1 の E → allowed に < → <=", () => {
      const _lineText = 'if (a <= b && c < d) {';
      const _lessEqual = _makeMutant({ column: 7, before: '<=', after: '<', lineText: _lineText });
      const _less = _makeMutant({ column: 17, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 1 });

      const _result = matchAllowlist([_lessEqual, _less], [_makeResult(_less, 'survived')], [_entry]);

      assertEquals(_result.allowed, [_less]);
    });

    it('[Edge] T-MUT-AL-17-05: 別ファイルの同じ行番号・同じ < (col 7) + 対象の survived < → <= (col 16) + occurrence 1 の E → 対象が allowed', () => {
      const _lineText = 'if (a < b && c < d) {';
      const _otherFile = _makeMutant({
        file: 'skills/a/bar.ts',
        column: 7,
        before: '<',
        after: '<=',
        lineText: _lineText,
      });
      const _target = _makeMutant({ column: 16, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 1 });

      const _result = matchAllowlist(
        [_otherFile, _target],
        [_makeResult(_otherFile, 'killed'), _makeResult(_target, 'survived')],
        [_entry],
      );

      assertEquals(_result.allowed, [_target]);
    });

    it('[Edge] T-MUT-AL-17-06: 同じファイルの別の行の同じ < (col 7) + 対象の survived < → <= (col 16) + occurrence 1 の E → 対象が allowed', () => {
      const _lineText = 'if (a < b && c < d) {';
      const _otherLine = _makeMutant({ line: 11, column: 7, before: '<', after: '<=', lineText: _lineText });
      const _target = _makeMutant({ column: 16, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 1 });

      const _result = matchAllowlist(
        [_otherLine, _target],
        [_makeResult(_otherLine, 'killed'), _makeResult(_target, 'survived')],
        [_entry],
      );

      assertEquals(_result.allowed, [_target]);
    });

    it("[Edge] T-MUT-AL-17-07: 'if (a < b && c < d) {' の survived < → <= 2 箇所 (col 7 / 16) + occurrence 2 の E だけ → allowed が [col 16]、unallowed が [col 7]", () => {
      const _lineText = 'if (a < b && c < d) {';
      const _first = _makeMutant({ column: 7, before: '<', after: '<=', lineText: _lineText });
      const _second = _makeMutant({ column: 16, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 2 });

      const _result = matchAllowlist(
        [_first, _second],
        [_makeResult(_first, 'survived'), _makeResult(_second, 'survived')],
        [_entry],
      );

      assertEquals(_result.allowed, [_second]);
      assertEquals(_result.unallowed, [_first]);
    });

    it('[Edge] T-MUT-AL-17-08: col 7 の < に < → <= と < → >= + col 16 の survived < → <= + occurrence 2 の E → col 16 が allowed', () => {
      const _lineText = 'if (a < b && c < d) {';
      const _firstToLe = _makeMutant({ column: 7, before: '<', after: '<=', lineText: _lineText });
      const _firstToGe = _makeMutant({ column: 7, before: '<', after: '>=', lineText: _lineText });
      const _second = _makeMutant({ column: 16, before: '<', after: '<=', lineText: _lineText });
      const _entry = _makeAllowEntry({ lineText: _lineText, before: '<', after: '<=', occurrence: 2 });

      const _result = matchAllowlist(
        [_firstToLe, _firstToGe, _second],
        [_makeResult(_firstToLe, 'killed'), _makeResult(_firstToGe, 'killed'), _makeResult(_second, 'survived')],
        [_entry],
      );

      assertEquals(_result.allowed, [_second]);
    });
  });

  /**
   * 一致の多重性と判定の種類 (allowlist R-507 / R-509 / DD-02 / DD-06)。
   */
  describe('一致の多重性と判定の種類', () => {
    it('[Edge] T-MUT-AL-18-01: 同じテキストの 3 行目と 9 行目の survived M + E 1 件 → allowed に両方 (既知の弱点)', () => {
      const _line3 = _makeMutant({ line: 3 });
      const _line9 = _makeMutant({ line: 9 });

      const _result = matchAllowlist(
        [_line3, _line9],
        [_makeResult(_line3, 'survived'), _makeResult(_line9, 'survived')],
        [_BASE_ENTRY],
      );

      assertEquals(_result.allowed, [_line3, _line9]);
    });

    it('[Edge] T-MUT-AL-18-02: killed の M + 照合キーが一致する E のみ → stale が []', () => {
      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'killed')], [_BASE_ENTRY]);

      assertEquals(_result.stale, []);
    });

    it('[Edge] T-MUT-AL-18-03: survived M + reason だけ異なる E 2 件 → allowed は M の 1 件だけ', () => {
      const _entries = [_makeAllowEntry({ reason: '理由A' }), _makeAllowEntry({ reason: '理由B' })];

      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_BASE_MUTANT, 'survived')], _entries);

      assertEquals(_result.allowed, [_BASE_MUTANT]);
    });
  });

  /**
   * 変異体・判定・エントリの集合の境界 (allowlist R-507〜R-509 / DD-06)。
   */
  describe('集合の境界', () => {
    it('[Edge] T-MUT-AL-19-01: 変異体 0 件 + E と lineText: return x; の E → stale に 2 件すべて、allowed / unallowed が []', () => {
      const _entries = [_BASE_ENTRY, _makeAllowEntry({ lineText: 'return x;' })];

      const _result = matchAllowlist([], [], _entries);

      assertEquals(_result, { allowed: [], unallowed: [], stale: _entries });
    });

    it("[Edge] T-MUT-AL-19-02: survived M と 'if (c > d) {' の survived M3 + それぞれに一致する E / E3 → unallowed が []、allowed が 2 件", () => {
      const _m3 = _makeMutant({ line: 30, lineText: 'if (c > d) {' });
      const _e3 = _makeAllowEntry({ lineText: 'if (c > d) {' });

      const _result = matchAllowlist(
        [_BASE_MUTANT, _m3],
        [_makeResult(_BASE_MUTANT, 'survived'), _makeResult(_m3, 'survived')],
        [_BASE_ENTRY, _e3],
      );

      assertEquals(_result.unallowed, []);
      assertEquals(_result.allowed, [_BASE_MUTANT, _m3]);
    });

    it('[Edge] T-MUT-AL-19-03: 生成 3 件 (P1〜P3)・中断で判定は killed の P1 だけ + P3 に一致する E3 → stale に E3 を含まない', () => {
      const [_p1, _p2, _p3] = ['if (a > b) {', 'if (b > c) {', 'if (c > d) {'].map((lineText, index) =>
        _makeMutant({ line: (index + 1) * 10, lineText })
      );
      const _e3 = _makeAllowEntry({ lineText: 'if (c > d) {' });

      const _result = matchAllowlist([_p1, _p2, _p3], [_makeResult(_p1, 'killed')], [_e3]);

      assertEquals(_result.stale, []);
    });

    it('[Error] T-MUT-AL-19-04: 生成は M だけ + 判定に M と生成されていない Mx の survived → ChatlogError', () => {
      const _unknown = _makeMutant({ line: 99 });

      assertThrows(
        () =>
          matchAllowlist(
            [_BASE_MUTANT],
            [_makeResult(_BASE_MUTANT, 'survived'), _makeResult(_unknown, 'survived')],
            [_BASE_ENTRY],
          ),
        ChatlogError,
      );
    });

    it('[Error] T-MUT-AL-19-05: 生成は M だけ + 判定に生成されていない Mx の killed → ChatlogError', () => {
      const _unknown = _makeMutant({ line: 99 });

      assertThrows(
        () => matchAllowlist([_BASE_MUTANT], [_makeResult(_unknown, 'killed')], [_BASE_ENTRY]),
        ChatlogError,
      );
    });

    it('[Edge] T-MUT-AL-19-06: 生成 M + M の全属性を写した別オブジェクトの survived 判定 + E → 例外なし、allowed に含まれる', () => {
      const _copy: Mutant = { ..._BASE_MUTANT };

      const _result = matchAllowlist([_BASE_MUTANT], [_makeResult(_copy, 'survived')], [_BASE_ENTRY]);

      assertEquals(_result.allowed, [_copy]);
    });

    it('[Error] T-MUT-AL-19-07: 生成は M だけ + 判定に M の line だけを 1 増やした変異体の survived → ChatlogError', () => {
      const _shifted = _makeMutant({ line: _BASE_MUTANT.line + 1 });

      assertThrows(
        () => matchAllowlist([_BASE_MUTANT], [_makeResult(_shifted, 'survived')], [_BASE_ENTRY]),
        ChatlogError,
      );
    });

    it('[Error] T-MUT-AL-19-08: 生成は M だけ + 判定に M の column だけを 1 増やした変異体の survived → ChatlogError', () => {
      const _shifted = _makeMutant({ column: _BASE_MUTANT.column + 1 });

      assertThrows(
        () => matchAllowlist([_BASE_MUTANT], [_makeResult(_shifted, 'survived')], [_BASE_ENTRY]),
        ChatlogError,
      );
    });
  });
});
