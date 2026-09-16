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

/**
 * 実測と一致する 2 つの集計表の前に、見出し `## Overview` の節として別の表を置いた文書を組み立てる。
 *
 * @param tableLines - 節より前に置く表の行（ヘッダ・区切りを含む）
 * @returns 検査対象の Markdown 文字列
 */
const _makeDocWithLeadingTable = (tableLines: string[]): string =>
  ['## Overview', '', ...tableLines, '', _makeDoc(_SUMMARY_ROWS, _BALANCE_ROWS)].join('\n');

// ─── Tests

/**
 * `countTasks` は本文の見出しとチェックリスト項目から、タスクごとの実測値を集計する。
 *
 * `### [分類]` 見出しでカテゴリを切り替え、`#### T-NN-MM` をシナリオ、
 * `- [x] **T-NN-MM-KK**` をケースとして数える。コードフェンス内の行は数えない。
 *
 * テスト ID 範囲: T-CTT-CT-01-01 〜 T-CTT-CT-03-03
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

  /** タスク見出しを含まない入力と、コードフェンス内の行の境界ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-CTT-CT-02-01: タスク見出しがない本文 → 空の Map を返す', () => {
      assertEquals(countTasks('# 見出しのみ\n\n本文。').size, 0);
    });

    it('[Edge] T-CTT-CT-03-01: フェンス内の ## T-09: 見出し → タスクとして数えない', () => {
      const _source = [_BODY, '', '```markdown', `## T-09: フェンス内のタスク`, '```'].join('\n');

      const _counts = countTasks(_source);

      assertEquals(_counts.has(`T-09`), false);
      assertEquals(_counts.size, 2);
      assertEquals(_counts.get('T-01'), { scenarios: 2, normal: 2, error: 1, edge: 0, cases: 3 });
      assertEquals(_counts.get('T-02'), { scenarios: 2, normal: 1, error: 0, edge: 1, cases: 2 });
    });

    it('[Edge] T-CTT-CT-03-02: 既存タスク配下のフェンス内の項目・シナリオ見出し → 数えない', () => {
      const _source = [
        _BODY,
        '',
        '```markdown',
        '### [正常] Normal Cases',
        `#### T-02-03: フェンス内のシナリオ`,
        `- [x] **T-02-03-01**: フェンス内のケース`,
        '```',
      ].join('\n');

      const _counts = countTasks(_source);

      assertEquals(_counts.get('T-02'), { scenarios: 2, normal: 1, error: 0, edge: 1, cases: 2 });
    });

    it('[Edge] T-CTT-CT-03-03: T-02 見出しの直前に閉じない ``` がある → T-01 だけを数える', () => {
      // 閉じないフェンスは文書末尾まで続く。フェンス内を隠さないと、T-02 も数えて件数が 2 になる
      const _lines = _BODY.split('\n');
      const _t02 = _lines.indexOf(`## T-02: サンプルタスク`);
      const _source = [..._lines.slice(0, _t02), '```', ..._lines.slice(_t02)].join('\n');

      const _counts = countTasks(_source);

      assertEquals(_counts.size, 1);
      assertEquals(_counts.get('T-01'), { scenarios: 2, normal: 2, error: 1, edge: 0, cases: 3 });
    });
  });
});

/**
 * `findTableMismatches` は 2 つの集計表の各行・合計行を実測値と照合し、不一致を列挙する。
 *
 * 表が実態からずれたまま放置される（行の欠落・合計の据え置き）ことを防ぐのが目的。
 *
 * テスト ID 範囲: T-CTT-FM-01-01 〜 T-CTT-FM-21-08
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

    it('[Error] T-CTT-FM-11-05: Cases 列のない Task Summary で行がない → 実測にヘッダにない Cases を並べない', () => {
      // T-02 の行を除く
      const _rows = _summaryRowsWithoutCases.filter((_, i) => i !== 1);
      const _mismatches = findTableMismatches(_makeSummaryWithoutCasesDoc(_rows));

      assertEquals(_mismatches, ['Task Summary: T-02 の行がない（実測 Scenarios=2）']);
    });

    it('[Error] T-CTT-FM-11-06: Cases 列のない Task Summary で合計行がない → 実測にヘッダにない Cases を並べない', () => {
      // 合計行を除く
      const _rows = _summaryRowsWithoutCases.slice(0, -1);
      const _mismatches = findTableMismatches(_makeSummaryWithoutCasesDoc(_rows));

      assertEquals(_mismatches, ['Task Summary: 合計の行がない（実測 Scenarios=4）']);
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

  /** 節見出しより前にある別の表を集計表として横取りしていた退行を固定する異常ケース。 */
  describe('When: 異常系（節より前にある別の表）', () => {
    it('[Error] T-CTT-FM-14-01: Scenarios 列を持つ別表が Task Summary 節より前にある → 空配列を返す', () => {
      // 節より前の表は実測と一致しない（T-01 が 9、T-02 の行が無い）。拾われれば不一致が報告される
      const _doc = _makeDocWithLeadingTable([
        '| Test Target | Scenarios |',
        '| --- | --- |',
        '| T-01 | 9 |',
      ]);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Error] T-CTT-FM-14-02: Normal/Error/Edge 列を持つ別表が Category Balance 節より前にある → 空配列を返す', () => {
      // 節より前の表は実測と一致しない（T-01 が 9/9/9、T-02 の行が無い）。拾われれば不一致が報告される
      const _doc = _makeDocWithLeadingTable([
        '| Test Target | Normal | Error | Edge |',
        '| --- | --- | --- | --- |',
        '| T-01 | 9 | 9 | 9 |',
      ]);

      assertEquals(findTableMismatches(_doc), []);
    });
  });

  /** 節の終端（次の '## '）より後ろにある表を集計表として拾わないことを固定する異常ケース。 */
  describe('When: 異常系（節より後ろにある別の表）', () => {
    it('[Error] T-CTT-FM-20-01: Task Summary 節に表が無く、次の ## Other 節に Scenarios 列の表がある → Task Summary の表の欠落を 1 件報告する', () => {
      // 次節の表は実測と一致するため、節の終端を越えて拾われると報告が 0 件になる
      const _doc = [
        '## Task Summary',
        '',
        '表はありません',
        '',
        '## Other',
        '',
        '| Test Target | Commit | Scenarios | Cases | Status |',
        '| ----------- | ------ | --------- | ----- | ------ |',
        ..._SUMMARY_ROWS,
        '',
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches.length, 1, `報告が 1 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches[0].includes('Task Summary') && _mismatches[0].includes('表'),
        true,
        `Task Summary の表の欠落が報告されない: ${_mismatches}`,
      );
    });

    it('[Error] T-CTT-FM-20-02: Category Balance 節に表が無く、次の ## Other 節に Normal/Error/Edge 列の表がある → Category Balance の表の欠落を 1 件報告する', () => {
      // 次節の表は実測と一致するため、節の終端を越えて拾われると報告が 0 件になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        '## Category Balance',
        '',
        '表はありません',
        '',
        '## Other',
        '',
        '| Test Target | Normal | Error | Edge | Cases | 判定 |',
        '| ----------- | ------ | ----- | ---- | ----- | ---- |',
        ..._BALANCE_ROWS,
        '',
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches.length, 1, `報告が 1 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches[0].includes('Category Balance') && _mismatches[0].includes('表'),
        true,
        `Category Balance の表の欠落が報告されない: ${_mismatches}`,
      );
    });
  });

  /** 同じ節見出しが複数ある文書で、2 つ目以降の節が黙って無視されないことを固定する異常ケースと、フェンス内の見出しを数えない境界ケース。 */
  describe('When: 異常系（重複した節見出し）', () => {
    it('[Error] T-CTT-FM-21-01: 実測一致の Task Summary 節が 2 つある → Task Summary の重複見出しだけを 1 件報告する', () => {
      // どちらの節も実測と一致するため、重複を検出しなければ報告が 0 件になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, ['Task Summary: 節見出しが 2 件ある']);
    });

    it('[Error] T-CTT-FM-21-02: 2 つ目の Task Summary 節の表だけが実測とずれている → 重複見出しの報告が含まれる', () => {
      // 2 つ目の節は照合しないため、ずれ自体は報告されない。重複を検出しなければ報告が 0 件になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._summarySection([
          '| T-01: サンプルタスク | C1 | 2 | 3 | done |',
          '| **合計** | — | **2** | **3** | — |',
        ]),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, ['Task Summary: 節見出しが 2 件ある']);
    });

    it('[Error] T-CTT-FM-21-03: 実測一致の Category Balance 節が 2 つある → Category Balance の重複見出しだけを 1 件報告する', () => {
      // どちらの節も実測と一致するため、重複を検出しなければ報告が 0 件になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, ['Category Balance: 節見出しが 2 件ある']);
    });

    it('[Edge] T-CTT-FM-21-04: コードフェンス内にもう 1 つ ## Task Summary がある → 重複として数えず空配列を返す', () => {
      // 重複の件数をフェンスのマスク前の行で数えると、フェンス内の見出しで誤って重複を報告する
      const _doc = [_makeDoc(_SUMMARY_ROWS, _BALANCE_ROWS), '', '```markdown', '## Task Summary', '```'].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, []);
    });

    it('[Error] T-CTT-FM-21-05: 1 つ目の Task Summary 節の T-01 の Cases がずれた節が 2 つある → 重複報告を照合結果より前に並べる', () => {
      // 重複報告を照合結果の後ろに並べると、配列の順序が入れ替わって RED になる
      const _rows = [
        '| T-01: サンプルタスク | C1 | 2 | 2 | done |',
        '| T-02: サンプルタスク | C2 | 2 | 2 | done |',
        '| **合計** | — | **4** | **5** | — |',
      ];
      const _doc = [
        ..._summarySection(_rows),
        ..._summarySection(_rows),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, [
        'Task Summary: 節見出しが 2 件ある',
        'Task Summary: T-01 の Cases が 2 だが実測は 3',
      ]);
    });

    it('[Error] T-CTT-FM-21-06: 実測一致の Task Summary 節が 3 つある → 実際の件数 3 を報告する', () => {
      // 件数を 2 に固定すると、3 件の重複が 2 件と報告されて RED になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._summarySection(_SUMMARY_ROWS),
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, ['Task Summary: 節見出しが 3 件ある']);
    });

    it('[Error] T-CTT-FM-21-07: Task Summary と Category Balance の節が 2 つずつある → 両方の重複を Summary、Balance の順に報告する', () => {
      // Balance の重複報告を Summary より前に並べると、順序が入れ替わって RED になる
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, ['Task Summary: 節見出しが 2 件ある', 'Category Balance: 節見出しが 2 件ある']);
    });

    it('[Error] T-CTT-FM-21-08: 1 つ目の Category Balance 節の T-01 の Cases がずれた節が 2 つある → 重複報告を照合結果より前に並べる', () => {
      // Balance の重複報告を照合結果の後ろに並べると、配列の順序が入れ替わって RED になる
      const _rows = [
        '| T-01 | 2 | 1 | [N/A] | 2 | [OK] |',
        '| T-02 | 1 | [N/A] | 1 | 2 | [OK] |',
        '| **合計** | **3** | **1** | **1** | **5** | — |',
      ];
      const _doc = [
        ..._summarySection(_SUMMARY_ROWS),
        ..._balanceSection(_rows),
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches, [
        'Category Balance: 節見出しが 2 件ある',
        'Category Balance: T-01 の Cases が 2 だが実測は 3',
      ]);
    });
  });

  /** コードフェンス内の見出しを節見出しとみなしていた退行を固定するエッジケース。 */
  describe('When: エッジケース（コードフェンス）', () => {
    it('[Edge] T-CTT-FM-15-01: コードフェンス内にだけ ## Task Summary がある → 検査対象外として空配列を返す', () => {
      // フェンス内の見出しを節見出しとみなすと、「表がない」が 2 件報告される
      const _doc = ['```markdown', '## Task Summary', '```', '', _BODY].join('\n');

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-15-02: 見出しはあるが節内の表がコードフェンス内にしかない → Task Summary の表の欠落を 1 件報告する', () => {
      // フェンス内の表は実測と一致するため、表として拾われると報告が 0 件になる
      const _doc = [
        '## Task Summary',
        '',
        '```markdown',
        '| Test Target | Commit | Scenarios | Cases | Status |',
        '| ----------- | ------ | --------- | ----- | ------ |',
        ..._SUMMARY_ROWS,
        '```',
        '',
        ..._balanceSection(_BALANCE_ROWS),
        _BODY,
      ].join('\n');
      const _mismatches = findTableMismatches(_doc);

      assertEquals(_mismatches.length, 1, `報告が 1 件でない: ${_mismatches}`);
      assertEquals(
        _mismatches[0].includes('Task Summary') && _mismatches[0].includes('表'),
        true,
        `Task Summary の表の欠落が報告されない: ${_mismatches}`,
      );
    });
  });

  /** 分割後の行末に空白や CR が残っても、節見出しを認識するケース。 */
  describe('When: エッジケース（行末の空白・CR）', () => {
    /** FM-02-01 と同じ行。T-01 の Cases を 2 と宣言する（実測は 3）。 */
    const _rows = [
      '| T-01: サンプルタスク | C1 | 2 | 2 | done |',
      '| T-02: サンプルタスク | C2 | 2 | 2 | done |',
      '| **合計** | — | **4** | **4** | — |',
    ];

    it('[Edge] T-CTT-FM-16-01: CRLF 改行の文書で T-01 の Cases がずれている → 該当タスクを報告する', () => {
      // 行末の CR を除かないと見出しが一致せず、検査対象外の空配列になる
      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS).replaceAll('\n', '\r\n'));

      assertEquals(
        _mismatches.includes('Task Summary: T-01 の Cases が 2 だが実測は 3'),
        true,
        `T-01 の不一致が報告されない: ${_mismatches}`,
      );
    });

    it('[Edge] T-CTT-FM-16-02: 見出し末尾に空白がある文書で T-01 の Cases がずれている → 該当タスクを報告する', () => {
      // 行末の空白を除かないと見出しが一致せず、検査対象外の空配列になる
      const _mismatches = findTableMismatches(
        _makeDoc(_rows, _BALANCE_ROWS).replace('## Task Summary', '## Task Summary '),
      );

      assertEquals(
        _mismatches.includes('Task Summary: T-01 の Cases が 2 だが実測は 3'),
        true,
        `T-01 の不一致が報告されない: ${_mismatches}`,
      );
    });
  });

  /**
   * 期待列のセルが数値として読めない、または行にセルが無い異常ケース。
   *
   * 読めない値を黙って検査対象から外さず、該当するセルを報告する。
   */
  describe('When: 異常系（読めないセル・欠落したセル）', () => {
    it('[Error] T-CTT-FM-17-01: Task Summary の T-01 の Cases が「6 件」 → 数値として読めないと報告する', () => {
      const _rows = _SUMMARY_ROWS.with(0, '| T-01: サンプルタスク | C1 | 2 | 6 件 | done |');

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, ['Task Summary: T-01 の Cases が数値として読めない（"6 件"）']);
    });

    it('[Error] T-CTT-FM-17-02: Category Balance の T-01 行に Cases・判定のセルが無い → Cases のセル欠落だけを報告する', () => {
      const _rows = _BALANCE_ROWS.with(0, '| T-01 | 2 | 1 | [N/A] |');

      const _mismatches = findTableMismatches(_makeDoc(_SUMMARY_ROWS, _rows));

      assertEquals(_mismatches, ['Category Balance: T-01 の Cases のセルがない']);
    });

    it('[Error] T-CTT-FM-17-03: Task Summary の合計行の Cases が「**5 件**」 → 合計の Cases が数値として読めないと報告する', () => {
      const _rows = _SUMMARY_ROWS.with(2, '| **合計** | — | **4** | **5 件** | — |');

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, ['Task Summary: 合計の Cases が数値として読めない（"**5 件**"）']);
    });

    it('[Error] T-CTT-FM-17-04: Task Summary の T-01 の Cases が空セル → 空文字列を添えて数値として読めないと報告する', () => {
      const _rows = _SUMMARY_ROWS.with(0, '| T-01: サンプルタスク | C1 | 2 |  | done |');

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, ['Task Summary: T-01 の Cases が数値として読めない（""）']);
    });

    it('[Error] T-CTT-FM-17-05: Task Summary の合計行に Cases 以降のセルが無い → 合計の Cases のセル欠落を報告する', () => {
      const _rows = _SUMMARY_ROWS.with(2, '| **合計** | — | **4** |');

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, ['Task Summary: 合計の Cases のセルがない']);
    });
  });

  /** 期待列以外のセルだけが欠けていても、欠落として報告しないエッジケース。 */
  describe('When: エッジケース（期待列以外のセル欠落）', () => {
    it('[Edge] T-CTT-FM-17-06: Task Summary の T-01 行に期待列以外の Status のセルだけが無い → 欠落を報告しない', () => {
      const _rows = _SUMMARY_ROWS.with(0, '| T-01: サンプルタスク | C1 | 2 | 3 |');

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, []);
    });
  });

  /**
   * 表（ヘッダ行）はあるが合計行が無い異常ケース。
   *
   * 合計の照合を黙って飛ばさず、実測の合計を添えて合計行の欠落を報告する。
   */
  describe('When: 異常系（合計行の欠落）', () => {
    it('[Error] T-CTT-FM-18-01: Task Summary に合計行が無い → 実測の合計を添えて合計行の欠落を報告する', () => {
      const _rows = _SUMMARY_ROWS.slice(0, -1);

      const _mismatches = findTableMismatches(_makeDoc(_rows, _BALANCE_ROWS));

      assertEquals(_mismatches, ['Task Summary: 合計の行がない（実測 Scenarios=4 Cases=5）']);
    });

    it('[Error] T-CTT-FM-18-02: Category Balance に合計行が無い → 実測の合計を添えて合計行の欠落を報告する', () => {
      const _rows = _BALANCE_ROWS.slice(0, -1);

      const _mismatches = findTableMismatches(_makeDoc(_SUMMARY_ROWS, _rows));

      assertEquals(_mismatches, ['Category Balance: 合計の行がない（実測 Normal=3 Error=1 Edge=1 Cases=5）']);
    });
  });

  /**
   * `~~~` のフェンスも隠し、フェンス内の `## ` 行を節の終端とみなさないことを固定するエッジケース。
   *
   * 閉じ区切りの判定（記号の種類・個数・info 文字列）と、閉じないフェンスが文書末尾まで隠すことも固定する。
   */
  describe('When: エッジケース（コードフェンスの種類）', () => {
    /** Task Summary 節の見出しと表の間に `fence` の行を挟んだ文書を組み立てる。 */
    const _makeDocWithFence = (fence: string[]): string => {
      const [_heading, _blank, ..._table] = _summarySection(_SUMMARY_ROWS);
      return [_heading, _blank, ...fence, ..._table, ..._balanceSection(_BALANCE_ROWS), _BODY].join('\n');
    };

    it('[Edge] T-CTT-FM-19-01: Task Summary 節の見出しと表の間に ~~~ フェンスがあり中に ## x がある → 空配列を返す', () => {
      // フェンス内の ## x を節の終端とみなすと、Task Summary の表の欠落が報告される
      const _doc = _makeDocWithFence(['~~~', '## x', '~~~']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-02: Task Summary 節の見出しと表の間に 4 連バッククォートのフェンスがあり中に 3 連バッククォート行と ## x がある → 空配列を返す', () => {
      // 内側の ``` でフェンスを閉じると、## x が節の終端になり Task Summary の表の欠落が報告される
      const _doc = _makeDocWithFence(['````markdown', '```', '## x', '```', '````']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-03: Task Summary 節の見出しと表の間に 2 スペース字下げの ``` フェンスがあり中に ## x がある → 空配列を返す', () => {
      // 字下げしたフェンスを認識しないと、## x が節の終端になり Task Summary の表の欠落が報告される
      const _doc = _makeDocWithFence(['  ```', '## x', '  ```']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-04: Task Summary 節の見出しと表の間に 4 スペース字下げの ``` フェンスがあり中に ## x がある → 空配列を返す', () => {
      // 字下げ幅を 3 以下に制限すると、## x が節の終端になり Task Summary の表の欠落が報告される
      const _doc = _makeDocWithFence(['    ```', '## x', '    ```']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-05: Task Summary 節の見出しと表の間に ``` フェンスがあり中に ~~~ 行と ## x がある → 空配列を返す', () => {
      // ~~~ でフェンスを閉じると、末尾の ``` が新たなフェンスを開いて表以降を隠し、両表の欠落が報告される
      const _doc = _makeDocWithFence(['```', '~~~', '## x', '```']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-06: Task Summary 節の見出しと表の間の ``` フェンスを 4 連バッククォートで閉じる → 空配列を返す', () => {
      // 開始と同じ個数でしか閉じないと、フェンスが文書末尾まで続き両表の欠落が報告される
      const _doc = _makeDocWithFence(['```', '## x', '````']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-07: Task Summary 節の見出しと表の間の ``` フェンス内に ```js 行と ## x がある → 空配列を返す', () => {
      // info 文字列付きの ```js でフェンスを閉じると、末尾の ``` が新たなフェンスを開いて表以降を隠し、両表の欠落が報告される
      const _doc = _makeDocWithFence(['```', '```js', '## x', '```']);

      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-08: 文書先頭に閉じない ```markdown があり後ろに T-01 行を欠く表がある → 検査対象外として空配列を返す', () => {
      // 閉じないフェンスは文書末尾まで続く。フェンス内を隠さないと、T-01 行の欠落が報告される
      const _lines = [..._summarySection(_SUMMARY_ROWS.slice(1)), ..._balanceSection(_BALANCE_ROWS), _BODY];
      const _doc = ['```markdown', ..._lines].join('\n');

      assertEquals(
        findTableMismatches(_lines.join('\n')).length > 0,
        true,
        'フェンスが無くても不一致が出ない入力になっている',
      );
      assertEquals(findTableMismatches(_doc), []);
    });

    it('[Edge] T-CTT-FM-19-09: Task Summary 節の見出しと表の間に閉じない ``` がある → 両表の欠落を報告する', () => {
      // 見出しはフェンスより前なので残り、表・Category Balance 節・本文は末尾まで隠れて実測も 0 件になる
      // フェンス内を隠さないと、表が実測と一致して報告が 0 件になる
      const _doc = _makeDocWithFence(['```']);

      assertEquals(findTableMismatches(_doc), [
        'Task Summary: 表がない（実測はタスク 0 件）',
        'Category Balance: 表がない（実測はタスク 0 件）',
      ]);
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
