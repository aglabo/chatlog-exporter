---
title: "Decision Records: chatlog/normalize"
module: "chatlog/normalize"
status: Draft
version: 1.0.0
created: "2026-09-08"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma,
  -->
<!-- markdownlint-disable line-length -->

<!--
IDs MUST be sequential: DR-01, DR-02, ...

Versioning (SemVer, see deckrd-rule-document-versioning.md):
  MINOR — a new DR is added
  PATCH — an existing DR's wording or rationale is clarified
  MAJOR — an accepted DR is superseded or reversed

Keep frontmatter `version` equal to the newest Change History row below.
-->

## Index

| ID    | Decision                                                                                     | 主な影響先                           |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| DR-01 | 取りこぼしの救済は実行内の再問い合わせではなく `retry` 記録と `--single-file` 再実行に委ねる | `segment-ai.ts` / `phase-segment.ts` |

---

## DR-01: 取りこぼしの救済は実行内の再問い合わせではなく `retry` 記録と `--single-file` 再実行に委ねる

**Status**: Accepted

**Context**: `segmentChatlogs` に内容がほぼ同一のファイル（ニアデュープ）が同一バッチで渡ると、
AI 応答から **両方** のエントリが欠落します。`::warn:: segmentChatlogs: no entry returned for — <id>`
が出るだけで、該当ファイルはキャッシュにも書かれず出力もされません。エラー扱いにならないため
見落としやすい形です。

2026-08-20 の normalize 2026-07 実行で実際に踏みました。次の 2 ファイルは本文 1597 行中 1596 行が同一で、
差分は frontmatter の `session_id` と最終行だけです（同一 filter-chatlogs セッションが
spend limit で中断し、再実行された 2 本の記録）。

```text
2026-07-15-…-clecache-class-t-b02a7515e66d
2026-07-15-…-clecache-class-t-d1e8caef40ef
```

原因は `skills/normalize-chatlogs/scripts/modules/segment-ai.ts` の照合が
`entry.filePath` の完全一致のみであることです。AI がニアデュープを 1 件にマージするか
片方を省略した時点で対応付けに失敗し、黙って落ちます。

**再実行しても再発します。** バッチは `BATCH_SIZE = 4` の固定件数区切りで入力順に決まるため、
入力構成を変えない限り、同じ組み合わせが再現されます。

当初の修正方針は「AI 応答に含まれなかった `filePath` を検出し、その分だけ単独で再問い合わせする
実行内フォールバック」でした。

**Decision**:

1. 実行内のフォールバック再問い合わせは **採用しない**
2. segments を取得できなかったファイルには、キャッシュ status `retry` を記録して
   「再判定対象」であることを明示する
3. 実際の救済は、利用者が `--single-file` を付けて再実行することで行う
   （バッチ衝突が起きないため正しく判定される）
4. 併せて、AI が `segments: []` を返した場合に status `set` と空 segments が書かれ、
   0 件出力のまま status `done` へ昇格して当該ファイルが永久に沈黙する既存バグを修正する

決定 1 に伴い受入条件を差し替えています。「単独再問い合わせが走ることをテストで検証する」は無効とし、
「segments を取得できなかったファイルに `status: retry` が書かれ、次回実行で再判定対象になること」を
検証対象としました（`T-PP-09-01`〜`13-01` / `T-PF-RETRY-01`〜`03`）。

**Alternatives Considered**:

- 実行内でフォールバック再問い合わせをする — `--single-file` 相当の経路が
  `phase-segment.ts` の `_chunkSize` として既にあるため再利用は可能でした。
  しかし 1 回の実行の中に「バッチ問い合わせ」と「失敗分の単独問い合わせ」という
  2 つの試行ループを抱えることになり、1 エントリあたりの AI 実行回数が入力内容に依存して変動します。
  取りこぼしが救済されたのか、そもそも起きなかったのかも実行ログから判別しにくくなります
- バッチ構成をランダム化して衝突を回避する — 再実行のたびに結果が変わるため、
  同じ入力に対する再現性を失います。取りこぼしが「たまたま起きない」実行を成功と誤認する余地も残ります
- ニアデュープを事前に検出して同一バッチへ入れない — 検出の閾値をどこに置いても
  「ほぼ同一」の線引きが恣意的になります。今回の実例は 1597 行中 1596 行が同一という極端な例ですが、
  AI がマージするかどうかは類似度の単調関数ではありません

**Consequences**: 取りこぼしは自動では解消されません。利用者による `--single-file` の再実行が要ります。
その代わり、1 エントリあたりの AI 実行は 1 実行につき 1 回のみとなり（実行内ループなし）、
取りこぼしたファイルは status `retry` としてキャッシュに残るため、沈黙ではなく
再判定対象として次回実行に引き継がれます。

実装は commit `05b8504ee`（retry 記録）と `11d18d220`（`--single-file` 再実行の挙動を文書化）です。

> 出典: beads `cle-947`（closed 2026-08-20） / GitHub #444

---

## Change History

| Date       | Version | Description                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 を記録（`cle-947` が出典） |

<!-- markdownlint-enable line-length -->
