#!/usr/bin/env bash
# src: .claude/hooks/check-beads-parent.sh
# @(#) : block `bd create` without a parent (see .claude/rules/beads-issue.md)
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

set -u

_cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -n "$_cmd" ] || exit 0

# split on &&, ||, ; and newlines so one guarded create does not cover another
_segments=$(printf '%s' "$_cmd" | sed 's/&&/\n/g; s/||/\n/g; s/;/\n/g')

_bad=''
while IFS= read -r segment; do
  [[ "$segment" =~ (^|[[:space:]])bd[[:space:]]+(create|new)([[:space:]]|$) ]] || continue

  # escape hatch: その segment に BEADS_NO_PARENT=1 を前置したときだけ免除
  [[ "$segment" =~ ^[[:space:]]*BEADS_NO_PARENT=1[[:space:]] ]] && continue

  # batch / preview forms carry their parents elsewhere (or write nothing)
  [[ "$segment" =~ (^|[[:space:]])(--dry-run|--graph|--file|-f)([[:space:]=]|$) ]] && continue
  [[ "$segment" =~ (^|[[:space:]])(-h|--help)([[:space:]]|$) ]] && continue

  [[ "$segment" =~ (^|[[:space:]])(--parent|--external-ref)([[:space:]=]) ]] && continue

  _bad="${_bad}  ${segment#"${segment%%[![:space:]]*}"}"$'\n'
done <<< "$_segments"

[ -n "$_bad" ] || exit 0

cat >&2 <<EOF
beads 起票規約違反: 親の指定がない bd create を止めました (.claude/rules/beads-issue.md)。

${_bad}
すべての beads issue は起票時に親を持つこと。次のいずれかを付けて実行し直す。

  --external-ref gh-<n>   既存の GitHub Issue に対応する作業
  --parent <beads-id>     既存 beads issue を分割した子タスク

どちらも張れない新規ルートは、先に gh issue create で GitHub Issue を立ててから
その番号を --external-ref に張る。親を空のまま起票して後で埋めない。

意図的に親なしで起票する場合のみ BEADS_NO_PARENT=1 を前置する。
EOF
exit 2
