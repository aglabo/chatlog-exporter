# src: ./scripts/__tests__/integration/setup-chatlogs.integration.spec.sh
# @(#) : Integration tests for skills/setup-chatlogs/scripts/setup-chatlogs.sh
#        対象: main
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

Describe 'setup-chatlogs.sh'
  Include skills/setup-chatlogs/scripts/setup-chatlogs.sh

  Describe 'main'
    # ガードは main が実行する。判定材料は共有ライブラリの実際の配置先
    # （resolve_skills_dir 基準の _cle-libs/__tests__）であり、実行ディレクトリ
    # ではない。壊れるのは配置先だけなので、見張る先もそこに合わせる。
    #
    # スキルは User スコープに、展開先は別ディレクトリという配置を使う。
    # skills ディレクトリ（<home>/.claude/skills）と実行ディレクトリ基準の
    # <cwd>/.claude/skills が食い違うため、「どちらを見張っているか」を
    # 判別できる唯一の形になる。判定材料は実行ディレクトリ側にだけ置き、
    # それが誤検知を生まないことを確かめる。
    #
    # resolve_skill_root / resolve_skills_dir は BASH_SOURCE 基準で実チェックアウトを
    # 指すため、フィクスチャを返すよう上書きする。上書きしないと通過ケースが
    # 本物の skills/ へ展開してしまう。関数の上書きはプロセス全体に効くため、
    # このファイルは main の検証だけを持つ。
    main_setup() {
      home="$(make_fixture_user_scope_home)"
      project="$(mktemp -d)"
    }

    main_cleanup() {
      rm -rf "$home" "$project"
    }

    BeforeEach 'main_setup'
    AfterEach 'main_cleanup'

    resolve_skill_root() { echo "${home}/.claude/skills/setup-chatlogs"; }
    resolve_skills_dir() { echo "${home}/.claude/skills"; }

    ##
    # @description Run main from inside the fixture project directory
    #
    # Subshell so the cd never leaks into later examples, whose fixtures are
    # removed in cleanup.
    #
    # @arg $@ string Command line options forwarded to main
    run_main_in_project() {
      (cd "$project" && main "$@")
    }

    Describe 'When: 正常系'
      It '[Normal] T-SC-MN-01: force なしなら判定材料があっても配置する'
        # ガードは --force 時のみ働く。判定材料があっても素通しすることの保証。
        BeforeCall 'mkdir -p "${project}/.claude/skills/_cle-libs/__tests__"'
        When call run_main_in_project
        The status should be success
        The output should include 'Copied'
        The path "${project}/deno.json" should be exist
      End

      It '[Normal] T-SC-MN-02: 実行ディレクトリ側の __tests__ は --force を止めない'
        # 配置先は <home>/.claude/skills/_cle-libs で __tests__ を持たないため、
        # 失うものは無い。実行ディレクトリ側の判定材料に反応すると、無関係な
        # ディレクトリで起動しただけで正規の再展開が止まる誤検知になる。
        BeforeCall 'mkdir -p "${project}/.claude/skills/_cle-libs/__tests__"'
        When call run_main_in_project --force
        The status should be success
        The output should include 'Copied'
        The path "${project}/deno.json" should be exist
      End
    End
  End

  Describe 'main（開発ツリーのスクリプトを別ディレクトリから実行）'
    # 共有ライブラリの配置先は resolve_skills_dir が BASH_SOURCE から決めるため、
    # どこで起動しても開発チェックアウトの skills/ を指す。一方ガードの判定材料を
    # 実行ディレクトリ基準に取ると、リポジトリのルート以外から起動されたときに
    # .claude/ が見つからず素通ししてしまう。壊れる場所と見張る場所が食い違う。
    #
    # ここでは symlink 付きフィクスチャのサブディレクトリから起動し、
    # 「配置先そのもの」を見張れているかを確かめる。
    dev_setup() {
      dev_repo="$(make_fixture_symlinked_repo)"
      mkdir -p "${dev_repo}/docs"
    }

    dev_cleanup() {
      rm -rf "$dev_repo"
    }

    BeforeEach 'dev_setup'
    AfterEach 'dev_cleanup'

    resolve_skill_root() { echo "${dev_repo}/skills/setup-chatlogs"; }
    resolve_skills_dir() { echo "${dev_repo}/skills"; }

    ##
    # @description Run main from a subdirectory of the development repository
    #
    # Subshell so the cd never leaks into later examples.
    #
    # @arg $@ string Command line options forwarded to main
    run_main_in_dev_subdir() {
      (cd "${dev_repo}/docs" && main "$@")
    }

    Describe 'When: 異常系'
      It '[Error] T-SC-MN-03: サブディレクトリから --force → 共有ライブラリを守る'
        # __tests__/keep.md は配布物には含まれない実体側のファイル。
        # 破壊的な展開が起きればこれが失われるため、存続が防御の直接証明になる。
        When call run_main_in_dev_subdir --force
        The status should be failure
        The stderr should include '__tests__'
        The path "${dev_repo}/skills/_cle-libs/__tests__/keep.md" should be exist
      End
    End
  End
End
