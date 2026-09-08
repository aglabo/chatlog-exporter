#!/usr/bin/env bash
# src: .claude/hooks/__tests__/check-beads-parent.spec.sh
# @(#) : regression tests for check-beads-parent.sh (see .claude/rules/beads-issue.md)
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#
# usage: bash .claude/hooks/__tests__/check-beads-parent.spec.sh
#   exit 0 = all cases passed, exit 1 = at least one case failed

set -u

_hook="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/check-beads-parent.sh"
_tmpdir=$(mktemp -d)
trap 'rm -rf "$_tmpdir"' EXIT

readonly ALLOW=0
readonly BLOCK=2

_passed=0
_failed=0

# $1: expected exit code, $2: actual exit code, $3: case name
_report() {
  if [ "$1" = "$2" ]; then
    _passed=$((_passed + 1))
  else
    _failed=$((_failed + 1))
    printf 'FAIL: %s (expected exit %s, got %s)\n' "$3" "$1" "$2" >&2
  fi
}

# $1: expected exit code, $2: case name, $3: command string
_case() {
  local want=$1 name=$2 cmd=$3 got
  jq -n --arg c "$cmd" '{tool_input: {command: $c}}' | bash "$_hook" >/dev/null 2>&1
  got=$?
  _report "$want" "$got" "$name"
}

# $1: expected exit code, $2: case name, $3: raw stdin payload
_case_raw() {
  local want=$1 name=$2 payload=$3 got
  printf '%s' "$payload" | bash "$_hook" >/dev/null 2>&1
  got=$?
  _report "$want" "$got" "$name"
}

## regression (Codex #1): quoting must not split one command into segments
_case "$ALLOW" 'line continuation keeps --parent in the same segment' \
  $'bd create \\\n  --title x \\\n  --parent cle-x'
_case "$ALLOW" 'line continuation with CRLF line endings' \
  $'bd create \\\r\n  --parent cle-x'
_case "$ALLOW" 'semicolon inside a double-quoted title' \
  'bd create --title "fix a; then b" --parent cle-x'
_case "$ALLOW" 'ampersands inside a single-quoted title' \
  "bd create --title 'a && b' --parent cle-x"
_case "$ALLOW" 'pipes inside a double-quoted description' \
  'bd create -d "a || b" --external-ref gh-1'

## regression (Codex #2): quoted text must not be read as an option
_case "$BLOCK" 'exempt flag named inside a quoted title (--dry-run)' \
  'bd create --title "Document --dry-run output"'
_case "$BLOCK" 'exempt flag named inside a quoted title (--graph)' \
  'bd create --title "Document --graph output"'
_case "$BLOCK" 'exempt flag named inside a quoted title (--file)' \
  'bd create --title "Document --file output"'
_case "$BLOCK" 'exempt flag named inside a quoted title (-f)' \
  'bd create --title "Document -f output"'
_case "$BLOCK" 'parent flag named inside a quoted title' \
  'bd create --title "explain --parent usage"'

## existing behaviour: parent present
_case "$ALLOW" 'parent with a value' 'bd create --parent cle-x'
_case "$ALLOW" 'parent in --parent=value form' 'bd create --parent=cle-x --title x'
_case "$ALLOW" 'external-ref with a value' 'bd create --external-ref gh-1 --title x'
_case "$BLOCK" 'parent flag with no value at end of command' 'bd create --title x --parent'

## existing behaviour: parent missing
_case "$BLOCK" 'title only' 'bd create --title x'
_case "$BLOCK" 'no arguments at all' 'bd create'
_case "$BLOCK" 'new alias without a parent' 'bd new --title x'
_case "$BLOCK" 'subcommand reached over a line continuation' \
  $'bd \\\n  create --title x'
_case "$BLOCK" 'subcommand written in quotes' 'bd "create" --title x'
_case "$ALLOW" 'new alias with a parent' 'bd new --parent cle-x --title x'

## existing behaviour: exemptions
_case "$ALLOW" 'escape hatch prefixed on the segment' 'BEADS_NO_PARENT=1 bd create --title x'
_case "$BLOCK" 'escape hatch does not cover the next segment' \
  'BEADS_NO_PARENT=1 bd create --title x && bd create --title y'
_case "$ALLOW" 'real --dry-run flag' 'bd create --dry-run --title x'
_case "$ALLOW" 'real --graph flag' 'bd create --graph plan.json'
_case "$ALLOW" 'real --file flag' 'bd create --file issues.md'
_case "$ALLOW" 'real -f short flag' 'bd create -f issues.md'
_case "$ALLOW" 'long help flag' 'bd create --help'
_case "$ALLOW" 'short help flag' 'bd create -h'

## existing behaviour: one guarded create does not cover another
_case "$BLOCK" 'second segment after && lacks a parent' \
  'bd create --parent cle-x && bd create --title y'
_case "$BLOCK" 'second segment after ; lacks a parent' \
  'bd create --parent cle-x; bd create --title y'
_case "$BLOCK" 'second segment on a new line lacks a parent' \
  $'bd create --parent cle-x\nbd create --title y'

## separators added by the tokenizer: pipe and background
_case "$ALLOW" 'pipe after a compliant create' 'bd create --parent cle-x | tee log'
_case "$ALLOW" 'create reading from a pipe' 'cat x.md | bd create -f -'
_case "$BLOCK" 'non-compliant create on the right of a pipe' \
  'cat x.md | bd create --title y'

## not a bd create at all
_case "$ALLOW" 'a different bd subcommand' 'bd show cle-x'
_case "$ALLOW" 'the words appear only as quoted prose' \
  'git commit -m "bd create の話"'
_case "$ALLOW" 'empty command' ''
## fail-open: 入力を読めないときに作業を止めてはならない
## jq はパイプの左側なので $? に出ない。空出力を [ -n ] が拾うことがここでの担保
_case_raw "$ALLOW" 'payload without a command key' '{"tool_input": {}}'
_case_raw "$ALLOW" 'payload that is not JSON' 'not json'
_case_raw "$ALLOW" 'empty stdin' ''

_stubdir="${_tmpdir}/stub"
mkdir -p "$_stubdir"
printf '#!/bin/sh\nexit 127\n' > "${_stubdir}/jq"
chmod +x "${_stubdir}/jq"
printf '%s' '{"tool_input": {"command": "bd create --title x"}}' \
  | PATH="${_stubdir}:${PATH}" bash "$_hook" > /dev/null 2>&1
_report "$ALLOW" "$?" 'jq exiting non-zero falls open'

printf '#!/bin/sh\necho boom >&2\nexit 5\n' > "${_stubdir}/jq"
printf '%s' '{"tool_input": {"command": "bd create --title x"}}' \
  | PATH="${_stubdir}:${PATH}" bash "$_hook" > /dev/null 2>&1
_report "$ALLOW" "$?" 'jq writing to stderr falls open'

## known limitation (cle-znk.4): heredoc の本文は 1 行ずつコマンドとして解釈される
_case "$BLOCK" 'heredoc body naming a create is treated as a command' \
  $'cat > note.md <<EOF\nbd create --title x\nEOF'
_case "$BLOCK" 'quoted heredoc body naming a create is treated as a command' \
  $'cat > note.md <<\'EOF\'\nbd create --title x\nEOF'

## malformed input falls to the safe side
_case "$BLOCK" 'unclosed double quote' 'bd create --title "unclosed'
_case "$BLOCK" 'unclosed single quote' "bd create --title 'unclosed"

## the hook must never evaluate the command it inspects
_pwned="${_tmpdir}/pwned"
_case "$BLOCK" 'command substitution is inert' \
  "bd create --title \"\$(touch ${_pwned})\""
if [ -e "$_pwned" ]; then
  _failed=$((_failed + 1))
  printf 'FAIL: command substitution was executed (%s exists)\n' "$_pwned" >&2
else
  _passed=$((_passed + 1))
fi

## performance: the hook runs on every Bash tool call
# built through a file: a 40KB argument exceeds the Windows command-line limit
{
  printf 'bd show cle-x --json # '
  head -c 40000 < /dev/zero | tr '\0' 'x'
} > "${_tmpdir}/big.txt"
jq -n --rawfile c "${_tmpdir}/big.txt" '{tool_input: {command: $c}}' > "${_tmpdir}/big.json"

# the tokenizer itself must stay usable on a large but genuine create
{
  printf 'bd create --parent cle-x --title x # '
  head -c 20000 < /dev/zero | tr '\0' 'x'
} > "${_tmpdir}/big-create.txt"
jq -n --rawfile c "${_tmpdir}/big-create.txt" '{tool_input: {command: $c}}' \
  > "${_tmpdir}/big-create.json"

_start=$SECONDS
bash "$_hook" < "${_tmpdir}/big.json" > /dev/null 2>&1
_report "$ALLOW" "$?" 'large payload skipped by the gate'
bash "$_hook" < "${_tmpdir}/big-create.json" > /dev/null 2>&1
_report "$ALLOW" "$?" 'large payload that reaches the tokenizer'
_elapsed=$((SECONDS - _start))
if [ "$_elapsed" -le 3 ]; then
  _passed=$((_passed + 1))
else
  _failed=$((_failed + 1))
  printf 'FAIL: large payloads took %ss (expected <= 3s)\n' "$_elapsed" >&2
fi

printf '\n%s passed, %s failed\n' "$_passed" "$_failed"
[ "$_failed" -eq 0 ]
