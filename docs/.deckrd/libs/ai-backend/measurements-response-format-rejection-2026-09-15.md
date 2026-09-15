---
title: "Measurement Report: response_format 拒否の HTTP 400 実測（T-12-06-01）"
module: "libs/ai-backend"
status: Accepted
version: 1.0.0
created: "2026-09-15"
---

<!-- cspell:words lmstudio avalon Qwen GGUF llamacpp frobnicate -->
<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma,
  -->

## Measurement Report: `response_format` 拒否の HTTP 400 実測（T-12-06-01）

本レポートは、`specifications-error-handling.md` R-008（Step 5）の判別条件を決めるための実測記録です。
Phase 0 の実測（`measurements-response-format-2026-09-12.md`）は妥当なスキーマのみを送ったため
HTTP 400 が 1 件も発生せず、判別条件を決められませんでした（同 §3.2 / §5）。本実測は、意図的に
不正なリクエストを送って 400 を発生させ、その本文を記録します。

**結論**: 本構成で `response_format` の拒否として返る 400 のうち、本コードベースから到達し得るのは
`error.message` が `JSON schema conversion failed` で始まる形だけです。コンテキスト長超過は
`error.type` が `exceed_context_size_error` であり、`error.message` の接頭辞で読み分けられます。
判別条件は DR-33 が確定させます。

---

## 1. 測定環境

`measurements-response-format-2026-09-12.md` §1 と同一の構成です（DR-31 の対応対象）。

| 項目           | 値                                                 |
| -------------- | -------------------------------------------------- |
| サーバ実装     | llama.cpp server（`owned_by: llamacpp`）           |
| ビルド         | `b10688-c589f0ed1`                                 |
| エンドポイント | `http://avalon:8080/v1/chat/completions`           |
| モデル         | `lmstudio-community/Qwen3.5-35B-A3B-GGUF:Q4_K_M`   |
| 送信手段       | `curl`。`Content-Type: application/json`、1 件ずつ |

ボディは `model` / `messages` / `stream: false` を基本とし、プローブごとに `response_format` などを
変えました。`messages` は `[{"role":"user","content":"hi"}]` です（コンテキスト長超過のプローブを除く）。

## 2. 結果

### 2.1 `response_format` を変えたプローブ

| #  | 送った `response_format`                            | HTTP | `error.type`            | `error.message`（先頭）                                                        |
| -- | --------------------------------------------------- | ---: | ----------------------- | ------------------------------------------------------------------------------ |
| p1 | `json_schema`、`schema: {"type":"bogus"}`           |  400 | `invalid_request_error` | `JSON schema conversion failed:\nUnrecognized schema: {"type":"bogus"}`        |
| p3 | `json_schema`、解決できない `$ref`（`#/nope`）      |  400 | `invalid_request_error` | `JSON schema conversion failed:\nError resolving ref #/nope: ...`              |
| r1 | `json_schema`、`properties.a.type: "widget"`        |  400 | `invalid_request_error` | `JSON schema conversion failed:\nUnrecognized schema: {"type":"widget"}`       |
| p2 | `type: "xml"`                                       |  400 | `invalid_request_error` | `response_format type must be one of "text" or "json_object", but got: xml`    |
| p4 | `json_schema`、`pattern: "("`（壊れた正規表現）     |  200 | —                       | —（制約なしで生成）                                                            |
| p5 | `type: "json_schema"` のみ（`json_schema` 欠落）    |  200 | —                       | —（制約なしで生成）                                                            |
| p6 | 文字列 `"json"`                                     |  200 | —                       | —（制約なしで生成）                                                            |
| r2 | `json_schema`、未知キーワード `frobnicate`          |  200 | —                       | —（キーワードを無視して生成）                                                  |
| r3 | `json_schema`、`enum` に非スカラー（object / 配列） |  200 | —                       | —（非スカラーを含む値を生成）                                                  |
| r4 | `json_schema`、`enum: []`                           |  500 | `server_error`          | `The model produced output that does not match the expected peg-native format` |

400 の本文はいずれも `{"error":{"code":400,"message":"...","type":"invalid_request_error"}}` の形です。
`message` は改行（`\n`）を含みます。

### 2.2 比較対象のプローブ（`response_format` 以外）

| #  | 内容                                         | HTTP | `error.type`                | `error.message`（先頭）                                                         |
| -- | -------------------------------------------- | ---: | --------------------------- | ------------------------------------------------------------------------------- |
| q1 | 40,012 トークンの入力（`n_ctx` 32,768 超過） |  400 | `exceed_context_size_error` | `request (40012 tokens) exceeds the available context size (32768 tokens), ...` |
| q5 | q1 に妥当な `json_schema` を付けたもの       |  400 | `exceed_context_size_error` | q1 と同一                                                                       |
| q6 | q1 に p1 の不正なスキーマを付けたもの        |  400 | `invalid_request_error`     | p1 と同一（`JSON schema conversion failed:\n...`）                              |
| q2 | `messages` 欠落                              |  400 | `invalid_request_error`     | `'messages' is required`                                                        |
| p7 | 壊れた JSON ボディ                           |  500 | `server_error`              | `[json.exception.parse_error.101] parse error at ...`                           |
| q3 | `messages: []`                               |  500 | `server_error`              | Jinja 例外 `No messages provided.`                                              |
| q4 | 不正な `role`                                |  500 | `server_error`              | Jinja 例外 `No user query found in messages.`                                   |

q1 / q2 は `error.type` 以外のフィールドも持ちます（q1 は `n_prompt_tokens` / `n_ctx`）。

## 3. 判別に関する所見

1. **`error.type` だけでは判別できません。** `response_format` の拒否（p1 / p3 / r1）と
   `messages` 欠落（q2）はどちらも `invalid_request_error` です。
2. **`error.message` の接頭辞 `JSON schema conversion failed` は 3 例で再現しました。**
   スキーマの壊れ方（未知の `type` / 解決できない `$ref`）に依存せず、同じ接頭辞が付きます。
3. **スキーマ変換はコンテキスト長の判定より先に行われます。** 妥当なスキーマ付きの超過（q5）は
   超過のみの場合（q1）と同じ応答ですが、不正なスキーマ付きの超過（q6）はスキーマ変換失敗として
   返ります。両方に該当する要求は `response_format` の拒否として分類されることになり、
   スキーマを直さない限り後続の呼び出しも同じ結果になるため、中断側の分類と矛盾しません。
4. **p2 の形は本コードベースから到達しません。** `buildLlamaRequest` は `type: "json_schema"` を
   固定で送ります。なお p2 の文言は `text` / `json_object` しか挙げませんが、同じビルドは
   `json_schema` を準拠として扱います（`measurements-response-format-2026-09-12.md` §3）。
   文言が古いだけであり、`json_schema` が拒否される根拠にはなりません。
5. **不正なスキーマのすべてが 400 になるわけではありません。** p4 / p5 / p6 / r2 / r3 は 200 で、
   スキーマ強制が効かないまま生成しました。r4 は生成後に 500 になりました。これらは Step 5 の
   判別対象外であり、200 の場合は R-008（structured-output）の契約検証が、500 の場合は
   error-handling R-003 が扱います。

## 4. 再現手順

1. `measurements-response-format-2026-09-12.md` §6 の手順 1 と同じ起動オプションで
   llama.cpp server を起動します。
2. §2 の各行のボディを `POST /v1/chat/completions` へ 1 件ずつ送り、HTTP ステータスと本文を記録します。
3. q1 は `n_ctx` を超える長さの `content` を用意します（本実測は 160,000 文字、40,012 トークン）。

プローブのボディと応答本文は測定時の一時ディレクトリに置いたファイルであり、リポジトリには
含めません。本レポートの §2 が記録として正です。

## 5. Change History

| Date       | Version | Description                                                                          |
| ---------- | ------- | ------------------------------------------------------------------------------------ |
| 2026-09-15 | 1.0.0   | 初版。`response_format` 拒否の 400 本文と、コンテキスト長超過・他の 400 との差を記録 |
