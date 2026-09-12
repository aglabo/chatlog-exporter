// src: scripts/__tests__/unit/check-task-tables.unit.spec.ts
// @(#): check-task-tables のユニットテスト（deckrd tasks.md 集計表の整合検査そのものの検査）
//       対象: countTasks, findTableMismatches, collectTaskDocs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { collectTaskDocs, countTasks, findTableMismatches } from '../../check-task-tables.ts';

// ─── Internal Helpers

// constants
/**
 * 検査対象の本文。タスク 2 件ぶんの見出しとチェックリスト項目を持つ。
 *
 * 実測値は T-01 が scenarios=2 / N=2 E=1 G=0 / cases=3、
 * T-02 が scenarios=2 / N=1 E=0 G=1 / cases=2、合計 scenarios=4 / cases=5。
 *
 * タスク ID をシングルクォートで囲んで書かないこと。`check-test-ids` の
 * テーブル系統がテスト ID の割り当てと誤認し、リポジトリ全体の重複検査が落ちる。
 */
const _BODY = [
  '## T-01: サンプルタスク',
  '',
  '### [正常] Normal Cases',
  '',
  '#### T-01-01: シナリオ 1',
  '',
  `- [x] **T-01-01-01**: ケース`,
  `- [x] **T-01-01-02**: ケース`,
  '',
  '### [異常] Error Cases',
  '',
  '#### T-01-02: シナリオ 2',
  '',
  `- [x] **T-01-02-01**: ケース`,
  '',
  '## T-02: サンプルタスク',
  '',
  '### [正常] Normal Cases',
  '',
  '#### T-02-01: シナリオ 1',
  '',
  `- [x] **T-02-01-01**: ケース`,
  '',
  '### [エッジケース] Edge Cases',
  '',
  '#### T-02-02: シナリオ 2',
  '',
  `- [x] **T-02-02-01**: ケース`,
].join('\n');

/** 実測と一致する Task Summary 表の行（ヘッダ・区切りを除く）。 */
const _SUMMARY_ROWS = [
  '| T-01: サンプルタスク | C1 | 2 | 3 | done |',
  '| T-02: サンプルタスク | C2 | 2 | 2 | done |',
  '| **合計** | — | **4** | **5** | — |',
];

/** 実測と一致する Category Balance 表の行（ヘッダ・区切りを除く）。 */
const _BALANCE_ROWS = [
  '| T-01 | 2 | 1 | [N/A] | 3 | [OK] |',
  '| T-02 | 1 | [N/A] | 1 | 2 | [OK] |',
  '| **合計** | **3** | **1** | **1** | **5** | — |',
];

// functions
/**
 * Task Summary 表の節（見出し・ヘッダ・区切り・行）を組み立てる。
 *
 * @param rows - Task Summary 表の行（ヘッダ・区切りを除く）
 * @returns 節を構成する行の配列
 */
const _summarySection = (rows: string[]): string[] => [
  '## Task Summary',
  '',
  '| Test Target | Commit | Scenarios | Cases | Status |',
  '| ----------- | ------ | --------- | ----- | ------ |',
  ...rows,
  '',
];

/**
 * Category Balance 表の節（見出し・ヘッダ・区切り・行）を組み立てる。
 *
 * @param rows - Category Balance 表の行（ヘッダ・区切りを除く）
 * @returns 節を構成する行の配列
 */
const _balanceSection = (rows: string[]): string[] => [
  '## Category Balance',
  '',
  '| Test Target | Normal | Error | Edge | Cases | 判定 |',
  '| ----------- | ------ | ----- | ---- | ----- | ---- |',
  ...rows,
  '',
];

/**
 * 2 つの集計表と本文を持つ tasks.md 相当の文字列を組み立てる。
 *
 * @param summaryRows - Task Summary 表の行（ヘッダ・区切りを除く）
 * @param balanceRows - Category Balance 表の行（ヘッダ・区切りを除く）
 * @returns 検査対象の Markdown 文字列
 */
const _makeDoc = (summaryRows: string[], balanceRows: string[]): string =>
  [..._summarySection(summaryRows), ..._balanceSection(balanceRows), _BODY].join('\n');

/**
 * Task Summary 表だけを持ち、Category Balance 表を欠く文書を組み立てる。
 *
 * @param summaryRows - Task Summary 表の行（ヘッダ・区切りを除く）
 * @returns 検査対象の Markdown 文字列
 */
const _makeSummaryOnlyDoc = (summaryRows: string[]): string => [..._summarySection(summaryRows), _BODY].join('\n');

/**
 * Category Balance 表だけを持ち、Task Summary 表を欠く文書を組み立てる。
 *
 * @param balanceRows - Category Balance 表の行（ヘッダ・区切りを除く）
 * @returns 検査対象の Markdown 文字列
 */
const _makeBalanceOnlyDoc = (balanceRows: string[]): string => [..._balanceSection(balanceRows), _BODY].join('\n');

// ─── Tests

/**
 * `countTasks` は本文の見出しとチェックリスト項目から、タスクごとの実測値を集計する。
 *
 * `### [分類]` 見出しでカテゴリを切り替え、`#### T-NN-MM` をシナリオ、
 * `- [x] **T-NN-MM-KK**` をケースとして数える。
 *
 * テスト ID 範囲: T-CTT-CT-01-01 〜 T-CTT-CT-02-01
 *
 * @see countTasks
 */
describe('countTasks', () => {
  /** 分類見出しごとにケースが振り分けられる正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-CTT-CT-01-01: 分類見出しごとにシナリオ数・ケース数が集計される', () => {
      const _counts = countTasks(_BODY);

      assertEquals(_counts.get('T-01'), { scenarios: 2, normal: 2, error: 1, edge: 0, cases: 3 });
      assertEquals(_counts.get('T-02'), { scenarios: 2, normal: 1, error: 0, edge: 1, cases: 2 });
    });
  });

  /** タスク見出しを含まない入力の境界ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-CTT-CT-02-01: タスク見出しがない本文 → 空の Map を返す', () => {
      assertEquals(countTasks('# 見出しのみ\n\n本文。').size, 0);
    });
  });
});

/**
 * `findTableMismatches` は 2 つの集計表の各行・合計行を実測値と照合し、不一致を列挙する。
 *
 * 表が実態からずれたまま放置される（行の欠落・合計の据え置き）ことを防ぐのが目的。
 *
 * テスト ID 範囲: T-CTT-FM-01-01 〜 T-CTT-FM-13-01
 *
 * @see findTableMismatches
 */
describe('findTableMismatches', () => {
  /** 表と実測が一致している正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-CTT-FM-01-01: 両表が実測と一致 → 空配列を返す', () => {
      assertEquals(findTableMismatches(_makeDoc(_SUMMARY_ROWS, _BALANCE_ROWS)), []);
    });
  });

  /** 表の値が実測とずれている異常ケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-CTT-FM-02-01: Task Summary の Cases が 1 少ない → 該当タスクを報告する', () => {
      const _rows = [
        '| T-01: サンプルタスク | C1 | 2 | 2 | done |',
        '| T-02: サンプルタスク | C2 | 2 | 2 | done |',
        '| **合計** | — | **4** | **4** | — |',
      ];
      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches.some((m) => m.includes('T-01')), true, `T-01 の不一致が報告されない: ${_mismatches}`);
    });

    it('[Error] T-CTT-FM-03-01: 表に行がないタスク → 欠落として報告する', () => {
      // filter/strip の tasks.md で実際に起きた欠落（T-10 の行が両表にない）を固定する
      const _summary = [
        '| T-01: サンプルタスク | C1 | 2 | 3 | done |',
        '| **合計** | — | **2** | **3** | — |',
      ];
      const _balance = [
        '| T-01 | 2 | 1 | [N/A] | 3 | [OK] |',
        '| **合計** | **2** | **1** | **0** | **3** | — |',
      ];
      const _mismatches = findTableMismatches(_makeDoc(_summary, _balance));

      assertEquals(_mismatches.some((m) => m.includes('T-02')), true, `T-02 の欠落が報告されない: ${_mismatches}`);
    });

    it('[Error] T-CTT-FM-04-01: 各行は正しいが合計行だけずれている → 合計を報告する', () => {
      const _rows = [
        '| T-01: サンプルタスク | C1 | 2 | 3 | done |',
        '| T-02: サンプルタスク | C2 | 2 | 2 | done |',
        '| **合計** | — | **4** | **4** | — |',
      ];
      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches.some((m) => m.includes('合計')), true, `合計の不一致が報告されない: ${_mismatches}`);
    });
  });

  /** 空のカテゴリを `[N/A]` で表す既存記法と、集計表を持たない文書の免除の境界ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-CTT-FM-05-01: [N/A] は 0 件として扱われ不一致にならない', () => {
      // T-01 の Edge と T-02 の Error はいずれも実測 0 件で、表では [N/A] と書かれている
      assertEquals(findTableMismatches(_makeDoc(_SUMMARY_ROWS, _BALANCE_ROWS)), []);
    });

    it('[Edge] T-CTT-FM-10-01: 集計表を 1 つも持たない文書 → 検査対象外として空配列を返す', () => {
      // _BODY はタスク項目を持つが表を 1 つも持たない。表の欠落を報告しない免除の境界
      assertEquals(findTableMismatches(_BODY), []);
    });

    it('[Edge] T-CTT-FM-13-01: 表はあるが本文にタスク項目がない → 合計行のずれとして報告する', () => {
      // 表だけが残り本文が空になった文書。タスク行ごとの照合は走らず、合計と実測 0 のずれが出る
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        '# 見出しのみ',
        '',
        '本文。',
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(
        _mismatches.includes('Task Summary: 合計の Cases が 5 だが実測は 0'),
        true,
        `合計の Cases の不一致が報告されない: ${_mismatches}`,
      );
    });
  });

  /** Category Balance の Cases 列が検査対象から漏れていた退行を固定する異常ケース。 */
  describe('When: 異常系（Category Balance の Cases 列）', () => {
    it('[Error] T-CTT-FM-06-01: Category Balance の Cases が 1 少ない → 該当タスクを報告する', () => {
      // T-01 の Cases のみ 3 → 2。Normal/Error/Edge と合計行は実測と一致させたまま
      const _rows = [
        '| T-01 | 2 | 1 | [N/A] | 2 | [OK] |',
        '| T-02 | 1 | [N/A] | 1 | 2 | [OK] |',
        '| **合計** | **3** | **1** | **1** | **5** | — |',
      ];
      const _mismatches = findTableMismatches(_makeDoc(_SUMMARY_ROWS, _rows));

      // 行欠落メッセージも同じ 3 語を含むため、値の不一致であることまで文言で固定する
      assertEquals(
        _mismatches.includes('Category Balance: T-01 の Cases が 2 だが実測は 3'),
        true,
        `Category Balance の T-01 の Cases 不一致が報告されない: ${_mismatches}`,
      );
    });

    it('[Error] T-CTT-FM-07-01: 各行は正しいが Category Balance の合計 Cases だけずれている → 合計を報告する', () => {
      // 合計行の Cases のみ 5 → 4。各タスク行と合計の Normal/Error/Edge は実測と一致させたまま
      const _rows = [
        '| T-01 | 2 | 1 | [N/A] | 3 | [OK] |',
        '| T-02 | 1 | [N/A] | 1 | 2 | [OK] |',
        '| **合計** | **3** | **1** | **1** | **4** | — |',
      ];
      const _mismatches = findTableMismatches(_makeDoc(_SUMMARY_ROWS, _rows));

      assertEquals(
        _mismatches.includes('Category Balance: 合計の Cases が 4 だが実測は 5'),
        true,
        `Category Balance の合計の Cases 不一致が報告されない: ${_mismatches}`,
      );
    });
  });

  /**
   * `Cases` 列を持たない集計表を正しく表として認識する異常ケース。
   *
   * `Cases` は deckrd の生成仕様上の必須列ではなく当リポジトリのローカル慣習なので、
   * 表の識別条件に混ぜてはならない。混ぜると、その列を欠く表が「表がない」と誤診される。
   */
  describe('When: 異常系（Cases 列のない集計表）', () => {
    /** Cases 列を欠いた Task Summary 節を組み立てる。 */
    const _summarySectionWithoutCases = (rows: string[]): string[] => [
      '## Task Summary',
      '',
      '| Test Target | Commit | Scenarios | Status |',
      '| ----------- | ------ | --------- | ------ |',
      ...rows,
      '',
    ];

    /** Cases 列を欠いた Category Balance 節を組み立てる。 */
    const _balanceSectionWithoutCases = (rows: string[]): string[] => [
      '## Category Balance',
      '',
      '| Test Target | Normal | Error | Edge | 判定 |',
      '| ----------- | ------ | ----- | ---- | ---- |',
      ...rows,
      '',
    ];

    /** Cases 列を欠き、実測と一致する Task Summary の行。 */
    const _summaryRowsWithoutCases = [
      '| T-01: サンプルタスク | C1 | 2 | done |',
      '| T-02: サンプルタスク | C2 | 2 | done |',
      '| **合計** | — | **4** | — |',
    ];

    /** Cases 列を欠き、実測と一致する Category Balance の行。 */
    const _balanceRowsWithoutCases = [
      '| T-01 | 2 | 1 | [N/A] | [OK] |',
      '| T-02 | 1 | [N/A] | 1 | [OK] |',
      '| **合計** | **3** | **1** | **1** | — |',
    ];

    /** Cases 列のない Task Summary と、通常の Category Balance を組み合わせた文書。 */
    const _makeSummaryWithoutCasesDoc = (summaryRows: string[]): string =>
      [..._summarySectionWithoutCases(summaryRows), ..._balanceSection(_BALANCE_ROWS), _BODY].join('\n');

    /** 通常の Task Summary と、Cases 列のない Category Balance を組み合わせた文書。 */
    const _makeBalanceWithoutCasesDoc = (balanceRows: string[]): string =>
      [..._summarySection(_SUMMARY_ROWS), ..._balanceSectionWithoutCases(balanceRows), _BODY].join('\n');

    it('[Error] T-CTT-FM-11-01: Cases 列のない Task Summary → 「表がない」と誤診しない', () => {
      const _mismatches = findTableMismatches(_makeSummaryWithoutCasesDoc(_summaryRowsWithoutCases));

      assertEquals(_mismatches, [], `Cases 列がないだけで誤診された: ${_mismatches}`);
    });

    it('[Error] T-CTT-FM-11-02: Cases 列のない Task Summary でも Scenarios のずれを検出する', () => {
      // T-01 の Scenarios を 2 → 9 とずらす。合計行は実測と一致させたまま
      const _rows = [
        '| T-01: サンプルタスク | C1 | 9 | done |',
        '| T-02: サンプルタスク | C2 | 2 | done |',
        '| **合計** | — | **4** | — |',
      ];
      const _mismatches = findTableMismatches(_makeSummaryWithoutCasesDoc(_rows));

      assertEquals(
        _mismatches.includes('Task Summary: T-01 の Scenarios が 9 だが実測は 2'),
        true,
        `Scenarios のずれが報告されない: ${_mismatches}`,
      );
    });

    it('[Error] T-CTT-FM-11-03: Cases 列のない Category Balance → 「表がない」と誤診しない', () => {
      const _mismatches = findTableMismatches(_makeBalanceWithoutCasesDoc(_balanceRowsWithoutCases));

      assertEquals(_mismatches, [], `Cases 列がないだけで誤診された: ${_mismatches}`);
    });

    it('[Error] T-CTT-FM-11-04: Cases 列のない Category Balance でも Normal のずれを検出する', () => {
      // T-01 の Normal を 2 → 1 とずらす。合計行は実測と一致させたまま
      const _rows = [
        '| T-01 | 1 | 1 | [N/A] | [OK] |',
        '| T-02 | 1 | [N/A] | 1 | [OK] |',
        '| **合計** | **3** | **1** | **1** | — |',
      ];
      const _mismatches = findTableMismatches(_makeBalanceWithoutCasesDoc(_rows));

      assertEquals(
        _mismatches.includes('Category Balance: T-01 の Normal が 1 だが実測は 2'),
        true,
        `Normal のずれが報告されない: ${_mismatches}`,
      );
    });
  });

  /** 一方の集計表ごと欠けている文書が素通りしていた退行を固定する異常ケース。 */
  describe('When: 異常系（集計表の欠落）', () => {
    it('[Error] T-CTT-FM-08-01: Category Balance 表がない → 表の欠落を 1 件報告する', () => {
      // Task Summary は実測と一致しているので、報告は Category Balance の欠落 1 件だけになる
      const _mismatches = findTableMismatches(_makeSummaryOnlyDoc(_SUMMARY_ROWS));

      assertEquals(_mismatches.length, 1, `報告が 1 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches[0].includes('Category Balance') && _mismatches[0].includes('表'),
        true,
        `Category Balance の表の欠落が報告されない: ${_mismatches}`,
      );
    });

    it('[Error] T-CTT-FM-09-01: Task Summary 表がない → 表の欠落を 1 件報告する', () => {
      // Category Balance は実測と一致しているので、報告は Task Summary の欠落 1 件だけになる
      const _mismatches = findTableMismatches(_makeBalanceOnlyDoc(_BALANCE_ROWS));

      assertEquals(_mismatches.length, 1, `報告が 1 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches[0].includes('Task Summary') && _mismatches[0].includes('表'),
        true,
        `Task Summary の表の欠落が報告されない: ${_mismatches}`,
      );
    });

    it('[Error] T-CTT-FM-12-01: 見出しはあるが表が 2 つとも壊れている → 表の欠落を 2 件報告する', () => {
      // 節見出しは残っているが、ヘッダ行を持つ表が 1 つも無い（cle-so1 の指摘）
      const _doc = [
        '## Task Summary',
        '',
        '表が壊れています（ヘッダ行なし）',
        '',
        '## Category Balance',
        '',
        '表が壊れています（ヘッダ行なし）',
        '',
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches.length, 2, `報告が 2 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches.some((m) => m.includes('Task Summary') && m.includes('表')),
        true,
        `Task Summary の表の欠落が報告されない: ${_mismatches}`,
      );
      assertEquals(
        _mismatches.some((m) => m.includes('Category Balance') && m.includes('表')),
        true,
        `Category Balance の表の欠落が報告されない: ${_mismatches}`,
      );
    });
  });
});

/**
 * リポジトリ内の全 deckrd `tasks.md` を走査し、集計表の不一致が 0 件であることを保証する。
 *
 * 表を更新せずにタスク項目を追加すると本ケースが落ちる。
 *
 * テスト ID 範囲: T-CTT-RP-01-01 〜 T-CTT-RP-01-02
 *
 * @see collectTaskDocs
 * @see findTableMismatches
 */
describe('リポジトリ全体の tasks.md 集計表', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CTT-RP-01-01: 全 tasks.md を通して集計表の不一致が 0 件である', async () => {
      const _docs = await collectTaskDocs(Deno.cwd());
      const _report = _docs.flatMap((doc) => findTableMismatches(doc.source).map((m) => `${doc.path}: ${m}`));

      assertEquals(_report, [], `集計表が実測とずれている:\n${_report.join('\n')}`);
    });

    it('[Normal] T-CTT-RP-01-02: 走査結果が空でない（パイプラインが壊れていない）', async () => {
      const _docs = await collectTaskDocs(Deno.cwd());
      assertEquals(_docs.length > 0, true, 'deckrd の tasks.md が 1 件も収集できていない');
    });
  });
});
