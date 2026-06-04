---
title: "Implementation Plan: common/add-action-status — 汎用アクション・ステータス型"
based-on: specifications.md v1.1.0
status: Draft
---

<!-- markdownlint-disable line-length -->

## 1. Overview

### 1.1 Purpose

全 skill 横断で利用できる汎用アクション・ステータス型を `skills/_scripts/types/` に追加する。
`ENTRY_ACTIONS` / `ENTRY_STATUSES` 定数テーブルと導出型、および `ActionStatusEntry` ラッパー型の2ファイルを新規作成する。
既存ファイルへの変更は行わない。

### 1.2 Reference

- Prior Art / Reference PR: `classify.types.ts` の `CLASSIFY_ACTIONS` パターン（`skills/classify-chatlogs/scripts/types/classify.types.ts`）
- Specifications: `specifications.md` v1.1.0
- Requirements: `requirements.md` v1.0
- Decision Records: DR-01, DR-02, DR-03

---

## 2. Implementation Plan

### Phase 1: ActionStatusEntry 型ファイル追加

`skills/_scripts/types/` に2ファイルを新規追加する。既存ファイルへの変更なし。1 PR で完結。

#### Commit 1: feat(libs): add ENTRY_ACTIONS/ENTRY_STATUSES constants and types

- `skills/_scripts/types/action-status.types.ts` を新規作成する
- `ENTRY_ACTIONS` を `as const` オブジェクトとして定義する（値: `keep` / `skip` / `move` / `remove` / `write`）
- `ENTRY_STATUSES` を `as const` オブジェクトとして定義する（値: `pre-skipped` / `skipped` / `kept` / `moved` / `removed` / `written` / `error`）
- `EntryAction` 型を `typeof ENTRY_ACTIONS[keyof typeof ENTRY_ACTIONS]` として導出する
- `EntryStatus` 型を `typeof ENTRY_STATUSES[keyof typeof ENTRY_STATUSES]` として導出する
- すべての定数・型を `export` する

#### Commit 2: feat(libs): add ActionStatusEntry wrapper type

- `skills/_scripts/types/action-status-entry.types.ts` を新規作成する
- `import type { ChatlogEntry }` を `../classes/ChatlogEntry.class.ts` から type-only import する
- `EntryAction` / `EntryStatus` を `./action-status.types.ts` から import する
- `ActionStatusOptions` 型を定義する（`filePath: string`（必須）、`action?: EntryAction`、`status?: EntryStatus`、`reason?: string`）
- `ActionStatusEntry` ラッパー型を定義する（`entry: ChatlogEntry`、`options: ActionStatusOptions` の2プロパティのみ）
- `ActionStatusOptions` と `ActionStatusEntry` を `export` する

---

## 3. Change History

| Date       | Version | Description                 |
| ---------- | ------- | --------------------------- |
| 2026-06-05 | 1.0     | Initial implementation plan |
