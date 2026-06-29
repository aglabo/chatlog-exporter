// src: scripts/modules/__tests__/integration/judge-pipeline.integration.spec.ts
// @(#): judgeType / judgeCategory / generateFrontmatter / reviewFrontmatter の統合テスト
//       Deno.Command モックを使ったパイプライン動作の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words sess setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { judgeCategory } from '../../setfm-category.ts';
import { generateFrontmatter } from '../../setfm-frontmatter.ts';
import { reviewFrontmatter } from '../../setfm-review.ts';
import { judgeType } from '../../setfm-type.ts';
// types
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Helpers
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers

// constants
const _enc = new TextEncoder();
const _MAX_CONTENT_LENGTH = 5000;

// functions

/**
 * テスト用 `ChatlogEntry` を生成する（/tmp/test.md 相当）。
 *
 * @returns filePath='/tmp/test.md' でセッションメタを持つ `ChatlogEntry`
 */
function _makeChatlogEntry(): ChatlogEntry {
  const text = [
    '---',
    'session_id: sess-001',
    'date: 2026-03-15',
    'project: my-project',
    'slug: test-slug',
    '---',
    '',
    '# テスト',
    '本文テキスト',
  ].join('\n');
  return new ChatlogEntry(text, { filePath: '/tmp/test.md' });
}

function _makeDics(): Dics {
  return {
    category: 'development,tooling,ai',
    tags: 'lang:typescript,tool:deno',
    categoryEntries: [],
    typeEntries: [
      { key: 'research', def: '調査', desc: '', rules: { when: [], not: [] } },
      { key: 'execution', def: '実行', desc: '', rules: { when: [], not: [] } },
      { key: 'discussion', def: '議論', desc: '', rules: { when: [], not: [] } },
    ],
    topicEntries: [
      { key: 'development', def: '開発', desc: '', rules: { when: [], not: [] } },
    ],
  };
}

function _makePrompts(): Prompts {
  return {
    categoryPrompts: new Map([['research', 'focus guide for research']]),
    prompts: new Map([
      ['type', { system: 'type system ${type_dics}', user: '${entries}' }],
      ['category', { system: 'category system ${category_dics}', user: '${focus_guide} ${body}' }],
      ['meta', { system: 'meta system', user: 'meta ${log_type} ${log_category} ${topic_list} ${tags_list} ${body}' }],
      ['review', {
        system: 'review system',
        user:
          'review ${type_dics} ${topic_list} ${category_list} ${tags_list} ${result_type} ${result_category} ${result_yaml}',
      }],
    ]),
  };
}

// ─── Tests

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
  describe('Given: モックが plain text "research" を返す', () => {
    describe('When: judgeType(entry, maxContentLength, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-01 - entry.frontmatter.get("type") が "research" になる', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('research')),
          );
        });

        it('T-SF-JP-01-01: entry.frontmatter.get("type") が "research" になる', async () => {
          const _entry = _makeChatlogEntry();
          await judgeType(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('type'), 'research');
        });
      });
    });
  });

  describe('Given: モックが有効キー以外のテキストを返す', () => {
    describe('When: judgeType(entry, maxContentLength, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-02 - フォールバック "research" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('unknown')),
          );
        });

        it('T-SF-JP-02-01: entry.frontmatter.get("type") が "research" になる（フォールバック）', async () => {
          const _entry = _makeChatlogEntry();
          await judgeType(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('type'), 'research');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する（exit code=1）', () => {
    describe('When: judgeType(entry, maxContentLength, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-03 - フォールバック "research" が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-03-01: entry.frontmatter.get("type") が "research" になる（例外なし）', async () => {
          const _entry = _makeChatlogEntry();
          await judgeType(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('type'), 'research');
        });
      });
    });
  });
});

// ─── judgeCategory のテスト ───────────────────────────────────────────────────

describe('judgeCategory', () => {
  describe('Given: モックが "development" を返す', () => {
    describe('When: judgeCategory(entry, maxContentLength, type, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-04 - "development" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('development')));
        });

        it('T-SF-JP-04-01: "development" が返る', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          await judgeCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('category'), 'development');
        });
      });
    });
  });

  describe('Given: モックが無効カテゴリ "invalid" を返す', () => {
    describe('When: judgeCategory(entry, maxContentLength, type, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-05 - フォールバック "development" が返る', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeSuccessMock(_enc.encode('invalid')));
        });

        it('T-SF-JP-05-01: "development" が返る（フォールバック）', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          await judgeCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('category'), 'development');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する（exit code=1）', () => {
    describe('When: judgeCategory(entry, maxContentLength, type, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-06 - フォールバック "development" が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-06-01: "development" が返る（例外なし）', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          await judgeCategory(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('category'), 'development');
        });
      });
    });
  });
});

// ─── generateFrontmatter のテスト ─────────────────────────────────────────────

describe('generateFrontmatter', () => {
  describe('Given: モックが YAML 文字列を返す', () => {
    describe('When: generateFrontmatter(entry, maxContentLength, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-07 - generateFrontmatter が true を返す', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('title: テスト\nsummary: 概要')),
          );
        });

        it('T-SF-JP-07-01: generateFrontmatter が true を返す', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const _ok = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_ok, true);
        });

        it('T-SF-JP-07-02: type が "research" になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const _ok = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_ok, true);
          assertEquals(_entry.frontmatter.get('type'), 'research');
        });

        it('T-SF-JP-07-03: category が "development" になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const _ok = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_ok, true);
          assertEquals(_entry.frontmatter.get('category'), 'development');
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
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const _ok = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_ok, true);
          assertEquals(_entry.frontmatter.toFrontmatter().includes('```'), false);
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する', () => {
    describe('When: generateFrontmatter を呼び出す', () => {
      describe('Then: T-SF-JP-09 - false が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-09-01: false が返る', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const _ok = await generateFrontmatter(_entry, _MAX_CONTENT_LENGTH, _makeDics(), _makePrompts());

          assertEquals(_ok, false);
        });
      });
    });
  });
});

// ─── reviewFrontmatter のテスト ───────────────────────────────────────────────

describe('reviewFrontmatter', () => {
  describe('Given: レビュー結果が "validity: pass" を返す', () => {
    describe('When: reviewFrontmatter(entry, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-10 - validity="pass", errors=[]', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('validity: pass')),
          );
        });

        it('T-SF-JP-10-01: validity が "pass" になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const result = await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(result.validity, 'pass');
        });

        it('T-SF-JP-10-02: errors が空配列になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const result = await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(result.errors, []);
        });
      });
    });
  });

  describe('Given: レビュー結果が validity=fail + errors を返す', () => {
    describe('When: reviewFrontmatter(entry, dics, prompts) を呼び出す', () => {
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
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const result = await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(result.validity, 'fail');
        });

        it('T-SF-JP-11-02: errors が2件になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const result = await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(result.errors.length, 2);
        });
      });
    });
  });

  describe('Given: レビュー結果が validity=fail + corrections を返す', () => {
    describe('When: reviewFrontmatter(entry, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-12 - entry.frontmatter に type/category が書き込まれる', () => {
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

        it('T-SF-JP-12-01: entry.frontmatter.get("type") が "execution" になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('type'), 'execution');
        });

        it('T-SF-JP-12-02: entry.frontmatter.get("category") が "tooling" になる', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(_entry.frontmatter.get('category'), 'tooling');
        });
      });
    });
  });

  describe('Given: Claude CLI が失敗する', () => {
    describe('When: reviewFrontmatter(entry, dics, prompts) を呼び出す', () => {
      describe('Then: T-SF-JP-13 - フォールバック pass が返る（例外なし）', () => {
        beforeEach(() => {
          commandHandle = installCommandMock(makeFailMock(1));
        });

        it('T-SF-JP-13-01: validity が "pass" になる（例外なし）', async () => {
          const _entry = _makeChatlogEntry();
          _entry.frontmatter.set('type', 'research');
          _entry.frontmatter.set('category', 'development');
          const result = await reviewFrontmatter(_entry, _makeDics(), _makePrompts());

          assertEquals(result.validity, 'pass');
        });
      });
    });
  });
});
