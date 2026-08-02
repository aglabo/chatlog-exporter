#!/usr/bin/env bash
# src: ./runners/run-shfmt.sh
# @(#) : shfmt runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

set -euo pipefail

# shellcheck source=runners/libs/init-vars.lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"

main() {
  local mode="list"
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --list | -l)
      mode="list"
      shift
      ;;
    --format)
      mode="format"
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      return 1
      ;;
    *) break ;;
    esac
  done
  local -a targets=("$@")
  if [[ ${#targets[@]} -eq 0 ]]; then
    targets=(".")
  fi
  targets=("${targets[@]//\\//}")
  case "$mode" in
  list) (cd "$PROJECT_ROOT" && shfmt -ln bash -i 2 -l -- "${targets[@]}") ;;
  format) (cd "$PROJECT_ROOT" && shfmt -ln bash -i 2 -w -- "${targets[@]}") ;;
  esac
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
