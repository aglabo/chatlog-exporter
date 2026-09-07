---
title: "Decision Records: chatlog/set-frontmatter"
module: "chatlog/set-frontmatter"
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

> 続行側 AI エラーの扱い（フォールバック値を書かず `logger.error` で記録して skip する決定）は、
> `libs/ai-backend` の DR-29 が所有します。本書では重複して記録しません。

## Index

| ID    | Decision                                                                     | 主な影響先                                |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| DR-01 | サマリーの `written` を `cached` に改め、変更範囲をラベルと表示名に限定する  | `phase.types.ts` / `set-frontmatter.ts`   |
| DR-02 | 設計チェーンから切れたテストは削除せず、改番して `tasks.md` に対応項目を足す | `tasks.md` / `judge-type-category` テスト |

---

## DR-01: サマリーの `written` を `cached` に改め、変更範囲をラベルと表示名に限定する

**Status**: Accepted

**Context**: set-frontmatter の完了サマリーに出る `written` は、名前に反して
「今回書き込んだ件数」ではありません。「実行開始時点でキャッシュが `written` 済み、
つまり今回スキップされた件数」を表します。

2026-08-22 の `/set-frontmatter claude 2026-07` 実行で、
`total=677 success=677 fail=0 skip=0 written=0 target=677` が出力されました。
出力先には 677 件が生成済みで処理は正常です。値としては仕様どおりですが、
**677 件すべてを書いたのに `written=0` と報告される** ため、名前から意味が読み取れません。

`stats.written` は Phase 1.2 で `writtenEntries.length` として一度だけ代入され、
`phase-write.ts` は `success` / `fail` / `skip` のみを更新します。
今回書き込んだ件数を表しているのは `success` です。

**Decision**:

1. `Stats.written` を `Stats.cached` に改名する。新しいラベルは `cached` とする
2. 変更範囲は「ラベル・フィールド名・`SKILL.md`」に限定する。集計ロジックは変更しない
3. `SKILL.md` のステップ 4 に全 6 カウンタの意味を表で明記する
4. dry-run 集計行の `written=` はキャッシュの status 名であり、
   サマリーの `cached` とは別物である旨を注記する

**Alternatives Considered**:

- 集計の意味を名前に合わせる（`written` を「今回書き込んだ件数」に変える） —
  それは `success` が既に持っている値であり、同じ数を 2 つのカウンタで報告することになります。
  スキップ件数を報告する手段も失われます
- 名前を変えず `SKILL.md` の説明だけを足す — サマリーは実行のたび目に入りますが、
  `SKILL.md` は読まれるとは限りません。誤解の発生源である出力そのものを直す方が確実です
- `cached` ではなく `skipped` とする — `skip` カウンタが別に存在し、
  こちらは書き込みフェーズでスキップした件数です。同じ語を 2 つの異なる意味で使うことになります

**Consequences**: `T-SF-DR-01`〜`03` の期待文字列とラベルを `cached` に追随させました
（テスト ID は据え置き。シナリオ自体は不変）。テストヘルパー 2 件
（`load-all-entries.functional` / `phase-write.unit`）も追随しています。

`SKILL.md` の例が `written=8 target=10` という成立しない値になっていたため、
`total=10 success=2 fail=0 skip=0 cached=8 target=2` に修正しました。

> 出典: beads `cle-ye2`（closed 2026-09-07） / GitHub #440

---

## DR-02: 設計チェーンから切れたテストは削除せず、改番して `tasks.md` に対応項目を足す

**Status**: Accepted

**Context**: `judge-type-category.unit.spec.ts` の
`[Edge] T-SF-TC-24: 非 AiError の例外 → throw せずフォールバック値が書き込まれる` は、
`libs/ai-backend` の DR-29 決定 2（フォールバック値の書き込みは非 AiError 専用）を固定する
**唯一のテスト** です。しかし `tasks.md` のどの項目にも対応しておらず、
deckrd の設計チェーン REQ → SPEC → TASK → IMPL → TEST から切れていました。

上流に検証基準の記述がないため、次のセッションで「タスク ID のないテスト」として
削除される恐れがあります。

**Decision**: `T-SF-TC-24` を `T-SF-LAB-03-02` へ改番し、`tasks.md` の T-06-12 配下に
`T-06-12-02` を `[x]` で追加する。テストの置き場所は
`judge-type-category.unit.spec.ts` に据え置き、改番のみ行う。

**Rationale**: classify には既に `T-06-09-01`「非 AiError 例外時の既存フォールバック挙動が
変化しない」（Test ID: `T-CL-LAB-03-01`）があり、`T-SF-TC-24` が set-frontmatter で
固定している内容と同一性質です。つまり **set-frontmatter 側だけ対の項目が欠けていた
構造上の穴** であり、この決定は欠落を埋めるだけで書式の例外を要しません。
T-06 が宣言する Test ID prefix（`T-SF-LAB`）にも従います。

`T-SF-LAB-03-01` は `setfm-frontmatter.unit.spec.ts` にあり、LAB の番号グループは
`tasks.md` のセクションに従ってファイル・スイートを跨ぐ前例があるため、
テストを移動する必要はありません。

**Alternatives Considered**:

- `T-SF-TC-24` の ID のまま `tasks.md` に項目を足す — `tasks.md` の Test ID は
  すべて `XX-NN-NN` 形式であり、`T-SF-TC-24` だけが平番の異物になります
- `tasks.md` ではなく DR への参照だけを注記する — DR は non-normative であり、
  検証基準の所在としては弱い。設計チェーンは TASK が検証基準を持つ構造です

**Consequences**: DR-29 決定 2 を固定するテストが設計チェーンに接続され、
タスク ID のないテストとして削除される経路が塞がれました。
本 DR は「チェーンから切れたテストを見つけたときに削除ではなく接続を選ぶ」判断の前例になります。

> 出典: beads `cle-eek`（closed 2026-09-07） / GitHub #440

---

## Change History

| Date       | Version | Description                                                                                             |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-ye2` / `cle-eek` が出典） |

<!-- markdownlint-enable line-length -->
