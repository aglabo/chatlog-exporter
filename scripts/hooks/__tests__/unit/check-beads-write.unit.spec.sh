# src: ./scripts/hooks/__tests__/unit/check-beads-write.unit.spec.sh
# @(#) : unit spec for check-beads-write hook  (see .claude/rules/beads-workflow.md)
#        対象: .claude/hooks/check-beads-write.sh
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

Describe 'check-beads-write.sh'
  # Internal Helpers
  # フック本体は Include せず、別プロセスで実行する。
  hook="${SHELLSPEC_PROJECT_ROOT}/.claude/hooks/check-beads-write.sh"

  # $1: フックへ渡す file_path。フックの exit code をそのまま返す。
  # フックは違反時に stderr へ長文のガイドを書くため、--warning-as-failure 下で
  # 未検証の出力を残さないよう、ここで stdout / stderr をともに捨てる。
  run_hook() {
    jq -n --arg p "$1" '{tool_input: {file_path: $p}}' | bash "$hook" >/dev/null 2>&1
  }

  # $1: 生の stdin ペイロード（不正 JSON 用）。出力の扱いは run_hook と同じ。
  run_hook_raw() {
    printf '%s' "$1" | bash "$hook" >/dev/null 2>&1
  }

  # $1: file_path。エスケープハッチをフックのプロセスにだけ渡す。
  # spec 全体の環境を汚染して他ケースを無効化しないため export は使わない。
  run_hook_allowed() {
    jq -n --arg p "$1" '{tool_input: {file_path: $p}}' |
      env BEADS_ALLOW_WRITE=1 bash "$hook" >/dev/null 2>&1
  }

  Describe 'bd 管理ファイルへの書き込み'
    Describe 'When: 異常系'
      It '[Error] T-HK-CBW-01: issues.jsonl への書き込みは止める'
        When call run_hook '.beads/issues.jsonl'
        The status should equal 2
      End

      It '[Error] T-HK-CBW-02: metadata.json への書き込みは止める'
        When call run_hook '.beads/metadata.json'
        The status should equal 2
      End

      It '[Error] T-HK-CBW-03: backup/ 配下の同名 config.yaml は bd 生成物として止める'
        When call run_hook '.beads/backup/config.yaml'
        The status should equal 2
      End

      It '[Error] T-HK-CBW-04: 絶対パスで与えられても止める'
        When call run_hook 'C:/Users/atsushifx/workspaces/develop/chatlog-exporter/.beads/issues.jsonl'
        The status should equal 2
      End

      It '[Error] T-HK-CBW-05: Windows のバックスラッシュ区切りでも止める'
        When call run_hook 'C:\Users\atsushifx\workspaces\develop\chatlog-exporter\.beads\issues.jsonl'
        The status should equal 2
      End
    End
  End

  Describe '人間が編集してよい 3 ファイル'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBW-06: config.yaml は通す'
        When call run_hook '.beads/config.yaml'
        The status should equal 0
      End

      It '[Normal] T-HK-CBW-07: README.md は通す'
        When call run_hook '.beads/README.md'
        The status should equal 0
      End

      It '[Normal] T-HK-CBW-08: .gitignore は通す'
        When call run_hook '.beads/.gitignore'
        The status should equal 0
      End
    End
  End

  Describe '.beads に似た無関係パス'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBW-09: セグメント末尾が .beads のディレクトリは対象外'
        When call run_hook 'docs/my.beads/x.md'
        The status should equal 0
      End

      It '[Normal] T-HK-CBW-10: 先頭セグメントが foo.beads でも対象外'
        When call run_hook 'foo.beads/y'
        The status should equal 0
      End

      It '[Normal] T-HK-CBW-11: .beads を含まない通常のパスは対象外'
        When call run_hook 'skills/export-chatlogs/index.ts'
        The status should equal 0
      End
    End
  End

  Describe 'fail-open: 入力を読めないとき'
    Describe 'When: エッジケース'
      It '[Edge] T-HK-CBW-12: 空オブジェクトのペイロードは作業を止めない'
        When call run_hook_raw '{}'
        The status should equal 0
      End

      It '[Edge] T-HK-CBW-13: file_path キーの無いペイロードは作業を止めない'
        When call run_hook_raw '{"tool_input": {}}'
        The status should equal 0
      End

      It '[Edge] T-HK-CBW-14: JSON でないペイロードは作業を止めない'
        When call run_hook_raw 'not json'
        The status should equal 0
      End
    End
  End

  Describe '免除（エスケープハッチ）'
    Describe 'When: 正常系'
      It '[Normal] T-HK-CBW-15: BEADS_ALLOW_WRITE=1 なら bd 管理ファイルでも通す'
        When call run_hook_allowed '.beads/issues.jsonl'
        The status should equal 0
      End
    End
  End
End
