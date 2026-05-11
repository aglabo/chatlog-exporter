---
name: classify-chatlogs
description: >
  チャットログをプロジェクト別サブディレクトリに分類する。
  /classify-chatlogs で呼び出す。
  Claude CLI でファイルのメタデータを解析し、プロジェクト名を推定してサブディレクトリに移動。
  フロントマターに project フィールドを付加する。
argument-hint: "[agent] [YYYY-MM] [--dry-run]"
allowed-tools: Bash, Glob
---

# classify-chatlogs スキル

`chatlogs/<agent>/` 配下のフラットなチャットログをプロジェクト別サブディレクトリに分類する。
`assets/dics/projects.dic` の辞書を参照してプロジェクトを選定する。

## 前提条件

- `claude` コマンドがPATHに存在すること（Claude Code CLIインストール済み）
- `deno` コマンドが利用可能であること（TypeScript実行用）
- `assets/dics/projects.dic` にプロジェクト名が定義されていること

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → `chatlogs/chatgpt/` 全体を処理（デフォルト agent: `chatgpt`）
- `agent`（例: `claude`）→ 指定 agent の全体
- `YYYY-MM`（例: `2025-03`）→ `chatgpt` agent・指定月のみ
- `agent YYYY-MM`（例: `chatgpt 2025-03`）→ 指定 agent・指定月
- `--dry-run` → 移動せず分類結果のみ表示

引数の判定ルール:

- `YYYY-MM` パターン（`^[0-9]{4}-[0-9]{2}$`）→ YEAR_MONTH
- 既知のagentリスト（`claude`, `chatgpt`）に一致 → AGENT

## ステップ1: スクリプトパスの解決

Glob ツールで `**/classify-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/classify-chatlogs.ts
INPUT       = <cwd>/chatlogs
DICS_DIR    = <cwd>/assets/dics
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` と `INPUT`、`DICS_DIR` を使い、Bash で実行する:

```bash
deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" [agent] [YYYY-MM] [--dry-run] --input "$INPUT" --dics "$DICS_DIR"
```

### 引数からオプションを組み立てるルール

- 引数なし → `deno run ... "$SCRIPT_PATH" --input "$INPUT" --dics "$DICS_DIR"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" chatgpt --input "$INPUT" --dics "$DICS_DIR"`
- `YYYY-MM` のみ → `deno run ... "$SCRIPT_PATH" 2025-03 --input "$INPUT" --dics "$DICS_DIR"`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" chatgpt 2025-03 --input "$INPUT" --dics "$DICS_DIR"`
- `--dry-run` を含む → 末尾に `--dry-run` を追加

スクリプトは以下の処理を行う:

1. 各ファイルの title / category / topics / tags を読み取り
2. `projects.dic` のプロジェクト候補から Claude CLI で最適なプロジェクトを判定
3. プロジェクト別サブディレクトリにファイルを移動
4. フロントマターに `project:` フィールドを追加（`date:` 行の直後）
5. マッチしない場合は `misc/` サブディレクトリに移動

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

通知形式:

- moved / skipped / error の件数を報告
- dry-run モードの場合はその旨を明示する
- 移動されたファイルの分類先プロジェクトを簡潔にまとめる

## 分類後のディレクトリ構造

```bash
chatlogs/chatgpt/2025/2025-03/
  ├── prompt-review/
  │   └── 2025-03-08-ブログレビュープロンプト分析.md
  ├── dev-tooling/
  │   └── 2025-03-13-cSpell辞書設定.md
  └── misc/
      └── 2025-03-10-スマホ Wi-Fi 共有アプリ.md
```

## 付加されるフロントマター

`date:` 行の直後に `project:` フィールドが追加される:

```yaml
---
title: ブログレビュープロンプト分析
date: 2025-03-08
project: prompt-review
origin:
  source: chatgpt
  model: gpt-5
category: ai
topics:
  - ai-tool-usage
tags:
  - ai:chatgpt
---
```

## 辞書ファイル

- `assets/dics/projects.dic`: プロジェクト名の選択肢

## 関連スキル

- `/export-log` — ChatLog のエクスポート
- `/filter-chatlog` — 低価値ChatLogのフィルタリング
- `/set-frontmatter` — フロントマター付加（classify-chatlogs の後工程として推奨）
