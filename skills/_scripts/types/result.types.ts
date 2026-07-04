// src: skills/_scripts/types/result.types.ts
// @(#): 汎用 Result 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
