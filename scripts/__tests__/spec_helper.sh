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
# @description Create a throwaway setup-chatlogs skill directory holding the assets to deploy
#
# Mirrors the layout the real skill ships with, so the copy examples can run
# against a fixture instead of the checkout.
#
# @stdout Absolute path to the new skill directory
make_fixture_skill_dir() {
  local skill_dir
  skill_dir="$(mktemp -d)"
  mkdir -p "${skill_dir}/assets/.config/chatlog-exporter/dics" "${skill_dir}/_scripts/libs"
  echo 'agent: claude' >"${skill_dir}/assets/.config/chatlog-exporter/config.yaml"
  echo 'category' >"${skill_dir}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill_dir}/assets/deno.json"
  echo 'export const noop = () => {};' >"${skill_dir}/_scripts/libs/noop.ts"
  echo "$skill_dir"
}

##
# @description Create a throwaway git repository holding a runner that sources the real library
#
# The wrapper lives in `<repo>/runners/` and sources the checkout's actual
# `init-vars.lib.sh` by absolute path, so `BASH_SOURCE[1]` resolves SCRIPT_ROOT
# to the fixture repository rather than to the spec file. The library under test
# is never copied: the real file is exercised so a regression cannot pass.
#
# The wrapper prints `SCRIPT_ROOT` and `PROJECT_ROOT` one per line.
#
# @arg $1 string Absolute path to the checkout root holding runners/libs/init-vars.lib.sh
# @stdout Absolute path to the new repository root
make_fixture_runner_repo() {
  local checkout_root="$1"
  local repo
  repo="$(mktemp -d)"
  mkdir -p "${repo}/runners"
  cat >"${repo}/runners/wrapper.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
. "${checkout_root}/runners/libs/init-vars.lib.sh"
echo "SCRIPT_ROOT=\${SCRIPT_ROOT}"
echo "PROJECT_ROOT=\${PROJECT_ROOT}"
EOF
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
