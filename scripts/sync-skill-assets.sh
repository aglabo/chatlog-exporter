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
Usage: bash scripts/sync-skill-assets.sh [--check] [--check-head] [--check-staged] [--help]

Regenerates the distributable copies under skills/setup-chatlogs/ from their
sources:

  .config/chatlog-exporter/ -> skills/setup-chatlogs/assets/.config/chatlog-exporter/
  deno.json                 -> skills/setup-chatlogs/assets/deno.json
  skills/_cle-libs/         -> skills/setup-chatlogs/assets/_cle-libs/

__tests__ directories are excluded at every depth. Each destination is replaced
as a whole, so files deleted from a source disappear from the distribution too.

Options:
  --check       Report whether the distribution is out of date; write nothing
  --check-head  Same as --check, but against the committed HEAD tree
  --check-staged  Report whether a sync source has changes that are not staged; write nothing
  --help        Show this help
EOF
}

##
# @description Parse the command line into a mode keyword
#
# Kept free of side effects so the option rules can be verified on their own.
# Every option is read before a mode is chosen, so the priority is
# help > check-head > check > check-staged no matter what order the options are
# written in.
# check-head outranks check because it verifies the wider surface: the tree that
# would actually reach the remote rather than the working tree.
# check-staged ranks last by the same measure, being the narrowest surface: it
# reads only the git state of the sources and never looks at the distribution
# at all.
#
# @arg $@ string Command line options (--check, --check-head, --check-staged, --help)
# @stdout One of: help, check-head, check, check-staged, "" (empty, plain sync)
# @return 0 If the options are valid
# @return 1 If an option is unknown
parse_args() {
  local help=false check=false check_head=false check_staged=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --help) help=true ;;
    --check) check=true ;;
    --check-head) check_head=true ;;
    --check-staged) check_staged=true ;;
    *)
      echo "Error: unknown option: $1" >&2
      return 1
      ;;
    esac
    shift
  done

  if [[ "$help" == "true" ]]; then
    echo "help"
  elif [[ "$check_head" == "true" ]]; then
    echo "check-head"
  elif [[ "$check" == "true" ]]; then
    echo "check"
  elif [[ "$check_staged" == "true" ]]; then
    echo "check-staged"
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
# @description List paths of one type under a tree, relative to its root
#
# The listing every other step is built on, so the exclusion rule lives in one
# place. Sources are listed pruned (a matching directory drops along with
# everything below it); destinations are listed whole, because a __tests__
# directory that leaked into a destination is exactly what has to be found and
# removed rather than skipped.
#
# @arg $1 string Tree root
# @arg $2 string find type letter: f for files, d for directories
# @arg $3 string pruned to drop __tests__ branches, whole to keep everything
# @stdout One relative path per line, without the leading ./ and without .
list_tree_paths() {
  local base="$1" type="$2" scope="$3"

  if [[ "$scope" == "pruned" ]]; then
    (cd "$base" && find . -name "$EXCLUDE_NAME" -prune -o -type "$type" -print)
  else
    (cd "$base" && find . -type "$type" -print)
  fi | sed -e 's|^\./||' -e '/^\.$/d' | sort
}

##
# @description Copy a source into a destination, dropping every __tests__ directory
#
# The single definition of "what the distribution should contain": both the sync
# and the check go through here, so the two can never disagree about the
# exclusion rule.
#
# Updates file by file rather than replacing the destination wholesale, so a sync
# only ever touches the files that actually differ. rsync is not available in
# this environment, so the three steps it would do are spelled out: mirror the
# directories, refresh the files that differ, then remove what the source no
# longer has.
#
# The difference is decided by content (cmp), not by timestamp. git does not
# record mtimes and clone, checkout and rebase stamp them with the time of the
# operation, so a stale distribution file routinely looks newer than the source
# it came from -- an mtime test would report success and leave the drift in
# place, which is the exact failure this script exists to catch.
#
# Empty directories are mirrored too: the check compares whole trees, so a
# directory present on one side only counts as drift.
#
# A node whose kind changed is resolved at any depth, not just at $dest itself:
# a nested relative path can also be left over from an earlier sync as the other
# kind of node, and file-by-file updating cannot overwrite across kinds.
#
# @arg $1 string Source file or directory
# @arg $2 string Destination path
# @return 0 If the copy succeeds
copy_tree() {
  local src="$1" dest="$2" path

  # A destination left over as the other kind of node cannot be updated in place.
  if [[ -f "$src" ]]; then
    [[ -d "$dest" ]] && rm -rf -- "$dest"
    mkdir -p -- "$(dirname "$dest")"
    cmp -s -- "$src" "$dest" || cp -f -- "$src" "$dest"
    return 0
  fi

  [[ -f "$dest" ]] && rm -f -- "$dest"
  mkdir -p -- "$dest"

  while IFS= read -r path; do
    # Leftover file under a path the source now has as a directory: drop it
    # before mkdir, which cannot create a directory over an existing file. The
    # listing is sorted, so an ancestor is cleared before its descendants are
    # created and this one guard covers a file standing in for a whole subtree.
    [[ -f "${dest}/${path}" ]] && rm -f -- "${dest:?}/${path}"
    mkdir -p -- "${dest}/${path}"
  done < <(list_tree_paths "$src" d pruned)

  while IFS= read -r path; do
    # Leftover directory under a path the source now has as a file: drop it
    # before cmp, or cp lands the file inside it and the later pruning of stale
    # nodes takes the whole thing away while the sync still reports success.
    [[ -d "${dest}/${path}" ]] && rm -rf -- "${dest:?}/${path}"
    cmp -s -- "${src}/${path}" "${dest}/${path}" || cp -f -- "${src}/${path}" "${dest}/${path}"
  done < <(list_tree_paths "$src" f pruned)

  while IFS= read -r path; do
    rm -f -- "${dest:?}/${path}"
  done < <(comm -13 <(list_tree_paths "$src" f pruned) <(list_tree_paths "$dest" f whole))

  # Reverse lexicographic order is enough to reach the deepest directory first: a
  # nested path shares its parent's prefix and is longer, so it always sorts after
  # the parent and therefore comes first once reversed.
  while IFS= read -r path; do
    rm -rf -- "${dest:?}/${path}"
  done < <(comm -13 <(list_tree_paths "$src" d pruned) <(list_tree_paths "$dest" d whole) | sort -r)
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
# @description Report whether the committed HEAD tree's distribution matches its sources
#
# run_check reads the working tree, which leaves one case open: a contributor
# edits a source, commits it, re-runs the sync, and never commits the
# regenerated distribution. The working tree agrees with itself, so --check
# passes and the push goes through, but what lands on the remote is a commit
# whose sources are new and whose distribution is stale.
#
# Extracting HEAD into a scratch directory and checking that instead closes the
# gap, and reuses run_check verbatim so both modes keep a single definition of
# what the distribution should contain.
#
# @arg $1 string Repository root directory
# @stdout An "up to date" report line when the committed distribution matches
# @return 0 If the committed distribution matches its sources
# @return 1 If HEAD cannot be read or the committed distribution is out of date
run_check_head() {
  local base="$1"
  local head_tree status=0

  head_tree="$(mktemp -d)"

  if ! git -C "$base" archive HEAD | tar -xf - -C "$head_tree"; then
    rm -rf -- "$head_tree"
    echo "Error: cannot read the committed tree (HEAD)" >&2
    return 1
  fi

  # errexit would abort here on drift before the scratch directory is removed.
  run_check "$head_tree" || status=$?

  rm -rf -- "$head_tree"

  if [[ "$status" -ne 0 ]]; then
    echo "Hint: the sources are committed but the regenerated distribution may not be" >&2
    return "$status"
  fi
}

##
# @description Report whether a sync source has changes that are not staged
#
# The pre-commit counterpart to run_check_head. The sync regenerates the
# distribution from the working tree, and the hook does not stash unstaged
# changes, so committing with source A staged and source B edited but unstaged
# produces a commit carrying a distribution built from B's unstaged edit while
# B's source change itself stays out. The commit does not agree with itself, and
# the failure only surfaces later as a pre-push --check-head rejection far from
# its cause. Rejecting it here turns that into an immediate, actionable message.
#
# Judged on git status --porcelain output rather than its exit status: git
# returns 0 even for a pathspec that matches nothing, so the exit status carries
# no verdict. The second column is the working-tree side, so a blank there means
# the index already holds what the working tree has: "M " (staged only) is let
# through, while " M", "MM", " D" and "??" are reported.
#
# Reports per path and accumulates instead of returning at the first offender,
# so one run lists everything that has to be dealt with -- the same reason
# run_check accumulates drift.
#
# @arg $1 string Repository root directory
# @stdout A "no unstaged changes" report line when every source is staged
# @return 0 If no sync source has unstaged changes
# @return 1 If git status cannot be read or a source has unstaged changes
run_check_staged() {
  local base="$1"
  local entry src line status_out dirty=0

  for entry in "${SYNC_ENTRIES[@]}"; do
    src="${entry%%|*}"

    # git 自体の失敗を成功として通さない。読めなかったことは検査できなかったことである。
    if ! status_out="$(git -C "$base" status --porcelain -- "$src")"; then
      echo "Error: cannot read the git status of: ${src}" >&2
      return 1
    fi

    # 空文字列に対して <<< は 1 行として回ってしまうため、ここで打ち切る。
    [[ -n "$status_out" ]] || continue

    while IFS= read -r line; do
      # 2 文字目は作業ツリー側の列。空白なら index と作業ツリーは一致しているため見送る。
      if [[ "${line:1:1}" != " " ]]; then
        echo "Error: sync source has unstaged changes: ${line:3}" >&2
        dirty=1
      fi
    done <<<"$status_out"
  done

  if [[ "$dirty" -ne 0 ]]; then
    echo "Hint: stage them or set them aside (git stash push) before committing" >&2
    return 1
  fi

  echo "Sync sources have no unstaged changes"
}

##
# @description Main entry point
# @arg $@ string Command line options (--check, --check-head, --check-staged, --help)
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

  if [[ "$mode" == "check-head" ]]; then
    run_check_head "$repo_root"
    return
  fi

  if [[ "$mode" == "check" ]]; then
    run_check "$repo_root"
    return
  fi

  if [[ "$mode" == "check-staged" ]]; then
    run_check_staged "$repo_root"
    return
  fi

  run_sync "$repo_root"
}

# Only run when executed directly, so tests can source this file for its functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
