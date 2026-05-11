// src: scripts/exporter/__tests__/_helpers/flow-providers.ts
// @(#): exporter ユニットテスト共通ヘルパー
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Types
import type { ExportedSession } from '../../../types/session.types.ts';

// ─── Helpers
/**
 * 1セッションの処理フローを表すタプル。
 * - [0] filePath: findSessions が返すファイルパス
 * - [1] parseResult: parseSession の遅延評価結果
 * - [2] writeResult: writeSession の遅延評価結果
 */
export type SessionFlow = [
  filePath: string,
  parseResult: () => Promise<ExportedSession | null>,
  writeResult: () => Promise<string>,
];

/**
 * SessionFlow の配列から findSessions / parseSession / writeSession の
 * Provider セットを生成する。
 *
 * - findSessions は flows の filePath 一覧を一括返却する
 * - parseSession は filePath でフローを引いて parseResult を遅延評価し、
 *   writeResult をキューに積む
 * - writeSession はキューから writeResult を取り出して遅延評価する
 *
 * @example
 * _makeFlowProviders([
 *   ['/fake/a.jsonl', () => Promise.resolve(session), () => Promise.resolve('/out/a.md')],
 *   ['/fake/b.jsonl', () => Promise.resolve(null),    () => Promise.resolve('')],
 *   ['/fake/c.jsonl', () => Promise.reject(new Error('parse failed')), () => Promise.resolve('')],
 * ])
 */
export function _makeFlowProviders(flows: SessionFlow[]): {
  findSessions: () => Promise<string[]>;
  parseSession: (filePath: string) => Promise<ExportedSession | null>;
  writeSession: () => Promise<string>;
} {
  const flowMap = new Map(flows.map(([path, parse, write]) => [path, { parse, write }]));
  const writeQueue: Array<() => Promise<string>> = [];

  return {
    findSessions: () => Promise.resolve(flows.map(([path]) => path)),
    parseSession: (filePath: string) => {
      const flow = flowMap.get(filePath)!;
      writeQueue.push(flow.write);
      return flow.parse();
    },
    writeSession: () => writeQueue.shift()!(),
  };
}
