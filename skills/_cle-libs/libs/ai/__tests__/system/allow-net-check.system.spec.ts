// src: skills/_cle-libs/libs/ai/__tests__/system/allow-net-check.system.spec.ts
// @(#): --allow-net 付与範囲の静的検査（実ファイル）のシステムテスト
//       対象: enumerateTargetLines / checkAllowNet
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertObjectMatch } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { checkAllowNet, enumerateTargetLines, extractDenoRunFlags } from '../helpers/allow-net-check.ts';
// types
import type { AllowNetExpectation, TargetLine } from '../helpers/allow-net-check.ts';

// ─── Helpers
// libs
import { fromFileUrl } from '@std/path';
import { getFilename, joinPath, normalizePath } from '../../../path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
/**
 * リポジトリルートの絶対パス。
 * `fromFileUrl` でパーセントエンコード（空白・非 ASCII）をデコードしてから正規化する。
 */
const _REPO_ROOT = normalizePath(fromFileUrl(new URL('../../../../../../', import.meta.url)));

/** shebang 行を持たないスクリプトのスキル名。 */
const _NO_SHEBANG_SKILL = 'normalize-chatlogs';

/** shebang 行を持つスクリプトのスキル名（shebang 列挙が機能していることの対照）。 */
const _SHEBANG_SKILL = 'classify-chatlogs';

/** `normalize-chatlogs/SKILL.md` 75 行目の実行行。 */
const _NORMALIZE_RUN_LINE =
  'deno run --config ./deno.json --allow-read --allow-write --allow-env --allow-run --allow-net "$SCRIPT_PATH" {変換後の引数}';

/** shebang 行を持たないスクリプトの検査対象が SKILL.md 実行行のみであることを確認するエッジケースの Test ID。 */
const _NO_SHEBANG_ID = 'T-LIB-AI-NET-07-01';

/** SKILL.md の実行行がすべて期待表どおりに `--allow-net` を付与されていることを確認する正常系の Test ID。 */
const _SKILL_MD_ID = 'T-LIB-AI-NET-01-01';

/** `deno.json` の `test:module` タスク定義が `--allow-net` を含むことを確認する正常系の Test ID。 */
const _TEST_MODULE_ID = 'T-LIB-AI-NET-02-01';

/** AI エントリスクリプトの shebang 行が期待表どおりに `--allow-net` を付与されていることを確認する正常系の Test ID。 */
const _SHEBANG_ID = 'T-LIB-AI-NET-03-01';

/** 検査対象のタスク名（`deno.json` の `tasks` キー）。 */
const _TEST_MODULE_TASK = 'test:module';

/** スクリプト引数を持たない行（説明文中の `deno run`）の分類キー。 */
const _NO_SCRIPT = '-';

// types
/** 期待表。キーは分類キー、値は期待判定と実ファイル上の行数。 */
type _ExpectationTable = ReadonlyMap<string, { readonly expectation: AllowNetExpectation; readonly count: number }>;

/** 分類キーを付けた検査対象行。 */
type _ClassifiedLine = { readonly key: string; readonly filePath: string; readonly line: string };

/** 期待表との照合結果。未分類キー・キーごとの行数・不適合行。 */
type _TableReport = {
  readonly unclassified: readonly string[];
  readonly counts: Record<string, number>;
  readonly violations: readonly string[];
};

// constants
/**
 * SKILL.md 実行行の期待表。キーは `<スキル名> <スクリプト変数>`、値は期待判定と実ファイル上の行数。
 * AI を呼ぶ経路は `required`、AI を呼ばない経路（AC-011）は `forbidden`。
 */
const _skillMdCases: _ExpectationTable = new Map([
  ['classify-chatlogs $SCRIPT_PATH', { expectation: 'required', count: 1 }],
  ['filter-chatlogs $SCRIPT_PATH', { expectation: 'required', count: 1 }],
  ['normalize-chatlogs $SCRIPT_PATH', { expectation: 'required', count: 1 }],
  ['set-frontmatter $SCRIPT_PATH', { expectation: 'required', count: 2 }],
  ['export-chatlogs $SCRIPT_PATH', { expectation: 'forbidden', count: 1 }],
  ['filter-chatlogs $NOISE_FILTER_PATH', { expectation: 'forbidden', count: 5 }],
  ['filter-chatlogs $STRIP_PATH', { expectation: 'forbidden', count: 3 }],
  [`setup-chatlogs ${_NO_SCRIPT}`, { expectation: 'forbidden', count: 1 }],
]);

/**
 * shebang 行の期待表。キーは `<スキル名> <スクリプトファイル名>`、値は期待判定と実ファイル上の行数。
 * AI を呼ぶエントリスクリプトは `required`、AI を呼ばないスクリプト（AC-011）は `forbidden`。
 */
const _shebangCases: _ExpectationTable = new Map([
  ['classify-chatlogs classify-chatlogs.ts', { expectation: 'required', count: 1 }],
  ['filter-chatlogs filter-chatlogs.ts', { expectation: 'required', count: 1 }],
  ['set-frontmatter set-frontmatter.ts', { expectation: 'required', count: 1 }],
  ['export-chatlogs export-chatlogs.ts', { expectation: 'forbidden', count: 1 }],
  ['filter-chatlogs noise-filter-chatlogs.ts', { expectation: 'forbidden', count: 1 }],
  ['filter-chatlogs strip-chatlogs.ts', { expectation: 'forbidden', count: 1 }],
]);

/** 列挙される shebang 行の総数（1 本でも列挙から漏れたら失敗させる）。 */
const _SHEBANG_TOTAL = 6;

// functions
/**
 * SKILL.md 実行行を期待表の分類キー（`<スキル名> <スクリプト変数>`）に変換する。
 *
 * @param entry - `enumerateTargetLines` の列挙結果
 * @returns 分類キー。スクリプト変数が無い行は `<スキル名> -`
 */
const _skillMdKey = (entry: TargetLine): string =>
  `${entry.skill} ${/"(\$[A-Z_]+)"/.exec(entry.line)?.[1] ?? _NO_SCRIPT}`;

/**
 * shebang 行を期待表の分類キー（`<スキル名> <スクリプトファイル名>`）に変換する。
 *
 * @param entry - `enumerateTargetLines` の列挙結果
 * @returns 分類キー
 */
const _shebangKey = (entry: TargetLine): string => `${entry.skill} ${getFilename(entry.filePath)}`;

/**
 * 検査対象行を期待表と照合する。
 *
 * @param classified - 分類キーを付けた検査対象行
 * @param table - 期待表
 * @returns 未分類キー・期待表の各キーの実行数・期待判定に不適合な行
 */
const _checkTable = (classified: readonly _ClassifiedLine[], table: _ExpectationTable): _TableReport => ({
  unclassified: classified.map(({ key }) => key).filter((key) => !table.has(key)),
  counts: Object.fromEntries([...table.keys()].map((key) => [key, classified.filter((c) => c.key === key).length])),
  violations: classified
    .filter(({ key, line }) => {
      const _result = checkAllowNet(line, table.get(key)?.expectation ?? 'forbidden');
      return _result.excluded || !_result.conforming;
    })
    .map(({ key, filePath, line }) => `${key} (${filePath}): ${line}`),
});

/**
 * 期待表に完全に適合したときの照合結果を返す。
 *
 * @param table - 期待表
 * @returns 未分類キー・不適合行が空で、行数が期待表どおりの照合結果
 */
const _conformingReport = (table: _ExpectationTable): _TableReport => ({
  unclassified: [],
  counts: Object.fromEntries([...table].map(([key, { count }]) => [key, count])),
  violations: [],
});

/**
 * リポジトリルートの `deno.json` から指定タスクを定義した行を読み出す。
 *
 * 検査関数は行文字列を受け取るため、JSON としてデコードせずテキストのまま渡す。
 *
 * @param taskName - `tasks` のキー
 * @returns タスクを定義した行（見つからなければ空文字列）
 */
const _readDenoTask = async (taskName: string): Promise<string> =>
  (await Deno.readTextFile(joinPath(_REPO_ROOT, 'deno.json')))
    .split(/\r?\n/)
    .find((line) => line.trimStart().startsWith(`"${taskName}":`)) ?? '';

// ─── Tests

/**
 * `--allow-net` 付与範囲の静的検査ヘルパーのシステムテストスイート。
 *
 * リポジトリの実ファイル（`skills/*\/SKILL.md` / `skills/*\/scripts/*.ts`）から検査対象行を列挙して検証する。
 *
 * テスト ID 範囲: T-LIB-AI-NET-01-01, T-LIB-AI-NET-02-01, T-LIB-AI-NET-03-01, T-LIB-AI-NET-07-01
 *
 * @see enumerateTargetLines
 */
describe('allow-net-check', () => {
  /** 実ファイルの実行行が期待表どおりに `--allow-net` を付与されているケース。 */
  describe('When: 正常系', () => {
    it(`[Normal] ${_SKILL_MD_ID}: SKILL.md の実行行は AI 経路のみ --allow-net を含み、全行が期待表で分類される`, async () => {
      const _classified = (await enumerateTargetLines(_REPO_ROOT))
        .filter((entry) => entry.source === 'skill-md' && extractDenoRunFlags(entry.line) !== null)
        .map((entry) => ({ key: _skillMdKey(entry), filePath: entry.filePath, line: entry.line }));

      assertEquals(_checkTable(_classified, _skillMdCases), _conformingReport(_skillMdCases));
    });

    it(`[Normal] ${_SHEBANG_ID}: shebang 行は AI エントリスクリプトのみ --allow-net を含み、全行が期待表で分類される`, async () => {
      const _classified = (await enumerateTargetLines(_REPO_ROOT))
        .filter((entry) => entry.source === 'shebang')
        .map((entry) => ({ key: _shebangKey(entry), filePath: entry.filePath, line: entry.line }));

      assertEquals(_classified.length, _SHEBANG_TOTAL, 'shebang 行の総数');
      assertEquals(_checkTable(_classified, _shebangCases), _conformingReport(_shebangCases));
    });

    it(`[Normal] ${_TEST_MODULE_ID}: deno.json の ${_TEST_MODULE_TASK} タスク定義は --allow-net を含む`, async () => {
      const _task = await _readDenoTask(_TEST_MODULE_TASK);

      assertObjectMatch(checkAllowNet(_task, 'required'), { excluded: false, conforming: true }, _task);
    });
  });

  /** shebang 行の有無など、実ファイル構成に依存する特殊なケース。 */
  describe('When: エッジケース', () => {
    it(`[Edge] ${_NO_SHEBANG_ID}: normalize-chatlogs は SKILL.md の実行行のみが列挙され shebang 由来の行は無い`, async () => {
      const _entries = await enumerateTargetLines(_REPO_ROOT);
      const _normalize = _entries.filter((entry) => entry.skill === _NO_SHEBANG_SKILL);

      assert(_normalize.length > 0, `${_NO_SHEBANG_SKILL}: 列挙結果が空であってはならない`);
      assertEquals(_normalize.filter((entry) => entry.source === 'shebang'), [], 'shebang 由来の行は 0 件');
      assert(_normalize.every((entry) => entry.source === 'skill-md'), 'source はすべて skill-md');
      assert(_normalize.some((entry) => entry.line === _NORMALIZE_RUN_LINE), 'SKILL.md 75 行目の実行行を含む');
      assert(
        _entries.some((entry) => entry.skill === _SHEBANG_SKILL && entry.source === 'shebang'),
        `${_SHEBANG_SKILL}: 対照として shebang 由来の行が列挙される`,
      );
    });
  });
});
