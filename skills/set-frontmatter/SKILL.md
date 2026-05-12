---
name: set-frontmatter
description: >
  ChatLog Markdownファイルにフロントマターを一括付加・上書きする。
  /set-frontmatter で呼び出す。
  AIが会話内容を解析してtitle/summary/category/topics/tagsを生成。
  assets/dics/ の辞書を参照してcategory/topics/tagsを選定する。
argument-hint: "<path> | [agent] project [YYYY-MM] [--dry-run]"
allowed-tools: Bash, Glob
---

# set-frontmatter スキル

`temp/chatlogs/<agent>/` 配下のChatLog Markdownに、AIが生成したフロントマターを並列付加・上書きする。
`assets/dics/` の辞書ファイルを参照して category / topics / tags を選定する。

## 前提条件

- `claude` コマンドがPATHに存在すること (Claude Code CLIインストール済み)
- `deno` コマンドが利用可能であること (TypeScript実行用)
- `assets/dics/` に辞書ファイルが存在すること

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → エラー (project またはパスを指定してください)
- `<path>` → パス直接指定・指定ディレクトリのみ処理
- `project` のみ → `claude` agent・指定プロジェクト・全年月
- `project YYYY-MM` → `claude` agent・指定プロジェクト・指定年月
- `agent project` → 指定 agent・指定プロジェクト・全年月
- `agent project YYYY-MM` → 指定 agent・指定プロジェクト・指定年月
- `--dry-run` → 実際には書き込まず出力のみ確認

引数の判定ルール (優先順位順):

1. `--dry-run` → DRY_RUN_FLAG
2. 各引数の `\` を `/` に正規化する
3. 最初の非オプション引数が `/` を含む → **PATH モード** (パスを直接 TARGET_DIR として使用)
4. `YYYY-MM` パターン (`^[0-9]{4}-[0-9]{2}$`) → YEAR_MONTH
5. 既知のagentリスト (`claude`, `chatgpt`) に一致 → AGENT
6. それ以外 → PROJECT (最初の非オプション引数)

例:

- `/set-frontmatter temp/chatlogs/claude/2026-03/voift` → そのパスのみ処理
- `/set-frontmatter dev-tooling 2026-03` → claude/dev-tooling/2026-03
- `/set-frontmatter chatgpt dev-tooling 2026-03` → chatgpt/dev-tooling/2026-03
- `/set-frontmatter deckrd --dry-run` → claude/deckrd 全年月 (dry-run)

## ステップ1: スクリプトパスの解決

Glob ツールで `**/commands/set-frontmatter.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <set-frontmatter.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/set-frontmatter.ts
DICS_DIR    = <cwd>/temp/dics
```

## ステップ2: 引数解析と対象ディレクトリ決定

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
CHATLOGS_BASE="$REPO_ROOT/temp/chatlogs"
DICS_DIR="$REPO_ROOT/assets/dics"
AGENT="claude"   # デフォルト
PROJECT=""
YEAR_MONTH=""
DRY_RUN_FLAG=""
PATH_MODE=false
TARGET_DIR=""

# $ARGUMENTS を解析:
# 1. "--dry-run" → DRY_RUN_FLAG
# 2. 各引数の \ を / に正規化する (例: temp\chatlogs\... → temp/chatlogs/...)
# 3. 正規化後に / を含む → PATH_MODE=true
# 4. "^[0-9]{4}-[0-9]{2}$" → YEAR_MONTH
# 5. "claude" or "chatgpt" → AGENT
# 6. それ以外最初の値 → PROJECT

# PATH_MODE 判定例:
# "temp\chatlogs\claude\2026-03\voift" → 正規化 → "temp/chatlogs/claude/2026-03/voift" → / を含む → PATH_MODE=true
# "C:\Users\foo\bar" → 正規化 → "C:/Users/foo/bar" → / を含む → PATH_MODE=true

# TARGET_DIR の決定:
# PATH_MODE true の場合:
#   - 絶対パス (/ または ドライブレター) → TARGET_DIR="$FIRST_ARG"
#   - 相対パス → TARGET_DIR="$REPO_ROOT/$FIRST_ARG"
#   単一ディレクトリとしてスクリプトを実行
# PATH_MODE false の場合:
#   YEAR_MONTH あり: $CHATLOGS_BASE/$AGENT/$YEAR_MONTH/$PROJECT
#   YEAR_MONTH なし: find で $CHATLOGS_BASE/$AGENT 配下の $PROJECT ディレクトリを列挙
```

## ステップ3: スクリプト実行

```bash
# PATH_MODE の場合 (パス直接指定):
# 単一ディレクトリとして実行
deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" \
  "$TARGET_DIR" \
  --dics "$DICS_DIR" \
  $DRY_RUN_FLAG

# YEAR_MONTH が指定されている場合 (単一ディレクトリ):
deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" \
  "$TARGET_DIR" \
  --dics "$DICS_DIR" \
  $DRY_RUN_FLAG

# YEAR_MONTH が未指定の場合 (全年月):
find "$CHATLOGS_BASE/$AGENT" -mindepth 2 -maxdepth 2 -type d -name "$PROJECT" | sort | while read -r dir; do
  echo "=== Processing: $dir ==="
  deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" \
    "$dir" \
    --dics "$DICS_DIR" \
    $DRY_RUN_FLAG
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

- `assets/dics/category.dic`: category 選択肢
- `assets/dics/topics.dic`: topics 選択肢
- `assets/dics/tags.dic`: tags 選択肢 (namespace:value 形式)
- `assets/dics/namespaces.dic`: タグ名前空間の定義

## 関連スキル

- `/export-log` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値ChatLogのフィルタリング (set-frontmatter の前工程)
