#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/integration/normalize-chatlogs.integration-inputDir.spec.ts
// @(#): 実ファイルシステムを使った統合テスト
//       対象: validateInputDir
//       テスト種別: 正常系 / 異常系
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import {
  validateInputDir,
} from '../../normalize-chatlogs.ts';

// ─── validateInputDir 統合テスト ──────────────────────────────────────────────

/**
 * validateInputDir の統合テスト（実FS使用）。
 * 実在するディレクトリに対して true、存在しないパスに対して false を返すことを検証する。
 */
describe('Given: validateInputDir (実FS統合テスト)', () => {
  // ─── T-INT-01: 存在するディレクトリ（正常系） ─────────────────────────────

  describe('When: 存在するディレクトリパスを渡す', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = Deno.makeTempDirSync();
    });

    afterEach(() => {
      Deno.removeSync(tempDir, { recursive: true });
    });

    /** 正常系: 実在するディレクトリで true が返る */
    it('Then: [正常] - true を返す', () => {
      const result = validateInputDir(tempDir);

      assertEquals(result, true);
    });
  });

  // ─── T-INT-02: 存在しないパス（異常系） ──────────────────────────────────

  describe('When: 存在しないパスを渡す', () => {
    /** 異常系: 存在しないパスで false が返る */
    it('Then: [異常] - false を返す', () => {
      const result = validateInputDir('/nonexistent/path/xyz/abc');

      assertEquals(result, false);
    });
  });
});
