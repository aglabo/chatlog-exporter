---
title: "Design Review: libs ai-backend requirements (harden)"
module: "libs/ai-backend"
target: "requirements/requirements.md v1.2.0"
phase: harden
persona: "Normative Requirements Reviewer"
reviewer: claude
status: Draft
version: 1.0.0
date: "2026-09-02"
---

<!-- cspell:words setfm subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

> `/deckrd review req --phase harden` の実行結果です。
> harden フェーズの規約に従い、昇格・WHEN 抽出・ギャップ補充ごとに Decision Record を起こします。
> 本レビュー時点では対象文書を編集していません。所見は requirements.md v1.3.0 および
> decision-records.md v1.3.0 として適用済みです。

## 1. サマリー

| 分類                  | 件数 | 内訳                        |
| --------------------- | ---- | --------------------------- |
| ギャップ補充（DR 付） | 3    | GF-01 / GF-02 / GF-03       |
| 規範度の昇格          | 1    | P-01                        |
| WHEN / GIVEN の明示化 | 2    | W-01 / W-02                 |
| 据え置き（fix 送り）  | 5    | 下記 §6                     |
| **合計**              | 11   | 新規 DR 3 件、新規 REQ 2 件 |

要件・decision-records・specifications 4 本・および実コード（`run-ai.ts`、`rate-limit-utils.ts`、
`setfm-frontmatter.ts`、`setfm-review.ts`、`phase-classify-ai.ts`、`process-chunk.ts`、
`segment-ai.ts`、`config-schema.constants.ts`、`chatlog-error.constants.ts`）を照合しました。
所見はすべて文書または実コードの引用に接地しています。

---

## 2. ギャップ補充

### GF-01 → DR-11: YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める

- 矛盾: 要件 §1.1 Purpose は set-frontmatter を llama 化の対象 4 スキルに数えますが、
  REQ-F-003 の WHERE は「JSON 配列/オブジェクトの構造化出力を要求する呼び出し元」に限定されます。
  `specifications-structured-output.md` §2.2 は対象を classify / filter / normalize の 3 スキルと明記します。
- 実コードの裏づけ: set-frontmatter だけが `extractYaml` を使います
  （`setfm-frontmatter.ts:62`、`setfm-review.ts:62`）。他 3 スキルは `parseAiJsonArray` を使います。
- 影響: llama 経路では set-frontmatter だけがスキーマ強制なしで動き、「強制なしのローカルモデルは
  実用にならない」という DR-04 の前提が崩れます。
- 決定（ユーザー選択）: set-frontmatter も強制対象に含めます。受信 JSON を既存の YAML 契約へ
  変換して返します。
- 反映: REQ-F-018（+ AC-018）を新設し、REQ-F-003 の WHERE を「JSON 配列 / オブジェクト / YAML 契約」へ
  広げました。REQ-C-002 に照らし、CLI バックエンド経由時の挙動は変えません。

### GF-02 → DR-12: `llamaEndpoint` 未設定・空文字列は設定エラーとして扱う

- traceability inversion: `specifications-transport.md` §5 は「モデル値が llama prefix を持つ一方、
  サーバ位置が未設定または空文字列 → 設定エラーとして扱う（ネットワークアクセス前に検出）」と
  決定済みです。しかし要件側に対応する規範がありません。REQ-F-001 の WHERE は設定済みの分岐しか語らず、
  AC-009 は「未指定時は `DEFAULT_CONFIG_VALUES` の既定値が使われる」とだけ述べ、既定値の内容を
  定義していません。
- 併せて `specifications-transport.md` §7 Q1（検証を設定読み込み時に行うかリクエスト直前に行うか）を
  「llama 経路が選択された時点・ネットワークアクセス前」に確定させました。
  `specifications-config-packaging.md` §5 の「設定読み込み自体は成功する」と整合します。
- エラー分類: `chatlog-error.constants.ts` に `InvalidConfig` 相当の kind は存在しません。
  `InvalidYaml` は YAML の構文・スキーマ違反を読み込み時に報告する用途で確立しているため、
  既存の `InvalidFormat` を再利用し `ChatlogError('InvalidFormat', 'InvalidEndpoint')` としました。
- 反映: REQ-F-019（+ AC-019）を新設しました。

### GF-03 → DR-13: `--allow-net` は無制限に確定する

- `specifications-transport.md` §7 Q2 と `specifications-config-packaging.md` §7 Q1 の双方で
  未決のまま残っていました。
- REQ-C-001 により宛先は実行時に `config.yaml` からしか判明せず、SKILL.md / `deno.json` に
  静的に書くフラグでは `--allow-net=<host>:<port>` を追随できません。
- 決定（ユーザー選択）: 宛先を限定しない `--allow-net` に確定します。緩和策は既決の
  DD-03（AI を呼ぶ実行経路にのみ付与）が担います。
- 反映: REQ-F-010 の Rationale に確定内容を記載しました（新規要件は起こしていません）。

---

## 3. 規範度の昇格

### P-01: REQ-NF-001 を SHOULD → SHALL へ

- 「Implementation SHOULD be maintainable.」は本文書で唯一の SHOULD であり、検証できません。
- REQ-C-006 / DR-10 が既に具体的な保守性制約（経路依存処理を `runAI` 本体から分離した内部境界に
  閉じ込める）を規範化しています。REQ-NF-001 をこれに束ねて SHALL 化し、AC-020 を与えました。
- 新規 DR は起こしていません。DR-10 の要件側への反映にあたります。

---

## 4. WHEN / GIVEN の明示化

### W-01: REQ-F-003 の WHERE 条件

- 「呼び出し元が JSON 配列/オブジェクトの構造化出力を要求する」→
  「呼び出し元が構造化出力（JSON 配列 / オブジェクト / YAML 契約）を要求する」。
- Source: explicit in spec（`specifications-structured-output.md` §2.2）＋ GF-01 の決定。

### W-02: REQ-F-006 の GIVEN

- REQ-F-017 の Rationale は「`choices` が空の場合、および本文がテキストでない場合の扱いは
  REQ-F-006 側で規定済み」と述べます。しかし REQ-F-006 の GIVEN は「接続が失敗する、または
  HTTP エラーが返る」です。200 OK かつ不正本文はそのどちらでもなく、文書内の自己矛盾にあたります。
- `specifications-error-handling.md` §5 は当該 2 行を `ExitFailure` と決め REQ-F-006 に紐付けている
  ため、要件側の GIVEN を spec に合わせて広げました。
- Source: explicit in spec。新規 DR は起こしていません。

---

## 5. Decision Records

本レビューで起こした DR は次の 3 件です。本文は `../decision-records.md` v1.3.0 にあります。

| DR    | 決定                                                                       | 由来  |
| ----- | -------------------------------------------------------------------------- | ----- |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める       | GF-01 |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする | GF-02 |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                             | GF-03 |

DR 粒度の方針に従い、W-01 / W-02 / P-01 は既存 DR（DR-11 / DR-10）の要件側への反映として扱い、
独立した DR を起こしていません。

---

## 6. 据え置いた所見

次の 5 件は harden の対象外、または fix / spec 側の宿題として送りました。

| 所見                                                                                                              | 送り先     |
| ----------------------------------------------------------------------------------------------------------------- | ---------- |
| REQ-C-002 に AC がない（回帰テストで検証可能なので AC 化できる）                                                  | fix        |
| REQ-F-010 の対象表が行番号キーで、SKILL.md の編集により陳腐化しやすい                                             | fix        |
| REQ-NF-003（UTF-8）が HTTP 経路で何を意味するか未定義                                                             | fix / spec |
| REQ-F-016 の実測項目にローカル推論のレイテンシ観測を加える提案（既定 `timeoutMs` は 120,000 ms）                  | 提案のみ   |
| `specifications-structured-output.md` §7 Q3（degraded 運転の可否）は DR-09 で決着済みなのに spec に未決として残存 | spec       |

---

## 7. レビューメタデータ

- Reviewer: AI (deckrd review --phase harden)
- Review Phase: harden
- Document Version Reviewed: 1.2.0
- 適用先: requirements.md v1.3.0 / decision-records.md v1.3.0
