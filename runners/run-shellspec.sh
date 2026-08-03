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

# shellcheck source=runners/libs/init-vars.lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/libs/init-vars.lib.sh"

SHELLSPEC="${SHELLSPEC:-${PROJECT_ROOT}/.tools/shellspec/shellspec}"

readonly TEST_TYPES=("all" "unit" "functional" "integration" "system" "e2e")

# Spec root directory, relative to PROJECT_ROOT. Must match --default-path in .shellspec
readonly SPEC_ROOT_DIR="scripts/__tests__"

SKIP_INTEGRATION_TESTS="${SKIP_INTEGRATION_TESTS:-1}"
SPEC_SEARCH_ROOT="${SPEC_SEARCH_ROOT:-${PROJECT_ROOT}}"

PARSED_ARGS=()
RESOLVED_SPEC_FILES=()
SHELLSPEC_ARGS=()

# shellcheck source=runners/libs/get-filelist.sh
. "${SCRIPT_ROOT}/libs/get-filelist.lib.sh"

is_test_type() {
  local arg="$1"
  local type
  for type in "${TEST_TYPES[@]}"; do
    [[ "$arg" == "$type" ]] && return 0
  done
  return 1
}

is_spec_file() {
  local arg="$1"
  [[ "$arg" == *.spec.sh ]]
}

is_spec_glob() {
  local arg="$1"
  is_glob_pattern "$arg" && [[ "$arg" == *".spec.sh"* ]]
}

expand_spec_glob() {
  local pattern="$1"
  local norm_pattern
  norm_pattern=$(normalize_path "$pattern")

  local -a matches
  mapfile -t matches < <(
    cd "$SPEC_SEARCH_ROOT" && compgen -G "$norm_pattern" 2>/dev/null || true
  )

  if [[ ${#matches[@]} -eq 0 ]]; then
    echo "Warning: No spec files found matching glob '${pattern}'" >&2
    return 0
  fi

  local file
  for file in "${matches[@]}"; do
    normalize_path "$file"
  done
}

is_skip_shellspec_file() {
  local file="$1"
  local file_path="$file"
  if [[ "$file_path" != /* ]]; then
    file_path="${SPEC_SEARCH_ROOT}/${file_path#./}"
  fi

  [[ -f "$file_path" ]] && head -n 5 "$file_path" 2>/dev/null | grep -q '^# skip shellspec'
}

filter_runnable_specs() {
  local file
  for file in "$@"; do
    if ! is_skip_shellspec_file "$file"; then
      printf '%s\n' "$file"
    fi
  done
}

get_spec_files() {
  local test_type="$1"
  shift

  local type_filter
  if [[ "$test_type" == "all" ]]; then
    type_filter="${SPEC_ROOT_DIR}/"
  else
    type_filter="${SPEC_ROOT_DIR}/${test_type}/"
  fi

  local -a spec_files
  mapfile -t spec_files < <(get_filelist "$SPEC_SEARCH_ROOT" "*.spec.sh" "$type_filter" "$@")
  filter_runnable_specs "${spec_files[@]}"
}

parse_options() {
  PARSED_ARGS=()

  local arg
  for arg in "$@"; do
    if [[ "$arg" == "--integration" ]]; then
      SKIP_INTEGRATION_TESTS=0
    elif [[ "$arg" == "--" ]]; then
      continue
    else
      PARSED_ARGS+=("$arg")
      printf '%s\n' "$arg"
    fi
  done
}

resolve_spec_files() {
  RESOLVED_SPEC_FILES=()
  SHELLSPEC_ARGS=()

  [[ $# -eq 0 ]] && return 0

  local first_arg="$1"

  if is_spec_glob "$first_arg"; then
    local -a expanded_specs
    mapfile -t expanded_specs < <(expand_spec_glob "$first_arg")
    mapfile -t RESOLVED_SPEC_FILES < <(filter_runnable_specs "${expanded_specs[@]}")
    shift
    SHELLSPEC_ARGS=("$@")
    printf '%s\n' "${RESOLVED_SPEC_FILES[@]}"
    return 0
  fi

  if is_spec_file "$first_arg"; then
    RESOLVED_SPEC_FILES=("$first_arg")
    shift
    SHELLSPEC_ARGS=("$@")
    printf '%s\n' "${RESOLVED_SPEC_FILES[@]}"
    return 0
  fi

  if ! is_test_type "$first_arg"; then
    printf "Error: Unknown argument '%s'. Expected a test type, spec file, or glob pattern.\n" "$first_arg"
    return 1
  fi

  local test_type="$1"
  shift
  # 統合テストのゲートを開く種別。integration は指定されれば毎回実行する。
  # system は integration ゲートも通す必要があるため従来どおり開く。
  # all は「すべて」の要求であり、閉じたままだと integration/system 単独指定の
  # 和集合より弱いスイートになってしまうため同様に開く。
  case "$test_type" in
  integration | system | all) SKIP_INTEGRATION_TESTS=0 ;;
  esac

  local -a file_filters=()
  local parsing_shellspec_args=0
  local arg
  for arg in "$@"; do
    if [[ $parsing_shellspec_args -eq 1 || "$arg" == -* ]]; then
      parsing_shellspec_args=1
      SHELLSPEC_ARGS+=("$arg")
    else
      file_filters+=("$arg")
    fi
  done

  local -a spec_files
  mapfile -t spec_files < <(get_spec_files "$test_type" "${file_filters[@]}")
  if [[ ${#spec_files[@]} -eq 0 || -z "${spec_files[0]}" ]]; then
    echo "Warning: No spec files found for test type '${test_type}'" >&2
    return 0
  fi

  RESOLVED_SPEC_FILES=("${spec_files[@]}")
  printf '%s\n' "${RESOLVED_SPEC_FILES[@]}"
}

run_shellspec() {
  local -a normalized_args=()
  local arg
  for arg in "$@"; do
    normalized_args+=("$(normalize_path "$arg")")
  done

  (cd "$PROJECT_ROOT" && export SKIP_INTEGRATION_TESTS && bash "$SHELLSPEC" "${normalized_args[@]}")
}

main() {
  if [[ $# -eq 0 ]]; then
    run_shellspec
    exit $?
  fi

  parse_options "$@" >/dev/null

  local resolved resolved_file
  resolved_file=$(mktemp)
  if ! resolve_spec_files "${PARSED_ARGS[@]}" >"$resolved_file"; then
    resolved=$(cat "$resolved_file")
    rm -f "$resolved_file"
    echo "$resolved" >&2
    exit 1
  fi
  resolved=$(cat "$resolved_file")
  rm -f "$resolved_file"

  [[ -z "$resolved" ]] && exit 0

  run_shellspec "${RESOLVED_SPEC_FILES[@]}" "${SHELLSPEC_ARGS[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
