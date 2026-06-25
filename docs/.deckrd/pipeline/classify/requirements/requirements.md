---
title: "Requirements: classify pipeline refactoring to ActionStatusEntry"
module: "pipeline/classify"
status: Draft
version: 1.1
created: "2026-06-06"
---

<!-- markdownlint-disable line-length -->

## 1. Overview

### 1.1 Purpose

`classify-chatlogs` スクリプト内の `ChatlogEntry` 処理を、共通型 `ActionStatusEntry`（ASE）を使用したパイプライン処理にリファクタリングする。独自型 `ClassifyBufferEntry` / `ClassifyBuffer` を廃止し、`_scripts/types/` の共通型で統一することで、モジュール間の型一貫性を向上させる。

### 1.2 Scope

以下の関数・型をすべて `ActionStatusEntry[]` ベースに切り替える:

- `findBufferEntries` — ファイル収集
- `preClassify` / `processPreclassify` — AI 不要事前分類
- `classifyByAI` / `processChunk` — AI 分類
- `moveClassified` / `classifyFile` — ファイル移動・stats 更新

また、`ENTRY_ACTIONS` に `'move-by-ai'` と `'pending'` を追加して AI 分類結果と AI 処理待ちを明示的に区別する。

**Out of Scope**:

- `ClassifyConfig` / `ClassifyStats` / `ClassifyResult` 型の変更
- `classify-config.ts` / `load-project-dic.ts` の変更
- `_scripts/types/action-status.types.ts` / `action-status-entry.types.ts` の既存型の変更（`ENTRY_ACTIONS` への追加のみ許可）
- テストコード以外の外部スキルへの影響

## 2. Context

- Target Environment: Deno ランタイム（TypeScript strict mode）
- Related Components:
  - `skills/_scripts/types/action-status-entry.types.ts` — `ActionStatusEntry` 型
  - `skills/_scripts/types/action-status.types.ts` — `ENTRY_ACTIONS` / `EntryAction` / `ENTRY_STATUSES`
  - `skills/_scripts/classes/ChatlogEntry.class.ts` — エントリ本体
  - `skills/classify-chatlogs/scripts/types/classify.types.ts` — 廃止対象型
- Assumptions:
  - `ActionStatusEntry.entry` は常に有効な `ChatlogEntry` を保持する（エラー時は ASE を作らない）
  - ファイル読み込み失敗時は `ChatlogError` をスローしてパイプラインを中断する

### System Context Diagram

```text
[.md ファイル群]    --> +-------------------------------+ --> [プロジェクト別サブディレクトリ]
                        |  classify pipeline (ASE ベース) |
[projects.dic]     --> |                               | --> [ClassifyStats]
[ClassifyConfig]   --> |  ASE[] パイプライン処理        |
                        +-------------------------------+
```

## 3. Design Decisions (Summary)

| ID    | Decision                                                         | Linked Record |
| ----- | ---------------------------------------------------------------- | ------------- |
| DR-01 | エラーエントリは ASE を作らず ChatlogError をスロー              | —             |
| DR-02 | `ENTRY_ACTIONS` に `'move-by-ai'` と `'pending'` を追加          | —             |
| DR-03 | `ClassifyBuffer` / `ClassifyBufferEntry` を廃止                  | —             |
| DR-04 | `ClassifyStats` カウントは `moveClassified` 内で実施             | —             |
| DR-05 | project 名は `ChatlogEntry` のフロントマターに記録・読み出しする | —             |

## 4. Functional Requirements

### REQ-F-001: ActionStatusEntry によるエントリ収集

- EARS Type: event-driven

```text
GIVEN classify パイプラインが起動している
  WHEN `findBufferEntries` がディレクトリ配下の .md ファイルを収集する
THEN the system SHALL 各ファイルを `ActionStatusEntry` として返し、
     読み込み失敗時は `ChatlogError` をスローしなければならない（SHALL）。
```

**Rationale**: `ClassifyBufferEntry.file` の null 許容をなくし、ASE の `entry` に常に有効な `ChatlogEntry` を保持させることで、後続処理での null チェックを不要にする。

**Acceptance Criteria**:

| AC ID  | Scenario                                     |
| ------ | -------------------------------------------- |
| AC-001 | 正常なファイルが ASE として収集される        |
| AC-002 | 読み込み失敗時に ChatlogError がスローされる |

---

### REQ-F-002: AI 不要エントリの事前分類

- EARS Type: event-driven

```text
GIVEN `ActionStatusEntry[]` が収集済みである
  WHEN `processPreclassify` が各エントリを評価する
THEN the system SHALL 各エントリの `options.action` を以下のいずれかに設定しなければならない（SHALL）:
     - フロントマターに `project` あり かつ 正しいディレクトリ内 → `'skip'`
     - フロントマターに `project` あり かつ 別ディレクトリ → `'move'`
     - メタ情報なし かつ 本文が短い → `'move'`（project は FALLBACK_PROJECT）
     - それ以外 → `'pending'`（AI 分類待ち）
```

**Rationale**: AI 呼び出し不要なエントリを早期に確定させ、`classifyByAI` の処理対象を最小化する。`'pending'` は「AI 処理待ちで未確定」を明示するために `'keep'` と区別する。

**Acceptance Criteria**:

| AC ID  | Scenario                                            |
| ------ | --------------------------------------------------- |
| AC-003 | project 設定済み・正しいディレクトリ → action: skip |
| AC-004 | project 設定済み・別ディレクトリ → action: move     |
| AC-005 | メタなし・短い本文 → action: move, project: misc    |
| AC-006 | メタあり → action: pending（AI 分類待ち）           |

---

### REQ-F-003: AI によるエントリ分類

- EARS Type: event-driven

```text
GIVEN `ActionStatusEntry[]` に `action: 'pending'` のエントリが存在する
  WHEN `classifyByAI` が AI 分類を実行する
THEN the system SHALL 各エントリの `options.action` を `'move-by-ai'` に設定し、
     割り当てたプロジェクト名を `entry.frontmatter` に `'project'` キーで記録しなければならない（SHALL）。
```

**Rationale**: AI 分類結果を `'move'` と区別することで、`ClassifyStats.movedByAI` のカウントが正確に行える。project 名は `options.reason` ではなく `ChatlogEntry` のフロントマターに記録することで、後続の `moveClassified` がフロントマターから直接 project 名を読み出せる。

**Acceptance Criteria**:

| AC ID  | Scenario                                                              |
| ------ | --------------------------------------------------------------------- |
| AC-007 | AI 分類成功 → action: move-by-ai, frontmatter に project が設定される |
| AC-008 | AI 呼び出し失敗 → ChatlogError がスローされる                         |

---

### REQ-F-004: ASE ベースのファイル移動と stats 更新

- EARS Type: event-driven

```text
GIVEN 分類済みの `ActionStatusEntry[]` が存在する
  WHEN `moveClassified` が各エントリの `options.action` を評価する
THEN the system SHALL 以下の処理を実行しなければならない（SHALL）:
     - `'move'` → ファイルを `destDir/{project}/` へ移動し `stats.moved` をインクリメント
     - `'move-by-ai'` → ファイルを `destDir/{project}/` へ移動し `stats.movedByAI` をインクリメント
     - `'skip'` → ファイルを移動せず `stats.skipped` をインクリメント
     - `'pending'` → `stats.remaining` をインクリメント
     - エラー → `stats.error` をインクリメント
```

**Rationale**: stats 集計を `moveClassified` 内に閉じることで、呼び出し元の `main` を単純に保つ。

**Acceptance Criteria**:

| AC ID  | Scenario                                                    |
| ------ | ----------------------------------------------------------- |
| AC-009 | action: move → stats.moved がインクリメントされる           |
| AC-010 | action: move-by-ai → stats.movedByAI がインクリメントされる |
| AC-011 | action: skip → stats.skipped がインクリメントされる         |

---

### REQ-F-005: `ENTRY_ACTIONS` への `'move-by-ai'` と `'pending'` 追加

- EARS Type: feature-based

```text
GIVEN `_scripts/types/action-status.types.ts` が使用されている
  WHERE AI 分類結果と AI 処理待ちを明示的に区別する必要がある
THEN the system SHALL `ENTRY_ACTIONS` オブジェクトに以下を追加し、
     `EntryAction` 型にそれぞれの値を含めなければならない（SHALL）:
     - `MOVEBYAI: 'move-by-ai'` — AI 分類済みで移動対象
     - `PENDING: 'pending'` — AI 分類待ちで未確定
```

**Rationale**: リテラル直書きを避け、コンパイル時の型チェックで誤用を防ぐ。`'pending'` は `'keep'`（保持確定）と語義が異なるため別途追加する。

**Acceptance Criteria**:

| AC ID  | Scenario                                             |
| ------ | ---------------------------------------------------- |
| AC-012 | `ENTRY_ACTIONS.MOVEBYAI === 'move-by-ai'` が成立する |
| AC-013 | `EntryAction` 型に `'move-by-ai'` が含まれる         |
| AC-014 | `ENTRY_ACTIONS.PENDING === 'pending'` が成立する     |
| AC-015 | `EntryAction` 型に `'pending'` が含まれる            |

## 5. Non-Functional Requirements

### REQ-NF-001: 型一貫性

`ClassifyBufferEntry` / `ClassifyBuffer` 型は削除し、`ActionStatusEntry[]` に完全移行しなければならない（MUST）。

### REQ-NF-002: テスタビリティ

各パイプライン関数は単体でテスト可能な純粋関数として実装されなければならない（MUST）。副作用（ファイル移動・stats 更新）は `moveClassified` 内に限定する。

### REQ-NF-003: 後方互換性

`main` 関数のシグネチャおよび `ClassifyStats` 型は変更してはならない（MUST NOT）。

## 6. Constraints

### REQ-C-001: 既存型の最小変更

`_scripts/types/action-status.types.ts` への変更は `ENTRY_ACTIONS` への `MOVEBYAI` と `PENDING` の追加のみとする。他のフィールドの削除・変更は禁止する。

### REQ-C-002: ChatlogError の使用

ファイル読み込み失敗時は汎用例外ではなく `ChatlogError` をスローしなければならない（MUST）。

## 7. Acceptance Criteria

```gherkin
# AC-001: 正常なファイルが ASE として収集される
# Requirement: REQ-F-001
Scenario: findBufferEntries が ASE[] を返す
  Given ディレクトリに有効な .md ファイルが存在する
  When  findBufferEntries を呼び出す
  Then  各ファイルが ActionStatusEntry として返される
  And   entry フィールドに有効な ChatlogEntry が設定される

# AC-002: 読み込み失敗時に ChatlogError がスローされる
# Requirement: REQ-F-001
Scenario: ファイル読み込み失敗で ChatlogError がスローされる
  Given ディレクトリに読み込み不可なファイルが存在する
  When  findBufferEntries を呼び出す
  Then  ChatlogError がスローされる

# AC-007: AI 分類成功で move-by-ai が設定される
# Requirement: REQ-F-003
Scenario: AI 分類成功時に action が move-by-ai になる
  Given action: 'pending' の ActionStatusEntry が存在する
  When  classifyByAI を呼び出す
  Then  各エントリの options.action が 'move-by-ai' に設定される
  And   entry.frontmatter に 'project' キーでプロジェクト名が記録される

# AC-010: move-by-ai で movedByAI がインクリメントされる
# Requirement: REQ-F-004
Scenario: move-by-ai エントリ移動後に movedByAI がカウントアップされる
  Given action: 'move-by-ai' の ActionStatusEntry が存在する
  When  moveClassified を呼び出す
  Then  stats.movedByAI が 1 増加する
  And   ファイルが destDir/{project}/ へ移動される

# AC-012: ENTRY_ACTIONS.MOVEBYAI が正しく定義される
# Requirement: REQ-F-005
Scenario: ENTRY_ACTIONS に move-by-ai が追加される
  Given action-status.types.ts に ENTRY_ACTIONS が定義されている
  When  ENTRY_ACTIONS.MOVEBYAI を参照する
  Then  値が 'move-by-ai' と等しい
```

## 8. User Stories

1. As a 開発者, I want `ClassifyBufferEntry` を `ActionStatusEntry` に統一したい。Because 型の二重管理を解消してコードの一貫性を高めたい。

2. As a 開発者, I want AI 分類結果を `action: 'move-by-ai'` で明示的に区別したい。Because `ClassifyStats.movedByAI` の集計を正確に行いたい。

3. As a 開発者, I want ファイル読み込み失敗時に null チェックを不要にしたい。Because ASE の `entry` が常に有効であれば後続処理が簡潔になる。

4. As a 開発者, I want `moveClassified` を ASE ベースで統一したい。Because パイプライン全体で同一の型を使い、`action` による分岐を一箇所に集約したい。

5. As a テスター, I want 各パイプライン関数を単体テストしたい。Because 純粋関数として実装されていれば、モックなしで入出力を検証できる。

## 9. Traceability

| REQ ID     | AC IDs           | Type           |
| ---------- | ---------------- | -------------- |
| REQ-F-001  | AC-001, AC-002   | Functional     |
| REQ-F-002  | AC-003 〜 AC-006 | Functional     |
| REQ-F-003  | AC-007, AC-008   | Functional     |
| REQ-F-004  | AC-009 〜 AC-011 | Functional     |
| REQ-F-005  | AC-012 〜 AC-015 | Functional     |
| REQ-NF-001 | —                | Non-Functional |
| REQ-NF-002 | —                | Non-Functional |
| REQ-NF-003 | —                | Non-Functional |
| REQ-C-001  | —                | Constraint     |
| REQ-C-002  | —                | Constraint     |

## 10. Open Questions

| Question                                                                                          | Type | Impact Area | Owner    |
| ------------------------------------------------------------------------------------------------- | ---- | ----------- | -------- |
| （解決済み）`reason` フィールドへの project 名格納 → frontmatter に記録する方針に決定（DR-05）    | 設計 | REQ-F-003   | Resolved |
| （解決済み）`keep` vs `remaining` の命名 → `PENDING: 'pending'` を追加して AI 待ちを明示（DR-02） | 命名 | REQ-F-002   | Resolved |

## 11. Change History

| Date       | Version | Description                                                                |
| ---------- | ------- | -------------------------------------------------------------------------- |
| 2026-06-06 | 1.0.0   | Initial release                                                            |
| 2026-06-06 | 1.1.0   | review(explore): project 名を frontmatter に記録、`pending` アクション追加 |
