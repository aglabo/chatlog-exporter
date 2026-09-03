---
title: "Implementation Plan: LAN llama サーバの AI バックエンド化"
based-on: specifications-index.md v1.2.0
status: Draft
version: 1.3.2
created: "2026-09-03"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/ja-no-mixed-period,
  ja-technical-writing/no-unmatched-pair,
  -->
<!-- markdownlint-disable no-space-in-code -->
<!-- cspell:words setfm subindex aplys -->

## 1. Overview

### 1.1 Purpose

LAN 上の llama サーバ (llama.cpp server 等の OpenAI 互換 `/v1/chat/completions`) を `runAI` の
6 番目の AI バックエンドとして選択できるようにする (GitHub issue #430) 。目的は
classify-chatlogs / filter-chatlogs / normalize-chatlogs / set-frontmatter の 4 スキルを
ローカル完結で動かすことにある。

実装は次の制約に従う。

- `runAI` の公開シグネチャ (`Promise<string>`) は変えない (REQ-C-005) 。llama 経路は
  `runAI` 本体から分離した内部境界に閉じる (DR-10 / transport R-010 / AC-020)
- 失敗分類の軸は「バックエンドが使えるか」 (DR-18) 。llama 経路が throw する `ChatlogError` の
  `kind` は一律 `AiError`。中断側 = `RateLimit` / `InvalidEndpoint` / `BackendUnavailable` /
  `ResponseFormatRejected`、続行側 = `ExitFailure` / `ResponseSchemaViolation`
- `response_format` は llama バックエンド選択時に無条件で適用する (DR-19) 。出力契約は
  `json-array` / `yaml` / `line-prefixed` の 3 種、`runAI` 呼び出し 6 箇所が対象 (REQ-F-018)
- llama 経路を可到達にする commit は Commit 21 の 1 つに限る (DR-20 / DR-24) 。契約を持たない
  llama 呼び出しも、権限を欠いた llama 経路も、実在する期間を作らない

### 1.2 Reference

- Prior Art / Reference PR: なし。`grep -rniE "llama|ollama|response_format|chat/completions"`
  による調査で、実装コード・設定・テストに先行実装は 0 件。`fetch` の使用もリポジトリ全体で
  0 件であり、llama が初の HTTP 利用となる
- Related branch: `feat-430/libs-ai/llama-backend` (現在のブランチ) 。既存 commit は deckrd
  設計文書のみでコード変更は含まない
- 設計ノート `docs/.deckrd/notes/2026-08-20T2128-runai-json-schema.md`。§6.1 (スキーマ強制なしの
  ローカル対応は実用にならない) は DR-04 が採用、§6.2 (codex CLI 一択) は DR-01 が不採用、
  §6.6 (モデル名エラーメッセージ修正) は DR-06 が採用。§4 の `runAIStructured` 系による全面刷新は
  REQ-C-005 に反するため Out of Scope
- Specifications: `specifications/specifications-index.md` v1.2.0 (索引) および分割 4 ファイル
  (transport v2.0.1 / structured-output v2.0.0 / error-handling v2.0.1 / config-packaging v1.2.0)
- Reviews: `reviews-claude-impl-explore-2026-09-04.md` /
  `reviews-claude-impl-harden-2026-09-04.md` (DR-20〜DR-23 を採択) /
  `reviews-claude-impl-fix-2026-09-04.md`。本版はこの 3 本の所見を反映したものにあたる

### 1.3 テストレイヤの語彙

各 commit が持つ「テスト」は、`docs/rules/testing-conventions.md` の 5 種別を指す。

| レイヤ      | 本計画での用途                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| unit        | 純関数・型・定数の検証。`FetchProvider` 注入下の HTTP 経路もここに含める                                  |
| integration | 複数モジュールの結合。`runAI` と内部境界の組み合わせ                                                      |
| functional  | スキル内の処理系列。呼び出し元の catch 分岐と契約指定                                                     |
| system      | 実プロセス・実ファイルを伴う検証、およびソース走査による静的検査。実ネットワークは張らない (DR-21 決定 5) |

実ネットワークを張る system テストは書かない。llama 経路の `fetch` は `FetchProvider` 注入に
一本化する (DR-21 決定 5) 。

### 1.4 Phase の依存関係

着手条件は本表が唯一の一覧を持つ。Phase 1〜4 は Phase 0 の結果に依存せず、実測の合否と独立に
着地できる (DR-20 決定 3) 。Phase 5 以降が実測の合格に依存する。

| Phase | 内容                               | Commit | 着手条件            |
| ----- | ---------------------------------- | ------ | ------------------- |
| 0     | REQ-F-016 実測ゲート               | なし   | なし (本計画の起点) |
| 1     | DR-06 の周辺不具合修正             | 1〜2   | なし                |
| 2     | 型・定数・設定の基盤               | 3〜5   | Phase 1 完了        |
| 3     | 呼び出し元の中断判定拡張 (第 1 巡) | 6〜9   | Commit 5 完了       |
| 4     | `runAI` の 3 層分割                | 10     | Phase 2 完了        |
| 5     | 構造化出力                         | 11〜12 | **Phase 0 の合格**  |
| 6     | HTTP トランスポート                | 13〜15 | Phase 5 完了        |
| 7     | 出力契約の指定 (第 2 巡)           | 16〜19 | Commit 11 完了      |
| 8     | 権限付与と結線                     | 20〜21 | Phase 4・6・7 完了  |
| 9     | ドキュメント                       | 22     | Phase 8 完了        |

Commit 21 (結線) はさらに 2 つの着手条件を持つ。(1) 6 呼び出しすべてが出力契約を指定済みで
あること、(2) AI 実行経路への `--allow-net` 付与が完了していること (Commit 20) 。権限を経路より
先に置くのは、「経路はあるが権限がない」という未定義の失敗状態を作らないためとする (DR-24 決定 1) 。

---

## 2. Implementation Plan

### Phase 0: REQ-F-016 実測ゲート

**参照**: REQ-F-016 / structured-output R-006 / DR-09・DR-22・DR-25

実機 llama.cpp server に対し `response_format` (json_schema) 付きリクエストを実測する。
commit を持たない。

**測定内容**:

- 3 スキーマ: ①配列を包む object envelope (JSON 配列契約) ②enum を含む object
  (語彙制約付き分類) ③YAML 契約に対応する object
- 4 条件: モデル差 (量子化レベルの違いを含む 2 種以上) ／長文入力 (実運用チャンク上限に近い
  入力長) ／enum 境界 (正解がフォールバック値のみになる入力) ／非 ASCII 往復 (日本語を含む
  入力と出力)
- 3 スキーマ × 4 条件の 12 組み合わせについて、各 10 回試行する
- 測定項目に `finish_reason` の実値分布を加える。`stop` 以外の値が観測された場合、その値と
  発生条件を記録する (DR-25 決定 3)

**合格線** (DR-25) : **全 12 組で 10/10 (100%)** とする。1 組でも 10/10 に満たない場合、
当該サーバ実装・当該モデル条件を対応対象外とする。100% 未満を許すのは「モデルの指示追従に
依存している」状態を許すことであり、DR-04 が排除した状態と区別が付かない。黙殺・拒否と判明した
サーバ実装も対応対象外とし、degraded 運転は提供しない。

**成果物と完了条件** (DR-22)

1. `docs/.deckrd/libs/ai-backend/measurements-response-format-<date>.md` を新設し、再現情報
   (対象サーバ実装・ビルド／バージョン・起動オプション・モデル名と量子化レベル・入力長・
   3 スキーマ × 4 条件それぞれの 10 回中の準拠回数・`finish_reason` の実値分布) を記録する
2. `specifications-structured-output.md` §4.1.1 と §7 を、結論と当該レポートへの参照リンクへ
   書き換える。`specifications-index.md` §4 の未決 #1 (`response_format` の実対応レベル) ／
   未決 #2 (HTTP 400 の読み分け) を解消する。あわせて §4.2 へ DR-25 の合格線を、§4.1 および
   `specifications-error-handling.md` §4.1 へ DR-26 の分類を反映する (仕様側の版上げを伴う)
3. 本文書の frontmatter `based-on` と §1.2 Reference の版表記を、書き換え後の仕様の版へ更新する

**不合格時の帰結** (DR-24 決定 3・4) : **Phase 1 (Commit 1・Commit 2) のみを着地させて
ブランチを閉じる。** Commit 3 以降はすべて llama バックエンドの存在を前提とするため破棄する。
ネットワークを使う経路が存在しないため `--allow-net` の付与 (Commit 20) も行わない。Phase 3 の
catch 拡張も、真を返す subindex を llama 経路しか throw しない以上、恒久的に偽となる分岐を
4 ファイルへ残すことになるため着地させない。

### Phase 1: DR-06 の周辺不具合修正 (llama 非依存)

#### Commit 1: `fix(cle-libs): accept empty array in parseAiJsonArray`

**参照**: REQ-F-013 / REQ-C-002 / structured-output R-004・R-005

**変更**:

- `_tryParseNonEmptyArray` の `data.length > 0` 要求を外し、構文的に有効な空配列を成功結果として返す
- JSON として解釈不能な入力は従来どおりパース失敗とし、R-004 と R-005 を明確に区別する
- 空配列の受理は直接パース段でのみ行い、括弧マッチ段は現状の「空配列は失敗」を維持する。
  段全体で緩めると散文中の無関係な括弧対を配列として拾う
- 本スコープで既存 5 バックエンド全体に波及する唯一の変更。REQ-C-002 非破壊を
  **非破壊の観測範囲** (structured-output §5.1 が定める 3 点: 呼び出し元の戻り値 /
  永続化される出力 / 集計・キャッシュへの副作用) で確認する。診断ログの文言と件数は
  観測範囲に含めない
- 呼び出し元 3 箇所 (classify / filter / normalize) はいずれも適合と判定済み。normalize の
  segment ループは空配列だと全ファイル null のまま返るため、実装時に件数を数え直して個別確認する

**テスト**: unit (`json-utils` の `parseAiJsonArray`)

**Green**:

- 空配列 `"[]"` が成功として返ること
- JSON 解釈不能な入力が従来どおり失敗すること
- 空配列を null 固定で検証している既存テストを更新し、既存テスト全体が通ること (AC-003 / AC-022)
- AC-012 を満たすこと

#### Commit 2: `fix(cle-libs): derive accepted model formats from constants`

**参照**: REQ-F-014 / REQ-C-002 / error-handling R-005・§4.3 / DR-06

**変更**:

- `run-ai.ts` のモデル名エラーの固定文言 `Valid models: opus, sonnet, haiku (or full IDs)` を
  定数から動的生成する
- 文言の 2 つの半分は別の定数から来る。`<provider>/<model>` 形式の provider 一覧は
  `AI_PROVIDERS` (フラットな配列でそのまま列挙できる) 、bare 名の受理形式は
  `AI_MODEL_TO_PROVIDER_MAP` (`exact` エントリは `value` をそのまま使えるが、`regex` エントリは
  正規表現ソースを文言に出せない)
- `AiModelToProvider` の `regex` 側に表示ラベル (`gpt-*` / `gemini-*` 等) のフィールドを追加し、
  文言生成はそのラベルを読む。片方を手書きすると REQ-F-014 が潰そうとしている乖離を作り直す
  ことになる
- 動的生成により Commit 3 の `AI_PROVIDERS` への llama 追加が自動で文言へ反映される
- `kind` / `subindex` (`UnknownModel` / `InvalidModel`) は変えない
- 任意フィールドの追加による型の拡張は REQ-C-002 の観測範囲外とする。判定は
  error-handling §4.3 の 4 条件が成立しないことをもって行う

**テスト**: unit (文言生成関数)

**Green**:

- 現在受理されるすべての形式 (bare 名 / `gpt-*` / `gemini-*` / `<provider>/<model>`) が
  案内に含まれること (AC-014)
- error-handling §4.3 の 4 条件がいずれも成立しないこと (AC-022) 。なお文言リテラルに依存する
  既存テストは存在しない
- AC-012 を満たすこと

### Phase 2: 型・定数・設定の基盤

#### Commit 3: `feat(cle-libs): add llama backend and provider`

**参照**: REQ-F-001・REQ-F-014 / error-handling R-005・§4.3 / transport R-001 /
DR-02・DR-14 決定 3・DR-23

**変更**:

- `AI_BACKENDS` と `AI_PROVIDERS` に `llama` を追加し、`AI_PROVIDER_BACKEND_MAP` に
  `llama: 'llama'` を追加する
- CLI バックエンドの部分集合型を切り出し、`AI_BACKEND_COMMAND_MAP` の `satisfies` を
  `Record<AiCliBackend, AiBackendCommand>` へ変更する (llama は CLI コマンド名を持たない) 。
  型の名称は実装時の命名に委ねる
- provider prefix の照合は既存どおり大文字小文字を区別する完全一致とする (`Llama/...` は
  受理しない)
- `AI_MODEL_TO_PROVIDER_MAP` への追加は不要 (`llama/<model>` 形式のみを受理する)
- 空モデル名の拒否 (DR-23): llama 経路に限り、provider prefix を除いたモデル識別子が
  空文字列または空白のみで構成される場合を不正モデル名として拒否する。分類は既存の受理判定と
  同じ `ChatlogError('UnknownModel', 'InvalidModel')` とし、transport §4.1 Step 2 で評価する。
  判定対象を llama provider に限定し、既存 provider に対する空モデル名の受理範囲は変えない。
  `llama/org/model` のような多段スラッシュは従来どおり受理する (error-handling §5)
- `_buildCommand` の `switch` の既定分岐は変更しない
- `.vscode/cspell/dicts/project.dic` に `llama` を追加する

**テスト**: unit (`model-utils` の `parseModel` / `getAiBackend` / `isValidModel`、および定数の型)

**Green**:

- `llama/qwen3-14b` が llama バックエンドへ解決されること
- `llama/` と `llama/ ` が `UnknownModel/InvalidModel` で拒否されること
- `openai/` 等の既存 provider の空モデル名が従来どおり受理されること
- `llama/org/model` が受理されること
- Commit 2 の案内文言に llama provider が自動で現れること (AC-014)
- error-handling §4.3 の 4 条件がいずれも成立しないこと (AC-022)
- `_buildCommand` の diff が `switch` の既定分岐を含まないこと
- AC-012 を満たすこと

#### Commit 4: `feat(cle-libs): add llamaEndpoint config key`

**参照**: REQ-F-008・REQ-F-009 / config-packaging R-001・R-002 / DR-05・DR-12

**変更**:

- `DEFAULT_CONFIG_SCHEMA` に `llamaEndpoint` (型 `'string'`) を、`DEFAULT_CONFIG_VALUES` に
  `llamaEndpoint: ''` を追加する
- 既定値を空文字列とすることで「キー省略」と「空文字列の明示」が同一の値へ収束し、両者を
  REQ-F-019 の設定エラーとして単一の分岐で扱える
- `.config/chatlog-exporter/config.yaml` にコメント付きで追記する。値の妥当性検証はここでは
  行わず、設定の読み込み自体は成功させる
- `agent` キーの選択肢一覧は変更しない。llama は `model` の provider prefix としてのみ表現する
- `llamaTimeoutMs` のような経路別の設定キーは新設しない (DR-17)

**テスト**: unit (`GlobalConfig`)

**Green**:

- `llamaEndpoint` を記述した場合と省略した場合の双方で `InvalidYaml` / `UnknownKey` が
  throw されず、省略時に空文字列が解決されること (AC-009)
- `agent: chatgpt` と `model: llama/qwen3-14b` が互いに独立に解決され、`agent` の選択肢一覧に
  llama が現れないこと (AC-010)
- AC-012 を満たすこと

#### Commit 5: `feat(cle-libs): add FetchProvider and llama abort predicate`

**参照**: REQ-F-012・REQ-C-005 / transport R-005・§4.4 / DR-18 決定 3・DR-19 決定 1

**変更**:

- `providers.types.ts` に `FetchProvider` を追加する。既存 Provider 型の慣例に合わせた
  関数型エイリアスとし、`RunAIOptions` の任意フィールドで受け、使用直前に `??` で既定へ解決する
- 任意フィールドの追加が REQ-C-005 の許容範囲内であることは、DR-19 決定 1 が出力契約フィールドに
  ついて確立した判断 (既存の任意フィールド追加であり既存呼び出し元が無改修で動く) を
  そのまま適用する
- llama 経路の中断側を判定する関数を新設する。`kind==='AiError'` かつ subindex が
  `RateLimit` / `InvalidEndpoint` / `BackendUnavailable` / `ResponseFormatRejected` のいずれか。
  関数の名称と配置は実装時の命名に委ねる
- 既存 `isRateLimitError` / `isFatalAiError` は変更しない。既存 CLI 経路の 5 バックエンドは
  新 subindex を throw しないため、新判定関数を第 1 分岐に加えても既存経路の挙動は変わらない

**テスト**: unit (判定関数、`FetchProvider` の型レベル代入可能性)

**Green**:

- 中断側 4 subindex で真、続行側 2 subindex (`ExitFailure` / `ResponseSchemaViolation`) と
  非 `AiError` で偽を返すこと
- 既存 2 関数の挙動が変わらないこと (AC-022)
- `FetchProvider` が `RunAIOptions` の任意フィールドとして受けられること (AC-013 の土台)
- AC-012 を満たすこと

### Phase 3: 呼び出し元の中断判定拡張 (第 1 巡)

各 commit は catch の中断判定に Commit 5 の新判定関数を加える。出力契約の指定は行わない
(Phase 7 が担う) 。この 4 commit が着地した時点で DR-18 の中核 (設定漏れ・サーバ未起動が
全ファイルへの既定値の一括書き込みとして現れる不具合) が、実測の合否と独立に解消する。

呼び出し元は行番号ではなく実行対象。各ファイルの `runAI` 呼び出しは 1 箇所のみ。

#### Commit 6: `feat(classify): abort on unavailable backend`

**参照**: REQ-F-006 / DR-18 決定 3

**変更**:

- `phase-classify-ai.ts` の `runAI` 呼び出しを囲む catch の第 1 分岐を、`isRateLimitError(e)` と
  新判定関数の論理和へ拡張する
- 中断されない場合の挙動 (チャンク全件を action:ERROR で cache へ書き込み続行) は変えない

**テスト**: functional (`T-CL-*`)

**Green**:

- 中断側 subindex で一括処理が中断し、続行側 subindex で従来どおり続行すること (AC-004 / AC-023)
- 既存の classify テストが通ること (AC-022)

#### Commit 7: `feat(filter): abort on unavailable backend`

**参照**: REQ-F-006 / DR-18 決定 3

**変更**:

- `process-chunk.ts` の catch の中断判定 (現行は `e.subindex === 'RateLimit'` で `ctl.abort()`) に
  新判定関数を加える

**テスト**: functional (`T-FL-*`)

**Green**:

- 中断側 subindex で `ctl.abort()` が呼ばれ、続行側で呼ばれないこと (AC-004 / AC-023)
- `stats` の各カウンタが従来と同じ条件で加算されること
- 既存の filter テストが通ること (AC-022)

#### Commit 8: `feat(normalize): abort on unavailable backend`

**参照**: REQ-F-006 / DR-18 決定 3

**変更**:

- `segment-ai.ts` の catch の第 1 分岐に新判定関数を加える
- 中断されない場合の挙動 (全件 null の Map を返す) は変えない

**テスト**: functional (`T-NC-*`)

**Green**:

- 中断側 subindex で中断し、続行側で全件 null の Map が返ること (AC-004 / AC-023)
- 既存の normalize テストが通ること (AC-022)

#### Commit 9: `feat(set-frontmatter): abort on unavailable backend`

**参照**: REQ-F-006・REQ-F-019 / DR-18 決定 3

**変更**:

- 3 呼び出しのうち catch を持つのは `setfm-type-category.ts` だけである。同ファイルの catch に
  新判定関数を加える
- `setfm-frontmatter.ts` と `setfm-review.ts` は `runAI` の例外を catch せず伝播させ、
  `maxRetry` ループは YAML パース失敗のみを対象とし転送エラーはループの外へ即座に抜ける。
  この 2 箇所に拡張する catch 分岐は存在しない
- `setfm-type-category.ts` は DR-18 の起点にあたる。現行の最終分岐 (非 AiError →
  `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` を全ファイルへ書き込む) へ設定漏れや
  サーバ未起動が落ちないことを、新判定関数の追加で担保する
- `runAI` の内側にリトライを足さない。fail-first の射程は AI 実行そのものの内側を指す (REQ-C-003)

**テスト**: functional (`T-SF-*`)

**Green**:

- `InvalidEndpoint` / `BackendUnavailable` を受けたとき `DEFAULT_FALLBACK_TYPE` /
  `DEFAULT_FALLBACK_CATEGORY` が書き込まれずに中断すること (AC-019 / AC-023)
- 既存の set-frontmatter テストが通ること (AC-022)

### Phase 4: `runAI` の 3 層分割 (AC-020 の土台)

#### Commit 10: `refactor(cle-libs): split runAI into route-independent stages`

**参照**: REQ-NF-001・REQ-C-002・REQ-C-006 / transport R-010・§4.1.1 / DR-10

**変更**:

- 前段 (設定解決・モデル値の検証・タイマー生成・キャンセルシグナルの合成・経路ラベルの決定) 、
  中段 `_runViaCli` (CLI 依存の処理) 、後段 (外部 abort をタイムアウトより優先する判定・
  タイマーの解放) へ分離する
- 後段の例外メッセージが参照する `_spec.command` を経路ラベルへ置き換える。**経路ラベルの値域は、
  CLI 経路では `AI_BACKEND_COMMAND_MAP` の値 (`antigravity` に対する `agy` を含む) 、
  HTTP 経路では `llama` とする。** これにより既存の `Aborted/ExternalAbort` と
  `TimedOut/Timeout` の文言が変わらない
- `_spec.command === 'claude'` の分岐は中段 (`_runViaCli`) に属し、経路ラベルへ置き換えない
- 中段には合成済みの AbortSignal を引数で渡す。中段の実装単位はモジュール外へ公開しない
- 命名は同ファイルの既存慣例に合わせた `_` 付き camelCase の module-private とする
- 「外形の振る舞いを変えない」の範囲は error-handling §4.3 の 4 条件とする (受理範囲 /
  既定モデル / `kind` と `subindex` の組 / 分類を見る既存判定) 。例外メッセージの文言そのものは
  §4.3 の観測範囲外だが、上記の経路ラベル規則により実際にも変わらない

**テスト**: unit / integration / system (既存 `run-ai` テストの全通過)

**Green**:

- error-handling §4.3 の 4 条件がいずれも成立しないこと (AC-022)
- transport §4.1.1 の不適合条件 (1) 「タイマー生成・キャンセル優先判定を経路ごとに複製している」
  が成立しないこと
- 同 (2) 「中段の実装単位をモジュール外へ公開している」が成立しないこと
- 既存の Abort / Timeout メッセージ文言が変わらないこと
- AC-008 の既存挙動が保たれること
- AC-012 を満たすこと

なお不適合条件 (3) は Commit 21 (結線) で初めて評価できる。AC-020 の合否は (1)(2) を本 commit で、
(3) を Commit 21 で判定する。

### Phase 5: 構造化出力

#### Commit 11: `feat(cle-libs): add output contract and json_schema builder`

**参照**: REQ-F-003・REQ-F-004・REQ-C-004・REQ-C-005 / structured-output R-001〜R-003・§4.3 / DR-19

**変更**:

- `RunAIOptions` に出力契約を指定するフィールドを追加する。値は `json-array` / `yaml` /
  `line-prefixed` の 3 種。これは structured-output §7 未決 #2 の解消にあたる。フィールドの
  名称は実装時の命名に委ねる (境界は DR-19 で確定済み)
- フィールド追加が REQ-C-005 の許容範囲内であることは、既存の任意フィールド追加であり
  既存呼び出し元が無改修で動くことをもって満たす
- llama バックエンド選択時は無条件に `response_format` を適用する。3 契約のいずれも除外しない。
  既存 CLI バックエンドへは適用しない (REQ-C-004)
- json_schema の構築規則: root を常に object とし配列を root に置かない／`json-array` 契約の
  envelope フィールド名を `items` とする／定義するプロパティをすべて `required` に含め省略可能な
  プロパティを作らない／`additionalProperties` を常に `false` とする／`type` に `"null"` を併記しない／
  `minItems` / `maxItems` 等の数量制約をどの深さにも置かない／enum を含む場合は「該当なし」を
  意味するフォールバック値を必ず 1 つ含める
- `yaml` 契約のキー集合は呼び出し元の `extractYaml` が要求するキーと完全一致させ、
  `line-prefixed` のキー集合は呼び出し元が行頭前方一致で探すキーと完全一致させる

**テスト**: unit (スキーマ構築関数)

**Green**:

- 3 契約それぞれについて、生成スキーマの root が object であり、数量制約をどの深さにも
  含まず、enum を含む場合にフォールバック値が含まれること (AC-002 / AC-007)
- `additionalProperties` が常に `false` であり、定義プロパティがすべて `required` であること
- CLI バックエンド選択時にスキーマを構築しないこと (REQ-C-004)
- AC-012 を満たすこと

#### Commit 12: `feat(cle-libs): add on-wire contract validation and restorers`

**参照**: REQ-F-018 / structured-output R-007・R-008・§4.1・§4.3 / DR-18・DR-19 決定 3・4

**変更**:

- 2xx 応答の本文に対し契約ごとの最小構造検証をする。共通条件は「応答本文が JSON として
  parse できる」こと。契約別の条件は次のとおり。
  - `json-array`: root が object であり、envelope フィールドを持ち、その値が配列である
  - `yaml`: root が object であり、契約の要求する必須キーをすべて備え、各値が許容型である
  - `line-prefixed`: root が object であり、契約の要求する必須キーをすべて備え、各値が文字列である
  - enum を含む場合: 当該フィールド値が enum の許容値またはフォールバック値のいずれかである
- 不適合は `ChatlogError('AiError', 'ResponseSchemaViolation')` を throw する。これは続行側の
  分類であり、単一応答の不適合はバックエンドが使えないことを意味しないため一括処理は中断しない
- 分類名を `ResponseFormatIgnored` としてはならない (理由は DR-16「決定 3 の撤回」節が所有する)
- 検証通過後、受信 JSON を呼び出し元が既存 CLI 経路で受け取るのと同じ文字列表現へ復元する。
  `json-array` は envelope を展開し `items` の値を JSON 配列としてシリアライズした文字列、
  `yaml` は root object を YAML としてシリアライズしたテキスト、`line-prefixed` は
  `<キー>: <値>` を 1 行ずつ並べたテキスト
- フル JSON Schema validation は行わない。Deno に validator は組み込まれておらず、依存を
  JSR の 3 パッケージのみに保つ方針を崩さない
- `runAI` は復元後の文字列を返す。成否と値を持つ結果オブジェクトには変えない
- R-008 が投げる `ResponseSchemaViolation` の射程は「JSON として parse できるが契約に適合しない」場合に限る
  (DR-26 決定 2) 。JSON として parse できない 2xx 応答は Commit 15 の Step 6.5 が
  `BackendUnavailable` (中断) として先に捕らえる。連続発生に対する閾値中断は設けない
  (DR-26 決定 4)
- `yaml` 契約の「許容型」は structured-output R-008 が所有する。本 commit の着手までに
  仕様側で確定させる (§3.2)

**テスト**: unit (検証関数と復元関数)

**Green**:

- 3 契約それぞれについて、適合する応答が既存パーサ (`parseAiJsonArray` / `extractYaml` /
  行頭前方一致) で解釈できる文字列へ復元されること (AC-018)
- 不適合な応答が `ResponseSchemaViolation` を throw すること
- `line-prefixed` の復元結果から `type` / `category` が辞書の値として解決できること
  (AC-024 の前半)
- AC-012 を満たすこと

### Phase 6: HTTP トランスポート

#### Commit 13: `feat(cle-libs): add llama endpoint validation and URL normalization`

**参照**: REQ-F-015・REQ-F-019 / transport R-002・R-006・§4.3 / DR-14 決定 1・2

**変更**:

- サーバ位置値の受理条件を判定する。未設定 (キー省略または空文字列) ／絶対 URL でない／
  スキームが `http`・`https` 以外／query (`?`) を含む／フラグメント (`#`) を含む／
  userinfo (`user:pass@`) を含む — いずれかに該当すれば拒否する
- 拒否は `ChatlogError('AiError', 'InvalidEndpoint')` を throw する。中断側の分類であり、
  ネットワークアクセスを行う前に検出する
- URL 正規化は受理条件を通過した値にのみ適用する。末尾のスラッシュを除去し、除去後の末尾
  セグメントが `v1` であればそれも除去し、得られた基底に `/v1/chat/completions` を連結する
- 末尾 1 つのみを除去するため `http://host:8080/v1/v1` は `/v1/v1/chat/completions` に解決される

**テスト**: unit (受理判定関数と正規化関数)

**Green**:

- §4.3 の受理条件 1〜6 のそれぞれについて `InvalidEndpoint` が throw され、そのとき
  ネットワークアクセスが発生しないこと (AC-019)
- 末尾スラッシュあり／`/v1` あり／両方あり／両方なしの 4 通りが同一 URL に解決されること (AC-015)
- AC-012 を満たすこと

#### Commit 14: `feat(cle-libs): add llama request builder`

**参照**: REQ-F-002・REQ-NF-003 / transport R-003・R-008 (§4.2) ・R-009 /
structured-output R-001 / DR-15

**変更**:

- system テキストと user テキストを別ロールの別メッセージ要素として、system が先・user が後の
  順で構成する。連結しない
- リクエストボディに含めるフィールドを `model` / `messages` / `stream` (false 固定) /
  `response_format` の 4 つに限る。`temperature` / `top_p` / `max_tokens` 等の生成パラメータは
  送らずサーバ既定に委ねる
- `stream` を明示することで、サーバ実装の既定値によってストリーミング応答へ入る経路を塞ぐ
- リクエストボディを UTF-8 で符号化し `Content-Type: application/json; charset=utf-8` を送る
- `model` フィールドには provider prefix を除いたモデル識別子を載せる

**テスト**: unit (`FetchProvider` 注入下でのボディ構築)

**Green**:

- `messages` が `role: "system"` と `role: "user"` の 2 要素を持ち、両者が連結されていないこと
  (AC-006)
- ボディのキー集合が 4 つに一致し、生成パラメータを含まないこと
- `Content-Type` に `charset=utf-8` が含まれること
- **UTF-8 往復の判定は、送信したプロンプト文字列と `FetchProvider` が受け取ったボディを復号した
  文字列が一致することをもって行う** (AC-021 の送信側)
- AC-012 を満たすこと

#### Commit 15: `feat(cle-libs): add llama response interpretation and error mapping`

**参照**: REQ-F-005・REQ-F-006・REQ-F-017・REQ-NF-003・REQ-C-003 / transport R-007・R-008 /
error-handling R-001〜R-008 / DR-03・DR-15・DR-18・DR-26

**変更**:

- 応答本文を UTF-8 として復号する (transport R-008)
- 分類は error-handling §4.1 の Step 順で評価する。Rule ID 順ではなく、順序の変更は許されない
- Step 1: HTTP 応答が一切得られない (接続失敗・到達不能・DNS 解決失敗、および Deno runtime
  由来の失敗 — 権限不足 `Deno.errors.NotCapable`・TLS 検証失敗等) → `BackendUnavailable` (中断) 。
  runtime 由来のものは `detail` にその旨を残し、ネットワーク到達不能と読み分けられるように
  する (DR-26 決定 1)
- Step 2: 429 / 503 / 504 → `RateLimit` (中断)
- Step 3: 404 / 501 → `BackendUnavailable` (中断)
- Step 4: 401 / 403 → `BackendUnavailable` (中断)
- Step 5: 400 かつ本文から `response_format` の拒否と判別できる → `ResponseFormatRejected` (中断) 。
  **判別条件は Phase 0 の実測結果から定める。** 判別できない 400 は Step 6 へ落とし、判別ロジックは
  差し替え可能な形で分離しておく
- Step 6: 上記以外の非成功ステータス (判別できない 400 を含む) → `ExitFailure` (続行)
- Step 6.5: 成功ステータスだが本文が JSON として parse できない、または `Content-Type` が
  `application/json` 系でない (`stream: false` を無視して SSE / chunked を返すサーバ) →
  `BackendUnavailable` (中断) 。サーバが送信したフィールドを honour していないことを示し、
  後続のすべての呼び出しも同じ結果になる。Step 7 は本 Step を通過した応答にのみ適用する
  (DR-26 決定 2)
- Step 7: 成功ステータスだがアシスタントテキストを取り出せない → `ExitFailure` (続行) 。
  条件は (a) `choices` が存在しない・空配列 (b) `choices[0].message.content` が null・欠落
  (c) `content` が文字列でない (配列・オブジェクト・`tool_calls` 中心の応答を含む)
  (d) `choices[0].finish_reason` が `stop` 以外 (`length` はもちろん `eos` / `end_turn` 等の
  実装固有値も正常完了として受理しない) 。欠落・`null` も「`stop` 以外」に含める。実装は
  `finish_reason !== 'stop'` として判定し、値の存在を前提としない (DR-26 決定 3)
- 成功ステータスの応答からは `choices[0]` のみを採用し、2 番目以降を無視する
- `kind` は一律 `AiError` とする。呼び出し元の最後の分岐 (非 AiError → フォールバック値) へ
  落ちる経路を作らない
- リトライ・他バックエンドへのフォールバックは行わない (REQ-C-003)

**テスト**: unit (`FetchProvider` 注入下でのステータス写像と本文解釈)

**Green**:

- Step 1〜7 の各分岐が期待する `kind` / `subindex` を throw すること (AC-004 / AC-005 / AC-023)
- `choices` を 2 要素以上含む応答で `choices[0]` のみが採用されること (AC-017)
- 非 ASCII を含む応答本文の復号結果が呼び出し元へ渡る文字列と一致すること (AC-021 の受信側)
- 実ネットワークアクセスが発生しないこと (AC-013)
- AC-012 を満たすこと

### Phase 7: 出力契約の指定 (第 2 巡)

各 commit は `runAI` オプションに出力契約を指定する。呼び出し元のパース処理そのものは
変更しない。catch の拡張は Phase 3 で完了している。

#### Commit 16: `feat(classify): specify json-array output contract`

**参照**: REQ-F-018 / DR-19

**変更**:

- `phase-classify-ai.ts` の `runAI` 呼び出しに出力契約 `json-array` を指定する

**テスト**: functional (`T-CL-*`)

**Green**:

- 呼び出しオプションに `json-array` が渡ること
- 既存の classify テストが通ること

#### Commit 17: `feat(filter): specify json-array output contract`

**参照**: REQ-F-018 / DR-19

**変更**:

- `process-chunk.ts` の `runAI` 呼び出しに出力契約 `json-array` を指定する

**テスト**: functional (`T-FL-*`)

**Green**:

- 呼び出しオプションに `json-array` が渡ること
- 既存の filter テストが通ること

#### Commit 18: `feat(normalize): specify json-array output contract`

**参照**: REQ-F-018 / DR-19

**変更**:

- `segment-ai.ts` の `runAI` 呼び出しに出力契約 `json-array` を指定する

**テスト**: functional (`T-NC-*`)

**Green**:

- 呼び出しオプションに `json-array` が渡ること
- 既存の normalize テストが通ること

#### Commit 19: `feat(set-frontmatter): specify yaml and line-prefixed contracts`

**参照**: REQ-F-018 / DR-19

**変更**:

- 3 呼び出しの出力契約を指定する。`setfm-frontmatter.ts` と `setfm-review.ts` は `yaml`、
  `setfm-type-category.ts` は `line-prefixed`
- `ResponseSchemaViolation` は `runAI` が throw する転送側の例外であり、`setfm-frontmatter.ts` /
  `setfm-review.ts` の `maxRetry` ループの外へ抜ける。当該ファイル 1 件のみが失敗として
  記録され、一括処理は続行する

**テスト**: functional (`T-SF-*`)

**Green**:

- 3 呼び出しにそれぞれの契約が渡ること
- `line-prefixed` の復元結果から `type` / `category` が辞書の値として解決され、
  `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` が書き込まれないこと (AC-024)
- 既存の set-frontmatter テストが通ること

### Phase 8: 権限付与と結線

Commit 21 が llama 経路を可到達にする唯一の commit にあたる。

#### Commit 20: `chore(skills): grant --allow-net to AI execution paths`

**参照**: REQ-F-010・REQ-F-011 / config-packaging R-003・R-004・§5 / DR-13・DR-24 決定 1

**変更**:

- `--allow-net` を付与する対象は、`classify-chatlogs` / `filter-chatlogs` (`$SCRIPT_PATH` の
  実行行のみ) / `normalize-chatlogs` / `set-frontmatter` (実行行 2 箇所) の各 SKILL.md、
  `deno.json` の `test:module` タスク、および shebang 行 3 本
  (`classify-chatlogs.ts` / `filter-chatlogs.ts` / `set-frontmatter.ts`)
- 付与しない対象は `export-chatlogs` の `$SCRIPT_PATH`、`filter-chatlogs` の
  `$NOISE_FILTER_PATH` と `$STRIP_PATH`。誤付与は過剰な権限付与として不適合となる
- `normalize-chatlogs` のスクリプトは shebang 行を持たないため対象は SKILL.md の実行行のみ
- 宛先は限定せず無制限に付与する。接続先が実行時に `config.yaml` からしか判明せず、静的に
  書くフラグでは設定変更に追随できないため
- フラグ列を省略した SKILL.md の例示行 (`deno run ... "$SCRIPT_PATH"` のようにフラグ集合そのものを
  記述していない行。REQ-F-010 の除外規定 / config-packaging §5) は判定対象外とする
- `scripts/aplys-tester.ts` の `buildDenoArgs` には `--allow-net` を付与しない。実ネットワークを
  張る system テストを書かないため (DR-21 決定 5)
- `filter-chatlogs/SKILL.md` の「AI を呼び出さないため `--allow-run` は不要」という既存記述と
  整合を取る
- 本 commit の直前に対象ファイル集合を数え直す。Phase 1〜7 の編集で shebang の有無や実行行の
  数が変わりうる

**テスト**: system (フラグ列の静的検査)

**Green**:

- 対象として列挙した行にのみ `--allow-net` が含まれ、非 AI 経路の行に含まれないこと (AC-011)
- AC-012 を満たすこと

> 本 commit の着地から Commit 21 の着地までの間、llama 経路は未結線のまま権限だけが広がる。
> これは REQ-F-010 が避けようとする過剰付与にあたるが、挙動を壊さないため、逆向きの状態
> (経路はあるが権限がない) より害が小さいと判断する (DR-24 Consequences) 。

#### Commit 21: `feat(cle-libs): wire llama route into runAI`

**参照**: REQ-F-001・REQ-F-007・REQ-F-012・REQ-NF-001 /
transport §4.1・R-001・R-004・R-005・R-010・§4.4 / DR-10・DR-17・DR-20・DR-24・DR-27

**変更**:

- 中段に `_runViaHttp` を追加し、経路の判定を `_buildCommand` の呼び出しより前に置く。
  llama は CLI コマンド名を持たず、コマンド構築の既定分岐が未知モデルとして例外を投げるため
- 実行時の結合順序は transport §4.1 が唯一の正であり、推測で補完しない。
  Step 1 バックエンド選択 (モデル値の prefix 判定) → Step 2 モデル値の受理判定 →
  Step 3 エンドポイントの検証と URL 正規化 → Step 4 スキーマ構築 → Step 5 リクエスト構成 →
  Step 6 送信 (キャンセルシグナル合成下) → Step 7 レスポンス解釈 → Step 7.5 出力契約の検証と
  復元。Step 4 と Step 7.5 は llama 経路では常に実行される
- Step 2 を Step 3 より前に置くのは、不正モデル名をエンドポイント解決より先に弾く既存
  CLI 経路の順序に合わせるため
- タイムアウトは既存の `timeoutMs` をそのまま用い経路別の設定キーを設けない。タイムアウト値が
  ゼロならタイマーを設定せず、外部キャンセルとタイムアウトが同時なら外部キャンセルを優先報告
  する。この規則は経路を問わず単一の規定に従い、経路ごとの別規定を持たない
- 呼び出し元がテストダブルを注入していればそれを用い、なければ既定の呼び出し手段を用いる。
  切り替え点は送信そのものだけとし、リクエスト構築処理と応答解釈処理を経路ごとに複製しない
- **注入の観測点** (transport §4.4 が定める 2 点) は、組み立てられたリクエスト (URL・メソッド・
  ヘッダ・ボディの各フィールド) と、応答を解釈した結果 (呼び出し元へ返る文字列、または
  throw される分類と `detail`) とする
- 合成済みの `AbortSignal` を `RequestInit` の `signal` として `FetchProvider` へ渡す。
  既存 CLI 経路が `run-ai.ts:230` で `signal: AbortSignal.any(_signals)` を `Deno.Command` へ
  渡しているのと同じ役割にあたる。ここを落とすと、後段の分類は期待どおり動くまま
  「応答を返さないサーバに対して `timeoutMs` が効かない」実装になる (DR-27 決定 1)

**テスト**: integration (`runAI` と内部境界の結合) ／ unit (`FetchProvider` 注入下の経路選択)

**Green**:

- `model: llama/<model>` かつ `llamaEndpoint` 設定済みで `/v1/chat/completions` への POST が
  組み立てられること (AC-001)
- `llamaEndpoint` 未設定時に `FetchProvider` が一度も呼ばれずに `InvalidEndpoint` が
  throw されること (AC-019)
- **`FetchProvider` が受け取る `RequestInit` の `signal` が合成済みの `AbortSignal` であること。
  タイムアウト発火時および外部 abort 時に当該 `signal` が abort 状態へ遷移すること** (DR-27
  決定 1・2) 。分類の一致のみをもって合格としない
- そのうえで `timeoutMs=0` でタイマーが設定されず、外部 abort が `Aborted/ExternalAbort` として
  扱われること (AC-008)
- transport §4.1.1 の不適合条件 (3) 「経路の判定を `_buildCommand` の呼び出しより後に置いている」
  が成立しないこと (AC-020)
- 注入ありの経路が注入なしと同一のリクエスト構築処理・応答解釈処理を通ること (AC-013)
- 6 呼び出しが契約から構築した `response_format` を含み、復元済み文字列を受け取ること
  (AC-002 / AC-018)
- **production コード (`*.spec.ts` を除く) の `runAI(` 呼び出しを静的に列挙し、全件が出力契約を
  指定していること** (DR-27 決定 3) 。この検査は system レイヤのテストとして残し、以降の
  呼び出し追加に対する回帰とする (DR-27 決定 4)
- AC-012 を満たすこと

### Phase 9: ドキュメント

#### Commit 22: `docs(skills): document llamaEndpoint and llama backend`

**参照**: REQ-F-008 / DR-05

**変更**:

- `llamaEndpoint` 設定キーと `model: llama/<model>` の記法を各 SKILL.md と設定ドキュメントへ
  記載する
- `agent` キー (エクスポート元エージェント) と AI バックエンド (`model`) が別軸であることを
  明記する

**テスト**: なし (ドキュメントのみ。BDD RGR サイクルの免除条件に該当する)

**Green**:

- dprint / markdownlint / textlint が通ること
- 記載先が `.config/chatlog-exporter/` 配下を含む場合は AC-012 を満たすこと

---

## 3. 補足事項

### 3.1 共有ライブラリのミラーについて

各 commit の記述は手編集の指示ではない。`lefthook.yml` の pre-commit フックが
`.config/chatlog-exporter/**` / `deno.json` / `skills/_cle-libs/**` の変更を検知して
`scripts/sync-skill-assets.sh` を実行し、`skills/setup-chatlogs/assets/` 配下を自動生成して
`git add` する。手で編集するのは上流側のファイルのみであり、ミラー側を直接編集してはならない。
pre-push の `--check-head` が rebase replay や `--no-verify` ですり抜けた drift を止める。

この同期義務は REQ-F-011 / config-packaging R-004 が所有する。

AC-012 (`bash scripts/sync-skill-assets.sh --check-staged` が差分なしで終了する) は、
上記 3 経路に触れる各 commit の完了条件とする (DR-21 決定 4) 。Phase 末での一括検査には代えない。
対象は Commit 1〜5・10〜15・20・21、および記載先によって Commit 22。Commit 6〜9 と Commit 16〜19 は
呼び出し元スキル配下のみを編集するため対象外とする。

### 3.2 Phase 0 の実測に依存して残る未決

| 未決                                                                                                 | 依存先              | 扱い                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `response_format` の拒否 (中断) とコンテキスト長超過 (続行) が同じ HTTP 400 で返る場合の読み分け手段 | Commit 15 の Step 5 | 判別できない 400 は続行側の `ExitFailure` に落とす。判別ロジックは差し替え可能な形に分離する |
| `finish_reason` の実装固有値 (`eos` / `end_turn` 等) の実在確認                                      | error-handling §4.1 | `finish_reason !== 'stop'` をすべて失敗とする。受理すべき値が判明したら §4.1 の表を改訂する  |
| `yaml` 契約の「許容型」の定義                                                                        | Commit 12           | structured-output R-008 が所有する論点。Commit 12 の着手までに仕様側で確定させる             |

---

## 4. Rule Coverage

4 つの仕様ファイルが持つ規範規則 (計 30 件) と、それを実装する commit の対応。
割り当ての無い行が残った場合、それは表の欠落ではなく commit 分解の欠落を意味する。

### 4.1 specifications-transport.md (R-001〜R-010)

| Rule  | 内容                                         | Commit  |
| ----- | -------------------------------------------- | ------- |
| R-001 | モデル値の prefix 判定による HTTP 経路の選択 | 3 / 21  |
| R-002 | サーバ位置値の URL 正規化                    | 13      |
| R-003 | system / user を別メッセージ要素として構成   | 14      |
| R-004 | タイムアウト・キャンセル合成規則の共有       | 10 / 21 |
| R-005 | 送信手段の注入可能性 (切り替え点は送信のみ)  | 5 / 21  |
| R-006 | サーバ位置値の受理条件と `InvalidEndpoint`   | 13      |
| R-007 | `choices[0]` のみを採用する                  | 15      |
| R-008 | UTF-8 符号化と `charset=utf-8` (横断規則)    | 14 / 15 |
| R-009 | リクエストボディを 4 フィールドに限定        | 14      |
| R-010 | 前段 / 中段 / 後段の 3 層分割 (AC-020)       | 10 / 21 |

### 4.2 specifications-structured-output.md (R-001〜R-008)

R-006 は実装着手前のゲートであり commit を持たない。Phase 0 が担う。

| Rule  | 内容                                          | Commit  |
| ----- | --------------------------------------------- | ------- |
| R-001 | 出力契約から json_schema を構築し無条件に適用 | 11 / 14 |
| R-002 | 数量制約をどの深さにも置かない                | 11      |
| R-003 | enum にフォールバック値を必ず含める           | 11      |
| R-004 | 共有の配列パーサが空配列を成功として返す      | 1       |
| R-005 | JSON 解釈不能は従来どおりパース失敗           | 1       |
| R-006 | 実装着手前ゲート (3 スキーマ × 4 条件)        | —       |
| R-007 | 受信 JSON を呼び出し元の文字列表現へ復元      | 12      |
| R-008 | on-wire contract validation と続行側の分類    | 12      |

### 4.3 specifications-error-handling.md (R-001〜R-008)

§4.1 の評価は Step 順であり Rule ID 順ではない。分類の実装は Commit 15 に閉じる。

| Rule  | Step | 内容                                                   | Commit |
| ----- | ---- | ------------------------------------------------------ | ------ |
| R-001 | 1    | 接続失敗 → `BackendUnavailable` (中断)                 | 15     |
| R-002 | 2    | 429 / 503 / 504 → `RateLimit` (中断)                   | 15     |
| R-006 | 3    | 404 / 501 → `BackendUnavailable` (中断)                | 15     |
| R-007 | 4    | 401 / 403 → `BackendUnavailable` (中断)                | 15     |
| R-008 | 5    | 400 かつ拒否と判別可 → `ResponseFormatRejected` (中断) | 15     |
| R-003 | 6    | 上記以外の非成功 → `ExitFailure` (続行)                | 15     |
| R-004 | 7    | 成功だが本文を取り出せない → `ExitFailure` (続行)      | 15     |
| R-005 | 独立 | モデル値の受理判定と案内文言の実態追随                 | 2 / 3  |

§3.2 が所有する失敗分類の一覧を呼び出し元の中断へ届ける経路 (DR-18 決定 3) は、
判定関数の新設が Commit 5、呼び出し元 catch の拡張が Commit 6〜9 にあたる。

### 4.4 specifications-config-packaging.md (R-001〜R-004)

| Rule  | 内容                                               | Commit             |
| ----- | -------------------------------------------------- | ------------------ |
| R-001 | `llamaEndpoint` を既知キーとして受理し既定値を解決 | 4                  |
| R-002 | `agent` と `model` を互いに独立に解決              | 4                  |
| R-003 | AI を呼ぶ経路にのみ `--allow-net` を付与           | 20                 |
| R-004 | 配布ミラーの同期義務 (`--check-staged` が差分なし) | §3.1 の対象 commit |

R-004 は特定の commit に閉じない。§3.1 が対象 commit を列挙する。

---

## 5. AC Coverage

要件 §8 の受け入れ基準 (AC-001〜AC-024) と、それを検証する commit の対応 (DR-21 決定 1) 。
割り当ての無い行が残った場合、それは表の欠落ではなく commit 分解の欠落を意味する。

| AC     | 内容                                           | 検証 commit                  | レイヤ             |
| ------ | ---------------------------------------------- | ---------------------------- | ------------------ |
| AC-001 | llama 選択時のリクエスト送信                   | 21                           | integration        |
| AC-002 | 構造化出力の強制 (無条件)                      | 11 / 21                      | unit / integration |
| AC-003 | 空配列のパース成功                             | 1                            | unit               |
| AC-004 | 接続失敗 → 中断                                | 15 / 6〜9                    | unit / functional  |
| AC-005 | 429 / 503 / 504 → `RateLimit`                  | 15                           | unit               |
| AC-006 | system / user の分離送信                       | 14                           | unit               |
| AC-007 | 数量制約の排除と enum フォールバック           | 11                           | unit               |
| AC-008 | タイムアウトと外部 abort の優先順位            | 10 / 21                      | unit / integration |
| AC-009 | `llamaEndpoint` の設定読み込み                 | 4                            | unit               |
| AC-010 | `agent` と backend の分離                      | 4                            | unit               |
| AC-011 | `--allow-net` の付与範囲                       | 20                           | system             |
| AC-012 | 配布ミラーの同期                               | §3.1 の対象 commit           | system             |
| AC-013 | unit テストからの HTTP 経路検証                | 5 / 13〜15 / 21              | unit               |
| AC-014 | モデル名エラーの案内文言                       | 2 / 3                        | unit               |
| AC-015 | `llamaEndpoint` の URL 正規化                  | 13                           | unit               |
| AC-016 | 互換性の実測ゲート                             | Phase 0 (commit なし)        | —                  |
| AC-017 | 複数 `choices` の採用規則                      | 15                           | unit               |
| AC-018 | 出力契約と復元                                 | 12 / 21                      | unit / integration |
| AC-019 | 接続先未設定の検出                             | 13 / 21 / 9                  | unit / functional  |
| AC-020 | 内部境界の分離                                 | 10 (条件 1・2) / 21 (条件 3) | 静的検査           |
| AC-021 | HTTP 経路での UTF-8 往復                       | 14 (送信) / 15 (受信)        | unit               |
| AC-022 | 既存バックエンドの非破壊                       | 1 / 2 / 3 / 10 / 6〜9        | 全レイヤの回帰     |
| AC-023 | 続行側の失敗が一括処理を止めない               | 15 / 6〜9                    | unit / functional  |
| AC-024 | `type` / `category` がフォールバックへ落ちない | 12 / 19                      | unit / functional  |

判定基準の詳細は各 commit の Green 条件が持つ。表の読み方として次の 3 点のみ補足する。

- AC-008 — 後段の分類 (`TimedOut/Timeout` / `Aborted/ExternalAbort`) だけでは `signal` の
  受け渡し漏れを検出できない。Commit 21 は `FetchProvider` が受け取る `signal` の合成と
  abort 遷移まで含めて判定する (DR-27 決定 1・2)
- AC-020 — 合否は transport §4.1.1 の 3 つの不適合条件で判定する。(1)(2) を Commit 10 で、
  (3) を Commit 21 で評価する (DR-21 決定 3)
- 出力契約の指定漏れ — production の `runAI(` 呼び出しを静的に列挙する system テストで
  検出する (DR-27 決定 3・4) 。DR-20 が commit の並び順で確立した「契約なしの llama 呼び出しが
  実在しない」という前提を、以降の呼び出し追加に対しても維持するためとする

---

## 6. Change History

<!-- SemVer: MAJOR = approach discarded, MINOR = decision criterion added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in specifications.md.
     See deckrd-rule-document-versioning.md -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-03 | 1.0.0   | Initial implementation plan                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-09-04 | 1.1.0   | impl レビュー 3 本 (explore / harden / fix) の所見を反映: DR-20 により Phase 6 を 2 巡へ分割し結線を単一 commit へ (18 → 22 commit) 、DR-21 により §5 AC Coverage と各 commit のテスト方針を新設、DR-22 により Phase 0 の成果物と不合格時の帰結を確定、DR-23 を Commit 3 へ、fix 所見により用語・構造・完了条件・文体を整理。旧番号の読み替えは 6→10 / 7→11 / 8→12 / 9→13 / 10→14 / 11→15 / 12→21 / 13→6・16 / 14→7・17 / 15→8・18 / 16→9・19 / 17→20 / 18→22 |
| 2026-09-04 | 1.2.0   | codex balanced セカンドオピニオンの所見を反映: DR-24 により `--allow-net` を結線の前 (Commit 20) へ移し Commit 21 の着手条件を 2 つに、実測不合格時の着地範囲を Phase 1 のみへ限定、DR-25 により Phase 0 の合格線を全 12 組 10/10 とし `finish_reason` を測定項目へ、DR-26 により runtime 由来の失敗と非 JSON 応答を中断側へ                                                                                                                                  |
| 2026-09-04 | 1.3.0   | codex completeness セカンドオピニオンの所見を反映: DR-27 により Commit 21 の Green 条件へ `RequestInit.signal` の受け渡しと abort 遷移の検証を追加し分類のみでの合格を排除、production の `runAI` 呼び出しが全件出力契約を持つことの静的検査を system テストとして追加                                                                                                                                                                                        |
| 2026-09-04 | 1.3.1   | codex consistency セカンドオピニオンの所見を反映 (訂正のみ): Commit 20/21 入れ替えに未追随の参照 2 件を訂正 (Commit 10 の注記・Phase 7 の着手条件) 、§3.1 のミラー同期対象へ Commit 21 を追加、§4.2 R-001 の割り当てへ Commit 14 を追加し Commit 14 の参照行と双方向にした                                                                                                                                                                                    |
| 2026-09-04 | 1.3.2   | 構成の整理 (決定内容の変更なし): 着手条件を §1.4 の依存表へ集約、全 22 commit を参照／変更／テスト／Green の固定書式へ統一、重複記述を単一の所有箇所へ集約 (AC-020 の不適合条件・AC-008 の signal 検証・Phase 0 依存の未決) 、陳腐化した §6 Commit 番号対応表を削除し 1.1.0 行へ圧縮、旧 Open Items 表を各 commit 本文へ吸収、Commit 15 Step 5 の記述を実測後の恒久規則へ書き換え                                                                             |
