#!/usr/bin/env bash
# src: ./scripts/install-skills.sh
# @(#) : Install project skills into .claude/skills
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

set -euo pipefail

# Link text stored in .claude/skills. Kept relative so the link survives a repository move.
# Its basename also names the link, so it must match the basename of the destination.
readonly LINK_TARGET="../skills"

##
# @description Print usage to stdout
usage() {
  cat <<'EOF'
Usage: bash scripts/install-skills.sh [--force] [--help]

Registers the project skills at .claude/skills so Claude Code can discover them.
Creates a relative symbolic link; requires Git Bash with symbolic link support.

Options:
  --force  Remove the existing link and create it again
  --help   Show this help
EOF
}

##
# @description Resolve the repository root directory
# @stdout Absolute path to the repository root
resolve_repo_root() {
  git rev-parse --show-toplevel
}

##
# @description Check if the destination is the expected relative symbolic link
# @arg $1 string Destination path
# @return 0 If the destination is a symlink pointing at LINK_TARGET
# @return 1 Otherwise
is_correct_symlink() {
  local dest="$1"
  [[ -L "$dest" ]] || return 1
  [[ "$(readlink "$dest")" == "$LINK_TARGET" ]]
}

##
# @description Remove the destination link or directory
# @arg $1 string Destination path
remove_destination() {
  local dest="$1"
  # No trailing slash: on a symlink that would delete the linked skills/ instead of the link.
  rm -rf "$dest"
}

##
# @description Install the skills as a relative symbolic link
# @arg $1 string Destination path
# @arg $2 string Non-empty to recreate the link even if it is already correct
# @return 1 If the environment cannot create symbolic links
install_symlink() {
  local dest="$1" force="$2"

  if [[ -z "$force" ]] && is_correct_symlink "$dest"; then
    echo "Skills are already linked at $dest"
    return 0
  fi

  remove_destination "$dest"
  # nativestrict makes ln fail loudly instead of silently copying on Windows.
  # Passing the parent directory lets ln name the link after LINK_TARGET's basename.
  MSYS=winsymlinks:nativestrict ln -s "$LINK_TARGET" "$(dirname "$dest")" 2>/dev/null || true

  if [[ ! -L "$dest" ]]; then
    remove_destination "$dest"
    echo "Error: could not create a symbolic link at $dest" >&2
    echo "Enable Windows Developer Mode." >&2
    return 1
  fi

  echo "Linked $dest -> $LINK_TARGET"
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
# @description Install the skills according to the resolved force flag
# @arg $1 string Repository root directory
# @arg $2 string Non-empty to recreate the link even if it is already correct
# @return 0 If the skills are installed
# @return 1 If the source is missing or the install did not take effect
run_install() {
  local base="$1" force="$2"
  local claude_dir="${base}/.claude"
  local link_name
  link_name="$(basename "$LINK_TARGET")"
  local dest="${claude_dir}/${link_name}"
  local src="${base}/${link_name}"

  if [[ ! -d "$src" ]]; then
    echo "Error: skills directory not found: $src" >&2
    return 1
  fi

  mkdir -p "$claude_dir"

  install_symlink "$dest" "$force"

  if [[ ! -d "$dest" ]]; then
    echo "Error: install finished but $dest does not resolve to a directory" >&2
    return 1
  fi
}

##
# @description Main entry point
# @arg $@ string Command line options (--force, --help)
# @return 0 If the skills are installed or already present
# @return 1 If the options are invalid or the install fails
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

  local repo_root
  repo_root="$(resolve_repo_root)"
  run_install "$repo_root" "$force"
}

# Only run when executed directly, so tests can source this file for its functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
