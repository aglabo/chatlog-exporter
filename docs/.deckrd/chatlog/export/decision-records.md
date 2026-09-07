---
title: "Decision Records: chatlog/export"
module: "chatlog/export"
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

| ID    | Decision                                                                      | 主な影響先                      |
| ----- | ----------------------------------------------------------------------------- | ------------------------------- |
| DR-01 | 出力ファイル名の識別子を `sessionId` 全体のハッシュから導出し、連番は用いない | `session-writer.ts` / `hash.ts` |

---

## DR-01: 出力ファイル名の識別子を `sessionId` 全体のハッシュから導出し、連番は用いない

**Status**: Accepted

**Context**: `buildOutputPath()`（`skills/export-chatlogs/scripts/libs/session-writer.ts`）は、
ハイフンを除いた `sessionId` の **先頭 8 文字** だけでファイル名の識別子を作っていました。
`sessionId` は UUIDv7 で、先頭がタイムスタンプ由来です。したがって近い時刻に実行された
セッションどうしは先頭が一致します。

実害が出ています。2026-06-25 に codex agent で `print hello` を 3 回実行したところ、
3 つの `sessionId` はいずれも先頭 8 文字が `019eff4a` で一致しました。

```text
019eff4a-393e-7980-8ced-d185bd4d9e76
019eff4a-6eb8-7af2-9735-23025984e328
019eff4a-89f9-7582-8978-455f490bf729
```

slug も同一（`print-hello`）のため、3 セッションが同じ
`2026-06-25-print-hello-019eff4a.md` へ後勝ちで書き込まれ、**2 セッション分の内容が失われました。**

この問題には制約があります。exporter は同一セッションに対して繰り返し実行され、
再実行時の冪等性が要ります。

**Decision**:

1. `hash.ts` に決定的なハッシュ関数 `sessionHash(input, length = 12)` を追加する。
   既存の非公開 `_sha256Hex` を再利用し、SHA-256 の先頭 12 文字を採用する
2. `buildOutputPath` を async 化し、`sessionId` の先頭 8 文字ではなく
   `sessionHash(meta.sessionId)` を識別子として使う
3. 「ファイルが存在したら `-2` / `-3` を付与する」方式は採らない

**Alternatives Considered**:

- 衝突時に連番の接尾辞を付ける — **冪等性を壊すため不採用**。exporter は同一セッションに対して
  再実行されるため、実行のたびにファイルが増殖します。識別子は実行回数ではなく
  セッションそのものから決定的に導出される必要があります
- `sessionId` の先頭をより長く使う（8 文字 → 16 文字など） — UUIDv7 の先頭は
  タイムスタンプ由来なので、桁を伸ばしても衝突確率が下がるだけで構造的な原因は残ります。
  同一ミリ秒帯の連続実行という、実際に踏んだ条件に対しては弱い対処です
- `sessionId` 全体をファイル名に使う — 衝突は消えますが、
  ファイル名が 36 文字伸びます。既存の日付・slug と併せると可読性を損ないます

**Consequences**: ファイル名の識別子が `sessionId` 全体の関数になったため、
同一セッションの再実行は常に同じファイル名へ書き込まれ、異なるセッションは衝突しません。
一方、本変更以前に出力されたファイルは旧方式の識別子を持つため、
再実行すると新しい名前で出力されます。旧ファイルは自動的には削除されません。

`buildOutputPath` の async 化は呼び出し元へ波及します。回帰は
`output-path.unit.spec.ts` / `session-writer.unit.spec.ts` / `write-session.functional.spec.ts` を含む
export モジュール全 18 ファイル・263 ステップで固定しています。

> 出典: beads `cle-ciw`（closed 2026-07-20） / GitHub #446。実装は commit `75dd1b23`（PR #338）

---

## Change History

| Date       | Version | Description                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 を記録（`cle-ciw` が出典） |

<!-- markdownlint-enable line-length -->
