# src: ./scripts/__tests__/unit/get-filelist.unit.spec.sh
# @(#) : unit spec for get-filelist library pure functions
#        対象: normalize_path / is_glob_pattern / args_to_filter
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash

Describe 'get-filelist.lib.sh'
  Include runners/libs/get-filelist.lib.sh

  Describe 'normalize_path'
    Describe 'When: 正常系'
      It '[Normal] T-LIB-GFL-01: バックスラッシュ区切りをスラッシュ区切りに変換する'
        When call normalize_path 'a\b\c'
        The output should equal 'a/b/c'
      End

      It '[Normal] T-LIB-GFL-02: テストディレクトリパスを正規化する'
        When call normalize_path 'scripts\__tests__\unit'
        The output should equal 'scripts/__tests__/unit'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-LIB-GFL-03: 既にスラッシュ区切りのパスはそのまま返す'
        When call normalize_path 'a/b/c'
        The output should equal 'a/b/c'
      End

      It '[Edge] T-LIB-GFL-04: 空文字列は空文字列を返す'
        When call normalize_path ''
        The output should equal ''
      End
    End
  End

  Describe 'is_glob_pattern'
    Describe 'When: 正常系'
      It '[Normal] T-LIB-GFL-05: アスタリスクを含むパターンは成功を返す'
        When call is_glob_pattern '*.sh'
        The status should be success
      End

      It '[Normal] T-LIB-GFL-06: クエスチョンマークを含むパターンは成功を返す'
        When call is_glob_pattern 'a?.sh'
        The status should be success
      End

      It '[Normal] T-LIB-GFL-07: メタ文字を含まない文字列は失敗を返す'
        When call is_glob_pattern 'a.sh'
        The status should be failure
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-LIB-GFL-08: 空文字列は失敗を返す'
        When call is_glob_pattern ''
        The status should be failure
      End
    End
  End

  Describe 'args_to_filter'
    Describe 'When: 正常系'
      It '[Normal] T-LIB-GFL-09: アスタリスクを任意文字列の正規表現に変換する'
        When call args_to_filter '*.spec.sh'
        The output should equal '.*.spec.sh'
      End

      It '[Normal] T-LIB-GFL-10: クエスチョンマークを任意1文字の正規表現に変換する'
        When call args_to_filter 'a?.sh'
        The output should equal 'a..sh'
      End
    End

    Describe 'When: エッジケース'
      It '[Edge] T-LIB-GFL-11: メタ文字を含まない文字列はそのまま返す'
        When call args_to_filter 'a.sh'
        The output should equal 'a.sh'
      End
    End
  End
End
