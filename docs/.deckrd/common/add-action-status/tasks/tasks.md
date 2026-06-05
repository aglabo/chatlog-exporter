---
title: "Implementation Tasks"
module: "common/add-action-status"
status: Active
created: "2026-06-05 00:00:00"
source: specifications.md
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable no-duplicate-heading line-length -->

> This document contains implementation tasks derived from specifications.
> Each task corresponds to a single unit test case (`it()` block).

---

## Task Summary

| Test Target             | Scenarios | Cases | Status |
| ----------------------- | --------- | ----- | ------ |
| T-01: ENTRY_ACTIONS     | 3         | 4     | done   |
| T-02: ENTRY_STATUSES    | 3         | 4     | done   |
| T-03: ActionStatusEntry | 3         | 6     | done   |

---

## T-01: ENTRY_ACTIONS

### [正常] Normal Cases

#### T-01-01: ENTRY_ACTIONS 定数テーブルの値検証

- [x] **T-01-01-01**: ENTRY_ACTIONS の各キーが正しいリテラル値を持つ
  - Target: `ENTRY_ACTIONS`
  - Scenario: Given `action-status.types.ts` がコンパイルされている、When `ENTRY_ACTIONS` の各プロパティを参照する
  - Expected: Then `ENTRY_ACTIONS.KEEP === 'keep'`、`ENTRY_ACTIONS.SKIP === 'skip'`、`ENTRY_ACTIONS.MOVE === 'move'`、`ENTRY_ACTIONS.REMOVE === 'remove'`、`ENTRY_ACTIONS.WRITE === 'write'` がすべて成立する

- [x] **T-01-01-02**: ENTRY_ACTIONS.REMOVE が `'remove'` リテラル型として参照できる（AC-001）
  - Target: `ENTRY_ACTIONS`
  - Scenario: Given `ENTRY_ACTIONS` が `as const` で定義されている、When `ENTRY_ACTIONS.REMOVE` を `EntryAction` 型変数に代入する
  - Expected: Then TypeScript コンパイルエラーが発生せず、値が `'remove'` リテラル型として推論される

#### T-01-02: EntryAction 型の検証

- [x] **T-01-02-01**: EntryAction が 5値の union 型に一致する（AC-002）
  - Target: `EntryAction`
  - Scenario: Given `EntryAction` 型が定義されている、When `EntryAction` に割り当て可能な値を確認する
  - Expected: Then `EntryAction` が `'keep' | 'skip' | 'move' | 'remove' | 'write'` に一致する

### [異常] Error Cases

#### T-01-03: EntryAction の型安全性

- [x] **T-01-03-01**: EntryAction 以外の文字列を代入するとコンパイルエラーになる
  - Target: `EntryAction`
  - Scenario: Given `EntryAction` 型変数が宣言されている、When `'delete'` など列挙外の文字列を代入しようとする
  - Expected: Then TypeScript コンパイルエラーが発生する

---

## T-02: ENTRY_STATUSES

### [正常] Normal Cases

#### T-02-01: ENTRY_STATUSES 定数テーブルの値検証

- [x] **T-02-01-01**: ENTRY_STATUSES の各キーが正しいリテラル値を持つ
  - Target: `ENTRY_STATUSES`
  - Scenario: Given `action-status.types.ts` がコンパイルされている、When `ENTRY_STATUSES` の各プロパティを参照する
  - Expected: Then `ENTRY_STATUSES.PRE_SKIPPED === 'pre-skipped'`、`ENTRY_STATUSES.SKIPPED === 'skipped'`、`ENTRY_STATUSES.KEPT === 'kept'`、`ENTRY_STATUSES.MOVED === 'moved'`、`ENTRY_STATUSES.REMOVED === 'removed'`、`ENTRY_STATUSES.WRITTEN === 'written'`、`ENTRY_STATUSES.ERROR === 'error'` がすべて成立する

- [x] **T-02-01-02**: ENTRY_STATUSES.PRE_SKIPPED が `'pre-skipped'` リテラル型として参照できる（AC-003）
  - Target: `ENTRY_STATUSES`
  - Scenario: Given `ENTRY_STATUSES` が `as const` で定義されている、When `ENTRY_STATUSES.PRE_SKIPPED` を `EntryStatus` 型変数に代入する
  - Expected: Then TypeScript コンパイルエラーが発生せず、値が `'pre-skipped'` リテラル型として推論される

#### T-02-02: EntryStatus 型の検証

- [x] **T-02-02-01**: EntryStatus が 7値の union 型に一致する（AC-004）
  - Target: `EntryStatus`
  - Scenario: Given `EntryStatus` 型が定義されている、When `EntryStatus` に割り当て可能な値を確認する
  - Expected: Then `EntryStatus` が `'pre-skipped' | 'skipped' | 'kept' | 'moved' | 'removed' | 'written' | 'error'` に一致する

### [異常] Error Cases

#### T-02-03: EntryStatus の型安全性

- [x] **T-02-03-01**: EntryStatus 以外の文字列を代入するとコンパイルエラーになる
  - Target: `EntryStatus`
  - Scenario: Given `EntryStatus` 型変数が宣言されている、When `'pending'` など列挙外の文字列を代入しようとする
  - Expected: Then TypeScript コンパイルエラーが発生する

---

## T-03: ActionStatusEntry

### [正常] Normal Cases

#### T-03-01: ActionStatusOptions の構造検証

- [x] **T-03-01-01**: filePath 必須・action/status/reason オプションで正常に生成できる（AC-005）
  - Target: `ActionStatusOptions`
  - Scenario: Given `ActionStatusOptions` 型が定義されている、When `filePath` のみ指定してオブジェクトを生成する
  - Expected: Then TypeScript コンパイルエラーが発生せず、`action` / `status` の型が `EntryAction | undefined` / `EntryStatus | undefined` になる

- [x] **T-03-01-02**: filePath に空文字列 `''` を指定して正常に生成できる（AC-011、R-006）
  - Target: `ActionStatusOptions`
  - Scenario: Given `ActionStatusOptions` 型が定義されている、When `{ filePath: '' }` でオブジェクトを生成する
  - Expected: Then TypeScript コンパイルエラーが発生せず、正常に生成される

#### T-03-02: ActionStatusEntry の構造検証

- [x] **T-03-02-01**: ActionStatusEntry が entry と options の 2プロパティのみを持つ（AC-012）
  - Target: `ActionStatusEntry`
  - Scenario: Given `ActionStatusEntry` 型が定義されている、When 型定義を参照する
  - Expected: Then `entry` と `options` の 2プロパティのみで構成されている

- [x] **T-03-02-02**: ChatlogEntry と ActionStatusOptions を指定して正常に生成できる
  - Target: `ActionStatusEntry`
  - Scenario: Given `ChatlogEntry` インスタンスと `ActionStatusOptions` が用意されている、When `{ entry, options }` でオブジェクトを生成する
  - Expected: Then TypeScript コンパイルエラーが発生せず、正常に生成される

### [異常] Error Cases

#### T-03-03: ActionStatusEntry の型安全性

- [x] **T-03-03-01**: entry に ChatlogEntry 以外を代入するとコンパイルエラーになる（AC-006）
  - Target: `ActionStatusEntry`
  - Scenario: Given `ActionStatusEntry` 型変数が宣言されている、When `entry` フィールドに文字列を代入しようとする
  - Expected: Then TypeScript コンパイルエラーが発生する

### [エッジケース] Edge Cases

#### T-03-04: action / status が列挙外の値のエラー検証

- [x] **T-03-04-01**: options.action に EntryAction 以外の文字列を代入するとコンパイルエラーになる（AC-007）
  - Target: `ActionStatusOptions`
  - Scenario: Given `ActionStatusOptions` 型変数が宣言されている、When `action` フィールドに `'delete'` など列挙外の文字列を代入しようとする
  - Expected: Then TypeScript コンパイルエラーが発生する

---

<!--
Task ID Format: T-<TestTarget>-<Scenario>-<Case>
- TestTarget: 2-digit (01, 02, ...)
- Scenario: 2-digit (01, 02, ...)
- Case: 2-digit (01, 02, ...)

Example: T-01-02-03 = TestTarget 01, Scenario 02, Case 03
-->
