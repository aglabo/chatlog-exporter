# コーディング規約（chatlog-exporter 固有）

ライブラリ優先・インラインロジック禁止・簡潔さ・関数型優先・fail-first の共通規約は
deckrd の `deckrd-rule-coding-guidelines.md` が正とする
（`.claude/rules/deckrd-rules/deckrd-rules-index.md` 参照）。
本ファイルは TypeScript / Deno 固有の適用例のみを示す。

## インラインロジック禁止

```typescript
// Bad — getFilename() が存在するのにインラインで書く
this.filename = normalizePath(filePath).split('/').pop()!;

// Good — 既存の getFilename() を使う
this.filename = getFilename(filePath);
```

## 関数型プログラミング優先

```typescript
// Bad
const results = [];
for (const item of items) {
  if (item.active) { results.push(transform(item)); }
}

// Good
const results = items.filter((item) => item.active).map(transform);
```

非同期処理も同様に、`for...of` + `await` のループより `Promise.all` + `map` を使う。

```typescript
// Bad
for (const file of files) {
  await process(file);
}

// Good（並列実行可能な場合）
await Promise.all(files.map(process));
```
