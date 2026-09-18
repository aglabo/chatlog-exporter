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

## プロセス終了はエントリポイントでのみ行う

`Deno.exit()` を呼んでよいのは、`main()` を呼び出す最上位の `if (import.meta.main)` ブロックだけとする。
`main()` とその配下の関数は `Deno.exit()` を呼ばず、`return` で抜ける。

- 異常は `throw` で呼び出し元へ伝える
- 終了コードを決める必要があるときは、`main()` が `number` を `return` する

```typescript
// Bad — 関数の途中でプロセスを終了する
export const main = async (argv?: string[]): Promise<void> => {
  const _config = parseArgs(argv ?? Deno.args);
  if (!_config.inputDir) {
    logger.error('--input-dir を指定してください');
    Deno.exit(1);
  }
  // ...
};

// Good — main() は throw / return で抜け、終了はエントリポイントで行う
export const main = async (argv?: string[]): Promise<number> => {
  const _config = parseArgs(argv ?? Deno.args);
  if (!_config.inputDir) {
    throw new ChatlogError('MissingArg', 'NotSpecified', '--input-dir を指定してください');
  }
  // ...
  return 0;
};

if (import.meta.main) {
  try {
    Deno.exit(await main());
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
```

理由:

- `Deno.exit()` はその場でプロセスを終了するため、呼び出し元の `finally` や後始末が実行されない
- 関数内で `Deno.exit()` を呼ぶと、テストから `main()` を直接呼べなくなる
  （テストランナーごと終了する）。終了コードやエラーをサブプロセス経由でしか検証できなくなる

```typescript
// Bad
for (const file of files) {
  await process(file);
}

// Good（並列実行可能な場合）
await Promise.all(files.map(process));
```
