// src: scripts/libs/__tests__/load-project-dic.integration.spec.ts
// @(#): loadProjectDic の統合テスト（実ファイルシステム使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD Framework --
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { loadProjectDic } from '../../load-project-dic.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── フィクスチャパス ──────────────────────────────────────────────────────────

/**
 * 統合テスト用フィクスチャアセットのディレクトリパス。
 * Windows 環境で `/C:/...` → `C:/...` に正規化する。
 */
const ASSETS_DIR = new URL('../../../__tests__/integration/assets', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1'); // Windows: /C:/... → C:/...

// ─── loadProjectDic ───────────────────────────────────────────────────────────

/**
 * `loadProjectDic` の統合テストスイート。
 * 実ファイルシステムを使用し、YAML辞書の読み込み・変換・エラー処理を検証する。
 */
describe('loadProjectDic', () => {
  // ─── T-CL-LPD-01: projects.dic の正常読み込み ─────────────────────────────

  /**
   * T-CL-LPD-01: フィクスチャの projects.dic（コメント行・misc を含む）を読み込む場合のテスト群。
   * コメント行除外・misc 末尾保証・空キー除外の各挙動を検証する。
   */
  describe('Given: コメント行と misc を含む projects.dic（YAML形式）', () => {
    /** loadProjectDic に明示的なファイルパスを渡して呼び出すケース。 */
    describe('When: loadProjectDic(filePath) を呼び出す', () => {
      /** T-CL-LPD-01: ProjectDicEntry として正しく変換されることを確認する。 */
      describe('Then: T-CL-LPD-01 - コメント行を除外し misc を末尾に付けて ProjectDicEntry を返す', () => {
        it('T-CL-LPD-01-01: app1 が含まれる', async () => {
          const filePath = `${ASSETS_DIR}/projects.dic`;
          const projects = await loadProjectDic(filePath);

          assertEquals('app1' in projects, true);
        });

        it('T-CL-LPD-01-02: misc が末尾キーに含まれる', async () => {
          const filePath = `${ASSETS_DIR}/projects.dic`;
          const projects = await loadProjectDic(filePath);

          const keys = Object.keys(projects);
          assertEquals(keys[keys.length - 1], 'misc');
        });

        it('T-CL-LPD-01-03: # で始まる名前は含まれない', async () => {
          const filePath = `${ASSETS_DIR}/projects.dic`;
          const projects = await loadProjectDic(filePath);

          const hasComment = Object.keys(projects).some((k) => k.startsWith('#'));
          assertEquals(hasComment, false);
        });

        it('T-CL-LPD-01-04: 空文字列名が含まれない', async () => {
          const filePath = `${ASSETS_DIR}/projects.dic`;
          const projects = await loadProjectDic(filePath);

          const hasEmpty = Object.keys(projects).some((k) => k.length === 0);
          assertEquals(hasEmpty, false);
        });
      });
    });
  });

  // ─── T-CL-LPD-03: デフォルトパス（YAML形式）の読み込み ──────────────────

  /**
   * T-CL-LPD-03: 引数なしで loadProjectDic() を呼び出す場合のテスト群。
   * デフォルトの assets/configs/projects.dic を読み込み、YAMLトップレベルキーのみが
   * エントリとして返されることを検証する。
   */
  describe('Given: デフォルトパス assets/configs/projects.dic（YAML形式）', () => {
    /** 引数なしで loadProjectDic() を呼び出すケース。 */
    describe('When: loadProjectDic() を引数なしで呼び出す', () => {
      /** T-CL-LPD-03: トップレベルキーのみが ProjectDicEntry に含まれることを確認する。 */
      describe('Then: T-CL-LPD-03 - YAMLトップレベルキーのみを返す', () => {
        it('T-CL-LPD-03-01: 非空辞書が返される', async () => {
          const projects = await loadProjectDic();

          assertEquals(Object.keys(projects).length > 0, true);
        });

        it('T-CL-LPD-03-02: misc が末尾キーに含まれる', async () => {
          const projects = await loadProjectDic();

          const keys = Object.keys(projects);
          assertEquals(keys[keys.length - 1], 'misc');
        });

        it('T-CL-LPD-03-03: 空文字列名が含まれない', async () => {
          const projects = await loadProjectDic();

          const hasEmpty = Object.keys(projects).some((k) => k.length === 0);
          assertEquals(hasEmpty, false);
        });

        it('T-CL-LPD-03-04: aplys が含まれる（YAMLトップレベルキーとして認識される）', async () => {
          const projects = await loadProjectDic();

          assertEquals('aplys' in projects, true);
        });

        it('T-CL-LPD-03-05: rules を name とするエントリが含まれない（ネストキーは除外される）', async () => {
          const projects = await loadProjectDic();

          assertEquals('rules' in projects, false);
        });

        it('T-CL-LPD-03-06: when を name とするエントリが含まれない（ネストキーは除外される）', async () => {
          const projects = await loadProjectDic();

          assertEquals('when' in projects, false);
        });
      });
    });
  });

  // ─── T-CL-LPD-02: ファイルなし → ChatlogError('FileDirNotFound') をスロー ────

  /**
   * T-CL-LPD-02: 存在しないファイルパスを渡した場合のテスト群。
   * fail-first 原則に従い、ChatlogError がスローされることを検証する。
   */
  describe('Given: 存在しないファイルパス', () => {
    /** 存在しないパスを loadProjectDic に渡すケース。 */
    describe('When: loadProjectDic("/nonexistent/path") を呼び出す', () => {
      /** T-CL-LPD-02: ファイル不在時に ChatlogError がスローされることを確認する。 */
      describe('Then: T-CL-LPD-02 - FileDirNotFound エラーがスローされる', () => {
        it('T-CL-LPD-02-01: ChatlogError(FileDirNotFound) がスローされる', async () => {
          await assertRejects(
            () => loadProjectDic('/nonexistent/path/does/not/exist.dic'),
            ChatlogError,
          );
        });
      });
    });
  });
});
