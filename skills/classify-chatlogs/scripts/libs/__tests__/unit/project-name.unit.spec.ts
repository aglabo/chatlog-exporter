// src: scripts/libs/__tests__/unit/project-name.unit.spec.ts
// @(#): isSafeProjectName のユニットテスト
//       対象: isSafeProjectName
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isSafeProjectName } from '../../project-name.ts';

// ─── Tests

describe('Given: isSafeProjectName', () => {
  describe('When: 1 セグメントのディレクトリ名として安全な文字列を渡す', () => {
    const _cases = [
      { id: 'T-CL-PN-01-01', input: 'foo' },
      { id: 'T-CL-PN-01-02', input: 'chatlog-exporter' },
      { id: 'T-CL-PN-01-03', input: 'my.project' },
    ];

    for (const { id, input } of _cases) {
      it(`Then: [正常] ${id}: ${JSON.stringify(input)} → true`, () => {
        assertEquals(isSafeProjectName(input), true);
      });
    }
  });

  describe('When: パス区切り・ドライブ指定・相対参照を含む文字列を渡す', () => {
    const _cases = [
      { id: 'T-CL-PN-02-01', input: '.' },
      { id: 'T-CL-PN-02-02', input: '..' },
      { id: 'T-CL-PN-02-03', input: '../x' },
      { id: 'T-CL-PN-02-04', input: 'a/b' },
      { id: 'T-CL-PN-02-05', input: 'a\\b' },
      { id: 'T-CL-PN-02-06', input: 'C:foo' },
    ];

    for (const { id, input } of _cases) {
      it(`Then: [異常] ${id}: ${JSON.stringify(input)} → false`, () => {
        assertEquals(isSafeProjectName(input), false);
      });
    }
  });

  describe('When: 空文字列または文字列以外の値を渡す', () => {
    const _cases: { id: string; input: unknown }[] = [
      { id: 'T-CL-PN-03-01', input: '' },
      { id: 'T-CL-PN-03-02', input: undefined },
      { id: 'T-CL-PN-03-03', input: null },
      { id: 'T-CL-PN-03-04', input: 42 },
      { id: 'T-CL-PN-03-05', input: ['foo'] },
      { id: 'T-CL-PN-03-06', input: { name: 'foo' } },
    ];

    for (const { id, input } of _cases) {
      it(`Then: [エッジケース] ${id}: ${JSON.stringify(input) ?? String(input)} → false`, () => {
        assertEquals(isSafeProjectName(input), false);
      });
    }
  });
});
