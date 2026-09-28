// src: scripts/modules/__tests__/integration/meta-prompt-order.integration.spec.ts
// @(#): meta.yaml の user テンプレートにおけるプレースホルダ出現順序の統合テスト
//       対象: generateFrontmatter（実 .config/chatlog-exporter/prompts を loadPrompts で読み込む）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { generateFrontmatter } from '../../setfm-frontmatter.ts';
// functions
import { loadPrompts } from '../../setfm-assets-loader.ts';

// ─── Helpers
import { useDefaultGlobalConfig } from '../../../../../_cle-libs/__tests__/helpers/global-config-setup.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// types
import type { AiRunnerProvider } from '../../../../../_cle-libs/types/providers.types.ts';
import type { Dics, Prompts } from '../../../types/dics.types.ts';

// ─── Internal Helpers

// constants

/** 実プロンプトディレクトリ（`.config/chatlog-exporter/prompts`）の絶対パス。cwd に依存させないため `import.meta.url` から解決する。 */
const _PROMPTS_DIR = normalizePath(
  new URL('../../../../../../.config/chatlog-exporter/prompts', import.meta.url).pathname,
);

/** `generateFrontmatter` に渡す本文最大文字数。センチネル本文が切り詰められない十分な大きさ。 */
const _MAX_CONTENT_LENGTH = 5000;

/**
 * 各プレースホルダの流し込み先を一意に識別するセンチネル値。
 *
 * `meta.yaml` の地の文（`Log type:` / `topics` / `tags` / `Schema:` 等）と衝突しないよう、
 * テンプレート中に 1 箇所も存在しない `__` + `VALUE` の形を使う。
 */
const _MARK = {
  logType: '__LOG_TYPE_VALUE__',
  logCategory: '__LOG_CATEGORY_VALUE__',
  topicList: '__TOPIC_LIST_VALUE__',
  tagsList: '__TAGS_LIST_VALUE__',
  body: '__BODY_VALUE__',
} as const;

/**
 * 並べ替え前の `meta.yaml` を `_MARK` で描画した user プロンプトの実測値（逐語コピー）。
 *
 * **これは今回の並べ替えを守るための一時的な pin であり、並べ替えが出荷されたあとは削除してよい。**
 *
 * 固定するのは**行の多重集合**（内容の追加・削除・改変が無いこと）だけで、
 * **行の順序は固定しない**（`_sortedLines` でソートして比較するため、正当な並べ替えは緑のまま通る）。
 * 多重度を保った配列で比較するので、重複行（`pick at most ONE` は 2 箇所にある）が
 * 1 本消えた場合も検出できる。
 *
 * `meta.yaml` の `user:` を正当に編集したとき（文言の追加・削除・改変）は、この定数を
 * 新しい描画結果で貼り直す。採取手順は `_renderMetaUserPrompt()` の戻り値をそのまま出力し、
 * その出力を逐語でここへ貼る。生テンプレートを貼ってはならない
 * （TS のテンプレートリテラルが `${log_type}` を補間しようとするため。センチネル置換後の
 * 描画結果には `${` が 1 つも残らないのでエスケープ不要になる）。
 */
const _PRE_REORDER_RENDERED_USER = `Generate metadata for the following engineering log.

Log type: __LOG_TYPE_VALUE__
Log category: __LOG_CATEGORY_VALUE__

General requirements:
- Tags must be chosen only from the provided list based on actual content appearance
- Output YAML only. No code fences, no extra text.
- Do NOT ask questions. Do NOT add explanations. Generate metadata from the log as-is.

## TOPICS ASSIGNMENT RULES

### STRUCTURE
Topics follow a 2-layer structure:
- Layer 1 — domain (1 required): ALWAYS equals the provided Log category. Never infer or change it.
- Layer 2 — aspect (0–2 optional): the angle or mode of the interaction

### WHEN to select an aspect
WHEN  the aspect clearly describes a meaningful angle of the log's content → add it
WHEN  no aspect adds meaningful information → use 0 aspects (domain only is valid)

### WHILE selecting aspects — group constraints apply
WHILE choosing from the thought/intent group (learning / decision / discussion / analysis):
      → pick at most ONE
WHILE choosing from the output/artifact group (architecture / behavior / content):
      → pick at most ONE
WHILE choosing auxiliary aspects (validation / security / testing / configuration / workflow / review / chat):
      → no group restriction; combine freely with others

### NOT allowed
NOT   putting tech keywords (git, yaml, powershell, shell, etc.) in topics — use tags only
NOT   exceeding 3 topics total (domain 1 + aspect 0–2)
NOT   choosing "discussion" for a single isolated turn of judgment — requires sustained main axis
NOT   putting design target type (API/CLI/data) in topics — use tags (dev:api-design, target:cli, etc.)
NOT   choosing "behavior" when correctness was being confirmed — use "validation" instead

### WHERE the boundaries are
WHERE behavior vs validation:
      behavior   = observing or diagnosing how something works or runs
      validation = confirming that something is correct (Lint passed, fix confirmed, test succeeded)
WHERE chat vs discussion:
      chat       = turns repeat the same dimension with no depth change
      discussion = technical judgment or policy review is the SUSTAINED MAIN AXIS throughout
WHERE architecture is used:
      architecture = "design occurred" only. Design target type (API/CLI) belongs in tags.

### Type–aspect alignment (required)
WHEN  type is "decision"  → MUST include "decision" aspect
WHEN  type is "incident"  → MUST include "behavior" or "validation"
WHEN  type is "execution" → MUST include "behavior"

### Available aspects (domain is already fixed — choose aspects only from this list)
- __TOPIC_LIST_VALUE__: topic def


Schema:
title: string
topics:
  - string  # follow the when/not rules above
tags:
  - string  # must be from: __TAGS_LIST_VALUE__

---
__BODY_VALUE__
`;

/**
 * 前方一致プロンプトキャッシュの「安定 prefix」に属する固定部アンカー群（逐語）。
 *
 * 列挙するのは 1 実行のあいだ全エントリで不変な文字列だけ（`meta.yaml` の地の文と、
 * dics から 1 回だけ組み立てられる `${topic_list}` / `${tags_list}`）。
 * `## TOPICS ASSIGNMENT RULES` 配下の規則ブロックが user プロンプトのトークン数の大半を
 * 占めるため、その先頭・中間・末尾の見出し行を拾って**ブロック全体が安定 prefix 側に残る**
 * ことまで押さえる。
 *
 * `_PER_ENTRY_MARKERS` と 2 群に分けるのは、T-06 の不変条件が「センチネル 2 個ずつの前後関係」
 * ではなく **「安定 prefix が、どの per-entry 値よりも前で終わる」** ことだからである。
 * 対ごとの比較は相対順序さえ保たれれば緑になるため、次の 2 つを取り逃がす。
 *
 * - per-entry 値の 1 つ（`${log_category}`）だけが固定部より前へ戻る
 * - 固定部の大半（規則ブロック 41 行）が per-entry 値より後ろへ移る
 *
 * 群の最大位置 < 群の最小位置という形にすると、どちらも「安定 prefix の終端」が
 * per-entry 値を越えた瞬間に落ちる。
 *
 * 各文字列は `.config/chatlog-exporter/prompts/meta.yaml` から逐語で採取する
 * （`WHEN` の後ろが半角スペース 2 個の行があるため、推測で書き換えてはならない）。
 */
const _STABLE_PREFIX_ANCHORS: readonly string[] = [
  '## TOPICS ASSIGNMENT RULES',
  'WHERE architecture is used:',
  'WHEN  type is "execution"',
  _MARK.topicList,
  'Schema:',
  _MARK.tagsList,
];

/**
 * エントリごとに値が変わるプレースホルダのセンチネル群（= 安定 prefix より後ろに来るべきもの）。
 *
 * `${log_type}` / `${log_category}` はエントリの frontmatter 由来、`${body}` は本文由来で、
 * いずれか 1 つでも `_STABLE_PREFIX_ANCHORS` より前に現れた時点で、そこから後ろの
 * プロンプトはエントリごとに別物になりキャッシュが再利用されない。
 * 2 群に分ける理由は `_STABLE_PREFIX_ANCHORS` の JSDoc を参照。
 */
const _PER_ENTRY_MARKERS: readonly string[] = [_MARK.logType, _MARK.logCategory, _MARK.body];

// functions

/**
 * 出現順序検証用の最小 `Dics` を組み立てる。
 *
 * `tags` はセンチネルそのものを持たせ、`topicEntries` は `desc` 空・`rules` 空により
 * `formatDicEntries` が `- __TOPIC_LIST_VALUE__: topic def` の 1 行に畳まれるようにする。
 *
 * @returns `generateFrontmatter` に渡す `Dics`
 */
const _makeDics = (): Dics => ({
  category: '',
  tags: _MARK.tagsList,
  categoryEntries: [],
  typeEntries: [],
  topicEntries: [{ key: _MARK.topicList, def: 'topic def', desc: '', rules: {} }],
});

/**
 * `type` / `category` / 本文にセンチネル値を持つ `ChatlogEntry` を組み立てる。
 *
 * `generateFrontmatter` が読む `frontmatter.get('type')` / `get('category')` /
 * `truncateContent()` の 3 箇所すべてがセンチネル値になる。
 *
 * @returns センチネル値を持つ `ChatlogEntry`
 */
const _makeEntry = (): ChatlogEntry => {
  const entry = new ChatlogEntry(
    ['---', 'type: placeholder', 'category: placeholder', '---', '', _MARK.body].join('\n'),
    { filePath: '/fake/input/meta-prompt-order.md' },
  );
  entry.frontmatter.set('type', _MARK.logType);
  entry.frontmatter.set('category', _MARK.logCategory);
  return entry;
};

/**
 * user プロンプトを捕獲し、パース可能な YAML を返す `AiRunnerProvider` を生成する。
 *
 * 応答の `topics` / `tags` は `buildFrontmatterOutputContract` が値域に使うセンチネル値そのもの。
 * パース不能な応答を返すと `generateFrontmatter` がリトライ後に throw し、assert に到達しない。
 *
 * @param captured - 捕獲した user プロンプトの受け渡し先（呼び出し後に `user` を読む）
 * @returns `generateFrontmatter` の `aiRunnerProvider` として渡す関数
 */
const _makeCapturingRunner = (captured: { user?: string }): AiRunnerProvider => (_system, user) => {
  captured.user = user;
  return Promise.resolve(
    ['title: meta prompt order pin', 'topics:', `  - ${_MARK.topicList}`, 'tags:', `  - ${_MARK.tagsList}`, '']
      .join('\n'),
  );
};

/**
 * 実 `meta.yaml` が読み込めていることを検査する。
 *
 * `loadPrompts` は `meta.yaml` の不在・改名を `{ system: '', user: '' }` へ**無言でデグレード**する。
 * 空テンプレートでは全 `indexOf` が `-1` を返し、順序アサーションが 4 件とも PASS してしまうため、
 * ここで明示的に失敗させる。
 *
 * @param prompts - `loadPrompts` の戻り値
 * @throws テンプレートが未ロード（`meta` キー無し、または `system` / `user` が空）のとき
 */
const _assertMetaTemplateLoaded = (prompts: Prompts): void => {
  const _tmpl = prompts.prompts.get('meta');
  if (_tmpl === undefined || _tmpl.system === '' || _tmpl.user === '') {
    throw new Error(
      `meta プロンプトテンプレートが読み込めていない: ${_PROMPTS_DIR}/meta.yaml`
        + ' — loadPrompts は不在・改名を空テンプレートへ無言でデグレードするため、ここで停止する',
    );
  }
};

/**
 * production の消費経路（`loadPrompts` → `generateFrontmatter` → `aiRunnerProvider`）を通して
 * user プロンプトの描画結果を採取する。
 *
 * `renderPrompt` を直叩きしない理由は、この経路を通すことで `meta.yaml` のロードから
 * `setfm-frontmatter.ts:67-73` の引数組み立て、provider への受け渡しまでを 1 本で覆えるため。
 * `renderPrompt` 単体でも順序は固定できるが、その手前の引数組み立てが
 * プレースホルダ名を取り違えた場合は検出できない。
 *
 * @returns `aiRunnerProvider` が受け取った user プロンプト文字列
 * @throws テンプレート未ロード時、または user プロンプトが provider へ渡されなかったとき
 */
const _renderMetaUserPrompt = async (): Promise<string> => {
  const _prompts = await loadPrompts(_PROMPTS_DIR);
  _assertMetaTemplateLoaded(_prompts);

  const _captured: { user?: string } = {};
  await generateFrontmatter(
    _makeEntry(),
    _MAX_CONTENT_LENGTH,
    _makeDics(),
    _prompts,
    0,
    undefined,
    undefined,
    _makeCapturingRunner(_captured),
  );
  if (_captured.user === undefined) {
    throw new Error('generateFrontmatter が user プロンプトを aiRunnerProvider へ渡していない');
  }
  return _captured.user;
};

/**
 * 描画結果中のセンチネル出現位置を返す。
 *
 * 見つからないときに `-1` を返すと「プレースホルダがテンプレートから消えた」状態でも
 * 順序比較（`-1 < n`）が成立してしまうため、throw して黙った PASS を防ぐ。
 *
 * @param rendered - 描画済み user プロンプト
 * @param marker - `_MARK` のいずれかのセンチネル値
 * @returns `rendered` 中の `marker` の開始インデックス（0 以上）
 * @throws `marker` が `rendered` に存在しないとき
 */
const _positionOf = (rendered: string, marker: string): number => {
  const _index = rendered.indexOf(marker);
  if (_index < 0) {
    throw new Error(
      `センチネル "${marker}" が描画結果に存在しない`
        + ' — 対応するプレースホルダが meta.yaml の user テンプレートから失われている',
    );
  }
  return _index;
};

/**
 * 文字列を行へ分解し、各行を trim・空行除去したうえで昇順ソートした配列を返す。
 *
 * 行の順序を捨てて内容の多重集合だけを比較するためのヘルパー。
 * `Set` を使わないのは、重複行（`meta.yaml` の `pick at most ONE` は 2 箇所にある）が
 * 1 本消えた欠陥を黙って受理してしまうため。多重度を保つ配列で比較する。
 *
 * @param s - 比較対象の文字列
 * @returns trim・空行除去・昇順ソート済みの行配列（重複は保持する）
 */
const _sortedLines = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter((l) => l !== '').sort();

// ─── Tests

/**
 * `meta.yaml` の user テンプレートにおけるプレースホルダ出現順序の統合テストスイート。
 *
 * llama-server の前方一致プロンプトキャッシュを効かせるため、1 実行で固定の
 * `${topic_list}` / `${tags_list}` が、エントリごとに変わる `${log_type}` / `${log_category}` より
 * **前**にあることを固定する。さらに `T-SF-POI-01-04` は、センチネル同士の前後関係ではなく
 * **安定 prefix（地の文 + 固定プレースホルダ）の終端が per-entry 値のどれよりも前にある**
 * ことを群単位で固定する。検証は production の消費経路
 * （`loadPrompts` → `generateFrontmatter` → `aiRunnerProvider`）を通して行い、
 * provider が受け取った user 文字列に対して assert する
 * （`docs/rules/testing-conventions.md`「provider 注入テストは provider に何が渡されたかを検証する」）。
 *
 * テスト ID 範囲: T-SF-POI-01-01 〜 T-SF-POI-01-04, T-SF-POI-02-01
 *
 * @see generateFrontmatter
 * @see loadPrompts
 */
describe('generateFrontmatter — meta プロンプトのプレースホルダ出現順序', () => {
  useDefaultGlobalConfig();

  /** 実 `.config/chatlog-exporter/prompts/meta.yaml` と、全プレースホルダをセンチネル値で埋めた入力を前提とするグループ。 */
  describe('Given: 実 meta.yaml とセンチネル値で埋めた entry / dics', () => {
    /** `loadPrompts` の結果を `generateFrontmatter` に渡し、注入した runner が user プロンプトを受け取るとき。 */
    describe('When: loadPrompts → generateFrontmatter 経由で aiRunnerProvider が user プロンプトを受け取る', () => {
      /** 1 実行で固定の値が、エントリごとに変わる値より前に置かれていることを検証する。 */
      describe('Then: T-SF-POI-01 - 実行ごとに固定のプレースホルダがエントリ固有のものより前に出現する', () => {
        it('[Normal] T-SF-POI-01-01: topic_list が log_type より前に出現する', async () => {
          const u = await _renderMetaUserPrompt();

          assert(_positionOf(u, _MARK.topicList) < _positionOf(u, _MARK.logType));
        });

        it('[Normal] T-SF-POI-01-02: tags_list が log_type より前に出現する', async () => {
          const u = await _renderMetaUserPrompt();

          assert(_positionOf(u, _MARK.tagsList) < _positionOf(u, _MARK.logType));
        });

        it('[Normal] T-SF-POI-01-03: body が log_type / topic_list / tags_list のいずれより後に出現する', async () => {
          const u = await _renderMetaUserPrompt();
          const bodyIdx = _positionOf(u, _MARK.body);

          assert(
            _positionOf(u, _MARK.logType) < bodyIdx
              && _positionOf(u, _MARK.topicList) < bodyIdx
              && _positionOf(u, _MARK.tagsList) < bodyIdx,
          );
        });

        it('[Normal] T-SF-POI-01-04: 固定部アンカーの最後尾が per-entry 3 値のどれよりも前に出現する', async () => {
          const u = await _renderMetaUserPrompt();
          const anchorPositions = _STABLE_PREFIX_ANCHORS.map((anchor) => _positionOf(u, anchor));
          const perEntryPositions = _PER_ENTRY_MARKERS.map((marker) => _positionOf(u, marker));

          assert(Math.max(...anchorPositions) < Math.min(...perEntryPositions));
        });
      });

      /** 並べ替えが行の追加・削除・改変を伴っていないことを検証する。 */
      describe('Then: T-SF-POI-02 - 並べ替えの前後で行の多重集合が一致する', () => {
        it('[Edge] T-SF-POI-02-01: 並べ替え前の描画結果と行の多重集合が一致する', async () => {
          const u = await _renderMetaUserPrompt();

          assertEquals(_sortedLines(u), _sortedLines(_PRE_REORDER_RENDERED_USER));
        });
      });
    });
  });
});
