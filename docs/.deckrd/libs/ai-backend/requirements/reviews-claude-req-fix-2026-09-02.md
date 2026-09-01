---
title: "Design Review: libs ai-backend requirements (fix)"
module: "libs/ai-backend"
target: "requirements/requirements.md v1.2.0"
phase: fix
persona: "Spec Auditor"
reviewer: claude
status: Draft
version: 1.0.0
date: "2026-09-02"
---

<!-- cspell:words subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

> `/deckrd review req --phase fix` の実行結果です。
> fix フェーズの規約に従い、新規の MUST / SHALL / SHOULD / MAY 表現と Decision Record の生成は
> 行いません。意味を変えない範囲の訂正のみを扱います。
> 本レビュー時点では対象文書を編集していません。所見は requirements.md v1.3.0 として適用済みです。

**正規化の方針**: 同一 AC が 2 箇所（各 REQ 直下の AC 表 / §8 Gherkin）で食い違う場合、
当該要件の規範文（THEN 節）に一致する側へ寄せます。どちらか一方を恣意的に選ぶと検証範囲が変わり、
意味変更になるためです。

## 1. サマリー

| 分類         | 件数 | 内訳                               |
| ------------ | ---- | ---------------------------------- |
| 用語の不統一 | 4    | T-01 〜 T-04                       |
| 検証可能性   | 3    | TS-01 〜 TS-03（全件 harden 送り） |
| 構造の正規化 | 4    | S-01 〜 S-04                       |
| 相互参照     | 4    | CR-01 〜 CR-04（+ 情報提供 CR-05） |
| 誤字・文法   | 0    | —                                  |
| **合計**     | 15   | うち fix で適用 10 件              |

機械的に検証した項目のうち、次は問題を検出しませんでした。

- §10 Traceability: REQ-F-001 〜 017 すべてに AC が割り当てられている
- §8 Gherkin: AC-001 〜 017 が過不足なく存在し、孤児・重複なし
- §3 DR 表: DR-01 〜 DR-10 がすべて `decision-records.md` に存在
- frontmatter `version: 1.2.0` と §11 Change History 最新行が一致（3 部構成）
- REQ-F-010 の `file:line` 引用 9 件が現物と一致（例示行を除く。CR-01 参照）
- 設計ノート `docs/.deckrd/notes/2026-08-20T2128-runai-json-schema.md` が存在
- §9 の解決先参照がすべて存在
  - `specifications-config-packaging.md` DD-01 / §7 Q2
  - `specifications-structured-output.md` §7
  - `specifications-error-handling.md` §7
- `run-ai.ts:216` のエラーメッセージ、`json-utils.ts` の `_tryParseNonEmptyArray`（10 〜 16 行）が記述どおり
- §8 AC-008 が使う `Aborted` / `ExternalAbort` が `run-ai.ts:267` に存在する識別子

---

## 2. 用語の不統一

| 現在の表記                                         | 推奨表記                      | 出現数     |
| -------------------------------------------------- | ----------------------------- | ---------- |
| `LAN llama サーバ` / `llama サーバ` / `LAN サーバ` | `llama サーバ`                | 3 / 17 / 2 |
| `endpoint` / `接続先`                              | `llamaEndpoint`（設定キー時） | 3 / 4      |
| `設計ノート §x` / `ノート §x`                      | `設計ノート §x`               | 7 / 9      |
| `SHALL` / `MUST`                                   | `SHALL`                       | 18 / 2     |

### T-01: llama サーバの呼称ゆれ

- 使用されている表記: 「LAN llama サーバ」「llama サーバ」「LAN サーバ」
- 推奨: 初出の §1.1 のみ「LAN 上の llama サーバ」と定義し、以降は「llama サーバ」に統一する
- Rationale: 3 形が同一対象を指しています。「LAN サーバ」は llama 以外のサーバとも読めます。
- 修正箇所: §1.2 Out of Scope、§2 Assumptions、REQ-F-016 の GIVEN、§8 AC-016 の Given
- 備考: specifications 側も同傾向です（`LAN llama サーバ` 9 件 / `llama サーバ` 12 件）。

### T-02: endpoint / 接続先 / エンドポイントの混在

- 推奨: 設定キーそのものを指す場合は `llamaEndpoint`、概念を指す場合は「エンドポイント」
- 修正箇所: REQ-F-006 の Rationale、REQ-F-015 の AC 表、§8 AC-015 の見出し

### T-03: 設計ノートの参照表記ゆれ

- 推奨: `設計ノート §x`
- Rationale: 短縮形の「ノート §x」は、どのノートを指すかを示さないまま Rationale 中に単独で現れます。
- 修正箇所: REQ-F-003 の Rationale（`ノート §6.1`）、REQ-F-004 の Rationale（`ノート §2.3`）
- 対象外: §1.2 の「同ノート §6.2」は直前行の「設計ノート」を受ける照応表現のため変更不要です。

### T-04: SHALL と MUST の混在

- 推奨: `SHALL`
- Rationale: RFC 2119 で両者は同義であり、綴りの違いに意味はありません。綴りの統一は規範性を
  変えないため fix フェーズの範囲内です。
- 修正箇所: REQ-NF-002 / REQ-NF-003
- 対象外: REQ-NF-001 の SHOULD は規範性の格差を含むため TS-01 で別に扱います。

---

## 3. 検証可能性

3 件とも意味変更を伴うため、fix では書き換え案を出さず harden へ差し戻しました。

### TS-01: REQ-NF-001（Maintainability）

- 原文: 「Implementation SHOULD be maintainable.」
- 問題: 「maintainable」に客観的な判定基準がなく、合否を決められません。AC も `N/A` です。
- 差し戻し先: harden。REQ-C-006 / DR-10 が既に具体的な保守性制約を規範化しているため、
  そこへ束ねる判断になります。
- 状態: harden レビュー P-01 として解決済み（AC-020 を付与）。

### TS-02: REQ-NF-003（Portability）

- 原文: 「Implementation MUST support UTF-8 input.」
- 問題: 規範度は MUST ですが AC が `N/A` で、検証手段が文書内に存在しません。
  REQ-NF-002 が REQ-F-012 に検証を委譲しているのと対照的です。
- 差し戻し先: harden。AC を割り当てるか、`N/A` の根拠を Rationale として明記するかを決めます。
- 状態: 未解決。§9 Open Questions に記録しました。

### TS-03: AC-016（REQ-F-016 の実測ゲート）

- 原文: 「実装着手前に実機での response_format 挙動が実測・記録され、未実測実装が対応対象外と明示される」
- 問題: 実測の十分性の基準（試行するスキーマの種類・件数）が主観に委ねられています。
  記録の反映先は REQ-F-016 の THEN が「specifications に反映する」と定めるため特定できます。
- 差し戻し先: harden。
- 状態: 未解決。§9 Open Questions に記録しました。

---

## 4. 構造の正規化

### S-01: AC の二重記載が 8 件で食い違う（全 17 件走査）

- 箇所: 各 REQ 直下の Acceptance Criteria 表 / §8 Acceptance Criteria（Gherkin）
- 問題: 同一 AC ID が 2 箇所に書かれており、17 件中 8 件で内容が一致しません。
  片方だけを読んだ実装者・テスト実装者が異なる検証範囲を導きます。

| AC ID  | REQ 直下の表                              | §8 Gherkin                                          | 判定     | 修正方向                                      |
| ------ | ----------------------------------------- | --------------------------------------------------- | -------- | --------------------------------------------- |
| AC-001 | HTTP リクエストが送信される               | `/v1/chat/completions` への HTTP POST               | 軽微な差 | 表を §8 に合わせる                            |
| AC-002 | response_format 付き                      | response_format（json_schema、数量制約なし）        | 不一致   | §8 を表に合わせる（数量制約は AC-007 の担当） |
| AC-003 | 一致                                      | 一致                                                | OK       | —                                             |
| AC-004 | 一致                                      | 一致                                                | OK       | —                                             |
| AC-005 | HTTP 429 / 503 / 504                      | HTTP 429 のみ                                       | 不一致   | §8 を表に合わせる                             |
| AC-006 | 別 messages 要素で送られる                | 2 要素が含まれ連結されていない                      | 軽微な差 | 表を §8 に合わせる                            |
| AC-007 | minItems/maxItems がない                  | + enum フォールバック値                             | 不一致   | 表を §8 に合わせる                            |
| AC-008 | timeoutMs===0 でタイマーなし              | + 外部 signal が Aborted/ExternalAbort              | 不一致   | 表を §8 に合わせる                            |
| AC-009 | UnknownKey にならない                     | + 未指定時に DEFAULT_CONFIG_VALUES の既定値         | 不一致   | 表を §8 に合わせる                            |
| AC-010 | agent の選択肢一覧に llama がない         | agent の値に関わらず llama が選択される             | 別検査   | 両方の観点を各記載に含める                    |
| AC-011 | AI 経路にのみ付与、非 AI 経路には付かない | `--allow-net` が含まれている（限定なし）            | 不一致   | §8 を表に合わせる                             |
| AC-012 | `--check-staged`                          | `--check`                                           | 不一致   | §8 を表に合わせる（CR-02）                    |
| AC-013 | 一致                                      | 一致                                                | OK       | —                                             |
| AC-014 | llama 形式を案内する                      | `gpt-*` / `gemini-*` / `<provider>/<model>` / llama | 不一致   | 表を §8 に合わせる                            |
| AC-015 | 一致                                      | 一致                                                | OK       | —                                             |
| AC-016 | 一致                                      | 一致                                                | OK       | —                                             |
| AC-017 | 一致                                      | 一致                                                | OK       | —                                             |

AC-010 の注記: 表は「`agent` の選択肢 enum に llama が混ざらない」、§8 は「`agent` の値が
バックエンド選択に影響しない」を検査しており、両者は異なる観点です。REQ-F-009 の THEN
「llama を AI バックエンド（model）の選択肢としてのみ扱う」は両方を含意します。片側に寄せると
検証範囲が狭まるため、両方の観点を各記載に含めました。

### S-02: REQ-F-015 が番号順に配置されていない

- 箇所: §4 Functional Requirements（REQ-F-008 と REQ-F-009 の間）
- 問題: 記載順が 001 〜 008 → 015 → 009 〜 014 → 016 → 017 となっており、§10 Traceability の
  昇順と一致しません。§8 Gherkin は AC-001 → AC-017 の昇順で正しく並んでいます。
- 修正: REQ-F-015 の節を REQ-F-014 の後（REQ-F-016 の前）へ移動。内容は変更しません。

### S-03: REQ-F-016 の THEN が 2 つの規範文を含む

- 問題: 「実測して記録する」（作業ゲート）と「未実測実装を対象外として扱う」（対象範囲の制約）が
  1 要件に同居し、AC-016 が 1 行で両方を受けています。
- 判断: 分割は ID 採番と Traceability の変更を伴い実質的な構造変更にあたるため、fix では
  提案しません。harden へ差し戻し、§9 Open Questions に記録しました。

### S-04: §9 Open Questions が 2 つの無関係な表で構成されている

- 問題: 前半は「解決済み 3 件の記録」、後半は「未解決一覧」ですが、後半は `—` のみの
  プレースホルダ行で、表として情報を持ちません。
- 修正: 前半に「解決済み」の見出しを付け、後半は「未解決」の見出しのもとに fix で検出した
  据え置き 3 件（TS-02 / TS-03 / S-03）を記載する表へ置き換えました。

---

## 5. 相互参照

### CR-01: REQ-F-010 の「例示行」引用が別サブコマンドの行を指している

- 参照: 付与対象の行が引く「例示行 123 〜 126」、付与対象外の行が引く「例示行 198 〜 199」
- 問題: 現物と照合すると引用が交差しています。
  - 123 〜 126 行は noise-filter の例示（`$NOISE_FILTER_PATH`、AI 不使用）であり、
    AI 経路（152 行の `$SCRIPT_PATH`）の例示ではありません
  - 198 〜 199 行は strip の例示（`$STRIP_PATH`、193 行に対応）であり、
    noise-filter（112 行）の例示ではありません
  - AI 経路（152 行）の実際の例示は 158 〜 162 行ですが、`deno run ... "$SCRIPT_PATH" chatgpt` の
    ようにフラグ列を `...` で省略しており、`--allow-net` を書き加える対象の文字列を含みません
- 修正: AI 経路の行は「例示行 158 〜 162 はフラグ列が `...` 省略のため改変対象外」と注記し、
  123 〜 126 を noise-filter の行へ、198 〜 199 を strip の行へ移しました。

### CR-02: AC-012 が参照するスクリプトフラグが 2 箇所で異なる

- 参照: `sync-skill-assets.sh --check-staged`（表）と `bash scripts/sync-skill-assets.sh --check`（§8）
- 問題: どちらも `scripts/sync-skill-assets.sh` に実在するフラグ（79 〜 81 行）ですが意味が異なります。
  `--check` は「配布物が最新でないか」を報告し、`--check-staged` は「同期元に stage されていない
  変更があるか」を報告します。
- 修正: `--check-staged` に統一しました。REQ-F-011 の WHEN が「変更がコミットされる」であり、
  lefthook の pre-commit が検査する対象は stage 状態だからです。

### CR-03: REQ-F-017 の Rationale が REQ-F-006 を過大に参照している

- 参照: 「`choices` が空の場合、および本文がテキストでない場合の扱いは REQ-F-006 側で規定済み」
- 問題: REQ-F-006 が規定するのは「接続失敗、または HTTP エラーが返る」場合であり、成功ステータスで
  `choices` が空の応答や本文が非テキストの応答は GIVEN に含まれません。「規定済み」は成立しません。
- 判断: 規定の追加は意味変更にあたるため harden へ差し戻しました。
- 状態: harden レビュー W-02 として解決済み（REQ-F-006 の GIVEN を拡張）。

### CR-04: §1.2 Scope が v1.2.0 で追加された 2 要件を反映していない

- 参照: REQ-F-017（複数 choices の採用規則）、REQ-C-006（llama 経路の内部境界の分離）
- 問題: Change History v1.2.0 でこの 2 件を追加しましたが、Scope 箇条書きは v1.1.0 時点のままです。
  REQ-F-015 / REQ-F-016 には対応する行があります。
- 修正: 既存要件を要約する行を追加しました（要件の新設ではありません）。

### CR-05（情報提供、変更しない）: DR リンクのアンカーが解決しない

- 参照: §3 Design Decisions の `../decision-records.md#DR-01` 〜 `#DR-13`
- 問題: `decision-records.md` の見出しは `## DR-01: サーバ API 形式は…` であり、一般的な Markdown
  レンダラが生成するアンカーは見出し全文由来のスラッグになるため、`#DR-01` ではジャンプしません。
- 判断: 変更しません。`filter/strip/requirements.md` も DR-01 〜 DR-17 で同じ表記を用いており、
  リポジトリ全体の慣例です。変更するならプロジェクト横断の判断であり、本ドキュメント単体の
  監査範囲を超えます。

---

## 6. 誤字・文法

該当なし。

---

## 7. フェーズ違反の自己点検

- 新規要件の追加: なし
- 新規 MUST / SHALL: なし（本レポート中の MUST / SHALL はすべて原文の引用）
- 新規 SHOULD / MAY: なし
- Decision Records: 生成なし（fix フェーズでは禁止）
- 意味変更を伴う提案は TS-01 / TS-02 / TS-03 / S-03 / CR-03 として harden へ差し戻し

---

## 8. レビューメタデータ

- Reviewer: AI (deckrd review --phase fix)
- Review Phase: fix
- Document Version Reviewed: 1.2.0
- 適用先: requirements.md v1.3.0
