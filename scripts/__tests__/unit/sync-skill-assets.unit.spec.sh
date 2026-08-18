# src: ./scripts/__tests__/unit/sync-skill-assets.unit.spec.sh
# @(#) : Unit tests for scripts/sync-skill-assets.sh
#        対象: usage / parse_args / resolve_repo_root / copy_tree /
#              run_sync / run_check / run_check_head / run_check_staged
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
        # --check は書式行の [--check] で確かめる。素の '--check' だと
        # --check-head / --check-staged の前方一致でも通ってしまい、--check 自体が
        # ヘルプから消えても気づけない。
        When call usage
        The status should be success
        The output should include '[--check]'
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

      It '[Normal] T-SSA-US-04: --check-staged を案内する'
        # 実装が受理するオプションはヘルプに載っていなければ利用者から見えない。
        # 書式行にも載っていなければ、起動方法として読み取れない。
        When call usage
        The status should be success
        The output should include '--check-staged'
        The output should include '[--check-staged]'
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

      It '[Normal] T-SSA-PA-15: --check-staged → check-staged'
        When call parse_args --check-staged
        The output should equal 'check-staged'
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

      It '[Edge] T-SSA-PA-16: --check は --check-staged より優先される（check-staged が後）'
        # 併記されたときは検査範囲の広いほうを採る。--check-staged はソースの git 状態だけを
        # 見る最も狭い検査であり、配布物を一切見ないため最下位。
        When call parse_args --check --check-staged
        The output should equal 'check'
        The status should be success
      End

      It '[Edge] T-SSA-PA-17: --check は --check-staged より優先される（check-staged が先）'
        # 隣接する境界（check 対 check-staged）だけは両方の順序で確かめる。
        # 全オプションを読んでから判定するため、指定順に依存しない。
        When call parse_args --check-staged --check
        The output should equal 'check'
        The status should be success
      End

      It '[Edge] T-SSA-PA-18: --check-head は --check-staged より優先される'
        # check-head 対 check-staged は check 経由で推移的に定まる組であり、
        # 既存 T-SSA-PA-09 と同様に片方の順序で足りる。
        When call parse_args --check-staged --check-head
        The output should equal 'check-head'
        The status should be success
      End

      It '[Edge] T-SSA-PA-19: --help は --check-staged より優先される'
        # help 対 check-staged も推移的に定まる組。help は何も検査せず案内するだけなので、
        # 併記されたら常に help が勝つ。
        When call parse_args --check-staged --help
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

      It '[Normal] T-SSA-CT-03: 内容が同じファイルは書き換えない'
        # 宛先を作り直すのではなくファイル単位で更新する根拠。同一内容のファイルに
        # 触らないので、同期が生む変更は実際に差分のあるファイルだけに限られる。
        # 判定は mtime ではなく内容で行う: git は mtime を記録せず clone や rebase が
        # 操作時刻で上書きするため、宛先の方が新しく見える状態は普通に起こりうる。
        keep_unchanged_mtime() {
          copy_tree "${repo}/skills/_cle-libs" "${repo}/out" || return 1
          touch -t 202001010000 "${repo}/out/libs/file-io/path-utils.ts"
          local before after
          before="$(stat -c %Y "${repo}/out/libs/file-io/path-utils.ts")"
          copy_tree "${repo}/skills/_cle-libs" "${repo}/out" || return 1
          after="$(stat -c %Y "${repo}/out/libs/file-io/path-utils.ts")"
          [[ "$before" == "$after" ]] || return 1
          echo 'untouched'
        }
        When call keep_unchanged_mtime
        The status should be success
        The output should equal 'untouched'
      End

      It '[Normal] T-SSA-CT-04: 内容が異なるファイルは書き換える'
        # ファイル単位の更新に切り替えても、差分のあるファイルは必ず直る。
        # mtime 判定ならここで取りこぼす（宛先の方が新しいため）。
        BeforeCall 'copy_tree "${repo}/skills/_cle-libs" "${repo}/out"; echo drift >"${repo}/out/libs/file-io/path-utils.ts"; touch -t 203001010000 "${repo}/out/libs/file-io/path-utils.ts"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The contents of file "${repo}/out/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-CT-02: 宛先に残っていた古いファイルを消す'
        # ファイル単位の更新は上書きするだけで消さないため、明示的な削除が無いと
        # 削除済みソースの残骸が配布物に残り続ける。
        BeforeCall 'mkdir -p "${repo}/out"; echo stale >"${repo}/out/stale.ts"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/stale.ts" should not be exist
        The path "${repo}/out/libs/file-io/path-utils.ts" should be exist
      End

      It '[Edge] T-SSA-CT-05: ソースに無いディレクトリを消す'
        # ファイルだけ消すと空ディレクトリが残り、diff -r が片側だけの
        # ディレクトリを差分として報告して検査が永久に失敗する。
        BeforeCall 'mkdir -p "${repo}/out/gone/deep"; echo stale >"${repo}/out/gone/deep/stale.ts"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/gone" should not be exist
        The path "${repo}/out/libs/file-io/path-utils.ts" should be exist
      End

      It '[Edge] T-SSA-CT-06: ソース側の空ディレクトリを複製する'
        # ファイルを頼りにディレクトリを作ると、ソースの空ディレクトリが宛先に
        # 現れず diff -r が差分として報告する。git は空ディレクトリを追跡しないが
        # 作業ツリーには存在しうる。
        BeforeCall 'mkdir -p "${repo}/skills/_cle-libs/empty-dir"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/empty-dir" should be directory
      End

      It '[Edge] T-SSA-CT-07: 宛先がディレクトリでもファイル同期元を置ける'
        # run_check は 3 つの同期元を同じ一時パスに順に複製する。2 番目が
        # deno.json（ファイル）なので、1 番目のディレクトリが残った宛先に
        # ファイルを置く場面が必ず通る。ファイル単位更新は種類の違う宛先を
        # 上書きできないため、この差し替えが検査の成立条件になる。
        BeforeCall 'mkdir -p "${repo}/out/leftover"'
        When call copy_tree "${repo}/deno.json" "${repo}/out"
        The status should be success
        The path "${repo}/out" should be file
        The contents of file "${repo}/out" should equal '{"tasks":{}}'
      End

      It '[Edge] T-SSA-CT-08: 宛先がファイルでもディレクトリ同期元を置ける'
        # T-SSA-CT-07 の逆順。run_check の 3 番目は _cle-libs（ディレクトリ）で、
        # 2 番目が残したファイルが宛先に居る。
        BeforeCall 'echo leftover >"${repo}/out"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out" should be directory
        The path "${repo}/out/libs/file-io/path-utils.ts" should be exist
      End

      It '[Edge] T-SSA-CT-09: 宛先にディレクトリが残っていてもネストしたファイルを置ける'
        # T-SSA-CT-07 は $dest 自身の種別違いだが、こちらはツリー内部のネストした
        # 相対パス（libs/file-io/path-utils.ts）で種別が食い違う場面。前回の同期時に
        # ディレクトリだった名前が今はファイルなので、宛先には残骸のディレクトリが
        # 居る。ファイル単位更新は種類の違う宛先を上書きできないため、コピー前に
        # 取り除かないと 1 回目の同期は成功を報告したままファイルを置き損ねる。
        BeforeCall 'mkdir -p "${repo}/out/libs/file-io/path-utils.ts"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/libs/file-io/path-utils.ts" should be file
        The contents of file "${repo}/out/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
        The stderr should equal ''
      End

      It '[Edge] T-SSA-CT-10: 宛先にファイルが残っていてもネストしたディレクトリを置ける'
        # T-SSA-CT-09 の逆向き。T-SSA-CT-08 は $dest 自身の種別違いだが、こちらは
        # ツリー内部のネストした相対パス（libs/file-io）で種別が食い違う場面。前回の
        # 同期時にファイルだった名前が今はディレクトリなので、宛先には残骸のファイルが
        # 居る。ディレクトリは種類の違う宛先の上に作れないため、作る前に取り除かないと
        # 同期はツリーの複製を最後まで終えられない。
        BeforeCall 'mkdir -p "${repo}/out/libs"; echo leftover >"${repo}/out/libs/file-io"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/libs/file-io" should be directory
        The path "${repo}/out/libs/file-io/path-utils.ts" should be file
        The contents of file "${repo}/out/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
      End

      It '[Edge] T-SSA-CT-11: 祖先パスに残骸ファイルがあってもその配下のツリー全体を作れる'
        # T-SSA-CT-10 の残骸ファイルはソース側で末端のディレクトリ（libs/file-io）に
        # あたるため、取り除いた後にその配下へ作るものが無い。こちらは残骸ファイルが
        # これから作る相対パスの祖先（libs）に居る場面で、これを取り除けて初めて配下の
        # libs/file-io とその中のファイルまで作れる。ディレクトリ一覧は整列済みなので
        # 祖先が子孫より先に処理される、という実装コメントの根拠を確かめるケース。
        BeforeCall 'mkdir -p "${repo}/out"; echo leftover >"${repo}/out/libs"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/libs" should be directory
        The path "${repo}/out/libs/file-io" should be directory
        The path "${repo}/out/libs/file-io/path-utils.ts" should be file
        The contents of file "${repo}/out/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
      End

      It '[Edge] T-SSA-CT-12: 両方向の種別衝突を 1 回の実行で解消する'
        # T-SSA-CT-09 〜 T-SSA-CT-11 は 1 回の実行で片方向の衝突しか通らない。
        # 2 つのガードはディレクトリ側ループとファイル側ループという別の場所に
        # 居て順番も固定なので、「両方が 1 回のパスで噛み合う」ことはどちらの
        # 単独ケースからも導けない。それを唯一証明するケース。
        # ソースに types/x.types.ts を足すのは、既存パスだけでは逆向きを作れない
        # ため（ソースのディレクトリ libs・libs/file-io は唯一のソースファイルの
        # 祖先で、そこをファイルにすると順向きの衝突が作れなくなる）。
        # 宛先ファイル↔ソースディレクトリ: out/types
        # 宛先ディレクトリ↔ソースファイル: out/libs/file-io/path-utils.ts
        # 併せて、両ガードが動いた後も残骸の刈り取りが走ることを out/other で確かめる。
        BeforeCall 'mkdir -p "${repo}/skills/_cle-libs/types"; echo "export {};" >"${repo}/skills/_cle-libs/types/x.types.ts"; mkdir -p "${repo}/out/libs/file-io/path-utils.ts"; echo leftover >"${repo}/out/types"; mkdir -p "${repo}/out/other"; echo leftover >"${repo}/out/other/stale-dir"'
        When call copy_tree "${repo}/skills/_cle-libs" "${repo}/out"
        The status should be success
        The path "${repo}/out/libs/file-io" should be directory
        The path "${repo}/out/libs/file-io/path-utils.ts" should be file
        The contents of file "${repo}/out/libs/file-io/path-utils.ts" should equal 'export const noop = 0;'
        The path "${repo}/out/types" should be directory
        The path "${repo}/out/types/x.types.ts" should be file
        The contents of file "${repo}/out/types/x.types.ts" should equal 'export {};'
        The path "${repo}/out/other" should not be exist
        The stderr should equal ''
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

  Describe 'run_check_staged'
    # 同期は作業ツリーから配布物を生成するが、lefthook は未ステージ変更を stash しない。
    # そのため「ソース A をステージし、ソース B に未ステージ編集がある」コミットは、
    # ステージしていない B 由来の配布物だけが入り、B のソース変更は入らない状態になる。
    # コミット単体で整合しないため、後から pre-push の --check-head が原因から遠い形で
    # push を拒否する。それをコミット時点で弾く検査。

    Describe 'When: 正常系'
      It '[Normal] T-SSA-RCS-01: 全ソースがコミット済みでクリーンなら成功する'
        # 検査の基準点。index と作業ツリーが一致しているなら通さなければならない。
        # stderr の空は主張しない: BeforeCall の git add -A が環境次第で
        # 改行変換の warning を出しうるため、検査と無関係な理由で落ちる形は採らない。
        BeforeCall 'commit_fixture_repo "$repo"'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
        The stderr should not include 'unstaged changes'
      End

      It '[Normal] T-SSA-RCS-02: ソースがステージ済みのみなら成功する'
        # pre-commit における通常のケース。T-SSA-RCS-01 とはクリーンかステージ済みかで
        # 主張が別であり、こちらで失敗する実装は全てのコミットを止めてしまう。
        # porcelain は "M " で、2 文字目ではなく 1 文字目を見る実装がここで落ちる。
        BeforeCall 'commit_fixture_repo "$repo"; echo "agent: codex" >"${repo}/.config/chatlog-exporter/config.yaml"; git -C "$repo" add -- .config/chatlog-exporter'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
      End

      It '[Normal] T-SSA-RCS-12: ソース直下の __tests__ 配下だけが未ステージなら成功する'
        # __tests__ は同期対象外なので、この編集は配布物を一切変化させない。それでも
        # 止めていたのが本件の不具合であり、コミットできない理由にならない編集で
        # コミットが止まる。
        #
        # 同時に、除外 pathspec の書式を固定する回帰テストでもある。
        # ':(exclude)<src>/**/__tests__/**' 形式では `**/` が 0 階層にマッチせず、
        # ソース直下にあるこの skills/_cle-libs/__tests__/ が除外から漏れる（実測）。
        # 全階層で効くのは ':(exclude)*/__tests__/*' 形式のみ。深い階層だけを見る
        # T-SSA-RCS-13 は両形式で通ってしまうため、両者を分けられるのはこのケースだけ。
        #
        # トレードオフ: pathspec は EXCLUDE_NAME を再利用するので名前の定義は 1 箇所の
        # ままだが、除外の機構は find -prune と git pathspec の 2 系統になる。
        # 一方だけを変えると同期と検査が食い違うため、両者は揃えて直す必要がある。
        BeforeCall 'commit_fixture_repo "$repo"; echo "export const edited = 1;" >"${repo}/skills/_cle-libs/__tests__/unit/noop.unit.spec.ts"'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
        The stderr should not include 'noop.unit.spec.ts'
      End

      It '[Normal] T-SSA-RCS-13: 深い階層の __tests__ 配下だけが未ステージなら成功する'
        # 除外は find -prune と同じく全階層に効かなければならない。ソース直下だけを
        # 除く実装（先頭を固定した pathspec 等）をここで排除する。
        BeforeCall 'commit_fixture_repo "$repo"; echo "export const edited = 1;" >"${repo}/skills/_cle-libs/libs/__tests__/helpers/__tests__/deep.ts"'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
        The stderr should not include 'deep.ts'
      End
    End

    Describe 'When: 異常系'
      It '[Error] T-SSA-RCS-03: 1 つのソースに未ステージ編集があれば失敗しそのパスを報告する'
        # porcelain " M"。報告はエントリ名ではなくパス単位でなければ、どのファイルを
        # ステージすればよいのか利用者に伝わらない。対処方法も併せて出す。
        BeforeCall 'commit_fixture_repo "$repo"; echo "agent: codex" >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include '.config/chatlog-exporter/config.yaml'
        The stderr should include 'unstaged changes'
        # 'stage' だけでは "unstaged changes" の部分一致で満たされてしまい、対処方法の行を
        # 消しても気づけない。Hint: 行にしか現れない語で固定する。
        The stderr should include 'Hint:'
        The stderr should include 'git stash push'
      End

      It '[Error] T-SSA-RCS-04: A をステージし B が未ステージなら失敗する'
        # 本件の存在理由そのもの（PR #413 の再現）。deno.json は "M " なので報告に
        # 出してはならない。出るなら、ステージ済みの変更まで巻き込んでいる。
        BeforeCall 'commit_fixture_repo "$repo"; echo "{\"tasks\":{\"x\":\"y\"}}" >"${repo}/deno.json"; git -C "$repo" add -- deno.json; echo "agent: codex" >"${repo}/.config/chatlog-exporter/config.yaml"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include '.config/chatlog-exporter/config.yaml'
        The stderr should not include 'deno.json'
      End

      It '[Error] T-SSA-RCS-05: 未ステージの削除があれば失敗する'
        # porcelain " D"。同期は削除を反映して配布物からもファイルを消すが、ソースの
        # 削除はステージされていないためコミットに入らない。配布物だけが消えた
        # コミットになる。
        BeforeCall 'commit_fixture_repo "$repo"; rm "${repo}/skills/_cle-libs/libs/file-io/path-utils.ts"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include 'path-utils.ts'
      End

      It '[Error] T-SSA-RCS-06: ソース配下の追跡外の新規ファイルがあれば失敗する'
        # porcelain "??"。git diff 単独では追跡外ファイルが見えないため、
        # git status --porcelain を選んだ根拠になるケース。copy_tree は作業ツリーを
        # 読むので、このファイルは配布物に入るがソース側はコミットに入らない。
        # 新規ファイルは既に追跡されている dics/ の下に置く: ディレクトリ全体が
        # 追跡外だと porcelain が "?? <dir>/" に畳み、ファイルパスの主張が成立しない。
        BeforeCall 'commit_fixture_repo "$repo"; echo "extra" >"${repo}/.config/chatlog-exporter/dics/extra.dic"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include 'dics/extra.dic'
      End

      It '[Error] T-SSA-RCS-07: ステージ済みの上にさらに未ステージ編集があれば失敗する'
        # porcelain "MM"。「そのソースがステージされているか」だけを見る実装はここを
        # 取り落とす。"M "（T-SSA-RCS-02）とは別の同値クラスである。
        BeforeCall 'commit_fixture_repo "$repo"; echo "{\"tasks\":{\"v\":\"1\"}}" >"${repo}/deno.json"; git -C "$repo" add -- deno.json; echo "{\"tasks\":{\"v\":\"2\"}}" >"${repo}/deno.json"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include 'deno.json'
      End

      It '[Error] T-SSA-RCS-08: 2 つのソースが未ステージなら両方を報告する'
        # 最初の 1 件で return 1 する実装を排除する。1 回の実行で全て直せなければ、
        # 利用者はコミットのたびに残りを 1 件ずつ知らされることになる。
        BeforeCall 'commit_fixture_repo "$repo"; echo "agent: codex" >"${repo}/.config/chatlog-exporter/config.yaml"; echo "{\"tasks\":{\"x\":\"y\"}}" >"${repo}/deno.json"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include '.config/chatlog-exporter/config.yaml'
        The stderr should include 'deno.json'
      End

      It '[Error] T-SSA-RCS-14: __tests__ の内と外が両方未ステージなら外の分だけ報告して失敗する'
        # 除外は「未ステージ変更が __tests__ 以外にもあるか」の判定を曇らせてはならない。
        # 1 件でも __tests__ 外にあれば従来どおり止める一方、同じ実行に混ざった
        # __tests__ 側は報告に出してはならない。除外を「全て __tests__ なら成功」と
        # 実装すると前半で、除外を捨てると後半で落ちる。
        BeforeCall 'commit_fixture_repo "$repo"; echo "export const edited = 1;" >"${repo}/skills/_cle-libs/__tests__/unit/noop.unit.spec.ts"; echo "export const noop = 1;" >"${repo}/skills/_cle-libs/libs/file-io/path-utils.ts"'
        When call run_check_staged "$repo"
        The status should be failure
        The stderr should include 'path-utils.ts'
        The stderr should not include 'noop.unit.spec.ts'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-SSA-RCS-09: ソース外の未ステージ変更では失敗しない'
        # 同期ソースと無関係なコミットまで止める実装を排除する。追跡済みの変更（" M"）と
        # 追跡外の新規（"??"）を両方置くのは、pathspec を渡さずリポジトリ全体の
        # git status を見ている実装をどちらの形でも捕まえるため。
        BeforeCall 'echo "# readme" >"${repo}/README.md"; commit_fixture_repo "$repo"; echo "# edited" >"${repo}/README.md"; mkdir -p "${repo}/docs"; echo "note" >"${repo}/docs/note.md"'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
        The stderr should not include 'unstaged changes'
      End

      It '[Edge] T-SSA-RCS-10: 検査は作業ツリーを書き換えない'
        # 却下した「index をスナップショットする」案の混入を防ぐ。git stash を使う実装は
        # ここで未ステージ編集を巻き上げてしまい落ちる。
        # git status は stat キャッシュを更新しうるので、index のバイト列ではなく
        # git status --porcelain の出力の一致をもって読み取り専用を示す（T-SSA-RCH-07 と同じ形）。
        staged_check_preserves_worktree() {
          local before after
          commit_fixture_repo "$repo" || return 1
          echo 'agent: codex' >"${repo}/.config/chatlog-exporter/config.yaml"
          before="$(git -C "$repo" status --porcelain)"
          run_check_staged "$repo" >/dev/null 2>&1 || true
          after="$(git -C "$repo" status --porcelain)"
          [[ "$before" == "$after" ]] || return 1
          cat "${repo}/.config/chatlog-exporter/config.yaml"
        }
        When call staged_check_preserves_worktree
        The status should be success
        The output should equal 'agent: codex'
      End

      It '[Edge] T-SSA-RCS-11: コミットが無く全てステージ済みなら成功する'
        # 検査が HEAD 基準ではなく index 基準であることの主張。git diff HEAD で
        # 実装すると HEAD が無いここで落ちる。commit_fixture_repo は呼ばない
        # （git add は identity 設定を必要としない）。porcelain は全て "A "。
        # HEAD 無しで失敗する run_check_head（T-SSA-RCH-04）と対照的である。
        BeforeCall 'git -C "$repo" add -A'
        When call run_check_staged "$repo"
        The status should be success
        The output should include 'no unstaged changes'
      End
    End
  End
End
