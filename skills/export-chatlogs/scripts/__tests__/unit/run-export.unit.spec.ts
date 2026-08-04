// src: scripts/__tests__/unit/run-export.unit.spec.ts
// @(#): runExport のユニットテスト
//       対象: runExport
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { runExport } from '../../export-chatlogs.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ExportConfig } from '../../types/export-config.types.ts';

// ─── Internal Helpers

// constants
/** `runExport` のエラー分岐検証に使う最小構成の `ExportConfig`。 */
const _BASE_CONFIG: ExportConfig = { agent: 'chatgpt', exportDir: '/tmp/out' };

// ─── Tests

/**
 * `runExport` のユニットテストスイート。
 *
 * agent 振り分けのエラー分岐のみを検証する。claude/codex の正常系は
 * 実 exporter 呼び出しとなり I/O が発生するため対象外とする。
 *
 * @see runExport
 */
describe('runExport', () => {
  /** 不正な agent 指定・未対応 agent 指定によるエラー分岐。 */
  describe('When: 異常系', () => {
    it('[Error] T-EC-RE-01: agent=chatgpt かつ inputDir 未指定 → ChatlogError(InvalidArgs/NotSpecified)', async () => {
      const _config: ExportConfig = { ..._BASE_CONFIG, agent: 'chatgpt' };

      const error = await assertRejects(() => runExport(_config), ChatlogError);
      const _err = error as ChatlogError;
      if (_err.kind !== 'InvalidArgs' || _err.subindex !== 'NotSpecified') {
        throw new Error(`unexpected kind/subindex: ${_err.kind}/${_err.subindex}`);
      }
    });

    it('[Error] T-EC-RE-02: agent が未知の値 → ChatlogError(InvalidArgs/UnsupportedAgent)', async () => {
      const _config: ExportConfig = { ..._BASE_CONFIG, agent: 'unknown' };

      const error = await assertRejects(() => runExport(_config), ChatlogError);
      const _err = error as ChatlogError;
      if (_err.kind !== 'InvalidArgs' || _err.subindex !== 'UnsupportedAgent') {
        throw new Error(`unexpected kind/subindex: ${_err.kind}/${_err.subindex}`);
      }
    });

    it('[Error] T-EC-RE-03: agent が大文字小文字違い（Claude） → ChatlogError(InvalidArgs/UnsupportedAgent)', async () => {
      const _config: ExportConfig = { ..._BASE_CONFIG, agent: 'Claude' };

      const error = await assertRejects(() => runExport(_config), ChatlogError);
      const _err = error as ChatlogError;
      if (_err.kind !== 'InvalidArgs' || _err.subindex !== 'UnsupportedAgent') {
        throw new Error(`unexpected kind/subindex: ${_err.kind}/${_err.subindex}`);
      }
    });
  });
});
