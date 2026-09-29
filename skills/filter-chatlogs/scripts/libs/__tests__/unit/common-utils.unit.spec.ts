// src: skills/filter-chatlogs/scripts/libs/__tests__/unit/common-utils.unit.spec.ts
// @(#): common-utils ユニットテスト
//       対象: validateChatlogsDir / extractConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractConversation, validateChatlogsDir } from '../../common-utils.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { StatProvider } from '../../../../../_cle-libs/types/providers.types.ts';

// ─── Internal Helpers

// constants
/** ディレクトリが存在することをシミュレートする StatProvider。 */
const _existsStatProvider: StatProvider = (_path: string) => Promise.resolve({ isDirectory: true } as Deno.FileInfo);
/** ディレクトリが存在しないことをシミュレートする StatProvider（NotFound をスロー）。 */
const _notFoundStatProvider: StatProvider = (_path: string) => {
  throw new Deno.errors.NotFound('not found');
};
/** ファイルパスを指定した場合の StatProvider（isDirectory: false）。 */
const _fileStatProvider: StatProvider = (_path: string) => Promise.resolve({ isDirectory: false } as Deno.FileInfo);

// types
/**
 * `extractConversation(body, maxChars)` を明示的な `maxChars` 付きで呼び出す検証ケース。
 *
 * 切り詰め（長さ上限）と、上限に達しない場合のターン保全を 1 つの表で扱う。
 * `expectedIncludes` が空配列のケースは長さ上限のみを検証する。
 */
type ExtractCase = {
  /** テスト ID（例: `T-FL-EB-04-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `extractConversation` に渡す本文テキスト。 */
  body: string;
  /** `extractConversation` に渡す最大文字数。 */
  maxChars: number;
  /** 戻り値に残っていなければならない部分文字列（ターン落ちの検出用）。 */
  expectedIncludes: readonly string[];
};

// cases
/**
 * 切り詰めが起きないことが自明な `maxChars`。
 *
 * `T-FL-EB-01` / `T-FL-EB-03` は整形結果そのものを検証するケースで、長さ上限には関心が無い。
 * `maxChars` が必須引数になったため値を明示する必要があるが、
 * ここで production の既定値を import すると既定値を変えたときにテストが黙って追従してしまう。
 * そのため本ファイルのテストデータ（最長 500 文字強）が確実に収まる値をローカルに置く。
 */
const _NO_TRUNCATION_MAX_CHARS = 8000;

/** User ターン 1 件のみで、本文が 500 文字ある切り詰め検証用テキスト。 */
const _longBody = `### User\n${'x'.repeat(500)}\n`;
/** User / Assistant の 2 ターンを持ち、合計が 100 文字に満たない本文。 */
const _shortBody = '### User\nユーザーの質問\n\n### Assistant\nアシスタントの回答\n';

/** 明示的な `maxChars` 指定で呼び出す正常系ケース。 */
const _extractCases: ExtractCase[] = [
  {
    testId: 'T-FL-EB-04-01',
    label: 'maxChars より長い本文 → 戻り値の長さが maxChars 以下に収まる',
    body: _longBody,
    maxChars: 100,
    expectedIncludes: [],
  },
  {
    testId: 'T-FL-EB-04-02',
    label: 'maxChars より短い本文 → User / Assistant いずれのターンも欠落しない',
    body: _shortBody,
    maxChars: 1000,
    expectedIncludes: ['ユーザーの質問', 'アシスタントの回答'],
  },
];

// ─── Tests

/**
 * `validateChatlogsDir` のユニットテストスイート。
 *
 * ディレクトリ存在の正常系・不在の異常系を検証する。
 *
 * テスト ID 範囲: T-FL-VCD-01 〜 T-FL-VCD-02
 *
 * @see validateChatlogsDir
 */
describe('validateChatlogsDir', () => {
  /** ディレクトリ存在の正常系テスト。 */
  describe('When: 正常系', () => {
    it('[Normal] T-FL-VCD-01-01: ディレクトリが存在する → 例外がスローされない', async () => {
      await validateChatlogsDir('/some/dir', _existsStatProvider);
    });
  });

  /** ディレクトリ不在の異常系テスト。 */
  describe('When: 異常系', () => {
    it('[Error] T-FL-VCD-02-01: 存在しないディレクトリ → ChatlogError がスローされる', async () => {
      await assertRejects(
        () => validateChatlogsDir('/nonexistent/dir', _notFoundStatProvider),
        ChatlogError,
      );
    });

    it('[Error] T-FL-VCD-02-02: 存在しないディレクトリ → subindex が ChatlogsDir', async () => {
      const err = await assertRejects(
        () => validateChatlogsDir('/nonexistent/dir', _notFoundStatProvider),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'NotFound');
    });
  });

  /** ファイルパスを指定した場合のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-FL-VCD-03-01: ファイルパスを指定 → ChatlogError がスローされる', async () => {
      await assertRejects(
        () => validateChatlogsDir('/some/file.ts', _fileStatProvider),
        ChatlogError,
      );
    });

    it('[Edge] T-FL-VCD-03-02: ファイルパスを指定 → subindex が `NotFound` であること', async () => {
      const err = await assertRejects(
        () => validateChatlogsDir('/some/file.ts', _fileStatProvider),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'NotFound');
    });
  });
});

describe('extractConversation', () => {
  // ─── T-FL-EB-01: 通常会話 → User/Assistant フォーマット ──────────────────────

  describe('Given: User と Assistant ターンを含む本文', () => {
    describe('When: extractConversation(body, maxChars) を呼び出す', () => {
      describe('Then: T-FL-EB-01 - ### User / ### Assistant フォーマットで返される', () => {
        const body = '### User\nユーザーの質問\n\n### Assistant\nアシスタントの回答\n';

        it('T-FL-EB-01-01: "### User" を含む', () => {
          const result = extractConversation(body, _NO_TRUNCATION_MAX_CHARS);

          assertStringIncludes(result, '### User');
        });

        it('T-FL-EB-01-02: "### Assistant" を含む', () => {
          const result = extractConversation(body, _NO_TRUNCATION_MAX_CHARS);

          assertStringIncludes(result, '### Assistant');
        });

        it('T-FL-EB-01-03: ユーザーのテキストが含まれる', () => {
          const result = extractConversation(body, _NO_TRUNCATION_MAX_CHARS);

          assertStringIncludes(result, 'ユーザーの質問');
        });
      });
    });
  });

  // ─── T-FL-EB-02: maxChars 切り詰め ──────────────────────────────────────────

  describe('Given: maxChars より長い本文', () => {
    describe('When: extractConversation(body, maxChars) を呼び出す', () => {
      describe('Then: T-FL-EB-02 - maxChars 文字以内に切り詰められる', () => {
        it('T-FL-EB-02-01: 結果の長さが maxChars 以下になる', () => {
          const longText = 'x'.repeat(500);
          const body = `### User\n${longText}\n`;
          const maxChars = 100;
          const result = extractConversation(body, maxChars);

          assert(result.length <= maxChars);
        });

        it('T-FL-EB-02-02: maxChars=10 でも結果が返される', () => {
          const body = '### User\n質問テキスト\n\n### Assistant\n回答テキスト\n';
          const result = extractConversation(body, 10);

          assert(result.length <= 10);
        });
      });
    });
  });

  // ─── T-FL-EB-03: ターンなし → 空文字列 ─────────────────────────────────────

  describe('Given: ターンヘッダーがない本文', () => {
    describe('When: extractConversation(body, maxChars) を呼び出す', () => {
      describe('Then: T-FL-EB-03 - 空文字列が返される', () => {
        it('T-FL-EB-03-01: ターンなし → 空文字列', () => {
          const body = 'ヘッダーのない本文テキスト';
          const result = extractConversation(body, _NO_TRUNCATION_MAX_CHARS);

          assertEquals(result, '');
        });
      });
    });
  });

  // ─── T-FL-EB-04: maxChars 明示指定時の切り詰めとターン保全 ────────────────

  /**
   * `maxChars` を明示指定した場合の戻り値を検証する。
   *
   * T-02 で `maxChars` のデフォルト値が外れても振る舞いが変わらないことを固定する
   * リグレッション枠であり、呼び出しはすべて第 2 引数を明示する。
   */
  describe('Given: maxChars を明示指定して呼び出す本文', () => {
    describe('When: extractConversation(body, maxChars) を呼び出す', () => {
      /** Then: T-FL-EB-04 - 長さ上限を守りつつ、上限内ならターンを落とさない。 */
      describe('Then: T-FL-EB-04 - maxChars 以下に収まり、収まる範囲ではターンが保たれる', () => {
        for (const _case of _extractCases) {
          it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
            const _result = extractConversation(_case.body, _case.maxChars);

            assert(_result.length <= _case.maxChars);
            for (const expected of _case.expectedIncludes) {
              assertStringIncludes(_result, expected);
            }
          });
        }
      });
    });
  });

  // ─── T-FL-EB-05: maxChars の下限（1 文字） ────────────────────────────────

  /**
   * スキーマ下限である `maxChars = 1` を渡したときの境界挙動を検証する。
   *
   * `GlobalConfig` の `maxBodyChars` スキーマは下限を 1 と定めているため、
   * 設定可能な最小値で例外を出さないことを保証する。
   */
  describe('Given: User と Assistant ターンを含む本文', () => {
    describe('When: extractConversation(body, 1) を呼び出す', () => {
      /** Then: T-FL-EB-05 - 例外を出さず、長さ 1 以下の文字列を返す。 */
      describe('Then: T-FL-EB-05 - 例外を投げず 1 文字以下の文字列が返る', () => {
        it('[Edge] T-FL-EB-05-01: maxChars=1 → 例外なしで長さ 1 以下の文字列を返す', () => {
          const _result = extractConversation(_shortBody, 1);

          assert(_result.length <= 1);
        });
      });
    });
  });

  // ─── T-FL-EB-06: maxChars にデフォルト値を持たないこと（アリティ） ────────

  /**
   * `extractConversation` の引数アリティを検証する。
   *
   * 退行の形は 2 つある。`maxChars = <既定値>`（既定値付き）と `maxChars?: number`（省略可能）で、
   * どちらも「呼び出し元が maxChars を渡し忘れても黙って通る」状態を復活させる。
   *
   * このため検査も 2 本立てる。
   *
   * 1. `@ts-expect-error` 付きの 1 引数呼び出し。省略呼び出しが型エラーでなくなった時点で
   *    「未使用の抑制」として型検査が落ちる。**両方の退行を捕まえるのはこちらだけ**である
   * 2. `Function.prototype.length`（最初にデフォルト値を持つ引数より前の個数）。
   *    既定値付きなら 1、必須なら 2。ただし `maxChars?: number` でも 2 になるため単独では不十分
   *
   * なぜ型レベルの検査を置くのか:
   * この欠陥は「第 2 引数にデフォルト値があるため、maxChars を渡し忘れた呼び出し元が
   * 黙ってコンパイルを通ってしまう」という型レベルの欠陥であり、値の比較では観測できない。
   * アリティは、その型レベルの欠陥をランタイムのテストから観測できる唯一の手掛かりである。
   * この 1 件が無いと、T-FL-EB-04 / T-FL-EB-05 はいずれも maxChars を明示的に渡しており
   * デフォルト値の有無に一切影響されないため、本タスクに対して空振りになる。
   */
  describe('Given: エクスポートされた extractConversation', () => {
    describe('When: .length（引数アリティ）を読み取る', () => {
      /** Then: T-FL-EB-06 - 第 2 引数にデフォルト値が無い。 */
      describe('Then: T-FL-EB-06 - アリティが 2（maxChars にデフォルト値が無い）', () => {
        it('[Normal] T-FL-EB-06-01: maxChars が必須引数である（省略呼び出しは型エラー / アリティは 2）', () => {
          // @ts-expect-error maxChars は必須引数。既定値付き・省略可能のいずれに退行してもこの行がエラーでなくなり、型検査が落ちる
          extractConversation(_shortBody);

          assertEquals(extractConversation.length, 2);
        });
      });
    });
  });
});
