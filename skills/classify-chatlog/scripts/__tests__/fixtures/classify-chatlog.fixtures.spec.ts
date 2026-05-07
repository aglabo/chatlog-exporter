// src: scripts/__tests__/fixtures/classify-chatlog.fixtures.spec.ts
// @(#): classify-chatlog fixturesテスト（実 claude CLI 使用）
//       fixtures-data/ 下の各ディレクトリを再帰スキャンし
//       input.md を実際の claude CLI で分類し、output.yaml の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// test target
import { processChunk } from '../../classify-chatlog.ts';

// utils
import { findDirectories } from '../../../../_scripts/libs/file-io/find-entries.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../_scripts/constants/defaults.constants.ts';
// classes
import { ClassifyChatlogEntry } from '../../classes/ClassifyChatlogEntry.class.ts';
// types
import type { ClassifyStats, ProjectDicEntry } from '../../types/classify.types.ts';

// helpers
import { findFixtureDirs } from '../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { loadProjectDic } from '../../libs/load-project-dic.ts';

// ─── フィクスチャパス ──────────────────────────────────────────────────────────
/** フィクスチャディレクトリ */
const FIXTURES_DIR = new URL('./fixtures-data', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1'); // Windows: /C:/... → C:/...

// ─── 型定義 ───────────────────────────────────────────────────────────────────

/**FixtureOutput */
interface FixtureOutput {
  expected_project?: string;
  known_projects: string[];
  confidence_min: number;
}

// ─── claude CLI テストの opt-in 制御 ──────────────────────────────────────────
/** claude CLI を実行フラグ */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/** output.yaml から期待値を読み込む */
async function _loadOutput(dir: string): Promise<FixtureOutput> {
  const content = await readTextFile(`${dir}/output.yaml`);
  return parseYaml(content) as FixtureOutput;
}

// ─── ファイル駆動 fixtures tests ──────────────────────────────────────────────

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR);
const _projects: ProjectDicEntry = await loadProjectDic(`${FIXTURES_DIR}/projects.dic`);

for (const _relPath of _fixtureDirs) {
  const _fixtureDir = `${FIXTURES_DIR}/${_relPath}`;
  const _inputPath = `${_fixtureDir}/input.md`;
  const _expectedOutput = await _loadOutput(_fixtureDir);

  describe(`processChunk — classify-chatlog/${_relPath}`, () => {
    describe(`Given: ${_relPath}/input.md と projects.dic`, () => {
      let _tempDir: string;
      let _stats: ClassifyStats;
      let _inputContent: string;
      let _loggerStub: LoggerStub;

      beforeEach(async () => {
        _tempDir = await Deno.makeTempDir();
        _stats = { moved: 0, skipped: 0, error: 0 };
        _inputContent = await readTextFile(_inputPath);

        // input.md を tempdir にコピー
        await Deno.writeTextFile(`${_tempDir}/input.md`, _inputContent);
        _loggerStub = makeLoggerStub();
      });

      afterEach(async () => {
        _loggerStub.restore();
        await Deno.remove(_tempDir, { recursive: true });
      });

      describe('When: processChunk(chunkMetas, projects, false, stats) を呼び出す', { ignore: !_shouldRunAI }, () => {
        it(
          `SF-CL-${_relPath}-project: 分類結果が known_projects に含まれる`,
          async () => {
            const _fileMeta = new ClassifyChatlogEntry(_inputContent, `${_tempDir}/input.md`);

            await processChunk([_fileMeta], _projects, false, _stats, DEFAULT_AI_MODEL);

            // classify / moved ログがキャプチャされていることを確認
            assertEquals(
              _loggerStub.infoLogs.some((l) => l.includes('classify:')),
              true,
              'classify ログが infoLogs に記録されていない',
            );
            assertEquals(
              _loggerStub.infoLogs.some((l) => l.includes('moved:')),
              true,
              'moved ログが infoLogs に記録されていない',
            );

            // 移動先ディレクトリを確認してプロジェクト名を取得
            const _dirs = await findDirectories(_tempDir);
            const _movedProject = _dirs.length > 0 ? _dirs[0].slice(_tempDir.length + 1) : 'misc';

            if (_expectedOutput.expected_project !== undefined) {
              assertEquals(
                _movedProject,
                _expectedOutput.expected_project,
                `分類先 "${_movedProject}" が期待値 "${_expectedOutput.expected_project}" と一致しない`,
              );
            } else {
              assertEquals(
                _expectedOutput.known_projects.includes(_movedProject),
                true,
                `分類先 "${_movedProject}" が known_projects に含まれていない`,
              );
            }
          },
        );
      });
    });
  });
}
