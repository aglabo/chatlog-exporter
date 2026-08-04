// src: scripts/libs/__tests__/unit/hash.unit.spec.ts
// @(#): generateHash のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertMatch, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- constants --
import { DEFAULT_HASH_LENGTH } from '../../../../constants/defaults.constants.ts';

// test target
import { generateHash, sessionHash } from '../../hash.ts';

// -- types --
import type { GenerateHashOptions } from '../../../../types/common.types.ts';

// ─────────────────────────────────────────────
// generateHash
// ─────────────────────────────────────────────

/**
 * `generateHash` のユニットテストスイート。
 *
 * filenameBase・timestamp・ランダム文字列から SHA-256 ハッシュを生成する関数の
 * 出力長・文字種・非決定性・定数値の各ケースをカバーする。
 *
 * @see generateHash
 */
describe('generateHash', () => {
  // ─── グループ01: デフォルト長（8文字）の検証 ───────────────────────────────

  describe('Given: filenameBase="my-project"', () => {
    describe('When: options を省略して呼び出す', () => {
      describe('Then: T-LIB-H-01 - デフォルト長 8 の16進数文字列を返す', () => {
        it('T-LIB-H-01-01: 結果の長さが DEFAULT_HASH_LENGTH (8) である', async () => {
          const result = await generateHash('my-project');
          assertEquals(result.length, DEFAULT_HASH_LENGTH);
        });

        it('T-LIB-H-01-02: 結果が /^[0-9a-f]+$/ にマッチする（小文字16進数のみ）', async () => {
          const result = await generateHash('my-project');
          assertMatch(result, /^[0-9a-f]+$/);
        });

        it('T-LIB-H-01-03: 結果が空文字列でない', async () => {
          const result = await generateHash('my-project');
          assertNotEquals(result, '');
        });
      });
    });
  });

  // ─── グループ02: length オプションのカスタマイズ ────────────────────────────

  describe('Given: filenameBase="base", options={ length: 16 }', () => {
    describe('When: generateHash("base", { length: 16 }) を呼び出す', () => {
      describe('Then: T-LIB-H-02 - 指定長の文字列を返す', () => {
        it('T-LIB-H-02-01: 結果の長さが 16 である', async () => {
          const result = await generateHash('base', { length: 16 });
          assertEquals(result.length, 16);
        });

        it('T-LIB-H-02-02: 結果が /^[0-9a-f]+$/ にマッチする', async () => {
          const result = await generateHash('base', { length: 16 });
          assertMatch(result, /^[0-9a-f]+$/);
        });
      });
    });
  });

  describe('Given: filenameBase="base", options={ length: 4 }', () => {
    describe('When: generateHash("base", { length: 4 }) を呼び出す', () => {
      describe('Then: T-LIB-H-02 - 指定長の文字列を返す', () => {
        it('T-LIB-H-02-03: 結果の長さが 4 である', async () => {
          const result = await generateHash('base', { length: 4 });
          assertEquals(result.length, 4);
        });
      });
    });
  });

  describe('Given: filenameBase="base", options={ length: 64 }（SHA-256の最大）', () => {
    describe('When: generateHash("base", { length: 64 }) を呼び出す', () => {
      describe('Then: T-LIB-H-02 - 64文字全体を返す', () => {
        it('T-LIB-H-02-04: 結果の長さが 64 である', async () => {
          const result = await generateHash('base', { length: 64 });
          assertEquals(result.length, 64);
        });
      });
    });
  });

  describe('Given: filenameBase="base", options={ length: undefined }', () => {
    describe('When: length を undefined で渡す', () => {
      describe('Then: T-LIB-H-02 - DEFAULT_HASH_LENGTH にフォールバックする', () => {
        it('T-LIB-H-02-05: 結果の長さが DEFAULT_HASH_LENGTH (8) である', async () => {
          const opts: GenerateHashOptions = { length: undefined };
          const result = await generateHash('base', opts);
          assertEquals(result.length, DEFAULT_HASH_LENGTH);
        });
      });
    });
  });

  // ─── グループ03: 非決定性（ランダム性）の検証 ──────────────────────────────

  describe('Given: 同じ filenameBase="same-base" で2回呼び出す', () => {
    describe('When: generateHash を連続で2回呼び出す', () => {
      describe('Then: T-LIB-H-03 - 毎回異なる値を返す（ランダム性の確認）', () => {
        it('T-LIB-H-03-01: 1回目と2回目の結果が異なる', async () => {
          const r1 = await generateHash('same-base');
          const r2 = await generateHash('same-base');
          assertNotEquals(r1, r2);
        });
      });
    });
  });

  // ─── グループ04: filenameBase の違いが結果に反映される ─────────────────────

  describe('Given: 異なる filenameBase "project-a" と "project-b"', () => {
    describe('When: それぞれ generateHash を呼び出す', () => {
      describe('Then: T-LIB-H-04 - 異なる filenameBase は異なる結果を返す', () => {
        it('T-LIB-H-04-01: "project-a" と "project-b" の結果が異なる', async () => {
          const ra = await generateHash('project-a');
          const rb = await generateHash('project-b');
          assertNotEquals(ra, rb);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// sessionHash
// ─────────────────────────────────────────────

/**
 * `sessionHash` のユニットテストスイート。
 *
 * 入力文字列から決定的な SHA-256 16進数文字列を生成する関数の
 * 決定性・デフォルト長・長さ指定・入力差分反映の各ケースをカバーする。
 *
 * @see sessionHash
 */
describe('sessionHash', () => {
  describe('Given: 同じ input "same-input" で2回呼び出す', () => {
    describe('When: sessionHash を連続で2回呼び出す', () => {
      describe('Then: T-LIB-SH-01 - 毎回同じ値を返す（決定性の確認）', () => {
        it('T-LIB-SH-01-01: 1回目と2回目の結果が一致する', async () => {
          const r1 = await sessionHash('same-input');
          const r2 = await sessionHash('same-input');
          assertEquals(r1, r2);
        });
      });
    });
  });

  describe('Given: filenameBase="base", options を省略', () => {
    describe('When: sessionHash("base") を呼び出す', () => {
      describe('Then: T-LIB-SH-02 - デフォルト長 12 の16進数文字列を返す', () => {
        it('T-LIB-SH-02-01: 結果の長さが 12 である', async () => {
          const result = await sessionHash('base');
          assertEquals(result.length, 12);
        });

        it('T-LIB-SH-02-02: 結果が /^[0-9a-f]+$/ にマッチする', async () => {
          const result = await sessionHash('base');
          assertMatch(result, /^[0-9a-f]+$/);
        });
      });
    });
  });

  describe('Given: input="base", length=16', () => {
    describe('When: sessionHash("base", 16) を呼び出す', () => {
      describe('Then: T-LIB-SH-03 - 指定長の16進数文字列を返す', () => {
        it('T-LIB-SH-03-01: 結果の長さが 16 である', async () => {
          const result = await sessionHash('base', 16);
          assertEquals(result.length, 16);
        });
      });
    });
  });

  describe('Given: 異なる input "input-a" と "input-b"', () => {
    describe('When: それぞれ sessionHash を呼び出す', () => {
      describe('Then: T-LIB-SH-04 - 異なる input は異なる結果を返す', () => {
        it('T-LIB-SH-04-01: "input-a" と "input-b" の結果が異なる', async () => {
          const ra = await sessionHash('input-a');
          const rb = await sessionHash('input-b');
          assertNotEquals(ra, rb);
        });
      });
    });
  });
});
