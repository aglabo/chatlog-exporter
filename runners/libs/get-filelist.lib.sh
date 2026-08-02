#!/usr/bin/env bash
# get-filelist.sh — file list and argument normalization library
# Provides path normalization, glob-to-regex conversion, and file list retrieval

# Guard against double sourcing
[[ -n "${_GET_FILELIST_SH:-}" ]] && return 0
readonly _GET_FILELIST_SH=1

#
# @description Convert shell glob pattern to rg-compatible regex filter
# @arg $1 string Pattern to convert (optional; reads from stdin if omitted)
# @stdout Converted pattern
# @exitcode 0 always
#
args_to_filter() {
  local __pattern
  if [[ $# -gt 0 ]]; then
    __pattern="$1"
  else
    IFS= read -r __pattern
  fi
  __pattern="${__pattern//\*/.*}"
  __pattern="${__pattern//\?/.}"
  printf '%s\n' "${__pattern}"
}

#
# @description Convert Windows backslash path separators to forward slashes
# @arg $1 string Path to normalize (optional; reads from stdin if omitted)
# @stdout Normalized path string
# @exitcode 0 always
#
normalize_path() {
  local __path
  if [[ $# -gt 0 ]]; then
    __path="$1"
  else
    IFS= read -r __path
  fi
  printf '%s\n' "${__path//\\/\/}"
}

#
# @description Test whether a string contains shell glob characters (* or ?)
# @arg $1 string Pattern to test
# @stdout nothing
# @exitcode 0 if pattern contains * or ?, 1 otherwise
#
is_glob_pattern() {
  local __pattern="$1"
  [[ "$__pattern" == *'*'* || "$__pattern" == *'?'* ]]
}

#
# @description Get list of files matching a pattern with optional filters
# @arg $1 string Search root directory
# @arg $2 string File glob pattern (e.g. "*.spec.sh")
# @arg $@ Additional filters: slash-containing args are dir_filters, others are str_filters
# @stdout Newline-separated list of matching file paths (./-prefixed, forward slashes); empty output when no files match
# @exitcode 0 always
#
get_filelist() {
  local __root="$1"
  local __pattern="$2"
  shift 2

  # Collect all filters as rg patterns (dir: as-is, str: glob-converted)
  local -a __filters=()
  local __f __norm
  for __f in "$@"; do
    __norm=$(normalize_path "$__f")
    if [[ "$__norm" == */* ]]; then
      __filters+=("$__norm")
    else
      __filters+=("$(args_to_filter "$__f")")
    fi
  done

  # Enumerate files; normalize separators and prepend ./
  local __result
  __result=$(cd "$__root" && rg --files -g "$__pattern" 2>/dev/null | sed 's|\\|/|g; s|^[^./]|./&|' || true)

  # Apply each filter (AND: narrow results; short-circuit on empty)
  local __pat
  for __pat in "${__filters[@]}"; do
    [[ -z "$__result" ]] && break
    __result=$(printf '%s\n' "$__result" | rg "$__pat" 2>/dev/null || true)
  done

  [[ -z "$__result" ]] && return 0
  printf '%s\n' "$__result"
}
