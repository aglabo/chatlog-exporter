# 1 API設計

<!-- markdownlint-disable no-duplicate-heading -->

## Summary

ユーザーがtemp配下のissue下書きをコアとして更新し、詳細仕様はdocs/specsに分離する方針を指示した。

## Excerpt

### User

temp\idd\issues\new-20260311-000000-task-aplys-runner-spec.mdがissueの下描きなので、coreを既存と見なし更新する。また、上記の議論全てをissueには書かず、詳細はdocs/specsなどに作成する

### Assistant

了解しました。下書きファイルを確認します。

### Assistant

下書きの内容を把握しました。次に既存のdocsディレクトリ構造を確認します。

### Assistant

全体を把握しました。プランを作成します。

**整理:**

- `temp/idd/issues/new-20260311-000000-task-aplys-runner-spec.md` が既存のissue下書き
- `docs/` ディレクトリは未作成
- ユーザーの指示: issueはコアのみ保持・更新し、詳細仕様は `docs/specs/` 等に分離する
- 追加すべき内容: 12項目の改善点 + version policy

### Assistant

プランを作成します。

### Assistant

プランの概要:

**変更ファイル:**

1. `temp/idd/issues/new-20260311-000000-task-aplys-runner-spec.md` — issueをコア仕様のみに整理・更新
2. `docs/specs/aplys-api-spec.md` — 詳細仕様を新規作成（分離）

**issueの主な更新内容:**

- exit code 127 (tool not found) 追加
- APLYS_ARGS → `exec "$script" "$@"` 方式に変更
- APLYS_LIBS を `$APLYS_ROOT/_libs` に修正
- XDG ディレクトリ変数追加
- `aplys list` テスト追加
- Phase 3 implementation tasks 追加
- version policy への参照追記
- `additional_context` の詳細を docs/specs へ移動

**docs/specs/aplys-api-spec.md の新規内容:**

- dispatcher アルゴリズム
- domain/target validation (`^[a-z][a-z0-9_-]*$`)
- `git ls-files -- '*.sh'` 正しい構文
- extension mapping 表
- セキュリティ仕様
- shellcheck `--external-sources`
- version policy (SemVer、minor=後方互換、Go/Linux kernelスタイル)
