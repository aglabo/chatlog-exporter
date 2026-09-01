---
title: "Design Specification: LAN llama サーバの AI バックエンド化 — Transport"
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

本ファイルは、LAN 上の llama サーバへの AI バックエンド追加のうち、**HTTP トランスポート層** の
振る舞いを定義します。対象は、バックエンド選択、エンドポイント URL の正規化、リクエスト構成
（system/user メッセージの分離）、タイムアウト・キャンセルのセマンティクス、および
unit テストのために HTTP 呼び出しを差し替え可能にする注入点とします。

### 1.2 Scope

This specification defines the **behavioral rules** and
**classification semantics** of LAN llama サーバの AI バックエンド化（トランスポート部分）。

Implementation details are explicitly out of scope.

---

## 2. Design Principles

### 2.1 Classification Philosophy

バックエンドの選択は、既存 CLI コマンド構築に入る **前** の分岐点で行います。選択条件は
モデル値が llama provider prefix を持つか否かの一点のみであり、それ以外の状態（設定の有無、
サーバの到達可能性等）はこの分岐の判定材料にしません。

### 2.2 Design Assumptions

- LAN サーバは OpenAI 互換 `/v1/chat/completions` を実装しており、認証を要求しない
  （宅内 LAN の信頼済みネットワーク上での運用を前提とする）
- サーバ位置値は `config.yaml` からのみ供給される。環境変数・CLI フラグ経路は存在しない
- モデル値の供給元は、呼び出し時のオプションまたは `config.yaml` の 2 つとする。
  オプションが指定されていればそれを優先し、指定がなければ設定値を用いる。
  この供給元は既存 CLI 経路と共通であり、llama 経路の追加によって変えない
  （`specifications-error-handling.md` §3.1 と一致させる。codex consistency D-04 / E-02）
- 既存 CLI バックエンド（claude / codex / copilot / opencode / antigravity）の分岐・既定値には触れない

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit                | Responsibility                                                                                 | REQ Coverage         |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| Backend selection   | 設定されたモデル値から、CLI 経路構築前に HTTP 経路を選ぶかどうかを決定する                     | REQ-F-001            |
| Endpoint resolution | 設定されたサーバ位置を単一の正規化されたリクエスト URL に変換する                              | REQ-F-015            |
| Request composition | system/user メッセージを分離し、provider prefix を除いたモデル識別子を含むペイロードを構築する | REQ-F-001, REQ-F-002 |
| Transport           | 合成されたキャンセルシグナルの下でリクエストを実行する                                         | REQ-F-007, REQ-F-012 |

#### Unit Interaction Map

```text
+--------------------+     +----------------------+     +--------------------+
| Backend selection  | --> | Endpoint resolution  | --> | Request            |
|                    |     |                       |     | composition         |
+--------------------+     +----------------------+     +--------------------+
                                                                 |
                                                                 v
                                                          +--------------------+
                                                          | Transport          |
                                                          +--------------------+
```

<!-- Schema construction, Response interpretation, Empty-array acceptance are out of scope
     for this file; see specifications-structured-output.md and
     specifications-error-handling.md. -->

#### Data Flow Diagram

```text
[model 値, endpoint 設定] --> [Backend selection] --> [Endpoint resolution] --> [Request composition] --> [Transport]
                                                                                        |
                                                                                        v
                                                                                 [キャンセル合成]
```

<!-- ASCII diagrams only. Mermaid, PlantUML, and SVG are prohibited. -->

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- 環境変数・CLI フラグによる接続先指定は行わない ← REQ: Out of Scope #1
- LAN サーバへの認証（API キー / Bearer token）の送出は行わない ← REQ: Out of Scope #2
- 接続失敗時のリトライ、および claude 等既存バックエンドへのフォールバックは行わない ← REQ: Out of Scope #3
- 既存 5 バックエンド（claude / codex / copilot / opencode / antigravity）の動作・既定モデルの変更は行わない ← REQ: Out of Scope #5

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                  | Rationale                                                                                             | Affected Rules | Status |
| ----- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | ------ |
| DD-01 | バックエンド選択は CLI コマンド構築より前の分岐で行い、選択後は経路が変化しない           | backend list と CLI コマンドの型レベル対応が壊れるため、HTTP 経路を「もう一つの CLI」として扱えない   | R-001          | Active |
| DD-02 | エンドポイント URL は末尾スラッシュ・`/v1` 有無の 4 通りの表記を単一の正規 URL に解決する | 表記ゆれによるパス連結の失敗（`/v1/v1/...` 等）を避けるため                                           | R-002          | Active |
| DD-03 | system/user は 1 つのメッセージに連結せず、常に別ロールの要素として送る                   | 呼び出し元プロンプトの system/user 分割意図を chat-completions の `messages` にそのまま対応させるため | R-003          | Active |
| DD-04 | タイムアウト・外部キャンセルの合成規則は既存 CLI 経路と同一にする                         | 呼び出し元にとって経路の違いが挙動差として現れないようにするため                                      | R-004          | Active |
| DD-05 | HTTP 呼び出し自体を注入可能にし、注入がない場合は既定の呼び出し手段へ解決する             | 既存のサブプロセス実行に対するモック手法では HTTP 呼び出しを捕捉できないため                          | R-005          | Active |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                                            | Phase | Impact on This Spec                                                                        |
| ----- | ------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------ |
| DR-01 | サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く                      | spec  | Request composition / Transport が準拠すべき wire format と、直接 fetch する設計の根拠     |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする                                      | spec  | Backend selection が既存分岐に割り込まず、独立した分岐として実装される根拠                 |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する                        | spec  | Backend selection / Endpoint resolution の入力源を規定する                                 |
| DR-09 | 「OpenAI 互換」を実測ゲート（REQ-F-016）で裏付ける                                               | spec  | 本ファイルのスコープ外（構造化出力側）だが、Transport の wire format 前提と関連する        |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じ込める                                        | spec  | Section 4.1 末尾が示す前段／中段／後段の 3 層分割の根拠                                    |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする（DR-18 が supersede） | spec  | R-006（ネットワークアクセス前に設定エラーを検出する）の直接の根拠                          |
| DR-14 | llama 経路の識別子解決規則を確定する                                                             | spec  | R-002 の正規化規則、R-006 の許容スキーム、R-001 の prefix 照合の根拠                       |
| DR-15 | リクエストボディを閉じた集合とし、切り詰め応答を失敗として分類する                               | spec  | R-009（送るフィールドの限定）の根拠。切り詰めの分類は error-handling 側が持つ              |
| DR-18 | 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける                             | spec  | R-006 が投げる分類を `kind: AiError` へ改めることの根拠                                    |
| DR-19 | 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま復元する                               | spec  | §4.1 Step 4 / Step 7.5 を常時実行とし、R-009 の `response_format` を無条件にすることの根拠 |
| DR-17 | llama 経路は既存の `timeoutMs` を共有し、経路別の設定キーを設けない                              | spec  | R-004 がタイムアウト値を共有すると述べることの根拠                                         |

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

- Input Type: 呼び出し元から渡される system テキスト、user テキスト、および
  設定から解決されるモデル値・サーバ位置値
- Assumptions:
  - モデル値は文字列であり、llama provider prefix を含むか含まないかのいずれかである
  - サーバ位置値は、HTTP 経路が選択された場合、`http` または `https` スキームを持つ絶対 URL である。
    これを満たさない値は R-006 により設定エラーとして扱われる
  - タイムアウト値・外部キャンセルシグナルは既存 CLI 経路と同一の型で渡される

### 3.2 Output Semantics

- Output Meaning: HTTP 経路が選択され、リクエストが成立した場合、後続（レスポンス解釈、
  本ファイルのスコープ外）に引き渡すための HTTP レスポンスが得られる
- Possible Outcomes:
  - HTTP 経路が選択され、正規化された URL へ system/user 分離済みのリクエストが送信される
  - HTTP 経路が選択されず、既存 CLI 経路がそのまま実行される
  - サーバ位置値が不正・未設定であるか、接続そのものが失敗し、後続で例外として扱われる
    （例外の分類は `specifications-error-handling.md` のスコープ）

---

## 4. Decision Rules

<!-- impl-note: DD-05 の「既存のモック手法」は Deno.Command のグローバル差し替えを指す。
     HTTP 経路では _cle-libs/types/providers.types.ts の慣例（関数型エイリアスを options の任意
     フィールドで受け、使用直前に ?? で既定へ解決）に合わせる。 -->

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
-->

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                           | Outcome                                                                                                                                                                                                                                                 |
| ------- | ---: | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001   |    1 | モデル値が llama provider prefix を持つ（大文字小文字を区別する完全一致で照合する） | HTTP 経路を選択し、既存 CLI コマンド構築を行わない。持たない場合は既存 CLI 経路のまま                                                                                                                                                                   |
| R-006   |    2 | HTTP 経路が選択されており、サーバ位置値が §4.3 の受理条件を満たさない               | ネットワークアクセスを行う前に `ChatlogError(kind: AiError, subindex: InvalidEndpoint)` を throw する（中断側。DR-18）。R-002 の正規化はこの検査を通過した値に対してのみ行う                                                                            |
| R-002   |    3 | HTTP 経路が選択されている                                                           | サーバ位置値から末尾のスラッシュを除去し、除去後の末尾セグメントが `v1` であればそれも除去し、得られた基底に `/v1/chat/completions` を連結した URL を用いる                                                                                             |
| R-003   |    4 | HTTP 経路が選択されている                                                           | system テキストと user テキストを、それぞれ異なるロールを持つ別々のメッセージ要素として、system が先・user が後の順で構成する                                                                                                                           |
| R-009   |    5 | HTTP 経路でリクエストボディを構成する                                               | ボディに含めるフィールドを `model` / `messages` / `stream`（値は false 固定）/ `response_format`（llama 経路では常に含める。DR-19）の 4 つに限り、生成パラメータ（`temperature` / `top_p` / `max_tokens` 等）は送らずサーバ既定に委ねる                 |
| R-004   |    6 | HTTP 経路でリクエストが実行される                                                   | 既存 CLI 経路と同一のタイムアウト・キャンセル合成規則を適用する：タイムアウト値がゼロの場合はタイマーを設定せず、外部キャンセルが同時に発生した場合は外部キャンセルを優先して報告する。タイムアウト値は既存の設定値を共有し、経路別の設定キーを設けない |
| R-005   |    7 | HTTP 呼び出しを実行する                                                             | 呼び出し元がテストダブルを注入していればそれを用い、注入がなければ既定の呼び出し手段を用いる。両者の切り替えは §4.4 が定める観測点に差を生じさせない                                                                                                    |
| R-007   |    8 | 成功ステータスの応答から発話テキストを抽出する                                      | `choices` の先頭要素（`choices[0]`）のみを採用し、2 番目以降は無視する。`choices` が空である場合と本文がテキストでない場合の分類は `specifications-error-handling.md` R-004 が扱う                                                                      |

No reordering is permitted.

### 4.1 単位間の結合順序（本ファイルが所有する）

llama 経路の 1 回の呼び出しは、分割された 4 ファイルに記述された単位の合成として成立します。
どのファイルがどの単位を規定するかに関わらず、**実行時の結合順序は本節が唯一の正** とします。
実装者が順序を推測で補完してはなりません。

| Step | 単位                                                                 | 規定するファイル                                                                                                            |
| ---: | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
|    1 | バックエンド選択（モデル値の prefix 判定）                           | 本ファイル R-001                                                                                                            |
|    2 | モデル値の受理判定                                                   | `specifications-error-handling.md` R-005                                                                                    |
|    3 | エンドポイントの検証と URL の正規化                                  | 本ファイル R-006（未設定・不正の検出）, R-002（正規化）                                                                     |
|    4 | スキーマ構築（呼び出し元の出力契約から。llama 経路では常に実行する） | `specifications-structured-output.md` R-001〜R-003                                                                          |
|    5 | リクエスト構成（system/user 分離、prefix 除去、スキーマの埋め込み）  | 本ファイル R-003・R-009（フィールドの限定）、および文字符号化について R-008（§4.2）                                         |
|    6 | 送信（キャンセルシグナル合成下）                                     | 本ファイル R-004, R-005                                                                                                     |
|    7 | レスポンス解釈（ステータス写像、発話テキスト抽出）                   | 本ファイル R-007（choice の選択）・R-008（復号）, `specifications-error-handling.md` R-001〜R-004・R-006〜R-008（失敗分類） |
|  7.5 | 出力契約の検証と復元                                                 | `specifications-structured-output.md` R-008（検証）, R-007（復元）                                                          |
|    8 | 応答テキストのパース（呼び出し元が行う）                             | `specifications-structured-output.md` R-004, R-005                                                                          |

Step 1〜7.5 のいずれかが失敗した時点で以降の Step は実行されません。
Step 4 と Step 7.5 は llama 経路では常に実行されます。出力契約を指定しない llama 呼び出しは
想定しません（`specifications-structured-output.md` R-001 / DR-19）。

<!-- impl-note: この順序は runAI 内の 1 つの分岐として実装される。Step 8 だけは runAI の外側
     （呼び出し元スキル）で起きる。Step 2 を Step 3 より前に置くのは、不正なモデル名を
     エンドポイント解決より先に弾くという既存 CLI 経路の順序に合わせるため。 -->

本仕様の観点では、Step 6 が CLI 経路と HTTP 経路のどちらで実行されるかに関わらず、
Step 6 を包む **タイムアウトとキャンセルの扱いは単一の規定（R-004）に従います**。
経路ごとに別々の規定を持つことはありません。

#### 4.1.1 内部境界の構造（REQ-NF-001 / REQ-C-006 / AC-020）

REQ-NF-001 と REQ-C-006 は「llama 経路を AI 実行本体から分離した内部境界に置く」ことを求め、
AC-020 はその検査を要求します。しかし何をもって分離済みと判定するかの線が規則として存在せず、
検証手段が非規範の実装ノートにしか置かれていませんでした（codex balanced C-03 / explore G-07）。
次を規範として持ちます。

| Rule ID | Condition                      | Outcome                                                                                                                                                            |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-010   | llama 経路を AI 実行に組み込む | AI 実行を 3 層に分け、経路依存の処理を中段だけに閉じる。前段・後段は経路非依存の単一実装とし、経路ごとに複製しない。中段の実装単位はモジュール内に閉じ、公開しない |

3 層の担当は次のとおりとします。

| 層   | 経路依存 | 担当                                                                               |
| ---- | -------- | ---------------------------------------------------------------------------------- |
| 前段 | 非依存   | 設定解決、モデル値の検証、タイマー生成、キャンセルシグナルの合成、経路ラベルの決定 |
| 中段 | 依存     | CLI はコマンド構築・起動・標準出力の解釈。HTTP は URL 正規化・送信・本文の解釈     |
| 後段 | 非依存   | 「外部 abort をタイムアウトより優先する」判定、タイマーの解放                      |

**判定基準（AC-020 の合否）**: 次のいずれかが成立した場合、不適合とします。

1. タイマー生成またはキャンセル優先判定を、経路ごとに 2 箇所以上へ複製している
2. 中段の実装単位がモジュール外へ公開されている
3. 経路の判定が、CLI コマンド構築より後に行われている

1 を禁じるのは、複製された処理は片方だけ修正される事故を招き、REQ-F-007 / AC-008 が求める
「両経路で同一のセマンティクス」が保てなくなるためとします。
2 を禁じるのは、AI 実行以外の公開契約が増え、REQ-C-005 が避けようとした状態に近づくためとします。
3 を禁じるのは、llama が CLI コマンド名を持たず、コマンド構築の既定分岐が
未知モデルとして例外を投げるためとします（DR-02 / DR-10）。

<!-- impl-note: 具体名では、前段〜後段は runAI 本体、中段は _runViaCli / _runViaHttp にあたる。
     命名は同ファイル内の既存慣例（_buildCommand / _parseClaudeJson / _interpretClaudeOutput）に
     合わせ、_ 付き camelCase の module-private とする。中段には合成済みの AbortSignal を
     引数で渡す。判定基準 3 は「経路の判定を _buildCommand の呼び出しより前に行う」ことを指す。

     後段の例外メッセージは現在 _spec.command を埋め込んでいるが、HTTP 経路に command は
     存在しない。前段で経路ラベル（例: 'llama'）を決め、後段へ渡す必要がある。
     これを怠ると HTTP 経路の Aborted / TimedOut メッセージが空の識別子になる。 -->

### 4.2 文字符号化（経路横断）

次の規則は §4 の評価順序に含まれる 1 ステップではなく、Step 5（リクエスト構成）と
Step 7（レスポンス解釈）の双方に適用される横断規則です。

| Rule ID | Condition                                             | Outcome                                                                                                                                                               |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-008   | HTTP 経路でリクエストを送信し、その応答本文を読み取る | リクエストボディを UTF-8 で符号化し、`Content-Type: application/json; charset=utf-8` を送る。応答本文は UTF-8 として復号する。非 ASCII 文字が両方向で欠落・化けしない |

<!-- impl-note: 既存 CLI 経路は stdin/stdout のバイト列を TextEncoder / TextDecoder で
     UTF-8 として扱っており、HTTP 経路もこれと同じ符号化で揃える。charset を省略すると
     一部のサーバ実装がボディを別の符号化として解釈しうる。 -->

なお、サーバが `charset=utf-8` を尊重することは前提であって保証ではありません。
日本語チャットログが主対象である以上、非 ASCII の往復は REQ-F-016 の実測項目に含めます
（`specifications-structured-output.md` §4.2。codex explore A-02）。

---

### 4.3 サーバ位置値の受理条件（R-006 の判定対象）

DR-14 が確定した正規化規則は、query 文字列・フラグメント・userinfo を含む入力に対して
未定義のままでした（codex balanced M-03）。受理条件を次に閉じます。

| # | 条件                                                             | 判定                         |
| - | ---------------------------------------------------------------- | ---------------------------- |
| 1 | 未設定（キー省略または空文字列）                                 | 拒否                         |
| 2 | 絶対 URL でない（スキームを持たない、相対パス等）                | 拒否                         |
| 3 | スキームが `http` / `https` のいずれでもない（`ws` / `file` 等） | 拒否                         |
| 4 | query 文字列（`?`）を含む                                        | 拒否                         |
| 5 | フラグメント（`#`）を含む                                        | 拒否                         |
| 6 | userinfo（`user:pass@`）を含む                                   | 拒否                         |
| 7 | 上記のいずれにも該当しない                                       | 受理し、R-002 の正規化へ進む |

4〜6 を拒否する理由は次のとおりとします。R-002 の正規化は末尾セグメントの除去と
パスの連結だけを行うため、query やフラグメントを持つ値に対しては
`/v1/chat/completions?x=1` のような意味の定まらない URL を生成してしまいます。
userinfo は認証情報の送出にあたり、要件が Out of Scope に置いた事項（REQ-C-001 / §2 Assumptions）に
抵触します。R-006 の目的は「ネットワークアクセス前に設定ミスを診断する」ことであり、
いずれの入力も、受理するより拒否するほうが診断価値は高いといえます。

---

### 4.4 注入の観測点（R-005 の判定対象）

R-005 の「差を生じさせない」は、何を比較すれば差がないと言えるかを示さない限り
合否の線を引けません（codex fix TS-03）。観測点を次の 2 つとします。

| # | 観測点                                                                           |
| - | -------------------------------------------------------------------------------- |
| 1 | 組み立てられたリクエスト（URL、メソッド、ヘッダ、ボディの各フィールド）          |
| 2 | 応答を解釈した結果（呼び出し元へ返る文字列、または throw される分類と `detail`） |

検証は、同一の入力に対して注入あり・注入なしで 1 と 2 が一致することによって行います。
ただし注入なし側は実サーバを要するため、常に実行できるとは限りません。
その場合、検証範囲を「注入ありの経路が、注入なしの経路と同一のリクエスト構築処理と
応答解釈処理を通る」ことに限ってもかまいません。切り替え点は送信そのものだけとし、
構築と解釈を経路ごとに複製しないこと（R-010 の判定基準 1 と同じ理由による）。

---

## 5. Edge Cases

| Input                                                                                   | Classification                                                                                                         | REQ        | Rationale                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| サーバ位置は設定されているが、モデル値が llama prefix を持たない                        | HTTP 経路は選択されない                                                                                                | REQ-F-001  | 選択条件はモデル値の prefix のみであり、サーバ位置の設定有無は判定材料にしない                                |
| モデル値は llama prefix を持つが、サーバ位置が未設定（キー省略または空文字列）          | R-006 により `ChatlogError(kind: AiError, subindex: InvalidEndpoint)` を throw する（ネットワークアクセス前に検出）    | REQ-F-019  | 空・スキームなしの値でリクエストを試みると、原因の特定できない失敗になるため                                  |
| サーバ位置値が `http` / `https` 以外のスキームを持つ（`ws://` / `file://` 等）          | R-006 により設定エラーとして throw する（ネットワークアクセス前に検出）                                                | REQ-F-019  | スキームを問わず通すと、失敗が設定ミスか到達不能かを区別できず診断価値が失われるため                          |
| サーバ位置値が query 文字列・フラグメント・userinfo を含む（`http://h:8080/v1?x=1` 等） | R-006 により設定エラーとして throw する（§4.3 の受理条件 4〜6）                                                        | REQ-F-019  | R-002 の正規化は末尾セグメントの除去とパスの連結しか行わず、意味の定まらない URL を生成してしまう             |
| サーバが認証を要求し 401 / 403 を返す                                                   | HTTP 経路としては実行され、分類は `specifications-error-handling.md` R-007 が `BackendUnavailable`（中断）とする       | REQ-F-006  | §2.2 の「認証を要求しない」という前提が崩れた場合にあたる。設定を変えない限り後続もすべて失敗するため中断する |
| サーバ位置が末尾スラッシュあり／`/v1` あり／両方あり／両方なしの 4 通り                 | いずれも同一の正規 URL に解決される                                                                                    | REQ-F-015  | 表記ゆれの吸収は正規化規則の目的そのもの                                                                      |
| サーバ位置が到達不能なホストを指す場合と、404 を返すホストを指す場合                    | いずれも HTTP 経路としては実行される（結果の分類は本ファイルのスコープ外）                                             | REQ-F-001  | 到達可否・応答内容の解釈はレスポンス解釈側（`specifications-error-handling.md`）の責務                        |
| 成功ステータスの応答が `choices` を 2 要素以上含む                                      | R-007 により `choices[0]` のみを採用し、2 番目以降は無視する                                                           | REQ-F-017  | 呼び出し元へ返る値は単一のテキストであり、採用規則を定めないと実装ごとに解釈が分かれるため                    |
| タイムアウト値がゼロで、かつ外部キャンセルが発火する                                    | 外部キャンセルが優先して報告される                                                                                     | REQ-F-007  | 既存 CLI 経路と同一のキャンセル優先規則を維持するため                                                         |
| 外部キャンセルとタイムアウトが同一タイミングで発火する                                  | 外部キャンセルが優先して報告される                                                                                     | REQ-F-007  | 「外部から止めた」ことを「時間切れ」より優先して伝える既存規約を踏襲するため                                  |
| モデル値が 2 つ以上のスラッシュを含む                                                   | provider prefix 抽出の対象は本ファイルのスコープ外                                                                     | REQ-F-001  | prefix 解釈自体はバックエンド選択の前段（モデル名解決）の責務                                                 |
| system/user プロンプトが日本語（非 ASCII）を含み、応答本文も非 ASCII を含む             | R-008 により、リクエストは UTF-8 で符号化されて送られ、応答は UTF-8 として復号され、文字化け・欠落なく呼び出し元へ返る | REQ-NF-003 | チャットログ本文とプロンプトはいずれも日本語を含むため、往復の符号化が壊れると全経路が使えなくなる            |

---

## 6. Requirements Traceability

| Requirement ID | Spec Rule                                         | Notes                                                        |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| REQ-F-001      | R-001                                             | Backend selection がモデル値の prefix のみで HTTP 経路を選ぶ |
| REQ-F-002      | R-003                                             | system/user メッセージの分離送信                             |
| REQ-F-007      | R-004                                             | タイムアウト／AbortSignal セマンティクスの維持               |
| REQ-F-012      | R-005, §4.4                                       | fetch 呼び出しの注入可能性                                   |
| REQ-F-015      | R-002                                             | `llamaEndpoint` の URL 正規化                                |
| REQ-F-017      | R-007                                             | 複数 choices からの先頭要素の採用                            |
| REQ-F-019      | R-006, §4.3                                       | `llamaEndpoint` 未設定時のネットワークアクセス前の設定エラー |
| REQ-NF-001     | R-010, §4.1.1                                     |                                                              |
| REQ-C-006      | R-010, §4.1.1                                     |                                                              |
| REQ-NF-003     | R-008                                             | HTTP 経路における UTF-8 での符号化・復号（AC-021）           |
| REQ-F-018      | Covered in: `specifications-structured-output.md` | —                                                            |
| REQ-F-003      | Covered in: `specifications-structured-output.md` | —                                                            |
| REQ-F-004      | Covered in: `specifications-structured-output.md` | —                                                            |
| REQ-F-013      | Covered in: `specifications-structured-output.md` | —                                                            |
| REQ-F-016      | Covered in: `specifications-structured-output.md` | —                                                            |
| REQ-F-005      | Covered in: `specifications-error-handling.md`    | —                                                            |
| REQ-F-006      | Covered in: `specifications-error-handling.md`    | —                                                            |
| REQ-F-014      | Covered in: `specifications-error-handling.md`    | —                                                            |
| REQ-F-008      | Covered in: `specifications-config-packaging.md`  | —                                                            |
| REQ-F-009      | Covered in: `specifications-config-packaging.md`  | —                                                            |
| REQ-F-010      | Covered in: `specifications-config-packaging.md`  | —                                                            |
| REQ-F-011      | Covered in: `specifications-config-packaging.md`  | —                                                            |

---

## 7. Open Questions

> **Status**: COMPLETE

本ファイルの未決事項は下表のとおりすべて解決済みです。

| 旧 # | Question                                                                               | 解決                                                                                             |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | サーバ位置値の検証を設定読み込み時に行うか、リクエスト組み立ての直前で行うか           | llama 経路が選択された時点でネットワークアクセス前に行う（R-006 / REQ-F-019 / DR-12）            |
| 2    | HTTP 経路の `--allow-net` を無制限にするか、設定から得られるホスト・ポートに限定するか | 宛先を限定せず無制限に付与する（DR-13 / REQ-F-010。`specifications-config-packaging.md` が所有） |

<!-- impl-note (旧 Q#1): 設定スキーマの型語彙は 2 値のままとし（DD-01）、URL の検証・正規化は
     llama 経路側に置く。検証は R-006、正規化は R-002 が規定する。 -->

codex レビューで採り上げられ、本ファイルで結論を記録した論点を次に示します。

| 論点                                                                                                          | 結論                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サーバ位置値の query / フラグメント / userinfo の扱い                                                         | §4.3 で拒否に確定（balanced M-03 を採択）                                                                                                                                                                               |
| R-005「差を生じさせない」の観測点                                                                             | §4.4 で 2 点に確定（fix TS-03）                                                                                                                                                                                         |
| §4.1 末尾の実装ノートの規範性                                                                                 | REQ-NF-001 / REQ-C-006 に関わる部分を R-010 として本文へ昇格（balanced C-03。explore G-07 の据え置きは失効）                                                                                                            |
| `timeoutMs` の共有（DR-17）                                                                                   | 据え置き。判断材料が REQ-F-016 の実測に依存する。再検討トリガーは `decision-records.md` DR-17 に記録                                                                                                                    |
| `max_tokens` を送らない判断（DR-15 / R-009）                                                                  | 据え置き。同上。再検討トリガーは `decision-records.md` DR-15 に記録                                                                                                                                                     |
| 対象サーバの外部依存（バージョン・起動オプション・context size・`n_predict`・`response_format` の方言）の明示 | **見送り**。これらは REQ-F-016 の実測で判明する情報であり、実測前に spec で固定すると誤った前提を固めることになる（risk N-02）                                                                                          |
| `llama/<model>` の `<model>` が空文字・空白の場合の扱い                                                       | **見送り**。優先度が低いため仕様では規定せず、impl 段階の入力検証に委ねる。モデル値の解析は空文字列をモデル名として受理するため、サーバへ `model: ""` を送る経路が生じうる点を impl への申し送りとする（balanced S-01） |

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added, PATCH = clarification only -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial specification（split: transport）                                                                                                                                                                                                                                                                                                                   |
| 2026-09-02 | 1.1.0   | consistency レビュー所見を反映: R-006（llamaEndpoint 未設定の設定エラー、REQ-F-019）・R-007（複数 choices の採用規則、REQ-F-017）を追加、§7 の未決 2 件を解決済みへ、based-on を requirements v1.4.0 へ更新                                                                                                                                                 |
| 2026-09-02 | 1.1.1   | DR-07 削除に伴い DR-01 の記述へ統合、要件 v1.5.0 に追随                                                                                                                                                                                                                                                                                                     |
| 2026-09-02 | 1.2.0   | 要件 v1.5.0 の内容へ追随: R-008（UTF-8 符号化・復号、REQ-NF-003 / AC-021）を §4.2 に新設、§2.6 に DR-10 / DR-12 を追加、Edge Cases と Traceability に REQ-NF-003 を反映                                                                                                                                                                                     |
| 2026-09-02 | 1.3.0   | spec レビュー所見を反映: DR-14 により R-002 の正規化規則・R-006 の許容スキーム・R-001 の prefix 照合を確定、DR-15 により R-009（リクエストボディの閉じた集合）を追加、DR-17 により R-004 へタイムアウト共有を明記、§2.6 に DR-14 / 15 / 17 を追加、§6 の REQ-F-018 欠落を補完                                                                               |
| 2026-09-02 | 2.0.0   | codex レビュー所見を反映: DR-18 により R-006 の分類を `kind: AiError` へ再定義、§2.2 のモデル値の供給元を実態（オプションまたは設定）へ訂正、R-010 と §4.1.1（内部境界の構造と AC-020 の判定基準）を新設、§4.3（サーバ位置値の受理条件）と §4.4（注入の観測点）を新設、§4.1 の Step 4 を常時実行とし Step 7.5 を追加、R-009 の `response_format` を無条件へ |
| 2026-09-03 | 2.0.1   | 本文をですます体へ統一し textlint 指摘を解消（内容変更なし）                                                                                                                                                                                                                                                                                                |
