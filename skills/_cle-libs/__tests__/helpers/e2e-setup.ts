// src: scripts/__tests__/_helpers/e2e-setup.ts
// @(#): E2E テスト共通セットアップユーティリティ
//       tempDir 管理・ログキャプチャ・サイレンスの定型処理を関数化する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';

// ─── 一時ディレクトリ ──────────────────────────────────────────────────────────

/** inputDir / outputDir を作成して返す。 */
export async function makeTempDirs(): Promise<{ inputDir: string; outputDir: string }> {
  const inputDir = await Deno.makeTempDir();
  const outputDir = await Deno.makeTempDir();
  return { inputDir, outputDir };
}

/** inputDir / outputDir を再帰削除する。 */
export async function removeTempDirs(inputDir: string, outputDir: string): Promise<void> {
  await Deno.remove(inputDir, { recursive: true });
  await Deno.remove(outputDir, { recursive: true });
}

// ─── ログキャプチャ ────────────────────────────────────────────────────────────

/** captureLog() が返すハンドル。calls で出力行を参照し、restore() でスタブを解除する。 */
export interface LogCapture {
  calls: string[];
  stub: Stub;
  restore(): void;
}

/**
 * console.log をキャプチャするスタブを設置し、ハンドルを返す。
 * afterEach で handle.restore() を呼ぶこと。
 * calls 配列はリセット不要な場合はそのまま参照し、
 * 途中リセットが必要な場合は calls.splice(0) を使う。
 */
export function captureLog(): LogCapture {
  const calls: string[] = [];
  const logStub = stub(console, 'log', (...args: unknown[]) => {
    calls.push(args.map(String).join(' '));
  });
  return {
    calls,
    stub: logStub,
    restore() {
      logStub.restore();
    },
  };
}

// ─── ログサイレンス ────────────────────────────────────────────────────────────

/** silenceLog() が返すハンドル。restore() でスタブを解除する。 */
export interface LogSilencer {
  restore(): void;
}

/**
 * console.log を no-op に差し替えるスタブを設置し、ハンドルを返す。
 * afterEach で handle.restore() を呼ぶこと。
 */
export function silenceLog(): LogSilencer {
  const logStub = stub(console, 'log', () => {});
  return {
    restore() {
      logStub.restore();
    },
  };
}
