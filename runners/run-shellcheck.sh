#!/usr/bin/env bash
# src: ./scripts/run-shellcheck.sh
# @(#) : shellcheck runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

set -euo pipefail

# shellcheck source=runners/libs/init-vars.lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"
cd "${SCRIPT_ROOT}/.."

SHELLCHECKRC="${SHELLCHECKRC:-${SCRIPT_ROOT}/../configs/shellcheckrc}"
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --rcfile | -r)
      SHELLCHECKRC="$2"
      shift 2
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
  local -a files=()
  for target in "${targets[@]}"; do
    if [[ -d $target ]]; then
      while IFS= read -r -d '' f; do
        files+=("$f")
      done < <(find "$target" \
        -path "*/.tools/*" -prune -o \
        -path "*/node_modules/*" -prune -o \
        -name "*.sh" -print0)
    else
      files+=("$target")
    fi
  done
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No .sh files found." >&2
    return 0
  fi
  (shellcheck --rcfile="$SHELLCHECKRC" "${files[@]}")
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
