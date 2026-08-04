# src: ./scripts/__tests__/unit/setup-chatlogs.unit.spec.sh
# @(#) : Unit tests for skills/setup-chatlogs/scripts/setup-chatlogs.sh
#        対象: usage / parse_args / copy_entry / resolve_skill_root / resolve_target_dir /
#              resolve_skills_dir / resolve_dest_base /
#              assert_dest_not_development_tree / run_setup
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
    skill_root="$(make_fixture_skill_dir)"
    repo="$(make_fixture_repo)"
  }

  cleanup() {
    rm -rf "$skill_root" "$repo"
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
        When call copy_entry "${skill_root}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/.config/chatlog-exporter/dics/category.dic" should be exist
      End

      It '[Normal] T-SC-CE-02: 単一ファイルをコピーする'
        When call copy_entry "${skill_root}/assets/deno.json" "${repo}/deno.json" ''
        The status should be success
        The output should include 'Copied'
        The contents of file "${repo}/deno.json" should equal '{"tasks":{}}'
      End

      It '[Normal] T-SC-CE-06: 宛先の親ディレクトリが無くても作成する'
        When call copy_entry "${skill_root}/assets/_cle-libs" "${repo}/.claude/skills/_cle-libs" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
      End

      It '[Normal] T-SC-CE-08: 宛先が非存在 & force なし → ネストせず宛先そのものに配置する'
        # force なしでは削除を打たないため、ディレクトリコピーが宛先の内側に
        # 入れ子（.../_cle-libs/_cle-libs/）にならないことを確かめる。
        When call copy_entry "${skill_root}/assets/_cle-libs" "${repo}/dest" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/dest/libs/noop.ts" should be exist
        The path "${repo}/dest/_cle-libs" should not be exist
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-CE-05: コピー元が存在しない → エラー'
        When call copy_entry "${skill_root}/assets/missing" "${repo}/missing" ''
        The status should be failure
        The stderr should include 'source not found'
        The path "${repo}/missing" should not be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-CE-03: 宛先が既存 & force なし → スキップし既存内容を残す'
        BeforeCall 'mkdir -p "${repo}/.config/chatlog-exporter"; echo keep >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call copy_entry "${skill_root}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" ''
        The status should be success
        The output should include 'Skipped'
        The contents of file "${repo}/.config/chatlog-exporter/config.yaml" should equal 'keep'
      End

      It '[Edge] T-SC-CE-04: 宛先が既存 & force → 上書きする'
        BeforeCall 'mkdir -p "${repo}/.config/chatlog-exporter"; echo keep >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call copy_entry "${skill_root}/assets/.config/chatlog-exporter" "${repo}/.config/chatlog-exporter" force
        The status should be success
        The output should include 'Copied'
        The contents of file "${repo}/.config/chatlog-exporter/config.yaml" should equal 'agent: claude'
        The path "${repo}/.config/chatlog-exporter/dics/category.dic" should be exist
      End

      It '[Edge] T-SC-CE-07: 宛先が既存 symlink & force なし → スキップしリンク先の実体を残す'
        # 削除は force 指定時にしか起こらないことの直接確認。ガードの判定に
        # 依存せず、force なしの経路では実体が失われないことを保証する。
        Skip if 'symlinks unsupported' no_symlink_support
        BeforeCall 'mkdir -p "${repo}/real"; echo keep >"${repo}/real/keep.md"; (cd "$repo" && MSYS=winsymlinks:nativestrict ln -s real link)'
        When call copy_entry "${skill_root}/assets/_cle-libs" "${repo}/link" ''
        The status should be success
        The output should include 'Skipped'
        The path "${repo}/real/keep.md" should be exist
        The path "${repo}/link" should be exist
      End
    End
  End

  Describe 'resolve_skill_root'
    Describe 'When: 正常系'
      It '[Normal] T-SC-SD-01: SKILL.md を置くスキルディレクトリを返す'
        # パス演算を誤ると何も配置されないまま成功しうるため、返り値が
        # 本スクリプトを含むディレクトリであることまで確かめる。
        resolve_and_check() {
          local dir
          dir="$(resolve_skill_root)" || return 1
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
          resolve_skill_root >/dev/null || return 1
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

  Describe 'resolve_skills_dir'
    Describe 'When: 正常系'
      It '[Normal] T-SC-KD-01: スキルディレクトリの親を返す'
        # _cle-libs はここに置かれる。返り値配下にスキル本体が実在することまで
        # 確かめ、パス演算の誤りで見当違いの場所を返していないことを保証する。
        resolve_and_check() {
          local dir
          dir="$(resolve_skills_dir)" || return 1
          [[ -f "${dir}/setup-chatlogs/scripts/setup-chatlogs.sh" ]] || return 1
          echo "ok"
        }
        When call resolve_and_check
        The status should be success
        The output should equal 'ok'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-KD-02: 呼び出し元の作業ディレクトリを変更しない'
        resolve_and_report_cwd() {
          local before after
          before="$(pwd)"
          resolve_skills_dir >/dev/null || return 1
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

  Describe 'resolve_dest_base'
    # 展開先の基準は「展開元が assets/_cle-libs か、それ以外か」の 2 値でしかない。
    # 展開元はすべて assets/ 配下にあるため、共有ライブラリだけを名指しで判別する。
    # 共有ライブラリだけがスキルの隣に、残りは実行ディレクトリに置かれる。
    Describe 'When: 正常系'
      It '[Normal] T-SC-DB-01: assets/_cle-libs → skills ディレクトリを返す'
        # 兄弟スキルの ../../_cle-libs/ import はスキルの隣でしか解決しない。
        When call resolve_dest_base assets/_cle-libs /tmp/target /tmp/skills
        The status should be success
        The output should equal '/tmp/skills'
      End

      It '[Normal] T-SC-DB-02: assets/_cle-libs 以外 → 展開先ディレクトリを返す'
        When call resolve_dest_base assets/deno.json /tmp/target /tmp/skills
        The status should be success
        The output should equal '/tmp/target'
      End
    End
  End

  Describe 'assert_dest_not_development_tree'
    # 展開先が「配る側の実体」か「配られた先」かは、配置の形では区別できない。
    # __tests__ は sync-skill-assets.sh が配布物から必ず除くため、その有無が
    # 唯一の判別材料になる。
    guard_setup() {
      guard_dir="$(mktemp -d)"
    }

    guard_cleanup() {
      rm -rf "$guard_dir"
    }

    BeforeEach 'guard_setup'
    AfterEach 'guard_cleanup'

    Describe 'When: 正常系'
      It '[Normal] T-SC-GD-01: force なしなら __tests__ があっても通す'
        # 拒否は --force 時のみ。force なしでは copy_entry が削除に到達しない。
        BeforeCall 'mkdir -p "${guard_dir}/_cle-libs/__tests__"'
        When call assert_dest_not_development_tree "${guard_dir}/_cle-libs" ''
        The status should be success
      End

      It '[Normal] T-SC-GD-02: force でも __tests__ が無ければ通す'
        # 正規インストール先の再展開を止めないことの保証。
        BeforeCall 'mkdir -p "${guard_dir}/_cle-libs/libs"'
        When call assert_dest_not_development_tree "${guard_dir}/_cle-libs" force
        The status should be success
      End

      It '[Normal] T-SC-GD-03: force でも展開先が未作成なら通す'
        When call assert_dest_not_development_tree "${guard_dir}/_cle-libs" force
        The status should be success
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-GD-04: force かつ __tests__ あり → 拒否する'
        BeforeCall 'mkdir -p "${guard_dir}/_cle-libs/__tests__"'
        When call assert_dest_not_development_tree "${guard_dir}/_cle-libs" force
        The status should be failure
        The stderr should include '__tests__'
      End
    End
  End

  Describe 'run_setup'
    Describe 'When: 正常系'
      It '[Normal] T-SC-RS-01: 3 つの展開先すべてを配置する'
        # _cle-libs は .claude/skills/ 直下に置く必要がある。既存スキルの
        # ../../_cle-libs/ import がこの配置でのみ解決するため。
        When call run_setup "$skill_root" "$repo" "${repo}/.claude/skills" ''
        The status should be success
        The output should include 'Copied'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/deno.json" should be exist
        The path "${repo}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SC-RS-03: assets が存在しない → エラー'
        BeforeCall 'rm -rf "${skill_root}/assets"'
        When call run_setup "$skill_root" "$repo" "${repo}/.claude/skills" ''
        The status should be failure
        The stderr should include 'source not found'
      End

      It '[Error] T-SC-RS-04: 最後の展開元だけ欠けていても何も配置しない'
        # 先頭のコピー元は揃っているので、事前検証が無いと 1・2 番目を配置してから
        # 失敗する。半端に展開されたツリーを残さないことを確かめる。
        BeforeCall 'rm -rf "${skill_root}/assets/_cle-libs"'
        When call run_setup "$skill_root" "$repo" "${repo}/.claude/skills" ''
        The status should be failure
        The stderr should include 'source not found'
        The path "${repo}/.config/chatlog-exporter" should not be exist
        The path "${repo}/deno.json" should not be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-RS-02: 既存の展開先はスキップし、残りは配置する'
        BeforeCall 'echo keep >"${repo}/deno.json"'
        When call run_setup "$skill_root" "$repo" "${repo}/.claude/skills" ''
        The status should be success
        The output should include 'Skipped (exists)'
        The contents of file "${repo}/deno.json" should equal 'keep'
        The path "${repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${repo}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
      End
    End
  End

  Describe 'run_setup（スキルマネージャーの標準配置）'
    # スキルが <repo>/.claude/skills/setup-chatlogs/ にある通常のインストール形態。
    # _cle-libs の展開先 .claude/skills/_cle-libs はこの配置では必ずスキル自身と
    # 兄弟になるため、パスの重なりで判定すると常に誤検知になる。symlink は無関係。
    installed_setup() {
      installed_repo="$(make_fixture_installed_repo)"
    }

    installed_cleanup() {
      rm -rf "$installed_repo"
    }

    BeforeEach 'installed_setup'
    AfterEach 'installed_cleanup'

    Describe 'When: 正常系'
      It '[Normal] T-SC-RS-08: 通常インストール配置で 3 つの展開先すべてを配置する'
        When call run_setup "${installed_repo}/.claude/skills/setup-chatlogs" "$installed_repo" "${installed_repo}/.claude/skills" ''
        The status should be success
        The output should include 'Copied'
        The path "${installed_repo}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${installed_repo}/deno.json" should be exist
        The path "${installed_repo}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
      End

      It '[Normal] T-SC-RS-09: 通常インストール配置なら force でも配置し、兄弟スキルを残す'
        # .claude/skills が実ディレクトリなら --force でも安全。同ディレクトリに
        # 同居する他スキルが巻き添えで消えないことまで確かめる。
        When call run_setup "${installed_repo}/.claude/skills/setup-chatlogs" "$installed_repo" "${installed_repo}/.claude/skills" force
        The status should be success
        The output should include 'Copied'
        The path "${installed_repo}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
        The path "${installed_repo}/.claude/skills/export-chatlogs/SKILL.md" should be exist
        The path "${installed_repo}/.claude/skills/setup-chatlogs/SKILL.md" should be exist
      End
    End
  End

  Describe 'run_setup（User スコープの配置）'
    # スキルが <home>/.claude/skills/setup-chatlogs/ にあり、展開先のプロジェクトは
    # まったく別のディレクトリという形態。共有ライブラリを cwd 基準で置くと
    # 兄弟スキルの ../../_cle-libs/ import が解決できず、スクリプトが実行時に落ちる。
    user_scope_setup() {
      home="$(make_fixture_user_scope_home)"
      project="$(mktemp -d)"
    }

    user_scope_cleanup() {
      rm -rf "$home" "$project"
    }

    BeforeEach 'user_scope_setup'
    AfterEach 'user_scope_cleanup'

    Describe 'When: 正常系'
      It '[Normal] T-SC-RS-10: _cle-libs は cwd ではなくスキルの隣に配置される'
        # 兄弟スキルの import が指す先に実際に置かれることを確かめる。
        When call run_setup "${home}/.claude/skills/setup-chatlogs" "$project" "${home}/.claude/skills" ''
        The status should be success
        The output should include 'Copied'
        The path "${home}/.claude/skills/_cle-libs/libs/noop.ts" should be exist
      End

      It '[Normal] T-SC-RS-11: 設定と deno.json はプロジェクト側に配置される'
        # 共有ライブラリだけがスキル側で、プロジェクト固有の設定は cwd 基準のまま。
        When call run_setup "${home}/.claude/skills/setup-chatlogs" "$project" "${home}/.claude/skills" ''
        The status should be success
        The output should include 'Copied'
        The path "${project}/.config/chatlog-exporter/config.yaml" should be exist
        The path "${project}/deno.json" should be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SC-RS-13: プロジェクト側に .claude を作らない'
        # 旧挙動の回帰検出。cwd 基準で置いていた頃はここに _cle-libs ができ、
        # スキル側は空のままだった。
        When call run_setup "${home}/.claude/skills/setup-chatlogs" "$project" "${home}/.claude/skills" ''
        The status should be success
        The output should include 'Copied'
        The path "${project}/.claude" should not be exist
      End
    End
  End

  Describe 'run_setup（展開先がソースツリーに重なる場合）'
    # .claude/skills -> ../skills のリポジトリで、スキルが symlink 経由で
    # 解決された場合。skills ディレクトリは <repo>/.claude/skills となり、
    # _cle-libs の展開先はリンク越しに共有ライブラリの実体へ解決する。
    # run_setup 自体はガードを持たないため、ここで確かめるのは force なしの
    # スキップ挙動だけ。開発ツリーの拒否は main とガード単体側で検証する。
    # フィクスチャは必ず mktemp -d 配下に作る: force を渡せば実際に削除が起きる
    # 経路であり、実チェックアウトを指すと skills/_cle-libs/__tests__ を
    # 本当に消してしまう。
    linked_setup() {
      linked_repo="$(make_fixture_symlinked_repo)"
    }

    linked_cleanup() {
      rm -rf "$linked_repo"
    }

    BeforeEach 'linked_setup'
    AfterEach 'linked_cleanup'

    Describe 'When: エッジケース'
      It '[Edge] T-SC-RS-07: force なしなら重なる展開先はスキップされ、実体が残る'
        # 拒否は --force 時のみ。force なしでは _cle-libs の展開先が symlink 経由で
        # 実在するため copy_entry が rm -rf に到達せずスキップし、配布物に含まれない
        # __tests__ が残る。保護されるものは RS-05 と同じで、手段がガードではなく
        # スキップになる。.config と deno.json は不在なので配置され、全体は成功する。
        Skip if 'symlinks unsupported' no_symlink_support
        When call run_setup "${linked_repo}/skills/setup-chatlogs" "$linked_repo" "${linked_repo}/.claude/skills" ''
        The status should be success
        The output should include 'Skipped (exists)'
        The path "${linked_repo}/skills/_cle-libs/__tests__/keep.md" should be exist
        The path "${linked_repo}/skills/_cle-libs/libs/noop.ts" should be exist
      End
    End
  End
End
