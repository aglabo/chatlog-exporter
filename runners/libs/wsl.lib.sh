#!/usr/bin/env bash
# src: runners/libs/wsl.lib.sh
# @(#): wsl.lib.sh - WSL delegation library
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# Guard against double sourcing
[[ -n "${_WSL_LIB_SH:-}" ]] && return 0
readonly _WSL_LIB_SH=1

#
# @description Check if an OS name denotes a Windows host shell (Git Bash / MSYS2 / Cygwin).
#              Pure function: the caller owns the `uname` call and passes its result in
# @arg $1 string OS name (the value of `uname -s`)
# @exitcode 0 if the OS name is MINGW*, MSYS* or CYGWIN*, 1 otherwise
#
is_windows_host() {
  local __os_name="$1"
  case "$__os_name" in
  MINGW* | MSYS* | CYGWIN*) return 0 ;;
  *) return 1 ;;
  esac
}

#
# @description Check if wsl.exe can be called from this shell
# @exitcode 0 if wsl.exe is callable, 1 otherwise
#
is_wsl_available() {
  command -v wsl.exe >/dev/null 2>&1
}

#
# @description Run a script inside WSL, starting from a Windows working directory.
#              wsl.exe --cd takes the Windows path as-is, so no path conversion is needed.
#              Only SKIP_INTEGRATION_TESTS crosses the boundary: PROJECT_ROOT and friends
#              hold Windows paths, so the WSL side re-derives them instead.
#              wsl.exe is called by plain name (not via `command`) so that tests can
#              replace it with a shell function; its stderr is passed through untouched
# @arg $1 string Windows working directory handed to `wsl.exe --cd`
# @arg $2 string Script path to run, relative to that working directory
# @arg $@ Arguments forwarded to the script
# @exitcode Exit code of wsl.exe
#
exec_in_wsl() {
  local __win_cwd="$1"
  local __script="$2"
  shift 2

  wsl.exe --cd "$__win_cwd" -e env "SKIP_INTEGRATION_TESTS=${SKIP_INTEGRATION_TESTS:-1}" bash "$__script" "$@"
}

#
# @description List the given commands that cannot be called inside WSL.
#              wsl.exe is started once for the whole list: starting it per command
#              would dominate the runtime. The probe asks `command -v` inside WSL and
#              echoes back only the names it could not resolve, keeping the argument
#              order. wsl.exe writes no CR to stdout, so no CR stripping is needed.
#              wsl.exe is called by plain name (not via `command`) so that tests can
#              replace it with a shell function
# @arg $@ Command names to look for inside WSL
# @stdout One missing command name per line; nothing when all of them are callable
# @exitcode 0 always
#
find_missing_wsl_commands() {
  # Probe run on the WSL side. It must not be expanded here, so it is single-quoted
  # shellcheck disable=SC2016 # Probe body. $@ and $__command are resolved by bash on the WSL side
  local __probe='for __command in "$@"; do command -v "$__command" >/dev/null 2>&1 || printf "%s\n" "$__command"; done'

  wsl.exe -e bash -c "$__probe" bash "$@"
}
