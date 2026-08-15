---
name: filter-chatlogs
description: >
  エクスポート済みチャットログMarkdownをclaude CLIで一括バッチ判定し、
  再利用価値の低いファイル（DISCARD）を削除する。
  /filter-chatlogs で呼び出す。
  KEEP/DISCARD判定にはclaude CLIを使用するため ANTHROPIC_API_KEY 不要。
argument-hint: "[noise-filter|filter] [agent] [YYYY-MM] [--dry-run] [--single-file]"
allowed-tools: Bash, Glob
---

<!-- cspell:words aplys -->

# filter-chatlogs スキル

エクスポート済みチャットログを claude CLI で品質判定してフィルタリングする。
複数ファイルをチャンク単位 (10 件) でバッチ判定し、低価値ファイルを削除する。

## 前提条件

- `claude` コマンドが PATH に存在すること (Claude Code CLI インストール済み)
- `deno` コマンドが利用可能であること (TypeScript 実行用)

## 引数の処理

`$ARGUMENTS` の先頭トークンでサブコマンドを判定する。

- 先頭トークンが `noise-filter` → noise-filter モード (残りの引数を noise-filter スクリプトに渡す)
- 先頭トークンが `filter` → filter モード (先頭トークンを除いた残りの引数を filter スクリプトに渡す)
- それ以外 (サブコマンドなし) → filter モード (`$ARGUMENTS` 全体を filter スクリプトに渡す)

**filter モードの引数解析** (サブコマンドを除いた残りの引数に適用):

- 引数なし → `chatlogs/originalLogs/<デフォルト agent>/` 全体を処理。
  デフォルト agent は `config.yaml` の `agent` で決まる。
  優先順位は **CLI 引数 > `config.yaml` > 組み込み既定 (`claude`)**。
  既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する
- `agent` (例: `chatgpt`) → 指定 agent の全体
- `agent YYYY-MM` (例: `chatgpt 2026-03`) → 指定 agent・指定月
- `--dry-run` → 削除せず対象ファイルを一覧表示 (判定は行わない。後述の注意を参照)
- `--single-file` → 1 ファイルずつ判定 (chunkSize を 1 に固定)

**noise-filter モードの引数解析** (`noise-filter` トークンを除いた残りの引数に適用):

- 引数なし → `chatlogs/originalLogs/claude/` 全体を処理
- `agent` (例: `chatgpt`) → 指定 agent の全体
- `agent YYYY-MM` (例: `chatgpt 2026-03`) → 指定 agent・指定月
- `path` (例: `chatlogs/originalLogs/claude/2026/2026-04`) → 指定パスをそのまま渡す (agent/period の代わり)
- `--dry-run` → 削除せず、ノイズ候補のパスと判定理由をログ出力

位置引数の判定ルール (インデックス固定パターン):

- パターン A: 1つ目がスラッシュを含むパス → 入力ディレクトリ
- パターン B: 1つ目が既知のエージェント (`claude`, `chatgpt`, `codex`) → AGENT。
  2つ目がある場合は `YYYY-MM` 形式が **必須**
- 上記いずれにも当てはまらない 1つ目の引数 → `UnknownPositional` エラー

> 注意: `YYYY-MM` を単独の位置引数として渡すことはできない (`不明な引数` エラーになる)。
> また、プロジェクト名を3つ目の位置引数として渡すこともできない
> (`InvalidDirectoryFormat` エラーになる)。プロジェクト単位の指定はサポートしていない。

## ステップ1: スクリプトパスの解決

Glob ツールで `**/filter-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR         = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH       = $SKILL_DIR/scripts/filter-chatlogs.ts
NOISE_FILTER_PATH = $SKILL_DIR/scripts/noise-filter-chatlogs.ts
```

## ステップ2: スクリプト実行

`$ARGUMENTS` の先頭トークンで分岐する。

### noise-filter サブコマンドの場合

先頭トークンが `noise-filter` であれば、残りの引数 `$REST_ARGS` をそのまま渡す。

```bash
deno run --allow-read --allow-write "$NOISE_FILTER_PATH" $REST_ARGS
```

引数からオプションを組み立てるルール (`--input` は **追加しない**):

<!-- textlint-disable ja-technical-writing/sentence-length -->

- 引数なし → `deno run --allow-read --allow-write "$NOISE_FILTER_PATH"`
- `agent` のみ → `deno run --allow-read --allow-write "$NOISE_FILTER_PATH" chatgpt`
- `agent YYYY-MM` → `deno run --allow-read --allow-write "$NOISE_FILTER_PATH" chatgpt 2026-03`
- `path` (パス区切り含む) → `deno run --allow-read --allow-write "$NOISE_FILTER_PATH" chatlogs/originalLogs/claude/2026/2026-04`
- `--dry-run` を含む → 末尾に `--dry-run` を追加

<!-- textlint-enable ja-technical-writing/sentence-length -->

スクリプトは事前フィルタ (prefilter) を実行したうえで、以下のパターンで即座にノイズ判定し、
該当ファイルを削除する (`--dry-run` 時は削除しない):

- ファイル名パターン (say-ok 等)
- Git 操作ログのみの会話
- スキル呼び出し YAML
- 定型 API プロンプト
- スラッシュコマンドのみ
- システムタグのみ
- 本文が `minCharCount` (既定 1000) 文字未満
- user ターンが 1つのとき assistant 応答が `minAssistantChars` (既定 300) 文字未満

このモードは AI を呼び出さないため `--allow-run` は不要。

### filter サブコマンドまたはサブコマンドなしの場合

先頭トークンが `filter` なら除去し、それ以外 (サブコマンドなし) はそのまま `$ARGS` として使用する。
解決した `SCRIPT_PATH` を使い、Bash で実行する (`--input` は **追加しない**)。
`ChatlogCache` の初期化で `TEMP` 環境変数を参照するため `--allow-env` が必須:

```bash
deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" $ARGS
```

引数からオプションを組み立てるルール:

<!-- textlint-disable ja-technical-writing/sentence-length -->

- 引数なし → `deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH"`
- `agent` のみ → `deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" chatgpt`
- `agent YYYY-MM` → `deno run --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" chatgpt 2026-03`
- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--single-file` を含む → 末尾に `--single-file` を追加

<!-- textlint-enable ja-technical-writing/sentence-length -->

スクリプトは次の順で処理する。

1. prefilter (AI なし) — 以下に該当するファイルを AI 呼び出し前に削除する
   - ファイル名パターン / 空の本文 / `minCharCount` (既定 1000) 文字未満の本文
   - user ターンなし / システムタグのみの user メッセージ
   - user ターンが 1つのとき assistant 応答が `minAssistantChars` (既定 300) 文字未満
2. AI 判定 — 残りを claude CLI でチャンク単位にバッチ判定する
   - KEEP: 設計判断・アーキテクチャ議論・再利用可能なパターン・新概念を含む
   - DISCARD: 実行ステータスのみ・再利用不可・文脈依存で汎用性なし
   - DISCARD かつ confidence >= `discardThreshold` (既定 0.7、`config.yaml` で変更可) → 削除対象として記録
   - DISCARD だが confidence が閾値未満 → 判定を保留し、次回実行時に再判定する
3. sweep (削除) — 記録済みの DISCARD ファイルを実際に削除する

> 判定結果は永続キャッシュに保存されるため、再実行時は判定済みファイルの AI 呼び出しがスキップされる。
> 削除は「記録 → 一括削除」の2段階であり、前回実行で DISCARD 判定されたファイルも今回の削除対象になる。

## dry-run の挙動に関する注意

filter モードの `--dry-run` は、**claude CLI を呼び出さず対象ファイルを一覧表示するだけ**。

- KEEP / DISCARD の判定は行われない (`judged=0`)
- 対象ファイルはすべて `skip` に計上される

判定結果を事前に確認する用途には使えない点に注意する。

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

サマリーは `::info::` プレフィックス付きで stderr に出力される。

**filter モードの通知形式**:

```bash
::info:: 完了: total=50 keep=42 skip=3 remove=5 error=0
```

- 上記 5つのカウンタ (total / keep / skip / remove / error) を報告する
- 削除件数は `remove` である (`discarded` というキーは出力されない)
- dry-run モードの場合は `完了 (dry-run): ...` となり、その旨を明示する
- 削除されたファイルのパスは `DISCARD: <path>` として **stdout** に出力される

**noise-filter モードの通知形式**:

```bash
::info:: 完了: keep=1743 skip=0 remove=12 error=0
```

- 上記 4つのカウンタ (keep / skip / remove / error) を報告する (`total` は出力されない)
- dry-run モードの場合はその旨を明示する
- ノイズ判定されたファイルのパスと判定理由を簡潔にまとめる
