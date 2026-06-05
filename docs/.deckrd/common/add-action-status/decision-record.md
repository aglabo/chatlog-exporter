---
title: "Decision Records: common/add-action-status"
status: Active
created: "2026-06-05"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- markdownlint-disable line-length -->

---

## DR-01: ActionStatusEntry を entry + options の2プロパティ構成にする - 2026-06-05

**Phase**: spec
**Status**: Accepted

### Context

`ActionStatusEntry` ラッパー型の構造として、当初は以下の flat な設計を検討していた。

```typescript
ActionStatusEntry = { entry, filePath, action, status, reason };
```

これに対し、`ActionStatusOptions` を独立させ `entry` と `options` の2プロパティに分ける設計案が提示された。
また、`ChatlogEntry` 自体に `action`/`status` を直接追加する案、クラス継承による拡張案も比較検討した。

### Decision

`ActionStatusEntry` を以下の2プロパティ構成とする。

```typescript
ActionStatusEntry = {
  entry: ChatlogEntry,
  options: ActionStatusOptions, // { filePath, action?, status?, reason? }
};
```

`filePath` は `ActionStatusOptions` の必須フィールドとし、テスト時は空文字列 `''` で対応する。

### Alternatives Considered

- Option A: flat 構成（`entry` + `filePath` + `action?` + `status?` + `reason?` をトップレベルに並べる）
- Option B: `ChatlogEntry` に `action?` / `status?` を直接追加する
- Option C: `ChatlogEntry` を継承した `ProcessingEntry` クラスを作る
- Option D（採用）: `entry` + `options` の2プロパティ構成

### Rationale

1. **`filePath` の一本化**: `ChatlogEntry.options.filePath` と `ActionStatusEntry.filePath` の二重管理を解消できる。`ActionStatusOptions` に集約することで、Phase 2 で `ChatlogEntry` 側を削除したとき `filePath` の管理箇所が一意になる。
2. **Option B の問題**: `ChatlogEntry` は全 skill 横断の共通クラスであり、filter 固有の `action`/`status` を追加すると単一責務違反になる。normalize/classify/set-frontmatter でも不要なフィールドが常に存在する。
3. **Option C の問題**: TypeScript のクラス継承は `readonly` プロパティの扱いに罠があり、複雑性が増す。
4. **`options` でグルーピング**: `filePath`・`action`・`status`・`reason` はすべてパイプライン処理に関するメタ情報であり、意味的に一つのグループを形成する。

### Consequences

- Positive:
  - `filePath` の管理箇所が `ActionStatusOptions` に一本化され、Phase 2 移行の根拠が明確になる
  - `ChatlogEntry` を変更せず、既存 50 箇所のコール側が Phase 1 では無変更で動く
  - `entry.content`・`entry.frontmatter` へのアクセスは `actionEntry.entry.content` と1段深くなるが、意味が明確

- Negative:
  - `filePath` へのアクセスが `actionEntry.options.filePath` と2段になる
  - Phase 1〜2 の移行期間中、`entry.filePath`（旧）と `options.filePath`（新）が並行して存在する

---

## DR-02: 2段階移行方針（ChatlogEntry の段階的クリーンアップ） - 2026-06-05

**Phase**: spec
**Status**: Accepted

### Context

`ActionStatusEntry` の導入と `ChatlogEntry` の整理を同時に行うか、段階的に行うかを検討した。
`ChatlogEntry` の `options.filePath` は現時点で 20 ファイル・50 箇所以上で使われている。

### Decision

以下の2段階で移行する。

- **Phase 1（本モジュール）**: `ActionStatusEntry` を `_scripts/types/` に追加。`ChatlogEntry` は変更しない。各 skill のパイプラインを `ActionStatusEntry` ベースに順次移行する。
- **Phase 2（全 skill 移行完了後）**: `ChatlogEntry` から `options` / `filePath` / `filename` アクセサを削除し、`EntryOptions` 型を `common.types.ts` から廃止する。`new ChatlogEntry(text, { filePath })` の呼び出しがゼロになったことを確認してから実施する。

### Alternatives Considered

- Option A: Phase 1 と Phase 2 を同時に実施（`ChatlogEntry` の変更と各 skill の移行を一括で行う）
- Option B（採用）: Phase 1 で型を導入し、Phase 2 で `ChatlogEntry` をクリーンアップする

### Rationale

1. **リスク分散**: 50 箇所の変更を一括で行うと、移行漏れや動作確認の範囲が広がりリスクが高い。段階的に行うことで各フェーズの影響範囲を限定できる。
2. **後方互換性**: Phase 1 では `ChatlogEntry` の既存 API が維持されるため、移行中の skill でも既存テストが通り続ける。
3. **移行完了の明確な定義**: `new ChatlogEntry(text, { filePath })` の呼び出しゼロを Phase 2 の開始条件とすることで、移行完了を機械的に検証できる。

### Consequences

- Positive:
  - Phase 1 は `ChatlogEntry` に触れないため、既存テストがすべて通る
  - Phase 2 のタイミングを各 skill の移行完了に合わせて柔軟に決定できる
  - Phase 2 は別 Issue として独立管理できる

- Negative:
  - Phase 1〜2 の移行期間中、`entry.filePath`（旧）と `options.filePath`（新）が並行して存在する
  - Phase 2 が先送りされるリスクがある（技術的負債として残る可能性）

---

## DR-03: filePath を必須フィールドとし、テスト時は空文字列で対応する - 2026-06-05

**Phase**: spec
**Status**: Accepted

### Context

`ActionStatusOptions.filePath` を必須（`string`）にするか、オプション（`string | undefined`）にするかを検討した。
テスト時に `filePath` が不要なケースがある一方、パイプライン上のすべてのエントリは実際のファイルパスを持つ。

### Decision

`filePath` を `string` 型の必須フィールドとし、テスト時に `filePath` が不要な場合は空文字列 `''` を使用する。

### Alternatives Considered

- Option A: `filePath?: string`（オプション）— 未設定時は `undefined`
- Option B（採用）: `filePath: string`（必須）— テスト時は `''` で対応

### Rationale

1. **型安全性**: 必須にすることで、パイプライン上のエントリが必ず `filePath` を持つことを型で保証できる。オプションにすると `undefined` チェックが各所に必要になる。
2. **Phase 2 の根拠**: `filePath` を必須フィールドとして宣言することで、「`ChatlogEntry` からオプションを削除したとき `ActionStatusOptions` が唯一の管理箇所になる」という設計意図が明確になる。
3. **テスト互換性**: 空文字列 `''` は `string` 型として合法であり、`getFilename('')` の戻り値が `''` になるだけでテスト上の問題はない。

### Consequences

- Positive:
  - パイプライン上のすべてのエントリが `filePath` を持つことを型で保証できる
  - `undefined` チェックが不要になりコードが簡潔になる

- Negative:
  - テスト作成時に必ず `filePath` 引数（空文字列でも可）を渡す必要がある
  - `''` が有効な値として存在するため、「パスが設定されていない」ことを型で区別できない
