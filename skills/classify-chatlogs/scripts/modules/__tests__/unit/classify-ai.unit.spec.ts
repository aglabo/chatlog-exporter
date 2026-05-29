// src: scripts/modules/__tests__/unit/classify-ai.unit.spec.ts
// @(#): buildClassifyPrompt / buildSystemPrompt / classifyByAI のユニットテスト
//       対象: buildClassifyPrompt / buildSystemPrompt / classifyByAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ClassifyChatlogEntry } from '../../../classes/ClassifyChatlogEntry.class.ts';
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import type { ClassifyConfig, ProjectDicEntry } from '../../../types/classify.types.ts';
import {
  buildClassifyPrompt,
  buildSystemPrompt,
  classifyByAI,
} from '../../classify-ai.ts';

// ─── Helpers
import { renderFrontmatter } from '../../../../../_scripts/libs/text/frontmatter-utils.ts';

// ─── Internal Helpers

// constants
const _PROJECTS: ProjectDicEntry = { app1: {}, misc: {} };
const _BASE_CONFIG: ClassifyConfig = {
  agent: 'claude',
  dryRun: false,
  baseDir: '/tmp',
  dicsDir: './assets/dics',
  model: 'sonnet',
  chunkSize: 10,
  concurrency: 4,
};

// types
interface MakeMetaOptions {
  filePath?: string;
  filename?: string;
  title?: string;
  category?: string;
  topics?: string[];
  tags?: string[];
  content?: string;
}

// functions
/**
 * テスト用 `ClassifyChatlogEntry` を MakeMetaOptions から生成する。
 *
 * @param opts - frontmatter フィールドとコンテンツのオプション
 * @returns 初期化済みの `ClassifyChatlogEntry` インスタンス
 */
const _makeClassifyChatlogEntry = (opts: MakeMetaOptions = {}): ClassifyChatlogEntry => {
  const title = opts.title !== undefined ? opts.title : 'Test Title';
  const category = opts.category !== undefined ? opts.category : 'development';
  const topics = opts.topics ?? [];
  const tags = opts.tags ?? [];
  const content = opts.content ?? '';

  const _fields: Record<string, unknown> = {};
  if (title) { _fields['title'] = title; }
  if (category) { _fields['category'] = category; }
  if (topics.length > 0) { _fields['topics'] = topics; }
  if (tags.length > 0) { _fields['tags'] = tags; }

  const _text = renderFrontmatter(_fields) + content;
  const filePath = `test/path/${opts.filename ?? 'file.md'}`;
  return new ClassifyChatlogEntry(_text, filePath);
};

// ─── buildClassifyPrompt ──────────────────────────────────────────────────────

describe('buildClassifyPrompt', () => {
  describe('Given: 2件の ClassifyChatlogEntry と {app1,app2,misc} の ProjectDicEntry', () => {
    describe('When: buildClassifyPrompt(files, projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-01 - 複数ファイルのプロンプト生成', () => {
        it('T-CL-BCP-01-01: "Projects: app1, app2, misc" ヘッダーが含まれる', () => {
          const files = [
            _makeClassifyChatlogEntry({ filename: 'a.md' }),
            _makeClassifyChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'Projects: app1, app2, misc');
        });

        it('T-CL-BCP-01-02: FILE 1 のセクションが含まれる', () => {
          const files = [
            _makeClassifyChatlogEntry({ filename: 'a.md' }),
            _makeClassifyChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, '=== FILE 1: a.md ===');
        });

        it('T-CL-BCP-01-03: FILE 2 のセクションが含まれる', () => {
          const files = [
            _makeClassifyChatlogEntry({ filename: 'a.md' }),
            _makeClassifyChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, '=== FILE 2: b.md ===');
        });

        it('T-CL-BCP-01-04: "misc, misc" が含まれない（misc 二重出力なし）', () => {
          const files = [_makeClassifyChatlogEntry({ filename: 'a.md' })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          const hasDuplicate = result.includes('misc, misc');
          if (hasDuplicate) {
            throw new Error('"misc, misc" が含まれている — misc 二重出力バグが発生している');
          }
        });
      });
    });
  });

  describe('Given: topics/tags が空の ClassifyChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-02 - topics/tags が空のとき (none) が出力される', () => {
        it('T-CL-BCP-02-01: topics として "(none)" が含まれる', () => {
          const files = [_makeClassifyChatlogEntry({ topics: [], tags: [] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'topics: (none)');
        });

        it('T-CL-BCP-02-02: tags として "(none)" が含まれる', () => {
          const files = [_makeClassifyChatlogEntry({ topics: [], tags: [] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'tags: (none)');
        });
      });
    });
  });

  describe('Given: フロントマターなし（title/category/topics/tags が空）の ClassifyChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-04 - 本文スニペットが追加される', () => {
        it('T-CL-BCP-04-01: "body:" フィールドが含まれる', () => {
          const files = [
            _makeClassifyChatlogEntry({
              title: '',
              category: '',
              topics: [],
              tags: [],
              content: 'Deno でファイル入出力を実装した。readTextFile と writeTextFile の使い方を確認した。',
            }),
          ];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'body:');
        });

        it('T-CL-BCP-04-02: 本文が 500 文字以内にトリムされて含まれる', () => {
          const longBody = 'a'.repeat(600);
          const files = [
            _makeClassifyChatlogEntry({
              title: '',
              category: '',
              topics: [],
              tags: [],
              content: longBody,
            }),
          ];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, `body: ${'a'.repeat(500)}`);
        });
      });
    });
  });

  describe('Given: フロントマターあり（title が存在する）の ClassifyChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-05 - 本文スニペットは追加されない', () => {
        it('T-CL-BCP-05-01: "body:" フィールドが含まれない', () => {
          const files = [
            _makeClassifyChatlogEntry({
              title: 'テストタイトル',
              category: '',
              topics: [],
              tags: [],
              content: '本文テキスト',
            }),
          ];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          const hasBody = result.includes('body:');
          if (hasBody) {
            throw new Error('body: フィールドが含まれているが、含まれてはいけない');
          }
        });
      });
    });
  });

  describe('Given: topics/tags が存在する ClassifyChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-03 - topics/tags がカンマ区切りで出力される', () => {
        it('T-CL-BCP-03-01: topics がカンマ区切りで含まれる', () => {
          const files = [_makeClassifyChatlogEntry({ topics: ['API', '設計'], tags: ['ts'] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'topics: API, 設計');
        });

        it('T-CL-BCP-03-02: tags がカンマ区切りで含まれる', () => {
          const files = [_makeClassifyChatlogEntry({ topics: ['API'], tags: ['ts', 'deno'] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'tags: ts, deno');
        });
      });
    });
  });
});

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  describe('Given: {app1,app2,misc} の ProjectDicEntry', () => {
    describe('When: buildSystemPrompt(projects) を呼び出す', () => {
      describe('Then: T-CL-BSP-01 - プロジェクトリストと misc フォールバックが含まれる', () => {
        it('T-CL-BSP-01-01: "app1, app2, misc" のリストが含まれる', () => {
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildSystemPrompt(projects);

          assertStringIncludes(result, 'app1, app2, misc');
        });

        it(`T-CL-BSP-01-02: "${FALLBACK_PROJECT}" フォールバックの指示が含まれる`, () => {
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildSystemPrompt(projects);

          assertStringIncludes(result, `"${FALLBACK_PROJECT}"`);
        });

        it('T-CL-BSP-01-03: "misc, misc" が含まれない（misc 二重出力なし）', () => {
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildSystemPrompt(projects);

          const hasDuplicate = result.includes('misc, misc');
          if (hasDuplicate) {
            throw new Error('"misc, misc" が含まれている — misc 二重出力バグが発生している');
          }
        });
      });
    });
  });

  describe('Given: 任意の ProjectDicEntry', () => {
    describe('When: buildSystemPrompt(projects) を呼び出す', () => {
      describe('Then: T-CL-BSP-02 - 出力形式の指示が含まれる', () => {
        it('T-CL-BSP-02-01: "Output ONLY a JSON array" の指示が含まれる', () => {
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildSystemPrompt(projects);

          assertStringIncludes(result, 'Output ONLY a JSON array');
        });

        it('T-CL-BSP-02-02: JSON スキーマのフィールド "file" が含まれる', () => {
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildSystemPrompt(projects);

          assertStringIncludes(result, '"file"');
        });
      });
    });
  });
});

// ─── classifyByAI ─────────────────────────────────────────────────────────────

/**
 * `classifyByAI` のユニットテストスイート。
 *
 * remaining エントリのみを受け取り AI 分類を実行するバッファ構築を検証する。
 *
 * テスト ID 範囲: T-CL-CA-01 〜 T-CL-CA-02
 *
 * @see classifyByAI
 */
describe('classifyByAI', () => {
  /**
   * 正常系: remaining が 0 件のとき空バッファが返されるケース。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-CA-01: remaining が 0 件のとき AI 分類が呼ばれず空配列が返される', async () => {
      // Act: remaining エントリが空 → runChunked は processChunk を呼ばない
      const _buffer = await classifyByAI([], _PROJECTS, _BASE_CONFIG);

      // Assert: AI 未呼び出しで空バッファ
      assertEquals(_buffer.length, 0);
    });
  });
});
