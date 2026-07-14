// src: scripts/modules/noise-filter/__tests__/unit/phase0-classify-by-filename.unit.spec.ts
// @(#): process-noise-files.ts のユニットテスト
//       対象: _phase0ClassifyByFilename — classifyFile によるファイル名ノイズ/通過分類
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase0ClassifyByFilename } from '../../process-noise-files.ts';

// ─── Helpers
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';

// ─── Internal Helpers

// constants
/** ファイル名パターンでノイズ判定されるファイル名。 */
const _NOISE_FILENAME = 'say-ok-and-nothing-else.md';

/** ファイル名パターンに一致しない通常のファイル名。 */
const _KEEP_FILENAME = 'valid-chat.md';

// ─── Tests

/**
 * `_phase0ClassifyByFilename` のユニットテストスイート。
 *
 * ファイルパス配列を `classifyFile` でファイル名パターン判定し、
 * ノイズ判定確定ファイル（`discardFiles`）と通過ファイル（`passFiles`）に振り分ける
 * 純粋関数の動作を検証する。全件ノイズ・全件通過・混在・空配列を網羅する。
 *
 * テスト ID 範囲: T-PF-P0-01 〜 T-PF-P0-04
 *
 * @see _phase0ClassifyByFilename
 */
describe('_phase0ClassifyByFilename', () => {
  // ─── T-PF-P0-01: 全件ファイル名ノイズ判定 ──────────────────────────────────────

  describe('Given: ファイル名パターンに一致するファイルのみの配列', () => {
    describe('When: _phase0ClassifyByFilename(files) を呼び出す', () => {
      describe('Then: T-PF-P0-01 - discardFiles に全件、passFiles は空', () => {
        it('T-PF-P0-01-01: 全件が discardFiles に入り passFiles は空になる', () => {
          const files = [`/a/${_NOISE_FILENAME}`];

          const result = _phase0ClassifyByFilename(files);

          assertEquals(result.passFiles, []);
          assertEquals(result.discardFiles.length, 1);
          assertEquals(result.discardFiles[0].filePath, `/a/${_NOISE_FILENAME}`);
          assertEquals(result.discardFiles[0].decision, FILTER_DECISIONS.DISCARD);
          assertEquals(result.discardFiles[0].reason.length > 0, true);
        });
      });
    });
  });

  // ─── T-PF-P0-02: 全件ファイル名パターン不一致 ──────────────────────────────────

  describe('Given: ファイル名パターンに一致しないファイルのみの配列', () => {
    describe('When: _phase0ClassifyByFilename(files) を呼び出す', () => {
      describe('Then: T-PF-P0-02 - passFiles に全件、discardFiles は空', () => {
        it('T-PF-P0-02-01: 全件が passFiles に入り discardFiles は空になる', () => {
          const files = [`/a/${_KEEP_FILENAME}`];

          const result = _phase0ClassifyByFilename(files);

          assertEquals(result.passFiles, [`/a/${_KEEP_FILENAME}`]);
          assertEquals(result.discardFiles, []);
        });
      });
    });
  });

  // ─── T-PF-P0-03: ノイズと通過が混在 ────────────────────────────────────────────

  describe('Given: ファイル名ノイズ判定と通過が混在する配列', () => {
    describe('When: _phase0ClassifyByFilename(files) を呼び出す', () => {
      describe('Then: T-PF-P0-03 - それぞれ正しい配列に振り分けられる', () => {
        it('T-PF-P0-03-01: 通過1件+ノイズ1件 → passFiles/discardFiles に正しく分類される', () => {
          const files = [`/a/${_KEEP_FILENAME}`, `/b/${_NOISE_FILENAME}`];

          const result = _phase0ClassifyByFilename(files);

          assertEquals(result.passFiles, [`/a/${_KEEP_FILENAME}`]);
          assertEquals(result.discardFiles.map((d) => d.filePath), [`/b/${_NOISE_FILENAME}`]);
        });
      });
    });
  });

  // ─── T-PF-P0-04: 空配列 ─────────────────────────────────────────────────────────

  describe('Given: 空のファイルパス配列', () => {
    describe('When: _phase0ClassifyByFilename([]) を呼び出す', () => {
      describe('Then: T-PF-P0-04 - discardFiles/passFiles ともに空配列', () => {
        it('T-PF-P0-04-01: discardFiles と passFiles がともに空配列になる', () => {
          const result = _phase0ClassifyByFilename([]);

          assertEquals(result.discardFiles, []);
          assertEquals(result.passFiles, []);
        });
      });
    });
  });
});
