---
name: classify-chatlogs
description: >
  チャットログをプロジェクト別サブディレクトリに分類する。
  /classify-chatlogs で呼び出す。
  Claude CLI でファイルのメタデータを解析し、プロジェクト名を推定してサブディレクトリに移動。
  フロントマターに project フィールドを付加する。
argument-hint: "[agent] [YYYY-MM] [--dry-run] [--base-dir DIR]"
allowed-tools: Bash, Glob
---

# classify-chatlogs スキル

`chatlogs/<agent>/` 配下のフラットなチャットログをプロジェクト別サブディレクトリに分類する。
`assets/configs/projects.dic` の辞書を参照してプロジェクトを選定する。

## 前提条件

- `claude` コマンドがPATHに存在すること（Claude Code CLIインストール済み）
- `deno` コマンドが利用可能であること（TypeScript実行用）
- `assets/configs/projects.dic` にプロジェクト名が定義されていること

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理する:

- 引数なし → デフォルト agent（`chatgpt`）の全期間を処理
- `agent`（例: `claude`）→ 指定 agent の全期間
- `YYYY-MM`（例: `2026-04`）→ デフォルト agent・指定月のみ
- `YYYY`（例: `2026`）→ デフォルト agent・指定年のみ
- `agent YYYY-MM`（例: `claude 2026-04`）→ 指定 agent・指定月
- `--dry-run` → 移動せず分類結果のみ表示
- `--base-dir DIR` → チャットログのベースディレクトリを指定

位置引数の判定ルール:

- `YYYY-MM` または `YYYY` パターン → 期間（period）
- 既知のエージェントリスト（`claude`, `chatgpt`）に一致 → AGENT
- スラッシュを含むパス → チャットログディレクトリ（chatlogsDir）

## ステップ1: スクリプトパスの解決

Glob ツールで `**/classify-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/classify-chatlogs.ts
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で実行する:

```bash
deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" [agent] [YYYY-MM] [--dry-run] [--base-dir DIR]
```

### 引数からオプションを組み立てるルール

- 引数なし → `deno run ... "$SCRIPT_PATH"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" claude`
- `YYYY-MM` のみ → `deno run ... "$SCRIPT_PATH" 2026-04`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" claude 2026-04`
- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--base-dir DIR` を含む → `--base-dir "$DIR"` を追加（省略時は GlobalConfig の `chatlogsDir` を使用）

スクリプトは以下の処理を行う:

1. 各ファイルの title / category / topics / tags を読み取り
2. `projects.dic` のプロジェクト候補から Claude CLI で最適なプロジェクトを判定
3. プロジェクト別サブディレクトリにファイルを移動
4. フロントマターに `project:` フィールドを追加
5. マッチしない場合は `misc/` サブディレクトリに移動

## ステップ3: 結果通知

スクリプト完了後、出力のサマリー行を読んでユーザーに結果を通知する。

通知形式:

- moved / skipped / error の件数を報告
- dry-run モードの場合はその旨を明示する
- 移動されたファイルの分類先プロジェクトを簡潔にまとめる

## 分類後のディレクトリ構造

```bash
chatlogs/claude/2026/2026-04/
  ├── chatlog-exporter/
  │   └── 2026-04-08-classify実装.md
  ├── dev-tooling/
  │   └── 2026-04-13-cSpell辞書設定.md
  └── misc/
      └── 2026-04-10-未分類ログ.md
```

## 付加されるフロントマター

`project:` フィールドが追加される:

```yaml
---
title: classify実装
date: 2026-04-08
project: chatlog-exporter
origin:
  source: claude
  model: claude-opus-4-7
category: dev
topics:
  - tool-development
tags:
  - ai/claude
---
```

## 利用可能なオプション一覧

| オプション           | 説明                                                         |
| -------------------- | ------------------------------------------------------------ |
| `--base-dir DIR`     | チャットログのベースディレクトリ（デフォルト: `./chatlogs`） |
| `--chatlogs-dir DIR` | チャットログの直接パス指定（agent/period を無視）            |
| `--model MODEL`      | AI モデル名（デフォルト: GlobalConfig の model）             |
| `--config FILE`      | GlobalConfig ファイルのパス                                  |
| `--dry-run`          | ファイルを移動せず分類結果のみ表示                           |

## 辞書ファイル

- `assets/configs/projects.dic`: プロジェクト名の選択肢（GlobalConfig の `projectsDic` で変更可能）

## 関連スキル

- `/export-chatlogs` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値ChatLogのフィルタリング
- `/set-frontmatter` — フロントマター付加（classify-chatlogs の後工程として推奨）
