# src: ./scripts/__tests__/unit/setup-chatlogs.unit.spec.sh
# @(#) : Unit tests for skills/setup-chatlogs/scripts/setup-chatlogs.sh
#        対象: usage / parse_args / copy_entry / resolve_target_dir / run_setup
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

Describe 'setup-chatlogs.sh'
  Include skills/setup-chatlogs/scripts/setup-chatlogs.sh

  setup() {
    skill_dir="$(make_fixture_skill_dir)"
    repo="$(make_fixture_repo)"
  }

  cleanup() {
    rm -rf "$skill_dir" "$repo"
  }

  BeforeEach 'setup'
  AfterEach 'cleanup'

  Describe 'usage'
    Describe 'When: 正常系'
      It '[Normal] T-SC-US-01: 全オプションを表示する'
        When call usage
        The status should be success
        The output should include '--force'
        The output should include '--help'
      End

      It '[Normal] T-SC-US-02: 実際の配置に一致する起動パスを案内する'
        # 利用者はこの行を見て起動するため、実在するパスであることを保証する。
        When call usage
        The status should be success
        The output should include 'skills/setup-chatlogs/scripts/setup-chatlogs.sh'
      End
    End
  End

  Describe 'parse_args'
    Describe 'When: 正常系'
      It '[Normal] T-SC-PA-01: 引数なし → 空文字列'
        When call parse_args
        The output should equal ''
        The status should be success
      End

      It '[Normal] T-SC-PA-02: --force → force'
        When call parse_args --force
        The output should equal 'force'
        The status should be success
      End

      It '[Normal] T-SC-PA-03: --help → help'
        When call parse_args --help
        The output should equal 'help'
        The status should be success
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-PA-05: 未知のオプション → エラー'
        When call parse_args --bogus
        The status should be failure
        The stderr should include 'unknown option: --bogus'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-PA-04: --help は他オプションより優先される'
        When call parse_args --force --help
        The output should equal 'help'
        The status should be success
      End
    End
  End

  Describe 'copy_entry'
    Describe 'When: 正常系'
      It '[Normal] T-SC-CE-01: ディレクトリを中身ごとコピーする'
        # ディレクトリが出来ただけでは中身が届いた証拠にならないため、
        # ネストしたファイルの実在まで確かめる。
        When call copy_entry "${skill_dir}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/.config/chatlog-exporter/dics/category.dic" should be exist
      End

      It '[Normal] T-SC-CE-02: 単一ファイルをコピーする'
        When call copy_entry "${skill_dir}/assets/deno.json" "${repo}/deno.json" ''
        The status should be success
        The output should include 'Copied'
        The contents of file "${repo}/deno.json" should equal '{"tasks":{}}'
      End

      It '[Normal] T-SC-CE-06: 宛先の親ディレクトリが無くても作成する'
        When call copy_entry "${skill_dir}/_scripts" "${repo}/.claude/skills/_scripts" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.claude/skills/_scripts/libs/noop.ts" should be exist
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-CE-05: コピー元が存在しない → エラー'
        When call copy_entry "${skill_dir}/assets/missing" "${repo}/missing" ''
        The status should be failure
        The stderr should include 'source not found'
        The path "${repo}/missing" should not be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-CE-03: 宛先が既存 & force なし → スキップし既存内容を残す'
        BeforeCall 'mkdir -p "${repo}/.config/chatlog-exporter"; echo keep >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call copy_entry "${skill_dir}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" ''
        The status should be success
        The output should include 'Skipped'
        The contents of file "${repo}/.config/chatlog-exporter/config.yaml" should equal 'keep'
      End

      It '[Edge] T-SC-CE-04: 宛先が既存 & force → 上書きする'
        BeforeCall 'mkdir -p "${repo}/.config/chatlog-exporter"; echo keep >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call copy_entry "${skill_dir}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" force
        The status should be success
        The output should include 'Copied'
        The contents of file "${repo}/.config/chatlog-exporter/config.yaml" should equal 'agent: claude'
        The path "${repo}/.config/chatlog-exporter/dics/category.dic" should be exist
      End
    End
  End

  Describe 'resolve_skill_dir'
    Describe 'When: 正常系'
      It '[Normal] T-SC-SD-01: SKILL.md を置くスキルディレクトリを返す'
        # パス演算を誤ると何も配置されないまま成功しうるため、返り値が
        # 本スクリプトを含むディレクトリであることまで確かめる。
        resolve_and_check() {
          local dir
          dir="$(resolve_skill_dir)" || return 1
          [[ -f "${dir}/scripts/setup-chatlogs.sh" ]] || return 1
          echo "ok"
        }
        When call resolve_and_check
        The status should be success
        The output should equal 'ok'
      End

      It '[Normal] T-SC-SD-02: 呼び出し元の作業ディレクトリを変更しない'
        resolve_and_report_cwd() {
          local before after
          before="$(pwd)"
          resolve_skill_dir >/dev/null || return 1
          after="$(pwd)"
          [[ "$before" == "$after" ]] || return 1
          echo "unchanged"
        }
        When call resolve_and_report_cwd
        The status should be success
        The output should equal 'unchanged'
      End
    End
  End

  Describe 'resolve_target_dir'
    Describe 'When: 正常系'
      It '[Normal] T-SC-TD-01: 実行時ディレクトリの絶対パスを返す'
        # 期待値はフィクスチャ側で生成する。MSYS では mktemp の出力と pwd の
        # 表記が食い違いうるため、リテラルのパスを書かない。
        resolve_and_compare() {
          local dir expected actual
          dir="$(mktemp -d)"
          expected="$(cd "$dir" && pwd)"
          actual="$(cd "$dir" && resolve_target_dir)"
          rm -rf "$dir"
          [[ "$expected" == "$actual" ]] || return 1
          echo "match"
        }
        When call resolve_and_compare
        The status should be success
        The output should equal 'match'
      End

      It '[Normal] T-SC-TD-02: 非 git ディレクトリでも成功する'
        # git 基準の実装では rev-parse が exit 128 で落ちるため、この 1 件が
        # 本変更の判別ケースになる。
        resolve_in_nogit() {
          local dir status
          dir="$(mktemp -d)"
          # git 管理下でないことを確かめてから、そこで解決できるかを見る。
          if (cd "$dir" && git rev-parse --show-toplevel >/dev/null 2>&1); then
            rm -rf "$dir"
            echo "fixture is inside a git repository" >&2
            return 1
          fi
          (cd "$dir" && resolve_target_dir >/dev/null)
          status=$?
          rm -rf "$dir"
          [[ $status -eq 0 ]] || return 1
          echo "ok"
        }
        When call resolve_in_nogit
        The status should be success
        The output should equal 'ok'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-TD-03: 呼び出し元の作業ディレクトリを変更しない'
        resolve_and_report_cwd() {
          local before after
          before="$(pwd)"
          resolve_target_dir >/dev/null || return 1
          after="$(pwd)"
          [[ "$before" == "$after" ]] || return 1
          echo "unchanged"
        }
        When call resolve_and_report_cwd
        The status should be success
        The output should equal 'unchanged'
      End
    End
  End

  Describe 'run_setup'
    Describe 'When: 正常系'
      It '[Normal] T-SC-RS-01: 3 つの展開先すべてを配置する'
        # _scripts は .claude/skills/ 直下に置く必要がある。既存スキルの
        # ../../_scripts/ import がこの配置でのみ解決するため。
        When call run_setup "$skill_dir" "$repo" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/deno.json" should be exist
        The path "${repo}/.claude/skills/_scripts/libs/noop.ts" should be exist
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-RS-03: assets が存在しない → エラー'
        BeforeCall 'rm -rf "${skill_dir}/assets"'
        When call run_setup "$skill_dir" "$repo" ''
        The status should be failure
        The stderr should include 'source not found'
      End

      It '[Error] T-SC-RS-04: 最後の展開元だけ欠けていても何も配置しない'
        # 先頭のコピー元は揃っているので、事前検証が無いと 1・2 番目を配置してから
        # 失敗する。半端に展開されたツリーを残さないことを確かめる。
        BeforeCall 'rm -rf "${skill_dir}/_scripts"'
        When call run_setup "$skill_dir" "$repo" ''
        The status should be failure
        The stderr should include 'source not found'
        The path "${repo}/.config/chatlog-exporter" should not be exist
        The path "${repo}/deno.json" should not be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-RS-02: 既存の展開先はスキップし、残りは配置する'
        BeforeCall 'echo keep >"${repo}/deno.json"'
        When call run_setup "$skill_dir" "$repo" ''
        The status should be success
        The output should include 'Skipped (exists)'
        The contents of file "${repo}/deno.json" should equal 'keep'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/.claude/skills/_scripts/libs/noop.ts" should be exist
      End
    End
  End
End
