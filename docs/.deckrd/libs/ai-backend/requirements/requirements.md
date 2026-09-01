---
title: "Requirements: LAN llama サーバの AI バックエンド化"
module: "libs/ai-backend"
status: Draft
version: 1.5.0
created: "2026-09-02"
---

<!-- cspell:words subindex -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

## 1. Overview

### 1.1 Purpose

Anthropic API のコストとレートリミットから解放され、`classify-chatlogs` / `set-frontmatter` /
`filter-chatlogs` / `normalize-chatlogs` の AI 処理をローカル完結で実行できるようにする。
そのために、LAN 上の llama サーバ（OpenAI 互換 `/v1/chat/completions` を実装するもの）を
`runAI()` の選択可能な追加バックエンドとして導入する。

### 1.2 Scope

| 領域         | 内容                                                                                   | 要件                  |
| ------------ | -------------------------------------------------------------------------------------- | --------------------- |
| 通信         | `run-ai.ts` に HTTP（OpenAI 互換 chat/completions）経路を追加する                      | REQ-F-001, 002, 007   |
| 通信         | `llamaEndpoint` の URL 正規化規則と、未設定時の設定エラーを定める                      | REQ-F-015, 019        |
| 通信         | 応答に複数の `choices` が含まれる場合の採用規則を定める                                | REQ-F-017             |
| 構造化出力   | llama 経路に限り `response_format`（json_schema）で出力形式を強制する                  | REQ-F-003, 004, 018   |
| 構造化出力   | 実装着手前に実機で `response_format` の挙動を実測する                                  | REQ-F-016             |
| エラー       | 過負荷系ステータスと恒久的失敗を subindex で区別し、いずれも即座に throw する          | REQ-F-005, 006        |
| エラー       | 不正モデル名の案内文言を実装の受理範囲に追随させる                                     | REQ-F-014             |
| 設定・配布   | `config.yaml` に `llamaEndpoint` を追加し、`model` の provider prefix で経路を選択する | REQ-F-008, 009        |
| 設定・配布   | AI を呼ぶ実行経路にのみ `--allow-net` を付与し、配布ミラーへ同期する                   | REQ-F-010, 011        |
| 既存不具合   | `parseAiJsonArray` の空配列パース失敗を修正する                                        | REQ-F-013             |
| 設計・テスト | llama 経路を `runAI` 本体から分離し、HTTP fetch を unit テストで検証可能にする         | REQ-F-012, REQ-NF-001 |

**Out of Scope**:

- 環境変数・CLI フラグによる接続先指定（`config.yaml` 経由のみ）
- llama サーバへの認証（API キー / Bearer token）の送出
- 接続失敗時のリトライ、および既存バックエンドへのフォールバック
- プロンプト（`.config/chatlog-exporter/prompts/*.yaml`）のバックエンド別 variant 作成
- 既存 5 バックエンド（claude / codex / copilot / opencode / antigravity）の動作変更、既定モデルの変更
- 既存 CLI バックエンドへの `response_format` 相当のスキーマ強制の適用
- OpenAI 互換 `/v1/chat/completions` 以外の経路
  （Ollama native `/api/generate`、旧 `/v1/completions`、ストリーミング応答等。DR-01 参照）
- `response_format`（json_schema）非対応と判明したサーバへの対応
  （プロンプト指示のみへの劣化フォールバックを含む。DR-09 により対応対象外とする）
- 設計ノート（`docs/.deckrd/notes/2026-08-20T2128-runai-json-schema.md`）§4 が提案する
  `runAIStructuredObject` / `runAIStructured` の全面導入（`runAI` 公開シグネチャの刷新は行わない）
- 同ノート §6.2 が結論づける「codex CLI 経由（`--oss --local-provider`）」方式の採用（DR-01 参照）

## 2. Context

- Target Environment: chatlog-exporter（Deno ランタイム）から LAN 上の llama サーバへ直接 HTTP 接続する
- Related Components:
  - `skills/_cle-libs/libs/ai/run-ai.ts`（`runAI()` 本体）
  - `skills/_cle-libs/classes/GlobalConfig.class.ts`（設定キー解決）
  - `skills/_cle-libs/constants/config-schema.constants.ts` / `.config/chatlog-exporter/config.yaml`
  - `skills/_cle-libs/libs/ai/rate-limit-utils.ts`（`isRateLimitError` / `isFatalAiError`）
  - `skills/_cle-libs/libs/text/json-utils.ts`（`parseAiJsonArray` / `_tryParseNonEmptyArray`）
  - 呼び出し元 4 スキル: classify-chatlogs, filter-chatlogs, normalize-chatlogs, set-frontmatter
  - `scripts/sync-skill-assets.sh` / `skills/setup-chatlogs/assets/**`
- Assumptions:
  - 対応対象は「OpenAI 互換」を名乗るすべてのサーバではなく、REQ-F-016 の実測ゲートを通過した実装に限る。
    候補（llama.cpp server / Ollama / LM Studio / vLLM 等）であっても、未実測の実装は対応対象外とする
  - llama サーバは認証を要求しない構成である（宅内 LAN の信頼済みネットワーク上で動作させる前提）。
    認証を要求する構成が必要になった場合は別 issue で扱う
  - `response_format`（json_schema）の対応レベルは実装ごとに異なりうる。非対応と判明したサーバは
    対応対象外とし、プロンプト指示のみへ劣化させるフォールバックは行わない（DR-03 / DR-09）

### System Context Diagram

```text
[User]  --/classify-chatlogs--> +--------------------------+
        --/set-frontmatter----> |                          | --HTTP /v1/chat/completions--> [LAN llama server]
                                |   chatlog-exporter       | <--JSON response--------------
[config.yaml] --model,URL-----> |   skills (runAI)         |
[dics/*.dic]  --語彙制約------> |                          | --spawn (既存経路)-----------> [claude / codex CLI]
                                +--------------------------+ <--stdout--------------------
                                     |            ^
                          write .md  v            |  read .md
                                  [chatlogs/ ディレクトリ]
```

<!-- ASCII diagram only. Mermaid, PlantUML, and SVG are prohibited. -->

## 3. Design Decisions (Summary)

Decision Records の本文は `../decision-records.md` にある。

| ID    | Decision                                                                    |
| ----- | --------------------------------------------------------------------------- |
| DR-01 | サーバ API 形式は OpenAI 互換 `/v1/chat/completions` とし、直接 HTTP で叩く |
| DR-02 | 既存 5 バックエンドと独立な選択可能な追加バックエンドとする                 |
| DR-03 | 失敗時は即座に throw する（fail-first。リトライ・フォールバック無し）       |
| DR-04 | `response_format`（json_schema）による構造化出力をスコープに含める          |
| DR-05 | 接続設定は `config.yaml` の新キー + `model` の provider prefix で指定する   |
| DR-06 | 既知の周辺不具合（空配列パース・モデル名案内）を本スコープで併せて直す      |
| DR-09 | 「OpenAI 互換」を実測ゲート（REQ-F-016）で裏付ける                          |
| DR-10 | llama 経路を `runAI` 本体から分離した内部境界に閉じ込める                   |
| DR-11 | YAML 出力を期待する呼び出し元も `response_format` の強制対象に含める        |
| DR-12 | `llamaEndpoint` 未設定・空文字列をネットワークアクセス前の設定エラーとする  |
| DR-13 | `--allow-net` は宛先を限定せず無制限に付与する                              |

## 4. Functional Requirements

各要件の検証内容は §8 Acceptance Criteria に一元化する。

### REQ-F-001: llama バックエンドの選択と HTTP リクエスト送信

```text
GIVEN config.yaml の model が `llama/<model>` 形式で指定されている
  WHERE llamaEndpoint が設定されている
  WHEN runAI が呼び出される
THEN the system SHALL LAN 上の llama サーバへ OpenAI 互換 `/v1/chat/completions` リクエストを HTTP 経由で送信する。
```

EARS Type: WHEN + WHERE / **AC**: AC-001

**Rationale**: ヒアリング #1・#5（OpenAI 互換 API、`config.yaml` + provider prefix による指定）。

### REQ-F-002: system / user プロンプトの分離送信

```text
GIVEN runAI が systemPrompt と userPrompt を受け取る
  WHEN llama バックエンドが選択されている
THEN the system SHALL messages 配列の system ロール要素と user ロール要素に分けて送信する。
```

EARS Type: WHEN / **AC**: AC-006

**Rationale**: プロンプトファイルの system/user 分割は chat-completions の `messages` にそのまま対応する（C-9）。

### REQ-F-003: `response_format` による構造化出力の強制

```text
GIVEN llama バックエンドが選択されている
  WHERE 呼び出し元が構造化出力（JSON 配列 / オブジェクト / YAML 契約）を要求する
THEN the system SHALL OpenAI 互換の `response_format`（json_schema）を用いて出力形式を強制する。
```

EARS Type: WHERE / **AC**: AC-002

**Rationale**: ローカルモデルは指示追従能力が低く、スキーマ強制なしでは実用にならない（設計ノート §6.1）。
YAML 契約の呼び出し元を対象に含める根拠は REQ-F-018 / DR-11 に置く。

### REQ-F-004: json_schema に数量制約を含めない

```text
GIVEN llama バックエンド向けに json_schema を構築する
  NOT DO minItems / maxItems 等の数量制約をスキーマに含める
THEN the system SHALL 数量制約を含まないスキーマを生成し、enum を含む場合はそこに「該当なし」を表すフォールバック値を含める。
```

EARS Type: NOT DO / **AC**: AC-007

**Rationale**: 数量制約を付けると入力が黙って破棄される既知の不具合を回避する（設計ノート §2.3）。

### REQ-F-005: 過負荷系 HTTP ステータスの `AiError/RateLimit` への写像

```text
GIVEN llama サーバが HTTP 429、503、または 504 を返す
  WHEN runAI が llama 経由でリクエストを送信している
THEN the system SHALL ChatlogError(kind: AiError, subindex: RateLimit) を throw する。
```

EARS Type: WHEN / **AC**: AC-005

**Rationale**: `isRateLimitError` / `isFatalAiError` の既存意味論を壊さないため（C-2）。
ローカル LLM サーバでは cold start・モデルロード中・VRAM 不足・キュー詰まりが 503 / 504 として現れ、
これらを「サーバが今は受けられない」状態として 429 と同種に扱い、`runChunked` が並列度を落として
中断するべき局面に位置づける。リトライを行わないため fail-first 原則は保たれる（REQ-C-003）。

### REQ-F-006: 接続失敗・HTTP エラー時の即時 throw（fail-first）

```text
GIVEN llama サーバへの接続が失敗する、HTTP エラーが返る、または成功ステータスでありながら
      利用できない応答（`choices` が空、本文がテキストでない等）が返る
  WHEN runAI が llama 経由でリクエストを送信している
  NOT DO リトライまたは他バックエンドへのフォールバックを行う
THEN the system SHALL 即座に ChatlogError を throw する。
     過負荷系ステータス（429 / 503 / 504）は subindex を RateLimit とし（REQ-F-005）、
     それ以外の HTTP エラーおよび接続失敗は subindex を ExitFailure とする。
```

EARS Type: NOT DO / **AC**: AC-004

**Rationale**: ヒアリング #3（fail-first 原則）。subindex を分けるのは、既存の `isRateLimitError` が
恒久的な設定ミス（404、不正な `llamaEndpoint` 等）をリトライ可能と誤認しないようにするため。
成功ステータスかつ利用できない応答を GIVEN に含めるのは、`specifications-error-handling.md` §5 が
当該ケースを `ExitFailure` として本要件に紐付けているため。

### REQ-F-007: タイムアウト / AbortSignal セマンティクスの維持

```text
GIVEN runAI に timeoutMs / signal オプションが渡される
  WHILE llama バックエンド経由で HTTP リクエストが実行中である
THEN the system SHALL 既存 CLI 経路と同じセマンティクス（timeoutMs===0 はタイマーなし、外部 abort がタイムアウトに優先）を適用する。
```

EARS Type: WHILE / **AC**: AC-008

**Rationale**: 既存 `runAI` の AbortController / タイマー実装との一貫性（C-1）。

### REQ-F-008: `llamaEndpoint` 設定キーの追加

```text
GIVEN ユーザーが config.yaml に llamaEndpoint と model: llama/<model> を設定する
  WHEN GlobalConfig が設定を読み込む
THEN the system SHALL llamaEndpoint を新規スキーマキーとして受理し、キーが省略された場合は既定値（空文字列）を解決する。
```

EARS Type: WHEN / **AC**: AC-009

**Rationale**: ヒアリング #5。`DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` の同期が必須（C-5）。
既定値を空文字列とするのは、「キー省略」と「空文字列の明示」を同一の値に収束させ、両者を
REQ-F-019 の設定エラーとして単一の分岐で扱えるようにするため。本要件が担うのは設定キーの
受理までであり、値の妥当性検証は REQ-F-019 が担う。

### REQ-F-009: `agent` キーとの分離

```text
GIVEN config.yaml に agent キー（エクスポート元エージェント）と model キー（AI バックエンド）が存在する
  NOT DO llama を agent キーの選択肢に混在させる
THEN the system SHALL llama を AI バックエンド（model）の選択肢としてのみ扱う。
```

EARS Type: NOT DO / **AC**: AC-010

**Rationale**: `agent`（エクスポート元）と AI バックエンドは別軸として扱う。

### REQ-F-010: `--allow-net` フラグの付与

```text
GIVEN llama バックエンドが HTTP fetch を行う
  WHEN 各 SKILL.md / deno.json に記載された deno run コマンドが実行される
THEN the system SHALL 下表の「AI 経路」に該当する行にのみ `--allow-net` を付与し、AI を呼ばない経路には付与しない。
```

`runAI` を呼ぶ経路（`--allow-net` 付与対象）は次のとおり。行番号は SKILL.md の編集で陳腐化するため、
ファイルと実行対象を識別子で示す。

| ファイル                             | 実行対象                                             |
| ------------------------------------ | ---------------------------------------------------- |
| `skills/classify-chatlogs/SKILL.md`  | `$SCRIPT_PATH` の実行行                              |
| `skills/filter-chatlogs/SKILL.md`    | `$SCRIPT_PATH` の実行行（KEEP/DISCARD 判定）         |
| `skills/normalize-chatlogs/SKILL.md` | `$SCRIPT_PATH` の実行行                              |
| `skills/set-frontmatter/SKILL.md`    | `$SCRIPT_PATH` の実行行 2 箇所                       |
| `deno.json`                          | `test:module` タスク（llama 経路のテストを実行する） |

`runAI` を呼ばない経路（付与対象外）は次のとおり。

| ファイル / 対象                                           | 理由                                      |
| --------------------------------------------------------- | ----------------------------------------- |
| `skills/export-chatlogs/SKILL.md` の `$SCRIPT_PATH`       | AI 不使用（JSONL を直接パース）           |
| `skills/filter-chatlogs/SKILL.md` の `$NOISE_FILTER_PATH` | noise-filter は正規表現ベースで AI 不使用 |
| `skills/filter-chatlogs/SKILL.md` の `$STRIP_PATH`        | strip サブコマンドは AI 不使用            |

EARS Type: WHEN / **AC**: AC-011

**Rationale**: 現行リポジトリに `--allow-net` は 1 箇所も存在しない。付与範囲は宛先を限定しない
`--allow-net` に確定している（DR-13）。`--allow-net=<host>:<port>` を採らないのは、REQ-C-001 により
接続先が実行時に `config.yaml` からしか判明せず、静的なフラグでは設定変更に追随できないため。
過剰付与の緩和策は、本要件の対象限定（AI 経路にのみ付与）が担う。
なお `deno run ... "$SCRIPT_PATH"` のようにフラグ列を省略した例示行は改変対象に含めない。

### REQ-F-011: `setup-chatlogs` アセットへのミラー同期

```text
GIVEN run-ai.ts / config-schema / config.yaml / deno.json のいずれかが変更される
  WHEN 変更がコミットされる
THEN the system SHALL sync-skill-assets.sh により skills/setup-chatlogs/assets 配下へ同期する。
```

EARS Type: WHEN / **AC**: AC-012

**Rationale**: lefthook の pre-commit / pre-push フックが強制する既存の同期機構（C-8）。

### REQ-F-012: fetch 呼び出しの注入可能性（テスト容易性）

```text
GIVEN llama バックエンドの HTTP 呼び出しを unit テストで検証する必要がある
  WHERE テストダブル（FetchProvider 等の注入口）が提供される
THEN the system SHALL fetch 呼び出しを注入可能な形で実装する。
```

EARS Type: WHERE / **AC**: AC-013

**Rationale**: 既存 `Deno.Command` モックは `fetch` を捕まえられないため、新しい注入点が必要（C-10）。

### REQ-F-013: `parseAiJsonArray` の空配列パース失敗の修正

```text
GIVEN AI が正当な空配列を返す
  WHEN parseAiJsonArray が呼び出される
  NOT DO data.length > 0 を要求してパース失敗として扱う
THEN the system SHALL 空配列をパース成功として返す。
```

EARS Type: NOT DO / **AC**: AC-003

**Rationale**: `_tryParseNonEmptyArray`（`json-utils.ts:10-16`）の既知バグ。
ローカルモデルは空配列を返しやすい（ヒアリング #6、DR-06）。

### REQ-F-014: モデル名エラーメッセージの実態への追随

```text
GIVEN 受理されないモデル名が指定される
  WHEN runAI が UnknownModel/InvalidModel を throw する
THEN the system SHALL 実際に受理される形式（`opus` / `sonnet` / `haiku` に加え `gpt-*`、`gemini-*`、
     `<provider>/<model>` 形式、および新設の llama provider）を案内するメッセージを含める。
```

EARS Type: WHEN / **AC**: AC-014

**Rationale**: 設計ノート §6.6。`run-ai.ts:216` の案内は `opus, sonnet, haiku` に留まり、実装が受理する
`gpt-*` / `gemini-*` / `provider/model` を反映していない。llama provider の追加は乖離をさらに広げるため、
同一スコープで直す（DR-06）。

### REQ-F-015: `llamaEndpoint` の URL 正規化

```text
GIVEN llamaEndpoint に末尾スラッシュの有無・`/v1` の有無のいずれの形式でも値が与えられる
  WHEN リクエスト URL を組み立てる
THEN the system SHALL 単一の正規化規則に従って `/v1/chat/completions` へ解決し、
     `/v1/v1/chat/completions` や `/v1chat/completions` のような不正な URL を生成しない。
```

EARS Type: WHEN / **AC**: AC-015

**Rationale**: `llamaEndpoint` の受理形式が未定義だとパス連結の典型的な失敗を招く。
正規化規則そのもの（どの形式を正とするか）は specifications で確定させる。

### REQ-F-016: `response_format` 対応の実測ゲート

```text
GIVEN 実装対象の llama サーバが特定の実装（llama.cpp server / Ollama / LM Studio / vLLM 等）である
  WHERE REQ-F-003 の実装に着手する前
THEN the system SHALL 実機に対して `response_format`（json_schema）付きリクエストを送り、
     (a) スキーマどおりの JSON が返ること、(b) 未対応時の挙動（無視 / 400 / 別形式）を実測して記録し、
     その結果を specifications に反映する。
     AND the system SHALL 実測していないサーバ実装、および (a) を満たさないサーバ実装を対応対象外として扱う
     （劣化フォールバックは行わない）。
```

EARS Type: WHERE / **AC**: AC-016

**Rationale**: 「OpenAI 互換」は `/v1/chat/completions` の基本形を指すことが多く、`response_format` の
厳密な形・`strict` の扱い・root schema 制約・未対応時の挙動までは保証しない。実測せずに REQ-F-003 を
実装すると、サーバが `response_format` を黙って無視して自然文を返し、fail-first 設計のため差異を
吸収する場所もない状態になる（DR-09）。

**注記**: THEN が「実測して記録する」と「未実測実装を対象外とする」の 2 文からなるのは、
両者が実測ゲート 1 つの表裏であり、片方だけを満たす状態に意味がないため。
別要件に分割しても常に同時に評価されるため、1 要件のまま扱う。

### REQ-F-017: 応答の `choices` 採用規則

```text
GIVEN 成功ステータスの応答に choices が複数含まれる
  WHEN llama 経路が応答から発話テキストを抽出する
THEN the system SHALL 先頭要素（choices[0]）のみを採用し、2 番目以降を無視する。
```

EARS Type: WHEN / **AC**: AC-017

**Rationale**: OpenAI 互換サーバは `n` 未指定でも複数 choices を返しうるが、`runAI` の戻り値は
単一のテキストに限られる。`choices` が空の場合と本文がテキストでない場合は REQ-F-006 の GIVEN が扱う。

### REQ-F-018: YAML 契約の呼び出し元への構造化出力の適用

```text
GIVEN llama バックエンドが選択されている
  WHERE 呼び出し元が YAML 契約（`extractYaml` が返す形）の出力を期待する
THEN the system SHALL 当該呼び出し元に対しても `response_format`（json_schema）を適用し、
     受信した JSON を既存の YAML 契約へ変換して返す。
```

EARS Type: WHERE / **AC**: AC-018

**Rationale**: DR-11。§1.1 Purpose は set-frontmatter を対象 4 スキルに数えるが、REQ-F-003 の適用範囲を
JSON 出力に限ると set-frontmatter だけがスキーマ強制なしで動き、DR-04 の前提が崩れる。
REQ-C-002 により、CLI バックエンド経由時の set-frontmatter の挙動は変えない。

### REQ-F-019: `llamaEndpoint` 未設定時の設定エラー

```text
GIVEN model が `llama/<model>` 形式で指定されている
  WHEN llama 経路が選択され、リクエスト URL を組み立てる前に llamaEndpoint を解決する
THEN the system SHALL llamaEndpoint が未設定（キー省略または空文字列）・絶対 URL でないいずれかの場合に、
     ネットワークアクセスを行う前に ChatlogError(kind: InvalidFormat, subindex: InvalidEndpoint) を throw する。
```

EARS Type: WHEN / **AC**: AC-019

**Rationale**: DR-12。設定の読み込み自体は成功させる（`specifications-config-packaging.md` §5）ため、
検証は llama 経路が選択された時点で行う。本要件における「未設定」は、config.yaml でキーが省略され
既定値の空文字列が解決された場合と、空文字列が明示的に指定された場合の双方を指す（REQ-F-008）。

## 5. Non-Functional Requirements

### REQ-NF-001: Maintainability

Implementation SHALL keep the llama route inside an internal boundary separated from the `runAI` body (REQ-C-006).

**AC**: AC-020

**Rationale**: DR-10 が経路依存の処理（URL 正規化・HTTP 呼び出し・応答解釈・スキーマ構築）の分離を
決定しており、REQ-C-006 として制約化されている。本要件はそれを検証可能な基準として引き受ける。

### REQ-NF-002: Testability

Implementation SHALL be testable（REQ-F-012 の fetch 注入点を含む）。

**AC**: AC-013（REQ-F-012 に委譲する）

### REQ-NF-003: Portability

Implementation SHALL support UTF-8 input.

**AC**: AC-021

**Rationale**: HTTP 経路における UTF-8 対応とは、リクエストボディを UTF-8 で符号化して
`Content-Type: application/json; charset=utf-8` を送り、応答本文を UTF-8 として復号することを指す。
日本語のチャットログ本文とプロンプトが両方向で欠落なく往復することが判定基準になる。

## 6. Constraints

### REQ-C-001: 接続先指定は config.yaml のみ

環境変数・CLI フラグによる接続先指定は行わない（ヒアリング #5）。

### REQ-C-002: 既存バックエンドの非破壊

既存 5 バックエンド（claude / codex / copilot / opencode / antigravity）の動作および既定モデルを
変更しない（ヒアリング #2）。**AC**: AC-022

### REQ-C-003: リトライ・フォールバック禁止

接続失敗・HTTP エラー時にリトライや他バックエンドへのフォールバックを行わない（ヒアリング #3）。

ただしこの制約は「エラーを一律に同じ subindex で扱う」ことを意味しない。過負荷系ステータスは
`RateLimit`、それ以外は `ExitFailure` として区別する（REQ-F-005 / REQ-F-006、DR-03）。これは `runAI` に
リトライを持ち込むものではなく、`runChunked` が並列度を落として中断できるようにするための分類にあたる。

### REQ-C-004: 既存 CLI バックエンドへのスキーマ強制の非適用

`response_format` 相当のスキーマ強制を既存 CLI バックエンドへ適用しない。

### REQ-C-005: `runAI` 公開シグネチャの全面刷新の禁止

設計ノート §4 が提案する `runAIStructuredObject` / `runAIStructured` の全面導入は行わない。
本制約は `runAI` の **公開シグネチャ** に対するものであり、内部実装の分離は禁じない（REQ-C-006）。

### REQ-C-006: llama 経路の内部境界の分離

`runAI` の公開シグネチャを変えないまま、経路依存の処理（URL 正規化・HTTP 呼び出し・応答解釈・
スキーマ構築）を `runAI` 本体から分離した内部境界に閉じ込める（DR-10）。どのような分割にするかは
本要件では規定しない（具体は `specifications-transport.md` の実装ノートが持つ）。

## 7. User Stories

| Story ID | Role         | Goal                                                                       | Reason                                                   | Related Requirements |
| -------- | ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| US-001   | 開発者       | config.yaml の設定だけで LAN 上の llama サーバをバックエンドとして使いたい | コストとレートリミットから解放されるため                 | REQ-F-001, REQ-F-008 |
| US-002   | 開発者       | llama 経路でも response_format によりパース失敗を防ぎたい                  | ローカルモデルは指示追従能力が低いため                   | REQ-F-003, REQ-F-004 |
| US-003   | 開発者       | llama サーバ接続失敗時は即座にエラーとして検知したい                       | サイレントなフォールバックによる誤動作を避けるため       | REQ-F-006            |
| US-004   | 運用者       | llama サーバの過負荷を既存の中断ロジックで検知したい                       | `isRateLimitError` の挙動を変えないため                  | REQ-F-005            |
| US-005   | テスト実装者 | fetch 呼び出しを注入可能にしたい                                           | unit テストで HTTP 経路を検証するため                    | REQ-F-012            |
| US-006   | 利用者       | AI が正当な空配列を返した場合でも処理が失敗しないようにしたい              | ローカルモデルは空配列を返しやすいため                   | REQ-F-013            |
| US-007   | 開発者       | set-frontmatter でも llama 経路でスキーマ強制を効かせたい                  | YAML 出力だけ漏れると 4 スキルのローカル完結が崩れるため | REQ-F-018            |
| US-008   | 運用者       | llamaEndpoint の設定漏れを設定エラーとして知らせてほしい                   | 原因の特定できない失敗を避けるため                       | REQ-F-019            |

## 8. Acceptance Criteria

```gherkin
# AC-001 / REQ-F-001
Scenario: llama バックエンド選択時のリクエスト送信
  Given config.yaml に model: llama/qwen3-14b と llamaEndpoint: http://192.168.1.10:8080/v1 が設定されている
  When  runAI が呼び出される
  Then  /v1/chat/completions への HTTP POST リクエストが送信される

# AC-002 / REQ-F-003
Scenario: 構造化出力の強制
  Given llama バックエンドが選択されており、呼び出し元が構造化出力を要求する
  When  runAI が llama サーバへリクエストを送信する
  Then  リクエストボディに response_format（json_schema）が含まれる

# AC-003 / REQ-F-013
Scenario: AI が空配列を返した場合の正常処理
  Given AI の応答が有効な JSON の空配列 "[]" である
  When  parseAiJsonArray が呼び出される
  Then  例外を投げずに空配列が返る

# AC-004 / REQ-F-006
Scenario: llama サーバ接続失敗
  Given llama サーバが起動していない、または到達不能である
  When  runAI が llama 経由でリクエストを送信する
  Then  リトライやフォールバックを行わずに ChatlogError が即座に throw される

# AC-005 / REQ-F-005
Scenario: llama サーバの過負荷系応答
  Given llama サーバが HTTP 429、503、または 504 を返す
  When  runAI が llama 経由でリクエストを送信する
  Then  いずれの場合も ChatlogError(kind: AiError, subindex: RateLimit) が throw される

# AC-006 / REQ-F-002
Scenario: プロンプトの分離送信
  Given runAI に systemPrompt と userPrompt が別々に渡される
  When  llama 経由でリクエストボディが構築される
  Then  messages 配列に role:"system" と role:"user" の 2 要素が含まれ、両者が連結されていない

# AC-007 / REQ-F-004
Scenario: 数量制約の排除
  Given 呼び出し元が配列出力の json_schema を指定する
  When  response_format が構築される
  Then  スキーマに minItems / maxItems が含まれず、enum を含む場合はフォールバック値が含まれる

# AC-008 / REQ-F-007
Scenario: タイムアウトと外部 abort の優先順位
  Given runAI に timeoutMs=0 が渡される
  When  llama 経由でリクエストが実行される
  Then  タイムアウトタイマーが設定されず、外部 signal の abort は Aborted/ExternalAbort として扱われる

# AC-009 / REQ-F-008
Scenario: 接続先の設定読み込み
  Given config.yaml に llamaEndpoint が記述されている、または記述されていない
  When  GlobalConfig が初期化される
  Then  InvalidYaml/UnknownKey を投げずに値が取得でき、キー省略時は既定値（空文字列）が使われて
        設定読み込み自体は成功する（値の妥当性検証は REQ-F-019 の責務）

# AC-010 / REQ-F-009
Scenario: agent と backend の分離
  Given config.yaml に agent: chatgpt と model: llama/qwen3-14b が設定されている
  When  runAI が呼び出される
  Then  agent の選択肢一覧に llama が含まれず、agent の値に関わらず llama バックエンドが選択される

# AC-011 / REQ-F-010
Scenario: ネットワーク権限の付与範囲
  Given REQ-F-010 が AI 経路／非 AI 経路として列挙した deno run 行
  When  それぞれのフラグ列を検査する
  Then  AI 経路の行にのみ --allow-net が含まれ、非 AI 経路の行には含まれない

# AC-012 / REQ-F-011
Scenario: ミラー同期の検証
  Given skills/_cle-libs 配下および config.yaml / deno.json を変更した
  When  bash scripts/sync-skill-assets.sh --check-staged を実行する
  Then  差分なしで終了する

# AC-013 / REQ-F-012, REQ-NF-002
Scenario: unit テストからの HTTP 経路検証
  Given テストが fetch のテストダブルを注入する
  When  llama バックエンド経由で runAI を呼び出す
  Then  実ネットワークアクセスなしにリクエスト内容と応答処理を unit テストで検証できる

# AC-014 / REQ-F-014
Scenario: モデル名エラーの案内文言
  Given 受理されないモデル名が指定される
  When  runAI が UnknownModel/InvalidModel を throw する
  Then  メッセージが gpt-* / gemini-* / <provider>/<model> 形式および llama provider を案内する

# AC-015 / REQ-F-015
Scenario: llamaEndpoint の URL 正規化
  Given llamaEndpoint が http://host:8080 / http://host:8080/v1 / http://host:8080/v1/ のいずれかである
  When  リクエスト URL が組み立てられる
  Then  いずれの場合も同一の /v1/chat/completions URL に解決され、/v1/v1/ のような重複が生じない

# AC-016 / REQ-F-016
Scenario: 互換性の実測ゲート
  Given 対象の llama サーバ実装が特定されている
  When  REQ-F-003 の実装に着手する前
  Then  次の 3 種のスキーマそれぞれについて response_format 付きリクエストを 1 回以上実測した結果が
        記録されている: (1) 配列を包む object envelope、(2) enum を含む object、(3) YAML 契約に対応する object
  And   各実測について「スキーマどおりの JSON が返ったか」「返らない場合の挙動（無視 / 400 / 別形式）」が
        記録され、その結果が specifications に反映されている
  And   未実測のサーバ実装、および 3 種のいずれかでスキーマどおりの JSON が返らないサーバ実装が
        対応対象外として扱われる

# AC-017 / REQ-F-017
Scenario: 複数 choices の採用規則
  Given llama サーバが成功ステータスで choices を 2 要素以上含む応答を返す
  When  llama 経路が発話テキストを抽出する
  Then  choices[0] の内容のみが採用され、2 番目以降は無視される

# AC-018 / REQ-F-018
Scenario: YAML 契約への構造化出力の適用
  Given set-frontmatter のように YAML 契約の出力を期待する呼び出し元が llama 経由で runAI を呼ぶ
  When  リクエストボディが構築され、応答が解釈される
  Then  リクエストに response_format（json_schema）が含まれ、受信 JSON が既存の YAML 契約の形に変換されて返る

# AC-019 / REQ-F-019
Scenario: 接続先未設定の検出
  Given model が llama/qwen3-14b であり、llamaEndpoint が未設定（キー省略または空文字列）である
  When  runAI が呼び出される
  Then  fetch が一度も呼ばれずに ChatlogError(kind: InvalidFormat, subindex: InvalidEndpoint) が throw される

# AC-020 / REQ-NF-001
Scenario: 内部境界の分離
  Given llama 経路の実装（URL 正規化・HTTP 呼び出し・応答解釈・スキーマ構築）
  When  runAI の実装を検査する
  Then  これらの処理が runAI 本体ではなく分離された内部境界に置かれている

# AC-021 / REQ-NF-003
Scenario: HTTP 経路での UTF-8 往復
  Given systemPrompt / userPrompt が非 ASCII 文字（日本語）を含む
  When  llama 経由でリクエストが送信され、非 ASCII 文字を含む応答が返る
  Then  リクエストが UTF-8 で符号化され Content-Type に charset=utf-8 が含まれ、
        応答が UTF-8 として復号されて文字化け・欠落なく呼び出し元へ返る

# AC-022 / REQ-C-002
Scenario: 既存バックエンドの非破壊
  Given llama バックエンド追加前から存在する既存テストスイート
  When  llama 追加後に全テストを実行する
  Then  既存 5 バックエンドの成功・失敗の分類と既定モデルに関するテストがすべてパスする
```

## 9. Open Questions

### 解決済み

| Question                                                                   | 解決                                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `llamaEndpoint` の URL 形式検証を行うか（ConfigFieldType に `url` 型なし） | URL 専用型は新設せず既存の型語彙（`text`）で表現する。検証は llama 経路選択時にネットワークアクセス前で行う（REQ-F-019 / DR-12） |
| `response_format` スキーマの渡し方（新オプション引数か別関数か）           | 既存の呼び出しオプションへの任意フィールド追加で確定。フィールド名称のみ実装時に決める                                           |
| HTTP 429 / 接続失敗を `AiError` 再利用にするか新規 kind を追加するか       | 既存種別を再利用し `RateLimit` / `ExitFailure` の subindex で区別する（REQ-F-005 / REQ-F-006 / REQ-C-003）                       |
| `--allow-net` の付与範囲                                                   | 宛先を限定せず無制限に付与する（DR-13）                                                                                          |
| REQ-NF-003（UTF-8）が HTTP 経路で何を意味するか                            | リクエスト／レスポンスの charset を規定し AC-021 を付与                                                                          |
| AC-016 の「実測・記録された」の合否基準                                    | 実測するスキーマを 3 種に特定し、各 1 回以上の実測を要求（AC-016）                                                               |
| REQ-F-016 の THEN が 2 規範文を含むことの是非                              | 実測ゲート 1 つの表裏であり常に同時に評価されるため分割しない（REQ-F-016 注記）                                                  |
| REQ-C-002 に AC がない                                                     | AC-022 を付与                                                                                                                    |

### 未解決

要件レベルの規範に関わる未解決事項は残っていない。
実装着手の前提となる作業として、REQ-F-016 の実機実測が未実施のまま残る。

## 10. Traceability

| REQ ID     | AC IDs | Type           |
| ---------- | ------ | -------------- |
| REQ-F-001  | AC-001 | Functional     |
| REQ-F-002  | AC-006 | Functional     |
| REQ-F-003  | AC-002 | Functional     |
| REQ-F-004  | AC-007 | Functional     |
| REQ-F-005  | AC-005 | Functional     |
| REQ-F-006  | AC-004 | Functional     |
| REQ-F-007  | AC-008 | Functional     |
| REQ-F-008  | AC-009 | Functional     |
| REQ-F-009  | AC-010 | Functional     |
| REQ-F-010  | AC-011 | Functional     |
| REQ-F-011  | AC-012 | Functional     |
| REQ-F-012  | AC-013 | Functional     |
| REQ-F-013  | AC-003 | Functional     |
| REQ-F-014  | AC-014 | Functional     |
| REQ-F-015  | AC-015 | Functional     |
| REQ-F-016  | AC-016 | Functional     |
| REQ-F-017  | AC-017 | Functional     |
| REQ-F-018  | AC-018 | Functional     |
| REQ-F-019  | AC-019 | Functional     |
| REQ-NF-001 | AC-020 | Non-Functional |
| REQ-NF-002 | AC-013 | Non-Functional |
| REQ-NF-003 | AC-021 | Non-Functional |
| REQ-C-001  | N/A    | Constraint     |
| REQ-C-002  | AC-022 | Constraint     |
| REQ-C-003  | N/A    | Constraint     |
| REQ-C-004  | N/A    | Constraint     |
| REQ-C-005  | N/A    | Constraint     |

## 11. Change History

| Date       | Version | Description                                                                                                                                                                                                                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial release                                                                                                                                                                                                                                                                     |
| 2026-09-02 | 1.1.0   | codex セカンドオピニオン(risk)を反映: REQ-F-015/016 追加、REQ-F-005 に 503/504 を追加、REQ-F-010 の対象を AI 経路に限定、認証を Out of Scope 化                                                                                                                                     |
| 2026-09-02 | 1.2.0   | codex セカンドオピニオン(balanced)を反映: REQ-F-017・REQ-C-006 追加、REQ-F-016 に合格基準と未実測実装の対象外化を追記、対応対象サーバを実測済み実装に限定                                                                                                                           |
| 2026-09-02 | 1.3.0   | harden / fix レビュー所見を反映: REQ-F-018・REQ-F-019 追加、REQ-NF-001 を SHALL 化し AC-020 を付与、AC 二重記載 8 件の不一致を解消、REQ-F-015 を番号順へ移動                                                                                                                        |
| 2026-09-02 | 1.4.0   | consistency レビュー所見を反映: `llamaEndpoint` の既定値を空文字列に確定し「未設定 = キー省略または空文字列」と定義、§9 の検証タイミングを確定済みへ訂正                                                                                                                            |
| 2026-09-02 | 1.5.0   | 全面整理: AC の二重記載を §8 へ一元化、§1.2 Scope を領域別の表に再編、fix / harden レビューの据え置き 5 件を解決（AC-021・AC-022 追加、AC-016 の合格基準を具体化、REQ-F-016 の分割不要を判断、REQ-F-010 の対象キーを行番号から識別子へ）、DR-06 の統合と DR-07 / DR-08 の削除を反映 |
