---
title: "runAI への JSON Schema 導入（将来計画案）"
module: "_cle-libs/libs/ai"
status: Draft
created: "2026-08-20"
---

> これは `notes/` 配下の作業メモ・設計ドラフトである。安定・確定した仕様ではない。
> 実測ゲート（5.1）を通過した時点で `requirements/` および `decision-records/` へ昇格させる。

## 1. 背景

現状 `runAI()` は `Promise<string>` を返し、AI 出力の構造化は
**プロンプトでの口頭指示 + 呼び出し側の後付けパース** のみで成立している。
パース層は 2 系統に分裂しており、いずれも正規表現・文字列操作ベースで壊れやすい。

| パーサ             | 実装                                       | 利用スキル                    |
| ------------------ | ------------------------------------------ | ----------------------------- |
| `parseAiJsonArray` | `_cle-libs/libs/text/json-utils.ts`        | classify / filter / normalize |
| `extractYaml`      | `_cle-libs/libs/text/frontmatter-utils.ts` | set-frontmatter               |

AI CLI 側がネイティブの構造化出力（JSON Schema 強制）を提供するようになったため、
これに寄せて標準化すべきかを検討する。

`export-chatlogs` は `runAI` を import していない（セッション JSONL を直接パース）ため **対象外**。

## 2. 実測で確定した事実

計測日: 2026-08-20 / ローカル CLI 実行による実測。

### 2.1 バックエンドのスキーマ対応状況（5 種中 3 種）

| backend             | フラグ                         | 形式                 | 確認方法              |
| ------------------- | ------------------------------ | -------------------- | --------------------- |
| claude              | `--json-schema <schema>`       | インライン文字列     | 実測済み              |
| codex               | `--output-schema <FILE>`       | **ファイルパスのみ** | ヘルプ確認            |
| antigravity (`agy`) | `--json-schema`                | 文字列 or パス       | ヘルプ確認（v1.1.14） |
| copilot             | なし（`--output-format` のみ） | —                    | ヘルプ全確認          |
| opencode            | なし（`run --format` のみ）    | —                    | `run --help` 全確認   |

**帰結**: 「全スキル標準化」は全バックエンドでの強制デコードを意味しえない。
能力差を吸収する階層設計が前提になる。

### 2.2 claude CLI の挙動

本番と同じ引数セット（`--safe-mode` / `--tools=` / `--permission-mode acceptEdits`）で検証。

- 上記フラグと **併用可能**。ブロックされない
- 成功時、エンベロープに `structured_output` フィールドが追加される

  ```json
  "result":"{\"results\":[{\"file\":\"a.md\",\"decision\":\"KEEP\"}]}",
  "structured_output":{"results":[{"file":"a.md","decision":"KEEP"}]}
  ```

- **ルートレベル配列は不可**。`{"type":"array",...}` は API 400 で即失敗

  ```text
  tools.0.custom.input_schema.type: Input should be 'object'
  ```

- 実装は **強制ツール呼び出し**（`stop_reason:"tool_use"`, `num_turns: 2`）。
  スキーマなしの 1 ターンに対し **1 往復増える**

### 2.3 制約の強制度 — 数量制約は使ってはいけない

`enum: ["typescript","rust","devops"]` に対し、どれにも該当しない 3 ファイル
（料理・園芸・編み物）を分類させた結果:

```json
"structured_output":{"results":[{"file":"cooking-recipes.md","category":"devops"}]}
```

読み取れること:

- **`enum` は硬く強制される**。enum 外の値は 1 つも出なかった
- **ただし「該当なし」の逃げ道がないと、無理やり嵌めてデタラメを返す。**
  enum には必ず明示的なフォールバック値（`FALLBACK_PROJECT` / `other` 等）を **含める**。
  現行の「辞書に無ければ呼び出し側でフォールバック」をそのまま enum に写してはならない
- **`minItems:1, maxItems:1` も強制された結果、入力 3 件のうち 2 件が黙って捨てられた。**
  つまり **件数をスキーマで縛ってはいけない**。モデルは制約を満たすために情報を落とす。
  「1 ファイル 1 要素」の保証は従来どおり呼び出し側の突合
  （`parsed.find((r) => r.file === filename)`）で行う。
  normalize の `MAX_SEGMENTS = 5` も同様にスキーマ側で縛らない

## 3. 評価

### 3.1 Pros

1. **既知バグが消える。** `_tryParseNonEmptyArray` は `Array.isArray(data) && data.length > 0` を要求する。
   このため AI が正当に空配列を返しても「パース失敗」と誤判定する。
   `structured_output` 経路では長さヒューリスティック自体が不要になる
2. **最も脆いパーサを廃止できる。** set-frontmatter の 3 パーサはフォーマット揺れに極端に弱い。
   `type:` / `category:` は `split` + `startsWith` で拾い、
   `extractYaml` はコードフェンス行を全削除して指定フィールドより前を捨てる
3. **リトライループの存在理由が消える。** `setfm-frontmatter.ts` / `setfm-review.ts` の
   `maxRetry` ループは **YAML パース失敗のみ** を対象にしている
4. **enum 制約をモデル側に効かせられる**（2.3 の注意点を守る前提で）
5. **プロンプトが短くなる。** 各 system prompt の
   「Output ONLY a JSON array. No markdown, no code fence...」相当が不要になる

### 3.2 Cons

1. **バックエンド非対称。** copilot / opencode 非対応のためフォールバック経路を **消せない**
2. **codex はファイル渡しのみ。** 一時ファイルの生成・削除ライフサイクルが持ち込まれる
3. **1 往復増える。** バッチは chunkSize 10 × concurrency 4 で数百ファイルを回すため、
   呼び出し単位のオーバーヘッドがそのまま総コストに乗る。**最大のコストリスク**
4. **失敗モードが変わる。** スキーマの書き間違いは実行時 API 400
   （2.2 のルート配列エラーがまさにそれ）として本番で初めて出る
5. **スキーマの置き場所問題。** set-frontmatter だけプロンプトが外部 YAML
   （`.config/chatlog-exporter/prompts/`）にある。スキーマを TS 定数に置くと
   「プロンプトは設定、スキーマはコード」と分裂する
6. **意味的正しさは保証しない。** ファイル名の取り違えや、normalize の
   「範囲が連続かつ非重複」といったドメイン制約は表現しきれず、検証コードは残る

## 4. 設計案 — エンベロープを runAI 側に封じ込める

ルート object 必須という API 制約は、**エンベロープを実装詳細として隠す** ことで
呼び出し側から見えなくできる。これが本設計の要。

**object 形を primitive、array 形をその薄いラッパ** とする 2 本立てにする。

```typescript
// run-ai.ts に追加。runAI(): Promise<string> は無変更
export const runAIStructuredObject = async <T>(
  systemPrompt: string,
  userPrompt: string,
  schema: JsonSchema, // ルート object のスキーマ
  options?: RunAIOptions,
): Promise<T>;

export const runAIStructured = async <T>(
  systemPrompt: string,
  userPrompt: string,
  itemSchema: JsonSchema, // 配列の「要素」のスキーマだけを渡す
  options?: RunAIOptions,
): Promise<T[]>; // 内部で Object 版を呼ぶだけ
```

### 4.1 内部動作（array 版）

1. `itemSchema` を次の形にラップして `runAIStructuredObject` に渡す

   ```json
   {
     "type": "object",
     "properties": { "results": { "type": "array", "items": "<itemSchema>" } },
     "required": ["results"],
     "additionalProperties": false
   }
   ```

2. 戻ってきた `structured_output.results` をアンラップして `T[]` を返す
3. スキーマ非対応バックエンド（copilot / opencode）では、`itemSchema` をプロンプトに埋め込んで
   `runAI()` を呼び、`parseAiJsonArray<T>()` に通して **同じ `T[]` を返す**

### 4.2 失敗時は throw する（fail-first）

スキーマ違反・パース失敗は `ChatlogError('InvalidFormat', 'JsonParse')` を throw し、
**空配列は「AI が正当に空を返した」の意味だけに使う**。
`null` やフォールバック値を返した場合、Pros 1 で挙げた `_tryParseNonEmptyArray` の欠陥が
そのまま新 API へ移る。

呼び出し側の帰結が変わらないことは確認済み。3 スキルとも
「パース失敗ブロック」と「catch ブロック」の処理が既に同一となっている。

| call site                      | パース失敗時（現行）                     | catch 時（現行）              | throw 化後               |
| ------------------------------ | ---------------------------------------- | ----------------------------- | ------------------------ |
| `process-chunk.ts:90-96`       | `stats.error += n` + `ChatlogError` 返却 | `stats.error += n` + `e` 返却 | 同じ（ログ文言のみ変化） |
| `phase-classify-ai.ts:133-137` | `_writeChunkError`                       | `_writeChunkError`            | 同じ                     |
| `segment-ai.ts:129-133`        | `_nullMap()`                             | `_nullMap()`                  | 同じ                     |

### 4.3 この設計が解消する Cons

- **Cons 1（二重実装の恒久化）が緩和される。** 分岐は `runAIStructured` 内部の 1 箇所に閉じ、
  呼び出し側からはバックエンド差が見えない
- **既存の配列契約が壊れない。** `{"results":[...]}` はプロトコル都合であり、
  スキル側は今と同じ「要素の配列」を受け取る。下流ロジックは無変更
- **`runAI(): Promise<string>` を一切触らない**

呼び出し側の差分は 2 行の置換に収まる。

```typescript
// Before
const rawResult = await runAI(_systemPrompt, _batchPrompt, { model, signal });
const parsed = parseAiJsonArray<ClassifyCache>(rawResult);

// After
const parsed = await runAIStructured<ClassifyCache>(
  _systemPrompt,
  _batchPrompt,
  CLASSIFY_ITEM_SCHEMA,
  { model, signal },
);
```

### 4.4 set-frontmatter は array 契約に押し込めない

meta / review / type-category は配列ではなく単一オブジェクトを返す。そして
**set-frontmatter は `parseAiJsonArray` を一切呼んでいない**（`extractYaml` 経由）。
つまりここには「配列互換」で守るべき既存契約が存在しない。
配列に包むと「要素数 1」という強制できない不変条件を抱えるだけで、得るものがない。

したがって `runAIStructuredObject<T>()` をそのまま使う。

```typescript
const _meta = await runAIStructuredObject<FrontmatterMeta>(_sys, _user, META_SCHEMA, opts);
```

### 4.5 実装上の注意

- **`JsonSchema` 型は `skills/_cle-libs/types/` に定義する**（`directory-structure.md` の規約）。
  `any` 禁止のため実体のある型が必要
- **`structured_output` 欠落の分岐が要る。**
  現行 `_interpretClaudeOutput`（`run-ai.ts:185-197`）は `result` が文字列かしか見ていない。
  `is_error:false` なのに `structured_output` が無いケース
  （`stop_reason: max_tokens` でツール呼び出しが途中で切れる等）は
  `ChatlogError('AiError','InvalidFormat')` にする。
  normalize は 4 ファイル分のセグメントを 1 回で返させるため、この経路は現実的なリスク
- バックエンド能力を `AI_BACKEND_*` 系定数（`_cle-libs/types/ai.const.types.ts`）に
  `supportsSchema` として追加する
- codex 経路は `Deno.makeTempFile` でスキーマを書き出し `finally` で削除する。
  ライフサイクルは `runAIStructuredObject` 内に閉じる
- `runAI` の実体は 2 箇所にあり、同期が必要。
  `_cle-libs/libs/ai/run-ai.ts` と配布コピー `setup-chatlogs/assets/_cle-libs/libs/ai/run-ai.ts`
- テスト資産が現行引数リストを固定している。
  対象は `run-ai.{unit,integration,system}.spec.ts` と `__tests__/helpers/deno-command-mock.ts`

## 5. 適用範囲の提案

**全面標準化はしない。** 5 バックエンド中 2 つが非対応である以上フォールバック経路は消せず、
「パース層の削除」という最大の利益は得られない。
4 章の設計により Cons 1 / 配列契約 / シグネチャ問題は消えるため、
**残る実質的ブロッカーは「1 往復増によるバッチ時のコスト」だけ** になる。

| 対象                            | 判断           | 根拠                                                                             |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| set-frontmatter (meta / review) | 価値が最も高い | パーサが最も脆く、リトライループの削除まで届く。非バッチのため往復増の影響が最小 |
| set-frontmatter (type/category) | 価値が高い     | 出力が 2 行プレーンテキスト。enum 化の利得が大きい                               |
| classify / filter               | 保留（要実測） | バッチ × 並列でコスト影響が最大                                                  |
| normalize                       | 保留           | 同上。加えて連続・非重複制約はスキーマで表現できず検証コードが残る               |
| export-chatlogs                 | 対象外         | `runAI` 不使用                                                                   |

### 5.1 着手前に通すべき実測ゲート

1. **合成プロンプトではなく実際の filter スキル** で計測する。
   固定の 20 ファイル程度・chunkSize 10 をスキーマあり / なしで走らせ、`total_cost_usd` を積算比較する。
   スキーマのツール定義は **呼び出しごとに 1 回** 送られて 10 ファイル分に償却されるため、
   合成 1 ファイルの計測が示すよりオーバーヘッドは小さい可能性が高い
2. 実運用ログから `parseAiJsonArray` 失敗率と `extractYaml` 失敗率
   （= `maxRetry` ループ発火回数）を数える。失敗率が実質ゼロなら
   classify / filter への導入は見送りでよい

### 5.2 独立に先行できる修正

`json-utils.ts` `_tryParseNonEmptyArray` の `data.length > 0` 要件は、
フォールバック経路では本設計を入れても誤判定が残る。
**「パース失敗」と「空配列」を区別する** よう修正する。
これは JSON Schema 導入と独立に単体で価値があり、先に直してよい。

## 6. 将来拡張（次バージョン）: ローカル LLM 対応

本スコープには含めないが、**JSON Schema 導入を前提条件とする後続機能** として記録する。

### 6.1 依存関係: スキーマ導入なしには成立しない

ローカル LLM は「Output ONLY a JSON array. No markdown, no code fence」への追従能力が
クラウドモデルより明確に低い。本計画が潰そうとしている失敗モードが最も激しく出る相手であり、
**スキーマ強制なしのローカル対応は実用にならない**。順序は逆にできない。

### 6.2 バックエンド選定: codex 一択

ローカル LLM とスキーマ強制の **両方** を満たすのは codex のみ。

| backend              | ローカル LLM                                  | スキーマ強制             |
| -------------------- | --------------------------------------------- | ------------------------ |
| **codex**            | `--oss` / `--local-provider lmstudio\|ollama` | `--output-schema <FILE>` |
| opencode             | 可（`ollama/*` 等）                           | 不可                     |
| claude / antigravity | 不可                                          | 可                       |
| copilot              | 不可                                          | 不可                     |

`--output-schema` がファイル渡しである点は、4.5 で決めた一時ファイル処理とそのまま一致する。

### 6.3 現状: ローカル経路はどのバックエンドにも通っていない

- `_buildCommand` の codex 分岐（`run-ai.ts:70-82`）は `--oss` / `--local-provider` を出さない
- `AI_PROVIDERS`（`ai.const.types.ts:31-40`）に `ollama` / `lmstudio` が無く、
  `parseModel()` がローカルモデル名を弾く
- opencode 経由の抜け道も塞がっている。`run-ai.ts:99` が provider を必ず前置するため、
  `opencode/ollama/qwen` は `--model opencode/ollama/qwen` になり opencode 側で解決できない

### 6.4 先に潰すべき検証

**codex が `--output-schema` をローカルプロバイダへ実際に転送するか。**

Ollama・LM Studio はいずれも API レベルで JSON Schema 制約出力に対応している。
ただし codex がそこまでパススルーする保証は未確認。これが通らなければ企画ごと不成立。

```bash
codex exec --oss --local-provider ollama --model <local-model> \
  --output-schema schema.json --skip-git-repo-check "..."
```

### 6.5 配線コスト（検証が通った場合）

小さい。既存構造にそのまま乗る。

1. `AI_PROVIDERS` に `'ollama'` / `'lmstudio'` を追加
2. `AI_PROVIDER_BACKEND_MAP` で両者を `'codex'` に向ける
3. `_buildCommand` の codex 分岐に `--oss --local-provider <provider>` を追加
   （`_parsed.provider` がローカル系のときのみ）
4. 配布コピー `setup-chatlogs/assets/_cle-libs/` を同期

`AI_MODEL_TO_PROVIDER_MAP` への bare string パターン追加は不要。
ローカルモデル名は多様なので `ollama/qwen2.5-coder` のような
**`provider/model` 形式の明示指定のみを受け付ける** 方針とする。

### 6.6 併せて直す既知の不整合

`runAI` のモデル名エラーメッセージ（`run-ai.ts:216`）は `opus, sonnet, haiku` としか案内していない。
実際に受理される `gpt-*` / `gemini-*` / `provider/model` 形式が反映されていない。
ローカル系プロバイダを足すとさらに乖離が広がるため、この時点で修正する。

## 7. Open Questions

- スキーマ定義の置き場所。set-frontmatter のプロンプトは外部 YAML にあるため、
  スキーマを TS 定数に置くと設定とコードに分裂する（Cons 5）。未決
- `agy` の structured output が claude と同じフィールド名で返るか未実測
- 実測ゲート 1 の結果次第で、classify / filter / normalize は恒久的に見送りになりうる
