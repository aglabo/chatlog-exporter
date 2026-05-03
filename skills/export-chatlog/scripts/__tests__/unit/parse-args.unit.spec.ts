// src: scripts/__tests__/unit/parse-args.unit.spec.ts
// @(#): CLI 引数解析関数のユニットテスト
//       対象: parseArgs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../../../export-chatlog/scripts/export-chatlog.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ParsedConfig } from '../../../../export-chatlog/scripts/types/export-config.types.ts';

// ─── Tests

/**
 * `parseArgs` のユニットテストスイート。
 *
 * CLI 引数配列を受け取り ExportConfig を返す関数の動作を検証する。
 * agent 名・period・--output/--base/--input オプションの各解析パターンと、
 * 複数フィールドの組み合わせ・未知引数での ChatlogError スローをカバーする。
 *
 * @see parseArgs
 * @see ExportConfig
 */
describe('parseArgs', () => {
  // ─── T-EC-PA-02〜15: 単一オプション ──────────────────────────────────────────

  /**
   * テーブル駆動による単一オプション解析の網羅的検証。
   * agent 名・period・--output・--base・--input の各オプションを
   * 1件ずつ独立させて対応フィールドへの正確なマッピングを確認する。
   * `--opt val` と `--opt=val` 両形式の等価性も含む。
   */
  describe('Given: 単一オプション', () => {
    /** `parseArgs(args)` を呼び出したときのフィールド値を検証する。 */
    describe('When: parseArgs(args) を呼び出す', () => {
      /** 対応フィールドに期待値が設定されることを確認する。 */
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof ParsedConfig; expected: unknown }[] = [
          { id: 'T-EC-PA-02-01', args: ['codex'], field: 'agent', expected: 'codex' },
          { id: 'T-EC-PA-03-01', args: ['2026-03'], field: 'period', expected: '2026-03' },
          { id: 'T-EC-PA-03-02', args: ['2026'], field: 'period', expected: '2026' },
          { id: 'T-EC-PA-04-01', args: ['--output', '/tmp/out'], field: 'outputDir', expected: '/tmp/out' },
          { id: 'T-EC-PA-04-02', args: ['--output=/tmp/out'], field: 'outputDir', expected: '/tmp/out' },
          { id: 'T-EC-PA-08-01', args: ['--base', '/data/logs'], field: 'baseDir', expected: '/data/logs' },
          { id: 'T-EC-PA-08-02', args: ['--base=/data/logs'], field: 'baseDir', expected: '/data/logs' },
          {
            id: 'T-EC-PA-11-01',
            args: ['--output', '/chatlog/claude'],
            field: 'outputDir',
            expected: '/chatlog/claude',
          },
          {
            id: 'T-EC-PA-12-01',
            args: ['--input', '/data/chatgpt-export'],
            field: 'inputDir',
            expected: '/data/chatgpt-export',
          },
          {
            id: 'T-EC-PA-12-02',
            args: ['--input=/data/chatgpt-export'],
            field: 'inputDir',
            expected: '/data/chatgpt-export',
          },
          { id: 'T-EC-PA-13-01', args: ['chatgpt'], field: 'agent', expected: 'chatgpt' },
          { id: 'T-EC-PA-15-01', args: ['chatgpt', '/path/to/export'], field: 'inputDir', expected: '/path/to/export' },
          {
            id: 'T-EC-PA-15-04',
            args: ['chatgpt', 'C:\\Users\\foo\\export'],
            field: 'inputDir',
            expected: 'C:/Users/foo/export',
          },
        ];
        for (const { id, args, field, expected } of _cases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(args)[field], expected);
          });
        }
      });
    });
  });

  // ─── 複数フィールド組み合わせ ─────────────────────────────────────────────────

  /**
   * baseDir と outputDir を同時に指定する組み合わせケース。
   * --base と --output が互いに干渉せず独立したフィールドに設定されることを確認する。
   */
  describe('Given: ["--base", "/data", "--output", "/data/claude"]', () => {
    it('T-EC-PA-09: baseDir と outputDir が同時に設定される', () => {
      const result = parseArgs(['--base', '/data', '--output', '/data/claude']);
      assertEquals(result.baseDir, '/data');
      assertEquals(result.outputDir, '/data/claude');
    });
  });

  /**
   * agent・period・--output を同時に指定する3フィールド組み合わせケース。
   * 位置引数（agent・period）とオプション引数（--output）が混在しても
   * 正しく解析されることを確認する。
   */
  describe('Given: ["claude", "2026-03", "--output", "/out"]', () => {
    it('T-EC-PA-07: agent・period・outputDir が同時に設定される', () => {
      const result = parseArgs(['claude', '2026-03', '--output', '/out']);
      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
      assertEquals(result.outputDir, '/out');
    });
  });

  /**
   * agent と --base を組み合わせるケース。
   * claude エージェントで --base によるカスタムセッションディレクトリ指定が
   * 正しく解析されることを確認する。
   */
  describe('Given: ["claude", "--base", "/data/logs"]', () => {
    it('T-EC-PA-10: agent と baseDir が同時に設定される', () => {
      const result = parseArgs(['claude', '--base', '/data/logs']);
      assertEquals(result.agent, 'claude');
      assertEquals(result.baseDir, '/data/logs');
    });
  });

  /**
   * chatgpt agent と --input を組み合わせるケース。
   * ChatGPT エクスポートでは --input で入力ディレクトリを指定するため、
   * agent と inputDir が同時に正しく設定されることを確認する。
   */
  describe('Given: ["chatgpt", "--input", "/data/export"]', () => {
    it('T-EC-PA-14: agent と inputDir が同時に設定される', () => {
      const result = parseArgs(['chatgpt', '--input', '/data/export']);
      assertEquals(result.agent, 'chatgpt');
      assertEquals(result.inputDir, '/data/export');
    });
  });

  /**
   * chatgpt + period + inputDir の3フィールド組み合わせケース。
   * 位置引数として period と inputDir（パス）が並んでも
   * パス判定（/ または ドライブレター:/ で始まる）により正しく区別されることを確認する。
   */
  describe('Given: ["chatgpt", "2026-03", "/path/to/export"]', () => {
    it('T-EC-PA-15-02: period と inputDir が同時に設定される', () => {
      const result = parseArgs(['chatgpt', '2026-03', '/path/to/export']);
      assertEquals(result.period, '2026-03');
      assertEquals(result.inputDir, '/path/to/export');
    });
  });

  /**
   * period と inputDir の順番を逆にした境界値ケース。
   * パスと期間文字列の順序に依存せず正しく解析されることを確認する。
   * 順序不問の解析仕様を明示的に検証する。
   */
  describe('Given: ["chatgpt", "/path/to/export", "2026-03"]（順番逆）', () => {
    it('T-EC-PA-15-03: 順番が逆でも period と inputDir が正しく設定される', () => {
      const result = parseArgs(['chatgpt', '/path/to/export', '2026-03']);
      assertEquals(result.period, '2026-03');
      assertEquals(result.inputDir, '/path/to/export');
    });
  });

  // ─── T-EC-PA-16: --config オプション ────────────────────────────────────────

  /**
   * `--config` オプションによるグローバル設定ファイルパスの解析検証。
   * `--config VALUE` 形式と `--config=VALUE` 形式の両方が
   * `configFile` フィールドに正しくマッピングされることを確認する。
   */
  describe('Given: --config または --config=VALUE', () => {
    /** `parseArgs(args)` を呼び出す。 */
    describe('When: parseArgs(args) を呼び出す', () => {
      /** `configFile` に値が設定されることを確認する。 */
      describe('Then: T-EC-PA-16 - configFile に値が設定される', () => {
        const _cases = [
          { id: 'T-EC-PA-16-01', args: ['--config', '/path/to/config.yaml'], expected: '/path/to/config.yaml' },
          { id: 'T-EC-PA-16-02', args: ['--config=/path/to/config.yaml'], expected: '/path/to/config.yaml' },
        ];
        for (const { id, args, expected } of _cases) {
          it(`${id}: ${args.join(' ')} → configFile が "${expected}" になる`, () => {
            const result = parseArgs(args);
            assertEquals(result.configFile, expected);
          });
        }
      });
    });
  });

  // ─── 異常系: ChatlogError がスローされる ──────────────────────────────────────

  /**
   * 未知のオプション・未知の位置引数に対するエラー仕様の検証。
   * テーブル駆動で複数の不正パターンを網羅し、
   * すべて ChatlogError('Invalid Args') がスローされることを確認する。
   * サイレントに無視するのではなく明示的に失敗する設計の確認。
   */
  describe('Given: 不正な引数', () => {
    /** `parseArgs(args)` を呼び出したときにエラーがスローされることを検証する。 */
    describe('When: parseArgs(args) を呼び出す', () => {
      /** ChatlogError(InvalidArgs) がスローされることを確認する。 */
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        const _errorCases: { id: string; args: string[]; label: string }[] = [
          { id: 'T-EC-PA-06-01', args: ['--unknown'], label: '未知オプション' },
          { id: 'T-EC-PA-06-02', args: ['my-project'], label: '未知の位置引数' },
        ];
        for (const { id, args, label } of _errorCases) {
          it(`${id}: ${label} → ChatlogError(InvalidArgs) がスローされる`, () => {
            assertThrows(
              () => parseArgs(args),
              ChatlogError,
              'Invalid Args',
            );
          });
        }
      });
    });
  });
});
