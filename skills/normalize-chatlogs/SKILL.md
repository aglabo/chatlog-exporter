---
name: normalize-chatlogs
description: >
  チャットログMarkdownをAI（Claude CLI）でトピック別セグメントに分割し、
  フロントマター付きMarkdownとして出力する。
  /normalize-chatlogs で呼び出す。
  入力ファイルのフロントマターを引き継ぎつつ、title/log_idをAIが生成する。summaryは本文の`## Summary`セクションに使われる。
argument-hint: "<agent> <YYYY-MM> | <path> [--output-dir <dir>] [--concurrency <n>] [--model <model>] [--dry-run]"
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

スクリプトは位置引数として `agent` / `YYYY-MM` / パスを受け付ける。
`--agent` / `--period` フラグでも同じ指定ができる。

引数の判定ルール:

- `YYYY-MM` パターン（`^[0-9]{4}-[0-9]{2}$`）→ YEAR_MONTH
- `/` または `\` を含む文字列 → PATH（位置引数として渡す）
- `--output-dir <dir>` → 出力先（`--output-dir` フラグとしてそのまま転送）
- `--concurrency <n>` → 並列実行数（`--concurrency` フラグとしてそのまま転送、デフォルト: 4）
- `--model <model>` → AI モデル名（`--model` フラグとしてそのまま転送）
- 既知のエージェント（`claude`, `chatgpt`, `codex`）→ AGENT

位置引数の判定ルール（インデックス固定パターン）:

- **パターンA**: 1つ目がスラッシュを含むパス → 入力ディレクトリ
- **パターンB**: 1つ目が既知のエージェント → AGENT。
  2つ目がある場合は `YYYY-MM` 形式が**必須**（違反すると `InvalidPeriodPosition` エラー）
- 上記いずれにも当てはまらない1つ目の引数 → `UnknownPositional` エラー

> **注意**: `YYYY-MM` を単独の位置引数として渡すことはできない（エラーになる）。
> 期間だけを指定したい場合は `--period 2026-03` を使う。

引数パターンと変換ルール:

- 引数なし → デフォルト agent の全期間を処理
  （`config.yaml` の `agent`。優先順位は **CLI 引数 > `config.yaml` > 組み込み既定（`claude`）**。
  既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する）
- `YYYY-MM` のみ → `--period YYYY-MM`（位置引数では渡せない）
- `agent` のみ → `<agent>` の全期間
- `agent YYYY-MM` → `<agent> <YYYY-MM>`（位置引数のまま渡せる）
- `/path/to/dir` → `/path/to/dir`（位置引数のまま渡す）
- `--output-dir <dir>` → `--output-dir <dir>` としてスクリプトに転送
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

- 引数なし → `deno run ... "$SCRIPT_PATH"`（デフォルト agent の全期間）
- `agent` のみ → `deno run ... "$SCRIPT_PATH" claude`
- `2026-03` のみ → `deno run ... "$SCRIPT_PATH" --period 2026-03`（位置引数では渡せない）
- `claude 2026-03` → `deno run ... "$SCRIPT_PATH" claude 2026-03`
- `/path/to/chatlogs` → `deno run ... "$SCRIPT_PATH" /path/to/chatlogs`
- `--output-dir <dir>` を含む → `--output-dir <dir>` をスクリプトに転送
- `--concurrency <n>` を含む → `--concurrency <n>` をスクリプトに転送
- `--model <model>` を含む → `--model <model>` をスクリプトに転送
- `--dry-run` を含む → `--dry-run` を末尾に追加

スクリプトは以下の処理を行う:

1. 入力ディレクトリ配下の `.md` ファイルを再帰的に収集
2. Claude CLI で各 chatlog をトピック別セグメントに分割（1ファイルあたり最大 5 セグメント。
   AI 呼び出しは 4 ファイルずつのバッチで実行される）
3. 各セグメントをフロントマター付きMarkdownとして出力
4. 出力ファイル名形式: `<baseName>-<XX>-<hash7>.md`
5. 既存ファイルがある場合は `.old-NN.md` にバックアップ後、アトミック上書き（tmp-then-rename）

## 利用可能なオプション一覧

| オプション         | 説明                                                |
| ------------------ | --------------------------------------------------- |
| `--agent AGENT`    | 対象エージェント（`claude`, `chatgpt`, `codex`）    |
| `--period YYYY-MM` | 対象期間（`YYYY-MM` 形式のみ。`YYYY` 単体は不可）   |
| `--input-dir DIR`  | 入力ディレクトリを直接指定（agent / period を無視） |
| `--output-dir DIR` | 出力先ベースディレクトリ                            |
| `--concurrency N`  | 並列実行数（デフォルト: 4）                         |
| `--timeout-ms N`   | AI 呼び出しのタイムアウト（ミリ秒）                 |
| `--model MODEL`    | AI モデル名（デフォルト: GlobalConfig の `model`）  |
| `--config FILE`    | GlobalConfig ファイルのパス                         |
| `--fail-fast`      | 失敗時に即座に中断する                              |
| `--single-file`    | 分割せず1ファイルとして処理する                     |
| `--dry-run`        | ファイルを書き出さない（AI 分割もスキップされる）   |

上記以外の `--` オプションを渡すと `UnknownOption` エラーで異常終了する。

> **注意**: `--output` / `--chatlogs-dir` というオプションは存在しない。
> それぞれ `--output-dir` / `--input-dir` を使う。

## dry-run の挙動に関する注意

`--dry-run` は「書き出さない」だけでなく、**AI によるセグメント分割そのものをスキップする**。
各ファイルは `<<dry-run>> skipped (no segments returned): <name>` を出力して `skip` に計上され、
分割結果のプレビューは表示されない。

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

サマリーは **stderr** に `::info::` プレフィックス付きで、以下の形式で出力される:

```bash
::info:: Results: success=3, done=0, skip=1, fail=0, error=0
```

`fail > 0` / `error > 0` の場合は続けて `WARNING: N file(s) failed` / `... errored` が出力される。

通知形式:

- 上記5つのカウンタと出力先ディレクトリを報告する
- `fail > 0` の場合は失敗件数を警告として強調表示
- dry-run モードの場合はその旨を明示する

## 入力ディレクトリ

`--input-dir` 未指定時、デフォルトの入力元は `chatlogs/originalLogs/<agent>/<year>/<yearMonth>` である
（`--input-dir` 明示指定時は `originalLogs` を挟まず指定パスをそのまま使う）。

## 出力ディレクトリ構造

出力先ベースは `--output-dir` 未指定時 `chatlogs/normalizelogs/<agent>[/<year>/<yearMonth>]` に解決される
（`agent` / `period` から組み立てられ、`period` 省略時は `<agent>` まで）。

`agent` + `YYYY-MM` を指定した場合:

```bash
chatlogs/normalizelogs/
  └── <agent>/
       └── <year>/
            └── <yearMonth>/
                 └── <project>/
                      └── <baseName>-<XX>-<hash7>.md
```

入力を任意パスで指定した場合（`period` が付かないため `<agent>` まで）:

```bash
chatlogs/normalizelogs/
  └── <agent>/
       └── <project>/
            └── <baseName>-<XX>-<hash7>.md
```

`--output-dir` を指定した場合は、絶対パスならそのまま、相対パスなら `chatlogsDir` からの相対として解決される。

`project` はソースファイルのフロントマターから引き継ぐ。未定義の場合は `misc/` に出力される。

## 関連スキル

- `/export-chatlog` — ChatLog のエクスポート（normalize-chatlog の前工程）
- `/filter-chatlog` — 低価値ChatLogのフィルタリング
- `/classify-chatlogs` — プロジェクト別サブディレクトリへの分類
- `/set-frontmatter` — フロントマター付加
