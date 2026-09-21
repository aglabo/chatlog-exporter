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

## PR 下書きの言語

PR 下書き（`temp/idd/pr/` 以下）はテンプレートに従い、本文（Overview・Changes・Additional Notes 等）を
**英語で書く。** チェックリストのラベルもテンプレートのまま英語を維持する。

## lefthook の pre-push を検証するとき

lefthook v2 の pre-push は `no matching push files` でコマンドをスキップする。
未 push commit が無い状態で `lefthook run pre-push` を実行しても検証にならない。
実際の発火を確かめるには、bare リポジトリを remote に見立てて使い捨てクローンから push する。
