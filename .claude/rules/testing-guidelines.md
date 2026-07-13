# テストコード規約（汎用）

## 1. describe/it 階層原則

- `describe` = 機能・シナリオのグループ化
- `it` = 単一ケース（1つの振る舞いのみ検証）
- ループ（テーブル駆動）は `describe` 内・`it` の**外**に置く

```typescript
// Good — ループは describe 内、it の外
describe('functionName', () => {
  for (const { input, expected } of _cases) {
    it(`[Normal] input=${input} → ${expected}`, () => {
      assertEquals(fn(input), expected);
    });
  }
});

// Bad — it の中でループしている（どのケースが失敗したか不明）
it('all cases pass', () => {
  for (const { input, expected } of _cases) {
    assertEquals(fn(input), expected);
  }
});
```

## 2. fixtures データの定義場所

- fixtures データ（テストケース配列）は **Internal Helpers** セクションに定義する
- `_cases` / `_fixtures` / `_errorCases` のように `_` プレフィックスを付ける
- テストデータを `it` の中や `describe` の外（ファイルトップレベル）に直書きしない

```typescript
// ─── Internal Helpers

// constants
const _cases = [
  { input: 'foo', expected: 'FOO' },
  { input: 'bar', expected: 'BAR' },
] as const;
```

## 3. テーブル駆動テストの基本パターン

- ループで生成される `it` にもケース識別子と説明をラベルに含める
- テンプレートリテラルで入出力値をラベルに埋め込む

```typescript
describe('functionName', () => {
  describe('When: 正常系', () => {
    for (const { input, expected } of _cases) {
      it(`[Normal] ${input} → ${expected}`, () => {
        assertEquals(fn(input), expected);
      });
    }
  });
});
```
