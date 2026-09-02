---
title: "Second Opinion (codex): libs/ai-backend specifications — risk"
reviewer: codex
focus: risk
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: accepted
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-mix-dearu-desumasu
   -->

<!-- cspell:words subindex Ollama vLLM predict -->

> **Codex Second Opinion — Devil's Advocate**
> `/deckrd:deckrd-review spec --focus risk`
> 判定: **Accept**（採択 7 件 / 未採択 2 件 / 据え置き 1 件 / 新規決定 1 件）

## 1. Reviewed

| File                                  | Version |
| ------------------------------------- | ------- |
| `specifications-index.md`             | 1.1.3   |
| `specifications-transport.md`         | 1.3.0   |
| `specifications-structured-output.md` | 1.3.0   |
| `specifications-error-handling.md`    | 1.1.0   |
| `specifications-config-packaging.md`  | 1.1.3   |

Upstream: `requirements.md` v1.5.0 / `decision-records.md` v2.4.0

## 2. Codex の指摘（要旨）

### 危険な前提トップ 3

1. **REQ-F-016 / structured-output R-006 が「実装着手前ゲート」として機能する前提**（codex が最重要とした点）。
   仕様は実測完了まで `response_format` の扱いが未確定だと認めながら、他の設計はすべて
   「llama 経路では常に構造化出力を強制できる」前提で固定されている。§4.2 の「3 種 × 各 1 回以上」では
   モデル差・長文入力・enum 境界・長文時の遵守率を捕まえきれない
2. **structured-output R-001 / R-007: YAML 契約呼び出し元にも常に `response_format` を適用できる前提**。
   `runAI` の公開契約は文字列返却だが、R-007 は「成否と値を持つ結果オブジェクト」へ変換して返すと述べる
3. **transport R-009 / error-handling R-004 / DR-15: `max_tokens` なしで切り詰めは検知すればよいという前提**。
   失敗を防がず「壊れたら ExitFailure」にするだけで、サーバ既定次第では正常運用が恒常的に
   `finish_reason: length` になりうる

### 失敗要因・未指定の外部依存

- json_schema 対応が OpenAI 互換と微妙に異なりうる（`strict`・root object・enum・追加プロパティ）
- 黙殺の実行時検出手段が弱い。断片 JSON を含む自然文を既存パーサが拾いうる
- 429/503/504 の一括分類が、設定不備・コンテキスト超過・プロキシ障害を同じ状態に見せる
- `--allow-net` 無制限が最小権限でない
- `timeoutMs` 共有が CLI 起動待ちと HTTP 推論待ちの性質差を潰す
- `RunAIOptions` に構造化出力の指定口が存在しない
- 対象サーバのバージョン・起動オプション・context size・`n_predict`・並列数が未指定
- `finish_reason` の正常値一覧が未指定

## 3. 採択（7 件）

### 3.1 仕様の欠落として反映する（3 件）

| #    | 所見                                                                                                    | 対象                             |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------- |
| A-01 | `finish_reason` の正常値一覧が未定義。`stop` のみを正常とするか、実装固有値を許すかを決める             | error-handling R-004             |
| A-02 | 黙殺の実行時検出規則がない。何をもって「スキーマ非準拠」と判定するかを定める                            | structured-output §4.1           |
| A-03 | スキーマの渡し口は名称ではなく公開契約境界の問題として扱う。`RunAIOptions` に該当フィールドが存在しない | structured-output §7 Q2 の格上げ |

A-01 は fix レビューの TS-04 を自ら解消し損ねた箇所にあたる。

### 3.2 確定済み DR の再検討（4 件）

| DR    | 論点                                                                  | 波及先                 |
| ----- | --------------------------------------------------------------------- | ---------------------- |
| DR-15 | `max_tokens` を送らない判断。恒常的な `length` 切り詰めのリスク       | spec のみ              |
| DR-03 | 429/503/504 の一括 `RateLimit`（**本レビューでは据え置き。§5 参照**） | requirements / DR      |
| DR-17 | `timeoutMs` 共有。CLI 起動待ちと HTTP 推論待ちの性質差                | spec（新キーなら要件） |
| DR-13 | `--allow-net` 無制限。REQ-C-001 とのトレードオフ再評価                | requirements / DR      |

### 3.3 実測ゲート（1 件）

§4.2 の「3 種 × 各 1 回以上」を、モデル差・長文入力・enum 境界・長文時の遵守率まで含む形へ拡張する。

## 4. 未採択（2 件・理由の記録が必要）

`deckrd-rule-second-opinion.md` は silent rejection を認めない。以下 2 件は今回採択されず、
**理由が未記録** である。`impl` へ移る前に、対応しない理由を記録するか採択へ切り替える。

| #    | 所見                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| N-01 | R-007 の戻り値契約（「成否と値を持つ結果オブジェクト」）と `runAI` の文字列返却の衝突。REQ-C-005 との緊張が未解消        |
| N-02 | 対象サーバの外部依存（バージョン・起動オプション・context size・`n_predict`・要求する `response_format` の方言）が未指定 |

N-01 は実装時に `runAI` の戻り値を変える判断を迫られる可能性がある。

## 5. 据え置き: DR-03（理由の記録）

**判定**: 現状のまま据え置き、コーディング後に問題が生じた時点で再検討する。

**理由**:

1. codex は「並列度を落とす判断を誤らせる」と述べたが、実装には並列度の調整がなく、再試行も存在しない。
   `runChunked` は `withConcurrency` へ委譲して例外を包むだけである。したがって誤分類の代償は
   リトライ嵐ではなく「中断 / 続行」の取り違えに限られる
2. 429 / 503 / 504 が実際にどう返るかは REQ-F-016 の実機実測で判明する。実測は実装着手前の工程に
   既に入っており、自然な見直し点がある
3. 分類の変更は subindex の割り当て 1 箇所であり、後から直すコストが小さい

**再検討のトリガー**: 実測で、過負荷以外の事象（設定不備・コンテキスト超過・プロキシ障害）が
503 / 504 として返ることが判明した場合。

## 6. 新規決定: バックエンド可用性による中断・続行の分離

本レビュー中に、codex の指摘とは別系統の欠陥が実装読解から判明し、方針が確定した。

### 6.1 判明した欠陥

中断が起きるのは呼び出し元 catch の第 1 分岐だけで、その条件は `isRateLimitError` 一本である。
`ExitFailure` を含むそれ以外は **中断せず残りを続行する**。

| 分類               | 呼び出し元の挙動                            |
| ------------------ | ------------------------------------------- |
| `RateLimit`        | 再 throw → 実行全体を中断                   |
| その他の `AiError` | ログを出して続行（chunk エラー記録 / skip） |
| `AiError` 以外     | フォールバック値をセットして続行            |

このため次の 2 つが起きる。

1. **サーバ未起動・到達不能** は REQ-F-006 により `ExitFailure` となり、中断せず全ファイルに
   エラー記録を書いて「完了」する
2. **`llamaEndpoint` の設定漏れ** は DR-12 により `kind: InvalidFormat` となる。`isFatalAiError` は
   `kind === 'AiError'` しか見ないため、`isRateLimitError` も `isFatalAiError` も偽になり、
   最後の「非 AiError → フォールバック値」分岐に落ちる。設定ミスがエラーではなく
   **既定値の一括書き込み** として現れる

2 は REQ-F-019 が「原因の特定できない失敗を避ける」目的で設けた規範が、呼び出し元では
逆に働く形となる。

### 6.2 決定

分類の軸を「再試行可能か」から **「バックエンドが使えるか」** へ変える。

| 区分                   | 扱い | 該当                                                                                                                                                                     |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| バックエンドが使えない | 中断 | `InvalidEndpoint`（設定ミス）/ 接続失敗・未到達 / 404・501（エンドポイント不在）/ 401・403（認証要求 = 前提崩れ）/ `response_format` の黙殺・拒否 / 既存の 429・503・504 |
| この入力固有の失敗     | 続行 | この入力に起因する 400（コンテキスト超過等）/ `finish_reason` の切り詰め / 応答本文が使えない / パース失敗                                                               |

### 6.3 実現手段と制約

呼び出し元の第 1 分岐が `isRateLimitError` 一本である以上、分類を変えるだけでは中断しない。
**llama 経路専用の subindex と、それを見る新しい判定関数** が要る。

接続失敗を現在の `AiError/ExitFailure` のまま中断対象にすると、CLI バックエンドの非 0 終了と
同じ組になり、既存 5 バックエンドの挙動が変わる（**REQ-C-002 に抵触**）。
llama 経路だけが持つ subindex に鍵を掛けることで既存経路を守る。

`InvalidEndpoint` は DR-12 により `kind: InvalidFormat` である。新しい判定関数が
`InvalidFormat/InvalidEndpoint` と `AiError/<新 subindex>` の双方を見る形にすれば、
DR-12 を覆さずに済む。

### 6.4 DR-16 との関係

harden の P-02 / DR-16 は「subindex を増やしても呼び出し元の分岐は変わらないから増やさない」と
決定した。本決定は **呼び出し元の分岐を変える** ため、この根拠が成立しなくなる。
DR-16 の当該項は再検討対象となる。ただし DR-16 が扱ったのは R-004（成功ステータスだが本文が
使えない）であり、これは 6.2 の表で「続行」側に置かれる。したがって R-004 について
専用 subindex を設けない判断自体は維持できる。

### 6.5 未解決の結合点

- 400 の区別: `response_format` の拒否（中断）とコンテキスト超過（続行）が同じ 400 で返る場合、
  応答本文のエラーメッセージを見ない限り区別できない。区別手段は REQ-F-016 の実測に依存する
- 黙殺の検出: 「`response_format` の黙殺 → 中断」は A-02（黙殺の実行時検出規則）が
  定まって初めて実行可能になる。両者は同時に決める必要がある

## 7. 実施順序

`REQ-F-006` が「接続失敗は subindex を ExitFailure とする」と要件側で確定させているため、
本決定は spec だけでは閉じない。順序を逆にすると DR-12 のときと同じ traceability inversion になる。

```text
1. requirements.md v1.5.0 の改訂
     REQ-F-006 の subindex 割当、中断範囲の AC を追加、REQ-F-019 の kind 選定の再検討
2. decision-records.md v2.4.0 への追記
     可用性による中断分離の新 DR、DR-16 の一部撤回、DR-03 据え置きの記録
3. specifications 5 ファイルへの反映
     error-handling §3.2 / §4.1 / §5、transport R-006
```

DR-13（`--allow-net`）も要件の REQ-F-010 Rationale / AC-011 / §9 に結論が取り込まれているため、
覆すなら同じく要件側から入る。DR-15 / DR-17 は spec に閉じる（DR-17 で新しい設定キーを
採る結論になった場合を除く）。

## 8. Metadata

- Reviewer: codex（`mcp__codex-mcp__codex`, sandbox: read-only）
- Focus: risk（Devil's Advocate）
- Date: 2026-09-02
- Disposition: Accept
- Input: `reviews-claude-spec-explore-2026-09-02.md` / `reviews-claude-spec-harden-2026-09-02.md` /
  `reviews-claude-spec-fix-2026-09-02.md`
