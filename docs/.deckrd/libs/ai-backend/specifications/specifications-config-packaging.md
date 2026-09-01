---
title: "Design Specification: LAN llama サーバの AI バックエンド化 — Configuration and Packaging"
based-on: requirements.md v1.6.0
status: Draft
version: 1.2.0
created: "2026-09-02"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

> Part of split specification. See specifications-index.md for full scope.

## 1. Overview

### 1.1 Purpose

本ファイルは、LAN 上の llama サーバへの AI バックエンド追加のうち、**設定とパッケージング** の
振る舞いを定義する。対象は、サーバ位置を指定する設定キーとその既定値、チャットログ取得元
（`agent`）と AI バックエンド（`model`）という 2 つの軸の分離、`--allow-net` をどの実行経路に
付与しどの経路には付与しないか、および共有ライブラリの配布ミラーへの同期義務とする。

### 1.2 Scope

This specification defines the **behavioral rules** and
**classification semantics** of LAN llama サーバの AI バックエンド化（設定・パッケージング部分）。

Implementation details are explicitly out of scope.

---

## 2. Design Principles

### 2.1 Classification Philosophy

本ファイルが扱う 4 つの関心事は、いずれも「実行前に確定しているべき静的な状態」を扱う点で共通する。
サーバ位置・モデル選択は `config.yaml` の読み込み時点で、権限付与は SKILL.md / `deno.json` の記述時点で、
ミラー同期は commit/push 時点で、それぞれ確定していなければならない。どの関心事でも、実行時の動的な決定に委ねる余地は
設けない。

### 2.2 Design Assumptions

- サーバ位置値は `config.yaml` からのみ供給される。環境変数・CLI フラグ経路は存在しない
- モデル値の供給元は、呼び出し時のオプションまたは `config.yaml` の 2 つとする。
  オプションが指定されていればそれを優先する。本ファイルが規定するのは `config.yaml` 側の
  設定キーとしての扱いであり、供給元の優先順位そのものは既存 CLI 経路と共通で、
  llama 経路の追加によって変えない（codex consistency D-04 / E-02）
- 設定スキーマのフィールド型語彙は `text` と `number` の 2 種類のみであり、本仕様のために URL 専用の
  型を新設しない
- 既知キーには必ず既定値が対応しており、未指定時の参照は失敗しない
- `agent`（エクスポート元エージェント）と AI バックエンドの選択は互いに独立した軸であり、
  一方の値がもう一方の選択肢集合に影響しない
- 共有ライブラリ（`skills/_cle-libs/**`）は `skills/setup-chatlogs/assets` 配下へバイト同一のミラーを
  持ち、この同期は commit/push フックにより強制される

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit                          | Responsibility                                                                      | REQ Coverage |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| Endpoint configuration key    | `llamaEndpoint` を既知の設定キーとして受理し、既定値を保証する                      | REQ-F-008    |
| Agent/backend axis separation | `agent` の選択肢一覧に llama を混在させず、AI バックエンド選択は `model` のみで行う | REQ-F-009    |
| Network permission scoping    | AI を呼ぶ実行経路にのみ `--allow-net` を付与し、AI を呼ばない経路には付与しない     | REQ-F-010    |
| Distribution mirror sync      | 変更が入った共有ライブラリ・設定・タスク定義を配布ミラーへ同期する義務を維持する    | REQ-F-011    |

#### Unit Interaction Map

```text
+--------------------------+     +------------------------------+
| Endpoint configuration   |     | Agent/backend axis           |
| key                      |     | separation                   |
+--------------------------+     +------------------------------+

+--------------------------+     +------------------------------+
| Network permission       |     | Distribution mirror sync     |
| scoping                  | --> | (change in any of the above  |
|                          |     |  three units triggers sync)  |
+--------------------------+     +------------------------------+
```

Endpoint configuration key と Agent/backend axis separation は互いに独立している。Network permission
scoping も両者から独立して決まる（実行コマンドの記述はソースコード変更ではなく SKILL.md/`deno.json`
の記述にとどまる）。Distribution mirror sync のみ、他の 3 ユニットのうち共有ライブラリ・設定ファイルに
及ぶ変更（Endpoint configuration key、および Network permission scoping のうち `deno.json` 該当行）を
下流に持つ。

#### Data Flow Diagram

```text
[config.yaml 記述] --> [Endpoint configuration key] --> [設定解決の結果]

[config.yaml 記述] --> [Agent/backend axis separation] --> [agent 選択肢 / model 選択肢]

[SKILL.md / deno.json 記述] --> [Network permission scoping] --> [deno run 実行時の権限]

[共有ライブラリ / 設定 / deno.json への変更] --> [Distribution mirror sync] --> [setup-chatlogs/assets 配下の複製]
```

<!-- ASCII diagrams only. Mermaid, PlantUML, and SVG are prohibited. -->

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- 環境変数・CLI フラグによる接続先指定は行わない ← REQ: Out of Scope #1
- LAN サーバへの認証（API キー / Bearer token）の送出は行わない ← REQ: Out of Scope #2
- プロンプト（`.config/chatlog-exporter/prompts/*.yaml`）のバックエンド別 variant 作成は行わない ← REQ: Out of Scope #4
- 既存 5 バックエンド（claude / codex / copilot / opencode / antigravity）の動作・既定モデルの変更は行わない ← REQ: Out of Scope #5

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                  | Rationale                                                                                                       | Affected Rules | Status |
| ----- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| DD-01 | `llamaEndpoint` は既存の型語彙（`text`/`number`）の範囲内で表現し、URL 専用型は新設しない                 | 設定スキーマの型語彙拡張は本スコープの目的（バックエンド追加）を超える変更になるため                            | R-001          | Active |
| DD-02 | `agent` の選択肢一覧を変更せず、llama は `model` の provider prefix としてのみ表現する                    | `agent`（エクスポート元）と AI バックエンドは意味的に独立した軸であり、混在させると設定の意図が読み取れなくなる | R-002          | Active |
| DD-03 | `--allow-net` は AI を呼ぶ実行経路にのみ付与し、AI を呼ばない経路（noise-filter・strip 等）には付与しない | 不要な権限拡大を避けるため。現行リポジトリに `--allow-net` は 1 箇所も存在しない                                | R-003          | Active |
| DD-04 | 本仕様が対象とする変更（共有ライブラリ・設定・`deno.json`）はすべて既存のミラー同期義務の対象とする       | 既存の commit/push フックによる同期強制の仕組みを流用し、新たな同期機構を作らない                               | R-004          | Active |
| DD-05 | `llamaEndpoint` の既定値は空文字列とする                                                                  | 「キー省略」と「空文字列の明示」が同一の値に収束し、両者を REQ-F-019 の設定エラーとして単一の分岐で扱えるため   | R-001          | Active |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                     | Phase | Impact on This Spec                                                                     |
| ----- | ------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする               | spec  | Agent/backend axis separation が `agent` 選択肢を変更しないことの根拠                   |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する | spec  | Endpoint configuration key / Agent/backend axis separation の入力源と表現形式を規定する |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                            | spec  | R-003 / DD-03 が付与するフラグを宛先限定なしとすることの根拠                            |

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

- Input Type: `config.yaml` に記述される `llamaEndpoint` キーと `agent`/`model` キーの値、
  および SKILL.md / `deno.json` に記述される `deno run` の権限フラグ行
- Assumptions:
  - `llamaEndpoint` は文字列値として与えられ、既存の型語彙（`text`）の範囲で扱われる
  - `llamaEndpoint` の既定値は空文字列であり、キーが省略された場合はこの値が解決される（DD-05）
  - `agent` の値は llama を含まない既存の選択肢集合から選ばれる
  - `deno run` の記述対象となる各エントリスクリプトは、AI を呼ぶか呼ばないかのいずれかに
    静的に分類できる

### 3.2 Output Semantics

- Output Meaning: 設定読み込み結果としての `llamaEndpoint` の値（または既定値）、`agent`/`model` の
  互いに独立な選択結果、各実行経路に付与される権限フラグの集合、および共有ライブラリと配布ミラーの
  内容一致
- Possible Outcomes:
  - `llamaEndpoint` が既知キーとして受理され、値または既定値（空文字列）が取得できる。
    値の妥当性検証は本ファイルの対象外であり、llama 経路の選択時に行われる（REQ-F-019）
  - `agent` の選択肢一覧に llama が現れず、`model` の選択に `agent` の値が影響しない
  - AI を呼ぶ実行経路には `--allow-net` が付与され、AI を呼ばない実行経路には付与されない
  - 共有ライブラリ・設定・`deno.json` の変更が配布ミラーへ同期され、差分検査が成功する

---

## 4. Decision Rules

<!-- impl-note: 「AI を呼ぶ経路」は runAI を呼び出す経路を指す。判定対象は各 SKILL.md の
     deno run 記述行に加え、AI を直接呼ぶエントリスクリプトの shebang 行も含む。
     「設定の読み込み」は GlobalConfig。 -->

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
-->

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                                                                       | Outcome                                                                                                                                                                                                   |
| ------- | ---: | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001   |    1 | `config.yaml` が `llamaEndpoint` を含む、または含まない                                                                         | 既知キーとして受理し、値が指定されていれば取得し、指定されていなければ既定値を用いる。いずれの場合も未知キーエラーにはならない                                                                            |
| R-002   |    2 | `config.yaml` が `agent` および `model` を含む                                                                                  | 両キーは互いに独立に解決される。`model` に `llama/<model>` が指定されても `agent` の選択肢一覧・意味には変化がなく、逆方向の影響も生じない                                                                |
| R-003   |    3 | ある実行記述（各 SKILL.md の `deno run` 行、および AI を直接呼ぶエントリスクリプトの shebang 行）が AI を呼ぶ経路であるかどうか | 呼ぶ経路には `--allow-net` を含む権限フラグ集合を与え、呼ばない経路には `--allow-net` を含めない                                                                                                          |
| R-004   |    4 | 共有ライブラリ・設定ファイル・`deno.json` のいずれかに変更が生じている                                                          | `skills/setup-chatlogs/assets` 配下の複製へ同期し、内容ベースの差分検査が差分なしで成功する状態を維持する。差分検査の手段は AC-012 が名指しする `bash scripts/sync-skill-assets.sh --check-staged` とする |

No reordering is permitted.

---

## 5. Edge Cases

| Input                                                                                        | Classification                                                                                  | REQ       | Rationale                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `config.yaml` に `llamaEndpoint` が一切記述されていない                                      | 未知キーエラーにはならず、既定値（空文字列）が使われる。設定読み込み自体は成功する              | REQ-F-008 | 「既知キーには必ず既定値が対応する」という既存の設定解決の不変条件を llama 追加後も保つため                                    |
| `llamaEndpoint` に空文字列が明示的に指定されている                                           | 設定読み込み自体は成功する。キー省略時と同じ値に収束し、以降は REQ-F-019 が設定エラーとして扱う | REQ-F-008 | 値の妥当性（絶対 URL であること等）の検証は本ファイルのスコープ外であり、`specifications-transport.md` が扱う                  |
| `agent: chatgpt` と `model: llama/qwen3-14b` が同時に指定されている                          | `agent` は chatgpt のまま、`model` は llama バックエンドとして解決される                        | REQ-F-009 | 2 つの軸は独立であり、一方の値がもう一方の解釈に影響しない                                                                     |
| `agent` の選択肢一覧を列挙する箇所が将来変更される                                           | 一覧に llama が追加されていないことをもって適合と判定する                                       | REQ-F-009 | llama は AI バックエンド軸の値であり、エクスポート元エージェント軸の値ではない                                                 |
| AI を呼ばない `deno run` 行（noise-filter・strip 等）に誤って `--allow-net` が付与されている | 不適合（過剰な権限付与）と判定する                                                              | REQ-F-010 | 不要な権限拡大を避けるという設計原則に反するため                                                                               |
| AI を呼ぶエントリスクリプトの shebang 行にネットワーク権限フラグが欠けている                 | 不適合と判定する。SKILL.md の `deno run` 例示行だけでなく shebang 行も対象に含める              | REQ-F-010 | shebang を持つエントリスクリプトは共有ライブラリの外にあり、ミラー同期の対象にも含まれない独立した記述点であるため             |
| `deno run ... "$SCRIPT_PATH"` のようにフラグ列を省略した SKILL.md の例示行                   | 判定対象外とする。`--allow-net` の有無で適合・不適合を判定しない                                | REQ-F-010 | 省略記法の行はフラグ集合そのものを記述していないため、権限の過不足を判定する材料にならない（要件 v1.5.0 REQ-F-010 の除外規定） |
| 共有ライブラリに変更があるが、配布ミラーへの同期が行われていない                             | 同期チェックは差分ありで失敗する                                                                | REQ-F-011 | commit/push フックが強制する既存の同期機構をそのまま適用するため                                                               |

---

## 6. Requirements Traceability

| Requirement ID | Spec Rule                                         | Notes                                        |
| -------------- | ------------------------------------------------- | -------------------------------------------- |
| REQ-F-008      | R-001                                             | `llamaEndpoint` 設定キーの追加と既定値の保証 |
| REQ-F-009      | R-002                                             | `agent` キーと AI バックエンド軸の分離       |
| REQ-F-010      | R-003                                             | AI 経路への `--allow-net` 限定付与           |
| REQ-F-011      | R-004                                             | 配布ミラーへの同期義務                       |
| REQ-F-017      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-019      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-NF-003     | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-018      | Covered in: `specifications-structured-output.md` | —                                            |
| REQ-F-001      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-002      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-007      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-012      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-015      | Covered in: `specifications-transport.md`         | —                                            |
| REQ-F-003      | Covered in: `specifications-structured-output.md` | —                                            |
| REQ-F-004      | Covered in: `specifications-structured-output.md` | —                                            |
| REQ-F-013      | Covered in: `specifications-structured-output.md` | —                                            |
| REQ-F-016      | Covered in: `specifications-structured-output.md` | —                                            |
| REQ-F-005      | Covered in: `specifications-error-handling.md`    | —                                            |
| REQ-F-006      | Covered in: `specifications-error-handling.md`    | —                                            |
| REQ-F-014      | Covered in: `specifications-error-handling.md`    | —                                            |

---

## 7. Open Questions

> **Status**: COMPLETE

本ファイルの未決事項は下表のとおりすべて解決済み。

| 旧 # | Question                                                                             | 解決                                                                                                        |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1    | `--allow-net` を無制限とするか、設定から得られるホスト・ポートに限定するか           | 宛先を限定せず無制限に付与する（DR-13 / REQ-F-010）。接続先が実行時にしか判明しないため静的な限定は取れない |
| 2    | `llamaEndpoint` の値検証を設定の読み込み時点で行うか、エンドポイント解決側に委ねるか | 設定読み込みは無検証で通し、llama 経路の選択時にネットワークアクセス前で検証する（REQ-F-019 / DR-12）       |
| 3    | `--allow-net` の判定対象にエントリスクリプトの shebang 行を含めるか                  | 含める。要件 v1.6.0 の REQ-F-010 が対象表に shebang 行を加え、本ファイル R-003 / §5 と一致した              |

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added, PATCH = clarification only -->

| Date       | Version | Description                                                                                                                                                                              |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial specification                                                                                                                                                                    |
| 2026-09-02 | 1.1.0   | consistency レビュー所見を反映: `llamaEndpoint` の既定値を空文字列と明記（DD-05）、値検証の責務を REQ-F-019 側と明示、§7 の未決 2 件を解決済みへ、based-on を requirements v1.4.0 へ更新 |
| 2026-09-02 | 1.1.1   | 要件 v1.5.0 に追随（based-on 更新）                                                                                                                                                      |
| 2026-09-02 | 1.1.2   | 要件 v1.5.0 の内容へ追随: §2.6 に DR-13 を追加、REQ-F-010 が追記したフラグ列省略の例示行の除外規定を Edge Cases に反映                                                                   |
| 2026-09-02 | 1.1.3   | spec レビュー所見を反映: R-003 の判定対象に shebang 行を明記（§5 が既に持つ規範を規則本文へ）、§6 の欠落 4 件を補完、サーバ位置を指す語を統一                                            |
| 2026-09-02 | 1.2.0   | codex レビュー所見を反映: §2.2 のモデル値の供給元を実態（オプションまたは設定）へ訂正、R-004 の差分検査手段を AC-012 への参照として明示、§7 に shebang 行の論点を解決済みとして追加      |
