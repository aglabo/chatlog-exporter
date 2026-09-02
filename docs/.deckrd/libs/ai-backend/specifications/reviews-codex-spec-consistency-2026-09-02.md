---
title: "Second Opinion (codex): libs/ai-backend specifications — consistency"
reviewer: codex
focus: consistency
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: accepted
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-mix-dearu-desumasu
   -->

<!-- cspell:words subindex Ollama predict -->

> **Codex Second Opinion — Consistency Checker**
> `/deckrd:deckrd-review spec --focus consistency`（follow-up 1 往復を含む）
> 判定: **Accept**（採択 8 件 / 未採択 1 件 / 既存採択の差し替え 1 件）

## 1. Reviewed

`specifications-index.md` v1.1.3 / `-transport.md` v1.3.0 / `-structured-output.md` v1.3.0 /
`-error-handling.md` v1.1.0 / `-config-packaging.md` v1.1.3

先行: `reviews-codex-spec-risk-2026-09-02.md` / `reviews-codex-spec-balanced-2026-09-02.md`

## 2. 検出された矛盾（5 件・全採択）

### D-01: `response_format` の適用条件が三重化している

| 箇所                            | 記述                                       |
| ------------------------------- | ------------------------------------------ |
| requirements REQ-F-003 / AC-002 | 呼び出し元が構造化出力を **要求する** 場合 |
| structured-output R-001         | llama が選択されていれば **無条件**        |
| transport R-009                 | `response_format` は **構造化出力時のみ**  |

DR-15 の適用時に R-001 のみを無条件化し、同じ DR-15 で新設した R-009 と上流の REQ-F-003 に
条件付きの語彙が残った。**前回の `/deckrd spec` 作業由来の不整合である。**

### D-02: transport §4.1 の所有権が structured-output §4 の `No reordering` と衝突

structured-output §4 の順序表は、実行時規則（R-001〜R-003, R-007）・パース規則（R-004, R-005）・
**実装着手前ゲート（R-006）** を同一の評価順序に並べて `No reordering is permitted` を宣言している。
R-006 は §2.3 自身が「実行時の呼び出し順序には現れない」と述べており、内部で矛盾する。
transport §4.1 の「実行時の結合順序は本節が唯一の正」と両立させるには、
structured-output 側の順序宣言の射程を限定する必要がある。

### D-03: error-handling §3.2 の「唯一の所有者」が structured-output に対して不成立

structured-output §4.1 / §5 は黙殺時に「失敗として throw」と定めるが、その応答は
HTTP 200・本文テキストあり・`choices[0]` あり・`finish_reason` 正常でありうるため、
error-handling R-001〜R-004 の **どれにも入らない**。DR-16 で §3.2 を単独所有者にした以上、
structured-output 側の throw 条件も分類名として §3.2 に載る必要がある。

### D-04: `model` の供給元が drift している

| 箇所                  | 記述                                  |
| --------------------- | ------------------------------------- |
| transport §2.2        | `config.yaml` からのみ供給            |
| config-packaging §2.2 | `config.yaml` からのみ供給            |
| error-handling §3.1   | `options` **または** 設定から得られる |

実装は `options?.model ?? _globalConfig.get('model')` であり、**error-handling が正しく
他 2 ファイルが誤り** である。backend selection の入力ドメインに関わるため表記揺れでは済まない。
fix レビューの T-02（モデル値への用語統一）は表記のみを揃え、供給元の食い違いを見ていなかった。

### D-05: index §1 の分割根拠が index §4 と矛盾

index §1 は「実測まで確定しないのは structured-output だけで、他の 3 ファイルは実測結果に
関わらず確定する」と述べるが、同じ index の §4 Open Question #1 は「transport の wire format
前提にも波及」と書く。DR-16 により失敗系分類は error-handling が所有するため、
黙殺・拒否時の分類も error-handling へ波及する。**分割の根拠そのものが強すぎる主張になっている。**

## 3. Follow-up: 黙殺の検出手段（D-03 の掘り下げ）

D-03 と、balanced レビューで採択済みの A-02（黙殺の実行時検出規則）が同じ点に収束するため、
codex に判定手段・検出頻度・分類名の 3 点を問うた。

### 3.1 単一レスポンスから黙殺は断定できない

実行時に観測できるのは HTTP status / `choices[0].message.content` / `finish_reason` /
送信した `response_format` / JSON として parse できるか / parse 後の値が on-wire 契約に合うか、
の 6 点に限られる。

| ケース                       | 実行時の判定                               | 分類                       |
| ---------------------------- | ------------------------------------------ | -------------------------- |
| (a) honoured                 | parse でき、on-wire 契約に適合             | 成功                       |
| (b) 黙殺 / prose             | parse 不能、または envelope が期待形でない | **契約違反**（断定しない） |
| (c) 契約は満たすが内容が誤り | 形は合うが意味的に誤り                     | **機械判定不能**           |

(b) は「モデルがたまたま壊れた JSON を出した」場合と区別できない。黙殺はサーバ能力の問題だが、
観測される現象は「この応答が期待 JSON 契約に合わない」でしかない。
したがって **runtime で `ResponseFormatIgnored` と断定してはならない。**

### 3.2 黙殺は per-server-instance の条件として REQ-F-016 で判定する

| 局面                                     | 扱い                                  |
| ---------------------------------------- | ------------------------------------- |
| 実測ゲートで ignored / rejected と判明   | backend unusable。実装着手不可        |
| 実測通過後、個別レスポンスが契約違反     | per-input failure → **CONTINUE**      |
| runtime で 400 等により rejected         | capability mismatch → **ABORT**       |
| runtime で prose / invalid JSON / 不一致 | 黙殺と断定せず個別失敗 → **CONTINUE** |

### 3.3 JSON Schema validator は導入しない（codex の判断）

runtime に必要なのは「サーバ能力の証明」ではなく「呼び出し元へ渡してよい値か」の境界チェック。
仕様の語は "JSON Schema validation" ではなく **"on-wire contract validation"** に寄せ、
契約ごとの最小構造検証を mandate する。

- content が JSON として parse できること
- 配列契約は object envelope であり、所定の envelope field が存在し値が array であること
- YAML 契約は object であり、変換に必要な必須キーを備え、値が許容型であること
- enum を含む契約は、対象フィールドが許容 enum 値またはフォールバック値であること

Deno に JSON Schema validator は組み込まれておらず、本プロジェクトの依存は JSR のみ
（`@std/yaml` / `@std/assert` / `@std/testing`）。validator 追加が必要になった時点で依存追加の DR を切る。

## 4. 採択（8 件）

| ID   | 内容                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| E-01 | D-01: `response_format` の適用条件を 1 つに統一する（REQ-F-003 / R-001 / R-009）                              |
| E-02 | D-04: `model` の供給元を実装（`options` または設定）へ揃える（transport §2.2 / config-packaging §2.2）        |
| E-03 | D-03: error-handling §3.2 に契約違反系の分類名を載せ、単独所有の主張を成立させる                              |
| E-04 | D-02: structured-output §4 の順序宣言の射程を限定し、R-006 を評価順序から外す                                 |
| E-05 | D-05: index §1 の分割根拠を実態（実測の主担当は structured-output、反映先は他ファイルにも及ぶ）へ改める       |
| E-06 | A-02 の中身を「黙殺の実行時検出規則」から **「on-wire contract validation の規定」** へ差し替える             |
| E-07 | 新 subindex 2 件の新設: `ResponseFormatRejected`（ABORT）/ `ResponseSchemaViolation`（CONTINUE）              |
| E-08 | `ExitFailure` を原因別に分割する（接続失敗・404/501・401/403 は ABORT、単一応答の unusable body は CONTINUE） |

### E-06 は既存採択の差し替えである

balanced レビューで採択した A-02（黙殺の実行時検出規則）は **実現不能** と判明した。
単一レスポンスから黙殺と偶発的な壊れ JSON を区別できないためである。
採択自体は維持し、中身を on-wire contract validation へ差し替える。
黙殺の判定は REQ-F-016 の測定結果として扱う。

`ResponseSchemaViolation` を `ResponseFormatIgnored` と命名してはならない
（黙殺は測定結果名、runtime 分類名は契約違反名）。

### E-08 は DR-16 の撤回範囲を広げる

risk レビュー時点では、DR-16 / P-02 の撤回は「R-004 に専用 subindex を設けない判断は維持できる」
と見積もっていた。しかし `ExitFailure` に接続失敗（ABORT）と unusable body（CONTINUE）が
同居している以上、**subindex を割らない限り中断・続行を実装できない**。
DR-16 の subindex 方針は全面的に再検討対象となる。

## 5. 未採択（1 件・理由の記録が必要）

| #    | 所見                                                         |
| ---- | ------------------------------------------------------------ |
| P-01 | JSON Schema validator を実装要件にしない方針の明文化（§3.3） |

E-06 で「on-wire contract validation」を規定しながら、フル JSON Schema validation を
スコープ外とする旨を書かない場合、実装者が validator ライブラリの導入へ進む余地が残る。
JSR のみという依存方針との整合も明文化されない。`impl` へ移る前に理由を記録するか採択へ切り替える。

## 6. 累積: requirements 改訂に載せる項目

3 回の codex レビューを通じ、要件側で改訂の必要な項目が次まで増えた。

| 項目                                           | 出所                |
| ---------------------------------------------- | ------------------- |
| REQ-F-006 の subindex 割当（中断・続行の分離） | risk                |
| REQ-F-019 の kind 選定（DR-12）の再検討        | risk                |
| REQ-F-018 の WHERE を呼び出し単位へ            | balanced（C-01）    |
| REQ-F-003 の適用条件（要求時のみ / 無条件）    | consistency（E-01） |
| DR-13（`--allow-net`）を覆す場合               | risk（据え置き可）  |

decision-records 側は次のとおり。

| 項目                                                                      | 出所                       |
| ------------------------------------------------------------------------- | -------------------------- |
| 可用性による中断・続行の分離（新 DR）                                     | risk                       |
| DR-11 の Context を実態（6 呼び出し / 3 契約）へ訂正                      | balanced                   |
| DR-16 の subindex 方針の全面再検討（新 subindex 2 件 + ExitFailure 分割） | consistency（E-07 / E-08） |
| DR-03 据え置きの記録                                                      | risk                       |

## 7. Metadata

- Reviewer: codex（`mcp__codex-mcp__codex`, sandbox: read-only, thread `01a0602e-c439-7871-850f-e6acdace5513`）
- Focus: consistency（Consistency Checker）+ follow-up 1 往復
- Date: 2026-09-02
- Disposition: Accept
