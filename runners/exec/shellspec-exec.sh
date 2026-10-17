#!/usr/bin/env bash
# src: ./runners/exec/shellspec-exec.sh
# @(#) : shellspec runner
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# shellcheck disable=SC1091

set -euo pipefail

# shellcheck source=runners/libs/init-vars.lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/../libs/init-vars.lib.sh"

SHELLSPEC="${SHELLSPEC:-${PROJECT_ROOT}/.tools/shellspec/shellspec}"

# Valid test type identifiers
readonly TEST_TYPES=("all" "unit" "functional" "integration" "system" "e2e")

# Test type used when the caller names no target (`pnpm run test:sh`)
readonly DEFAULT_TEST_TYPE='all'

# Directory name that roots every spec tree (runners/__tests__/unit/... etc.)
readonly TESTS_DIR='__tests__'

# Arguments left over after parse_options() consumed the flags it owns.
# Both of these are outputs: a function that sets SKIP_INTEGRATION_TESTS cannot
# return its result on stdout, because reading stdout would put it in a subshell
# and the flag assignment would be lost when that subshell exits.
PARSED_ARGS=()

# Spec file paths produced by resolve_spec_files()
RESOLVED_SPEC_FILES=()

# Test mode: set SKIP_INTEGRATION_TESTS=1 by default (development mode)
# Override with INTEGRATION_TEST=1 env var or --integration flag to run real-machine tests
SKIP_INTEGRATION_TESTS="${SKIP_INTEGRATION_TESTS:-1}"

# Search root for spec file discovery (override in tests to point at a temp dir)
SPEC_SEARCH_ROOT="${SPEC_SEARCH_ROOT:-${PROJECT_ROOT}}"

# shellcheck source=runners/libs/get-filelist.lib.sh
. "${SCRIPT_ROOT}/../libs/get-filelist.lib.sh"

#
# @description Check if argument is a valid test type
# @arg $1 string Argument to check
# @exitcode 0 if valid test type, 1 otherwise
#
is_test_type() {
  local arg="$1"
  local type
  for type in "${TEST_TYPES[@]}"; do
    [[ "$arg" == "$type" ]] && return 0
  done
  return 1
}

#
# @description Check if argument is a spec file path
# @arg $1 string Argument to check
# @exitcode 0 if spec file path, 1 otherwise
#
is_spec_file() {
  local arg="$1"
  [[ "$arg" == *.spec.sh ]]
}

#
# @description Check if argument is a glob path pattern targeting spec files
# @arg $1 string Argument to check
# @exitcode 0 if glob path containing *.spec.sh pattern, 1 otherwise
#
is_spec_glob() {
  local arg="$1"
  is_glob_pattern "$arg" && [[ "$arg" == *".spec.sh"* ]]
}

#
# @description Expand a glob path pattern to matching spec file paths
# @arg $1 string Glob path pattern (e.g. runners/libs/tests/unit/*.spec.sh)
# @stdout List of matching spec file paths
# @exitcode 0 always (warns if no match)
#
expand_spec_glob() {
  local pattern="$1"
  local norm_pattern
  norm_pattern=$(normalize_path "$pattern")

  local -a matches
  # Use compgen -G for glob expansion (handles no-match gracefully)
  mapfile -t matches < <(
    cd "$SPEC_SEARCH_ROOT" && compgen -G "$norm_pattern" 2>/dev/null || true
  )

  if [[ ${#matches[@]} -eq 0 ]]; then
    echo "Warning: No spec files found matching glob '${pattern}'" >&2
    return 0
  fi

  local f
  for f in "${matches[@]}"; do
    normalize_path "$f"
  done
}

#
# @description Get spec files for a given test type
# @arg $1 string Test type (all, unit, functional, etc.)
# @arg $@ Additional file patterns to filter by
# @stdout List of spec file paths relative to project root
#
get_spec_files() {
  local test_type="$1"
  shift
  # The leading separator anchors the filter to a whole path component: without it
  # a directory merely ending in the name (not__tests__/unit/) would match too.
  # It is written as the class [/] rather than a bare slash because MSYS2 rewrites
  # a slash-led token inside an argument into a Windows path before rg sees it
  local type_filter
  if [[ "$test_type" == "all" ]]; then
    type_filter="[/]${TESTS_DIR}/"
  else
    type_filter="[/]${TESTS_DIR}/${test_type}/"
  fi
  get_filelist "$SPEC_SEARCH_ROOT" "*.spec.sh" "$type_filter" "$@"
}

#
# @description Parse options, extracting --integration flag. Must be called in the
#              caller's own shell: both results are globals, never stdout
# @arg $@ Command line arguments
# @sideeffect Sets PARSED_ARGS to the remaining arguments (without --integration)
# @sideeffect Sets SKIP_INTEGRATION_TESTS=0 if --integration found
#
parse_options() {
  PARSED_ARGS=()
  local arg
  for arg in "$@"; do
    if [[ "$arg" == "--integration" ]]; then
      SKIP_INTEGRATION_TESTS=0
    else
      PARSED_ARGS+=("$arg")
    fi
  done
}

#
# @description Resolve spec files from arguments (handles test types, globs, single files).
#              Must be called in the caller's own shell: the result is a global, never
#              stdout, because the `system` type also has to set SKIP_INTEGRATION_TESTS
#              and a subshell would discard that assignment
# @arg $@ Command line arguments (test type, spec file, or glob pattern)
# @stderr Error and warning messages
# @sideeffect Sets RESOLVED_SPEC_FILES to the resolved spec file paths (empty on no match)
# @sideeffect Sets SKIP_INTEGRATION_TESTS=0 for the `system` test type
# @exitcode 0 on success, 1 on error
#
resolve_spec_files() {
  RESOLVED_SPEC_FILES=()

  [[ $# -eq 0 ]] && {
    printf 'Error: No arguments given.\n' >&2
    return 1
  }

  local first_arg="$1"

  # A single .spec.sh file is returned as-is
  if is_spec_file "$first_arg"; then
    RESOLVED_SPEC_FILES=("$first_arg")
    return 0
  fi

  # Glob paths (globs containing *.spec.sh) are expanded by expand_spec_glob
  if is_spec_glob "$first_arg"; then
    mapfile -t RESOLVED_SPEC_FILES < <(expand_spec_glob "$first_arg")
    _drop_empty_resolved
    return 0
  fi

  # Not a test type -> error (stderr)
  if ! is_test_type "$first_arg"; then
    printf "Error: Unknown argument '%s'. Expected a test type, spec file, or glob pattern.\n" "$first_arg" >&2
    return 1
  fi

  # Test type -> expand with get_spec_files
  local test_type="$1"
  shift
  [[ "$test_type" == "system" ]] && SKIP_INTEGRATION_TESTS=0
  mapfile -t RESOLVED_SPEC_FILES < <(get_spec_files "$test_type" "$@")
  _drop_empty_resolved
  if [[ ${#RESOLVED_SPEC_FILES[@]} -eq 0 ]]; then
    echo "Warning: No spec files found for test type '${test_type}'" >&2
  fi
  return 0
}

#
# @description Normalize RESOLVED_SPEC_FILES: a producer emitting a bare newline
#              leaves mapfile with a single empty element, which is not a spec file
# @sideeffect Empties RESOLVED_SPEC_FILES when it holds one empty element
#
_drop_empty_resolved() {
  if [[ ${#RESOLVED_SPEC_FILES[@]} -eq 1 && -z "${RESOLVED_SPEC_FILES[0]}" ]]; then
    RESOLVED_SPEC_FILES=()
  fi
}

#
# @description Run ShellSpec with normalized path arguments
# @arg $@ Spec file paths followed by ShellSpec options (options pass through
#         normalize_path unchanged unless they contain backslashes)
# @exitcode Exit code from ShellSpec
#
run_shellspec() {
  local -a normalized_args=()
  local arg
  for arg in "$@"; do
    normalized_args+=("$(normalize_path "$arg")")
  done

  # Run ShellSpec from project root using subshell
  # Subshell ensures caller's directory remains unchanged
  (cd "$PROJECT_ROOT" && export SKIP_INTEGRATION_TESTS && bash "$SHELLSPEC" "${normalized_args[@]}")
}

#
# @description Main entry point for running ShellSpec tests
# @arg $@ Command line arguments (test type, paths and options)
# @exitcode Exit code from ShellSpec
#
# @example
#   main unit                         # Run unit tests (auto-resolved)
#   main integration                  # Run integration tests (auto-resolved)
#   main all                          # Run all tests
#   main runners/libs/tests/unit/*.spec.sh  # Run spec glob
#   main test.spec.sh --repair        # Run with ShellSpec options
#
main() {
  # Called in this shell, not through a pipe or $(): parse_options() reports its
  # result in PARSED_ARGS precisely so that SKIP_INTEGRATION_TESTS survives
  parse_options "$@"

  # Targets come first, so everything from the first option onward is a
  # ShellSpec option (its values must not be mistaken for targets)
  local -a targets=() options=()
  local arg seen_option=0
  for arg in ${PARSED_ARGS[@]+"${PARSED_ARGS[@]}"}; do
    [[ $seen_option -eq 0 && "$arg" == -* ]] && seen_option=1
    if [[ $seen_option -eq 1 ]]; then
      options+=("$arg")
    else
      targets+=("$arg")
    fi
  done

  # No target named (`pnpm run test:sh` passes none, and so does an
  # options-only invocation): run the whole suite
  [[ ${#targets[@]} -eq 0 ]] && targets=("$DEFAULT_TEST_TYPE")

  # Likewise called directly: the `system` type sets SKIP_INTEGRATION_TESTS
  resolve_spec_files "${targets[@]}" || exit 1

  [[ ${#RESOLVED_SPEC_FILES[@]} -eq 0 ]] && exit 0

  run_shellspec "${RESOLVED_SPEC_FILES[@]}" ${options[@]+"${options[@]}"}
}

# Execute main only if script is run directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
