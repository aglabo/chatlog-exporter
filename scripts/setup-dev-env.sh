#!/usr/bin/env bash
# src: ./scripts/setup-dev-env.sh
# @(#) : Install lefthook in local development environment only
#
# Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#

set -euo pipefail

##
# @description Detect if running in CI environment
# @return 0 If CI environment detected
# @return 1 If not in CI environment
is_ci_environment() {
  [[ -n "${CI:-}" ]] ||               # Generic CI
    [[ -n "${GITHUB_ACTIONS:-}" ]] || # GitHub Actions
    [[ -n "${GITLAB_CI:-}" ]] ||      # GitLab CI
    [[ -n "${CIRCLECI:-}" ]] ||       # CircleCI
    [[ -n "${JENKINS_HOME:-}" ]] ||   # Jenkins
    [[ -n "${TRAVIS:-}" ]] ||         # Travis CI
    [[ -n "${BUILDKITE:-}" ]] ||      # Buildkite
    [[ -n "${DRONE:-}" ]] ||          # Drone CI
    [[ -n "${TF_BUILD:-}" ]]          # Azure Pipelines
}

##
# @description Check if lefthook is already installed
# @return 0 If lefthook is installed
# @return 1 If lefthook is not installed
is_lefthook_installed() {
  lefthook check-install >/dev/null 2>&1
}

##
# @description Print how to put an installed tool on PATH and that a new shell is required
# @arg $1 string Directory to prepend to PATH
print_path_hint() {
  local path_entry="$1"
  echo "  Add to PATH: export PATH=\"${path_entry}:\$PATH\""
  echo "  This entry is NOT active in the current shell."
  echo "  Write it to your shell profile, then restart the shell (or re-source the profile)."
}

##
# @description Check if shellspec is already installed in specified directory
# @arg $1 string Directory path where shellspec should be installed
# @return 0 If shellspec is installed
# @return 1 If shellspec is not installed
is_shellspec_installed() {
  local install_dir="$1"
  [[ -f "${install_dir}/shellspec" ]]
}

##
# @description Install and configure lefthook
# @return 0 If installation succeeds
# @return 1 If installation fails
setup_lefthook() {
  echo "Local development environment detected."
  lefthook install
}

##
# @description Install shellspec to specified directory
# @arg $1 string Directory path where shellspec will be installed
# @return 0 If installation succeeds
# @return 1 If installation fails
setup_shellspec() {
  local install_dir="${1:-.tools/shellspec}"

  if is_shellspec_installed "$install_dir"; then
    echo "shellspec is already installed in $install_dir"
    print_path_hint "\$PWD/$install_dir"
    return 0
  fi

  echo "Installing shellspec to $install_dir..."

  # Clone shellspec repository
  if git clone --depth 1 https://github.com/shellspec/shellspec.git "$install_dir" >/dev/null 2>&1; then
    echo "shellspec installed successfully to $install_dir"
    print_path_hint "\$PWD/$install_dir"
    return 0
  else
    echo "Error: shellspec installation failed" >&2
    return 1
  fi
}

##
# @description Check if an aglabo tool is already checked out
# @arg $1 string Repository name (e.g. agla-dev-tools)
# @arg $2 string Directory path where aglabo tools are checked out
# @return 0 If the tool is installed
# @return 1 If the tool is not installed
is_agla_tool_installed() {
  local repo="$1"
  local tools_dir="$2"
  [[ -d "${tools_dir}/${repo}/bin" ]]
}

##
# @description Check out an aglabo tool repository
# @arg $1 string Repository name (e.g. agla-dev-tools)
# @arg $2 string Directory path where aglabo tools are checked out (default: ~/.local/tools)
# @return 0 If installation succeeds or is skipped
# @return 1 If installation fails
setup_agla_tool() {
  local repo="$1"
  local tools_dir="${2:-${HOME}/.local/tools}"
  local install_dir="${tools_dir}/${repo}"

  if is_agla_tool_installed "$repo" "$tools_dir"; then
    echo "$repo is already installed in $install_dir"
    print_path_hint "$install_dir/bin"
    return 0
  fi

  echo "Installing $repo to $install_dir..."

  mkdir -p "$tools_dir"

  # Clone aglabo tool repository
  if git clone --depth 1 "https://github.com/aglabo/${repo}.git" "$install_dir" >/dev/null 2>&1; then
    echo "$repo installed successfully to $install_dir"
    print_path_hint "$install_dir/bin"
    return 0
  else
    echo "Error: $repo installation failed" >&2
    if [[ -d "$install_dir" ]]; then
      echo "Hint: $install_dir already exists but is incomplete. Remove it and retry." >&2
    fi
    return 1
  fi
}

##
# @description Main entry point
# @arg $1 string Optional shellspec installation directory (default: .tools/shellspec)
# @return 0 If installation succeeds or is skipped
# @return 1 If installation fails
main() {
  # Skip in CI environment
  if is_ci_environment; then
    echo "CI environment detected. Skipping dev tools install."
    return 0
  fi

  # Install lefthook
  if is_lefthook_installed; then
    echo "lefthook is already installed."
  else
    setup_lefthook
  fi

  # Install shellspec
  local shellspec_dir="${1:-.tools/shellspec}"
  setup_shellspec "$shellspec_dir"

  # Install aglabo tools (non-fatal: a failure must not abort `prepare`)
  setup_agla_tool "agla-dev-tools" || true
  setup_agla_tool "agla-doc-tools" || true

  echo ""
  echo "Setup finished. The PATH entries printed above are required to run the installed tools."
  echo "They take effect only in a new shell: restart the shell (or re-source your profile) before using them."
}

# Skip execution when this script is sourced
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

main "$@"
