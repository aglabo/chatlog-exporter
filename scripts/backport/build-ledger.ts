/**
 * build-ledger.ts
 * closed beads issue を分類・GitHub issue と突合し、バックポート台帳（TSV）を生成する
 *
 * 分類結果は GitHub の集約 issue の振り分け先と、deckrd `decision-records.md` の
 * 配置先の両方を決める。先頭一致だけを記録すると「strip という語をたまたま含む
 * filter の issue」が `filter/strip` に落ちて気づけないため、当たった全モジュールも記録する。
 *
 * 生成した TSV は人手レビューを経てから GitHub への書き込み（取り消し不能）の入力になる。
 * このため `bd` / `gh` の取得に失敗したときは空の台帳を書き出さず、その場で失敗させる。
 */

import { ensureDir } from 'jsr:@std/fs@^1.0.23';
import { dirname } from 'jsr:@std/path@^1.0.0';

// ── 型定義 ──────────────────────────────────────────────────────────────────

/** モジュール判定パターン 1 件。 */
export interface ModulePattern {
  /** モジュール名（deckrd のディレクトリパスと一致させる）。 */
  module: string;
  /** 判定に使う正規表現。 */
  pattern: RegExp;
}

/** モジュール判定の結果。 */
export interface ModuleClassification {
  /** 宣言順で最初に当たったモジュール名。どれにも当たらなければ `'other'`。 */
  module: string;
  /** 当たったモジュール名すべて（宣言順）。1 件も当たらなければ空配列。 */
  hits: string[];
}

// ── 定数 ────────────────────────────────────────────────────────────────────

/** どのパターンにも当たらなかったときのモジュール名。 */
const _OTHER_MODULE = 'other';

/**
 * モジュール判定パターン（宣言順が優先順位）。
 *
 * 並び順そのものが仕様なので、アルファベット順などに並べ替えてはならない。順序の根拠は 3 つ。
 *
 * 1. `repo/tooling` が最優先。lint / CI / 依存更新 / ドキュメントサイト整備は、
 *    本文にスキル名やライブラリ名を含んでいても製品モジュールの issue ではない
 * 2. スキル（`chatlog/*` / `filter/*`）をライブラリ（`libs/*`）より先に置く。
 *    スキル固有の issue はライブラリに触れていてもスキルの issue として扱う。
 *    decision-record の配置先がスキル側になるため（例:「set-frontmatter: AI エラーを
 *    rate limit で中断」は `libs/ai-backend` ではなく `chatlog/set-frontmatter`）
 * 3. 総称的な `filter/filter` は、より具体的な `filter/*` の後に置く
 *
 * `g` フラグは付けない。付けると `lastIndex` が持ち越されて 2 回目以降の判定が壊れる。
 */
export const MODULE_PATTERNS: readonly ModulePattern[] = [
  // リポジトリのツールチェイン（linter / formatter / CI / 依存更新 / ドキュメントサイト）
  {
    module: 'repo/tooling',
    pattern:
      /dprint|textlint|markdownlint|remark|oxlint|cspell|secretlint|lefthook|commitlint|ShellSpec|setup-dev-env|GitHub Actions|Dependabot|CVE-|renovate|\.mdx|\bMDX\b|blume|GitHub Pages|pre-push|editorconfig|deno\.lock|\.gitignore/i,
  },
  // ここから スキル（`chatlog/*` / `filter/*`）。ライブラリより必ず前に置く
  { module: 'chatlog/setup', pattern: /setup-chatlogs/i },
  { module: 'filter/noise-filter', pattern: /noise-?filter|prefilter/i },
  { module: 'filter/strip', pattern: /\bstrip\b/i },
  { module: 'chatlog/set-frontmatter', pattern: /set-?frontmatter|setfm|type\/category/i },
  { module: 'chatlog/classify', pattern: /classify/i },
  { module: 'chatlog/normalize', pattern: /normalize/i },
  { module: 'chatlog/export', pattern: /export-chatlogs?|exportChatGPT|periodToPath/i },
  // 具体的な `filter/*` に当たらなかったフィルタ全般の受け皿
  { module: 'filter/filter', pattern: /\bfilter\b/i },
  // ここから ライブラリ（`_cle-libs/`）。スキル名を含まない issue だけが到達する
  { module: 'libs/ai-backend', pattern: /runAI|ai-backend|llama|rate ?limit|structured-output/i },
  { module: 'libs/cache', pattern: /ChatlogCache/i },
  { module: 'libs/config', pattern: /GlobalConfig|resolveConfigPath|config\.yaml|parseArgs/i },
  { module: 'libs/concurrency', pattern: /withConcurrency|runConcurrent|concurrency/i },
];

// ── モジュール判定 ──────────────────────────────────────────────────────────

/**
 * テキストからモジュールを判定する。
 *
 * @param text - beads issue の title / description などを連結した文字列
 * @returns 先頭一致モジュールと全ヒット
 */
export const classifyModule = (text: string): ModuleClassification => {
  const _hits = MODULE_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.module);
  return { module: _hits[0] ?? _OTHER_MODULE, hits: _hits };
};

/** タイトルと本文を連結して判定するときの区切り。語が隣接してパターンが潰れるのを防ぐ。 */
const _CLASSIFY_JOINER = ' ';

/**
 * beads issue のタイトルと本文からモジュールを判定する。
 *
 * タイトルだけで判定できるならその結果をそのまま返し、`'other'` だったときにだけ
 * 本文を併用する。タイトルは issue の主題を名指すが、本文は波及先や関連モジュールに
 * 言及するだけのことが多く、同列に扱うと主題ではないモジュールへ吸い寄せられるため。
 *
 * 実例: `cle-a5a` のタイトル `fix(ChatlogCache): basename-only cache key ...` の主題は
 * `libs/cache` だが、本文は「その修正で `set-frontmatter.ts` に baseDir を渡す必要がある」
 * という波及先に触れている。連結して判定すると宣言順で先にある `chatlog/set-frontmatter`
 * に落ち、DR が誤ったモジュールの `decision-records.md` に載る。
 *
 * @param title - beads issue のタイトル
 * @param description - beads issue の本文（空文字列可）
 * @returns タイトル優先で決めた先頭一致モジュールと全ヒット
 */
export const classifyIssueModule = (title: string, description: string): ModuleClassification => {
  const _byTitle = classifyModule(title);
  return _byTitle.module === _OTHER_MODULE
    ? classifyModule(`${title}${_CLASSIFY_JOINER}${description}`)
    : _byTitle;
};

// ── GitHub issue 突合 ───────────────────────────────────────────────────────

/** 突合に使う GitHub issue の最小情報。 */
export interface GitHubIssue {
  /** issue 番号。 */
  number: number;
  /** `'OPEN'` または `'CLOSED'`。 */
  state: string;
  /** issue タイトル。 */
  title: string;
}

/** 突合の確度。 */
export type MatchConfidence = 'exact' | 'title-high' | 'title-low' | 'none';

/** 突合の結果。 */
export interface GitHubMatch {
  /** 突合できた issue 番号。できなければ `null`。 */
  ghNumber: number | null;
  /** 確度。 */
  confidence: MatchConfidence;
}

/**
 * GitHub issue タイトル先頭の角括弧タグ（`[Feature]` など）を除去する。
 *
 * @param title - GitHub issue のタイトル
 * @returns タグを除いたタイトル
 */
const _stripTitleTag = (title: string): string => title.replace(/^\[[^\]]*\]\s*/, '');

/** タイトル類似度がこの値以上なら自動採用する。 */
export const TITLE_HIGH_THRESHOLD = 0.8;

/** タイトル類似度がこの値以上なら人手確認に回す。 */
export const TITLE_LOW_THRESHOLD = 0.55;

/**
 * 文字列を正規化して隣接 2 文字（バイグラム）の集合を返す。
 *
 * 小文字化と空白除去により、大文字小文字と空白の差を無視する。
 *
 * @param text - 対象の文字列
 * @returns バイグラム集合。1 文字以下なら空集合
 */
const _bigrams = (text: string): Set<string> => {
  const _chars = [...text.toLowerCase().replace(/\s+/g, '')];
  return new Set(_chars.slice(0, -1).map((char, index) => char + _chars[index + 1]));
};

/**
 * `#NNN` の直前に置かれていたら issue 参照とみなさない語。
 *
 * 実データで誤検出したもの: `cle-dou` の `Dependabot alert #7` は Dependabot の
 * alert 番号であって issue 番号ではないのに、無関係な `#7` に一致した。
 * `PR` / `pull request` も同じ理由で除外する（pull request 番号と issue 番号は別空間）。
 *
 * 誤って `exact` と判定すると、無関係な issue へ取り消し不能なコメントが付く。
 */
const _NON_ISSUE_PREFIX_WORDS: readonly string[] = ['alert', 'PR', 'pull request'];

/** 直前の語を見るために `#` から遡る文字数。除外語の最長（`pull request`）を含められる長さ。 */
const _PREFIX_SCAN_LENGTH = 16;

/**
 * 除外語が参照の直前にあるかを判定する正規表現。
 *
 * `g` フラグは付けない。付けると `lastIndex` が持ち越されて 2 回目以降の判定が壊れる。
 */
const _NON_ISSUE_PREFIX_PATTERN = new RegExp(String.raw`(?:${_NON_ISSUE_PREFIX_WORDS.join('|')})\s*$`, 'i');

/**
 * テキスト中の `#NNN` / `gh-NNN` 参照をすべて番号として抽出する。
 *
 * `#` の直前が単語文字なら参照とみなさない。`cle-947` の受入条件番号 `AC#2` を
 * issue 参照と解釈して実在する `#1` に一致させた誤検出を防ぐ。
 * 加えて、直前の語が `_NON_ISSUE_PREFIX_WORDS` のいずれかなら不採用とする。
 *
 * 正規表現はモジュール定数にしない（`g` フラグの `lastIndex` が持ち越されるため）。
 *
 * @param text - beads の title / description / close_reason / notes を連結した文字列
 * @returns 抽出した issue 番号（重複を含む、記載順）
 */
const _referencedNumbers = (text: string): number[] =>
  [...text.matchAll(/(?<![0-9A-Za-z_])(?:#|gh-)(\d+)/gi)]
    .filter((match) =>
      !_NON_ISSUE_PREFIX_PATTERN.test(text.slice(Math.max(0, match.index - _PREFIX_SCAN_LENGTH), match.index))
    )
    .map((match) => Number(match[1]));

/** issue 番号とその beads タイトルに対する類似度。 */
interface _TitleScore {
  /** GitHub issue 番号。 */
  number: number;
  /** タイトル類似度。 */
  score: number;
}

/**
 * GitHub issue タイトルとの類似度で最も近い issue を選ぶ。
 *
 * 同点の場合は番号の小さい issue を採用し、結果を決定的にする。
 *
 * @param title - beads issue のタイトル
 * @param issues - 突合先の GitHub issue 一覧
 * @returns 閾値に応じた突合結果
 */
const _matchByTitle = (title: string, issues: readonly GitHubIssue[]): GitHubMatch => {
  const _isBetter = (candidate: _TitleScore, best: _TitleScore): boolean =>
    candidate.score > best.score || (candidate.score === best.score && candidate.number < best.number);
  const _best = issues
    .map((issue): _TitleScore => ({
      number: issue.number,
      score: titleSimilarity(_stripTitleTag(issue.title), title),
    }))
    .reduce<_TitleScore | null>(
      (best, candidate) => (best === null || _isBetter(candidate, best) ? candidate : best),
      null,
    );
  if (_best === null || _best.score < TITLE_LOW_THRESHOLD) {
    return { ghNumber: null, confidence: 'none' };
  }
  return {
    ghNumber: _best.number,
    confidence: _best.score >= TITLE_HIGH_THRESHOLD ? 'title-high' : 'title-low',
  };
};

/**
 * 2 つのタイトルの類似度を返す（文字バイグラムの Dice 係数）。
 *
 * @param a - 比較元のタイトル
 * @param b - 比較先のタイトル
 * @returns 0.0〜1.0
 */
export const titleSimilarity = (a: string, b: string): number => {
  const _left = _bigrams(a);
  const _right = _bigrams(b);
  // 1 文字以下の文字列はバイグラムが作れず、Dice 係数が 0 除算になる
  if (_left.size === 0 || _right.size === 0) {
    return 0;
  }
  const _shared = [..._left].filter((gram) => _right.has(gram)).length;
  return (2 * _shared) / (_left.size + _right.size);
};

/** 参照の抽出で `title` と `body` を連結するときの区切り。単語文字が隣接して参照が潰れるのを防ぐ。 */
const _REFERENCE_JOINER = '\n';

/** beads の `external_ref` が指す GitHub issue 番号の形式。 */
const _EXTERNAL_REF_PATTERN = /^gh-(\d+)$/;

/**
 * beads の `external_ref` から実在する GitHub issue 番号を取り出す。
 *
 * 実在チェックを課すのは本文参照の扱い（`_existing`）と揃えるためで、
 * 別リポジトリの番号や削除済みの番号を採用しない。
 *
 * @param externalRef - beads の `external_ref`（例 `gh-185`）
 * @param issues - 突合先の GitHub issue 一覧
 * @returns 採用できる issue 番号、できなければ `null`
 */
const _externalRefNumber = (
  externalRef: string | null | undefined,
  issues: readonly GitHubIssue[],
): number | null => {
  const _matched = _EXTERNAL_REF_PATTERN.exec(externalRef ?? '');
  if (_matched === null) {
    return null;
  }
  const _number = Number(_matched[1]);
  return issues.some((issue) => issue.number === _number) ? _number : null;
};

/**
 * beads issue を GitHub issue に突き合わせる。
 *
 * 参照は `body` だけでなく `title` からも拾う（`cle-50n` のように
 * タイトル `Fix #400 cause 2: ...` にしか参照がない issue があるため）。
 * 「タイトルに参照が書かれうる」のは突合の性質なので、連結はここで行う。
 *
 * 優先順位は引数の並び順と一致しない。最後の `externalRef` が最優先で、
 * 採用できたときは `body` / `title` を見ない。`external_ref` は beads 側で確定済みの
 * 対応付けであり、推定でしかない本文参照・タイトル類似度より確かなため。
 * 採用できない場合のみ、本文参照 → タイトル類似度の順にフォールバックする。
 *
 * @param body - beads の description / close_reason / notes を連結した文字列
 * @param title - beads issue のタイトル
 * @param issues - 突合先の GitHub issue 一覧
 * @param externalRef - beads の `external_ref`（最優先で使う。省略時はフォールバックする）
 * @returns 突合できた issue 番号と確度
 */
export const matchGitHubIssue = (
  body: string,
  title: string,
  issues: readonly GitHubIssue[],
  externalRef?: string | null,
): GitHubMatch => {
  const _external = _externalRefNumber(externalRef, issues);
  if (_external !== null) {
    return { ghNumber: _external, confidence: 'exact' };
  }
  const _references = _referencedNumbers(`${title}${_REFERENCE_JOINER}${body}`);
  const _existing = _references.filter((number) => issues.some((issue) => issue.number === number));
  if (_existing.length > 0) {
    return { ghNumber: Math.min(..._existing), confidence: 'exact' };
  }
  return _matchByTitle(title, issues);
};

// ── DR 候補抽出 ─────────────────────────────────────────────────────────────

/** `issue_type` が DR 候補として無条件に成立する値。 */
const _DECISION_ISSUE_TYPE = 'decision';

/**
 * DR 候補を示すキーワードの正規表現。
 *
 * decision-records に載せる価値があるのは「設計上の判断とその根拠」だけで、
 * 単なる修正ログは載せない。ここに並ぶ語は判断の痕跡を示すものに絞ってある。
 *
 * `g` フラグは付けない。付けると `lastIndex` が持ち越されて 2 回目以降の判定が壊れる。
 */
export const DR_KEYWORD_PATTERN = /決定|判断|採用しない|見送|トレードオフ|方針|DR-/i;

/**
 * closed beads issue が decision-records に載せる価値を持つか判定する。
 *
 * @param issueType - beads の `issue_type`
 * @param text - `close_reason` / `notes` / `design` を連結した文字列
 * @returns DR 候補なら `true`
 */
export const isDrCandidate = (issueType: string, text: string): boolean =>
  issueType === _DECISION_ISSUE_TYPE || DR_KEYWORD_PATTERN.test(text);

// ── 台帳の組み立て ──────────────────────────────────────────────────────────

/** 台帳の組み立てに使う beads issue の情報。 */
export interface BeadsIssue {
  /** beads issue ID（例 `cle-48r`、子なら `cle-48r.1`）。 */
  id: string;
  /** タイトル。 */
  title: string;
  /** 本文。 */
  description?: string | null;
  /** クローズ理由。 */
  close_reason?: string | null;
  /** 補足メモ。 */
  notes?: string | null;
  /** 設計メモ。 */
  design?: string | null;
  /** 対応する GitHub issue への確定済み参照（例 `gh-185`）。 */
  external_ref?: string | null;
  /** 種別（`bug` / `task` / `feature` / `epic` / `chore` / `decision`）。 */
  issue_type: string;
  /** 優先度。 */
  priority: number;
  /** クローズ日時（ISO 8601）。 */
  closed_at: string;
}

/** 台帳の行が指す処理。 */
export type LedgerAction = 'comment' | 'aggregate' | 'rollup';

/** 台帳 1 行。 */
export interface LedgerRow {
  /** beads issue ID。 */
  beadsId: string;
  /** 子 issue なら親 ID、top-level なら空文字列。 */
  parent: string;
  /** beads の `issue_type`。 */
  type: string;
  /** 優先度。 */
  priority: number;
  /** `YYYY-MM-DD`。 */
  closedAt: string;
  /** 先頭一致モジュール名。 */
  module: string;
  /** 当たった全モジュールを `;` で連結したもの。 */
  moduleHits: string;
  /** 突合できた issue 番号の文字列。できなければ空文字列。 */
  ghNumber: string;
  /** 突合の確度。 */
  confidence: MatchConfidence;
  /** この行に対して行う処理。 */
  action: LedgerAction;
  /** `'yes'` または `'no'`。 */
  drCandidate: string;
  /** 実行結果。組み立て時点では空文字列。 */
  result: string;
}

/** `moduleHits` の区切り文字。 */
const _HITS_SEPARATOR = ';';

/** 親 ID と子番号を隔てる文字。 */
const _ID_SEPARATOR = '.';

/** ISO 8601 の日付部分（`YYYY-MM-DD`）の長さ。 */
const _DATE_LENGTH = 10;

/** `drCandidate` に入れる真偽の表現。 */
const _DR_LABEL = { yes: 'yes', no: 'no' } as const;

/** `action` を `'comment'` に昇格させる確度。人手レビュー不要で既存 issue に書き込める確度だけを並べる。 */
const _COMMENT_CONFIDENCES: readonly MatchConfidence[] = ['exact', 'title-high'];

/**
 * `null` / `undefined` を空文字列に畳む。
 *
 * beads の任意フィールドをそのまま連結すると `'null'` という語が本文に混ざるため、
 * 連結の前に必ず通す。
 *
 * @param value - beads の任意フィールド
 * @returns 値、または空文字列
 */
const _text = (value?: string | null): string => value ?? '';

/**
 * beads issue ID から親 ID を取り出す。
 *
 * @param id - beads issue ID
 * @returns 子 issue なら親 ID、top-level なら空文字列
 */
const _parentId = (id: string): string => {
  const _index = id.indexOf(_ID_SEPARATOR);
  return _index < 0 ? '' : id.slice(0, _index);
};

/**
 * 台帳 1 行に対して行う処理を決める。
 *
 * 子 issue は親へ畳むため、確度によらず `'rollup'` とする。
 * `'title-low'` を `'comment'` にしないのは、確度が中程度の突合を無検査で既存 issue への
 * コメントに流すと誤った issue に書き込むためで、昇格は人手レビューに委ねる。
 *
 * @param parent - 親 ID（top-level なら空文字列）
 * @param confidence - 突合の確度
 * @returns 決定した処理
 */
const _decideAction = (parent: string, confidence: MatchConfidence): LedgerAction => {
  if (parent !== '') {
    return 'rollup';
  }
  return _COMMENT_CONFIDENCES.includes(confidence) ? 'comment' : 'aggregate';
};

/**
 * closed beads issue 1 件を台帳 1 行に変換する。
 *
 * @param issue - 変換元の beads issue
 * @param issues - 突合先の GitHub issue 一覧
 * @returns 台帳 1 行
 */
const _toLedgerRow = (issue: BeadsIssue, issues: readonly GitHubIssue[]): LedgerRow => {
  const _classification = classifyIssueModule(issue.title, _text(issue.description));
  const _match = matchGitHubIssue(
    [issue.description, issue.close_reason, issue.notes].map(_text).join(_REFERENCE_JOINER),
    issue.title,
    issues,
    issue.external_ref,
  );
  const _parent = _parentId(issue.id);
  const _isDr = isDrCandidate(
    issue.issue_type,
    [issue.close_reason, issue.notes, issue.design].map(_text).join(_REFERENCE_JOINER),
  );
  return {
    beadsId: issue.id,
    parent: _parent,
    type: issue.issue_type,
    priority: issue.priority,
    closedAt: issue.closed_at.slice(0, _DATE_LENGTH),
    module: _classification.module,
    moduleHits: _classification.hits.join(_HITS_SEPARATOR),
    ghNumber: _match.ghNumber === null ? '' : String(_match.ghNumber),
    confidence: _match.confidence,
    action: _decideAction(_parent, _match.confidence),
    drCandidate: _isDr ? _DR_LABEL.yes : _DR_LABEL.no,
    result: '',
  };
};

/**
 * closed beads issue 一覧を台帳の行に変換する。
 *
 * @param beads - 変換元の closed beads issue 一覧
 * @param issues - 突合先の GitHub issue 一覧
 * @returns 台帳の行（入力と同じ件数・同じ順序）
 */
export const buildLedgerRows = (
  beads: readonly BeadsIssue[],
  issues: readonly GitHubIssue[],
): LedgerRow[] => beads.map((issue) => _toLedgerRow(issue, issues));

// ── TSV 出力 ────────────────────────────────────────────────────────────────

/** TSV の列区切り。 */
const _TSV_DELIMITER = '\t';

/** TSV の行区切り。 */
const _TSV_NEWLINE = '\n';

/** TSV のヘッダ列（この順で出力する）。 */
export const LEDGER_COLUMNS: readonly string[] = [
  'beads_id',
  'parent',
  'type',
  'priority',
  'closed_at',
  'module',
  'module_hits',
  'gh_number',
  'confidence',
  'action',
  'dr_candidate',
  'result',
];

/** TSV の列・行を壊す文字を置き換える文字。 */
const _CELL_REPLACEMENT = ' ';

/**
 * TSV の列・行を壊す文字（タブ / CR / LF）を空白に置換する。
 *
 * beads の description は複数行を含むため、置換しないと列や行がずれて台帳が壊れる。
 * 1 文字ずつ置換し、`\r\n` を 1 個の空白に畳まない。
 *
 * @param value - セルの値
 * @returns 区切り文字を含まない値
 */
const _sanitizeCell = (value: string): string => value.replace(/[\t\r\n]/g, _CELL_REPLACEMENT);

/**
 * 台帳 1 行を `LEDGER_COLUMNS` と同じ順のセル配列にする。
 *
 * @param row - 台帳 1 行
 * @returns 区切り文字を除去済みのセルの文字列配列
 */
const _toCells = (row: LedgerRow): string[] =>
  [
    row.beadsId,
    row.parent,
    row.type,
    String(row.priority),
    row.closedAt,
    row.module,
    row.moduleHits,
    row.ghNumber,
    row.confidence,
    row.action,
    row.drCandidate,
    row.result,
  ].map(_sanitizeCell);

/**
 * 台帳を TSV 文字列に変換する。
 *
 * @param rows - 台帳の行
 * @returns ヘッダ付きの TSV（末尾は改行で終わる）
 */
export const toTsv = (rows: readonly LedgerRow[]): string =>
  [LEDGER_COLUMNS, ...rows.map(_toCells)]
    .map((cells) => `${cells.join(_TSV_DELIMITER)}${_TSV_NEWLINE}`)
    .join('');

// ── CLI エントリポイント ────────────────────────────────────────────────────

/**
 * 外部コマンドを実行し、stdout を文字列で返す関数型。
 *
 * `Deno.Command` を直接呼ぶとテストから差し替えられないため、関数型の依存として切り出す。
 */
export type CommandProvider = (cmd: string, args: readonly string[]) => Promise<string>;

/** 台帳の入力一式。 */
export interface LedgerInputs {
  /** closed の beads issue。 */
  beads: BeadsIssue[];
  /** 突合先の GitHub issue。 */
  issues: GitHubIssue[];
}

/** 台帳の出力先（リポジトリルートからの相対パス）。`docs/.deckrd/temp/` は git 管理外。 */
export const LEDGER_PATH: string = 'docs/.deckrd/temp/backport-ledger.tsv';

/** `bd` に渡す引数。closed だけを JSON で取得する。 */
export const BD_ARGS: readonly string[] = ['list', '--status', 'closed', '--limit', '500', '--json'];

/** `gh` に渡す引数。closed 済みの issue も突合先になるため `--state all` で取得する。 */
export const GH_ARGS: readonly string[] = [
  'issue',
  'list',
  '--state',
  'all',
  '--limit',
  '500',
  '--json',
  'number,title,state',
];

/** `Deno.Command` の出力をデコードする UTF-8 デコーダ。 */
const _decoder = new TextDecoder();

/**
 * 既定の `CommandProvider`。`Deno.Command` で実行し stdout を返す。
 *
 * 終了コードが 0 でなければ stderr を含むメッセージで例外を投げる。
 *
 * @param cmd - 実行するコマンド名
 * @param args - コマンドに渡す引数
 * @returns stdout を UTF-8 でデコードした文字列
 */
export const runCommand: CommandProvider = async (cmd, args) => {
  const _process = new Deno.Command(cmd, { args: [...args] });
  const _output = await _process.output();
  if (!_output.success) {
    throw new Error(`${cmd} が終了コード ${_output.code} で失敗した: ${_decoder.decode(_output.stderr)}`);
  }
  return _decoder.decode(_output.stdout);
};

/**
 * `bd` と `gh` を実行して台帳の入力を集める。
 *
 * 2 つのコマンドは互いに独立なので `Promise.all` で並列に実行する。
 * 失敗や不正な JSON はそのまま送出する。空配列にフォールバックすると
 * 「対象 0 件」と「取得に失敗した」を区別できなくなるため（fail-first）。
 *
 * @param run - コマンド実行の依存
 * @returns closed の beads issue と突合先の GitHub issue
 */
export const collectLedgerInputs = async (run: CommandProvider): Promise<LedgerInputs> => {
  const [_bdRaw, _ghRaw] = await Promise.all([run('bd', BD_ARGS), run('gh', GH_ARGS)]);
  const _beads = JSON.parse(_bdRaw) as BeadsIssue[];
  const _issues = (JSON.parse(_ghRaw) as GitHubIssue[]).map(({ number, state, title }) => ({ number, state, title }));
  return { beads: _beads, issues: _issues };
};

/**
 * `bd` / `gh` から入力を集めて台帳を `LEDGER_PATH` に書き出す。
 *
 * @returns 書き出し完了で解決する Promise
 */
const _main = async (): Promise<void> => {
  const _inputs = await collectLedgerInputs(runCommand);
  const _rows = buildLedgerRows(_inputs.beads, _inputs.issues);
  await ensureDir(dirname(LEDGER_PATH));
  await Deno.writeTextFile(LEDGER_PATH, toTsv(_rows));
  console.log(`台帳 ${_rows.length} 行を ${LEDGER_PATH} に書き出した`);
};

if (import.meta.main) {
  await _main();
}
