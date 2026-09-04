---
title: "Design Review: libs ai-backend implementation (harden)"
module: "libs/ai-backend"
target: "implementation/implementation.md v1.0.0"
phase: harden
persona: "Normative Requirements Reviewer"
reviewer: claude
status: Draft
version: 1.0.0
date: "2026-09-04"
---

<!-- cspell:words setfm subindex aplys -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-unmatched-pair,
  -->

> `/deckrd review impl --phase harden` の実行結果です。
> harden フェーズの規約に従い、ギャップ補充ごとに Decision Record を起こします。
> 本レビュー時点で `implementation.md` は編集していません。DR は
> `../decision-records.md` v3.1.0 として適用済みです。

## 1. サマリー

| 分類                        | 件数 | 内訳                          |
| --------------------------- | ---- | ----------------------------- |
| ギャップ補充（DR 付）       | 4    | GF-01 / GF-02 / GF-03 / GF-04 |
| 規範度の昇格                | 3    | P-01 / P-02 / P-03            |
| WHEN / 条件の明示化         | 4    | W-01 / W-02 / W-03 / W-04     |
| 据え置き（fix / spec 送り） | 5    | 下記 §6                       |
| **合計**                    | 16   | 新規 DR 4 件（DR-20〜DR-23）  |

直前の explore レビュー（`reviews-claude-impl-explore-2026-09-04.md`）が挙げた
Questions 16 / Gaps 7 / Assumptions 5 を入力とし、決着可能なものを規範へ引き上げました。
照合対象は仕様 4 本・requirements v1.6.0・decision-records v3.0.2、および実コード
（`run-ai.ts`、`model-utils.ts`、`ai.const.types.ts`、`config-schema.types.ts`、
`scripts/aplys-tester.ts`）です。所見はすべて文書または実コードの引用に接地しています。

explore が構造上の懸念として挙げた「`_buildCommand` がモデル値の検証と CLI コマンド構築を
兼ねているのではないか」は成立しません。`run-ai.ts:212` の `isValidModel` が
`_buildCommand`（同 219）より前に評価されており、`specifications-transport.md` §4.1 Step 2 は
既に経路非依存の前段に置かれています。この点は所見から取り下げます。

---

## 2. ギャップ補充

### GF-01 → DR-20: llama 経路の可到達性を単一の commit に閉じ、Phase 6 を 2 巡に割る

- 未定義の中間状態: Commit 7 が `RunAIOptions` に出力契約フィールドを追加し、Commit 12 が
  `_runViaHttp` を `runAI` へ結線しますが、6 呼び出しが契約を指定するのは Commit 13〜16 です。
  Commit 12 が着地した時点では、llama 経路を通るすべての呼び出しが契約を持ちません。
- 仕様との衝突: `specifications-structured-output.md` R-001 は「出力契約を指定しない llama 呼び出しは
  想定しない」と述べ、`specifications-transport.md` §4.1 は Step 4（スキーマ構築）と
  Step 7.5（検証と復元）を llama 経路では常に実行するとしています。契約が無い状態で Step 4 が
  何を組み立てるかは、いずれの仕様も規定していません。
- 決定: llama 経路を可到達にする commit を Commit 12 の 1 つに限り、その着手条件を
  「6 呼び出しすべてが出力契約を指定済みであること」とします。Phase 6 を 2 巡に分割し、
  第 2 巡（契約指定 4 commit）を Commit 12 の直前へ移します。第 1 巡（catch 拡張 4 commit）は
  Phase 2 の直後へ移し、Phase 0 の実測結果に依存させません。
- 副次の効果: DR-18 が解消しようとしている不具合（設定漏れ・サーバ未起動が全ファイルへの
  既定値の一括書き込みとして現れる）が、実測の合否と独立に着地します。
- 中間状態の扱い: Commit 3〜11 の期間に `model: llama/<model>` が設定された場合、経路が未結線であり
  `_buildCommand`（`run-ai.ts:43`）の `switch` が既定分岐へ落ちます。この見え方は許容し、
  暫定の拒否コードは置きません。

### GF-02 → DR-21: 検証範囲を AC 単位で割り当て、commit ごとのテスト方針を implementation.md が持つ

- 欠落: §3 Rule Coverage は 30 の規範規則を commit へ割り当てますが、AC-001〜AC-024 の割り当てが
  ありません。「検査する」ことが判定内容そのものである AC-013 / AC-020 / AC-021 / AC-022 /
  AC-023 / AC-024 の 6 件に帰属先がありません。テストレイヤと Green 条件も Commit 6 以外に
  書かれていません。
- 運用との齟齬: 本リポジトリは commit 単位で Red → Green → Refactor を回し、実装を `bdd-coder` へ
  1 タスクずつ委譲します（`.claude/rules/bdd-cycle.md`）。委譲時に渡す「期待する振る舞い」
  「既存テストファイルのパス」「使用するテストコマンド」の材料が本文書にありません。
- 決定: `implementation.md` に §3 と並ぶ「AC Coverage」節を置き、AC を commit へ割り当てます。
  各 commit に、テストレイヤ（unit / integration / functional / system）と Green 条件を添えます。
  `fetch` のスタブは `FetchProvider` 注入に一本化し、実ネットワークを張る system テストは書きません。
- 帰結（explore Q-08 の決着）: 実 fetch を張る system テストを書かないため、
  `scripts/aplys-tester.ts` の `buildDenoArgs`（同 83）に `--allow-net` を付与しません。
  Commit 17 の付与対象は SKILL.md 4 本・shebang 3 本・`deno.json` の `test:module` に閉じます。

### GF-03 → DR-22: Phase 0 の実測を独立した測定レポートに記録し、完了時に下流を再基準化する

- 記録先の不足: Phase 0 は 3 スキーマ × 4 条件を測り、条件ごとの遵守率を記録します。
  書き戻し先とされる `specifications-structured-output.md` §4.1.1 の表は
  「実測結果 / 確定させている点 / 未確定の点」の 3 列であり、サーバ実装名・ビルド・起動オプション・
  モデル名と量子化・入力長・遵守率を置く列を持ちません。
- 版の失効: Phase 0 の成果物は structured-output §4.1.1 / §7 と index §4 の書き換えであり、
  いずれも版上げを伴います。しかし `implementation.md` の `based-on` は
  `specifications-index.md v1.2.0` のままであり、Phase 4 着手時点では実在しない版を指します。
  `deckrd-rule-document-versioning` は下流が上流の三部構成の版をピン留めする構成を採ります。
- 決定: 実測記録を `docs/.deckrd/libs/ai-backend/measurements-response-format-<date>.md` に置き、
  spec 側は結論と参照リンクのみを持たせます。Phase 0 の完了条件に、`implementation.md` の
  `based-on` と §1.2 の版表記の更新を含めます。
- Phase 依存の確定: Commit 9・Commit 10 は実測に依存しません。依存するのは Commit 11 の Step 5
  （400 から `response_format` の拒否を判別する）のみであり、Commit 11 は
  「判別できない 400 をすべて `ExitFailure` に落とす」形で先に着地させ、判別ロジックは
  実測後に差し替えます。
- 不合格時の帰結: 実測が黙殺・拒否に着地した場合、Phase 4 と Commit 11 の判別ロジックを実装せず、
  Phase 1〜3・Phase 6 第 1 巡・Phase 7 を着地させたうえでブランチを閉じます。当該サーバ実装は
  対応対象外とします（REQ-F-016 / DR-09）。

### GF-04 → DR-23: `llama/` の空モデル名をネットワークアクセス前に拒否する

- 実コードの裏づけ: `parseModel`（`model-utils.ts:35`）は `/` を含む入力について
  provider が既知であれば `{ provider, model }` を返し、`model` 側の空文字を弾きません。
  `isValidModel` は `parseModel(model) !== null` です。Commit 3 で `llama` が
  `AI_PROVIDERS` に入ると、`model: "llama/"` は `run-ai.ts:212` の検証を通過します。
- 帰結: `specifications-transport.md` §4.1 Step 5 のリクエスト構成が `model: ""` を組み立て、
  サーバへ送出されます。transport §7 はこの点を「impl 段階の入力検証に委ねる」として
  申し送りにしていました。
- 決定: llama 経路に限り、provider prefix 除去後のモデル識別子が空文字列または空白のみである場合を
  不正モデル名として拒否します。分類は `ChatlogError('UnknownModel', 'InvalidModel')` とし、
  `specifications-transport.md` §4.1 Step 2（モデル値の受理判定）で評価します。
  ネットワークアクセスは行いません。
- 非破壊の確認: 既存 5 バックエンドの provider（`claude` / `anthropic` / `openai` / `opencode` /
  `codex` / `copilot` / `google` / `antigravity`）に対する空モデル名の受理範囲は変更しません。
  判定を llama provider に限定するため、`specifications-error-handling.md` §4.3 の 4 条件の
  いずれにも該当しません。`llama/org/model` のような多段スラッシュは従来どおり受理します（同 §5）。

---

## 3. 規範度の昇格

### P-01: 「impl で決着させる Open Items」6 件を決着済みへ

`implementation.md` 末尾の Open Items は決着先の commit を持ちません。次のとおり割り当てます。

| Open Item                                   | 決着先        | 扱い                       |
| ------------------------------------------- | ------------- | -------------------------- |
| 出力契約フィールドの名称                    | Commit 7      | 命名。新規 DR を起こさない |
| llama 経路の中断側判定関数の名称と配置      | Commit 5      | 命名。新規 DR を起こさない |
| `llama/<model>` の `<model>` が空文字・空白 | Commit 3      | GF-04 → DR-23              |
| CLI バックエンド部分集合型の名称            | Commit 3      | 命名。新規 DR を起こさない |
| `fetch` のスタブ方式                        | Commit 5 / 12 | GF-02 → DR-21 が確定       |
| `project.dic` への `llama` 追加要否         | Commit 3      | 追加する（編集上の判断）   |

命名 3 件は「システムの振る舞い・アーキテクチャに影響する決定」に当たらないため、
DR 粒度の方針に従い独立した DR を起こしません。

### P-02: Commit 6 の完了条件を AC-020 の不適合条件へ広げる

- 現状の Commit 6 は「既存 `run-ai` テスト（unit / integration / system）の全通過が Green の条件」で
  止まります。これは REQ-C-002（非破壊）の条件であって、AC-020（内部境界の分離）の合否では
  ありません。
- `specifications-transport.md` §4.1.1 は AC-020 の不適合条件を 3 つ規範として持ちます。
  Commit 6 の Green 条件に、この 3 条件がいずれも成立しないことを加えます。
  (1) タイマー生成・キャンセル優先判定を経路ごとに複製していない
  (2) 中段の実装単位をモジュール外へ公開していない
  (3) 経路の判定を `_buildCommand` の呼び出しより後に置いていない
- (3) は Commit 12 で初めて満たされるため、Commit 6 では (1)(2) を、Commit 12 で (3) を判定します。

### P-03: Commit 5 の `FetchProvider` に REQ-C-005 適合の根拠を置く

- Commit 7 は出力契約フィールドについて「既存の任意フィールド追加であり既存呼び出し元が
  無改修で動く」ことを REQ-C-005 の許容範囲内である根拠として明記しています。
- Commit 5 が追加する `FetchProvider` も同じく `RunAIOptions` の任意フィールドとして受ける設計であり
  （`specifications-transport.md` §4 impl-note）、公開契約境界を広げる点で同種です。
  にもかかわらず Commit 5 には REQ-C-005 への言及がありません。
- DR-19 決定 1 が確立した判断（オプションへの任意フィールド追加は公開シグネチャの刷新に当たらない）を
  `FetchProvider` にも適用し、Commit 5 に同じ根拠を記します。新規 DR は起こしません。

---

## 4. WHEN / 条件の明示化

### W-01: 経路ラベルの値域

- Commit 6 は「後段の例外メッセージが参照する `_spec.command` を経路ラベルへ置き換える」と述べますが、
  値域を持ちません。
- 実コードの裏づけ: 後段（`run-ai.ts` の `catch`）が `_spec.command` を使うのは
  `Aborted/ExternalAbort`（同 267）と `TimedOut/Timeout`（同 270）の 2 メッセージのみです。
  他の参照はすべて `try` 本体、すなわち中段に属します。
- `AI_BACKEND_COMMAND_MAP`（`ai.const.types.ts:20`）は `antigravity` を `agy` へ写像します。
  バックエンド論理名をラベルに採ると、antigravity の当該 2 メッセージが `agy` から
  `antigravity` へ変わります。
- 確定: 経路ラベルは、CLI 経路では従来どおり CLI コマンド名（`AI_BACKEND_COMMAND_MAP` の値。
  `agy` を含む）、HTTP 経路では `llama` とします。既存メッセージの文言を保ちます。
- Source: explicit in code（`run-ai.ts:267,270` / `ai.const.types.ts:20`）。

### W-02: `ResponseSchemaViolation` と `maxRetry` ループの関係

- Commit 16 は「`runAI` の内側にリトライを足さない」と述べますが、呼び出し元のループが
  この分類を拾うかどうかに触れていません。
- `specifications-error-handling.md` §2.1.1 impl-note は「呼び出し元のリトライは
  `setfm-frontmatter` / `setfm-review` の `maxRetry` ループのみ。これは YAML パース失敗だけを
  対象としており、転送エラーはループの外へ即座に抜ける」と述べます。
- 確定: `ResponseSchemaViolation` は `runAI` が throw する転送側の例外であり、`maxRetry` ループの
  外へ抜けます。当該ファイル 1 件のみが失敗として記録され、一括処理は続行します。
  Commit 16 にこの 1 行を置きます。
- Source: explicit in spec（error-handling §2.1.1）。新規 DR を起こしません。

### W-03: ミラー同期検査の実施タイミング

- 「共有ライブラリのミラーについて」節は `--check-staged` が差分なしで通ることを各コミットが
  満たす条件として述べる一方、`--no-verify` と rebase replay での通り抜けにも言及しており、
  検査を回す主体が読み取れません。
- 確定: AC-012（`bash scripts/sync-skill-assets.sh --check-staged` が差分なしで終了する）を、
  `.config/chatlog-exporter/**` / `deno.json` / `skills/_cle-libs/**` に触れる各 commit の
  完了条件とします。Phase 末での一括検査には代えません。対象は Commit 1〜12 および Commit 17 です。
- Commit 13〜16 は呼び出し元スキル配下のみを編集するため対象外とします。Commit 18 で触れる
  設定ドキュメントが `.config/chatlog-exporter/` 配下を含む場合は対象に加えます。
- Source: implicit in context（§3.4 R-004 の割り当て範囲）。GF-02 / DR-21 の一部として扱います。

### W-04: Commit 2 の型拡張と REQ-C-002 の観測範囲

- Commit 2 は `AiModelToProvider` の `regex` エントリへ表示ラベルのフィールドを追加します。
  これは共有される型の形の変更にあたります。
- `specifications-error-handling.md` §4.3 は REQ-C-002 の不適合条件を 4 つに閉じています
  （受理範囲の縮小 / 既定モデルの変化 / kind・subindex の組の変化 / 案内文言の変更による
  既存判定の変化）。型定義の形はいずれにも該当しません。
- 確定: 任意フィールドの追加による型の拡張は REQ-C-002 の観測範囲外とします。
  Commit 2 の完了判定は、§4.3 の 4 条件が成立しないことをもって行います。
- Source: explicit in spec（error-handling §4.3）。新規 DR を起こしません。

---

## 5. Decision Records

本レビューで起こした DR は次の 4 件です。本文は `../decision-records.md` v3.1.0 にあります。

| DR    | 決定                                                                          | 由来  |
| ----- | ----------------------------------------------------------------------------- | ----- |
| DR-20 | llama 経路の可到達性を単一の commit に閉じ、Phase 6 を 2 巡に割る             | GF-01 |
| DR-21 | 検証範囲を AC 単位で割り当て、commit ごとのテスト方針を implementation が持つ | GF-02 |
| DR-22 | Phase 0 の実測を独立した測定レポートに記録し、完了時に下流を再基準化する      | GF-03 |
| DR-23 | `llama/` の空モデル名をネットワークアクセス前に拒否する                       | GF-04 |

DR 粒度の方針に従い、P-01 の命名 3 件・P-02・P-03・W-01〜W-04 は既存 DR
（DR-10 / DR-18 / DR-19）の実装側への反映、または実コード・仕様の既述の明示化として扱い、
独立した DR を起こしていません。

---

## 6. 据え置いた所見

次の 5 件は harden の対象外、または fix / spec 側の宿題として送りました。

| 所見                                                                                                        | 送り先         |
| ----------------------------------------------------------------------------------------------------------- | -------------- |
| 「観測点」が Commit 1（REQ-C-002 の 3 点）と Commit 12（注入等価性の 2 点）で別の集合を指す（explore Q-11） | fix            |
| Commit 8 の `yaml` 契約検証「各値が許容型である」の許容型の定義元がない（explore Q-13）                     | spec           |
| config-packaging §2.2 / §3.1 の型語彙 `text` が実コードの `'string'` と食い違う（explore Q-14）             | spec           |
| Phase 0 の「実運用チャンク上限に近い入力長」等の具体値（explore Q-16）                                      | Phase 0 実施時 |
| §3 Rule Coverage の割り当てが commit 本文に現れない箇所がある（R-008→Commit 11 / R-005→Commit 3）           | fix            |

`yaml` 契約の許容型と型語彙の 2 件を spec 送りにするのは、いずれも
`specifications-structured-output.md` R-008 と `specifications-config-packaging.md` が
所有する規則の内容であり、`implementation.md` 側で決めると所有権が二重化するためです。

---

## 7. レビューメタデータ

- Reviewer: AI (deckrd review --phase harden)
- Review Phase: harden
- Document Version Reviewed: `implementation.md` v1.0.0
- Upstream: `specifications-index.md` v1.2.0（transport v2.0.1 / structured-output v2.0.0 /
  error-handling v2.0.1 / config-packaging v1.2.0）/ `requirements.md` v1.6.0
- 入力レビュー: `reviews-claude-impl-explore-2026-09-04.md`
- 適用先: `decision-records.md` v3.1.0（DR-20〜DR-23）
- Repository State: commit `ff2b13121`
- Total DRs Generated: 4
