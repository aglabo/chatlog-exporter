# 開発ワークフロー

## ブランチ戦略

- ブランチ名: `<type>-<issue-number>/<scope>/<description>`
  - 例: `feat-42/export/add-filter`, `fix-55/normalize/fix-encoding`
- `main` への直接 push 禁止

## コミットメッセージ

- Conventional Commits 準拠: `type(scope): description`
- 使用可能な type: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- 例: `feat(export): add noise filter for system logs`

## Git 操作ルール

- `git add` / `git commit` / `git push` はユーザーが行う
- Claude はコードの編集・テスト・フォーマット確認までを担当する
- コミットが必要な状態になったら、その旨をユーザーに伝えて止まる

## タスク完了時チェックリスト

0. BDD RGRサイクルを完了している（`bdd-cycle.md` 参照）
1. `dprint fmt --check` でフォーマット確認（問題あれば `dprint fmt` を実行）
2. `deno task test:unit` でユニットテスト実行
3. ユーザーに完了を伝え、コミットはユーザーに委ねる
