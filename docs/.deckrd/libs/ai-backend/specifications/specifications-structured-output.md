---
title: "Design Specification: 構造化出力の強制（llama バックエンド）"
based-on: requirements.md v1.6.0
status: Draft
version: 2.1.0
created: "2026-09-02"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

> Part of split specification. See specifications-index.md for full scope.

## 1. Overview

### 1.1 Purpose

本仕様は、llama バックエンド経由で構造化出力（`response_format` / json_schema）を強制する際の
挙動を定義する。対象は、スキーマ生成規則（数量制約の禁止、enum フォールバック値の必須化）、
空配列パースの正常系扱い、および実装着手前に実施すべきサーバ実測ゲートとする。

### 1.2 Scope

本仕様は、**構造化出力の強制** に関する振る舞い上の規則と分類意味論を定義する。

対象は次の 4 点に限定する。

- `response_format`（json_schema）ブロックの生成規則とその適用条件（YAML 契約の呼び出し元を含む）
- スキーマに数量制約を含めない規則、および enum フォールバック値の必須化
- AI 応答が正当な空配列である場合のパース結果
- `response_format` 実装着手前に実施する実機実測ゲート

実装の詳細（関数名・型定義・ファイル配置）は対象外とする。
HTTP 接続・エンドポイント正規化・エラー分類・タイムアウトは対象外とし、それぞれ
`specifications-transport.md` / `specifications-error-handling.md` を参照する。

---

## 2. Design Principles

### 2.1 Classification Philosophy

ローカル LLM は指示追従能力が Anthropic 系モデルより低く、プロンプトのみで JSON 出力形式を
強制することは信頼できない。そのため、llama バックエンドに限り出力形式そのものをサーバ側の
機能（`response_format`）で強制し、呼び出し元が指定した出力契約をスキーマとして明示する。ただし、スキーマ強制はサーバ実装ごとの対応レベルに差があり得るため、
「強制した」という事実だけで安全とはみなさず、実測（REQ-F-016）とパース側の頑健化
（REQ-F-013）の両輪で担保する。

### 2.2 Design Assumptions

- 対象サーバは OpenAI 互換 `response_format`（json_schema）を実装しているとみなすが、
  対応レベル（厳密な `strict` 準拠、root スキーマ制約、未対応時の挙動）は実装依存であり、
  実測するまで確定しない。
- 出力契約の指定は `runAI` 呼び出し単位で行う。対象はスキルではない。現行の呼び出しは
  6 箇所あり、契約は次の 3 種に限られる（REQ-F-018 / DR-19）。
  - `json-array` — JSON 配列。3 箇所（classify-chatlogs / filter-chatlogs / normalize-chatlogs）
  - `yaml` — YAML 契約。2 箇所（set-frontmatter の frontmatter 生成と review）。
    この 2 箇所は必須キーが一致しないため、契約タグだけではスキーマが決まらない（§4.3.1）
  - `line-prefixed` — 行前置テキスト。1 箇所（set-frontmatter の type / category 判定）
- 「JSON オブジェクト」を独立した契約として数えない。呼び出し元が 1 つも存在しないためとする。
  将来 object を直接受け取る呼び出し元が現れた場合は、その時点で契約を追加する。
- 配列を直接 json_schema の root にはせず、オブジェクト envelope に包んでから通信し、
  受信後に呼び出し元へ返す前に展開する（CONFIRMED DESIGN の invariant）。
- on-wire は 3 契約すべてで JSON とする。YAML や行前置テキストをサーバに直接生成させることはしない。
  受信後に、呼び出し元が既存の CLI 経路で受け取るのと同じ文字列表現へ復元する（R-007 / DR-19）。
- ローカルモデルは「該当項目なし」を表現する語彙を持たないことがあるため、enum には常に
  フォールバック値を用意し、モデルが正しく「無し」と答えられるようにする。

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit                           | Responsibility                                                                                 | REQ Coverage                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| Schema construction            | 呼び出し元が指定した出力形状を、数量制約なし・enum フォールバック付きの json_schema に変換する | REQ-F-003, REQ-F-004, REQ-F-018 |
| Empty-array acceptance         | 応答テキストが正当な空配列である場合にパース成功として扱う                                     | REQ-F-013                       |
| YAML contract conversion       | YAML 契約を期待する呼び出し元に対し、受信した JSON を既存の YAML 契約の形へ変換して返す        | REQ-F-018                       |
| Compatibility measurement gate | 実装着手前に対象サーバの `response_format` 対応を実測し、結果を記録する                        | REQ-F-016                       |

#### Unit Interaction Map

```text
+----------------------------+
| Compatibility measurement  |
| gate (pre-implementation)  |
+----------------------------+
              |
              v
+----------------------+     +--------------------------+
| Schema construction  | --> | (Request composition —   |
|                       |     |  see specifications-     |
|                       |     |  transport.md)           |
+----------------------+     +--------------------------+

+----------------------------+
| Empty-array acceptance     |
| (independent of the above; |
|  applies to CLI backends   |
|  as well)                  |
+----------------------------+
```

Schema construction と Empty-array acceptance は互いに独立している。measurement gate は
Schema construction（および response_format 適用そのもの）の実装着手前に一度だけ完了して
いればよく、実行時の呼び出し順序には現れない。

#### Data Flow Diagram

```text
[Caller-supplied output shape]
        |
        v
[Schema construction] --> [response_format block: object envelope,
                            no minItems/maxItems, enum + fallback]
                                        |
                                        v
                    (handed to request composition; see specifications-transport.md)


[Raw assistant text] --> [Empty-array acceptance] --> [Parsed result: empty array | non-empty array]
                                        |
                                        v
                              [Parse failure: text is not valid JSON array]
```

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- 既存 CLI バックエンド（claude / codex / copilot / opencode / antigravity）への
  `response_format` 相当のスキーマ強制の適用 ← REQ: Out of Scope（REQ-C-004 に対応）
- 構造化出力専用の公開関数群を新設し、AI 実行の公開シグネチャを全面刷新すること
  ← REQ: Out of Scope（REQ-C-005 に対応）
  <!-- impl-note: 設計ノート §4 が提案する runAIStructuredObject / runAIStructured の全面導入、
       および runAI 公開シグネチャの刷新を指す。 -->
- 接続失敗時のリトライおよび既存バックエンドへのフォールバック ← REQ: Out of Scope
  （本ファイルの対象外事項だが、スキーマ強制が失敗した場合も同様にリトライ・フォールバックは
  行わない）
- 応答に対するフル JSON Schema validation、およびそのための validator ライブラリの導入
  ← DR-19 Non-Goal。§4.1 が規定する検証は契約ごとの最小構造検証（on-wire contract validation）に
  留める。Deno に validator は組み込まれておらず、依存を JSR の 3 パッケージ
  （`@std/yaml` / `@std/assert` / `@std/testing`）のみに保つ方針を崩さないためとする。
  必要になった時点で依存追加の DR を切る

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                               | Rationale                                                                                                          | Affected Rules      | Status           |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------- |
| DD-01 | json_schema には `minItems` / `maxItems` 等の数量制約を一切含めない                    | 数量制約を付けると入力が黙って破棄される既知の不具合がある                                                         | R-002               | Promoted → DR-04 |
| DD-02 | enum には常に「該当なし」を表すフォールバック値を含める                                | ローカルモデルが「無し」を正しく表現できない場合に誤った値を選ばせないため                                         | R-003               | Promoted → DR-04 |
| DD-03 | 共有の配列パーサは空配列を成功として扱い、パース不能とは区別する                       | ローカルモデルは正当な空配列を返しやすく、従来の実装はこれを失敗と誤判定していた                                   | R-004, R-005        | Promoted → DR-06 |
| DD-04 | `response_format` の実装着手前に対象サーバで実測を行い、結果を仕様へ反映する           | 「OpenAI 互換」は対応レベルを保証しない。実測なしに実装すると差異を吸収する場所がなくなる                          | R-006               | Promoted → DR-09 |
| DD-05 | YAML 契約の呼び出し元も `response_format` の対象とし、受信 JSON を YAML 契約へ変換する | YAML 出力だけスキーマ強制から漏れると、DR-04 が前提とする「強制なしでは実用にならない」が set-frontmatter で崩れる | R-001, R-007        | Promoted → DR-11 |
| DD-06 | 出力契約を呼び出し単位で 3 種に確定し、応答検証は契約ごとの最小構造検証に留める        | 単一応答から黙殺は断定できず、フル JSON Schema validation は依存方針に反する                                       | R-001, R-007, R-008 | Promoted → DR-19 |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                | Phase | Impact on This Spec                                              |
| ----- | -------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| DR-04 | `response_format`（json_schema）による構造化出力をスコープに含める   | spec  | Section 3・4 の response_format 適用条件とスキーマ生成規則の根拠 |
| DR-06 | 既知の周辺不具合を本スコープで併せて直す                             | spec  | Section 4 の空配列パース規則（R-004, R-005）の根拠               |
| DR-09 | 「OpenAI 互換」を実測ゲート（REQ-F-016）で裏付ける                   | spec  | Section 4 の測定ゲート規則（R-006）と Section 4.1 の分岐の根拠   |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める | spec  | Section 4 の R-001 の適用条件拡張と R-007（YAML 契約変換）の根拠 |
| DR-15 | リクエストボディを閉じた集合とし、切り詰め応答を失敗として分類する   | spec  | R-001 の適用条件を無条件へ単純化することの根拠                   |
| DR-18 | 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける | spec  | R-008 が投げる `ResponseSchemaViolation` を続行側に置く根拠      |
| DR-19 | 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま復元する   | spec  | §2.2 の 3 契約、R-001 の無条件適用、R-007 の復元先、§4.3 の根拠  |

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

- Input Type: (a) 呼び出し元が指定する出力形状（配列・オブジェクト・YAML 契約の形を表す記述）、
  (b) llama サーバからの生のアシスタント応答テキスト
- Assumptions: 出力形状の指定は llama バックエンド選択時のみ意味を持つ。応答テキストの
  パースは llama / 既存 CLI バックエンド双方に共通して適用される（Empty-array acceptance は
  バックエンドを問わない）。

### 3.2 Output Semantics

- Output Meaning: (a) リクエストボディに含める `response_format` ブロック、
  (b) パース結果としての配列（空を含む）またはパース失敗
- Possible Outcomes:
  - `response_format` ブロックが数量制約なし・フォールバック付き enum で生成される
  - YAML 契約を期待する呼び出し元には、受信 JSON が既存の YAML 契約の形へ変換されて返る
  - 応答テキストが正当な空配列であればパース成功として空配列を返す
  - 応答テキストが JSON として解釈不能であればパース失敗として扱われる（従来どおり）

---

## 4. Decision Rules

<!-- impl-note: 「共有の配列パーサ」は _cle-libs/libs/text/json-utils.ts の
     parseAiJsonArray を指す。空配列の受理は直接パース段でのみ行い、括弧マッチ段は現状の
     「空配列は失敗」を維持する。段全体で緩めると散文中の無関係な括弧対を配列として拾う。 -->

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
-->

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                        | Outcome                                                                                                                                                                                                                                                                                          |
| ------- | ---: | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-001   |    1 | llama バックエンドが選択されている                                               | 呼び出し元が指定した出力契約から json_schema を構築し、`response_format` としてリクエストボディに含める。3 契約（`json-array` / `yaml` / `line-prefixed`）のいずれも除外しない。出力契約を指定しない llama 呼び出しは想定しない（REQ-F-003 / DR-19）                                             |
| R-002   |    2 | R-001 が成立し、スキーマを構築する                                               | 生成する json_schema のどの深さにも `minItems` / `maxItems` 等の数量制約を含めない                                                                                                                                                                                                               |
| R-003   |    3 | R-001 が成立し、スキーマに enum を含む                                           | 各 enum に「該当なし」を意味するフォールバック値を必ず 1 つ含める                                                                                                                                                                                                                                |
| R-008   |    4 | R-001 が成立し、サーバから 2xx 応答の本文を取得した                              | 応答本文に対し §4.1 が定める on-wire contract validation を行う。適合しない場合は `ChatlogError(kind: AiError, subindex: ResponseSchemaViolation)` を throw する（続行側。`specifications-error-handling.md` §3.2 が分類を所有する）                                                             |
| R-007   |    5 | R-001 が成立し、応答が R-008 の検証を通過した                                    | 受信した JSON を、呼び出し元が既存の CLI 経路で受け取るのと同じ文字列表現へ復元して返す。`runAI` の戻り値は文字列のままとし、結果オブジェクトへは変えない（REQ-C-005 / DR-19）。復元先は §4.3 の表が契約ごとに定める                                                                             |
| R-004   |    6 | 共有の配列パーサが呼び出され、対象テキストが構文的に有効な空配列である           | 例外を投げず、空配列を成功結果として返す                                                                                                                                                                                                                                                         |
| R-005   |    7 | 対象テキストが JSON として解釈不能である（空配列ではなく、パース自体に失敗する） | 従来どおりパース失敗として扱う。R-004（空配列成功）と明確に区別する                                                                                                                                                                                                                              |
| R-006   |  N/A | REQ-F-003（response_format の実装）に着手する前                                  | 対象 LAN llama サーバ実装に対し、§4.2 が定める 3 種のスキーマそれぞれについて `response_format` 付きリクエストを 1 回以上実測し、(a) スキーマ準拠 JSON が返るか、(b) 返らない場合の挙動（無視 / 400 / 別形式）を記録し、その結果を本仕様の Section 4.1.1 および Section 7 へ反映してから着手する |

この順序宣言の射程は、R-001〜R-005・R-007・R-008 という実行時の規則だけとする。
Step 4〜7 の並びは `specifications-transport.md` §4.1 の Step 7.5（検証と復元）→ Step 8（パース）に対応する。
R-007 が復元した文字列を呼び出し元のパーサが読むため、復元は必ずパースより前に評価される。
R-006 は実装着手前のゲートであり、§2.3 が述べるとおり実行時の呼び出し順序には現れない。
そのため評価順序から外し、Step 欄を `N/A` とする。
実行時の単位間の結合順序は `specifications-transport.md` §4.1 が唯一の正である（consistency E-04）。

---

### 4.1 on-wire contract validation（R-008 の検証内容）

サーバが `response_format` を黙殺したかどうかを、**単一のレスポンスから断定してはならない。**
1 回の応答から観測できるのは HTTP ステータス・`content`・`finish_reason`・送信した `response_format`・
JSON パースの可否・契約への適合の 6 点に限られ、「サーバが黙殺した」ことと
「モデルがたまたま契約に合わない出力をした」ことを区別できないためとする（codex consistency §3.1）。
黙殺の判定は REQ-F-016 の測定結果として扱い、実行時の分類名には用いない。
したがって実行時の分類名を `ResponseFormatIgnored` としてはならない（DR-16 決定 3 の撤回を参照）。

R-008 が行うのは、フル JSON Schema validation ではなく契約ごとの最小構造検証とする。

| 契約            | 検証内容                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| 共通            | 応答本文が JSON として parse できる                                                                       |
| `json-array`    | root が object であり、envelope フィールドが存在し、その値が配列である                                    |
| `yaml`          | root が object であり、§4.3.1 が当該呼び出し元に定める required keys がすべて存在し、各値が同表の型である |
| `line-prefixed` | root が object であり、§4.3.1 が定める required keys がすべて存在し、各値が文字列である                   |
| enum を含む場合 | 当該フィールドの値が §4.3.1 が定める値域の許容値、またはフォールバック値のいずれかである（R-003）         |

いずれかに適合しない場合、R-008 は `ResponseSchemaViolation` を throw する。
これは続行側の分類であり、当該呼び出しのみを失敗として記録し、一括処理は続行する
（REQ-F-006 / DR-18）。単一応答の不適合はバックエンドが使えないことを意味しないためとする。

### 4.1.1 実測結果に応じた分岐先（REQ-F-016 の帰結）

R-006 の実測が完了するまで、次の 3 つの結果それぞれに対する最終的な扱いは確定していない。
本仕様は 3 分岐すべての振る舞いを定義する。ただし、**「スキーマ強制が効かないまま
通常運転を続ける llama 経路」は、いずれの分岐でも許容しない**。これは REQ-F-003 が
「構造化出力を強制する」ことを目的としており、強制なしの運転はその目的を満たさないためとする。

| 実測結果                 | 本仕様が確定させている点                                                                                           | 未確定の点                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 準拠（honoured）         | llama 経路を通常どおり有効にする                                                                                   | なし                      |
| 黙殺（silently ignored） | 当該サーバ実装を対応対象外とする。実行時には R-008 が個々の応答を不適合として `ResponseSchemaViolation` に分類する | なし（REQ-F-016 / DR-09） |
| 拒否（rejected）         | HTTP エラーとして扱う。`response_format` の拒否と判別できた場合は `ResponseFormatRejected`（中断側）               | なし。同上                |

黙殺・拒否が実測されたサーバ実装は対応対象外とする。スキーマ強制なしの degraded 運転は
選択肢として提供しない（REQUIREMENTS §1.2 Out of Scope / REQ-F-016）。
実測の完了をもって、本節の表と Section 5 の該当行を「どの分岐に着地したか」の記録へ書き換える。

---

### 4.2 R-006 が実測すべきスキーマ（AC-016 の合格基準）

R-006 の実測は、次の 3 種のスキーマそれぞれについて **1 回以上** 行う。1 種でも欠けた状態、
または 1 種でもスキーマどおりの JSON が返らない状態では、当該サーバ実装を対応対象外とする
（REQ-F-016 / AC-016 / DR-09）。

| # | スキーマ種別               | 代表する呼び出し元の出力契約                            | 検証したい性質                                              |
| - | -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| 1 | 配列を包む object envelope | JSON 配列（classify / filter / normalize）              | root を object に固定したうえで配列フィールドが返ること     |
| 2 | enum を含む object         | 語彙制約付きの分類結果（辞書由来の category / tags 等） | enum の値域が守られ、フォールバック値が選択肢として働くこと |
| 3 | YAML 契約に対応する object | YAML 契約（set-frontmatter、REQ-F-018 / DR-19）         | 変換前の JSON が YAML 契約の全フィールドを満たすこと        |

各実測について、(a) スキーマどおりの JSON が返ったか、(b) 返らない場合の挙動
（無視 / 400 / 別形式）の 2 点を記録する。記録先は Section 4.1.1 の表とする。

3 種のスキーマそれぞれについて、次の 4 条件を 1 回以上ずつ通す。
「3 種 × 各 1 回」では、実運用で遵守率が落ちる条件を捕まえられないためとする（codex risk §3.3）。

| 条件          | 内容                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| モデル差      | 運用候補のモデルを 2 種以上（量子化レベルの違いを含む）                                               |
| 長文入力      | 実運用のチャンク上限に近い入力長（遵守率が落ちるのは短文ではなく長文である）                          |
| enum 境界     | 正解がフォールバック値のみになる入力（R-003 の目的が満たされるか）                                    |
| 非 ASCII 往復 | 日本語を含む入力と出力（REQ-NF-003 / AC-021。`charset=utf-8` を尊重するかは前提であって保証ではない） |

各条件で「スキーマどおりの JSON が返った割合」を記録する。1 回でも準拠したことをもって
合格とはしない。長文時に恒常的に崩れる実装は対応対象外とする。

---

### 4.3 スキーマ契約と復元先（R-002 / R-003 / R-007 の具体）

R-002 / R-003 は「数量制約を含めない」「enum にフォールバック値を含める」という制約だけを述べており、
実際にどのスキーマを作れば仕様に適合するかを判定できない。次を契約とする（codex balanced C-02）。

| 項目                       | 規則                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root                       | 常に object とする。配列を root に置かない                                                                                                                                  |
| envelope フィールド名      | `json-array` 契約では `items` とする                                                                                                                                        |
| `required`                 | スキーマが定義するプロパティをすべて `required` に含める。省略可能なプロパティを作らない                                                                                    |
| `additionalProperties`     | 常に `false` とする                                                                                                                                                         |
| nullable                   | `type` に `"null"` を併記しない。「該当なし」は enum のフォールバック値で表現する（R-003）                                                                                  |
| 数量制約                   | どの深さにも置かない（R-002）                                                                                                                                               |
| `yaml` 契約のキー集合      | §4.3.1 の契約定義表が呼び出し元ごとに定める required keys と完全一致させる。`extractYaml` の第 2 引数は起点キーであり必須キーの一覧ではないため、これを根拠にしてはならない |
| `line-prefixed` のキー集合 | §4.3.1 の契約定義表が定める required keys と完全一致させる（呼び出し元が行頭前方一致で探すキー）                                                                            |

R-007 が復元する文字列表現は契約ごとに次のとおりとする。

| 契約            | 復元先の文字列表現                                                      | 呼び出し元の既存パーサ       |
| --------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `json-array`    | envelope を展開し、`items` の値を JSON 配列としてシリアライズした文字列 | `parseAiJsonArray`           |
| `yaml`          | root object を YAML としてシリアライズしたテキスト                      | `extractYaml`                |
| `line-prefixed` | `<キー>: <値>` を 1 行ずつ並べたテキスト                                | 行頭前方一致（`startsWith`） |

`runAI` は復元後の文字列を返す。成否と値を持つ結果オブジェクトへは変えない（REQ-C-005 / DR-19）。
復元処理は llama 経路の内部境界に閉じ、呼び出し元からは経路の違いが見えない
（REQ-NF-001 / REQ-C-006 / `specifications-transport.md` §4.1）。

---

### 4.3.1 呼び出し元ごとの契約定義（R-001 / R-003 / R-007 / R-008 の唯一の入力）

§4.3 はスキーマの **形**（root は object・`additionalProperties: false`・数量制約なし等）を定めるが、
**キー集合そのものは呼び出し元ごとに異なる**。契約タグ（`json-array` / `yaml` / `line-prefixed`、
DR-19 決定 1）は **復元先の文字列表現** を選ぶものであり、それだけではスキーマを一意に決めない。
とくに `yaml` タグを持つ 2 呼び出しは必須キーが一致しない。

`extractYaml(_raw, <firstField>)` の第 2 引数は YAML ブロックの **開始位置を見つけるための
起点キー** であり、必須キーの一覧ではない。必須キーは呼び出し元の後段ロジックが持つ。
したがって「`extractYaml` が要求するキー」をスキーマの根拠にしてはならない。

R-001 のスキーマ構築、R-003 の enum フォールバック、R-008 の必須キー検証は、
いずれも契約タグと次表の **契約定義** の組を唯一の入力とする。

| # | 呼び出し元                | 契約タグ        | 復元の起点                 | required keys と値の型                                                                                                                                    | enum フィールドと値域の取得元                                                                      | フォールバック値                                                                       |
| - | ------------------------- | --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1 | `phase-classify-ai.ts`    | `json-array`    | envelope `items`           | `items`: object の配列。要素は `ClassifyCache`（`classify-chatlogs/scripts/types/classify.types.ts`）の `file` / `project` / `confidence` / `reason`      | `project`: `projects.dic` のプロジェクト名                                                         | `FALLBACK_PROJECT`（`'misc'`）                                                         |
| 2 | `filter/process-chunk.ts` | `json-array`    | envelope `items`           | `items`: object の配列。要素は `ClaudeResult`（`filter-chatlogs/scripts/types/filter.types.ts`）の `file` / `decision` / `confidence` / `reason`          | `decision`: `FILTER_DECISIONS`（`filter-decision.const.types.ts`）                                 | `FILTER_DECISIONS.ERROR`（`'ERROR'`）                                                  |
| 3 | `segment-ai.ts`           | `json-array`    | envelope `items`           | `items`: object の配列。要素は `filePath`: string / `segments`: object の配列                                                                             | なし                                                                                               | —                                                                                      |
| 4 | `setfm-frontmatter.ts`    | `yaml`          | firstField `title`         | `title`: string / `topics`: string の配列 / `tags`: string の配列                                                                                         | `topics`: `topics.dic` のキー（22 件）/ `tags`: `tags.dic` のキー（73 件）。いずれも配列要素の値域 | 空配列（下記「配列値の enum」を参照）                                                  |
| 5 | `setfm-review.ts`         | `yaml`          | firstField `validity`      | `validity`: string / `errors`: string の配列 / `corrected_frontmatter`: object（`type` / `category` / `title`: string、`topics` / `tags`: string の配列） | `validity`: `pass` \| `fail`。`corrected_frontmatter` の `type` / `category` は #6 と同じ辞書      | `validity` は `pass`。`corrected_frontmatter` の単一値 enum は #6 に同じ。配列は空配列 |
| 6 | `setfm-type-category.ts`  | `line-prefixed` | 行頭 `type:` / `category:` | `type`: string / `category`: string                                                                                                                       | `type`: `types.dic` のキー / `category`: `category.dic` のキー                                     | `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY`                                  |

**辞書由来 enum の扱い**: #1・#4・#5・#6 の値域は定数ではなく `.config/chatlog-exporter/dics/`
配下の辞書から実行時に読み込まれる。したがってスキーマ構築関数は値域を引数として受け取り、
モジュールスコープの定数を参照してはならない。

**フォールバック値が値域に含まれること**: R-003 が要求するフォールバック値は、enum の許容値の
一部として `enum` 配列に含めなければならない。値域の外に置くと、モデルが「該当なし」を
選んだ応答が R-008 の enum 検証で不適合になる。#6 の `DEFAULT_FALLBACK_TYPE`（`research`）と
`DEFAULT_FALLBACK_CATEGORY`（`development`）は辞書のキーとして実在する。辞書の改訂により
フォールバック値がキー集合から消えた場合、スキーマ構築は設定エラーとして失敗させる。
辞書に無い値を暗黙に補ってはならない。

**値の正規化**: #6 の呼び出し元は応答を小文字化してから値域と照合する。スキーマの `enum` にも
小文字のキーを載せる。

**配列値の enum**: `topics` / `tags` のように配列の **要素** が語彙制約を持つフィールドでは、
「該当なし」は **空配列** で表現する。要素側の `enum` に「なし」を意味する専用値を足さない。
`topics.dic` / `tags.dic` にそのような値は存在せず、追加すれば辞書が本来持たない語を
分類語彙へ持ち込むことになる。R-002 により `minItems` を置かないため、空配列はスキーマ上
つねに許容される。R-003 が求めるフォールバック値の必須化は、`type` / `category` / `project` /
`decision` のような **単一値の enum** に対する要求とする。

---

## 5. Edge Cases

| Input                                                                                            | Classification                                                                                                                                                                                                       | REQ       | Rationale                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サーバが `response_format` ブロックを無視し、スキーマに準拠しない自然文を返す                    | R-008 が契約不適合として `ResponseSchemaViolation` を throw する（続行側）。既存のパース経路への暗黙のフォールバックは行わない。単一応答からは黙殺と偶発的な不適合を区別できないため、この分類は「黙殺」を意味しない | REQ-F-016 | DR-09 は「未対応時は既存パーサへフォールバックする」方針を fail-first と衝突するとして明示的に不採用にしている。黙殺を成功系に含めると、構造化出力を要求した呼び出し元が差異を検知できないまま劣化した経路で動き続ける |
| サーバが `response_format` ブロックを 400 等のクライアントエラーで拒否する                       | HTTP エラーとして扱う。拒否と判別できた場合は `ResponseFormatRejected`（中断側）。判別できない 400 は続行側の既定に落とす（詳細な分類は `specifications-error-handling.md` §3.2）                                    | REQ-F-016 | EXTERNAL DESIGN NOTES の "server rejects the response-format block with a client error status"                                                                                                                         |
| サーバが `response_format` を受理し、モデルが空配列を出力する                                    | R-004 によりパース成功、空配列として返す                                                                                                                                                                             | REQ-F-013 | EXTERNAL DESIGN NOTES の "server honours the block but the model emits an empty array"                                                                                                                                 |
| enum のフォールバック値のみが正解であるケース（該当する具体値が実際にない）                      | フォールバック値がそのまま採用され、呼び出し元はそれを「該当なし」として解釈する                                                                                                                                     | REQ-F-004 | フォールバック値を必須化した目的そのもの（R-003）                                                                                                                                                                      |
| 応答テキストが構文的に有効な空配列 `"[]"` である場合と、無関係な括弧対を含む単なる散文である場合 | 前者は R-004 によりパース成功（空配列）。後者はパース不能としてパース失敗（R-005）                                                                                                                                   | REQ-F-013 | 両者を混同すると散文中の偶発的な括弧を誤って配列と解釈してしまう                                                                                                                                                       |
| 呼び出し元が配列出力を要求するが、on-wire では object envelope に包まれる                        | schema の root は object とし、配列は envelope 内のフィールドとして表現する（受信後に展開）                                                                                                                          | REQ-F-003 | EXTERNAL DESIGN NOTES の invariant（"array contract seen by callers is unchanged"）                                                                                                                                    |
| 呼び出し元が YAML 契約の出力を期待する（set-frontmatter の frontmatter 生成 / review）           | `response_format` を適用し、受信 JSON を R-007 により `extractYaml` が解釈する YAML テキストへ復元して返す                                                                                                           | REQ-F-018 | 呼び出し元から見た YAML 契約は不変に保つ。CLI バックエンド経由時の挙動は変えない（REQ-C-002 / REQ-C-004）                                                                                                              |
| 呼び出し元が行前置テキストを期待する（set-frontmatter の type / category 判定）                  | `response_format` を適用し、受信 JSON を R-007 により `type: <値>` / `category: <値>` の行へ復元して返す                                                                                                             | REQ-F-018 | 対象から外すと、行頭前方一致に失敗しても例外が出ないまま既定値が全ファイルへ書き込まれる（DR-19 Alternatives）                                                                                                         |

---

### 5.1 空配列受理の適用範囲（REQ-C-002 との関係）

R-004 の空配列受理は共有の配列パーサに対する変更であり、llama 経路だけでなく
**既存 5 バックエンドの応答にも等しく適用される**。この適用範囲は意図したものとする。

この変更は「従来はパース失敗として扱われていた入力が、成功として空配列を返すようになる」
という一方向の緩和であり、既存の呼び出し元が空配列を受け取った場合の振る舞いが
パース失敗時と異なるならば、それは挙動変更になる。したがって次を非破壊条件とする。

非破壊の判定は戻り値の一致だけでなく、呼び出し元が外部に残す観測結果まで見る。
戻り値が一致していても、集計値やキャッシュへの書き込みが変われば挙動変更にあたるためとする
（codex balanced M-04）。観測範囲は次の 3 つとする。

1. 呼び出し元の戻り値
2. 永続化される出力（書き出される Markdown / frontmatter の内容）
3. 集計・キャッシュへの副作用（filter の `stats` の各カウンタ、classify のキャッシュ書き込み）

診断ログの文言と件数は観測範囲に含めない。

| 条件                                                                              | 判定                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| 空配列を受け取った呼び出し元が、上記 3 点すべてでパース失敗時と同じ結果に収束する | 適合                                             |
| いずれかがパース失敗時と異なる結果を出す                                          | 不適合。呼び出し元ごとに意図した結果かを判定する |

**判定結果**: 呼び出し元 3 箇所（classify / filter / normalize）はいずれも **適合** とする。
classify と filter は突合が該当なしを返してフォールバックへ収束する。normalize は空配列を受け取ると
全ファイルを未分割のまま返すが、これはパース失敗時の戻り値と一致する。差は診断ログのみであり
（パース失敗時の 1 件から、ファイルごとに「応答に該当項目がない」旨を出す形へ変わる）、
後者のほうが実態に即している。空配列時の戻り値を検証する既存テストも維持される。
filter の `stats` は、空配列を受け取ると「該当なしとして突合が空を返す」経路へ収束し、
パース失敗時と同じカウンタが加算される。classify のキャッシュ書き込みも突合結果が空であることに
帰着するため差が出ない。

<!-- impl-note: 呼び出し元 3 箇所（classify / filter / normalize）は parsed が truthy になるため
     パース失敗分岐に落ちなくなる。classify と filter は突合が undefined を返してフォールバックへ
     収束するが、normalize の segment ループは空配列だと全ファイル null のまま返るため、
     意図した結果かを個別に確認すること。既存テスト 2 件が空配列を null 固定で検証している。 -->

---

## 6. Requirements Traceability

| Requirement ID | Spec Rule                                        | Notes                                                                                                                                                         |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-F-003      | R-001                                            | response_format の無条件適用（出力契約から json_schema を構築する）                                                                                           |
| REQ-F-004      | R-002, R-003                                     | 数量制約の禁止と enum フォールバックの必須化                                                                                                                  |
| REQ-F-013      | R-004, R-005                                     | 空配列パースの成功扱いとパース失敗との区別                                                                                                                    |
| REQ-F-018      | R-001, R-007, R-008, §4.3, §4.3.1                | 呼び出し単位の出力契約（3 種）、呼び出し元ごとの契約定義、契約ごとの最小構造検証、既存パーサが解釈する文字列表現への復元                                      |
| REQ-F-016      | R-006, §4.2                                      | 実装着手前の実測ゲートと 3 種のスキーマ × 4 条件の合格基準。実測結果を反映する対象は §4.1.1 の表および §5 の「response_format を無視」「400 等で拒否」の 2 行 |
| REQ-F-001      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-002      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-007      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-012      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-015      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-017      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-019      | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-NF-003     | Covered in: `specifications-transport.md`        | —                                                                                                                                                             |
| REQ-F-005      | Covered in: `specifications-error-handling.md`   | —                                                                                                                                                             |
| REQ-F-006      | Covered in: `specifications-error-handling.md`   | —                                                                                                                                                             |
| REQ-F-014      | Covered in: `specifications-error-handling.md`   | —                                                                                                                                                             |
| REQ-F-008      | Covered in: `specifications-config-packaging.md` | —                                                                                                                                                             |
| REQ-F-009      | Covered in: `specifications-config-packaging.md` | —                                                                                                                                                             |
| REQ-F-010      | Covered in: `specifications-config-packaging.md` | —                                                                                                                                                             |
| REQ-F-011      | Covered in: `specifications-config-packaging.md` | —                                                                                                                                                             |

---

## 7. Open Questions

> **Status**: INCOMPLETE

| # | Question                                                                                                                                                                                                                          | Source                              | Impact                                                                                                                                                                             |
| - | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | 対象 LAN llama サーバ（llama.cpp server を主対象とする）が `response_format`（json_schema）をどのレベルで対応しているかが実機未測定である。honoured / silently ignored / rejected のいずれかは REQ-F-016 の実測完了まで確定しない | REQ-F-016                           | Section 5 の "サーバが response_format を無視/拒否する" 行は実測結果に応じて具体的な挙動へ書き換える必要がある                                                                     |
| 2 | 出力契約を渡すフィールドが `RunAIOptions` に存在しない。これは名称の問題ではなく公開契約境界の問題であり、フィールドの追加は公開シグネチャの変更にあたる（REQ-C-005 の許容範囲内かを impl で判断する）                            | REQ-F-018 / DR-19 / codex risk A-03 | §2.2 の 3 契約をどう渡すかが決まらないと R-001 のスキーマ構築が実装できない。フィールド名そのものは impl で決めてよいが、「オプションに契約を載せる」という境界は DR-19 で確定済み |

<!-- Q3（実測が黙殺・拒否だった場合に degraded 運転を提供するか）は解決済み。
     当該サーバ実装を対応対象外とし、degraded 運転は提供しない。
     根拠: Section 4.1 / REQ-F-016 / DR-09 / REQUIREMENTS §1.2 Out of Scope。 -->

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added, PATCH = clarification only -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial specification（split: structured output）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-09-02 | 1.1.0   | consistency レビュー所見を反映: R-001 の適用条件を YAML 契約へ拡張し R-007（YAML 契約変換）を追加（REQ-F-018 / DR-11）、degraded 運転の未決（旧 §7 Q3）を「対応対象外」で確定、based-on を requirements v1.4.0 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-02 | 1.1.1   | DR-06 の再定義（既知の周辺不具合の一括修正）を反映、要件 v1.5.0 に追随                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-09-02 | 1.2.0   | 要件 v1.5.0 の内容へ追随: AC-016 の合格基準を §4.2（実測すべき 3 種のスキーマ）として明文化し R-006 を具体化、§6 の壊れた参照（Edge 5.1–5.2）を訂正、DR-06 のタイトルを DR 文書へ統一                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-09-02 | 1.3.0   | spec レビュー所見を反映: DR-15 により R-001 の適用条件を無条件へ単純化、R-007 の変換先を検証可能な表現へ、§5.1 に空配列受理の非破壊判定（3 呼び出し元とも適合）を記録、§6 の欠落 3 件を補完                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-09-02 | 2.0.0   | codex レビュー所見を反映: §2.2 の契約分類を実態（6 呼び出し / 3 契約）へ訂正し「JSON オブジェクト」を削除、R-001 を出力契約からのスキーマ構築へ、R-008（on-wire contract validation）を新設、R-007 の復元先を文字列表現へ訂正、§4 の順序宣言から R-006 を除外、§4.3（スキーマ契約と復元先）を新設、§4.2 の実測条件を 4 種へ拡張、§5.1 の観測範囲に副作用を追加、フル JSON Schema validation を Non-Goal に明記                                                                                                                                                                                                                                                                                     |
| 2026-09-05 | 2.1.0   | codex feasibility セカンドオピニオンの所見を反映: §4.3.1（呼び出し元ごとの契約定義）を新設し、契約タグ 3 種（DR-19 決定 1）は復元先の文字列表現を選ぶだけでスキーマを一意に決めないことを明記。`yaml` タグの 2 呼び出しで必須キーが異なる事実を §2.2 へ、required keys / 値の型 / enum 値域の取得元 / フォールバック値を §4.3.1 の表へ確定。§4.3 の「`extractYaml` が要求するキーと完全一致」（第 2 引数は起点キーであり必須キーの一覧ではないため実装不能）を §4.3.1 参照へ改め、§4.1 の検証表と §6 の REQ-F-018 行も同表を指すようにした。辞書由来 enum は実行時に引数で受け取ること、単一値 enum のフォールバックは値域内に含めること、配列要素の enum では「該当なし」を空配列で表すことを規定 |
