---
title: "Decision Records: libs/cache"
module: "libs/cache"
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

| ID    | Decision                                                     | 主な影響先                         |
| ----- | ------------------------------------------------------------ | ---------------------------------- |
| DR-01 | キャッシュキーはベース名のままとし、`baseDir` の導入を見送る | `ChatlogCache` / 呼び出し 3 スキル |

---

## DR-01: キャッシュキーはベース名のままとし、`baseDir` の導入を見送る

**Status**: Accepted（対処しないことを決定した記録です）

**Context**: `ChatlogCache._toHashKey` は `getBasename(filePath)` だけをキーにしています。
この設計は、机上では次の衝突を許します。agent・期間・`--input-dir` の異なる 2 つのチャットログが
同じベース名を持つと、`claude/.../chat.md` に対するキャッシュ結果が
`chatgpt/.../chat.md` へ誤って再利用されます。後者は誤ったプロジェクトへ移動され、
AI 分類にかけられないまま処理済みとして扱われます。

当初の対処方針は次のとおりでした。

1. `skills/_scripts/libs/io/hash.ts` に決定的な（乱数を含まない）SHA-256 ハッシュ関数を追加する
2. `ChatlogCache` のコンストラクタへ、解決済み入力ディレクトリを指す `baseDir` 引数を足す
3. `_toHashKey` を、`baseDir` からの相対パス（`getRelativePath` により Unix 正規化済み）と
   ベース名を組み合わせてハッシュする方式へ変える
4. `classify-chatlogs.ts` / `filter-chatlogs.ts` / `set-frontmatter.ts` の呼び出し元を更新する

**Decision**: 上記の対処を **実施しない**。`_toHashKey` はベース名のみを入力とする現行の実装を維持し、
`baseDir` 引数と決定的ハッシュ化は導入しない。

**Rationale**: 衝突の前提が実データでは成立しないためです。出力ファイル名は
`sessionId` に由来し、`sessionId` は UUID 由来で一意です。したがって
agent やディレクトリをまたいでベース名が衝突することは通常起きません。

衝突が現実に起きうるのは `sessionId` が欠落した場合に限られますが、この経路は
export-chatlogs 側で既に塞がれています。`resolveSessionId()` が
`session-writer.ts` に実装済みです（2026-07-18 対応）。
つまり本 issue が想定した衝突は、上流の修正によって発生条件そのものが消えています。

**Alternatives Considered**:

- 当初方針どおり `baseDir` を導入する — 衝突が起きない前提のために、
  `ChatlogCache` のコンストラクタ・キー生成・呼び出し 3 スキルへ変更が波及します。
  対価に見合いません。加えて、キー生成方式を変えると既存のキャッシュエントリが
  すべて無効化され、全ファイルが AI へ再送されます
- 実行中にベース名の衝突を検出して警告する — 検出そのものは
  `filter/strip` の DR-40 が列挙直後の fail-fast として別途採用しています。
  ただし `ChatlogCache` 側にキー生成の注入口を設ける必要があり、
  `_cle-libs` への波及を理由に DR-40 でも保留されています

**Consequences**: `sessionId` が欠落し、かつ `resolveSessionId()` でも補えない
チャットログが将来現れた場合、この衝突は再び現実の問題になります。
その時点で本 DR を見直し、当初方針 1〜4 を再検討します。
調査の詳細は `chatlogs/originalLogs/claude/2026/2026-07/2026-07-18-exportbasehash-fac8410f.md` にあります。

> 出典: beads `cle-a5a`（closed 2026-07-19） / GitHub #448。調査の発端は GitHub #326

---

## Change History

| Date       | Version | Description                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 を記録（`cle-a5a` が出典） |

<!-- markdownlint-enable line-length -->
