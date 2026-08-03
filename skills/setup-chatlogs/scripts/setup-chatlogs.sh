#!/usr/bin/env bash
# src: ./skills/setup-chatlogs/scripts/setup-chatlogs.sh
# @(#) : Deploy chatlog-exporter configuration into the current directory and shared scripts beside this skill
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

set -euo pipefail

# Entries to deploy, as "<source relative to skill dir>|<destination relative to its base>".
# What the destination is relative to is decided by resolve_dest_base from the
# source alone: _scripts lands beside the skill so the ../../_scripts/ imports in
# the sibling skills resolve wherever the skill was installed, including User
# scope, and everything else lands where the command is run from.
readonly DEPLOY_ENTRIES=(
  "assets/.config/chatlog-exporter|.config/chatlog-exporter"
  "assets/deno.json|deno.json"
  "_scripts|_scripts"
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
  # Removing first is what makes a directory copy replace the destination instead
  # of nesting a copy inside it (dest carries no trailing slash). It is only ever
  # needed here: an existing destination is either being overwritten under --force,
  # or was already skipped above. Keeping the removal off the unforced path means a
  # run without --force cannot delete anything, whatever the guard above concluded.
  #
  # A dangling symlink is the one destination -e reports as absent while cp still
  # refuses to write through it, so it is cleared too.
  if [[ -n "$force" ]] || [[ -L "$dest" ]]; then
    rm -rf "$dest"
  fi
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
  local skill_root="$1"
  local entry src

  for entry in "${DEPLOY_ENTRIES[@]}"; do
    IFS='|' read -r src _ <<<"$entry"
    src="${skill_root}/${src}"
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
resolve_skill_root() {
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
# @description Resolve the skills directory the skill itself is installed under
#
# The shared library is deployed here, beside the skill, so the ../../_scripts/
# imports in the sibling skills resolve from wherever the skill was installed.
# This file lives in <skills dir>/<skill>/scripts/, so the skills directory is
# three levels up.
#
# @stdout Path to the skills directory
resolve_skills_dir() {
  # Subshell so resolving the path never moves the caller's working directory.
  (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
}

##
# @description Resolve which directory an entry's destination is relative to
#
# Only the shared library goes beside the skill; everything else is relative to
# where the command was run. That is the whole rule, so it is read off the
# source rather than carried as a separate column that could disagree with it.
#
# @arg $1 string Source relative to the skill dir
# @arg $2 string Directory to deploy into
# @arg $3 string Directory the skill is installed under
# @stdout The resolved base directory

resolve_dest_base() {
  local src="$1" target_dir="$2" skills_dir="$3"

  if [[ "$src" == "_scripts" ]]; then
    echo "$skills_dir"
  else
    echo "$target_dir"
  fi
}

##
# @description Reject a --force deploy onto the chatlog-exporter development tree
#
# The layout cannot tell the two apart: a legitimate User-scope install and the
# checkout itself both put _scripts beside the skill under a skills directory,
# so a correct guard comparing shapes or resolved paths would have to call them
# the same. The contents differ instead. sync-skill-assets.sh excludes __tests__
# from the distribution, so it is only ever present in the development tree, and
# its presence at the destination is the one reliable signal.
#
# -d follows symbolic links, so this also covers the checkout layout where
# .claude/skills is a link to ../skills and the destination resolves through it
# onto the shared library itself.
#
# The path checked is where _scripts is actually written, not where the command
# was run. Those differ: the destination comes from BASH_SOURCE, so it stays on
# the development tree no matter the working directory, while a cwd-based check
# only finds its marker at the repository root and waves the rest through.
#
# Only --force can do damage. Without it copy_entry skips a destination that
# already exists, and never reaches its removal.
#
# @arg $1 string The _scripts path the deploy would write to
# @arg $2 string Non-empty when --force was given
# @return 0 If the deploy may proceed
# @return 1 If the destination holds __tests__ and --force was given
assert_dest_not_development_tree() {
  local dest="$1" force="$2"

  [[ -n "$force" ]] || return 0
  [[ -d "${dest}/__tests__" ]] || return 0

  echo "Error: ${dest} holds __tests__/, so it is the chatlog-exporter development" >&2
  echo "       tree itself, not a project deployed into. The distribution never" >&2
  echo "       carries __tests__/, so nothing installed normally looks like this." >&2
  echo "       Deploying with --force here would replace the shared library and lose" >&2
  echo "       the files the distribution omits, such as __tests__/." >&2
  echo "       Nothing was deployed. Run this from the project you want it deployed into." >&2
  return 1
}

##
# @description Deploy every entry from the skill directory to its own base
# @arg $1 string Skill directory holding assets/ and _scripts/
# @arg $2 string Directory to deploy into
# @arg $3 string Directory the skill is installed under
# @arg $4 string Non-empty to overwrite destinations that already exist
# @return 0 If every entry is copied or skipped
# @return 1 If a source is missing
run_setup() {
  local skill_root="$1" target_dir="$2" skills_dir="$3" force="$4"
  local entry src dest base_dir

  # 展開元がすべて揃ってから書き始める。半端なツリーを残さないため。
  assert_sources_exist "$skill_root" || return 1

  for entry in "${DEPLOY_ENTRIES[@]}"; do
    IFS='|' read -r src dest <<<"$entry"
    base_dir="$(resolve_dest_base "$src" "$target_dir" "$skills_dir")"
    copy_entry "${skill_root}/${src}" "${base_dir}/${dest}" "$force" || return 1
  done
}

##
# @description Print usage to stdout
usage() {
  cat <<'EOF'
Usage: bash skills/setup-chatlogs/scripts/setup-chatlogs.sh [--force] [--help]

Deploys the chatlog-exporter configuration into the current directory and the
shared scripts next to this skill. Run it from the directory you want the
configuration deployed into:

  assets/.config/chatlog-exporter/ -> <current dir>/.config/chatlog-exporter/
  assets/deno.json                 -> <current dir>/deno.json
  _scripts/                        -> <skills dir>/_scripts/

The shared library goes beside the skill, under the skills directory it is
installed in, because every skill imports it as ../../_scripts/ and that path
resolves from where the skill lives, not from where the command is run.

An entry whose destination already exists is skipped as a whole and reported;
existing destinations are never merged file by file.

--force is refused before anything is written when the destination holds
__tests__/, which marks it as the chatlog-exporter development tree rather than
a project deployed into. Overwriting there would replace the shared library and
lose the files the distribution omits, such as __tests__/ itself.

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
# @return 1 If the options are invalid, the run is refused as a --force deploy onto
#           the development tree, or a source is missing
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

  local skill_root target_dir skills_dir
  skill_root="$(resolve_skill_root)"
  target_dir="$(resolve_target_dir)"
  skills_dir="$(resolve_skills_dir)"

  # 共有ライブラリを実際に置き換える先を見張る。--force 実行時だけ中断する。
  assert_dest_not_development_tree "${skills_dir}/_scripts" "$force" || return 1

  run_setup "$skill_root" "$target_dir" "$skills_dir" "$force"
}

# Only run when executed directly, so tests can source this file for its functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
