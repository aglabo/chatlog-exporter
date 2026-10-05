// src: scripts/modules/__tests__/integration/prompt-cache-split.integration.spec.ts
// @(#): meta.yaml / review.yaml の固定部が system、可変値が user に分かれていることの統合テスト
//       対象: generateFrontmatter, reviewFrontmatter（実 .config/chatlog-exporter/prompts を loadPrompts で読み込む）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { generateFrontmatter } from '../../setfm-frontmatter.ts';
import { reviewFrontmatter } from '../../setfm-review.ts';
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
 * `meta.yaml` / `review.yaml` の地の文（`Log type:` / `topics` / `tags` / `Schema:` 等）と衝突しないよう、
 * テンプレート中に 1 箇所も存在しない `__` + `VALUE` の形を使う。
 */
const _MARK = {
  logType: '__LOG_TYPE_VALUE__',
  logCategory: '__LOG_CATEGORY_VALUE__',
  topicList: '__TOPIC_LIST_VALUE__',
  tagsList: '__TAGS_LIST_VALUE__',
  body: '__BODY_VALUE__',
  typeDics: '__TYPE_DICS_VALUE__',
  categoryList: '__CATEGORY_LIST_VALUE__',
  resultType: '__RESULT_TYPE_VALUE__',
  resultCategory: '__RESULT_CATEGORY_VALUE__',
  resultYaml: '__RESULT_YAML_VALUE__',
} as const;

/**
 * `meta.yaml` の固定部アンカー群（逐語）。1 実行のあいだ全エントリで不変な文字列だけを並べる。
 *
 * llama-server の prefix キャッシュは system メッセージ単位でしか再利用されない（DR-36）。
 * よって「固定部が system に在り user に無い」ことが再利用の必要十分条件であり、
 * user 内での位置関係は不変条件ではない。
 *
 * **このアンカー群が押さえるのは「代表行が system から消えていないこと」だけである。**
 * `## TOPICS ASSIGNMENT RULES` 配下のブロック全体を覆うわけではなく、
 * アンカーとアンカーの間の行は素通しになる（実測: 連続 5 行窓を user へ移す 54 通りのうち
 * 33 通りがこの検査を通り抜けた）。ブロック内部の行が user 側へ戻る退行は
 * `_META_EXPECTED_USER` との完全一致（`T-SF-PCI-01-02`）が受け持つ。
 *
 * 各文字列は `.config/chatlog-exporter/prompts/meta.yaml` から逐語で採取する
 * （`WHEN` の後ろが半角スペース 2 個の行があるため、推測で書き換えてはならない）。
 * `## TOPICS ASSIGNMENT RULES` は `STRIP_TEMPLATE_MARKER` がバイト単位で一致を見る行でもある。
 */
const _META_FIXED_ANCHORS: readonly string[] = [
  '## TOPICS ASSIGNMENT RULES',
  'WHERE architecture is used:',
  'WHEN  type is "execution"',
  _MARK.topicList,
  'Schema:',
  _MARK.tagsList,
];

/**
 * `meta.yaml` のエントリごとに値が変わるプレースホルダのセンチネル群。
 *
 * `${log_type}` / `${log_category}` はエントリの frontmatter 由来、`${body}` は本文由来。
 * 1 つでも system に混ざると system prompt がエントリごとに別物になり、
 * prefix キャッシュの再利用が完全に消える（DR-36）。
 */
const _META_PER_ENTRY_MARKERS: readonly string[] = [_MARK.logType, _MARK.logCategory, _MARK.body];

/**
 * `meta` の user プロンプトの期待描画結果（完全一致で固定する）。
 *
 * 役割分離後の user はセンチネル値と数行の地の文だけで構成され決定的になった。
 * よって固定部が 1 行でも user 側へ戻れば、この比較が必ず落ちる
 * （アンカーの `includes` では内部行の移動を素通しする）。
 *
 * テンプレートリテラルは `${log_type}` 等を補間してしまうため、**文字列連結で組み立てる。**
 * 内容は `.config/chatlog-exporter/prompts/meta.yaml` の逐語コピーではなく、
 * 実際に provider が受け取った描画結果から採取したものである。
 */
const _META_EXPECTED_USER: string = [
  'Generate metadata for the following engineering log.',
  '',
  'Log type: ' + _MARK.logType,
  'Log category: ' + _MARK.logCategory,
  '',
  '---',
  _MARK.body,
  '',
].join('\n');

/**
 * `meta` プロンプト全体（system + user）での各マーカーの期待出現回数。
 *
 * 全マーカーがちょうど 1 回。役割の移動で「両方の role に重複して現れる」ことも
 * 「どちらからも落ちている」ことも、この 1 本で検出する。
 */
const _META_EXPECTED_COUNTS: readonly _MarkerCount[] = [..._META_FIXED_ANCHORS, ..._META_PER_ENTRY_MARKERS]
  .map((marker) => ({ marker, count: 1 }));

/**
 * `review.yaml` の固定部アンカー群（逐語）。1 実行のあいだ全エントリで不変な文字列だけを並べる。
 *
 * 4 つの RULE セクション（旧 18-89 行）が review プロンプトのほぼ全量であり、
 * その先頭 `## RULE 0 — type` と末尾側 `## RULE 3 — tags`、および辞書由来の 4 値と
 * `Output schema:` を拾う。
 *
 * **押さえるのは「代表行が system から消えていないこと」だけである。**
 * RULE 1 / RULE 2 の見出しはアンカーに入っておらず、アンカー間の行も素通しになる
 * （実測: 連続 5 行窓を user へ移す 69 通りのうち 43 通りがこの検査を通り抜けた）。
 * ブロック内部の行が user 側へ戻る退行は
 * `_REVIEW_EXPECTED_USER` との完全一致（`T-SF-RCI-01-02`）が受け持つ。
 *
 * 見出しの区切りは U+2014（em dash）であり、`.config/chatlog-exporter/prompts/review.yaml`
 * から逐語で採取する。ハイフンや U+2013 に書き換えてはならない。
 */
const _REVIEW_FIXED_ANCHORS: readonly string[] = [
  '## RULE 0 — type',
  '## RULE 3 — tags',
  _MARK.typeDics,
  _MARK.categoryList,
  _MARK.topicList,
  _MARK.tagsList,
  'Output schema:',
];

/**
 * `review.yaml` のエントリごとに値が変わるプレースホルダのセンチネル群。
 *
 * 3 つとも entry の frontmatter 由来（`${result_yaml}` は `title` / `topics` / `tags` の YAML 本文 + 閉じ区切り）。
 * 1 つでも system に混ざると system prompt がエントリごとに別物になり、
 * prefix キャッシュの再利用が完全に消える（DR-36）。
 */
const _REVIEW_PER_ENTRY_MARKERS: readonly string[] = [_MARK.resultType, _MARK.resultCategory, _MARK.resultYaml];

/**
 * `review` の user プロンプトの期待描画結果（完全一致で固定する）。
 *
 * 1 行目 `Review the following frontmatter against the rules above:` は
 * `CONDITIONAL_FILENAME_PATTERNS`（`skills/filter-chatlogs/scripts/constants/patterns/filename.constants.ts`）が
 * `^\d{4}-\d{2}-\d{2}-review-the-following-frontmatter-against` で前方一致を見る行であり、
 * **user の 1 行目から動かしてはならない。**
 *
 * `type:` / `category:` はテンプレートの明示行だけが出力し、各 1 回しか現れない。
 * その後ろの `title:` 行と閉じ区切り `---` は `${result_yaml}` 由来で、`result_yaml` は
 * `title` / `topics` / `tags` の YAML 本文と閉じ区切りだけを運ぶ（開き `---` は持たない）。
 * そのため user 全体が `---` で始まり `---` で閉じる 1 ブロックになる（cle-kju.3.3.6.1.1）。
 * 本エントリは `topics` / `tags` を持たないため、それらの行は現れない。
 *
 * `_META_EXPECTED_USER` と同じく、テンプレートの逐語コピーではなく実際の描画結果から採取し、
 * `${...}` の補間を避けるため文字列連結で組み立てる。
 */
const _REVIEW_EXPECTED_USER: string = [
  'Review the following frontmatter against the rules above:',
  '',
  '---',
  'type: ' + _MARK.resultType,
  'category: ' + _MARK.resultCategory,
  'title: "' + _MARK.resultYaml + '"',
  '---',
  '',
].join('\n');

/**
 * `review` プロンプト全体（system + user）での各マーカーの期待出現回数。
 *
 * 全マーカーがちょうど 1 回。`${result_type}` / `${result_category}` は明示行
 * `type: ${result_type}` / `category: ${result_category}` にだけ現れ、`${result_yaml}` は
 * `title` / `topics` / `tags` だけを運ぶため type / category を再度含まない（cle-kju.3.3.6.1.1）。
 * 期待値を表として持つことで、「両 role への重複」「result_yaml 経由の再出現」「どちらからも欠落」を
 * ズレとして検出する。
 */
const _REVIEW_EXPECTED_COUNTS: readonly _MarkerCount[] = [
  ..._REVIEW_FIXED_ANCHORS.map((marker) => ({ marker, count: 1 })),
  { marker: _MARK.resultType, count: 1 },
  { marker: _MARK.resultCategory, count: 1 },
  { marker: _MARK.resultYaml, count: 1 },
];

// types

/**
 * `aiRunnerProvider` が受け取った 2 つのプロンプト文字列。
 *
 * `system` / `user` の両方を捕獲するのが本スイートの要点で、片方だけでは
 * 「固定部が user から消えて system にも入っていない」欠落を検出できない。
 */
interface _Captured {
  /** provider が受け取った system プロンプト。 */
  system: string;
  /** provider が受け取った user プロンプト。 */
  user: string;
}

/** マーカー 1 つの出現回数。`system` + `user` を連結した文字列に対して数える。 */
interface _MarkerCount {
  /** 数える対象の文字列（固定部アンカーまたは可変値センチネル）。 */
  marker: string;
  /** 期待または実測の出現回数。 */
  count: number;
}

// functions

/**
 * `meta` テンプレート検証用の最小 `Dics` を組み立てる。
 *
 * `tags` はセンチネルそのものを持たせ、`topicEntries` は `desc` 空・`rules` 空により
 * `formatDicEntries` が `- __TOPIC_LIST_VALUE__: topic def` の 1 行に畳まれるようにする。
 *
 * @returns `generateFrontmatter` に渡す `Dics`
 */
const _makeMetaDics = (): Dics => ({
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
const _makeMetaEntry = (): ChatlogEntry => {
  const entry = new ChatlogEntry(
    ['---', 'type: placeholder', 'category: placeholder', '---', '', _MARK.body].join('\n'),
    { filePath: '/fake/input/prompt-cache-split-meta.md' },
  );
  entry.frontmatter.set('type', _MARK.logType);
  entry.frontmatter.set('category', _MARK.logCategory);
  return entry;
};

/**
 * system / user プロンプトを捕獲し、指定の応答を返す `AiRunnerProvider` を生成する。
 *
 * パース不能な応答を返すと呼び出し元がリトライ後に throw し、assert に到達しない。
 *
 * @param captured - 捕獲したプロンプトの受け渡し先（呼び出し後に `system` / `user` を読む）
 * @param response - provider が返す AI 応答文字列
 * @returns `aiRunnerProvider` として渡す関数
 */
const _makeCapturingRunner = (
  captured: Partial<_Captured>,
  response: string,
): AiRunnerProvider =>
(system, user) => {
  captured.system = system;
  captured.user = user;
  return Promise.resolve(response);
};

/**
 * 実テンプレートが読み込めていることを検査する。
 *
 * `loadPrompts` はファイルの不在・改名を `{ system: '', user: '' }` へ**無言でデグレード**する。
 * 空テンプレートでは全ての `includes` が `false` を返し、役割分離のアサーションが
 * 軒並み PASS してしまうため、ここで明示的に失敗させる。
 *
 * @param prompts - `loadPrompts` の戻り値
 * @param name - テンプレート名（`meta` / `review`）
 * @throws テンプレートが未ロード（キー無し、または `system` / `user` が空）のとき
 */
const _assertTemplateLoaded = (prompts: Prompts, name: string): void => {
  const _tmpl = prompts.prompts.get(name);
  if (_tmpl === undefined || _tmpl.system === '' || _tmpl.user === '') {
    throw new Error(
      `${name} プロンプトテンプレートが読み込めていない: ${_PROMPTS_DIR}/${name}.yaml`
        + ' — loadPrompts は不在・改名を空テンプレートへ無言でデグレードするため、ここで停止する',
    );
  }
};

/**
 * 捕獲結果が揃っていることを検査して `_Captured` へ確定させる。
 *
 * provider が呼ばれなかった場合に `undefined` のまま比較すると、
 * 「プロンプトが渡されていない」状態でアサーションが通りうるため throw する。
 *
 * @param captured - 捕獲用オブジェクト
 * @param caller - 呼び出した production 関数名（エラーメッセージ用）
 * @returns system / user が確定した捕獲結果
 * @throws provider が system / user を受け取っていないとき
 */
const _assertCaptured = (captured: Partial<_Captured>, caller: string): _Captured => {
  if (captured.system === undefined || captured.user === undefined) {
    throw new Error(`${caller} が system / user プロンプトを aiRunnerProvider へ渡していない`);
  }
  return { system: captured.system, user: captured.user };
};

/**
 * production の消費経路（`loadPrompts` → `generateFrontmatter` → `aiRunnerProvider`）を通して
 * `meta` の system / user プロンプトの描画結果を採取する。
 *
 * `renderPrompt` を直叩きしない理由は、この経路を通すことで `meta.yaml` のロードから
 * `setfm-frontmatter.ts` の引数組み立て、provider への受け渡しまでを 1 本で覆えるため。
 * `renderPrompt` 単体では role ごとの変数マップの取り違えを検出できない。
 *
 * @returns provider が受け取った system / user プロンプト
 * @throws テンプレート未ロード時、またはプロンプトが provider へ渡されなかったとき
 */
const _captureMetaPrompts = async (): Promise<_Captured> => {
  const _prompts = await loadPrompts(_PROMPTS_DIR);
  _assertTemplateLoaded(_prompts, 'meta');

  const _captured: Partial<_Captured> = {};
  const _response = [
    'title: prompt cache split',
    'topics:',
    `  - ${_MARK.topicList}`,
    'tags:',
    `  - ${_MARK.tagsList}`,
    '',
  ].join('\n');
  await generateFrontmatter(
    _makeMetaEntry(),
    _MAX_CONTENT_LENGTH,
    _makeMetaDics(),
    _prompts,
    0,
    undefined,
    undefined,
    _makeCapturingRunner(_captured, _response),
  );
  return _assertCaptured(_captured, 'generateFrontmatter');
};

/**
 * `review` テンプレート検証用の最小 `Dics` を組み立てる。
 *
 * `category` / `tags` はセンチネルそのものを持たせ、`typeEntries` / `topicEntries` は
 * `desc` 空・`rules` 空により `formatDicEntries` / `formatDicEntriesShort` が
 * `- <センチネル>: <def>` の 1 行に畳まれるようにする。
 *
 * @returns `reviewFrontmatter` に渡す `Dics`
 */
const _makeReviewDics = (): Dics => ({
  category: _MARK.categoryList,
  tags: _MARK.tagsList,
  categoryEntries: [],
  typeEntries: [{ key: _MARK.typeDics, def: 'type def', desc: '', rules: {} }],
  topicEntries: [{ key: _MARK.topicList, def: 'topic def', desc: '', rules: {} }],
});

/**
 * `type` / `category` / `title` にセンチネル値を持つ `ChatlogEntry` を組み立てる。
 *
 * `reviewFrontmatter` が読む `frontmatter.get('type')` / `get('category')` /
 * `result_yaml`（`title` / `topics` / `tags`）の 3 箇所すべてがセンチネル値を含む。
 * `title` をセンチネルにするのは、`${result_yaml}` の流し込み先を
 * `${result_type}` / `${result_category}` と区別して識別するため。
 *
 * @returns センチネル値を持つ `ChatlogEntry`
 */
const _makeReviewEntry = (): ChatlogEntry => {
  const entry = new ChatlogEntry(
    ['---', 'type: placeholder', 'category: placeholder', '---', '', 'review body'].join('\n'),
    { filePath: '/fake/input/prompt-cache-split-review.md' },
  );
  entry.frontmatter.set('type', _MARK.resultType);
  entry.frontmatter.set('category', _MARK.resultCategory);
  entry.frontmatter.set('title', _MARK.resultYaml);
  return entry;
};

/**
 * production の消費経路（`loadPrompts` → `reviewFrontmatter` → `aiRunnerProvider`）を通して
 * `review` の system / user プロンプトの描画結果を採取する。
 *
 * `reviewFrontmatter` は `maxContentLength` 引数を持たない（本文ではなく frontmatter を渡す）。
 *
 * @returns provider が受け取った system / user プロンプト
 * @throws テンプレート未ロード時、またはプロンプトが provider へ渡されなかったとき
 */
const _captureReviewPrompts = async (): Promise<_Captured> => {
  const _prompts = await loadPrompts(_PROMPTS_DIR);
  _assertTemplateLoaded(_prompts, 'review');

  const _captured: Partial<_Captured> = {};
  await reviewFrontmatter(
    _makeReviewEntry(),
    _makeReviewDics(),
    _prompts,
    0,
    undefined,
    undefined,
    _makeCapturingRunner(_captured, ['validity: pass', 'errors: []', ''].join('\n')),
  );
  return _assertCaptured(_captured, 'reviewFrontmatter');
};

/**
 * 固定部アンカーがすべて system プロンプトに含まれることを検査する。
 *
 * 役割は**ブロックの丸ごとの消失を拾うこと**に限られる（アンカー間の行は見ない）。
 * 「user へ戻った」退行の検出は `_assertUserEquals` が受け持つ。
 *
 * 欠けたアンカーの一覧を空配列と比較するため、失敗時にどの行が system から
 * 落ちたかがそのまま出力される。
 *
 * @param captured - 捕獲した system / user プロンプト
 * @param anchors - 固定部アンカー群
 */
const _assertAnchorsInSystem = (captured: _Captured, anchors: readonly string[]): void => {
  const _missing = anchors.filter((anchor) => !captured.system.includes(anchor));

  assertEquals(_missing, [], `固定部アンカーが system プロンプトに存在しない: ${JSON.stringify(_missing)}`);
};

/**
 * user プロンプトが期待描画結果と完全に一致することを検査する。
 *
 * **キャッシュ特性を固定する唯一のアサーション。** user に固定部が残っていると、
 * その分は毎ファイル再処理される（prefix キャッシュは system 単位、DR-36）。
 * アンカー不在の `includes` 検査ではアンカー間の内部行が素通しになるため
 * （実測で meta 54 窓中 33 窓・review 69 窓中 43 窓の role 移動が検出できなかった）、
 * user 全体の完全一致で固定する。固定部が 1 行でも user へ戻れば必ず落ちる。
 *
 * system 側の行多重集合は**意図的に固定しない。** system から行が消えてもキャッシュ
 * 再利用は損なわれず、正当な文言編集のたびに落ちる脆いアサーションになるため。
 *
 * @param captured - 捕獲した system / user プロンプト
 * @param expectedUser - user プロンプトの期待描画結果
 */
const _assertUserEquals = (captured: _Captured, expectedUser: string): void => {
  assertEquals(
    captured.user,
    expectedUser,
    'user プロンプトが期待描画結果と一致しない — 固定部が user 側へ戻っている可能性がある',
  );
};

/**
 * 可変値センチネルが user にだけ現れ、system には現れないことを検査する。
 *
 * 「user に在る」「system に無い」を 1 回の比較にまとめるのは、片方だけを見ると
 * プレースホルダ自体がテンプレートから落ちた場合に PASS しうるため。
 *
 * @param captured - 捕獲した system / user プロンプト
 * @param markers - 可変値センチネル群
 */
const _assertPerEntryOnlyInUser = (captured: _Captured, markers: readonly string[]): void => {
  const _actual = {
    missingFromUser: markers.filter((marker) => !captured.user.includes(marker)),
    leakedToSystem: markers.filter((marker) => captured.system.includes(marker)),
  };

  assertEquals(_actual, { missingFromUser: [], leakedToSystem: [] });
};

/**
 * 文字列中のマーカー出現回数を数える。
 *
 * 0 回のときに 0 を返すと「マーカーがテンプレートから消えた」状態でも
 * 期待値 0 の行と一致して PASS しうるため、throw して黙った PASS を防ぐ。
 *
 * @param haystack - 探索対象（`system` + `user` の連結）
 * @param marker - 数えるマーカー
 * @returns `haystack` 中の `marker` の出現回数（1 以上）
 * @throws `marker` が 1 度も現れないとき
 */
const _countOf = (haystack: string, marker: string): number => {
  const _count = haystack.split(marker).length - 1;
  if (_count === 0) {
    throw new Error(
      `マーカー "${marker}" が system / user のどちらにも存在しない`
        + ' — 役割の移動で対応する行またはプレースホルダが失われている',
    );
  }
  return _count;
};

/**
 * system + user 全体での各マーカーの出現回数が期待どおりであることを検査する。
 *
 * 期待回数との比較にすることで、重複（両 role に現れる・同一 role 内で 2 度書かれる）と
 * 欠落（`_countOf` の throw）の両方を 1 本で塞ぐ。
 *
 * @param captured - 捕獲した system / user プロンプト
 * @param expected - マーカーごとの期待出現回数
 */
const _assertMarkerCounts = (captured: _Captured, expected: readonly _MarkerCount[]): void => {
  const _combined = `${captured.system}\n${captured.user}`;
  const _actual = expected.map(({ marker }) => ({ marker, count: _countOf(_combined, marker) }));

  assertEquals(_actual, [...expected]);
};

// ─── Tests

/**
 * `meta.yaml` / `review.yaml` の固定部が system メッセージ側に在ることを固定する統合テストスイート。
 *
 * llama-server の prefix キャッシュは **system メッセージ単位でしか再利用されない**（DR-36。
 * 実測は `docs/.deckrd/libs/ai-backend/workspaces/measurements-context-limits-2026-09-29.md` §3.5）。
 * よって固定部を system に置き、user にはエントリごとに変わる値だけを残す。
 * 検証は production の消費経路（`loadPrompts` → 各関数 → `aiRunnerProvider`）を通し、
 * provider が受け取った system / user 文字列に対して assert する
 * （`docs/rules/testing-conventions.md`「provider 注入テストは provider に何が渡されたかを検証する」）。
 *
 * テスト ID 範囲: T-SF-PCI-01-01 〜 T-SF-PCI-02-01, T-SF-RCI-01-01 〜 T-SF-RCI-02-01
 *
 * @see generateFrontmatter
 * @see reviewFrontmatter
 * @see loadPrompts
 */
describe('generateFrontmatter / reviewFrontmatter — プロンプトの role 分割', () => {
  useDefaultGlobalConfig();

  /**
   * `generateFrontmatter`（`meta` テンプレート）の role 分割テスト。
   *
   * 固定部 4,113 トークンが user に残っていると全ファイルで再処理されるため、
   * system へ移っていることを固定する。
   */
  describe('generateFrontmatter', () => {
    /** 実 `.config/chatlog-exporter/prompts/meta.yaml` と、全プレースホルダをセンチネル値で埋めた入力を前提とするグループ。 */
    describe('Given: 実 meta.yaml とセンチネル値で埋めた entry / dics', () => {
      /** `loadPrompts` の結果を `generateFrontmatter` に渡し、注入した runner が両プロンプトを受け取るとき。 */
      describe('When: loadPrompts → generateFrontmatter 経由で aiRunnerProvider が system / user を受け取る', () => {
        /** 固定部が system に在り、可変値が user にだけ在ることを検証する。 */
        describe('Then: T-SF-PCI-01 - 固定部は system、可変値は user に分かれている', () => {
          it('[Normal] T-SF-PCI-01-01: 固定部アンカーがすべて system に現れる', async () => {
            const captured = await _captureMetaPrompts();

            _assertAnchorsInSystem(captured, _META_FIXED_ANCHORS);
          });

          it('[Normal] T-SF-PCI-01-02: user が期待描画結果と完全一致する（固定部が 1 行も残らない）', async () => {
            const captured = await _captureMetaPrompts();

            _assertUserEquals(captured, _META_EXPECTED_USER);
          });

          it('[Normal] T-SF-PCI-01-03: 可変値センチネルが user に在り system に無い', async () => {
            const captured = await _captureMetaPrompts();

            _assertPerEntryOnlyInUser(captured, _META_PER_ENTRY_MARKERS);
          });
        });

        /** 役割の移動で行が重複・欠落していないことを出現回数で検証する。 */
        describe('Then: T-SF-PCI-02 - アンカー・センチネルが system+user 全体で期待回数ちょうど現れる', () => {
          it('[Edge] T-SF-PCI-02-01: 各アンカー・センチネルが system+user 全体でちょうど 1 回', async () => {
            const captured = await _captureMetaPrompts();

            _assertMarkerCounts(captured, _META_EXPECTED_COUNTS);
          });
        });
      });
    });
  });

  /**
   * `reviewFrontmatter`（`review` テンプレート）の role 分割テスト。
   *
   * 旧 18-89 行の規則ブロックが全部 user に在ると（system は 2 行のみ）
   * 毎ファイル再処理されるため、system へ移っていることを固定する。
   */
  describe('reviewFrontmatter', () => {
    /** 実 `.config/chatlog-exporter/prompts/review.yaml` と、全プレースホルダをセンチネル値で埋めた入力を前提とするグループ。 */
    describe('Given: 実 review.yaml とセンチネル値で埋めた entry / dics', () => {
      /** `loadPrompts` の結果を `reviewFrontmatter` に渡し、注入した runner が両プロンプトを受け取るとき。 */
      describe('When: loadPrompts → reviewFrontmatter 経由で aiRunnerProvider が system / user を受け取る', () => {
        /** 固定部が system に在り、可変値が user にだけ在ることを検証する。 */
        describe('Then: T-SF-RCI-01 - 固定部は system、可変値は user に分かれている', () => {
          it('[Normal] T-SF-RCI-01-01: 固定部アンカーがすべて system に現れる', async () => {
            const captured = await _captureReviewPrompts();

            _assertAnchorsInSystem(captured, _REVIEW_FIXED_ANCHORS);
          });

          it('[Normal] T-SF-RCI-01-02: user が期待描画結果と完全一致する（固定部が 1 行も残らない）', async () => {
            const captured = await _captureReviewPrompts();

            _assertUserEquals(captured, _REVIEW_EXPECTED_USER);
          });

          it('[Normal] T-SF-RCI-01-03: 可変値センチネルが user に在り system に無い', async () => {
            const captured = await _captureReviewPrompts();

            _assertPerEntryOnlyInUser(captured, _REVIEW_PER_ENTRY_MARKERS);
          });
        });

        /** 役割の移動で行が重複・欠落していないことを出現回数で検証する。 */
        describe('Then: T-SF-RCI-02 - アンカー・センチネルが system+user 全体で期待回数ちょうど現れる', () => {
          it('[Edge] T-SF-RCI-02-01: 各アンカー・センチネルが system+user 全体で期待回数ちょうど', async () => {
            const captured = await _captureReviewPrompts();

            _assertMarkerCounts(captured, _REVIEW_EXPECTED_COUNTS);
          });
        });
      });
    });
  });
});
