// src: scripts/exporter/__tests__/integration/find-chatgpt-files.integration.spec.ts
// @(#): findChatGPTFiles の統合テスト（実ファイルシステム使用）
//       対象: findChatGPTFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { findChatGPTFiles } from '../../chatgpt-exporter.ts';

// ─── Tests
/**
 * `findChatGPTFiles` の統合テストスイート（実ファイルシステム使用）。
 *
 * `Deno.makeTempDir()` で各テストを独立した一時ディレクトリに隔離し、
 * conversations-*.json ファイルを作成して実際のディレクトリ走査動作を検証する。
 * afterEach で一時ディレクトリを自動クリーンアップし、テスト間の干渉を防ぐ。
 *
 * 検証仕様:
 * - conversations-*.json ファイルのみを収集する（glob フィルタ）
 * - 全パスが .json 拡張子で終わる
 * - ディレクトリが存在しないとき空配列を返す（例外なし）
 * - conversations-*.json 以外のファイルは除外される
 * - 複数ファイルは辞書順ソートされて返される
 *
 * @see findChatGPTFiles
 */
describe('findChatGPTFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-GF-01: conversations-*.json ファイルを収集 ──────────────────────

  /**
   * 正常系の基本ケース。
   * conversations-000.json と conversations-001.json が存在するとき、
   * 2件のパスが返り全パスが .json で終わることを検証する。
   */
  describe('Given: conversations-000.json と conversations-001.json が存在する', () => {
    beforeEach(async () => {
      await Deno.writeTextFile(`${tempDir}/conversations-000.json`, '[]');
      await Deno.writeTextFile(`${tempDir}/conversations-001.json`, '[]');
    });

    /** `findChatGPTFiles` を呼び出したときのパス一覧を検証する。 */
    describe('When: findChatGPTFiles(tempDir) を呼び出す', () => {
      it('T-EC-GF-01-01: 2件のパスを返す', async () => {
        const result = await findChatGPTFiles(tempDir);
        assertEquals(result.length, 2);
      });

      it('T-EC-GF-01-02: 全パスが .json で終わる', async () => {
        const result = await findChatGPTFiles(tempDir);
        assertEquals(result.every((f: string) => f.endsWith('.json')), true);
      });
    });
  });

  // ─── T-EC-GF-02: ディレクトリが存在しない → 空配列 ───────────────────────

  /**
   * ディレクトリが存在しない境界値ケース。
   * 存在しないパスが渡されたとき、例外を投げずに空配列を返すことを検証する。
   */
  describe('Given: ディレクトリが存在しない', () => {
    /** `findChatGPTFiles` を呼び出したときの戻り値を検証する。 */
    describe('When: findChatGPTFiles(nonExistentDir) を呼び出す', () => {
      it('T-EC-GF-02-01: 空配列を返す（エラーなし）', async () => {
        const result = await findChatGPTFiles(`${tempDir}/non-existent`);
        assertEquals(result.length, 0);
      });
    });
  });

  // ─── T-EC-GF-03: conversations-*.json 以外のファイルは除外 ───────────────

  /**
   * glob フィルタによる除外仕様の検証。
   * export_manifest.json・user.json などの conversations-*.json に
   * マッチしないファイルが除外されることを検証する。
   */
  describe('Given: conversations-*.json 以外のファイルが含まれる', () => {
    beforeEach(async () => {
      await Deno.writeTextFile(`${tempDir}/conversations-000.json`, '[]');
      await Deno.writeTextFile(`${tempDir}/export_manifest.json`, '{}');
      await Deno.writeTextFile(`${tempDir}/user.json`, '{}');
    });

    /** `findChatGPTFiles` を呼び出したときのフィルタ結果を検証する。 */
    describe('When: findChatGPTFiles(tempDir) を呼び出す', () => {
      it('T-EC-GF-03-01: conversations-*.json 以外のファイルを除外した結果を返す', async () => {
        const result = await findChatGPTFiles(tempDir);
        assertEquals(result.length, 1);
        assertEquals(result[0].endsWith('conversations-000.json'), true);
      });
    });
  });

  // ─── T-EC-GF-04: 複数ファイル → 辞書順ソート ─────────────────────────────

  /**
   * 複数ファイルの辞書順ソート仕様の検証。
   * ファイルシステムの返却順に依存せず、辞書順ソートされた結果が返ることを検証する。
   * ファイルはランダムな順序で作成して、ソートの独立性を確認する。
   */
  describe('Given: 複数の conversations-*.json ファイルが存在する', () => {
    beforeEach(async () => {
      // ランダムな順序でファイルを作成
      await Deno.writeTextFile(`${tempDir}/conversations-002.json`, '[]');
      await Deno.writeTextFile(`${tempDir}/conversations-000.json`, '[]');
      await Deno.writeTextFile(`${tempDir}/conversations-001.json`, '[]');
    });

    /** `findChatGPTFiles` を呼び出したときのソート結果を検証する。 */
    describe('When: findChatGPTFiles(tempDir) を呼び出す', () => {
      it('T-EC-GF-04-01: 辞書順ソートされた結果を返す', async () => {
        const result = await findChatGPTFiles(tempDir);
        const sorted = [...result].sort();
        assertEquals(result, sorted);
      });
    });
  });
});
