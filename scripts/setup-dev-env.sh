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
# @description Check if shellspec is already installed in specified directory
# @arg $1 string Directory path where shellspec should be installed
# @return 0 If shellspec is installed
# @return 1 If shellspec is not installed
is_shellspec_installed() {
  local install_dir="$1"
  [[ -f "${install_dir}/shellspec" ]]
}

##
# @description Check if agla-doc-tools is already installed in specified directory
# @arg $1 string Directory path where agla-doc-tools should be installed
# @return 0 If agla-doc-tools is installed
# @return 1 If agla-doc-tools is not installed
is_agla_doc_tools_installed() {
  local install_dir="$1"
  [[ -f "${install_dir}/bin/textlint" ]]
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
    return 0
  fi

  echo "Installing shellspec to $install_dir..."

  # Clone shellspec repository
  if git clone --depth 1 https://github.com/shellspec/shellspec.git "$install_dir" >/dev/null 2>&1; then
    echo "shellspec installed successfully to $install_dir"
    echo "Add to PATH: export PATH=\"\$PWD/$install_dir:\$PATH\""
    return 0
  else
    echo "Error: shellspec installation failed" >&2
    return 1
  fi
}

##
# @description Install agla-doc-tools to specified directory
#
# Provides the remark / textlint / cspell executables used by the lint:* scripts.
# These are not local devDependencies: the toolchain is centralized in
# aglabo/agla-doc-tools, which exposes bin/ wrappers that run each CLI against
# its own node_modules. The lint:* scripts are local-only, so this install is
# skipped in CI along with the rest of main().
#
# @arg $1 string Directory path where agla-doc-tools will be installed
#               (default: ${HOME}/.local/tools/agla-doc-tools, shared across repositories)
# @return 0 If installation succeeds
# @return 1 If installation fails
setup_agla_doc_tools() {
  local install_dir="${1:-${HOME}/.local/tools/agla-doc-tools}"

  if is_agla_doc_tools_installed "$install_dir"; then
    echo "agla-doc-tools is already installed in $install_dir"
    return 0
  fi

  echo "Installing agla-doc-tools to $install_dir..."

  if ! git clone --depth 1 https://github.com/aglabo/agla-doc-tools.git "$install_dir" >/dev/null 2>&1; then
    echo "Error: agla-doc-tools clone failed" >&2
    return 1
  fi

  # bin/ wrappers resolve the CLIs from the tool repository's own node_modules
  # On failure, discard the clone made just above: bin/textlint is tracked in the
  # repository, so leaving it behind would make the next run skip this install and
  # treat the unusable wrappers as a completed setup.
  if ! (cd "$install_dir" && pnpm install --frozen-lockfile >/dev/null 2>&1); then
    rm -rf "$install_dir"
    echo "Error: agla-doc-tools dependency install failed" >&2
    return 1
  fi

  echo "agla-doc-tools installed successfully to $install_dir"
  echo "Add to PATH: export PATH=\"$install_dir/bin:\$PATH\""
}

##
# @description Main entry point
# @arg $1 string Optional shellspec installation directory (default: .tools/shellspec)
# @arg $2 string Optional agla-doc-tools installation directory (default: ${HOME}/.local/tools/agla-doc-tools)
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

  # Install agla-doc-tools (provides remark / textlint / cspell)
  setup_agla_doc_tools "${2:-${HOME}/.local/tools/agla-doc-tools}"
}

main "$@"
