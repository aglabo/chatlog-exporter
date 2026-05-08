// src: scripts/__tests__/functional/classify-chatlog.build-config.functional.spec.ts
// @(#): buildConfig の機能テスト
//       ParsedConfig + GlobalConfig + デフォルト値から ClassifyConfig を構築するロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// --- Test target ---
import { buildConfig } from '../../classify-chatlog.ts';

// --- Helpers
// constants
import { DEFAULT_AI_MODEL } from '../../../../_scripts/constants/defaults.constants.ts';
import { DEFAULT_CLASSIFY_CONFIG } from '../../constants/classify.constants.ts';
// types
import type { CommandProvider } from '../../../../_scripts/types/providers.types.ts';
import type { ParsedConfig } from '../../types/classify.types.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

const _existsStat = (_path: string) => Promise.resolve({ isFile: true } as Deno.FileInfo);

/** git コマンドを実行しない CommandProvider モック。 */
class _NoopCommandProvider {
  constructor(_cmd: string, _opts: { args: string[] }) {}
  output(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: new Uint8Array() });
  }
}

/** テスト用 GlobalConfig を作成する（YAML 文字列から）。 */
async function _makeGlobalConfig(yaml: string): Promise<GlobalConfig> {
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({
    readTextFileProvider: () => Promise.resolve(yaml),
    statProvider: _existsStat,
    commandProvider: _NoopCommandProvider as unknown as CommandProvider,
    configFile: 'dummy.yaml',
  });
}

/** 空の ParsedConfig。 */
const _EMPTY_PARSED: ParsedConfig = {};

// ─── T-CL-BC-01: model 優先順位 parsed > globalConfig ─────────────────────────

describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── model 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: parsed.model が指定されている', () => {
    describe('When: GlobalConfig にも model が設定されている', () => {
      describe('Then: T-CL-BC-01 - parsed.model が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('model: haiku');
        });
        it('T-CL-BC-01-01: parsed.model=opus → result.model === opus', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, model: 'opus' }, globalConfig);
          assertEquals(result.model, 'opus');
        });
      });
    });
  });

  describe('Given: parsed.model が未指定', () => {
    describe('When: GlobalConfig に model が設定されている', () => {
      describe('Then: T-CL-BC-02 - GlobalConfig の model が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('model: haiku');
        });
        it('T-CL-BC-02-01: globalConfig.model=haiku → result.model === haiku', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.model, 'haiku');
        });
      });
    });

    describe('When: GlobalConfig にも model が設定されていない', () => {
      describe('Then: T-CL-BC-03 - DEFAULT_CLASSIFY_CONFIG.model が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: claude');
        });
        it('T-CL-BC-03-01: model 未設定 → result.model === DEFAULT_AI_MODEL', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.model, DEFAULT_AI_MODEL);
        });
      });
    });

    describe('When: GlobalConfig に不正モデル名が設定されている', () => {
      describe('Then: T-CL-BC-04 - ChatlogError(InvalidArgs) がスローされる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          // model キーを持たない空スキーマ → get('model') が undefined を返す
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-CL-BC-04-01: globalConfig に model なし + defaults.model=invalid → ChatlogError(InvalidArgs)', () => {
          assertThrows(
            () =>
              buildConfig(_EMPTY_PARSED, globalConfig, {
                ...DEFAULT_CLASSIFY_CONFIG,
                model: 'invalid-model',
              }),
            ChatlogError,
          );
        });
      });
    });
  });

  // ─── dicsDir 優先順位 ────────────────────────────────────────────────────────

  describe('Given: GlobalConfig に dicsDir が設定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-05 - GlobalConfig の dicsDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('dicsDir: /custom/dics');
        });
        it('T-CL-BC-05-01: globalConfig.dicsDir=/custom/dics → result.dicsDir === /custom/dics', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.dicsDir, '/custom/dics');
        });
      });
    });
  });

  describe('Given: GlobalConfig に dicsDir が設定されていない', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-06 - DEFAULT_CLASSIFY_CONFIG.dicsDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: claude');
        });
        it('T-CL-BC-06-01: dicsDir 未設定 → result.dicsDir === DEFAULT_CLASSIFY_CONFIG.dicsDir', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.dicsDir, DEFAULT_CLASSIFY_CONFIG.dicsDir);
        });
      });
    });
  });

  // ─── parsed フィールドの上書き ───────────────────────────────────────────────

  describe('Given: parsed に dryRun=true, inputDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-07 - parsed フィールドがデフォルトを上書きする', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-07-01: parsed.dryRun=true → result.dryRun === true', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, dryRun: true, inputDir: '/custom/input' }, globalConfig);
          assertEquals(result.dryRun, true);
          assertEquals(result.inputDir, '/custom/input');
        });
      });
    });
  });

  // ─── configFile が結果に含まれない ───────────────────────────────────────────

  describe('Given: parsed に configFile が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-08 - result に configFile フィールドが含まれない', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-08-01: parsed.configFile → result に configFile が含まれない', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, configFile: 'custom.yaml' }, globalConfig);
          assertEquals('configFile' in result, false);
        });
      });
    });
  });

  // ─── agent 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: parsed.agent が指定されている', () => {
    describe('When: GlobalConfig にも agent が設定されている', () => {
      describe('Then: T-CL-BC-09 - parsed.agent が優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-CL-BC-09-01: parsed.agent=codex → result.agent === codex', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, agent: 'codex' }, globalConfig);
          assertEquals(result.agent, 'codex');
        });
      });
    });
  });

  describe('Given: parsed.agent が未指定', () => {
    describe('When: GlobalConfig に agent が設定されている', () => {
      describe('Then: T-CL-BC-10 - GlobalConfig の agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('agent: chatgpt');
        });
        it('T-CL-BC-10-01: globalConfig.agent=chatgpt → result.agent === chatgpt', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, 'chatgpt');
        });
      });
    });

    describe('When: GlobalConfig にも agent が設定されていない', () => {
      describe('Then: T-CL-BC-11 - DEFAULT_CLASSIFY_CONFIG.agent が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('model: sonnet');
        });
        it('T-CL-BC-11-01: agent 未設定 → result.agent === DEFAULT_CLASSIFY_CONFIG.agent', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.agent, DEFAULT_CLASSIFY_CONFIG.agent);
        });
      });
    });
  });

  // ─── dryRun 優先順位 ─────────────────────────────────────────────────────────

  describe('Given: parsed.dryRun=true が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-12 - result.dryRun === true', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-12-01: parsed.dryRun=true → result.dryRun === true', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, dryRun: true }, globalConfig);
          assertEquals(result.dryRun, true);
        });
      });
    });
  });

  describe('Given: parsed.dryRun が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-13 - DEFAULT_CLASSIFY_CONFIG.dryRun が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-13-01: dryRun 未指定 → result.dryRun === DEFAULT_CLASSIFY_CONFIG.dryRun', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.dryRun, DEFAULT_CLASSIFY_CONFIG.dryRun);
        });
      });
    });
  });

  // ─── inputDir 優先順位 ───────────────────────────────────────────────────────

  describe('Given: parsed.inputDir が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-14 - result.inputDir === parsed.inputDir', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-14-01: parsed.inputDir=/custom/input → result.inputDir === /custom/input', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, inputDir: '/custom/input' }, globalConfig);
          assertEquals(result.inputDir, '/custom/input');
        });
      });
    });
  });

  describe('Given: parsed.inputDir が指定されている', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      describe('Then: T-CL-BC-20 - parsed.inputDir が最優先される', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it('T-CL-BC-20-01: parsed.inputDir=/custom/input → result.inputDir === /custom/input', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, inputDir: '/custom/input' }, globalConfig);
          assertEquals(result.inputDir, '/custom/input');
        });
      });
    });
  });

  describe('Given: parsed.inputDir が未指定', () => {
    describe('When: GlobalConfig に chatlogsDir が設定されている', () => {
      describe('Then: T-CL-BC-21 - GlobalConfig の chatlogsDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await _makeGlobalConfig('chatlogsDir: /global/chatlog');
        });
        it('T-CL-BC-21-01: inputDir 未指定, globalConfig.chatlogsDir=/global/chatlog → result.inputDir === /global/chatlog', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, '/global/chatlog');
        });
      });
    });

    describe('When: GlobalConfig に chatlogsDir が未登録（schema: {}）', () => {
      describe('Then: T-CL-BC-15 - DEFAULT_CLASSIFY_CONFIG.inputDir が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance({ schema: {} });
        });
        it('T-CL-BC-15-01: inputDir 未指定, chatlogsDir 未登録 → result.inputDir === DEFAULT_CLASSIFY_CONFIG.inputDir', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.inputDir, DEFAULT_CLASSIFY_CONFIG.inputDir);
        });
      });
    });
  });

  // ─── period フィールド（parsedのみ） ─────────────────────────────────────────

  describe('Given: parsed.period が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-16 - result.period === parsed.period', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-16-01: parsed.period=2026-01 → result.period === 2026-01', () => {
          const result = buildConfig({ ..._EMPTY_PARSED, period: '2026-01' }, globalConfig);
          assertEquals(result.period, '2026-01');
        });
      });
    });
  });

  describe('Given: parsed.period が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-17 - result.period === undefined', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-17-01: period 未指定 → result.period === undefined', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.period, undefined);
        });
      });
    });
  });

  // ─── projectsDic 導出 ────────────────────────────────────────────────────────

  describe('Given: parsed.configFile が指定されている', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-18 - configFile のディレクトリ + /projects.dic が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-18-01: configFile=/custom/config/config.yaml → projectsDic === /custom/config/projects.dic', () => {
          const result = buildConfig(
            { ..._EMPTY_PARSED, configFile: '/custom/config/config.yaml' },
            globalConfig,
          );
          assertEquals(result.projectsDic, '/custom/config/projects.dic');
        });
      });
    });
  });

  describe('Given: parsed.configFile が未指定', () => {
    describe('When: buildConfig を呼び出す', () => {
      describe('Then: T-CL-BC-19 - DEFAULT_CLASSIFY_CONFIG.projectsDic が使われる', () => {
        let globalConfig: GlobalConfig;
        beforeEach(async () => {
          globalConfig = await GlobalConfig.getInstance();
        });
        it('T-CL-BC-19-01: configFile 未指定 → result.projectsDic === DEFAULT_CLASSIFY_CONFIG.projectsDic', () => {
          const result = buildConfig(_EMPTY_PARSED, globalConfig);
          assertEquals(result.projectsDic, DEFAULT_CLASSIFY_CONFIG.projectsDic);
        });
      });
    });
  });
});
