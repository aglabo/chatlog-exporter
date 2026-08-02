#!/usr/bin/env bash
# src: ./skills/setup-chatlogs/scripts/setup-chatlogs.sh
# @(#) : Deploy chatlog-exporter configuration and shared scripts into the current directory
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

set -euo pipefail

# Entries to deploy, as "<source relative to skill dir>|<destination relative to the target directory>".
# _scripts lands under .claude/skills/ so the ../../_scripts/ imports in the
# sibling skills resolve unchanged.
readonly DEPLOY_ENTRIES=(
  "assets/.config/chatlog-exporter|.config/chatlog-exporter"
  "assets/deno.json|deno.json"
  "_scripts|.claude/skills/_scripts"
)

##
# @description Copy one entry into the target directory unless the destination is taken
#
# The destination is treated as a single unit: when it already exists the whole
# entry is skipped rather than merged file by file, so local edits survive.
#
# @arg $1 string Source file or directory
# @arg $2 string Destination path
# @arg $3 string Non-empty to overwrite an existing destination
# @stdout A "Copied:" or "Skipped (exists):" report line
# @return 0 If the entry is copied or deliberately skipped
# @return 1 If the source does not exist
copy_entry() {
  local src="$1" dest="$2" force="$3"

  if [[ ! -e "$src" ]]; then
    echo "Error: source not found: $src" >&2
    return 1
  fi

  if [[ -z "$force" ]] && [[ -e "$dest" ]]; then
    echo "Skipped (exists): $dest"
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  # No trailing slash on dest, and remove it first, so a directory copy replaces
  # the destination instead of nesting a copy inside it.
  rm -rf "$dest"
  cp -r "$src" "$dest"
  echo "Copied: $dest"
}

##
# @description Verify every source exists before anything is copied
#
# Checked up front so a missing source aborts the run without leaving a
# partially deployed tree behind.
#
# @arg $1 string Skill directory holding assets/ and _scripts/
# @return 0 If every source is present
# @return 1 If a source is missing
assert_sources_exist() {
  local skill_dir="$1"
  local entry src

  for entry in "${DEPLOY_ENTRIES[@]}"; do
    src="${skill_dir}/${entry%%|*}"
    if [[ ! -e "$src" ]]; then
      echo "Error: source not found: $src" >&2
      return 1
    fi
  done
}

##
# @description Resolve a path to its real location, following symbolic links
#
# Resolving symlinks is the whole point: a destination that only overlaps the
# skill tree after the link is followed is exactly the case this guards against.
#
# `realpath -m` handles paths that do not exist yet, which the destinations
# normally do not. It is also the only mechanism that normalizes consistently
# here: on MSYS, `cd` through a symlink can report a different mount prefix
# (/tmp) than the one the caller passed in (/w/temp), and the two spellings of
# the same directory would then compare unequal.
#
# @arg $1 string Path to resolve, existing or not
# @stdout The resolved absolute path
resolve_real_path() {
  local path="$1"

  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$path"
    return
  fi

  # realpath が無い環境向けのフォールバック。存在する最深の祖先を解決し、
  # 残りの末尾を付け直す。
  local tail=""
  while [[ ! -e "$path" ]] && [[ "$path" == */* ]]; do
    tail="/${path##*/}${tail}"
    path="${path%/*}"
    [[ -z "$path" ]] && path="/"
  done

  local resolved
  resolved="$(cd "$path" 2>/dev/null && pwd -P)" || return 1
  echo "${resolved}${tail}"
}

##
# @description Reject a destination that resolves onto the skill's own source tree
#
# The skill ships from <skills root>/setup-chatlogs/, so when the destination
# resolves back inside that skills root the deploy would delete the very tree it
# copies from. In this repository .claude/skills is a symlink to ../skills, which
# makes the _scripts destination resolve onto the shared library and drop files
# the distribution omits, such as __tests__/.
#
# Source and destination are siblings in that layout, so comparing them directly
# would not catch it; the skills root is the subject that actually overlaps.
#
# @arg $1 string Skill directory holding assets/ and _scripts/
# @arg $2 string Destination path to check
# @return 0 If the destination is safe to write
# @return 1 If the destination overlaps the skills root
assert_dest_outside_source() {
  local skill_dir="$1" dest="$2"
  local skills_root real_dest

  skills_root="$(resolve_real_path "$(dirname "$skill_dir")")" || return 1
  real_dest="$(resolve_real_path "$dest")" || return 1

  # 末尾スラッシュを付けて比較し、/skills が /skills-old に一致しないようにする。
  if [[ "$real_dest" == "$skills_root" ]] ||
    [[ "$real_dest" == "${skills_root}/"* ]] ||
    [[ "$skills_root" == "${real_dest}/"* ]]; then
    echo "Error: destination resolves inside the skill source tree: ${dest} -> ${real_dest}" >&2
    echo "       refusing to deploy, as this would delete the skills at ${skills_root}" >&2
    return 1
  fi
}

##
# @description Resolve the skill directory holding SKILL.md
#
# This file lives in <skill dir>/scripts/, so the skill directory is two levels up.
#
# @stdout Path to the skill directory
resolve_skill_dir() {
  # Subshell so resolving the path never moves the caller's working directory.
  (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
}

##
# @description Resolve the directory to deploy into
#
# The current working directory is the base, so the deployment lands where the
# command is run from. This matches how the deployed shared library resolves its
# own project root at runtime, which would otherwise disagree with a
# repository-root base when a skill is invoked from a subdirectory.
#
# @stdout Absolute path to the directory to deploy into
resolve_target_dir() {
  pwd
}

##
# @description Verify no destination resolves onto the skill's own source tree
#
# Checked up front, before any destination is removed, so an overlapping entry
# aborts the run while the source tree is still intact.
#
# @arg $1 string Skill directory holding assets/ and _scripts/
# @arg $2 string Directory to deploy into
# @return 0 If every destination is safe to write
# @return 1 If a destination overlaps the skills root
assert_destinations_safe() {
  local skill_dir="$1" base="$2"
  local entry real_skill real_base

  # 自己上書きはスキル自身が展開先ツリーの内側にある場合にのみ起こりうる。
  # 外側にあるなら、どの展開先もソースツリーには重ならない。
  real_skill="$(resolve_real_path "$skill_dir")" || return 1
  real_base="$(resolve_real_path "$base")" || return 1
  [[ "$real_skill" == "${real_base}/"* ]] || return 0

  for entry in "${DEPLOY_ENTRIES[@]}"; do
    assert_dest_outside_source "$skill_dir" "${base}/${entry##*|}" || return 1
  done
}

##
# @description Deploy every entry from the skill directory into the target directory
# @arg $1 string Skill directory holding assets/ and _scripts/
# @arg $2 string Directory to deploy into
# @arg $3 string Non-empty to overwrite destinations that already exist
# @return 0 If every entry is copied or skipped
# @return 1 If a source is missing or a destination overlaps the source tree
run_setup() {
  local skill_dir="$1" base="$2" force="$3"
  local entry

  assert_sources_exist "$skill_dir" || return 1
  assert_destinations_safe "$skill_dir" "$base" || return 1

  for entry in "${DEPLOY_ENTRIES[@]}"; do
    copy_entry "${skill_dir}/${entry%%|*}" "${base}/${entry##*|}" "$force" || return 1
  done
}

##
# @description Print usage to stdout
usage() {
  cat <<'EOF'
Usage: bash skills/setup-chatlogs/scripts/setup-chatlogs.sh [--force] [--help]

Deploys the chatlog-exporter configuration and shared scripts into the current
directory. Run it from the directory you want them deployed into:

  assets/.config/chatlog-exporter/ -> .config/chatlog-exporter/
  assets/deno.json                 -> deno.json
  _scripts/                        -> .claude/skills/_scripts/

An entry whose destination already exists is skipped as a whole and reported;
existing destinations are never merged file by file.

A destination that resolves onto the skill's own source tree is refused before
anything is written, with or without --force, so deploying a checkout into
itself cannot delete the skills it copies from.

Options:
  --force  Overwrite destinations that already exist
  --help   Show this help
EOF
}

##
# @description Parse the command line into a force keyword
#
# Kept free of side effects so the option rules can be verified on their own.
#
# @arg $@ string Command line options (--force, --help)
# @stdout One of: force, "" (empty, no force), help
# @return 0 If the options are valid
# @return 1 If an option is unknown
parse_args() {
  local force=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --force) force=true ;;
    --help)
      echo "help"
      return 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      return 1
      ;;
    esac
    shift
  done

  if [[ "$force" == "true" ]]; then
    echo "force"
  else
    echo ""
  fi
}

##
# @description Main entry point
# @arg $@ string Command line options (--force, --help)
# @return 0 If the entries are deployed
# @return 1 If the options are invalid or a source is missing
main() {
  local force
  if ! force="$(parse_args "$@")"; then
    usage >&2
    return 1
  fi

  if [[ "$force" == "help" ]]; then
    usage
    return 0
  fi

  local skill_dir target_dir
  skill_dir="$(resolve_skill_dir)"
  target_dir="$(resolve_target_dir)"
  run_setup "$skill_dir" "$target_dir" "$force"
}

# Only run when executed directly, so tests can source this file for its functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
