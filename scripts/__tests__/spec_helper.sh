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
# checkout: asserting on it would turn "someone edited skills/_cle-libs/ and did
# not re-sync" into a red unit suite, and --fail-fast=1 would stop everything.
#
# skills/_cle-libs/ carries a nested __tests__/helpers/__tests__ so the specs can
# prove the exclusion prunes at every depth, not just at the top level.
#
# @stdout Absolute path to the new repository root
make_fixture_source_repo() {
  local repo
  repo="$(mktemp -d)"
  mkdir -p \
    "${repo}/.config/chatlog-exporter/dics" \
    "${repo}/skills/_cle-libs/libs/file-io" \
    "${repo}/skills/_cle-libs/__tests__/unit" \
    "${repo}/skills/_cle-libs/libs/__tests__/helpers/__tests__"
  echo 'agent: claude' >"${repo}/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${repo}/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${repo}/deno.json"
  echo 'export const noop = 0;' >"${repo}/skills/_cle-libs/libs/file-io/path-utils.ts"
  echo 'export {};' >"${repo}/skills/_cle-libs/__tests__/unit/noop.unit.spec.ts"
  echo 'export {};' >"${repo}/skills/_cle-libs/libs/__tests__/helpers/__tests__/deep.ts"
  git -C "$repo" init -q
  echo "$repo"
}

##
# @description Commit the fixture repository's current tree as a single commit
#
# `make_fixture_source_repo` only runs `git init`, so the fixture has no HEAD and
# `git archive HEAD` fails there. Anything exercising the committed tree has to
# create a commit first, and the specs need to do it more than once: the point of
# --check-head is the gap between HEAD and the working tree, which only exists
# once part of the tree is committed and part is not.
#
# The identity is set on the repository rather than relied upon globally. CI and
# hook environments frequently have no user.email configured, and `git commit`
# refuses to run without one.
#
# Signing is disabled explicitly for the same reason in reverse: a developer with
# commit.gpgsign=true globally would otherwise have every fixture commit prompt
# for a passphrase or fail outright. The fixture commits are throwaway, so their
# signatures carry no meaning.
#
# @arg $1 string Absolute path to the fixture repository root
# @return 0 If the commit is created
commit_fixture_repo() {
  local repo="$1"
  git -C "$repo" config user.email 'spec@example.com'
  git -C "$repo" config user.name 'Spec Fixture'
  git -C "$repo" config commit.gpgsign false
  git -C "$repo" add -A
  git -C "$repo" commit -q --no-gpg-sign -m 'fixture'
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
  mkdir -p "${skill_dir}/assets/.config/chatlog-exporter/dics" "${skill_dir}/assets/_cle-libs/libs"
  echo 'agent: claude' >"${skill_dir}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill_dir}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill_dir}/assets/deno.json"
  echo 'export {};' >"${skill_dir}/assets/_cle-libs/libs/noop.ts"
  echo "$skill_dir"
}

##
# @description Create a throwaway repository whose .claude/skills is a symlink to its skills/
#
# Reproduces the layout that makes --force destructive in this checkout: the
# skill ships from <repo>/skills/setup-chatlogs/, and <repo>/.claude/skills is a
# symlink to ../skills, so the _cle-libs destination resolves back onto the shared
# library at <repo>/skills/_cle-libs.
#
# skills/_cle-libs/__tests__/keep.md is the marker the specs assert on: the
# distribution copy under skills/setup-chatlogs/assets/_cle-libs/ deliberately omits
# __tests__, so a destructive deploy loses the file and a guarded one keeps it.
#
# The root is always under mktemp -d, never the checkout: these specs exercise
# the destructive path, so pointing them at the real tree would delete the
# actual skills/_cle-libs/__tests__.
#
# @stdout Absolute path to the new repository root
make_fixture_symlinked_repo() {
  local repo skill
  repo="$(mktemp -d)"
  skill="${repo}/skills/setup-chatlogs"

  # 共有ライブラリの実体。__tests__ は配布物には含まれないため、
  # 破壊的な展開が起きるとこのファイルが失われる。
  mkdir -p "${repo}/skills/_cle-libs/libs" "${repo}/skills/_cle-libs/__tests__"
  echo 'export {};' >"${repo}/skills/_cle-libs/libs/noop.ts"
  echo '# keep' >"${repo}/skills/_cle-libs/__tests__/keep.md"

  # 配布物としてのスキルディレクトリ（__tests__ を持たない）。
  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/assets/_cle-libs/libs"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/assets/_cle-libs/libs/noop.ts"

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

  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/assets/_cle-libs/libs" "${skill}/scripts"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/assets/_cle-libs/libs/noop.ts"
  echo '# setup' >"${skill}/SKILL.md"

  # 兄弟スキル。展開先を取り違えると巻き添えで消える位置に置く。
  mkdir -p "${repo}/.claude/skills/export-chatlogs"
  echo '# export' >"${repo}/.claude/skills/export-chatlogs/SKILL.md"

  git -C "$repo" init -q
  echo "$repo"
}

##
# @description Create a throwaway home holding a skill installed in User scope
#
# Reproduces what a skill manager leaves behind when it installs into the user's
# home rather than a project: the skill sits at
# <home>/.claude/skills/setup-chatlogs/ and the project it is run against is a
# separate directory entirely. That gap is the bug this fixture exists for — the
# shared library must land next to the skill, not next to the project, or the
# sibling skills' ../../_cle-libs/ imports resolve to nothing.
#
# export-chatlogs/ carries the import that has to resolve, so the specs can
# assert on the destination the real skills actually reach for.
#
# @stdout Absolute path to the new home root
make_fixture_user_scope_home() {
  local home skill
  home="$(mktemp -d)"
  skill="${home}/.claude/skills/setup-chatlogs"

  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/assets/_cle-libs/libs" "${skill}/scripts"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/assets/_cle-libs/libs/noop.ts"
  echo '# setup' >"${skill}/SKILL.md"

  # 兄弟スキル。この import が解決する位置が _cle-libs の正しい展開先である。
  mkdir -p "${home}/.claude/skills/export-chatlogs/scripts"
  echo '# export' >"${home}/.claude/skills/export-chatlogs/SKILL.md"
  echo "import '../../_cle-libs/libs/noop.ts';" >"${home}/.claude/skills/export-chatlogs/scripts/export-chatlogs.ts"

  echo "$home"
}

##
# @description Create a throwaway checkout whose skills/ holds the shared library itself
#
# The source-checkout layout without the symlink: the skill ships from
# <repo>/skills/setup-chatlogs/ and the shared library it deploys lives beside it
# at <repo>/skills/_cle-libs. Deploying the library next to the skill therefore
# targets the development tree directly, with no link in the way.
#
# skills/_cle-libs/__tests__/keep.md is the marker the specs assert on, and the
# one thing that tells this layout apart from a legitimate User-scope install:
# the distribution copy under skills/setup-chatlogs/assets/_cle-libs/ never carries
# __tests__, because sync-skill-assets.sh excludes it.
#
# Always under mktemp -d, never the checkout: this is the destructive path.
#
# @stdout Absolute path to the new repository root
make_fixture_source_checkout() {
  local repo skill
  repo="$(mktemp -d)"
  skill="${repo}/skills/setup-chatlogs"

  # 共有ライブラリの実体。__tests__ は配布物には含まれない。
  mkdir -p "${repo}/skills/_cle-libs/libs" "${repo}/skills/_cle-libs/__tests__"
  echo 'export {};' >"${repo}/skills/_cle-libs/libs/noop.ts"
  echo '# keep' >"${repo}/skills/_cle-libs/__tests__/keep.md"

  # 配布物としてのスキルディレクトリ（__tests__ を持たない）。
  mkdir -p "${skill}/assets/.config/chatlog-exporter/dics" "${skill}/assets/_cle-libs/libs"
  echo 'agent: claude' >"${skill}/assets/.config/chatlog-exporter/config.yaml"
  echo 'develop' >"${skill}/assets/.config/chatlog-exporter/dics/category.dic"
  echo '{"tasks":{}}' >"${skill}/assets/deno.json"
  echo 'export {};' >"${skill}/assets/_cle-libs/libs/noop.ts"

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
