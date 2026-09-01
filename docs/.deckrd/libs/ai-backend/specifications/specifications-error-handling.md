---
title: "Design Specification: LAN llama サーバの AI バックエンド化 — エラーハンドリング"
based-on: requirements.md v1.6.0
status: Draft
version: 2.0.1
created: "2026-09-02"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

> Part of split specification. See specifications-index.md for full scope.

## 1. Overview

### 1.1 Purpose

本仕様は、llama バックエンド経由のリクエストにおける **失敗系の振る舞い** を定義します。
対象は、HTTP ステータスおよび接続失敗をプロジェクトのエラー分類（`kind` / `subindex`）へ
写像する規則、fail-first 原則（リトライ・フォールバック禁止）、その分類が呼び出し元の
チャンク並列実行の中断経路へ伝播する経緯、および不正なモデル名に対する案内メッセージの
正確性とします。

### 1.2 Scope

本仕様は llama バックエンド経路における **失敗時の分類規則** と **メッセージ内容の規則** を定義します。
実装（例外クラスの具体的な実装、HTTP クライアントの実装）は明示的にスコープ外とします。

---

## 2. Design Principles

### 2.1 Classification Philosophy

エラー分類は、粗粒度の閉じた集合である `kind`（llama 経路が投げる失敗はすべて `AiError` とします。
DR-18 以前は設定エラーだけが `InvalidFormat` として現れていました。§3.2 の一覧を参照）と、
自由記述の `subindex` の組み合わせで表現されます。呼び出し元はこの両方を見て分岐します。
`subindex` の区別は「リトライ可能に見えるが実際にはリトライしない」過負荷状態（RateLimit 相当）と、
「恒久的な失敗」（ExitFailure 相当）とを分けることを目的としていました。DR-18 により、分類の軸は
「バックエンドが使えるか」へ改まります。後続のすべての呼び出しも同じ結果になる失敗を中断側、
当該呼び出しに固有の失敗を続行側とします。この区別は既存のレートリミット判定・致命判定の
意味論を壊さないために必要であり、AI 実行そのものがリトライを行うことを意味しません
（リトライは呼び出し元の責務）。

llama 経路が throw する例外の `kind` は一律 `AiError` とします。呼び出し元 6 箇所の catch は、
`isRateLimitError` → `isFatalAiError` → 非 AiError はフォールバック値、という順で分岐します。
そのため `AiError` 以外の kind で throw すると、失敗が既定値の書き込みとして現れてしまいます（DR-18）。

<!-- impl-note: 判定関数は _cle-libs/libs/ai/rate-limit-utils.ts の isRateLimitError /
     isFatalAiError。前者は kind==='AiError' かつ subindex==='RateLimit'、後者は kind のみを見る。
     DR-18 が中断側の subindex を増やすため、中断判定にはこの 2 関数では足りず、
     llama 経路専用の判定関数を新設する。既存 CLI 経路の 5 バックエンドは新 subindex を
     throw しないため、既存 2 関数と既存経路の挙動は変わらない（REQ-C-002）。 -->

`subindex` は自由記述の文字列であり、新しい値の追加に定数定義の変更を伴いません。
DR-18 が新設する `BackendUnavailable` / `ResponseFormatRejected` / `ResponseSchemaViolation` も
この性質に依存します。値の集合を列挙して閉じるのは本仕様 §3.2 の一覧であって、型定義ではありません。

#### 2.1.1 fail-first の射程

本仕様で言う fail-first は、**AI 実行そのものの内側** でリトライまたは他バックエンドへの
フォールバックを行わないことを指します。呼び出し元の層が行う次の動作は fail-first に反しません。

- 過負荷分類（RateLimit）を受けて並列度を落とし、未着手分を中断すること
- 中断により未実行となったものを skip として計上し、次回実行の対象として残すこと
- YAML パース失敗などの限定された失敗に対して、呼び出し元が自前のリトライループを回すこと

したがって 503 / 504 を RateLimit に分類することは、AI 実行にリトライを持ち込むものではありません。
分類は「呼び出し元が中断を判断できるようにする」ためのものであり、AI 実行自体は 1 回で
確定的に失敗します。

<!-- impl-note: 呼び出し元のリトライは setfm-frontmatter / setfm-review の maxRetry ループのみ。
     これは YAML パース失敗だけを対象としており、転送エラーはループの外へ即座に抜ける。
     runAI 内にリトライを足してはならない。 -->

### 2.2 Design Assumptions

- ローカル LLM サーバ（llama.cpp server 等）では、コールドスタート・モデルロード中・VRAM 不足・
  キュー詰まりが HTTP 503 / 504 として現れることがある。これらは「サーバが今は受けられない」という
  429 と同種の状態として扱う。
- 接続失敗（到達不能・DNS 解決失敗等）と、HTTP レベルのエラー応答（4xx/5xx）は区別せず、
  いずれも即座に例外として扱う（フォールバック値を返さない）。
- モデル値の解決は、HTTP 経路の実行そのものより前段の独立した判定であり、対象サーバへの
  到達可否とは無関係に発生しうる。

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit                        | Responsibility                                                            | REQ Coverage         |
| --------------------------- | ------------------------------------------------------------------------- | -------------------- |
| Model identifier acceptance | モデル値が既知の形式に一致しない場合、受理形式を列挙して拒否する          | REQ-F-014            |
| Response interpretation     | HTTP ステータスおよび応答本文を、成功テキスト、またはエラー分類へ写像する | REQ-F-005, REQ-F-006 |

#### Unit Interaction Map

```text
+-----------------------------+                       +-------------------------+
| Model identifier acceptance | -- (不正モデル名) --> | throw: guidance message |
+-----------------------------+                       +-------------------------+

+-------------+     +-------------------------+
| Transport   | --> | Response interpretation |
+-------------+     +-------------------------+
                            |
                            v
              +----------------------------------------+
              | throw: kind=AiError,                   |
              | subindex ∈ {RateLimit, InvalidEndpoint,|
              |   BackendUnavailable,                  |
              |   ResponseFormatRejected,              |
              |   ExitFailure, ResponseSchemaViolation}|
              +----------------------------------------+
```

<!-- Model identifier acceptance と Response interpretation は互いに独立した失敗経路であり、
     どちらか一方の失敗がもう一方の判定に影響することはない。 -->

#### Data Flow Diagram

```text
[HTTP response or connection failure] --> [Response interpretation] --> [assistant text | thrown error]
                                                    |
                                                    v
                                          [status/body classification]

[model identifier] --> [Model identifier acceptance] --> [route decision | thrown error with guidance]
```

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- 接続失敗時のリトライ、および claude 等既存バックエンドへのフォールバックは行わない
  ← REQ: Out of Scope（DR-03 に対応）。
- 既存 5 バックエンド（claude / codex / copilot / opencode / antigravity）のエラー分類・
  既定の動作は変更しない ← REQ: Out of Scope。

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                                     | Rationale                                                                                                                                                                                                             | Affected Rules             | Status           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------- |
| DD-01 | 429 / 503 / 504 のみを `subindex: RateLimit` とし、それ以外の非成功ステータスおよび接続失敗を `subindex: ExitFailure` とする | ローカル LLM サーバ特有の過負荷状態（コールドスタート・モデルロード・VRAM 不足・キュー詰まり）を、恒久的な設定ミスと区別して、呼び出し元の並列実行の中断ロジックへ正しく伝えるため（REQ-F-005 / REQ-F-006 rationale） | R-001, R-002, R-003        | Active           |
| DD-02 | 成功ステータスだが応答本文からアシスタントテキストを取り出せない場合も、フォールバック値を返さず例外として扱う               | fail-first 原則（DR-03）を、HTTP レベルのエラーだけでなく「形式上は成功だが中身が使えない」応答にも一貫して適用するため。フォールバック値を返すと呼び出し元が気づかないまま処理を続行してしまう                       | R-004                      | Active           |
| DD-04 | 分類の軸を「再試行可能か」から「バックエンドが使えるか」へ移し、中断側 subindex を 3 種増やす                                | 中断は呼び出し元 catch の第 1 分岐でしか起きないため、接続失敗や設定漏れが `ExitFailure` / 非 `AiError` のままだと一括処理が止まらない                                                                                | R-001, R-006, R-007, R-008 | Promoted → DR-18 |
| DD-03 | 不正なモデル名のエラーメッセージには、既存の受理形式に加え llama provider（`llama/<model>`）を含める                         | 現行の案内文言（`opus, sonnet, haiku` のみ）は既に `gpt-*` / `gemini-*` / `<provider>/<model>` を反映しておらず、llama provider の追加で乖離がさらに広がるため（設計ノート §6.6）                                     | R-005                      | Active           |

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                 | Phase | Impact on This Spec                                                                                     |
| ----- | --------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| DR-03 | 失敗時は即座に throw する（fail-first。リトライ・フォールバック無し） | spec  | R-001〜R-004 すべての評価順序と結果に適用される。分類のいかんに関わらず「即座に throw」が不変条件となる |
| DR-06 | 既知の周辺不具合を本スコープで併せて直す                              | spec  | Section 4.2 R-005 の案内文言を実態へ追随させる根拠                                                      |
| DR-15 | リクエストボディを閉じた集合とし、切り詰め応答を失敗として分類する    | spec  | R-004 の条件に `finish_reason` を含めることの根拠                                                       |
| DR-16 | 失敗系分類の一覧を error-handling が単独で所有する                    | spec  | §3.2 が経路全体の失敗系一覧を持つ根拠。決定 3（R-004 に専用 subindex を設けない）は DR-18 が撤回した    |
| DR-18 | 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける  | spec  | §3.2 の中断・続行の別、および §4.1 の R-001 / R-006 / R-007 / R-008 の根拠                              |
| DR-19 | 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま復元する    | spec  | §3.2 に `ResponseSchemaViolation` を再掲することの根拠                                                  |

### 2.7 DD to DR Promotion Criteria

> **Purpose**: Guidelines for determining when a DD should be promoted to a formal DR.
> Promotion is a **human judgment** — these criteria inform, not automate.

**Consider promoting a DD when:**

1. Cross-specification Impact — The decision affects multiple specifications or modules
2. Architectural Significance — The decision constrains future design choices
3. Non-trivial Alternatives — Multiple viable options existed
4. Stakeholder Visibility Required — The decision should be reviewable by external parties

**Keep as DD when:**

- Decision is local to this specification only
- No significant alternatives existed
- Rationale is self-evident from context

> **Action**: To promote, run `/deckrd dr --add` with the DD context,
> then update DD Status to `Promoted → DR-xx`.

---

## 3. Behavioral Specification

### 3.1 Input Domain

- Input Type（Response interpretation）: HTTP 応答（ステータスコードおよび本文）、または
  応答が一切得られない接続失敗状態
- Input Type（Model identifier acceptance）: モデル値文字列（`options` または設定から得られる）
- Assumptions: Response interpretation はトランスポートの実行後にのみ評価される。
  Model identifier acceptance はリクエスト構築より前に評価され、Response interpretation の結果に
  依存しない

### 3.2 Output Semantics

- Output Meaning: いずれの経路も、正常終了時はこの仕様の対象外（本仕様は失敗系のみを扱う）。
  失敗時は必ずプロジェクトのエラークラスの例外が throw される
  **Possible Outcomes（llama 経路が投げうる分類の一覧。本節が唯一の所有者とする）**

`kind` はすべて `AiError` とします。`subindex` は中断側と続行側に分かれます（DR-18）。
中断は呼び出し元が一括処理を止めることを、続行は当該呼び出しのみを失敗として記録し
残りの処理を進めることを意味します。

| subindex                  | 扱い | 発生条件                                                              | 分類規則の所在                              |
| ------------------------- | ---- | --------------------------------------------------------------------- | ------------------------------------------- |
| `RateLimit`               | 中断 | HTTP 429 / 503 / 504（過負荷系）                                      | §4.1 R-002                                  |
| `InvalidEndpoint`         | 中断 | サーバ位置値が未設定、または `http` / `https` の絶対 URL でない       | `specifications-transport.md` R-006         |
| `BackendUnavailable`      | 中断 | 接続失敗（到達不能・DNS 解決失敗）／HTTP 404・501／HTTP 401・403      | §4.1 R-001, R-006, R-007                    |
| `ResponseFormatRejected`  | 中断 | HTTP 400 のうち、`response_format` の拒否と判別できたもの             | §4.1 R-008                                  |
| `ExitFailure`             | 続行 | 上記以外の非成功ステータス（入力起因の 400 を含む）／使えない応答本文 | §4.1 R-003, R-004                           |
| `ResponseSchemaViolation` | 続行 | 2xx 応答の本文が呼び出し元の出力契約に適合しない                      | `specifications-structured-output.md` R-008 |

不正モデル名は上記とは独立した経路であり、受理形式を列挙する案内メッセージとともに
throw されます（§4.2 R-005）。

`InvalidEndpoint` と `ResponseSchemaViolation` の分類規則は他ファイルが持ちます。
本節はその再掲として一覧の網羅性を保ちます。両者を本節に載せないと、
DR-16 決定 1 の「唯一の所有者」という主張が成立しません（codex consistency D-03 / E-03）。

> **注記 1**: `BackendUnavailable` は DR-18 により `ExitFailure` から分離した。
> 分離前は、サーバ未起動が続行側に分類されるため、全ファイルにエラーを記録したうえで
> 処理が「完了」していた。
>
> **注記 2**: `ResponseSchemaViolation` を `ResponseFormatIgnored` と命名してはならない。
> 単一の応答から、サーバによる `response_format` の黙殺と、モデルの偶発的な契約違反は
> 区別できない。黙殺は REQ-F-016 の測定結果を表す語であり、実行時の分類名ではない。
>
> **注記 3**: `InvalidFormat` は 2 つの階層に現れ、それぞれ別の意味を持つ。
> 既存実装が `AiError` 配下の subindex として用いる `InvalidFormat` は、
> CLI バックエンドの応答が期待する形を持たない場合を指す。
> DR-12 が `kind` として選んでいた `InvalidFormat` は DR-18 により `AiError` へ置き換わったため、
> llama 経路が `kind: InvalidFormat` を throw することはなくなった。

---

## 4. Decision Rules

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
-->

### 4.1 HTTP ステータス・接続失敗の分類（Response interpretation）

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                                                         | Outcome                                                                     |
| ------- | ---: | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| R-001   |    1 | リクエストに対して HTTP 応答が一切得られない（接続失敗・到達不能・DNS 解決失敗）                                  | `kind: AiError, subindex: BackendUnavailable` を throw する（**中断**）     |
| R-002   |    2 | HTTP 応答ステータスが 429、503、または 504 である                                                                 | `kind: AiError, subindex: RateLimit` を throw する（**中断**）              |
| R-006   |    3 | HTTP 応答ステータスが 404 または 501 である                                                                       | `kind: AiError, subindex: BackendUnavailable` を throw する（**中断**）     |
| R-007   |    4 | HTTP 応答ステータスが 401 または 403 である                                                                       | `kind: AiError, subindex: BackendUnavailable` を throw する（**中断**）     |
| R-008   |    5 | HTTP 応答ステータスが 400 であり、応答本文から `response_format` の拒否と判別できる                               | `kind: AiError, subindex: ResponseFormatRejected` を throw する（**中断**） |
| R-003   |    6 | HTTP 応答ステータスが R-002・R-006〜R-008 のいずれにも該当しない非成功ステータスである（判別できない 400 を含む） | `kind: AiError, subindex: ExitFailure` を throw する（**続行**）            |
| R-004   |    7 | HTTP 応答ステータスは成功だが、応答本文からアシスタントテキストを取り出せない（下表）                             | `kind: AiError, subindex: ExitFailure` を throw する（**続行**）            |

R-006〜R-008 は DR-18 により新設した規則にあたります。既存の R-001〜R-005 の ID は付け替えていません。
Step の順序と ID の順序は一致しません。評価は Step 欄の順に行います。

**R-004 の「取り出せない」条件は次に限ります。本表が網羅の正であり、§5 Edge Cases は例示にとどまります。**

| # | 条件                                                                                               |
| - | -------------------------------------------------------------------------------------------------- |
| a | `choices` が存在しない、または空配列である                                                         |
| b | `choices[0].message.content` が `null` または欠落している                                          |
| c | `choices[0].message.content` が文字列でない（配列・オブジェクト等。`tool_calls` 中心の応答を含む） |
| d | `choices[0].finish_reason` が `stop` 以外である                                                    |

(d) の正常値は `stop` のみとします。`length`（切り詰め）はもとより、実装固有の値
（`eos` / `end_turn` 等）も正常完了として受理しません。未知の値を正常扱いにすると、
切り詰めを見逃す側に倒れるためとします。実装固有値の実在は REQ-F-016 の実測で確認し、
受理すべき値が判明した場合は本表を改訂します（codex risk A-01）。

(c) について、`tool_calls` は本経路では送出しないため出現しない想定だが、
出現した場合も「テキストでない本文」として同じ扱いとします（codex balanced M-02）。

R-004 の評価対象は `specifications-transport.md` R-007 が選んだ `choices[0]` とします。
`choices` が空で選択そのものが成立しない場合も、本規則により `ExitFailure` として分類します。

No reordering is permitted. R-001〜R-004 のいずれも、リトライまたは他バックエンドへの
フォールバックを伴いません（DR-03）。中断・続行の別は分類の帰結であって、
AI 実行側の振る舞いの違いではありません。AI 実行はいずれの場合も 1 回で確定的に失敗します。

### 4.2 モデル値の受理判定（Model identifier acceptance）

| Rule ID | Step | Condition                                                                                                                                | Outcome                                                                                                  |
| ------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R-005   |    1 | モデル値が、既知のいずれの受理形式（bare name / `gpt-*` / `gemini-*` / `<provider>/<model>`、および新設の llama provider）にも一致しない | 不正なモデル名として throw し、メッセージに現在受理されるすべての形式（llama provider を含む）を案内する |

このルールは 4.1 の評価順序とは独立しており、リクエスト構築より前に評価されます。

`<provider>/<model>` 形式の受理判定は、最初のスラッシュより前を provider、以降の全体を
モデル名とみなして行います。provider が既知であれば、モデル名側にスラッシュが含まれていても受理します。
この解釈は既存のモデル名解決の挙動であり、llama provider の追加によって変更しません（REQ-C-002）。

---

### 4.3 既存バックエンドに対する非破壊条件（REQ-C-002）

R-005 のモデル値解釈は llama provider の追加によって既存の受理範囲を変えません。
次のいずれかが成立した場合、REQ-C-002 違反として不適合と判定します。

| 条件                                                                                         | 判定   |
| -------------------------------------------------------------------------------------------- | ------ |
| llama 追加前に受理されていたモデル値が、追加後に拒否される                                   | 不適合 |
| 既存 5 バックエンドのいずれかについて、既定のモデルが変わる                                  | 不適合 |
| 既存 5 バックエンドのいずれかについて、成功・失敗の分類（kind / subindex の組）が変わる      | 不適合 |
| 不正モデル名の案内文言の変更により、`kind` / `subindex` を見て分岐している既存の判定が変わる | 不適合 |

案内文言そのものの変更（REQ-F-014）は、分類を変えない限り非破壊とみなします。

---

## 5. Edge Cases

| Input                                                                 | Classification                                                                                                                                | REQ       | Rationale                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サーバホストが到達不能（応答が得られない）                            | `subindex: BackendUnavailable`（中断）                                                                                                        | REQ-F-006 | 接続そのものが成立しておらず、後続の呼び出しも同じ結果になる。一括処理を中断する（DR-18）                                                                                                                  |
| サーバは到達可能だが 404 を返す                                       | `subindex: BackendUnavailable`（中断）                                                                                                        | REQ-F-006 | エンドポイントを実装していないことを示し、後続の呼び出しも同じ結果になる（R-006）                                                                                                                          |
| サーバが 429 を返す                                                   | `subindex: RateLimit`                                                                                                                         | REQ-F-005 | 既存のレートリミット判定の意味論に合わせ、並列度を落として中断すべき状態として分類する                                                                                                                     |
| サーバが 503 を返す                                                   | `subindex: RateLimit`                                                                                                                         | REQ-F-005 | コールドスタート・モデルロード中を示唆するローカル LLM 特有の状態                                                                                                                                          |
| サーバが 504 を返す                                                   | `subindex: RateLimit`                                                                                                                         | REQ-F-005 | キュー詰まり・ゲートウェイタイムアウトを示唆するローカル LLM 特有の状態                                                                                                                                    |
| 成功ステータスだが `choices` が空                                     | `subindex: ExitFailure`（続行）                                                                                                               | REQ-F-006 | フォールバック値を返さず、使えない応答を明示的な失敗として扱う（DD-02）。単一応答に固有の失敗のため処理は続行する                                                                                          |
| 成功ステータスだがメッセージ内容がテキストでない                      | `subindex: ExitFailure`                                                                                                                       | REQ-F-006 | 同上                                                                                                                                                                                                       |
| 成功ステータスだが `finish_reason` が `length` 等の正常完了以外を示す | `subindex: ExitFailure`                                                                                                                       | REQ-F-006 | 生成パラメータを送らない（DR-15）ため切り詰めはサーバ既定に依存して起きうる。検知しないと構造化出力の目的を満たさない文字列が呼び出し元のパーサへ素通りする                                                |
| サーバが認証を要求し 401 / 403 を返す                                 | `subindex: BackendUnavailable`（中断）                                                                                                        | REQ-F-006 | §2 Assumptions の「認証を要求しない構成」という前提が崩れた場合にあたる（R-007）。設定を変えない限り後続もすべて失敗するため中断し、`detail` に前提の崩れを記して 404 や到達不能と読み分けられるようにする |
| サーバが 400 を返し、本文から `response_format` の拒否と判別できる    | `subindex: ResponseFormatRejected`（中断）                                                                                                    | REQ-F-006 | スキーマ強制が効かない以上、後続の呼び出しも同じ結果になる（R-008）。判別できない 400 は入力起因の可能性があるため続行側の `ExitFailure` に落とす                                                          |
| モデル値が既知のいずれの形式にも一致しない                            | 不正モデル名として throw（受理形式を案内）                                                                                                    | REQ-F-014 | 案内メッセージが実態（llama provider を含む）と乖離しないようにする                                                                                                                                        |
| モデル値にスラッシュが 2 つ以上含まれる                               | 最初のスラッシュまでを provider、以降の全体をモデル名として解釈する。provider が既知であれば受理し、未知であれば不正モデル名として throw する | REQ-F-014 | 既存のモデル名解決がこの規則で動いており、`llama/org/model` のような入力は現に受理される。ここで拒否に変えると既存バックエンドの受理範囲を狭めることになり、REQ-C-002（既存非破壊）に反する                |

---

## 6. Requirements Traceability

| Requirement ID                                        | Spec Rule                                         | Notes                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| REQ-F-005                                             | R-002                                             | 429 / 503 / 504 を RateLimit に写像する規則                                                               |
| REQ-F-006                                             | R-001, R-003, R-004, R-006, R-007, R-008          | 接続失敗・非成功ステータス・使えない成功応答をいずれも即座に throw する規則と、中断・続行の subindex 割当 |
| REQ-F-014                                             | R-005                                             | 不正モデル名の案内メッセージに llama provider を含める規則                                                |
| REQ-F-017, REQ-F-019, REQ-NF-003                      | Covered in: `specifications-transport.md`         | —                                                                                                         |
| REQ-F-018                                             | Covered in: `specifications-structured-output.md` | —                                                                                                         |
| REQ-F-001, REQ-F-002, REQ-F-007, REQ-F-012, REQ-F-015 | Covered in: `specifications-transport.md`         | —                                                                                                         |
| REQ-F-003, REQ-F-004, REQ-F-013, REQ-F-016            | Covered in: `specifications-structured-output.md` | —                                                                                                         |
| REQ-F-008, REQ-F-009, REQ-F-010, REQ-F-011            | Covered in: `specifications-config-packaging.md`  | —                                                                                                         |

---

## 7. Open Questions

> **Status**: INCOMPLETE（400 の読み分けが REQ-F-016 の実測待ち）
>
> 「HTTP 429 / 接続失敗を既存の AI エラー種別の再利用にするか新規種別を追加するか」は、
> requirements.md v1.6.0 の §9 において解決済みとして記録されている
> （既存種別を再利用し `RateLimit` / `ExitFailure` の subindex で区別する。REQ-F-005 / REQ-F-006 / REQ-C-003）。
> 本仕様は Section 4.1 の R-001〜R-004 および R-006〜R-008 でこれを規定する。

解決済みの未決事項の経緯を下表に残します。

| 旧 # | Question                                                                            | 解決                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 「成功ステータスだが本文が使えない」ケース（R-004）専用の `subindex` 名を新設するか | R-004 自体には新設せず `ExitFailure` に収める。ただし DR-16 決定 3 が根拠とした「subindex を増やしても振る舞いが変わらない」という前提は DR-18 により覆り、中断側の subindex を 3 種新設した |
| 2    | `finish_reason` の正常値をどこまで受理するか                                        | `stop` のみを正常とする。実装固有値（`eos` / `end_turn` 等）は REQ-F-016 の実測で確認し、必要なら §4.1 の表を改訂する（codex risk A-01）                                                     |
| 3    | `message.content` が `null` / 配列 / `tool_calls` の場合の扱い                      | いずれも「テキストでない本文」として R-004 の (b) / (c) に含め、続行側の `ExitFailure` とする（codex balanced M-02）                                                                         |

**残る未決事項**: `response_format` の拒否（中断）とコンテキスト長超過（続行）が
同じ HTTP 400 で返る場合、応答本文のエラーメッセージを見ないと区別できません。
判別手段は REQ-F-016 の実測結果に依存します。実測までは判別できない 400 を続行側の
`ExitFailure` に落とします（R-003 / DR-18 Open Question）。

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added, PATCH = clarification only -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial specification                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-02 | 1.0.1   | consistency レビュー所見を反映: R-004 の評価対象が transport R-007 の選ぶ choices[0] であることを明記、based-on を requirements v1.4.0 へ更新                                                                                                                                                                                                                                                                   |
| 2026-09-02 | 1.0.2   | DR-08 削除に伴い DR-06 参照へ差し替え、要件 v1.5.0 に追随                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-02 | 1.0.3   | 要件 v1.5.0 の内容へ追随: §7 の note が引く要件バージョンと未解決扱いを v1.5.0 §9 の解決済み記録へ訂正、§2.1 の重複表記を修正                                                                                                                                                                                                                                                                                   |
| 2026-09-02 | 1.1.0   | spec レビュー所見を反映: DR-15 により R-004 の条件へ `finish_reason` を追加、DR-16 により §2.1 の `kind` 記述を訂正し §3.2 を失敗系一覧の所有者に、§7 の未決 #1 を解決、Unit 名と用語を統一、§2.5 に Status Values 凡例を追加、§6 の欠落 4 件を補完                                                                                                                                                             |
| 2026-09-02 | 2.0.0   | codex レビュー所見を反映: DR-18 により §3.2 の失敗分類を中断・続行の軸へ再定義し `BackendUnavailable` / `ResponseFormatRejected` / `ResponseSchemaViolation` を追加、§4.1 に R-006〜R-008 を新設、R-001 を中断側へ、R-004 の判定対象（`finish_reason` は `stop` のみ・`message.content` の形）を規則本文へ列挙、§2.1 に subindex が自由記述である前提を明記、§2.6 の Phase 列を decision-records に合わせて訂正 |
| 2026-09-03 | 2.0.1   | 本文をですます体へ統一し textlint 指摘を解消（内容変更なし）                                                                                                                                                                                                                                                                                                                                                    |
