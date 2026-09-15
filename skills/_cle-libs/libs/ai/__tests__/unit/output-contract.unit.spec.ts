// src: skills/_cle-libs/libs/ai/__tests__/unit/output-contract.unit.spec.ts
// @(#): on-wire contract validation / 契約別復元関数 ユニットテスト
//       対象: parseContractPayload / validateOutputContract / restoreContractText
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseContractPayload, restoreContractText, validateOutputContract } from '../../output-contract.ts';

// ─── Shared libraries
// classes
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
// libs
import { extractYaml } from '../../../text/frontmatter-utils.ts';
import { parseAiJsonArray } from '../../../text/json-utils.ts';

// ─── Helpers
// types
import type { OutputContract } from '../../../../types/json-schema.types.ts';

// constants

/** `projects.dic` のプロジェクト名相当の値域。フォールバック値 `misc` を値域の一部として含む。 */
const _PROJECT_VALUES = ['chatlog-exporter', 'misc'];

/**
 * structured-output 仕様 §4.3.1 #1（`phase-classify-ai.ts`）の契約定義。
 *
 * 契約タグは `json-array`。要素キーは `file` / `project` / `confidence` / `reason` の 4 つで、
 * envelope 名 `items` は契約タグ側が定めるため契約定義には現れない。
 * `project` は envelope 要素 object の中の **単一値** enum であり、R-003 によりフォールバック値
 * `misc` を値域の一部として持つ。
 */
const _CONTRACT_CLASSIFY: OutputContract = {
  contract: 'json-array',
  properties: {
    file: { type: 'string' },
    project: { type: 'string', values: _PROJECT_VALUES, fallback: 'misc' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
};

/** §4.3.1 #1 に適合する envelope 要素 1 件。復元後の配列要素と等値比較する。 */
const _CLASSIFY_ITEM = { file: 'a.md', project: 'chatlog-exporter', confidence: 0.9, reason: 'r' };

/**
 * structured-output 仕様 §4.3.1 #3（`segment-ai.ts`）の契約定義。
 *
 * 契約タグは `json-array`。envelope 要素は `filePath` と、入れ子 object の配列 `segments` を持つ。
 * `segments` 要素は `title` / `summary` / `startLine` / `endLine` の 4 キーすべてが required で、
 * 境界の 2 キーは `integer`（`number` ではない）である。
 */
const _CONTRACT_SEGMENT: OutputContract = {
  contract: 'json-array',
  properties: {
    filePath: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
        },
      },
    },
  },
};

/** `dics/topics.dic` 相当の値域。配列要素 enum のためフォールバック値を持たない。 */
const _TOPIC_VALUES = ['development', 'tooling', 'ai'];

/** `dics/tags.dic` 相当の値域。配列要素 enum のためフォールバック値を持たない。 */
const _TAG_VALUES = ['ai/claude', 'ai/codex'];

/**
 * structured-output 仕様 §4.3.1 #4（`setfm-frontmatter.ts`）の契約定義。
 *
 * 契約タグは `yaml`。required keys は `title` / `topics` / `tags` の 3 つで、
 * `topics` / `tags` の要素は `OutputEnumItemFieldSpec`（`values` のみ）である。
 */
const _CONTRACT_FRONTMATTER: OutputContract = {
  contract: 'yaml',
  firstField: 'title',
  properties: {
    title: { type: 'string' },
    topics: { type: 'array', items: { type: 'string', values: _TOPIC_VALUES } },
    tags: { type: 'array', items: { type: 'string', values: _TAG_VALUES } },
  },
};

/** §4.3.1 #4 に適合する応答ペイロード。root object がそのまま YAML 化される。 */
const _FRONTMATTER_PAYLOAD = { title: 'T-09 の設計', topics: ['development'], tags: ['ai/claude'] };

/** `dics/types.dic` 相当の値域。単一値 enum のためフォールバック値 `research` を値域の一部として含む。 */
const _TYPE_VALUES = ['execution', 'incident', 'discussion', 'research', 'writing'];

/** `dics/category.dic` 相当の値域。単一値 enum のためフォールバック値 `development` を値域の一部として含む。 */
const _CATEGORY_VALUES = ['development', 'infrastructure', 'tooling', 'ai', 'writing'];

/**
 * structured-output 仕様 §4.3.1 #5（`setfm-review.ts`）の契約定義。
 *
 * 契約タグは `yaml`。required keys は `validity` / `errors` / `corrected_frontmatter` の 3 つで、
 * 型表が定めるのは順に string（単一値 enum）/ string の配列 / object である。
 * `corrected_frontmatter` の内部キーも §4.3.1 の型表どおりに定義する。
 *
 * `corrected_frontmatter` の `type` / `category` は #6 と同じ辞書であり（§4.3.1 #5 の値域欄）、
 * 入れ子であっても単一値 enum のため R-003 のフォールバック値を値域の一部として持つ。
 * `topics` / `tags` は #4 と同じく **配列要素** の語彙制約であり、要素は `fallback` を持たない。
 */
const _CONTRACT_REVIEW: OutputContract = {
  contract: 'yaml',
  firstField: 'validity',
  properties: {
    validity: { type: 'string', values: ['pass', 'fail'], fallback: 'pass' },
    errors: { type: 'array', items: { type: 'string' } },
    corrected_frontmatter: {
      type: 'object',
      properties: {
        type: { type: 'string', values: _TYPE_VALUES, fallback: 'research' },
        category: { type: 'string', values: _CATEGORY_VALUES, fallback: 'development' },
        title: { type: 'string' },
        topics: { type: 'array', items: { type: 'string', values: _TOPIC_VALUES } },
        tags: { type: 'array', items: { type: 'string', values: _TAG_VALUES } },
      },
    },
  },
};

/**
 * structured-output 仕様 §4.3.1 #6（`setfm-type-category.ts`）の契約定義。
 *
 * 契約タグは `line-prefixed`。required keys は `type` / `category` の 2 つで、
 * いずれも単一値 enum のため R-003 によりフォールバック値を値域の一部として持つ。
 */
const _CONTRACT_TYPE_CATEGORY: OutputContract = {
  contract: 'line-prefixed',
  properties: {
    type: { type: 'string', values: _TYPE_VALUES, fallback: 'research' },
    category: { type: 'string', values: _CATEGORY_VALUES, fallback: 'development' },
  },
};

/** boolean 型の直下キー `flag` だけを持つ line-prefixed 契約定義。§4.3.1 の契約に boolean が無いため型分岐の検証用に置く。 */
const _CONTRACT_BOOLEAN: OutputContract = {
  contract: 'line-prefixed',
  properties: { flag: { type: 'boolean' } },
};

/** §4.3.1 #6 に適合する応答ペイロード。契約定義のキー順に行へ展開される。 */
const _TYPE_CATEGORY_PAYLOAD = { type: 'execution', category: 'tooling' };

/** §4.3.1 #6 に適合する別の応答ペイロード。復元値が辞書値として解決できることの確認に使う。 */
const _TYPE_CATEGORY_DICT_PAYLOAD = { type: 'discussion', category: 'ai' };

/**
 * 契約定義から enum の値域を取り出す。`OutputFieldSpec` は union のため `values` の有無で絞り込む。
 * 値域はモジュールスコープの辞書定数ではなく契約定義から読む（§4.3.1「辞書由来 enum の扱い」）。
 */
const _valuesOf = (contract: OutputContract, key: string): string[] | undefined => {
  const _spec = contract.properties[key];
  return _spec && 'values' in _spec ? _spec.values : undefined;
};

/**
 * 入れ子 object のプロパティが持つ enum の値域を取り出す（§4.3.1 #5 の `corrected_frontmatter`）。
 * 値域は辞書定数ではなく契約定義から読む（§4.3.1「辞書由来 enum の扱い」）。
 */
const _nestedValuesOf = (contract: OutputContract, parentKey: string, childKey: string): string[] | undefined => {
  const _parent = contract.properties[parentKey];
  if (_parent?.type !== 'object') { return undefined; }
  const _child = _parent.properties[childKey];
  return _child && 'values' in _child ? _child.values : undefined;
};

/**
 * 配列プロパティの要素が持つ enum の値域を取り出す（§4.3.1「配列値の enum」）。
 * 要素は `OutputItemFieldSpec` であり、単一値 enum と異なり `fallback` を持たない。
 */
const _itemValuesOf = (contract: OutputContract, key: string): string[] | undefined => {
  const _spec = contract.properties[key];
  if (_spec?.type !== 'array') { return undefined; }
  return 'values' in _spec.items ? _spec.items.values : undefined;
};

/** 契約定義が宣言するプロパティの型を取り出す。フィクスチャが非 string 型を含むことの表明に使う。 */
const _typeOf = (contract: OutputContract, key: string): string | undefined => contract.properties[key]?.type;

/**
 * 復元テキストから `<キー>: ` の行頭前方一致で値を切り出す（§4.3.1 #6 の呼び出し元と同じ方式）。
 * 切り出した値は加工しない。区切りの空白 1 つは復元形式側の取り決めであり値には含めない。
 */
const _extractLineValue = (restored: string, key: string): string | undefined => {
  const _prefix = `${key}: `;
  return restored.split('\n').find((line) => line.startsWith(_prefix))?.slice(_prefix.length);
};

/**
 * 実行して投げられた例外を返す。何も投げなければ `undefined`。
 * 「違反を投げないこと」を失敗メッセージ付きで表明するために使う。
 */
const _captureThrown = (run: () => void): Error | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error as Error;
  }
};

// ─── Test suite

describe('Given: envelope フィールド `items` を持つ適合 JSON 応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-01 - json-array 契約の応答を復元する', () => {
      it('[Normal] T-LIB-AI-OCV-01-01: `items` の値が `parseAiJsonArray` で解釈できる JSON 配列文字列へ復元される', () => {
        const _payload = { items: [_CLASSIFY_ITEM] };

        validateOutputContract(_CONTRACT_CLASSIFY, _payload);
        const _restored = restoreContractText(_CONTRACT_CLASSIFY, _payload);

        // envelope が展開され、復元テキスト自体がトップレベル JSON 配列であること
        assertEquals(JSON.parse(_restored), [_CLASSIFY_ITEM]);
        // 呼び出し元の既存パーサがそのまま解釈できること
        assertEquals(parseAiJsonArray(_restored), [_CLASSIFY_ITEM]);
      });
    });
  });
});

describe('Given: §4.3.1 #4 の required keys をすべて備えた適合 yaml 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-02 - yaml 契約の応答を復元する', () => {
      it('[Normal] T-LIB-AI-OCV-02-01: root object が `extractYaml` で解釈できる YAML テキストへ復元される', () => {
        validateOutputContract(_CONTRACT_FRONTMATTER, _FRONTMATTER_PAYLOAD);
        const _restored = restoreContractText(_CONTRACT_FRONTMATTER, _FRONTMATTER_PAYLOAD);

        // `extractYaml` は JSON も解釈できるため、YAML ブロック表記であること自体を固定する
        const _lines = _restored.split('\n');
        assertEquals(_lines[0].startsWith('title:'), true);
        assertEquals(_lines.some((line) => /^\s*-\s+development$/.test(line)), true);

        // 呼び出し元の既存パーサがそのまま解釈でき、root object の全キーが復元されること
        const _extracted = extractYaml(_restored, 'title');
        assertEquals(_extracted.ok, true);
        assertEquals(_extracted.ok ? _extracted.value : undefined, _FRONTMATTER_PAYLOAD);
      });
    });
  });
});

describe('Given: §4.3.1 #6 の required keys をすべて備えた適合 line-prefixed 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-03 - line-prefixed 契約の応答を復元する', () => {
      it('[Normal] T-LIB-AI-OCV-03-01: `<キー>: <値>` を 1 行ずつ並べたテキストへ復元される', () => {
        validateOutputContract(_CONTRACT_TYPE_CATEGORY, _TYPE_CATEGORY_PAYLOAD);
        const _restored = restoreContractText(_CONTRACT_TYPE_CATEGORY, _TYPE_CATEGORY_PAYLOAD);

        // 契約定義のキー順・区切り文字・末尾の改行なしまで含めて復元テキスト自体を固定する
        assertEquals(_restored, 'type: execution\ncategory: tooling');

        // 呼び出し元の行頭前方一致で拾えること（余分な行が混ざらないことを行数で固定）
        const _lines = _restored.split('\n');
        assertEquals(_lines.length, 2);
        assertEquals(_lines[0].startsWith('type: '), true);
        assertEquals(_lines[1].startsWith('category: '), true);
      });
    });

    describe('Then: Task T-09-04 - line-prefixed 復元結果から type/category が解決できる', () => {
      it('[Normal] T-LIB-AI-OCV-04-01: 行頭前方一致で抽出した値が加工されず契約定義の `values` に含まれる', () => {
        validateOutputContract(_CONTRACT_TYPE_CATEGORY, _TYPE_CATEGORY_DICT_PAYLOAD);
        const _restored = restoreContractText(_CONTRACT_TYPE_CATEGORY, _TYPE_CATEGORY_DICT_PAYLOAD);

        const _cases: [key: string, expected: string][] = [
          ['type', _TYPE_CATEGORY_DICT_PAYLOAD.type],
          ['category', _TYPE_CATEGORY_DICT_PAYLOAD.category],
        ];

        _cases.forEach(([key, expected]) => {
          const _extracted = _extractLineValue(_restored, key);

          // 引用符・余分な空白・大文字化のいずれも加えず、応答の値をそのまま載せること
          assertEquals(_extracted, expected, `${key} の値が加工されている`);

          // 呼び出し元は小文字化してから値域と照合する。抽出値が契約定義の values へ解決できること
          const _resolved = _extracted?.trim().toLowerCase();
          const _values = _valuesOf(_CONTRACT_TYPE_CATEGORY, key);
          assertEquals(_values?.includes(_resolved ?? ''), true, `${key} の値が辞書値として解決できない`);
        });
      });
    });
  });
});

describe('Given: §4.3.1 #1 の envelope 要素内 enum が契約定義の許容値を持つ JSON 応答', () => {
  describe('When: on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-05 - enum フィールドが許容値のとき検証を通過する', () => {
      it('[Normal] T-LIB-AI-OCV-05-01: 契約定義の `values` に含まれる enum 値では違反を投げない', () => {
        const _payload = { items: [{ file: 'b.md', project: 'chatlog-exporter', confidence: 0.5, reason: 'ok' }] };

        // 許容値は辞書定数ではなく契約定義から読む（§4.3.1「辞書由来 enum の扱い」）
        const _values = _valuesOf(_CONTRACT_CLASSIFY, 'project');
        assertEquals(_values?.includes(_payload.items[0].project), true, 'fixture の enum 値が値域外');

        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_CLASSIFY, _payload));

        assertEquals(_thrown, undefined, `許容値で違反が投げられた: ${_thrown?.message}`);
      });
    });
  });
});

describe('Given: root が object だが envelope フィールド `items` が欠落または配列でない JSON 応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-06 - json-array 契約で envelope が不適合なら違反とする', () => {
      const _cases: [label: string, payload: Record<string, unknown>][] = [
        ['`items` が欠落', { summary: 'classified 3 files' }],
        ['`items` が配列でない', { items: { file: 'a.md' } }],
      ];

      _cases.forEach(([label, payload]) => {
        it(`[Error] T-LIB-AI-OCV-06-01: ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_CLASSIFY, payload), ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: `items` は配列だが `segments` 要素の必須キーが欠落・型不一致の JSON 応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-06 - json-array 契約で入れ子 object が不適合なら違反とする', () => {
      const _cases: [label: string, payload: Record<string, unknown>][] = [
        ['`segments` 要素が `{}`', { items: [{ filePath: 'a.md', segments: [{}] }] }],
        [
          '`startLine` / `endLine` が integer でない',
          { items: [{ filePath: 'a.md', segments: [{ title: 't', summary: 's', startLine: '1', endLine: '9' }] }] },
        ],
      ];

      _cases.forEach(([label, payload]) => {
        it(`[Error] T-LIB-AI-OCV-06-02: ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_SEGMENT, payload), ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: §4.3.1 #4 の required keys の一部が欠落した yaml 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-07 - yaml 契約で必須キーが欠落していれば違反とする', () => {
      it('[Error] T-LIB-AI-OCV-07-01: `tags` 欠落 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        // required keys は契約定義が唯一の入力。`tags` だけを落とした応答を組む
        const { tags: _omitted, ..._payload } = _FRONTMATTER_PAYLOAD;
        assertEquals(
          Object.hasOwn(_CONTRACT_FRONTMATTER.properties, 'tags'),
          true,
          'fixture が `tags` を要求していない',
        );

        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_FRONTMATTER, _payload), ChatlogError);

        // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: §4.3.1 #6 の required keys の一部が欠落した line-prefixed 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-08 - line-prefixed 契約で必須キーが欠落していれば違反とする', () => {
      it('[Error] T-LIB-AI-OCV-08-01: `category` 欠落 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        // required keys は契約定義が唯一の入力。`category` だけを落とした応答を組む
        const { category: _omitted, ..._payload } = _TYPE_CATEGORY_PAYLOAD;
        assertEquals(
          Object.hasOwn(_CONTRACT_TYPE_CATEGORY.properties, 'category'),
          true,
          'fixture が `category` を要求していない',
        );

        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_TYPE_CATEGORY, _payload), ChatlogError);

        // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: §4.3.1 #6 の enum フィールドが契約定義の値域外の値を持つ line-prefixed 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-09 - enum フィールドの値が値域外なら違反とする', () => {
      it('[Error] T-LIB-AI-OCV-09-01: `type` が値域外 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        // 値域は辞書定数ではなく契約定義から読む（§4.3.1「辞書由来 enum の扱い」）。
        // `fallback` は `values` の一部（R-003）のため、所属判定は 1 つで足りる
        const _payload = { type: 'brainstorm', category: 'development' };
        assertEquals(
          _valuesOf(_CONTRACT_TYPE_CATEGORY, 'type')?.includes(_payload.type),
          false,
          'fixture の enum 値が値域内になっている',
        );

        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_TYPE_CATEGORY, _payload), ChatlogError);

        // 続行側の分類であること。中断側の `ResponseFormatIgnored` としてはならない（DR-16 決定 3 の撤回）
        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        assertNotEquals(_thrown.subindex, 'ResponseFormatIgnored');
      });
    });
  });
});

describe('Given: 契約が要求しない未知の追加フィールドを含むが必須キー・型・enum は適合する line-prefixed 契約応答', () => {
  describe('When: エッジケース - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-10 - フル JSON Schema validation は行わず最小構造検証に留める', () => {
      it('[Edge] T-LIB-AI-OCV-10-01: 契約定義に無いキーが混ざっていても違反を投げない', () => {
        // 送信スキーマ側の `additionalProperties: false` は json_schema 構築の責務であり、
        // 受信側検証はこれを再現しない（§2.4 Non-Goal / DR-19 Non-Goal / DR-26 決定 2）
        const _payload = { ..._TYPE_CATEGORY_PAYLOAD, confidence: 0.8 };
        assertEquals(
          Object.hasOwn(_CONTRACT_TYPE_CATEGORY.properties, 'confidence'),
          false,
          'fixture が `confidence` を要求しており未知フィールドになっていない',
        );

        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_TYPE_CATEGORY, _payload));

        assertEquals(_thrown, undefined, `未知フィールドを理由に違反が投げられた: ${_thrown?.message}`);
      });
    });
  });
});

describe('Given: 必須キーすべてが §4.3.1 の型表どおりの値を持つ yaml 契約応答', () => {
  describe('When: on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-11 - yaml 契約の値の許容型は §4.3.1 の型表に従って判定する', () => {
      // 許容型は「すべて文字列」ではなく §4.3.1 の型表（string / string の配列 / object）である（v2.1.0）
      const _cases: [label: string, contract: OutputContract, payload: Record<string, unknown>][] = [
        [
          '#4 title=string / topics・tags=string の配列',
          _CONTRACT_FRONTMATTER,
          { title: '設計メモ', topics: ['development', 'tooling'], tags: ['ai/claude'] },
        ],
        [
          '#5 validity=string / errors=string の配列 / corrected_frontmatter=object',
          _CONTRACT_REVIEW,
          {
            validity: 'pass',
            errors: [],
            corrected_frontmatter: { type: 'research', category: 'development', title: 't', topics: [], tags: [] },
          },
        ],
      ];

      _cases.forEach(([label, contract, payload]) => {
        it(`[Normal] T-LIB-AI-OCV-11-01: ${label} では違反を投げない`, () => {
          // フィクスチャが実際に非スカラー型を宣言していること（文字列型のみの検証では落ちる形であること）
          const _nonScalarTypes = Object.keys(contract.properties)
            .map((key) => _typeOf(contract, key))
            .filter((type) => type === 'array' || type === 'object');
          assertNotEquals(_nonScalarTypes.length, 0, 'fixture が配列値・object 値を含んでいない');

          const _thrown = _captureThrown(() => validateOutputContract(contract, payload));

          assertEquals(_thrown, undefined, `型表どおりの値で違反が投げられた: ${_thrown?.message}`);
        });
      });

      it('[Normal] T-LIB-AI-OCV-11-02: boolean 型のキーに boolean 値 (true) では違反を投げない', () => {
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_BOOLEAN, { flag: true }));

        assertEquals(_thrown, undefined, `boolean 値で違反が投げられた: ${_thrown?.message}`);
      });
    });
  });
});

describe('Given: `response_format` が無視され、JSON として parse できるが契約に適合しない 2xx 応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-12 - 既存パース経路へ暗黙にフォールバックせず違反として扱う', () => {
      // JSON として parse できない 2xx は本タスクの射程外（Commit 15 の `BackendUnavailable` / DR-26 決定 2）
      const _cases: [label: string, payload: unknown][] = [
        ['契約に無いキーへ自然文を載せた object', { answer: 'このログは開発作業の記録に見えます。' }],
        ['root が object でない（JSON 文字列の自然文）', 'このログは開発作業の記録に見えます。'],
      ];

      _cases.forEach(([label, payload]) => {
        it(`[Error] T-LIB-AI-OCV-12-01: ${label} → ChatlogError で中断し文字列を返さない`, () => {
          // 検証から復元までを 1 経路として実行する。救済的な部分パースの戻り値が無いことを観測する
          let _returned: string | undefined;
          const _thrown = assertThrows(() => {
            validateOutputContract(_CONTRACT_TYPE_CATEGORY, payload);
            _returned = restoreContractText(_CONTRACT_TYPE_CATEGORY, payload);
          }, ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
          // 既存パース経路へのフォールバックが起きていないこと
          assertEquals(_returned, undefined, `契約不適合にもかかわらず文字列が返った: ${_returned}`);
        });
      });

      // json-array 契約では root の object 判定が envelope の取り出し側にあるため、検証関数を直接呼んで固定する
      it('[Error] T-LIB-AI-OCV-12-02: json-array 契約で root が object でない → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_CLASSIFY, 'text'), ChatlogError);

        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: 単一値 enum が §4.3.1 のフォールバック値だけを持つ line-prefixed 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-13 - フォールバック値を特別扱いせず `values` 所属判定だけで通過させる', () => {
      it('[Edge] T-LIB-AI-OCV-13-01: フォールバック値のみの応答が違反にならずそのまま復元される', () => {
        const _payload = { type: 'research', category: 'development' };

        // 前提: 各値が契約定義の `fallback` であり、かつ R-003 により `values` の一部であること
        const _guards: [key: string, value: string][] = [
          ['type', _payload.type],
          ['category', _payload.category],
        ];
        _guards.forEach(([key, value]) => {
          const _spec = _CONTRACT_TYPE_CATEGORY.properties[key];
          assertEquals(
            _spec && 'values' in _spec ? _spec.fallback : undefined,
            value,
            `${key} がフォールバック値でない`,
          );
          assertEquals(_valuesOf(_CONTRACT_TYPE_CATEGORY, key)?.includes(value), true, `${key} が values に含まれない`);
        });

        // フォールバック値を値域外として弾かないこと（フォールバック用の第 2 分岐を持たない）
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_TYPE_CATEGORY, _payload));
        assertEquals(_thrown, undefined, `フォールバック値のみの応答が違反とされた: ${_thrown?.message}`);

        // 「該当なし」を表す値が加工・除去されず、そのまま呼び出し元へ渡ること
        const _restored = restoreContractText(_CONTRACT_TYPE_CATEGORY, _payload);
        assertEquals(_restored, 'type: research\ncategory: development');
      });
    });
  });
});

describe('Given: 配列要素 enum の `topics` / `tags` が空配列である適合 yaml 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-13 - 配列要素 enum の「該当なし」は空配列で表す', () => {
      it('[Edge] T-LIB-AI-OCV-13-02: 空配列が違反にならず空配列のまま復元される', () => {
        const _payload = { title: '雑談ログ', topics: [], tags: [] };

        // 前提: `topics` / `tags` が配列要素 enum（`values` を持ち `fallback` を持たない）であること
        (['topics', 'tags'] as const).forEach((key) => {
          const _spec = _CONTRACT_FRONTMATTER.properties[key];
          const _items = _spec?.type === 'array' ? _spec.items : undefined;
          assertEquals(_items !== undefined && 'values' in _items, true, `${key} の要素が enum でない`);
          assertEquals(_items !== undefined && 'fallback' in _items, false, `${key} の要素が fallback を持つ`);
        });

        // R-002 により数量制約を置かないため、空配列は判定対象 0 件として常に通過する
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_FRONTMATTER, _payload));
        assertEquals(_thrown, undefined, `空配列の応答が違反とされた: ${_thrown?.message}`);

        // 空配列が欠落・null・空文字へ畳まれず、呼び出し元の既存パーサへ空配列のまま渡ること
        const _restored = restoreContractText(_CONTRACT_FRONTMATTER, _payload);
        const _extracted = extractYaml(_restored, 'title');
        assertEquals(_extracted.ok, true);
        const _parsed = _extracted.ok ? _extracted.value as Record<string, unknown> : {};
        assertEquals(_parsed, _payload);
        (['topics', 'tags'] as const).forEach((key) => {
          assertEquals(Array.isArray(_parsed[key]), true, `${key} が配列として復元されていない`);
          assertEquals((_parsed[key] as unknown[]).length, 0, `${key} が空配列でない`);
        });
      });
    });
  });
});

describe('Given: 単一値 enum フィールドの値が文字列でない line-prefixed 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-14 - enum フィールドの値が非文字列でも値域検査を素通りさせない', () => {
      // 非文字列を素通りさせると復元結果が `type: [object Object]` になり、呼び出し元の行頭前方一致は
      // 一致するのに値が解決できず、既定値が全ファイルへ書き込まれる（DR-19 Alternatives が禁じた失敗）
      const _cases: [label: string, payload: Record<string, unknown>][] = [
        ['`type` が object', { type: { a: 1 }, category: 'development' }],
        ['`type` が null', { type: null, category: 'development' }],
      ];

      _cases.forEach(([label, payload]) => {
        it(`[Error] T-LIB-AI-OCV-14-01: ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          // 前提: `type` が契約定義上 enum であり、required key として存在していること
          assertNotEquals(_valuesOf(_CONTRACT_TYPE_CATEGORY, 'type'), undefined, 'fixture の `type` が enum でない');
          assertEquals(Object.hasOwn(payload, 'type'), true, 'payload に `type` が無く欠落検査で落ちる');

          const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_TYPE_CATEGORY, payload), ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: 契約直下キーの値の型が契約定義と異なる yaml / line-prefixed 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-15 - 直下キーのスカラー値の型を §4.1 の型表に従って検査する', () => {
      // §4.1 の `yaml` 行「各値が同表の型である」/ `line-prefixed` 行「各値が文字列である」
      const _cases: [label: string, contract: OutputContract, payload: Record<string, unknown>][] = [
        ['#4 `title` が string でなく number', _CONTRACT_FRONTMATTER, { title: 42, topics: [], tags: [] }],
        ['#6 `type` が string でなく number', _CONTRACT_TYPE_CATEGORY, { type: 42, category: 'development' }],
      ];

      _cases.forEach(([label, contract, payload]) => {
        it(`[Error] T-LIB-AI-OCV-15-01: ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          // 前提: 欠落・入れ子不適合など他の理由で落ちないこと（型違反だけが唯一の欠陥であること）
          const _requiredKeys = Object.keys(contract.properties);
          assertEquals(
            _requiredKeys.every((key) => Object.hasOwn(payload, key)),
            true,
            'payload に required key の欠落がある',
          );

          const _thrown = assertThrows(() => validateOutputContract(contract, payload), ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });

      // boolean / array / object の型不一致（スカラー以外の分岐も含む）
      const _typeMismatchCases: [id: string, label: string, contract: OutputContract, payload: unknown][] = [
        ['T-LIB-AI-OCV-15-02', '`flag` が boolean でなく string', _CONTRACT_BOOLEAN, { flag: 'x' }],
        ['T-LIB-AI-OCV-15-03', '#4 `topics` が配列でなく string', _CONTRACT_FRONTMATTER, {
          title: 't',
          topics: 'x',
          tags: [],
        }],
        [
          'T-LIB-AI-OCV-15-04',
          '#5 `corrected_frontmatter` が object でなく string',
          _CONTRACT_REVIEW,
          { validity: 'pass', errors: [], corrected_frontmatter: 'x' },
        ],
      ];

      _typeMismatchCases.forEach(([id, label, contract, payload]) => {
        it(`[Error] ${id}: ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(() => validateOutputContract(contract, payload), ChatlogError);

          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: 配列要素 enum の `topics` が契約定義の値域外の要素を含む yaml 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-16 - 配列要素 enum の値域外を違反とする', () => {
      it('[Error] T-LIB-AI-OCV-16-01: `topics` に値域外の要素 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        // §4.1 の「enum を含む場合」行は深さを限定しない。§4.3.1 #4 は `topics` / `tags` の値域を
        // 「いずれも配列要素の値域」と明記している
        const _payload = { title: 't', topics: ['bogus'], tags: [] };

        // 前提: `topics` が配列であり（型検査ではなく語彙検査で落ちること）、要素が値域外であること
        assertEquals(Array.isArray(_payload.topics), true, 'payload の `topics` が配列でない');
        assertEquals(
          _itemValuesOf(_CONTRACT_FRONTMATTER, 'topics')?.includes(_payload.topics[0]),
          false,
          'fixture の要素が値域内になっている',
        );

        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_FRONTMATTER, _payload), ChatlogError);

        // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: 入れ子 object 内の単一値 enum が契約定義の値域外の値を持つ yaml 契約応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-17 - 入れ子 object の単一値 enum も値域検査の対象とする', () => {
      it('[Error] T-LIB-AI-OCV-17-01: `corrected_frontmatter.type` が値域外 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        // §4.3.1 #5 は `corrected_frontmatter` の `type` / `category` を #6 と同じ辞書と定める
        const _payload = {
          validity: 'pass',
          errors: [],
          corrected_frontmatter: { type: 'brainstorm', category: 'development', title: 't', topics: [], tags: [] },
        };

        // 前提: 入れ子キーは全件そろっており（欠落検査で落ちないこと）、`type` だけが値域外であること
        const _values = _nestedValuesOf(_CONTRACT_REVIEW, 'corrected_frontmatter', 'type');
        assertNotEquals(_values, undefined, 'fixture の `corrected_frontmatter.type` が enum でない');
        assertEquals(_values?.includes(_payload.corrected_frontmatter.type), false, 'fixture の値が値域内になっている');
        assertEquals(
          _nestedValuesOf(_CONTRACT_REVIEW, 'corrected_frontmatter', 'category')
            ?.includes(_payload.corrected_frontmatter.category),
          true,
          '`category` が値域外で、違反の原因が `type` に絞れていない',
        );

        const _thrown = assertThrows(() => validateOutputContract(_CONTRACT_REVIEW, _payload), ChatlogError);

        // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: 起点キーが先頭でないキー順の適合 yaml 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-18 - 復元テキストは起点キーから読んでも required keys を落とさない', () => {
      // 呼び出し元は `extractYaml(_raw, <起点キー>)` で起点キーから読み始める（§4.3.1「復元の起点」）。
      // 仕様はモデルの応答キー順を保証しないため、起点キーより前のキーは検証を通過したあとに
      // 黙って落ちうる。「検証は通るのに復元で欠ける」形であり、DR-09 / DR-19 Alternatives が
      // 退けた「黙って劣化する」失敗にあたる。
      it('[Edge] T-LIB-AI-OCV-18-01: #4 で `title` が先頭でなくても `title` / `topics` / `tags` が復元される', () => {
        // `_FRONTMATTER_PAYLOAD` は `title` が先頭であり本欠陥を踏まないため、キー順だけを変えた応答を組む
        const _payload = { topics: ['development'], title: '設計メモ', tags: ['ai/claude'] };
        assertNotEquals(Object.keys(_payload)[0], 'title', 'fixture の起点キーが先頭になっている');

        // 検証は通過すること（欠陥は検証ではなく復元側にある）
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_FRONTMATTER, _payload));
        assertEquals(_thrown, undefined, `適合応答が違反とされた: ${_thrown?.message}`);

        const _restored = restoreContractText(_CONTRACT_FRONTMATTER, _payload);
        const _extracted = extractYaml(_restored, 'title');
        assertEquals(_extracted.ok, true, `extractYaml が失敗した: ${_extracted.ok ? '' : _extracted.error.message}`);

        const _parsed = _extracted.ok ? _extracted.value : {};
        assertEquals(_parsed, _payload, `復元後に欠落したキーがある: ${JSON.stringify(Object.keys(_parsed))}`);
      });

      it('[Edge] T-LIB-AI-OCV-18-02: #5 で `validity` が先頭でなくても 3 キーすべてが復元される', () => {
        const _payload = {
          errors: [],
          corrected_frontmatter: { type: 'research', category: 'development', title: 't', topics: [], tags: [] },
          validity: 'pass',
        };
        assertNotEquals(Object.keys(_payload)[0], 'validity', 'fixture の起点キーが先頭になっている');

        // 検証は通過すること（欠陥は検証ではなく復元側にある）
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_REVIEW, _payload));
        assertEquals(_thrown, undefined, `適合応答が違反とされた: ${_thrown?.message}`);

        const _restored = restoreContractText(_CONTRACT_REVIEW, _payload);
        const _extracted = extractYaml(_restored, 'validity');
        assertEquals(_extracted.ok, true, `extractYaml が失敗した: ${_extracted.ok ? '' : _extracted.error.message}`);

        const _parsed = _extracted.ok ? _extracted.value : {};
        assertEquals(_parsed, _payload, `復元後に欠落したキーがある: ${JSON.stringify(Object.keys(_parsed))}`);
      });

      // 18-01 / 18-02 は **ペイロード側** のキー順しか入れ替えていないため、契約定義の記述順に
      // 依存する欠落は踏まない。起点キーは §4.3.1 の「復元の起点」列（`firstField`）が定めるもので
      // あり、契約定義の記述順ではない。依存先が応答のキー順から記述順へ移っただけでは、
      // 「検証は通るのに復元で欠ける」欠陥クラスは消えていない。
      it('[Edge] T-LIB-AI-OCV-18-03: 契約定義の記述順で起点キーが先頭でなくても 3 キーすべてが復元される', () => {
        // §4.3.1 #4 と同じ契約を、`title` を先頭に書かない記述順で組む
        const _contract: OutputContract = {
          contract: 'yaml',
          firstField: 'title',
          properties: {
            topics: { type: 'array', items: { type: 'string', values: _TOPIC_VALUES } },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string', values: _TAG_VALUES } },
          },
        };
        assertNotEquals(
          Object.keys(_contract.properties)[0],
          _contract.firstField,
          'fixture の記述順で起点キーが先頭になっている',
        );

        const _payload = { title: '設計メモ', topics: ['development'], tags: ['ai/claude'] };

        // 検証は通過すること（欠陥は検証ではなく復元側にある）
        const _thrown = _captureThrown(() => validateOutputContract(_contract, _payload));
        assertEquals(_thrown, undefined, `適合応答が違反とされた: ${_thrown?.message}`);

        const _restored = restoreContractText(_contract, _payload);
        const _extracted = extractYaml(_restored, 'title');
        assertEquals(_extracted.ok, true, `extractYaml が失敗した: ${_extracted.ok ? '' : _extracted.error.message}`);

        const _parsed = _extracted.ok ? _extracted.value : {};
        assertEquals(_parsed, _payload, `復元後に欠落したキーがある: ${JSON.stringify(Object.keys(_parsed))}`);
      });
    });
  });
});

describe('Given: 契約定義に無いトップレベルキーを含む適合 yaml 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-19 - yaml 契約の復元は応答のキーを落とさない', () => {
      // §4.3 の復元先表は `yaml` を「root object を YAML としてシリアライズしたテキスト」と
      // 定めるのみで、キーの削除を授権していない。キー集合の完全一致を要求しているのは
      // `line-prefixed` の行だけである（T-09-03 / T-09-04 が固定済みであり、本規則はそちらへ及ばない）。
      it('[Edge] T-LIB-AI-OCV-19-01: 契約定義に無いトップレベルキーが復元結果に残る', () => {
        const _payload = { ..._FRONTMATTER_PAYLOAD, note: '契約定義に無いキー' };
        assertEquals(
          Object.hasOwn(_CONTRACT_FRONTMATTER.properties, 'note'),
          false,
          'fixture の追加キーが契約定義にある',
        );

        // 検証は通過すること（契約定義に無いキーは判定に影響させない / T-09-10）
        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_FRONTMATTER, _payload));
        assertEquals(_thrown, undefined, `適合応答が違反とされた: ${_thrown?.message}`);

        const _restored = restoreContractText(_CONTRACT_FRONTMATTER, _payload);
        const _extracted = extractYaml(_restored, 'title');
        assertEquals(_extracted.ok, true, `extractYaml が失敗した: ${_extracted.ok ? '' : _extracted.error.message}`);

        const _parsed = _extracted.ok ? _extracted.value : {};
        assertEquals(_parsed, _payload, `復元後に欠落したキーがある: ${JSON.stringify(Object.keys(_parsed))}`);
      });
    });
  });
});

describe('Given: 入れ子 object 内に契約定義に無いキーを含む適合 yaml 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-19 - 追加キーの扱いはあらゆる深さで同じである', () => {
      // 19-01 と対で、全深度へ同じ規則が適用されることを固定する。
      // 現行実装はトップレベルの追加キーだけを落とし、入れ子の追加キーは保持するという非対称を持つため、
      // 本テスト単体は修正前でも通過しうる（RED 未確認）。非対称が解消されたあとも
      // 入れ子側が退行しないことを担保するのが役割であり、削除してはならない。
      it('[Edge] T-LIB-AI-OCV-19-02: `corrected_frontmatter` 内の契約定義に無いキーが復元結果に残る', () => {
        const _payload = {
          validity: 'pass',
          errors: [],
          corrected_frontmatter: {
            type: 'research',
            category: 'development',
            title: 't',
            topics: [],
            tags: [],
            note: '契約定義に無いキー',
          },
        };
        const _nested = _CONTRACT_REVIEW.properties['corrected_frontmatter'];
        assertEquals(
          _nested.type === 'object' && Object.hasOwn(_nested.properties, 'note'),
          false,
          'fixture の追加キーが契約定義にある',
        );

        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_REVIEW, _payload));
        assertEquals(_thrown, undefined, `適合応答が違反とされた: ${_thrown?.message}`);

        const _restored = restoreContractText(_CONTRACT_REVIEW, _payload);
        const _extracted = extractYaml(_restored, 'validity');
        assertEquals(_extracted.ok, true, `extractYaml が失敗した: ${_extracted.ok ? '' : _extracted.error.message}`);

        const _parsed = _extracted.ok ? _extracted.value : {};
        assertEquals(_parsed, _payload, `復元後に欠落したキーがある: ${JSON.stringify(_parsed)}`);
      });
    });
  });
});

describe('Given: object でない応答ペイロード', () => {
  describe('When: 異常系 - 復元関数を直接呼ぶ', () => {
    describe('Then: Task T-09-20 - 復元関数も続行側の分類で違反を投げる', () => {
      // 復元関数はペイロードを `Record<string, unknown>` とみなして添字アクセスするため、
      // `null` では素の `TypeError` になる。文字列・数値・配列では添字アクセス自体は通り、
      // 値が `undefined` のまま後段のシリアライズへ渡る。いずれも続行側の
      // `ResponseSchemaViolation` 分類（DR-16）を迂回する。
      // 契約タグごとに見るのは、`json-array` / `line-prefixed` では `undefined` が例外にならず
      // 黙って壊れたテキスト（`"title: undefined"` 等）を返しうるためである。yaml だけを固定すると
      // ガードが switch の 1 ケースに閉じてしまう。
      const _cases: [label: string, contract: OutputContract, payload: unknown][] = [
        ['null', _CONTRACT_FRONTMATTER, null],
        ['文字列', _CONTRACT_FRONTMATTER, 'text'],
        ['数値', _CONTRACT_FRONTMATTER, 42],
        ['配列', _CONTRACT_FRONTMATTER, []],
        ['文字列（line-prefixed 契約）', _CONTRACT_TYPE_CATEGORY, 'text'],
      ];

      _cases.forEach(([label, contract, payload]) => {
        it(`[Error] T-LIB-AI-OCV-20-01: ペイロードが ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(() => restoreContractText(contract, payload), ChatlogError);

          // 続行側の分類であること。`ResponseFormatIgnored`（中断側）としてはならない（DR-16）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: 起点キーが契約定義の `properties` に無い yaml 契約定義と、それ自体は適合する応答', () => {
  describe('When: 異常系 - on-wire contract validation を呼ぶ', () => {
    describe('Then: Task T-09-21 - 起点キーが契約定義のキーに含まれないとき違反とする', () => {
      // `firstField ∈ keys(properties)` は §4.3.1「復元の起点」が前提とする不変条件だが、
      // 型は `firstField` の**不在**しか防がず**誤り**を防がない。破れたとき復元は
      // `_yamlOrdered` のフィルタが何にも一致せず、起点キーより前に置かれた required keys が
      // `extractYaml(text, <起点キー>)` で黙って落ちる。検証を通過した後に落ちるという点で
      // T-LIB-AI-OCV-12-01 / 20-01 が塞いだものと同じクラスであり、検証側で止める。
      //
      // 分類は続行側の `AiError` / `ResponseSchemaViolation` とする。DR-18 決定 1 が
      // 「llama 経路が throw する `ChatlogError` の kind は一律 `AiError` とし、呼び出し元の
      // 最後の分岐（非 `AiError` → フォールバック値）へ落ちる経路を作らない」と定めており、
      // `validateOutputContract` は R-008 の応答ごとの検証として llama 経路の**中**にある。
      // `InvalidArgs` は `isAbortingAiError`（`abort-utils.ts`）にも `isFatalAiError`
      // （`rate-limit-utils.ts`）にも該当しない — いずれも `kind === 'AiError'` を要求するため、
      // DR-18 が DR-12 を supersede した当の述語ギャップ（設定ミスがフォールバック値の
      // 一括書き込みとして現れる）をここで再現してしまう。
      //
      // 応答は `_FRONTMATTER_PAYLOAD` をそのまま使う。キー欠落や値域外を混ぜると
      // 別の理由で通ってしまい、起点キーの不変条件を検査したことにならない。
      const _cases: [label: string, contract: OutputContract][] = [
        ['契約定義のキーの綴り誤り', { ..._CONTRACT_FRONTMATTER, firstField: 'ttile' }],
      ];

      _cases.forEach(([label, contract]) => {
        it(`[Error] T-LIB-AI-OCV-21-01: 起点キーが ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(
            () => validateOutputContract(contract, _FRONTMATTER_PAYLOAD),
            ChatlogError,
          );

          // 続行側の分類であること（DR-18 決定 1）
          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });

      // 上のケースは「ただ存在しないキー」であり、所属判定を `in` 演算子で
      // 書いても通る。`'toString' in properties` は `Object.prototype` を辿って真になるため、
      // 誤った起点キーが検証をすり抜けて §4.3.1 の沈黙経路へ落ちる。
      // 実装が `Object.keys(...).includes(...)` を使っていることをこのケースで固定する。
      it('[Error] T-LIB-AI-OCV-21-03: 起点キーが `Object.prototype` 由来のキー → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        const _contract: OutputContract = { ..._CONTRACT_FRONTMATTER, firstField: 'toString' };
        assertEquals(
          Object.hasOwn(_CONTRACT_FRONTMATTER.properties, 'toString'),
          false,
          'fixture の契約定義が `toString` を持っている',
        );

        const _thrown = assertThrows(
          () => validateOutputContract(_contract, _FRONTMATTER_PAYLOAD),
          ChatlogError,
        );

        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });

  describe('When: 異常系 - 復元関数を直接呼ぶ', () => {
    describe('Then: Task T-09-22 - yaml の起点キーが誤っているとき沈黙して返さない', () => {
      // `_orderedEntries` は `line-prefixed` の欠落キーを塞いだのに、`yaml` の `_yamlOrdered` は
      // 起点キーが契約定義のキーに無くてもフィルタが空振りするだけで何も投げない。結果として
      // 呼び出し元の `extractYaml(text, <起点キー>)` が起点キーを見つけられず、
      // 起点キーより前に置かれた required keys が検証通過後に黙って落ちる
      // （DR-19 Alternatives が禁じた失敗と同じクラス）。
      // `_orderedEntries` の JSDoc 自身が「同じ沈黙経路が同じ関数に残る以上ここで塞ぐ」と述べており、
      // 同じ関数に同じクラスの沈黙経路を残すのは一貫しない。
      //
      // 分類は続行側（DR-18 決定 1 / DR-16）。復元関数を**直接**呼ぶことで、
      // `validateOutputContract` を通したときに巻き添えで止まるのではなく、
      // 復元関数自身がガードを持つことを固定する。
      const _cases: [label: string, firstField: string][] = [
        ['契約定義のキーの綴り誤り', 'ttile'],
        ['`Object.prototype` 由来のキー', 'toString'],
      ];

      _cases.forEach(([label, firstField]) => {
        it(`[Error] T-LIB-AI-OCV-22-01: 起点キーが ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _contract: OutputContract = { ..._CONTRACT_FRONTMATTER, firstField };

          const _thrown = assertThrows(
            () => restoreContractText(_contract, _FRONTMATTER_PAYLOAD),
            ChatlogError,
          );

          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: 契約定義のキーの一部を欠いた line-prefixed 契約応答', () => {
  describe('When: 異常系 - 復元関数を直接呼ぶ', () => {
    describe('Then: Task T-09-21 - 契約定義のキーが応答に無いとき壊れたテキストを返さない', () => {
      // `_orderedEntries` は契約定義のキーを応答から引くだけで、欠落を見ない。結果として
      // `category: undefined` を含む行が呼び出し元の行頭前方一致に一致してしまい、
      // 値が解決できないまま既定値が書き込まれる（DR-19 Alternatives が禁じた失敗）。
      // 復元関数は検証通過済みの応答を前提とするが、同じ沈黙経路が同じ関数に残っている以上、
      // 続行側の分類（DR-16）で投げて止める。
      const _cases: [label: string, payload: Record<string, unknown>][] = [
        ['後続キー `category` を欠く', { type: 'execution' }],
        ['先頭キー `type` を欠く', { category: 'tooling' }],
        ['契約定義のキーを 1 件も持たない', { note: 'x' }],
      ];

      _cases.forEach(([label, payload]) => {
        it(`[Error] T-LIB-AI-OCV-21-02: 応答が ${label} → ChatlogError(AiError / ResponseSchemaViolation)`, () => {
          const _thrown = assertThrows(
            () => restoreContractText(_CONTRACT_TYPE_CATEGORY, payload),
            ChatlogError,
          );

          assertEquals(_thrown.kind, 'AiError');
          assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
        });
      });
    });
  });
});

describe('Given: envelope フィールド `items` が空配列である適合 json-array 契約応答', () => {
  describe('When: on-wire contract validation を通過し復元関数を呼ぶ', () => {
    describe('Then: Task T-09-23 - json-array 契約の「該当なし」は空 envelope で表す', () => {
      // 仕様 §5 Edge Cases「サーバが `response_format` を受理し、モデルが空配列を出力する →
      // R-004 によりパース成功、空配列として返す」（REQ-F-013）。
      // T-LIB-AI-OCV-13-02 が固定しているのは **配列要素 enum** の空配列（`topics` / `tags`）であり、
      // **envelope 側** の空配列ではない。R-002 により envelope に数量制約を置かないため、
      // 検証対象 0 件は違反とせず、復元テキストはトップレベルの空 JSON 配列となる。
      it('[Edge] T-LIB-AI-OCV-23-01: 空 envelope が違反にならず空配列として復元される', () => {
        const _payload = { items: [] };

        // 前提: 契約タグが `json-array` であり、envelope 要素の契約定義が空でないこと
        assertEquals(_CONTRACT_CLASSIFY.contract, 'json-array');
        assertNotEquals(Object.keys(_CONTRACT_CLASSIFY.properties).length, 0);

        const _thrown = _captureThrown(() => validateOutputContract(_CONTRACT_CLASSIFY, _payload));
        assertEquals(_thrown, undefined, `空 envelope の応答が違反とされた: ${_thrown?.message}`);

        // envelope が展開され、復元テキスト自体がトップレベルの空 JSON 配列であること
        const _restored = restoreContractText(_CONTRACT_CLASSIFY, _payload);
        assertEquals(_restored, '[]');
        assertEquals(JSON.parse(_restored), []);
        // 呼び出し元の既存パーサが空配列として解釈できること（パース失敗の `null` ではない）
        assertEquals(parseAiJsonArray(_restored), []);
      });
    });
  });
});

describe('Given: 契約定義は適合するが応答側が起点キーを欠く yaml 契約応答', () => {
  describe('When: 異常系 - 復元関数を直接呼ぶ', () => {
    describe('Then: Task T-09-23 - yaml の起点キーが応答に無いとき沈黙して返さない', () => {
      // `_yamlOrdered` は **契約定義側** の起点キー（`_assertFirstField`）しか見ず、
      // **応答側** に起点キーが無い場合を見ない。フィルタが空振りするだけで何も投げないため、
      // 呼び出し元の `extractYaml(text, <起点キー>)` が起点を見つけられず required keys を落とす。
      // 兄弟である `_orderedEntries`（`line-prefixed` 専用 / T-LIB-AI-OCV-21-02）は
      // 応答側の欠落キーを塞いでおり、同じ関数内で防御の有無が割れているのは一貫しない。
      // 分類は続行側（DR-18 決定 1 / DR-16）。
      it('[Error] T-LIB-AI-OCV-23-02: 応答が起点キーを欠く → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        const _payload = { topics: [], tags: ['ai/claude'] };

        // 前提: 起点キーは契約定義のキーであり（契約定義側は適合）、応答にだけ存在しないこと
        assertEquals(Object.hasOwn(_CONTRACT_FRONTMATTER.properties, _CONTRACT_FRONTMATTER.firstField), true);
        assertEquals(Object.hasOwn(_payload, _CONTRACT_FRONTMATTER.firstField), false);

        const _thrown = assertThrows(
          () => restoreContractText(_CONTRACT_FRONTMATTER, _payload),
          ChatlogError,
        );

        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});

describe('Given: assistant 応答本文のテキスト', () => {
  describe('When: 正常系 - 応答本文を JSON として parse する', () => {
    describe('Then: Task T-15-10 - JSON として parse できる本文はペイロードを返す', () => {
      it('[Normal] T-LIB-AI-OCV-24-01: 有効な JSON 本文 → parse 済みペイロードを返す', () => {
        const _payload = parseContractPayload('{"items":[{"type":"research","tags":["ai/claude"]}]}');

        assertEquals(_payload, { items: [{ type: 'research', tags: ['ai/claude'] }] });
      });
    });
  });

  describe('When: 異常系 - JSON として parse できない本文を渡す', () => {
    describe('Then: Task T-15-10 - parse できない本文は続行側の契約違反として投げる', () => {
      // `SyntaxError` を漏らさず続行側の分類へ寄せる（DR-18 決定 1: llama 経路の kind は一律 `AiError`）
      it('[Error] T-LIB-AI-OCV-24-02: 不正な JSON 本文 → ChatlogError(AiError / ResponseSchemaViolation)', () => {
        const _thrown = assertThrows(
          () => parseContractPayload('type: research'),
          ChatlogError,
        );

        assertEquals(_thrown.kind, 'AiError');
        assertEquals(_thrown.subindex, 'ResponseSchemaViolation');
      });
    });
  });
});
