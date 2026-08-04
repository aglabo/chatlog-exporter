// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-write-flow.unit.spec.ts
// @(#): phaseWrite の統合的なユニットテスト
//       対象: phaseWrite, _writePlannedEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { phaseWrite } from '../../phase-write.ts';

// ─── Helpers
import { logger } from '../../../../../_cle-libs/libs/io/logger.ts';
import { toCacheKey } from '../../../libs/cache-utils.ts';
import { initStats } from '../../../libs/stats-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { NormalizeCache } from '../../../types/cache.const.type.ts';
import type { NormalizeConfig, Stats } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// constants

/** `writeSegmentToFile` に注入する固定ハッシュ。出力ファイル名を決定的にする。 */
const _FIXED_HASH = () => 'abc1234';

// functions

/** テスト用の `ChatlogEntry` を `filePath` と本文 `content` から生成する（frontmatterなし）。 */
const _makeEntry = (filePath: string, content: string): ChatlogEntry => new ChatlogEntry(content, { filePath });

// ─── Tests

/**
 * `phaseWrite` のユニットテストスイート。
 *
 * 呼び出し元がプランニング済み（`hasSegments` が true）の entry のみを渡す前提のもと、
 * `_writePlannedEntry` に委譲される書き込み・キャッシュ更新の振る舞いを、実際のファイル
 * 書き出しとキャッシュ状態の変化を通じて検証する。
 *
 * テスト ID 範囲: T-PWF-01-01 〜 T-PWF-04-03
 *
 * @see phaseWrite
 */
describe('phaseWrite', () => {
  let tempDir: string;
  let outputBase: string;
  let cache: ChatlogCache<NormalizeCache>;
  let stats: Stats;

  beforeEach(async () => {
    tempDir = Deno.makeTempDirSync();
    outputBase = `${tempDir}/out`;
    await Deno.mkdir(outputBase, { recursive: true });
    cache = new ChatlogCache<NormalizeCache>('test-write', tempDir, { yaml: '' });
    await cache.ready;
    stats = initStats();
  });

  afterEach(() => {
    Deno.removeSync(tempDir, { recursive: true });
  });

  describe('When: 正常系', () => {
    it('[Normal] T-PWF-01-01: segments 済みの entry を渡すと出力ファイルが書かれ status が done になる', async () => {
      // arrange
      const entry = _makeEntry('a.md', 'line1\nline2\nline3');
      await cache.write(toCacheKey('a.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 2 }],
      });
      const config: Pick<NormalizeConfig, 'dryRun'> = { dryRun: false };

      // act
      await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

      // assert — misc フォールバックの出力先に決定的なファイル名で書かれ、cache が done になる
      const written = await Deno.stat(`${outputBase}/misc/a-01-abc1234.md`);
      assert(written.isFile);
      assertEquals(cache.read(toCacheKey('a.md')).status, 'done');
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-PWF-03-01: dryRun=true のとき segments 済み entry でも cache の status は done に変化しない', async () => {
      // arrange
      const entry = _makeEntry('dry.md', 'line1\nline2');
      await cache.write(toCacheKey('dry.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
      });
      const config: Pick<NormalizeConfig, 'dryRun'> = { dryRun: true };

      // act
      await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

      // assert — dryRun のため cache 更新はスキップされ 'set' のまま
      assertEquals(cache.read(toCacheKey('dry.md')).status, 'set');
    });
  });

  /** 書き込み失敗時の分類: ファイル I/O エラーは fail 加算、それ以外はスロー。 */
  describe('When: 書き込み失敗', () => {
    it('[Error] T-PWF-04-01: Deno.writeTextFile が PermissionDenied で失敗するとき stats.fail が増加し cache は done にならず throw されない', async () => {
      // arrange
      const entry = _makeEntry('perm.md', 'line1\nline2');
      await cache.write(toCacheKey('perm.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
      });
      const config: Pick<NormalizeConfig, 'dryRun'> = { dryRun: false };
      const writeStub = stub(
        Deno,
        'writeTextFile',
        () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
      );

      try {
        // act
        await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

        // assert
        assertEquals(stats.fail, 1);
        assertEquals(stats.success, 0);
        assertEquals(cache.read(toCacheKey('perm.md')).status, 'set');
      } finally {
        writeStub.restore();
      }
    });

    it('[Error] T-PWF-04-02: 書き込み失敗時 logger.warn がファイル名付きで呼ばれる', async () => {
      // arrange
      const entry = _makeEntry('perm2.md', 'line1\nline2');
      await cache.write(toCacheKey('perm2.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
      });
      const config: Pick<NormalizeConfig, 'dryRun'> = { dryRun: false };
      const writeStub = stub(
        Deno,
        'writeTextFile',
        () => Promise.reject(new Deno.errors.PermissionDenied('denied')),
      );
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

        // assert
        assert(warnStub.calls.length > 0);
        assert(String(warnStub.calls[0].args[0]).includes('perm2'));
      } finally {
        writeStub.restore();
        warnStub?.restore();
      }
    });

    it('[Error] T-PWF-04-03: ファイル I/O 起因ではないエラー（ForbiddenOutput）はそのままスローされる', async () => {
      // arrange — filePath を resolveOutputDir の解決先（misc フォールバック）そのものにし、
      // writeSegmentToFile の ForbiddenOutput チェック（outputPath.includes(filePath)）を発火させる
      const filePath = `${outputBase}/misc`;
      const entry = _makeEntry(filePath, 'line1\nline2');
      await cache.write(toCacheKey(filePath), {
        status: 'set',
        segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
      });
      const config: Pick<NormalizeConfig, 'dryRun'> = { dryRun: false };

      // act & assert
      const err = await assertRejects(
        () => phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'OverwriteInput');
      assertEquals(stats.fail, 0);
      assertEquals(stats.success, 0);
    });
  });
});
