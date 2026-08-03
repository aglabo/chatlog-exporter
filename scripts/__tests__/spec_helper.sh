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
# @description Create a throwaway repository holding a minimal sync source tree
#
# Mirrors the three sync sources sync-skill-assets.sh reads, shrunk to tiny
# stand-in payloads. The specs must never drive the sync against the real
# checkout: asserting on it would turn "someone edited skills/_scripts/ and did
# not re-sync" into a red unit suite, and --fail-fast=1 would stop everything.
#
# skills/_scripts/ carries a nested __tests__/helpers/__tests__ so the specs can
# prove the exclusion prunes at every depth, not just at the top level.
#
# @stdout Absolute path to the new repository root
make_fixture_source_repo() {
  local repo
  repo="$(mktemp -d)"
  mkdir -p \
    "${repo}/.config/chatlog-exporter/dics" \
    "${repo}/skills/_scripts/libs/file-io" \
    "${repo}/skills/_scripts/__tests__/unit" \
    "${repo}/skills/_scripts/libs/__tests__/helpers/__tests__"
  echo 'agent: claude' >"${repo}/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${repo}/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${repo}/deno.json"
  echo 'export const noop = 0;' >"${repo}/skills/_scripts/libs/file-io/path-utils.ts"
  echo 'export {};' >"${repo}/skills/_scripts/__tests__/unit/noop.unit.spec.ts"
  echo 'export {};' >"${repo}/skills/_scripts/libs/__tests__/helpers/__tests__/deep.ts"
  git -C "$repo" init -q
  echo "$repo"
}

##
# @description Create a throwaway skill directory holding a minimal deploy tree
#
# Mirrors the layout setup-chatlogs.sh expects under the skill directory, but
# with tiny stand-in payloads: the specs assert on exact file contents, so the
# real .config/chatlog-exporter/ must not be copied in here.
#
# @stdout Absolute path to the new skill directory
make_fixture_skill_dir() {
  local skill_dir
  skill_dir="$(mktemp -d)"
  mkdir -p "${skill_dir}/assets/.config/chatlog-exporter/dics" "${skill_dir}/_scripts/libs"
  echo 'agent: claude' >"${skill_dir}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill_dir}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill_dir}/assets/deno.json"
  echo 'export {};' >"${skill_dir}/_scripts/libs/noop.ts"
  echo "$skill_dir"
}

##
# @description Create a throwaway repository whose .claude/skills is a symlink to its skills/
#
# Reproduces the layout that makes --force destructive in this checkout: the
# skill ships from <repo>/skills/setup-chatlogs/, and <repo>/.claude/skills is a
# symlink to ../skills, so the _scripts destination resolves back onto the shared
# library at <repo>/skills/_scripts.
#
# skills/_scripts/__tests__/keep.md is the marker the specs assert on: the
# distribution copy under skills/setup-chatlogs/_scripts/ deliberately omits
# __tests__, so a destructive deploy loses the file and a guarded one keeps it.
#
# The root is always under mktemp -d, never the checkout: these specs exercise
# the destructive path, so pointing them at the real tree would delete the
# actual skills/_scripts/__tests__.
#
# @stdout Absolute path to the new repository root
make_fixture_symlinked_repo() {
  local repo skill
  repo="$(mktemp -d)"
  skill="${repo}/skills/setup-chatlogs"

  # 共有ライブラリの実体。__tests__ は配布物には含まれないため、
  # 破壊的な展開が起きるとこのファイルが失われる。
  mkdir -p "${repo}/skills/_scripts/libs" "${repo}/skills/_scripts/__tests__"
  echo 'export {};' >"${repo}/skills/_scripts/libs/noop.ts"
  echo '# keep' >"${repo}/skills/_scripts/__tests__/keep.md"

  # 配布物としてのスキルディレクトリ（__tests__ を持たない）。
  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/_scripts/libs"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/_scripts/libs/noop.ts"

  mkdir -p "${repo}/.claude"
  (cd "${repo}/.claude" && MSYS=winsymlinks:nativestrict ln -s ../skills skills)

  git -C "$repo" init -q
  echo "$repo"
}

##
# @description Create a throwaway repository holding a skill installed the standard way
#
# Reproduces what a skill manager leaves behind in a distribution project: the
# skill sits at <repo>/.claude/skills/setup-chatlogs/ and .claude/skills is a
# real directory, not a symlink. This is the layout the deploy must succeed in,
# so no link is created here.
#
# The payloads mirror make_fixture_skill_dir: the specs assert on exact file
# contents, so the real .config/chatlog-exporter/ must not be copied in.
#
# export-chatlogs/SKILL.md is the marker the specs assert on: it is a sibling of
# the skill under <repo>/.claude/skills/, so a deploy that mistakes that
# directory for its own source tree would take the sibling down with it.
#
# @stdout Absolute path to the new repository root
make_fixture_installed_repo() {
  local repo skill
  repo="$(mktemp -d)"
  skill="${repo}/.claude/skills/setup-chatlogs"

  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/_scripts/libs" "${skill}/scripts"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/_scripts/libs/noop.ts"
  echo '# setup' >"${skill}/SKILL.md"

  # 兄弟スキル。展開先を取り違えると巻き添えで消える位置に置く。
  mkdir -p "${repo}/.claude/skills/export-chatlogs"
  echo '# export' >"${repo}/.claude/skills/export-chatlogs/SKILL.md"

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
