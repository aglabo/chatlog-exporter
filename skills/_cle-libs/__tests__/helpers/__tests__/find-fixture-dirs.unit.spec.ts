// src: skills/_cle-libs/__tests__/helpers/find-fixture-dirs.unit.spec.ts
// @(#): findFixtureDirs ユニットテスト
//       isFixtureDirProvider を DI して実ファイルシステムに依存しないテストを実施する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals, assertFalse } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// -- test target --
import { defaultIsFixtureDir, findFixtureDirs } from '../find-fixture-dirs.ts';
// -- utils --
import { normalizePath } from '../../../libs/path-utils/path-utils.ts';
// -- types --
import type { IsFixtureDirProvider } from '../find-fixture-dirs.ts';

// ─────────────────────────────────────────────
// defaultIsFixtureDir — ユニットテスト
// ─────────────────────────────────────────────

/** defaultIsFixtureDir: input.md の有無でフィクスチャディレクトリを判定する関数のテスト */
describe('Given: defaultIsFixtureDir', () => {
  let _tempDir: string;

  /** 共通前処理: 一時ディレクトリを作成 */
  beforeEach(async () => {
    _tempDir = await Deno.makeTempDir({ prefix: 'find-fixture-dirs-' });
  });

  /** 共通後処理: 一時ディレクトリを削除 */
  afterEach(async () => {
    await Deno.remove(_tempDir, { recursive: true });
  });

  /** input.md が存在するディレクトリを渡した場合 */
  describe('When: input.md があるディレクトリを渡す', () => {
    it('Then: [正常] - true を返す', async () => {
      // arrange
      await Deno.writeTextFile(`${_tempDir}/input.md`, '');

      // act
      const _result = await defaultIsFixtureDir(_tempDir);

      // assert
      assert(_result);
    });
  });

  /** input.md が存在しないディレクトリを渡した場合 */
  describe('When: input.md がないディレクトリを渡す', () => {
    it('Then: [正常] - false を返す', async () => {
      // act
      const _result = await defaultIsFixtureDir(_tempDir);

      // assert
      assertFalse(_result);
    });
  });

  /** 存在しないディレクトリパスを渡した場合（エッジケース） */
  describe('When: 存在しないディレクトリを渡す', () => {
    it('Then: [エッジケース] - 例外をスローせず false を返す', async () => {
      // arrange
      const _dir = `${_tempDir}/__nonexistent__`;

      // act
      const _result = await defaultIsFixtureDir(_dir);

      // assert
      assertFalse(_result);
    });
  });
});

// ─────────────────────────────────────────────
// findFixtureDirs — ユニットテスト
// ─────────────────────────────────────────────

/** findFixtureDirs: isFixtureDir を省略してデフォルト動作を確認するテスト */
describe('Given: findFixtureDirs (デフォルト isFixtureDir)', () => {
  let _tempDir: string;

  /** 共通前処理: 一時ディレクトリを作成 */
  beforeEach(async () => {
    _tempDir = await Deno.makeTempDir({ prefix: 'find-fixture-dirs-' });
  });

  /** 共通後処理: 一時ディレクトリを削除 */
  afterEach(async () => {
    await Deno.remove(_tempDir, { recursive: true });
  });

  /** isFixtureDir を省略（デフォルト使用）して呼び出した場合 */
  describe('When: isFixtureDir 引数を省略して呼び出す', () => {
    it('Then: [正常] - input.md を持つディレクトリのみ収集される', async () => {
      // arrange
      await Deno.mkdir(`${_tempDir}/edge-01-minimal`);
      await Deno.writeTextFile(`${_tempDir}/edge-01-minimal/input.md`, '');
      await Deno.mkdir(`${_tempDir}/normal-01-basic-keep`);
      await Deno.writeTextFile(`${_tempDir}/normal-01-basic-keep/input.md`, '');
      await Deno.mkdir(`${_tempDir}/normal-02-basic-discard`);
      await Deno.writeTextFile(`${_tempDir}/normal-02-basic-discard/input.md`, '');
      const _expected = ['edge-01-minimal', 'normal-01-basic-keep', 'normal-02-basic-discard'];

      // act
      const _result = await findFixtureDirs(_tempDir);

      // assert
      assertEquals(_result, _expected);
    });
  });
});

/** findFixtureDirs: カスタム isFixtureDir を DI して動作を検証するテスト */
// defaultIsFixtureDir — ユニットテスト
// ─────────────────────────────────────────────

describe('Given: defaultIsFixtureDir', () => {
  let _tempDir: string;

  beforeEach(async () => {
    _tempDir = await Deno.makeTempDir({ prefix: 'find-fixture-dirs-' });
  });

  afterEach(async () => {
    await Deno.remove(_tempDir, { recursive: true });
  });

  describe('When: input.md があるディレクトリを渡す', () => {
    it('Then: [正常] - true を返す', async () => {
      // arrange
      await Deno.writeTextFile(`${_tempDir}/input.md`, '');

      // act
      const _result = await defaultIsFixtureDir(_tempDir);

      // assert
      assert(_result);
    });
  });

  describe('When: input.md がないディレクトリを渡す', () => {
    it('Then: [正常] - false を返す', async () => {
      // act
      const _result = await defaultIsFixtureDir(_tempDir);

      // assert
      assertFalse(_result);
    });
  });

  describe('When: 存在しないディレクトリを渡す', () => {
    it('Then: [エッジケース] - 例外をスローせず false を返す', async () => {
      // arrange
      const _dir = `${_tempDir}/__nonexistent__`;

      // act
      const _result = await defaultIsFixtureDir(_dir);

      // assert
      assertFalse(_result);
    });
  });
});

// ─────────────────────────────────────────────
// findFixtureDirs — ユニットテスト
// ─────────────────────────────────────────────

describe('Given: findFixtureDirs (デフォルト isFixtureDir)', () => {
  let _tempDir: string;

  beforeEach(async () => {
    _tempDir = await Deno.makeTempDir({ prefix: 'find-fixture-dirs-' });
  });

  afterEach(async () => {
    await Deno.remove(_tempDir, { recursive: true });
  });

  describe('When: isFixtureDir 引数を省略して呼び出す', () => {
    it('Then: [正常] - input.md を持つディレクトリのみ収集される', async () => {
      // arrange
      await Deno.mkdir(`${_tempDir}/edge-01-minimal`);
      await Deno.writeTextFile(`${_tempDir}/edge-01-minimal/input.md`, '');
      await Deno.mkdir(`${_tempDir}/normal-01-basic-keep`);
      await Deno.writeTextFile(`${_tempDir}/normal-01-basic-keep/input.md`, '');
      await Deno.mkdir(`${_tempDir}/normal-02-basic-discard`);
      await Deno.writeTextFile(`${_tempDir}/normal-02-basic-discard/input.md`, '');
      const _expected = ['edge-01-minimal', 'normal-01-basic-keep', 'normal-02-basic-discard'];

      // act
      const _result = await findFixtureDirs(_tempDir);

      // assert
      assertEquals(_result, _expected);
    });
  });
});

describe('Given: findFixtureDirs', () => {
  let _tempDir: string;

  /** 共通前処理: 一時ディレクトリを作成 */
  beforeEach(async () => {
    _tempDir = await Deno.makeTempDir({ prefix: 'find-fixture-dirs-' });
  });

  /** 共通後処理: 一時ディレクトリを削除 */
  afterEach(async () => {
    await Deno.remove(_tempDir, { recursive: true });
  });

  /** isFixtureDir が特定ディレクトリに対して true を返す場合 */
  describe('When: isFixtureDir が特定ディレクトリで true を返す', () => {
    it('Then: [正常] - そのディレクトリの相対パスが結果に含まれる', async () => {
      // arrange
      const _target = 're-normal-01-basic-entry';
      await Deno.mkdir(`${_tempDir}/${_target}`);
      const _isFixtureDir: IsFixtureDirProvider = (dir) => Promise.resolve(normalizePath(dir).endsWith(_target));

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert
      assert(_result.includes(_target));
    });
  });

  /** isFixtureDir が多階層パス（サブディレクトリ）のディレクトリで true を返す場合 */
  describe('When: isFixtureDir が多階層パスのディレクトリで true を返す', () => {
    it('Then: [正常] - 多階層の相対パスが正しく収集される', async () => {
      // arrange
      const _target = 'edge/whitespace/crlf-input';
      await Deno.mkdir(`${_tempDir}/${_target}`, { recursive: true });

      const _isFixtureDir: IsFixtureDirProvider = (dir) => Promise.resolve(normalizePath(dir).endsWith('crlf-input'));
      await Deno.mkdir(`${_tempDir}/${_target}`, { recursive: true });

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert
      assert(_result.includes(_target));
    });
  });

  /** isFixtureDir が false を返すディレクトリが混在する場合 */
  describe('When: isFixtureDir が false を返すディレクトリがある', () => {
    it('Then: [正常] - false を返すディレクトリは除外される', async () => {
      // arrange
      const _excluded = 're-normal-02-array-fields';
      await Deno.mkdir(`${_tempDir}/re-normal-01-basic-entry`);
      await Deno.mkdir(`${_tempDir}/${_excluded}`);
      const _isFixtureDir: IsFixtureDirProvider = (dir) => Promise.resolve(!normalizePath(dir).endsWith(_excluded));

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert
      assertFalse(_result.includes(_excluded));
    });
  });

  /** isFixtureDir が全ディレクトリで false を返す場合 */
  describe('When: isFixtureDir が全ディレクトリで false を返す', () => {
    it('Then: [正常] - 空配列が返る', async () => {
      // arrange
      await Deno.mkdir(`${_tempDir}/some-subdir`);
      const _isFixtureDir: IsFixtureDirProvider = () => Promise.resolve(false);

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert
      assertEquals(_result, []);
    });
  });

  /** isFixtureDir が複数ディレクトリで true を返す場合（ソート確認） */
  describe('When: isFixtureDir が複数のディレクトリで true を返す', () => {
    it('Then: [正常] - 結果が辞書順ソートされている', async () => {
      // arrange
      await Deno.mkdir(`${_tempDir}/re-normal-01-basic-entry`);
      await Deno.mkdir(`${_tempDir}/re-normal-02-array-fields`);
      await Deno.mkdir(`${_tempDir}/re-normal-03-multiline-content`);
      const _isFixtureDir: IsFixtureDirProvider = (dir) => {
        const _normalized = normalizePath(dir);
        return Promise.resolve(
          _normalized.endsWith('re-normal-01-basic-entry')
            || _normalized.endsWith('re-normal-03-multiline-content')
            || _normalized.endsWith('re-normal-02-array-fields'),
        );
      };

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert
      const _sorted = [..._result].sort();
      assertEquals(_result, _sorted);
    });
  });

  /**
   * isFixtureDir が true を返したディレクトリの内部は走査しない仕様（再帰打ち切り）。
   * fixture のネストは想定しない。
   */
  describe('When: isFixtureDir が true を返したディレクトリの内部にサブディレクトリがある', () => {
    it('Then: [仕様] - 内部のサブディレクトリは収集されない', async () => {
      // arrange
      const _parent = 'edge-nested-parent';
      const _child = `${_parent}/child`;
      await Deno.mkdir(`${_tempDir}/${_child}`, { recursive: true });
      const _isFixtureDir: IsFixtureDirProvider = (dir) =>
        Promise.resolve(normalizePath(dir).endsWith(_parent) || normalizePath(dir).endsWith('child'));

      // act
      const _result = await findFixtureDirs(_tempDir, _isFixtureDir);

      // assert: _parent は収集されるが child は収集されない
      assert(_result.includes(_parent));
      assertFalse(_result.includes(_child));
    });
  });

  /** rootDir が存在しないパスを指す場合（エッジケース） */
  describe('When: rootDir が存在しないディレクトリを指す', () => {
    it('Then: [エッジケース] - エラーを投げず空配列を返す', async () => {
      // arrange
      const _nonExistent = `${_tempDir}/__nonexistent__`;
      const _isFixtureDir: IsFixtureDirProvider = () => Promise.resolve(true);

      // act
      const _result = await findFixtureDirs(_nonExistent, _isFixtureDir);

      // assert
      assertEquals(_result, []);
    });
  });
});
