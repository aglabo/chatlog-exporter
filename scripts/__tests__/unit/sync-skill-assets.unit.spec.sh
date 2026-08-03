# src: ./scripts/__tests__/unit/sync-skill-assets.unit.spec.sh
# @(#) : Unit tests for scripts/sync-skill-assets.sh
#        対象: usage / parse_args / resolve_repo_root / copy_tree /
#              run_sync / run_check
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
End
