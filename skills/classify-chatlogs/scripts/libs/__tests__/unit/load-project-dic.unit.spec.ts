// src: scripts/libs/__tests__/load-project-dic.unit.spec.ts
// @(#): loadProjectDic のユニットテスト（resolveProvider 注入によりファイルシステム非依存）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD Framework --
import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { loadProjectDic } from '../../load-project-dic.ts';
// types
import type { ResolveConfigPathOptions } from '../../../../../_cle-libs/types/path-utils.types.ts';
import type { ProjectDicEntry } from '../../../types/classify.types.ts';
// classed
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';

// ─── Helpers
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';

// ─── テスト用フィクスチャ ──────────────────────────────────────────────────────

const _FIXTURE_DIC_PATH = normalizePath(
  new URL('../../../modules/__tests__/integration/assets/projects.dic', import.meta.url).pathname,
);

const _FIXTURE_TEXT_NO_MISC = `app1:\n  def: Test project 1\napp2:\n  def: Test project 2\n`;
const _FIXTURE_TEXT_NON_STRING_PROP = `app1:\n  def: Test project 1\n  count: 5\n`;
const _FIXTURE_TEXT_SCALAR_PROJECT = `app1: scalar value\napp2:\n  def: Test project 2\n`;

const _FALLBACK_PROPS = {
  def: 'Miscellaneous logs that do not belong to any specific project',
  category: 'casual',
  desc: '特定プロジェクトに属さない雑多なログ。日常的な質問・技術外の相談・一時的な調査',
};

const _resolveToFixture = (_opts: ResolveConfigPathOptions): string => _FIXTURE_DIC_PATH;
const _resolveFileDirNotFound = (_opts: ResolveConfigPathOptions): string => {
  throw new ChatlogError('FileDirNotFound', 'TestStub', 'テスト用: ファイル不在');
};
const _resolveGitNotFound = (_opts: ResolveConfigPathOptions): string => {
  throw new ChatlogError('GitNotFound', 'TestStub', 'テスト用: git が見つからない');
};

const _readPermissionError = (_path: string) =>
  Promise.reject(new Deno.errors.PermissionDenied('テスト用: 読み取り権限なし'));
const _readInvalidYaml = (_path: string) => Promise.resolve('invalid: yaml: [\nunclosed');
const _readNoMisc = (_path: string) => Promise.resolve(_FIXTURE_TEXT_NO_MISC);
const _readEmpty = (_path: string) => Promise.resolve('');
const _readNonStringProp = (_path: string) => Promise.resolve(_FIXTURE_TEXT_NON_STRING_PROP);
const _readScalarProject = (_path: string) => Promise.resolve(_FIXTURE_TEXT_SCALAR_PROJECT);

// 深くネストした flow シーケンス（未クローズの `[` を大量に連結）を与えると、
// `@std/yaml` の再帰下降パーサがコールスタック上限に達し `RangeError` を throw する。
// これは `parseYaml` が `SyntaxError` 以外の例外を投げる実例であり、
// `loadProjectDic` の非 SyntaxError 再throwパス（T-CL-LPD-17）を駆動するために使用する。
const _readDeeplyNestedYaml = (_path: string) => Promise.resolve('a: ' + '['.repeat(20000));

// ─── loadProjectDic ───────────────────────────────────────────────────────────

describe('loadProjectDic', () => {
  // ─── 正常系 ───────────────────────────────────────────────────────────────

  describe('正常系', () => {
    // T-CL-LPD-03: YAML 形式辞書 → ProjectDicEntry を返す
    it('T-CL-LPD-03-01: 非空オブジェクトが返される', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assert(Object.keys(_projects).length > 0);
    });

    it('T-CL-LPD-03-02: misc が含まれる', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assert('misc' in _projects);
    });

    it('T-CL-LPD-03-03: 空文字列キーが含まれない', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assertFalse('' in _projects);
    });

    it('T-CL-LPD-03-04: app1 が含まれる（YAML トップレベルキーとして認識される）', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assert('app1' in _projects);
    });

    // ネストキー除外をパラメータテーブルで検証
    const _nestedKeyTable: { key: string }[] = [
      { key: 'def' },
      { key: 'category' },
      { key: 'desc' },
    ];
    for (const { key } of _nestedKeyTable) {
      it(`T-CL-LPD-03-05: "${key}" を名前とするキーが含まれない（ネストキーは除外される）`, async () => {
        const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

        assertFalse(key in _projects);
      });
    }

    // プロジェクトメタデータをパラメータテーブルで検証
    const _metaTable: { project: string; prop: string; expected: string }[] = [
      { project: 'app1', prop: 'def', expected: 'Test project 1' },
      { project: 'app1', prop: 'category', expected: 'development' },
      { project: 'app2', prop: 'def', expected: 'Test project 2' },
    ];
    for (const { project, prop, expected } of _metaTable) {
      it(`T-CL-LPD-03-06: ${project}.${prop} が "${expected}" である`, async () => {
        const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

        assertEquals(_projects[project]?.[prop], expected);
      });
    }

    // T-CL-LPD-04: resolveProvider 経由でパスが解決される
    it('T-CL-LPD-04-01: resolveProvider 経由で読み込まれた辞書に app1 が含まれる', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assert('app1' in _projects);
    });

    // T-CL-LPD-06: 引数なし → resolveProvider に configPath=undefined / defaultPath が渡る
    it('T-CL-LPD-06-01: 引数なしで呼び出すと resolveProvider の configPath が undefined になる', async () => {
      let _capturedOpts: ResolveConfigPathOptions | undefined;
      const _captureResolve = (opts: ResolveConfigPathOptions): string => {
        _capturedOpts = opts;
        return _FIXTURE_DIC_PATH;
      };

      await loadProjectDic(undefined, _captureResolve);

      assertEquals(_capturedOpts?.configPath, undefined);
    });

    it('T-CL-LPD-06-02: 引数なしで呼び出すと resolveProvider の defaultPath が dics/projects.dic になる', async () => {
      let _capturedOpts: ResolveConfigPathOptions | undefined;
      const _captureResolve = (opts: ResolveConfigPathOptions): string => {
        _capturedOpts = opts;
        return _FIXTURE_DIC_PATH;
      };

      await loadProjectDic(undefined, _captureResolve);

      assertEquals(_capturedOpts?.defaultPath, 'dics/projects.dic');
    });

    // T-CL-LPD-12: resolveProvider の出力が readProvider に渡る
    it('T-CL-LPD-12-01: resolveProvider が返したパスが readProvider に渡される', async () => {
      let _capturedPath: string | undefined;
      const _captureRead = (path: string) => {
        _capturedPath = path;
        return Promise.resolve('');
      };

      await loadProjectDic('assets/configs/projects.dic', _resolveToFixture, _captureRead);

      assertEquals(_capturedPath, _FIXTURE_DIC_PATH);
    });

    // T-CL-LPD-09: misc が辞書にある → misc が含まれる（重複なし）
    it('T-CL-LPD-09-01: misc キーが存在する', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assert('misc' in _projects);
    });

    it('T-CL-LPD-09-02: misc が 1 つのみ含まれる（重複なし）', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assertEquals(Object.keys(_projects).filter((k) => k === 'misc').length, 1);
    });

    it('T-CL-LPD-09-03: misc エントリが YAML のメタデータを保持する', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assertEquals(_projects['misc']?.['def'], 'Miscellaneous');
      assertEquals(_projects['misc']?.['category'], 'casual');
    });
  });

  // ─── 異常系 ───────────────────────────────────────────────────────────────

  describe('異常系', () => {
    // T-CL-LPD-05 / T-CL-LPD-07: resolveProvider がエラーを throw → 再throw される
    const _resolveErrorTable: {
      label: string;
      resolveProvider: (opts: ResolveConfigPathOptions) => string;
      expectedKind: string;
    }[] = [
      {
        label: 'T-CL-LPD-05',
        resolveProvider: _resolveFileDirNotFound,
        expectedKind: 'FileDirNotFound',
      },
      {
        label: 'T-CL-LPD-07',
        resolveProvider: _resolveGitNotFound,
        expectedKind: 'GitNotFound',
      },
    ];

    for (const { label, resolveProvider, expectedKind } of _resolveErrorTable) {
      it(`${label}-01: ChatlogError(${expectedKind}) が throw される`, async () => {
        await assertRejects(
          () => loadProjectDic('assets/configs/projects.dic', resolveProvider),
          ChatlogError,
        );
      });

      it(`${label}-02: throw された ChatlogError の kind が ${expectedKind} である`, async () => {
        const err = await loadProjectDic('assets/configs/projects.dic', resolveProvider).catch((e) => e);

        assert(err instanceof ChatlogError);
        assertEquals((err as ChatlogError).kind, expectedKind);
      });
    }

    // T-CL-LPD-08: readProvider が PermissionDenied を throw → 再throw される
    it('T-CL-LPD-08-01: readProvider が PermissionDenied を throw するとエラーが再throw される', async () => {
      await assertRejects(
        () => loadProjectDic('assets/configs/projects.dic', _resolveToFixture, _readPermissionError),
        Deno.errors.PermissionDenied,
      );
    });

    // T-CL-LPD-16: 不正 YAML → ChatlogError('InvalidYaml') が throw される
    it('T-CL-LPD-16-01: 不正 YAML のとき ChatlogError が throw される', async () => {
      await assertRejects(
        () => loadProjectDic('assets/configs/projects.dic', _resolveToFixture, _readInvalidYaml),
        ChatlogError,
      );
    });

    it('T-CL-LPD-16-02: throw された ChatlogError の kind が InvalidYaml である', async () => {
      const err = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture, _readInvalidYaml)
        .catch((e) => e);

      assert(err instanceof ChatlogError);
      assertEquals((err as ChatlogError).kind, 'InvalidYaml');
    });

    it('T-CL-LPD-16-03: throw された ChatlogError の subindex が "ProjectsDic" になる', async () => {
      const err = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readInvalidYaml,
      ).catch((e) => e);

      assert(err instanceof ChatlogError);
      assertEquals((err as ChatlogError).subindex, 'YamlSyntaxError');
    });

    // T-CL-LPD-17: parseYaml が SyntaxError 以外の例外（RangeError）を throw → ChatlogError に変換されず素通しで再throw される
    it('T-CL-LPD-17-01: parseYaml が RangeError を throw するとき ChatlogError ではなく RangeError がそのまま throw される', async () => {
      await assertRejects(
        () => loadProjectDic('assets/configs/projects.dic', _resolveToFixture, _readDeeplyNestedYaml),
        RangeError,
      );
    });
  });

  // ─── エッジケース ─────────────────────────────────────────────────────────

  describe('エッジケース', () => {
    // T-CL-LPD-10: misc が辞書にない → デフォルト misc が追加される
    it('T-CL-LPD-10-01: misc が辞書にないとき misc キーが追加される', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNoMisc,
      );

      assert('misc' in _projects);
    });

    it('T-CL-LPD-10-02: misc が辞書にないとき misc が 1 つのみ含まれる', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNoMisc,
      );

      assertEquals(Object.keys(_projects).filter((k) => k === 'misc').length, 1);
    });

    it('T-CL-LPD-10-03: misc が辞書にないときデフォルトメタデータが設定される', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNoMisc,
      ) as ProjectDicEntry;

      assertEquals(_projects['misc']?.['def'], _FALLBACK_PROPS.def);
      assertEquals(_projects['misc']?.['category'], _FALLBACK_PROPS.category);
    });

    it('T-CL-LPD-10-04: misc が辞書にないとき他のプロジェクトエントリが保持される', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNoMisc,
      );

      assert('app1' in _projects);
      assert('app2' in _projects);
    });

    // T-CL-LPD-13: misc は常に末尾に配置される
    it('T-CL-LPD-13-01: misc が辞書にあるとき misc がエントリの末尾に配置される', async () => {
      const _projects = await loadProjectDic('assets/configs/projects.dic', _resolveToFixture);

      assertEquals(Object.keys(_projects).at(-1), 'misc');
    });

    it('T-CL-LPD-13-02: misc が辞書にないとき追加された misc がエントリの末尾に配置される', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNoMisc,
      );

      assertEquals(Object.keys(_projects).at(-1), 'misc');
    });

    // T-CL-LPD-14: プロジェクトのプロパティ値が非文字列 → そのプロパティが除外される
    it('T-CL-LPD-14-01: 数値プロパティ値はプロジェクトメタデータから除外される', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNonStringProp,
      );

      assertFalse('count' in (_projects['app1'] ?? {}));
    });

    it('T-CL-LPD-14-02: 文字列プロパティ値はプロジェクトメタデータに含まれる', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readNonStringProp,
      );

      assertEquals(_projects['app1']?.['def'], 'Test project 1');
    });

    // T-CL-LPD-15: プロジェクト値が非オブジェクト（スカラー）→ そのプロジェクトが {} になる
    it('T-CL-LPD-15-01: プロジェクト値がスカラーのときそのプロジェクトのメタデータが空オブジェクトになる', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readScalarProject,
      );

      assertEquals(_projects['app1'], {});
    });

    it('T-CL-LPD-15-02: プロジェクト値がスカラーでも他のプロジェクトエントリは正常にパースされる', async () => {
      const _projects = await loadProjectDic(
        'assets/configs/projects.dic',
        _resolveToFixture,
        _readScalarProject,
      );

      assertEquals(_projects['app2']?.['def'], 'Test project 2');
    });

    // T-CL-LPD-11: YAML が空 → {misc: _FALLBACK_PROJECT_PROPS} を返す
    const _fallbackPropTable: { prop: keyof typeof _FALLBACK_PROPS; expected: string }[] = [
      { prop: 'def', expected: _FALLBACK_PROPS.def },
      { prop: 'category', expected: _FALLBACK_PROPS.category },
      { prop: 'desc', expected: _FALLBACK_PROPS.desc },
    ];

    for (const { prop, expected } of _fallbackPropTable) {
      it(`T-CL-LPD-11-01: 空 YAML のとき misc.${prop} がフォールバック値になる`, async () => {
        const _projects = await loadProjectDic(
          'assets/configs/projects.dic',
          _resolveToFixture,
          _readEmpty,
        );

        assertEquals(_projects['misc']?.[prop], expected);
      });
    }
  });
});
