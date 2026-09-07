/**
 * check-test-ids.ts
 * テスト ID の重複検査
 *
 * docs/rules/testing-conventions.md 4-3 の機械検査を実装したもの。
 * ID の書き方は 2 系統あり、両方を抽出して突き合わせないと重複を取りこぼす。
 *
 *   1. `it('T-XX-01: ...')`      — it ラベルに literal で書く
 *   2. `it(\`${tc.id}: ...\`)`   — テーブル駆動で変数展開する（ID は `_cases` / `_TEST_IDS` 側）
 *
 * 系統 2 を含めないと、テーブル駆動テストの ID は 1 件も検査されない。
 */

import { expandGlob } from 'jsr:@std/fs@^1.0.23';

// ── 定数 ────────────────────────────────────────────────────────────────────

/** テスト ID 全体に一致する正規表現（トークン全体で照合する）。 */
const _ID_PATTERN = /^T-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{2}(?:-[0-9]{2})?$/;

/** シングルクォートで囲まれたテスト ID に一致する正規表現。 */
const _QUOTED_ID_PATTERN = /'(T-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{2}(?:-[0-9]{2})?)'/g;

/** ID を構成しうる文字の連なり（`tr -c 'A-Za-z0-9-'` によるトークン分割に相当）。 */
const _TOKEN_PATTERN = /[A-Za-z0-9-]+/g;

// ── 型定義 ──────────────────────────────────────────────────────────────────

/** 走査した spec ファイル 1 件分の情報。 */
export interface SpecSource {
  /** ファイルの絶対パス。 */
  path: string;
  /** ファイルの内容。 */
  source: string;
}

/**
 * ソース中に現れたテスト ID 1 件分の出現情報。
 *
 * `offset` を持つのは、`it('T-XX-01')` のように説明文のないラベルが
 * 2 系統の抽出に同時に乗るためである。位置で重複排除しないと、
 * 割り当て 1 件が 2 件に数えられて誤検出になる。
 */
interface IdOccurrence {
  /** テスト ID。 */
  id: string;
  /** ソース先頭からの文字オフセット。 */
  offset: number;
}

// ── 抽出 ────────────────────────────────────────────────────────────────────

/** `it(` 以降に literal で書かれた ID を、出現位置つきで抽出する（内部実装）。 */
const _literalOccurrences = (source: string): IdOccurrence[] => {
  const _result: IdOccurrence[] = [];
  let _lineStart = 0;
  for (const line of source.split('\n')) {
    const _itIndex = line.indexOf('it(');
    if (_itIndex >= 0) {
      const _slice = line.slice(_itIndex);
      for (const match of _slice.matchAll(_TOKEN_PATTERN)) {
        if (_ID_PATTERN.test(match[0])) {
          _result.push({ id: match[0], offset: _lineStart + _itIndex + (match.index ?? 0) });
        }
      }
    }
    _lineStart += line.length + 1;
  }
  return _result;
};

/** テーブル・対応表にシングルクォートで書かれた ID を、出現位置つきで抽出する（内部実装）。 */
const _tableOccurrences = (source: string): IdOccurrence[] =>
  [...source.matchAll(_QUOTED_ID_PATTERN)].map((match) => ({
    id: match[1],
    // クォート 1 文字ぶん進めて ID 自体の位置に揃える（literal 系統と突き合わせるため）
    offset: (match.index ?? 0) + 1,
  }));

/**
 * `it(` 以降に literal で書かれたテスト ID を抽出する。
 *
 * `it(` より前に現れる ID（JSDoc の相互参照・コメント）は割り当てではないため拾わない。
 *
 * @param source - spec ファイルの内容
 * @returns 出現順のテスト ID 配列
 */
export const extractLiteralIds = (source: string): string[] => _literalOccurrences(source).map((o) => o.id);

/**
 * テーブル・対応表にシングルクォートで書かれたテスト ID を抽出する。
 *
 * `_cases` の `id:` や `_TEST_IDS` の値のように、`it` ラベルへ変数展開される系統を担う。
 *
 * @param source - spec ファイルの内容
 * @returns 出現順のテスト ID 配列
 */
export const extractTableIds = (source: string): string[] => _tableOccurrences(source).map((o) => o.id);

// ── 重複判定 ────────────────────────────────────────────────────────────────

/**
 * 複数の spec ソースを横断し、2 回以上割り当てられたテスト ID を返す。
 *
 * 同一ファイル内の重複も数えるため、ファイル単位で一意化してから集計しない。
 *
 * @param sources - spec ファイルの内容の配列
 * @returns 辞書順の重複テスト ID 配列（重複がなければ空配列）
 */
export const findDuplicateIds = (sources: string[]): string[] => {
  const _counts = new Map<string, number>();
  for (const source of sources) {
    // 同じ割り当てが 2 系統に乗った場合に二重計上しないよう、位置で一意化する
    const _unique = new Map<string, string>();
    [..._literalOccurrences(source), ..._tableOccurrences(source)]
      .forEach((o) => _unique.set(`${o.offset}:${o.id}`, o.id));
    for (const id of _unique.values()) {
      _counts.set(id, (_counts.get(id) ?? 0) + 1);
    }
  }
  return [..._counts.entries()].filter(([, count]) => count >= 2).map(([id]) => id).sort();
};

// ── 収集 ────────────────────────────────────────────────────────────────────

/**
 * `rootDir` 以下の `*.spec.ts` をすべて収集する。
 *
 * @param rootDir - 走査の起点ディレクトリ
 * @returns パス順の `SpecSource` 配列
 */
export const collectSpecSources = async (rootDir: string): Promise<SpecSource[]> => {
  const _specs: SpecSource[] = [];
  for await (const entry of expandGlob(`${rootDir}/**/*.spec.ts`)) {
    if (entry.isFile) {
      _specs.push({ path: entry.path, source: await Deno.readTextFile(entry.path) });
    }
  }
  return _specs.sort((a, b) => a.path.localeCompare(b.path));
};
