---
title: "Design Specification: classify pipeline refactoring to ActionStatusEntry"
based-on: requirements.md v1.1
status: Draft
---

<!-- markdownlint-disable line-length -->

> **Normative Statement**
> This document defines the behavioral contracts for the classify pipeline refactoring.
> Implementation details are explicitly out of scope.

## 1. Overview

### 1.1 Purpose

`classify-chatlogs` パイプライン内の全処理ユニットが `ActionStatusEntry`（ASE）を共通インターフェースとして受け渡し、project 名を `ChatlogEntry` のフロントマターに保持する振る舞いを定義する。

### 1.2 Scope

本仕様は以下の5ユニットの外部振る舞いを定義する:

1. **collect** — ディレクトリ走査と ASE 生成
2. **pre-sort** — AI 不要な事前分類と action 付与
3. **ai-sort** — AI 分類と frontmatter への project 記録
4. **apply** — ファイル移動と統計カウント
5. **type-ext** — `ENTRY_ACTIONS` の拡張

実装の内部構造・型定義・ファイルパスは対象外とする。

---

## 2. Design Principles

### 2.1 Classification Philosophy

パイプラインは4段階の変換ステージで構成される。各ステージは `ActionStatusEntry[]` を受け取り、`ActionStatusEntry[]` を返す。副作用（ファイル移動・統計更新）は最終ステージ（apply）にのみ許容される。

project 名はパイプライン全体を通じて `ChatlogEntry` のフロントマターに保持される。移動先パスは `ActionStatusOptions.targetPath` に設定され、apply ステージが読み出す。

### 2.2 Design Assumptions

- `ActionStatusEntry.entry` は常に有効な `ChatlogEntry` を保持する。エラー時は ASE を生成しない。
- `ActionStatusOptions.targetPath` は移動が必要なエントリ（action: move / move-by-ai）にのみ設定される。
- `main` 関数のシグネチャと `ClassifyStats` 型は変更されない。
- pre-sort / ai-sort は入力 ASE をディープコピーして返す。入力 ASE[] は変更しない（immutable pipeline）。

### 2.3 External Design Summary

#### Feature Decomposition

| Unit     | Responsibility                                                           | REQ Coverage |
| -------- | ------------------------------------------------------------------------ | ------------ |
| collect  | .md ファイル収集 → ASE[] 生成                                            | REQ-F-001    |
| pre-sort | ASE ディープコピー → action / targetPath / project を付与（純粋変換）    | REQ-F-002    |
| ai-sort  | ASE ディープコピー → AI 分類 → move-by-ai + frontmatter 記録（純粋変換） | REQ-F-003    |
| apply    | ファイル移動 + stats カウント                                            | REQ-F-004    |
| type-ext | ENTRY_ACTIONS 拡張                                                       | REQ-F-005    |

#### Unit Interaction Map

各変換ユニットは入力 ASE をディープコピーして処理する（immutable pipeline）。
`frontmatter` / `targetPath` はコピー側の ASE に設定される。

```text
[.md files]
    |
    v
+-------------+   ASE[]（コピー）   +-----------+   ASE[]（コピー）   +-----------+
|   collect   | ------------------> | pre-sort  | ------------------> |  ai-sort  |
+-------------+                     +-----------+                     +-----------+
                                     コピーに設定:                     コピーに設定:
                                     action(skip/move/pending)         action(move-by-ai)
                                     targetPath                        targetPath
                                     frontmatter.project               frontmatter.project
                                          |                                  |
                                          | resolved(skip/move)              | (move-by-ai)
                                          +----------------------------------+
                                                         |
                                                         v
                                                   +----------+
                                                   |  merge   |  ← pre-sort resolved + ai-sort 結果
                                                   +----------+
                                                         |
                                                         v
                                                   +-----------+
                                                   |   apply   | --> [files moved]
                                                   |           | --> [ClassifyStats]
                                                   +-----------+
```

#### Data Flow Diagram

```text
[dir: string]
      |
      v
[collect] --> ASE[] (entry, options.filePath)
      |
      v
[pre-sort] --> ASE[] コピー (+ action, targetPath, frontmatter.project)
      |
      +-- resolved (action: skip / move) ------+
      |                                        |
      +-- pending (action: pending) --------+  |
                                            |  |
                                            v  |
                                       [ai-sort] --> ASE[] コピー (action: move-by-ai)
                                            |
                                            v
                                       [merge: resolved + ai-sort 結果]
                                            |
                                            v
                                       [apply] --> void (ファイル移動 + ClassifyStats 更新)
```

### 2.4 Non-Goals

> **Derivation**: 以下は requirements.md Out of Scope セクションに由来する。

- `ClassifyConfig` / `ClassifyStats` / `ClassifyResult` 型の変更 ← REQ: Out of Scope #1
- `classify-config.ts` / `load-project-dic.ts` の変更 ← REQ: Out of Scope #2
- `_scripts/types/` 既存フィールドの削除・変更（追加のみ許可） ← REQ: Out of Scope #3
- テストコード以外の外部スキルへの影響 ← REQ: Out of Scope #4

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                                              | Rationale                                                                                       | Affected Rules       | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- | ------ |
| DD-01 | ファイルシステムエラー時は ChatlogError をスロー。フロントマター解析エラー時は `action: 'error'`, `status: 'error'` の ASE を生成する | 動作の直交性を保ち、パイプラインを継続しつつ stats.error に正確にカウントする                   | R-001, R-002a        | Active |
| DD-02 | `ENTRY_ACTIONS` に `MOVEBYAI` / `PENDING` / `ERROR` を追加                                                                            | リテラル直書きを防ぎコンパイル時型チェックで誤用を防ぐ。`action` と `status` の直交性を維持する | R-003, R-005, R-002a | Active |
| DD-03 | project 名は `ChatlogEntry` フロントマターに保持する                                                                                  | apply ステージが project 名を1箇所から読み出せるよう統一する                                    | R-004, R-007         | Active |
| DD-04 | 移動先パスは `ActionStatusOptions.targetPath` に保持する                                                                              | apply が移動先ディレクトリを ASE から直接読み出せるよう汎用化                                   | R-007, R-008         | Active |
| DD-05 | `targetPath` / move 関数を汎用化し classify 固有の依存をなくす                                                                        | 共通型として他モジュールでも再利用できる設計にする                                              | R-007                | Active |
| DD-06 | pre-sort / ai-sort は入力 ASE をディープコピーして返す（immutable pipeline）                                                          | 副作用をなくし全変換ユニットを純粋関数として統一する（REQ-NF-002 との整合）                     | R-004, R-005, R-007  | Active |

### 2.6 Related Decision Records

> No Decision Records currently affect this specification.

### 2.7 DD to DR Promotion Criteria

DD-04（`targetPath` 汎用化）と DD-05（move 関数汎用化）は `_scripts/` 共通型への変更を伴うため、他モジュールへの影響範囲次第で DR への昇格を検討する。

---

## 3. Behavioral Specification

### 3.1 Input Domain

- **collect の入力**: 存在するディレクトリパス
- **pre-sort / ai-sort の入力**: collect または前段が返した `ActionStatusEntry[]`
- **apply の入力**: pre-sort の resolved 結果（action: skip / move）と ai-sort の結果（action: move-by-ai）を結合した `ActionStatusEntry[]`、移動先ベースディレクトリ、dryRun フラグ、統計オブジェクト

### 3.2 Output Semantics

| Unit     | 成功時の出力                                                           | 失敗時の振る舞い                                                                                                            |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| collect  | 各 .md ファイルに対応する ASE[]（空配列もあり）                        | ファイルシステムエラー → ChatlogError スロー。フロントマター解析エラー → `action: 'error'`, `status: 'error'` の ASE を返す |
| pre-sort | 入力のディープコピー。全エントリに action が設定された ASE[]           | 例外なし（純粋変換）                                                                                                        |
| ai-sort  | 入力のディープコピー。pending エントリが move-by-ai に変換された ASE[] | ChatlogError をスロー                                                                                                       |
| apply    | void（ファイル移動完了、stats 更新済み）                               | ファイル移動失敗は stats.error++ のみ                                                                                       |

---

## 4. Decision Rules

評価は以下の順序で実施されなければならない。順序の変更は不可。

### 4.1 collect ステージの規則

| Rule ID | Step | Condition                                | Outcome                                                                                   |
| ------- | ---: | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| R-001   |    1 | ファイルシステムエラー（読み込み不可等） | ChatlogError をスロー                                                                     |
| R-002   |    2 | .md ファイルが正常に読める               | 有効な entry を持つ ASE を生成して返す                                                    |
| R-002a  |    3 | フロントマター解析エラー                 | `action: 'error'`、`status: 'error'` の ASE を生成して返す（ChatlogError をスローしない） |

### 4.2 pre-sort ステージの規則

各エントリは入力 ASE のディープコピーに対して変換を行う。入力 ASE は変更しない。

| Rule ID | Step | Condition                                                                                                             | Outcome                                                                                         |
| ------- | ---: | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| R-003   |    1 | frontmatter に `project` あり かつ 現在ディレクトリが `project` サブディレクトリ内                                    | コピーの action: `'skip'`（targetPath 不要）                                                    |
| R-004   |    2 | frontmatter に `project` あり かつ 現在ディレクトリが `project` サブディレクトリ外                                    | コピーの action: `'move'`、targetPath: destDir を設定                                           |
| R-005   |    3 | frontmatter に `project` なし かつ メタ情報なし かつ 本文が `MIN_CLASSIFIABLE_LENGTH`（設定定数で決定する文字数）未満 | コピーの action: `'move'`、コピーの frontmatter に FALLBACK_PROJECT を設定、targetPath: destDir |
| R-006   |    4 | 上記いずれにも該当しない                                                                                              | コピーの action: `'pending'`（AI 分類待ち）                                                     |

### 4.3 ai-sort ステージの規則

各エントリは入力 ASE のディープコピーに対して変換を行う。入力 ASE は変更しない。戻り値はコピーした ASE の一覧。

| Rule ID | Step | Condition                                  | Outcome                                                                                                                        |
| ------- | ---: | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| R-007   |    1 | action が `'pending'` のエントリが存在する | 入力 ASE をディープコピーし、コピーの action: `'move-by-ai'`、コピーの frontmatter に project 設定、targetPath: destDir を設定 |
| R-008   |    2 | action が `'pending'` のエントリが 0件     | 空の ASE[] を即座に返す（AI 呼び出しなし）                                                                                     |
| R-009   |    3 | AI 呼び出しが失敗する                      | ChatlogError をスロー                                                                                                          |

### 4.4 apply ステージの規則

| Rule ID | Step | Condition                | Outcome                                                                                                      |
| ------- | ---: | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| R-010   |    1 | action が `'move'`       | `options.targetPath/{project}/` へ移動、stats.moved++                                                        |
| R-011   |    2 | action が `'move-by-ai'` | `options.targetPath/{project}/` へ移動、stats.movedByAI++                                                    |
| R-012   |    3 | action が `'skip'`       | ファイル移動なし、stats.skipped++                                                                            |
| R-013   |    4 | action が `'pending'`    | ファイル移動なし、stats.remaining++                                                                          |
| R-013a  |    5 | action が `'error'`      | ファイル移動なし、stats.error++、エラーをログ出力（フロントマター解析失敗ファイル）                          |
| R-014   |    6 | ファイル移動が失敗する   | stats.error++、エラーをログ出力（スローしない）                                                              |
| R-015   |    7 | dryRun が true           | ファイル移動と AI 呼び出しをスキップし、ログ出力のみ行う。stats.moved / stats.movedByAI はインクリメントする |

### 4.5 type-ext ステージの規則

| Rule ID | Step | Condition                           | Outcome                                                                     |
| ------- | ---: | ----------------------------------- | --------------------------------------------------------------------------- |
| R-016   |    1 | `ENTRY_ACTIONS.MOVEBYAI` を参照する | 値は `'move-by-ai'` でなければならない                                      |
| R-017   |    2 | `ENTRY_ACTIONS.PENDING` を参照する  | 値は `'pending'` でなければならない                                         |
| R-017a  |    3 | `ENTRY_ACTIONS.ERROR` を参照する    | 値は `'error'` でなければならない                                           |
| R-018   |    4 | `EntryAction` 型を評価する          | `'move-by-ai'`、`'pending'`、`'error'` を有効な値として含まなければならない |

---

## 5. Edge Cases

| Input 状態                                              | 適用 Rule | Outcome                                                                | REQ       |
| ------------------------------------------------------- | --------- | ---------------------------------------------------------------------- | --------- |
| ディレクトリが空                                        | R-002     | 空の ASE[] を返す（エラーなし）                                        | REQ-F-001 |
| .md 以外のファイルが混在                                | R-002     | .md のみを収集対象とする                                               | REQ-F-001 |
| フロントマター解析エラー                                | R-002a    | `action: 'error'`, `status: 'error'` の ASE を返す（パイプライン継続） | REQ-F-001 |
| frontmatter に project あり・正しいサブディレクトリ内   | R-003     | action: skip、移動しない                                               | REQ-F-002 |
| frontmatter に project あり・別ディレクトリ             | R-004     | action: move、targetPath に destDir 設定                               | REQ-F-002 |
| frontmatter なし・本文が `MIN_CLASSIFIABLE_LENGTH` 未満 | R-005     | FALLBACK_PROJECT へ move                                               | REQ-F-002 |
| pending エントリが 0件                                  | R-008     | 空 ASE[] を返す（AI 呼び出しなし）                                     | REQ-F-003 |
| AI が FALLBACK_PROJECT を返す                           | R-007     | そのまま move-by-ai として記録                                         | REQ-F-003 |
| targetPath が未設定の move エントリ                     | R-014     | stats.error++（移動不可）                                              | REQ-F-004 |
| dryRun: true の move エントリ                           | R-015     | ファイル移動せず stats.moved をカウント                                | REQ-F-004 |

---

## 6. Requirements Traceability

| Requirement ID | Spec Rule             | Notes                                                    |
| -------------- | --------------------- | -------------------------------------------------------- |
| REQ-F-001      | R-001, R-002, R-002a  | collect ステージの全規則（解析エラー含む）               |
| REQ-F-002      | R-003 〜 R-006        | pre-sort ステージの全規則                                |
| REQ-F-003      | R-007 〜 R-009        | ai-sort ステージの全規則                                 |
| REQ-F-004      | R-010 〜 R-015        | apply ステージの全規則（dryRun、error 含む）             |
| REQ-F-005      | R-016 〜 R-018, DD-02 | type-ext ステージ規則 + ENTRY_ACTIONS 拡張（ERROR 含む） |
| REQ-NF-001     | Section 1.2 Scope     | ClassifyBuffer 廃止の境界を定義                          |
| REQ-NF-002     | Section 2.1           | 副作用を apply に限定する原則                            |
| REQ-NF-003     | Section 2.2           | main / ClassifyStats 不変の前提                          |
| REQ-C-001      | DD-02, DD-04, DD-05   | 共通型への追加のみ許可                                   |
| REQ-C-002      | R-001, R-009          | ChatlogError 使用規則                                    |

---

## 7. Open Questions

> **Status**: COMPLETE

| # | Question                                                                    | Source       | Impact             | Resolution                                                                                                |
| - | --------------------------------------------------------------------------- | ------------ | ------------------ | --------------------------------------------------------------------------------------------------------- |
| 1 | ai-sort の frontmatter.set() が REQ-NF-002「純粋関数」要件と矛盾しないか？  | REQ-NF-002   | ai-sort の設計方針 | 解決済み: 入力 ASE のディープコピーを作成し、コピー側 frontmatter に設定することで副作用をなくす（DD-06） |
| 2 | `ActionStatusOptions.targetPath` は共通型に追加するか classify 独自拡張か？ | DD-04, DD-05 | 共通型への影響範囲 | 解決済み: `_scripts/` 共通型 `ActionStatusOptions` に `targetPath?: string` を追加する（DD-05）           |

---

## 8. Change History

| Date       | Version | Description                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------------- |
| 2026-06-06 | 1.0.0   | Initial specification                                                                        |
| 2026-06-06 | 1.1.0   | DD-06 追加: immutable pipeline（ASE ディープコピー）、OQ-1/OQ-2 解決                         |
| 2026-06-06 | 1.2.0   | review(explore): 図修正(immutable/merge)、R-015 dryRun 明確化、R-016〜018 追加、閾値定数明記 |
| 2026-06-06 | 1.3.0   | review(tasks): DD-01/02 更新、R-002a/R-013a/R-017a 追加（action:error で stats.error++）     |
