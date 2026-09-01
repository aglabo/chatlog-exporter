---
title: "Design Specification Index: LAN llama サーバの AI バックエンド化"
based-on: requirements.md v1.6.0
status: Draft
version: 1.2.0
created: "2026-09-02"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  -->

## 1. Overview

`libs/ai-backend` の設計仕様は 4 ファイルに分割されている。本ファイルはその索引であり、
各ファイルの担当領域と、要件（`../requirements/requirements.md` v1.6.0）の
Functional Requirements 全 19 件のカバレッジを示す。

分割は 19 FR という分量に対する機械的な分割ではなく、実測ゲート（REQ-F-016）の影響を受ける
振る舞いについて、その主担当を 1 ファイルに集めることを目的にしている。
`response_format` の挙動をどう実測し、その結果をどう扱うかを規定するのは
`specifications-structured-output.md` が担う。

ただし実測結果の反映先はこのファイルに閉じない。黙殺・拒否の分類名は
`specifications-error-handling.md` §3.2 が所有し（DR-16）、拒否の HTTP ステータス写像と
リクエストボディの形は `specifications-transport.md` が持つ。
§4 の未決 #1 が「transport の wire format 前提にも波及する」と書くのはこの意味であり、
「他の 3 ファイルは実測の結果に関わらず確定する」とは言えない（codex consistency D-05 / E-05）。

## 2. Specification Files

| File                                                                       | Area                                                                                                                                                                                                                                                                                      | FR Coverage                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [specifications-transport.md](specifications-transport.md)                 | LAN llama サーバへの HTTP トランスポート。バックエンド選択、エンドポイント URL の受理条件と正規化、system/user を分離したリクエスト構成、タイムアウトとキャンセルのセマンティクス、リクエスト／レスポンスの文字符号化、HTTP 呼び出しの注入点、および llama 経路を隔離する内部境界の構造。 | REQ-F-001, REQ-F-002, REQ-F-007, REQ-F-012, REQ-F-015, REQ-F-017, REQ-F-019 |
| [specifications-structured-output.md](specifications-structured-output.md) | 構造化出力の強制。呼び出し単位の出力契約（3 種）、`response_format` ブロック、数量制約を禁じ enum にフォールバック値を要求するスキーマ構築規則、応答の on-wire contract validation と呼び出し元が期待する文字列表現への復元、正当な空配列の受理、および実装着手前の実測ゲート。           | REQ-F-003, REQ-F-004, REQ-F-013, REQ-F-016, REQ-F-018                       |
| [specifications-error-handling.md](specifications-error-handling.md)       | 失敗時のセマンティクス。HTTP ステータスと接続失敗のエラー分類への写像、バックエンド可用性を軸とした中断・続行の subindex の割り当て、リトライ・フォールバックの禁止、分類が呼び出し元の並列実行中断へ届く経路、および不正モデル名の案内文言の実態追随。                                   | REQ-F-005, REQ-F-006, REQ-F-014                                             |
| [specifications-config-packaging.md](specifications-config-packaging.md)   | 設定と配布。サーバ位置の新規設定キーと既定値、チャットログのソースエージェント軸と AI バックエンド軸の分離、ネットワーク権限を付与する実行経路と付与しない経路の切り分け、配布ミラーの同期義務。                                                                                          | REQ-F-008, REQ-F-009, REQ-F-010, REQ-F-011                                  |

## 3. Requirements Coverage

| REQ ID    | Covered in                                                                 |
| --------- | -------------------------------------------------------------------------- |
| REQ-F-001 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-002 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-003 | [specifications-structured-output.md](specifications-structured-output.md) |
| REQ-F-004 | [specifications-structured-output.md](specifications-structured-output.md) |
| REQ-F-005 | [specifications-error-handling.md](specifications-error-handling.md)       |
| REQ-F-006 | [specifications-error-handling.md](specifications-error-handling.md)       |
| REQ-F-007 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-008 | [specifications-config-packaging.md](specifications-config-packaging.md)   |
| REQ-F-009 | [specifications-config-packaging.md](specifications-config-packaging.md)   |
| REQ-F-010 | [specifications-config-packaging.md](specifications-config-packaging.md)   |
| REQ-F-011 | [specifications-config-packaging.md](specifications-config-packaging.md)   |
| REQ-F-012 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-013 | [specifications-structured-output.md](specifications-structured-output.md) |
| REQ-F-014 | [specifications-error-handling.md](specifications-error-handling.md)       |
| REQ-F-015 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-016 | [specifications-structured-output.md](specifications-structured-output.md) |
| REQ-F-017 | [specifications-transport.md](specifications-transport.md)                 |
| REQ-F-018 | [specifications-structured-output.md](specifications-structured-output.md) |
| REQ-F-019 | [specifications-transport.md](specifications-transport.md)                 |

Non-Functional Requirements（REQ-NF-001〜003）と Constraints（REQ-C-001〜006）は
原則として特定の 1 ファイルに割り当てず、4 ファイル全体を横断して制約する。
ただし次の 2 件は所在が定まっている。

- REQ-NF-001（AC-020: llama 経路を `runAI` 本体から分離した内部境界に置く）と REQ-C-006 は
  同一の規範であり、`specifications-transport.md` R-008 ではなく **R-010 / §4.1.1** が
  検証可能な規則として所有する（AC-020 の合否判定基準を含む）
- REQ-NF-003（AC-021: HTTP 経路での UTF-8 往復）は `specifications-transport.md` R-008 が
  検証可能な規則として所有する

## 4. Open Questions

本節は、**複数ファイルに跨る未決事項**、または索引の読み手が知る必要のある未決事項を集約する。
各ファイルが単独で持つ未決事項は当該ファイルの Section 7 にあり、ここには再掲しない
（本節自体は §7 ではなく §4 に置く）。

| # | Question                                                                                                                                                                                                                                                                                                                                    | Impact Area                                                                     |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1 | 対象サーバ（llama.cpp server）が `response_format` を実際にどう扱うか（準拠 / 黙殺 / 拒否）が未実測である。実測は `specifications-structured-output.md` §4.2 が定める 3 種のスキーマ × 4 条件について行い、種別ごとにどの分岐へ着地したかを同ファイル §4.1.1 の表へ記録する。黙殺・拒否だったサーバ実装は対応対象外とすることが確定している | structured-output（分類名は error-handling、wire format は transport にも波及） |
| 2 | `response_format` の拒否（中断）とコンテキスト長超過（続行）が同じ HTTP 400 で返る場合の読み分け手段が未定である。判別手段は #1 の実測結果に依存する。実測までは判別できない 400 を続行側の `ExitFailure` に落とす                                                                                                                          | error-handling（transport の R-006 / R-008 の分類にも波及）                     |

解決済みの未決事項を次に示す。

| 旧番号 | Question                                                                          | 解決                                                                                                  |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2      | ネットワーク権限を無制限で付与するか、設定から得られるホスト・ポートに限定するか  | 宛先を限定せず無制限に付与する（DR-13 / REQ-F-010）                                                   |
| 4      | 実測で黙殺・拒否だった場合に degraded 運転を提供するか                            | 提供しない。当該サーバ実装を対応対象外とする（REQ-F-016 / DR-09）                                     |
| 5      | spec が shebang 行を判定対象に含める一方、要件 REQ-F-010 の対象表が追随していない | 要件 v1.6.0 が対象表に shebang 行を追加し、`specifications-config-packaging.md` R-003 / §5 と一致した |

Phase 4（codex セカンドオピニオン）で提起され、本仕様に反映した論点は次のとおり。

| 論点                                                                             | 反映先                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 4 ファイルに分散した単位の実行時結合順序が、どのファイルにも所有されていなかった | `specifications-transport.md` Section 4.1（結合順序の唯一の正） |
| 「実測が honoured でなかった場合の行き先」が未定義だった                         | `specifications-structured-output.md` Section 4.1.1             |
| 空配列受理が既存 5 バックエンドにも及ぶことと REQ-C-002 の関係が未記述だった     | `specifications-structured-output.md` Section 5.1               |
| モデル名解決・案内文言の変更が既存の受理範囲を狭めうる点の判定条件が無かった     | `specifications-error-handling.md` Section 4.3                  |
| fail-first が AI 実行内の禁止を指すのか呼び出し元まで含むのかが曖昧だった        | `specifications-error-handling.md` Section 2.1.1                |

Phase 5（codex risk / balanced / consistency）で提起され、本仕様に反映した論点は次のとおり。

| 論点                                                                                | 反映先                                                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 設定漏れ・サーバ未起動が一括処理を中断せず、既定値の一括書き込みとして現れていた    | `specifications-error-handling.md` §3.2 / §4.1（DR-18）                       |
| `ExitFailure` に中断すべき失敗と続行すべき失敗が同居していた                        | 同上（DR-16 決定 3 の撤回）                                                   |
| 出力契約の分類が実態（6 呼び出し / 3 契約）とずれ、行前置テキスト契約が欠落していた | `specifications-structured-output.md` §2.2 / §4.3（DR-19）                    |
| `response_format` の適用条件が 3 箇所で食い違っていた                               | REQ-F-003 / structured-output R-001 / transport R-009 を無条件へ統一（DR-19） |
| 黙殺の実行時検出は実現不能であり、規定すべきは on-wire contract validation だった   | `specifications-structured-output.md` §4.1（R-008 の新設）                    |
| `runAI` の戻り値契約（文字列）と R-007 の記述（結果オブジェクト）が衝突していた     | `specifications-structured-output.md` R-007 / §4.3（DR-19）                   |
| AC-020 の合否を判定する規則が非規範の実装ノートにしかなかった                       | `specifications-transport.md` R-010 / §4.1.1                                  |
| `model` の供給元が transport / config-packaging と error-handling で食い違っていた  | transport §2.2 / config-packaging §2.2 を実装の実態へ訂正                     |
| structured-output §4 の順序宣言が実装着手前ゲート（R-006）まで含んでいた            | `specifications-structured-output.md` §4（射程を実行時規則に限定）            |
| index §1 の分割根拠が §4 の未決 #1 と矛盾していた                                   | 本ファイル §1                                                                 |

## 5. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added, PATCH = clarification only -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | 1.0.0   | Initial specification index                                                                                                                                                                                                                                                                                                                                               |
| 2026-09-02 | 1.1.0   | consistency レビュー所見を反映: 要件 v1.4.0 に追随し FR を 19 件へ、REQ-F-017 / REQ-F-018 / REQ-F-019 のカバレッジを追加、REQ-C-006 と REQ-NF-001 を横断制約に明記、未決 2 件（`--allow-net` 範囲・degraded 運転）を解決済みへ                                                                                                                                            |
| 2026-09-02 | 1.1.1   | 要件 v1.5.0 に追随（based-on 更新）                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-02 | 1.1.2   | 要件 v1.5.0 の内容へ追随: §1 本文の要件バージョン参照を v1.5.0 へ訂正、未決 #1 を structured-output §4.2 の 3 種スキーマ基準へ接続、REQ-NF-003 の所在（transport R-008）を明記                                                                                                                                                                                            |
| 2026-09-02 | 1.1.3   | spec レビュー所見を反映: 未決 #2 を要件への差し戻し事項として書き直し、§2 の transport 行へ文字符号化の担当を追加、解決済み表の列名重複を解消、用語を統一                                                                                                                                                                                                                 |
| 2026-09-02 | 1.2.0   | codex レビュー所見を反映: §1 の分割根拠を実態（実測の主担当は structured-output、反映先は他ファイルにも及ぶ）へ改訂、§2 の Area を新規則（出力契約・中断続行・内部境界）へ追随、§3 の REQ-NF-001 / REQ-C-006 の所在を transport R-010 / §4.1.1 へ、§4 の導入文を実態へ訂正し未決 #2（400 の読み分け）を追加、shebang 行の論点を解決済みへ移動、Phase 5 の反映論点表を追加 |
