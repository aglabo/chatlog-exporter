# src: ./scripts/__tests__/unit/init-vars.unit.spec.sh
# @(#) : unit spec for init-vars library variable initialization
#        対象: SCRIPT_ROOT / PROJECT_ROOT
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016

Describe 'init-vars.lib.sh'
  # The library guards against double sourcing and reads BASH_SOURCE[1], so each
  # example runs a fresh bash process through a wrapper script instead of Include.
  setup() {
    runner_repo="$(make_fixture_runner_repo "$SHELLSPEC_PROJECT_ROOT")"
    other_repo="$(make_fixture_repo)"
    wrapper="${runner_repo}/runners/wrapper.sh"
    runner_repo_toplevel="$(git -C "$runner_repo" rev-parse --show-toplevel)"
  }

  cleanup() {
    rm -rf "$runner_repo" "$other_repo"
  }

  BeforeEach 'setup'
  AfterEach 'cleanup'

  Describe 'PROJECT_ROOT'
    Describe 'When: 正常系'
      It '[Normal] T-LIB-IV-01: runner を含むリポジトリ内から起動するとそのリポジトリのルートを指す'
        cd "$runner_repo" || return 1
        When run env -u PROJECT_ROOT bash "$wrapper"
        The status should be success
        The line 2 should equal "PROJECT_ROOT=${runner_repo_toplevel}"
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-LIB-IV-02: 無関係な git リポジトリを cwd に絶対パス起動しても runner 側のリポジトリを指す'
        cd "$other_repo" || return 1
        When run env -u PROJECT_ROOT bash "$wrapper"
        The status should be success
        The line 2 should equal "PROJECT_ROOT=${runner_repo_toplevel}"
      End

      It '[Edge] T-LIB-IV-03: 環境変数 PROJECT_ROOT が与えられた場合はそれを優先する'
        cd "$other_repo" || return 1
        When run env PROJECT_ROOT=/preset/project/root bash "$wrapper"
        The status should be success
        The line 2 should equal 'PROJECT_ROOT=/preset/project/root'
      End
    End
  End
End
