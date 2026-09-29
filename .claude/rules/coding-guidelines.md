# コーディング規約（chatlog-exporter 固有）

ライブラリ優先・インラインロジック禁止・簡潔さ・関数型優先・fail-first の共通規約は
deckrd の `deckrd-rule-coding-guidelines.md` が正とする
（`.claude/rules/deckrd-rules/deckrd-rules-index.md` 参照）。
本ファイルは TypeScript / Deno 固有の適用例と、共通規約に無い chatlog-exporter 独自の規約を示す
（引数の個数の上限は共通規約に定めが無く、本ファイルが正とする）。

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

## 引数は 6 個まで。超えたらオブジェクト引数

位置引数は 6 個を上限とする。**4〜6 個が許容範囲で、7 個目を足す時点でオブジェクト引数に畳む。**
「他にも引数の多い関数がある」は据え置きの根拠にしない。

畳む範囲は末尾の設定値・依存（省略可能な値・注入する provider・閾値）とする。
処理対象そのものと、呼び出し側が持ち回る蓄積先は位置引数に残す。

```typescript
// Bad — 位置引数 9 個。呼び出し側は model の位置に undefined を書く羽目になる
export const processChunk = (
  chunkEntries: ChatlogEntry[],
  stats: FilterStats,
  discardThreshold: number,
  cache: ChatlogCache<CLEResult>,
  ctl: AbortController,
  maxBodyChars: number,
  model?: string,
  maxRetry: number = 0,
  aiRunnerProvider: AiRunnerProvider = runAI,
) => {/* ... */};

await processChunk(entries, stats, 0.7, cache, ctl, 8000, undefined, 2, runner);

// Good — 設定値・依存を options に畳み、既定値は分割代入で与える
export const processChunk = (chunkEntries: ChatlogEntry[], stats: FilterStats, options: ProcessChunkOptions) => {
  const { discardThreshold, cache, ctl, maxBodyChars, maxRetry = 0, model, aiRunnerProvider = runAI } = options;
  /* ... */
};

await processChunk(entries, stats, { discardThreshold: 0.7, cache, ctl, maxBodyChars: 8000, maxRetry: 2 });
```

options 型の置き場所は [directory-structure.md](directory-structure.md) に従う
（共通なら `skills/_cle-libs/types/`、スキル固有なら `<skill>/scripts/types/*.types.ts`）。
既定値はシグネチャではなく分割代入で与え、省略時は**キーごと存在しない形**にする
（呼び出し側に `model: undefined` を書かせない）。

根拠: filter の `processChunk` は `maxRetry` を足した時点で 9 引数になり、functional spec に
`..., maxBodyChars, undefined, 2, runner)` が 49 箇所並んだ。同じ `number` 型の
`discardThreshold`（第 3）と `maxBodyChars`（第 6）が離れて置かれ、取り違えても型検査を通る
状態だった（`docs/.deckrd/filter/filter/decision-records.md` の DR-07）。

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

## 触ってはいけない既知の設計

レビュー（人間・AI とも）が繰り返しバグとして指摘してくるが、**いずれも設計決定であり修正しない。**
指摘が来たら根拠を示して閉じる。

| 対象                                                                   | 指摘されがちな内容                                  | 根拠                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `writeTextFile`（`_cle-libs/libs/file-io/write-utils.ts:29-`）         | backup が `null` でも rename してデータ消失に見える | DR-03 決定 3。`null` は「退避を作らなかった」事実の報告で書き込みは続行する。同 Rationale が修正案（Option B）を実装比較のうえ却下済み |
| `_applyFileOutcome`（`filter-chatlogs/scripts/strip-chatlogs.ts:310`） | total / error の不変条件 JSDoc が誤りに見える       | `specifications.md` と SKILL.md が明示的に否定。触ると R-011 退避保持ゲートが無効化される                                              |
