# src: ./scripts/__tests__/unit/sync-skill-assets.unit.spec.sh
# @(#) : Unit tests for scripts/sync-skill-assets.sh
#        対象: usage / parse_args / resolve_repo_root / copy_tree /
#              run_sync / run_check / run_check_head
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash disable=SC2016,SC2329

Describe 'sync-skill-assets.sh'
  Include scripts/sync-skill-assets.sh

  setup() {
    repo="$(make_fixture_source_repo)"
    dist="${repo}/skills/setup-chatlogs"
  }

  cleanup() {
    rm -rf "$repo"
  }

  BeforeEach 'setup'
  AfterEach 'cleanup'

  Describe 'usage'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-US-01: 全オプションを表示する'
        # --force は削除済み。ヘルプに載っていると、実装が受理しないオプションを
        # 利用者に案内することになるため、載らないことも併せて確かめる。
        When call usage
        The status should be success
        The output should include '--check'
        The output should include '--help'
        The output should not include '--force'
      End

      It '[Normal] T-SSA-US-03: --check-head を案内する'
        # 実装が受理するオプションはヘルプに載っていなければ利用者から見えない。
        When call usage
        The status should be success
        The output should include '--check-head'
      End

      It '[Normal] T-SSA-US-02: 実際の配置に一致する起動パスを案内する'
        # 利用者はこの行を見て起動するため、実在するパスであることを保証する。
        When call usage
        The status should be success
        The output should include 'scripts/sync-skill-assets.sh'
      End
    End
  End

  Describe 'parse_args'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-PA-01: 引数なし → 空文字列'
        When call parse_args
        The output should equal ''
        The status should be success
      End

      It '[Normal] T-SSA-PA-03: --check → check'
        When call parse_args --check
        The output should equal 'check'
        The status should be success
      End

      It '[Normal] T-SSA-PA-04: --help → help'
        When call parse_args --help
        The output should equal 'help'
        The status should be success
      End

      It '[Normal] T-SSA-PA-10: --check-head → check-head'
        When call parse_args --check-head
        The output should equal 'check-head'
        The status should be success
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-PA-02: --force → 未知のオプションとして失敗する'
        # --force は同期を一切ゲートしていなかったため削除した。受理し続けると
        # 効果のないオプションを利用者に約束することになる。
        When call parse_args --force
        The status should be failure
        The stderr should include 'unknown option: --force'
      End

      It '[Error] T-SSA-PA-05: 未知のオプション → エラー'
        When call parse_args --bogus
        The status should be failure
        The stderr should include 'unknown option: --bogus'
      End

      It '[Error] T-SSA-PA-06: 位置引数 → エラー'
        When call parse_args somearg
        The status should be failure
        The stderr should include 'unknown option: somearg'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-PA-09: --help は --check より優先される'
        # 指定順に関わらず help が勝つことを、help を後ろに置いて確かめる。
        When call parse_args --check --help
        The output should equal 'help'
        The status should be success
      End

      It '[Edge] T-SSA-PA-11: --help は --check-head より優先される（help が後）'
        When call parse_args --check-head --help
        The output should equal 'help'
        The status should be success
      End

      It '[Edge] T-SSA-PA-12: --help は --check-head より優先される（help が先）'
        # 全オプションを読んでから判定するため、指定順に依存しない。
        When call parse_args --help --check-head
        The output should equal 'help'
        The status should be success
      End

      It '[Edge] T-SSA-PA-13: --check-head は --check より優先される（check-head が後）'
        # 併記されたときは検査範囲の広い（HEAD ツリーまで見る）ほうを採る。
        When call parse_args --check --check-head
        The output should equal 'check-head'
        The status should be success
      End

      It '[Edge] T-SSA-PA-14: --check-head は --check より優先される（check-head が先）'
        When call parse_args --check-head --check
        The output should equal 'check-head'
        The status should be success
      End
    End
  End

  Describe 'resolve_repo_root'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-RR-01: サブディレクトリからでもリポジトリルートを返す'
        # cd 先に依存せず同じルートを返すことが、どこから実行しても動く根拠になる。
        # git は Windows で W:/Temp 形式、pwd は /w/temp 形式を返すため、
        # 文字列ではなく deno.json の実在で同一ディレクトリかを判定する。
        resolve_from_subdir() {
          cd "${repo}/skills" || return 1
          local root
          root="$(resolve_repo_root)" || return 1
          [[ -f "${root}/deno.json" ]] || return 1
          echo "ok"
        }
        When call resolve_from_subdir
        The status should be success
        The output should equal 'ok'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-RR-02: git 管理外では失敗する'
        cd_into_tmp() { cd "$(mktemp -d)" || return 1; }
        BeforeCall 'cd_into_tmp'
        When call resolve_repo_root
        The status should be failure
        The stderr should be present
      End
    End
  End

  Describe 'copy_tree'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-CT-01: __tests__ を除いてツリーを複製する'
        # run_sync と run_check が同じ「期待されるツリー」定義を共有するための
        # 土台。ここが崩れると検査が通ったまま配布物だけ壊れる。
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/libs/file-io/path-utils.ts" should be exist
        The output should equal ''
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-CT-02: 宛先に残っていた古いファイルを消す'
        # tar の展開は上書きするだけで消さないため、事前削除が無いと
        # 削除済みソースの残骸が配布物に残り続ける。
        BeforeCall 'mkdir -p "${repo}/out"; echo stale >"${repo}/out/stale.ts"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/stale.ts" should not be exist
        The path "${repo}/out/libs/file-io/path-utils.ts" should be exist
      End
    End
  End

  Describe 'run_sync'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-RS-01: 3 つの同期先すべてを配置する'
        When call run_sync "$repo"
        The status should be success
        The output should include 'Synced'
        The path "${dist}/assets/.config/chatlog-exporter/config.yaml" should be exist
        The path "${dist}/assets/deno.json" should be exist
        The path "${dist}/assets/_cle-libs/libs/file-io/path-utils.ts" should be exist
      End

      It '[Normal] T-SSA-RS-02: ネストしたファイル実体まで到達する'
        # ディレクトリが出来ただけでは中身が届いた証拠にならないため、
        # 深い階層のファイル内容まで確かめる。
        When call run_sync "$repo"
        The status should be success
        The output should include 'Synced'
        The contents of file "${dist}/assets/.config/chatlog-exporter/dics/category.dic" should equal 'develop'
        The contents of file "${dist}/assets/_cle-libs/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-RS-04: 同期元が欠けていたら何も配置しない'
        # 先頭の同期元は揃っているので、事前検証が無いと 1・2 番目を配置してから
        # 失敗する。半端に同期されたツリーを残さないことを確かめる。
        BeforeCall 'rm -rf "${repo}/skills/_cle-libs"'
        When call run_sync "$repo"
        The status should be failure
        The stderr should include 'source not found'
        The path "${dist}/assets" should not be exist
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-RS-03: 配布先に __tests__ が 1 つも残らない'
        # 配布物にテストを含めない。入れ子の __tests__ まで枝ごと落ちることを、
        # 深い階層に仕込んだ __tests__/helpers/__tests__ で確かめる。
        find_tests_dir() {
          run_sync "$repo" >/dev/null || return 1
          find "$dist" -name '__tests__' -print -quit
        }
        When call find_tests_dir
        The status should be success
        The output should equal ''
      End

      It '[Edge] T-SSA-RS-05: 前回の同期で残った古いファイルを消す'
        BeforeCall 'mkdir -p "${dist}/assets/_cle-libs/libs"; echo stale >"${dist}/assets/_cle-libs/libs/removed.ts"'
        When call run_sync "$repo"
        The status should be success
        The output should include 'Synced'
        The path "${dist}/assets/_cle-libs/libs/removed.ts" should not be exist
        The path "${dist}/assets/_cle-libs/libs/file-io/path-utils.ts" should be exist
      End
    End
  End

  Describe 'run_check'
    Describe 'When: 正常系'
      It '[Normal] T-SSA-RC-01: 同期済みなら成功する'
        BeforeCall 'run_sync "$repo" >/dev/null'
        When call run_check "$repo"
        The status should be success
        The output should include 'up to date'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-RC-02: 配布物の内容がソースと食い違う → 失敗する'
        BeforeCall 'run_sync "$repo" >/dev/null; echo drift >"${dist}/assets/deno.json"'
        When call run_check "$repo"
        The status should be failure
        The stderr should include 'out of date'
      End

      It '[Error] T-SSA-RC-03: 未同期（配布先が存在しない）→ 失敗する'
        When call run_check "$repo"
        The status should be failure
        The stderr should include 'out of date'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-RC-04: ソースで消したファイルが配布物に残っている → 失敗する'
        # diff は片側にしか無いファイルも差分として報告する。内容比較だけでは
        # 削除の取りこぼしを検出できない。
        BeforeCall 'run_sync "$repo" >/dev/null; echo stale >"${dist}/assets/_cle-libs/libs/removed.ts"'
        When call run_check "$repo"
        The status should be failure
        The stderr should include 'out of date'
      End

      It '[Edge] T-SSA-RC-05: 検査は配布物を書き換えない'
        # --check は読み取り専用でなければならない。CI が意図せず配布物を
        # 直して緑になる事故を防ぐ。
        check_preserves_drift() {
          run_sync "$repo" >/dev/null || return 1
          echo drift >"${dist}/assets/deno.json"
          run_check "$repo" >/dev/null 2>&1 || true
          cat "${dist}/assets/deno.json"
        }
        When call check_preserves_drift
        The status should be success
        The output should equal 'drift'
      End
    End
  End

  Describe 'run_check_head'
    # HEAD ツリー（＝リモートに届く内容）を検査する。run_check が作業ツリーしか
    # 見ないため、「ソースはコミットしたが再生成した配布物をコミットし忘れた」
    # 状態が pre-push をすり抜けてリモートに到達しうる。その穴を塞ぐ。

    ##
    # 「ソースは新しいが配布物は古い」コミットを HEAD に作り、
    # 作業ツリー上は同期済みという状態を組み立てる。
    #
    # 1. 同期済みの状態を丸ごとコミット（HEAD は整合）
    # 2. ソースだけ編集してコミット（HEAD は不整合。配布物は未再生成）
    # 3. 配布物を再生成するがコミットしない（作業ツリーは整合）
    make_uncommitted_assets() {
      run_sync "$repo" >/dev/null || return 1
      commit_fixture_repo "$repo" || return 1
      echo 'agent: codex' >"${repo}/.config/chatlog-exporter/config.yaml"
      commit_fixture_repo "$repo" || return 1
      run_sync "$repo" >/dev/null || return 1
    }

    Describe 'When: 正常系'
      It '[Normal] T-SSA-RCH-01: 同期済みで全てコミット済みなら成功する'
        BeforeCall 'run_sync "$repo" >/dev/null; commit_fixture_repo "$repo"'
        When call run_check_head "$repo"
        The status should be success
        The output should include 'up to date'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-RCH-02: 配布物が未コミットでも作業ツリー検査は通ってしまう'
        # 塞ごうとしている穴そのもの。run_check が成功することを明示しておかないと、
        # T-SSA-RCH-03 が「元から壊れていただけ」なのか
        # 「run_check_head が新たに検出した」のか区別できない。
        BeforeCall 'make_uncommitted_assets'
        When call run_check "$repo"
        The status should be success
        The output should include 'up to date'
      End

      It '[Error] T-SSA-RCH-03: 配布物が未コミットなら HEAD 検査は失敗する'
        # T-SSA-RCH-02 と同じ状態に対して結果が反転することが、穴が塞がった証拠。
        BeforeCall 'make_uncommitted_assets'
        When call run_check_head "$repo"
        The status should be failure
        The stderr should include 'out of date'
      End

      It '[Error] T-SSA-RCH-04: コミットが無いリポジトリでは失敗する'
        # HEAD が無ければ検査対象のツリーを取り出せない。黙って成功すると
        # 「検査した」という誤った保証を与えてしまう。
        When call run_check_head "$repo"
        The status should be failure
        The stderr should be present
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-RCH-05: 成功しても一時ディレクトリを残さない'
        # TMPDIR を専用の空ディレクトリに向けることで、この呼び出しが作った
        # 一時ディレクトリだけを観測する。
        head_check_in_isolated_tmp() {
          local tmp_home
          tmp_home="$(mktemp -d)"
          run_sync "$repo" >/dev/null || return 1
          commit_fixture_repo "$repo" || return 1
          TMPDIR="$tmp_home" run_check_head "$repo" >/dev/null 2>&1 || return 1
          ls -A "$tmp_home"
        }
        When call head_check_in_isolated_tmp
        The status should be success
        The output should equal ''
      End

      It '[Edge] T-SSA-RCH-06: 失敗しても一時ディレクトリを残さない'
        # 失敗経路の後始末が漏れると、pre-push が落ちるたびにゴミが積もる。
        head_check_failure_in_isolated_tmp() {
          local tmp_home
          tmp_home="$(mktemp -d)"
          make_uncommitted_assets || return 1
          TMPDIR="$tmp_home" run_check_head "$repo" >/dev/null 2>&1 && return 1
          ls -A "$tmp_home"
        }
        When call head_check_failure_in_isolated_tmp
        The status should be success
        The output should equal ''
      End

      It '[Edge] T-SSA-RCH-07: 検査は作業ツリーを書き換えない'
        # HEAD を展開して検査する以上、作業ツリーには一切触れてはならない。
        # 実行前後で git status が変わらないことをもって読み取り専用を示す。
        head_check_preserves_worktree() {
          local before after
          run_sync "$repo" >/dev/null || return 1
          commit_fixture_repo "$repo" || return 1
          echo drift >"${dist}/assets/deno.json"
          before="$(git -C "$repo" status --porcelain)"
          run_check_head "$repo" >/dev/null 2>&1 || true
          after="$(git -C "$repo" status --porcelain)"
          [[ "$before" == "$after" ]] || return 1
          cat "${dist}/assets/deno.json"
        }
        When call head_check_preserves_worktree
        The status should be success
        The output should equal 'drift'
      End
    End
  End
End
