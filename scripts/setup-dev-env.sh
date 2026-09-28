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
# @description Check if the lefthook executable is available on PATH
# @return 0 If the lefthook command is found
# @return 1 If the lefthook command is not found
is_lefthook_available() {
  command -v lefthook >/dev/null 2>&1
}

##
# @description Check if lefthook git hooks are already installed
# Assumes the lefthook executable is available (see is_lefthook_available)
# @return 0 If the hooks are installed
# @return 1 If the hooks are not installed
is_lefthook_installed() {
  lefthook check-install >/dev/null 2>&1
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
# @description Check availability, install state, then install lefthook git hooks
# @return 0 If the hooks are already installed or were installed successfully
# @return 1 If lefthook is unavailable or the install failed
setup_lefthook() {
  if ! is_lefthook_available; then
    echo "Error: lefthook not found on PATH." >&2
    echo "Hint: install lefthook, then run 'lefthook install'." >&2
    return 1
  fi

  if is_lefthook_installed; then
    echo "lefthook hooks are already installed."
    return 0
  fi

  echo "Installing lefthook git hooks..."

  if lefthook install; then
    echo "lefthook hooks installed successfully."
    return 0
  fi

  echo "Error: lefthook install failed." >&2
  echo "Hint: run 'lefthook install' manually." >&2
  return 1
}

##
# @description Check install state, then install shellspec to specified directory
# @arg $1 string Directory path where shellspec will be installed
# @return 0 If shellspec is already installed or was installed successfully
# @return 1 If the install failed
setup_shellspec() {
  local install_dir="${1:-.tools/shellspec}"

  if is_shellspec_installed "$install_dir"; then
    echo "shellspec is already installed in $install_dir"
    return 0
  fi

  echo "Installing shellspec to $install_dir..."

  # Clone shellspec repository
  if git clone --depth 1 https://github.com/shellspec/shellspec.git "$install_dir" >/dev/null 2>&1; then
    echo "shellspec installed successfully to $install_dir"
    echo "Add to PATH: export PATH=\"\$PWD/$install_dir:\$PATH\""
    return 0
  fi

  echo "Error: shellspec installation failed" >&2
  if [[ -d "$install_dir" ]]; then
    echo "Hint: $install_dir already exists but is incomplete. Remove it and retry." >&2
  fi
  return 1
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
# @description Check install state, then check out an aglabo tool repository
# @arg $1 string Repository name (e.g. agla-dev-tools)
# @arg $2 string Directory path where aglabo tools are checked out (default: ~/.local/tools)
# @return 0 If the tool is already installed or was installed successfully
# @return 1 If the install failed
setup_agla_tool() {
  local repo="$1"
  local tools_dir="${2:-${HOME}/.local/tools}"
  local install_dir="${tools_dir}/${repo}"

  if is_agla_tool_installed "$repo" "$tools_dir"; then
    echo "$repo is already installed in $install_dir"
    return 0
  fi

  echo "Installing $repo to $install_dir..."

  mkdir -p "$tools_dir"

  # Clone aglabo tool repository
  if git clone --depth 1 "https://github.com/aglabo/${repo}.git" "$install_dir" >/dev/null 2>&1; then
    echo "$repo installed successfully to $install_dir"
    echo "Add to PATH: export PATH=\"$install_dir/bin:\$PATH\""
    return 0
  fi

  echo "Error: $repo installation failed" >&2
  if [[ -d "$install_dir" ]]; then
    echo "Hint: $install_dir already exists but is incomplete. Remove it and retry." >&2
  fi
  return 1
}

##
# @description Main entry point
# @arg $1 string Optional shellspec installation directory (default: .tools/shellspec)
# @return 0 If every setup step succeeded or was skipped
# @return 1 If any setup step failed
main() {
  # Skip in CI environment
  if is_ci_environment; then
    echo "CI environment detected. Skipping dev tools install."
    return 0
  fi

  echo "Local development environment detected."

  local shellspec_dir="${1:-.tools/shellspec}"
  local status=0

  # Run every setup step, then report whether any of them failed
  setup_lefthook || status=1
  setup_shellspec "$shellspec_dir" || status=1
  setup_agla_tool "agla-dev-tools" || status=1
  setup_agla_tool "agla-doc-tools" || status=1

  return "$status"
}

# Skip execution when this script is sourced
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

main "$@"
