#!/usr/bin/env bash
# src: .claude/hooks/check-beads-write.sh
# @(#) : block Write/Edit into bd-managed files under .beads/ (see .claude/rules/beads-workflow.md)
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

set -u

# escape hatch: BEADS_ALLOW_WRITE=1 を環境に置いてから Claude Code を起動する
[ "${BEADS_ALLOW_WRITE:-}" = "1" ] && exit 0

_path=$(jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -n "$_path" ] || exit 0

# Windows のバックスラッシュ区切りを / に正規化する
_path=$(printf '%s' "$_path" | tr '\134' '/')

# セグメント境界で .beads/ にアンカーする（foo.beads/ や docs/my.beads/ を拾わない）
case "$_path" in
  .beads/*) _rel="${_path#.beads/}" ;;
  */.beads/*) _rel="${_path#*/.beads/}" ;;
  *) exit 0 ;;
esac

# 人間が編集してよいのはこの 3 つだけ。完全一致で判定する
# （.beads/backup/config.yaml は bd 生成物なので通さない）
case "$_rel" in
  config.yaml | README.md | .gitignore) exit 0 ;;
esac

cat >&2 <<EOF
beads 管理ファイルへの直接書き込みを止めました (.claude/rules/beads-workflow.md)。

  .beads/${_rel}

.beads/ 配下は bd が管理する。issues.jsonl は embedded Dolt DB のエクスポートで
あり、手で編集しても次の bd export / flush で上書きされて失われる。
metadata.json / embeddeddolt/ / *.jsonl も同様に bd 生成物。

issue を変えたいときは bd コマンドを使う。

  bd create --parent <id>    新規起票（親は必須）
  bd update <id> ...         状態・フィールドの更新
  bd note <id> ...           進捗・判断・検証結果の記録
  bd close <id>              完了

手で編集してよいのは .beads/config.yaml / README.md / .gitignore のみ。

意図的に bd 管理ファイルを書き換える場合のみ、環境変数 BEADS_ALLOW_WRITE=1 を
設定した状態で Claude Code を起動し直す。
EOF
exit 2
