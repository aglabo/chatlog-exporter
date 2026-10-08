// src: scripts/testing/mutation/__tests__/unit/classify-outcome.unit.spec.ts
// @(#): classify-outcome のユニットテスト
//       対象: stripAnsi / parseSummary / classifyOutcome
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyOutcome, parseSummary, stripAnsi } from '../../classify-outcome.ts';

// ─── Helpers
// types
import type { MutantStatus, TestRunOutcome, TestSummary } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// types
/** `parseSummary` のテーブル駆動ケース。 */
type _SummaryCase = {
  /** テスト ID。 */
  id: string;
  /** ANSI エスケープを除いた deno test の出力。 */
  input: string;
  /** 期待するテスト件数。 */
  expected: TestSummary;
};

/** `parseSummary` のエッジケース用テーブル駆動ケース。未検出 (`undefined`) を期待するケースを含む。 */
type _SummaryEdgeCase = {
  /** テスト ID。 */
  id: string;
  /** ケースの説明 (it ラベルに埋め込む)。 */
  title: string;
  /** ANSI エスケープを除いた deno test の出力。 */
  input: string;
  /** 期待するテスト件数。要約行とみなさない場合は `undefined`。 */
  expected: TestSummary | undefined;
};

/** `classifyOutcome` のテーブル駆動ケース。 */
type _OutcomeCase = {
  /** テスト ID。 */
  id: string;
  /** ケースの説明 (it ラベルに埋め込む)。 */
  title: string;
  /** 判定に渡すテスト実行の結果。 */
  outcome: TestRunOutcome;
  /** 期待する判定。 */
  expected: MutantStatus;
};

// ─── Tests

/**
 * `stripAnsi` のユニットテストスイート。
 *
 * deno の出力に含まれる ANSI エスケープ (色付け) を除くことを検証する (execution DD-03)。
 *
 * テスト ID 範囲: T-MUT-CO-01-01, T-MUT-CO-06-01
 *
 * @see stripAnsi
 */
describe('stripAnsi', () => {
  /**
   * 色付けのエスケープを除いた文字列を返す (execution DD-03 / Edge execution-6)。
   */
  describe('ANSI エスケープの除去', () => {
    /** 色付けされた文字列を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-CO-01-01: 色付けされた error: Type checking failed. → エスケープを除いた文字列', () => {
        assertEquals(
          stripAnsi('\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed.'),
          'error: Type checking failed.',
        );
      });
    });

    /** エスケープを含まない文字列を渡すエッジケース (execution DD-03)。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-CO-06-01: エスケープを含まない ok | 1 passed | 0 failed → 入力と同一の文字列', () => {
        assertEquals(stripAnsi('ok | 1 passed | 0 failed'), 'ok | 1 passed | 0 failed');
      });
    });
  });
});

/**
 * `parseSummary` のユニットテストスイート。
 *
 * deno test の要約行からテスト件数 (passed / failed) を取り出すことを検証する (execution R-222 / DD-06 / DD-12)。
 *
 * テスト ID 範囲: T-MUT-CO-02-01 〜 T-MUT-CO-02-03, T-MUT-CO-04-01, T-MUT-CO-14-01 〜 T-MUT-CO-14-02,
 *                 T-MUT-CO-15-01 〜 T-MUT-CO-15-02, T-MUT-CO-16-01
 *
 * @see parseSummary
 */
describe('parseSummary', () => {
  /**
   * 要約行から passed / failed のテスト件数を取り出す (execution R-222 / DD-06 / DD-12)。
   */
  describe('要約行の解析', () => {
    /** 要約行を含む出力を渡す正常ケース。 */
    describe('When: 正常系', () => {
      /** 成功・失敗・step 件数の注記付きの要約行。step 件数 (9 / 3) ではなくテスト件数を取り出す (execution DD-06)。 */
      const _summaryCases: _SummaryCase[] = [
        { id: 'T-MUT-CO-02-01', input: 'ok | 5 passed | 0 failed (12ms)', expected: { passed: 5, failed: 0 } },
        { id: 'T-MUT-CO-02-02', input: 'FAILED | 3 passed | 2 failed (40ms)', expected: { passed: 3, failed: 2 } },
        {
          id: 'T-MUT-CO-02-03',
          input: 'FAILED | 2 passed (9 steps) | 1 failed (3 steps) (51ms)',
          expected: { passed: 2, failed: 1 },
        },
      ];

      for (const { id, input, expected } of _summaryCases) {
        it(`[Normal] ${id}: ${input} → { passed: ${expected.passed}, failed: ${expected.failed} }`, () => {
          assertEquals(parseSummary(input), expected);
        });
      }
    });

    /** 要約行を含まない出力を渡す異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-CO-04-01: 要約行の無い error: Module not found ... → 件数を返さず undefined', () => {
        assertEquals(parseSummary('error: Module not found "file:///x.ts".'), undefined);
      });
    });

    /** 付加セグメントを持つ要約行・要約行と同じ形の行が複数ある出力・`failed` に語が続く行を渡すエッジケース (execution DD-06 / DD-12)。 */
    describe('When: エッジケース', () => {
      /** deno の本物の要約行は常に末尾にあるため、最後の要約行から件数を取り出す (execution R-222 / Edge execution-31)。 */
      const _summaryEdgeCases: _SummaryEdgeCase[] = [
        {
          id: 'T-MUT-CO-14-01',
          title: 'failed の後に | 2 ignored が続く要約行 → ignored を混ぜずに passed / failed の件数',
          input: 'FAILED | 3 passed | 1 failed | 2 ignored (20ms)',
          expected: { passed: 3, failed: 1 },
        },
        {
          id: 'T-MUT-CO-14-02',
          title: 'failed の後に | 3 filtered out が続く要約行 → filtered out を混ぜずに passed / failed の件数',
          input: 'ok | 2 passed | 0 failed | 3 filtered out (7ms)',
          expected: { passed: 2, failed: 0 },
        },
        {
          id: 'T-MUT-CO-15-01',
          title: '要約行が 2 行 (最後が failed >= 1) の出力 → 最後の要約行の件数',
          input: 'ok | 99 passed | 0 failed\nFAILED | 0 passed | 1 failed',
          expected: { passed: 0, failed: 1 },
        },
        {
          id: 'T-MUT-CO-15-02',
          title: '要約行が 2 行 (先頭が failed >= 1) の出力 → 最後の要約行の件数',
          input: 'FAILED | 0 passed | 1 failed\nok | 99 passed | 0 failed',
          expected: { passed: 99, failed: 0 },
        },
        {
          id: 'T-MUT-CO-16-01',
          title: 'failed の直後に語が続く FAILED | 0 passed | 1 failedness → 要約行とみなさない',
          input: 'FAILED | 0 passed | 1 failedness',
          expected: undefined,
        },
      ];

      for (const { id, title, input, expected } of _summaryEdgeCases) {
        it(`[Edge] ${id}: ${title}`, () => {
          assertEquals(parseSummary(input), expected);
        });
      }
    });
  });
});

/**
 * `classifyOutcome` のユニットテストスイート。
 *
 * テスト実行の結果 (`TestRunOutcome`) から変異体の判定 (`MutantStatus`) を導くことを検証する
 * (execution R-220 〜 R-224 / DD-03 / DD-12)。
 *
 * テスト ID 範囲: T-MUT-CO-03-01 〜 T-MUT-CO-03-05, T-MUT-CO-05-01 〜 T-MUT-CO-05-03, T-MUT-CO-07-01,
 *                 T-MUT-CO-08-01 〜 T-MUT-CO-08-02, T-MUT-CO-09-01 〜 T-MUT-CO-09-02, T-MUT-CO-10-01 〜 T-MUT-CO-10-02,
 *                 T-MUT-CO-11-01, T-MUT-CO-12-01, T-MUT-CO-13-01, T-MUT-CO-15-03
 *
 * @see classifyOutcome
 */
describe('classifyOutcome', () => {
  /**
   * 5 種の判定 (survived / compile-error / killed / timeout / error) を導く (execution R-220 〜 R-224)。
   */
  describe('5 種の判定', () => {
    /** 各判定に至る代表的な実行結果を渡す正常ケース。 */
    describe('When: 正常系', () => {
      /** 5 種の判定それぞれに至る代表的な実行結果 (execution R-220 〜 R-224)。 */
      const _verdictCases: _OutcomeCase[] = [
        {
          id: 'T-MUT-CO-03-01',
          title: '終了コード 0',
          outcome: { kind: 'exited', code: 0, stdout: 'ok | 4 passed | 0 failed', stderr: '' },
          expected: 'survived',
        },
        {
          id: 'T-MUT-CO-03-02',
          title: '非 0 + 行頭の error: Type checking failed. (killed ではない)',
          outcome: { kind: 'exited', code: 1, stdout: '', stderr: 'error: Type checking failed.\n' },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-03-03',
          title: '非 0 + 要約行の failed >= 1',
          outcome: { kind: 'exited', code: 1, stdout: 'FAILED | 3 passed | 1 failed (20ms)', stderr: '' },
          expected: 'killed',
        },
        {
          id: 'T-MUT-CO-03-04',
          title: '制限時間で終了させた',
          outcome: { kind: 'timeout' },
          expected: 'timeout',
        },
        {
          id: 'T-MUT-CO-03-05',
          title: '起動の失敗',
          outcome: { kind: 'error', message: 'spawn failed' },
          expected: 'error',
        },
      ];

      for (const { id, title, outcome, expected } of _verdictCases) {
        it(`[Normal] ${id}: ${title} → ${expected}`, () => {
          assertEquals(classifyOutcome(outcome), expected);
        });
      }
    });

    /** テストの失敗を確認できない非 0 終了を渡す異常ケース。 */
    describe('When: 異常系', () => {
      /** テストの失敗を確認できない非 0 終了 (execution R-224 / DD-12)。いずれも error になる。 */
      const _unconfirmedFailureCases: _OutcomeCase[] = [
        {
          id: 'T-MUT-CO-05-01',
          title: '非 0 で出力が空',
          outcome: { kind: 'exited', code: 1, stdout: '', stderr: '' },
          expected: 'error',
        },
        {
          id: 'T-MUT-CO-05-02',
          title: '依存解決の失敗 (error: Module not found) で要約行が無い非 0 終了 (killed ではない)',
          outcome: { kind: 'exited', code: 1, stdout: '', stderr: 'error: Module not found "file:///x.ts".' },
          expected: 'error',
        },
        {
          id: 'T-MUT-CO-05-03',
          title: '要約行の failed が 0 の非 0 終了',
          outcome: { kind: 'exited', code: 1, stdout: 'ok | 3 passed | 0 failed (8ms)', stderr: '' },
          expected: 'error',
        },
      ];

      for (const { id, title, outcome, expected } of _unconfirmedFailureCases) {
        it(`[Error] ${id}: ${title} → ${expected}`, () => {
          assertEquals(classifyOutcome(outcome), expected);
        });
      }
    });

    /** ANSI の色付け・行頭判定・出力の連結・判定の優先順位に関わるエッジケース。 */
    describe('When: エッジケース', () => {
      /** 判定の境界に当たる実行結果。 */
      const _edgeCases: _OutcomeCase[] = [
        {
          id: 'T-MUT-CO-07-01',
          title: 'ANSI で色付けされた error: Type checking failed.',
          outcome: {
            kind: 'exited',
            code: 1,
            stdout: '',
            stderr: '\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed.\n',
          },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-08-01',
          title: '行頭以外の Type checking failed + 要約行の failed >= 1',
          outcome: {
            kind: 'exited',
            code: 1,
            stdout: '  AssertionError: expected "error: Type checking failed"\nFAILED | 0 passed | 1 failed',
            stderr: '',
          },
          expected: 'killed',
        },
        {
          id: 'T-MUT-CO-08-02',
          title: '行頭以外の Type checking failed だけで要約行が無い',
          outcome: { kind: 'exited', code: 1, stdout: 'note: Type checking failed somewhere', stderr: '' },
          expected: 'error',
        },
        {
          id: 'T-MUT-CO-09-01',
          title: 'error: Type checking failed. が stdout 側にある',
          outcome: { kind: 'exited', code: 1, stdout: 'error: Type checking failed.', stderr: '' },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-09-02',
          title: '要約行 (failed >= 1) が stderr 側にある',
          outcome: { kind: 'exited', code: 1, stdout: '', stderr: 'FAILED | 2 passed | 1 failed (9ms)' },
          expected: 'killed',
        },
        {
          id: 'T-MUT-CO-10-01',
          title: '行頭の型検査失敗と failed >= 1 の要約行が両方ある (型検査失敗を優先)',
          outcome: {
            kind: 'exited',
            code: 1,
            stdout: 'FAILED | 0 passed | 1 failed',
            stderr: 'error: Type checking failed.',
          },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-10-02',
          title: '終了コード 0 で failed >= 1 の要約行がある (出力にかかわらず survived)',
          outcome: { kind: 'exited', code: 0, stdout: 'FAILED | 0 passed | 1 failed', stderr: '' },
          expected: 'survived',
        },
        {
          id: 'T-MUT-CO-11-01',
          title:
            '末尾に改行の無い stdout の直後に stderr の error: Type checking failed. が続く (連結で同じ行にならない)',
          outcome: { kind: 'exited', code: 1, stdout: 'Check file:///x.ts', stderr: 'error: Type checking failed.' },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-12-01',
          title: '複数行の stderr の 2 行目の行頭に error: Type checking failed. がある',
          outcome: {
            kind: 'exited',
            code: 1,
            stdout: '',
            stderr: 'Check file:///x.ts\nerror: Type checking failed.\n',
          },
          expected: 'compile-error',
        },
        {
          id: 'T-MUT-CO-13-01',
          title: '終了コード 0 で行頭に error: Type checking failed. がある (compile-error ではなく survived)',
          outcome: { kind: 'exited', code: 0, stdout: '', stderr: 'error: Type checking failed.\n' },
          expected: 'survived',
        },
        {
          id: 'T-MUT-CO-15-03',
          title: '先頭の要約行風の出力だけに failed >= 1 があり最後の要約行は failed 0 の非 0 終了 (killed ではない)',
          outcome: {
            kind: 'exited',
            code: 1,
            stdout: 'FAILED | 0 passed | 1 failed\nok | 99 passed | 0 failed',
            stderr: '',
          },
          expected: 'error',
        },
      ];

      for (const { id, title, outcome, expected } of _edgeCases) {
        it(`[Edge] ${id}: ${title} → ${expected}`, () => {
          assertEquals(classifyOutcome(outcome), expected);
        });
      }
    });
  });
});
