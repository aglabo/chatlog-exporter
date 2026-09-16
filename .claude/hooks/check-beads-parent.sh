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
_BS=$'\\'
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
# 同一行に複数の heredoc がありうる。本文は次の改行の後からなので保留キューに積む
_hd_delims=()
_hd_tabs=()

# 終端行の存在検査用の索引。行の内容 -> その内容を持つ最後の行の開始位置。
# `<<` ごとに全走査すると未終端の `<<` が多い入力で O(n^2) になるので、1 度だけ作る
declare -A _line_pos=()
declare -A _line_pos_tab=()
_index_built=0

_build_line_index() {
  [ "$_index_built" -eq 0 ] || return 0
  _index_built=1
  local line detab pos=0 lines=()
  readarray -t lines <<<"$_cmd"
  for line in "${lines[@]}"; do
    detab=${line#"${line%%[!$'\t']*}"}
    [ -z "$line" ] || _line_pos["$line"]=$pos
    [ -z "$detab" ] || _line_pos_tab["$detab"]=$pos
    pos=$((pos + ${#line} + 1))
  done
}

# `<<` の直後から呼ぶ。デリミタ語を読んでキューに積み、_i を語の末尾へ置く。
# 語が識別子でなければ heredoc ではない (算術の左シフト等)。_i を戻して 1 を返す
_push_heredoc() {
  local dash='' delim='' c save=$_i
  _i=$((_i + 2))
  if [ "${_cmd:_i:1}" = '-' ]; then
    dash=1
    _i=$((_i + 1))
  fi
  # デリミタは `<<` / `<<-` に直接続くときだけ読む。空白を挟む形は heredoc とみなさない
  # (算術の左シフト `$(( x << y ))` の誤認を塞ぐ。代償として `cat << EOF` も heredoc 扱いしない)
  if [[ ${_cmd:_i:1} == [' '$'\t'] ]]; then
    _i=$save
    return 1
  fi
  while :; do
    c=${_cmd:_i:1}
    case "$c" in
    '' | ' ' | $'\t' | $'\n' | ';' | '&' | '|' | '<' | '>') break ;;
    # <<'EOF' と <<EOF は同じデリミタ。引用符とエスケープは剥がす
    "'" | '"' | "$_BS") ;;
    *) delim+=$c ;;
    esac
    _i=$((_i + 1))
  done
  if [[ ! $delim =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ ]]; then
    _i=$save
    return 1
  fi
  # 終端行が後方に実在するときだけ heredoc とみなす。無ければ不正入力なので
  # heredoc 扱いをやめ、通常のトークンとして検査させる (算術の左シフト等がここに来る)
  local pos
  _build_line_index
  if [ -z "$dash" ]; then pos=${_line_pos["$delim"]-}; else pos=${_line_pos_tab["$delim"]-}; fi
  if [ -z "$pos" ] || [ "$pos" -lt "$_i" ]; then
    _i=$save
    return 1
  fi
  _hd_delims+=("$delim")
  _hd_tabs+=("$dash")
  _i=$((_i - 1)) # 呼び出し元のループ末尾にある +1 と辻褄を合わせる
  return 0
}

# `#` の上で呼ぶ。行末 (次の改行の直前) まで _i を進め、コメント本文を捨てる。
# 改行自体は呼び出し元の通常処理に任せる (segment 境界と heredoc 本文の発火はそこ)
_skip_comment() {
  local body=${_cmd:_i}
  body=${body%%"$_NL"*}
  _i=$((_i + ${#body} - 1)) # 呼び出し元のループ末尾にある +1 と辻褄を合わせる
}

# 改行でコマンド境界を打った直後に呼ぶ。保留中の heredoc 本文を読み飛ばし、
# _i / _start を終端行の直後へ進める。終端が現れなければ末尾まで本文とみなす
_skip_heredoc_bodies() {
  local pos=$_start k line
  for ((k = 0; k < ${#_hd_delims[@]}; k++)); do
    while [ "$pos" -lt "$_len" ]; do
      line=${_cmd:pos}
      line=${line%%"$_NL"*}
      pos=$((pos + ${#line} + 1))
      # <<- はタブ字下げされた終端を許す
      [ -z "${_hd_tabs[k]}" ] || line=${line#"${line%%[!$'\t']*}"}
      [ "$line" != "${_hd_delims[k]}" ] || break
    done
  done
  _hd_delims=()
  _hd_tabs=()
  [ "$pos" -le "$_len" ] || pos=$_len
  _start=$pos
  _i=$((pos - 1)) # 呼び出し元のループ末尾にある +1 と辻褄を合わせる
}

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
    $'\n')
      [ "$_has" -eq 0 ] || _tokens+=("$_tok")
      _tok=''
      _has=0
      _check_segment "${_cmd:_start:_i-_start}"
      _tokens=()
      _start=$((_i + 1))
      # heredoc 本文が始まるのは改行の後だけ。; や | で発火させてはならない
      [ "${#_hd_delims[@]}" -eq 0 ] || _skip_heredoc_bodies
      ;;
    ';' | '&' | '|')
      [ "$_has" -eq 0 ] || _tokens+=("$_tok")
      _tok=''
      _has=0
      _check_segment "${_cmd:_start:_i-_start}"
      _tokens=()
      _start=$((_i + 1))
      ;;
    '#')
      # コメントは語の開始位置にある `#` だけ。語中の `#` はリテラル
      # (`16#ff` / `${var#pat}` / URL のフラグメント)。
      # _has=0 は「ここから語が始まる」= 入力先頭・空白・タブ・改行・`;`・`&`・`|` の直後
      # と一致する。加えて `\` + 改行で継ぎ足した語の途中 (`echo x\` 改行 `#foo`) では
      # _has=1 が立つのでコメントにならない。bash の規則どおりで、迷う形は検査側に残る。
      # この分岐が `<` より前に来るため、コメント内の `<<` は heredoc として積まれない
      if [ "$_has" -eq 0 ]; then
        _skip_comment
      else
        _tok+=$_c
      fi
      ;;
    '<')
      # herestring <<< は heredoc ではない。`<` 単体は通常のリダイレクト
      if [ "${_cmd:_i+1:2}" = '<<' ]; then
        _i=$((_i + 2))
        _tok+='<<<'
        _has=1
      elif [ "${_cmd:_i+1:1}" = '<' ] && _push_heredoc; then
        : # heredoc としてキューに積んだ。トークンには何も残さない
      else
        _tok+=$_c
        _has=1
      fi
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
