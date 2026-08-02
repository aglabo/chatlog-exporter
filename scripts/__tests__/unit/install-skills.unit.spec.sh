# src: ./scripts/__tests__/unit/install-skills.unit.spec.sh
# @(#) : Unit tests for scripts/install-skills.sh
#        対象: parse_args / is_correct_symlink / remove_destination /
#              install_symlink / resolve_repo_root / run_install / usage
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

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

  Describe 'parse_args'
    Describe 'When: 正常系'
      It '[Normal] T-IS-PA-01: 引数なし → 空文字列'
        When call parse_args
        The output should equal ''
        The status should be success
      End

      It '[Normal] T-IS-PA-05: --help → help'
        When call parse_args --help
        The output should equal 'help'
        The status should be success
      End

      It '[Normal] T-IS-PA-06: --force 単独 → force'
        When call parse_args --force
        The output should equal 'force'
        The status should be success
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-IS-PA-07: 未知のオプション → エラー'
        When call parse_args --bogus
        The status should be failure
        The stderr should include 'unknown option: --bogus'
      End

      It '[Error] T-IS-PA-08: 位置引数 → エラー'
        When call parse_args somearg
        The status should be failure
        The stderr should include 'unknown option: somearg'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-IS-PA-10: --help は他オプションより優先される'
        When call parse_args --force --help
        The output should equal 'help'
        The status should be success
      End
    End
  End

  Describe 'is_correct_symlink'
    Describe 'When: 正常系'
      It '[Normal] T-IS-CS-01: ../skills を指す symlink → true'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s ../skills "$dest"'
        When call is_correct_symlink "$dest"
        The status should be success
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-IS-CS-02: 存在しないパス → false'
        When call is_correct_symlink "${dest}/missing"
        The status should be failure
      End

      It '[Error] T-IS-CS-03: 通常ディレクトリ → false'
        BeforeCall 'mkdir -p "$dest"'
        When call is_correct_symlink "$dest"
        The status should be failure
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-IS-CS-04: リンク先が異なる symlink → false'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s "$src" "$dest"'
        When call is_correct_symlink "$dest"
        The status should be failure
      End
    End
  End

  Describe 'remove_destination'
    Describe 'When: 正常系'
      It '[Normal] T-IS-RD-01: ディレクトリを削除する'
        BeforeCall 'mkdir -p "$dest"'
        When call remove_destination "$dest"
        The status should be success
        The path "$dest" should not be exist
      End

      It '[Normal] T-IS-RD-02: 存在しないパスでも成功する'
        When call remove_destination "${dest}/missing"
        The status should be success
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-IS-RD-03: symlink を消してもリンク先は残る'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s ../skills "$dest"'
        When call remove_destination "$dest"
        The status should be success
        The path "$dest" should not be exist
        The path "${src}/export-chatlogs/SKILL.md" should be exist
      End
    End
  End

  Describe 'install_symlink'
    Describe 'When: 正常系'
      It '[Normal] T-IS-IL-07: 既に正しいリンクがあり force なしなら ln を呼ばず早期 return する'
        # 実 symlink を作らずに「既にリンク済み」状態を再現するため判定関数ごと差し替える。
        # ln 呼び出しの有無はフラグファイルの生成で観測する。
        is_correct_symlink() { return 0; }
        ln() {
          touch "${repo}/ln_called"
          return 0
        }
        When call install_symlink "$dest" ''
        The status should be success
        The output should include 'already linked'
        The path "${repo}/ln_called" should not be exist
      End

    End

    Describe 'When: エッジケース'
      It '[Edge] T-IS-IL-08: force なら既に正しいリンクでも早期 return せず ln を呼ぶ'
        # ln をモックすると実リンクが生まれないため、実装の [[ -L ]] 検査は必ず失敗する。
        # ここで確認したいのは force が早期 return を飛ばして ln に到達することであり、
        # 失敗ステータスはモック環境の必然的な帰結。
        is_correct_symlink() { return 0; }
        ln() {
          touch "${repo}/ln_called"
          return 0
        }
        When call install_symlink "$dest" force
        The status should be failure
        The output should not include 'already linked'
        The path "${repo}/ln_called" should be exist
        The stderr should include 'could not create a symbolic link'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-IS-IL-05: lnがコピーになる環境では中間物を残さず失敗する'
        # ln をコピーする偽物に差し替え、Git Bash の既定挙動を再現する
        ln() {
          local target="${*: -1}"
          cp -r "$src" "$target"
          return 0
        }
        When call install_symlink "$dest" ''
        The status should be failure
        The stderr should include 'could not create a symbolic link'
        The stderr should include 'Developer Mode'
        The path "$dest" should not be exist
      End
    End
  End

  Describe 'resolve_repo_root'
    Describe 'When: 正常系'
      It '[Normal] T-IS-RR-01: サブディレクトリからでもリポジトリルートを返す'
        # cd 先に依存せず同じルートを返すことが、どこから実行しても動く根拠になる。
        # git は Windows で W:/Temp 形式、pwd は /w/temp 形式を返すため、
        # 文字列ではなく skills/ の実在で同一ディレクトリかを判定する。
        resolve_from_skills() {
          cd "${repo}/skills" || return 1
          local root
          root="$(resolve_repo_root)" || return 1
          [[ -f "${root}/skills/export-chatlogs/SKILL.md" ]] || return 1
          echo "ok"
        }
        When call resolve_from_skills
        The status should be success
        The output should equal 'ok'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-IS-RR-02: git 管理外では失敗する'
        cd_into_tmp() { cd "$(mktemp -d)" || return 1; }
        BeforeCall 'cd_into_tmp'
        When call resolve_repo_root
        The status should be failure
        The stderr should be present
      End
    End
  End

  Describe 'run_install'
    Describe 'When: 正常系'
      It '[Normal] T-IS-RI-01: force なしでインストールする'
        Skip if 'symlinks unsupported' no_symlink_support
        When call run_install "$repo" ''
        The status should be success
        The output should include 'Linked'
        The path "${dest}/export-chatlogs/SKILL.md" should be exist
      End

      It '[Normal] T-IS-RI-02: force は既存リンクを張り直す'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'MSYS=winsymlinks:nativestrict ln -s ../skills "$dest"'
        When call run_install "$repo" force
        The status should be success
        The output should include 'Linked'
        The value "$(readlink "$dest")" should equal '../skills'
      End

      It '[Normal] T-IS-RI-03: .claude が無くても親ディレクトリを作る'
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'rm -rf "${repo}/.claude"'
        When call run_install "$repo" ''
        The status should be success
        The output should include 'Linked'
        The path "${dest}/export-chatlogs/SKILL.md" should be exist
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-IS-RI-04: skills が存在しない → エラー'
        # src はテストから渡せないため、fixture の skills を消して不在状態を作る。
        BeforeCall 'rm -rf "$src"'
        When call run_install "$repo" ''
        The status should be failure
        The stderr should include 'skills directory not found'
      End
    End
  End

  Describe 'usage'
    Describe 'When: 正常系'
      It '[Normal] T-IS-US-01: 全オプションを表示する'
        When call usage
        The status should be success
        The output should include '--force'
        The output should include '--help'
      End
    End
  End
End
