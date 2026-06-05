---
title: "Requirements: common/add-action-status — 汎用アクション・ステータス型の追加"
module: "common/add-action-status"
status: Draft
version: 1.0
created: "2026-06-05"
---

<!-- markdownlint-disable line-length -->>

> **Normative Statement**
> This document defines binding requirements.
> Implementations MUST conform to this document.
> RFC 2119 keywords apply to this document only.

## 1. Overview

### 1.1 Purpose

全 skill 横断で利用できる汎用アクション・ステータス型を `skills/_scripts/types/` に追加する。
各 skill がパイプライン処理で「これから実行する操作（Action）」と「実行結果の状態（Status）」を
統一的な型で表現できるようにし、`ChatlogEntry` にこれらを付与するラッパー型 `ActionStatusEntry` を提供する。

### 1.2 Scope

**In Scope**:

- `ENTRY_ACTIONS` 定数テーブルおよび `EntryAction` 型の定義
- `ENTRY_STATUSES` 定数テーブルおよび `EntryStatus` 型の定義
- `ActionStatusOptions` 型の定義（`filePath`（必須）+ `action?` + `status?` + `reason?`）
- `ActionStatusEntry` ラッパー型の定義（`entry: ChatlogEntry` + `options: ActionStatusOptions`）
- 2ファイル構成: `action-status.types.ts` / `action-status-entry.types.ts`
- `skills/_scripts/types/` への配置（純粋な型定義・クラスなし）

**Out of Scope**:

- 各 skill への `ActionStatusEntry` の適用（`filter/pipeline` 等は別モジュールで実施）
- アクション・ステータスの処理ロジック実装（型定義のみ）
- `ChatlogEntry` クラス自体の変更（Phase 2 で実施）
- `ChatlogEntry` からの `options` / `filePath` / `filename` 削除（Phase 2 で実施）
- skill 固有の拡張値の追加（skill 側で独自に拡張する）

**移行方針（2段階）**:

- Phase 1（本モジュール）: `ActionStatusEntry` を導入。`ChatlogEntry` は変更しない
- Phase 2（全 skill 移行完了後）: `ChatlogEntry` から `options` / `filePath` / `filename` を削除し、`EntryOptions` 型を廃止する

## 2. Context

- Target Environment: Deno ランタイム（TypeScript strict モード）
- Related Components: `skills/_scripts/classes/ChatlogEntry.class.ts`、`skills/_scripts/types/common.types.ts`
- Assumptions: `ChatlogEntry` は変更せず、ラッパー型として参照する

### System Context Diagram

```text
[skill: filter]    --> +--------------------------------------+
[skill: normalize] --> |   ActionStatusEntry (common型)      |
[skill: classify]  --> |                                      |
[skill: set-fm]    --> |  entry: ChatlogEntry                 |
                       |  filePath: string                    |
                       |  action?: EntryAction                |
                       |  status?: EntryStatus                |
                       |  reason?: string                     |
                       +--------------------------------------+
                                      |
                       +--------------+--------------+
                       |                             |
              [action-status.types.ts]   [action-status-entry.types.ts]
              ENTRY_ACTIONS 定数            ActionStatusEntry 型
              ENTRY_STATUSES 定数
              EntryAction 型
              EntryStatus 型
```

## 3. Design Decisions (Summary)

| ID    | Decision                                                              | Linked Record |
| ----- | --------------------------------------------------------------------- | ------------- |
| DR-01 | Action と Status を独立した値セットとして分離する                     | —             |
| DR-02 | `as const` 定数テーブルから型を導出する（CLASSIFY_ACTIONS パターン）  | —             |
| DR-03 | `pending` なし — 未処理は `action?: undefined` / `status?: undefined` | —             |
| DR-04 | 純粋な型定義のみ（クラスなし）、`_scripts/types/` に配置              | —             |
| DR-05 | Action と Status を1ファイル、ラッパー型を別ファイルの2ファイル構成   | —             |

## 4. Functional Requirements

### REQ-F-001: ENTRY_ACTIONS 定数テーブルと EntryAction 型の定義

- EARS Type: feature/config-based

```text
GIVEN TypeScript プロジェクトが skills/_scripts/types/ を参照している
  WHERE action-status.types.ts が存在する
THEN the system SHALL ENTRY_ACTIONS を as const オブジェクトとして定義し、
     EntryAction 型を typeof ENTRY_ACTIONS[keyof typeof ENTRY_ACTIONS] として導出する。
```

**値セット**:

| キー   | 値         | 意味                       |
| ------ | ---------- | -------------------------- |
| KEEP   | `'keep'`   | ファイルをそのまま保持する |
| SKIP   | `'skip'`   | 処理をスキップする         |
| MOVE   | `'move'`   | ファイルを移動する         |
| REMOVE | `'remove'` | ファイルを削除する         |
| WRITE  | `'write'`  | ファイルに書き込む         |

**Rationale**: 定数テーブルから型を導出することで、値の追加時に型と定数を同時に更新でき、文字列リテラルの typo を防ぐ。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                        |
| ------ | ------------------------------------------------------------------------------- |
| AC-001 | `ENTRY_ACTIONS.REMOVE` が `'remove'` リテラル型として参照できる                 |
| AC-002 | `EntryAction` が `'keep' \| 'skip' \| 'move' \| 'remove' \| 'write'` に一致する |

---

### REQ-F-002: ENTRY_STATUSES 定数テーブルと EntryStatus 型の定義

- EARS Type: feature/config-based

```text
GIVEN TypeScript プロジェクトが skills/_scripts/types/ を参照している
  WHERE action-status.types.ts が存在する
THEN the system SHALL ENTRY_STATUSES を as const オブジェクトとして定義し、
     EntryStatus 型を typeof ENTRY_STATUSES[keyof typeof ENTRY_STATUSES] として導出する。
```

**値セット**:

| キー        | 値              | 意味                             |
| ----------- | --------------- | -------------------------------- |
| PRE_SKIPPED | `'pre-skipped'` | 事前フィルタで除外された         |
| SKIPPED     | `'skipped'`     | 処理をスキップした               |
| KEPT        | `'kept'`        | 保持した（削除・移動しなかった） |
| MOVED       | `'moved'`       | ファイルを移動した               |
| REMOVED     | `'removed'`     | ファイルを削除した               |
| WRITTEN     | `'written'`     | ファイルへの書き込みが完了した   |
| ERROR       | `'error'`       | エラーが発生した                 |

**Rationale**: `pending` を持たず、未処理は `status?: undefined` で表現することで、初期化不要・型安全な状態管理を実現する。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                   |
| ------ | -------------------------------------------------------------------------- |
| AC-003 | `ENTRY_STATUSES.PRE_SKIPPED` が `'pre-skipped'` リテラル型として参照できる |
| AC-004 | `EntryStatus` が 7 値の union 型に一致する                                 |

---

### REQ-F-003: ActionStatusOptions と ActionStatusEntry ラッパー型の定義

- EARS Type: feature/config-based

```text
GIVEN skills/_scripts/types/ に action-status.types.ts と action-status-entry.types.ts が存在する
  WHERE ChatlogEntry クラスが skills/_scripts/classes/ に存在する
THEN the system SHALL ActionStatusOptions 型と ActionStatusEntry 型を定義し、
     ActionStatusOptions は filePath（必須）/ action? / status? / reason? を持ち、
     ActionStatusEntry は entry と options の2プロパティのみを持つ。
```

**型構造**:

```typescript
export type ActionStatusOptions = {
  filePath: string; // 必須（テスト時は '' で対応）
  action?: EntryAction;
  status?: EntryStatus;
  reason?: string;
};

export type ActionStatusEntry = {
  entry: ChatlogEntry;
  options: ActionStatusOptions;
};
```

**Rationale**:
`filePath` を `ActionStatusOptions` に集約することで、`ChatlogEntry.options.filePath` との二重管理を解消する。
`action` / `status` はオプションとし、パイプラインの各フェーズで段階的に値を設定できる。
Phase 2 で `ChatlogEntry` から `options` を削除したとき、`ActionStatusOptions` が唯一の filePath 管理箇所になる。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                       |
| ------ | ------------------------------------------------------------------------------ |
| AC-005 | `action` / `status` が未設定のとき `undefined` として型チェックが通る          |
| AC-006 | `entry` に `ChatlogEntry` 以外を代入したとき TypeScript コンパイルエラーになる |
| AC-007 | `action` に `EntryAction` 以外の文字列を代入したときコンパイルエラーになる     |
| AC-011 | `options.filePath` が空文字列 `''` のとき正常に生成される（テスト用途）        |
| AC-012 | `ActionStatusEntry` が `entry` と `options` の2プロパティのみを持つ            |

---

### REQ-F-004: ファイル構成と配置

- EARS Type: feature/config-based

```text
GIVEN skills/_scripts/types/ ディレクトリが存在する
  WHERE 新規型ファイルを追加する
THEN the system SHALL 以下の2ファイルを作成する:
     1. action-status.types.ts — ENTRY_ACTIONS / ENTRY_STATUSES 定数と EntryAction / EntryStatus 型
     2. action-status-entry.types.ts — ActionStatusOptions 型と ActionStatusEntry ラッパー型
     クラスファイルは作成しない。
```

**Rationale**: Action と Status は相互に関連が高いため1ファイルにまとめ、ラッパー型は ChatlogEntry への import を伴うため別ファイルとする（循環参照の回避）。

**Acceptance Criteria**:

| AC ID  | Scenario                                                          |
| ------ | ----------------------------------------------------------------- |
| AC-008 | `skills/_scripts/types/action-status.types.ts` が存在する         |
| AC-009 | `skills/_scripts/types/action-status-entry.types.ts` が存在する   |
| AC-010 | `skills/_scripts/classes/` 配下に新規クラスファイルが追加されない |

## 5. Non-Functional Requirements

### REQ-NF-001: 型安全性

`ENTRY_ACTIONS` および `ENTRY_STATUSES` は `as const` で定義し、文字列リテラル型として使用できる SHALL。`any` 型の使用は禁止する。

### REQ-NF-002: テスト容易性

型定義のみであるため、ユニットテストは TypeScript のコンパイル検証（型チェック）で代替する SHOULD。
動作確認が必要な場合は型アサーションを使ったテストケースを作成する。

### REQ-NF-003: 後方互換性

既存の `skills/_scripts/types/` の型定義を変更・削除してはならない SHALL。新規ファイルの追加のみとする。

### REQ-NF-004: 命名規則準拠

定数テーブルは `UPPER_SNAKE_CASE`、型名は `PascalCase`、ファイル名は `kebab-case.types.ts` に従う SHALL。

## 6. Constraints

### REQ-C-001: Phase 1 における ChatlogEntry の変更禁止

Phase 1（本モジュール）では `skills/_scripts/classes/ChatlogEntry.class.ts` を変更してはならない。
`ActionStatusEntry` は ChatlogEntry のラッパー型として定義し、既存の `options.filePath` は残したまま並行運用する。
Phase 2（全 skill 移行完了後）に `ChatlogEntry` から `options` / `filePath` / `filename` を削除し、`EntryOptions` 型を廃止する。

### REQ-C-002: 既存型ファイルの変更禁止

`skills/_scripts/types/` 配下の既存ファイル（`common.types.ts` 等）を変更してはならない。
新規ファイルの追加のみとする。

### REQ-C-003: Deno + TypeScript strict 準拠

実装は Deno ランタイムおよび TypeScript strict モードに準拠する。
`any` 型・非 null アサーション（`!`）の乱用は禁止する。

## 7. User Stories

- US-001: filter/pipeline 開発者として、`FilterEntry` の暫定定義を `ActionStatusEntry` に置き換えたい。
  なぜなら、共通型を使うことで skill 間の一貫性が保てるから。（→ REQ-F-003）
- US-002: classify-chatlogs 開発者として、`ClassifyBufferEntry` の `action` フィールドを `EntryAction` 型で表現したい。
  なぜなら、値セットが標準化されることで他 skill との比較が容易になるから。（→ REQ-F-001）
- US-003: normalize-chatlogs 開発者として、処理結果を `EntryStatus` で統一的に表現したい。なぜなら、統計集計ロジックを共通化できるから。（→ REQ-F-002）
- US-004: 開発者として、未処理エントリを `pending` という特殊値なしに表現したい。なぜなら、初期化コードが不要になりパイプラインが単純になるから。（→ REQ-F-003）
- US-005: 開発者として、`EntryAction` に新しい操作を追加するとき、定数テーブルの1箇所だけ変更すれば型も自動更新されてほしい。なぜなら、定数と型の乖離によるバグを防ぎたいから。（→ REQ-F-001, REQ-F-002）

## 8. Acceptance Criteria

```gherkin
# AC-001: ENTRY_ACTIONS が正しいリテラル型を持つ
# Requirement: REQ-F-001
Scenario: ENTRY_ACTIONS 定数テーブルの型検証
  Given action-status.types.ts がコンパイルされている
  When  ENTRY_ACTIONS.REMOVE を EntryAction 型の変数に代入する
  Then  TypeScript コンパイルエラーが発生しない
        かつ値が 'remove' リテラル型として推論される

# AC-005: action / status が未設定のとき undefined として扱える
# Requirement: REQ-F-003
Scenario: ActionStatusEntry のオプションフィールド
  Given ActionStatusEntry 型で変数を宣言する
  When  action と status を省略してオブジェクトを生成する
  Then  TypeScript コンパイルエラーが発生しない
        かつ action / status の型が EntryAction | undefined / EntryStatus | undefined になる

# AC-006: entry に ChatlogEntry 以外を代入するとエラー
# Requirement: REQ-F-003
Scenario: ActionStatusEntry の型安全性検証
  Given ActionStatusEntry 型で変数を宣言する
  When  entry フィールドに文字列を代入しようとする
  Then  TypeScript コンパイルエラーが発生する

# AC-008: 正しいファイルパスに型ファイルが作成される
# Requirement: REQ-F-004
Scenario: ファイル配置の検証
  Given skills/_scripts/types/ ディレクトリが存在する
  When  モジュールの実装が完了する
  Then  action-status.types.ts が skills/_scripts/types/ に存在する
        かつ action-status-entry.types.ts が skills/_scripts/types/ に存在する
        かつ skills/_scripts/classes/ に新規クラスファイルが追加されていない

# AC-010: 既存型ファイルが変更されていない
# Requirement: REQ-C-002
Scenario: 既存ファイルの不変性検証
  Given skills/_scripts/types/common.types.ts が存在する
  When  モジュールの実装が完了する
  Then  common.types.ts の内容が変更されていない
```

## 9. Open Questions

| Question                                                                                              | Type | Impact Area       | Owner                     |
| ----------------------------------------------------------------------------------------------------- | ---- | ----------------- | ------------------------- |
| `reason?` は `string` 型で十分か、構造化エラー型（`{ code, message }`）が必要か                       | 設計 | REQ-F-003         | TBD                       |
| 将来的に skill 固有の Action 値を追加する場合、拡張方法を定めるか                                     | 設計 | REQ-F-001         | TBD                       |
| `action-status-entry.types.ts` から `ChatlogEntry` を import する際、循環参照が発生しないか確認が必要 | 技術 | REQ-F-004         | TBD（調査済み：循環なし） |
| Phase 2 移行時、`ChatlogEntry` の `filePath`/`filename` アクセサを削除するタイミングをどう管理するか  | 移行 | REQ-C-001 Phase 2 | TBD                       |

## 10. Change History

| Date       | Version | Description     |
| ---------- | ------- | --------------- |
| 2026-06-05 | 1.0.0   | Initial release |
