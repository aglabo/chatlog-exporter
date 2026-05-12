// src: scripts/__tests__/integration/set-frontmatter.judge-pipeline.integration.spec.ts
// @(#): judgeType / judgeCategory / generateFrontmatter / reviewFrontmatter の統合テスト
//       Deno.Command モックを使ったパイプライン動作の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess

// -- import --
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';

// test helpers
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// test target
import type { Dics, FrontmatterFileMeta, FrontmatterResult } from '../../set-frontmatter.ts';
import { generateFrontmatter, judgeCategory, judgeType, reviewFrontmatter } from '../../set-frontmatter.ts';

const _enc = new TextEncoder();

// ─── テスト用ヘルパー ─────────────────────────────────────────────────────────

function _makeFrontmatterFileMeta(): FrontmatterFileMeta {
  return {
    file: '/tmp/test.md',
    sessionId: 'sess-001',
    date: '2026-03-15',
    project: 'my-project',
    slug: 'test-slug',
    content: '# テスト\n本文テキスト',
    fullBody: '# テスト\n本文テキスト',
  };
}

function _makeDics(): Dics {
  return {
    category: 'development,tooling,ai',
    tags: 'lang:typescript,tool:deno',
    typeEntries: [
      { key: 'research', def: '調査', desc: '', rules: { when: [], not: [] } },
      { key: 'execution', def: '実行', desc: '', rules: { when: [], not: [] } },
      { key: 'discussion', def: '議論', desc: '', rules: { when: [], not: [] } },
    ],
    topicEntries: [
      { key: 'development', def: '開発', desc: '', rules: { when: [], not: [] } },
    ],
    categoryPrompts: new Map([['research', 'focus guide for research']]),
    prompts: new Map([
      ['type', { system: 'type system', user: 'type ${type_list} ${body}' }],
      ['category', { system: 'category system', user: 'category ${category_list} ${focus_guide} ${body}' }],
      ['meta', { system: 'meta system', user: 'meta ${log_type} ${log_category} ${topic_list} ${tags_list} ${body}' }],
      ['review', {
        system: 'review system',
        user:
          'review ${type_list} ${topic_list} ${category_list} ${tags_list} ${result_type} ${result_category} ${result_yaml}',
      }],
    ]),
  };
}

// ─── テスト共通セットアップ ───────────────────────────────────────────────────

let commandHandle: CommandMockHandle;
let errStub: Stub<Console>;

beforeEach(() => {
  errStub = stub(console, 'error', () => {});
});

afterEach(() => {
  commandHandle?.restore();
  errStub.restore();
});

// ─── judgeType のテスト ───────────────────────────────────────────────────────

describe('judgeType', () => {
  describe('Given: モックが "research" を返す', () => {
    describe('When: judgeType(fm, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-01 - type="research" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('research')));
        });

        it('T-SF-JP-01-01: type が "research" になる', async () => {
          const result = await judgeType(_makeFrontmatterFileMeta(), _makeDics());

          assertEquals(result.type, 'research');
        });
      });
    });
  });

  describe('Given: モックが有効キー以外の "unknown" を返す', () => {
    describe('When: judgeType(fm, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-02 - フォールバック "research" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('unknown')));
        });

        it('T-SF-JP-02-01: type が "research" になる（フォールバック）', async () => {
          const result = await judgeType(_makeFrontmatterFileMeta(), _makeDics());

          assertEquals(result.type, 'research');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する（exit code=1）', () => {
    describe('When: judgeType(fm, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-03 - フォールバック "research" が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-03-01: type が "research" になる（例外なし）', async () => {
          const result = await judgeType(_makeFrontmatterFileMeta(), _makeDics());

          assertEquals(result.type, 'research');
        });
      });
    });
  });
});

// ─── judgeCategory のテスト ───────────────────────────────────────────────────

describe('judgeCategory', () => {
  describe('Given: モックが "development" を返す', () => {
    describe('When: judgeCategory(fm, type, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-04 - "development" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('development')));
        });

        it('T-SF-JP-04-01: "development" が返る', async () => {
          const result = await judgeCategory(_makeFrontmatterFileMeta(), 'research', _makeDics());

          assertEquals(result, 'development');
        });
      });
    });
  });

  describe('Given: モックが無効カテゴリ "invalid" を返す', () => {
    describe('When: judgeCategory(fm, type, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-05 - フォールバック "development" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('invalid')));
        });

        it('T-SF-JP-05-01: "development" が返る（フォールバック）', async () => {
          const result = await judgeCategory(_makeFrontmatterFileMeta(), 'research', _makeDics());

          assertEquals(result, 'development');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する（exit code=1）', () => {
    describe('When: judgeCategory(fm, type, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-06 - フォールバック "development" が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-06-01: "development" が返る（例外なし）', async () => {
          const result = await judgeCategory(_makeFrontmatterFileMeta(), 'research', _makeDics());

          assertEquals(result, 'development');
        });
      });
    });
  });
});

// ─── generateFrontmatter のテスト ─────────────────────────────────────────────

describe('generateFrontmatter', () => {
  describe('Given: モックが YAML 文字列を返す', () => {
    describe('When: generateFrontmatter(fm, type, category, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-07 - yaml フィールドが設定される', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('title: テスト\nsummary: 概要')),
          );
        });

        it('T-SF-JP-07-01: yaml が設定される', async () => {
          const result = await generateFrontmatter(
            _makeFrontmatterFileMeta(),
            'research',
            'development',
            _makeDics(),
          );

          assertEquals(result.yaml.length > 0, true);
        });

        it('T-SF-JP-07-02: type が "research" になる', async () => {
          const result = await generateFrontmatter(
            _makeFrontmatterFileMeta(),
            'research',
            'development',
            _makeDics(),
          );

          assertEquals(result.type, 'research');
        });

        it('T-SF-JP-07-03: category が "development" になる', async () => {
          const result = await generateFrontmatter(
            _makeFrontmatterFileMeta(),
            'research',
            'development',
            _makeDics(),
          );

          assertEquals(result.category, 'development');
        });
      });
    });
  });

  describe('Given: モックがコードフェンス付き YAML を返す', () => {
    describe('When: generateFrontmatter を呼び出す', () => {
      describe('Then: T-SF-JP-08 - cleanYaml でコードフェンスが除去される', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('```yaml\ntitle: テスト\nsummary: 概要\n```')),
          );
        });

        it('T-SF-JP-08-01: yaml に ``` が含まれない', async () => {
          const result = await generateFrontmatter(
            _makeFrontmatterFileMeta(),
            'research',
            'development',
            _makeDics(),
          );

          assertEquals(result.yaml.includes('```'), false);
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する', () => {
    describe('When: generateFrontmatter を呼び出す', () => {
      describe('Then: T-SF-JP-09 - yaml が空文字（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-09-01: yaml が空文字になる', async () => {
          const result = await generateFrontmatter(
            _makeFrontmatterFileMeta(),
            'research',
            'development',
            _makeDics(),
          );

          assertEquals(result.yaml, '');
        });
      });
    });
  });
});

// ─── reviewFrontmatter のテスト ───────────────────────────────────────────────

describe('reviewFrontmatter', () => {
  function _makeFmResult(): FrontmatterResult {
    return {
      file: '/tmp/test.md',
      type: 'research',
      category: 'development',
      yaml: 'title: テスト\nsummary: 概要',
    };
  }

  describe('Given: レビュー結果が "validity: pass" を返す', () => {
    describe('When: reviewFrontmatter(result, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-10 - validity="pass", errors=[]', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('validity: pass')),
          );
        });

        it('T-SF-JP-10-01: validity が "pass" になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.validity, 'pass');
        });

        it('T-SF-JP-10-02: errors が空配列になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.errors, []);
        });
      });
    });
  });

  describe('Given: レビュー結果が validity=fail + errors を返す', () => {
    describe('When: reviewFrontmatter(result, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-11 - validity="fail", errors が抽出される', () => {
        const failResponse = [
          'validity: fail',
          'errors:',
          '  - type が不正です',
          '  - category が不一致です',
        ].join('\n');

        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(failResponse)),
          );
        });

        it('T-SF-JP-11-01: validity が "fail" になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.validity, 'fail');
        });

        it('T-SF-JP-11-02: errors が2件になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.errors.length, 2);
        });
      });
    });
  });

  describe('Given: レビュー結果が validity=fail + corrected fields を返す', () => {
    describe('When: reviewFrontmatter(result, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-12 - correctedType/Category/Yaml が設定される', () => {
        const failResponse = [
          'validity: fail',
          'errors:',
          '  - type が不正です',
          'corrections:',
          '  type: execution',
          '  category: tooling',
          '  title: 修正済みタイトル',
          '  summary: 修正済み概要',
        ].join('\n');

        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode(failResponse)),
          );
        });

        it('T-SF-JP-12-01: correctedType が "execution" になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.correctedType, 'execution');
        });

        it('T-SF-JP-12-02: correctedCategory が "tooling" になる', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.correctedCategory, 'tooling');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する', () => {
    describe('When: reviewFrontmatter(result, dics) を呼び出す', () => {
      describe('Then: T-SF-JP-13 - フォールバック pass が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-13-01: validity が "pass" になる（例外なし）', async () => {
          const result = await reviewFrontmatter(_makeFmResult(), _makeDics());

          assertEquals(result.validity, 'pass');
        });
      });
    });
  });
});
