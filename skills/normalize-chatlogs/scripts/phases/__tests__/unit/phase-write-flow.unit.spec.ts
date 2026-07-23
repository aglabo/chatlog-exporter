// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-write-flow.unit.spec.ts
// @(#): phaseWrite の統合的なユニットテスト
//       対象: phaseWrite, _writePlannedEntry, _writeFailedEntry
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
import { toCacheKey } from '../../../libs/cache-utils.ts';
import { initStats } from '../../../libs/stats-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
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
 * `entries` を `hasSegments` でプランニング済み/失敗に分岐し、それぞれ
 * `_writePlannedEntry`/`_writeFailedEntry` に委譲する振る舞いを、実際のファイル書き出しと
 * キャッシュ状態の変化を通じて検証する。
 *
 * テスト ID 範囲: T-PWF-01-01 〜 T-PWF-03-02
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
      const config: Pick<NormalizeConfig, 'dryRun' | 'failFast'> = { dryRun: false, failFast: false };

      // act
      await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

      // assert — misc フォールバックの出力先に決定的なファイル名で書かれ、cache が done になる
      const written = await Deno.stat(`${outputBase}/misc/a-01-abc1234.md`);
      assert(written.isFile);
      assertEquals(cache.read(toCacheKey('a.md')).status, 'done');
    });

    it(
      '[Normal] T-PWF-01-02: 計画済みentryと未キャッシュentryが混在するとき両方が正しく処理される',
      async () => {
        // arrange
        const plannedEntry = _makeEntry('planned.md', 'line1\nline2');
        const failedEntry = _makeEntry('failed.md', 'line1\nline2');
        await cache.write(toCacheKey('planned.md'), {
          status: 'set',
          segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }],
        });
        const config: Pick<NormalizeConfig, 'dryRun' | 'failFast'> = { dryRun: false, failFast: false };

        // act
        await phaseWrite([plannedEntry, failedEntry], outputBase, config, stats, cache, 2, _FIXED_HASH);

        // assert — 成功側は出力ファイルが書かれ done、失敗側は stats.fail が加算される
        const written = await Deno.stat(`${outputBase}/misc/planned-01-abc1234.md`);
        assert(written.isFile);
        assertEquals(cache.read(toCacheKey('planned.md')).status, 'done');
        assertEquals(stats.fail, 1);
      },
    );
  });

  describe('When: 異常系', () => {
    it('[Error] T-PWF-02-01: failFast=true かつ未キャッシュの entry があるとき ChatlogError(FailFast) を投げる', async () => {
      // arrange
      const entry = _makeEntry('nocache.md', 'line1\nline2');
      const config: Pick<NormalizeConfig, 'dryRun' | 'failFast'> = { dryRun: false, failFast: true };

      // act & assert
      const err = await assertRejects(
        () => phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'FailFast');
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
      const config: Pick<NormalizeConfig, 'dryRun' | 'failFast'> = { dryRun: true, failFast: false };

      // act
      await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

      // assert — dryRun のため cache 更新はスキップされ 'set' のまま
      assertEquals(cache.read(toCacheKey('dry.md')).status, 'set');
    });

    it(
      '[Edge] T-PWF-03-02: failFast=false で未キャッシュの entry があるとき throw されず stats.fail が加算され logger.warn が呼ばれる',
      async () => {
        // arrange
        const entry = _makeEntry('nocache2.md', 'line1\nline2');
        const config: Pick<NormalizeConfig, 'dryRun' | 'failFast'> = { dryRun: false, failFast: false };
        let warnStub: Stub | undefined;

        try {
          warnStub = stub(logger, 'warn');

          // act
          await phaseWrite([entry], outputBase, config, stats, cache, 2, _FIXED_HASH);

          // assert
          assertEquals(stats.fail, 1);
          assert(warnStub.calls.length > 0);
        } finally {
          warnStub?.restore();
        }
      },
    );
  });
});
