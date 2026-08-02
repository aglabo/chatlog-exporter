# src: ./scripts/__tests__/system/install-skills.system.spec.sh
# @(#) : System tests for scripts/install-skills.sh
#        対象: install_symlink
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2034

Describe 'install-skills.sh'
  Include scripts/install-skills.sh

  setup() {
    repo="$(make_fixture_repo)"
    dest="${repo}/.claude/skills"
    src="${repo}/skills"
  }

  cleanup() {
    rm -rf "$repo"
  }

  BeforeEach 'setup'
  AfterEach 'cleanup'

  Describe 'install_symlink'
    Describe 'When: 正常系'
      It '[Normal] T-IS-IL-01: 相対 symlink を作成する'
        Skip if 'symlinks unsupported' no_symlink_support
        When call install_symlink "$dest" ''
        The status should be success
        The output should include 'Linked'
        The value "$(readlink "$dest")" should equal '../skills'
        # 作成したリンクが実際に機能することを、リンク経由の実ファイル到達で確かめる
        The path "${dest}/export-chatlogs/SKILL.md" should be exist
      End

      It '[Normal] T-IS-IL-02: 既にリンク済みなら作り直さない'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s ../skills "$dest"'
        When call install_symlink "$dest" ''
        The status should be success
        The output should include 'already linked'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-IS-IL-03: リンク先が違う symlink は張り直す'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s "$src" "$dest"'
        When call install_symlink "$dest" ''
        The status should be success
        The output should include 'Linked'
        The value "$(readlink "$dest")" should equal '../skills'
      End

      It '[Edge] T-IS-IL-04: 既存の通常ディレクトリを symlink に置き換える'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'mkdir -p "$dest"; echo junk >"${dest}/junk.md"'
        When call install_symlink "$dest" ''
        The status should be success
        The output should include 'Linked'
        The value "$(readlink "$dest")" should equal '../skills'
      End

      It '[Edge] T-IS-IL-06: force は既に正しいリンクでも張り直す'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s ../skills "$dest"'
        When call install_symlink "$dest" force
        The status should be success
        The output should include 'Linked'
        The value "$(readlink "$dest")" should equal '../skills'
      End
    End
  End
End
