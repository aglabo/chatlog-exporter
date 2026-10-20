#!/usr/bin/env bash
# src: runners/run-ghalint.sh
# @(#) : ghalint runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# shellcheck disable=SC1091

set -euo pipefail

# Init variables
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"

# load utilty library
. "${SCRIPT_ROOT}/libs/utils.lib.sh"

# @description Run ghalint (run|act) with the global config,
#              or with the checked-in config when the global one is absent
# @arg $1 string Subcommand: run (workflows) or act (actions)
# @arg $@ string Remaining arguments forwarded to ghalint
# @exitcode 0 All checks passed
# @exitcode 1 Lint error, invalid subcommand, or missing config file
main() {
  local subcommand="${1:-}"

  case "$subcommand" in
  run | act)
    shift
    ;;
  *)
    echo "Usage: run-ghalint.sh <run|act> [args...]" >&2
    return 1
    ;;
  esac

  local -a args=("$@")
  local configFile
  configFile="$(resolve_config_file 'linters/ghalint/ghalint.yaml' 'configs/ghalint.yaml')" || return 1

  pnpm exec ghalint "$subcommand" --config "$configFile" "${args[@]+"${args[@]}"}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
  exit $?
fi
