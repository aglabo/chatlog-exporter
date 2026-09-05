# 開発ワークフロー（chatlog-exporter 固有）

コマンド順序ゲート・ブランチ戦略・Conventional Commits・設計 ID の参照・
`git` 操作ルール（`add` / `commit` / `push` はユーザーが行う）は
deckrd の `deckrd-rule-workflow.md` が正とする
（`.claude/rules/deckrd-rules/deckrd-rules-index.md` 参照）。
本ファイルは chatlog-exporter 固有の差分のみを定める。

コード変更時の RGR サイクルと `bdd-coder` への委譲は [bdd-cycle.md](bdd-cycle.md) を参照する。

## タスク完了時チェックリスト

1. BDD RGR サイクルを完了している（[bdd-cycle.md](bdd-cycle.md)）
2. `dprint check` が通る
3. `deno task test` が全件パスする
4. ユーザーに完了を伝え、コミットはユーザーに委ねる
