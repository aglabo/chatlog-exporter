# BDD 開発サイクル（RGRサイクル）

## 適用トリガー

以下のいずれかの作業を行う場合、必ず BDD RGRサイクルを実施する。

| 作業種別               | 例                                       |
| ---------------------- | ---------------------------------------- |
| 新機能追加             | 新しい関数・クラス・モジュールの実装     |
| バグ修正               | 既存ロジックの誤りを正す変更             |
| リファクタリング       | 外部仕様を変えずに内部構造を整理する変更 |
| ファイル移動による修正 | モジュール再配置に伴う import パス変更   |

## 免除条件

以下の変更は RGRサイクルの対象外とする。

- `.md` ファイル・JSDoc・コメントのみの変更（ドキュメント変更）
- `dprint.json`、`deno.jsonc`、`lefthook.yml` 等の設定ファイルのみの変更
- `dprint fmt` による純粋なフォーマット整形
- 自動生成ファイルの更新

## RGRサイクルの手順

### Phase 1: Red（テスト先行）

1. テスト対象の関数・クラスのインターフェース（シグネチャ）を確定する
2. `testing-conventions.md` の規約に従いテストファイルを作成する
   - 配置先: `skills/<module>/__tests__/<type>/<name>.<type>.spec.ts`
   - `describe` 4階層構造・テスト ID（`T-<スコープ>-<機能略語>-<連番>`）・`[Normal]/[Error]/[Edge]` プレフィックスを使う
3. テストが失敗することを確認する（実装が存在しないか、期待値と異なること）

```bash
deno task test:module unit <module>
# または
deno task test:unit
# → テストが FAIL であることを確認する
```

### Phase 2: Green（最小実装）

1. テストをパスさせる最小限のコードを実装する
   - この段階では「正しい設計」より「テストを通す」ことを優先する
   - `any` 型・一時的なハードコード等は次の Phase で解消する
2. すべてのテストがパスすることを確認する

```bash
deno task test:module unit <module>
# → テストが PASS であることを確認する
```

### Phase 3: Refactor（整理）

1. テストを壊さずにコードを整理する
   - `coding-guidelines.md` の規約（strict 型・アロー関数・fail-first 等）に準拠させる
   - `any` 型・ハードコードを適切な型・定数に置き換える
   - 重複ロジックを抽出する
2. フォーマットを確認・修正する
3. 全テストが引き続きパスすることを確認する

```bash
dprint fmt
deno task test:unit
# → テストが PASS であることを確認する
```

## ファイル移動時の特例

内容変更を伴わない純粋なファイル移動は、フル RGRサイクルではなく次の手順を実施する。

1. ファイルを移動し、import パスを修正する
2. 全ユニットテストを実行してデグレがないことを確認する

```bash
deno task test:unit
# → 移動前と同じくすべてパスすることを確認する
```

移動に伴いロジックを変更した場合は、変更箇所について通常の RGRサイクルを適用する。

## 必須コマンド

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
