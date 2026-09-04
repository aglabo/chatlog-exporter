# 命名規則

`_` プレフィックスは「そのスコープの外から参照されない」ことを示す。

## `_` を付ける

| 対象                                                | 例                                               |
| --------------------------------------------------- | ------------------------------------------------ |
| モジュール内部の関数・クラス・定数（export しない） | `_makeConfig`, `_NoopCommandProvider`, `_cases`  |
| 関数内の主要変数                                    | `_config`, `_result`                             |
| AI / CLI 実行の入出力                               | `_cmd`, `_process`, `_writer`, `_output`, `_raw` |
| ドメイン概念を表す変数                              | `_agentDir`, `_slug`, `_systemPrompt`            |

## `_` を付けない

| 対象                              | 例                                                       |
| --------------------------------- | -------------------------------------------------------- |
| 関数パラメータ                    | `function f(filePath: string)` — 未使用引数の `_` とは別 |
| イテレーション変数                | `entry`, `line`, `arg`, `turn`, `segment`                |
| コールバック引数                  | `turns.filter((t) => ...)` の `t`                        |
| `beforeEach` / `afterEach` の変数 | `tempDir`, `globalConfig`                                |

## サフィックス

| サフィックス    | 用途                                                         |
| --------------- | ------------------------------------------------------------ |
| `Provider`      | 依存注入する関数型・インターフェース（`CommandProvider` 等） |
| `.types.ts`     | 共通型定義ファイル（`skills/_cle-libs/types/`）              |
| `.constants.ts` | 共通定数ファイル（`skills/_cle-libs/constants/`）            |
