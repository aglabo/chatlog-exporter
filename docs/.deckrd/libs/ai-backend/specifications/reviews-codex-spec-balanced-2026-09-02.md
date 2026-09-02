---
title: "Second Opinion (codex): libs/ai-backend specifications — balanced"
reviewer: codex
focus: balanced
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: accepted
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-mix-dearu-desumasu,
  -->
<!-- cspell:words subindex Ollama predict -->

> **Codex Second Opinion — Critical Reviewer（balanced）**
> `/deckrd:deckrd-review spec`
> spec → impl 遷移前の必須レビュー（`deckrd-rule-second-opinion.md`）
> 判定: **Accept**（採択 4 件 / 未採択 4 件 / 見送り 1 件）

## 1. Reviewed

`specifications-index.md` v1.1.3 / `-transport.md` v1.3.0 / `-structured-output.md` v1.3.0 /
`-error-handling.md` v1.1.0 / `-config-packaging.md` v1.1.3

Upstream: `requirements.md` v1.5.0 / `decision-records.md` v2.4.0
先行: `reviews-codex-spec-risk-2026-09-02.md`（risk focus。既知所見として codex に提示済み）

## 2. 最重要の発見: 出力契約の分類が実態とずれている

codex が指摘し、実コードで裏付けが取れた。**spec の前提が事実に反している。**

`structured-output.md` §2.2 は「呼び出し元 4 スキルが期待する出力契約は JSON 配列・
JSON オブジェクト・YAML 契約のいずれか」と述べる。実際の `runAI` 呼び出しは 6 箇所で、
契約は次の 3 種である。

| # | 呼び出し箇所                | パーサ                              | 契約               |
| - | --------------------------- | ----------------------------------- | ------------------ |
| 1 | `phase-classify-ai.ts:123`  | `parseAiJsonArray`                  | JSON 配列          |
| 2 | `process-chunk.ts:86`       | `parseAiJsonArray`                  | JSON 配列          |
| 3 | `segment-ai.ts:111`         | `parseAiJsonArray`                  | JSON 配列          |
| 4 | `setfm-frontmatter.ts:61`   | `extractYaml(_raw, 'title')`        | YAML 契約          |
| 5 | `setfm-review.ts:60`        | `extractYaml(_raw, 'validity')`     | YAML 契約          |
| 6 | `setfm-type-category.ts:91` | 行頭 `type:` / `category:` 前方一致 | **行前置テキスト** |

ずれは 2 方向にある。

- spec が挙げる **「JSON オブジェクト」に呼び出し元が 1 つも存在しない**
- spec が挙げていない **「行前置テキスト」に呼び出し元が 1 つ存在する**（#6）

さらに DR-11 の Context は「set-frontmatter だけが `extractYaml` を使い
（`setfm-frontmatter.ts:62`、`setfm-review.ts:62`）」と 2 箇所しか数えていない。
**set-frontmatter は 1 スキルで 2 種類の契約を持つ。**

### 未修正のまま実装した場合の帰結

R-001 は「llama バックエンドが選択されている」場合に無条件で `response_format` を適用する。
表の #6 はスキーマに従った JSON を受け取る一方、パーサは行頭 `type:` を探すため
`_parsedType` / `_parsedCategory` がいずれも空文字になる。
`setfm-type-category.ts:99` / `:102` の検証を通らず、例外も出ないまま
`DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` が全ファイルに書かれる。

risk レビューで記録した「設定ミスが既定値の一括書き込みとして現れる」経路と、
着地点が同一である。原因は別（あちらは分類、こちらは契約の取り違え）。

## 3. Codex のその他の指摘

| #   | 指摘                                                                                                                               | 対象                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| B-1 | スキーマ生成規則が制約だけで実スキーマ契約が未定義。envelope のフィールド名・`required`・`additionalProperties`・nullable が未規定 | R-002 / R-003           |
| B-2 | `implementation details are out of scope` と言いながら、impl-note が「3 層に分ける」「export してはならない」まで命令している      | transport §4.1          |
| B-3 | `response_format` 適用後に `runAI` が返す文字列の形が呼び出し元別に不明                                                            | R-007 / §3.2            |
| B-4 | `message.content` が `null` / 配列 / `tool_calls` 中心の場合の判定対象が未具体化                                                   | error-handling R-004    |
| B-5 | `llamaEndpoint` に query / hash / userinfo を含む場合の扱いが未定義                                                                | transport R-006 / R-002 |
| B-6 | 空配列受理の非破壊判定が戻り値に寄っており、filter の `stats` 更新や cache 書き込みの観測結果が未明示                              | structured-output §5.1  |
| B-7 | `runAI` を `runAIText` + adapter に内部分割する代替案（公開戻り値は string のまま維持）                                            | REQ-C-005 / N-01        |

## 4. 採択（4 件）

### C-01: `response_format` の適用範囲を呼び出し単位へ（必須）

REQ-F-018 / DR-11 の対象を「set-frontmatter というスキル」から「6 つの `runAI` 呼び出し」へ改める。
`structured-output.md` §2.2 の契約分類を実態（JSON 配列 3 / YAML 契約 2 / 行前置テキスト 1）へ修正し、
`setfm-type-category.ts:91` を対象に含めるか除外するかを呼び出し単位で決める。

「JSON オブジェクト」は呼び出し元を持たないため、分類から外すか、
将来の呼び出し元のための予約であることを明記する。

### C-02: スキーマ契約の具体化

R-002 / R-003 の制約（数量制約なし・enum フォールバック必須）に加え、
envelope のフィールド名、`required` の扱い、`additionalProperties` の可否、
nullable の表現、YAML 変換前 JSON のキー集合を規定する。
現状は異なるスキーマを作っても仕様違反と判定しにくい。

§4.2 の実測（3 種のスキーマ）の入力も、これが決まって初めて一意になる。

### C-03: impl-note の規範性を確定

transport §4.1 末尾の impl-note が持つ内容のうち、REQ-NF-001 / REQ-C-006 に関わる部分
（3 層分割、module-private とすること、2 実装にしないこと）を本文ルールへ昇格するか、
非規範として明示的に弱めるかを決める。現状はレビュー基準がぶれる。

fix レビューの G-07（AC-020 の検証手段が非規範コメントにしかない）と同じ根であり、
G-07 は「要件 v1.5.0 が NF-001 の内容を変えていない」ことを理由に据え置いていた。
本件を採択したことで、その据え置き理由は失効する。

### C-04: `response_format` 適用後の戻り値の形（B-3）

envelope を展開して JSON 配列文字列へ戻すのか、object のまま返すのかを呼び出し元別に規定する。
C-01 で契約を呼び出し単位に切り直すことと直接連動する。

## 5. 未採択（4 件・理由の記録が必要）

`deckrd-rule-second-opinion.md` は silent rejection を認めない。以下は今回採択されず、
**理由が未記録** である。`impl` へ移る前に理由を記録するか採択へ切り替える。

| #    | 所見                                                          | 備考                                                                                                              |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| M-01 | B-7: `runAIText` + adapter への内部分割（代替案）             | risk レビューの未採択 N-01（R-007 の戻り値契約の衝突）への具体解にあたる。C-04 は形を決めるが、実現手段は決めない |
| M-02 | B-4: `message.content` が `null` / 配列 / `tool_calls` の場合 | error-handling R-004 の判定対象が未具体化のまま残る                                                               |
| M-03 | B-5: `llamaEndpoint` の query / hash / userinfo               | DR-14 が確定した正規化規則は、これらを持つ入力に対して未定義                                                      |
| M-04 | B-6: 空配列受理の観測範囲（filter の `stats` / cache）        | §5.1 の非破壊判定が戻り値の一致のみで、副作用の一致を見ていない                                                   |

**M-01 と C-04 の関係に注意する。** C-04 は「何を返すか」を決めるが、`runAI` の公開戻り値が
string である以上、複数契約への変換をどこに置くかは未決のまま残る。
risk レビューの N-01 と本件 M-01 は同一論点であり、2 回続けて理由未記録で持ち越している。

## 6. 見送り（理由記録済み）

| #    | 所見                                            | 理由                                                                                                                                                                                |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | `llama/<model>` の `<model>` 空文字・空白の扱い | 優先度が低いため仕様では規定せず、impl 段階の入力検証に委ねる。`parseModel` は空文字列をモデル名として受理し、サーバへ `model: ""` を送る経路が生じうる点は impl への申し送りとする |

## 7. 波及範囲と実施順序

C-01 は **REQ-F-018 の WHERE（「呼び出し元が YAML 契約の出力を期待する」）を書き換える** ため、
spec だけでは閉じない。DR-11 の Context も呼び出し箇所を 2 つと数えており事実に反する。

risk レビューで確定した「バックエンド可用性による中断・続行の分離」も要件改訂を要するため、
両者は同じ改訂に載せられる。

```text
1. requirements.md v1.5.0 の改訂
     REQ-F-006 の subindex 割当（中断範囲）
     REQ-F-018 の WHERE を呼び出し単位へ
     REQ-F-019 の kind 選定（DR-12）の再検討
2. decision-records.md v2.4.0 への追記・修正
     可用性による中断分離の新 DR
     DR-11 の Context を実態（6 呼び出し / 3 契約）へ訂正
     DR-16 の一部撤回、DR-03 据え置きの記録
3. specifications 5 ファイルへの反映
     structured-output §2.2 / R-001 / R-007 / §4.2、transport §4.1 / R-006、error-handling §3.2 / §4.1 / §5
```

DR-13（`--allow-net`）も要件に結論が取り込まれているため、覆すなら同じ改訂に載せる。
DR-15 / DR-17 と C-02 / C-03 / C-04 は spec に閉じる。

## 8. Metadata

- Reviewer: codex（`mcp__codex-mcp__codex`, sandbox: read-only, thread `01a06016-8d44-78d2-ba13-17ec1b9b0135`）
- Focus: balanced（Critical Reviewer）
- Date: 2026-09-02
- Disposition: Accept
- 契約在庫の検証: `grep -rn "runAI(" skills/` および各呼び出し元のパーサ確認により本レビューで実測
