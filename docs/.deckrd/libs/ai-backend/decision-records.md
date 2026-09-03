---
title: "Decision Records: libs/ai-backend"
module: "libs/ai-backend"
status: Draft
version: 3.3.1
created: "2026-09-02"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- cspell:words lmstudio ollama vLLM subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  @textlint-ja/ai-writing/no-ai-list-formatting,
  -->

## Index

| ID    | Decision                                                                    | 主な影響先                                                    |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| DR-01 | サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く | REQ-F-001 / transport                                         |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする                 | REQ-C-002 / transport                                         |
| DR-03 | 失敗時は即座に throw する（fail-first）                                     | REQ-F-005, 006 / error-handling                               |
| DR-04 | `response_format`（json_schema）による構造化出力をスコープに含める          | REQ-F-003, 004 / structured                                   |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する   | REQ-F-008 / config-packaging                                  |
| DR-06 | 既知の周辺不具合を本スコープで併せて直す                                    | REQ-F-013, 014                                                |
| DR-09 | 「OpenAI 互換」を実測ゲートで裏付ける                                       | REQ-F-016 / structured                                        |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じ込める                   | REQ-C-006, REQ-NF-001                                         |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める        | REQ-F-018 / structured                                        |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする  | REQ-F-019 / transport（DR-18 が supersede）                   |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                              | REQ-F-010 / config-packaging                                  |
| DR-14 | llama 経路の識別子解決規則（URL 正規化・スキーム・prefix 照合）を確定する   | REQ-F-015, 019 / transport                                    |
| DR-15 | リクエストボディを閉じた集合とし、切り詰め応答を失敗として分類する          | REQ-F-006 / transport, error                                  |
| DR-16 | 失敗系分類の一覧を error-handling が単独で所有する                          | REQ-F-006 / error-handling（決定 3 は撤回）                   |
| DR-17 | llama 経路は既存の `timeoutMs` を共有し、経路別の設定キーを設けない         | REQ-F-007 / transport                                         |
| DR-18 | 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける        | REQ-F-006, 019 / error-handling                               |
| DR-19 | 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま復元する          | REQ-F-003, 018 / structured                                   |
| DR-20 | llama 経路の可到達性を単一の commit に閉じ、Phase 6 を 2 巡に割る           | impl Phase 4〜6 / REQ-F-018                                   |
| DR-21 | 検証範囲を AC 単位で割り当て、commit ごとのテスト方針を impl が持つ         | impl 全 commit / AC-012, 020                                  |
| DR-22 | Phase 0 の実測を独立レポートに記録し、完了時に下流を再基準化する            | REQ-F-016 / structured, impl Phase 0                          |
| DR-23 | `llama/` の空モデル名をネットワークアクセス前に拒否する                     | REQ-F-014 / transport §4.1 Step 2                             |
| DR-24 | 可到達性の境界にネットワーク権限を含め、実測不合格時の着地範囲を確定する    | impl Phase 8〜9（DR-22 決定 4 を supersede）                  |
| DR-25 | 実測ゲートの合格線を全条件 100% とし、finish_reason を測定項目に加える      | REQ-F-016 / structured §4.2                                   |
| DR-26 | llama 経路の失敗分類に runtime 由来の失敗と非 JSON 応答を加える             | REQ-F-006 / error-handling §4.1, structured R-008             |
| DR-27 | llama 経路の検証にキャンセルシグナルの受け渡しと契約指定の静的検査を加える  | REQ-F-007, 018 / AC-008, 013（DR-26 Non-Goal を一部引き取り） |

DR-07 / DR-08 は v2.0.0 で削除しました（末尾「削除した Decision Records」を参照）。
削除した ID は再利用しません。

---

## DR-01: サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く

**Status**: Accepted

**Context**: LAN 上の llama サーバの実装候補（llama.cpp server / Ollama / LM Studio / vLLM）は
それぞれ固有 API を持つ場合があるが、いずれも OpenAI 互換 `/v1/chat/completions` を共通で実装しています。
一方、設計ノート（`docs/.deckrd/notes/2026-08-20T2128-runai-json-schema.md`）§6.2 は
「ローカル LLM とスキーマ強制の両立は codex CLI（`--oss --local-provider lmstudio|ollama`）一択」と
結論しており、経路の選定にはこの結論を採るかどうかの判断が含まれます。

**Decision**: OpenAI 互換 `/v1/chat/completions` を唯一のワイヤフォーマットとして採用し、
`fetch` により LAN 上のサーバへ直接 HTTP リクエストを送ります。

**Alternatives Considered**:

- サーバ固有 API（例: Ollama native API）を直接使う — サーバ実装を差し替えた際に壊れるため不採用
- codex CLI 経由（設計ノート §6.2 の結論）— 次の 2 点により不採用
  - OpenAI 互換 `response_format` がワイヤ上で直接使えるため、DR-04 の要求を codex を介さず満たせる
  - `--local-provider` は localhost を前提としており、LAN 上の別マシンで動くサーバに向かない

**Consequences**: `response_format`（json_schema）もこのワイヤ上で使えるため DR-04 の前提となります。
codex CLI の `--oss` 経路が持つ副次的な機能は本方式では利用できません。
将来 codex 経由方式が必要になった場合は別途 Decision Record を起こします。

---

## DR-02: 既存 5 バックエンドと独立な選択可能な追加バックエンドとする

**Status**: Accepted

**Context**: 既存の claude / codex / copilot / opencode / antigravity の動作・既定モデルは
変更しないことが求められています。

**Decision**: llama を `AiBackend` の選択肢に追加するが、既存 5 種の挙動・既定値には一切手を入れません。

**Alternatives Considered**: 既定バックエンドを llama に切り替える案は要求外のため検討しません。

**Consequences**: `AI_BACKEND_COMMAND_MAP`（CLI コマンド前提）にはそのまま追加できないため、
HTTP 分岐は `_buildCommand` の外、`runAI` 内で行います（C-4）。

---

## DR-03: 失敗時は即座に throw する（fail-first）

**Status**: Accepted（429 / 503 / 504 の一括 `RateLimit` は据え置き。下記「再検討トリガー」を参照）

**Context**: 既存の fail-first 原則（コーディング規約）と、ヒアリングでの明示回答。

**Decision**: 接続失敗・HTTP エラーはリトライ・フォールバックせず、即座に `ChatlogError` を throw します。
そのうえで、過負荷系ステータス（429 / 503 / 504）は `subindex: RateLimit`、それ以外の HTTP エラーおよび
接続失敗は `subindex: ExitFailure` として区別します。

**Alternatives Considered**:

- claude へのフォールバック — ローカル完結という導入目的に反するため不採用
- `runAI` 内でのリトライ — 上記の subindex 分離により、既存の `isRateLimitError` を通じて
  `runChunked`（chunkSize 10 / concurrency 4 の並列実行）が自ら過負荷を作り続けずに中断できるため不要
- エラーを一律に同じ subindex で扱う — 恒久的な設定ミス（404、不正な endpoint 等）を
  回復可能と誤認させるため不採用

**Consequences**: 呼び出し側（4 スキル）はエラー発生時にユーザーへ即座に通知される前提でかまいません。
サーバの起動・モデルロードは運用側の責務となります（`runAI` は待ちません）。
ローカル LLM サーバでは cold start・モデルロード中・VRAM 不足・キュー詰まりが 503 / 504 として現れるため、
これらを 429 と同種に扱うことが実運用上の要になります。

**再検討トリガー（codex risk レビューの所見に対する据え置きの記録）**:
codex は「429 / 503 / 504 の一括 `RateLimit` が、設定不備・コンテキスト長超過・プロキシ障害を
同じ状態に見せ、並列度を落とす判断を誤らせる」と指摘しました。本 DR は現状のまま据え置きます。理由は 3 点あります。

1. 実装は並列度の調整を持たず、再試行も行わない。`runChunked` は `withConcurrency` へ委譲して例外を包むだけであり、
   誤分類の代償はリトライ嵐ではなく「中断 / 続行」の取り違えに限られる
2. 429 / 503 / 504 が実際にどう返るかは REQ-F-016 の実機実測で判明する。実測は実装着手前の工程に
   既に入っており、自然な見直し点がある
3. 分類の変更は subindex の割り当て 1 箇所であり、後から直すコストが小さい

**トリガー**: 実測で、過負荷以外の事象（設定不備・コンテキスト超過・プロキシ障害）が
503 / 504 として返ると判明した場合、当該事象を DR-18 の中断・続行の軸で分類し直します。

---

## DR-04: `response_format`（json_schema）による構造化出力をスコープに含める

**Status**: Accepted

**Context**: 設計ノート §6.1 は「スキーマ強制なしのローカル対応は実用にならない」と指摘しています。
これはモデルの指示追従能力に起因する問題であり、CLI 経由か直接 HTTP かに関わらず本件にも当てはまります。

**Decision**: llama 経路に限り、OpenAI 互換 `response_format`（json_schema）を用いて出力形式を強制します。
数量制約（minItems / maxItems）はスキーマに含めません。`enum` を含む場合は「該当なし」を表す
フォールバック値を必須とします。

**Alternatives Considered**: 既存パーサ（プロンプト文字列での指示のみ）に頼る案は、
ローカルモデルでの失敗率が高く不採用（設計ノート §6.1 の主張を採用）。

**Consequences**: `runAI` に新しいオプション（スキーマ渡し）が必要になります。
適用範囲は DR-11 により YAML 契約の呼び出し元まで広がります。

---

## DR-05: 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する

**Status**: Accepted

**Context**: 既存の設定解決は `GlobalConfig`（YAML）→ CLI 引数マージの一本化された経路を持ちます。

**Decision**: `config.yaml` に `llamaEndpoint` を追加し、`model` は `llama/<model>` 形式で指定します。
環境変数・CLI フラグ経路は今回作りません。

**Alternatives Considered**: 環境変数経由の指定は、既存の設定解決順序（`GlobalConfig` → `parse-args.ts`）
に新たな経路を追加することになり複雑化するため不採用。

**Consequences**: `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` / `config.yaml` の同時更新が必須（C-5）。
未設定時の扱いは DR-12 が定めます。

---

## DR-06: 既知の周辺不具合を本スコープで併せて直す

**Status**: Accepted

**Context**: llama 導入と同じコード領域に、導入によって顕在化または悪化する既知の不具合が 2 件あります。

1. `_tryParseNonEmptyArray` の `data.length > 0` 要求により、AI が正当な空配列を返すと
   パース失敗扱いになる。ローカルモデルは空配列を返しやすい
2. `run-ai.ts:216` の不正モデル名エラーは `Valid models: opus, sonnet, haiku (or full IDs)` としか
   案内しないが、実装は `gpt-*` / `gemini-*` / `<provider>/<model>` 形式も受理している。
   設計ノート §6.6 は「ローカル系プロバイダを足すとさらに乖離が広がるため、この時点で修正する」としている

**Decision**: 両件を本スコープに含めます（REQ-F-013 / REQ-F-014）。llama provider の追加と
同一コミット圏で修正します。

**Alternatives Considered**: 別 issue への分離は、いずれも llama 導入直後に顕在化する、
または llama 導入そのものが悪化させる不具合であり、「壊した本人が直さない」状態になるため不採用。

**Consequences**: 空配列受理は共有の配列パーサへの変更であり、既存 5 バックエンドの応答にも等しく波及します。
既存 4 スキルの空配列時の処理が意図どおりかの確認を要します
（`specifications-structured-output.md` §5.1）。
`run-ai.ts:216` のメッセージ文言に依存する既存テストがあれば更新が必要になります。

---

## DR-09: 「OpenAI 互換」を実測ゲートで裏付ける

**Status**: Accepted

**Context**: DR-01 は候補サーバが OpenAI 互換 `/v1/chat/completions` と `response_format` を
同等に扱える前提に立っています。しかし「OpenAI 互換」は `/v1/chat/completions` の基本形を指すことが多く、
`response_format: { type: "json_schema" }` の厳密な形、`strict` の扱い、root schema 制約、
未対応時の挙動（無視 / 400 / 別形式 / 部分対応）までは保証しません。

**Decision**: 互換性を前提として宣言せず、REQ-F-016 として **実装着手前の実測ゲート** を要求に加えます。
合格基準は次のとおりです。

- (a) スキーマどおりの JSON が返ること
- (b) 未対応時の挙動が記録されていること
- (c) 未実測のサーバ実装、および (a) を満たさないサーバ実装は対応対象外とすること

「OpenAI 互換」を名乗ることを対応の根拠にはしません。

**Alternatives Considered**:

- 対応を前提条件として宣言し、未対応サーバはサポート外とする — 実測なしに REQ-F-003 を実装すると、
  サーバが `response_format` を黙って無視して自然文を返した場合に、既存の `parseAiJsonArray` /
  `extractYaml` に逆戻りしたうえ、fail-first 設計のため差異を吸収する場所もない
- 未対応時は既存パーサへフォールバック — DR-03 の fail-first 原則と衝突するため不採用

**Consequences**: 実装着手前に 1 回の実測作業が必要になります。対応対象サーバを増やす際は、
その都度実測が必要になります。設計ノート §5.1 も同種の実測ゲートを置いており、既存の進め方と整合します。

---

## DR-10: llama 経路を `runAI` 本体から分離した内部境界に閉じ込める

**Status**: Accepted

**Context**: REQ-C-005 が `runAI` の公開シグネチャ刷新を禁じている一方、本スコープは structured output 要求、
fetch 注入、AbortSignal 合成、モデル prefix 解釈、エラー分類を `runAI` に追加します。
このまま分岐を直書きすると、`runAI` が provider dispatcher と schema-aware client の両方を抱え、
長期の保守リスクになります。

**Decision**: 公開シグネチャは変えないまま、経路依存の処理（URL 正規化・HTTP 呼び出し・
応答解釈・スキーマ構築）を `runAI` 本体から分離した内部境界に閉じ込めます。
分割の具体形は本 DR では規定せず、`specifications-transport.md` の実装ノートに委ねます。

**Alternatives Considered**:

- 設計ノート §4 の `runAIStructured` 系による全面刷新 — REQ-C-005 に反するため不採用
- `runAI` 内に llama 分岐を直書き — 上記の保守リスクを負うため不採用

**Consequences**: 要件側は REQ-C-006（制約）と REQ-NF-001（検証基準、AC-020）で受けます。
`specifications-transport.md` は既に前段 / 中段 / 後段の 3 層分割を実装ノートとして規定しており、
本 DR はその方針を要件まで遡って裏づけるものにあたります。

---

## DR-11: YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める

**Status**: Accepted（適用単位は DR-19 が呼び出し単位へ再定義した）

**Context**: 要件 §1.1 Purpose は set-frontmatter を llama 化の対象 4 スキルに数えるが、
REQ-F-003 の当初の WHERE は JSON 配列 / オブジェクトの呼び出し元に限定されていました。
このままでは llama 経路で set-frontmatter だけがスキーマ強制なしで動き、
「強制なしのローカルモデルは実用にならない」という DR-04 の前提が崩れます。

<!-- 訂正（balanced レビュー §2）: 当初の記述は set-frontmatter を「extractYaml を使うスキル」と
     一括りにし、呼び出し箇所を 2 つと数えていたが、事実に反する。 -->

実態は `runAI` 呼び出し 6 箇所・3 契約となります。JSON 配列契約が 3 箇所
（`phase-classify-ai.ts:123` / `process-chunk.ts:86` / `segment-ai.ts:111`）、
YAML 契約が 2 箇所（`setfm-frontmatter.ts:61` / `setfm-review.ts:60`）、
**行前置テキスト契約が 1 箇所**（`setfm-type-category.ts:91`。応答を行頭 `type:` / `category:` の
前方一致で読みます）。set-frontmatter は 1 スキルで 2 種類の契約を持つため、
スキル単位では適用範囲が一意に定まりません。

**Decision**: YAML 出力を期待する呼び出し元も `response_format`（json_schema）の強制対象に含めます。
サーバから受け取った JSON を、既存の YAML 契約（`extractYaml` が返す形）へ変換して呼び出し元に返します。

**Alternatives Considered**:

- set-frontmatter を llama 対応の対象外とする — 4 スキルのローカル完結という目的を満たせないため不採用
- set-frontmatter だけプロンプト指示による YAML 出力に頼る — DR-09 の「劣化フォールバックは行わない」と
  衝突するため不採用

**Consequences**: 要件側に REQ-F-018 を新設しました。REQ-C-002 に照らし、
CLI バックエンド経由時の set-frontmatter の挙動は変えません。
本 DR が確立した「YAML 契約も対象に含める」という判断は維持されるが、対象の単位は
DR-19 が `runAI` 呼び出し単位へ再定義し、行前置テキスト契約を第 3 の契約として追加しました。

---

## DR-12: `llamaEndpoint` 未設定・空文字列はネットワークアクセス前の設定エラーとする

**Status**: Superseded by DR-18（検証時点と既定値の決定は有効。`kind` の選定のみ置き換えられた）

**Context**: `specifications-transport.md` §5 は「モデル値は llama prefix を持つが、サーバ位置が
未設定または空文字列 → 設定エラーとして扱う（ネットワークアクセス前に検出）」と既に決めている一方、
要件側に対応する規範がありませんでした（spec が要件を先取りする traceability inversion）。
検証を設定読み込み時に行うかリクエスト直前に行うかも未決でした。

**Decision**: 検証時点を「llama 経路が選択された時点・ネットワークアクセス前」に確定します。
設定の読み込み自体は成功させ（`specifications-config-packaging.md` §5 と整合）、
llama 経路が選ばれた時点で `llamaEndpoint` が未設定・絶対 URL でない場合に
`ChatlogError('InvalidFormat', 'InvalidEndpoint')` を throw します。
`llamaEndpoint` の既定値は空文字列とし、「キー省略」と「空文字列の明示」を同一の値に収束させます。

**Alternatives Considered**:

- 設定の読み込み時点で検証する — llama を使わない実行でも `llamaEndpoint` の値へ縛られることになり、
  「設定読み込み自体は成功する」と衝突するため不採用
- 検証せずリクエストを試みる — 空値やスキームなしの値では、失敗理由が設定ミスか到達不能かを
  区別できず、fail-first の診断価値が失われるため不採用
- 新しい `ChatlogError` kind（`InvalidConfig` 等）を新設する — `chatlog-error.constants.ts` に
  該当 kind はなく、kind の新設は本スコープを超えるため不採用
- `InvalidYaml` を再利用する — 同 kind は YAML の構文・スキーマ違反を読み込み時に報告する用途で
  確立しており（`UnknownKey` / `OutOfRange` / `YamlSyntaxError`）、YAML として正しい値の
  意味的な不備には合わないため不採用

**Consequences**: 要件側に REQ-F-019 を新設しました。`specifications-transport.md` §5 の該当行の
紐付け先は REQ-F-015 から REQ-F-019 へ移ります。

**Superseded の範囲（DR-18）**: 本 DR の「検証時点は llama 経路選択時・ネットワークアクセス前」
「既定値は空文字列」「新 kind を新設しない」という判断は有効なまま残ります。
置き換えられたのは、`kind` に `InvalidFormat` を選んだ部分だけとなります。
呼び出し元 6 箇所の catch は `kind==='AiError'` でない例外を「非 AI エラー」として
フォールバック値の書き込みへ落とすため、`InvalidFormat` では設定漏れが既定値の一括書き込みになります。
DR-18 はこれを `ChatlogError('AiError', 'InvalidEndpoint')` へ改めます。
`InvalidYaml` / `InvalidConfig` を採らない理由は本 DR の Alternatives のとおりで、変わりません。

---

## DR-13: `--allow-net` は宛先を限定せず無制限に付与する

**Status**: Accepted

**Context**: 付与する `--allow-net` の範囲（無制限／`--allow-net=<host>:<port>` による宛先限定）が
transport / config-packaging の双方で未決のまま残っていました。

**Decision**: 宛先を限定しない `--allow-net` を採用します。

**Alternatives Considered**: `--allow-net=<host>:<port>` で宛先を限定する案は、REQ-C-001 により
接続先が実行時に `config.yaml` からしか判明せず、SKILL.md / `deno.json` に静的に書くフラグでは
設定変更に追随できないため不採用。ユーザーが `llamaEndpoint` を変えるたびにフラグの手編集を強いることになります。

**Consequences**: 権限の過剰付与に対する緩和策は、AI を呼ぶ実行経路にのみ付与するという
REQ-F-010 の対象限定に委ねます。

---

## DR-14: llama 経路の識別子解決規則を確定する

**Status**: Accepted

**Context**: REQ-F-015 の Rationale は「正規化規則そのもの（どの形式を正とするか）は
specifications で確定させる」と判断を spec へ委譲していたが、`specifications-transport.md` R-002 は
備えるべき性質のみを述べ、規則そのものを持っていませんでした。REQ-F-015 → R-002 の紐付けがあるため、
委譲が受け取られていないことが見えにくい状態にありました。併せて、モデル値の llama prefix の照合規則と、
R-006 が言う「絶対 URL」の許容スキームも未定義でした。

**Decision**: 次の 3 点を確定します。

1. URL 正規化: サーバ位置値から末尾のスラッシュを除去し、除去後の末尾セグメントが `v1` であれば
   それも除去し、得られた基底に `/v1/chat/completions` を連結する
2. 許容スキーム: `http` または `https` を持つ絶対 URL のみを受理し、それ以外は R-006 の設定エラーとする
3. provider prefix の照合: 既存のモデル名解決と同じく大文字小文字を区別する完全一致とする

**Alternatives Considered**:

- 末尾正規化型（末尾が `/v1` でなければ `/v1` を付加する）— 採用案と同一の結果を返すが、
  連結するパスが定数として現れないため読み手が結果を予測しにくく不採用
- URL API 依存型（`new URL('v1/chat/completions', endpoint)`）— `http://host:8080/v1` と
  `http://host:8080/v1/` で結果が分かれ、REQ-F-015 が求める 4 通りの吸収を単体で満たさないため不採用
- prefix 照合で大文字・小文字を区別しない — `model-utils.ts` の `_isKnownProvider` は
  `AI_PROVIDERS` への完全一致で判定しており、緩めると既存 provider の受理範囲まで広がる。
  REQ-C-002 に照らして不採用
- スキームを限定しない — `ws://` や `file://` がその先で別種の失敗として現れ、
  R-006 の「ネットワークアクセス前に設定ミスを診断する」目的を損なうため不採用

**Consequences**: REQ-F-015 が spec へ委譲した判断が受け取られ、実装者ごとの解釈差がなくなります。
llama.cpp server / Ollama はいずれも `/v1` を持つ構成であり、同じ規則で扱えます。
`http://host:8080/v1/v1` のような二重パスは末尾 1 つのみを除去するため `/v1/v1/chat/completions` に
解決されます（この形を採る実装は現時点で確認していません）。`Llama/...` のような表記ゆれは受理されません。

---

## DR-15: リクエストボディを閉じたフィールド集合とし、切り詰め応答を失敗として分類する

**Status**: Accepted

**Context**: `specifications-transport.md` R-003 は `messages` の構成を、
`specifications-structured-output.md` R-001 は `response_format` の有無を規定するが、
それ以外のフィールドについて送る・送らないの判断がありませんでした。この空白は 2 つの穴を生んでいました。

1. `stream` を明示しないと、サーバ実装の既定値によっては要件が Out of Scope に置いた
   ストリーミング応答へ入りうる
2. `max_tokens` を明示しないと、`finish_reason: "length"` で JSON が途中で切れた応答が返る。
   HTTP ステータスは成功し、`choices[0]` も存在して本文はテキストとして取得できるため、
   error-handling R-004 と transport R-007 のいずれにも該当せず、呼び出し元のパース失敗としてしか現れない

**Decision**: リクエストボディに含めるフィールドを `model` / `messages` / `stream`（false 固定）/
`response_format`（構造化出力時のみ）の 4 つに限り、生成パラメータ（`temperature` / `top_p` /
`max_tokens` 等）は送らずサーバ既定に委ねます。そのうえで error-handling R-004 の条件に
「`finish_reason` が正常完了以外を示す」を加え、`ExitFailure` として分類します。
構造化出力を要求しない llama 呼び出しは想定せず、structured-output R-001 の条件を
「llama バックエンドが選択されている」に単純化します。

**Alternatives Considered**:

- `max_tokens` を呼び出し元ごとに決めて送り切り詰めを予防する — 送るべき値は出力契約と
  モデルのコンテキスト長の双方に依存し、spec が 4 スキル分を決める根拠がない。
  誤った値は正当な出力を切る側に倒れるため不採用
- 切り詰めに専用 subindex（`Truncated` 等）を設ける — `isRateLimitError` は
  `subindex === 'RateLimit'` のみ、`isFatalAiError` は `kind` のみを見るため呼び出し元の分岐は
  変わらない。診断は `detail` 文字列で表現できるため不採用
- 生成パラメータを開いた集合とし「列挙外はサーバ既定」とだけ書く — `stream` の既定値に関する
  判断を放棄することに等しく、Out of Scope への流入を塞げないため不採用

**Consequences**: サーバ既定によってストリーミング応答へ入る経路が塞がれ、切り詰め応答が
fail-first の対象となります。リクエストボディの形が閉じるため、REQ-F-016 の実測入力も一意に決まります。
生成パラメータを送らないため出力の揺れはサーバ側の設定でしか調整できません。
構造化出力を要求しない経路を想定しないという判断は DR-19 が引き継ぎ、`response_format` の適用を
無条件と確定させました。本 DR の Decision 末尾にある「`response_format`（構造化出力時のみ）」という
条件付きの記述も、DR-19 により無条件へ改まります。

**再検討トリガー（codex risk レビューの所見に対する据え置きの記録）**:
codex は「`max_tokens` を送らない設計は切り詰めを予防せず『壊れたら失敗にする』だけであり、
サーバ既定の `n_predict` / `max_tokens` が小さい構成では正常運用が恒常的に
`finish_reason: length` になりうる」と指摘しました。本 DR は据え置きます。
送るべき値はサーバ側の構成に依存するため、実測前に spec で固定すると誤った前提を固めることになります。
**トリガー**: REQ-F-016 の実測で、対象サーバの既定出力長が通常の入力に対して不足し
`length` 打ち切りが常態化すると判明した場合、`max_tokens` の送出を再検討します。
リクエストボディのフィールド集合が変わるため、本 DR の Decision と transport R-009 の改訂を伴います。

---

## DR-16: 失敗系分類の一覧を error-handling が単独で所有する

**Status**: Accepted（決定 3 は DR-18 により撤回。決定 1 / 2 / 4 は有効）

**Context**: `specifications-error-handling.md` §3.2 の Possible Outcomes は `AiError` の
2 つの subindex と不正モデル名のみを挙げ、`specifications-transport.md` R-006 が投げる
`ChatlogError(kind: InvalidFormat, subindex: InvalidEndpoint)` を含んでいませんでした。
一方 §2.1 は「`kind`（本仕様では常に AI エラーを表す種別）」と述べており、llama 経路全体では
成り立ちません。さらに `InvalidFormat` の語が 2 つの階層で別の意味を持つ（R-006 は `kind` として、
既存実装 `run-ai.ts` は `AiError` 配下の subindex として使います）。R-004 の専用 subindex の要否も
§7 Open Questions #1 として未決でした。

**Decision**:

1. error-handling §3.2 が llama 経路の失敗系分類の唯一の一覧を所有し、transport R-006 の
   `InvalidFormat` / `InvalidEndpoint` をそこへ再掲する
2. §2.1 の記述を「本仕様が分類する失敗は `AiError` を用いるが、経路全体では設定エラーとして `InvalidFormat` も現れる」に改める
   <!-- 注: この文面は DR-18 により再び改まった。llama 経路は `kind: InvalidFormat` を
        投げなくなったため、§2.1 は「llama 経路が投げる失敗はすべて AiError」と述べる。
        §3.2 が一覧を単独所有するという決定 2 の趣旨は維持される。 -->
3. ~~R-004 に専用 subindex を新設せず `ExitFailure` に収める（§7 Open Questions #1 を解決）~~
   **撤回（DR-18）。下記「決定 3 の撤回」を参照**
4. `InvalidFormat` の表記衝突は解消せず、§3.2 の一覧に読み分けの注記を置く

**Alternatives Considered**:

- 一覧を `specifications-index.md` に置く — index は索引とカバレッジを持つ層であり、
  規範を置くと「読めば全部わかるファイル」へ肥大するため不採用。transport §4.1 が結合順序を
  単独所有しているのと同じく、規則を持つファイルが所有する
- R-004 に専用 subindex を設ける — 呼び出し元の分岐は `kind` と `subindex === 'RateLimit'` しか
  見ないため振る舞いが変わらず不採用
- 既存実装の `AiError` / `InvalidFormat` を別名へ改める — 既存 5 バックエンドの失敗分類にあたり、
  REQ-C-002（成功・失敗の分類を変えない）に抵触するため不採用

**Consequences**: 呼び出し元が 1 ファイルで llama 経路の失敗系を把握できます。
error-handling の未決が 0 件になります。認証を要求する構成に当たった場合（401 / 403）の見え方も
同じ一覧の中で説明できます。transport R-006 の分類が 2 箇所に現れるため同期先が 1 つ増え、
`InvalidFormat` の語の衝突は注記に依存して読み分けることになります。

### 決定 3 の撤回（DR-18 / codex consistency レビュー E-07・E-08）

決定 3 の根拠は「呼び出し元の分岐は `kind` と `subindex === 'RateLimit'` しか見ないため、
subindex を増やしても振る舞いが変わらない」でした。この前提は成立しません。

`ExitFailure` には、接続失敗（中断すべき）と単一応答の使えない本文（続行すべき）が同居しています。
DR-18 が分類の軸をバックエンド可用性へ移した以上、subindex を割らない限り中断と続行を実装できません。
したがって決定 3 は撤回し、次のとおり改めます。

1. 新しい subindex を 2 件新設する — `ResponseFormatRejected`（中断）/ `ResponseSchemaViolation`（続行）
2. `ExitFailure` を原因別に分割する — 接続失敗・404 / 501・401 / 403 は `BackendUnavailable`（中断）へ移し、
   `ExitFailure` は単一応答に起因する続行側の失敗のみを表す

`ResponseSchemaViolation` を `ResponseFormatIgnored` と命名してはなりません。
単一のレスポンスから「サーバが `response_format` を黙殺した」ことと
「モデルがたまたま契約に合わない出力をした」ことは区別できません（consistency §3.1）。
黙殺は REQ-F-016 の測定結果を表す語であり、実行時の分類名ではありません。

決定 1（§3.2 が唯一の一覧を所有する）・決定 2（§2.1 の記述）・決定 4（`InvalidFormat` の注記）は
そのまま有効とします。ただし決定 1 の「単独所有」を成立させるには、structured-output が投げる
契約違反系（`ResponseSchemaViolation`）も §3.2 の一覧に載せる必要があります（consistency D-03 / E-03）。
黙殺応答は HTTP 200・本文あり・`choices[0]` あり・`finish_reason` 正常でありうるため、
現状の R-001〜R-004 のいずれにも該当しないまま §3.2 の外に落ちていました。

---

## DR-17: llama 経路は既存の `timeoutMs` を共有し、経路別の設定キーを設けない

**Status**: Accepted

**Context**: `specifications-transport.md` R-004 は「既存 CLI 経路と同一のタイムアウト・
キャンセル合成規則」を適用するとし、値には触れていません。REQ-F-007 が求めるのはセマンティクスの
一致であって値の一致ではないため、経路別の値を持つ選択肢は要件と衝突しません。一方でローカルモデルの
cold start は分単位になりうるため、既存の値（既定 120,000ms、リポジトリの `config.yaml` は
300,000ms）で足りるかどうかが暗黙の前提のまま残っていました。

**Decision**: llama 経路も既存の `timeoutMs` をそのまま用い、`llamaTimeoutMs` のような経路別の
設定キーを新設しません。cold start・モデルロード中の待ちは、DR-03 が定めた 503 / 504 の
`RateLimit` 分類で受けることを前提とします。

**Alternatives Considered**:

- `llamaTimeoutMs` を新設し未設定時は `timeoutMs` へ落とす — 設定キーの追加は
  `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` / `config.yaml` / 配布ミラーの同時更新を伴い
  （C-5 / REQ-F-011）、本スコープが `llamaEndpoint` 1 件に絞って払っているコストを 2 倍にする。
  利用者は既に `timeoutMs` を調整できるため不採用
- llama 経路の既定値だけを引き上げる — 同じキーの既定値が経路によって変わると、
  呼び出し元から見た挙動が model 値に依存して変わり、REQ-F-007 が保とうとした
  「経路の違いが挙動差として現れない」性質を損なうため不採用

**Consequences**: 設定面が広がらず、REQ-C-001 の簡潔さが保たれます。呼び出し元から見た
タイムアウトの意味も経路を問わず 1 つに保たれます。cold start が既定値を超える構成では
利用者が `timeoutMs` を手で引き上げる必要があります。応答を返さずに接続を保持し続けるサーバ実装では、
過負荷が `RateLimit` ではなく `TimedOut` として現れ、`runChunked` の中断ロジックには乗りません。

**再検討トリガー（codex risk レビューの所見に対する据え置きの記録）**:
codex は「`timeoutMs` の共有が、CLI の起動待ちと HTTP の推論待ちという性質の違う待ちを潰す」と指摘しました。
本 DR は据え置きます。実際にどれだけの待ちが必要かは REQ-F-016 の実機実測で判明し、
実測は実装着手前の工程に既に入っています。
**トリガー**: 実測で、リポジトリの現行値（300,000ms）でも cold start を吸収できない、または
接続保持型の実装で `TimedOut` が常態化すると判明した場合、`llamaTimeoutMs` の新設を再検討します。
新設は設定キーの追加を伴うため、要件（REQ-C-001 / REQ-F-011）の改訂も要します。

---

## DR-18: 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける

**Status**: Accepted

**Context**: codex risk レビュー中に、codex の指摘とは別系統の欠陥が実装読解から判明しました。
呼び出し元 6 箇所の catch は、`isRateLimitError` → `isFatalAiError` → 非 AiError はフォールバック値、
という順で分岐します。一括処理を中断するのは第 1 分岐（`isRateLimitError` 一本）に限られます。
この構造に現行の分類を当てると次の 2 つが起きます。

1. サーバ未起動・到達不能は REQ-F-006 により `ExitFailure` となり中断しない。
   全ファイルにエラーを記録したうえで処理が「完了」する
2. `llamaEndpoint` の設定漏れは DR-12 により `kind: InvalidFormat` となるため
   `isRateLimitError` も `isFatalAiError` も偽になり、最後の分岐へ落ちる。
   **設定ミスが `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` の一括書き込みとして現れる**
   （`setfm-type-category.ts:105-117` で確認）

いずれも fail-first（DR-03）が意図した挙動ではありません。原因は、分類の軸が「再試行可能か」に
置かれており、「このバックエンドは今後も使えるのか」を表現していないことにあります。

**Decision**: 失敗分類の軸を **「バックエンドが使えるか」** に変更します。

1. llama 経路が throw する `ChatlogError` の `kind` は一律 `AiError` とする。
   呼び出し元の最後の分岐（非 AiError → フォールバック値）へ落ちる経路を作らない
2. subindex を中断側と続行側に分ける。中断＝`RateLimit` / `InvalidEndpoint` /
   `BackendUnavailable` / `ResponseFormatRejected`、続行＝`ExitFailure` / `ResponseSchemaViolation`
   （割り当ての全体は REQ-F-006 の表が持つ）
3. 中断側を判定する llama 経路専用の判定関数を新設し、呼び出し元 catch の第 1 分岐を
   `isRateLimitError` との論理和へ拡げる
4. DR-12 が選んだ `kind: InvalidFormat` を本決定で置き換える（DR-12 は Superseded）

**Alternatives Considered**:

- 既存の `isFatalAiError` を中断判定に流用する — 同関数は `kind==='AiError'` のみを見るため
  続行させたい `ExitFailure` まで中断側に入る。既存 CLI 経路の 5 バックエンドは
  `ExitFailure` を続行として扱っており、REQ-C-002（既存の成功・失敗の分類を変えない）に抵触するため不採用
- 新しい判定関数を作らず既存 2 関数の組み合わせで表現する — 上と同じ理由で表現できないため不採用
- `kind` に新種別（`BackendError` 等）を新設する — 呼び出し元 6 箇所すべての catch の
  書き換えを要し、`chatlog-error.constants.ts` の kind 体系にも波及するため不採用。
  `AiError` + subindex で必要な区別は付く
- 中断・続行を呼び出し元ごとに判断させる — 同じ失敗に対する扱いがスキルごとにばらつき、
  一覧を単独所有する（DR-16 決定 1）意味が失われるため不採用

**Consequences**: 設定漏れとサーバ未起動が、処理開始直後の中断として現れます。
llama 経路専用の subindex が増えるため、DR-16 決定 3（R-004 に専用 subindex を設けない）は
維持できなくなります（同 DR で撤回します）。既存 CLI バックエンドは新 subindex を throw しないため、
新判定関数を第 1 分岐に加えても既存経路の挙動は変わりません。
呼び出し元 6 箇所の catch に手が入るため、REQ-C-002 の非破壊はテストでの確認を要します。

**Open Question**: `response_format` の拒否（中断）とコンテキスト長超過（続行）は、
サーバ実装によっては同じ HTTP 400 で返ります。応答本文のエラーメッセージを見ない限り区別できず、
区別手段は REQ-F-016 の実測結果に依存します。実測までは 400 を続行側（`ExitFailure`）の既定とし、
拒否と判別できた場合のみ `ResponseFormatRejected` に分類します。

---

## DR-19: 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま契約アダプタで復元する

**Status**: Accepted

**Context**: 3 つの論点が同一の設計判断に収束していました。

1. **適用条件の三重化**（consistency D-01）: REQ-F-003 / AC-002 は「呼び出し元が要求する場合」、
   `specifications-structured-output.md` R-001 は無条件、`specifications-transport.md` R-009 は
   「構造化出力時のみ」と、`response_format` の適用条件が 3 通りに書かれていた
2. **契約分類が実態とずれている**（balanced C-01）: structured-output §2.2 は
   「JSON 配列 / JSON オブジェクト / YAML 契約」と分類するが、実際の `runAI` 呼び出しは 6 箇所・3 契約
   （JSON 配列 3 / YAML 契約 2 / **行前置テキスト 1**）。「JSON オブジェクト」に呼び出し元は存在せず、
   spec が挙げていない行前置テキスト契約（`setfm-type-category.ts:91`）が存在する
3. **戻り値契約の衝突**（risk N-01 / balanced M-01・C-04）: R-007 は「成否と値を持つ結果オブジェクト」を
   返すと述べるが、`runAI` の公開戻り値は `string` であり REQ-C-005（公開シグネチャの維持）と衝突する。
   この論点は 2 回のレビューで連続して理由未記録のまま持ち越されていた

さらに、スキーマの渡し口は「名称が未定」ではなく、公開契約境界の問題にあたります（risk A-03）。
`RunAIOptions` に該当するフィールドが存在しません。

**Decision**:

1. `RunAIOptions` に出力契約を指定するフィールドを追加する。契約は
   `json-array` / `yaml` / `line-prefixed` の 3 種とし、REQ-F-018 の表が呼び出し元との対応を持つ
2. llama バックエンド選択時は無条件に `response_format` を適用する。契約から json_schema を
   構築するため、条件付きにする必要がない。出力契約を指定しない llama 経路の呼び出しは想定しない
3. `runAI` の公開シグネチャ（`Promise<string>`）は変えない。llama 経路の内部境界（DR-10）に
   契約アダプタを置き、受信 JSON を呼び出し元の既存パーサが解釈できる文字列表現へ復元する
4. 復元先は契約ごとに定める。`json-array` は JSON 配列文字列、`yaml` は `extractYaml` が解釈する
   YAML テキスト、`line-prefixed` は `<キー>: <値>` の行

**Alternatives Considered**:

- `runAI` の戻り値を結果オブジェクトへ変える — REQ-C-005 に抵触し、呼び出し元 6 箇所と
  既存 5 バックエンドの経路すべてに波及するため不採用
- `runAIText` と `runAIStructured` に公開関数を分割する（balanced B-7） — 内部の分離としては
  同じ形になるが、公開 API を増やすことは要件 Out of Scope（設計ノート §4 の全面導入）に含まれる。
  同じ効果を内部の契約アダプタで得られるため、公開面は増やさず内部境界に閉じる
- `setfm-type-category.ts:91` を `response_format` の対象から外す — llama 経路でだけスキーマ強制が
  効かなくなる。この呼び出しは行頭前方一致で応答を読み、一致しなければ例外も出ないまま
  フォールバック値を全ファイルへ書き込むため、最も外してはならない呼び出しにあたる。不採用
- 「JSON オブジェクト」契約を残す — 呼び出し元が 1 つも存在しない。分類から外す

**Consequences**: `response_format` の適用条件が 1 つに定まり、REQ-F-003 / R-001 / R-009 の
三重化が解消します。呼び出し元 6 箇所のコードは、契約フィールドの指定を除いて変更せずに済みます。
契約アダプタが llama 経路にのみ存在する変換層として増え、契約を増やすたびに手が入ります。
契約と呼び出し元の対応表（REQ-F-018）には、呼び出しが増減するたびに更新が要ります。

**Non-Goal**: フル JSON Schema validation は行いません。応答の検証は契約ごとの
最小構造検証（on-wire contract validation）に留めます。Deno に validator は組み込まれておらず、
依存を JSR の 3 パッケージのみに保つ方針を崩さないためとします。
必要になった時点で依存追加の DR を切ります。

---

## DR-20: llama 経路の可到達性を単一の commit に閉じ、Phase 6 を 2 巡に割る

**Status**: Accepted

**Context**: `implementation.md` v1.0.0 の commit 分解には、どの仕様も定義していない中間状態が
2 つ含まれていました（impl explore レビュー G-02 / G-07）。

1. **契約なしの llama 経路**: Commit 7 が `RunAIOptions` に出力契約フィールドを追加し、
   Commit 12 が `_runViaHttp` を `runAI` へ結線しますが、6 呼び出しが契約を指定するのは
   Commit 13〜16 です。Commit 12 の着地時点で、llama 経路を通るすべての呼び出しが契約を
   持ちません。`specifications-structured-output.md` R-001 は「出力契約を指定しない llama
   呼び出しは想定しない」と述べ、`specifications-transport.md` §4.1 は Step 4（スキーマ構築）と
   Step 7.5（検証と復元）を llama 経路では常に実行するとしています。契約が無い状態で Step 4 が
   何を組み立てるかは、いずれの仕様も規定していません
2. **provider だけ登録された状態**: Commit 3 が `AI_PROVIDERS` に `llama` を足すため、
   Commit 3〜11 の期間は `model: llama/<model>` がモデル値として受理される一方、
   経路判定が未結線です

加えて Phase 6 は現状 (1) catch の中断判定拡張と (2) 出力契約の指定を同一 commit で行うため、
Phase 6 全体が Phase 4（実測ゲート依存）にぶら下がります。DR-18 が解消しようとしている不具合
（設定漏れ・サーバ未起動が全ファイルへの既定値の一括書き込みとして現れる）も、
実測が止まると同時に止まります。

**Decision**:

1. llama 経路を可到達にする commit を Commit 12（`runAI` への結線）の 1 つに限る。
   Commit 12 の着手条件を「6 呼び出しすべてが出力契約を指定済みであること」とする
2. Phase 6 を 2 巡に分割する。第 1 巡＝呼び出し元 catch の中断判定拡張（4 commit）、
   第 2 巡＝出力契約の指定（4 commit）
3. 第 1 巡を Phase 2 の直後に置き、Phase 0 の実測結果に依存させない。
   第 2 巡を Commit 12 の直前に置く
4. Commit 3〜11 の期間に `model: llama/<model>` が設定された場合、`_buildCommand`
   （`run-ai.ts:43`）の `switch` が既定分岐へ落ちる。この見え方は許容し、暫定の拒否コードを
   置かない

**Alternatives Considered**:

- 出力契約フィールドを任意のまま残し、llama 経路で未指定だった場合の扱い（throw する /
  既定契約へ落とす）を 1 行足す — 中間状態を仕様違反でない形に落とせるが、R-001 の
  「想定しない」という定めを実行時の分岐へ緩めることになり、DR-19 決定 2 が閉じた論点を再び開く。不採用
- Commit 3（provider 登録）を Commit 12 の直前まで遅らせる — 中間状態 2 を作らずに済むが、
  Commit 2 の案内文言の動的生成テストが llama を含まない形で先に固まる。
  中間状態 2 は「設定ミスが別の例外として現れる」だけで誤った成功を生まないため、
  順序を崩してまで潰す価値は薄い。不採用
- Phase 6 を現状のまま 1 巡で保ち、Phase 4 が止まったときにだけ 2 巡へ割る
  （`implementation.md` の現行案） — 分割の判断が実測の進捗に依存し、
  DR-18 の効果がいつ着地するかを事前に読めない。不採用

**Consequences**: llama 経路が「契約なしで到達可能」な期間が存在しなくなり、R-001 と §4.1 が
実装の全期間にわたって成立します。DR-18 の解消が Phase 0 の合否と独立に着地します。
一方で Phase 6 の各スキルのファイルに 2 度手が入るため、スキル単位の差分が 2 commit に分散します。
Commit 12 は 4 commit 分の先行条件を持つことになり、単独では着地できません。

---

## DR-21: 実装の検証範囲を AC 単位で割り当て、commit ごとのテスト方針を implementation が持つ

**Status**: Accepted

**Context**: `implementation.md` §3 Rule Coverage は 4 つの仕様ファイルが持つ規範規則 30 件を
commit へ割り当てますが、Acceptance Criteria（AC-001〜AC-024）の割り当てを持ちません。
「検査する」ことそのものが判定内容である AC は帰属先を失っています。該当は
AC-013（テストダブル注入による HTTP 経路の unit 検証）、AC-020（内部境界の分離の検査）、
AC-021（UTF-8 往復）、AC-022（既存テストスイート全通過）、AC-023（続行側が一括処理を止めない）、
AC-024（`type` / `category` がフォールバック値へ落ちない）の 6 件です。

テストレイヤと Green 条件も Commit 6（「既存 `run-ai` テストの全通過」）以外に書かれていません。
本リポジトリは commit 単位で Red → Green → Refactor を回し、実装を `bdd-coder` へ 1 タスクずつ
委譲する運用を採っており（`.claude/rules/bdd-cycle.md`）、委譲時に渡す「期待する振る舞い」
「既存テストファイルのパス」「使用するテストコマンド」の材料が `implementation.md` にありません。

`fetch` のスタブ方式は Open Items に残っており、`scripts/aplys-tester.ts` の `buildDenoArgs`
（同 83）へ `--allow-net` を付与するかどうかがこれに従属していました。

**Decision**:

1. `implementation.md` に §3 Rule Coverage と並ぶ「AC Coverage」節を置き、AC-001〜AC-024 を
   commit へ割り当てる。割り当ての無い AC が残った場合、それは表の欠落ではなく commit 分解の
   欠落を意味する（§3 と同じ規律を適用する）
2. 各 commit に、テストレイヤ（unit / integration / functional / system）と Green 条件を添える
3. AC-020 の合否は `specifications-transport.md` §4.1.1 の 3 つの不適合条件で判定する。
   (1)(2) を Commit 6 の、(3) を Commit 12 の Green 条件とする
4. AC-012（`bash scripts/sync-skill-assets.sh --check-staged` が差分なしで終了する）を、
   `.config/chatlog-exporter/**` / `deno.json` / `skills/_cle-libs/**` に触れる各 commit の
   完了条件とする。Phase 末での一括検査には代えない
5. llama 経路の `fetch` は `FetchProvider` 注入に一本化し、実ネットワークを張る system テストは
   書かない。したがって `scripts/aplys-tester.ts` の `buildDenoArgs` に `--allow-net` を
   付与しない。Commit 17 の付与対象は SKILL.md 4 本・shebang 3 本・`deno.json` の
   `test:module` に閉じる

**Alternatives Considered**:

- AC の割り当てを `/deckrd tasks` の出力側で作る — タスク生成が impl に無い情報を発明することになり、
  impl → tasks のトレーサビリティが切れる。不採用
- 実サーバに対する system テストを 1 本だけ置き、`buildDenoArgs` に `--allow-net` を付与する —
  LAN 上の llama サーバを CI と開発者の双方で起動する必要が生まれ、
  REQ-F-016 が「実測は実装着手前のゲート」と位置づけた区分を崩す。不採用
- 既存 `runAI` テストの `Deno.Command` グローバル差し替え方式を HTTP にも流用する —
  `fetch` を捕捉できず、`specifications-transport.md` R-005 / §4.4 が注入を前提に書かれている
  こととも合わない。不採用

**Consequences**: `/deckrd tasks` が AC 単位の検証項目を入力として受け取れるようになり、
`bdd-coder` への委譲情報が impl 側で揃います。AC-020 が実装ノートではなく commit の Green 条件として
判定できるようになります。一方で `implementation.md` に AC Coverage 節と各 commit のテスト方針が
加わるため、呼び出しや AC が増減するたびに 2 つの表を更新する手間が生じます。
実ネットワークを張るテストを持たないため、対象サーバとの実接続の担保は REQ-F-016 の実測ゲートに
一本化されます。

---

## DR-22: Phase 0 の実測を独立した測定レポートに記録し、完了時に下流文書を再基準化する

**Status**: Accepted（決定 4 は DR-24 が supersede しました）

**Context**: 2 つの論点が Phase 0（REQ-F-016 の実測ゲート）に集まっていました。

1. **記録先の容量不足**: Phase 0 は 3 スキーマ × 4 条件を測り、条件ごとの遵守率を記録します
   （`specifications-structured-output.md` §4.2）。書き戻し先とされる同 §4.1.1 の表は
   「実測結果 / 確定させている点 / 未確定の点」の 3 列であり、サーバ実装名・ビルド・
   起動オプション・モデル名と量子化・入力長・遵守率を置く列を持ちません。
   同じ論点は spec explore レビュー ALT-01 でも挙がり、そのときは記録量が 3 スキーマ分に
   留まる想定だったため §4.1.1 への書き戻しで決着していました。impl で 4 条件が加わり、
   記録量の前提が変わっています
2. **上流版の失効**: Phase 0 の成果物は structured-output §4.1.1 / §7 と index §4 の書き換えであり、
   いずれも版上げを伴います。しかし `implementation.md` の `based-on` は
   `specifications-index.md v1.2.0` のままであり、Phase 4 着手時点では実在しない版を指します。
   `deckrd-rule-document-versioning` は下流が上流の三部構成の版をピン留めする構成を採っています

加えて、Phase 5（HTTP トランスポート）が Phase 0 に依存するかどうかが
`implementation.md` に書かれていませんでした。

**Decision**:

1. 実測記録を `docs/.deckrd/libs/ai-backend/measurements-response-format-<date>.md` に置く。
   再現情報（対象サーバ実装・ビルド／バージョン・起動オプション・モデル名と量子化レベル・
   入力長・3 スキーマ × 4 条件それぞれの遵守率）を持たせる。
   `specifications-structured-output.md` §4.1.1 は結論と当該レポートへの参照リンクのみを持つ
2. Phase 0 の完了条件に、`implementation.md` の frontmatter `based-on` と §1.2 Reference の
   版表記を、書き換え後の仕様の版へ更新することを含める
3. Phase 5 のうち Phase 0 に依存するのは Commit 11 の Step 5（HTTP 400 から `response_format` の
   拒否を判別する）のみとする。Commit 9・Commit 10 は依存しない。Commit 11 は
   「判別できない 400 をすべて `ExitFailure`（続行側）に落とす」形で先に着地させ、
   判別ロジックは実測後に差し替える
4. 実測が黙殺・拒否に着地した場合、Phase 4 と Commit 11 の判別ロジックを実装せず、
   Phase 1〜3・Phase 6 第 1 巡・Phase 7 を着地させたうえでブランチを閉じる。
   当該サーバ実装は対応対象外とし、degraded 運転は提供しない（REQ-F-016 / DR-09）

**Alternatives Considered**:

- 実測結果を `specifications-structured-output.md` §4.1.1 の表へそのまま書き戻す
  （spec explore ALT-01 の現行決着） — 再現情報の置き場がなく、対応サーバを増やすたびに
  実測が要る（DR-09 Consequences）ため記録が 1 件で終わらない。表が台帳として肥大する。不採用
- 実測記録を `docs/.deckrd/notes/` へ置く — 同ディレクトリは設計検討のノートを置く場所であり、
  規範文書から参照される記録の置き場としては役割が異なる。モジュール直下に置く。不採用
- Phase 5 全体を Phase 0 の後ろに置く — Commit 9（エンドポイント検証と URL 正規化）と
  Commit 10（リクエスト構築）は実測結果に一切依存しない。実測の遅れがトランスポート実装全体を
  止める理由がない。不採用

**Consequences**: 実測が「サーバ実装ごとに積み上がる台帳」として扱えるようになり、
対応サーバを増やす際に既存の記録を壊さずに追記できます。Phase 0 が遅れても止まる範囲は
Commit 11 の 1 ステップと Phase 4 に限定されます。一方で spec と測定レポートの 2 箇所を
同期させる義務が生まれ、`implementation.md` の `based-on` 更新が Phase 0 の完了条件として
増えます。

---

## DR-23: `llama/` の空モデル名をネットワークアクセス前に拒否する

**Status**: Accepted

**Context**: `specifications-transport.md` §7 は「`llama/<model>` の `<model>` が空文字・空白の
場合の扱い」を仕様では規定せず、impl 段階の入力検証へ申し送りとしていました
（codex balanced S-01）。

実コードで経路を確認しました。`parseModel`（`model-utils.ts:35`）は `/` を含む入力について
最初のスラッシュより前を provider、以降の全体をモデル名とし、provider が既知であれば
`{ provider, model }` を返します。`model` 側が空文字であっても弾きません。
`isValidModel` は `parseModel(model) !== null` として定義されています。
したがって Commit 3 で `llama` が `AI_PROVIDERS` に入ると、`model: "llama/"` は
`run-ai.ts:212` の受理判定を通過し、`specifications-transport.md` §4.1 Step 5 の
リクエスト構成が `model: ""` を組み立ててサーバへ送出します。

サーバ側の応答は実装依存であり、400 が返れば `ExitFailure`（続行）に、
モデル未指定を既定モデルへ解決する実装なら意図しないモデルでの成功になります。
いずれも原因の特定できない結果になります。

**Decision**:

1. llama 経路に限り、provider prefix を除いたモデル識別子が空文字列または空白のみで構成される
   場合を不正モデル名として拒否する
2. 分類は既存の受理判定と同じ `ChatlogError('UnknownModel', 'InvalidModel')` とする。
   `AiError` 系の新しい subindex は設けない
3. 評価位置は `specifications-transport.md` §4.1 Step 2（モデル値の受理判定）とする。
   Step 3（エンドポイントの検証と正規化）より前であり、ネットワークアクセスは行わない
4. 判定対象を llama provider に限定する。既存 5 バックエンドの provider に対する空モデル名の
   受理範囲は変更しない

**Alternatives Considered**:

- `parseModel` の一般則として空モデル名を拒否する — `openai/` のような既存 provider の入力も
  同時に拒否することになり、`specifications-error-handling.md` §4.3 の
  「llama 追加前に受理されていたモデル値が追加後に拒否される」に該当する。REQ-C-002 違反。不採用
- `ChatlogError('AiError', 'InvalidEndpoint')` として中断側に分類する — `InvalidEndpoint` は
  サーバ位置値の不備を指す語であり（`specifications-error-handling.md` §3.2）、
  モデル値の不備に流用すると分類の意味が崩れる。不採用
- 空モデル名をそのまま送出し、サーバの応答に判断を委ねる — 400 なら `ExitFailure`（続行）へ
  落ち、設定ミスが全ファイルの失敗として現れる。既定モデルへ解決する実装なら誤った成功になる。
  DR-18 が「後続もすべて同じ結果になる失敗は中断する」と定めた方針とも合わない。不採用

**Consequences**: 設定値の書き間違い（`model: llama/` のようにモデル名を書き忘れた状態）が、
ネットワークアクセスの前に既存の不正モデル名エラーとして現れます。REQ-F-014 により
案内文言は実際に受理される形式を列挙するため、利用者は `llama/<model>` の形を読み取れます。
一方で llama provider だけが空モデル名の追加検証を持つことになり、モデル値の受理判定に
provider 依存の分岐が 1 つ増えます。`llama/org/model` のような多段スラッシュは
`specifications-error-handling.md` §5 のとおり従来どおり受理します。

---

## DR-24: 可到達性の境界にネットワーク権限を含め、実測不合格時の着地範囲を確定する

**Status**: Accepted（DR-22 決定 4 を supersede します）

**Context**: codex セカンドオピニオン（balanced、2026-09-04）が、DR-20 の「llama 経路を可到達に
する commit を 1 つに限る」という決定に 2 つの穴を指摘しました。

1. **権限が経路より遅れる**: `implementation.md` v1.1.0 は結線を Commit 20、`--allow-net` の付与を
   Commit 21 に置いていました。この間の 1 commit は、仕様上 llama 経路が使えるはずなのに
   Deno のネットワーク権限が無いために実スキル実行が失敗する状態にあたります。
   この失敗をどう分類するかは、仕様と実装計画のどちらにも定義がありません。
   DR-20 が潰したのは「契約なしで到達可能」な状態であり、「権限なしで到達可能」な状態は
   同じ性質の穴として残っていました
2. **不合格時の帰結が文書内で矛盾する**: DR-22 決定 4 は実測不合格時に
   「Phase 1〜3・Phase 6 第 1 巡・Phase 7 を着地させたうえでブランチを閉じる」と述べ、
   v1.1.0 はこれを「Phase 1〜4・Phase 9 を着地」と写しました。しかし Phase 9 の着手条件は
   Phase 8 完了です。実測不合格なら Phase 5・6・8 へ進めないため、Phase 9 の着手条件は
   永久に成立しません

**Decision**:

1. `--allow-net` の付与を結線より前に置く。Phase 8 を「権限付与と結線」とし、
   Commit 20 で `--allow-net` を付与し、Commit 21 で `runAI` へ llama 経路を結線する。
   ドキュメントの Commit 22 は Phase 9 に残す
2. Commit 21（結線）の着手条件に「AI 実行経路への `--allow-net` 付与が完了していること」を
   加える。6 呼び出しすべてが出力契約を指定済みであることと合わせ、2 条件とする
3. 実測不合格時に着地させる範囲を **Phase 1（Commit 1・Commit 2）のみ** とする。
   Commit 3 以降はすべて llama バックエンドの存在を前提とするため破棄する
4. Commit 3〜19 が着地しないため、`--allow-net` の付与（Commit 20）も行わない。
   ネットワークを使う経路が存在しない状態で権限だけを広げない

**Alternatives Considered**:

- Commit 21 の位置を変えず、Commit 20 の着手条件に「`--allow-net` 付与済み」を加えるだけにする
  （codex の代替案の後半） — 着手条件と commit の並び順が食い違い、順に積むと必ず条件違反に
  なる。条件で縛るより並び順で表すほうが読み違えを生まない。不採用
- 権限不足による fetch 失敗に専用の分類を設けて中間状態を許容する — 1 commit のためだけに
  失敗分類を増やすことになる。並び順の変更で状態そのものを消せるため不要。
  なお runtime 由来の fetch 失敗の分類自体は DR-26 が別途定める
- 不合格時に Phase 3（呼び出し元 catch の中断判定拡張）まで着地させる（DR-22 決定 4 の元の案）
  — 新判定関数が真を返す subindex は llama 経路しか throw しない。llama 経路が存在しない状態で
  着地させると、恒久的に偽を返す分岐を 4 ファイルへ残すことになる。不採用
- 不合格時に Commit 22（ドキュメント）を着地させる — 対応対象外と判明したバックエンドの
  設定方法を記載することになる。不採用

**Consequences**: 「経路はあるが権限がない」という未定義の中間状態が消え、llama 経路が
可到達になる瞬間には常に権限が揃っています。実測不合格時の帰結が Phase の着手条件と
矛盾しなくなり、着地範囲が Commit 2 件に限定されて判断の余地がなくなります。
一方で Commit 20 の着地後・Commit 21 の着地前には「権限はあるが経路が未結線」という
過剰権限の状態が 1 commit 分生じます。これは REQ-F-010 が避けようとする過剰付与に当たりますが、
挙動を壊さないため、逆向きの状態より害が小さいと判断します。
DR-22 決定 4 は本 DR の決定 3・4 に置き換わります。

---

## DR-25: 実測ゲートの合格線を全条件 100% とし、finish_reason を測定項目に加える

**Status**: Accepted

**Context**: `specifications-structured-output.md` §4.2 は実測で
「各条件で『スキーマどおりの JSON が返った割合』を記録する。1 回でも準拠したことをもって
合格としない。長文時に恒常的に崩れる実装は対応対象外とする」と述べます。
しかし合格とする割合そのものは示していません。codex セカンドオピニオンが指摘したとおり、
80% / 95% / 100% のどこで線を引くかが未定のままでは、Phase 5 へ進む判断が実施者ごとに
変わります。試行回数も定めていないため、遵守率の分母が固定されません。

あわせて、`specifications-error-handling.md` §4.1 R-004 (d) は `finish_reason` が `stop` 以外を
すべて失敗とし、実装固有値の実在確認を REQ-F-016 の実測に委ねています。しかし
structured-output §4.2 が挙げる測定項目は「スキーマどおりの JSON が返ったか」と
「返らない場合の挙動」の 2 点であり、`finish_reason` の実値が主対象に入っていません。

**Decision**:

1. 実測は 3 スキーマ × 4 条件の 12 組み合わせについて、各 **10 回** 試行する
2. 合格線を **全 12 組で 10/10（100%）** とする。1 組でも 10/10 に満たない場合、
   当該サーバ実装・当該モデル条件を対応対象外とする
3. 測定項目に `finish_reason` の実値分布を加える。`stop` 以外の値が観測された場合、
   その値と発生条件を測定レポートへ記録する
4. 合格・不合格の判定は測定レポート
   （`measurements-response-format-<date>.md`、DR-22 決定 1）に記録し、
   `specifications-structured-output.md` §4.2 へ本決定の合格線を反映する

**Alternatives Considered**:

- 合格線を 95% とする — 準拠率が 100% を割るということは、サーバがスキーマを構文レベルで
  強制していないことを意味する。強制していれば非準拠な出力は生成されえない。
  100% 未満を許すのは「モデルの指示追従に依存している」状態を許すことであり、
  DR-04 が「スキーマ強制なしのローカル対応は実用にならない」として排除した状態と
  区別が付かなくなる。不採用
- 試行回数を定めず「恒常的に崩れないこと」という定性判断に委ねる（現行） — §4.2 の文言は
  この形だが、Phase 5 の着手可否という二値の判断を支えられない。不採用
- 試行回数を 100 回とする — 12 組で 1200 リクエストになり、長文条件を含むため実測コストが
  実用の範囲を超える。10 回でも、非強制の実装なら長文・enum 境界の条件でほぼ確実に
  崩れが観測される。不採用

**Consequences**: Phase 5 への着手可否が測定レポートの数値だけで決まり、実施者の判断が
入りません。`finish_reason` の実装固有値が実測で判明するため、error-handling §4.1 の表を
改訂すべきかどうかを Phase 5 着手前に確定できます。一方で合格線が 100% であるため、
対応対象となるサーバ実装の範囲は狭くなります。`response_format` を部分的にしか
honour しない実装は、遵守率が高くても対象外になります。

---

## DR-26: llama 経路の失敗分類に runtime 由来の失敗と非 JSON 応答を加える

**Status**: Accepted

**Context**: codex セカンドオピニオンが、`specifications-error-handling.md` §4.1 の
Step 1〜7 と `specifications-structured-output.md` R-008 のいずれにも当たらない、
あるいは当たり方が意図と食い違う応答を 4 種類挙げました。

1. **Deno runtime 由来の fetch 失敗**: `--allow-net` 不足（`Deno.errors.NotCapable`）や
   TLS 検証失敗は、HTTP 応答が得られない点でネットワーク到達不能と同じ形をとるが、
   原因はパッケージング・環境側にある
2. **`stream: false` を無視するサーバ**: SSE / chunked / 非 JSON の本文が 2xx で返る場合、
   structured-output R-008 の共通条件（応答本文が JSON として parse できる）に落ちて
   `ResponseSchemaViolation`（続行側）になる。しかしこれはサーバが送信したフィールドを
   honour していないことを意味し、後続のすべての呼び出しも同じ結果になる
3. **`finish_reason` の欠落・`null`**: error-handling §4.1 R-004 (d) は「`stop` 以外」と
   規定するものの、値が存在しない場合を「`stop` 以外」に含めるかは明示していない
4. **`ResponseSchemaViolation` の連続発生**: 続行側であるため、サーバが実質的に契約を
   守れない状態でも一括処理が最後まで走る

**Decision**:

1. runtime 由来の fetch 失敗（権限不足・TLS 検証失敗等、HTTP 応答が一切得られないもの）は
   error-handling §4.1 Step 1 に含め、`BackendUnavailable`（中断）とする。
   `detail` に runtime 由来である旨を残し、ネットワーク到達不能と読み分けられるようにする
2. 2xx 応答のうち、本文が JSON として parse できないもの、または `Content-Type` が
   `application/json` 系でないものを `BackendUnavailable`（中断）とする。
   structured-output R-008 が投げる `ResponseSchemaViolation` は
   「JSON として parse できるが契約に適合しない」場合に限定する
3. `finish_reason` の欠落・`null` は R-004 (d) の「`stop` 以外」に含める。実装は
   `finish_reason !== 'stop'` として判定し、値の存在を前提としない
4. `ResponseSchemaViolation` の連続発生に対する閾値中断は設けない。分類は続行側のまま維持する

**Alternatives Considered**:

- 権限不足に専用の subindex を設ける — DR-18 の分類軸は「バックエンドが使えるか」であり、
  権限不足は後続のすべての呼び出しも同じ結果になる。既存の `BackendUnavailable` が
  そのまま当てはまるため、subindex を増やす理由がない。不採用
- 非 JSON 応答を `ResponseSchemaViolation`（続行）のまま扱う（現行の R-008 の読み） —
  サーバが `stream: false` を無視している状態は設定・実装の問題であり、
  1 ファイルずつ失敗を記録しながら全件を走り切ることになる。DR-18 が
  `BackendUnavailable` を分離した動機（サーバ未起動が続行側に落ちて全ファイルに
  エラーを記録したうえで「完了」していた）と同じ形にあたる。不採用
- `ResponseSchemaViolation` が N 回連続したら中断する閾値を設ける — 「何回連続したら
  バックエンドが壊れていると見なすか」という推測を持ち込み、実行時の判断へ委ねることになる。
  structured-output §4.1 は「単一のレスポンスから黙殺は断定できない」として
  実行時の黙殺判定を明確に退けており、回数を根拠にそれを復活させることになる。
  黙殺の判定は REQ-F-016 の実測ゲートが担い、DR-25 が合格線を 100% としたことで、
  運用中に黙殺が起きるサーバは対象外になっている。不採用

**Consequences**: 環境不備（権限・TLS）とサーバ構成の不備（`stream` の無視）が、
いずれも中断側として処理開始直後に現れます。`ResponseSchemaViolation` の射程が
「JSON ではあるが契約に合わない」に限定され、分類名と実態が一致します。
一方で `specifications-error-handling.md` §4.1 と
`specifications-structured-output.md` §4.1 / R-008 の改訂を要します。改訂は Phase 5 の
着手までに行い、DR-22 決定 2 が定める Phase 0 完了時の仕様更新と同じ機会にまとめます。
`Content-Type` による判定を加えるため、ヘッダを返さないテストダブルは
`application/json` を明示する必要が生じます。

**Non-Goal**: llama 経路で出力契約が指定されなかった場合の実行時防御は本 DR の対象外とします。
DR-20 が commit の並び順で「契約なしの呼び出しが実在する期間」を消しており、
API 境界としての防御を足すかどうかは別途判断します。

---

## DR-27: llama 経路の検証にキャンセルシグナルの受け渡しと契約指定の静的検査を加える

**Status**: Accepted（DR-26 Non-Goal の一部を引き取ります）

**Context**: codex セカンドオピニオン（completeness、2026-09-04）が、`implementation.md` v1.2.0 の
Green 条件に 2 つの穴を指摘しました。いずれも「検証がすり抜ける」種類の欠落であり、
実装方針そのものの誤りではありません。

1. **キャンセルシグナルの受け渡しが検証されない**: Commit 21 の Green 条件は
   「`timeoutMs=0` でタイマーが設定されず、外部 abort が `Aborted/ExternalAbort` として
   扱われること」です。これは後段の **分類** だけを見ています。既存 CLI 経路は
   `run-ai.ts:230` で `signal: AbortSignal.any(_signals)` を `Deno.Command` へ渡しており、
   HTTP 経路では `RequestInit.signal` が同じ役割を負います。ここを渡し忘れても、
   後段の分類は `_controller.signal.aborted` / `_options.signal?.aborted` を見るだけなので
   期待どおりの例外が throw され、テストは通過します。結果として、応答を返さないまま
   接続を保持する llama サーバに対して `timeoutMs` が効かない実装が Green になります。
   REQ-F-007 / AC-008 / transport R-004 が求めているのは分類の一致ではなく
   セマンティクスの一致であり、現在の Green 条件はそれを判定できません
2. **契約指定の前提を時間に対して守る手段がない**: DR-20 は「6 呼び出しすべてが出力契約を
   指定済みであること」を Commit 21 の着手条件に置き、commit の並び順で
   「契約なしの llama 呼び出しが実在する期間」を消しました。しかし Phase 1〜7 の間に
   production の `runAI` 呼び出しが増えれば、その呼び出しは契約を持たないまま
   Commit 21 で可到達になります。「6 箇所」という数は本文書と要件 REQ-F-018 の表に
   書かれているだけで、実コードに対して検査されていません

**Decision**:

1. Commit 21 の Green 条件に、`FetchProvider` が受け取る `RequestInit` の `signal` が
   合成済みの `AbortSignal` であることを加える。渡されていないことをもって不適合とする
2. 同 Green 条件に、タイムアウト発火時に `FetchProvider` が受け取った `signal` が abort 状態へ
   遷移すること、および外部 abort 時も同様であることを加える。分類
   （`TimedOut/Timeout` / `Aborted/ExternalAbort`）の検証はこれと併せて行い、
   分類だけでは合格としない
3. Commit 21 の Green 条件に、production コード（`*.spec.ts` を除く）の `runAI(` 呼び出しを
   静的に列挙し、全件が出力契約を指定していることの検査を加える
4. 決定 3 の検査は Commit 21 限りの確認ではなく、system レイヤのテストとして残す。
   AC-011（`--allow-net` の付与範囲）と同じく、ソースを走査する静的検査として実装する

**Alternatives Considered**:

- 決定 1・2 を integration テストで実サーバのハングを再現して確認する — 応答を返さない
  サーバを用意する必要があり、DR-21 決定 5 が定めた「実ネットワークを張る system テストは
  書かない」方針に反する。`FetchProvider` が受け取る `signal` を観測すれば同じことを
  ネットワークなしで判定できる。不採用
- 出力契約フィールドを必須化し、型で契約なしの呼び出しを不可能にする — CLI バックエンドの
  呼び出しも契約指定を強いられる。契約は llama 経路でのみ意味を持つため、
  REQ-C-002（既存バックエンドの非破壊）に対して過剰な変更にあたる。不採用
- llama 経路で契約が未指定だった場合に実行時例外を throw する（DR-26 Non-Goal が
  保留した案） — 静的検査は開発時に落ちるのに対し、実行時例外は利用者の実行中に現れる。
  検査で先に捕らえられる問題へ実行時の分岐を足す理由がない。ただし静的検査を
  すり抜ける経路（動的に組み立てたオプション等）が現れた場合は再検討する
- 「6 箇所」という数そのものをテストで固定する — 呼び出しが正当に増減するたびに
  テストが落ちる。検査すべきは件数ではなく「全件が契約を持つこと」にあたる。不採用

**Consequences**: `signal` の受け渡し漏れという、分類テストではすり抜ける実装ミスが
Commit 21 の Green 条件で捕らえられます。production の `runAI` 呼び出しが増えたとき、
契約指定の漏れが system テストの失敗として開発時に現れます。DR-20 が commit の並び順で
確立した前提が、以降の変更に対しても維持されます。
一方で、将来 CLI バックエンド専用の `runAI` 呼び出しを足す場合も出力契約の指定を
求められます。これは過剰な制約になりうるため、そのような呼び出しが実際に現れた時点で
検査対象の絞り込みを再検討します。

---

## 削除した Decision Records

| ID    | 旧タイトル                                                          | 削除理由                                    |
| ----- | ------------------------------------------------------------------- | ------------------------------------------- |
| DR-07 | 設計ノート §6.2（codex 一択）は採用せず、直接 HTTP 方式を選定する   | DR-01 の Alternatives Considered へ統合     |
| DR-08 | 設計ノート §6.6（モデル名エラーメッセージ修正）を本スコープに含める | DR-06（既知の周辺不具合を併せて直す）へ統合 |

削除した ID は再利用しません。

## Change History

| Date       | Version | Description                                                                                                                                                                                                                             |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial release                                                                                                                                                                                                                         |
| 2026-09-02 | 1.1.0   | DR-09 追加、DR-03 に過負荷系ステータスの subindex 分離を追記                                                                                                                                                                            |
| 2026-09-02 | 1.2.0   | DR-10 追加、DR-09 に実測ゲートの合格基準と未実測実装の対象外化を追記                                                                                                                                                                    |
| 2026-09-02 | 1.3.0   | DR-11〜DR-13 追加（harden レビュー所見の反映: YAML 契約への構造化出力強制、llamaEndpoint 未設定時の設定エラー、`--allow-net` の無制限付与）                                                                                             |
| 2026-09-02 | 2.0.0   | 整理: DR-07 を DR-01 へ、DR-08 を DR-06 へ統合し 2 件を削除、DR-06 を「既知の周辺不具合を併せて直す」に再定義、Index と削除記録を追加                                                                                                   |
| 2026-09-02 | 2.1.0   | DR-14 追加（spec harden レビュー: llama 経路の識別子解決規則を確定）                                                                                                                                                                    |
| 2026-09-02 | 2.2.0   | DR-15 追加（spec harden レビュー: リクエストボディの閉じた集合と切り詰め応答の分類）                                                                                                                                                    |
| 2026-09-02 | 2.3.0   | DR-16 追加（spec harden レビュー: 失敗系分類の一覧を error-handling が単独所有）                                                                                                                                                        |
| 2026-09-02 | 2.4.0   | DR-17 追加（spec harden レビュー: llama 経路は既存 `timeoutMs` を共有）                                                                                                                                                                 |
| 2026-09-02 | 2.5.0   | DR-18 / DR-19 追加（codex risk・balanced・consistency レビュー: 失敗分類をバックエンド可用性の軸へ、出力契約を呼び出し単位で明示）                                                                                                      |
| 2026-09-02 | 3.0.0   | DR-16 決定 3 を撤回し新 subindex 2 件の新設と `ExitFailure` の分割へ、DR-12 を DR-18 で supersede（`kind` を `AiError` へ）                                                                                                             |
| 2026-09-02 | 3.0.1   | DR-11 の Context を実態（6 呼び出し / 3 契約）へ訂正、DR-03 / DR-15 / DR-17 に据え置きの理由と再検討トリガーを記録                                                                                                                      |
| 2026-09-03 | 3.0.2   | 本文をですます体へ統一し textlint 指摘を解消（内容変更なし）                                                                                                                                                                            |
| 2026-09-04 | 3.1.0   | DR-20〜DR-23 追加（impl harden レビュー: 可到達性の commit 単一化と Phase 6 の 2 巡化、AC 単位の検証割り当て、実測レポートの独立と再基準化、空モデル名の拒否）                                                                          |
| 2026-09-04 | 3.2.0   | DR-24〜DR-26 追加（codex balanced セカンドオピニオン: 権限付与を結線の前へ移し不合格時の着地範囲を Phase 1 に限定、実測ゲートの合格線を全条件 100% に、runtime 由来の失敗と非 JSON 応答を中断側へ）。DR-22 決定 4 を DR-24 が supersede |
| 2026-09-04 | 3.3.0   | DR-27 追加（codex completeness セカンドオピニオン: `RequestInit.signal` の受け渡し検証と、production の `runAI` 呼び出しが全件出力契約を持つことの静的検査を Commit 21 の Green 条件へ）                                                |
| 2026-09-04 | 3.3.1   | textlint 指摘に伴う文言整理（内容変更なし）                                                                                                                                                                                             |
