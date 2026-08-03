#!/usr/bin/env bash
# src: ./scripts/sync-skill-assets.sh
# @(#) : Sync the distributable setup-chatlogs skill assets from their sources
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

set -euo pipefail

# Entries to sync, as "<source relative to repo root>|<destination relative to repo root>".
# The destinations are what setup-chatlogs.sh deploys, so they must be
# regenerated from these sources rather than edited by hand.
readonly SYNC_ENTRIES=(
  ".config/chatlog-exporter|skills/setup-chatlogs/assets/.config/chatlog-exporter"
  "deno.json|skills/setup-chatlogs/assets/deno.json"
  "skills/_cle-libs|skills/setup-chatlogs/assets/_cle-libs"
)

# Directory name dropped from every synced tree. Tests are not part of a
# distribution. Applied to all entries rather than just skills/_cle-libs/ so the
# sync and the check share one definition of the expected tree and cannot drift.
#
# setup-chatlogs.sh depends on this exclusion: assert_dest_not_development_tree
# reads the presence of __tests__/ as proof that a deploy destination is the
# shared library itself rather than a copy deployed from it, and refuses --force
# there. Narrowing this exclusion would make that guard stop firing.
readonly EXCLUDE_NAME="__tests__"

##
# @description Print usage to stdout
usage() {
  cat <<'EOF'
Usage: bash scripts/sync-skill-assets.sh [--check] [--help]

Regenerates the distributable copies under skills/setup-chatlogs/ from their
sources:

  .config/chatlog-exporter/ -> skills/setup-chatlogs/assets/.config/chatlog-exporter/
  deno.json                 -> skills/setup-chatlogs/assets/deno.json
  skills/_cle-libs/         -> skills/setup-chatlogs/assets/_cle-libs/

__tests__ directories are excluded at every depth. Each destination is replaced
as a whole, so files deleted from a source disappear from the distribution too.

Options:
  --check  Report whether the distribution is out of date; write nothing
  --help   Show this help
EOF
}

##
# @description Parse the command line into a mode keyword
#
# Kept free of side effects so the option rules can be verified on their own.
# Every option is read before a mode is chosen, so the priority is
# help > check no matter what order the options are written in.
#
# @arg $@ string Command line options (--check, --help)
# @stdout One of: help, check, "" (empty, plain sync)
# @return 0 If the options are valid
# @return 1 If an option is unknown
parse_args() {
  local help=false check=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --help) help=true ;;
    --check) check=true ;;
    *)
      echo "Error: unknown option: $1" >&2
      return 1
      ;;
    esac
    shift
  done

  if [[ "$help" == "true" ]]; then
    echo "help"
  elif [[ "$check" == "true" ]]; then
    echo "check"
  else
    echo ""
  fi
}

##
# @description Resolve the repository root directory
# @stdout Absolute path to the repository root
resolve_repo_root() {
  git rev-parse --show-toplevel
}

##
# @description Copy a source into a destination, dropping every __tests__ directory
#
# The single definition of "what the distribution should contain": both the sync
# and the check go through here, so the two can never disagree about the
# exclusion rule.
#
# The destination is removed first because tar only overlays; without this a file
# deleted from the source would linger in the distribution forever.
#
# rsync is not available in this environment, so the exclusion rides on tar,
# which prunes a matching directory along with everything below it.
#
# @arg $1 string Source file or directory
# @arg $2 string Destination path
# @return 0 If the copy succeeds
copy_tree() {
  local src="$1" dest="$2"

  rm -rf -- "$dest"
  mkdir -p -- "$(dirname "$dest")"

  if [[ -f "$src" ]]; then
    cp -f -- "$src" "$dest"
    return 0
  fi

  mkdir -p -- "$dest"
  tar --exclude="$EXCLUDE_NAME" -cf - -C "$src" . | tar -xf - -C "$dest"
}

##
# @description Verify every sync source exists before anything is written
#
# Checked up front so a missing source aborts the run without leaving a
# partially synced distribution behind, and so the reported error is ours
# rather than whatever wording tar happens to use.
#
# @arg $1 string Repository root directory
# @return 0 If every source is present
# @return 1 If a source is missing
assert_sources_exist() {
  local base="$1"
  local entry src

  for entry in "${SYNC_ENTRIES[@]}"; do
    src="${base}/${entry%%|*}"
    if [[ ! -e "$src" ]]; then
      echo "Error: source not found: $src" >&2
      return 1
    fi
  done
}

##
# @description Regenerate every distributable copy from its source
#
# Takes the repository root as an argument rather than resolving it itself so
# the specs can drive it against a fixture repository.
#
# @arg $1 string Repository root directory
# @stdout A "Synced:" report line per entry
# @return 0 If every entry is synced
# @return 1 If a source is missing
run_sync() {
  local base="$1"
  local entry dest

  assert_sources_exist "$base" || return 1

  for entry in "${SYNC_ENTRIES[@]}"; do
    dest="${entry##*|}"
    copy_tree "${base}/${entry%%|*}" "${base}/${dest}"
    echo "Synced: ${dest}"
  done
}

##
# @description Report whether the distribution matches its sources
#
# Builds the expected tree with the same copy_tree the sync uses, then compares
# it against what is checked in. Comparing whole trees rather than file contents
# also catches files that were deleted from a source but linger in the
# distribution.
#
# @arg $1 string Repository root directory
# @stdout An "up to date" report line when the distribution matches
# @return 0 If the distribution matches its sources
# @return 1 If a source is missing or the distribution is out of date
run_check() {
  local base="$1"
  local entry dest expected drift=0

  assert_sources_exist "$base" || return 1

  expected="$(mktemp -d)"

  for entry in "${SYNC_ENTRIES[@]}"; do
    dest="${entry##*|}"
    copy_tree "${base}/${entry%%|*}" "${expected}/current"
    if ! diff -r -- "${expected}/current" "${base}/${dest}" >/dev/null 2>&1; then
      echo "Error: out of date: ${dest}" >&2
      drift=1
    fi
  done

  rm -rf -- "$expected"

  if [[ "$drift" -ne 0 ]]; then
    echo "Run: bash scripts/sync-skill-assets.sh" >&2
    return 1
  fi

  echo "Distribution is up to date"
}

##
# @description Main entry point
# @arg $@ string Command line options (--check, --help)
# @return 0 If the distribution is synced or verified
# @return 1 If the options are invalid, a source is missing, or the check fails
main() {
  local mode
  if ! mode="$(parse_args "$@")"; then
    usage >&2
    return 1
  fi

  if [[ "$mode" == "help" ]]; then
    usage
    return 0
  fi

  local repo_root
  repo_root="$(resolve_repo_root)"

  if [[ "$mode" == "check" ]]; then
    run_check "$repo_root"
    return
  fi

  run_sync "$repo_root"
}

# Only run when executed directly, so tests can source this file for its functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
