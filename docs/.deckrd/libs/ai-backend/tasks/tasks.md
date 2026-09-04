---
title: "Implementation Tasks"
module: libs/ai-backend
status: Active
created: "2026-09-04 00:00:00"
source: specifications-index.md
based-on: implementation.md v1.3.2
---

<!-- cspell:words qwen llamacpp -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-doubled-joshi,
  ja-technical-writing/ja-no-redundant-expression,
  ja-technical-writing/no-unmatched-pair,
  ja-technical-writing/max-comma,
   -->
<!-- markdownlint-disable no-duplicate-heading line-length -->

> This document contains implementation tasks derived from specifications.
> Each task corresponds to a single unit test case (`it()` block).

---

## Conventions

### 参照の書き方

- `Rule` の `R-NNN` には **必ず spec 分冊名を前置** する
  (`transport R-001` / `structured-output R-001` / `error-handling R-001` /
  `config-packaging R-001`)。R-001 は 4 分冊すべてに存在するため、前置しないと参照が壊れる。
- `Edge <分冊>-<行番号>` は各 spec の §5 Edge Cases の行を指す。
  Edge Cases 行に元来 ID は振られていないため、表の出現順に 1 起点で採番した。
- `DD-NN` は各 spec の §2.5、`DR-NN` は `decision-records.md`、
  `AC-NNN` / `REQ-*` は `requirements.md` v1.6.0 を指す。
- `SPEC-NNN` / `IMPL-NNN` は本プロジェクトに存在しない。

### 2 つの ID 名前空間

| ID               | 名前空間                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `T-XX-YY-ZZ`     | deckrd のタスク ID。本文書内でのみ一意                                                   |
| `T-<スコープ>-…` | このリポジトリのテスト ID (`docs/rules/testing-conventions.md`)。リポジトリ全体で一意 |

両者は別物。各タスクの `Test ID` が実装時に `it()` ラベルへ載る値であり、
`T-XX-YY-ZZ` はコードに現れない。Test ID prefix は着手前にリポジトリ全体で
未使用であることを検査済み。`T-LIB-J` は既存の続きとして連番 20 から、
`T-LIB-AI-RA` は同じく 50 から採番した。

### 実装単位と着手条件

実装単位は implementation.md の Commit 1〜22 で識別する。
各 `## T-XX` 直下の blockquote が Commit 番号・配置・Phase の着手条件を持つ。

Phase 5 以降 (Commit 11〜22) は **Phase 0 実測ゲートの合格** が着手条件である
(implementation §1.4 / DR-20 決定 3)。実測レポートは未作成であり、
Phase 0 に依存して残る未決 3 件 (implementation §3.2) については
**現行の既定挙動でタスク化** し、該当タスクの直後に改訂条件を blockquote で記した。

Commit 22 (ドキュメントのみ) は BDD RGR サイクルの免除条件に該当するため
Test Target を持たない。Phase 0 も commit を持たない測定作業でありタスク化しない。

### 異常系が存在しない Test Target

仕様上、異常系そのものが存在する余地のない Test Target については
`### [異常] Error Cases` の直下に `> [N/A] <根拠>` を置き、埋め草のタスクを作っていない。
Category Balance でも `[N/A]` として扱い、0 件のカテゴリとは区別する。

---

## Task Summary

| Test Target                                                         | Commit | Phase | Scenarios | Cases   | Status  |
| ------------------------------------------------------------------- | ------ | ----- | --------- | ------- | ------- |
| T-01: `parseAiJsonArray` / `_tryParseNonEmptyArray`                 | 1      | 1     | 3         | 5       | pending |
| T-02: 受理モデル形式の文言生成関数                                  | 2      | 1     | 4         | 6       | pending |
| T-03: `parseModel` / `getAiBackend` / `isValidModel` + llama 定数群 | 3      | 2     | 7         | 10      | pending |
| T-04: `GlobalConfig` (`llamaEndpoint`)                              | 4      | 2     | 7         | 8       | pending |
| T-05: `FetchProvider` 型 / llama 中断側判定関数                     | 5      | 2     | 5         | 13      | pending |
| T-06: 呼び出し元 catch の中断判定拡張 (4 スキル)                    | 6〜9   | 3     | 12        | 12      | pending |
| T-07: `runAI` の 3 層分割                                           | 10     | 4     | 7         | 13      | pending |
| T-08: json_schema 構築関数                                          | 11     | 5     | 9         | 9       | pending |
| T-09: on-wire contract validation 関数と契約別復元関数              | 12     | 5     | 13        | 13      | pending |
| T-10: エンドポイント受理判定関数 / URL 正規化関数                   | 13     | 6     | 3         | 13      | pending |
| T-11: llama リクエストボディ構築                                    | 14     | 6     | 3         | 7       | pending |
| T-12: llama 応答解釈とエラー写像                                    | 15     | 6     | 12        | 31      | pending |
| T-13: 出力契約の指定 (6 呼び出し)                                   | 16〜19 | 7     | 10        | 10      | pending |
| T-14: `--allow-net` 付与範囲の静的検査                              | 20     | 8     | 8         | 8       | pending |
| T-15: `_runViaHttp` の結線                                          | 21     | 8     | 9         | 14      | pending |
| **合計**                                                            | —      | —     | **112**   | **172** | —       |

<!-- Status may be: pending | in progress | done -->

---

## T-01: `parseAiJsonArray` / `_tryParseNonEmptyArray`（空配列受理）

> Commit: 1 / 配置ファイル: `skills/_cle-libs/libs/text/json-utils.ts` / Phase: 1（着手条件: なし）/ Test ID prefix: `T-LIB-J`（scenario 番号は 20 から）

### [正常] Normal Cases

#### T-01-01: 直接パース段での空配列受理

- [ ] **T-01-01-01**: 構文的に有効な空配列 `"[]"` を成功結果として返す
  - Target: `_tryParseNonEmptyArray`
  - Test ID: `T-LIB-J-20-01`
  - Rule: structured-output R-004 / REQ-F-013 / AC-003
  - Scenario: Given 対象テキストが `"[]"` である, When `parseAiJsonArray` を直接パース段で呼ぶ
  - Expected: Then 例外を投げず、空配列 `[]` を成功結果として返すこと

- [ ] **T-01-01-02**: 非空配列は従来どおり成功として返す（回帰）
  - Target: `parseAiJsonArray`
  - Test ID: `T-LIB-J-20-02`
  - Rule: structured-output R-004 / REQ-C-002
  - Scenario: Given 対象テキストが `'["a","b"]'` である, When `parseAiJsonArray` を呼ぶ
  - Expected: Then `["a", "b"]` が成功結果として返ること（空配列受理の追加が非空配列の解釈を変えないこと）

### [異常] Error Cases

#### T-01-02: JSON 解釈不能な入力の失敗

- [ ] **T-01-02-01**: JSON として解釈不能なテキストはパース失敗のままである
  - Target: `parseAiJsonArray`
  - Test ID: `T-LIB-J-21-01`
  - Rule: structured-output R-005 / REQ-F-013
  - Scenario: Given 対象テキストが構文的に無効な文字列（例: 閉じ括弧を欠いた不完全な JSON）である, When `parseAiJsonArray` を呼ぶ
  - Expected: Then R-004（空配列成功）とは区別されたパース失敗として扱われること

### [エッジケース] Edge Cases

#### T-01-03: 空配列と無関係な括弧対の区別

- [ ] **T-01-03-01**: 括弧対を含む単なる散文は空配列と誤認しない
  - Target: `parseAiJsonArray`
  - Test ID: `T-LIB-J-22-01`
  - Rule: structured-output Edge-empty-array-vs-prose
  - Scenario: Given 対象テキストが `"見解は () に依存する"` のように無関係な括弧対を含む散文である, When `parseAiJsonArray` を呼ぶ
  - Expected: Then 空配列として成功させず、パース失敗として扱うこと

- [ ] **T-01-03-02**: 括弧マッチ段（間接抽出段）は空配列を依然として失敗とする
  - Target: `_tryParseNonEmptyArray`（括弧マッチ段からの呼び出し経路）
  - Test ID: `T-LIB-J-22-02`
  - Rule: structured-output R-004（直接パース段限定） / DR-06
  - Scenario: Given 括弧マッチによって抽出された対象テキストが空配列相当である, When 括弧マッチ段経由で `_tryParseNonEmptyArray` を呼ぶ
  - Expected: Then 直接パース段とは異なり、空配列はパース失敗のまま返ること（段全体を緩めていないことの確認）

---

---

## T-02: 受理モデル形式の文言生成関数

> Commit: 2 / 配置ファイル: `skills/_cle-libs/libs/ai/run-ai.ts` / Phase: 1（着手条件: なし）/ Test ID prefix: `T-LIB-AI-MSG`

### [正常] Normal Cases

#### T-02-01: 現在受理されるすべての形式が案内文言に含まれる

- [ ] **T-02-01-01**: bare 名（opus/sonnet/haiku）が文言に含まれる
  - Target: モデル受理形式の文言生成関数
  - Test ID: `T-LIB-AI-MSG-01-01`
  - Rule: error-handling R-005 / DR-06
  - Scenario: Given `AI_MODEL_TO_PROVIDER_MAP` の `exact` エントリが `opus` / `sonnet` / `haiku` を含む, When 案内文言を生成する
  - Expected: Then 生成された文言に `opus, sonnet, haiku` が含まれること

- [ ] **T-02-01-02**: regex エントリの表示ラベル（`gpt-*` / `gemini-*`）が文言に含まれる
  - Target: モデル受理形式の文言生成関数
  - Test ID: `T-LIB-AI-MSG-01-02`
  - Rule: error-handling R-005 / DR-06
  - Scenario: Given `AiModelToProvider` の `regex` エントリが表示ラベル `gpt-*` / `gemini-*` を持つ, When 案内文言を生成する
  - Expected: Then 生成された文言に `gpt-*` と `gemini-*` が含まれること

- [ ] **T-02-01-03**: `<provider>/<model>` 形式の provider 一覧（llama を含む）が文言に含まれる
  - Target: モデル受理形式の文言生成関数
  - Test ID: `T-LIB-AI-MSG-01-03`
  - Rule: error-handling R-005 / error-handling §4.3 / REQ-F-014 / AC-014
  - Scenario: Given `AI_PROVIDERS` が `llama` を含む状態である, When 案内文言を生成する
  - Expected: Then 生成された文言の `<provider>/<model>` 一覧に `llama` が含まれること

#### T-02-02: 定数からの動的生成（AC-022 非破壊確認）

- [ ] **T-02-02-01**: `AI_PROVIDERS` への追加が手書きなしで文言へ反映される
  - Target: モデル受理形式の文言生成関数
  - Test ID: `T-LIB-AI-MSG-02-01`
  - Rule: error-handling R-005 / REQ-F-014
  - Scenario: Given `AI_PROVIDERS` にテスト用の provider を追加した状態である, When 案内文言を生成する
  - Expected: Then 追加した provider 名が文言に自動的に反映されること（文言側の手書き分岐を経由しないこと）

### [異常] Error Cases

> [N/A] Commit 2 は定数由来の純粋な文言生成関数であり throw する経路を持たない

### [エッジケース] Edge Cases

#### T-02-03: regex ラベルと正規表現ソースの分離

- [ ] **T-02-03-01**: 正規表現ソースそのものは文言に出力されない
  - Target: モデル受理形式の文言生成関数
  - Test ID: `T-LIB-AI-MSG-03-01`
  - Rule: error-handling R-005 / DR-06
  - Scenario: Given `regex` エントリが表示ラベルとは別に正規表現ソース（例: `/^gpt-/`）を保持している, When 案内文言を生成する
  - Expected: Then 文言に正規表現ソースの生文字列が含まれず、表示ラベルのみが使われること

---

#### T-02-04: `AiModelToProvider` の regex 側が表示ラベルを必須で持つ

- [ ] **T-02-04-01**: 表示ラベルを欠いた regex エントリを型が受け付けない
  - Target: `AiModelToProvider`
  - Test ID: `T-LIB-AI-MSG-04-01`
  - Rule: error-handling R-005 / DR-06 / REQ-F-014
  - Scenario: Given 表示ラベルのフィールドを持たない regex エントリ, When `AI_MODEL_TO_PROVIDER_MAP` の型に代入する
  - Expected: Then 型レベルで代入不能となり、文言生成関数が参照するラベルの欠落がコンパイル時に検出されること

---

## T-03: `parseModel` / `getAiBackend` / `isValidModel` + llama 定数群

> Commit: 3 / 配置ファイル: `skills/_cle-libs/libs/ai/model-utils.ts` と AI 関連定数 / Phase: 2（着手条件: Phase 1 完了）/ Test ID prefix: `T-LIB-AI-MDL`

### [正常] Normal Cases

#### T-03-01: llama モデル値の解決

- [ ] **T-03-01-01**: `llama/qwen3-14b` が provider `llama` / model `qwen3-14b` として解決される
  - Target: `parseModel`
  - Test ID: `T-LIB-AI-MDL-01-01`
  - Rule: transport R-001 / REQ-F-001
  - Scenario: Given モデル値が `"llama/qwen3-14b"` である, When `parseModel` を呼ぶ
  - Expected: Then `{ provider: 'llama', model: 'qwen3-14b' }` が返ること

- [ ] **T-03-01-02**: `llama/qwen3-14b` は `getAiBackend` により `llama` バックエンドへ解決される
  - Target: `getAiBackend`
  - Test ID: `T-LIB-AI-MDL-01-02`
  - Rule: transport R-001 / REQ-F-001
  - Scenario: Given モデル値が `"llama/qwen3-14b"` である, When `getAiBackend` を呼ぶ
  - Expected: Then 戻り値が `'llama'` であること

- [ ] **T-03-01-03**: `llama/qwen3-14b` は `isValidModel` で真となる
  - Target: `isValidModel`
  - Test ID: `T-LIB-AI-MDL-01-03`
  - Rule: transport R-001
  - Scenario: Given モデル値が `"llama/qwen3-14b"` である, When `isValidModel` を呼ぶ
  - Expected: Then `true` が返ること

#### T-03-02: 既存 provider の空モデル名は従来どおり受理される（非破壊）

- [ ] **T-03-02-01**: `openai/` の空モデル名が従来どおり受理される
  - Target: `parseModel`
  - Test ID: `T-LIB-AI-MDL-02-01`
  - Rule: error-handling §4.3 / REQ-C-002
  - Scenario: Given モデル値が `"openai/"` である, When `parseModel` を呼ぶ
  - Expected: Then llama 追加前と同じく `null` を返さず受理されること（error-handling §4.3 の 4 条件が成立しないこと）

#### T-03-03: 多段スラッシュの受理

- [ ] **T-03-03-01**: `llama/org/model` が provider `llama` / model `org/model` として受理される
  - Target: `parseModel`
  - Test ID: `T-LIB-AI-MDL-03-01`
  - Rule: error-handling §5（多段スラッシュ） / DR-23 / REQ-C-002
  - Scenario: Given モデル値が `"llama/org/model"` である, When `parseModel` を呼ぶ
  - Expected: Then `{ provider: 'llama', model: 'org/model' }` として受理されること（拒否しないこと）

### [異常] Error Cases

#### T-03-04: llama の空モデル名拒否（DR-23）

- [ ] **T-03-04-01**: `llama/` は `UnknownModel`/`InvalidModel` として拒否される
  - Target: `isValidModel` / `parseModel`
  - Test ID: `T-LIB-AI-MDL-04-01`
  - Rule: DR-23 / transport R-001（Step 2） / REQ-F-014 / AC-014
  - Scenario: Given モデル値が `"llama/"` である, When モデル値の受理判定を行う
  - Expected: Then `ChatlogError('UnknownModel', 'InvalidModel')` として拒否されること

- [ ] **T-03-04-02**: `llama/` + 空白のみのモデル識別子は `UnknownModel`/`InvalidModel` として拒否される
  - Target: `isValidModel` / `parseModel`
  - Test ID: `T-LIB-AI-MDL-04-02`
  - Rule: DR-23 / REQ-F-014
  - Scenario: Given モデル値が `"llama/ "`（空白のみのモデル識別子）である, When モデル値の受理判定を行う
  - Expected: Then `ChatlogError('UnknownModel', 'InvalidModel')` として拒否されること

#### T-03-07: 未知モデル値で throw される例外の message

- [ ] **T-03-07-01**: throw された例外の message に受理形式の一覧が含まれる
  - Target: `isValidModel` / モデル値の受理判定
  - Test ID: `T-LIB-AI-MDL-07-01`
  - Rule: error-handling R-005 / DR-06 / REQ-F-014 / AC-014
  - Scenario: Given 既知の受理形式のいずれにも一致しないモデル値, When モデル値の受理判定を行う
  - Expected: Then `ChatlogError('UnknownModel', 'InvalidModel')` が throw され、その message に bare 名 / `gpt-*` / `gemini-*` / `<provider>/<model>` と llama provider がすべて含まれること

### [エッジケース] Edge Cases

#### T-03-05: provider prefix の大文字小文字区別

- [ ] **T-03-05-01**: `Llama/qwen3-14b` は未知 provider として拒否される
  - Target: `parseModel`
  - Test ID: `T-LIB-AI-MDL-05-01`
  - Rule: DR-02 / DR-14（決定 3）
  - Scenario: Given モデル値が `"Llama/qwen3-14b"`（大文字始まり）である, When `parseModel` を呼ぶ
  - Expected: Then 完全一致で照合され、`llama` とは別の未知 provider として拒否されること

#### T-03-06: CLI バックエンドの部分集合型

- [ ] **T-03-06-01**: llama は `AI_BACKEND_COMMAND_MAP` に CLI コマンドを持たない
  - Target: `AI_BACKEND_COMMAND_MAP`（CLI バックエンド部分集合型）
  - Test ID: `T-LIB-AI-MDL-06-01`
  - Rule: DR-14（決定 3）
  - Scenario: Given `AI_BACKEND_COMMAND_MAP` が `Record<AiCliBackend, AiBackendCommand>` に制約される, When `llama` をキーとして参照する
  - Expected: Then `llama` は `AiCliBackend` の型に含まれず、`AI_BACKEND_COMMAND_MAP` にエントリを持たないこと

---

---

## T-04: GlobalConfig（llamaEndpoint）

> Commit: 4 / 配置: `skills/_cle-libs/classes/GlobalConfig.class.ts` / Phase: 2（着手条件: Phase 1 完了） / Test ID prefix: `T-CLS-GCL`

### [正常] Normal Cases

#### T-04-01: `llamaEndpoint` が値付きで指定されている

- [ ] **T-04-01-01**: 指定された値がそのまま解決される
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-01-01`
  - Rule: config-packaging R-001 / AC-009
  - Scenario: Given `config.yaml` に `llamaEndpoint: http://192.168.1.10:8080` が記述されている, When `GlobalConfig` がこれを読み込む
  - Expected: Then 解決結果の `llamaEndpoint` が `http://192.168.1.10:8080` であること

#### T-04-02: `agent` と `model` が同時に指定されている（軸の独立解決）

- [ ] **T-04-02-01**: `agent` の値が `model` の解決に影響されない
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-02-01`
  - Rule: config-packaging R-002 / DD-02 / AC-010
  - Scenario: Given `config.yaml` に `agent: chatgpt` と `model: llama/qwen3-14b` が同時に記述されている, When `GlobalConfig` がこれを読み込む
  - Expected: Then 解決結果の `agent` が `chatgpt` のままであり、`model` が `llama/qwen3-14b` として解決されること

- [ ] **T-04-02-02**: `agent` の選択肢一覧に llama が現れない
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-02-02`
  - Rule: config-packaging R-002 / DD-02 / DR-02
  - Scenario: Given `agent` の選択肢一覧を GlobalConfig が公開している, When その一覧を取得する
  - Expected: Then 一覧に `llama` が含まれないこと

### [異常] Error Cases

#### T-04-06: `llamaEndpoint` に文字列以外の値が書かれている

- [ ] **T-04-06-01**: 既存の `text` 型キーと同じく `TypeError` が伝播する
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-06-01`
  - Rule: config-packaging R-001 / DD-01 / REQ-C-002
  - Scenario: Given `llamaEndpoint` に数値・真偽値など文字列以外の値が書かれた `config.yaml`, When `GlobalConfig` がこれを読み込む
  - Expected: Then 既存の `text` 型キーと同一に `parseString` の `TypeError` がそのまま伝播すること（`llamaEndpoint` 固有の追加検証を行わず、`ChatlogError` へ変換もしない。URL としての妥当性判定は Commit 13 が担う）

### [エッジケース] Edge Cases

#### T-04-03: `llamaEndpoint` が省略されている

- [ ] **T-04-03-01**: 未知キーエラーにならず既定値（空文字列）が解決される
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-03-01`
  - Rule: config-packaging R-001 / DD-05 / DR-05 / Edge config-packaging-1 / AC-009
  - Scenario: Given `config.yaml` に `llamaEndpoint` キーが一切記述されていない, When `GlobalConfig` がこれを読み込む
  - Expected: Then `UnknownKey` 等の例外が throw されず、解決結果の `llamaEndpoint` が空文字列であること

#### T-04-04: `llamaEndpoint` に空文字列が明示されている

- [ ] **T-04-04-01**: 省略時と同一の値（空文字列）に収束する
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-04-01`
  - Rule: config-packaging R-001 / DD-05 / DR-12 / Edge config-packaging-2
  - Scenario: Given `config.yaml` に `llamaEndpoint: ''` が明示的に記述されている, When `GlobalConfig` がこれを読み込む
  - Expected: Then 読み込み自体は成功し、解決結果の `llamaEndpoint` が T-04-03-01 と同じ空文字列であること

---

#### T-04-05: 経路別のタイムアウト設定キーを設けない

- [ ] **T-04-05-01**: `llamaTimeoutMs` のような経路別設定キーがスキーマに存在しない
  - Target: `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES`
  - Test ID: `T-CLS-GCL-05-01`
  - Rule: DR-17 / transport R-004 / REQ-C-002
  - Scenario: Given `llamaEndpoint` を追加した設定スキーマ, When 既知キー集合を列挙する
  - Expected: Then llama 経路専用のタイムアウト設定キーが存在せず、既存の `timeoutMs` が経路を問わず共有されること

#### T-04-07: `llamaEndpoint` に `null` が明示されている

- [ ] **T-04-07-01**: 既存の `text` 型キーと同じく空文字列へ収束する
  - Target: `GlobalConfig`
  - Test ID: `T-CLS-GCL-07-01`
  - Rule: config-packaging R-001 / DD-05 / Edge config-packaging-2 / REQ-C-002
  - Scenario: Given `llamaEndpoint: null` と書かれた `config.yaml`, When `GlobalConfig` がこれを読み込む
  - Expected: Then キー省略時・空文字列明示時と同一の空文字列に収束し、以降 REQ-F-019 の単一分岐で扱えること

---

## T-05: `FetchProvider` 型 / llama 中断側判定関数

> Commit 5 / 配置: `skills/_cle-libs/types/providers.types.ts`（`FetchProvider` 型）, `skills/_cle-libs/libs/ai/*`（中断側判定関数、命名は実装時の命名に委ねる） / Phase 2, 着手条件: Phase 1 完了 / Test ID prefix: `T-LIB-AI-LAP`

### [正常] Normal Cases

#### T-05-01: 中断側 subindex を持つ `AiError` を判定する

- [ ] **T-05-01-01**: `RateLimit` を中断側として判定する
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-01-01`
  - Rule: transport R-005 / error-handling §3.2（subindex 一覧） / DR-18 決定 2・3
  - Scenario: Given `kind: 'AiError', subindex: 'RateLimit'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `true` を返すこと

- [ ] **T-05-01-02**: `InvalidEndpoint` を中断側として判定する
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-01-02`
  - Rule: transport R-005 / error-handling §3.2 / DR-18 決定 2・3
  - Scenario: Given `kind: 'AiError', subindex: 'InvalidEndpoint'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `true` を返すこと

- [ ] **T-05-01-03**: `BackendUnavailable` を中断側として判定する
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-01-03`
  - Rule: transport R-005 / error-handling §3.2 / DR-18 決定 2・3
  - Scenario: Given `kind: 'AiError', subindex: 'BackendUnavailable'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `true` を返すこと

- [ ] **T-05-01-04**: `ResponseFormatRejected` を中断側として判定する
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-01-04`
  - Rule: transport R-005 / error-handling §3.2 / DR-18 決定 2・3
  - Scenario: Given `kind: 'AiError', subindex: 'ResponseFormatRejected'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `true` を返すこと

#### T-05-02: `FetchProvider` を `RunAIOptions` の任意フィールドとして代入できる

- [ ] **T-05-02-01**: `FetchProvider` 形の関数を `RunAIOptions` の任意フィールドへ代入できる
  - Target: `FetchProvider`
  - Test ID: `T-LIB-AI-LAP-02-01`
  - Rule: transport R-005 / REQ-C-005 / DR-19 決定 1
  - Scenario: Given 既存 Provider 型と同じ関数型エイリアスとして定義された `FetchProvider`, When `RunAIOptions` の任意フィールドへ代入する
  - Expected: Then 型チェックが通ること（AC-013 の土台）

### [異常] Error Cases

> [N/A] Commit 5 の判定関数は真偽を返す述語であり throw する経路を持たない。偽ケースはエッジケースに分類する

### [エッジケース] Edge Cases

#### T-05-03: 続行側 subindex および非 `AiError` を偽として判定する

- [ ] **T-05-03-01**: `ExitFailure` を続行側として判定する（偽を返す）
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-03-01`
  - Rule: transport R-005 / error-handling §3.2 / DR-18 決定 2
  - Scenario: Given `kind: 'AiError', subindex: 'ExitFailure'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `false` を返すこと

- [ ] **T-05-03-02**: `ResponseSchemaViolation` を続行側として判定する（偽を返す）
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-03-02`
  - Rule: transport R-005 / error-handling §3.2 / DR-18 決定 2
  - Scenario: Given `kind: 'AiError', subindex: 'ResponseSchemaViolation'` の `ChatlogError`, When 判定関数を呼ぶ
  - Expected: Then `false` を返すこと

- [ ] **T-05-03-03**: `AiError` 以外の `kind` を偽として判定する
  - Target: `llama 中断側判定関数`
  - Test ID: `T-LIB-AI-LAP-03-03`
  - Rule: transport R-005 / DR-18 決定 2
  - Scenario: Given `kind` が `AiError` でない `ChatlogError`（例: `UnknownModel`）, When 判定関数を呼ぶ
  - Expected: Then `false` を返すこと

#### T-05-04: 既存 2 判定関数の挙動が変わらない（回帰）

- [ ] **T-05-04-01**: `isRateLimitError` の挙動が新判定関数の追加前後で変わらない
  - Target: `isRateLimitError`
  - Test ID: `T-LIB-AI-LAP-04-01`
  - Rule: DR-18 決定 3 / REQ-C-002 / AC-022
  - Scenario: Given 既存の `isRateLimitError` に対する既存テストケース一式, When 新判定関数の追加後に同じ入力で呼ぶ
  - Expected: Then 追加前と同じ真偽値を返すこと

- [ ] **T-05-04-02**: `isFatalAiError` の挙動が新判定関数の追加前後で変わらない
  - Target: `isFatalAiError`
  - Test ID: `T-LIB-AI-LAP-04-02`
  - Rule: DR-18 決定 3 / REQ-C-002 / AC-022
  - Scenario: Given 既存の `isFatalAiError` に対する既存テストケース一式, When 新判定関数の追加後に同じ入力で呼ぶ
  - Expected: Then 追加前と同じ真偽値を返すこと

---

#### T-05-05: catch が受け取る任意の値を安全に判定する

- [ ] **T-05-05-01**: plain `Error` を throw せず偽として判定する
  - Target: llama 中断側判定関数
  - Test ID: `T-LIB-AI-LAP-05-01`
  - Rule: transport R-005 / DR-18 決定 2 / REQ-C-002
  - Scenario: Given `ChatlogError` ではない plain `Error` インスタンス, When 判定関数へ渡す
  - Expected: Then 例外を投げずに偽を返すこと

- [ ] **T-05-05-02**: `null` / `undefined` を throw せず偽として判定する
  - Target: llama 中断側判定関数
  - Test ID: `T-LIB-AI-LAP-05-02`
  - Rule: transport R-005 / DR-18 決定 2 / REQ-C-002
  - Scenario: Given `null` および `undefined`, When 判定関数へ渡す
  - Expected: Then いずれも例外を投げずに偽を返すこと

- [ ] **T-05-05-03**: `kind` / `subindex` を持たない任意のオブジェクトを throw せず偽として判定する
  - Target: llama 中断側判定関数
  - Test ID: `T-LIB-AI-LAP-05-03`
  - Rule: transport R-005 / DR-18 決定 2 / REQ-C-002
  - Scenario: Given `kind` も `subindex` も持たない任意のオブジェクト, When 判定関数へ渡す
  - Expected: Then 例外を投げずに偽を返すこと

---

## T-06: 呼び出し元 catch の中断判定拡張（4 スキル）

> Commit: 6〜9 / 配置ファイル: `phase-classify-ai.ts`（Commit 6） / `process-chunk.ts`（Commit 7） / `segment-ai.ts`（Commit 8） / `setfm-type-category.ts`（Commit 9） / Phase: 3（着手条件: Commit 5 完了）/ Test ID prefix: `T-CL-LAB`（classify） / `T-FL-LAB`（filter） / `T-NC-LAB`（normalize） / `T-SF-LAB`（set-frontmatter）、各スキル 01 から

### [正常] Normal Cases

#### T-06-01: classify — 続行側 subindex

- [ ] **T-06-01-01**: 続行側 subindex でチャンク全件が action:ERROR として cache に書き込まれ処理が続行する
  - Target: `phase-classify-ai.ts` の `runAI` 呼び出しを囲む catch
  - Test ID: `T-CL-LAB-01-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-023
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ExitFailure)` を投げる, When classify のチャンク処理がこれを catch する
  - Expected: Then 一括処理は中断されず、当該チャンク全件が action:ERROR として cache に書き込まれたうえで後続チャンクの処理が続行すること

#### T-06-02: filter — 続行側 subindex

- [ ] **T-06-02-01**: 続行側 subindex では `ctl.abort()` が呼ばれず `stats` が従来どおり加算される
  - Target: `process-chunk.ts` の catch
  - Test ID: `T-FL-LAB-01-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-023
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ExitFailure)` を投げる, When filter のチャンク処理がこれを catch する
  - Expected: Then `ctl.abort()` が呼ばれず、`stats` の該当カウンタが従来どおり加算されて処理が続行すること

#### T-06-03: normalize — 続行側 subindex

- [ ] **T-06-03-01**: 続行側 subindex で全件 null の Map が返り処理が続行する
  - Target: `segment-ai.ts` の catch
  - Test ID: `T-NC-LAB-01-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-023
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ExitFailure)` を投げる, When normalize のセグメント処理がこれを catch する
  - Expected: Then 一括処理は中断されず、全件 null の Map が返ること

#### T-06-04: set-frontmatter — 続行側 subindex

- [ ] **T-06-04-01**: 続行側 subindex では当該ファイルのみフォールバック値が書き込まれ処理が続行する
  - Target: `setfm-type-category.ts` の catch
  - Test ID: `T-SF-LAB-01-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-023
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ExitFailure)` を投げる, When set-frontmatter の type/category 判定がこれを catch する
  - Expected: Then 当該ファイルのみ `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` が書き込まれ、他ファイルの処理が続行すること

### [異常] Error Cases

#### T-06-05: classify — 中断側 subindex

- [ ] **T-06-05-01**: 中断側 subindex で一括処理が中断する
  - Target: `phase-classify-ai.ts` の catch 第 1 分岐
  - Test ID: `T-CL-LAB-02-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-004
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: BackendUnavailable)` を投げる, When classify のチャンク処理がこれを catch する
  - Expected: Then 一括処理が中断すること

#### T-06-06: filter — 中断側 subindex

- [ ] **T-06-06-01**: 中断側 subindex で `ctl.abort()` が呼ばれる
  - Target: `process-chunk.ts` の catch
  - Test ID: `T-FL-LAB-02-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-004
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: RateLimit)` を投げる, When filter のチャンク処理がこれを catch する
  - Expected: Then `ctl.abort()` が呼ばれること

#### T-06-07: normalize — 中断側 subindex

- [ ] **T-06-07-01**: 中断側 subindex で処理が中断する
  - Target: `segment-ai.ts` の catch
  - Test ID: `T-NC-LAB-02-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / AC-004
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: BackendUnavailable)` を投げる, When normalize のセグメント処理がこれを catch する
  - Expected: Then 処理が中断すること

#### T-06-08: set-frontmatter — 中断側 subindex（AC-019）

- [ ] **T-06-08-01**: `InvalidEndpoint` / `BackendUnavailable` を受けたときフォールバック値が書き込まれずに中断する
  - Target: `setfm-type-category.ts` の catch
  - Test ID: `T-SF-LAB-02-01`
  - Rule: error-handling §3.2 / DR-18（決定 3） / REQ-F-006 / REQ-F-019 / AC-019 / AC-004
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: InvalidEndpoint)` または `ChatlogError(kind: AiError, subindex: BackendUnavailable)` を投げる, When set-frontmatter の type/category 判定がこれを catch する
  - Expected: Then `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` が書き込まれずに処理が中断すること（DR-18 が解消する起点の不具合の再発防止）

### [エッジケース] Edge Cases

#### T-06-09: classify — 既存挙動の非破壊

- [ ] **T-06-09-01**: 非 AiError 例外時の既存フォールバック挙動が変化しない
  - Target: `phase-classify-ai.ts` の catch
  - Test ID: `T-CL-LAB-03-01`
  - Rule: REQ-C-002 / AC-022
  - Scenario: Given `runAI` が `AiError` 以外の例外を投げる, When classify のチャンク処理がこれを catch する
  - Expected: Then 新判定関数の追加前と同じ既存の分岐（中断しない）で処理されること

#### T-06-10: filter — 既存挙動の非破壊

- [ ] **T-06-10-01**: 既存の `subindex === 'RateLimit'` 単体判定の挙動が変化しない
  - Target: `process-chunk.ts` の catch
  - Test ID: `T-FL-LAB-03-01`
  - Rule: REQ-C-002 / AC-022
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: RateLimit)` を投げる（新判定関数追加前から中断対象だったケース）, When filter のチャンク処理がこれを catch する
  - Expected: Then 新判定関数の追加前と同じく `ctl.abort()` が呼ばれること（回帰）

#### T-06-11: normalize — 既存挙動の非破壊

- [ ] **T-06-11-01**: 全件 null の Map 返却時の既存挙動が変化しない
  - Target: `segment-ai.ts` の catch
  - Test ID: `T-NC-LAB-03-01`
  - Rule: REQ-C-002 / AC-022
  - Scenario: Given `runAI` が `AiError` 以外の例外を投げる, When normalize のセグメント処理がこれを catch する
  - Expected: Then 新判定関数の追加前と同じく全件 null の Map が返ること

#### T-06-12: set-frontmatter — 既存挙動の非破壊

- [ ] **T-06-12-01**: catch を持たない 2 呼び出し（`setfm-frontmatter.ts` / `setfm-review.ts`）の既存挙動が変化しない
  - Target: `setfm-frontmatter.ts` / `setfm-review.ts` の `maxRetry` ループ
  - Test ID: `T-SF-LAB-03-01`
  - Rule: REQ-C-002 / REQ-C-003 / AC-022
  - Scenario: Given `runAI` が転送エラー（`ChatlogError(kind: AiError, subindex: BackendUnavailable)` 等）を投げる, When `setfm-frontmatter.ts` または `setfm-review.ts` の `maxRetry` ループがこれを処理する
  - Expected: Then `maxRetry` ループは YAML パース失敗のみを対象としたままであり、転送エラーはループの外へ即座に伝播すること（Commit 9 の catch 拡張がこの 2 箇所へ及ばないこと）

---

## T-07: `runAI` の 3 層分割（前段 / `_runViaCli` / 後段）

> Commit 10 / 配置: `skills/_cle-libs/libs/ai/run-ai.ts` / Phase 4, 着手条件: Phase 2 完了 / Test ID prefix: `T-LIB-AI-RA`（既存の続き、scenario 番号は 50 から）

### [正常] Normal Cases

#### T-07-01: 分割後も正常応答時の抽出結果が変わらない

- [ ] **T-07-01-01**: 3 層分割後、正常応答の CLI 実行結果から従来どおりの文字列が返る
  - Target: `runAI`
  - Test ID: `T-LIB-AI-RA-50-01`
  - Rule: transport R-010 / §4.1.1 / DR-10 / AC-022
  - Scenario: Given 正常応答する `Deno.Command` スタブ, When `runAI` を実行する
  - Expected: Then 分割前と同一の文字列が返ること

#### T-07-02: 中段へ合成済み `AbortSignal` が引数として渡される

- [ ] **T-07-02-01**: 前段で合成した `AbortSignal` が中段 (`_runViaCli`) に引数として渡される
  - Target: `runAI（前段）`
  - Test ID: `T-LIB-AI-RA-51-01`
  - Rule: transport §4.1.1（中段への signal 引き渡し） / DR-10
  - Scenario: Given `timeoutMs` と外部 `AbortSignal` を指定, When `runAI` を実行する
  - Expected: Then 中段が呼び出し時に合成済み `AbortSignal` を受け取ること

### [異常] Error Cases

#### T-07-03: error-handling §4.3 の非破壊条件がいずれも成立しない（AC-022）

- [ ] **T-07-03-01**: 既存に受理されていたモデル値が分割後も拒否されない
  - Target: `runAI`
  - Test ID: `T-LIB-AI-RA-52-01`
  - Rule: error-handling §4.3（条件 1） / REQ-C-002 / AC-022
  - Scenario: Given 分割前に受理されていた既存 5 バックエンドのモデル値, When `runAI` を実行する
  - Expected: Then 分割後も受理されること

- [ ] **T-07-03-02**: 既存 5 バックエンドの既定モデルが分割後も変わらない
  - Target: `runAI`
  - Test ID: `T-LIB-AI-RA-52-02`
  - Rule: error-handling §4.3（条件 2） / REQ-C-002 / AC-022
  - Scenario: Given モデル値未指定で既存 5 バックエンドを呼ぶ, When `runAI` を実行する
  - Expected: Then 分割前と同一の既定モデルが使われること

- [ ] **T-07-03-03**: 既存 5 バックエンドの `kind`/`subindex` の組が分割後も変わらない
  - Target: `runAI`
  - Test ID: `T-LIB-AI-RA-52-03`
  - Rule: error-handling §4.3（条件 3） / REQ-C-002 / AC-022
  - Scenario: Given 既存の失敗系シナリオ一式（レートリミット・不正モデル等）, When `runAI` を実行する
  - Expected: Then 分割前と同一の `kind`/`subindex` の組で throw されること

- [ ] **T-07-03-04**: 不正モデル名の案内文言変更が既存の `kind`/`subindex` 判定へ影響しない
  - Target: `runAI`
  - Test ID: `T-LIB-AI-RA-52-04`
  - Rule: error-handling §4.3（条件 4） / REQ-C-002 / AC-022
  - Scenario: Given 不正モデル名を渡す, When `runAI` を実行し `kind`/`subindex` で分岐する既存判定を通す
  - Expected: Then 判定結果が分割前と変わらないこと

#### T-07-04: 既存の Abort / Timeout 例外メッセージ文言が変わらない

- [ ] **T-07-04-01**: `_spec.command` を経路ラベルへ置き換えても `Aborted/ExternalAbort` の文言が変わらない
  - Target: `runAI（後段）`
  - Test ID: `T-LIB-AI-RA-53-01`
  - Rule: transport §4.1.1（経路ラベル規則） / DR-10
  - Scenario: Given 既存 CLI バックエンドで外部キャンセルを発火させる, When `runAI` を実行する
  - Expected: Then 分割前と同一の `Aborted/ExternalAbort` メッセージ文言が返ること

- [ ] **T-07-04-02**: `_spec.command` を経路ラベルへ置き換えても `TimedOut/Timeout` の文言が変わらない
  - Target: `runAI（後段）`
  - Test ID: `T-LIB-AI-RA-53-02`
  - Rule: transport §4.1.1（経路ラベル規則） / DR-10
  - Scenario: Given 既存 CLI バックエンドでタイムアウトを発火させる, When `runAI` を実行する
  - Expected: Then 分割前と同一の `TimedOut/Timeout` メッセージ文言が返ること

### [エッジケース] Edge Cases

#### T-07-05: タイマー生成・キャンセル優先判定が経路ごとに複製されていない（不適合条件 1）

- [ ] **T-07-05-01**: タイマー生成が前段の単一箇所にのみ存在する
  - Target: `runAI（前段）`
  - Test ID: `T-LIB-AI-RA-54-01`
  - Rule: transport §4.1.1（不適合条件 1） / AC-020
  - Scenario: Given 分割後の実装, When タイマー生成箇所を検査する
  - Expected: Then 前段の 1 箇所にのみ存在し経路ごとに複製されていないこと

- [ ] **T-07-05-02**: 外部 abort 優先判定が後段の単一箇所にのみ存在する
  - Target: `runAI（後段）`
  - Test ID: `T-LIB-AI-RA-54-02`
  - Rule: transport §4.1.1（不適合条件 1） / AC-020
  - Scenario: Given 分割後の実装, When キャンセル優先判定箇所を検査する
  - Expected: Then 後段の 1 箇所にのみ存在し経路ごとに複製されていないこと

#### T-07-06: 中段の実装単位がモジュール外へ公開されていない（不適合条件 2）

- [ ] **T-07-06-01**: `_runViaCli` がモジュール外から import できない
  - Target: `_runViaCli`
  - Test ID: `T-LIB-AI-RA-55-01`
  - Rule: transport §4.1.1（不適合条件 2） / AC-020
  - Scenario: Given `run-ai.ts` のエクスポート一覧, When 外部モジュールから `_runViaCli` の参照を試みる
  - Expected: Then 参照できず、モジュール外への公開がないこと

#### T-07-07: AC-008 の既存キャンセルセマンティクスが保たれる

- [ ] **T-07-07-01**: `timeoutMs=0` でタイマーが設定されない
  - Target: `runAI（前段）`
  - Test ID: `T-LIB-AI-RA-56-01`
  - Rule: transport R-004 / AC-008
  - Scenario: Given `timeoutMs: 0`, When `runAI` を実行する
  - Expected: Then タイマーが設定されないこと

- [ ] **T-07-07-02**: 外部 abort とタイムアウトが同時発火した場合、外部 abort が優先して報告される
  - Target: `runAI（後段）`
  - Test ID: `T-LIB-AI-RA-56-02`
  - Rule: transport R-004 / AC-008
  - Scenario: Given タイムアウトと外部 `AbortSignal` を同時に発火させる, When `runAI` を実行する
  - Expected: Then `Aborted/ExternalAbort` が優先して報告されること

---

---

## T-08: json_schema 構築関数

> Commit 11 / 配置: `skills/_cle-libs/libs/ai/`（新規） / Phase 5、着手条件: Phase 0 実測ゲートの合格 / Test ID prefix: `T-LIB-AI-JSB`

### [正常] Normal Cases

#### T-08-01: json-array 契約からスキーマを構築する

- [ ] **T-08-01-01**: json-array 契約の root が object であり envelope フィールド `items` を持つ
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-01-01`
  - Rule: structured-output R-001 / §4.3 / DR-19
  - Scenario: Given 出力契約 `json-array` を指定した呼び出しオプション, When json_schema 構築関数を呼ぶ
  - Expected: Then root が object であり、`items` フィールドを持つ配列型スキーマが生成されること

#### T-08-02: yaml 契約からスキーマを構築する

- [ ] **T-08-02-01**: yaml 契約のキー集合が `extractYaml` の要求キーと完全一致する
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-02-01`
  - Rule: structured-output §4.3 / DR-19 / DR-11
  - Scenario: Given 出力契約 `yaml` を指定した呼び出しオプション, When json_schema 構築関数を呼ぶ
  - Expected: Then 生成されたスキーマのプロパティキー集合が `extractYaml` が要求するキーと過不足なく一致すること

#### T-08-03: line-prefixed 契約からスキーマを構築する

- [ ] **T-08-03-01**: line-prefixed 契約のキー集合が呼び出し元の行頭前方一致キーと完全一致する
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-03-01`
  - Rule: structured-output §4.3 / DR-19
  - Scenario: Given 出力契約 `line-prefixed` を指定した呼び出しオプション, When json_schema 構築関数を呼ぶ
  - Expected: Then 生成されたスキーマのプロパティキー集合が呼び出し元が行頭前方一致で探すキーと過不足なく一致すること

#### T-08-04: enum フィールドにフォールバック値を含める

- [ ] **T-08-04-01**: enum を含むプロパティに「該当なし」を表すフォールバック値が含まれる
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-04-01`
  - Rule: structured-output R-003 / AC-007
  - Scenario: Given enum を持つプロパティを含む出力契約, When json_schema 構築関数を呼ぶ
  - Expected: Then 生成された enum 配列に「該当なし」を意味するフォールバック値が 1 つ以上含まれること

#### T-08-05: 定義プロパティをすべて required に含める

- [ ] **T-08-05-01**: スキーマが定義する全プロパティが `required` に含まれる
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-05-01`
  - Rule: structured-output §4.3
  - Scenario: Given 複数プロパティを持つ出力契約, When json_schema 構築関数を呼ぶ
  - Expected: Then `required` 配列が定義済みプロパティ全件を含み、省略可能なプロパティが存在しないこと

#### T-08-06: additionalProperties を false に固定する

- [ ] **T-08-06-01**: 生成スキーマの `additionalProperties` が常に false である
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-06-01`
  - Rule: structured-output §4.3
  - Scenario: Given 任意の出力契約, When json_schema 構築関数を呼ぶ
  - Expected: Then 生成スキーマの `additionalProperties` が `false` であること

### [異常] Error Cases

#### T-08-07: CLI バックエンド選択時は json_schema を構築しない

- [ ] **T-08-07-01**: CLI バックエンド選択時は json_schema を構築しない
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-07-01`
  - Rule: structured-output R-001 / REQ-C-004
  - Scenario: Given バックエンドが llama 以外（CLI バックエンド）である, When AI 呼び出し経路が構造化出力の構築要否を判定する
  - Expected: Then json_schema 構築関数が呼ばれず、`response_format` がリクエストボディに含まれないこと

### [エッジケース] Edge Cases

#### T-08-08: どの深さにも数量制約を含めない

- [ ] **T-08-08-01**: どの深さにも数量制約を含めない
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-08-01`
  - Rule: structured-output R-002 / DD-01 / DR-04
  - Scenario: Given ネストされた配列・オブジェクトを含む出力契約, When json_schema 構築関数を呼ぶ
  - Expected: Then 生成スキーマのどの深さにも `minItems` / `maxItems` 等の数量制約キーが存在しないこと

#### T-08-09: nullable の表現に `type: "null"` を使わない

- [ ] **T-08-09-01**: nullable の表現に `type: "null"` を使わない
  - Target: `json_schema 構築関数`
  - Test ID: `T-LIB-AI-JSB-09-01`
  - Rule: structured-output §4.3 / R-003
  - Scenario: Given 「該当なし」を許容する必要があるプロパティを含む出力契約, When json_schema 構築関数を呼ぶ
  - Expected: Then 当該プロパティの `type` に `"null"` が併記されず、フォールバック値（enum）で「該当なし」を表現していること

---

---

## T-09: on-wire contract validation 関数と契約別復元関数

> Commit 12 / 配置: `skills/_cle-libs/libs/ai/`（新規） / Phase 5、着手条件: Phase 0 実測ゲートの合格 / Test ID prefix: `T-LIB-AI-OCV`

### [正常] Normal Cases

#### T-09-01: json-array 契約の応答を復元する

- [ ] **T-09-01-01**: 適合する json-array 応答が `parseAiJsonArray` で解釈可能な文字列へ復元される
  - Target: `on-wire contract validation 関数` / `契約別復元関数`
  - Test ID: `T-LIB-AI-OCV-01-01`
  - Rule: structured-output R-007 / §4.3 / AC-018
  - Scenario: Given envelope フィールド `items` を持つ適合 JSON 応答, When on-wire contract validation を通過し復元関数を呼ぶ
  - Expected: Then `items` の値が JSON 配列文字列としてシリアライズされ `parseAiJsonArray` が解釈できる文字列が返ること

#### T-09-02: yaml 契約の応答を復元する

- [ ] **T-09-02-01**: 適合する yaml 契約応答が `extractYaml` で解釈可能な YAML テキストへ復元される
  - Target: `on-wire contract validation 関数` / `契約別復元関数`
  - Test ID: `T-LIB-AI-OCV-02-01`
  - Rule: structured-output R-007 / §4.3 / AC-018 / DR-11
  - Scenario: Given yaml 契約が要求する必須キーをすべて備えた適合 JSON 応答, When on-wire contract validation を通過し復元関数を呼ぶ
  - Expected: Then root object が YAML テキストへシリアライズされ `extractYaml` が解釈できる文字列が返ること

#### T-09-03: line-prefixed 契約の応答を復元する

- [ ] **T-09-03-01**: 適合する line-prefixed 契約応答が `<キー>: <値>` 行テキストへ復元される
  - Target: `on-wire contract validation 関数` / `契約別復元関数`
  - Test ID: `T-LIB-AI-OCV-03-01`
  - Rule: structured-output R-007 / §4.3 / AC-018
  - Scenario: Given line-prefixed 契約が要求する必須キーをすべて備えた適合 JSON 応答, When on-wire contract validation を通過し復元関数を呼ぶ
  - Expected: Then `<キー>: <値>` を 1 行ずつ並べたテキストが返り、行頭前方一致で解釈できること

#### T-09-04: line-prefixed 復元結果から type/category が解決できる

- [ ] **T-09-04-01**: line-prefixed 復元結果の `type:` / `category:` 行が辞書値として解決される
  - Target: `契約別復元関数`
  - Test ID: `T-LIB-AI-OCV-04-01`
  - Rule: structured-output §4.3 / AC-024（前半）
  - Scenario: Given `type` / `category` を含む line-prefixed 契約の適合応答, When 復元関数を呼び出し元パーサへ渡す
  - Expected: Then `type` / `category` の値が辞書の値として解決可能な形で返ること

#### T-09-05: enum フィールドが許容値のとき検証を通過する

- [ ] **T-09-05-01**: enum フィールド値が許容値であれば検証を通過する
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-05-01`
  - Rule: structured-output §4.1（enum を含む場合の行） / R-003
  - Scenario: Given enum フィールドの値が定義済み許容値のいずれかである JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then 検証が通過し `ResponseSchemaViolation` が throw されないこと

### [異常] Error Cases

#### T-09-06: json-array 契約で envelope フィールドが欠落または配列でない場合は違反とする

- [ ] **T-09-06-01**: json-array 契約で envelope フィールドが欠落または配列でない場合は違反とする
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-06-01`
  - Rule: structured-output R-008 / §4.1（`json-array` 行） / DR-18
  - Scenario: Given root が object だが `items` フィールドが存在しない、または値が配列でない JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` が throw されること（続行側）

#### T-09-07: yaml 契約で必須キーが欠落している場合は違反とする

- [ ] **T-09-07-01**: yaml 契約で必須キーが欠落している場合は違反とする
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-07-01`
  - Rule: structured-output R-008 / §4.1（`yaml` 行） / DR-18
  - Scenario: Given yaml 契約が要求する必須キーの一部が欠落した JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` が throw されること（続行側）

#### T-09-08: line-prefixed 契約で必須キーが欠落している場合は違反とする

- [ ] **T-09-08-01**: line-prefixed 契約で必須キーが欠落している場合は違反とする
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-08-01`
  - Rule: structured-output R-008 / §4.1（`line-prefixed` 行） / DR-18
  - Scenario: Given line-prefixed 契約が要求する必須キーの一部が欠落した JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` が throw されること（続行側）

#### T-09-09: enum フィールドの値が許容値・フォールバック値のいずれでもない場合は違反とする

- [ ] **T-09-09-01**: enum フィールドの値が許容値・フォールバック値のいずれでもない場合は違反とする
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-09-01`
  - Rule: structured-output R-008 / §4.1（enum を含む場合の行） / R-003 / DR-16
  - Scenario: Given enum フィールドの値が定義済み許容値にもフォールバック値にも一致しない JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` が throw されること（続行側。分類名は `ResponseFormatIgnored` としない）

### [エッジケース] Edge Cases

#### T-09-10: フル JSON Schema validation は行わず最小構造検証に留める

- [ ] **T-09-10-01**: フル JSON Schema validation は行わず最小構造検証に留める
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-10-01`
  - Rule: structured-output §2.4 Non-Goal / DR-19 Non-Goal / DR-26 決定 2
  - Scenario: Given 契約が要求しない未知の追加フィールドを含むが、必須キー・型・enum は適合する JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then 検証が通過すること（未知フィールドの有無はフル JSON Schema validation の対象ではなく判定に影響しない）

#### T-09-11: yaml 契約の値の許容型は現行既定挙動（文字列型）で判定する

- [ ] **T-09-11-01**: yaml 契約の値の許容型は現行既定挙動（文字列型）で判定する
  - Target: `on-wire contract validation 関数`
  - Test ID: `T-LIB-AI-OCV-11-01`
  - Rule: structured-output R-008 / §4.1（`yaml` 行「各値が許容型である」） / implementation §3.2
  - Scenario: Given yaml 契約の必須キーすべてが文字列型の値を持つ JSON 応答, When on-wire contract validation を呼ぶ
  - Expected: Then 検証が通過すること
  - > Phase 0 実測後に structured-output §4.1 が改訂されたら本タスクも改訂する。

---

#### T-09-12: `response_format` が無視されスキーマ非準拠の自然文が返る

- [ ] **T-09-12-01**: 既存パース経路へフォールバックせず違反として扱う
  - Target: 契約検証関数
  - Test ID: `T-LIB-AI-OCV-12-01`
  - Rule: structured-output R-008 / Edge structured-output-1 / REQ-F-016 / DR-19 / DR-26 決定 2
  - Scenario: Given サーバが `response_format` を無視し、JSON として parse はできるが契約に適合しない本文を 2xx で返す, When 契約検証を行う
  - Expected: Then `ChatlogError('AiError', 'ResponseSchemaViolation')` が throw され、既存パース経路への暗黙のフォールバックが発生しないこと

#### T-09-13: enum の正解がフォールバック値のみになる

- [ ] **T-09-13-01**: フォールバック値が許容値として検証を通過し「該当なし」として復元される
  - Target: 契約検証関数 / 復元関数
  - Test ID: `T-LIB-AI-OCV-13-01`
  - Rule: structured-output R-003 / R-008 / Edge structured-output-4 / REQ-F-004 / DR-04
  - Scenario: Given enum フィールドの値が「該当なし」フォールバック値だけの応答, When 契約検証と復元を行う
  - Expected: Then 検証を通過し、復元結果でその値が「該当なし」を意味する値として呼び出し元へ渡ること

---

## T-10: エンドポイント受理判定関数 / URL 正規化関数

> Commit 13 / 配置: `skills/_cle-libs/libs/ai/`（新規） / Phase 6（着手条件: Phase 5 完了 = Phase 0 実測ゲート合格） / Test ID prefix: `T-LIB-AI-LEP`

### [正常] Normal Cases

#### T-10-01: 受理条件を満たすサーバ位置値の正規化

- [ ] **T-10-01-01**: 末尾スラッシュなし・`/v1` なしのサーバ位置値が基底 URL に `/v1/chat/completions` を連結した URL に正規化される
  - Target: `URL 正規化関数`
  - Test ID: `T-LIB-AI-LEP-01-01`
  - Rule: transport R-002 / DR-14 決定 1 / AC-015
  - Scenario: Given サーバ位置値 `http://host:8080`, When 正規化関数を呼ぶ
  - Expected: Then `http://host:8080/v1/chat/completions` が返ること

- [ ] **T-10-01-02**: 末尾スラッシュありのサーバ位置値が同一の正規 URL に解決される
  - Target: `URL 正規化関数`
  - Test ID: `T-LIB-AI-LEP-01-02`
  - Rule: transport R-002 / AC-015
  - Scenario: Given サーバ位置値 `http://host:8080/`, When 正規化関数を呼ぶ
  - Expected: Then `http://host:8080/v1/chat/completions` が返ること

- [ ] **T-10-01-03**: 末尾が `/v1` のサーバ位置値が同一の正規 URL に解決される
  - Target: `URL 正規化関数`
  - Test ID: `T-LIB-AI-LEP-01-03`
  - Rule: transport R-002 / AC-015
  - Scenario: Given サーバ位置値 `http://host:8080/v1`, When 正規化関数を呼ぶ
  - Expected: Then `http://host:8080/v1/chat/completions` が返ること

- [ ] **T-10-01-04**: 末尾スラッシュと `/v1` の両方を持つサーバ位置値が同一の正規 URL に解決される
  - Target: `URL 正規化関数`
  - Test ID: `T-LIB-AI-LEP-01-04`
  - Rule: transport R-002 / AC-015
  - Scenario: Given サーバ位置値 `http://host:8080/v1/`, When 正規化関数を呼ぶ
  - Expected: Then `http://host:8080/v1/chat/completions` が返ること（T-10-01-01〜04 すべて同一 URL）

- [ ] **T-10-01-05**: `https` スキームのサーバ位置値も同一規則で正規化される
  - Target: URL 正規化関数
  - Test ID: `T-LIB-AI-LEP-01-05`
  - Rule: transport R-002 / R-006 / §4.3 条件 3 / AC-015
  - Scenario: Given `https://host:8443/v1/` のように `https` スキームで末尾スラッシュと `/v1` を持つサーバ位置値, When 受理判定と正規化を行う
  - Expected: Then 受理され `https://host:8443/v1/chat/completions` に解決されること（`http` と同一の規則が適用される）

### [異常] Error Cases

#### T-10-02: 受理条件（§4.3 条件1〜6）に違反するサーバ位置値の拒否

- [ ] **T-10-02-01**: サーバ位置値が未設定（キー省略）の場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-01`
  - Rule: transport R-006 / §4.3 条件 1 / DR-18 / AC-019
  - Scenario: Given サーバ位置値キーが省略されている, When 受理判定関数を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: InvalidEndpoint)` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-02**: サーバ位置値が空文字列の場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-02`
  - Rule: transport R-006 / §4.3 条件 1 / AC-019
  - Scenario: Given サーバ位置値が `''`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-03**: サーバ位置値が絶対 URL でない（相対パス）場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-03`
  - Rule: transport R-006 / §4.3 条件 2 / AC-019
  - Scenario: Given サーバ位置値が `/v1/chat`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-04**: サーバ位置値のスキームが `http` / `https` 以外（`ws://`）の場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-04`
  - Rule: transport R-006 / §4.3 条件 3 / DR-14 決定 2 / AC-019
  - Scenario: Given サーバ位置値が `ws://host:8080`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-05**: サーバ位置値が query 文字列を含む場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-05`
  - Rule: transport R-006 / §4.3 条件 4 / AC-019
  - Scenario: Given サーバ位置値が `http://host:8080?x=1`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-06**: サーバ位置値がフラグメントを含む場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-06`
  - Rule: transport R-006 / §4.3 条件 5 / AC-019
  - Scenario: Given サーバ位置値が `http://host:8080#frag`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

- [ ] **T-10-02-07**: サーバ位置値が userinfo を含む場合に `InvalidEndpoint` を throw する
  - Target: `エンドポイント受理判定関数`
  - Test ID: `T-LIB-AI-LEP-02-07`
  - Rule: transport R-006 / §4.3 条件 6 / AC-019
  - Scenario: Given サーバ位置値が `http://user:pass@host:8080`, When 受理判定関数を呼ぶ
  - Expected: Then `InvalidEndpoint` が throw され、ネットワークアクセスが発生しないこと

### [エッジケース] Edge Cases

#### T-10-03: 末尾セグメント除去の境界（二重 `/v1`）

- [ ] **T-10-03-01**: サーバ位置値が `/v1/v1` で終わる場合、末尾 1 つのみが除去される
  - Target: `URL 正規化関数`
  - Test ID: `T-LIB-AI-LEP-03-01`
  - Rule: transport R-002 / DR-14 決定 1 / AC-015
  - Scenario: Given サーバ位置値 `http://host:8080/v1/v1`, When 正規化関数を呼ぶ
  - Expected: Then `http://host:8080/v1/v1/chat/completions` が返ること（`/v1/chat/completions` へは縮退しない）

---

---

## T-11: llama リクエストボディ構築

> Commit 14 / 配置: `skills/_cle-libs/libs/ai/`（新規） / Phase 6（着手条件: Phase 5 完了 = Phase 0 実測ゲート合格） / Test ID prefix: `T-LIB-AI-LRQ`

### [正常] Normal Cases

#### T-11-01: 有効な入力からのリクエストボディ構築

- [ ] **T-11-01-01**: `messages` が system 先・user 後の別ロール 2 要素として構成され、連結されない
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-01-01`
  - Rule: transport R-003 / AC-006
  - Scenario: Given system テキストと user テキスト, When リクエストボディ構築関数を呼ぶ
  - Expected: Then `messages[0]` が `role: "system"`、`messages[1]` が `role: "user"` の別要素であること

- [ ] **T-11-01-02**: ボディのキー集合が `model` / `messages` / `stream` / `response_format` の 4 つに限定され、生成パラメータを含まない
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-01-02`
  - Rule: transport R-009 / DR-15
  - Scenario: Given system/user テキストと出力契約, When リクエストボディ構築関数を呼ぶ
  - Expected: Then ボディのキーが上記 4 つに一致し `temperature` / `top_p` / `max_tokens` 等を含まないこと

- [ ] **T-11-01-03**: `stream` フィールドが常に `false` として送信される
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-01-03`
  - Rule: transport R-009 / DR-15
  - Scenario: Given 任意の入力, When リクエストボディ構築関数を呼ぶ
  - Expected: Then ボディの `stream` が `false` であること

- [ ] **T-11-01-04**: `Content-Type` ヘッダに `application/json; charset=utf-8` が送られる
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-01-04`
  - Rule: transport R-008（§4.2）
  - Scenario: Given 任意の入力, When `FetchProvider` へリクエストを送る
  - Expected: Then `Content-Type` ヘッダが `application/json; charset=utf-8` であること

- [ ] **T-11-01-05**: `model` フィールドに provider prefix を除いたモデル識別子が載る
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-01-05`
  - Rule: transport R-009 / Commit 14 変更点
  - Scenario: Given モデル値 `llama/<model>`, When リクエストボディ構築関数を呼ぶ
  - Expected: Then ボディの `model` が `<model>`（prefix なし）であること

### [異常] Error Cases

#### T-11-02: 出力契約が指定されない呼び出し

- [ ] **T-11-02-01**: 出力契約（schema）が未指定でリクエストボディ構築関数を呼ぶと例外が throw され、送信されない
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-02-01`
  - Rule: structured-output R-001 / DR-19
  - Scenario: Given 出力契約が渡されない, When リクエストボディ構築関数を呼ぶ
  - Expected: Then 例外が throw され、`FetchProvider` が呼び出されないこと

### [エッジケース] Edge Cases

#### T-11-03: 非 ASCII プロンプトの UTF-8 往復

- [ ] **T-11-03-01**: 日本語（非 ASCII）を含む system/user テキストが UTF-8 で符号化され、`FetchProvider` が受け取ったボディを復号した文字列が送信文字列と一致する
  - Target: `llama リクエストボディ構築関数`
  - Test ID: `T-LIB-AI-LRQ-03-01`
  - Rule: transport R-008（§4.2）/ AC-021 / REQ-NF-003
  - Scenario: Given 非 ASCII を含む system/user テキスト, When リクエストボディを構築し `FetchProvider` へ渡す
  - Expected: Then `FetchProvider` が受け取ったボディを UTF-8 復号した文字列が、送信前の system/user テキストと一致すること（文字化け・欠落なし）

---

---

## T-12: llama 応答解釈とエラー写像（error-handling §4.1 Step 1〜7 + Step 6.5）

> Commit 15 / 配置: `skills/_cle-libs/libs/ai/`（新規） / Phase 6（着手条件: Phase 5 完了 = Phase 0 実測ゲート合格） / Test ID prefix: `T-LIB-AI-LRI`
> Step 順は評価順であり Rule ID 順ではない（implementation §4.3）。

### [正常] Normal Cases

#### T-12-01: 成功応答からのアシスタントテキスト抽出

- [ ] **T-12-01-01**: `choices` が 1 要素で正常な `content` と `finish_reason: "stop"` の場合、そのテキストが返る
  - Target: `llama 応答解釈関数`
  - Test ID: `T-LIB-AI-LRI-01-01`
  - Rule: transport R-007 / error-handling R-004
  - Scenario: Given 成功ステータスの応答（`choices[0].message.content` がテキスト、`finish_reason: "stop"`）, When 応答解釈関数を呼ぶ
  - Expected: Then 対応するアシスタントテキストが返ること

- [ ] **T-12-01-02**: `choices` が 2 要素以上の応答から `choices[0]` のみが採用され、2 番目以降は無視される
  - Target: `llama 応答解釈関数`
  - Test ID: `T-LIB-AI-LRI-01-02`
  - Rule: transport R-007 / AC-017
  - Scenario: Given `choices` を 2 要素以上含む成功応答, When 応答解釈関数を呼ぶ
  - Expected: Then `choices[0]` のテキストのみが返ること

- [ ] **T-12-01-03**: 非 ASCII を含む応答本文の復号結果が呼び出し元へ渡る文字列と一致する
  - Target: `llama 応答解釈関数`
  - Test ID: `T-LIB-AI-LRI-01-03`
  - Rule: transport R-008（§4.2）/ AC-021
  - Scenario: Given 非 ASCII を含む `content` を持つ成功応答, When 応答解釈関数を呼ぶ
  - Expected: Then 復号結果が応答本文の文字列と一致すること（文字化け・欠落なし）

### [異常] Error Cases

#### T-12-02: 応答が得られない失敗（Step 1）

- [ ] **T-12-02-01**: 接続失敗（到達不能・DNS 解決失敗）を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-02-01`
  - Rule: error-handling R-001 / DR-18 / AC-004
  - Scenario: Given `FetchProvider` が接続失敗（到達不能）で reject する, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `ChatlogError(kind: AiError, subindex: BackendUnavailable)` が throw されること

- [ ] **T-12-02-02**: `Deno.errors.NotCapable`（権限不足）を runtime 由来の `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-02-02`
  - Rule: error-handling R-001 / DR-26 決定 1
  - Scenario: Given `FetchProvider` が `Deno.errors.NotCapable` で reject する, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw され、`detail` に runtime 由来である旨が含まれ、ネットワーク到達不能と読み分けられること

- [ ] **T-12-02-03**: TLS 検証失敗を runtime 由来の `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-02-03`
  - Rule: error-handling R-001 / DR-26 決定 1
  - Scenario: Given `FetchProvider` が TLS 検証失敗で reject する, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw され、`detail` に runtime 由来である旨が含まれること

#### T-12-03: 過負荷系ステータス（Step 2）

- [ ] **T-12-03-01**: HTTP 429 を `RateLimit`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-03-01`
  - Rule: error-handling R-002 / DR-18 / AC-005
  - Scenario: Given `FetchProvider` が status 429 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: RateLimit` が throw されること

- [ ] **T-12-03-02**: HTTP 503 を `RateLimit`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-03-02`
  - Rule: error-handling R-002 / AC-005
  - Scenario: Given `FetchProvider` が status 503 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: RateLimit` が throw されること

- [ ] **T-12-03-03**: HTTP 504 を `RateLimit`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-03-03`
  - Rule: error-handling R-002 / AC-005
  - Scenario: Given `FetchProvider` が status 504 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: RateLimit` が throw されること

#### T-12-04: エンドポイント未実装（Step 3）

- [ ] **T-12-04-01**: HTTP 404 を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-04-01`
  - Rule: error-handling R-006 / DR-18
  - Scenario: Given `FetchProvider` が status 404 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

- [ ] **T-12-04-02**: HTTP 501 を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-04-02`
  - Rule: error-handling R-006 / DR-18
  - Scenario: Given `FetchProvider` が status 501 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

#### T-12-05: 認証エラー（Step 4）

- [ ] **T-12-05-01**: HTTP 401 を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-05-01`
  - Rule: error-handling R-007 / DR-18
  - Scenario: Given `FetchProvider` が status 401 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

- [ ] **T-12-05-02**: HTTP 403 を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-05-02`
  - Rule: error-handling R-007 / DR-18
  - Scenario: Given `FetchProvider` が status 403 を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

- [ ] **T-12-05-03**: 401 / 403 の `detail` に前提崩れが記録される
  - Target: llama 応答解釈
  - Test ID: `T-LIB-AI-LRI-05-03`
  - Rule: error-handling R-007 / Edge error-handling-9 / DR-18
  - Scenario: Given サーバが認証を要求して 401 または 403 を返す, When llama 経路で応答を解釈する
  - Expected: Then `BackendUnavailable` の `detail` に認証要求という前提崩れが記録され、到達不能・404 と読み分けられること

#### T-12-06: `response_format` 拒否と判別できる 400（Step 5）

- [ ] **T-12-06-01**: HTTP 400 かつ本文から `response_format` の拒否と判別できる場合を `ResponseFormatRejected`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-06-01`
  - Rule: error-handling R-008 / DR-18
  - Scenario: Given `FetchProvider` が status 400 かつ `response_format` 拒否と判別可能な本文を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ResponseFormatRejected` が throw されること
  > Phase 0 実測後に error-handling §4.1 が改訂されたら本タスクも改訂する。

#### T-12-07: 判別できない非成功ステータス（Step 6）

- [ ] **T-12-07-01**: HTTP 400 だが `response_format` 拒否と判別できない場合を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-07-01`
  - Rule: error-handling R-003 / DR-18
  - Scenario: Given `FetchProvider` が status 400 かつ拒否理由を判別できない本文を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること
  > Phase 0 実測後に error-handling §4.1 が改訂されたら本タスクも改訂する。

- [ ] **T-12-07-02**: R-002・R-006〜R-008 のいずれにも該当しないその他の非成功ステータスを `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-07-02`
  - Rule: error-handling R-003
  - Scenario: Given `FetchProvider` が上記いずれにも該当しない非成功ステータス（例: 500）を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

#### T-12-08: 非 JSON 応答・Content-Type 不一致（Step 6.5）

- [ ] **T-12-08-01**: 成功ステータスだが本文が JSON として parse できない場合を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-08-01`
  - Rule: DR-26 決定 2
  - Scenario: Given `FetchProvider` が成功ステータスかつ JSON として parse できない本文を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

- [ ] **T-12-08-02**: 成功ステータスだが `Content-Type` が `application/json` 系でない場合を `BackendUnavailable`（中断側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-08-02`
  - Rule: DR-26 決定 2
  - Scenario: Given `FetchProvider` が成功ステータスかつ `Content-Type: text/event-stream` を返す, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: BackendUnavailable` が throw されること

- [ ] **T-12-08-03**: `Content-Type` ヘッダが欠落した成功応答を `BackendUnavailable`（中断側）として分類する
  - Target: llama 応答解釈
  - Test ID: `T-LIB-AI-LRI-08-03`
  - Rule: DR-26 決定 2
  - Scenario: Given 成功ステータスだが `Content-Type` ヘッダを持たない応答, When llama 経路で応答を解釈する
  - Expected: Then `ChatlogError(kind: AiError, subindex: BackendUnavailable)` が throw され、Step 7 の本文解釈へ進まないこと

- [ ] **T-12-08-04**: `application/json; charset=utf-8` は JSON 系として受理される
  - Target: llama 応答解釈
  - Test ID: `T-LIB-AI-LRI-08-04`
  - Rule: DR-26 決定 2 / transport R-008（§4.2）
  - Scenario: Given 成功ステータスで `Content-Type: application/json; charset=utf-8` を持ち本文が JSON として parse できる応答, When llama 経路で応答を解釈する
  - Expected: Then Step 6.5 で中断されず Step 7 の本文解釈へ進むこと（パラメータ付きの `application/json` を JSON 系から除外しない）

#### T-12-09: アシスタントテキストを取り出せない成功応答（Step 7）

- [ ] **T-12-09-01**: `choices` が存在しない成功応答を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-09-01`
  - Rule: error-handling R-004 条件 a
  - Scenario: Given 成功ステータスの応答本文に `choices` フィールドがない, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

- [ ] **T-12-09-02**: `choices` が空配列の成功応答を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-09-02`
  - Rule: error-handling R-004 条件 a
  - Scenario: Given 成功ステータスの応答で `choices: []`, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

- [ ] **T-12-09-03**: `choices[0].message.content` が `null` の成功応答を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-09-03`
  - Rule: error-handling R-004 条件 b
  - Scenario: Given `choices[0].message.content` が `null`, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

- [ ] **T-12-09-04**: `choices[0].message.content` が文字列でない（配列・`tool_calls` 中心）成功応答を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-09-04`
  - Rule: error-handling R-004 条件 c
  - Scenario: Given `choices[0].message.content` が配列、または `tool_calls` 中心の応答, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

- [ ] **T-12-09-05**: `choices[0].finish_reason` が `"length"` の成功応答を `ExitFailure`（続行側）として分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-09-05`
  - Rule: error-handling R-004 条件 d / DR-15
  - Scenario: Given `choices[0].finish_reason` が `"length"`, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること

### [エッジケース] Edge Cases

#### T-12-10: `finish_reason` の境界値

- [ ] **T-12-10-01**: `finish_reason` が実装固有値（`eos`）の場合も `stop` 以外としてすべて `ExitFailure`（続行側）に分類する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-10-01`
  - Rule: error-handling R-004 条件 d / §7 未決 #2
  - Scenario: Given `choices[0].finish_reason` が `"eos"`, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `subindex: ExitFailure` が throw されること
  > Phase 0 実測後に error-handling §4.1 が改訂されたら本タスクも改訂する。

- [ ] **T-12-10-02**: `finish_reason` が欠落または `null` の場合も「`stop` 以外」に含めて `ExitFailure`（続行側）と判定する
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-10-02`
  - Rule: error-handling R-004 条件 d / DR-26 決定 3
  - Scenario: Given `choices[0].finish_reason` が欠落、または `null`, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then `finish_reason !== 'stop'` として判定され `subindex: ExitFailure` が throw されること

#### T-12-11: `kind` の一律性

- [ ] **T-12-11-01**: llama 経路が投げるいずれの失敗も `kind: AiError` に統一され、呼び出し元の非 `AiError` フォールバック分岐へ落ちない
  - Target: `llama 応答解釈とエラー写像`
  - Test ID: `T-LIB-AI-LRI-11-01`
  - Rule: DR-03 / DR-18 決定 1 / REQ-C-003
  - Scenario: Given Step 1〜7・6.5 の各失敗条件を網羅的に発生させる, When llama 経路で応答解釈関数を呼ぶ
  - Expected: Then すべてのケースで `kind` が `AiError` であること

#### T-12-12: 失敗時にリトライも他バックエンドへのフォールバックも行わない

- [ ] **T-12-12-01**: 中断側・続行側のいずれの失敗でも `FetchProvider` の呼び出しは 1 回に留まる
  - Target: llama 応答解釈 / llama 経路の失敗処理
  - Test ID: `T-LIB-AI-LRI-12-01`
  - Rule: DR-03 / REQ-C-003 / REQ-F-006
  - Scenario: Given `BackendUnavailable` / `RateLimit` / `ExitFailure` / `ResponseFormatRejected` のそれぞれを引き起こす応答, When llama 経路で `runAI` を呼ぶ
  - Expected: Then いずれの場合も `FetchProvider` の呼び出し回数が 1 回であり、内側でのリトライが行われないこと

- [ ] **T-12-12-02**: llama 経路の失敗が既存 CLI バックエンドへフォールバックしない
  - Target: llama 経路の失敗処理
  - Test ID: `T-LIB-AI-LRI-12-02`
  - Rule: DR-03 / REQ-C-003 / DR-02
  - Scenario: Given llama 経路が任意の失敗分類を throw する状況, When llama 経路で `runAI` を呼ぶ
  - Expected: Then CLI バックエンドのコマンド構築・起動が一度も行われず、例外がそのまま呼び出し元へ伝播すること

---

## T-13: 出力契約の指定（6 呼び出し）

> Commit 16〜19 / 配置: `phase-classify-ai.ts` / `process-chunk.ts` / `segment-ai.ts` / `setfm-frontmatter.ts` / `setfm-review.ts` / `setfm-type-category.ts` / Phase 7、着手条件: Commit 11 完了 / Test ID prefix: `T-CL-OCT` / `T-FL-OCT` / `T-NC-OCT` / `T-SF-OCT`（スキルごとに 01 から）

### [正常] Normal Cases

#### T-13-01: classify の runAI 呼び出しに json-array 契約を渡す

- [ ] **T-13-01-01**: `phase-classify-ai.ts` の呼び出しオプションに `json-array` が渡る
  - Target: `phase-classify-ai.ts` の `runAI` 呼び出し
  - Test ID: `T-CL-OCT-01-01`
  - Rule: REQ-F-018 / DR-19
  - Scenario: Given classify スキルが AI 分類を実行する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `json-array` が指定されていること

#### T-13-02: filter の runAI 呼び出しに json-array 契約を渡す

- [ ] **T-13-02-01**: `process-chunk.ts` の呼び出しオプションに `json-array` が渡る
  - Target: `process-chunk.ts` の `runAI` 呼び出し
  - Test ID: `T-FL-OCT-01-01`
  - Rule: REQ-F-018 / DR-19
  - Scenario: Given filter スキルが AI 判定チャンクを処理する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `json-array` が指定されていること

#### T-13-03: normalize の runAI 呼び出しに json-array 契約を渡す

- [ ] **T-13-03-01**: `segment-ai.ts` の呼び出しオプションに `json-array` が渡る
  - Target: `segment-ai.ts` の `runAI` 呼び出し
  - Test ID: `T-NC-OCT-01-01`
  - Rule: REQ-F-018 / DR-19
  - Scenario: Given normalize スキルが AI セグメント分割を実行する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `json-array` が指定されていること

#### T-13-04: set-frontmatter の frontmatter 生成呼び出しに yaml 契約を渡す

- [ ] **T-13-04-01**: `setfm-frontmatter.ts` の呼び出しオプションに `yaml` が渡る
  - Target: `setfm-frontmatter.ts` の `runAI` 呼び出し
  - Test ID: `T-SF-OCT-01-01`
  - Rule: REQ-F-018 / DR-19 / DR-11
  - Scenario: Given set-frontmatter スキルが frontmatter を生成する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `yaml` が指定されていること

#### T-13-05: set-frontmatter の review 呼び出しに yaml 契約を渡す

- [ ] **T-13-05-01**: `setfm-review.ts` の呼び出しオプションに `yaml` が渡る
  - Target: `setfm-review.ts` の `runAI` 呼び出し
  - Test ID: `T-SF-OCT-02-01`
  - Rule: REQ-F-018 / DR-19 / DR-11
  - Scenario: Given set-frontmatter スキルが frontmatter の review を実行する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `yaml` が指定されていること

#### T-13-06: set-frontmatter の type/category 判定呼び出しに line-prefixed 契約を渡す

- [ ] **T-13-06-01**: `setfm-type-category.ts` の呼び出しオプションに `line-prefixed` が渡る
  - Target: `setfm-type-category.ts` の `runAI` 呼び出し
  - Test ID: `T-SF-OCT-03-01`
  - Rule: REQ-F-018 / DR-19
  - Scenario: Given set-frontmatter スキルが type/category を判定する, When `runAI` を呼ぶ
  - Expected: Then 呼び出しオプションの出力契約フィールドに `line-prefixed` が指定されていること

### [異常] Error Cases

#### T-13-07: setfm-frontmatter.ts で `ResponseSchemaViolation` が `maxRetry` ループの外へ抜ける

- [ ] **T-13-07-01**: setfm-frontmatter.ts で `ResponseSchemaViolation` が `maxRetry` ループの外へ抜ける
  - Target: `setfm-frontmatter.ts` の `runAI` 呼び出し
  - Test ID: `T-SF-OCT-04-01`
  - Rule: REQ-F-018 / DR-18 / structured-output R-008 / implementation Commit 19
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` を throw する, When `setfm-frontmatter.ts` の `maxRetry` ループ内で呼び出す
  - Expected: Then 例外が `maxRetry` ループの外へ抜け、当該ファイル 1 件のみが失敗として記録され、一括処理は続行すること

#### T-13-08: setfm-review.ts で `ResponseSchemaViolation` が `maxRetry` ループの外へ抜ける

- [ ] **T-13-08-01**: setfm-review.ts で `ResponseSchemaViolation` が `maxRetry` ループの外へ抜ける
  - Target: `setfm-review.ts` の `runAI` 呼び出し
  - Test ID: `T-SF-OCT-05-01`
  - Rule: REQ-F-018 / DR-18 / structured-output R-008 / implementation Commit 19
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` を throw する, When `setfm-review.ts` の `maxRetry` ループ内で呼び出す
  - Expected: Then 例外が `maxRetry` ループの外へ抜け、当該ファイル 1 件のみが失敗として記録され、一括処理は続行すること

#### T-13-09: classify の json-array 呼び出しで `ResponseSchemaViolation` が続行側として扱われる

- [ ] **T-13-09-01**: classify の json-array 呼び出しで `ResponseSchemaViolation` が続行側として扱われる
  - Target: `phase-classify-ai.ts` の `runAI` 呼び出し
  - Test ID: `T-CL-OCT-02-01`
  - Rule: REQ-F-018 / DR-18 / structured-output R-008
  - Scenario: Given `runAI` が `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` を throw する, When `phase-classify-ai.ts` の既存 catch 分岐（Phase 3 拡張済み）で受け取る
  - Expected: Then 当該ファイルのみ失敗として記録され、一括処理は続行すること

### [エッジケース] Edge Cases

#### T-13-10: setfm-type-category.ts の line-prefixed 契約が AC-024 を満たす

- [ ] **T-13-10-01**: setfm-type-category.ts の line-prefixed 契約が AC-024 を満たす
  - Target: `setfm-type-category.ts` の `runAI` 呼び出し / 契約別復元関数
  - Test ID: `T-SF-OCT-06-01`
  - Rule: REQ-F-018 / DR-19 Alternatives / AC-024
  - Scenario: Given line-prefixed 契約経由で `type` / `category` を含む適合応答が復元される, When `setfm-type-category.ts` が復元結果を辞書照合する
  - Expected: Then `type` / `category` が辞書の値として解決され、`DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` が書き込まれないこと

---

## T-14: `--allow-net` 付与範囲の静的検査

> Commit: 20 / 配置: 各 `SKILL.md` の `deno run` 行 / shebang 行 / `deno.json` / Phase: 8（着手条件: Phase 4・6・7 完了） / Test ID prefix: `T-LIB-AI-NET`

### [正常] Normal Cases

#### T-14-01: AI を呼ぶ経路の SKILL.md 実行行に `--allow-net` が付与されている

- [ ] **T-14-01-01**: 対象 4 スキルの実行行がすべて `--allow-net` を含む
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-01-01`
  - Rule: config-packaging R-003 / DD-03 / DR-13 / DR-24 決定 1 / AC-011
  - Scenario: Given `classify-chatlogs` / `filter-chatlogs`（`$SCRIPT_PATH` 実行行のみ）/ `normalize-chatlogs` / `set-frontmatter`（実行行 2 箇所）の各 `SKILL.md` を静的検査する, When `deno run` 記述行のフラグ集合を抽出する
  - Expected: Then 該当するすべての行が `--allow-net` を含むこと

#### T-14-02: `deno.json` の `test:module` タスクに `--allow-net` が付与されている

- [ ] **T-14-02-01**: `test:module` タスク定義が `--allow-net` を含む
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-02-01`
  - Rule: config-packaging R-003 / DD-03 / AC-011
  - Scenario: Given `deno.json` の `test:module` タスク定義を静的検査する, When そのフラグ集合を抽出する
  - Expected: Then `--allow-net` を含むこと

#### T-14-03: AI を呼ぶエントリスクリプトの shebang 行に `--allow-net` が付与されている

- [ ] **T-14-03-01**: 対象 3 本の shebang 行がすべて `--allow-net` を含む
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-03-01`
  - Rule: config-packaging R-003 / DD-03 / Edge config-packaging-6 / AC-011
  - Scenario: Given `classify-chatlogs.ts` / `filter-chatlogs.ts` / `set-frontmatter.ts` の shebang 行を静的検査する, When そのフラグ集合を抽出する
  - Expected: Then すべての shebang 行が `--allow-net` を含むこと

### [異常] Error Cases

#### T-14-04: AI を呼ばない経路に誤って `--allow-net` が付与されている

- [ ] **T-14-04-01**: 非 AI 経路の行に `--allow-net` が含まれていれば不適合と判定する
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-04-01`
  - Rule: config-packaging R-003 / DD-03 / Edge config-packaging-5 / AC-011
  - Scenario: Given `export-chatlogs` の `$SCRIPT_PATH` 実行行、または `filter-chatlogs` の `$NOISE_FILTER_PATH` / `$STRIP_PATH` 実行行に `--allow-net` が誤って含まれている, When 静的検査を行う
  - Expected: Then 過剰な権限付与として不適合と判定されること

#### T-14-05: AI を呼ぶ経路の対象行に `--allow-net` が欠落している

- [ ] **T-14-05-01**: 対象行のいずれかに `--allow-net` が欠けていれば不適合と判定する
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-05-01`
  - Rule: config-packaging R-003 / DD-03 / Edge config-packaging-6 / AC-011
  - Scenario: Given T-14-01〜T-14-03 が列挙する対象行のうち 1 行から `--allow-net` が欠落している, When 静的検査を行う
  - Expected: Then その行が不適合と判定されること

### [エッジケース] Edge Cases

#### T-14-06: フラグ列を省略した SKILL.md 例示行

- [ ] **T-14-06-01**: フラグ集合を記述していない例示行は判定対象外とする
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-06-01`
  - Rule: config-packaging R-003 / Edge config-packaging-7
  - Scenario: Given `deno run ... "$SCRIPT_PATH"` のようにフラグ列そのものを記述していない例示行が存在する, When 静的検査を行う
  - Expected: Then その行は `--allow-net` の有無によって適合・不適合を判定されず、検査対象から除外されること

#### T-14-07: `normalize-chatlogs` は shebang 行を持たない

- [ ] **T-14-07-01**: `normalize-chatlogs` の検査対象が SKILL.md 実行行のみである
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-07-01`
  - Rule: config-packaging R-003 / DD-03
  - Scenario: Given `normalize-chatlogs` のスクリプトが shebang 行を持たない, When 静的検査の対象行を列挙する
  - Expected: Then `normalize-chatlogs` については `SKILL.md` の実行行のみが対象行として列挙され、shebang 由来の対象行が生成されないこと

#### T-14-08: 配布ミラーの同期検査

- [ ] **T-14-08-01**: `bash scripts/sync-skill-assets.sh --check-staged` が差分なしで終了する
  - Target: `--allow-net 付与範囲の静的検査`
  - Test ID: `T-LIB-AI-NET-08-01`
  - Rule: config-packaging R-004 / DD-04 / AC-012 / Edge config-packaging-8
  - Scenario: Given 本 commit で共有ライブラリ・設定・`deno.json` に触れる変更が commit/push フックにより配布ミラーへ同期されている, When `bash scripts/sync-skill-assets.sh --check-staged` を実行する
  - Expected: Then 差分なしで終了すること

---

## T-15: `_runViaHttp` の結線（経路選択・signal 伝播・契約指定の静的検査）

> Commit 21 / 配置: `skills/_cle-libs/libs/ai/run-ai.ts` / Phase 8, 着手条件: Phase 4・6・7 完了（かつ Commit 21 固有の着手条件: 6 呼び出しが出力契約を指定済み／Commit 20 の `--allow-net` 付与完了） / Test ID prefix: `T-LIB-AI-LWR`

### [正常] Normal Cases

#### T-15-01: llama モデル指定時に正規化 URL への POST が組み立てられる

- [ ] **T-15-01-01**: `model: llama/<model>` かつ `llamaEndpoint` 設定済みで `/v1/chat/completions` への POST が組み立てられる
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-01-01`
  - Rule: transport §4.1 Step 1・Step 3・Step 5・Step 6 / R-001・R-002・R-003・R-009 / DR-01 / AC-001
  - Scenario: Given `model: 'llama/qwen3-14b'` と有効な `llamaEndpoint`, When `runAI` を呼ぶ
  - Expected: Then 正規化 URL への POST リクエストが `FetchProvider` へ渡されること

#### T-15-02: 注入ありの経路が注入なしと同一のリクエスト構築・応答解釈処理を通る

- [ ] **T-15-02-01**: `FetchProvider` 注入あり・なしで同一のリクエスト構築処理を通る
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-02-01`
  - Rule: transport R-005 / §4.4 / AC-013
  - Scenario: Given 同一入力で `FetchProvider` を注入した経路と注入しない経路（構築処理の共有を検証する形で代替可）, When リクエスト構築処理を比較する
  - Expected: Then 送信直前まで同一のリクエスト構築処理を通ること

- [ ] **T-15-02-02**: `FetchProvider` 注入あり・なしで同一の応答解釈処理を通る
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-02-02`
  - Rule: transport R-005 / §4.4 / AC-013
  - Scenario: Given 同一の応答本文に対する注入あり・なしの経路, When 応答解釈処理を比較する
  - Expected: Then 同一の応答解釈処理を通り同一の結果（文字列または分類）を返すこと

#### T-15-03: 6 呼び出しが契約から構築した `response_format` を含み復元済み文字列を受け取る

- [ ] **T-15-03-01**: production の 6 呼び出しそれぞれで `response_format` が契約から構築されリクエストに含まれる
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-03-01`
  - Rule: transport §4.1 Step 4 / structured-output R-001 / AC-002
  - Scenario: Given production の 6 呼び出し箇所それぞれの出力契約, When `runAI` を llama 経路で実行する
  - Expected: Then 各呼び出しのリクエストボディに契約から構築された `response_format` が含まれること

- [ ] **T-15-03-02**: 2xx 応答から契約に基づき復元された文字列を呼び出し元が受け取る
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-03-02`
  - Rule: transport §4.1 Step 7.5 / structured-output R-007 / AC-018
  - Scenario: Given 契約に適合する 2xx 応答本文, When `runAI` を llama 経路で実行する
  - Expected: Then 呼び出し元へ復元済み文字列が返ること

#### T-15-04: production の `runAI(` 呼び出しが全件出力契約を指定していることの静的検査

- [ ] **T-15-04-01**: production コード（`*.spec.ts` を除く）の `runAI(` 呼び出しを静的に列挙し全件が出力契約を指定している
  - Target: `runAI( 呼び出し箇所の静的検査`
  - Test ID: `T-LIB-AI-LWR-04-01`
  - Rule: DR-27 決定 3・4 / DR-20 決定 1
  - Scenario: Given リポジトリ全体の production コード（`*.spec.ts` を除く）, When `runAI(` 呼び出しをソース走査で列挙する
  - Expected: Then 列挙された全呼び出しが出力契約オプションを指定していること（以降の呼び出し追加に対する回帰）

### [異常] Error Cases

#### T-15-05: `llamaEndpoint` 未設定時にネットワークアクセス前に設定エラーとなる

- [ ] **T-15-05-01**: `llamaEndpoint` 未設定時に `FetchProvider` が一度も呼ばれず `InvalidEndpoint` が throw される
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-05-01`
  - Rule: transport R-006 / §4.3 / DR-12 / DR-18 / AC-019
  - Scenario: Given `model: llama/<model>` かつ `llamaEndpoint` が未設定（省略または空文字列）, When `runAI` を実行する
  - Expected: Then `FetchProvider` が呼ばれず `ChatlogError(kind: AiError, subindex: InvalidEndpoint)` が throw されること

### [エッジケース] Edge Cases

#### T-15-06: 合成済み `AbortSignal` が `FetchProvider` へ渡され、abort 状態へ遷移する

- [ ] **T-15-06-01**: `FetchProvider` が受け取る `RequestInit.signal` が合成済みの `AbortSignal` である
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-06-01`
  - Rule: transport §4.1 Step 6 / DR-27 決定 1
  - Scenario: Given `timeoutMs` と外部 `AbortSignal` を指定した llama 経路の呼び出し, When `_runViaHttp` が `FetchProvider` を呼ぶ
  - Expected: Then 渡された `RequestInit.signal` が既存 CLI 経路と同じ合成規則で生成された `AbortSignal` であること

- [ ] **T-15-06-02**: タイムアウト発火時に `FetchProvider` へ渡した signal が abort 状態へ遷移する
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-06-02`
  - Rule: transport R-004 / DR-27 決定 2
  - Scenario: Given `timeoutMs` 経過後も応答が返らない `FetchProvider` スタブ, When タイムアウトが発火する
  - Expected: Then `FetchProvider` へ渡された `signal` が abort 状態へ遷移すること（分類の一致のみでは不合格）

- [ ] **T-15-06-03**: 外部 abort 発火時に `FetchProvider` へ渡した signal が abort 状態へ遷移する
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-06-03`
  - Rule: transport R-004 / DR-27 決定 2
  - Scenario: Given 外部 `AbortSignal` を発火させる, When llama 経路の実行中に abort する
  - Expected: Then `FetchProvider` へ渡された `signal` が abort 状態へ遷移すること（分類の一致のみでは不合格）

#### T-15-07: `timeoutMs=0` と外部 abort 優先のセマンティクスが llama 経路でも保たれる

- [ ] **T-15-07-01**: `timeoutMs=0` で llama 経路のタイマーが設定されない
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-07-01`
  - Rule: transport R-004 / AC-008
  - Scenario: Given `timeoutMs: 0` で llama 経路を呼ぶ, When `runAI` を実行する
  - Expected: Then タイマーが設定されないこと

- [ ] **T-15-07-02**: 外部 abort が `Aborted/ExternalAbort` として扱われる
  - Target: `_runViaHttp`
  - Test ID: `T-LIB-AI-LWR-07-02`
  - Rule: transport R-004 / AC-008
  - Scenario: Given llama 経路の実行中に外部 `AbortSignal` を発火させる, When `runAI` を実行する
  - Expected: Then `Aborted/ExternalAbort` として分類されること

#### T-15-08: 経路の判定が `_buildCommand` の呼び出しより前に置かれている（不適合条件 3）

- [ ] **T-15-08-01**: transport §4.1.1 不適合条件 (3) が成立しない
  - Target: `runAI（前段）`
  - Test ID: `T-LIB-AI-LWR-08-01`
  - Rule: transport §4.1.1（不適合条件 3） / DR-10 / AC-020
  - Scenario: Given `model: llama/<model>` を指定した呼び出し, When `runAI` の実行順序（経路判定と `_buildCommand` 呼び出しの前後関係）を検査する
  - Expected: Then 経路判定が `_buildCommand` の呼び出しより前に行われており、不適合条件 (3) が成立しないこと

#### T-15-09: サーバ位置設定済みでもモデル値が llama prefix を持たない

- [ ] **T-15-09-01**: HTTP 経路が選択されず既存 CLI 経路が使われる
  - Target: `runAI` の経路選択（前段）
  - Test ID: `T-LIB-AI-LWR-09-01`
  - Rule: transport R-001 / Edge transport-1 / REQ-F-001 / REQ-C-002
  - Scenario: Given `llamaEndpoint` が有効な値で設定済みだがモデル値が llama provider prefix を持たない, When `runAI` を呼ぶ
  - Expected: Then HTTP 経路が選択されず `FetchProvider` が一度も呼ばれないこと

---

---

## Coverage Check

母集団は Edge Cases 40 行 (transport 12 / structured-output 8 / error-handling 12 /
config-packaging 8) + Active DD 13 件 + DR 25 件 (DR-01〜DR-27、削除済みの DR-07 / DR-08 を除く)

- AC 24 件 (AC-001〜AC-024)。

Edge Cases 行には元来 ID がないため、各 spec §5 の表の出現順に 1 起点で採番した。

### Edge Cases — specifications-transport.md §5

| Edge | 内容                                                     | Task ID                            |
| ---- | -------------------------------------------------------- | ---------------------------------- |
| 1    | サーバ位置設定済みだがモデル値が llama prefix を持たない | T-15-09-01                         |
| 2    | llama prefix ありだがサーバ位置未設定                    | T-10-02-01, T-10-02-02, T-15-05-01 |
| 3    | http/https 以外のスキーム (http / https は受理)          | T-10-02-04, T-10-01-05             |
| 4    | query / フラグメント / userinfo を含む URL               | T-10-02-05, T-10-02-06, T-10-02-07 |
| 5    | 認証要求で 401 / 403                                     | T-12-05-01 〜 T-12-05-03           |
| 6    | 末尾スラッシュ / `v1` の 4 通り表記                      | T-10-01-01 〜 T-10-01-05           |
| 7    | 到達不能ホスト / 404 を返すホスト                        | T-12-02-01, T-12-04-01             |
| 8    | 成功応答の `choices` が 2 要素以上                       | T-12-01-02                         |
| 9    | タイムアウト 0 かつ外部キャンセル発火                    | T-07-07-01, T-15-07-01, T-15-07-02 |
| 10   | 外部キャンセルとタイムアウトが同一タイミング             | T-07-07-02                         |
| 11   | モデル値がスラッシュ 2 つ以上                            | T-03-03-01                         |
| 12   | 日本語 (非 ASCII) プロンプトと応答                       | T-11-03-01, T-12-01-03             |

### Edge Cases — specifications-structured-output.md §5

| Edge | 内容                                                 | Task ID                                                                                                       |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | `response_format` を無視しスキーマ非準拠の本文を返す | T-09-12-01 (JSON として parse 可) / T-12-08-01 〜 T-12-08-03 (parse 不能・非 JSON Content-Type、DR-26 決定 2) |
| 2    | `response_format` を 400 等で拒否                    | T-12-06-01, T-12-07-01                                                                                        |
| 3    | `response_format` 受理、モデルが空配列を出力         | T-01-01-01                                                                                                    |
| 4    | enum のフォールバック値のみが正解                    | T-09-13-01, T-08-04-01                                                                                        |
| 5    | 有効な空配列 `"[]"` と無関係な括弧対を含む散文の区別 | T-01-01-01, T-01-02-01, T-01-03-01                                                                            |
| 6    | 配列出力要求に対し on-wire は object envelope        | T-08-01-01, T-09-01-01                                                                                        |
| 7    | 呼び出し元が YAML 契約を期待                         | T-08-02-01, T-09-02-01, T-13-04-01, T-13-05-01                                                                |
| 8    | 呼び出し元が行前置テキストを期待                     | T-08-03-01, T-09-03-01, T-09-04-01, T-13-06-01                                                                |

### Edge Cases — specifications-error-handling.md §5

| Edge | 内容                                         | Task ID                            |
| ---- | -------------------------------------------- | ---------------------------------- |
| 1    | サーバホスト到達不能                         | T-12-02-01                         |
| 2    | 到達可能だが 404                             | T-12-04-01, T-12-04-02             |
| 3    | 429                                          | T-12-03-01                         |
| 4    | 503                                          | T-12-03-02                         |
| 5    | 504                                          | T-12-03-03                         |
| 6    | 成功だが `choices` が空                      | T-12-09-01, T-12-09-02             |
| 7    | 成功だがメッセージ内容がテキストでない       | T-12-09-03, T-12-09-04             |
| 8    | 成功だが `finish_reason` が `length` 等      | T-12-09-05, T-12-10-01, T-12-10-02 |
| 9    | 認証要求で 401 / 403 (`detail` に前提崩れ)   | T-12-05-01 〜 T-12-05-03           |
| 10   | 400 で `response_format` 拒否と判別可 / 不可 | T-12-06-01, T-12-07-01             |
| 11   | モデル値が既知形式に不一致                   | T-03-04-01, T-03-04-02, T-03-05-01 |
| 12   | モデル値にスラッシュ 2 つ以上                | T-03-03-01                         |

### Edge Cases — specifications-config-packaging.md §5

| Edge | 内容                                              | Task ID                |
| ---- | ------------------------------------------------- | ---------------------- |
| 1    | `llamaEndpoint` の記述が一切ない                  | T-04-03-01             |
| 2    | `llamaEndpoint` に空文字列を明示                  | T-04-04-01, T-04-07-01 |
| 3    | `agent: chatgpt` と `model: llama/...` の同時指定 | T-04-02-01             |
| 4    | `agent` の選択肢一覧に llama が追加されていない   | T-04-02-02             |
| 5    | AI を呼ばない行に `--allow-net` が付与されている  | T-14-04-01             |
| 6    | AI を呼ぶ shebang 行に権限フラグが欠けている      | T-14-03-01, T-14-05-01 |
| 7    | フラグ列を省略した SKILL.md 例示行                | T-14-06-01             |
| 8    | 共有ライブラリ変更に対しミラー同期未実施          | T-14-08-01             |

### Active Design Decisions (spec §2.5)

| DD                     | 内容                                                    | Task ID                                        |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| transport DD-01        | 経路選択は CLI コマンド構築より前の分岐で行う           | T-03-01-02, T-15-08-01, T-15-09-01             |
| transport DD-02        | エンドポイント URL の 4 通り表記を単一の正規 URL に解決 | T-10-01-01 〜 T-10-01-05                       |
| transport DD-03        | system / user を連結せず別ロールで送る                  | T-11-01-01                                     |
| transport DD-04        | タイムアウト・外部キャンセルの合成規則を CLI と同一に   | T-07-07-01, T-07-07-02, T-15-07-01, T-15-07-02 |
| transport DD-05        | HTTP 呼び出し自体を注入可能にする                       | T-05-02-01, T-15-02-01, T-15-02-02             |
| error-handling DD-01   | 429 / 503 / 504 のみ `RateLimit`                        | T-12-03-01 〜 T-12-03-03, T-12-07-02           |
| error-handling DD-02   | 成功でも本文を取り出せなければ例外                      | T-12-09-01 〜 T-12-09-05                       |
| error-handling DD-03   | 不正モデル名の案内に llama provider を含める            | T-02-01-03                                     |
| config-packaging DD-01 | `llamaEndpoint` は既存型語彙内で表現                    | T-04-01-01, T-04-06-01                         |
| config-packaging DD-02 | `agent` の選択肢一覧を変更しない                        | T-04-02-02                                     |
| config-packaging DD-03 | `--allow-net` は AI を呼ぶ経路にのみ付与                | T-14-01-01 〜 T-14-05-01, T-14-07-01           |
| config-packaging DD-04 | 対象変更はすべてミラー同期義務の対象                    | T-14-08-01                                     |
| config-packaging DD-05 | `llamaEndpoint` の既定値は空文字列                      | T-04-03-01, T-04-04-01                         |

> structured-output の DD-01〜DD-06 と error-handling DD-04 はいずれも Promoted 済み
> (それぞれ DR-04 / DR-04 / DR-06 / DR-09 / DR-11 / DR-19 / DR-18) であり、
> 下の Decision Records 節で昇格先の DR として検証する。二重計上しない。

### Decision Records

| DR    | 観測可能な振る舞い                                                   | Task ID                                                                              |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| DR-01 | OpenAI 互換 `/v1/chat/completions` を直接 HTTP で叩く                | T-15-01-01, T-10-01-01                                                               |
| DR-02 | 既存 5 バックエンドと独立な追加バックエンド                          | T-03-05-01, T-04-02-02                                                               |
| DR-03 | 失敗時は即座に throw する (fail-first、リトライ・フォールバックなし) | T-12-11-01, T-12-12-01, T-12-12-02, T-10-02-01                                       |
| DR-04 | 数量制約の排除と enum フォールバック値                               | T-08-08-01, T-08-04-01, T-09-13-01                                                   |
| DR-05 | `config.yaml` の新キー + provider prefix                             | T-04-03-01, T-04-01-01                                                               |
| DR-06 | 周辺不具合の同時修正 (空配列受理 / 案内文言)                         | T-01-03-02, T-02-01-01 〜 T-02-04-01, T-03-07-01                                     |
| DR-09 | 「OpenAI 互換」を実測ゲートで裏付ける                                | 対象外 — Phase 0 (commit なし) が担う測定作業                                        |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じる                | T-07-01-01 〜 T-07-06-01, T-15-08-01                                                 |
| DR-11 | YAML 出力を期待する呼び出し元も強制対象に含める                      | T-08-02-01, T-09-02-01, T-13-04-01, T-13-05-01                                       |
| DR-12 | `llamaEndpoint` 未設定・空文字列はネットワーク前の設定エラー         | T-04-04-01, T-15-05-01                                                               |
| DR-13 | `--allow-net` は宛先を限定せず付与                                   | T-14-01-01                                                                           |
| DR-14 | llama 経路の識別子解決規則                                           | T-03-05-01, T-03-06-01, T-10-01-01, T-10-02-04, T-10-03-01                           |
| DR-15 | リクエストボディを閉じたフィールド集合とする                         | T-11-01-02, T-11-01-03, T-12-09-05                                                   |
| DR-16 | 失敗系分類は error-handling が単独所有 (禁止名の明示)                | T-09-09-01                                                                           |
| DR-17 | 既存 `timeoutMs` を共有し経路別キーを設けない                        | T-04-05-01, T-15-07-01                                                               |
| DR-18 | 失敗分類の軸をバックエンド可用性とし中断／続行を分ける               | T-05-01-01 〜 T-05-04-02, T-06-01-01 〜 T-06-08-01, T-12-02-01 〜 T-12-07-01         |
| DR-19 | 出力契約を呼び出し単位で明示し契約アダプタで復元                     | T-08-01-01 〜 T-08-03-01, T-09-10-01, T-11-02-01, T-13-01-01 〜 T-13-10-01           |
| DR-20 | llama 経路の可到達性を単一 commit に閉じる                           | T-15-04-01                                                                           |
| DR-21 | 検証範囲を AC 単位で割り当てる                                       | 対象外 — 文書構成の決定であり、本文書の Task Summary と本節がその帰結                |
| DR-22 | Phase 0 の実測を独立した測定レポートに記録する                       | 対象外 — Phase 0 の成果物に関する決定                                                |
| DR-23 | `llama/` の空モデル名をネットワーク前に拒否                          | T-03-04-01, T-03-04-02, T-03-03-01                                                   |
| DR-24 | 権限付与を結線より先に置く                                           | T-14-01-01 (Commit 20 が Commit 21 の着手条件)                                       |
| DR-25 | 実測ゲートの合格線を全条件 100% とする                               | 対象外 — Phase 0 の合否判定基準                                                      |
| DR-26 | runtime 由来の失敗と非 JSON 応答を分類に加える                       | T-12-02-02, T-12-02-03, T-12-08-01 〜 T-12-08-04, T-12-10-02, T-09-10-01, T-09-12-01 |
| DR-27 | キャンセルシグナルの受け渡しと契約指定の静的検査                     | T-15-04-01, T-15-06-01 〜 T-15-06-03                                                 |

### Acceptance Criteria

| AC     | Task ID                                        | AC     | Task ID                                                                                |
| ------ | ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| AC-001 | T-15-01-01                                     | AC-013 | T-15-02-01, T-15-02-02                                                                 |
| AC-002 | T-15-03-01, T-08-01-01                         | AC-014 | T-02-01-03, T-03-04-01, T-03-07-01                                                     |
| AC-003 | T-01-01-01                                     | AC-015 | T-10-01-01 〜 T-10-01-05                                                               |
| AC-004 | T-06-05-01 〜 T-06-08-01, T-12-02-01           | AC-016 | 対象外 — Phase 0 (commit なし) が担う                                                  |
| AC-005 | T-12-03-01 〜 T-12-03-03                       | AC-017 | T-12-01-02                                                                             |
| AC-006 | T-11-01-01                                     | AC-018 | T-09-01-01 〜 T-09-03-01, T-15-03-02                                                   |
| AC-007 | T-08-04-01                                     | AC-019 | T-06-08-01, T-10-02-01 〜 T-10-02-07, T-15-05-01                                       |
| AC-008 | T-07-07-01, T-07-07-02, T-15-07-01, T-15-07-02 | AC-020 | T-07-05-01, T-07-05-02, T-07-06-01, T-15-08-01                                         |
| AC-009 | T-04-01-01, T-04-03-01                         | AC-021 | T-11-03-01, T-12-01-03                                                                 |
| AC-010 | T-04-02-01                                     | AC-022 | T-05-04-01, T-05-04-02, T-06-09-01 〜 T-06-12-01, T-07-01-01, T-07-03-01 〜 T-07-03-04 |
| AC-011 | T-14-01-01 〜 T-14-05-01                       | AC-023 | T-06-01-01 〜 T-06-04-01                                                               |
| AC-012 | T-14-08-01                                     | AC-024 | T-09-04-01, T-13-10-01                                                                 |

**`[UNCOVERED]`: なし**

---

## Category Balance

| Test Target | Normal | Error  | Edge   | Cases   | 判定  |
| ----------- | ------ | ------ | ------ | ------- | ----- |
| T-01        | 2      | 1      | 2      | 5       | [OK]  |
| T-02        | 4      | [N/A]  | 2      | 6       | [N/A] |
| T-03        | 5      | 3      | 2      | 10      | [OK]  |
| T-04        | 3      | 1      | 4      | 8       | [OK]  |
| T-05        | 5      | [N/A]  | 8      | 13      | [N/A] |
| T-06        | 4      | 4      | 4      | 12      | [OK]  |
| T-07        | 2      | 6      | 5      | 13      | [OK]  |
| T-08        | 6      | 1      | 2      | 9       | [OK]  |
| T-09        | 5      | 4      | 4      | 13      | [OK]  |
| T-10        | 5      | 7      | 1      | 13      | [OK]  |
| T-11        | 5      | 1      | 1      | 7       | [OK]  |
| T-12        | 3      | 23     | 5      | 31      | [OK]  |
| T-13        | 6      | 3      | 1      | 10      | [OK]  |
| T-14        | 3      | 2      | 3      | 8       | [OK]  |
| T-15        | 6      | 1      | 7      | 14      | [OK]  |
| **合計**    | **64** | **57** | **51** | **172** | —     |

> **[N/A] T-02** — 定数 (`AI_PROVIDERS` / `AI_MODEL_TO_PROVIDER_MAP`) から案内文言を
> 組み立てる純粋な関数であり、throw する経路を持たない。
> 実際に例外が throw されたときの message は T-03-07-01 が検証する。
> **[N/A] T-05** — 真偽を返す述語であり throw する経路を持たない。
> 偽を返すケースと、catch が渡す任意の値 (plain `Error` / `null` / `undefined` /
> 任意オブジェクト) に対する安全性 (T-05-05-01 〜 T-05-05-03) はエッジケースに分類した。

ゼロ件のカテゴリを持つ Test Target は存在しない
(`[N/A]` は仕様上異常系が存在しないことを根拠付きで示したものであり、
分解漏れによる 0 件とは区別する)。

---

<!--
Task ID Format: T-<TestTarget>-<Scenario>-<Case>
- TestTarget: 2-digit (01, 02, ...)
- Scenario:   2-digit (01, 02, ...)
- Case:       2-digit (01, 02, ...)

Test ID Format: T-<スコープ>-<機能略語>-<連番>[-<枝番>]
  (docs/rules/testing-conventions.md — リポジトリ全体で一意)

本文書で新規に確保した Test ID prefix:
  T-LIB-AI-MSG / T-LIB-AI-MDL / T-LIB-AI-LAP / T-LIB-AI-JSB / T-LIB-AI-OCV /
  T-LIB-AI-LEP / T-LIB-AI-LRQ / T-LIB-AI-LRI / T-LIB-AI-NET / T-LIB-AI-LWR /
  T-CLS-GCL / T-CL-LAB / T-FL-LAB / T-NC-LAB / T-SF-LAB /
  T-CL-OCT / T-FL-OCT / T-NC-OCT / T-SF-OCT
既存 prefix の継続:
  T-LIB-J (連番 20 から) / T-LIB-AI-RA (連番 50 から)
-->
