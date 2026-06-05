---
title: "Implementation Plan: classify pipeline refactoring to ActionStatusEntry"
based-on: specifications.md v1.2
status: Draft
---

<!-- markdownlint-disable line-length -->

## 1. Overview

### 1.1 Purpose

`classify-chatlogs` パイプラインの全処理ユニットを `ActionStatusEntry`（ASE）ベースに移行する。
`ClassifyBufferEntry` / `ClassifyBuffer` を廃止し、共通型 `ActionStatusEntry[]` で統一することで型一貫性を向上させる。
パイプラインは immutable（純粋変換）設計とし、副作用は `moveClassified`（apply ステージ）に限定する。

### 1.2 Reference

- Prior Art / Reference PR: none
- Specifications: `specifications/specifications.md` v1.2
- Requirements: `requirements/requirements.md` v1.1

---

## 2. Implementation Plan

### Phase 1: 共通型拡張

`ENTRY_ACTIONS` への `MOVEBYAI` / `PENDING` 追加と `ActionStatusOptions` への `targetPath` 追加。
他のすべてのユニットの前提となる基盤変更。

#### Commit 1: chore(types): add MOVEBYAI and PENDING to ENTRY_ACTIONS

- `action-status.types.ts` の `ENTRY_ACTIONS` に `MOVEBYAI: 'move-by-ai'` を追加する
- `action-status.types.ts` の `ENTRY_ACTIONS` に `PENDING: 'pending'` を追加する
- `EntryAction` 型に両値が含まれることをユニットテストで確認する

#### Commit 2: chore(types): add targetPath to ActionStatusOptions

- `action-status-entry.types.ts` の `ActionStatusOptions` に `targetPath?: string` を追加する
- 既存フィールドへの影響なし（optional 追加のみ）

---

### Phase 2: collect / pre-sort の ASE 移行

`findBufferEntries` と `classify-noai.ts` を ASE ベースに切り替える。
エラー時 `ChatlogError` スロー、ディープコピー純粋変換を実装。

#### Commit 1: refactor(classify): migrate loadClassifyEntry to ActionStatusEntry

- `classify-noai.ts` の `loadClassifyEntry` を `ActionStatusEntry` を返すよう変更する
- ファイル読み込み失敗時は `ChatlogError` をスローする（`action: error` エントリを返さない）
- ユニットテスト（`loadClassifyEntry`）を ASE ベースに書き換える

#### Commit 2: refactor(classify): migrate preClassify / processPreclassify to ASE deep copy

- `preClassify` を `ActionStatusEntry → ActionStatusEntry`（ディープコピー）に変更する
- コピー側の `frontmatter` に `project` を設定し、`options.targetPath` に `destDir` を設定する
- `action: pending` を `ENTRY_ACTIONS.PENDING` で設定する
- `processPreclassify` を `ActionStatusEntry[] → ActionStatusEntry[]` に変更する
- ユニットテスト（`preClassify` / `processPreclassify`）を ASE ベースに書き換える

#### Commit 3: refactor(classify): migrate findBufferEntries to ActionStatusEntry

- `findBufferEntries` の戻り値を `ActionStatusEntry[]` に変更する
- `opts.loadMeta` の型シグネチャを `ASE` 返却に更新する
- エラーエントリ除外処理を `ChatlogError` スローに対応した形に修正する
- ユニットテスト（`findBufferEntries`）を ASE ベースに書き換える

---

### Phase 3: ai-sort の ASE 移行

`classify-ai.ts` を ASE ディープコピーベースに切り替える。
`processChunk` / `classifyByAI` のシグネチャ変更。

#### Commit 1: refactor(classify): migrate processChunk to ActionStatusEntry deep copy

- `processChunk` の引数を `ChatlogEntry[]` → `ActionStatusEntry[]` に変更する
- 各エントリを ASE ディープコピーし、コピーの `action: move-by-ai` を設定する
- コピーの `frontmatter` に `project` を設定し、`options.targetPath` に `destDir` を設定する
- AI 呼び出し失敗時は `ChatlogError` をスローする（`ERROR` エントリを返さない）
- ユニットテスト（`processChunk`）を ASE ベースに書き換える

#### Commit 2: refactor(classify): migrate classifyByAI to ActionStatusEntry

- `classifyByAI` の引数・戻り値を `ActionStatusEntry[]` に変更する
- `pending` エントリを抽出して `processChunk` に渡す処理を ASE ベースに修正する
- `dryRun` フラグを受け取り、`true` の場合は AI 呼び出しをスキップしてカウントのみ実施する
- ユニットテスト（`classifyByAI`）を ASE ベースに書き換える

---

### Phase 4: apply の ASE 移行

`file-ops.ts` を ASE ベースに変更し `targetPath` から移動先を解決する。
`dryRun` 判定は `moveClassified` 内の move 処理で行う。

#### Commit 1: refactor(classify): migrate classifyFile to ActionStatusEntry

- `classifyFile` の引数を `ChatlogEntry + destDir` → `ActionStatusEntry` に変更する
- `options.targetPath` から移動先ディレクトリを解決する
- `frontmatter` から `project` 名を読み出す（引数での受け渡しを廃止）
- `dryRun` 引数を削除する（`dryRun` 判定は呼び出し元 `moveClassified` が担う）
- ユニットテスト（`classifyFile`）を ASE ベースに書き換える

#### Commit 2: refactor(classify): migrate moveClassified to ActionStatusEntry

- `moveClassified` の第1引数を `ClassifyBuffer` → `ActionStatusEntry[]` に変更する
- `action: pending` → `stats.remaining++` に対応する（`REMAINING` → `PENDING`）
- `action: move` / `action: move-by-ai` の処理:
  - `dryRun: false` → `classifyFile` を呼び出してファイル移動、`stats.moved` / `stats.movedByAI` をインクリメントする
  - `dryRun: true` → `classifyFile` を呼び出さず、ログ出力のみ行い、`stats.moved` / `stats.movedByAI` をインクリメントする
- `destDir` 引数を削除する（`targetPath` に統合）
- ユニットテスト（`moveClassified`）を ASE ベースに書き換える

---

### Phase 5: 型削除 + オーケストレーター更新

`classify.types.ts` から廃止型を削除し、`classify-chatlogs.ts` を ASE パイプラインに更新する。

#### Commit 1: refactor(classify): remove ClassifyBuffer and CLASSIFY_ACTIONS from classify.types.ts

- `classify.types.ts` から `ClassifyBuffer` / `ClassifyBufferEntry` 型を削除する
- `classify.types.ts` から `CLASSIFY_ACTIONS` / `ClassifyAction` を削除する
- `FindBufferEntriesOptions` の `loadMeta` 型を ASE 返却シグネチャに更新する
- 残存する `ClassifyResult` / `ClassifyStats` / `ClassifyConfig` / `ParsedConfig` は維持する

#### Commit 2: refactor(classify): update processClassify and main to ActionStatusEntry pipeline

- `classify-chatlogs.ts` の `processClassify` を `ASE[] → ASE[]` に変更する
- pre-sort resolved（`skip` / `move`）と ai-sort 結果（`move-by-ai`）の merge を ASE ベースに更新する
- `main` の `findBufferEntries` / `processClassify` / `moveClassified` 呼び出しを ASE ベースに更新する
- 不要になった `ClassifyBuffer` / `CLASSIFY_ACTIONS` の import を削除する
- ユニットテスト（`processClassify`）を ASE ベースに書き換える

---

## 3. Change History

| Date       | Version | Description                 |
| ---------- | ------- | --------------------------- |
| 2026-06-06 | 1.0.0   | Initial implementation plan |
