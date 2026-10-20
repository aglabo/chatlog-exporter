#!/usr/bin/env bash
# src: runners/run-actionlint.sh
# @(#) : action lint runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# shellcheck disable=SC1091

set -euo pipefail

# Init directory variables
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"

# load utilty library
. "${SCRIPT_ROOT}/libs/utils.lib.sh"

# @description Run jactionlint with the global config,
#              or with the checked-in config when the global one is absent
# @arg $@ Arguments forwarded to jactionlint
# @exitcode Exit code of jactionlint
main() {
  local configFile
  configFile="$(resolve_config_file 'jactionlint/jactionlint.yaml' 'configs/jactionlint.yaml')" || return 1

  jactionlint --config-file "$configFile" "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
  exit $?
fi
