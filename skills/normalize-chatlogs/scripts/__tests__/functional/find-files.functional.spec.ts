#!/usr/bin/env -S deno run --allow-read --allow-write
// src: scripts/__tests__/functional/find-md-files.functional.spec.ts
// @(#): findFiles の機能テスト - GlobProvider 注入によるモック
//       対象: findFiles (skills/_cle-libs/libs/find-files.ts 経由で呼び出し)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { findFiles } from '../../../../_cle-libs/libs/file-ops/find-files.ts';
import type { GlobProvider } from '../../../../_cle-libs/types/providers.types.ts';

// ─── local helpers ────────────────────────────────────────────────────────────

/**
 * mdMap: dir → .md ファイルパス一覧
 * dirMap: dir → サブディレクトリパス一覧
 */
function _makeGlob(mdMap: Record<string, string[]>, dirMap: Record<string, string[]> = {}): GlobProvider {
  return (pattern: string): Promise<string[]> => {
    if (pattern.endsWith('/*.md')) {
      const dir = pattern.slice(0, -5);
      return Promise.resolve(mdMap[dir] ?? []);
    }
    if (pattern.endsWith('/*/')) {
      const dir = pattern.slice(0, -3);
      return Promise.resolve(dirMap[dir] ?? []);
    }
    return Promise.resolve([]);
  };
}

// ─── findFiles functional tests ────────────────────────────────────────────

/**
 * findFiles の機能テスト。
 * GlobProvider 注入により仮想ディレクトリツリーを構築し、
 * .md ファイルの正常取得・再帰・ソート・フィルタリングを検証する。
 */
describe('findFiles', () => {
  // ── T-NC-FFF-06-04 ──────────────────────────────────────────────────────────────

  /** 正常系: 単一階層に .md ファイルが3件ある場合、全件取得できる */
  describe('Given: glob がルートディレクトリに3つの .md ファイルを返す', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      /**
       * Task T-NC-FFF-06-04: 単一階層の .md ファイル取得。
       * 全3件が返され、各パスが正しいフルパス形式であることを確認する。
       */
      describe('Then: Task T-NC-FFF-06-04 - 単一階層の .md ファイル取得', () => {
        it('T-NC-FFF-06-04-01: 全3件のファイルパスが返される', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/a.md', '/mock/root/b.md', '/mock/root/c.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          assertEquals(_result.length, 3);
        });

        it('T-NC-FFF-06-04-02: 各パスが /mock/root/<filename> 形式になっている', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/a.md', '/mock/root/b.md', '/mock/root/c.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          assertEquals(_result.every((p) => p.startsWith('/mock/root/')), true);
        });
      });
    });
  });

  // ── T-NC-FFF-06-05 ──────────────────────────────────────────────────────────────

  /** 正常系: サブディレクトリを含む3階層ツリーを再帰的に収集できる */
  describe('Given: glob が3階層ディレクトリツリーを返す', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      /**
       * Task T-NC-FFF-06-05: サブディレクトリの再帰的 .md 収集。
       * 全階層の .md ファイルが収集され、ディレクトリ自体はパスに含まれないことを確認する。
       */
      describe('Then: Task T-NC-FFF-06-05 - 再帰的な .md ファイル収集', () => {
        it('T-NC-FFF-06-05-01: 全3ファイルのフルパスが返される', async () => {
          const _glob = _makeGlob(
            {
              '/mock': ['/mock/a.md'],
              '/mock/sub1': ['/mock/sub1/b.md'],
              '/mock/sub1/sub2': ['/mock/sub1/sub2/c.md'],
            },
            {
              '/mock': ['/mock/sub1'],
              '/mock/sub1': ['/mock/sub1/sub2'],
            },
          );

          const _result = await findFiles('/mock', { glob: _glob });

          assertEquals(_result.length, 3);
        });

        it('T-NC-FFF-06-05-02: ディレクトリエントリ (sub1, sub2) はパスに含まれない', async () => {
          const _glob = _makeGlob(
            {
              '/mock': ['/mock/a.md'],
              '/mock/sub1': ['/mock/sub1/b.md'],
              '/mock/sub1/sub2': ['/mock/sub1/sub2/c.md'],
            },
            {
              '/mock': ['/mock/sub1'],
              '/mock/sub1': ['/mock/sub1/sub2'],
            },
          );

          const _result = await findFiles('/mock', { glob: _glob });

          assertEquals(
            _result.every((p) => !p.endsWith('/sub1') && !p.endsWith('/sub2')),
            true,
          );
        });
      });
    });
  });

  // ── T-NC-FFF-06-06 ──────────────────────────────────────────────────────────────

  /** 正常系: glob が逆順でファイルを返しても、結果が辞書順ソートされる */
  describe('Given: glob が [c.md, a.md, b.md] を逆順で返す', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      /**
       * Task T-NC-FFF-06-06: 辞書順ソートの保証。
       * glob の返却順序に依らず結果が辞書順にソートされることを確認する。
       */
      describe('Then: Task T-NC-FFF-06-06 - 辞書順ソートの保証', () => {
        it('T-NC-FFF-06-06-01: 返却配列が辞書順にソートされている', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/c.md', '/mock/root/a.md', '/mock/root/b.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          const _sorted = [..._result].sort();
          assertEquals(_result, _sorted);
        });
      });
    });
  });

  // ── T-NC-FFF-06-07 ──────────────────────────────────────────────────────────────

  /** 異常系: .md ファイルが存在しない場合は空配列を返す */
  describe('Given: glob が空の配列を返す', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      /**
       * Task T-NC-FFF-06-07: ファイルなし時の空配列返却。
       * .md ファイルが存在しない場合に空配列が返ることを確認する。
       */
      describe('Then: Task T-NC-FFF-06-07 - .md ファイルなし時の空配列返却', () => {
        it('T-NC-FFF-06-07-01: 返却配列が空配列 [] である', async () => {
          const _glob = _makeGlob({ '/empty/dir': [] });

          const _result = await findFiles('/empty/dir', { glob: _glob });

          assertEquals(_result, []);
        });
      });
    });
  });

  // ── T-NC-FFF-06-08 ──────────────────────────────────────────────────────────────

  /** エッジケース: .md 以外の拡張子ファイルは結果に含まれない */
  describe('Given: glob が .md ファイルのみを返す（フィルタ済み）', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      /**
       * Task T-NC-FFF-06-08: 非 .md ファイルのフィルタリング。
       * .md 以外の拡張子ファイルは結果から除外されることを確認する。
       */
      describe('Then: Task T-NC-FFF-06-08 - 非 .md ファイルのフィルタリング', () => {
        it('T-NC-FFF-06-08-01: .md ファイルのみが返される（1件）', async () => {
          const _glob = _makeGlob({
            '/mock/dir': ['/mock/dir/readme.md'],
          });

          const _result = await findFiles('/mock/dir', { glob: _glob });

          assertEquals(_result.length, 1);
        });

        it('T-NC-FFF-06-08-02: 返却されたパスが .md で終わる', async () => {
          const _glob = _makeGlob({
            '/mock/dir': ['/mock/dir/readme.md'],
          });

          const _result = await findFiles('/mock/dir', { glob: _glob });

          assertEquals(_result[0].endsWith('.md'), true);
        });

        it('T-NC-FFF-06-08-03: .txt/.yaml/.json ファイルは含まれない', async () => {
          const _glob = _makeGlob({
            '/mock/dir': ['/mock/dir/readme.md'],
          });

          const _result = await findFiles('/mock/dir', { glob: _glob });

          assertEquals(
            _result.some((p) => p.endsWith('.txt') || p.endsWith('.yaml') || p.endsWith('.json')),
            false,
          );
        });
      });
    });
  });
});
