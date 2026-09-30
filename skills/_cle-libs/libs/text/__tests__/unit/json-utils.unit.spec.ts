// src: skills/_cle-libs/libs/text/__tests__/unit/json-utils.unit.spec.ts
// @(#): json-utils ユニットテスト
//       対象: parseAiJsonArray
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseAiJsonArray } from '../../json-utils.ts';

// ─── Helpers
import { assertNotNull, assertNull } from '../../../../__tests__/helpers/assert.ts';

// ─── Internal Helpers

// constants

/**
 * コードフェンスで例示された空配列のあとに実配列が続く AI 応答。
 * `allowEmpty` の有無で段階1 の短絡が切り替わることを対照させるため、T-LIB-J-22-03 と T-LIB-J-23-03 で共有する。
 */
const _FENCED_EMPTY_THEN_ARRAY = [
  'Here is an example:',
  '```json',
  '[]',
  '```',
  'Actual: [{"a":1}]',
].join('\n');

// ─── Tests

/**
 * `parseAiJsonArray` のユニットテストスイート。
 *
 * 3段階フォールバック（直接パース / non-greedy / greedy）の各パスを網羅する。
 *
 * テスト ID 範囲: T-LIB-J-01 〜 T-LIB-J-23
 *
 * @see parseAiJsonArray
 */
describe('parseAiJsonArray', () => {
  /** 非空配列を返す正常ケース。各段階のパスを含む。 */
  describe('When: 正常系', () => {
    [
      { id: 'T-LIB-J-01', label: '配列から始まる文字列をパースして返す', input: '[{"a":1}]', expected: [{ a: 1 }] },
      {
        id: 'T-LIB-J-02',
        label: '前置テキストがある場合も non-greedy マッチで配列を返す',
        input: '前置テキスト\n[{"a":2}]',
        expected: [{ a: 2 }],
      },
      {
        id: 'T-LIB-J-03',
        label: '前後テキストがある場合も greedy マッチで配列を返す',
        input: 'テキスト [{"a":3}] 後置テキスト',
        expected: [{ a: 3 }],
      },
      {
        id: 'T-LIB-J-20-02',
        label: '非空配列は従来どおりそのまま返す',
        input: '["a","b"]',
        expected: ['a', 'b'],
      },
      {
        id: 'T-LIB-J-12',
        label: 'JSON 値内に ] を含む場合は greedy マッチ（段階3）で配列を返す',
        input: 'prefix [{"x":"a]b"}] suffix',
        expected: [{ x: 'a]b' }],
      },
    ].forEach(({ id, label, input, expected }) => {
      it(`[Normal] ${id}: ${label}`, () => {
        assertEquals(parseAiJsonArray(input), expected);
      });
    });

    it('[Normal] T-LIB-J-23-01: { allowEmpty: true } を明示すると空配列を成功として返す', () => {
      assertEquals(parseAiJsonArray('[]', { allowEmpty: true }), []);
    });

    it('[Normal] T-LIB-J-06: greedy マッチで複数オブジェクトを含む配列を返す', () => {
      const _result = parseAiJsonArray('result: [{"a":1},{"a":2}] end');
      assert(Array.isArray(_result));
      assertEquals((_result as unknown[]).length, 2);
    });

    it('[Normal] T-LIB-J-16: コードフェンス内のネスト配列を含む応答は外側配列を正しく返す', () => {
      const _raw = '```json\n'
        + '[{"filePath":"a.md","segments":[{"x":1}]},{"filePath":"b.md","segments":[{"y":2}]}]\n'
        + '```';
      const _result = parseAiJsonArray<{ filePath: string; segments: unknown[] }>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 2);
      assertEquals(_result![0].filePath, 'a.md');
      assertEquals(_result![1].filePath, 'b.md');
    });

    it('[Normal] T-LIB-J-17: フェンス前後に説明文がある場合もネスト配列を含む外側配列を正しく返す', () => {
      const _raw = 'Here is the result:\n'
        + '```json\n'
        + '[{"filePath":"a.md","segments":[{"x":1}]},{"filePath":"b.md","segments":[{"y":2}]}]\n'
        + '```\n'
        + 'Done.';
      const _result = parseAiJsonArray<{ filePath: string; segments: unknown[] }>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 2);
      assertEquals(_result![0].filePath, 'a.md');
      assertEquals(_result![1].filePath, 'b.md');
    });

    it('[Normal] T-LIB-J-18: 言語タグなしのコードフェンスも除去して外側配列を返す', () => {
      const _raw = '```\n[{"filePath":"a.md","segments":[{"x":1}]}]\n```';
      const _result = parseAiJsonArray<{ filePath: string; segments: unknown[] }>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 1);
      assertEquals(_result![0].filePath, 'a.md');
    });

    it('[Normal] T-LIB-J-19: 先頭が素の配列で後方に無関係なコードフェンス例示がある場合は先頭配列を返す', () => {
      const _raw = '[{"file":"real.md"}]\n...\n```json\n[{"file":"example.md"}]\n```';
      const _result = parseAiJsonArray<{ file: string }>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 1);
      assertEquals(_result![0].file, 'real.md');
    });

    it('[Normal] T-LIB-J-09: 改行・インデントを含む整形済み JSON 配列がパースできる', () => {
      const _raw = '[\n  {"key": "value1"},\n  {"key": "value2"}\n]';
      const _result = parseAiJsonArray<{ key: string }>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 2);
      assertEquals(_result![0].key, 'value1');
      assertEquals(_result![1].key, 'value2');
    });

    it('[Normal] T-LIB-J-11: 数値・null・boolean を含む配列がパースできる', () => {
      const _raw = '[1, null, true, "str"]';
      const _result = parseAiJsonArray<unknown>(_raw);
      assertNotNull(_result);
      assertEquals(_result!.length, 4);
      assertEquals(_result![0], 1);
      assertNull(_result![1]);
      assert(_result![2]);
      assertEquals(_result![3], 'str');
    });
  });

  /** null を返す異常ケース。無効入力・パース失敗に加え、既定では空配列も異常扱いになることを検証する。 */
  describe('When: 異常系', () => {
    [
      { id: 'T-LIB-J-04', label: '空文字列は null を返す', input: '' },
      { id: 'T-LIB-J-20-01', label: '既定では空配列を受理せず null を返す', input: '[]' },
      { id: 'T-LIB-J-05', label: '配列を含まない文字列は null を返す', input: 'no array here' },
      { id: 'T-LIB-J-13', label: '[ で始まるが JSON.parse 失敗する場合は null を返す', input: '[invalid json' },
      { id: 'T-LIB-J-21-01', label: '閉じられていない JSON は null を返す', input: '[{"a":1' },
      {
        id: 'T-LIB-J-14',
        label: '段階2・3 ともにパース失敗する場合は null を返す',
        input: 'prefix [broken] suffix',
      },
    ].forEach(({ id, label, input }) => {
      it(`[Error] ${id}: ${label}`, () => {
        assertNull(parseAiJsonArray(input));
      });
    });
  });

  /** 境界値・特殊ケース。 */
  describe('When: エッジケース', () => {
    [
      {
        id: 'T-LIB-J-15',
        label: '段階1 が失敗した後、段階2 が後続の有効な配列を救済して返す',
        input: '[] [{"a":1}]',
        expected: [{ a: 1 }],
      },
      {
        id: 'T-LIB-J-22-01',
        label: '散文の丸括弧を空配列と誤認しない',
        input: '見解は () に依存する',
        expected: null,
      },
      {
        id: 'T-LIB-J-22-02',
        label: '括弧マッチ段は空配列を失敗のまま維持する',
        input: '結果は [] です',
        expected: null,
      },
    ].forEach(({ id, label, input, expected }) => {
      it(`[Edge] ${id}: ${label}`, () => {
        assertEquals(parseAiJsonArray(input), expected);
      });
    });

    it('[Edge] T-LIB-J-23-02: コードフェンスで包んだ空配列も { allowEmpty: true } なら段階1 が成功する', () => {
      assertEquals(parseAiJsonArray('```json\n[]\n```', { allowEmpty: true }), []);
    });

    it('[Edge] T-LIB-J-22-03: 既定ではフェンス内の空配列で短絡せず段階2 が後続配列を救済する', () => {
      assertEquals(parseAiJsonArray(_FENCED_EMPTY_THEN_ARRAY), [{ a: 1 }]);
    });

    it('[Edge] T-LIB-J-23-03: 同じ入力でも { allowEmpty: true } なら段階1 が短絡して空配列を返す', () => {
      assertEquals(parseAiJsonArray(_FENCED_EMPTY_THEN_ARRAY, { allowEmpty: true }), []);
    });

    /**
     * 段階2/3 への `allowEmpty` 非伝播を固定する唯一のテスト。
     *
     * 段階2/3 へ `allowEmpty` を渡す変異を入れると、このケースが `[]` を返して FAIL する
     * (変異検証済み)。散文中の `[]` を配列応答と誤認しないための境界なので削除しない。
     */
    it('[Edge] T-LIB-J-23-04: 散文中の [] は { allowEmpty: true } でも null（段階2/3 へ非伝播）', () => {
      assertNull(parseAiJsonArray('結果は [] です', { allowEmpty: true }));
    });

    it('[Edge] T-LIB-J-08: JSON 値内に "[...]" が含まれていても外側の配列がパースできる', () => {
      const _raw = '[{"text":"[escaped bracket]","value":1}]';
      const _result = parseAiJsonArray<{ text: string; value: number }>(_raw);
      assertNotNull(_result);
      assertEquals(_result![0].text, '[escaped bracket]');
      assertEquals(_result![0].value, 1);
    });

    it('[Edge] T-LIB-J-10: 前後にテキストがある整形済み JSON 配列がパースできる', () => {
      const _raw = 'Here is the result:\n[\n  {"file":"a.md","decision":"KEEP"}\n]\nDone.';
      const _result = parseAiJsonArray<{ file: string; decision: string }>(_raw);
      assertNotNull(_result);
      assertEquals(_result![0].file, 'a.md');
    });
  });
});
