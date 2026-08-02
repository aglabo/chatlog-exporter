# src: ./scripts/__tests__/spec_helper.sh
# @(#) : ShellSpec shared setup
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

# shellcheck shell=bash

set -eu

##
# @description Create a throwaway repository holding a minimal skills tree
#
# The spec files exercise functions that create and delete directories, so each
# example works inside its own git repository rather than the real checkout.
#
# @stdout Absolute path to the new repository root
make_fixture_repo() {
  local repo
  repo="$(mktemp -d)"
  mkdir -p "${repo}/skills/export-chatlogs" "${repo}/skills/filter-chatlogs" "${repo}/.claude"
  echo '# export' >"${repo}/skills/export-chatlogs/SKILL.md"
  echo '# filter' >"${repo}/skills/filter-chatlogs/SKILL.md"
  git -C "$repo" init -q
  echo "$repo"
}

##
# @description Report whether the shell cannot create real symbolic links
#
# Phrased negatively because `Skip if` takes a plain condition and cannot
# negate one itself.
#
# @return 0 If symbolic links are unavailable
# @return 1 If symbolic links work
no_symlink_support() {
  ! supports_symlinks
}

##
# @description Report whether the shell can create real symbolic links
#
# On Windows Git Bash without Developer Mode `ln -s` silently copies, so the
# symlink examples are skipped instead of failing.
#
# @return 0 If a real symbolic link can be created
# @return 1 Otherwise
supports_symlinks() {
  local probe link
  probe="$(mktemp -d)"
  mkdir "${probe}/target"
  link="${probe}/link"
  MSYS=winsymlinks:nativestrict ln -s ./target "$link" 2>/dev/null || true
  if [[ -L "$link" ]]; then
    rm -rf "$probe"
    return 0
  fi
  rm -rf "$probe"
  return 1
}
