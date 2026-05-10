# 開発ワークフロー

## BDD/RGR ファースト原則

**すべてのコード変更作業は BDD/RGR サイクルに従う。**

- コードを書く前に必ず `bdd-cycle.md` を確認し、作業が BDD サイクルの適用トリガーに該当するか判断する
- 適用トリガーに該当する場合は `bdd-coder` エージェントを呼び出し、Red → Green → Refactor の各フェーズを確実に回す
- 各フェーズの終わりに必ずテストを実行し、FAIL / PASS を確認してから次フェーズに進む
- テストを実行せずに複数フェーズをまたいで実装を進めることは禁止する

### フェーズごとの確認ゲート

| フェーズ | 実施内容         | 次フェーズへの条件                     |
| -------- | ---------------- | -------------------------------------- |
| Red      | テストを書く     | テストが FAIL であることを確認         |
| Green    | 最小実装をする   | テストが PASS になることを確認         |
| Refactor | コードを整理する | テストが引き続き PASS であることを確認 |

フェーズ確認コマンド:

```bash
deno task test:module unit <module>   # 対象モジュールのユニットテスト
deno task test:unit                   # 全ユニットテスト（Refactor 後に必ず実行）
```

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
