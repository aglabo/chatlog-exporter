// src: scripts/__tests__/unit/build-ledger.unit.spec.ts
// @(#): build-ledger のユニットテスト（分類・GitHub 突合・DR 抽出・台帳生成・入力収集）
//       対象: classifyModule / classifyIssueModule / titleSimilarity / matchGitHubIssue /
//             isDrCandidate / buildLedgerRows / toTsv / collectLedgerInputs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  buildLedgerRows,
  classifyIssueModule,
  classifyModule,
  collectLedgerInputs,
  isDrCandidate,
  matchGitHubIssue,
  titleSimilarity,
  toTsv,
} from '../../backport/build-ledger.ts';
// constants
import { BD_ARGS, GH_ARGS, LEDGER_COLUMNS, LEDGER_PATH } from '../../backport/build-ledger.ts';
// types
import type {
  BeadsIssue,
  CommandProvider,
  GitHubIssue,
  GitHubMatch,
  LedgerAction,
  LedgerRow,
} from '../../backport/build-ledger.ts';

// ─── Internal Helpers

// types
/** 先頭一致モジュールだけを検証するテーブル駆動ケース。 */
interface ModuleCase {
  /** テスト ID。 */
  id: string;
  /** `classifyModule` に渡すテキスト。 */
  text: string;
  /** 期待する先頭一致モジュール名。 */
  expected: string;
}

// constants
/** 宣言順どおりに先頭一致モジュールが決まることを確認するケース群。 */
const _moduleCases: ModuleCase[] = [
  { id: 'T-BPL-CM-01', text: 'strip の孤立退避検出', expected: 'filter/strip' },
  { id: 'T-BPL-CM-02', text: 'noise-filter にパターンを追加する', expected: 'filter/noise-filter' },
  { id: 'T-BPL-CM-03', text: 'runAI が rate limit を検出できない', expected: 'libs/ai-backend' },
  { id: 'T-BPL-CM-11', text: 'dprint で .mdx もフォーマット対象にする', expected: 'repo/tooling' },
  { id: 'T-BPL-CM-12', text: 'fix(deps): bump mermaid to resolve Dependabot alerts', expected: 'repo/tooling' },
  { id: 'T-BPL-CM-13', text: 'withConcurrency: reject 時に開始済みワーカーを待たない', expected: 'libs/concurrency' },
  { id: 'T-BPL-CM-17', text: 'prefilter で Codex ログのプリアンブルを除外する', expected: 'filter/noise-filter' },
  { id: 'T-BPL-CM-18', text: 'parseArgs に defaultConfigFile を渡す', expected: 'libs/config' },
  { id: 'T-BPL-CM-19', text: 'export-chatlogs のファイル名衝突', expected: 'chatlog/export' },
  { id: 'T-BPL-CM-20', text: 'structured-output R-004 の本文を直す', expected: 'libs/ai-backend' },
];

/** スキル固有の issue。`rate limit` でライブラリにも当たるが、スキル側が先頭一致になる。 */
const _SKILL_OVER_LIB_TEXT = 'set-frontmatter: AI エラーを rate limit で中断に変更';

/** `filter/strip` と `filter/filter` の両方に当たるテキスト（語順は宣言順と逆）。 */
const _MULTI_HIT_TEXT = 'filter と strip の処理';

/** `libs/cache` にだけ当たるテキスト。 */
const _SINGLE_HIT_TEXT = 'ChatlogCache のキー設計';

/** どの `MODULE_PATTERNS` にも一致しないテキスト。 */
const _UNMATCHED_TEXT = 'ドキュメントの誤字を直す';

// ─── Tests

/**
 * `classifyModule` は beads issue のテキストから対象モジュールを判定する。
 *
 * 先頭一致モジュール（`module`）と、当たったモジュールすべて（`hits`）を返す。
 * どのパターンにも当たらない場合は `other` / 空配列にフォールバックする。
 *
 * テスト ID 範囲: T-BPL-CM-01 〜 T-BPL-CM-20
 *
 * @see classifyModule
 */
describe('classifyModule', () => {
  /** パターンに一致するテキストを渡す正常ケース。 */
  describe('When: 正常系', () => {
    for (const tc of _moduleCases) {
      it(`[Normal] ${tc.id}: '${tc.text}' → module が '${tc.expected}'`, () => {
        assertEquals(classifyModule(tc.text).module, tc.expected);
      });
    }

    it('[Normal] T-BPL-CM-04: 複数のパターンに当たると hits に宣言順で全件が入る', () => {
      assertEquals(classifyModule(_MULTI_HIT_TEXT), {
        module: 'filter/strip',
        hits: ['filter/strip', 'filter/filter'],
      });
    });

    it('[Normal] T-BPL-CM-05: 1 つのパターンにだけ当たると hits は 1 件になる', () => {
      assertEquals(classifyModule(_SINGLE_HIT_TEXT).hits, ['libs/cache']);
    });
  });

  /** 無該当・空文字列・語境界・呼び出し回数など特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-CM-06: どのパターンにも当たらないテキストは other になる', () => {
      assertEquals(classifyModule(_UNMATCHED_TEXT), { module: 'other', hits: [] });
    });

    it('[Edge] T-BPL-CM-07: 空文字列は other になる', () => {
      assertEquals(classifyModule(''), { module: 'other', hits: [] });
    });

    it('[Edge] T-BPL-CM-08: 大文字小文字を無視して判定する', () => {
      assertEquals(classifyModule('STRIP した結果').module, 'filter/strip');
    });

    it('[Edge] T-BPL-CM-09: 語境界が効き stripped は filter/strip にならない', () => {
      assertEquals(classifyModule('stripped というファイルが残る'), { module: 'other', hits: [] });
    });

    it('[Edge] T-BPL-CM-10: 同じテキストを 2 回判定しても結果が変わらない', () => {
      // 正規表現に g フラグを付けると lastIndex が持ち越されて 2 回目が壊れる
      const _text = 'strip の孤立退避検出';
      const _expected = { module: 'filter/strip', hits: ['filter/strip'] };
      assertEquals(classifyModule(_text), _expected);
      assertEquals(classifyModule(_text), _expected);
    });

    it('[Edge] T-BPL-CM-14: スキルとライブラリの両方に当たるとスキルが先頭一致になる', () => {
      // DR の配置先がスキル側になるため、スキルのパターンをライブラリより先に置いている
      assertEquals(classifyModule(_SKILL_OVER_LIB_TEXT), {
        module: 'chatlog/set-frontmatter',
        hits: ['chatlog/set-frontmatter', 'libs/ai-backend'],
      });
    });

    it('[Edge] T-BPL-CM-15: runAI を含んでもスキル名があれば chatlog/classify になる', () => {
      assertEquals(classifyModule('classify-chatlogs の runAI 呼び出し').module, 'chatlog/classify');
    });

    it('[Edge] T-BPL-CM-16: repo/tooling は他のどのモジュールよりも優先される', () => {
      assertEquals(classifyModule('cspell config が classify で壊れる').module, 'repo/tooling');
    });
  });
});

// ─── Internal Helpers（GitHub issue 突合）

// types
/** `state` だけを変えて `exact` 判定を検証するテーブル駆動ケース。 */
interface StateCase {
  /** テスト ID。 */
  id: string;
  /** GitHub issue の状態。 */
  state: string;
}

// constants
/** 突合先の GitHub issue 一覧。番号順・タグ付きタイトルを混在させてある。 */
const _ISSUES: readonly GitHubIssue[] = [
  { number: 326, state: 'CLOSED', title: '[Bug] キャッシュキーの設計を見直す' },
  { number: 400, state: 'OPEN', title: '[Feature] ノイズフィルタにパターンを追加する' },
  { number: 427, state: 'OPEN', title: 'GlobalConfig の初期化順序を直す' },
];

/** #400 のタイトルと高い類似度（約 0.88）を持つ beads タイトル。 */
const _HIGH_TITLE = 'ノイズフィルタのパターンを追加する';

/** #400 のタイトルと中程度の類似度（約 0.65）を持つ beads タイトル。 */
const _LOW_TITLE = 'ノイズフィルタのテストを追加する';

/** どの issue タイトルとも似ていない beads タイトル（最大でも約 0.07）。 */
const _UNRELATED_TITLE = 'ドキュメントの誤字を修正する';

/** `#NNN` 参照が `state` に依存しないことを確認するケース群。 */
const _stateCases: StateCase[] = [
  { id: 'T-BPL-MT-17-01', state: 'OPEN' },
  { id: 'T-BPL-MT-17-02', state: 'CLOSED' },
];

// ─── Tests

/**
 * `titleSimilarity` は 2 つのタイトルの類似度を文字バイグラムの Dice 係数で返す。
 *
 * 比較前に小文字化と空白除去で正規化するため、大文字小文字と空白の差は無視される。
 *
 * テスト ID 範囲: T-BPL-MT-01 〜 T-BPL-MT-06
 *
 * @see titleSimilarity
 */
describe('titleSimilarity', () => {
  /** 通常のタイトル文字列を渡すケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-MT-01: 完全に同じ文字列は 1 になる', () => {
      assertEquals(titleSimilarity(_HIGH_TITLE, _HIGH_TITLE), 1);
    });

    it('[Normal] T-BPL-MT-02: 共通するバイグラムがない文字列は 0 になる', () => {
      assertEquals(titleSimilarity(_HIGH_TITLE, 'キャッシュキーの設計を見直す'), 0);
    });

    it('[Normal] T-BPL-MT-03: 空白の有無だけが違う文字列は 1 になる', () => {
      assertEquals(titleSimilarity('noise filter を 直す', 'noisefilterを直す'), 1);
    });

    it('[Normal] T-BPL-MT-04: 大文字小文字だけが違う文字列は 1 になる', () => {
      assertEquals(titleSimilarity('GlobalConfig の初期化順序', 'globalconfig の初期化順序'), 1);
    });

    it('[Normal] T-BPL-MT-06: 引数の順序を入れ替えても同じ値になる', () => {
      // 同一・無関係な組では 1 と 0 で対称に見えてしまうため、中間の類似度で検証する
      assertEquals(titleSimilarity(_HIGH_TITLE, _LOW_TITLE), titleSimilarity(_LOW_TITLE, _HIGH_TITLE));
    });
  });

  /** バイグラムが作れない入力を渡すケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-MT-05: 片方が空文字列なら例外を投げず 0 を返す', () => {
      assertEquals(titleSimilarity(_HIGH_TITLE, ''), 0);
    });
  });
});

/**
 * `matchGitHubIssue` は beads issue を既存の GitHub issue に突き合わせる。
 *
 * 本文中の `#NNN` / `gh-NNN` が実在する番号なら `exact`、
 * そうでなければタイトル類似度で `title-high` / `title-low` / `none` を判定する。
 *
 * テスト ID 範囲: T-BPL-MT-07 〜 T-BPL-MT-17-02
 *
 * @see matchGitHubIssue
 */
describe('matchGitHubIssue', () => {
  /**
   * 本文中の issue 参照による突合。
   *
   * 実在する番号だけを `exact` として採用し、複数あれば最小の番号を返す。
   */
  describe('本文の issue 参照', () => {
    /** 実在する番号が本文に書かれているケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-BPL-MT-07: #400 が実在するなら exact で 400 を返す', () => {
        assertEquals(matchGitHubIssue('この件は #400 で対応済み', _UNRELATED_TITLE, _ISSUES), {
          ghNumber: 400,
          confidence: 'exact',
        });
      });

      it('[Normal] T-BPL-MT-08: gh-427 が実在するなら exact で 427 を返す', () => {
        assertEquals(matchGitHubIssue('gh-427 の続き対応', _UNRELATED_TITLE, _ISSUES), {
          ghNumber: 427,
          confidence: 'exact',
        });
      });

      for (const tc of _stateCases) {
        it(`[Normal] ${tc.id}: state が ${tc.state} でも exact が成立する`, () => {
          const _issues: GitHubIssue[] = [{ number: 400, state: tc.state, title: '関係のないタイトル' }];
          assertEquals(matchGitHubIssue('#400 を参照', _UNRELATED_TITLE, _issues), {
            ghNumber: 400,
            confidence: 'exact',
          });
        });
      }
    });

    /** 参照が実在しない・複数あるなど優先順位が問われるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-BPL-MT-09: 実在しない #999 は採用せずタイトル類似度で判定する', () => {
        assertEquals(matchGitHubIssue('#999 を参照', _HIGH_TITLE, _ISSUES), {
          ghNumber: 400,
          confidence: 'title-high',
        });
      });

      it('[Edge] T-BPL-MT-10: 実在する番号が複数あれば記載順によらず最小の番号を返す', () => {
        assertEquals(matchGitHubIssue('#400 の対応中に #326 も直した', _UNRELATED_TITLE, _ISSUES), {
          ghNumber: 326,
          confidence: 'exact',
        });
      });
    });
  });

  /**
   * タイトル類似度による突合。
   *
   * GitHub タイトルの先頭タグを除いてから beads タイトルと比較し、
   * 閾値に応じて `title-high` / `title-low` / `none` を返す。
   */
  describe('タイトル類似度', () => {
    /** 類似度が閾値を超えるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-BPL-MT-11: 類似度が TITLE_HIGH_THRESHOLD 以上なら title-high になる', () => {
        assertEquals(matchGitHubIssue('', _HIGH_TITLE, _ISSUES), {
          ghNumber: 400,
          confidence: 'title-high',
        });
      });

      it('[Normal] T-BPL-MT-12: 類似度が TITLE_LOW_THRESHOLD 以上 高閾値未満なら title-low になる', () => {
        assertEquals(matchGitHubIssue('', _LOW_TITLE, _ISSUES), {
          ghNumber: 400,
          confidence: 'title-low',
        });
      });

      it('[Normal] T-BPL-MT-14: GitHub タイトル先頭の角括弧タグを無視して比較する', () => {
        const _issues: GitHubIssue[] = [{ number: 512, state: 'OPEN', title: '[Feature] ほげほげを追加する' }];
        assertEquals(matchGitHubIssue('', 'ほげほげを追加する', _issues), {
          ghNumber: 512,
          confidence: 'title-high',
        });
      });
    });

    /** 類似度が閾値未満・同点など判定が分かれるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-BPL-MT-13: どのタイトルとも似ていなければ none になる', () => {
        assertEquals(matchGitHubIssue('', _UNRELATED_TITLE, _ISSUES), {
          ghNumber: null,
          confidence: 'none',
        });
      });

      it('[Edge] T-BPL-MT-15: 類似度が同点なら配列順によらず番号の小さい方を返す', () => {
        const _issues: GitHubIssue[] = [
          { number: 500, state: 'OPEN', title: 'タイトル類似度が同点になる件' },
          { number: 300, state: 'CLOSED', title: 'タイトル類似度が同点になる件' },
        ];
        assertEquals(matchGitHubIssue('', 'タイトル類似度が同点になる件', _issues), {
          ghNumber: 300,
          confidence: 'title-high',
        });
      });

      it('[Edge] T-BPL-MT-16: issues が空配列なら例外を投げず none を返す', () => {
        assertEquals(matchGitHubIssue('#400 を参照', _HIGH_TITLE, []), {
          ghNumber: null,
          confidence: 'none',
        });
      });
    });
  });
});

// ─── Internal Helpers（DR 候補抽出）

// types
/** キーワードだけで DR 候補が成立することを検証するテーブル駆動ケース。 */
interface DrKeywordCase {
  /** テスト ID。 */
  id: string;
  /** `isDrCandidate` に渡すテキスト。 */
  text: string;
}

// constants
/** DR 候補を示すキーワードを 1 つずつ含むテキスト群。 */
const _drKeywordCases: DrKeywordCase[] = [
  { id: 'T-BPL-DR-02', text: 'DR-18 決定1/5 に従う' },
  { id: 'T-BPL-DR-03', text: 'ユーザー判断で明示渡しは実施しない' },
  { id: 'T-BPL-DR-04', text: 'この方針で進める' },
  { id: 'T-BPL-DR-05', text: 'A 案は採用しない' },
  { id: 'T-BPL-DR-06', text: 'B 案は見送る' },
  { id: 'T-BPL-DR-07', text: 'トレードオフを検討した' },
];

/** キーワードを含まない修正ログのテキスト（bug）。 */
const _BUG_LOG_TEXT = 'null 参照で落ちるので早期 return を追加した';

/** キーワードを含まない作業ログのテキスト（task）。 */
const _TASK_LOG_TEXT = 'テストを追加した';

/** キーワードが文中のどこにあっても一致することを検証するケース群。 */
const _drPositionCases: DrKeywordCase[] = [
  { id: 'T-BPL-DR-12-01', text: '方針を変えずに実装を進めた' },
  { id: 'T-BPL-DR-12-02', text: '実装の途中で方針を変えて作り直した' },
  { id: 'T-BPL-DR-12-03', text: '作り直したうえで固めたのが今の方針' },
];

// ─── Tests

/**
 * `isDrCandidate` は closed beads issue が decision-records に載る価値を持つか判定する。
 *
 * `issue_type` が `decision` であるか、本文が `DR_KEYWORD_PATTERN` に一致すれば候補とする。
 * 単なる修正ログを弾くことが本来の目的なので、否定系が要となる。
 *
 * テスト ID 範囲: T-BPL-DR-01 〜 T-BPL-DR-12-03
 *
 * @see isDrCandidate
 */
describe('isDrCandidate', () => {
  /** 種別またはキーワードで DR 候補が成立するケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-DR-01: issueType が decision なら text が空でも true になる', () => {
      // 種別だけで成立し、キーワードを要求しない
      assertEquals(isDrCandidate('decision', ''), true);
    });

    for (const tc of _drKeywordCases) {
      it(`[Normal] ${tc.id}: '${tc.text}' はキーワードに当たり true になる`, () => {
        assertEquals(isDrCandidate('task', tc.text), true);
      });
    }

    it('[Normal] T-BPL-DR-08: bug の修正ログはキーワードを含まず false になる', () => {
      assertEquals(isDrCandidate('bug', _BUG_LOG_TEXT), false);
    });

    it('[Normal] T-BPL-DR-09: task の作業ログはキーワードを含まず false になる', () => {
      assertEquals(isDrCandidate('task', _TASK_LOG_TEXT), false);
    });
  });

  /** 空文字列・呼び出し回数・キーワード位置など特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-DR-10: text が空で issueType が decision 以外なら false になる', () => {
      assertEquals(isDrCandidate('task', ''), false);
    });

    it('[Edge] T-BPL-DR-11: 同じ引数で 2 回呼んでも結果が変わらない', () => {
      // 正規表現に g フラグを付けると lastIndex が持ち越されて 2 回目が壊れる
      const _text = 'トレードオフを検討した';
      assertEquals(isDrCandidate('task', _text), true);
      assertEquals(isDrCandidate('task', _text), true);
    });

    for (const tc of _drPositionCases) {
      it(`[Edge] ${tc.id}: '${tc.text}' のようにキーワードが文中のどこにあっても true になる`, () => {
        assertEquals(isDrCandidate('task', tc.text), true);
      });
    }
  });
});

// ─── Internal Helpers（台帳の組み立て）

// types
/** `action` の決定だけを検証するテーブル駆動ケース。 */
interface ActionCase {
  /** テスト ID。 */
  id: string;
  /** 既定の beads issue に上書きするフィールド。 */
  overrides: Partial<BeadsIssue>;
  /** 期待する `action`。 */
  expected: LedgerAction;
}

// constants
/** `#400` を参照するため `confidence` が `exact` になる本文。 */
const _EXACT_BODY = '対応は #400 で行った';

/** `DR_KEYWORD_PATTERN` に当たり `drCandidate` が `yes` になるクローズ理由。 */
const _DR_REASON = '方針を変えたため作り直した';

/** 親を持つ子 issue の beads ID。親は `cle-48r`。 */
const _CHILD_ID = 'cle-48r.1';

// functions
/**
 * 台帳組み立て用の beads issue を生成する。
 *
 * 既定値はどの `MODULE_PATTERNS` にも当たらず `_ISSUES` のどれとも突合できない
 * top-level issue（`module` が `other`、`confidence` が `none`）になる。
 *
 * @param overrides - 既定値に上書きするフィールド
 * @returns テスト用の `BeadsIssue`
 */
const _makeBeads = (overrides: Partial<BeadsIssue> = {}): BeadsIssue => ({
  id: 'cle-48r',
  title: _UNRELATED_TITLE,
  description: '',
  close_reason: '',
  notes: '',
  design: '',
  issue_type: 'task',
  priority: 2,
  closed_at: '2026-08-21T12:34:56Z',
  ...overrides,
});

/**
 * beads issue 1 件を `_ISSUES` に突き合わせて台帳 1 行に変換する。
 *
 * @param overrides - 既定の beads issue に上書きするフィールド
 * @returns 組み立てられた台帳 1 行
 */
const _buildRow = (overrides: Partial<BeadsIssue> = {}): LedgerRow =>
  buildLedgerRows([_makeBeads(overrides)], _ISSUES)[0];

/** 3 件の beads issue。件数が保存されることの確認に使う。 */
const _MULTI_BEADS: readonly BeadsIssue[] = [
  _makeBeads(),
  _makeBeads({ id: 'cle-49r' }),
  _makeBeads({ id: 'cle-50r' }),
];

/** top-level かつ確度が高く、`action` が `comment` に決まるケース群。 */
const _commentCases: ActionCase[] = [
  { id: 'T-BPL-LR-04-01', overrides: { description: _EXACT_BODY }, expected: 'comment' },
  { id: 'T-BPL-LR-04-02', overrides: { title: _HIGH_TITLE }, expected: 'comment' },
];

// ─── Tests

/**
 * `buildLedgerRows` は closed beads issue 一覧を台帳の行に変換する。
 *
 * `classifyModule` / `matchGitHubIssue` / `isDrCandidate` の結果を 1 行に束ね、
 * 子 issue かどうかと突合の確度から `action` を決める。
 *
 * テスト ID 範囲: T-BPL-LR-01 〜 T-BPL-LR-12
 *
 * @see buildLedgerRows
 */
describe('buildLedgerRows', () => {
  /** parent の導出と action の決定を検証する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-LR-01: top-level の issue は parent が空文字列になる', () => {
      assertEquals(_buildRow().parent, '');
    });

    it('[Normal] T-BPL-LR-02: 子 issue は parent が親 ID になり action が rollup になる', () => {
      const _row = _buildRow({ id: _CHILD_ID });
      assertEquals(_row.parent, 'cle-48r');
      assertEquals(_row.action, 'rollup');
    });

    for (const tc of _commentCases) {
      it(`[Normal] ${tc.id}: 確度の高い top-level は action が '${tc.expected}' になる`, () => {
        assertEquals(_buildRow(tc.overrides).action, tc.expected);
      });
    }

    it('[Normal] T-BPL-LR-05: confidence が title-low の top-level は action が aggregate になる', () => {
      // 中確度の突合を無検査でコメントに流すと誤った issue に書き込むため、昇格させない
      const _row = _buildRow({ title: _LOW_TITLE });
      assertEquals(_row.confidence, 'title-low');
      assertEquals(_row.action, 'aggregate');
    });

    it('[Normal] T-BPL-LR-06: 突合できない top-level は action が aggregate、ghNumber が空文字列になる', () => {
      const _row = _buildRow();
      assertEquals(_row.confidence, 'none');
      assertEquals(_row.action, 'aggregate');
      assertEquals(_row.ghNumber, '');
    });

    it('[Normal] T-BPL-LR-07: closed_at の日時から日付部分だけが closedAt になる', () => {
      assertEquals(_buildRow().closedAt, '2026-08-21');
    });

    it('[Normal] T-BPL-LR-09: result は組み立て時点では空文字列になる', () => {
      assertEquals(_buildRow().result, '');
    });

    it('[Normal] T-BPL-LR-11: 出力の件数が入力の件数と一致する', () => {
      assertEquals(buildLedgerRows(_MULTI_BEADS, _ISSUES).length, _MULTI_BEADS.length);
    });

    it('[Normal] T-BPL-LR-12: 複数モジュールに当たる issue は moduleHits が ; 連結になる', () => {
      const _row = _buildRow({ title: _MULTI_HIT_TEXT });
      assertEquals(_row.module, 'filter/strip');
      assertEquals(_row.moduleHits, 'filter/strip;filter/filter');
    });
  });

  /** 子 issue の優先や null フィールドなど特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-LR-03: 子 issue は confidence が exact でも action は rollup のままになる', () => {
      // 親へ畳むため、子を個別のコメント対象にしない
      const _row = _buildRow({ id: _CHILD_ID, description: _EXACT_BODY });
      assertEquals(_row.confidence, 'exact');
      assertEquals(_row.action, 'rollup');
    });

    it('[Edge] T-BPL-LR-08: null のフィールドは例外を投げず空文字列として扱われる', () => {
      const _row = _buildRow({ description: null, close_reason: null, notes: null, design: null });
      assertEquals(_row.module, 'other');
      assertEquals(_row.moduleHits, '');
      assertEquals(_row.drCandidate, 'no');
      // null が `'null'` として連結されず、残ったフィールドだけで判定されることの確認
      const _dr = _buildRow({ close_reason: _DR_REASON, notes: null, design: null });
      assertEquals(_dr.drCandidate, 'yes');
    });

    it('[Edge] T-BPL-LR-10: 入力が空配列なら空配列を返す', () => {
      assertEquals(buildLedgerRows([], _ISSUES), []);
    });
  });
});

// ─── Internal Helpers（TSV 出力）

// constants
/** TSV の形状検証に使う台帳 3 行。 */
const _LEDGER_ROWS: readonly LedgerRow[] = buildLedgerRows(_MULTI_BEADS, _ISSUES);

// functions
/**
 * TSV を末尾の改行を除いた行配列に分解する。
 *
 * `trimEnd` は使わない。`result` が常に空文字列で各行が区切りタブで終わるため、
 * 末尾を削ると列数が変わってしまう。
 *
 * @param tsv - `toTsv` の出力
 * @returns ヘッダを含む行配列
 */
const _lines = (tsv: string): string[] => tsv.split('\n').slice(0, -1);

/**
 * 指定した文字列を `moduleHits` に持つ台帳 1 行を作る。
 *
 * @param value - `moduleHits` に入れる値（タブや改行を含めて壊れ方を検証する）
 * @returns 台帳 1 行だけの配列
 */
const _makeDirtyRows = (value: string): LedgerRow[] => [{ ..._LEDGER_ROWS[0], moduleHits: value }];

// ─── Tests

/**
 * `toTsv` は台帳を TSV 文字列に変換する。
 *
 * 1 行目は `LEDGER_COLUMNS`、2 行目以降は同じ順の値で、各行は改行で終わる。
 * 値に含まれるタブ・改行は空白に置換し、列・行のずれを防ぐ。
 *
 * テスト ID 範囲: T-BPL-LR-13 〜 T-BPL-LR-19
 *
 * @see toTsv
 */
describe('toTsv', () => {
  /** 通常の台帳を渡してヘッダと行・列の形状を検証する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-LR-13: 1 行目が LEDGER_COLUMNS のタブ区切りと一致する', () => {
      assertEquals(_lines(toTsv(_LEDGER_ROWS))[0], LEDGER_COLUMNS.join('\t'));
      // ヘッダと値の並びは独立に書かれているため、列名と値の対応まで確認する。
      // ずれても行数・列数は変わらず、台帳が黙って別の列を指す
      const _probe = { ..._LEDGER_ROWS[0], module: 'MOD', moduleHits: 'HITS', ghNumber: 'GH' };
      const _cells = _lines(toTsv([_probe]))[1].split('\t');
      assertEquals(_cells[LEDGER_COLUMNS.indexOf('module')], 'MOD');
      assertEquals(_cells[LEDGER_COLUMNS.indexOf('module_hits')], 'HITS');
      assertEquals(_cells[LEDGER_COLUMNS.indexOf('gh_number')], 'GH');
    });

    it('[Normal] T-BPL-LR-14: 行数がヘッダ 1 行 + データ行数になる', () => {
      assertEquals(_lines(toTsv(_LEDGER_ROWS)).length, _LEDGER_ROWS.length + 1);
    });

    it('[Normal] T-BPL-LR-15: 各データ行の列数が LEDGER_COLUMNS.length と一致する', () => {
      const _columnCounts = _lines(toTsv(_LEDGER_ROWS)).slice(1).map((line) => line.split('\t').length);
      assertEquals(_columnCounts, _LEDGER_ROWS.map(() => LEDGER_COLUMNS.length));
    });

    it('[Normal] T-BPL-LR-19: 出力が改行で終わる', () => {
      assertEquals(toTsv(_LEDGER_ROWS).endsWith('\n'), true);
    });
  });

  /** 空の台帳や値に区切り文字を含む特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-LR-18: 空配列ならヘッダ 1 行だけを返す', () => {
      assertEquals(toTsv([]), `${LEDGER_COLUMNS.join('\t')}\n`);
    });

    it('[Edge] T-BPL-LR-16: 値に改行を含んでも出力の行数が増えない', () => {
      // beads の description は複数行を含むため、置換しないと台帳の行がずれる
      const _rows = _makeDirtyRows('filter/strip\r\nfilter/filter');
      assertEquals(_lines(toTsv(_rows)).length, _rows.length + 1);
    });

    it('[Edge] T-BPL-LR-17: 値にタブを含んでもその行の列数が増えない', () => {
      const _rows = _makeDirtyRows('filter/strip\tfilter/filter');
      assertEquals(_lines(toTsv(_rows))[1].split('\t').length, LEDGER_COLUMNS.length);
    });
  });
});

// ─── Tests

/**
 * CLI エントリポイントが外部コマンドと台帳ファイルに対して固定で使う定数。
 *
 * `bd` / `gh` の絞り込み条件と出力先パスは、台帳に何が載るか・生成物がどこに置かれるかを
 * 決める契約なので、値そのものを固定する。
 *
 * テスト ID 範囲: T-BPL-CI-07 〜 T-BPL-CI-09
 *
 * @see BD_ARGS
 * @see GH_ARGS
 * @see LEDGER_PATH
 */
describe('台帳の入出力定数', () => {
  it('[Normal] T-BPL-CI-07: BD_ARGS が --status closed と --json を含む', () => {
    // closed 以外が混ざると、まだ終わっていない issue が台帳に載る
    assertEquals(BD_ARGS[BD_ARGS.indexOf('--status') + 1], 'closed');
    assertEquals(BD_ARGS.includes('--json'), true);
  });

  it('[Normal] T-BPL-CI-08: GH_ARGS が --state all と --json を含む', () => {
    // closed 済みの GitHub issue も突合先になるため、open だけに絞ってはならない
    assertEquals(GH_ARGS[GH_ARGS.indexOf('--state') + 1], 'all');
    assertEquals(GH_ARGS.includes('--json'), true);
  });

  it('[Normal] T-BPL-CI-09: LEDGER_PATH が docs/.deckrd/temp/ 配下を指す', () => {
    // このディレクトリは git 管理外。ここを外すと生成物がリポジトリに混ざる
    assertEquals(LEDGER_PATH.startsWith('docs/.deckrd/temp/'), true);
  });
});

// ─── Internal Helpers（CLI エントリポイント）

// types
/** fake `CommandProvider` が記録した 1 回分の呼び出し。 */
interface CommandCall {
  /** 実行されたコマンド名。 */
  cmd: string;
  /** 渡された引数。 */
  args: readonly string[];
}

/** fake `CommandProvider` と、その呼び出し記録の組。 */
interface FakeRun {
  /** `collectLedgerInputs` に注入する `CommandProvider`。 */
  run: CommandProvider;
  /** 実行順に積まれた呼び出し記録。 */
  calls: CommandCall[];
}

// constants
/** `bd` が返す JSON。beads issue 1 件だけを含む。 */
const _BD_STDOUT = JSON.stringify([_makeBeads({ description: _EXACT_BODY })]);

/**
 * `gh` が返す JSON。
 *
 * `--json number,title,state` では取得しない `url` をあえて 1 つ混ぜてあり、
 * `collectLedgerInputs` が必要な 3 フィールドだけに絞ることを検証できる。
 */
const _GH_STDOUT = JSON.stringify(_ISSUES.map((issue) => ({ ...issue, url: `https://example.test/${issue.number}` })));

/** `bd` / `gh` がともに空配列を返す応答表。 */
const _EMPTY_STDOUTS: Record<string, string> = { bd: '[]', gh: '[]' };

/** `run` が投げる例外のメッセージ。握りつぶされていないことを確認するために照合する。 */
const _RUN_FAILURE_MESSAGE = 'bd: command not found';

/** 常に失敗する `CommandProvider`。 */
const _FAILING_RUN: CommandProvider = () => Promise.reject(new Error(_RUN_FAILURE_MESSAGE));

// functions
/**
 * 応答表を引く fake `CommandProvider` を作る。
 *
 * 実際に `Deno.Command` を起動しないため、テストが外部の `bd` / `gh` に依存しない。
 *
 * @param stdouts - コマンド名から stdout 文字列への対応表
 * @returns fake `CommandProvider` と呼び出し記録
 */
const _makeFakeRun = (stdouts: Record<string, string>): FakeRun => {
  const _calls: CommandCall[] = [];
  const _run: CommandProvider = (cmd, args) => {
    _calls.push({ cmd, args });
    const _stdout = stdouts[cmd];
    return _stdout === undefined
      ? Promise.reject(new Error(`fake: 未登録のコマンド ${cmd}`))
      : Promise.resolve(_stdout);
  };
  return { run: _run, calls: _calls };
};

// ─── Tests

/**
 * `collectLedgerInputs` は `bd` と `gh` を実行して台帳の入力一式を集める。
 *
 * コマンド実行は `CommandProvider` として注入されるため、ここでは fake を渡して
 * 引数・パース結果・失敗時の振る舞いを検証する。
 *
 * テスト ID 範囲: T-BPL-CI-01 〜 T-BPL-CI-06
 *
 * @see collectLedgerInputs
 */
describe('collectLedgerInputs', () => {
  /** `bd` / `gh` がともに正常な JSON を返すケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-CI-01: bd と gh の JSON がそれぞれ beads と issues にパースされる', async () => {
      const _fake = _makeFakeRun({ bd: _BD_STDOUT, gh: _GH_STDOUT });
      const _inputs = await collectLedgerInputs(_fake.run);
      assertEquals(_inputs.beads, [_makeBeads({ description: _EXACT_BODY })]);
      assertEquals(_inputs.issues.map((issue) => issue.number), _ISSUES.map((issue) => issue.number));
    });

    it('[Normal] T-BPL-CI-02: bd は BD_ARGS で、gh は GH_ARGS で呼ばれる', async () => {
      const _fake = _makeFakeRun({ bd: _BD_STDOUT, gh: _GH_STDOUT });
      await collectLedgerInputs(_fake.run);
      // 余計な実行が混ざっていないことまで確認する
      assertEquals(_fake.calls.length, 2);
      assertEquals(_fake.calls.find((call) => call.cmd === 'bd')?.args, BD_ARGS);
      assertEquals(_fake.calls.find((call) => call.cmd === 'gh')?.args, GH_ARGS);
    });

    it('[Normal] T-BPL-CI-03: issues の各要素が number / state / title だけを持つ', async () => {
      const _fake = _makeFakeRun({ bd: _BD_STDOUT, gh: _GH_STDOUT });
      const _inputs = await collectLedgerInputs(_fake.run);
      // gh の応答に含まれる url は台帳の突合に使わないので落とす
      assertEquals(_inputs.issues, [..._ISSUES]);
    });
  });

  /** コマンド実行や JSON パースが失敗するケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-BPL-CI-05: run が例外を投げたら空配列にせず例外を伝播する', async () => {
      // 空配列にフォールバックすると「対象 0 件」と「取得に失敗した」を区別できなくなる
      await assertRejects(() => collectLedgerInputs(_FAILING_RUN), Error, _RUN_FAILURE_MESSAGE);
    });

    it('[Error] T-BPL-CI-06: bd の出力が JSON として不正なら例外を投げる', async () => {
      const _fake = _makeFakeRun({ bd: 'not json', gh: _GH_STDOUT });
      await assertRejects(() => collectLedgerInputs(_fake.run), Error);
    });
  });

  /** 取得結果が 0 件のケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-CI-04: bd と gh がともに空配列なら beads も issues も空になる', async () => {
      const _inputs = await collectLedgerInputs(_makeFakeRun(_EMPTY_STDOUTS).run);
      assertEquals(_inputs, { beads: [], issues: [] });
    });
  });
});

// ─── Internal Helpers（issue 参照の抽出）

// constants
/**
 * 参照抽出の検証に使う GitHub issue 一覧。
 *
 * `_ISSUES` に番号を足すとタイトル類似度の候補集合が変わり、`T-BPL-MT-11` 以降の
 * 期待値が動いてしまうため、抽出規則の検証には専用の一覧を使う。
 * タイトルはどれも `_UNRELATED_TITLE` と似ないようにしてあり、
 * `exact` が成立しなければ必ず `none` に落ちる。
 */
const _REF_ISSUES: readonly GitHubIssue[] = [
  { number: 2, state: 'OPEN', title: 'placeholder issue two' },
  { number: 7, state: 'OPEN', title: 'placeholder issue seven' },
  { number: 326, state: 'CLOSED', title: 'placeholder issue three two six' },
  { number: 386, state: 'CLOSED', title: 'placeholder issue three eight six' },
  { number: 396, state: 'OPEN', title: 'placeholder issue three nine six' },
  { number: 400, state: 'OPEN', title: 'placeholder issue four hundred' },
  { number: 427, state: 'OPEN', title: 'placeholder issue four two seven' },
];

/** 参照とみなさない記法を渡したときに期待する突合結果。 */
const _NO_MATCH: GitHubMatch = { ghNumber: null, confidence: 'none' };

// ─── Tests

/**
 * `matchGitHubIssue` の issue 参照の抽出規則。
 *
 * 実データ 200 件で `AC#2` を `#1` に、`Dependabot alert #7` を無関係な `#7` に
 * 誤って一致させ、タイトルにしか参照がない issue を取りこぼしていたため、
 * 走査対象と除外規則を厳密化した。
 *
 * テスト ID 範囲: T-BPL-MT-18 〜 T-BPL-MT-25
 *
 * @see matchGitHubIssue
 */
describe('matchGitHubIssue: issue 参照の抽出', () => {
  /**
   * 参照の走査対象。
   *
   * `body` だけでなく `title` も走査する（実例: `cle-50n` は
   * タイトル `Fix #400 cause 2: ...` にしか参照がない）。
   */
  describe('走査対象', () => {
    /** タイトルにだけ参照が書かれているケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-BPL-MT-18: title の #400 を参照として拾い exact を返す', () => {
        assertEquals(matchGitHubIssue('', 'Fix #400 cause 2', _REF_ISSUES), {
          ghNumber: 400,
          confidence: 'exact',
        });
      });
    });

    /** title と body の双方に参照があるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-BPL-MT-25: title と body に別々の実在番号があっても結果は決定的になる', () => {
        const _call = (): GitHubMatch => matchGitHubIssue('#326 も直した', '#427 の続き', _REF_ISSUES);
        assertEquals(_call(), { ghNumber: 326, confidence: 'exact' });
        // 正規表現の lastIndex 持ち越しで 2 回目が壊れないことまで確認する
        assertEquals(_call(), _call());
      });
    });
  });

  /**
   * 参照とみなさない記法。
   *
   * 実在する issue 番号への一致は `action` を `'comment'`（取り消し不能な書き込み）に
   * 昇格させるため、紛らわしい記法は番号の実在判定より前に落とす。
   */
  describe('参照とみなさない記法', () => {
    /** 受入条件番号や alert 番号など、issue 参照でない `#NNN` のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-BPL-MT-19: # の直前が単語文字の AC#2 は参照とみなさない', () => {
        assertEquals(matchGitHubIssue('AC#2 を差し替える', _UNRELATED_TITLE, _REF_ISSUES), _NO_MATCH);
      });

      it('[Edge] T-BPL-MT-21: 直前の語が alert なら参照とみなさない', () => {
        assertEquals(matchGitHubIssue('Dependabot alert #7 に対応', _UNRELATED_TITLE, _REF_ISSUES), _NO_MATCH);
      });

      it('[Edge] T-BPL-MT-22: 直前の語が PR なら参照とみなさない', () => {
        assertEquals(matchGitHubIssue('PR #396 とは無関係', _UNRELATED_TITLE, _REF_ISSUES), _NO_MATCH);
      });
    });
  });

  /**
   * 正当な参照の維持。
   *
   * 除外規則を足しても、従来拾えていた記法は拾い続けなければならない。
   */
  describe('正当な参照', () => {
    /** 除外規則に当たらない書き方のケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-BPL-MT-20: # の直前が空白なら参照として拾う', () => {
        assertEquals(matchGitHubIssue('対応は #2 で行う', _UNRELATED_TITLE, _REF_ISSUES), {
          ghNumber: 2,
          confidence: 'exact',
        });
      });

      it('[Normal] T-BPL-MT-23: 直前の語が Issue なら除外せず参照として拾う', () => {
        assertEquals(matchGitHubIssue('GitHub Issue #386 に対応', _UNRELATED_TITLE, _REF_ISSUES), {
          ghNumber: 386,
          confidence: 'exact',
        });
      });

      it('[Normal] T-BPL-MT-24: gh-427 形式は従来どおり参照として拾う', () => {
        assertEquals(matchGitHubIssue('gh-427 を参照', _UNRELATED_TITLE, _REF_ISSUES), {
          ghNumber: 427,
          confidence: 'exact',
        });
      });
    });
  });
});

// ─── Internal Helpers（タイトル優先のモジュール判定）

// constants
/** 主題が `libs/cache` であることをタイトルが名指す issue のタイトル。 */
const _CACHE_TITLE = 'fix(ChatlogCache): cache key の衝突';

/** `_CACHE_TITLE` の波及先として `chatlog/set-frontmatter` に言及するだけの本文。 */
const _SET_FRONTMATTER_BODY = 'set-frontmatter.ts に baseDir を渡す';

/** どの `MODULE_PATTERNS` にも当たらないタイトル。本文を併用する経路の入口になる。 */
const _UNMATCHED_TITLE = '受入条件を見直す';

/** `chatlog/classify` にだけ当たる本文。 */
const _CLASSIFY_BODY = 'classify-chatlogs の判定を直す';

// ─── Tests

/**
 * `classifyIssueModule` は beads issue のタイトルと本文からモジュールを判定する。
 *
 * タイトルだけで判定できるならその結果をそのまま返し、`other` だったときにだけ
 * 本文を併用する。タイトルは主題を名指すが本文は波及先に言及するだけのことが多く、
 * 同列に扱うと主題ではないモジュールへ吸い寄せられるため。
 *
 * テスト ID 範囲: T-BPL-IM-01 〜 T-BPL-IM-06
 *
 * @see classifyIssueModule
 */
describe('classifyIssueModule', () => {
  /** タイトル優先と本文フォールバックが期待どおりに働くケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-IM-01: タイトルで判定できるとき本文の別モジュールに引きずられない', () => {
      // 本文は波及先として set-frontmatter に触れるだけで、この issue の主題ではない
      assertEquals(classifyIssueModule(_CACHE_TITLE, _SET_FRONTMATTER_BODY).module, 'libs/cache');
    });

    it('[Normal] T-BPL-IM-02: タイトルで判定できるとき hits に本文由来のモジュールが入らない', () => {
      assertEquals(classifyIssueModule(_CACHE_TITLE, _SET_FRONTMATTER_BODY).hits, ['libs/cache']);
    });

    it('[Normal] T-BPL-IM-03: タイトルが無該当なら本文を併用して判定する', () => {
      assertEquals(classifyIssueModule(_UNMATCHED_TITLE, _CLASSIFY_BODY).module, 'chatlog/classify');
    });

    it('[Normal] T-BPL-IM-06: タイトルが複数パターンに当たると hits が宣言順に並ぶ', () => {
      assertEquals(classifyIssueModule(_MULTI_HIT_TEXT, _UNMATCHED_TEXT), {
        module: 'filter/strip',
        hits: ['filter/strip', 'filter/filter'],
      });
    });
  });

  /** 無該当・空の本文など特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-BPL-IM-04: タイトルも本文も無該当なら other になる', () => {
      assertEquals(classifyIssueModule(_UNMATCHED_TITLE, _UNMATCHED_TEXT), { module: 'other', hits: [] });
    });

    it('[Edge] T-BPL-IM-05: description が空文字列でもタイトルだけで判定できる', () => {
      assertEquals(classifyIssueModule(_SINGLE_HIT_TEXT, ''), { module: 'libs/cache', hits: ['libs/cache'] });
    });
  });
});

/**
 * `buildLedgerRows` のモジュール判定がタイトル優先になっていることを検証する。
 *
 * 台帳の `module` 列は集約 issue の振り分け先と `decision-records.md` の配置先を決めるため、
 * 本文の波及先に引きずられると DR が誤ったモジュールの文書に載る。
 *
 * テスト ID 範囲: T-BPL-LR-20
 *
 * @see buildLedgerRows
 */
describe('buildLedgerRows: タイトル優先のモジュール判定', () => {
  /** タイトルと本文が別モジュールを指すケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-BPL-LR-20: 本文が別モジュールに言及してもタイトル側の module になる', () => {
      const _row = _buildRow({ title: _CACHE_TITLE, description: 'set-frontmatter.ts を直す' });
      assertEquals(_row.module, 'libs/cache');
    });
  });
});
