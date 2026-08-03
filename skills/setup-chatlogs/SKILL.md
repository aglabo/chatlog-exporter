---
name: setup-chatlogs
description: >
  chatlog-exporter の設定ファイルと共有ライブラリを、現在のディレクトリに展開する。
  /setup-chatlogs で呼び出す。
  .config/chatlog-exporter/（設定・辞書・プロンプト）、deno.json、
  .claude/skills/_scripts/（共有ライブラリ）の3つを配置し、
  export-chatlogs 等の各スキルが動作する状態にする。
argument-hint: "[--force]"
allowed-tools: Bash, Glob
---

# setup-chatlogs スキル

chatlog-exporter の各スキル（`/export-chatlogs` 等）が依存する設定ファイルと共有ライブラリを、
現在のディレクトリに展開する。スキルマネージャー（`gh skill` 等）はスキル本体しか運ばないため、
インストール直後はこのスキルを一度実行する必要がある。

## 前提条件

- **展開したいディレクトリで実行すること。** 展開先はカレントディレクトリを基準に決まる。
  git リポジトリである必要はなく、git コマンドも使わない。

カレントディレクトリを基準にするのは、展開後の共有ライブラリが実行時のカレントディレクトリから
プロジェクトルートを解決するため。リポジトリルートを基準にすると、サブディレクトリでスキルを
実行したときに設定を見つけられなくなる。

展開後の各スキルの実行には `deno` が必要だが、このスキル自体の実行には不要。

## 適用対象

このスキルは**配布先プロジェクト**で実行するもので、chatlog-exporter 自身のリポジトリでは実行しない。

展開先はカレントディレクトリを基準に決まるため、**実行前にカレントディレクトリを必ず確認する。**
危険は 2 つある。

**1. ソースリポジトリでの `--force` 実行は拒否する。**
chatlog-exporter では `.claude/skills` が `../skills` への symlink になっている。
そのため展開先 `.claude/skills/_scripts` は、symlink 経由で共有ライブラリの実体
`skills/_scripts/` に解決する。
`--force` でそのまま展開すると、この実体が配布物のコピーで置き換わる。
配布物に含まれない `skills/_scripts/__tests__/` などが失われる（同居する他のスキルは消えない）。
そのためスクリプトは `.claude/skills` が symlink であることを検出した時点で、
**何も配置せずエラーで停止する**。

`--force` なしの実行は拒否しない。展開先の `_scripts` はすでに存在するものとして
`Skipped (exists)` になり、共有ライブラリの実体には手を触れずに終わる。

**2. 意図しないサブディレクトリで実行するとそこに展開される。**
カレントディレクトリ基準のため、リポジトリのサブディレクトリで実行してもエラーにならず、
その場所に `.config/chatlog-exporter/`・`deno.json`・`.claude/skills/_scripts/` を作ってしまう。
展開したいディレクトリ（通常はプロジェクトのルート）に移動してから実行すること。
この経路では `.claude/skills` が symlink にならないため 1. の拒否は働かない。実行前に
カレントディレクトリを必ず確認すること。

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → 展開先が既存のエントリはスキップする
- `--force` → 既存の展開先を上書きする
- `--help` → 使い方を表示して終了する

上記以外の引数はスクリプトが未知オプションとして拒否する。ユーザーが別の語を渡した場合は
勝手に読み替えず、`--force` の意図かどうかを確認する。

## ステップ1: スクリプトパスの解決

Glob ツールで `**/setup-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/setup-chatlogs.sh
```

複数ヒットした場合は、`scripts/setup-chatlogs.sh` が実在するものを選ぶ。

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で実行する:

```bash
bash "$SCRIPT_PATH" [--force]
```

引数からオプションを組み立てるルール:

- 引数なし → `bash "$SCRIPT_PATH"`
- `--force` を含む → `bash "$SCRIPT_PATH" --force`
- `--help` を含む → `bash "$SCRIPT_PATH" --help`

スクリプトは以下の処理を行う:

1. 展開元がすべて揃っているかを事前検証する（1つでも欠けていれば何も配置せずに終了する）
2. 各エントリをカレントディレクトリ基準の展開先へコピーする
3. 展開先が既存の場合、`--force` が無ければそのエントリ全体をスキップする

## ステップ3: 結果通知

スクリプト完了後、出力を読んでユーザーに結果を通知する。

通知形式:

- `Copied:` 行から、配置された展開先を一覧で示す
- `Skipped (exists):` 行がある場合はスキップされた展開先を明示し、
  上書きしたい場合は `--force` を付けて再実行する旨を案内する
- `Error: source not found:` が出た場合は、配布物が不完全であることを伝える
  （何も配置されていないため、部分的に壊れた状態にはなっていない点も併せて伝える）

## 展開されるもの

| 展開元（スキル内）                 | 展開先（カレントディレクトリ基準） |
| ---------------------------------- | ---------------------------------- |
| `assets/.config/chatlog-exporter/` | `.config/chatlog-exporter/`        |
| `assets/deno.json`                 | `deno.json`                        |
| `_scripts/`                        | `.claude/skills/_scripts/`         |

- `.config/chatlog-exporter/` — グローバル設定 `config.yaml`、分類辞書 `dics/`、AI プロンプト `prompts/`
- `deno.json` — JSR の bare specifier（`@std/yaml` 等）を解決するために必要
- `_scripts/` — 各スキルが共有する型・定数・ライブラリ。各スキルの `../../_scripts/` import が
  そのまま解決するよう `.claude/skills/` 直下に置く

展開先は既存ファイルを個別にマージせず、エントリ単位で扱う。ローカルの編集を保つため、
既存の展開先はスキップがデフォルトになっている。

## 関連スキル

- `/export-chatlogs` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値 ChatLog のフィルタリング
- `/normalize-chatlogs` — トピック別セグメントへの正規化
- `/classify-chatlogs` — プロジェクト別サブディレクトリへの分類
- `/set-frontmatter` — フロントマター付加
