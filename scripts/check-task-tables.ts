/**
 * check-task-tables.ts
 * deckrd `tasks.md` の集計表と本文の整合検査
 *
 * `tasks.md` は本文のチェックリスト項目が正であり、冒頭の Task Summary と
 * 末尾の Category Balance はその集計にすぎない。項目を追加しても表を更新し忘れると
 * 表だけが静かに古くなるため、本文から数え直して突き合わせる。
 *
 * 集計表は `## Task Summary` / `## Category Balance` の節の中だけを探す。見出しの無い表と、
 * コードフェンス（``` / ~~~ 、字下げ可）内の行は、見出し・表のどちらとしても扱わない。
 *
 * 節見出しを 1 つも持たない `tasks.md` は検査対象外として空の報告を返す。見出しが残っていれば、
 * 節内に表（ヘッダ行）が無くても検査対象とし、表の欠落として報告する。
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

/** Task Summary 節の見出し。表の探索範囲の起点で、表が無くてもこの見出しがあれば検査対象とみなす。 */
const _SUMMARY_HEADING = '## Task Summary';

/** Category Balance 節の見出し。表の探索範囲の起点で、表が無くてもこの見出しがあれば検査対象とみなす。 */
const _BALANCE_HEADING = '## Category Balance';

/** 合計行を示すラベル。 */
const _TOTAL_LABEL = '合計';

/** コードフェンスの区切り行（行頭の空白を除いた後）に一致するパターン。 */
const _FENCE_PATTERN = /^(`{3,}|~{3,})/;

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

/**
 * 集計表 1 つ分の、列名からセル文字列を引ける行の集合。
 *
 * セルは数値に変換せず文字列のまま持つ。非数値・欠落の判定と報告は `_compareTable` が行う。
 */
interface ParsedTable {
  /** ヘッダ行の列名（出現順）。期待列がこの表のローカル列かどうかの判定に使う。 */
  columns: string[];
  /** 行ラベル（`T-06` / `合計`）から、列名と trim 済みセル文字列の対応表へのマップ。行に無いセルはキーを持たない。 */
  rows: Map<string, Map<string, string>>;
}

/**
 * コードフェンスの区切り行とその内側の行を空行に置き換える（内部実装）。
 *
 * 行数を保ったまま、フェンス内の行を見出し・表の行・節の終端のどれとしても扱わないようにする。
 *
 * 行頭の空白（幅は問わない）を除いた行が 3 個以上の `` ` `` または `~` で始まればフェンスを開く。
 * 開始と同じ記号を開始以上の個数並べ、後ろが空白だけの行でのみ閉じるため、
 * 4 連バッククォートのフェンスは内側の 3 連では閉じない。
 * info 文字列付きの行（例: "```js"）や開始と違う記号の行でも閉じない。
 * 閉じ区切りの無いフェンスは文書末尾まで続き、それ以降の行をすべて隠す。
 */
const _maskCodeFences = (lines: string[]): string[] => {
  // 開始区切りの記号列（例: "````"）。フェンス外では undefined
  let _opener: string | undefined;
  return lines.map((line) => {
    const _marker = _FENCE_PATTERN.exec(line.trimStart())?.[1];
    if (_opener === undefined) {
      if (_marker !== undefined) { _opener = _marker; }
      return _marker === undefined ? line : '';
    }
    // 同じ記号を開始以上の個数並べ、後ろが空白だけの行でのみ閉じる
    if (_isFenceClose(line.trim(), _opener)) { _opener = undefined; }
    return '';
  });
};

/** `trimmed` が `opener` のフェンスを閉じる区切り行かを返す（内部実装）。 */
const _isFenceClose = (trimmed: string, opener: string): boolean =>
  trimmed.length >= opener.length && [...trimmed].every((c) => c === opener[0]);

// ── 集計 ────────────────────────────────────────────────────────────────────

/**
 * 本文の見出しとチェックリスト項目から、タスクごとの実測値を集計する。
 *
 * 分類は直前の `### [分類]` 見出しで決まるため、タスク内での見出し順序には依存しない。
 * コードフェンス内の行は `findTableMismatches` と同じく見出し・項目として数えない。
 * 閉じないフェンスより後ろのタスク・項目は、報告なしに集計から外れる。
 *
 * @param source - `tasks.md` の内容
 * @returns タスク ID（`T-06`）から実測値へのマップ
 */
export const countTasks = (source: string): Map<string, TaskCounts> => {
  const _counts = new Map<string, TaskCounts>();
  let _current: TaskCounts | undefined;
  let _category: 'normal' | 'error' | 'edge' | undefined;

  for (const line of _maskCodeFences(source.split('\n'))) {
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

/** `heading` と完全一致する見出しの節本文（次の `## ` 行の手前まで）を返す。見出しが無ければ空配列（内部実装）。 */
const _sectionLines = (lines: string[], heading: string): string[] => {
  const _start = lines.indexOf(heading);
  if (_start < 0) { return []; }
  const _body = lines.slice(_start + 1);
  const _end = _body.findIndex((line) => line.startsWith('## '));
  return _end < 0 ? _body : _body.slice(0, _end);
};

/**
 * `keyColumns` をすべて含むヘッダを持つ表を 1 つ探し、行ラベルごとのセル文字列として返す（内部実装）。
 *
 * `keyColumns` は表を見分けるためだけに使い、セルの抽出はヘッダ行にある列すべてを対象にする。
 * `Cases` のようにヘッダの一部の表にしかないローカル列があっても、その列を持たない表を
 * 「表が無い」と誤診しない。`Commit` / `Status` / `判定` のような期待列以外のセルも保持するが、
 * `_compareTable` は期待列しか読まないため検査されない。
 *
 * セルは trim 済みの文字列のまま格納し、数値として読めるかどうかはここでは判定しない。
 * ヘッダより列の少ない行では、足りない列のキーを作らない（欠落として `_compareTable` が報告する）。
 *
 * 探索範囲は `heading` と完全一致する見出し行の次の行から、次の `## ` 行の手前（無ければ文末）まで。
 * 節より前後にある別の表を集計表として横取りしないため、見出しの無い表は探索しない。
 *
 * 見つからなければ `undefined` を返し、呼び出し元はその表が無いものとして欠落を報告する。
 */
const _parseTable = (
  lines: string[],
  heading: string,
  keyColumns: readonly string[],
): ParsedTable | undefined => {
  const _section = _sectionLines(lines, heading);
  const _headerIndex = _section.findIndex((line) => {
    if (!line.startsWith('|')) { return false; }
    const _cells = _splitRow(line);
    return keyColumns.every((column) => _cells.includes(column));
  });
  if (_headerIndex < 0) { return undefined; }

  const _header = _splitRow(_section[_headerIndex]);
  const _rows = new Map<string, Map<string, string>>();

  for (const line of _section.slice(_headerIndex + 1)) {
    if (!line.startsWith('|')) { break; }
    const _cells = _splitRow(line);
    const _key = _rowKey(_cells[0] ?? '');
    if (!_key) { continue; }

    const _values = new Map(
      _header.flatMap((column, index): [string, string][] => index < _cells.length ? [[column, _cells[index]]] : []),
    );
    _rows.set(_key, _values);
  }

  return { columns: _header, rows: _rows };
};

// ── 照合 ────────────────────────────────────────────────────────────────────

/** 表 1 つ分の期待値。列名から、タスク ID をとって件数を返す関数への対応。 */
type Expectations = Readonly<Record<string, (counts: TaskCounts) => number>>;

/**
 * `heading` と完全一致する見出し行が 2 件以上あれば、その件数を報告する（内部実装）。
 *
 * 照合するのは最初の節だけなので、2 つ目以降の節が黙って無視されないようにする。
 *
 * @param label - メッセージの接頭辞にする表の名前
 * @param lines - コードフェンスをマスク済みの行
 * @param heading - 節見出しの行
 * @returns 重複があれば 1 件、無ければ空配列
 */
const _duplicateHeadings = (label: string, lines: string[], heading: string): string[] => {
  const _count = lines.filter((line) => line === heading).length;
  return _count >= 2 ? [`${label}: 節見出しが ${_count} 件ある`] : [];
};

/**
 * 表 1 つを実測値と照合し、不一致メッセージを返す（内部実装）。
 *
 * - 表自体が無ければ、表の欠落を 1 件だけ報告する
 * - 実測にあるタスクの行が無ければ、行の欠落を報告する
 * - 合計行が無ければ、全タスクの実測の合計を添えて合計行の欠落を報告する
 * - タスク行と合計行の期待列ごとに、セルが無ければ「セルがない」、`_readCount` で読めなければ
 *   「数値として読めない」（trim 後のセル文字列を添える）、読めて値が違えば不一致を報告する
 * - ヘッダに無い期待列は、その表のローカル列ではないためスキップする
 */
const _compareTable = (
  label: string,
  table: ParsedTable | undefined,
  counts: Map<string, TaskCounts>,
  expectations: Expectations,
): string[] => {
  if (!table) { return [`${label}: 表がない（実測はタスク ${counts.size} 件）`]; }
  const _columns = Object.keys(expectations);
  // ヘッダに無い期待列はその表のローカル列ではないため検査しない
  const _checkedColumns = _columns.filter((column) => table.columns.includes(column));
  const _messages: string[] = [];

  /** 行 1 つの期待列を照合する。`subject` はメッセージ上の行の呼び名（`T-01` / `合計の`）。 */
  const _checkRow = (subject: string, row: Map<string, string>, expectedOf: (column: string) => number): void => {
    for (const column of _checkedColumns) {
      const _cell = row.get(column);
      if (_cell === undefined) {
        _messages.push(`${label}: ${subject} ${column} のセルがない`);
        continue;
      }
      const _declared = _readCount(_cell);
      const _expected = expectedOf(column);
      if (_declared === undefined) {
        _messages.push(`${label}: ${subject} ${column} が数値として読めない（"${_cell}"）`);
      } else if (_declared !== _expected) {
        _messages.push(`${label}: ${subject} ${column} が ${_declared} だが実測は ${_expected}`);
      }
    }
  };

  /** 行の欠落を報告する。`subject` はメッセージ上の行の呼び名、`actualOf` は列ごとの実測値（ヘッダにある期待列だけを並べる）。 */
  const _reportMissingRow = (subject: string, actualOf: (column: string) => number): void => {
    _messages.push(
      `${label}: ${subject}行がない（実測 ${_checkedColumns.map((c) => `${c}=${actualOf(c)}`).join(' ')}）`,
    );
  };

  for (const [taskId, actual] of counts) {
    const _row = table.rows.get(taskId);
    if (!_row) {
      _reportMissingRow(`${taskId} の`, (column) => expectations[column](actual));
      continue;
    }
    _checkRow(`${taskId} の`, _row, (column) => expectations[column](actual));
  }

  const _total = table.rows.get(_TOTAL_LABEL);
  const _totalOf = (column: string): number =>
    [...counts.values()].reduce((sum, c) => sum + expectations[column](c), 0);
  if (_total) {
    _checkRow(`${_TOTAL_LABEL}の`, _total, _totalOf);
  } else {
    _reportMissingRow(`${_TOTAL_LABEL}の`, _totalOf);
  }

  return _messages;
};

/**
 * Task Summary と Category Balance を本文の実測値と照合し、不一致を列挙する。
 *
 * 各表は、対応する節見出しの次の行から次の `## ` 行の手前（無ければ文末）までだけを探す。
 * 見出しの無い表は探索しない。コードフェンス内の行は、見出し・表の行・節の終端のどれとしても扱わない。
 *
 * 各行は末尾の空白（CRLF 改行の `\r` を含む）を取り除いてから判定する。そのため
 * `## Task Summary\r` や `## Task Summary ` も節見出しとして扱う。
 *
 * 免除条件は「`## Task Summary` / `## Category Balance` の節見出しが（フェンスの外に）1 つも無い」ときだけ。
 * 見出しはあるが節内に表（ヘッダ行）が無い文書は検査対象とし、`_compareTable` が表の欠落を
 * 報告する。節ごと丸ごと削除された文書は、従来どおり検査対象外として空配列を返す（意図した境界）。
 * 閉じないフェンスが両方の節見出しより前にある文書も、見出しが隠れるため同様に空配列を返す。
 *
 * 表のヘッダにある期待列で、タスク行・合計行のセルが欠落または数値として読めない場合も報告する
 * （`[N/A]` は 0、`**N**` は N として読む）。ヘッダに無い期待列は検査しない。
 *
 * 表（ヘッダ行）はあるが合計行が無い場合は、全タスクの実測の合計を添えて合計行の欠落を 1 件報告する。
 * 表そのものが無い場合は表の欠落だけを報告し、合計行の欠落は重ねて報告しない。
 *
 * フェンスの外に同じ節見出しが 2 件以上ある場合は、件数を添えて重複を 1 件報告し、その表の照合結果より前に並べる。
 * 照合は最初の節だけで行い、2 つ目以降の節は照合しない。
 *
 * @param source - `tasks.md` の内容
 * @returns 不一致メッセージの配列（不一致がなければ空配列）
 */
export const findTableMismatches = (source: string): string[] => {
  const _lines = _maskCodeFences(source.split('\n').map((line) => line.trimEnd()));
  // 表は節見出しの配下でしか見つからないため、見出しが無ければ表も無い
  if (!_lines.some((line) => line === _SUMMARY_HEADING || line === _BALANCE_HEADING)) { return []; }
  const _summary = _parseTable(_lines, _SUMMARY_HEADING, _SUMMARY_KEY_COLUMNS);
  const _balance = _parseTable(_lines, _BALANCE_HEADING, _BALANCE_KEY_COLUMNS);

  const _counts = countTasks(source);
  return [
    ..._duplicateHeadings('Task Summary', _lines, _SUMMARY_HEADING),
    ..._compareTable('Task Summary', _summary, _counts, {
      Scenarios: (c) => c.scenarios,
      Cases: (c) => c.cases,
    }),
    ..._duplicateHeadings('Category Balance', _lines, _BALANCE_HEADING),
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
