# CLAUDE.md — chatlog-exporter

## プロジェクト概要

AI エージェント（Claude, ChatGPT 等）のセッション履歴をエクスポート・分類・編集し、Obsidian へのインポート用に整備するツール群。
Claude Code スキルとして実装されており、`/export-chatlog` 等のコマンドで呼び出す。

## 技術スタック

- 言語: TypeScript（Deno ランタイム）
- パッケージ管理: JSR（`@std/yaml`, `@std/assert`, `@std/testing`）
- フォーマッタ: dprint（行幅 120、インデント 2 スペース、LF）
- Git hooks: lefthook（commitlint / betterleaks / secretlint）
- 外部 CLI: claude, codex

## 主要コマンド

```bash
# テスト
deno task test              # 全テスト
deno task test:unit         # ユニットテストのみ
deno task test:module unit <module>  # 特定モジュール

# フォーマット
dprint check                # チェック
dprint fmt                  # 自動修正

# 環境セットアップ
bash scripts/setup-dev-env.sh
```

### deckrd ルール本体の展開

`docs/.deckrd/rules/deckrd-rule-*.md`（共通規約の本体）は git 管理外で、
deckrd プラグインが生成する。クローン直後は存在しないため、Claude Code で
`/deckrd init` を実行して展開する（Phase 0 が既存ファイルを上書きせずコピーする）。
deckrd プラグイン未導入の場合は、まずプラグインを導入する。

## プロジェクト構造

```bash
skills/
├── _cle-libs/          # 共通実装（types/, constants/, libs/）
├── classify-chatlogs/  # プロジェクト別分類
├── export-chatlog/    # ログエクスポート
├── filter-chatlog/    # ノイズフィルタ
├── normalize-chatlog/ # 形式正規化
└── set-frontmatter/   # メタデータ付与
.config/chatlog-exporter/
├── config.yaml         # グローバル設定
├── projects.dic        # プロジェクト分類辞書
├── dics/               # 辞書ファイル（category, tags 等）
└── prompts/            # AI プロンプト
```

## 禁止事項

- `main` への直接 push
- テストなしの新機能追加
- `any` 型の使用
- `_cle-libs/` 配下の型・定数を実装ファイルに直書き
- 依頼範囲を超えたリファクタリング・機能追加

## コーディング規約・ルール

@.claude/CLAUDE.md

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. File issues for remaining work - Create issues for anything that needs follow-up
2. Run quality gates (if code changed) - Tests, linters, builds
3. Update issue status - Close finished work, update in-progress items
4. PUSH TO REMOTE - This is MANDATORY:

   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```

5. Clean up - Clear stashes, prune remote branches
6. Verify - All changes committed AND pushed
7. Hand off - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
