#!/usr/bin/env bash
# src: .claude/hooks/check-beads-parent.sh
# @(#) : block `bd create` without a parent (see .claude/rules/beads-issue.md)
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

set -u

# Windows 版 jq は改行を CRLF で書き出す。行継続と区切りの判定が壊れるので CR を落とす
_cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null | tr -d '\r')
[ -n "$_cmd" ] || exit 0

# このフックは Bash ツール呼び出しのたびに走る。走査に入る前に安価に振り落とす。
# 語の並びは見ない。引用符や行継続を挟んだ形を取りこぼさないため、部分一致だけで判定する
case "$_cmd" in
  *bd*) ;;
  *) exit 0 ;;
esac
case "$_cmd" in
  *create* | *new*) ;;
  *) exit 0 ;;
esac

# 巨大な入力は走査コストが跳ねる。jq 失敗時と同じく素通しする
[ "${#_cmd}" -le 32768 ] || exit 0

_NL=$'\n'
_BS='\'
_bad=''
_tokens=()

# $1: 元テキスト。_tokens を 1 コマンドとして判定し、違反なら _bad に積む
_check_segment() {
  local raw=$1 n=${#_tokens[@]} k=-1 i t

  for ((i = 0; i + 1 < n; i++)); do
    if [ "${_tokens[i]}" = 'bd' ] && [[ ${_tokens[i + 1]} == @(create|new) ]]; then
      k=$i
      break
    fi
  done
  [ "$k" -ge 0 ] || return 0

  # escape hatch: その segment に BEADS_NO_PARENT=1 を前置したときだけ免除
  for ((i = 0; i < k; i++)); do
    [ "${_tokens[i]}" = 'BEADS_NO_PARENT=1' ] && return 0
  done

  # 引数のみを見る。引用符の中身はトークン化済みなのでフラグと誤認しない
  for ((i = k + 2; i < n; i++)); do
    t=${_tokens[i]%%=*}
    case "$t" in
      # batch / preview forms carry their parents elsewhere (or write nothing)
      --dry-run | --graph | --file | -f | -h | --help) return 0 ;;
      --parent | --external-ref)
        # --parent=x なら値を持つ。素の --parent は後続トークンが値
        if [ "${_tokens[i]}" != "$t" ] || [ $((i + 1)) -lt "$n" ]; then
          return 0
        fi
        ;;
    esac
  done

  _bad="${_bad}  ${raw#"${raw%%[![:space:]]*}"}"$'\n'
}

# シェルの引用符・行継続を解釈して _cmd をトークン列とコマンド境界に分解する
_i=0
_len=${#_cmd}
_start=0
_quote=''
_tok=''
_has=0

while [ "$_i" -lt "$_len" ]; do
  _c=${_cmd:_i:1}

  if [ "$_quote" = "'" ]; then
    if [ "$_c" = "'" ]; then _quote=''; else _tok+=$_c; fi
  elif [ "$_quote" = '"' ]; then
    if [ "$_c" = '"' ]; then
      _quote=''
    elif [ "$_c" = "$_BS" ]; then
      # 簡略化: "..." 内の \ は常に次の 1 文字をリテラル化する
      _i=$((_i + 1))
      _tok+=${_cmd:_i:1}
    else
      _tok+=$_c
    fi
  elif [ "$_c" = "$_BS" ]; then
    # \ + 改行は行継続。トークンを閉じずに読み飛ばす
    _i=$((_i + 1))
    _n=${_cmd:_i:1}
    if [ -n "$_n" ] && [ "$_n" != "$_NL" ]; then
      _tok+=$_n
      _has=1
    fi
  else
    case "$_c" in
      "'" | '"')
        _quote=$_c
        _has=1
        ;;
      ' ' | $'\t')
        [ "$_has" -eq 0 ] || _tokens+=("$_tok")
        _tok=''
        _has=0
        ;;
      $'\n' | ';' | '&' | '|')
        [ "$_has" -eq 0 ] || _tokens+=("$_tok")
        _tok=''
        _has=0
        _check_segment "${_cmd:_start:_i - _start}"
        _tokens=()
        _start=$((_i + 1))
        ;;
      *)
        _tok+=$_c
        _has=1
        ;;
    esac
  fi

  _i=$((_i + 1))
done

[ "$_has" -eq 0 ] || _tokens+=("$_tok")
_check_segment "${_cmd:_start}"

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
