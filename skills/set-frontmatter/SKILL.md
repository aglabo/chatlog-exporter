---
name: set-frontmatter
description: >
  ChatLog Markdownファイルにフロントマターを一括付加・上書きする。
  /set-frontmatter で呼び出す。
  AIが会話内容を解析してtitle/type/category/topics/tagsを生成。
  .config/chatlog-exporter/dics/ の辞書を参照してcategory/topics/tagsを選定する。
argument-hint: "<input-path> [output-path] | [agent] [YYYY-MM] [--dry-run] [--no-review]"
allowed-tools: Bash, Glob
---

# set-frontmatter スキル

`chatlogs/normalizeLogs/<agent>/` 配下のChatLog Markdownに、AIが生成したフロントマターを並列付加・上書きする。
`.config/chatlog-exporter/dics/` の辞書ファイルを参照して category / topics / tags を選定する。

## 前提条件

- `claude` コマンドがPATHに存在すること (Claude Code CLIインストール済み)
- `deno` コマンドが利用可能であること (TypeScript実行用)
- `.config/chatlog-exporter/dics/` に辞書ファイルが存在すること

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → デフォルト agent の全期間を処理
  （`config.yaml` の `agent`。優先順位は **CLI 引数 > `config.yaml` > 組み込み既定（`claude`）**。
  既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する）
- `<path>` → 1つのパス指定: `--input-dir` として使用（出力はデフォルト `outputLogs`）
- `<input-path> <output-path>` → 2つのパス指定: 1つ目=`--input-dir`、2つ目=`--output-dir`
- `agent` のみ → 指定 agent・全年月
- `agent YYYY-MM` → 指定 agent・指定年月
- `--dry-run` → 書き込まず、AI 呼び出しもスキップして状態のみ確認（後述の注意を参照）
- `--no-review` → AIによるレビューフェーズ(Phase 3.1)をスキップする

> **注意**: `project` を引数として指定することはできない。
> プロジェクト名の位置引数は存在せず、渡すと `UnknownPositional` エラーで異常終了する。
> プロジェクト単位で処理したい場合は、そのディレクトリを `--input-dir` に渡す。

位置引数の判定ルール（インデックス固定パターン）:

- **パターンA**: 1つ目がスラッシュを含むパス → 入力ディレクトリ（`--input-dir` 相当）。
  2つ目のパスは出力ディレクトリ（`--output-dir` 相当）
- **パターンB**: 1つ目が既知のエージェント（`claude`, `chatgpt`, `codex`）→ AGENT。
  2つ目がある場合は `YYYY-MM` 形式が**必須**（違反すると `InvalidPeriodPosition` エラー）
- 上記いずれにも当てはまらない1つ目の引数 → `UnknownPositional` エラー

> `YYYY-MM` を単独の位置引数として渡すことはできない。期間だけを指定する場合は agent と併記する。

例:

- `/set-frontmatter chatlogs/normalizeLogs/claude/2026/2026-04` → input=そのパス、output=デフォルト
- `/set-frontmatter chatlogs/normalizeLogs/claude/2026/2026-04 chatlogs/outputLogs/claude/2026-04` → input=1つ目、output=2つ目
- `/set-frontmatter claude 2026-03` → claude/2026/2026-03
- `/set-frontmatter chatgpt 2026-03` → chatgpt/2026/2026-03
- `/set-frontmatter claude --dry-run` → claude 全年月 (dry-run)
- `/set-frontmatter claude --no-review` → claude 全年月 (レビューフェーズをスキップ)

## ステップ1: スクリプトパスの解決

Glob ツールで `**/skills/set-frontmatter/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <set-frontmatter/SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/set-frontmatter.ts
```

辞書ディレクトリは `--dics` で指定しない。スクリプトは `config.yaml` の `dicsDir`（既定 `dics`、`.config/chatlog-exporter/` 相対）を自動解決する。

## ステップ2: 引数解析と対象ディレクトリ決定

```bash
AGENT=""         # 未指定なら渡さない（スクリプトが config.yaml の agent を解決する）
YEAR_MONTH=""
DRY_RUN_FLAG=""
REVIEW_FLAG=""
INPUT_DIR=""
OUTPUT_DIR=""
PATH_ARGS=()

# $ARGUMENTS を解析:
# 1. "--dry-run" → DRY_RUN_FLAG
# 2. "--no-review" → REVIEW_FLAG="--no-review"
# 3. 各引数の \ を / に正規化する
# 4. 正規化後に / を含む → PATH_ARGS に追加
# 5. それ以外は AGENT / YYYY-MM として分類

# パス引数の数で分岐:
# PATH_ARGS が1つ: INPUT_DIR=PATH_ARGS[0]
# PATH_ARGS が2つ: INPUT_DIR=PATH_ARGS[0]、OUTPUT_DIR=PATH_ARGS[1]
# PATH_ARGS が0: AGENT / YEAR_MONTH をそのまま位置引数として渡す（スクリプトが解決する）
```

`--input-dir` を指定しない場合、入力ディレクトリはスクリプト側で以下のように解決される
（`chatlogsDir` は `config.yaml` の値。既定は `./chatlogs`。git は使用しない）:

```bash
<chatlogsDir>/normalizeLogs/<agent>[/<YYYY>/<YYYY-MM>]
```

プロジェクト名はパスに含まれない。`INPUT_DIR` 配下の Markdown はスクリプトが再帰走査するため、
ディレクトリ列挙・ループは不要。

### 出力先の決定

`--output-dir` 未指定時の既定は `<chatlogsDir>/outputLogs` になる。

> **重要**: 入力パスが `.../normalizeLogs/<YYYY>/<YYYY-MM>` 形式に一致する場合、
> 出力先は入力パスの `normalizeLogs` を `outputLogs` に置換したパスに**自動的に上書きされ**、
> `--output-dir` の指定は無視される。標準的な `chatlogs/normalizeLogs/...` を入力にする限り、
> 出力は常に対応する `chatlogs/outputLogs/...` になる。

## ステップ3: スクリプト実行

```bash
# INPUT_DIR のみ指定 (OUTPUT_DIR は --output-dir を省略してスクリプトのデフォルトに委ねる):
deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" \
  --input-dir "$INPUT_DIR" \
  $DRY_RUN_FLAG \
  $REVIEW_FLAG

# INPUT_DIR と OUTPUT_DIR 両方指定:
deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" \
  --input-dir "$INPUT_DIR" \
  --output-dir "$OUTPUT_DIR" \
  $DRY_RUN_FLAG \
  $REVIEW_FLAG
```

INPUT_DIR 配下の Markdown はスクリプトが再帰的に走査するため、ディレクトリを列挙してループ実行する必要はない。
非パスモード・YEAR_MONTH 未指定（全年月）の場合も、ステップ2で決定した INPUT_DIR をそのまま `--input-dir` に渡す。

## ステップ4: 結果報告

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

サマリーは **stderr** に `::info::` プレフィックス付きで、以下の形式で出力される:

```bash
::info:: 完了: total=10 success=8 fail=0 skip=2 written=8 target=10
```

通知形式:

- 上記6つのカウンタ（total / success / fail / skip / written / target）を報告する
- dry-run モードの場合はその旨を明示する

dry-run 時は追加で、ステータス別のファイル一覧（`[<status>] <filename>`）と
`dry-run 集計: empty=… type-category=… frontmatter=… reviewed=… written=… review-failed=… (total=…)`
が出力される。

## dry-run の挙動に関する注意

`--dry-run` は「書き込まない」だけでなく、**AI 呼び出しをすべてスキップする**。

- type / category の判定、title 生成、レビューのいずれも実行されない
- キャッシュへの書き込みも行われないため、進捗は保存されない
- 対象ファイルは `success` ではなく `skip` に計上される

生成されるフロントマターのプレビュー用途には使えず、処理状態の確認モードとして扱う。

## 生成されるフロントマター構造

書き込まれるフィールドは以下に固定される（この順序で出力される）:

```yaml
---
title: <AI生成>
date: <既存値を保持>
type: <AI判定: execution|incident|discussion|research|writing>
category: <辞書から選択>
session_id: <既存値を保持>
project: <既存値を保持>
slug: <既存値を保持>
topics:
  - <辞書から選択>
tags:
  - <辞書から選択>
---
```

> **注意**: `summary` はフロントマターには書き込まれない。
> 上記以外のキーは書き出し時に除去される。

## 辞書ファイル

`config.yaml` の `dicsDir`（既定 `dics`、`.config/chatlog-exporter/` 相対）配下から読み込む。
形式はいずれも **YAML**（キーが選択肢、値に `def` / `desc` / `rules` を持つ）。

- `category.dic`: category 選択肢
- `topics.dic`: topics 選択肢
- `tags.dic`: tags 選択肢（キーが `<namespace>:<value>` 形式）
- `types.dic`: type 選択肢（`execution` / `incident` / `discussion` / `research` / `writing`）

辞書ファイルが存在しない場合は警告を出して空として扱う（処理は継続する）。

## 利用可能なオプション一覧

| オプション         | 説明                                                         |
| ------------------ | ------------------------------------------------------------ |
| `--input-dir DIR`  | 入力ディレクトリ（agent / period を無視）                    |
| `--output-dir DIR` | 出力先（`normalizeLogs` 入力時は自動上書きされる。上記参照） |
| `--dics DIR`       | 辞書ディレクトリ                                             |
| `--prompts DIR`    | プロンプトディレクトリ                                       |
| `--concurrency N`  | 並列実行数（デフォルト: 4）                                  |
| `--cache-dir DIR`  | キャッシュディレクトリ                                       |
| `--model MODEL`    | AI モデル名（デフォルト: GlobalConfig の `model`）           |
| `--config FILE`    | GlobalConfig ファイルのパス                                  |
| `--review`         | レビューフェーズを実行する（`--no-review` で無効化）         |
| `--dry-run`        | 書き込まない（AI 呼び出しもスキップされる）                  |

> ディレクトリを取る値（`--input-dir` / `--output-dir` / `--dics` / `--prompts`）は
> **スラッシュを含む必要がある**（`dics` は不可、`./dics` は可）。
> 上記以外の `--` オプションを渡すと `UnknownOption` エラーで異常終了する。

## 関連スキル

- `/export-chatlogs` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値ChatLogのフィルタリング (set-frontmatter の前工程)
