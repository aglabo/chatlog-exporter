// src: scripts/modules/__tests__/unit/setfm-contracts.unit.spec.ts
// @(#): 起動時の出力契約値域検査のユニットテスト
//       対象: assertSetfmContracts
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assert, assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { assertSetfmContracts } from '../../setfm-contracts.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// constants
import { ERROR_KIND_LABELS } from '../../../../../_cle-libs/constants/chatlog-error.constants.ts';
// types
import type { DicEntry, Dics } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// functions
/**
 * キーだけを持つ辞書エントリ配列を生成する。
 *
 * @param keys - 辞書キー
 * @returns 各キーに対応する `DicEntry` 配列
 */
const _entries = (keys: string[]): DicEntry[] => keys.map((key) => ({ key, def: '', desc: '', rules: {} }));

/**
 * 実辞書（`.config/chatlog-exporter/dics/`）相当の有効な `Dics` を生成する。
 *
 * フォールバック値 `research` / `development` を値域に含む。
 *
 * @param overrides - 上書きするフィールド
 * @returns テスト用 `Dics`
 */
const _makeDics = (overrides: Partial<Dics> = {}): Dics => ({
  category: 'development,bugfix',
  tags: 'typescript,deno',
  categoryEntries: _entries(['development', 'bugfix']),
  typeEntries: _entries(['research', 'idea']),
  topicEntries: _entries(['ai']),
  ...overrides,
});

// constants
/** テスト用の解決済み辞書ディレクトリ。 */
const _DICS_DIR = '/dics';

/** 起動時検査が throw する辞書設定と、detail（辞書ファイルパス付き）の先頭文字列の対応表。 */
const _errorCases: { id: string; label: string; dics: Partial<Dics>; detailPrefix: string }[] = [
  {
    id: 'T-SF-SOC-02-01',
    label: 'category 辞書に development が無い',
    dics: { category: 'bugfix' },
    detailPrefix: '/dics/category.dic: category: フォールバック値 "development" が値域に存在しません',
  },
  {
    id: 'T-SF-SOC-02-02',
    label: 'types 辞書に research が無い',
    dics: { typeEntries: _entries(['idea']) },
    detailPrefix: '/dics/types.dic: type: フォールバック値 "research"',
  },
  {
    id: 'T-SF-SOC-02-03',
    label: 'category 辞書が空',
    dics: { category: '' },
    detailPrefix: '/dics/category.dic: category: 値域が空です',
  },
  {
    id: 'T-SF-SOC-03-01',
    label: 'types 辞書が空',
    dics: { typeEntries: [] },
    detailPrefix: '/dics/types.dic: type: 値域が空です',
  },
];

// ─── Tests

/**
 * `assertSetfmContracts` のユニットテストスイート。
 *
 * type/category → frontmatter → review の 3 出力契約を構築し、値域規則違反を
 * 起動時の設定エラーとして検出することを検証する。
 *
 * テスト ID 範囲: T-SF-SOC-01 〜 T-SF-SOC-03
 *
 * @see assertSetfmContracts
 */
describe('assertSetfmContracts', () => {
  /** 有効な辞書を渡す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-SOC-01-01: 有効な辞書 → throw しない', () => {
      assertSetfmContracts(_makeDics(), _DICS_DIR);
    });
  });

  /**
   * 辞書の設定エラーで起動時検査が throw するケース。type/category 契約の違反が review 契約より先に報告される。
   * 空の types 辞書（T-SF-SOC-03-01）も辞書ファイル名付きの設定エラーとして同じ表で検証する。
   */
  describe('When: 異常系', () => {
    for (const { id, label, dics, detailPrefix } of _errorCases) {
      it(`[Error] ${id}: ${label} → detail が "${detailPrefix}" で始まる`, () => {
        const _error = assertThrows(() => assertSetfmContracts(_makeDics(dics), _DICS_DIR), ChatlogError);
        assertEquals(_error.kind, 'InvalidFormat');
        assertEquals(_error.subindex, 'InvalidDic');
        assert(_error.message.startsWith(`${ERROR_KIND_LABELS.InvalidFormat}: ${detailPrefix}`), _error.message);
      });
    }
  });

  /** 空辞書の境界値。配列要素 enum の空値域は許容される（単一値 enum の空値域は異常系の表で検証）。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-SOC-03-02: tags / topics 辞書が空 → throw しない', () => {
      assertSetfmContracts(_makeDics({ tags: '', topicEntries: [] }), _DICS_DIR);
    });
  });
});
