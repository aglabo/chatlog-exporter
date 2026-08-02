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
# @description Deploy every entry from the skill directory into the target directory
# @arg $1 string Skill directory holding assets/ and _scripts/
# @arg $2 string Directory to deploy into
# @arg $3 string Non-empty to overwrite destinations that already exist
# @return 0 If every entry is copied or skipped
# @return 1 If a source is missing
run_setup() {
  local skill_dir="$1" base="$2" force="$3"
  local entry

  assert_sources_exist "$skill_dir" || return 1

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
