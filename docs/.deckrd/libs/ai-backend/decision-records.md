---
title: "Decision Records: libs/ai-backend"
module: "libs/ai-backend"
status: Draft
version: 2.0.0
created: "2026-09-02"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- cspell:words lmstudio ollama vLLM subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

## Index

| ID    | Decision                                                                    | 主な影響先                      |
| ----- | --------------------------------------------------------------------------- | ------------------------------- |
| DR-01 | サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く | REQ-F-001 / transport           |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする                 | REQ-C-002 / transport           |
| DR-03 | 失敗時は即座に throw する（fail-first）                                     | REQ-F-005, 006 / error-handling |
| DR-04 | `response_format`（json_schema）による構造化出力をスコープに含める          | REQ-F-003, 004 / structured     |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する   | REQ-F-008 / config-packaging    |
| DR-06 | 既知の周辺不具合を本スコープで併せて直す                                    | REQ-F-013, 014                  |
| DR-09 | 「OpenAI 互換」を実測ゲートで裏付ける                                       | REQ-F-016 / structured          |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じ込める                   | REQ-C-006, REQ-NF-001           |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める        | REQ-F-018 / structured          |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする  | REQ-F-019 / transport           |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                              | REQ-F-010 / config-packaging    |

DR-07 / DR-08 は v2.0.0 で削除した（末尾「削除した Decision Records」を参照）。
削除した ID は再利用しない。

---

## DR-01: サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く

**Status**: Accepted

**Context**: LAN 上の llama サーバの実装候補（llama.cpp server / Ollama / LM Studio / vLLM）は
それぞれ固有 API を持つ場合があるが、いずれも OpenAI 互換 `/v1/chat/completions` を共通で実装している。
一方、設計ノート（`docs/.deckrd/notes/2026-08-20T2128-runai-json-schema.md`）§6.2 は
「ローカル LLM とスキーマ強制の両立は codex CLI（`--oss --local-provider lmstudio|ollama`）一択」と
結論しており、経路の選定にはこの結論を採るかどうかの判断が含まれる。

**Decision**: OpenAI 互換 `/v1/chat/completions` を唯一のワイヤフォーマットとして採用し、
`fetch` により LAN 上のサーバへ直接 HTTP リクエストを送る。

**Alternatives Considered**:

- サーバ固有 API（例: Ollama native API）を直接使う — サーバ実装を差し替えた際に壊れるため不採用
- codex CLI 経由（設計ノート §6.2 の結論）— 次の 2 点により不採用
  - OpenAI 互換 `response_format` がワイヤ上で直接使えるため、DR-04 の要求を codex を介さず満たせる
  - `--local-provider` は localhost を前提としており、LAN 上の別マシンで動くサーバに向かない

**Consequences**: `response_format`（json_schema）もこのワイヤ上で使えるため DR-04 の前提となる。
codex CLI の `--oss` 経路が持つ副次的な機能は本方式では利用できない。
将来 codex 経由方式が必要になった場合は別途 Decision Record を起こす。

---

## DR-02: 既存 5 バックエンドと独立な選択可能な追加バックエンドとする

**Status**: Accepted

**Context**: 既存の claude / codex / copilot / opencode / antigravity の動作・既定モデルは
変更しないことが求められている。

**Decision**: llama を `AiBackend` の選択肢に追加するが、既存 5 種の挙動・既定値には一切手を入れない。

**Alternatives Considered**: 既定バックエンドを llama に切り替える案は要求外のため検討しない。

**Consequences**: `AI_BACKEND_COMMAND_MAP`（CLI コマンド前提）にはそのまま追加できないため、
HTTP 分岐は `_buildCommand` の外、`runAI` 内で行う（C-4）。

---

## DR-03: 失敗時は即座に throw する（fail-first）

**Status**: Accepted

**Context**: 既存の fail-first 原則（コーディング規約）と、ヒアリングでの明示回答。

**Decision**: 接続失敗・HTTP エラーはリトライ・フォールバックせず、即座に `ChatlogError` を throw する。
そのうえで、過負荷系ステータス（429 / 503 / 504）は `subindex: RateLimit`、それ以外の HTTP エラーおよび
接続失敗は `subindex: ExitFailure` として区別する。

**Alternatives Considered**:

- claude へのフォールバック — ローカル完結という導入目的に反するため不採用
- `runAI` 内でのリトライ — 上記の subindex 分離により、既存の `isRateLimitError` を通じて
  `runChunked`（chunkSize 10 / concurrency 4 の並列実行）が自ら過負荷を作り続けずに中断できるため不要
- エラーを一律に同じ subindex で扱う — 恒久的な設定ミス（404、不正な endpoint 等）を
  回復可能と誤認させるため不採用

**Consequences**: 呼び出し側（4 スキル）はエラー発生時にユーザーへ即座に通知される前提でよい。
サーバの起動・モデルロードは運用側の責務となる（`runAI` は待たない）。
ローカル LLM サーバでは cold start・モデルロード中・VRAM 不足・キュー詰まりが 503 / 504 として現れるため、
これらを 429 と同種に扱うことが実運用上の要になる。

---

## DR-04: `response_format`（json_schema）による構造化出力をスコープに含める

**Status**: Accepted

**Context**: 設計ノート §6.1 は「スキーマ強制なしのローカル対応は実用にならない」と指摘している。
これはモデルの指示追従能力に起因する問題であり、CLI 経由か直接 HTTP かに関わらず本件にも当てはまる。

**Decision**: llama 経路に限り、OpenAI 互換 `response_format`（json_schema）を用いて出力形式を強制する。
数量制約（minItems / maxItems）はスキーマに含めない。`enum` を含む場合は「該当なし」を表す
フォールバック値を必須とする。

**Alternatives Considered**: 既存パーサ（プロンプト文字列での指示のみ）に頼る案は、
ローカルモデルでの失敗率が高く不採用（設計ノート §6.1 の主張を採用）。

**Consequences**: `runAI` に新しいオプション（スキーマ渡し）が必要になる。
適用範囲は DR-11 により YAML 契約の呼び出し元まで広がる。

---

## DR-05: 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する

**Status**: Accepted

**Context**: 既存の設定解決は `GlobalConfig`（YAML）→ CLI 引数マージの一本化された経路を持つ。

**Decision**: `config.yaml` に `llamaEndpoint` を追加し、`model` は `llama/<model>` 形式で指定する。
環境変数・CLI フラグ経路は今回作らない。

**Alternatives Considered**: 環境変数経由の指定は、既存の設定解決順序（`GlobalConfig` → `parse-args.ts`）
に新たな経路を追加することになり複雑化するため不採用。

**Consequences**: `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` / `config.yaml` の同時更新が必須（C-5）。
未設定時の扱いは DR-12 が定める。

---

## DR-06: 既知の周辺不具合を本スコープで併せて直す

**Status**: Accepted

**Context**: llama 導入と同じコード領域に、導入によって顕在化または悪化する既知の不具合が 2 件ある。

1. `_tryParseNonEmptyArray` の `data.length > 0` 要求により、AI が正当な空配列を返すと
   パース失敗扱いになる。ローカルモデルは空配列を返しやすい
2. `run-ai.ts:216` の不正モデル名エラーは `Valid models: opus, sonnet, haiku (or full IDs)` としか
   案内しないが、実装は `gpt-*` / `gemini-*` / `<provider>/<model>` 形式も受理している。
   設計ノート §6.6 は「ローカル系プロバイダを足すとさらに乖離が広がるため、この時点で修正する」としている

**Decision**: 両件を本スコープに含める（REQ-F-013 / REQ-F-014）。llama provider の追加と
同一コミット圏で修正する。

**Alternatives Considered**: 別 issue への分離は、いずれも llama 導入直後に顕在化する、
または llama 導入そのものが悪化させる不具合であり、「壊した本人が直さない」状態になるため不採用。

**Consequences**: 空配列受理は共有の配列パーサへの変更であり、既存 5 バックエンドの応答にも等しく及ぶ。
既存 4 スキルの空配列時の処理が意図どおりかを確認する必要がある
（`specifications-structured-output.md` §5.1）。
`run-ai.ts:216` のメッセージ文言に依存する既存テストがあれば更新が必要になる。

---

## DR-09: 「OpenAI 互換」を実測ゲートで裏付ける

**Status**: Accepted

**Context**: DR-01 は候補サーバが OpenAI 互換 `/v1/chat/completions` と `response_format` を
同等に扱える前提に立っている。しかし「OpenAI 互換」は `/v1/chat/completions` の基本形を指すことが多く、
`response_format: { type: "json_schema" }` の厳密な形、`strict` の扱い、root schema 制約、
未対応時の挙動（無視 / 400 / 別形式 / 部分対応）までは保証しない。

**Decision**: 互換性を前提として宣言せず、REQ-F-016 として **実装着手前の実測ゲート** を要求に加える。
合格基準は次のとおり。

- (a) スキーマどおりの JSON が返ること
- (b) 未対応時の挙動が記録されていること
- (c) 未実測のサーバ実装、および (a) を満たさないサーバ実装は対応対象外とすること

「OpenAI 互換」を名乗ることを対応の根拠にはしない。

**Alternatives Considered**:

- 対応を前提条件として宣言し、未対応サーバはサポート外とする — 実測なしに REQ-F-003 を実装すると、
  サーバが `response_format` を黙って無視して自然文を返した場合に、既存の `parseAiJsonArray` /
  `extractYaml` に逆戻りしたうえ、fail-first 設計のため差異を吸収する場所もない
- 未対応時は既存パーサへフォールバック — DR-03 の fail-first 原則と衝突するため不採用

**Consequences**: 実装着手前に 1 回の実測作業が必要になる。対応対象サーバを増やす際は、
その都度実測が必要になる。設計ノート §5.1 も同種の実測ゲートを置いており、既存の進め方と整合する。

---

## DR-10: llama 経路を `runAI` 本体から分離した内部境界に閉じ込める

**Status**: Accepted

**Context**: REQ-C-005 が `runAI` の公開シグネチャ刷新を禁じている一方、本スコープは structured output 要求、
fetch 注入、AbortSignal 合成、モデル prefix 解釈、エラー分類を `runAI` に追加する。
このまま分岐を直書きすると、`runAI` が provider dispatcher と schema-aware client の両方を抱え、
長期の保守リスクになる。

**Decision**: 公開シグネチャは変えないまま、経路依存の処理（URL 正規化・HTTP 呼び出し・
応答解釈・スキーマ構築）を `runAI` 本体から分離した内部境界に閉じ込める。
分割の具体形は本 DR では規定せず、`specifications-transport.md` の実装ノートに委ねる。

**Alternatives Considered**:

- 設計ノート §4 の `runAIStructured` 系による全面刷新 — REQ-C-005 に反するため不採用
- `runAI` 内に llama 分岐を直書き — 上記の保守リスクを負うため不採用

**Consequences**: 要件側は REQ-C-006（制約）と REQ-NF-001（検証基準、AC-020）で受ける。
`specifications-transport.md` は既に前段 / 中段 / 後段の 3 層分割を実装ノートとして規定しており、
本 DR はその方針を要件まで遡って裏づけるものにあたる。

---

## DR-11: YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める

**Status**: Accepted

**Context**: 要件 §1.1 Purpose は set-frontmatter を llama 化の対象 4 スキルに数えるが、
REQ-F-003 の当初の WHERE は JSON 配列 / オブジェクトの呼び出し元に限定されていた。
実コード上、set-frontmatter だけが `extractYaml` を使い（`setfm-frontmatter.ts:62`、`setfm-review.ts:62`）、
他 3 スキルは `parseAiJsonArray` を使う。このままでは llama 経路で set-frontmatter だけが
スキーマ強制なしで動き、「強制なしのローカルモデルは実用にならない」という DR-04 の前提が崩れる。

**Decision**: YAML 出力を期待する呼び出し元も `response_format`（json_schema）の強制対象に含める。
サーバから受け取った JSON を、既存の YAML 契約（`extractYaml` が返す形）へ変換して呼び出し元に返す。

**Alternatives Considered**:

- set-frontmatter を llama 対応の対象外とする — 4 スキルのローカル完結という目的を満たせないため不採用
- set-frontmatter だけプロンプト指示による YAML 出力に頼る — DR-09 の「劣化フォールバックは行わない」と
  衝突するため不採用

**Consequences**: 要件側に REQ-F-018 を新設し、REQ-F-003 の WHERE を「JSON 配列 / オブジェクト /
YAML 契約」へ広げた。REQ-C-002 に照らし、CLI バックエンド経由時の set-frontmatter の挙動は変えない。

---

## DR-12: `llamaEndpoint` 未設定・空文字列はネットワークアクセス前の設定エラーとする

**Status**: Accepted

**Context**: `specifications-transport.md` §5 は「モデル値は llama prefix を持つが、サーバ位置が
未設定または空文字列 → 設定エラーとして扱う（ネットワークアクセス前に検出）」と既に決めている一方、
要件側に対応する規範がなかった（spec が要件を先取りする traceability inversion）。
検証を設定読み込み時に行うかリクエスト直前に行うかも未決だった。

**Decision**: 検証時点を「llama 経路が選択された時点・ネットワークアクセス前」に確定する。
設定の読み込み自体は成功させ（`specifications-config-packaging.md` §5 と整合）、
llama 経路が選ばれた時点で `llamaEndpoint` が未設定・絶対 URL でない場合に
`ChatlogError('InvalidFormat', 'InvalidEndpoint')` を throw する。
`llamaEndpoint` の既定値は空文字列とし、「キー省略」と「空文字列の明示」を同一の値に収束させる。

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

**Consequences**: 要件側に REQ-F-019 を新設した。`specifications-transport.md` §5 の該当行の
紐付け先は REQ-F-015 から REQ-F-019 へ移る。

---

## DR-13: `--allow-net` は宛先を限定せず無制限に付与する

**Status**: Accepted

**Context**: 付与する `--allow-net` の範囲（無制限／`--allow-net=<host>:<port>` による宛先限定）が
transport / config-packaging の双方で未決のまま残っていた。

**Decision**: 宛先を限定しない `--allow-net` を採用する。

**Alternatives Considered**: `--allow-net=<host>:<port>` で宛先を限定する案は、REQ-C-001 により
接続先が実行時に `config.yaml` からしか判明せず、SKILL.md / `deno.json` に静的に書くフラグでは
設定変更に追随できないため不採用。ユーザーが `llamaEndpoint` を変えるたびにフラグの手編集を強いることになる。

**Consequences**: 権限の過剰付与に対する緩和策は、AI を呼ぶ実行経路にのみ付与するという
REQ-F-010 の対象限定に委ねる。

---

## 削除した Decision Records

| ID    | 旧タイトル                                                          | 削除理由                                    |
| ----- | ------------------------------------------------------------------- | ------------------------------------------- |
| DR-07 | 設計ノート §6.2（codex 一択）は採用せず、直接 HTTP 方式を選定する   | DR-01 の Alternatives Considered へ統合     |
| DR-08 | 設計ノート §6.6（モデル名エラーメッセージ修正）を本スコープに含める | DR-06（既知の周辺不具合を併せて直す）へ統合 |

削除した ID は再利用しない。

## Change History

| Date       | Version | Description                                                                                                                                 |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial release                                                                                                                             |
| 2026-09-02 | 1.1.0   | DR-09 追加、DR-03 に過負荷系ステータスの subindex 分離を追記                                                                                |
| 2026-09-02 | 1.2.0   | DR-10 追加、DR-09 に実測ゲートの合格基準と未実測実装の対象外化を追記                                                                        |
| 2026-09-02 | 1.3.0   | DR-11〜DR-13 追加（harden レビュー所見の反映: YAML 契約への構造化出力強制、llamaEndpoint 未設定時の設定エラー、`--allow-net` の無制限付与） |
| 2026-09-02 | 2.0.0   | 整理: DR-07 を DR-01 へ、DR-08 を DR-06 へ統合し 2 件を削除、DR-06 を「既知の周辺不具合を併せて直す」に再定義、Index と削除記録を追加       |
