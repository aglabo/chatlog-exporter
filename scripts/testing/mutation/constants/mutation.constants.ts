// src: scripts/testing/mutation/constants/mutation.constants.ts
// @(#): ミューテーションテストで共有する定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { fromFileUrl } from '@std/path';

/** `scripts/testing/mutation/constants/` から見たリポジトリルート。元の設定 `deno.jsonc` が置かれる。 */
export const REPO_ROOT = fromFileUrl(new URL('../../../../', import.meta.url));
