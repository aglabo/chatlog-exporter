---
session_id: a4a84394-6140-4668-b1ed-de0b50d8ffb1
date: 2026-03-11
project: aplys
slug: sharded-questing-starfish
---

<!-- markdownlint-disable no-duplicate-heading -->

# 1 API設計 現在 `aplys <domain>/<target> <action> [files...]` これは 良い設計。 理由 filesystem dispatch と一致 na

## 会話ログ

### User

1 API設計

現在

```bash
aplys <domain>/<target> <action> [files...]
```

これは 良い設計。

理由

filesystem dispatch と一致

namespace 衝突回避

CLI短い

ここは 変更不要。

ただし仕様に 1行追加した方がよい。

domain / target validation
[A-Za-z0-9_-]+

.は禁止。

理由

path traversal
2 exit code

現在

code 意味
0 success
1 lint/test error
2 aplys error
3 invalid argument

これは良い。

ただし 1つ追加した方がよい。

127 = tool not found

理由

shellcheck missing

を区別できる。

3 APLYS_ARGS

issue内では

APLYS_ARGS=("a.sh" "b c.sh")
export APLYS_ARGS

となっている。

これは bash仕様的に正しくない。

配列は export できない。

つまり

subshell

では壊れる。

推奨

APLYS_ARGS_JSON

または

"$@"

直接渡す。

実装は

exec "$script" "$@"

が最も安全。

4 git ls-files

現在

```bash
git ls-files <dir> '*.sh'
```

となっている。

これは git の仕様上 誤動作する可能性がある。

安全な形は

git ls-files -- '*.sh'
git ls-files -- "$dir"/*.sh

または

git ls-files "$dir" | grep '\.shに対応
5 extension mapping

issueには

`<ext>` は target に依存

とあるが

仕様として弱い。

推奨

表を追加する。

例

target extension
shell sh
markdown md
yaml yml
6 APLYS_LIBS

現在

APLYS_LIBS='./_libs'

これは 相対パス問題がある。

推奨

APLYS_LIBS="$APLYS_ROOT/_libs"
7 dispatcher仕様が不足

issueに

aplys/aplys

の仕様がほぼ書かれていない。

最低限これが必要。

dispatcher algorithm
validate domain
validate target
validate action

script="$APLYS_ROOT/$domain/$target/$action"

exec "$script" "$@"
8 XDGディレクトリ

今回の議論では

APLYS_CONFIG_HOME
APLYS_DATA_DIR
APLYS_CACHE_DIR

が決まった。

しかし issue に まだ書かれていない。

追記すべき。

APLYS_CONFIG_HOME=~~/.config/aplys
APLYS_DATA_DIR=~~/.local/share/aplys
APLYS_CACHE_DIR=~/.cache/aplys
9 セキュリティ仕様

issueには 安全仕様がない。

最低限これを書く。

```bash
path validation
^[a-z][a-z0-9_-]*$
dispatcher safety
set -euo pipefail
PATH=/usr/bin:/bin
10 shellcheck runner
```

ここは 非常に良い。

shellcheck -s bash
-S warning
--format=gcc

CIとの相性も良い。

ただし1つだけ追加推奨

--external-sources
11 acceptance criteria

かなり良いが
1つ不足している。

追加

aplys list

のテスト。

12 tasks構造

今

Phase 1
Phase 2

になっている。

ただし OSS issue としては

implementation tasks

が少ない。

追加推奨

dispatcher implementation
validation
error handling
総合評価

設計品質

API設計 A
CLI設計 A
tool runner設計 A
実装仕様 B
安全仕様 C

つまり

設計は非常に良いが
安全仕様と dispatcher仕様が不足している。

修正するとかなり完成度が上がるポイント

以下を issue に追記する。

domain/target validation

dispatcher algorithm

XDG directories

exit code 127

APLYS_ARGS export 問題

git ls-files 修正

これで

OSS公開レベルの仕様になる。

マスターに一つだけ。

この issue を見た限り
aplys は

toolchain API layer

としてかなり良い設計になっている。

ただし 1点だけまだ決まっていない重要仕様がある。

aplys version policyに対応

### Assistant

まず現在のissueとプロジェクト構造を確認します。

### Assistant

調査結果を確認しました。現在のプロジェクトには `aplys` コマンドの実装はなく、これから設計するissueを作成するタスクだと理解しました。

ユーザーのメッセージを整理します：

ユーザーは既存のissue（GitHub上にある）に対して、以下の改善点を追加する提案をしています：

1. domain/target validation (`[A-Za-z0-9_-]+`, `.`禁止)
2. exit code 127 (tool not found)
3. APLYS_ARGS export問題 → `exec "$script" "$@"` に変更
4. `git ls-files` の修正
5. extension mapping 表の追加
6. `APLYS_LIBS` の相対パス問題修正
7. dispatcher仕様の追記
8. XDGディレクトリの追記
9. セキュリティ仕様の追記
10. shellcheck `--external-sources` 追加
11. `aplys list` のテスト追加
12. implementation tasks追加（dispatcher, validation, error handling）
13. **aplys version policy** (最後の重要仕様)

### Assistant

いくつか確認させてください。

### Assistant

ありがとうございます。既存のGitHub Issueを特定するため確認します。

### Assistant

GitHub上の既存issueを確認します。

### Assistant

Issueが存在しないようです。新規作成の可能性を確認します。

### Assistant

GitHubにissueが存在しないことが確認できました。ユーザーが参照している「既存のissue」は別の場所にある可能性があります。

### User

temp\idd\issues\new-20260311-000000-task-aplys-runner-spec.mdがissueの下描きなので、coreを既存と見なし更新する。また、上記の議論全てをissueには書かず、詳細はdocs/specsなどに作成する

### Assistant

了解しました。下書きファイルを確認します。

### Assistant

下書きの内容を把握しました。次に既存のdocsディレクトリ構造を確認します。

### Assistant

全体を把握しました。プランを作成します。

**整理:**

- `temp/idd/issues/new-20260311-000000-task-aplys-runner-spec.md` が既存のissue下書き
- `docs/` ディレクトリは未作成
- ユーザーの指示: issueはコアのみ保持・更新し、詳細仕様は `docs/specs/` 等に分離する
- 追加すべき内容: 12項目の改善点 + version policy

### Assistant

プランを作成します。

### Assistant

プランの概要:

**変更ファイル:**

1. `temp/idd/issues/new-20260311-000000-task-aplys-runner-spec.md` — issueをコア仕様のみに整理・更新
2. `docs/specs/aplys-api-spec.md` — 詳細仕様を新規作成（分離）

**issueの主な更新内容:**

- exit code 127 (tool not found) 追加
- APLYS_ARGS → `exec "$script" "$@"` 方式に変更
- APLYS_LIBS を `$APLYS_ROOT/_libs` に修正
- XDG ディレクトリ変数追加
- `aplys list` テスト追加
- Phase 3 implementation tasks 追加
- version policy への参照追記
- `additional_context` の詳細を docs/specs へ移動

**docs/specs/aplys-api-spec.md の新規内容:**

- dispatcher アルゴリズム
- domain/target validation (`^[a-z][a-z0-9_-]*$`)
- `git ls-files -- '*.sh'` 正しい構文
- extension mapping 表
- セキュリティ仕様
- shellcheck `--external-sources`
- version policy (SemVer、minor=後方互換、Go/Linux kernelスタイル)
