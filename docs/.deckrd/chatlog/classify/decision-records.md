---
title: "Decision Records: chatlog/classify"
module: "chatlog/classify"
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

| ID    | Decision                                                                        | 主な影響先                         |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------- |
| DR-01 | `projects.dic` は `dicsDir` 配下から導出し、明示指定時のみ `projectsDic` を優先 | `build-config.ts` / `GlobalConfig` |

---

## DR-01: `projects.dic` は `dicsDir` 配下から導出し、明示指定時のみ `projectsDic` を優先する

**Status**: Accepted

**Context**: classify-chatlogs の `projects.dic` は `projectsDic` 設定値で独立に管理されていました。
`dicsDir` は `ClassifyConfig` に入るものの、production コードでは `projects.dic` の導出に使われておらず、
**classify-chatlogs にとって実質的に死んだ設定** でした。

調査で分かった構造は次のとおりです。

- `buildConfig()` は `parseArgs()` のマージ結果をそのまま返しており、`dicsDir` から
  `projectsDic` を導出していない
- `GlobalConfig` の既定 `projectsDic` は `.config/chatlog-exporter/dics/projects.dic` の固定値で、
  `dicsDir` を YAML で上書きしても追従しない
- この独立性は `build-config.functional.spec.ts` の `T-CL-BC-19` が
  「`dicsDir` を変えても `projectsDic` は独立」として **明示的に固定している**
- 一方 `loadProjectDic()` は `resolveConfigPath({ defaultPath: 'dics/projects.dic' })` を既に使っており、
  設定ディレクトリ配下の既定辞書を解決する構造そのものは存在する

つまり要望を満たすには、テストが固定している既存仕様を変更する判断が要ります。

なお要望時に言及された `resolveConfigDir` という API は現行コードに存在せず、
該当するのは `resolveConfigPath` です。

**Decision**:

1. `projectsDic` が明示指定されていない場合、classify-chatlogs は `${dicsDir}/projects.dic` を使う
2. `projectsDic` が YAML / CLI などで明示指定された場合は、後方互換のため `projectsDic` を優先する
3. `T-CL-BC-19` が固定していた「独立」仕様は本 DR により置き換える

**Alternatives Considered**:

- `projectsDic` を廃止し `dicsDir` 配下に一本化する — 既存の設定ファイルで
  `projectsDic` を明示している利用者の設定が黙って無視されます。
  辞書の場所が変わったことに気づかないまま、意図しない辞書で分類が走る形になるため不採用
- `dicsDir` を classify-chatlogs から取り除く — 死んだ設定を消すという意味では筋が通りますが、
  他スキルは `dicsDir` を使っており、スキルごとに辞書ディレクトリの解釈が分かれます。
  要望は「`dicsDir` 配下へ寄せたい」であり、逆方向の解決になります
- `GlobalConfig` の既定値そのものを `dicsDir` 依存にする — `GlobalConfig` は全スキル共通のため、
  classify-chatlogs 以外へも影響が波及します。変更範囲を classify-chatlogs の
  `buildConfig` に閉じる方が、影響を確認できる範囲に収まります

**Consequences**: `dicsDir` を変更すると `projects.dic` の解決先が追従するようになり、
辞書の置き場所を 1 箇所で管理できます。`projectsDic` を明示している既存設定は従来どおり動きます。
`T-CL-BC-19` は新仕様に合わせて更新が必要です。`dicsDir` が相対パスの場合の解決は
`resolveConfigPath` により `configDir` 基準で行い、既存の `dicsDir` の扱いと整合させます。

> 出典: beads `cle-55n.5`（closed 2026-07-16） / GitHub #441

---

## Change History

| Date       | Version | Description                                                                           |
| ---------- | ------- | ------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 を記録（`cle-55n.5` が出典） |

<!-- markdownlint-enable line-length -->
