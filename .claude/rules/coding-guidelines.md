# コーディング規約

## 基本方針

- 正しさ > 速さ：動くコードより正しいコードを優先する
- 最小変更：依頼された範囲のみ変更し、不要なリファクタや改善を加えない
- 推測せず確認：既存コードを読んでから提案・変更する

## エラーハンドリング

- **fail-first 原則**：エラーは握りつぶさず、早期に throw する
- ファイル不在・読み取り失敗・不正入力など、回復不可能な異常は `ChatlogError` を throw する
- フォールバック値（デフォルト値）を返して処理を続行しない
  - 例：辞書ファイルが存在しない → `{ misc: {} }` を返さず `ChatlogError('FileDirNotFound')` を throw
- 例外は「呼び出し元が期待する正常系」と明確に区別できる場合のみ許容する
  - 許容例：空の YAML（定義なしとして扱う）、オプショナルな設定ファイルの省略

## TypeScript

- `strict` モードを前提とする
- 型は明示的に書く（`any` 禁止）
- インポート/エクスポートは明示的に行う（`export *` 乱用禁止）
- 関数定義はアロー関数形式を基本とする（`function` キーワードによるトップレベル宣言は使用しない）
  ```typescript
  // Good
  const func = (param: string): string => { ... };

  // Bad
  function func(param: string): string { ... }
  ```

## テスト

- 新機能には必ずユニットテストを追加する
- テストは `skills/<module>/__tests__/` 配下に配置する
- テストファイル名: `<name>.<type>.spec.ts`（例: `backup.unit.spec.ts`）
- テストコードの詳細規約（import 構成・JSDoc・テスト ID・命名）は以下を参照する

@.claude/rules/naming-conventions.md
@.claude/rules/directory-structure.md
@.claude/rules/testing-conventions.md
