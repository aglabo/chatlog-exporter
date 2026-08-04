// src: skills/normalize-chatlogs/scripts/libs/path-utils.ts
// @(#): normalize-chatlogs ファイルパス由来のベース名抽出ユーティリティ
//       対象: extractSegmentBaseName
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { getBasename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';

/**
 * Extracts the base name (without extension and trailing hash) from a file path.
 *
 * Strips the directory, `.md` extension, and any trailing `-<7hex>` hash suffix.
 * For example: `path/to/2026-03-11-1-api-a4a84394.md` → `2026-03-11-1-api`
 * (hash removal applies when the suffix matches `-[0-9a-f]{7}$` pattern)
 *
 * @param filePath - Path to the source chatlog file
 * @returns Base name without extension and without trailing `-XXXXXXX` hash segment
 */
export const extractSegmentBaseName = (filePath: string): string => {
  // Remove directory and extension via getBasename, then strip trailing -<7hex> hash if present
  return getBasename(filePath).replace(/-[0-9a-f]{7}$/, '');
};
