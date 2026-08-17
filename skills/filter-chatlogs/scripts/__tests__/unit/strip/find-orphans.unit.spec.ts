// src: scripts/__tests__/unit/strip/find-orphans.unit.spec.ts
// @(#): strip 孤立退避の検出（R-014 / DR-23）のユニットテスト
//       対象: findOrphans
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { findOrphans } from '../../../modules/strip/find-orphans.ts';

// ─── Helpers
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// types
import type { GlobProvider } from '../../../../../_cle-libs/types/providers.types.ts';

// ─── Internal Helpers

// constants

/** テスト対象ディレクトリ。`normalizePath` 済みの形（ドライブレター大文字・スラッシュ区切り）で与える。 */
const _DIR = 'W:/temp/strip';

// types

/** `_makeGlobSpy` に渡す、拡張子ごとのファイル一覧。 */
interface _GlobFiles {
  /** `<dir>/*.md` が返す本体ファイル一覧。 */
  md?: string[];
  /** `<dir>/*.md.bak` が返す退避ファイル一覧。 */
  bak?: string[];
  /** `<dir>/*.md.tmp` が返す一時ファイル一覧。 */
  tmp?: string[];
}

// functions

/**
 * 受け取った glob パターンの拡張子で応答を切り替える fake `GlobProvider` を生成する。
 *
 * パターンを無視して固定配列を返すと、実装が `.bak` と `.tmp` を取り違えていても
 * 全ケースが通ってしまう。ここではパターン末尾の拡張子で分岐し、渡されたパターンを
 * 記録して呼び出し側が照合できるようにする。
 *
 * `findFilesFlat` は `_defaultGlob` のときだけ `normalizePath` を適用するため
 * （find-files.ts:34）、注入側が正規化済みパスを返す責務を負う。
 *
 * @param files - 拡張子ごとに返すファイルパス一覧
 * @returns fake `GlobProvider` と、渡された glob パターンの記録
 */
const _makeGlobSpy = (files: _GlobFiles): { glob: GlobProvider; patterns: string[] } => {
  const patterns: string[] = [];
  const glob: GlobProvider = (pattern: string) => {
    patterns.push(pattern);
    const _ext = pattern.slice(pattern.lastIndexOf('.'));
    const _table: Record<string, string[]> = {
      '.md': files.md ?? [],
      '.bak': files.bak ?? [],
      '.tmp': files.tmp ?? [],
    };
    return Promise.resolve((_table[_ext] ?? []).map((path) => normalizePath(path)));
  };
  return { glob, patterns };
};

/**
 * 1 つのディレクトリ実体からパターン末尾の一致でファイルを絞り込む fake `GlobProvider` を生成する。
 *
 * `_makeGlobSpy` は拡張子ごとに別々の一覧を受け取るため、`notes.bak` を渡さなければ
 * 絞り込みの有無にかかわらず同じ結果になり「無関係な `.bak` を拾わないこと」を検証できない。
 * こちらはディレクトリの全エントリを 1 つの配列で受け取り、`expandGlob` と同じく
 * パターンの `*` 以降の接尾辞で実際に絞り込む。
 *
 * @param entries - 対象ディレクトリ直下に実在するファイルパスの一覧
 * @returns 接尾辞一致で絞り込む fake `GlobProvider`
 */
const _makeDirGlob = (entries: string[]): GlobProvider => (pattern: string) => {
  const _suffix = pattern.slice(pattern.lastIndexOf('*') + 1);
  return Promise.resolve(entries.filter((path) => path.endsWith(_suffix)).map((path) => normalizePath(path)));
};

// ─── Tests

/**
 * `findOrphans` のユニットテストスイート。
 *
 * REQ-NF-005 の手順 2〜3 の間で中断したときに生じる「孤立退避」
 * （`<name>.md` を伴わない `<name>.md.bak`）の検出を検証する。
 * `.md.tmp` は検出対象に含めない（DR-26）。
 *
 * テスト ID 範囲: T-FL-SEP-03-01 / T-FL-SEP-05-01 / T-FL-SEP-05-03
 *
 * @see findOrphans
 */
describe('findOrphans', () => {
  /**
   * R-014 / DR-23 / DR-26 の孤立退避検出の検証。
   *
   * 本体 `.md` の一覧と退避 `.bak` の一覧を突き合わせ、
   * 本体を持たない退避のみを孤立として返すことを確認する。
   */
  describe('孤立退避の検出', () => {
    /** 本体を伴わない退避が残存しているケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-03-01: .md 不在で .md.bak が存在する name が孤立として検出される', async () => {
        // a.md は本体を持つため孤立ではない。orphan.md は本体が無く .bak のみ残る
        const { glob, patterns } = _makeGlobSpy({
          md: [`${_DIR}/a.md`],
          bak: [`${_DIR}/a.md.bak`, `${_DIR}/orphan.md.bak`],
        });

        const orphans = await findOrphans(_DIR, { glob });

        assertEquals(orphans, [`${_DIR}/orphan.md`]);
        // 本体・退避の 2 系統のみを列挙すること（`.md.tmp` は DR-26 により対象外）
        assertEquals(patterns.toSorted(), [`${_DIR}/*.md`, `${_DIR}/*.md.bak`].toSorted());
      });
    });
  });

  /**
   * 孤立退避の対象を `.md` 由来の `.bak` に限定することの検証（DR-23 決定 1・3 / DR-26）。
   *
   * 孤立退避は `<name>.md.bak` と定義されるため、エディタ等が生成した
   * `.md` 由来でない `.bak` を拾ってはならない。`.tmp` は種別を問わず対象外とする。
   */
  describe('対象外ファイルの除外', () => {
    /** `.md` 由来でない退避風ファイルが同一ディレクトリに混在するケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-FL-SEP-05-01: .md 由来でない notes.bak / work.tmp は孤立として検出されない', async () => {
        // notes.bak / work.tmp はエディタ等の産物であり strip の退避ではない。
        // これらを孤立として拾うと error 計上により退避の一括削除が止まる（R-011 の誤発火）
        const glob = _makeDirGlob([
          `${_DIR}/a.md`,
          `${_DIR}/orphan.md.bak`,
          `${_DIR}/notes.bak`,
          `${_DIR}/work.tmp`,
        ]);

        const orphans = await findOrphans(_DIR, { glob });

        assertEquals(orphans, [`${_DIR}/orphan.md`]);
      });

      it('[Edge] T-FL-SEP-05-03: .md.tmp のみが残る name は孤立として検出されない', async () => {
        // REQ-NF-005 の手順 1 の時点では `<name>.md` が無傷であり、`.tmp` 単独で
        // 本体を伴わない状態は正常な処理順序では生じない（DR-26）。
        // both.md.tmp を併置することで「`.bak` があれば検出し、`.tmp` は参照しない」を区別する
        const { glob, patterns } = _makeGlobSpy({
          bak: [`${_DIR}/both.md.bak`],
          tmp: [`${_DIR}/both.md.tmp`, `${_DIR}/tmponly.md.tmp`],
        });

        const orphans = await findOrphans(_DIR, { glob });

        assertEquals(orphans, [`${_DIR}/both.md`]);
        // `.md.tmp` を glob しないこと（列挙してしまうと tmponly が孤立に混入する）
        assertEquals(patterns.includes(`${_DIR}/*.md.tmp`), false);
      });
    });
  });
});
