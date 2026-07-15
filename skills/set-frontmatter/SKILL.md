---
name: set-frontmatter
description: >
  ChatLog Markdownファイルにフロントマターを一括付加・上書きする。
  /set-frontmatter で呼び出す。
  AIが会話内容を解析してtitle/summary/category/topics/tagsを生成。
  .config/chatlog-exporter/dics/ の辞書を参照してcategory/topics/tagsを選定する。
argument-hint: "<input-path> [output-path] | [agent] project [YYYY-MM] [--dry-run] [--no-review]"
allowed-tools: Bash, Glob
---

# set-frontmatter スキル

`temp/chatlogs/<agent>/` 配下のChatLog Markdownに、AIが生成したフロントマターを並列付加・上書きする。
`.config/chatlog-exporter/dics/` の辞書ファイルを参照して category / topics / tags を選定する。

## 前提条件

- `claude` コマンドがPATHに存在すること (Claude Code CLIインストール済み)
- `deno` コマンドが利用可能であること (TypeScript実行用)
- `.config/chatlog-exporter/dics/` に辞書ファイルが存在すること

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → エラー (project またはパスを指定してください)
- `<path>` → 1つのパス指定: `--input-dir` として使用（出力はデフォルト `outputLogs`）
- `<input-path> <output-path>` → 2つのパス指定: 1つ目=`--input-dir`、2つ目=`--output-dir`（出力先）
- `project` のみ → `claude` agent・指定プロジェクト・全年月
- `project YYYY-MM` → `claude` agent・指定プロジェクト・指定年月
- `agent project` → 指定 agent・指定プロジェクト・全年月
- `agent project YYYY-MM` → 指定 agent・指定プロジェクト・指定年月
- `--dry-run` → 実際には書き込まず出力のみ確認
- `--no-review` → AIによるレビューフェーズ(Phase 3.1)をスキップする

引数の判定ルール (優先順位順):

1. `--dry-run` → DRY_RUN_FLAG
2. `--no-review` → REVIEW_FLAG
3. 各引数の `\` を `/` に正規化する
4. 非オプション引数をパス引数リスト (PATH_ARGS) とその他に分類する
   - `/` を含む引数 → PATH_ARGS に追加
5. PATH_ARGS の数で分岐:
   - 1つ: INPUT_DIR=PATH_ARGS[0]、OUTPUT_DIR は未設定（スクリプトのデフォルト使用）
   - 2つ: INPUT_DIR=PATH_ARGS[0]、OUTPUT_DIR=PATH_ARGS[1]
6. PATH_ARGS が0の場合は非パスモードで処理:
   - `YYYY-MM` パターン (`^[0-9]{4}-[0-9]{2}$`) → YEAR_MONTH
   - 既知のagentリスト (`claude`, `chatgpt`, `codex`) に一致 → AGENT
   - それ以外最初の値 → PROJECT

例:

- `/set-frontmatter chatlogs/normalizelogs/claude/2026-04` → input=その パス、output=デフォルト
- `/set-frontmatter chatlogs/normalizelogs/claude/2026-04 chatlogs/outputLogs/claude/2026-04` → input=1つ目、output=2つ目
- `/set-frontmatter dev-tooling 2026-03` → claude/dev-tooling/2026-03
- `/set-frontmatter chatgpt dev-tooling 2026-03` → chatgpt/dev-tooling/2026-03
- `/set-frontmatter deckrd --dry-run` → claude/deckrd 全年月 (dry-run)
- `/set-frontmatter deckrd --no-review` → claude/deckrd 全年月 (レビューフェーズをスキップ)

## ステップ1: スクリプトパスの解決

Glob ツールで `**/skills/set-frontmatter/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <set-frontmatter/SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/set-frontmatter.ts
DICS_DIR    = <cwd>/temp/dics
```

## ステップ2: 引数解析と対象ディレクトリ決定

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
CHATLOGS_BASE="$REPO_ROOT/chatlogs"
DICS_DIR="$REPO_ROOT/.config/chatlog-exporter/dics"
AGENT="claude"   # デフォルト
PROJECT=""
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
# 5. それ以外は YYYY-MM / AGENT / PROJECT として分類

# パス引数の数で分岐:
# PATH_ARGS が1つ: INPUT_DIR=PATH_ARGS[0]（絶対パスならそのまま、相対なら $REPO_ROOT/$ARG）
# PATH_ARGS が2つ: INPUT_DIR=PATH_ARGS[0]、OUTPUT_DIR=PATH_ARGS[1]
# PATH_ARGS が0: 非パスモード（PROJECT/AGENT/YEAR_MONTH で INPUT_DIR を構築）

# 非パスモードの INPUT_DIR 決定:
#   YEAR_MONTH あり: $CHATLOGS_BASE/normalizelogs/$AGENT/$YEAR/$YEAR_MONTH/$PROJECT
#     （$YEAR は $YEAR_MONTH の先頭4文字）
#   YEAR_MONTH なし: find で $CHATLOGS_BASE/normalizelogs/$AGENT 配下を列挙
```

## ステップ3: スクリプト実行

```bash
# INPUT_DIR のみ指定 (OUTPUT_DIR は --output-dir を省略してスクリプトのデフォルトに委ねる):
deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" \
  --input-dir "$INPUT_DIR" \
  --dics "$DICS_DIR" \
  $DRY_RUN_FLAG \
  $REVIEW_FLAG

# INPUT_DIR と OUTPUT_DIR 両方指定:
deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" \
  --input-dir "$INPUT_DIR" \
  --output-dir "$OUTPUT_DIR" \
  --dics "$DICS_DIR" \
  $DRY_RUN_FLAG \
  $REVIEW_FLAG

# 非パスモード・YEAR_MONTH が未指定の場合 (全年月):
find "$CHATLOGS_BASE/normalizelogs/$AGENT" -mindepth 3 -maxdepth 3 -type d -name "$PROJECT" | sort | while read -r dir; do
  echo "=== Processing: $dir ==="
  deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" \
    --input-dir "$dir" \
    --dics "$DICS_DIR" \
    $DRY_RUN_FLAG \
    $REVIEW_FLAG
done
```

## ステップ4: 結果報告

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

通知形式:

- total / success / fail / skip の件数を報告
- dry-run モードの場合はその旨を明示する

## 生成されるフロントマター構造

```yaml
---
session_id: <既存値を保持>
date: <既存値を保持>
project: <既存値を保持>
slug: <既存値を保持>
type: <AI判定: implementation|design|article|conversation|debug>
title: <AI生成>
summary: |
  <AI生成 multiline>
category: <辞書から選択>
topics:
  - <辞書から選択>
tags:
  - <辞書から選択>
---
```

## 辞書ファイル

- `.config/chatlog-exporter/dics/category.dic`: category 選択肢
- `.config/chatlog-exporter/dics/topics.dic`: topics 選択肢
- `.config/chatlog-exporter/dics/tags.dic`: tags 選択肢 (namespace/value 形式)
- `.config/chatlog-exporter/dics/namespaces.dic`: タグ名前空間の定義

## 関連スキル

- `/export-log` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値ChatLogのフィルタリング (set-frontmatter の前工程)
