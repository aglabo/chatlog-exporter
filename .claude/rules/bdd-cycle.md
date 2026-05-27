# BDD 開発サイクル（プロジェクト固有）

## テスト配置

- テストは `skills/<module>/__tests__/<type>/` 配下に配置する
- テスト規約の詳細は `testing-conventions.md` を参照

## テストコマンド

```bash
# モジュール単位でユニットテストを実行
deno task test:module unit <module>

# 全ユニットテスト
deno task test:unit

# 全テスト（unit / functional / integration / e2e）
deno task test

# フォーマット確認
dprint fmt --check

# フォーマット自動修正
dprint fmt
```

## エージェントへの引き継ぎ情報

`bdd-coder` エージェント起動時は以下を必ずプロンプトに含める。

- 作業種別（新機能 / バグ修正 / リファクタリング / ファイル移動）
- テスト対象ファイルと関数・クラス名
- 期待する振る舞い（正常系 / 異常系 / エッジケース）
- 既存テストファイルのパス（存在する場合）
- 使用するテストコマンド（`deno task test:module unit <module>` 等）
