---
title: "Decision Records: libs/ai-backend"
module: "libs/ai-backend"
status: Draft
version: 3.0.2
created: "2026-09-02"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- cspell:words lmstudio ollama vLLM subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

## Index

| ID    | Decision                                                                    | 主な影響先                                  |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------- |
| DR-01 | サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く | REQ-F-001 / transport                       |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする                 | REQ-C-002 / transport                       |
| DR-03 | 失敗時は即座に throw する（fail-first）                                     | REQ-F-005, 006 / error-handling             |
| DR-04 | `response_format`（json_schema）による構造化出力をスコープに含める          | REQ-F-003, 004 / structured                 |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する   | REQ-F-008 / config-packaging                |
| DR-06 | 既知の周辺不具合を本スコープで併せて直す                                    | REQ-F-013, 014                              |
| DR-09 | 「OpenAI 互換」を実測ゲートで裏付ける                                       | REQ-F-016 / structured                      |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じ込める                   | REQ-C-006, REQ-NF-001                       |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める        | REQ-F-018 / structured                      |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする  | REQ-F-019 / transport（DR-18 が supersede） |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                              | REQ-F-010 / config-packaging                |
| DR-14 | llama 経路の識別子解決規則（URL 正規化・スキーム・prefix 照合）を確定する   | REQ-F-015, 019 / transport                  |
| DR-15 | リクエストボディを閉じた集合とし、切り詰め応答を失敗として分類する          | REQ-F-006 / transport, error                |
| DR-16 | 失敗系分類の一覧を error-handling が単独で所有する                          | REQ-F-006 / error-handling（決定 3 は撤回） |
| DR-17 | llama 経路は既存の `timeoutMs` を共有し、経路別の設定キーを設けない         | REQ-F-007 / transport                       |
| DR-18 | 失敗分類の軸をバックエンド可用性とし、中断と続行を subindex で分ける        | REQ-F-006, 019 / error-handling             |
| DR-19 | 出力契約を呼び出し単位で明示し、`runAI` は文字列返却のまま復元する          | REQ-F-003, 018 / structured                 |

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
  フォールバック値を全ファイルへ書き込むため、最も外してはならない呼び出しである。不採用
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

## 削除した Decision Records

| ID    | 旧タイトル                                                          | 削除理由                                    |
| ----- | ------------------------------------------------------------------- | ------------------------------------------- |
| DR-07 | 設計ノート §6.2（codex 一択）は採用せず、直接 HTTP 方式を選定する   | DR-01 の Alternatives Considered へ統合     |
| DR-08 | 設計ノート §6.6（モデル名エラーメッセージ修正）を本スコープに含める | DR-06（既知の周辺不具合を併せて直す）へ統合 |

削除した ID は再利用しません。

## Change History

| Date       | Version | Description                                                                                                                                 |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial release                                                                                                                             |
| 2026-09-02 | 1.1.0   | DR-09 追加、DR-03 に過負荷系ステータスの subindex 分離を追記                                                                                |
| 2026-09-02 | 1.2.0   | DR-10 追加、DR-09 に実測ゲートの合格基準と未実測実装の対象外化を追記                                                                        |
| 2026-09-02 | 1.3.0   | DR-11〜DR-13 追加（harden レビュー所見の反映: YAML 契約への構造化出力強制、llamaEndpoint 未設定時の設定エラー、`--allow-net` の無制限付与） |
| 2026-09-02 | 2.0.0   | 整理: DR-07 を DR-01 へ、DR-08 を DR-06 へ統合し 2 件を削除、DR-06 を「既知の周辺不具合を併せて直す」に再定義、Index と削除記録を追加       |
| 2026-09-02 | 2.1.0   | DR-14 追加（spec harden レビュー: llama 経路の識別子解決規則を確定）                                                                        |
| 2026-09-02 | 2.2.0   | DR-15 追加（spec harden レビュー: リクエストボディの閉じた集合と切り詰め応答の分類）                                                        |
| 2026-09-02 | 2.3.0   | DR-16 追加（spec harden レビュー: 失敗系分類の一覧を error-handling が単独所有）                                                            |
| 2026-09-02 | 2.4.0   | DR-17 追加（spec harden レビュー: llama 経路は既存 `timeoutMs` を共有）                                                                     |
| 2026-09-02 | 2.5.0   | DR-18 / DR-19 追加（codex risk・balanced・consistency レビュー: 失敗分類をバックエンド可用性の軸へ、出力契約を呼び出し単位で明示）          |
| 2026-09-02 | 3.0.0   | DR-16 決定 3 を撤回し新 subindex 2 件の新設と `ExitFailure` の分割へ、DR-12 を DR-18 で supersede（`kind` を `AiError` へ）                 |
| 2026-09-02 | 3.0.1   | DR-11 の Context を実態（6 呼び出し / 3 契約）へ訂正、DR-03 / DR-15 / DR-17 に据え置きの理由と再検討トリガーを記録                          |
| 2026-09-03 | 3.0.2   | 本文をですます体へ統一し textlint 指摘を解消（内容変更なし）                                                                                |
