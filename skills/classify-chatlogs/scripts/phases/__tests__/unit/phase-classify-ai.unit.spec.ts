// src: scripts/phases/__tests__/unit/phase-classify-ai.unit.spec.ts
// @(#): buildClassifyPrompt / buildSystemPrompt / classifyByAI のユニットテスト
//       対象: buildClassifyPrompt / buildSystemPrompt / classifyByAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import type { ProjectDicEntry } from '../../../types/classify.types.ts';
import {
  buildClassifyPrompt,
  buildSystemPrompt,
} from '../../phase-classify-ai.ts';

// ─── Helpers
import { renderFrontmatter } from '../../../../../_cle-libs/libs/text/frontmatter-utils.ts';
// types
import type { FrontmatterFields } from '../../../../../_cle-libs/types/frontmatter.types.ts';

// ─── Internal Helpers

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

/** `buildSystemPrompt` の `Project definitions:` 以降を検証するテーブル駆動ケース。 */
interface _TailCase {
  id: string;
  label: string;
  projects: ProjectDicEntry;
  expected: string;
}

// functions
/**
 * システムプロンプトから `Project definitions:` 見出し以降の末尾を取り出す。
 *
 * 見出しが無い場合は空文字列を返し、期待値との比較で失敗させる。
 *
 * @param prompt - `buildSystemPrompt` の出力
 * @returns `Project definitions:` から末尾までの文字列
 */
const _tailOf = (prompt: string): string => {
  const _index = prompt.indexOf('Project definitions:');
  return _index < 0 ? '' : prompt.slice(_index);
};

/**
 * テスト用 `ChatlogEntry` を MakeMetaOptions から生成する。
 *
 * @param opts - frontmatter フィールドとコンテンツのオプション
 * @returns 初期化済みの `ChatlogEntry` インスタンス
 */
const _makeChatlogEntry = (opts: MakeMetaOptions = {}): ChatlogEntry => {
  const title = opts.title !== undefined ? opts.title : 'Test Title';
  const category = opts.category !== undefined ? opts.category : 'development';
  const topics = opts.topics ?? [];
  const tags = opts.tags ?? [];
  const content = opts.content ?? '';

  const _fields: FrontmatterFields = {};
  if (title) { _fields['title'] = title; }
  if (category) { _fields['category'] = category; }
  if (topics.length > 0) { _fields['topics'] = topics; }
  if (tags.length > 0) { _fields['tags'] = tags; }

  const _text = renderFrontmatter(_fields) + content;
  const filePath = `test/path/${opts.filename ?? 'file.md'}`;
  return new ChatlogEntry(_text, { filePath });
};

// ─── buildClassifyPrompt ──────────────────────────────────────────────────────

describe('buildClassifyPrompt', () => {
  describe('Given: 2件の ChatlogEntry と {app1,app2,misc} の ProjectDicEntry', () => {
    describe('When: buildClassifyPrompt(files, projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-01 - 複数ファイルのプロンプト生成', () => {
        it('T-CL-BCP-01-01: "Projects: app1, app2, misc" ヘッダーが含まれる', () => {
          const files = [
            _makeChatlogEntry({ filename: 'a.md' }),
            _makeChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'Projects: app1, app2, misc');
        });

        it('T-CL-BCP-01-02: FILE 1 のセクションが含まれる', () => {
          const files = [
            _makeChatlogEntry({ filename: 'a.md' }),
            _makeChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, '=== FILE 1: a.md ===');
        });

        it('T-CL-BCP-01-03: FILE 2 のセクションが含まれる', () => {
          const files = [
            _makeChatlogEntry({ filename: 'a.md' }),
            _makeChatlogEntry({ filename: 'b.md' }),
          ];
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, '=== FILE 2: b.md ===');
        });

        it('T-CL-BCP-01-04: "misc, misc" が含まれない（misc 二重出力なし）', () => {
          const files = [_makeChatlogEntry({ filename: 'a.md' })];
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

  describe('Given: topics/tags が空の ChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-02 - topics/tags が空のとき (none) が出力される', () => {
        it('T-CL-BCP-02-01: topics として "(none)" が含まれる', () => {
          const files = [_makeChatlogEntry({ topics: [], tags: [] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'topics: (none)');
        });

        it('T-CL-BCP-02-02: tags として "(none)" が含まれる', () => {
          const files = [_makeChatlogEntry({ topics: [], tags: [] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'tags: (none)');
        });
      });
    });
  });

  describe('Given: フロントマターなし（title/category/topics/tags が空）の ChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-04 - 本文スニペットが追加される', () => {
        it('T-CL-BCP-04-01: "body:" フィールドが含まれる', () => {
          const files = [
            _makeChatlogEntry({
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
            _makeChatlogEntry({
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

  describe('Given: フロントマターあり（title が存在する）の ChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-05 - 本文スニペットは追加されない', () => {
        it('T-CL-BCP-05-01: "body:" フィールドが含まれない', () => {
          const files = [
            _makeChatlogEntry({
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

  describe('Given: topics/tags が存在する ChatlogEntry', () => {
    describe('When: buildClassifyPrompt([fileMeta], projects) を呼び出す', () => {
      describe('Then: T-CL-BCP-03 - topics/tags がカンマ区切りで出力される', () => {
        it('T-CL-BCP-03-01: topics がカンマ区切りで含まれる', () => {
          const files = [_makeChatlogEntry({ topics: ['API', '設計'], tags: ['ts'] })];
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          const result = buildClassifyPrompt(files, projects);

          assertStringIncludes(result, 'topics: API, 設計');
        });

        it('T-CL-BCP-03-02: tags がカンマ区切りで含まれる', () => {
          const files = [_makeChatlogEntry({ topics: ['API'], tags: ['ts', 'deno'] })];
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

  /** 辞書の def / rules から Project definitions ブロックを組み立てる正常ケース。 */
  describe('When: 正常系', () => {
    const _cases: _TailCase[] = [
      {
        id: 'T-CL-BSP-03-01',
        label: 'rules.when のみ → when 行だけ出る',
        projects: { app1: { def: 'Application 1', rules: { when: ['w1', 'w2'] } }, misc: {} },
        expected: 'Project definitions:\n- app1: Application 1\n  when: w1; w2\n- misc',
      },
      {
        id: 'T-CL-BSP-03-02',
        label: 'rules.not のみ → not 行だけ出る',
        projects: { app1: { def: 'Application 1', rules: { not: ['n1', 'n2'] } }, misc: {} },
        expected: 'Project definitions:\n- app1: Application 1\n  not: n1; n2\n- misc',
      },
      {
        id: 'T-CL-BSP-03-03',
        label: 'キー順 (非アルファベット順) がそのまま block 順になる',
        projects: { zeta: { def: 'Z' }, alpha: { def: 'A' }, misc: {} },
        expected: 'Project definitions:\n- zeta: Z\n- alpha: A\n- misc',
      },
      {
        id: 'T-CL-BSP-03-04',
        label: 'category / desc は出力しない',
        projects: { app1: { def: 'Application 1', category: 'dev', desc: 'アプリ 1 の説明' }, misc: {} },
        expected: 'Project definitions:\n- app1: Application 1\n- misc',
      },
    ];

    for (const { id, label, projects, expected } of _cases) {
      it(`[Normal] ${id}: ${label} (${JSON.stringify(projects)})`, () => {
        assertEquals(_tailOf(buildSystemPrompt(projects)), expected);
      });
    }
  });

  /** def が文字列でない不正な辞書値を渡すケース。 */
  describe('When: 異常系', () => {
    const _cases: _TailCase[] = [
      {
        id: 'T-CL-BSP-04-01',
        label: 'def がオブジェクト → `- <name>` のみ ([object Object] を出さない)',
        projects: { app1: { def: { when: ['x'] } }, misc: {} },
        expected: 'Project definitions:\n- app1\n- misc',
      },
    ];

    for (const { id, label, projects, expected } of _cases) {
      it(`[Error] ${id}: ${label} (${JSON.stringify(projects)})`, () => {
        assertEquals(_tailOf(buildSystemPrompt(projects)), expected);
      });
    }
  });

  /** def の欠落・空のルールなど境界の入力を渡すケース。 */
  describe('When: エッジケース', () => {
    const _cases: _TailCase[] = [
      {
        id: 'T-CL-BSP-05-01',
        label: 'def 無し + when 1 件 → 区切り無しの when 行',
        projects: { app1: { rules: { when: ['w1'] } }, misc: {} },
        expected: 'Project definitions:\n- app1\n  when: w1\n- misc',
      },
      {
        id: 'T-CL-BSP-05-02',
        label: 'rules が空オブジェクト → ルール行なし',
        projects: { app1: { def: 'Application 1', rules: {} }, misc: {} },
        expected: 'Project definitions:\n- app1: Application 1\n- misc',
      },
      {
        id: 'T-CL-BSP-05-03',
        label: 'def が空文字列 → def 無しと同じ `- <name>` (末尾空白なし)',
        projects: { app1: { def: '' }, misc: {} },
        expected: 'Project definitions:\n- app1\n- misc',
      },
    ];

    for (const { id, label, projects, expected } of _cases) {
      it(`[Edge] ${id}: ${label} (${JSON.stringify(projects)})`, () => {
        assertEquals(_tailOf(buildSystemPrompt(projects)), expected);
      });
    }

    it('[Edge] T-CL-BSP-05-04: 空の辞書 {} → block 0 個で `Project definitions:` で終わる (末尾改行なし)', () => {
      const _expectedEnding = 'Base your decision on: title, category, topics, tags.\n'
        + 'Match them against the project definitions below. "when" lists conditions for choosing a project; '
        + '"not" lists conditions that exclude it.\n'
        + '\n'
        + 'Project definitions:';

      const _result = buildSystemPrompt({});

      assert(_result.endsWith(_expectedEnding), `末尾が一致しない: ${JSON.stringify(_result.slice(-80))}`);
    });
  });
});

// ─── classifyByAI ─────────────────────────────────────────────────────────────
