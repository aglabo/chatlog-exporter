// src: scripts/modules/__tests__/unit/judge-type.unit.spec.ts
// @(#): judgeType のユニットテスト
//       対象: judgeType
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm sess

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { _buildTypeSystemPromptForTest as buildTypeSystemPrompt, judgeType } from '../../setfm-type.ts';

// types
import type { TypeResult } from '../../../types/phase.types.ts';

// ─── Helpers
import {
  installCommandMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { DicEntry, Dics, Prompts } from '../../../types/dics.types.ts';
// ─── Internal Helpers

// constants
const _enc = new TextEncoder();
const _MAX_CONTENT_LENGTH = 5000;

// functions

/**
 * テスト用 `DicEntry` を生成する。
 *
 * @param overrides - 上書きするフィールド
 * @returns デフォルト値を持つ `DicEntry`
 */
const _makeEntry = (overrides?: Partial<DicEntry>): DicEntry => ({
  key: 'research',
  def: 'Information gathering log',
  desc: '調査・情報収集が主体のログ',
  rules: { when: ['技術調査が主目的'], not: ['実装作業'] },
  ...overrides,
});

/**
 * テスト用 `Dics` を生成する。
 *
 * @param typeEntries - 上書きする typeEntries（省略時はデフォルト3エントリ）
 * @returns 3エントリ（research / execution / incident）を持つ `Dics`
 */
const _makeDics = (typeEntries?: DicEntry[]): Dics => ({
  category: 'development,tooling,ai',
  tags: 'lang:typescript',
  categoryEntries: [],
  typeEntries: typeEntries ?? [
    _makeEntry({ key: 'research', def: 'Research log', desc: '調査ログ', rules: { when: ['調査'], not: ['実装'] } }),
    _makeEntry({
      key: 'execution',
      def: 'Execution log',
      desc: '実装ログ',
      rules: { when: ['実装'], not: ['エラー起点'] },
    }),
    _makeEntry({
      key: 'incident',
      def: 'Incident log',
      desc: 'インシデントログ',
      rules: { when: ['エラー起点'], always: ['他より優先'], not: ['正常実装'] },
    }),
  ],
  topicEntries: [],
});

/**
 * テスト用 `Prompts` を生成する。
 *
 * system プロンプトに `${type_dics}` を、user プロンプトに `${entries}` を含む。
 *
 * @returns type フェーズのプロンプトテンプレートを持つ `Prompts`
 */
const _makePrompts = (): Prompts => ({
  categoryPrompts: new Map(),
  prompts: new Map([
    ['type', { system: 'Classify logs.\n${type_dics}', user: '${entries}' }],
  ]),
});

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filename - ファイル名（例: `'test.md'`）。`/tmp/` 以下に配置される。
 * @param body - 本文テキスト
 * @returns 指定パスと本文を持つ `ChatlogEntry`
 */
const _makeChatlogEntry = (filename: string, body: string): ChatlogEntry => {
  const text = [
    '---',
    'session_id: sess-001',
    '---',
    '',
    body,
  ].join('\n');
  return new ChatlogEntry(text, { filePath: `/tmp/${filename}` });
};

// ─── Tests

/**
 * `judgeType` のユニットテストスイート。
 *
 * AI 出力に対する type マッピング・フォールバック・複数エントリ処理・エラー耐性を検証する。
 *
 * テスト ID 範囲: T-SF-JT-01 〜 T-SF-JT-12, T-SF-JT-17 〜 T-SF-JT-21
 *
 * @see judgeType
 */
describe('judgeType', () => {
  let commandHandle: CommandMockHandle;

  afterEach(() => {
    commandHandle?.restore();
  });

  // ─── type マッピング（正常系）────────────────────────────────────────────────

  /**
   * 有効な type キーを AI が返したとき、その type が結果に使われることを検証する。
   *
   * research / execution / incident の各キーを個別に検証する。
   */
  describe('type マッピング', () => {
    /** AI が有効な type キーを返す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases = [
        { id: 'T-SF-JT-01', aiType: 'research', expected: 'research' },
        { id: 'T-SF-JT-01', aiType: 'execution', expected: 'execution' },
        { id: 'T-SF-JT-01', aiType: 'incident', expected: 'incident' },
      ] as const;

      _cases.forEach(({ id, aiType, expected }) => {
        it(`[Normal] ${id}: AI が "${aiType}" を返す → result[0].type が "${expected}" になる`, async () => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(`[{"file":"test.md","type":"${aiType}"}]`)),
          );

          const _result: TypeResult[] = await judgeType(
            [_makeChatlogEntry('test.md', '# テスト\n本文')],
            _MAX_CONTENT_LENGTH,
            _makeDics(),
            _makePrompts(),
          );

          assertEquals(_result[0].type, expected);
        });
      });
    });

    /** スペース・大文字など正規化が必要なエッジケース。 */
    describe('When: エッジケース', () => {
      const _cases = [
        { id: 'T-SF-JT-03', label: 'スペース混じり', aiType: ' execution ', expected: 'execution' },
        { id: 'T-SF-JT-04', label: '大文字混じり', aiType: 'RESEARCH', expected: 'research' },
      ] as const;

      _cases.forEach(({ id, label, aiType, expected }) => {
        it(`[Edge] ${id}: ${label}の type → 正規化して "${expected}" に一致する`, async () => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(`[{"file":"test.md","type":"${aiType}"}]`)),
          );

          const _result = await judgeType(
            [_makeChatlogEntry('test.md', '# テスト\n本文')],
            _MAX_CONTENT_LENGTH,
            _makeDics(),
            _makePrompts(),
          );

          assertEquals(_result[0].type, expected);
        });
      });
    });
  });

  // ─── フォールバック（無効キー・ファイル名不一致・不正 JSON）────────────────

  /**
   * AI 出力が無効（無効キー・ファイル名不一致・JSON 配列以外）のとき、
   * フォールバック "research" が返ることを一括検証する。
   */
  describe('フォールバック', () => {
    /** 各種無効入力で "research" に落ちる異常系。 */
    describe('When: 異常系', () => {
      const _cases = [
        { id: 'T-SF-JT-02', label: '無効な type キー', aiJson: '[{"file":"test.md","type":"unknown_type"}]' },
        { id: 'T-SF-JT-05', label: 'ファイル名不一致', aiJson: '[{"file":"nomatch.md","type":"execution"}]' },
        { id: 'T-SF-JT-18', label: 'JSON 配列でない出力', aiJson: 'not a json array' },
      ] as const;

      _cases.forEach(({ id, label, aiJson }) => {
        it(`[Error] ${id}: ${label} → フォールバック "research" が返る`, async () => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(aiJson)),
          );

          const _result = await judgeType(
            [_makeChatlogEntry('test.md', '# テスト\n本文')],
            _MAX_CONTENT_LENGTH,
            _makeDics(),
            _makePrompts(),
          );

          assertEquals(_result[0].type, 'research');
        });
      });
    });
  });

  // ─── 複数エントリの並列処理 ──────────────────────────────────────────────────

  /**
   * 複数エントリを渡したとき、両方の結果が順序通りに返ることを検証する。
   */
  describe('複数エントリ処理', () => {
    /** 2エントリが正しくマッピングされる正常ケース。 */
    describe('When: 正常系', () => {
      beforeEach(() => {
        commandHandle = installCommandMock(
          makeSuccessMock(
            _enc.encode('[{"file":"first.md","type":"execution"},{"file":"second.md","type":"incident"}]'),
          ),
        );
      });

      it('[Normal] T-SF-JT-06: 2エントリ渡したとき 2件の結果が返る', async () => {
        const _result = await judgeType(
          [
            _makeChatlogEntry('first.md', '# 実装ログ\n実装作業'),
            _makeChatlogEntry('second.md', '# エラーログ\nエラー発生'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result.length, 2);
      });

      it('[Normal] T-SF-JT-07: result[0].type が "execution" になる', async () => {
        const _result = await judgeType(
          [
            _makeChatlogEntry('first.md', '# 実装ログ\n実装作業'),
            _makeChatlogEntry('second.md', '# エラーログ\nエラー発生'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[0].type, 'execution');
      });

      it('[Normal] T-SF-JT-08: result[1].type が "incident" になる', async () => {
        const _result = await judgeType(
          [
            _makeChatlogEntry('first.md', '# 実装ログ\n実装作業'),
            _makeChatlogEntry('second.md', '# エラーログ\nエラー発生'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[1].type, 'incident');
      });
    });

    /** 2エントリのうち1件がファイル名不一致のケース。 */
    describe('When: エッジケース', () => {
      beforeEach(() => {
        commandHandle = installCommandMock(
          makeSuccessMock(
            _enc.encode('[{"file":"first.md","type":"execution"},{"file":"nomatch.md","type":"incident"}]'),
          ),
        );
      });

      it('[Edge] T-SF-JT-09: 一致したファイルは採用、不一致は "research" フォールバック', async () => {
        const _result = await judgeType(
          [
            _makeChatlogEntry('first.md', '# 実装ログ\n実装作業'),
            _makeChatlogEntry('second.md', '# エラーログ\nエラー発生'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[0].type, 'execution');
        assertEquals(_result[1].type, 'research');
      });
    });
  });

  // ─── 戻り値の file フィールド ────────────────────────────────────────────────

  /**
   * 戻り値の `file` フィールドがフルパスであることを検証する。
   */
  describe('file フィールド', () => {
    /** 戻り値がフルパスを持つ正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-JT-10: result[0].file がフルパス "/tmp/test.md" になる', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('[{"file":"test.md","type":"research"}]')),
        );

        const _result = await judgeType(
          [_makeChatlogEntry('test.md', '# テスト\n本文')],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[0].file, '/tmp/test.md');
      });
    });
  });

  // ─── エラー耐性 ─────────────────────────────────────────────────────────────

  /**
   * AI が失敗（例外）したとき、全エントリが "research" フォールバックになり例外が投げられないことを検証する。
   */
  describe('エラー耐性', () => {
    /** AI CLI が失敗するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-JT-11: AI が失敗（exit code=1） → result[0].type が "research" になる（例外なし）', async () => {
        commandHandle = installCommandMock(makeFailMock(1));

        const _result = await judgeType(
          [_makeChatlogEntry('test.md', '# テスト\n本文')],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[0].type, 'research');
      });

      it('[Error] T-SF-JT-12: AI が失敗しても例外はスローされない（2エントリ）', async () => {
        commandHandle = installCommandMock(makeFailMock(1));

        const _result = await judgeType(
          [
            _makeChatlogEntry('a.md', '# A\n本文A'),
            _makeChatlogEntry('b.md', '# B\n本文B'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result[0].type, 'research');
        assertEquals(_result[1].type, 'research');
      });
    });
  });

  // ─── 空入力エッジケース ─────────────────────────────────────────────────────

  /**
   * 空の entries 配列を渡したとき、空配列が返ることを検証する。
   */
  describe('空入力', () => {
    /** entries が空配列のエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-JT-17: entries が空配列 → 空配列が返る', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('[]')),
        );

        const _result = await judgeType(
          [],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result, []);
      });
    });
  });

  // ─── カウンタで呼び出し回数を確認 ───────────────────────────────────────────

  /**
   * judgeType は全エントリを1回の AI 呼び出しでまとめて処理することを検証する。
   */
  describe('AI 呼び出し回数', () => {
    /** 複数エントリを渡しても AI 呼び出しは1回のみのケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-JT-19: 2エントリでも AI 呼び出しは1回のみ', async () => {
        const counter: { calls: number } = { calls: 0 };
        commandHandle = installCommandMock(
          makeCountingMock(
            '[{"file":"first.md","type":"research"},{"file":"second.md","type":"execution"}]',
            counter,
          ),
        );

        await judgeType(
          [
            _makeChatlogEntry('first.md', '# A\n本文A'),
            _makeChatlogEntry('second.md', '# B\n本文B'),
          ],
          _MAX_CONTENT_LENGTH,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(counter.calls, 1);
      });
    });
  });

  // ─── maxContentLength による切り詰め ────────────────────────────────────────

  /**
   * maxContentLength=0 で渡したとき、AI 呼び出しが行われて結果が返ることを検証する
   * （0 byte に切り詰められても例外は発生しない）。
   */
  describe('maxContentLength', () => {
    /** maxContentLength=0 のエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-JT-20: maxContentLength=0 でも例外はスローされず結果が返る', async () => {
        commandHandle = installCommandMock(
          makeSuccessMock(_enc.encode('[{"file":"test.md","type":"research"}]')),
        );

        const _result = await judgeType(
          [_makeChatlogEntry('test.md', '# テスト\n本文')],
          0,
          _makeDics(),
          _makePrompts(),
        );

        assertEquals(_result.length, 1);
      });
    });
  });

  // ─── プロンプトテンプレート欠落 ─────────────────────────────────────────────

  /**
   * `'type'` キーを持たない `Prompts` を渡したとき、`ChatlogError` がスローされることを検証する。
   */
  describe('プロンプトテンプレート欠落', () => {
    /** `'type'` キーがない Prompts で ChatlogError がスローされるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SF-JT-21: "type" キーがない Prompts → ChatlogError がスローされる', async () => {
        const _promptsWithoutType: Prompts = {
          categoryPrompts: new Map(),
          prompts: new Map(),
        };

        await assertRejects(
          () =>
            judgeType(
              [_makeChatlogEntry('test.md', '# テスト\n本文')],
              _MAX_CONTENT_LENGTH,
              _makeDics(),
              _promptsWithoutType,
            ),
          ChatlogError,
        );
      });
    });
  });
});

/**
 * `_buildTypeSystemPrompt` のユニットテストスイート。
 *
 * typeEntries の各フィールドが system prompt に正しく展開されることを検証する。
 *
 * テスト ID 範囲: T-SF-JT-13 〜 T-SF-JT-16, T-SF-JT-22
 *
 * @see _buildTypeSystemPromptForTest
 */
describe('_buildTypeSystemPrompt', () => {
  /** typeEntries の各フィールドが system prompt に含まれる正常ケース。 */
  describe('When: 正常系', () => {
    const _cases = [
      { id: 'T-SF-JT-13', label: 'def', expected: 'Research log' },
      { id: 'T-SF-JT-14', label: 'desc', expected: '調査ログ' },
      { id: 'T-SF-JT-15', label: 'rules.when', expected: '調査' },
      { id: 'T-SF-JT-16', label: 'rules.always', expected: '他より優先' },
    ] as const;

    _cases.forEach(({ id, label, expected }) => {
      it(`[Normal] ${id}: typeEntries の ${label} が system prompt に含まれる`, () => {
        const _result = buildTypeSystemPrompt('Classify logs.\n${type_dics}', _makeDics());
        assertStringIncludes(_result, expected);
      });
    });
  });

  /** typeEntries が空のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-JT-22: typeEntries が空のとき ${type_dics} が空文字に展開される', () => {
      const _result = buildTypeSystemPrompt('Classify logs.\n${type_dics}', _makeDics([]));
      assertStringIncludes(_result, 'Classify logs.\n');
    });
  });
});
