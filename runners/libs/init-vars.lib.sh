#!/usr/bin/env bash
# init-vars.lib.sh — common runner variable initialization library
# Provides SCRIPT_ROOT and PROJECT_ROOT for all runner scripts
#
# Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

# Guard against double sourcing
[[ -n "${_INIT_VARS_LIB_SH:-}" ]] && return 0
readonly _INIT_VARS_LIB_SH=1

# SCRIPT_ROOT: directory of the runner script that sourced this file
# BASH_SOURCE[1] refers to the caller's script path when this file is sourced
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"

# PROJECT_ROOT: git repository root, or parent of SCRIPT_ROOT as fallback
# git runs with -C SCRIPT_ROOT so the runner's own repository is resolved,
# not the repository the caller happened to be in when invoking the runner
PROJECT_ROOT="${PROJECT_ROOT:-$(git -C "${SCRIPT_ROOT}" rev-parse --show-toplevel 2>/dev/null || dirname "${SCRIPT_ROOT}")}"
