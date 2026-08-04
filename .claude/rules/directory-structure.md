# ディレクトリ構成ルール

## `skills/_cle-libs/` 共通定義

スクリプト間で共通して使う型・定数は実装ファイルに直書きせず、以下に集約する。

| ディレクトリ                  | 用途                                    |
| ----------------------------- | --------------------------------------- |
| `skills/_cle-libs/types/`     | 共通型・インターフェース (`*.types.ts`) |
| `skills/_cle-libs/constants/` | 共通定数 (`*.constants.ts`)             |
| `skills/_cle-libs/libs/`      | 共通ユーティリティ関数                  |
| `skills/_cle-libs/classes`    | 共通クラス                              |

実装ファイルは `types/` や `constants/` から import し、re-export で後方互換を維持する。
