# コーディング規約

`.claude/rules/*.md` は Claude Code が自動で読み込む。以下は依存順を示すための明示 import。

deckrd の共通規約は `rules/deckrd-rules/deckrd-rules-index.md`（常時ロード）の目次から
必要時に Read する。以下の import は chatlog-exporter 固有の差分のみを定める。

ルール本体 `docs/.deckrd/rules/*.md` は git 管理外のため、クローン直後は存在しない。
見つからない場合は `/deckrd init` を実行して展開する。

@rules/coding-guidelines.md
@rules/naming-conventions.md
@rules/bdd-cycle.md
@rules/workflow.md
@rules/directory-structure.md
@rules/command-execute.rules.md

## 必要時に読むルール

常時読み込まない。該当作業に入ったら Read で取得する。

| 作業                     | ルール                              |
| ------------------------ | ----------------------------------- |
| テストコードを書く・直す | `docs/rules/testing-conventions.md` |
