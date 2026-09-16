# src: ./scripts/hooks/__tests__/unit/check-beads-parent.unit.spec.sh
# @(#) : unit spec for check-beads-parent hook  (see .claude/rules/beads-issue.md)
#        対象: .claude/hooks/check-beads-parent.sh
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

Describe 'check-beads-parent.sh'
  # Internal Helpers
  # フック本体は Include せず、別プロセスで実行する。
  hook="${SHELLSPEC_PROJECT_ROOT}/.claude/hooks/check-beads-parent.sh"

  # $1: フックへ渡すコマンド文字列。フックの exit code をそのまま返す。
  # フックは違反時に stderr へ長文のガイドを書くため、--warning-as-failure 下で
  # 未検証の出力を残さないよう、ここで stdout / stderr をともに捨てる。
  run_hook() {
    jq -n --arg c "$1" '{tool_input: {command: $c}}' | bash "$hook" >/dev/null 2>&1
  }

  # $1: 生の stdin ペイロード（不正 JSON 用）。出力の扱いは run_hook と同じ。
  run_hook_raw() {
    printf '%s' "$1" | bash "$hook" >/dev/null 2>&1
  }

  Describe '引用符・行継続による segment 分割'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-01: 行継続をまたいでも --parent は同じ segment に残る'
        When call run_hook $'bd create \\\n  --title x \\\n  --parent cle-x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-02: CRLF 改行の行継続でも --parent は同じ segment に残る'
        When call run_hook $'bd create \\\r\n  --parent cle-x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-03: ダブルクォート内のセミコロンは segment を分割しない'
        When call run_hook 'bd create --title "fix a; then b" --parent cle-x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-04: シングルクォート内の && は segment を分割しない'
        When call run_hook "bd create --title 'a && b' --parent cle-x"
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-05: ダブルクォート内の || は segment を分割しない'
        When call run_hook 'bd create -d "a || b" --external-ref gh-1'
        The status should equal 0
      End
    End
  End

  Describe '引用符内の文字列のオプション誤認'
    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-06: title 内の --dry-run は免除フラグとみなさない'
        When call run_hook 'bd create --title "Document --dry-run output"'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-07: title 内の --graph は免除フラグとみなさない'
        When call run_hook 'bd create --title "Document --graph output"'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-08: title 内の --file は免除フラグとみなさない'
        When call run_hook 'bd create --title "Document --file output"'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-09: title 内の -f は免除フラグとみなさない'
        When call run_hook 'bd create --title "Document -f output"'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-10: title 内の --parent は親指定とみなさない'
        When call run_hook 'bd create --title "explain --parent usage"'
        The status should equal 2
      End
    End
  End

  Describe 'parent の指定がある場合'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-11: --parent に値があれば許可する'
        When call run_hook 'bd create --parent cle-x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-12: --parent=value 形式でも許可する'
        When call run_hook 'bd create --parent=cle-x --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-13: --external-ref に値があれば許可する'
        When call run_hook 'bd create --external-ref gh-1 --title x'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-14: 末尾の値なし --parent は親指定とみなさない'
        When call run_hook 'bd create --title x --parent'
        The status should equal 2
      End
    End
  End

  Describe 'parent の指定がない場合'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-20: new エイリアスでも親があれば許可する'
        When call run_hook 'bd new --parent cle-x --title x'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-15: title のみの起票は止める'
        When call run_hook 'bd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-16: 引数なしの起票は止める'
        When call run_hook 'bd create'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-17: new エイリアスでも親がなければ止める'
        When call run_hook 'bd new --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-18: 行継続をまたいだサブコマンドでも親がなければ止める'
        When call run_hook $'bd \\\n  create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-19: 引用符で書かれたサブコマンドでも親がなければ止める'
        When call run_hook 'bd "create" --title x'
        The status should equal 2
      End
    End
  End

  Describe '免除（エスケープハッチと実フラグ）'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-21: segment 先頭のエスケープハッチは免除する'
        When call run_hook 'BEADS_NO_PARENT=1 bd create --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-23: 実フラグの --dry-run は免除する'
        When call run_hook 'bd create --dry-run --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-24: 実フラグの --graph は免除する'
        When call run_hook 'bd create --graph plan.json'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-25: 実フラグの --file は免除する'
        When call run_hook 'bd create --file issues.md'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-26: 実フラグの -f は免除する'
        When call run_hook 'bd create -f issues.md'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-27: --help は免除する'
        When call run_hook 'bd create --help'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-28: -h は免除する'
        When call run_hook 'bd create -h'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-22: エスケープハッチは次の segment を免除しない'
        When call run_hook 'BEADS_NO_PARENT=1 bd create --title x && bd create --title y'
        The status should equal 2
      End
    End
  End

  Describe '1 つの適合 create が別の create を免除しないこと'
    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-29: && の後ろの segment に親が無ければ止める'
        When call run_hook 'bd create --parent cle-x && bd create --title y'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-30: ; の後ろの segment に親が無ければ止める'
        When call run_hook 'bd create --parent cle-x; bd create --title y'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-31: 改行後の segment に親が無ければ止める'
        When call run_hook $'bd create --parent cle-x\nbd create --title y'
        The status should equal 2
      End
    End
  End

  Describe 'パイプによる segment 分割'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-32: 適合 create の後ろのパイプは免除する'
        When call run_hook 'bd create --parent cle-x | tee log'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-33: パイプから読み込む create は免除する'
        When call run_hook 'cat x.md | bd create -f -'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-34: パイプ右側の非適合 create は止める'
        When call run_hook 'cat x.md | bd create --title y'
        The status should equal 2
      End
    End
  End

  Describe 'bd create ではないコマンド'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-35: 別の bd サブコマンドは対象外'
        When call run_hook 'bd show cle-x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-36: 引用符内の文言としてのみ現れる場合は対象外'
        When call run_hook 'git commit -m "bd create の話"'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-37: 空のコマンドは対象外'
        When call run_hook ''
        The status should equal 0
      End
    End
  End

  Describe 'fail-open: 入力を読めないとき'
    Describe 'When: エッジケース'
      It '[Edge] T-HK-CBP-38: command キーの無いペイロードは作業を止めない'
        When call run_hook_raw '{"tool_input": {}}'
        The status should equal 0
      End

      It '[Edge] T-HK-CBP-39: JSON でないペイロードは作業を止めない'
        When call run_hook_raw 'not json'
        The status should equal 0
      End

      It '[Edge] T-HK-CBP-40: 空の stdin は作業を止めない'
        When call run_hook_raw ''
        The status should equal 0
      End
    End
  End

  Describe 'fail-open: jq が壊れているとき'
    stubdir=''

    setup() {
      stubdir="$(mktemp -d)"
    }

    cleanup() {
      rm -rf "$stubdir"
    }

    BeforeEach 'setup'
    AfterEach 'cleanup'

    # $@: jq スタブ本体の各行（shebang は自動で付与する）。
    # 親の無い create を与えるため、jq が正常なら BLOCK される入力になる。
    run_hook_with_jq_stub() {
      {
        echo '#!/bin/sh'
        printf '%s\n' "$@"
      } >"${stubdir}/jq"
      chmod +x "${stubdir}/jq"
      printf '%s' '{"tool_input": {"command": "bd create --title x"}}' |
        PATH="${stubdir}:${PATH}" bash "$hook" >/dev/null 2>&1
    }

    Describe 'When: エッジケース'
      It '[Edge] T-HK-CBP-41: jq が非ゼロ終了しても作業を止めない'
        When call run_hook_with_jq_stub 'exit 127'
        The status should equal 0
      End

      It '[Edge] T-HK-CBP-42: jq が stderr へ書いても作業を止めない'
        When call run_hook_with_jq_stub 'echo boom >&2' 'exit 5'
        The status should equal 0
      End
    End
  End

  Describe 'heredoc 本文はコマンドとして解釈しない (cle-znk.4)'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-43: heredoc 本文の create はコマンドとして扱わない'
        When call run_hook $'cat > note.md <<EOF\nbd create --title x\nEOF'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-44: 引用符付き heredoc 本文の create もコマンドとして扱わない'
        When call run_hook $'cat > note.md <<\'EOF\'\nbd create --title x\nEOF'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-50: <<- のタブ字下げ終端でも本文を読み飛ばす'
        When call run_hook $'cat > note.md <<-EOF\nbd create --title x\n\tEOF'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-55: 同一行の 2 つの heredoc は両方の本文を読み飛ばす'
        When call run_hook $'cat <<A <<B\nbd create --title x\nA\nbd create --title y\nB'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-51: 終端の現れない heredoc は heredoc とみなさず本文側の create を検出する'
        When call run_hook $'cat > note.md <<EOF\nbd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-52: heredoc 終端より後ろの親なし create は止める'
        When call run_hook $'cat > note.md <<EOF\nbd create --title x\nEOF\nbd create --title y'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-53: heredoc を伴う行そのものの親なし create は止める'
        When call run_hook $'bd create --title x <<EOF\nbody\nEOF'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-54: herestring は heredoc とみなさず次行の create を検出する'
        When call run_hook $'bd show x <<< y\nbd create --title z'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-56: 算術左シフトを heredoc と誤認せず次行の create を検出する'
        When call run_hook $'echo $((1 << 3))\nbd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-57: 変数を使った左シフトでも次行の create を検出する'
        When call run_hook $'n=$((x << y))\nbd create --title z'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-58: 空白を挟んだ左シフトでも次行の create を検出する'
        When call run_hook $'n=$(( x << y ))\nbd create --title z'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-59: 左シフトの右オペランドと同名の行が後続しても create を検出する'
        When call run_hook $'n=$(( x << y ))\nbd create --title z\ny'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-60: $ の無い算術コマンドの左シフトでも create を検出する'
        When call run_hook $'(( x << y ))\nbd create --title z\ny'
        The status should equal 2
      End

      # 意図的な仕様: `<<` の直後に空白がある形は heredoc とみなさない。
      # 算術の左シフトを heredoc と誤認して本文側の create を素通しするより、
      # 誤ってブロックする方が害が小さいため。回避策は `<<EOF` と空白を詰めること。
      It '[Error] T-HK-CBP-61: 空白を挟む heredoc は heredoc と認識しない (意図的な仕様。回避策は <<EOF と詰めること)'
        When call run_hook $'cat << EOF\nbd create --title x\nEOF'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-62: 空白で囲まれた herestring を heredoc と誤認せず次行の create を検出する'
        When call run_hook $'grep x <<< y\nbd create --title z\ny'
        The status should equal 2
      End
    End
  End

  Describe '不正な入力は安全側に倒す'
    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-45: 閉じていないダブルクォートは止める'
        When call run_hook 'bd create --title "unclosed'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-46: 閉じていないシングルクォートは止める'
        When call run_hook "bd create --title 'unclosed"
        The status should equal 2
      End
    End
  End

  Describe 'フックは検査対象のコマンドを評価しない'
    tmpdir=''

    setup() {
      tmpdir="$(mktemp -d)"
    }

    cleanup() {
      rm -rf "$tmpdir"
    }

    BeforeEach 'setup'
    AfterEach 'cleanup'

    Describe 'When: 異常系'
      # 副作用が起きていないことの確認は、同じ It の 2 つ目のアサーションとして置く。
      # 別の It に分けると BeforeEach が作り直した無関係な一時ディレクトリを見ることになり、
      # 恒久的に vacuous pass になる。
      It '[Error] T-HK-CBP-47: コマンド置換は展開されない'
        When call run_hook "bd create --title \"\$(touch ${tmpdir}/pwned)\""
        The status should equal 2
        The path "${tmpdir}/pwned" should not exist
      End
    End
  End

  # 性能: フックは Bash ツール呼び出しのたびに走る。
  # 移植元にあった「経過 3 秒以内」の壁時計アサーションは移植しない。
  # .shellspec が --jobs 4 と --fail-fast=1 を持つため負荷次第で flake し、
  # 1 件の失敗が suite 全体を止めてしまうため。
  Describe '性能: 巨大な payload'
    tmpdir=''

    setup() {
      tmpdir="$(mktemp -d)"
    }

    cleanup() {
      rm -rf "$tmpdir"
    }

    BeforeEach 'setup'
    AfterEach 'cleanup'

    # $1: コマンドの先頭部分, $2: 末尾に付ける 'x' の文字数。
    # 40KB の引数を直接コマンドラインに置くと Windows の上限を超えるため、
    # payload は一時ファイル経由で組み立てて stdin へ流す。
    run_hook_large() {
      {
        printf '%s' "$1"
        head -c "$2" </dev/zero | tr '\0' 'x'
      } >"${tmpdir}/big.txt"
      jq -n --rawfile c "${tmpdir}/big.txt" '{tool_input: {command: $c}}' |
        bash "$hook" >/dev/null 2>&1
    }

    Describe 'When: エッジケース'
      It '[Edge] T-HK-CBP-48: ゲートで弾かれる巨大 payload は作業を止めない'
        When call run_hook_large 'bd show cle-x --json # ' 40000
        The status should equal 0
      End

      It '[Edge] T-HK-CBP-49: トークナイザまで到達する巨大 payload も作業を止めない'
        When call run_hook_large 'bd create --parent cle-x --title x # ' 20000
        The status should equal 0
      End
    End
  End

  Describe '# コメントの扱い'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBP-63: 行末コメント内の create は検査しない'
        When call run_hook 'echo ok # bd create --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-64: 単独行コメント内の create も検査しない'
        When call run_hook $'# bd create --title x\necho ok'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-65: ; の直後から始まるコメントも検査しない'
        When call run_hook 'echo ok ;# bd create --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-66: タブ区切りのコメントも検査しない'
        When call run_hook $'echo ok\t# bd create --title x'
        The status should equal 0
      End

      It '[Normal] T-HK-CBP-67: 親ありの create に行末コメントが付いても通す'
        When call run_hook 'bd create --parent cle-x --title y # note'
        The status should equal 0
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-HK-CBP-68: コメント内の heredoc トークンでは後続の create を素通しさせない'
        When call run_hook $'echo ok # <<true\nbd create --title x\ntrue'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-69: 算術の基数記法はコメントとみなさず create を検出する'
        When call run_hook 'echo $((16#ff)); bd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-70: ${#v} の # はコメントとみなさず create を検出する'
        When call run_hook 'v=abc; echo ${#v}; bd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-71: 語中の # はコメントとみなさず create を検出する'
        When call run_hook $'echo a#b\nbd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-72: ダブルクォート内の # はコメントとみなさず create を検出する'
        When call run_hook 'echo "#"; bd create --title x'
        The status should equal 2
      End

      It '[Error] T-HK-CBP-73: シングルクォート内の # はコメントとみなさず create を検出する'
        When call run_hook "echo '#'; bd create --title x"
        The status should equal 2
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-HK-CBP-74: コメント内の BEADS_NO_PARENT=1 では免除しない'
        When call run_hook 'bd create --title x # BEADS_NO_PARENT=1'
        The status should equal 2
      End

      It '[Edge] T-HK-CBP-75: 内容の無いコメントが付いても create を検出する'
        When call run_hook 'bd create --title x #'
        The status should equal 2
      End

      It '[Edge] T-HK-CBP-76: heredoc 本文中の # 行は heredoc の終端判定に影響しない'
        When call run_hook $'cat <<EOF\n# <<X\nEOF\nbd create --title y'
        The status should equal 2
      End
    End
  End
End
