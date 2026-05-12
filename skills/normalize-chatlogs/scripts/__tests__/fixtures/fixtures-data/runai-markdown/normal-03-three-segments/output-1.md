# 1 API設計

## Summary

ユーザーがaplysコマンドのAPI設計（ドメイン・バリデーション、exit code、APLYS_ARGS、git ls-files、extension mapping、APLYS_LIBS、dispatcher仕様、XDGディレクトリ、セキュリティ仕様、shellcheck、acceptance criteria、tasks構造）についてレビューし、改善点を列挙した。

## Excerpt

### User

1 API設計

現在

aplys <domain>/<target> <action> [files...]

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

git ls-files <dir> '*.sh'

となっている。

これは git の仕様上 誤動作する可能性がある。

安全な形は

git ls-files -- '*.sh'
git ls-files -- "$dir"/*.sh

または

git ls-files "$dir" | grep '\.shに対応
5 extension mapping

issueには

<ext> は target に依存

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

aplyss/aplys

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

path validation
^[a-z][a-z0-9_-]*$
dispatcher safety
set -euo pipefail
PATH=/usr/bin:/bin
10 shellcheck runner

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
