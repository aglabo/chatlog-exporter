// src: scripts/testing/mutation/__tests__/unit/generate-mutants.unit.spec.ts
// @(#): generateMutants のユニットテスト
//       対象: generateMutants
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { generateMutants } from '../../generate-mutants.ts';

// ─── Helpers
// types
import type { Mutant } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 全ケースで `generateMutants` に渡すファイルパス。 */
const _FILE_PATH = 'src/x.ts';

/** 既定で検証する Mutant のキー (位置と置換内容)。 */
const _POSITION_KEYS: readonly (keyof Mutant)[] = ['line', 'column', 'op', 'before', 'after'];

/** 位置と置換内容に加えて `lineText` を検証するケースで使うキー。 */
const _LINE_TEXT_KEYS: readonly (keyof Mutant)[] = [..._POSITION_KEYS, 'lineText'];

/** Mutant の全キー。`file` / `lineText` まで検証するケースで使う。 */
const _ALL_KEYS: readonly (keyof Mutant)[] = ['file', 'line', 'column', 'op', 'before', 'after', 'lineText'];

/** relational 演算子の置換ケース。 */
const _relationalCases: _Case[] = [
  {
    id: 'T-GM-01-01-01',
    title: '`<` を `<=` に置換する',
    input: 'a < b',
    expected: [{ line: 1, column: 3, op: 'relational', before: '<', after: '<=' }],
  },
  {
    id: 'T-GM-01-01-02',
    title: '`<=` を `<` に置換する',
    input: 'a <= b',
    expected: [{ line: 1, column: 3, op: 'relational', before: '<=', after: '<' }],
  },
  {
    id: 'T-GM-01-01-03',
    title: '`>` を `>=` に置換する',
    input: 'a > b',
    expected: [{ line: 1, column: 3, op: 'relational', before: '>', after: '>=' }],
  },
  {
    id: 'T-GM-01-01-04',
    title: '`>=` を `>` に置換する',
    input: 'a >= b',
    expected: [{ line: 1, column: 3, op: 'relational', before: '>=', after: '>' }],
  },
];

/** equality 演算子の置換ケース。 */
const _equalityCases: _Case[] = [
  {
    id: 'T-GM-01-02-01',
    title: '`===` を `!==` に置換する',
    input: 'a === b',
    expected: [{ line: 1, column: 3, op: 'equality', before: '===', after: '!==' }],
  },
  {
    id: 'T-GM-01-02-02',
    title: '`!==` を `===` に置換する (`!` は negation として数えず 1 件のみ)',
    input: 'a !== b',
    expected: [{ line: 1, column: 3, op: 'equality', before: '!==', after: '===' }],
  },
];

/** logical 演算子の置換ケース。 */
const _logicalCases: _Case[] = [
  {
    id: 'T-GM-01-03-01',
    title: '`&&` を `||` に置換する',
    input: 'a && b',
    expected: [{ line: 1, column: 3, op: 'logical', before: '&&', after: '||' }],
  },
  {
    id: 'T-GM-01-03-02',
    title: '`||` を `&&` に置換する',
    input: 'a || b',
    expected: [{ line: 1, column: 3, op: 'logical', before: '||', after: '&&' }],
  },
  {
    id: 'T-GM-01-03-03',
    title: '`??` を `||` に置換する',
    input: 'a ?? b',
    expected: [{ line: 1, column: 3, op: 'logical', before: '??', after: '||' }],
  },
];

/** boolean リテラルの反転ケース。 */
const _booleanCases: _Case[] = [
  {
    id: 'T-GM-01-04-01',
    title: '`true` を `false` に置換する',
    input: 'x = true;',
    expected: [{ line: 1, column: 5, op: 'boolean', before: 'true', after: 'false' }],
  },
  {
    id: 'T-GM-01-04-02',
    title: '`false` を `true` に置換する',
    input: 'x = false;',
    expected: [{ line: 1, column: 5, op: 'boolean', before: 'false', after: 'true' }],
  },
];

/** 数値リテラルを n+1 にするケース。 */
const _numberCases: _Case[] = [
  {
    id: 'T-GM-01-05-01',
    title: '整数 0 を 1 にする',
    input: 'x = 0;',
    expected: [{ line: 1, column: 5, op: 'number', before: '0', after: '1' }],
  },
  {
    id: 'T-GM-01-05-02',
    title: '複数桁の整数 41 を 42 にする',
    input: 'x = 41;',
    expected: [{ line: 1, column: 5, op: 'number', before: '41', after: '42' }],
  },
  {
    id: 'T-GM-01-05-03',
    title: '小数 1.5 を 2.5 にする',
    input: 'x = 1.5;',
    expected: [{ line: 1, column: 5, op: 'number', before: '1.5', after: '2.5' }],
  },
];

/** 単項 `!` の除去ケース。 */
const _negationCases: _Case[] = [
  {
    id: 'T-GM-01-06-01',
    title: '`!ok` の `!` を除去する',
    input: 'if (!ok) {}',
    expected: [{ line: 1, column: 5, op: 'negation', before: '!', after: '' }],
  },
];

/** 位置・ファイル・行テキストの記録ケース。 */
const _locationCases: _Case[] = [
  {
    id: 'T-GM-01-07-01',
    title: '1 行に複数の候補があれば column ごとに 1 件ずつ、column 昇順で返す',
    input: 'a < b && c',
    expected: [
      { line: 1, column: 3, op: 'relational', before: '<', after: '<=' },
      { line: 1, column: 7, op: 'logical', before: '&&', after: '||' },
    ],
  },
  {
    id: 'T-GM-01-07-02',
    title: '2 行目の候補は line: 2 になる',
    input: 'x;\ny = true;',
    expected: [{ line: 2, column: 5, op: 'boolean', before: 'true', after: 'false' }],
  },
  {
    id: 'T-GM-01-07-03',
    title: 'file に filePath、lineText に元の行全体を入れる',
    input: 'a < b',
    expected: [
      { file: 'src/x.ts', line: 1, column: 3, op: 'relational', before: '<', after: '<=', lineText: 'a < b' },
    ],
    keys: _ALL_KEYS,
  },
];

/** コメント内の演算子を対象外にするケース。 */
const _commentCases: _Case[] = [
  { id: 'T-GM-01-08-01', title: '行コメント全体は対象外', input: '// a < b', expected: [] },
  { id: 'T-GM-01-08-02', title: '行末コメントは対象外', input: 'x; // a < b', expected: [] },
  { id: 'T-GM-01-08-03', title: '1 行のブロックコメントは対象外', input: '/* a < b */', expected: [] },
  {
    id: 'T-GM-01-08-04',
    title: 'ブロックコメントの閉じ後のコードは対象 (対照ケース)',
    input: '/* c */ a < b',
    expected: [{ line: 1, column: 11, op: 'relational', before: '<', after: '<=' }],
  },
];

/** 文字列リテラル・テンプレートのテキスト部を対象外にするケース。 */
const _stringCases: _Case[] = [
  { id: 'T-GM-01-09-01', title: 'シングルクォート文字列内は対象外', input: "s = 'a < b';", expected: [] },
  { id: 'T-GM-01-09-02', title: 'ダブルクォート文字列内は対象外', input: 's = "a < b";', expected: [] },
  {
    id: 'T-GM-01-09-03',
    title: "エスケープ `\\'` を含むシングルクォート文字列は閉じ引用符まで対象外",
    input: "s = 'it\\'s < 1';",
    expected: [],
  },
  {
    id: 'T-GM-01-09-04',
    title: 'エスケープ `\\"` を含むダブルクォート文字列は閉じ引用符まで対象外',
    input: 's = "q\\" < 1";',
    expected: [],
  },
  { id: 'T-GM-01-09-05', title: 'テンプレートリテラルのテキスト部は対象外', input: 's = `a < b`;', expected: [] },
  {
    id: 'T-GM-01-09-06',
    title: 'テンプレートリテラルの `${...}` 内は対象 (対照ケース)',
    input: 's = `v${a < b}`;',
    expected: [{ line: 1, column: 11, op: 'relational', before: '<', after: '<=' }],
  },
  {
    id: 'T-GM-01-09-07',
    title: '文字列が閉じた後のコードは対象 (対照ケース)',
    input: "s = 'x' && y;",
    expected: [{ line: 1, column: 9, op: 'logical', before: '&&', after: '||' }],
  },
];

/** 正規表現リテラルを含む行を対象外にするケース。 */
const _regexCases: _Case[] = [
  { id: 'T-GM-01-10-01', title: '正規表現内の `<` を含む行は対象外', input: 'r = /a<b/;', expected: [] },
  {
    id: 'T-GM-01-10-02',
    title: '正規表現を含む行は、正規表現外の候補も含めて行ごと対象外',
    input: 'ok = /^\\d+$/.test(s) && t;',
    expected: [],
  },
  {
    id: 'T-GM-01-10-03',
    title: '除算の `/` は正規表現とみなさない (対照ケース)',
    input: 'x = a / b < c;',
    expected: [{ line: 1, column: 11, op: 'relational', before: '<', after: '<=' }],
  },
];

/** relational ではない `<` `>`、negation ではない `!` を対象外にするケース。 */
const _nonOperatorCases: _Case[] = [
  { id: 'T-GM-01-11-01', title: 'アロー `=>` の `>` は対象外', input: 'f = (x) => x;', expected: [] },
  { id: 'T-GM-01-11-02', title: '右シフト `>>` は対象外', input: 'a >> b', expected: [] },
  { id: 'T-GM-01-11-03', title: '符号なし右シフト `>>>` は対象外', input: 'a >>> b', expected: [] },
  { id: 'T-GM-01-11-04', title: '左シフト `<<` は対象外', input: 'a << b', expected: [] },
  {
    id: 'T-GM-01-11-05',
    title: '`!=` の `!` は negation ではなく、`!=` 自体も置換対象外',
    input: 'a != b',
    expected: [],
  },
];

/** 型位置のジェネリクスを relational 対象外にするケース。 */
const _genericCases: _Case[] = [
  { id: 'T-GM-01-12-01', title: '`Array<string>` は対象外', input: 'let a: Array<string>;', expected: [] },
  { id: 'T-GM-01-12-02', title: '`Promise<void>` は対象外', input: 'p: Promise<void>', expected: [] },
  { id: 'T-GM-01-12-03', title: '`Record<K, V>` は対象外', input: 'r: Record<K, V>', expected: [] },
  {
    id: 'T-GM-01-12-04',
    title: '入れ子ジェネリクスの閉じ `>>` も対象外',
    input: 'm: Map<string, Array<number>>;',
    expected: [],
  },
  {
    id: 'T-GM-01-12-05',
    title: '空白なしの比較 `a<b` はヒューリスティックによりジェネリクス扱いで対象外 (既知の制限を固定)',
    input: 'if (a<b) {}',
    expected: [],
  },
];

/** import 行を対象外にするケース。 */
const _importCases: _Case[] = [
  {
    id: 'T-GM-01-13-01',
    title: '`import` で始まる行は行内の候補ごと対象外',
    input: "import { a } from './x.ts'; const t = true;",
    expected: [],
  },
  {
    id: 'T-GM-01-13-02',
    title: '識別子 `important` で始まる行は import 行ではない (対照ケース)',
    input: 'const important = true;',
    expected: [{ line: 1, column: 19, op: 'boolean', before: 'true', after: 'false' }],
  },
];

/** 境界入力・単語境界・位置の境界のケース。 */
const _edgeCases: _Case[] = [
  { id: 'T-GM-01-14-01', title: '空文字列は空配列', input: '', expected: [] },
  { id: 'T-GM-01-14-02', title: '候補が無いコードは空配列', input: 'const s = name;', expected: [] },
  {
    id: 'T-GM-01-14-03',
    title: 'CRLF 入力でも line/column が正しく、lineText に `\\r` を含まない',
    input: 'x;\r\ny = true;\r\n',
    expected: [{ line: 2, column: 5, op: 'boolean', before: 'true', after: 'false', lineText: 'y = true;' }],
    keys: _LINE_TEXT_KEYS,
  },
  {
    id: 'T-GM-01-14-04',
    title: '`true` を含む識別子 (`trueish`) は boolean 対象外',
    input: 'x = trueish;',
    expected: [],
  },
  { id: 'T-GM-01-14-05', title: '`isTrue` のような識別子は boolean 対象外', input: 'x = isTrue;', expected: [] },
  {
    id: 'T-GM-01-14-06',
    title: '識別子内の数字 (`utf8`, `T01`) は number 対象外',
    input: 'x = utf8 + T01;',
    expected: [],
  },
  {
    id: 'T-GM-01-14-07',
    title: '行頭 (column 1) の候補',
    input: '1;',
    expected: [{ line: 1, column: 1, op: 'number', before: '1', after: '2' }],
  },
  {
    id: 'T-GM-01-14-08',
    title: '桁上がり 9 は 10 になる',
    input: 'x = 9;',
    expected: [{ line: 1, column: 5, op: 'number', before: '9', after: '10' }],
  },
  {
    id: 'T-GM-01-14-09',
    title: 'インデント付き行の column と lineText',
    input: '  return !ok;',
    expected: [{ line: 1, column: 10, op: 'negation', before: '!', after: '', lineText: '  return !ok;' }],
    keys: _LINE_TEXT_KEYS,
  },
  {
    id: 'T-GM-01-14-10',
    title: '文字列内の `//` はコメント開始とみなさない',
    input: "s = '//' && t;",
    expected: [{ line: 1, column: 10, op: 'logical', before: '&&', after: '||' }],
  },
];

/** 複数行にまたがるコメント・テンプレートの状態を引き継ぐケース。 */
const _multilineCases: _Case[] = [
  { id: 'T-GM-01-15-01', title: '複数行ブロックコメント内の行は対象外', input: '/*\na < b\n*/', expected: [] },
  {
    id: 'T-GM-01-15-02',
    title: 'ブロックコメントが閉じた後の同一行は対象',
    input: '/*\n*/ a < b',
    expected: [{ line: 2, column: 6, op: 'relational', before: '<', after: '<=' }],
  },
  {
    id: 'T-GM-01-15-03',
    title: '複数行テンプレートリテラルのテキスト行は対象外',
    input: 's = `\na < b\n`;',
    expected: [],
  },
];

/** TypeScript の後置 `!` (non-null assertion / definite assignment) を negation にしないケース。 */
const _postfixBangCases: _Case[] = [
  {
    id: 'T-GM-01-17-01',
    title: '呼び出し結果の non-null assertion `pop()!` は negation 対象外',
    input: 'const x = arr.pop()!;',
    expected: [],
    op: 'negation',
  },
  {
    id: 'T-GM-01-17-02',
    title: 'definite assignment `y!:` は negation 対象外',
    input: 'let y!: string;',
    expected: [],
    op: 'negation',
  },
  {
    id: 'T-GM-01-17-03',
    title: '識別子直後の non-null assertion `foo!.bar` は negation 対象外',
    input: 'const v = foo!.bar;',
    expected: [],
    op: 'negation',
  },
  {
    id: 'T-GM-01-17-04',
    title: '添字アクセス直後の non-null assertion `a[0]!` は negation 対象外',
    input: 'const w = a[0]!;',
    expected: [],
    op: 'negation',
  },
  {
    id: 'T-GM-01-17-05',
    title: '開き括弧直後の前置 `!` は negation (対照ケース)',
    input: 'if (!ok) return;',
    expected: [{ line: 1, column: 5, op: 'negation', before: '!', after: '' }],
    op: 'negation',
  },
  {
    id: 'T-GM-01-17-06',
    title: '括弧で囲んだ前置 `!` は negation (対照ケース)',
    input: 'const z = (!a);',
    expected: [{ line: 1, column: 12, op: 'negation', before: '!', after: '' }],
    op: 'negation',
  },
];

/** ジェネリクスの型引数の内側を一切変異しないケース。 */
const _genericArgumentCases: _Case[] = [
  {
    id: 'T-GM-01-18-01',
    title: '型引数内の boolean / number リテラル型は対象外',
    input: 'type T = Box<true, 1>;',
    expected: [],
  },
  {
    id: 'T-GM-01-18-02',
    title: '`new` 式の入れ子型引数内の数値リテラル型は対象外',
    input: 'const m = new Map<string, Array<1>>();',
    expected: [],
  },
  {
    id: 'T-GM-01-18-03',
    title: '型引数が閉じた後の比較・数値は対象 (対照ケース)',
    input: 'const a: Array<number> = [], ok = n < 1;',
    expected: [
      { line: 1, column: 37, op: 'relational', before: '<', after: '<=' },
      { line: 1, column: 39, op: 'number', before: '1', after: '2' },
    ],
  },
];

/** 複数行にまたがる型引数のジェネリクス状態を引き継ぐケース。 */
const _multilineGenericCases: _Case[] = [
  {
    id: 'T-GM-01-19-01',
    title: '複数行の型引数を閉じる行頭の `>` は対象外',
    input: 'type M = Map<\n  string,\n  number\n>;',
    expected: [],
  },
  {
    id: 'T-GM-01-19-02',
    title: '複数行の型引数内の boolean リテラル型と閉じ `>` は対象外',
    input: 'type R = Record<\n  K,\n  true\n>;',
    expected: [],
  },
  {
    id: 'T-GM-01-19-03',
    title: '複数行の型引数が閉じた後の行の比較・数値は対象 (対照ケース)',
    input: 'type M = Map<\n  string\n>;\nx = a > 1;',
    expected: [
      { line: 4, column: 7, op: 'relational', before: '>', after: '>=' },
      { line: 4, column: 9, op: 'number', before: '1', after: '2' },
    ],
  },
];

// types
/**
 * テーブル駆動の 1 ケース。`keys` 省略時は `_POSITION_KEYS` を検証する。
 * `op` を指定すると、その op の Mutant だけに絞ってから検証する。
 */
type _Case = {
  id: string;
  title: string;
  input: string;
  expected: Partial<Mutant>[];
  keys?: readonly (keyof Mutant)[];
  op?: Mutant['op'];
};

// functions
/**
 * Mutant 配列を指定キーだけの部分オブジェクト配列に射影する。
 *
 * @param mutants - `generateMutants` の返り値
 * @param keys - 残すキー
 * @returns 指定キーのみを持つ部分 Mutant の配列
 */
const _pick = (mutants: Mutant[], keys: readonly (keyof Mutant)[]): Partial<Mutant>[] =>
  mutants.map((mutant) => Object.fromEntries(keys.map((key) => [key, mutant[key]])) as Partial<Mutant>);

/**
 * ケース配列からテーブル駆動の `it` を生成する。
 *
 * @param prefix - `[Normal]` / `[Error]` / `[Edge]` のいずれか
 * @param cases - 生成するケース
 */
const _runCases = (prefix: string, cases: _Case[]): void => {
  for (const { id, title, input, expected, keys, op } of cases) {
    it(`${prefix} ${id}: ${title} (${JSON.stringify(input)})`, () => {
      const _mutants = generateMutants(input, _FILE_PATH).filter((mutant) => op === undefined || mutant.op === op);
      assertEquals(_pick(_mutants, keys ?? _POSITION_KEYS), expected);
    });
  }
};

// ─── Tests

/**
 * `generateMutants` のユニットテストスイート。
 *
 * ソース文字列を字句走査し、演算子・リテラルを置換した Mutant の一覧を返すことを検証する。
 *
 * テスト ID 範囲: T-GM-01-01-01 〜 T-GM-01-19-03
 *
 * @see generateMutants
 */
describe('generateMutants', () => {
  /** relational 演算子 (`<` `<=` `>` `>=`) を置換した Mutant を生成する。 */
  describe('relational 演算子の置換', () => {
    _runCases('[Normal]', _relationalCases);
  });

  /** equality 演算子 (`===` `!==`) を反転した Mutant を生成する。 */
  describe('equality 演算子の置換', () => {
    _runCases('[Normal]', _equalityCases);
  });

  /** logical 演算子 (`&&` `||` `??`) を置換した Mutant を生成する。 */
  describe('logical 演算子の置換', () => {
    _runCases('[Normal]', _logicalCases);
  });

  /** boolean リテラル (`true` `false`) を反転した Mutant を生成する。 */
  describe('boolean リテラルの反転', () => {
    _runCases('[Normal]', _booleanCases);
  });

  /** 数値リテラルを n+1 にした Mutant を生成する。 */
  describe('数値リテラルの n+1', () => {
    _runCases('[Normal]', _numberCases);
  });

  /** 単項 `!` を除去した Mutant を生成する。 */
  describe('単項 `!` の除去', () => {
    _runCases('[Normal]', _negationCases);
  });

  /** 行・桁・ファイル・行テキストを Mutant に記録する。 */
  describe('位置・ファイル・行テキストの記録', () => {
    _runCases('[Normal]', _locationCases);
  });

  /** コメント内の演算子は Mutant にしない。 */
  describe('コメントの除外', () => {
    _runCases('[Error]', _commentCases);
  });

  /** 文字列リテラル・テンプレートのテキスト部は Mutant にしない。 */
  describe('文字列リテラル・テンプレートの除外', () => {
    _runCases('[Error]', _stringCases);
  });

  /** 正規表現リテラルを含む行は、行ごと Mutant にしない。 */
  describe('正規表現リテラルを含む行の除外', () => {
    _runCases('[Error]', _regexCases);
  });

  /** アロー・シフト演算子の `<` `>` と `!=` の `!` は Mutant にしない。 */
  describe('relational / negation ではない記号の除外', () => {
    _runCases('[Error]', _nonOperatorCases);
  });

  /** 識別子直後の空白なし `<` から対応する `>` までをジェネリクスとみなし、Mutant にしない。 */
  describe('ジェネリクスの除外', () => {
    _runCases('[Error]', _genericCases);
  });

  /** `import` で始まる行は、行ごと Mutant にしない。 */
  describe('import 行の除外', () => {
    _runCases('[Error]', _importCases);
  });

  /** 空入力・CRLF・単語境界・行頭/インデントなどの境界を扱う。 */
  describe('境界入力・単語境界・位置の境界', () => {
    _runCases('[Edge]', _edgeCases);
  });

  /** ブロックコメント・テンプレートリテラルの状態を行をまたいで引き継ぐ。 */
  describe('複数行にまたがる状態の引き継ぎ', () => {
    _runCases('[Edge]', _multilineCases);
  });

  /** TypeScript の後置 `!` は単項否定ではないため Mutant にしない。 */
  describe('後置 `!` (non-null assertion / definite assignment) の除外', () => {
    _runCases('[Error]', _postfixBangCases);
  });

  /** ジェネリクスの型引数の内側は、relational 以外の候補も含めて Mutant にしない。 */
  describe('ジェネリクスの型引数の内側の除外', () => {
    _runCases('[Error]', _genericArgumentCases);
  });

  /** 型引数が複数行にまたがるとき、ジェネリクスの状態を行をまたいで引き継ぐ。 */
  describe('複数行にまたがるジェネリクス状態の引き継ぎ', () => {
    _runCases('[Edge]', _multilineGenericCases);
  });
});
