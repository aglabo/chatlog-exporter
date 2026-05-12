---
name: filter-chatlogs
description: >
  エクスポート済みチャットログMarkdownをclaude CLIで一括バッチ判定し、
  再利用価値の低いファイル（DISCARD）を削除する。
  /filter-chatlogs で呼び出す。
  KEEP/DISCARD判定にはclaude CLIを使用するため ANTHROPIC_API_KEY 不要。
argument-hint: "[prefilter|filter] [agent] [YYYY-MM [project]] [--dry-run]"
allowed-tools: Bash, Glob
---

<!-- cspell:words aplys -->

# filter-chatlogs スキル

エクスポート済みチャットログをclaude CLIで品質判定してフィルタリングする。
複数ファイルをチャンク単位（10件）でバッチ判定し、低価値ファイルを削除する。

## 前提条件

- `claude` コマンドがPATHに存在すること（Claude Code CLIインストール済み）
- `deno` コマンドが利用可能であること（TypeScript実行用）

## 引数の処理

`$ARGUMENTS` の先頭トークンでサブコマンドを判定する:

- 先頭トークンが `prefilter` → prefilter モード（残りの引数を prefilter スクリプトに渡す）
- 先頭トークンが `filter` → filter モード（先頭トークンを除いた残りの引数を filter スクリプトに渡す）
- それ以外（サブコマンドなし）→ filter モード（`$ARGUMENTS` 全体を filter スクリプトに渡す）

**filter モードの引数解析**（サブコマンドを除いた残りの引数に適用）:

- 引数なし → `temp/chatlogs/claude/` 全体を処理（デフォルト agent: `claude`）
- `agent`（例: `chatgpt`）→ 指定 agent の全体
- `YYYY-MM`（例: `2026-03`）→ `claude` agent・指定月のみ
- `agent YYYY-MM`（例: `chatgpt 2026-03`）→ 指定 agent・指定月
- `agent YYYY-MM project`（例: `chatgpt 2026-03 aplys`）→ 指定 agent・指定月・プロジェクト
- `--dry-run` → 削除せず判定結果のみ表示

**prefilter モードの引数解析**（`prefilter` トークンを除いた残りの引数に適用）:

- 引数なし → `temp/chatlogs/claude/` 全体を処理
- `agent`（例: `chatgpt`）→ 指定 agent の全体
- `agent YYYY-MM`（例: `chatgpt 2026-03`）→ 指定 agent・指定月
- `--dry-run` → 削除せず、ノイズ候補のパスを標準出力に表示
- `--report` → ノイズ理由付きで報告（`NOISE\t理由\tパス` 形式）

## ステップ1: スクリプトパスの解決

Glob ツールで `**/commands/filter-chatlogs.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR      = <filter-chatlogs.md が存在するディレクトリの絶対パス>
SCRIPT_PATH    = $SKILL_DIR/scripts/filter-chatlogs.ts
PREFILTER_PATH = $SKILL_DIR/scripts/prefilter-chatlogs.ts
INPUT          = <cwd>/temp/chatlogs
```

## ステップ2: スクリプト実行

`$ARGUMENTS` の先頭トークンで分岐する。

### prefilter サブコマンドの場合

先頭トークンが `prefilter` であれば、残りの引数 `$REST_ARGS` を使い以下を実行:

```bash
deno run --allow-read --allow-write "$PREFILTER_PATH" $REST_ARGS --input "$INPUT"
```

引数からオプションを組み立てるルール（`$REST_ARGS` 部分）:

- 引数なし → `deno run --allow-read --allow-write "$PREFILTER_PATH" --input "$INPUT"`
- `agent` のみ → `deno run --allow-read --allow-write "$PREFILTER_PATH" chatgpt --input "$INPUT"`
- `agent YYYY-MM` → `deno run --allow-read --allow-write "$PREFILTER_PATH" chatgpt 2026-03 --input "$INPUT"`
- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--report` を含む → 末尾に `--report` を追加

スクリプトは以下のパターンで即座にノイズ判定し、該当ファイルを削除する（`--dry-run` / `--report` 時は削除しない）:

- ファイル名パターン（say-ok 等）
- Git 操作ログのみの会話
- スキル呼び出し YAML
- 定型 API プロンプト
- スラッシュコマンドのみ
- システムタグのみ
- Assistant 応答が 100 文字未満

### filter サブコマンドまたはサブコマンドなしの場合

先頭トークンが `filter` なら除去し、それ以外（サブコマンドなし）はそのまま `$ARGS` として使用する。
解決した `SCRIPT_PATH` と `INPUT` を使い、Bash で実行する:

```bash
deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" $ARGS --input "$INPUT"
```

引数からオプションを組み立てるルール:

- 引数なし → `deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" --input "$INPUT"`
- `agent` のみ → `deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" chatgpt --input "$INPUT"`
- `YYYY-MM` のみ → `deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" 2026-03 --input "$INPUT"`
- `agent YYYY-MM` → `deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" chatgpt 2026-03 --input "$INPUT"`
- `agent YYYY-MM project` → `deno run --allow-read --allow-run --allow-write "$SCRIPT_PATH" chatgpt 2026-03 aplys --input "$INPUT"`
- `--dry-run` を含む → 末尾に `--dry-run` を追加

スクリプトは以下の基準でKEEP/DISCARDを判定し、DISCARDかつ confidence >= 0.7 のファイルを削除する:

- **KEEP**: 設計判断・アーキテクチャ議論・再利用可能なパターン・新概念を含む
- **DISCARD**: 実行ステータスのみ・再利用不可・文脈依存で汎用性なし

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

**filter モードの通知形式**:

- kept / discarded / skipped / error の件数を報告
- dry-run モードの場合はその旨を明示する
- DISCARDされたファイルのパスと理由を簡潔にまとめる

**prefilter モードの通知形式**:

- noise / keep / error の件数を報告
- dry-run / report モードの場合はその旨を明示する
- ノイズ判定されたファイルのパスと判定理由を簡潔にまとめる
