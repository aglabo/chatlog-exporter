// src: scripts/modules/__tests__/functional/build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
//       CLI 引数 + GlobalConfig + デフォルト値から ClassifyConfig を構築するロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// --- Test target ---
import { buildConfig } from '../../classify-config.ts';

// --- Helpers
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_cle-libs/constants/defaults.constants.ts';
import { DEFAULT_CLASSIFY_CONFIG } from '../../../constants/classify.constants.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// helpers
import { resetProjectRoot } from '../../../../../_cle-libs/libs/path-utils/dir-utils.ts';

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

/**
 * GlobalConfig シングルトンを YAML 文字列で初期化する。
 * `buildConfig` は内部で `GlobalConfig.getInstance()` を呼び出すため、
 * テストは事前にシングルトンをこの関数でシードしておく必要がある。
 */
async function _seedGlobalConfig(yaml: string): Promise<void> {
  resetProjectRoot('/home/user/project');
  GlobalConfig.resetInstance();
  await GlobalConfig.getInstance({
    readTextFileProvider: () => yaml,
    configFile: 'dummy.yaml',
  });
}

// ─── T-CL-BC-01: model 優先順位 parsed > globalConfig ─────────────────────────

describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── model 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: --model が指定されている', () => {
    describe('When: GlobalConfig にも model が設定されている', () => {
      describe('Then: T-CL-BC-01 - --model が優先される', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('model: haiku');
        });
        it('T-CL-BC-01-01: --model=opus → result.model === opus', () => {
          const result = buildConfig(['--model', 'opus']);
          assertEquals(result.model, 'opus');
        });
      });
    });
  });

  describe('Given: --model が未指定', () => {
    describe('When: GlobalConfig に model が設定されている', () => {
      describe('Then: T-CL-BC-02 - GlobalConfig の model が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('model: haiku');
        });
        it('T-CL-BC-02-01: globalConfig.model=haiku → result.model === haiku', () => {
          const result = buildConfig([]);
          assertEquals(result.model, 'haiku');
        });
      });
    });

    describe('When: GlobalConfig にも model が設定されていない', () => {
      describe('Then: T-CL-BC-03 - DEFAULT_AI_MODEL が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: claude');
        });
        it('T-CL-BC-03-01: model 未設定 → result.model === DEFAULT_AI_MODEL', () => {
          const result = buildConfig([]);
          assertEquals(result.model, DEFAULT_AI_MODEL);
        });
      });
    });

    describe('When: GlobalConfig に不正モデル名が設定されている', () => {
      describe('Then: T-CL-BC-04 - ChatlogError(InvalidArgs) がスローされる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('model: invalid-model');
        });
        it('T-CL-BC-04-01: globalConfig.model=invalid-model → ChatlogError(InvalidArgs)', () => {
          assertThrows(
            () => buildConfig([]),
            ChatlogError,
          );
        });
        it('T-CL-BC-04-02: err.subindex === "InvalidModel"', () => {
          const err = assertThrows(
            () => buildConfig([]),
            ChatlogError,
          );
          assertEquals(err.subindex, 'InvalidModel');
        });
      });
    });
  });

  // ─── dicsDir 優先順位 ────────────────────────────────────────────────────────

  describe('Given: GlobalConfig に dicsDir が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-05 - GlobalConfig の dicsDir が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('dicsDir: /custom/dics');
        });
        it('T-CL-BC-05-01: globalConfig.dicsDir=/custom/dics → result.dicsDir === /custom/dics', () => {
          const result = buildConfig([]);
          assertEquals(result.dicsDir, '/custom/dics');
        });
      });
    });
  });

  describe('Given: GlobalConfig に dicsDir が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-06 - DEFAULT_CLASSIFY_CONFIG.dicsDir が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: claude');
        });
        it('T-CL-BC-06-01: dicsDir 未設定 → result.dicsDir === DEFAULT_CLASSIFY_CONFIG.dicsDir', () => {
          const result = buildConfig([]);
          assertEquals(result.dicsDir, DEFAULT_CLASSIFY_CONFIG.dicsDir);
        });
      });
    });
  });

  // ─── CLI 引数の上書き ─────────────────────────────────────────────────────────

  describe('Given: --dry-run, --input-dir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-07 - CLI 引数がデフォルトを上書きする', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-07-01: --dry-run --input-dir=/custom/input → result.dryRun === true, result.inputDir === /custom/input', () => {
          const result = buildConfig(['--dry-run', '--input-dir=/custom/input']);
          assertEquals(result.dryRun, true);
          assertEquals(result.inputDir, '/custom/input');
        });
      });
    });
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: agent 位置引数が指定されている', () => {
    describe('When: GlobalConfig にも agent が設定されている', () => {
      describe('Then: T-CL-BC-09 - CLI 引数の agent が優先される', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: chatgpt');
        });
        it('T-CL-BC-09-01: agent=codex → result.agent === codex', () => {
          const result = buildConfig(['codex']);
          assertEquals(result.agent, 'codex');
        });
      });
    });
  });

  describe('Given: agent が未指定', () => {
    describe('When: GlobalConfig に agent が設定されている', () => {
      describe('Then: T-CL-BC-10 - GlobalConfig の agent が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: chatgpt');
        });
        it('T-CL-BC-10-01: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig([]);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    describe('When: GlobalConfig にも agent が設定されていない', () => {
      describe('Then: T-CL-BC-11 - DEFAULT_CLASSIFY_CONFIG.agent が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('model: sonnet');
        });
        it('T-CL-BC-11-01: agent 未設定 → result.agent === DEFAULT_CLASSIFY_CONFIG.agent', () => {
          const result = buildConfig([]);
          assertEquals(result.agent, DEFAULT_CLASSIFY_CONFIG.agent);
        });
      });
    });
  });

  // ─── dryRun 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: --dry-run が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-12 - result.dryRun === true', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-12-01: --dry-run → result.dryRun === true', () => {
          const result = buildConfig(['--dry-run']);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  describe('Given: --dry-run が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-13 - DEFAULT_CLASSIFY_CONFIG.dryRun が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-13-01: dryRun 未指定 → result.dryRun === DEFAULT_CLASSIFY_CONFIG.dryRun', () => {
          const result = buildConfig([]);
          assertEquals(result.dryRun, DEFAULT_CLASSIFY_CONFIG.dryRun);
        });
      });
    });
  });

  // ─── inputDir（フルパス直接指定） ───────────────────────────────────────────

  describe('Given: --input-dir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-14 - result.inputDir === 指定値', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-14-01: --input-dir=/custom/input → result.inputDir === /custom/input', () => {
          const result = buildConfig(['--input-dir=/custom/input']);
          assertEquals(result.inputDir, '/custom/input');
        });
      });
    });
  });

  describe('Given: --input-dir が指定されている', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      describe('Then: T-CL-BC-20 - inputDir と result.chatlogsDir は独立して両方保持される', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it('T-CL-BC-20-01: --input-dir=/custom/input → result.inputDir === /custom/input', () => {
          const result = buildConfig(['--input-dir=/custom/input']);
          assertEquals(result.inputDir, '/custom/input');
        });
        it('T-CL-BC-20-02: result.chatlogsDir === /global/chatlog（inputDir とは独立）', () => {
          const result = buildConfig(['--input-dir=/custom/input']);
          assertEquals(result.chatlogsDir, '/global/chatlog');
        });
      });
    });
  });

  // ─── chatlogsDir（GlobalConfig 由来の基準ディレクトリ） ──────────────────────

  describe('Given: --input-dir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      describe('Then: T-CL-BC-21 - GlobalConfig の chatlogsDir が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it('T-CL-BC-21-01: inputDir 未指定, globalConfig.chatlogsDir=/global/chatlog → result.chatlogsDir === /global/chatlog', () => {
          const result = buildConfig([]);
          assertEquals(result.chatlogsDir, '/global/chatlog');
        });
        it('T-CL-BC-21-02: result.inputDir === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.inputDir, undefined);
        });
      });
    });

    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      describe('Then: T-CL-BC-15 - DEFAULT_CLASSIFY_CONFIG.chatlogsDir が使われる', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ schema: {}, yaml: '' });
        });
        it('T-CL-BC-15-01: inputDir 未指定, chatlogsDir 未登録 → result.chatlogsDir === DEFAULT_CLASSIFY_CONFIG.chatlogsDir', () => {
          const result = buildConfig([]);
          assertEquals(result.chatlogsDir, DEFAULT_CLASSIFY_CONFIG.chatlogsDir);
        });
      });
    });
  });

  // ─── period フィールド ───────────────────────────────────────────────────────

  describe('Given: --period が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-16 - result.period === 指定値', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-16-01: --period=2026-01 → result.period === 2026-01', () => {
          const result = buildConfig(['--period=2026-01']);
          assertEquals(result.period, '2026-01');
        });
      });
    });
  });

  describe('Given: --period が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-17 - result.period === undefined', () => {
        beforeEach(async () => {
          await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-17-01: period 未指定 → result.period === undefined', () => {
          const result = buildConfig([]);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── projectsDic 導出 ────────────────────────────────────────────────────────

  describe('Given: GlobalConfig に projectsDic が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-18 - dicsDir 配下の projects.dic が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ yaml: '' });
        });
        it('T-CL-BC-18-01: projectsDic 未設定 → result.projectsDic === `${dicsDir}/projects.dic`', () => {
          const result = buildConfig([]);
          assertEquals(result.projectsDic, `${globalConfig.get('dicsDir')}/projects.dic`);
        });
      });
    });
  });

  // ─── chunkSize 優先順位 ──────────────────────────────────────────────────────

  describe('Given: GlobalConfig に chunkSize が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-24 - GlobalConfig の chunkSize が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('chunkSize: 5');
        });
        it('T-CL-BC-24-01: globalConfig.chunkSize=5 → result.chunkSize === 5', () => {
          const result = buildConfig([]);
          assertEquals(result.chunkSize, 5);
        });
      });
    });
  });

  describe('Given: GlobalConfig に chunkSize が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-25 - DEFAULT_CLASSIFY_CONFIG.chunkSize が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: claude');
        });
        it('T-CL-BC-25-01: chunkSize 未設定 → result.chunkSize === DEFAULT_CLASSIFY_CONFIG.chunkSize', () => {
          const result = buildConfig([]);
          assertEquals(result.chunkSize, DEFAULT_CLASSIFY_CONFIG.chunkSize);
        });
      });
    });
  });

  // ─── concurrency 優先順位 ────────────────────────────────────────────────────

  describe('Given: GlobalConfig に concurrency が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-26 - GlobalConfig の concurrency が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('concurrency: 2');
        });
        it('T-CL-BC-26-01: globalConfig.concurrency=2 → result.concurrency === 2', () => {
          const result = buildConfig([]);
          assertEquals(result.concurrency, 2);
        });
      });
    });
  });

  describe('Given: GlobalConfig に concurrency が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-27 - DEFAULT_CLASSIFY_CONFIG.concurrency が使われる', () => {
        beforeEach(async () => {
          await _seedGlobalConfig('agent: claude');
        });
        it('T-CL-BC-27-01: concurrency 未設定 → result.concurrency === DEFAULT_CLASSIFY_CONFIG.concurrency', () => {
          const result = buildConfig([]);
          assertEquals(result.concurrency, DEFAULT_CLASSIFY_CONFIG.concurrency);
        });
      });
    });
  });

  describe('Given: GlobalConfig の dicsDir が yaml で上書きされている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-19 - projectsDic 未指定時は dicsDir 配下の projects.dic が使われる', () => {
        beforeEach(async () => {
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ yaml: 'dicsDir: /custom/dics' });
        });
        it('T-CL-BC-19-01: dicsDir=/custom/dics, projectsDic 未指定 → projectsDic === /custom/dics/projects.dic', () => {
          const result = buildConfig([]);
          assertEquals(result.projectsDic, '/custom/dics/projects.dic');
        });
      });
    });
  });

  describe('Given: GlobalConfig に projectsDic が yaml で設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-23 - GlobalConfig の projectsDic が使われる', () => {
        beforeEach(async () => {
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ yaml: 'projectsDic: /custom/projects.dic' });
        });
        it('T-CL-BC-23-01: projectsDic=/custom/projects.dic → result.projectsDic === /custom/projects.dic', () => {
          const result = buildConfig([]);
          assertEquals(result.projectsDic, '/custom/projects.dic');
        });
        it('T-CL-BC-23-02: projectsDic 未設定かつ既定 dicsDir → result.projectsDic === dics/projects.dic', async () => {
          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({ yaml: '' });
          const result = buildConfig([]);
          assertEquals(result.projectsDic, 'dics/projects.dic');
        });
      });
    });
  });
});
