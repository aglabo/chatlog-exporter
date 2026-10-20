#!/usr/bin/env bash
# src: ./runners/run-shellspec.sh
# @(#) : shellspec runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# shellcheck disable=SC1091

set -euo pipefail

# Initialize directory variables
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"

# include using wsl library
. "${SCRIPT_ROOT}/libs/wsl.lib.sh"

# Main ShellSpec entry point. The path is relative to PROJECT_ROOT, so it also works as-is on the WSL side
readonly EXEC_SCRIPT='runners/exec/shellspec-exec.sh'

# One-line error written to stderr when running on Windows but wsl.exe cannot be invoked
readonly WSL_UNAVAILABLE_ERROR='Error: Windows detected but wsl.exe is not available. Install WSL, or set SHELLSPEC_NO_WSL=1 to run ShellSpec on this shell.'

# Commands whose absence on the WSL side makes ShellSpec fail with confusing errors
readonly WSL_REQUIRED_COMMANDS=('bash' 'git' 'rg' 'jq')

#
# @description Decide whether ShellSpec should run inside WSL.
#              Pure function: the caller owns the `uname` call and passes its result in
# @arg $1 string OS name (the value of `uname -s`)
# @exitcode 0 if the body should run in WSL, 1 if it should run on this shell
#
should_use_wsl() {
  local __os_name="$1"
  if [[ "${SHELLSPEC_NO_WSL:-}" == '1' ]]; then
    return 1
  fi
  is_windows_host "$__os_name"
}

#
# @description Run the ShellSpec body on this shell
# @arg $@ Arguments forwarded to the body untouched
# @exitcode Exit code of the body
#
run_local() {
  bash "${PROJECT_ROOT}/${EXEC_SCRIPT}" "$@"
}

#
# @description Route the ShellSpec body to this shell or to WSL
# @arg $1 string OS name (the value of `uname -s`)
# @arg $@ Arguments forwarded to the body untouched
# @exitcode Exit code of the body
#
dispatch() {
  local __os_name="$1"
  shift

  if ! should_use_wsl "$__os_name"; then
    run_local "$@"
    return
  fi

  if ! is_wsl_available; then
    printf '%s\n' "$WSL_UNAVAILABLE_ERROR" >&2
    return 1
  fi

  local __missing_commands
  __missing_commands="$(find_missing_wsl_commands "${WSL_REQUIRED_COMMANDS[@]}")"
  if [[ -n "$__missing_commands" ]]; then
    local __missing_names="${__missing_commands//$'\n'/ }"
    printf 'Error: WSL is missing required commands: %s. Install them in your WSL distro (e.g. sudo apt install %s), or set SHELLSPEC_NO_WSL=1 to run ShellSpec on this shell.\n' "$__missing_names" "$__missing_names" >&2
    return 1
  fi

  exec_in_wsl "$PROJECT_ROOT" "$EXEC_SCRIPT" "$@"
}

#
# @description Entry point: hand the current OS name to dispatch()
# @arg $@ Command line arguments, forwarded to the body untouched
# @exitcode Exit code of the body
#
main() {
  dispatch "$(uname -s)" "$@"
}

# Execute main only if script is run directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
