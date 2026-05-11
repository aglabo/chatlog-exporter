// src: scripts/__tests__/integration/walk-files.integration.spec.ts
// @(#): walkFiles の統合テスト（実ファイルシステム使用）
//       対象: walkFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { walkFiles } from '../../../../_scripts/libs/file-ops/walk-files.ts';

// ─── Tests
/**
 * `walkFiles` の統合テストスイート（実ファイルシステム使用）。
 *
 * ディレクトリを再帰的に走査して指定拡張子のファイルパスを yield する
 * 非同期ジェネレータの動作を検証する。以下のケースをカバーする:
 * - フラットなディレクトリへの複数ファイル収集
 * - サブディレクトリへの再帰走査（全階層のファイルを収集）
 * - 拡張子フィルタ（.jsonl のみ収集し .txt/.md を除外）
 * - 辞書順ソート
 * - 存在しないディレクトリ → 空（エラーなし）
 * - 空ディレクトリ → 空
 *
 * 各テストは `Deno.makeTempDir()` で独立した作業ディレクトリを使用し、
 * `afterEach` で自動クリーンアップする。
 *
 * @see walkFiles
 */
describe('walkFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-EC-WF-01: 複数ファイルの収集 ──────────────────────────────────────

  /**
   * フラットなディレクトリで全 .jsonl ファイルが収集される正常系の基本ケース。
   * a.jsonl・b.jsonl・c.jsonl が3件とも収集され、全パスが .jsonl で終わることを確認する。
   */
  describe('Given: フラットなディレクトリに .jsonl ファイルが3件', () => {
    /** walkFiles(dir, ".jsonl") を呼び出す */
    describe('When: walkFiles(dir, ".jsonl") を呼び出す', () => {
      beforeEach(async () => {
        await Deno.writeTextFile(`${tempDir}/a.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/b.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/c.jsonl`, '{}');
      });

      /** T-EC-WF-01: 3件のファイルパスが返る */
      describe('Then: T-EC-WF-01 - 3件のファイルパスが返る', () => {
        it('T-EC-WF-01-01: 収集ファイル数が 3', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.length, 3);
        });

        it('T-EC-WF-01-02: 全パスが .jsonl で終わる', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.every((f) => f.endsWith('.jsonl')), true);
        });
      });
    });
  });

  // ─── T-EC-WF-02: 再帰走査 ─────────────────────────────────────────────────

  /**
   * root・sub1・sub1/deep の全階層にある .jsonl ファイルを再帰的に収集するケース。
   * ネストが深くても全階層が走査され、3件すべてが収集されることを確認する。
   */
  describe('Given: サブディレクトリに .jsonl ファイルが存在する構造', () => {
    /** walkFiles(rootDir, ".jsonl") を呼び出す */
    describe('When: walkFiles(rootDir, ".jsonl") を呼び出す', () => {
      beforeEach(async () => {
        await Deno.mkdir(`${tempDir}/sub1`);
        await Deno.mkdir(`${tempDir}/sub1/deep`);
        await Deno.writeTextFile(`${tempDir}/root.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/sub1/child.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/sub1/deep/grandchild.jsonl`, '{}');
      });

      /** T-EC-WF-02: 全階層のファイルを収集する */
      describe('Then: T-EC-WF-02 - 全階層のファイルを収集する', () => {
        it('T-EC-WF-02-01: 収集ファイル数が 3（全階層）', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.length, 3);
        });
      });
    });
  });

  // ─── T-EC-WF-03: 拡張子フィルタ ──────────────────────────────────────────

  /**
   * .jsonl と .txt/.md が混在するディレクトリの拡張子フィルタ確認ケース。
   * 指定した拡張子（.jsonl）のみを収集し、.txt・.md は除外されることを確認する。
   */
  describe('Given: .jsonl と .txt が混在するディレクトリ', () => {
    /** walkFiles(dir, ".jsonl") を呼び出す */
    describe('When: walkFiles(dir, ".jsonl") を呼び出す', () => {
      beforeEach(async () => {
        await Deno.writeTextFile(`${tempDir}/a.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/b.txt`, 'text');
        await Deno.writeTextFile(`${tempDir}/c.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/d.md`, '# markdown');
      });

      /** T-EC-WF-03: .jsonl ファイルのみ返る */
      describe('Then: T-EC-WF-03 - .jsonl ファイルのみ返る', () => {
        it('T-EC-WF-03-01: 収集ファイル数が 2（.jsonl のみ）', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.length, 2);
        });

        it('T-EC-WF-03-02: 全パスが .jsonl で終わる', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.every((f) => f.endsWith('.jsonl')), true);
        });
      });
    });
  });

  // ─── T-EC-WF-04: ソート順 ─────────────────────────────────────────────────

  /**
   * OS 依存の readDir 順序に関係なく辞書順で返ることを確認するケース。
   * c.jsonl・a.jsonl・b.jsonl の順で作成し、返却結果が a→b→c の辞書順に
   * 並ぶことを確認する。エクスポート結果の再現性に必要な仕様。
   */
  describe('Given: アルファベット順でない名前のファイルが複数', () => {
    /** walkFiles(dir, ".jsonl") を呼び出す */
    describe('When: walkFiles(dir, ".jsonl") を呼び出す', () => {
      beforeEach(async () => {
        await Deno.writeTextFile(`${tempDir}/c.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/a.jsonl`, '{}');
        await Deno.writeTextFile(`${tempDir}/b.jsonl`, '{}');
      });

      /** T-EC-WF-04: アルファベット順で返る */
      describe('Then: T-EC-WF-04 - アルファベット順で返る', () => {
        it('T-EC-WF-04-01: パスが辞書順に並んでいる', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(tempDir, '.jsonl')) {
            results.push(f);
          }
          const sorted = [...results].sort();
          assertEquals(results, sorted);
        });
      });
    });
  });

  // ─── T-EC-WF-05: 不存在ディレクトリ → 空 ────────────────────────────────

  /**
   * 存在しないディレクトリを渡したときエラーなし空イテレータを返すシナリオ。
   * 呼び出し元がエラーハンドリングなしでそのまま for await できる設計の確認。
   */
  describe('Given: 存在しないディレクトリパス', () => {
    /** walkFiles(nonExistentDir, ".jsonl") を呼び出す */
    describe('When: walkFiles(nonExistentDir, ".jsonl") を呼び出す', () => {
      /** T-EC-WF-05: 空のイテレータを返す（エラーなし） */
      describe('Then: T-EC-WF-05 - 空のイテレータを返す（エラーなし）', () => {
        it('T-EC-WF-05-01: 収集ファイル数が 0', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(`${tempDir}/no-such-dir`, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.length, 0);
        });
      });
    });
  });

  // ─── T-EC-WF-06: 空ディレクトリ → 空 ────────────────────────────────────

  /** 空ディレクトリでは yield なしでイテレーションが終了することを確認する */
  describe('Given: ファイルが存在しない空のディレクトリ', () => {
    /** walkFiles(emptyDir, ".jsonl") を呼び出す */
    describe('When: walkFiles(emptyDir, ".jsonl") を呼び出す', () => {
      let emptyDir: string;

      beforeEach(async () => {
        emptyDir = `${tempDir}/empty`;
        await Deno.mkdir(emptyDir);
      });

      /** T-EC-WF-06: 空のイテレータを返す */
      describe('Then: T-EC-WF-06 - 空のイテレータを返す', () => {
        it('T-EC-WF-06-01: 収集ファイル数が 0', async () => {
          const results: string[] = [];
          for await (const f of walkFiles(emptyDir, '.jsonl')) {
            results.push(f);
          }
          assertEquals(results.length, 0);
        });
      });
    });
  });
});
