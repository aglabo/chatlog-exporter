---
name: export-chatlogs
description: >
  AIエージェントのセッション履歴をノイズ除外してMarkdownにエクスポートする。
  /export-chatlogs で呼び出す。
  システムログ・短文肯定応答（「y」「はい」「ok」等）・ツール使用記録を除外し、
  指定エージェント・期間・プロジェクトの実質的な会話のみを書き出す。
  対応エージェント: claude, codex, chatgpt（既定は config.yaml の agent、組み込み既定は claude）
argument-hint: "[agent] [YYYY-MM] [--input-dir DIR]"
allowed-tools: Bash, Glob
---

<!-- cspell:words sessionid -->

# export-chatlogs スキル

AI エージェントのセッション履歴をノイズ除外して Markdown にエクスポートする。

## 前提条件

- `deno` コマンドが利用可能であること (TypeScript 実行用)

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → デフォルト agent・全期間
- `agent` (例: `codex`) → 指定 agent・全期間
- `agent YYYY-MM` (例: `codex 2026-03`) → 指定 agent・指定月

> **デフォルト agent**: 位置引数で agent を指定しない場合は `config.yaml` の `agent` が使われる。
> 優先順位は **CLI 引数 > `config.yaml` > 組み込み既定 (`claude`)**。
> 既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する。

位置引数の判定ルール (インデックス固定パターン):

- パターン A: 1つ目がスラッシュを含むパス → 入力ディレクトリ
- パターン B: 1つ目が既知のエージェント (`claude`, `chatgpt`, `codex`) → AGENT。
  2つ目がある場合は `YYYY-MM` 形式が **必須** (違反すると `InvalidPeriodPosition` エラー)
- 上記いずれにも当てはまらない 1つ目の引数 → `UnknownPositional` エラー

> 注意: 期間は `YYYY-MM` 形式のみ受け付ける。
> `YYYY` (年のみ) は agent の後ろに置いてもエラーになる。
> また `YYYY-MM` を単独の位置引数として渡すこともできない (agent と併記する)。

## ステップ1: スクリプトパスの解決

Glob ツールで `**/export-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/export-chatlogs.ts
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で次のように実行する。

```bash
deno run --config ./deno.json --allow-read --allow-write --allow-env "$SCRIPT_PATH" [agent] [period]
```

> `--config ./deno.json` は **Deno の設定ファイル指定**であり、下記オプション表の `--config FILE`
> (GlobalConfig ファイル) とは別物。カレントディレクトリの `deno.json` は、その配下にない
> モジュールの bare specifier には適用されない。User スコープに導入したスキルがこれに当たる。

`--export-dir` は明示指定しない。未指定時は `buildConfig()` が
`<chatlogsDir ?? ./chatlogs>/originalLogs` を出力先として解決する。

### 引数からオプションを組み立てるルール

- 引数なし → `deno run ... "$SCRIPT_PATH"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" codex`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" codex 2026-03`
- `--export-dir DIR` を明示指定したい場合のみ追加する (この場合 `originalLogs` は挟まれず、指定パスがそのまま使われる)

#### 利用可能なオプション一覧

| オプション         | 説明                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `--export-dir DIR` | 出力先ディレクトリを明示指定 (`originalLogs` を挟まない)             |
| `--input-dir DIR`  | 入力ディレクトリ (agent ごとに意味が異なる。下記参照)                |
| `--config FILE`    | GlobalConfig ファイルのパス                                          |
| `--dry-run`        | **未実装**: 解析されるだけで無視され、ファイルは通常どおり生成される |

> `--chatlogs-dir` というオプションは **存在しない** (渡すと `UnknownOption` で異常終了する)。
> 出力先を変えたい場合は `--export-dir`、入力元を変えたい場合は `--input-dir` を使う。
> 格納先の既定値は `config.yaml` の `chatlogsDir` (既定 `./chatlogs`) で設定する。
>
> `--output-dir` / `--model` も解析されるが、このスキルでは使用されず破棄される。

`--input-dir` の意味はエージェントごとに異なる。

- `claude` — Claude プロジェクトのルート (既定 `~/.claude/projects`) を上書きする
- `chatgpt` — エクスポート済み ChatGPT ディレクトリ (**必須**)
- `codex` — 無視される

#### chatgpt エージェントの場合

`chatgpt` が指定された場合、エクスポート済み ChatGPT ディレクトリの指定が **必須**。
未指定の場合はエラーを出力して終了する。

```bash
deno run ... "$SCRIPT_PATH" chatgpt --input-dir "$INPUT_DIR"
deno run ... "$SCRIPT_PATH" chatgpt 2026-03 --input-dir "$INPUT_DIR"
```

> 注意: 入力ディレクトリを位置引数で渡すことはできない。
> `chatgpt /path/to/export` は agent の次が期間形式でないためエラーになり、
> `chatgpt 2026-03 /path/to/export` は3つ目が `--output-dir` として解釈され破棄される。
> 必ず `--input-dir` フラグを使う。

スクリプトは以下を除外してエクスポート:

- システムログ (`isMeta: true` エントリ、AGENTS.md・permissions 等の注入コンテンツ)
- ツール使用・ツール結果エントリ
- スラッシュコマンド (`/clear`、`/help`、`/reset`、`/exit`、`/quit`)
- システムタグで始まるメッセージ (`<system-reminder`、`<command-name`、`<command-message` 等)
- 定型メッセージ (`[Request interrupted`、`Tool loaded.`、`Unknown skill:` 等)
- 短文肯定応答 (20 文字以下で「y」「yes」「はい」「ok」「進めて」等)

また、冒頭 10 行以内に `commit message generator` / `commit-message` を含むセッションは
**セッション単位で丸ごと除外** される。

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

サマリーは **stderr** に `::info::` プレフィックス付きで、次のように出力する。

```bash
::info:: 完了: 12 件処理 (出力: 10 / スキップ: 2 / エラー: 0)
::info:: 出力先: ./chatlogs/originalLogs/claude/
```

出力された個々のファイルパスは **stdout** に出力される。

通知形式:

- 処理件数 (出力 / スキップ / エラー) と出力先ディレクトリ
- 書き出しが 0 件の場合は、その理由と確認方法を案内する

## 出力ディレクトリ構造

```bash
chatlogs/
  └── originalLogs/
       └── <agent>/
            └── YYYY/
                 └── YYYY-MM/
                      └── YYYY-MM-DD-{slug}-{sessionid12}.md
```

プロジェクト別のサブディレクトリはこの段階では作られない
(`project` はフロントマターのフィールドとしてのみ保持される)。
プロジェクト別への振り分けは後工程の `/classify-chatlogs` が行う。

### エージェント別データソース

| agent     | データソース                                                 |
| --------- | ------------------------------------------------------------ |
| `claude`  | `~/.claude/projects/<project>/*.jsonl` (`subagents/` は除外) |
| `codex`   | `~/.codex/sessions/` 配下を再帰探索した `*.jsonl`            |
| `chatgpt` | `<--input-dir で指定したディレクトリ>/conversations-*.json`  |

### 注意: 再エクスポート時のファイル名重複

出力ファイル名 (`{sessionid12}` 部分) は sessionId のハッシュ先頭 12 文字から生成される。
ハッシュ生成規則やファイル名の命名規則が将来変更された場合、旧規則で出力済みの
ファイルは自動的には削除されない。同一セッションが新旧 2つのファイル名で重複して
存在すると、後続の `/filter-chatlog` や `/classify-chatlogs` が同じ会話を
二重処理する可能性がある。

さらに、sessionId が欠落しているレコードは、現在の実装でも **将来の変更を待たずに**
再エクスポートのたびにファイル名が変わる。該当するのは不正な形式の Claude/Codex ログや、
`conversation_id` を持たない ChatGPT の会話。
sessionId 欠落時はランダム値から代替 sessionId を生成する。
そのため同じ会話を再エクスポートする都度、異なるファイル名で出力される。

再エクスポートする際は、出力先ディレクトリ全体ではなく、対象の
`<agent>/<YYYY>/<YYYY-MM>` サブツリーのみを削除してから実行すること。
たとえば `chatlogs/originalLogs/claude/2026/2026-03/` 配下のみを削除する。
他エージェントや他の月、既に分類済みのファイルを巻き込まないようにする。

## 関連スキル

- `/filter-chatlog` — 低価値 ChatLog のフィルタリング (export-chatlogs の後工程)
- `/classify-chatlogs` — プロジェクト別サブディレクトリへの分類
- `/set-frontmatter` — フロントマター付加
