// src: scripts/testing/mutation/__tests__/unit/run-safety-artifacts.unit.spec.ts
// @(#): run-safety の残骸削除・ソースの内容ハッシュ・drift の突合のユニットテスト
//       対象: sweepArtifacts, removeArtifacts, hashSources, detectDrift
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { detectDrift, hashSources, removeArtifacts, sweepArtifacts } from '../../run-safety.ts';

// ─── Helpers
import { ensureDir, existsSync } from '@std/fs';
import { dirname, join } from '@std/path';
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { sessionHash } from '../../../../../skills/_cle-libs/libs/io/hash.ts';

// ─── Internal Helpers

// constants
/** 一時ディレクトリの接頭辞。後始末の対象をこのテストファイルの作成物に限定する。 */
const _TEMP_PREFIX = 'run-safety-artifacts-';

/** 変異体ファイル (残骸) の内容として書く空モジュール。内容自体は検証対象ではない。 */
const _ARTIFACT_CONTENT = 'export {};\n';

/** ハッシュ・drift の検証で使うソースファイルの既定内容。 */
const _SOURCE_CONTENT = 'export const a = 1;\n';

// functions
/**
 * 親ディレクトリを作ってからファイルを書き出す。
 *
 * @param path - 書き出すファイルのパス (親ディレクトリが無ければ作る)
 * @param content - 書き出す内容
 * @returns 書き出したファイルのパス (`path` と同じ)
 */
async function _writeFixture(path: string, content: string): Promise<string> {
  await ensureDir(dirname(path));
  await Deno.writeTextFile(path, content);
  return path;
}

/**
 * 削除できないエントリとして、`keep.txt` を含む空でないディレクトリを作る。
 *
 * 再帰指定の無い削除は空でないディレクトリで失敗するため、削除失敗の経路を実ファイルで再現できる。
 *
 * @param path - 作成するディレクトリのパス (残骸の命名規則に一致する名前を渡す)
 * @returns 作成したディレクトリのパス (`path` と同じ)
 */
async function _makeNonEmptyDir(path: string): Promise<string> {
  await _writeFixture(join(path, 'keep.txt'), '');
  return path;
}

/**
 * パスが削除済みであることを検証する。
 *
 * @param path - 削除されているはずのパス
 */
function _assertRemoved(path: string): void {
  assert(!existsSync(path), `not removed: ${path}`);
}

/**
 * パスが削除されずに残っていることを検証する。`content` を渡したときは内容の一致も検証する。
 *
 * @param path - 残っているはずのパス
 * @param content - 期待するファイル内容 (省略時は存在だけを検証する)
 */
async function _assertKept(path: string, content?: string): Promise<void> {
  assert(existsSync(path), `removed unexpectedly: ${path}`);
  if (content !== undefined) {
    assertEquals(await Deno.readTextFile(path), content);
  }
}

// ─── Tests

/**
 * `sweepArtifacts` のユニットテストスイート。
 *
 * 一時ディレクトリ配下に置いた前回実行の残骸に対して、命名規則による掃除を検証する。
 *
 * @see sweepArtifacts
 */
describe('sweepArtifacts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: _TEMP_PREFIX });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 命名規則に一致する残骸の削除 (execution R-205 / REQ-F-007 / AC-008)。
   */
  describe('命名規則に一致する残骸の削除', () => {
    /** 残骸 1 件を置いたディレクトリを掃除する正常ケース。 */
    describe('When: 正常系', () => {
      const _cases = [
        { id: 'T-MUT-RS-10-01', name: 'foo.mutation-001.ts', content: _ARTIFACT_CONTENT },
        { id: 'T-MUT-RS-10-02', name: 'deno.mutation-001.json', content: '{}' },
        { id: 'T-MUT-RS-10-03', name: 'view.mutation-001.tsx', content: _ARTIFACT_CONTENT },
        { id: 'T-MUT-RS-10-04', name: 'foo.mutation-1000.ts', content: _ARTIFACT_CONTENT },
      ];

      for (const { id, name, content } of _cases) {
        it(`[Normal] ${id}: ${name} を置いて sweep → ${name} が存在しない`, async () => {
          const _artifact = await _writeFixture(join(tempDir, name), content);

          await sweepArtifacts([tempDir]);

          _assertRemoved(_artifact);
        });
      }

      it('[Normal] T-MUT-RS-10-05: sub/deep/foo.mutation-001.ts を置いて親を sweep → 下位ディレクトリの残骸も存在しない', async () => {
        const _artifact = await _writeFixture(join(tempDir, 'sub', 'deep', 'foo.mutation-001.ts'), _ARTIFACT_CONTENT);

        await sweepArtifacts([tempDir]);

        _assertRemoved(_artifact);
      });

      it('[Normal] T-MUT-RS-10-06: a/foo.mutation-001.ts と b/bar.mutation-002.ts を置いて [a, b] を sweep → 両方の残骸が存在しない', async () => {
        const _dirA = join(tempDir, 'a');
        const _dirB = join(tempDir, 'b');
        const _artifacts = [join(_dirA, 'foo.mutation-001.ts'), join(_dirB, 'bar.mutation-002.ts')];
        await Promise.all(_artifacts.map((path) => _writeFixture(path, _ARTIFACT_CONTENT)));

        await sweepArtifacts([_dirA, _dirB]);

        _artifacts.forEach(_assertRemoved);
      });
    });
  });

  /**
   * 起動時の掃除の削除失敗 (execution R-205 / DD-14)。
   */
  describe('起動時の掃除の削除失敗', () => {
    /** 命名規則に一致するが削除できないエントリがある異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-15-01: 空でないディレクトリ foo.mutation-001.ts を置いて sweep → 例外なく [そのパス] を返す', async () => {
        const _blocked = await _makeNonEmptyDir(join(tempDir, 'foo.mutation-001.ts'));

        const _failed = await sweepArtifacts([tempDir]);

        assertEquals(_failed, [_blocked]);
      });
    });
  });

  /**
   * 命名規則に一致しないファイルの保持 (execution R-205 / REQ-F-007 / AC-008 / Edge execution-14)。
   */
  describe('命名規則に一致しないファイルの保持', () => {
    /** 残骸に似た名前・元のソースなど、命名規則に一致しないファイルだけを置いたエッジケース。 */
    describe('When: エッジケース', () => {
      const _cases = [
        { id: 'T-MUT-RS-16-01', name: 'foo.mutation.ts', content: 'export const keep = 1;\n' },
        { id: 'T-MUT-RS-16-02', name: 'foo.ts', content: _SOURCE_CONTENT },
        { id: 'T-MUT-RS-16-03', name: 'deno.jsonc', content: '{}\n' },
      ];

      for (const { id, name, content } of _cases) {
        it(`[Edge] ${id}: ${name} を置いて sweep → ${name} が内容ごと残る`, async () => {
          const _kept = await _writeFixture(join(tempDir, name), content);

          await sweepArtifacts([tempDir]);

          await _assertKept(_kept, content);
        });
      }
    });
  });

  /**
   * 掃除対象が無い (execution R-205)。
   */
  describe('掃除対象が無い', () => {
    /** 命名規則に一致するエントリが 1 件も無いディレクトリを掃除するエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-19-01: 空ディレクトリを sweep → 例外なく [] を返す', async () => {
        const _failed = await sweepArtifacts([tempDir]);

        assertEquals(_failed, []);
      });
    });
  });
});

/**
 * `removeArtifacts` のユニットテストスイート。
 *
 * 一時ディレクトリ配下の変異体ファイル・一時設定に対して、後始末の削除を検証する。
 *
 * @see removeArtifacts
 */
describe('removeArtifacts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: _TEMP_PREFIX });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * 後始末の削除 (execution R-225 / REQ-F-006)。
   */
  describe('後始末の削除', () => {
    /** 削除対象がすべて存在する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-13-01: 存在する 2 パス → [] を返し、2 ファイルとも削除する', async () => {
        const _paths = await Promise.all(
          ['foo.mutation-001.ts', 'deno.mutation-001.json'].map((name) => _writeFixture(join(tempDir, name), '')),
        );

        const _failed = await removeArtifacts(_paths);

        assertEquals(_failed, []);
        _paths.forEach(_assertRemoved);
      });

      it('[Normal] T-MUT-RS-13-02: 書き出されなかった 1 パス → 例外なく [] を返す', async () => {
        const _paths = [join(tempDir, 'deno.mutation-001.json')];

        const _failed = await removeArtifacts(_paths);

        assertEquals(_failed, []);
      });
    });
  });

  /**
   * 後始末の削除失敗 (execution R-226 / DD-05 / Edge execution-13)。
   */
  describe('後始末の削除失敗', () => {
    /** 削除対象が削除できない異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RS-14-01: 同名の空でないディレクトリ 1 パス → 例外なく [そのパス] を返し、ディレクトリは残る', async () => {
        const _blocked = await _makeNonEmptyDir(join(tempDir, 'deno.mutation-001.json'));

        const _failed = await removeArtifacts([_blocked]);

        assertEquals(_failed, [_blocked]);
        await _assertKept(_blocked);
      });

      it('[Error] T-MUT-RS-14-02: 先頭が削除できない 2 パス → [先頭のパス] だけを返し、2 件目は削除する', async () => {
        const _blocked = await _makeNonEmptyDir(join(tempDir, 'foo.mutation-001.ts'));
        const _config = await _writeFixture(join(tempDir, 'deno.mutation-001.json'), '');

        const _failed = await removeArtifacts([_blocked, _config]);

        assertEquals(_failed, [_blocked]);
        _assertRemoved(_config);
      });
    });
  });
});

/**
 * `hashSources` のユニットテストスイート。
 *
 * 一時ディレクトリ配下に置いたソースファイルに対して、内容ハッシュの取得を検証する。
 *
 * @see hashSources
 */
describe('hashSources', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: _TEMP_PREFIX });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * ソースの内容ハッシュ (execution R-206)。
   */
  describe('ソースの内容ハッシュ', () => {
    /** 内容を変えていないソースファイルのハッシュを取る正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-11-01: 内容を変えずに 2 回取得 → src.ts のハッシュが一致する', async () => {
        const _src = await _writeFixture(join(tempDir, 'src.ts'), _SOURCE_CONTENT);

        const _first = await hashSources([_src]);
        const _second = await hashSources([_src]);

        assert(typeof _first[_src] === 'string' && _first[_src] !== '', `no hash for: ${_src}`);
        assertEquals(_second[_src], _first[_src]);
      });

      it('[Normal] T-MUT-RS-11-02: 内容 "export const a = 1;\\n" を取得 → sessionHash(内容, 64) と一致し長さ 64', async () => {
        const _src = await _writeFixture(join(tempDir, 'src.ts'), _SOURCE_CONTENT);

        const _hashes = await hashSources([_src]);

        assertEquals(_hashes[_src], await sessionHash(_SOURCE_CONTENT, 64));
        assertEquals(_hashes[_src].length, 64);
      });
    });
  });

  /**
   * 削除されたソース (execution R-206 / R-212 / DD-14)。
   */
  describe('削除されたソース', () => {
    /** ハッシュ記録後に消えたソースを再取得するエッジケース。drift として返さずエラーで中止する。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-17-01: 記録後に target.ts を削除して再取得 → ChatlogError を投げ message に target のパスを含む', async () => {
        const _target = await _writeFixture(join(tempDir, 'target.ts'), _SOURCE_CONTENT);
        await hashSources([_target]);
        await Deno.remove(_target);

        const _err = await assertRejects(() => hashSources([_target]), ChatlogError);

        assertStringIncludes(_err.message, _target);
      });
    });
  });

  /**
   * 改行コードだけの変化 (execution R-206 / R-212 / REQ-NF-004)。
   */
  describe('改行コードだけの変化', () => {
    /** 改行コードを LF から CRLF に書き換えたソースを再取得するエッジケース。正規化せず drift として扱う。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RS-18-01: 内容 "a\\nb\\n" を記録後 "a\\r\\nb\\r\\n" に書き換えて突合 → src.ts を drift として返す', async () => {
        const _src = await _writeFixture(join(tempDir, 'src.ts'), 'a\nb\n');
        const _before = await hashSources([_src]);
        await Deno.writeTextFile(_src, 'a\r\nb\r\n');

        const _after = await hashSources([_src]);

        assertEquals(detectDrift(_before, _after), [_src]);
      });
    });
  });
});

/**
 * `detectDrift` のユニットテストスイート。
 *
 * 一時ディレクトリ配下のソースファイルから `hashSources` で取った実行前後の記録を突合し、drift の検出を検証する。
 *
 * @see detectDrift
 */
describe('detectDrift', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: _TEMP_PREFIX });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * drift の突合 (execution R-212 / REQ-NF-001)。
   */
  describe('drift の突合', () => {
    /** 実行前後で同じファイル集合から記録を取る正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RS-12-01: 内容不変の target.ts・other.ts の前後記録を突合 → [] を返す', async () => {
        const _files = await Promise.all(
          ['target.ts', 'other.ts'].map((name) => _writeFixture(join(tempDir, name), _SOURCE_CONTENT)),
        );
        const _before = await hashSources(_files);
        const _after = await hashSources(_files);

        assertEquals(detectDrift(_before, _after), []);
      });

      it('[Normal] T-MUT-RS-12-02: target.ts だけ書き換えて記録を取り直し突合 → [target.ts] を返す', async () => {
        const _files = await Promise.all(
          ['target.ts', 'other.ts'].map((name) => _writeFixture(join(tempDir, name), _SOURCE_CONTENT)),
        );
        const [_target] = _files;
        const _before = await hashSources(_files);
        await Deno.writeTextFile(_target, 'export const a = 2;\n');
        const _after = await hashSources(_files);

        assertEquals(detectDrift(_before, _after), [_target]);
      });

      it('[Normal] T-MUT-RS-12-03: after を c.ts・b.ts・a.ts の順に作成して突合 → a.ts・b.ts・c.ts 順の after と同じ昇順 [a, b, c] を返す', () => {
        const [_a, _b, _c] = ['a.ts', 'b.ts', 'c.ts'].map((name) => join(tempDir, name));
        // キーの挿入順そのものが検証対象のため、hashSources ではなくリテラルで記録を組み、挿入順を固定する
        const _before = { [_a]: 'h-a1', [_b]: 'h-b1', [_c]: 'h-c1' };
        const _afterSorted = { [_a]: 'h-a2', [_b]: 'h-b2', [_c]: 'h-c2' };
        const _afterReversed = { [_c]: 'h-c2', [_b]: 'h-b2', [_a]: 'h-a2' };

        const _result = detectDrift(_before, _afterReversed);

        assertEquals(_result, detectDrift(_before, _afterSorted));
        assertEquals(_result, [_a, _b, _c]);
      });
    });
  });
});
