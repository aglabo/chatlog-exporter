// src: scripts/modules/noise-filter/__tests__/unit/phase2-classify-conversations.unit.spec.ts
// @(#): process-noise-files.ts のユニットテスト
//       対象: _phase2ClassifyConversations — classifyConversation による内容ノイズ/keep 分類
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _phase2ClassifyConversations } from '../../process-noise-files.ts';

// ─── Helpers
import { readConversation } from '../../../../libs/classify-file.ts';
// constants
import { FILTER_DECISIONS } from '../../../../types/filter-decision.const.types.ts';

// ─── Internal Helpers

// constants
/** ノイズ判定されるファイル名相当（内容判定専用のため、ここでは通常のファイル名を使う）。 */
const _NOISE_FILENAME = 'noise-chat.md';

/** keep 判定されるファイル名。 */
const _KEEP_FILENAME = 'valid-chat.md';

/** KEEP 判定を通過する会話（読み込み済み）。 */
const _VALID_CONVERSATION = readConversation(`### User\n${'u'.repeat(300)}\n\n### Assistant\n${'a'.repeat(300)}\n`);

/** 内容判定でノイズ確定する会話（読み込み済み、Assistant応答が短すぎる）。 */
const _NOISE_CONVERSATION = readConversation(`### User\n${'u'.repeat(300)}\n\n### Assistant\n短い\n`);

// ─── Tests

/**
 * `_phase2ClassifyConversations` のユニットテストスイート。
 *
 * `_phase1ReadFiles` の読み込み成功エントリを `classifyConversation` で分類し、
 * ノイズ判定確定ファイル（`discardFiles`）と通過ファイル（`keepFiles`）に振り分ける
 * 純粋関数の動作を検証する。全件ノイズ・全件 keep・混在・空配列を網羅する。
 *
 * テスト ID 範囲: T-PF-P2-01 〜 T-PF-P2-04
 *
 * @see _phase2ClassifyConversations
 */
describe('_phase2ClassifyConversations', () => {
  // ─── T-PF-P2-01: 全件ノイズ判定 ───────────────────────────────────────────────

  describe('Given: 内容がノイズ判定されるエントリ配列', () => {
    describe('When: _phase2ClassifyConversations(entries) を呼び出す', () => {
      describe('Then: T-PF-P2-01 - discardFiles に全件、keepFiles は空', () => {
        it('T-PF-P2-01-01: 全件が discardFiles に入り keepFiles は空になる', () => {
          const entries = [{ filePath: '/a/noise.md', filename: _NOISE_FILENAME, conversation: _NOISE_CONVERSATION }];

          const result = _phase2ClassifyConversations(entries);

          assertEquals(result.keepFiles, []);
          assertEquals(result.discardFiles.length, 1);
          assertEquals(result.discardFiles[0].filePath, '/a/noise.md');
          assertEquals(result.discardFiles[0].decision, FILTER_DECISIONS.DISCARD);
          assertEquals(result.discardFiles[0].reason.length > 0, true);
        });
      });
    });
  });

  // ─── T-PF-P2-02: 全件 keep 判定 ───────────────────────────────────────────────

  describe('Given: keep 判定されるファイルのみのエントリ配列', () => {
    describe('When: _phase2ClassifyConversations(entries) を呼び出す', () => {
      describe('Then: T-PF-P2-02 - keepFiles に全件、discardFiles は空', () => {
        it('T-PF-P2-02-01: 全件が keepFiles に入り discardFiles は空になる', () => {
          const entries = [{ filePath: '/a/keep.md', filename: _KEEP_FILENAME, conversation: _VALID_CONVERSATION }];

          const result = _phase2ClassifyConversations(entries);

          assertEquals(result.keepFiles, ['/a/keep.md']);
          assertEquals(result.discardFiles, []);
        });
      });
    });
  });

  // ─── T-PF-P2-03: ノイズと keep が混在 ────────────────────────────────────────

  describe('Given: 内容ノイズ判定と keep 判定が混在するエントリ配列', () => {
    describe('When: _phase2ClassifyConversations(entries) を呼び出す', () => {
      describe('Then: T-PF-P2-03 - それぞれ正しい配列に振り分けられる', () => {
        it('T-PF-P2-03-01: keep 1件+ノイズ1件 → keepFiles/discardFiles に正しく分類される', () => {
          const entries = [
            { filePath: '/a/keep.md', filename: _KEEP_FILENAME, conversation: _VALID_CONVERSATION },
            { filePath: '/b/noise.md', filename: _NOISE_FILENAME, conversation: _NOISE_CONVERSATION },
          ];

          const result = _phase2ClassifyConversations(entries);

          assertEquals(result.keepFiles, ['/a/keep.md']);
          assertEquals(result.discardFiles.map((d) => d.filePath), ['/b/noise.md']);
        });
      });
    });
  });

  // ─── T-PF-P2-04: 空配列 ───────────────────────────────────────────────────────

  describe('Given: 空のエントリ配列', () => {
    describe('When: _phase2ClassifyConversations([]) を呼び出す', () => {
      describe('Then: T-PF-P2-04 - keepFiles/discardFiles ともに空配列', () => {
        it('T-PF-P2-04-01: keepFiles と discardFiles がともに空配列になる', () => {
          const result = _phase2ClassifyConversations([]);

          assertEquals(result.keepFiles, []);
          assertEquals(result.discardFiles, []);
        });
      });
    });
  });
});
