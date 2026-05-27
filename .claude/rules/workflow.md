# 開発ワークフロー（プロジェクト固有）

## フェーズ確認コマンド

```bash
deno task test:module unit <module>   # 対象モジュールのユニットテスト
deno task test:unit                   # 全ユニットテスト（Refactor 後に必ず実行）
```

## タスク完了時チェックリスト

0. BDD RGRサイクルを完了している（`bdd-cycle.md` 参照）
1. `dprint fmt --check` でフォーマット確認（問題あれば `dprint fmt` を実行）
2. `deno task test:unit` でユニットテスト実行
3. ユーザーに完了を伝え、コミットはユーザーに委ねる
