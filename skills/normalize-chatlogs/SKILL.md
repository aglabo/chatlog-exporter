---
name: normalize-chatlogs
description: >
  チャットログMarkdownをAI（Claude CLI）でトピック別セグメントに分割し、
  フロントマター付きMarkdownとして出力する。
  /normalize-chatlogs で呼び出す。
  入力ファイルのフロントマターを引き継ぎつつ、title/log_idをAIが生成する。summaryは本文の`## Summary`セクションに使われる。
argument-hint: "<agent> <YYYY-MM> | <path> [--output <dir>] [--concurrency <n>] [--model <model>] [--dry-run]"
allowed-tools: Bash, Glob
---

# normalize-chatlogs スキル

チャットログMarkdownをAI（Claude CLI）でトピック別セグメントに分割して正規化する。
各セグメントはフロントマター付きMarkdownとして出力され、既存ファイルはアトミックに上書き（`.old-NN.md` バックアップ）される。

## 前提条件

- `claude` コマンドがPATHに存在すること（Claude Code CLIインストール済み）
- `deno` コマンドが利用可能であること（TypeScript実行用）

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールでスクリプト引数に変換する。

スクリプトは位置引数として `agent` や `YYYY-MM` を直接受け付けない。
SKILL.md 側でフラグ（`--agent`, `--period`）に変換してから渡す。

引数の判定ルール:

- `YYYY-MM` パターン（`^[0-9]{4}-[0-9]{2}$`）→ YEAR_MONTH
- `/` または `\` を含む文字列 → PATH（位置引数として渡す）
- `--output <dir>` → OUTPUT_DIR（`--output` フラグとしてそのまま転送）
- `--concurrency <n>` → 並列実行数（`--concurrency` フラグとしてそのまま転送、デフォルト: 4）
- `--model <model>` → AI モデル名（`--model` フラグとしてそのまま転送）
- 上記以外の文字列 → AGENT

引数パターンと変換ルール:

- 引数なし → **エラー**。`agent + YYYY-MM` または `path` のいずれかが必須。使い方を表示して終了する。
- `YYYY-MM` のみ → `--agent claude --period YYYY-MM`
- `agent` のみ → `--agent <agent> --period` が揃っていないためエラー。YYYY-MM も指定するよう案内する。
- `agent YYYY-MM` → `--agent <agent> --period YYYY-MM`
- `/path/to/dir` → `/path/to/dir`（位置引数のまま渡す）
- `--output <dir>` → `--output <dir>` としてスクリプトに転送
- `--dry-run` フラグ → そのままスクリプトに転送

## ステップ1: スクリプトパスの解決

Glob ツールで `**/normalize-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/normalize-chatlogs.ts
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で実行する:

```bash
deno run --allow-read --allow-write --allow-env --allow-run "$SCRIPT_PATH" {変換後の引数}
```

### 引数からオプションを組み立てるルール

- 引数なし → エラー出力して終了（`agent + YYYY-MM` または `path` が必須）
- `agent` のみ → エラー出力して終了（YYYY-MM が不足）
- `2026-03` のみ → `deno run ... "$SCRIPT_PATH" --agent claude --period 2026-03`
- `claude 2026-03` → `deno run ... "$SCRIPT_PATH" --agent claude --period 2026-03`
- `/path/to/chatlogs` → `deno run ... "$SCRIPT_PATH" /path/to/chatlogs`
- `--output <dir>` を含む → `--output <dir>` をスクリプトに転送
- `--concurrency <n>` を含む → `--concurrency <n>` をスクリプトに転送
- `--model <model>` を含む → `--model <model>` をスクリプトに転送
- `--dry-run` を含む → `--dry-run` を末尾に追加

スクリプトは以下の処理を行う:

1. 入力ディレクトリ配下の `.md` ファイルを再帰的に収集
2. Claude CLI で各 chatlog をトピック別セグメントに分割（最大10セグメント）
3. 各セグメントをフロントマター付きMarkdownとして出力
4. 出力ファイル名形式: `<baseName>-<XX>-<hash7>.md`
5. 既存ファイルがある場合は `.old-NN.md` にバックアップ後、アトミック上書き（tmp-then-rename）

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

通知形式:

- 生成したセグメントファイル数（success）と出力先ディレクトリ
- `fail > 0` の場合は失敗件数を警告として強調表示
- dry-run モードの場合はその旨を明示する

## 入力ディレクトリ

`--chatlogs-dir` 未指定時、デフォルトの入力元は `chatlogs/originalLogs/<agent>/<year>/<yearMonth>` である
（`--chatlogs-dir` 明示指定時は `originalLogs` を挟まず指定パスをそのまま使う）。

## 出力ディレクトリ構造

入力が `chatlogs/<agent>/<year>/<yearMonth>` 形式の場合:

```bash
temp/normalize_logs/
  └── <agent>/
       └── <year>/
            └── <yearMonth>/
                 └── <project>/
                      └── <baseName>-<XX>-<hash7>.md
```

入力が任意パスの場合:

```bash
temp/normalize_logs/
  └── <project>/
       └── <baseName>-<XX>-<hash7>.md
```

`project` はソースファイルのフロントマターから引き継ぐ。未定義の場合は `misc/` に出力される。

## 関連スキル

- `/export-chatlog` — ChatLog のエクスポート（normalize-chatlog の前工程）
- `/filter-chatlog` — 低価値ChatLogのフィルタリング
- `/classify-chatlogs` — プロジェクト別サブディレクトリへの分類
- `/set-frontmatter` — フロントマター付加
