---
name: classify-chatlogs
description: >
  チャットログをプロジェクト別サブディレクトリに分類する。
  /classify-chatlogs で呼び出す。
  Claude CLI でファイルのメタデータを解析し、プロジェクト名を推定してサブディレクトリに移動。
  フロントマターに project フィールドを付加する。
argument-hint: "[agent] [YYYY-MM] [--period YYYY-MM] [--input-dir DIR] [--model MODEL] [--dry-run]"
allowed-tools: Bash, Glob
---

# classify-chatlogs スキル

`chatlogs/originalLogs/<agent>/` 配下のフラットなチャットログをプロジェクト別サブディレクトリに分類する。
`.config/chatlog-exporter/dics/projects.dic` の辞書を参照してプロジェクトを選定する。

## 前提条件

- `claude` コマンドが PATH に存在すること (Claude Code CLI インストール済み)
  - AI 呼び出しは CLI 経由のため `ANTHROPIC_API_KEY` は不要
- `deno` コマンドが利用可能であること (TypeScript 実行用)
- `.config/chatlog-exporter/dics/projects.dic` にプロジェクトが定義されていること
  - 形式は **YAML**。トップレベルのキーがプロジェクト名になり、値に `def` / `category` / `desc` / `rules` を持つ
  - AI に渡されるのは **キー (プロジェクト名) のみ**
  - `misc` は辞書に未定義でも自動的に候補へ追加される

## 引数の処理

`$ARGUMENTS` を解析し、次のルールで引数を処理する。

- 引数なし → デフォルト agent の全期間を処理。
  デフォルト agent は `config.yaml` の `agent` で決まる。
  優先順位は **CLI 引数 > `config.yaml` > 組み込み既定 (`claude`)**。
  既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する
- `agent` (例: `claude`) → 指定 agent の全期間
- `agent YYYY-MM` (例: `claude 2026-04`) → 指定 agent・指定月
- `--period YYYY-MM` → 期間のみを指定 (agent 省略時はデフォルト agent)
- `--dry-run` → ファイルを移動しない (後述の注意を参照)
- `--input-dir DIR` → 走査対象ディレクトリを直接指定 (agent / period を無視)

位置引数の判定ルール (インデックス固定パターン):

- パターン A: 1つ目がスラッシュを含むパス → 入力ディレクトリ (`--input-dir` 相当)
- パターン B: 1つ目が既知のエージェント (`claude`, `chatgpt`, `codex`) → AGENT。
  2つ目がある場合は `YYYY-MM` 形式が **必須** (違反すると `InvalidPeriodPosition` エラー)
- 上記いずれにも当てはまらない 1つ目の引数 → `UnknownPositional` エラー

> 注意: `YYYY-MM` を単独の位置引数として渡すことはできない (エラーになる)。
> 期間だけを指定したい場合は `--period 2026-04` を使う。

## ステップ1: スクリプトパスの解決

Glob ツールで `**/classify-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/classify-chatlogs.ts
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で次のように実行する。

```bash
deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]
```

> `--config ./deno.json` は **Deno の設定ファイル指定**であり、下記オプション表の `--config FILE`
> (GlobalConfig ファイル) とは別物。カレントディレクトリの `deno.json` は、その配下にない
> モジュールの bare specifier には適用されない。User スコープに導入したスキルがこれに当たる。

### 引数からオプションを組み立てるルール

- 引数なし → `deno run ... "$SCRIPT_PATH"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" claude`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" claude 2026-04`
- `YYYY-MM` のみ → `deno run ... "$SCRIPT_PATH" --period 2026-04` (位置引数では渡せない)
- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--input-dir DIR` を含む → `--input-dir "$DIR"` を追加 (省略時は GlobalConfig の `chatlogsDir` から解決)

スクリプトは次の処理を行う。

1. 対象ディレクトリ直下 (**深さ1のみ**) の `.md` ファイルを収集し、フロントマターを読み込む
2. 判定結果キャッシュ (`${TEMP}/cle-cache`) で判定済み・未判定に分割する
3. AI なし事前分類 — 次のいずれかに該当するファイルは AI を呼ばずに確定させる
   - フロントマターに `project:` が既にある → その値で移動
   - メタ情報 (title / category / topics / tags) がなく、全文が 50 文字未満 → `misc` に移動
     (`[skip-ai: too-short]` を警告出力)
4. AI 分類 — 残ったファイルの title / category / topics / tags を `projects.dic` の候補とともに
   AI へ渡す。そのうえで最適なプロジェクトを判定する (`chunkSize` 件ずつ `concurrency` 並列)。
   判定できなかったファイルは `misc` にフォールバックする
5. 移動 — プロジェクト別サブディレクトリを作成し、フロントマターに `project:` を付加して書き出す。
   元ファイルは削除される (rename ではなく新規書き出し + 削除)

> 判定結果はキャッシュに保存されるため、再実行時は判定済みファイルの AI 呼び出しがスキップされる。
> また走査はフラットなので、既に分類済みの `misc/` などのサブディレクトリは再走査されない。

## ステップ3: 結果通知

スクリプト完了後、出力のサマリー行を読んでユーザーに結果を通知する。

サマリーは **stderr** に `::info::` プレフィックス付きで、次のように出力する。

```bash
::info:: 完了: moved=3 movedByAI=5 error=0 remaining=0 skip=0
```

dry-run の場合は `完了 (dry-run): ...` となる。各カウンタの意味:

| カウンタ    | 意味                                                        |
| ----------- | ----------------------------------------------------------- |
| `moved`     | AI を呼ばずに移動した件数 (`project:` 設定済み + too-short) |
| `movedByAI` | AI 判定を経て移動した件数                                   |
| `error`     | 読み込み・移動に失敗した件数                                |
| `remaining` | AI 処理が必要なままスキップされた件数                       |
| `skip`      | dry-run のため AI 呼び出しをスキップした件数                |

通知形式:

- 上記 5つのカウンタを報告する
- dry-run モードの場合はその旨を明示する
- 移動されたファイルの分類先プロジェクトを簡潔にまとめる

## dry-run の挙動に関する注意

`--dry-run` は単に「移動しない」だけでなく、**AI 分類そのものをスキップする**。

- AI 未判定のファイルには project が設定されないため、分類先は表示されない
- それらは `remaining` に計上される
- 事前分類 (`project:` 設定済み・too-short) で project が確定したファイルは移動されず、
  `<<dry-run>> move skipped: <file>` を出力して `skip` に計上される

分類結果を事前に確認する用途には使えない点に注意する。

## 分類後のディレクトリ構造

```bash
chatlogs/originalLogs/claude/2026/2026-04/
  ├── chatlog-exporter/
  │   └── 2026-04-08-classify実装.md
  ├── dev-tooling/
  │   └── 2026-04-13-cSpell辞書設定.md
  └── misc/
      └── 2026-04-10-未分類ログ.md
```

サブディレクトリは走査対象ディレクトリ直下に作成される。

## 付加されるフロントマター

`project:` フィールドが次のように追加される。

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

| オプション         | 説明                                                   |
| ------------------ | ------------------------------------------------------ |
| `--period YYYY-MM` | 対象期間 (`YYYY-MM` 形式のみ。`YYYY` 単体は不可)       |
| `--input-dir DIR`  | 走査対象ディレクトリを直接指定 (agent / period を無視) |
| `--model MODEL`    | AI モデル名 (デフォルト: GlobalConfig の `model`)      |
| `--config FILE`    | GlobalConfig ファイルのパス                            |
| `--dry-run`        | ファイルを移動しない (AI 分類もスキップされる)         |

`--no-dry-run` のようなフラグ否定形、および `--option=value` 形式も利用できる。
上記以外の `--` オプションを渡すと `UnknownOption` エラーで異常終了する。

> `--output-dir` も引数としては解釈されるが、classify では移動先が走査対象ディレクトリに固定されるため効果がない。

## 辞書ファイル

<!-- textlint-disable ja-technical-writing/sentence-length -->

- `.config/chatlog-exporter/dics/projects.dic`: プロジェクト名の選択肢 (GlobalConfig の `dicsDir` 配下。`projectsDic` 明示指定で変更可能)
  - 相対パス指定時は `.config/chatlog-exporter/` からの相対として解決される。絶対パスはそのまま使われる

<!-- textlint-enable ja-technical-writing/sentence-length -->

## 関連スキル

- `/export-chatlogs` — ChatLog のエクスポート
- `/filter-chatlogs` — 低価値 ChatLog のフィルタリング
- `/set-frontmatter` — フロントマター付加 (classify-chatlogs の後工程として推奨)
