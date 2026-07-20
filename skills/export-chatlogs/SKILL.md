---
name: export-chatlogs
description: >
  AIエージェントのセッション履歴をノイズ除外してMarkdownにエクスポートする。
  /export-chatlogs で呼び出す。
  システムログ・短文肯定応答（「y」「はい」「ok」等）・ツール使用記録を除外し、
  指定エージェント・期間・プロジェクトの実質的な会話のみを書き出す。
  対応エージェント: claude（デフォルト）, codex, chatgpt
argument-hint: "[agent] [YYYY-MM|YYYY] [inputPath]"
allowed-tools: Bash, Glob
---

<!-- cspell:words sessionid -->

# export-chatlogs スキル

AIエージェントのセッション履歴をノイズ除外して Markdown にエクスポートする。

## 前提条件

- `deno` コマンドが利用可能であること（TypeScript実行用）

## 引数の処理

`$ARGUMENTS` を解析し、以下のルールで引数を処理:

- 引数なし → `claude` agent・全期間
- `agent`（例: `codex`）→ 指定 agent・全期間
- `YYYY-MM`（例: `2026-03`）→ `claude` agent・指定月
- `YYYY`（例: `2026`）→ `claude` agent・指定年
- `agent YYYY-MM`（例: `codex 2026-03`）→ 指定 agent・指定月

引数の判定ルール:

- `YYYY-MM` パターン（`^[0-9]{4}-[0-9]{2}$`）→ YEAR_MONTH
- `YYYY` パターン（`^[0-9]{4}$`）→ YEAR
- 既知の agent リスト（`claude`, `codex`, `chatgpt`）→ AGENT
- `\` → `/` 正規化後に `/` を含む文字列 → INPUT_PATH（`chatgpt` 専用の入力ディレクトリ）

## ステップ1: スクリプトパスの解決

Glob ツールで `**/commands/export-chatlogs.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR   = <export-chatlogs.md が存在するディレクトリの絶対パス>
SCRIPT_PATH = $SKILL_DIR/scripts/export-chatlogs.ts
```

## ステップ2: スクリプト実行

解決した `SCRIPT_PATH` を使い、Bash で実行する:

```bash
deno run --allow-read --allow-write --allow-env "$SCRIPT_PATH" [agent] [period]
```

`--export-dir` は明示指定しない。未指定時は `buildConfig()` が
`<chatlogsDir ?? ./chatlogs>/originalLogs` を出力先として解決する。

### 引数からオプションを組み立てるルール

- 引数なし → `deno run ... "$SCRIPT_PATH"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" codex`
- `YYYY-MM` のみ → `deno run ... "$SCRIPT_PATH" 2026-03`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" codex 2026-03`
- `chatlogsDir` 指定時 → `deno run ... "$SCRIPT_PATH" --chatlogs-dir "$CHATLOGS_DIR"`
- dry-run 確認時 → `deno run ... "$SCRIPT_PATH" --dry-run`（※現状 `main()` 側で書き込みスキップは未実装のため、実際にはファイルが生成される点に注意）
- `--export-dir DIR` を明示指定したい場合のみ追加する（この場合 `originalLogs` は挟まれず、指定パスがそのまま使われる）

#### その他の利用可能なオプション

以下のオプションもそのまま渡せる（`$ARGUMENTS` の位置引数ルールとは独立したフラグ）:

- `--input-dir DIR` — 入力ディレクトリ（chatgpt エージェントの位置引数と同義）
- `--chatlogs-dir DIR` — チャットログ格納ディレクトリ
- `--export-dir DIR` — 出力先ディレクトリを明示指定（`originalLogs` を挟まない）
- `--dry-run` — dry-run モード（**現状未実装**: フラグは解析されるが、書き込みスキップの動作は行われない）

#### chatgpt エージェントの場合

`chatgpt` が指定された場合、エクスポート済み ChatGPT ディレクトリを **位置引数**（`inputPath`）で指定する（**必須**）。
`\` は `/` に自動正規化されるため Windows パスもそのまま渡せる。
未指定の場合はエラーを出力して終了する。

- `chatgpt /path/to/export` → `deno run ... "$SCRIPT_PATH" chatgpt "$INPUT_DIR"`
- `chatgpt 2026-03 /path/to/export` → `deno run ... "$SCRIPT_PATH" chatgpt 2026-03 "$INPUT_DIR"`
- `chatgpt /path/to/export 2026-03` → 順番を逆にしても同様に動作する

フラグ形式（`--input-dir DIR`）も引き続き使用可能。

スクリプトは以下を除外してエクスポート:

- システムログ（`isMeta: true` エントリ、AGENTS.md・permissions等の注入コンテンツ）
- ツール使用・ツール結果エントリ
- スラッシュコマンド（`/clear`、`/help`、`/reset`、`/exit`、`/quit`）
- システムタグで始まるメッセージ（`<system-reminder` 等）
- 短文肯定応答（20 文字以下で「y」「yes」「はい」「ok」「進めて」等）

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

通知形式:

- 書き出したファイル数と出力先ディレクトリ
- 書き出しが 0 件の場合は、その理由と確認方法を案内する

## 出力ディレクトリ構造

```bash
chatlogs/
  └── originalLogs/
       └── <agent>/
            └── YYYY/
                 └── YYYY-MM/
                      └── <project>/
                           └── YYYY-MM-DD-{slug}-{sessionid8}.md
```

### エージェント別データソース

| agent     | データソース                                              |
| --------- | --------------------------------------------------------- |
| `claude`  | `~/.claude/projects/*/**.jsonl`                           |
| `codex`   | `~/.codex/sessions/YYYY/MM/DD/*.jsonl`                    |
| `chatgpt` | `<inputPath で指定したディレクトリ>/conversations-*.json` |

### 注意: 再エクスポート時のファイル名重複

出力ファイル名（`{sessionid8}` 部分）は sessionId のハッシュから生成される。
ハッシュ生成規則やファイル名の命名規則が将来変更された場合、旧規則で出力済みの
ファイルは自動的には削除されない。同一セッションが新旧2つのファイル名で重複して
存在すると、後続の `/filter-chatlog` や `/classify-chatlogs` が同じ会話を
二重処理する可能性がある。

さらに、sessionId が欠落しているレコード（不正な形式の Claude/Codex ログや、
`conversation_id` を持たない ChatGPT の会話）は、現在の実装でも**将来の変更を待たずに**
再エクスポートのたびにファイル名が変わる。sessionId 欠落時はランダム値から
代替 sessionId を生成するため、同じ会話を再エクスポートする都度、異なるファイル名で
出力される。

再エクスポートする際は、出力先ディレクトリ全体ではなく、対象の
`<agent>/<YYYY>/<YYYY-MM>` サブツリーのみを削除してから実行すること
（例: `chatlogs/originalLogs/claude/2026/2026-03/` 配下のみ削除し、他エージェントや
他の月、既に分類済みのファイルを巻き込まないようにする）。

## 関連スキル

- `/filter-chatlog` — 低価値ChatLogのフィルタリング（export-chatlogs の後工程）
- `/classify-chatlogs` — プロジェクト別サブディレクトリへの分類
- `/set-frontmatter` — フロントマター付加
