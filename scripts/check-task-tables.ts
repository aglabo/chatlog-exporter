/**
 * check-task-tables.ts
 * deckrd `tasks.md` の集計表と本文の整合検査
 *
 * `tasks.md` は本文のチェックリスト項目が正であり、冒頭の Task Summary と
 * 末尾の Category Balance はその集計にすぎない。項目を追加しても表を更新し忘れると
 * 表だけが静かに古くなるため、本文から数え直して突き合わせる。
 *
 * `## Task Summary` / `## Category Balance` の節見出しを 1 つも持たない `tasks.md` は
 * 検査対象外として空の報告を返す。見出しが残っていれば、表（ヘッダ行）が壊れていても
 * 検査対象とし、表の欠落として報告する。
 */

import { expandGlob } from 'jsr:@std/fs@^1.0.23';

// ── 定数 ────────────────────────────────────────────────────────────────────

/** タスク見出し（`## T-06: ...`）に一致する正規表現。 */
const _TASK_HEADING_PATTERN = /^## (T-\d+):/;

/** シナリオ見出し（`#### T-06-12: ...`）に一致する正規表現。 */
const _SCENARIO_HEADING_PATTERN = /^#### T-\d+-/;

/** チェックリスト項目（`- [x] **T-06-12-02**: ...`）に一致する正規表現。 */
const _CASE_ITEM_PATTERN = /^- \[.\] \*\*T-\d+-/;

/** 分類見出しのラベルと、`TaskCounts` 上の対応するキー。 */
const _CATEGORY_HEADINGS: readonly (readonly [string, 'normal' | 'error' | 'edge'])[] = [
  ['### [正常]', 'normal'],
  ['### [異常]', 'error'],
  ['### [エッジ', 'edge'],
];

/** 集計表で件数 0 を表す記法。 */
const _EMPTY_CELL = '[N/A]';

/** Task Summary 表の識別に使う列（表の存在を見分けるためだけの列）。 */
const _SUMMARY_KEY_COLUMNS = ['Scenarios'] as const;

/** Category Balance 表の識別に使う列（表の存在を見分けるためだけの列）。 */
const _BALANCE_KEY_COLUMNS = ['Normal', 'Error', 'Edge'] as const;

/** Task Summary 節の見出し。表が壊れていても、この見出しがあれば検査対象とみなす。 */
const _SUMMARY_HEADING = '## Task Summary';

/** Category Balance 節の見出し。表が壊れていても、この見出しがあれば検査対象とみなす。 */
const _BALANCE_HEADING = '## Category Balance';

/** 合計行を示すラベル。 */
const _TOTAL_LABEL = '合計';

// ── 型定義 ──────────────────────────────────────────────────────────────────

/** タスク 1 件ぶんの実測値。 */
export interface TaskCounts {
  /** シナリオ見出し（`#### T-NN-MM`）の数。 */
  scenarios: number;
  /** `### [正常]` 配下のケース数。 */
  normal: number;
  /** `### [異常]` 配下のケース数。 */
  error: number;
  /** `### [エッジケース]` 配下のケース数。 */
  edge: number;
  /** 全分類のケース数の合計。 */
  cases: number;
}

/** 走査した `tasks.md` 1 件分の情報。 */
export interface TaskDoc {
  /** ファイルの絶対パス。 */
  path: string;
  /** ファイルの内容。 */
  source: string;
}

/** 集計表 1 つ分の、列名から値を引ける行の集合。 */
interface ParsedTable {
  /** 行ラベル（`T-06` / `合計`）から、列名と値の対応表へのマップ。 */
  rows: Map<string, Map<string, number>>;
}

// ── 集計 ────────────────────────────────────────────────────────────────────

/**
 * 本文の見出しとチェックリスト項目から、タスクごとの実測値を集計する。
 *
 * 分類は直前の `### [分類]` 見出しで決まるため、タスク内での見出し順序には依存しない。
 *
 * @param source - `tasks.md` の内容
 * @returns タスク ID（`T-06`）から実測値へのマップ
 */
export const countTasks = (source: string): Map<string, TaskCounts> => {
  const _counts = new Map<string, TaskCounts>();
  let _current: TaskCounts | undefined;
  let _category: 'normal' | 'error' | 'edge' | undefined;

  for (const line of source.split('\n')) {
    const _task = _TASK_HEADING_PATTERN.exec(line);
    if (_task) {
      _current = { scenarios: 0, normal: 0, error: 0, edge: 0, cases: 0 };
      _category = undefined;
      _counts.set(_task[1], _current);
      continue;
    }
    if (!_current) { continue; }

    const _heading = _CATEGORY_HEADINGS.find(([prefix]) => line.startsWith(prefix));
    if (_heading) {
      _category = _heading[1];
      continue;
    }
    if (_SCENARIO_HEADING_PATTERN.test(line)) {
      _current.scenarios += 1;
      continue;
    }
    if (_CASE_ITEM_PATTERN.test(line) && _category) {
      _current[_category] += 1;
      _current.cases += 1;
    }
  }

  return _counts;
};

// ── 表の解析 ────────────────────────────────────────────────────────────────

/** Markdown 表の 1 行をセルの配列へ分割する（内部実装）。 */
const _splitRow = (line: string): string[] => line.split('|').slice(1, -1).map((cell) => cell.trim());

/** セルの値を件数として読む。`[N/A]` は 0、数値でなければ `undefined`（内部実装）。 */
const _readCount = (cell: string): number | undefined => {
  const _value = cell.replaceAll('*', '').trim();
  if (_value === _EMPTY_CELL) { return 0; }
  return /^\d+$/.test(_value) ? Number(_value) : undefined;
};

/** 行ラベルのセルから、照合に使うキー（`T-06` / `合計`）を取り出す（内部実装）。 */
const _rowKey = (cell: string): string | undefined => {
  const _label = cell.replaceAll('*', '').trim();
  if (_label.includes(_TOTAL_LABEL)) { return _TOTAL_LABEL; }
  const _match = /^(T-\d+)/.exec(_label);
  return _match?.[1];
};

/**
 * `keyColumns` をすべて含むヘッダを持つ表を 1 つ探し、行ラベルごとの値として返す（内部実装）。
 *
 * `keyColumns` は表を見分けるためだけに使い、値の抽出はヘッダ行にある列すべてを対象にする。
 * `Cases` のようにヘッダの一部の表にしかないローカル列があっても、その列を持たない表を
 * 「表が無い」と誤診しない。`_compareTable` は `expectations` のキーしか読まないため、
 * `Commit` / `Status` / `判定` のような無関係な列が values に混ざっても害はない。
 *
 * 見つからなければ `undefined` を返し、呼び出し元はその表が無いものとして欠落を報告する。
 */
const _parseTable = (lines: string[], keyColumns: readonly string[]): ParsedTable | undefined => {
  const _headerIndex = lines.findIndex((line) => {
    if (!line.startsWith('|')) { return false; }
    const _cells = _splitRow(line);
    return keyColumns.every((column) => _cells.includes(column));
  });
  if (_headerIndex < 0) { return undefined; }

  const _header = _splitRow(lines[_headerIndex]);
  const _rows = new Map<string, Map<string, number>>();

  for (const line of lines.slice(_headerIndex + 1)) {
    if (!line.startsWith('|')) { break; }
    const _cells = _splitRow(line);
    const _key = _rowKey(_cells[0] ?? '');
    if (!_key) { continue; }

    const _values = new Map<string, number>();
    _header.forEach((column, index) => {
      const _value = _readCount(_cells[index] ?? '');
      if (_value !== undefined) { _values.set(column, _value); }
    });
    _rows.set(_key, _values);
  }

  return { rows: _rows };
};

// ── 照合 ────────────────────────────────────────────────────────────────────

/** 表 1 つ分の期待値。列名から、タスク ID をとって件数を返す関数への対応。 */
type Expectations = Readonly<Record<string, (counts: TaskCounts) => number>>;

/** 表 1 つを実測値と照合し、不一致メッセージを返す。表自体が無ければ欠落を 1 件報告する（内部実装）。 */
const _compareTable = (
  label: string,
  table: ParsedTable | undefined,
  counts: Map<string, TaskCounts>,
  expectations: Expectations,
): string[] => {
  if (!table) { return [`${label}: 表がない（実測はタスク ${counts.size} 件）`]; }
  const _columns = Object.keys(expectations);
  const _messages: string[] = [];

  for (const [taskId, actual] of counts) {
    const _row = table.rows.get(taskId);
    if (!_row) {
      _messages.push(
        `${label}: ${taskId} の行がない（実測 ${_columns.map((c) => `${c}=${expectations[c](actual)}`).join(' ')}）`,
      );
      continue;
    }
    for (const column of _columns) {
      const _expected = expectations[column](actual);
      const _declared = _row.get(column);
      if (_declared !== undefined && _declared !== _expected) {
        _messages.push(`${label}: ${taskId} の ${column} が ${_declared} だが実測は ${_expected}`);
      }
    }
  }

  const _total = table.rows.get(_TOTAL_LABEL);
  if (_total) {
    for (const column of _columns) {
      const _expected = [...counts.values()].reduce((sum, c) => sum + expectations[column](c), 0);
      const _declared = _total.get(column);
      if (_declared !== undefined && _declared !== _expected) {
        _messages.push(`${label}: ${_TOTAL_LABEL}の ${column} が ${_declared} だが実測は ${_expected}`);
      }
    }
  }

  return _messages;
};

/**
 * Task Summary と Category Balance を本文の実測値と照合し、不一致を列挙する。
 *
 * 免除条件は「表も無く、`## Task Summary` / `## Category Balance` の節見出しも無い」ときだけ。
 * 見出しはあるが表（ヘッダ行）が壊れている文書は検査対象とし、`_compareTable` が表の欠落を
 * 報告する。節ごと丸ごと削除された文書（見出しも表も無い）は、従来どおり検査対象外として
 * 空配列を返す（意図した境界）。
 *
 * @param source - `tasks.md` の内容
 * @returns 不一致メッセージの配列（不一致がなければ空配列）
 */
export const findTableMismatches = (source: string): string[] => {
  const _lines = source.split('\n');
  const _summary = _parseTable(_lines, _SUMMARY_KEY_COLUMNS);
  const _balance = _parseTable(_lines, _BALANCE_KEY_COLUMNS);
  const _hasHeading = _lines.some((line) => line === _SUMMARY_HEADING || line === _BALANCE_HEADING);
  if (!_summary && !_balance && !_hasHeading) { return []; }

  const _counts = countTasks(source);
  return [
    ..._compareTable('Task Summary', _summary, _counts, {
      Scenarios: (c) => c.scenarios,
      Cases: (c) => c.cases,
    }),
    ..._compareTable('Category Balance', _balance, _counts, {
      Normal: (c) => c.normal,
      Error: (c) => c.error,
      Edge: (c) => c.edge,
      Cases: (c) => c.cases,
    }),
  ];
};

// ── 収集 ────────────────────────────────────────────────────────────────────

/**
 * `rootDir` 以下の deckrd `tasks.md` をすべて収集する。
 *
 * @param rootDir - 走査の起点ディレクトリ（リポジトリルート）
 * @returns パス順の `TaskDoc` 配列
 */
export const collectTaskDocs = async (rootDir: string): Promise<TaskDoc[]> => {
  const _docs: TaskDoc[] = [];
  for await (const entry of expandGlob(`${rootDir}/docs/.deckrd/**/tasks/tasks.md`)) {
    if (entry.isFile) {
      _docs.push({ path: entry.path, source: await Deno.readTextFile(entry.path) });
    }
  }
  return _docs.sort((a, b) => a.path.localeCompare(b.path));
};
