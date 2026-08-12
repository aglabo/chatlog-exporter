---
title: "Decision Records: filter strip"
module: "filter/strip"
status: Active
version: 3.2.1
created: "2026-08-12"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- cspell:words setfm -->

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- textlint-disable ja-spacing/ja-space-around-code -->
<!-- markdownlint-disable no-duplicate-heading line-length -->

---

## DR-01: 除去境界は「先頭から最初の `## Summary` 直前まで」とする - 2026-08-12

**Phase**: req
**Status**: Accepted

### Context

set-frontmatter 由来の定型プロンプト部を除去するにあたり、定型部の終端をどう判定するかを決める必要がありました。
定型部の正本 `.config/chatlog-exporter/prompts/meta.yaml` はテンプレートであり、展開後テキストとの完全一致比較には使えません。

### Decision

本文先頭から最初の `## Summary` 見出しの直前までを除去範囲とします。
2 個目以降の `## Summary` 以降に出現する定型部は除去しません（Out of Scope）。

### Alternatives Considered

- Option A: 先頭アンカー方式（最初の `## Summary` 直前まで）
- Option B: 全 `## Summary` を走査し、定型部マーカーを含む区間をすべて除去する
- Option C: `meta.yaml` テンプレートとの照合による定型部の同定

### Rationale

`chatlogs/originalLogs/claude/2026/2026-07`（全 11671 件）の実測によります。

定型部を持つ 6668 件の内訳:

| 分類                                         | 件数 |
| -------------------------------------------- | ---- |
| 定型部が最初の `## Summary` より前（先頭型） | 6398 |
| `## Summary` を持たない                      | 266  |
| 定型部が最初の `## Summary` より後ろ         | 4    |

複数 `## Summary` を持つファイルは 976 件ありますが、先頭 strip 後も定型部が残るものは 0 件です。
定型部マーカーを複数持つ 271 件も、いずれも最初の `## Summary` より前に集中しています。
Option A で 6398 件を処理でき、取りこぼしは後方配置の 4 件（0.06%）にとどまります。
Option B は実装複雑度に見合う効果がなく、Option C はテンプレート展開後の差分により成立しません。

### Consequences

- Positive:
  - 単純な文字列検索で実装でき、単体テストが容易（REQ-NF-002）
  - Markdown パーサ依存を避けられる（REQ-C-004）

- Negative:
  - 取りこぼし 6 件は手動対応または未対応となる（Q-02 で許容と決定済み）

---

## DR-02: 出力方式は in-place + 退避とする - 2026-08-12

**Phase**: req
**Status**: Accepted

### Context

issue cle-2rf の当初設計は「別ディレクトリ出力を既定とする」でした。
一方 `chatlogs/` は `.gitignore` 済み（`chatlogs/.gitignore:13` の `/*`）で、git による復旧ができません。

### Decision

元ファイルと同じパスに strip 済み内容を書き出す in-place 方式とし、
元ファイルは退避ファイルとして保存することで復旧手段を担保します。

### Alternatives Considered

- Option A: in-place + 退避ファイル
- Option B: 別ディレクトリ出力（issue cle-2rf の当初案）

### Rationale

Option B は後続処理（filter / normalize）の入力パスがすべて変わるため、
既存パイプライン全体の改修を伴います。
Option A は退避ファイルが復旧手段を担保するため、git 管理外の問題に対処できます。

### Consequences

- Positive:
  - 後続処理の入力パスが変わらず、既存パイプラインへの影響がない
  - 退避ファイルにより誤削除からの復旧が可能

- Negative:
  - 処理中はディスク使用量が実質倍になる（対象 6398 件・元データ 275.3MB 規模）
    → REQ-F-010 の正常終了時の一括削除で緩和する
  - issue cle-2rf の Design および受け入れ基準と矛盾するため、issue 側の更新が必要（Q-01）

---

## DR-03: 退避方式を BackupProvider として抽象化し、既存 writeTextFile を拡張する - 2026-08-12

**Phase**: req
**Status**: Accepted

### Context

`review req --phase explore` により、要件が名指しした既存ライブラリの実挙動との不整合が判明しました（Q-06）。

- `backupOldPath`（`libs/file-ops/backup-old-path.ts:74`）の退避名は `.bak` ではなく `.old-NN.md` 連番であり、
  REQ-F-004 以降の `.bak` 前提の記述と一致しない
- `.old-NN.md` は `findFiles` の既定 `ext='.md'`（`libs/file-ops/find-files.ts:72`、除外パターンなし）に
  入力ファイルとして再走査される
- `backupOldPath` は既存退避があっても連番を進めて必ず退避を作るため、
  REQ-F-007 の「既存退避があればスキップ・上書きしない」が成立しない
- `writeTextFile`（`libs/file-io/write-utils.ts:26`）は tmp 書き出しと rename を内部で不可分に行うため、
  REQ-NF-005 が定める 3 ステップ順序の間に退避リネームを挟めない（REQ-C-001 との両立不能）

### Decision

以下の 4 点を決定します。

1. 退避方式を `BackupProvider` 型として抽象化する

   ```ts
   // types/providers.types.ts
   export type BackupProvider = (path: string) => Promise<string | null>;
   ```

   戻り値は作成した退避先パス。既存の `.bak` があり退避を作成しなかった場合は `null` を返します。

   > **補足（DR-08）**: 当初この戻り値は REQ-F-010 の削除対象を追跡するために設けました。
   > DR-08 により削除が対象ディレクトリ単位の一括操作となったため、追跡用途は失われています。
   > 戻り値は「退避を作成したか否か」の判別として引き続き必要です。

2. 実装を 2 つ用意し、用途に応じて選択する

   | Provider        | 退避名          | 既存退避があるとき   | 用途                                         |
   | --------------- | --------------- | -------------------- | -------------------------------------------- |
   | `backupPath`    | `<name>.md.bak` | 無視し `null` を返す | strip（走査対象外・1 世代のみ）              |
   | `backupOldPath` | `.old-NN.md`    | 連番を進めて必ず作る | normalize 等の既存用途（連番で世代を貯める） |

   `backupPath` は `.bak` が既に存在する場合、退避せず `null` を返します。
   これにより REQ-F-010 の「当該実行で作成した `.bak` のみ削除」が自然に成立します
   （呼び出し側は `null` を削除リストに積みません）。

   `backupOldPath` は戻り値を `Promise<void>` から `Promise<string \| null>` に変更するのみとし、
   連番セマンティクスは変更しません（後方互換：既存 2 箇所は戻り値を使用していません）。

3. 冪等判定は Provider ではなく呼び出し側に置く
   `BackupProvider` の責務は「退避する」単一とし、「退避済みならスキップ」の判定は含めません。
   REQ-F-009 の判定順序（frontmatter → 退避ファイル → マーカー）は呼び出し側に集約します。

   `backupPath` が既存 `.bak` に対し `null` を返すのは「退避を作らなかった」という事実の報告であり、
   書き込みの中断判定ではありません。書き込みは続行されます。

4. 専用関数は新設せず、既存 `writeTextFile` に `BackupProvider` を追加する

   ```ts
   export const writeTextFile = async (
     outputPath: string,
     content: string,
     backup?: BackupProvider,
   ): Promise<string | null> => {
     const tmpPath = outputPath + '.tmp';
     await Deno.writeTextFile(tmpPath, normalizeLine(content)); // 1. 新内容を .tmp に作成
     const bakPath = backup ? await backup(outputPath) : null; // 2. 旧ファイルを .bak へリネーム
     await Deno.rename(tmpPath, outputPath); // 3. 新ファイルを旧ファイル名へ移動
     return bakPath;
   };
   ```

   `backup` 未指定時は退避せず、現行と同一の挙動になります（後方互換）。
   既存の唯一の本番呼び出し `segment-io.ts:168` は無変更で通ります。

### Alternatives Considered

- Option A: `BackupProvider` 抽象化 + 冪等判定は呼び出し側 + 既存 `writeTextFile` に引数追加（採用）
- Option B: `BackupProvider` 抽象化 +「退避済みならスキップ」の **書き込み中断判定** を Provider 契約に含める
- Option C: 要件側を `.old-NN.md` に寄せ、`backupOldPath` をそのまま再利用する
- Option D: 共有ライブラリを触らず、filter-chatlogs 配下に strip 専用の退避付き書き込みを実装する
- Option E: `writeTextFileWithBackup` を別関数として新設する

### Rationale

**Option B を採らない理由**（実際に両案を実装して比較した結果）:

ここでいう Option B は「退避済みなら **書き込みごとスキップする**」判定を Provider に持たせる案です。
`backupPath` が既存 `.bak` に対し `null` を返すこと自体は採用しており（決定 2）、
両者は別の話である点に注意してください。

1. 書き込み関数に後始末が生えます。中断判定を Provider に持たせると、
   null を受け取った時点で既に `.tmp` を書いており、かつ元ファイルが残っているため、
   そのまま rename すると元ファイルを strip 済み内容で上書きしてしまいます。
   `Deno.remove(tmpPath)` による中断処理が必須となり、
   スキップ時も毎回 `.tmp` を書いて消す無駄な I/O が発生します（6000 件規模）。
2. 戻り値 null が多義になります。「退避を作らなかった」と「書き込み自体を行わなかった」が
   同じ null で返り、呼び出し側が区別できません。
3. 決定的な点として、呼び出し側の判定は消えません。REQ-F-009 の判定順序のうち
   frontmatter の処理済みマーカー（DR-04 で `_status: stripped` と決定）の判定は、
   パスしか受け取らない Provider では原理的に担えない。
   Option B を採っても呼び出し側に判定は残り、「退避ファイルの判定だけが Provider 側」という分裂が起きる。
   Option B が削れるのは呼び出し側の `await fileExists(file + '.bak')` 1 行のみ。

そのため冪等判定（書き込みの要否）は呼び出し側に置きます。
Provider は退避の有無を戻り値で報告するだけに留めます。

**Option C を採らない理由**: `.old-01.md` が `findFiles` に再走査される問題が残り、
呼び出し側での除外フィルタが必須になります。また REQ-F-007 の冪等性が連番セマンティクスと噛み合いません。

**Option D を採らない理由**: 退避ロジックが共有ライブラリとスキル内に二重化します。
`_cle-libs` に既に退避の責務（`backupOldPath`）がある以上、そこに集約するのが
`directory-structure.md` の方針に沿います。

**Option E（専用関数の新設）を採らない理由**: `writeTextFile` と
`writeTextFileWithBackup` の 2 関数が並存すると、
「退避が要るときはどちらを呼ぶか」の判断が実装のたびに発生します。
既存 `writeTextFile` にオプショナル引数を足す形なら、
退避の有無が引数の有無として 1 箇所で表現され、関数の重複もありません。
第 3 引数を省略すれば現行と同一の挙動になるため、既存呼び出しへの影響もありません。

**`.bak` を strip 用に選ぶ理由**: `findFiles` の既定 `ext='.md'` にヒットしないため、
再走査問題が構造的に発生しません。これは `.old-NN.md` にはない利点であり、
REQ-F-007 / REQ-F-010 の冪等性設計と直接噛み合います。

### Consequences

- Positive:
  - REQ-C-001（既存ライブラリ優先）と REQ-NF-005（3 ステップ順序）が両立する
  - `.tmp` を挟むため REQ-NF-004（原子性・破損ファイルを残さない）も同時に満たせる
  - `.bak` は `findFiles` の走査対象外であり、再走査問題が構造的に消える
  - `backupOldPath` の既存用途（normalize の世代管理）が無傷のまま残る
  - Provider 注入によりテスト時の退避動作を差し替え可能（既存の `GlobProvider` 等と同じ慣習）
  - 書き込み関数が 1 つに保たれ、退避の有無が引数の有無として表現される
  - 第 3 引数を省略すれば現行と同一の挙動になるため、既存呼び出し（`segment-io.ts:168`）が無変更で通る

- Negative:
  - 共有ライブラリ `_cle-libs/` への新規追加が発生する（`BackupProvider` 型・`backupPath`）
    → BDD RGR サイクルの適用対象となる（REQ-C-003）
  - 退避方式が 2 つ並存するため、新規実装時にどちらを選ぶかの判断が必要になる
  - `backupOldPath` の戻り値変更は後方互換だが、シグネチャ変更ではあるため既存テストの確認が必要
  - `writeTextFile` の戻り値が `Promise<void>` から `Promise<string | null>` に変わる
    → 戻り値を使っていない既存呼び出しには影響しないが、型定義の更新が必要
  - 退避を渡さない呼び出しでも戻り値が `null` として返るため、
    「退避しなかった」と「退避不要だった」が戻り値上は区別できない
    （呼び出し側は自分が `backup` を渡したか否かを知っているため実害はない）

---

## DR-04: 処理済みマーカーは private フィールド `_status` として `ChatlogFrontmatter` で付与する - 2026-08-12

**Phase**: req
**Status**: Superseded by DR-14

> **この決定は DR-14 により破棄されました**。処理済みマーカーは本体の frontmatter ではなく
> `ChatlogCache` に保持します。strip は本体の frontmatter を変更しません。
> 以下は決定当時の記録です。

### Context

REQ-F-009 は処理済みマーカーの付与を求めますが、その実現手段が未定でした（Q-07）。
`review req --phase explore` により、REQ-F-002 / AC-003 の「既存フィールドを値・順序ともに保持」との衝突が指摘されていました。

実測（`ChatlogFrontmatter` にフィールドを `set()` して `toFrontmatter()` を呼ぶ）で、既定引数の危険性が確認されました。

入力:

```yaml
session_id: "abc123"
date: "2026-07-01"
project: "chatlog"
custom_field: "keep me"
```

`toFrontmatter()`（既定 `DEFAULT_ORDERED_FIELDS`）の出力:

```yaml
date: "2026-07-01"
session_id: "abc123"
project: "chatlog"
```

`reorderFrontmatterEntries`（`libs/text/frontmatter-utils.ts:183`）は `fieldOrder` を回して結果を組み立てるため、
**`fieldOrder` に無いフィールドを黙って捨てる**。`DEFAULT_ORDERED_FIELDS`（`constants/common.constants.ts:22`）は
`title / date / type / category / session_id / project / slug / topics / tags` の 9 件のみであり、次の 3 つが同時に起きます。

1. 追加したマーカーが出力から消える → REQ-F-009 が成立しない
2. `custom_field` など未知フィールドが消失する → REQ-F-002 に違反
3. `session_id, date` → `date, session_id` と順序が入れ替わる → AC-003 に違反

またフィールド名の検討にあたり、キャッシュ層が既に `status`（`written` / `empty`）を
`ChatlogCache.class.ts:349` で `{ ...meta, status: _cacheStatus }` として使用していることを確認しました。
frontmatter 側で無印の `status` を使うと、この層と紛らわしくなります。

### Decision

処理済みマーカーは、frontmatter 内の**private フィールド `_status`**として付与します。
strip 済みの場合の値は `stripped` とします。

```yaml
---
date: "2026-07-01"
session_id: "abc123"
project: "chatlog"
_status: "stripped"
---
```

#### 1. 値は単一値（後勝ち）とする

`_status` は配列にせず、常に 1 つの状態のみを保持します。
判定は `fm.get('_status') === 'stripped'` の単純比較で足ります。

#### 2. フィールド名と値は `_cle-libs` の共通定数として定義する

chatlog 全体の frontmatter 規約として扱い、他スキルからも参照できる形にします。
frontmatter 関連定数は既に `constants/common.constants.ts`（`FRONTMATTER_DELIMITER` / `DEFAULT_ORDERED_FIELDS`）に
集約されているため、そこに追加します。

```ts
/** 内部管理用フィールド名（frontmatter の private 領域）。 */
export const PRIVATE_STATUS_FIELD = '_status';

/** `_status` の取りうる値。 */
export const CHATLOG_STATUSES = {
  STRIPPED: 'stripped',
} as const;
```

**3. 付与は `ChatlogFrontmatter` 経由で行い、`fieldOrder` を明示する**

`toFrontmatter()` は既定引数（`DEFAULT_ORDERED_FIELDS`）で呼んではなりません。
入力の既存キー順の末尾に `_status` を加えた `fieldOrder` を構築して渡します。

```ts
const _fm = _entry.frontmatter;
_fm.set(PRIVATE_STATUS_FIELD, CHATLOG_STATUSES.STRIPPED);

const _order = [...Object.keys(_existingFields), PRIVATE_STATUS_FIELD];
const _rendered = _fm.toFrontmatter(_order);
```

`addTagHashes` は既定（`false`）のままとし、`tags` に `#` を付与しません。

**4. `_status` は正式版ログに出力しない（private フィールドの不変条件）**

`_` 始まりフィールドは内部管理用であり、パイプライン下流の成果物には持ち出しません。
`_status` が出力されてよいのは strip の作業対象である `originalLogs/` のみとします。

| 段階           | ディレクトリ     | `_status`  | 担保している実装                                                                                                         |
| -------------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| strip 作業対象 | `originalLogs/`  | 出力する   | 本 DR の `fieldOrder` 明示                                                                                               |
| normalize 出力 | `normalizeLogs/` | 出力しない | `_ATTACH_FIELD_ORDER`（`segment-io.ts:43`）に `_status` を含めない                                                       |
| 正式版         | `outputLogs/`    | 出力しない | `extractEntryFrontmatter`（`set-frontmatter/scripts/modules/setfm-write.ts:39`）が `DEFAULT_ORDERED_FIELDS` のみ抽出する |

実測により、`_status` を持つエントリを `extractEntryFrontmatter` に通すと
`title / date / session_id` のみが残り `_status` が落ちること、
`renderEntry()`（既定 `fieldOrder`）の出力にも現れないことを確認済みです。

この不変条件は `DEFAULT_ORDERED_FIELDS` / `_ATTACH_FIELD_ORDER` のホワイトリスト方式に依存します。
**両定数に `_status` を追加してはなりません。**また将来 private フィールドを増やす場合も、
これらのホワイトリストに含めないことで同じ防御が働きます。

### Alternatives Considered

- Option A: private フィールド `_status`（単一値）+ `_cle-libs` 共通定数（採用）
- Option B: 無印の真偽値フィールド `stripped: true`
- Option C: `_status` を配列にして処理履歴を蓄積する（`[stripped, normalized]`）
- Option D: frontmatter を使わず、キャッシュ層に `status` と同様の形で持たせる
- Option E: `ChatlogEntry.renderEntry()` をそのまま使う
- Option F: `DEFAULT_ORDERED_FIELDS` に追加する

### Rationale

**Option B（`stripped: true`）を採らない理由**: 真偽値では strip 済みの有無しか表せず、
将来 normalize 済み等の状態を記録したくなったときにフィールドが増えます。
また無印の名前は、ユーザー可視のメタデータ（title / tags 等）と内部管理情報の区別がつきません。
`_` プレフィックスはプロジェクトの命名規則で「内部用」を表すため、意図が名前で伝わります。

**Option C（配列）を採らない理由**: REQ-F-009 が求めるのは
「strip 済みファイルを再 strip しない」ことのみであり、履歴の蓄積は現時点で要件にありません。
配列にすると判定が `Array.isArray()` 分岐を伴い、YAML 出力も複数行になります。
必要になった時点で単一値から配列へ移行できます（`_status` という名前は両方を許容します）。

**Option D（キャッシュ層）を採らない理由**: キャッシュの `status` は
そのスキル内で完結する一時的な処理状態ですが、`_status: stripped` は
**ファイル自体の不可逆な変形履歴** であり、キャッシュを削除しても失われてはなりません。
REQ-F-010 により `.bak` は正常終了時に削除されるため、
frontmatter への記録が `.bak` 削除後の唯一の冪等性担保となります。

**Option E を採らない理由**: `renderEntry()` は内部で
`toFrontmatter(DEFAULT_ORDERED_FIELDS, { addTagHashes: true })` を呼びます。
上記実測のとおりフィールド消失・順序変更が起き、さらに `tags` に `#` が付いて値まで変わります。

**Option F を採らない理由**: 共有定数の変更は `set-frontmatter` など
`DEFAULT_ORDERED_FIELDS` に依存する全スキルへ波及します。
未知フィールドが捨てられる問題（上記 2）も解決しません。

**Option A を選ぶ理由**: 実測により `_status: "stripped"` が正しく出力され、
往復パース後も値・既存キー順ともに保持されることを確認済みです。
共有ライブラリのロジックを一切変更せず（定数追加のみ）、
REQ-F-002 / AC-003 / REQ-F-009 を同時に満たせます。

### Consequences

- Positive:
  - 共有ライブラリのロジック（`ChatlogFrontmatter` / `reorderFrontmatterEntries`）を変更せずに済む
  - `_` プレフィックスにより内部管理用であることが名前で伝わり、キャッシュ層の `status` とも衝突しない
  - 既存フィールドの値・順序が保持され、REQ-F-002 / AC-003 を満たす
  - 共通定数化により、他スキルが同じ規約で `_status` を扱える

- Negative:
  - frontmatter に `_` 始まりキーを導入する初の事例となる（実データに前例なしを確認済み）
    → Obsidian 等の表示側で想定外の扱いを受けないか、実適用前に確認が望ましい
  - `toFrontmatter()` を既定引数で呼ぶと破壊が起きるため、`fieldOrder` の明示的構築が必須
    → 実装時に見落とされやすく、AC-003 のテストで担保する必要がある
  - 入力の既存キー順を取得する手段が必要。
    `ChatlogFrontmatter` の public は
    `get` / `set` / `remove` / `hasRequiredFields` / `hasBaseFields` / `toFrontmatter` の 6 つで
    キー列挙 API がないため、`parseFrontmatterEntries` 等で別途取得する
  - 単一値のため、後続処理が `_status` を上書きすると strip の記録が失われる
    → 現時点では strip のみが `_status` を書くため問題にならないが、
    他スキルが使い始める際は、上書きの規則を決める必要がある（将来の DR 対象）

---

## DR-05: 実装上の禁止事項を散文ではなく制約要件として規範化する - 2026-08-12

**Phase**: review-harden
**Status**: Accepted

### Context

`review req --phase harden` の実施にあたり文書を検査したところ、
SHOULD / MAY は 0 件であり、EARS ブロックはすべて `the system SHALL` で記述済みでした。
harden の主目的である「WHEN 条件の抽出」「SHOULD → MUST 昇格」には対象が存在しません。

一方、**実装を誤ると要件が沈黙のうちに破れる 3 つの禁止事項** が、
REQ の本文や Rationale に散文として書かれているのみで、規範要件になっていませんでした。

| 散文の所在             | 内容                                                            | 破れると違反する要件                |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------- |
| REQ-F-009 本文         | `toFrontmatter()` を既定引数で呼んではならない                  | REQ-F-002 / REQ-F-009 / AC-003      |
| REQ-F-011 Rationale    | 共有フィールド順定数に private フィールドを追加してはならない   | REQ-F-011                           |
| REQ-C-001 / REQ-NF-005 | 退避を伴う書き込みは `writeTextFile` に `BackupProvider` を渡す | REQ-NF-004 / REQ-NF-005 / REQ-F-007 |

いずれも「実装者が既定の呼び方をすると壊れる」性質を持ち、
かつ壊れても実行時エラーにならず **出力が静かに劣化します**。

### Decision

3 つの禁止事項を制約要件 REQ-C-005 / REQ-C-006 / REQ-C-007 として規範化し、
それぞれに検証可能な受け入れ基準 AC-018 / AC-019 / AC-020 を与えます。

散文は要件への参照に置き換え、規則の正本を 1 箇所に集約します。

| ID        | EARS Type         | 規範内容                                                        | AC     |
| --------- | ----------------- | --------------------------------------------------------------- | ------ |
| REQ-C-005 | unwanted behavior | `toFrontmatter()` を既定引数で呼ばず `fieldOrder` を明示する    | AC-018 |
| REQ-C-006 | unwanted behavior | 共有フィールド順定数に private フィールドを追加しない           | AC-019 |
| REQ-C-007 | feature/config    | 退避を伴う書き込みは `writeTextFile` に `BackupProvider` を渡す | AC-020 |

### Alternatives Considered

- Option A: 制約要件（REQ-C）として規範化し AC を与える（採用）
- Option B: 散文のまま残し、spec フェーズで実装指針として詳述する
- Option C: 機能要件（REQ-F）として追加する
- Option D: コードコメントや lint ルールで担保し、要件文書には書かない

### Rationale

**Option B を採らない理由**: 散文には受け入れ基準が紐づかないため、
テストで担保されません。REQ-F-011 のように「現状たまたま満たされている」不変条件は、
明示的な検証がなければ将来の変更で沈黙のうちに破れます。
また spec は「どう作るか」を書く場であり、「何を禁じるか」は要件の領分です。

**Option C を採らない理由**: 3 件はいずれもシステムの外部から観測できる振る舞いではなく、
実装手段への制約です。REQ-F はユーザーに見える機能を記述する場であり、
`directory-structure.md` や `coding-guidelines.md` と同種の制約は REQ-C が適切です。

**Option D を採らない理由**: lint で機械的に検出できるのは REQ-C-006（定数の中身）程度で、
REQ-C-005 / REQ-C-007 は呼び出し方の問題であり静的検出が難しいためです。
要件として記録しなければ、レビュー時に「なぜこの呼び方なのか」の根拠が失われます。

**Option A を選ぶ理由**: 3 件とも実測または実コード調査で
「破れる条件」と「破れたときの被害」が具体的に判明しています（DR-03 / DR-04 参照）。
受け入れ基準を与えることで、実装時のテストで担保できる状態になります。

### Consequences

- Positive:
  - 実装を誤ると壊れる箇所が、テスト可能な受け入れ基準として明示された
  - 規則の正本が REQ-C-005 〜 007 に集約され、散文との二重管理が解消された
  - spec フェーズで「なぜこの実装手段か」を再導出する必要がなくなる

- Negative:
  - 制約要件が 4 件から 7 件に増え、文書量が増した
  - AC-019（定数の中身の検査）は通常のユニットテストとしては異質であり、
    テスト戦略の検討を要する（spec フェーズの課題）
  - AC-020（中断時の復旧可能性）は中断を人為的に起こす必要があり、
    通常のテストでは検証が難しい（spec フェーズでテスト手段の決定を要する）

---

## DR-06: `.bak` 削除条件を `_status` 基準とし、最終的な復旧手段は re-export とする - 2026-08-12

**Phase**: req
**Status**: Accepted

### Context

codex risk review（`requirements/reviews-codex-req-risk-2026-08-12.md` 危険な前提 1）が
REQ-F-010 の最重要リスクを指摘しました。

> `error 0` は「実装が例外を出さなかった」だけで、「除去範囲が正しかった」保証ではない。
> 境界判定に系統的なバグがあれば、全ファイルを誤変換してから唯一の復旧手段を消せる。

この指摘は「`.bak` が唯一の復旧手段」という前提に立っています。
DR-02 の Context も「`chatlogs/` は `.gitignore` 済みで git による復旧ができない」と記していました。

**しかしこの前提は誤りであることが判明しました。**
`chatlogs/originalLogs/` は一次ソースではなく、`export-chatlogs` による派生物です。

- 一次ソースは `~/.claude/projects/` 配下の JSONL セッションファイル
  （`export-chatlogs/scripts/exporter/claude-exporter.ts:215`）
- `writeSession`（`export-chatlogs/scripts/libs/session-writer.ts:90`）は
  `Deno.writeTextFile` で **無条件に上書き** するため、re-export で既存ファイルを置き換えられる

つまり strip が全件を誤変換しても、`export-chatlogs` を再実行すれば
`originalLogs/` を復元できます。`.bak` は最終防衛線ではなく、
**再 export の手間を省くための一次的な復旧手段** です。

### Decision

以下の 2 点を決定します。

#### 1. `.bak` 削除条件を `_status` 基準とする

> **この決定は DR-08 により覆されました**。削除条件は error 0 件を基準とする
> 対象ディレクトリ単位の一括削除に変更されています。以下は決定当時の記録です。

`.bak` の一括削除は、当該実行で処理した全対象ファイルの `_status` が
`stripped`（= strip 成功）である場合に行います。
`error` を計上したファイルが 1 件でもあれば `.bak` を保持します。

判定を「例外が出なかったか」ではなく「`_status` に何が設定されたか」に置くことで、
削除条件を処理結果そのものに紐づけます。

#### 2. 最終的な復旧手段は re-export とする

`.bak` を失っても、`export-chatlogs` の再実行により `originalLogs/` を復元できます。
この経路を要件に明記し、`.bak` を「唯一の復旧手段」として扱いません。

ただし re-export は次を伴うため、`.bak` による復旧を第一手段とする位置づけは維持します。

- 全セッションの再変換コスト（claude/2026-07 で 11671 件規模）
- `~/.claude/projects/` に元セッションが残っていることが前提

### Alternatives Considered

- Option A: `.bak` 削除条件を `_status` 基準とし、復旧手段として re-export を明記（採用）
- Option B: `.bak` 自動削除を既定無効にし、`--delete-backups-on-success` フラグで明示する（codex 提案）
- Option C: `.bak` 削除を別コマンドに分離し、manifest 検証後にのみ実行する（codex 提案）
- Option D: 現状維持（`error 0` を条件に自動削除）

### Rationale

**codex 指摘の前提が成立しないため、Option B / C の重量級の対策は過剰です。**

codex の懸念は「復旧不能になる」ことでした。しかし一次ソースが `~/.claude/projects/` に
存在し、`writeSession` が無条件に上書きする以上、**復旧不能という事態は起きません**。
最悪でも re-export の実行コストを払えば元に戻ります。

Option B（既定無効化）は、6000 件規模で `.bak` が残り続けることを意味します。
DR-02 の Negative に記したとおりディスク使用量が実質倍（275.3MB 規模）になり、
かつ「いつ消すか」の判断をユーザーに恒久的に押し付けます。
復旧不能でないなら、この代償は見合いません。

Option C（別コマンド + manifest）は、クラッシュ耐性のある manifest の設計・実装・
検証コストを新たに発生させます。同じく復旧不能でない以上、過剰です。

Option D（現状維持）を採らない理由は、`error 0` という条件が
「実装が例外を出さなかった」という実装都合の指標であり、
「strip が成功したか」という処理結果と直接対応していないためです。
`_status` 基準にすることで、削除条件が処理結果そのものに紐づきます。

### Consequences

- Positive:
  - 削除条件が処理結果（`_status`）に直接紐づき、実装都合の指標に依存しなくなる
  - `.bak` 自動削除を維持できるため、ディスク使用量が倍増したまま残らない
  - codex 指摘の「復旧不能」リスクが、前提の誤りとして解消される
  - manifest 等の追加機構を導入せずに済む

- Negative:
  - re-export による復旧は全セッションの再変換を伴い、大規模データでは時間コストが大きい
  - `~/.claude/projects/` から元セッションが削除されている場合、re-export は機能しない
    → 一次ソースの保持がユーザー環境に依存する点は残る
  - `originalLogs/` に対して strip 以外の手作業編集が加えられていた場合、
    re-export はその編集を失う（strip 前の状態には戻るが、手編集内容は戻らない）
  - DR-02 の Context に記した「git による復旧ができない」という記述は、
    一次ソースの存在を見落としていた。本 DR で補正する

---

## DR-07: 未検証データセットへの適用は受理範囲の限定によって強制する - 2026-08-12

**Phase**: req
**Status**: Accepted

### Context

codex risk review（`requirements/reviews-codex-req-risk-2026-08-12.md` 危険な前提 2 / 経路 2 / 依存 3）が、
REQ-C-004 の実効性を指摘しました。

> REQ-C-004 は「未検証データセットには適用してはならない」と規定するが、
> 実行時にそれを強制する仕組みがない。運用上の注意に留まっている。

この指摘の射程を実装で確認したところ、軸によって成否が分かれると判明しました。

- agent 軸では指摘は成立しない。agent は常に単一値へ解決され
  （`DEFAULT_FILTER_CONFIG.agent` / `DEFAULT_AGENT`）、全エージェントを走査する経路が存在しない
- period の不正形式は既存実装で拒否済み。agent の次の位置引数は `YYYY-MM` 形式が必須であり、
  違反時は `InvalidPeriodPosition` を throw する（`_cle-libs/libs/io/parse-args.ts`）
- period の省略では破れる。`agentPath()` が agent のみを返し
  （`_cle-libs/libs/file-io/resolve-directory.ts`）、`findFiles` の再帰走査が
  agent 直下の全年月を対象にする
- `--input-dir` override でも破れる。`resolveChatlogsDir()` が
  agent / period / addOnDir をすべて無視する

すなわち実際に塞ぐべきは「period の省略」と「override の指定」の 2 経路に限られます。

なお実測時点では `originalLogs/{claude,codex,chatgpt}/2026/` に `2026-07/` しか存在せず、
本リスクは将来 `2026-08` 以降が生成された時点で発火する潜在的なものです。

### Decision

`strip` が受理する引数を `<agent> <YYYY-MM>` の形に限定し、
period 省略時と `--input-dir` override 指定時は対象を列挙せずに実行を拒否します。
manifest 等の追加機構は導入しません。REQ-C-008 として規範化します。

この拒否は strip サブコマンド固有の制約とし、`filter` / `noise-filter` の
既存挙動（period 省略を許容）は変更しません。共通の `parseArgs` ではなく
strip 側で受理条件を検査します。

### Alternatives Considered

- Option A: 受理範囲を `<agent> <YYYY-MM>` に限定して実行時拒否する（採用）
- Option B: 検査済みデータセットを manifest に記録し、未記載なら実行を拒否する（codex 提案）
- Option C: REQ-C-004 の散文の注意書きのまま、実行時に強制しない（現状維持）
- Option D: 共通の `parseArgs` で period を必須化する

### Rationale

**Option A は、既に検証済みの粒度（agent × 年月）と実行単位を一致させるだけで強制が成立します。**
REQ-C-004 の実測は `claude/2026-07` という単一の `<agent>/<YYYY>/<YYYY-MM>` に対して行われました。
実行単位を同じ粒度に強制すれば、走査範囲が検証済みの粒度を超えることが構造的になくなります。
追加の状態を持たずに済む点が決め手です。

Option B（manifest）は、検査済み一覧という新たな永続状態を導入し、
その生成・更新・クラッシュ耐性・実態との同期ずれをすべて設計対象に加えます。
Option A で同じ保証が状態なしに得られる以上、過剰です。
DR-06 で manifest 案を不採用とした判断とも整合します。

Option C は指摘そのものであり、破壊的処理の安全性を運用規律に依存させ続けます。
strip は 6000 件規模の in-place 破壊操作であり、規律への依存は釣り合いません。

Option D は `filter` / `noise-filter` の既存挙動まで変更し、
本件と無関係な利用者にも影響します。最小変更の原則に反します。

### Consequences

- Positive:
  - 走査範囲が検証済みの粒度（`<agent>/<YYYY>/<YYYY-MM>`）を構造的に超えなくなる
  - manifest 等の永続状態を追加せずに強制が成立する
  - REQ-C-004 の前提と実行単位が一致し、再検査条件の適用範囲が明確になる
  - 誤って全年月を対象にする事故（`filter strip claude` の実行）が実行時に止まる

- Negative:
  - `filter` / `noise-filter` と `strip` とで引数の受理条件が非対称になり、
    利用者は strip のみ period 必須であることを覚える必要がある
  - 複数年月を一括処理する正当な用途があっても、年月ごとに実行を分ける必要がある
  - `--input-dir` による任意ディレクトリ指定が strip では使えず、
    検証目的で一時ディレクトリを対象にする用途は塞がれる
  - 新しい年月を処理するたびに REQ-C-004 の事前検査が前提となるが、
    その検査自体は依然として手動であり、自動化されていない

---

<!--
IDs MUST be sequential: DR-01, DR-02, ...

Versioning (SemVer, see deckrd-rule-document-versioning.md):
  MINOR — a new DR is added
  PATCH — an existing DR's wording or rationale is clarified
  MAJOR — an accepted DR is superseded or reversed

Keep frontmatter `version` equal to the newest Change History row below.
-->

## DR-08: `.bak` 削除を対象ディレクトリ単位の一括削除とする - 2026-08-12

**Phase**: spec
**Status**: Accepted

### Context

DR-06 は `.bak` の削除条件を「当該実行で処理した全ファイルの `_status` が `stripped`」と定めました。
しかし spec フェーズで判定規則を組み立てる過程で、この条件が実質的に成立しないことが判明しました。

passthrough と判定されたファイルは書き込みを受けないため、`_status` を持ちません。
実測では対象 6398 件に対し passthrough が 3890 件あるため、
「全ファイルが `stripped`」という条件はほぼ満たされず、削除が発動しません。

加えて DR-06 は削除対象を「当該実行で作成した `.bak`」に限定し、
そのために `BackupProvider` の戻り値で退避パスを追跡する設計を採っていました。

### Decision

以下の 2 点を決定します。

#### 1. 削除条件は error 0 件とする

`.bak` の一括削除は、当該実行で error を計上したファイルが 1 件も無い場合に行います。
`_status` は削除条件に用いません。

#### 2. 削除範囲は対象ディレクトリ配下の `.bak` 全件とする

REQ-C-008 により対象は単一の `<agent> <YYYY-MM>` ディレクトリに限定されます。
その配下の `.bak` はすべて strip の作業対象であるため、退避パスを個別に追跡せず一括削除します。

前回実行の中断により残った `.bak` も削除対象に含めます。
当該実行が全件を error なく処理し終えた時点で対象ディレクトリは正常な strip 済み状態であり、
古い `.bak` を保持する理由が無いためです。

### Alternatives Considered

- Option A: 対象ディレクトリ配下の `.bak` を error 0 件で一括削除する（採用）
- Option B: 退避パスをリストに追跡し、当該実行が作成した `.bak` のみ削除する（DR-06 の方式）
- Option C: 一括削除するが、skipped が 0 件の場合に限定する

### Rationale

**Option A を選ぶ理由**: 対象範囲が REQ-C-008 で単一ディレクトリに固定されているため、
「ディレクトリ配下の `.bak`」と「当該実行が作成した `.bak`」はほぼ同一の集合になります。
両者が食い違うのは前回実行の中断により古い `.bak` が残っている場合のみです。
その場合も、当該実行が error なく完了していれば古い `.bak` を残す理由はありません。

削除条件を error の有無に戻すことで、DR-06 が解こうとした
「例外が出なかったかではなく処理結果に紐づける」という意図は失われます。
しかし `_status` 基準は passthrough の存在により機能しないため、この意図は元より達成されていませんでした。
error は「書き換えを見送った」という処理結果そのものであり、判定材料として十分です。

**Option B を採らない理由**: 退避パスの追跡はメモリ上のリストに依存し、クラッシュ耐性がありません。
追跡が必要になるのは中断後の再実行という例外的な場面のみです。
その場面でも古い `.bak` を残す理由が無いと判明したため、追跡のコストが便益を上回ります。

**Option C を採らない理由**: skipped は正常な冪等動作であり、削除を止める理由になりません。
skipped が 1 件でもあれば削除しない設計は、2 回目以降の実行でディスクが解放されないことを意味します。

### Consequences

- Positive:
  - 削除条件が passthrough の有無に左右されず、実際に発動します
  - 退避パスの追跡が不要になり、`.bak` 削除の実装が単純化します
  - 中断により残留した `.bak` も回収され、ディスク使用量が確実に戻ります
- Negative:
  - `BackupProvider` の戻り値は削除対象の追跡には使われなくなります
    → 戻り値は退避を作成したかどうかの判別（`null` = 既存 `.bak` あり）として引き続き必要です
  - 対象ディレクトリに strip 以外の経路で作られた `.bak` があれば、それも削除されます
    → `chatlogs/originalLogs/` は export の出力先であり、手動の `.bak` 配置は想定しません

---

## DR-09: frontmatter を持たないファイルを error として扱う - 2026-08-12

**Phase**: spec
**Status**: Accepted

### Context

`review spec --phase explore`（`specifications/reviews-claude-spec-explore-2026-08-12.md` の F-01）が、
Section 4.2 の判定規則に frontmatter の有無を検査する規則が無いことを指摘しました。

指摘の時点では、Edge 15 が「frontmatter を持たない」ファイルを passthrough と分類していました。
一方 Section 4.2 の規則群にはこれに対応する条件が無く、
frontmatter を持たず定型部マーカーを持つファイルは、どの否定条件にも該当せず stripped と判定されます。
Edge Case の記述と判定規則が矛盾した状態でした。

この矛盾をどちらの向きで解消するかを判断するため、
`originalLogs/` 配下のファイルが frontmatter を必ず持つかどうかを実装で確認しました。

- `originalLogs/` の全ファイルは `export-chatlogs` の `renderMarkdown` により生成されます
- frontmatter のデリミタは `session-writer.ts` の 57 行目と 62 行目にあり、条件分岐の外にあります
- `session_id`（58 行目）と `date`（59 行目）も条件分岐の外にあり、無条件に出力されます
- 条件付きなのは `project`（60 行目）と `slug`（61 行目）のみで、
  これらが省略されても frontmatter そのものは残ります
- claude / codex / chatgpt の 3 エクスポータはいずれも `writeSession` を経由し、
  他に本番の書き出し経路はありません

したがって frontmatter の欠落は「対象外の入力」ではなく、
パイプラインの前提が破れた状態を示します。

### Decision

frontmatter を持たないファイルを error として分類します。

Section 4.2 の判定順序の先頭に R-002（frontmatter を持たない → error）を新設し、
Edge 15 の分類を passthrough から error へ変更します。
requirements 側では REQ-F-008（安全弁）の判定基準に「frontmatter を持たない」を追加し、
AC-023 を新設します。

R-002 を判定順序の先頭に置く理由は 2 つあります。
第 1 に、R-003 の処理済みマーカーは frontmatter 内に保持されるため、
frontmatter の存在が後続判定の前提になります。
第 2 に、frontmatter の欠落は前提の破れであり、後続の判定を試みる前に検出すべきものです。

なお本決定は分類を error とするに留め、実行全体の中断は行いません。
DD-03（安全弁は個別ファイル単位で作用する）に従い、当該ファイルをスキップして処理を継続します。

### Alternatives Considered

- Option A: frontmatter を持たないファイルを error として扱う（採用）
- Option B: Edge 15 の記述どおり passthrough として無変更で通す
- Option C: 走査時に全件を先に検査し、1 件でも該当すれば実行を拒否する

### Rationale

**Option A は、検出できる前提の破れを黙って見逃さない点で、本機能の設計原則に整合します。**

Section 2.1 は「除去してよい根拠が積極的に確認できた場合にのみ除去する」ことを原則とし、
確証が得られない入力を推測で処理しないことを定めています。
frontmatter の欠落は、その確証の前提そのものが崩れている状態にあたります。

Option B は Edge 15 の当初案ですが、2 つの問題があります。
第 1 に、passthrough は「除去対象ではない正常な入力」を意味する分類であり、
前提が破れた入力に同じ分類を与えると、報告上どちらも同じ扱いになり異常を検知できません。
第 2 に、REQ-F-009 の処理済みマーカーは frontmatter に付与するため、
frontmatter が無いファイルには付与先が存在しません。
仮に将来この経路で書き込みが起きた場合、冪等性を担保する手段がありません。

Option C は前提の破れを破壊的処理の前に検出できる利点がありますが、
R-001 以外の実行拒否経路が増えて判定が複雑化します。
また DD-03 が定める「1 件の異常で残り全件の処理機会を失わない」方針とも整合しません。
実測では該当ファイルが 0 件であり、実行全体を止める強度は現時点で正当化できません。

### Consequences

- Positive:
  - Edge 15 と Section 4.2 の判定規則の矛盾が解消されます
  - frontmatter の欠落が error として報告され、パイプラインの異常を検知できます
  - 処理済みマーカーの付与先を持たないファイルは、書き込み経路へ進みません
- Negative:
  - 実測では該当ファイルが 0 件のため、現時点で発火しない規則が 1 つ増えます
    → 前提の破れに対して沈黙しないための安全弁であり、発火しない状態こそが正常です
  - REQ-F-003（`## Summary` 不在時の passthrough）の GIVEN を満たすファイルのうち、
    frontmatter を持たないものは error となり、AC-004 の期待値と食い違います
    → AC-004 の検体に「frontmatter を持つ」前提を補う必要があります
    （`specifications/reviews-claude-spec-explore-2026-08-12.md` の F-06 として記録）

---

## DR-10: 退避削除の失敗を報告し、終了コードに反映する - 2026-08-12

**Phase**: review-harden
**Status**: Accepted

### Context

`review spec --phase explore` の F-03 / F-07 が、退避削除そのものの失敗が未定義である点を
2 回にわたり指摘しました。codex risk review (`requirements/reviews-codex-req-risk-2026-08-12.md` 経路 5) でも
同種の指摘が未解決のまま残っています。

Section 4.3 は逐次削除を退ける根拠として「途中失敗により一部だけ削除済みの状態が生じます」を
挙げていますが、一括削除であっても削除処理の途中で失敗すれば同じ状態が生じます。
現行の規則では、この状態が発生しても検出されず、実行は正常終了します。

Section 3.2 の結果分類は入力ファイル単位の分類であり、
削除フェーズの失敗を表現する分類が存在しません。

### Decision

退避削除の失敗について、次の 3 点を定めます。

1. 削除に失敗した退避が 1 件以上ある場合、失敗件数と対象パスを報告します
2. 削除失敗がある場合、終了コードを成功以外とします
3. 削除失敗は既に確定したファイル単位の分類結果を取り消しません

削除は全件について試行し、1 件の失敗で残りの削除を中断しません。
中断すると削除済みと未削除の混在範囲が実行ごとに変わり、再実行時の状態把握が困難になるためです。

削除失敗は Section 3.2 のファイル単位の分類には加えません。
当該分類は入力ファイル単位のものであり、実行単位の後処理である削除とは粒度が異なるためです。
報告はサマリー (REQ-F-006) の項目として行います。

### Alternatives Considered

- Option A: 失敗件数とパスを報告し、終了コードに反映する (採用)
- Option B: 削除失敗を warning として報告し、終了コードには影響させない
- Option C: 削除失敗時に当該実行を error 扱いとし、分類結果も無効とする
- Option D: 削除失敗時にリトライを行い、規定回数で諦める

### Rationale

**Option A は、検出可能な異常を沈黙させない点で Section 2.1 の設計原則に整合します。**

本機能は 6000 件規模の破壊的操作を伴い、退避は第一の復旧手段です。
削除に失敗した退避が残ること自体は無害です。
ただし削除済みか残存かを利用者が知る手段を欠くと、
ディスク使用量の見積もりと次回実行時の前提が崩れます。

Option B を採らない理由は、終了コードが成功のままだと自動化された呼び出し元
(SKILL.md 層のパイプライン) が異常を検知できないためです。
REQ-F-006 は「SKILL.md 層が `::info::` 形式の出力を解析する既存パターンに合わせる」ことを
Rationale に挙げており、機械可読な異常通知の経路が想定されています。

Option C を採らない理由は 2 つあります。
第 1 に、削除は全ファイルの処理完了後の後処理であり、その失敗は既に完了した
書き換えの正しさに影響しません。
第 2 に、分類結果を無効化しても実際のファイル状態は元に戻らないため、
報告と実態が乖離します。

Option D を採らない理由は、リトライ回数と間隔という新たな決定が必要になり、
かつファイルロックの多くは他プロセスの保持によるもので短時間のリトライでは解消しないためです。
削除に失敗した退避は次回実行時の一括削除で再び対象となるため、恒久的な残存にはなりません。

### Consequences

- Positive:
  - 削除失敗が検出・報告され、呼び出し元が異常を判別できます
  - 「一部だけ削除済み」の状態が沈黙のうちに発生する経路が塞がれます
  - 分類結果と削除結果が独立して報告され、それぞれの成否が明確になります
- Negative:
  - 終了コードの意味が「分類の成否」から「実行全体の成否」へ広がります
    → サマリーで分類結果と削除結果を分けて報告するため、原因の切り分けは可能です
  - 削除失敗時も分類は成功として報告されるため、報告の読み取りに注意を要します
    → 成功以外の終了コードが、詳細確認を促す signal として機能します

---

## DR-11: REQ-F-008 の到達不能な判定基準を削除する - 2026-08-12

**Phase**: review-harden
**Status**: Accepted

### Context

`review spec --phase explore` の A-04 が、REQ-F-008 の 3 基準のうち 1 つが
spec 側の規則に現れない点を指摘しました。

REQ-F-008 の判定基準は次の 3 点です。

- frontmatter を持たない
- 除去後の本文が空、または `## Summary` 以降が存在しない
- 除去率が 99% を超える

これに対し Section 4.2 の規則は R-002 (frontmatter を持たない) と
R-007 (除去後の本文が空、または除去率が 99% を超える) の 2 つです。
「`## Summary` 以降が存在しない」に対応する条件がどの規則にもありません。

Traceability (Section 6) は REQ-F-008 → R-002, R-007, Edge 5/6/15 と対応づけています。
網羅されているように見える一方、実際には 1 基準が規則に落ちていない状態でした。

### Decision

当該基準は構造的に到達不能であると判断し、REQ-F-008 の判定基準から削除します。
R-007 の条件は現行のまま維持し、規則側の変更は行いません。

到達不能である根拠は次の連鎖によります。

1. R-005 により、`## Summary` を 1 つも持たないファイルは passthrough となり R-007 に到達しません
2. したがって R-007 に到達したファイルは `## Summary` を必ず持ちます
3. DR-01 は除去範囲を「本文先頭から最初の `## Summary` の直前まで」と定めます
4. 除去範囲に `## Summary` 自体は含まれないため、除去後の本文は必ず `## Summary` から始まります
5. ゆえに「除去後に `## Summary` 以降が存在しない」状態は発生しません

### Alternatives Considered

- Option A: 到達不能と判断し、REQ-F-008 から当該基準を削除する (採用)
- Option B: R-007 の条件に「除去後の本文が `## Summary` で始まらない」を追加し、規則側を要件に合わせる
- Option C: 現状を維持し、Traceability の Notes に到達不能である旨を注記する

### Rationale

**Option A は、要件と規則の不一致を要件側の訂正によって解消します。**

当該基準は DR-01 の除去境界が確定する前の草案に由来すると考えられます。
除去範囲が「最初の `## Summary` を含む位置まで」であれば意味を持ちますが、
DR-01 が「直前まで」と確定した時点で成立しなくなりました。

Option B を採らない理由は、到達しない条件を規則に加えると、
実装時に到達不能な分岐へのテストを書こうとして、R-005 を迂回する経路が生まれかねないためです。
これは explore の F-05 で `backupPath` の `null` 戻り値について指摘したのと同じ構造の問題です。

Option C を採らない理由は、注記では要件本文が誤ったまま残るためです。
requirements.md のみを読む後続フェーズ (impl / tasks) は、
到達不能な条件を実装対象と解釈しかねません。

なお本決定は安全弁の強度を下げるものではありません。
削除する条件は発生しえない条件であり、実際に保護を担っているのは
「除去後の本文が空」と「除去率が 99% を超える」の 2 条件です。

### Consequences

- Positive:
  - REQ-F-008 の基準と Section 4.2 の規則が 1 対 1 で対応します
  - Traceability の網羅性が実態と一致します
  - 到達不能な分岐が実装・テストの対象になる経路が塞がれます
- Negative:
  - 将来 DR-01 の除去境界を変更した場合、当該基準の復活が必要になります
    → DR-01 側の Consequences に、変更時は本 DR を再検討する旨の記録が望まれます

---

## DR-12: `backupPath` の戻り値を `Promise<string>` に単純化する - 2026-08-12

**Phase**: review-harden
**Status**: Accepted

### Context

`review spec --phase explore` の F-05 が、`backupPath` の `null` 戻り値が
R-004 により到達不能である点を指摘しました。

DR-03 の決定 2 は `backupPath` の `null` 戻り値の根拠として
「REQ-F-010 の『当該実行で作成した `.bak` のみ削除』が自然に成立する」ことを挙げていました。
しかし DR-08 により削除は対象ディレクトリ単位の一括操作へ変更され、この根拠は失われています。
DR-03 の補足もこの点を認めています。

加えて R-004 は「対応する退避ファイルが既に存在する」ファイルを skipped として分類し、
書き込み経路へ進ませません。退避付き書き込み (R-009) に到達するのは R-008 が成立したファイルのみです。
したがって `backupPath` が呼ばれる時点で退避は存在せず、`null` を返す分岐に到達しません。

本レビュー時点で `BackupProvider` および `backupPath` は未実装です。
`_cle-libs/libs/file-ops/` は該当ファイルを持たず、`writeTextFile` も第 2 引数までを取ります。
したがって実装より前の段階で確定できます。

### Decision

`backupPath` の戻り値を `Promise<string>` とし、`null` を返さないこととします。
`BackupProvider` 型は `backupOldPath` との共用のため `Promise<string | null>` を維持します。

`backupPath` が退避先パスを返せない状況、すなわち退避対象が既に存在する状況は、
呼び出し側の R-004 により到達前に排除されます。
仮に到達した場合は前提の破れであり、`null` を返して処理を続行するのではなく例外を throw します。
これは Section 2.1 の「確証が得られない入力は処理しない」原則および
`coding-guidelines.md` の fail-first 原則に整合します。

### Alternatives Considered

- Option A: 戻り値を `Promise<string>` とし、到達不能な状況では throw する (採用)
- Option B: `null` を「防御的な二重化であり通常は到達しない」と位置づけ、仕様に明示する
- Option C: 現状維持 (`Promise<string | null>` のまま、根拠の記述のみ更新する)

### Rationale

**Option A は、到達不能な分岐を型から消すことで、誤用の余地を断ちます。**

`null` を残す場合の具体的な弊害は 2 つあります。
第 1 に、到達不能な分岐へのテストを書こうとして、R-004 を迂回する経路が生まれかねません。
第 2 に、`null` を冪等判定の材料と誤解し、DR-03 の決定 3 (冪等判定は呼び出し側に置く) と
重複した判定が Provider 側に持ち込まれる恐れがあります。
DR-03 は Option B の検討時に「戻り値 null が多義になる」ことを不採用理由に挙げており、
本決定はその判断と方向を同じくします。

Option B を採らない理由は、`null` が到達しないことを散文で説明しても、
型としては `null` を扱う分岐が呼び出し側に要求され続けるためです。

Option C を採らない理由は、根拠の記述だけを更新しても、
失われた根拠に代わる新たな根拠が存在しないためです。

`BackupProvider` 型を `Promise<string | null>` のまま維持する理由を述べます。
`backupOldPath` は連番セマンティクスを持ち、既存用途で `null` を返す可能性を残すためです。
型は 2 実装の上位集合とし、`backupPath` は戻り値をより狭い型へ限定する形になります。

### Consequences

- Positive:
  - 到達不能な分岐が型から消え、呼び出し側の `null` 判定が不要になります
  - 前提が破れた場合に沈黙せず例外として検出されます
  - DR-03 の決定 3 (冪等判定は呼び出し側) との責務分離がより明確になります
- Negative:
  - `BackupProvider` 型と `backupPath` の戻り値型が一致しなくなります
    → 型は 2 実装の上位集合であり、実装側がより狭い型を返すのは型安全です
  - 前提が破れた場合に例外で停止するため、当該ファイル 1 件で実行が止まります
    → DD-03 に従い、呼び出し側で捕捉して error として計上し処理を継続する余地があります。
    この点は impl フェーズの決定事項とします

---

## DR-13: ファイル単位の分類を 3 つに統合する - 2026-08-12

**Phase**: review-harden
**Status**: Superseded by DR-15

### Context

ユーザーより、ファイル単位の分類を passthrough / stripped / error の 3 つに減らし、
全件処理後の判定を簡潔にしたいとの要望がありました。

現行の 4 分類のうち、passthrough と skipped は観測可能な副作用が同一です。
Section 3.2 の表において、両者はいずれも「内容の変更: なし」「退避の作成: なし」です。
両者を分ける根拠は副作用ではなく、無変更に至った理由の違いにあります。

- passthrough — 除去対象ではないと判定した (R-005 / R-006)
- skipped — 処理済みと判定した (R-003 / R-004)

実行終了時の判定は現在 error の有無のみを見ており (R-010 / R-011) 、
分類ごとの件数から全件処理の成否を導く手段がありません。

### Decision

分類ラベルを passthrough / stripped / error の 3 つに統合します。
従来 skipped としていた結果は passthrough に含めます。

判定規則 R-003 と R-004 は現行のまま残します。
両規則は再実行時の冪等性を担保しており、削除すると strip 済みファイルの再処理を招きます。
変更するのは、両規則に到達したファイルへ付与する分類ラベルのみです。

skipped に相当する件数は失われないよう、サマリーの内訳として報告します。
REQ-F-006 の報告項目に「passthrough のうち処理済みスキップの件数」を加えます。

全件処理後の判定式を次のとおり定めます。

```text
stripped + passthrough == total  かつ  error == 0
```

この式が成立することを、全ファイルの評価完了の判定条件とします。

### Alternatives Considered

- Option A: 分類を 3 つに統合し、skipped 件数を内訳として報告する (採用)
- Option B: 現行の 4 分類を維持する
- Option C: 分類を 3 つに統合し、skipped 件数を保持しない
- Option D: 判定規則 R-003 / R-004 自体を削除する

### Rationale

**Option A は、ラベルの数を減らしつつ判別可能性を保ちます。**

分類ラベルは呼び出し元が処理結果を判別するための単位です。
passthrough と skipped は副作用が同一であるため、
呼び出し元が両者に対して異なる後続処理を行う場面がありません。
ラベルを分ける実益は報告の粒度に限られ、その粒度は内訳として表現できます。

判定式 `stripped + passthrough == total` は、3 分類のもとで
「error 以外のすべてのファイルが評価を完了した」ことを表します。
4 分類のままでは `stripped + passthrough + skipped == total` となり、
項が 1 つ増えるぶん検証時の記述が長くなります。

Option C を採らない理由を示します。
skipped 件数を保持しないと、2 回目以降の実行において
「6398 件を除去した」実行と「全件が処理済みで 1 件も除去しなかった」実行が
サマリー上で区別できません。
後者では stripped が 0 となりますが、判定式は成立するため異常として検出されません。
また R-010 の退避削除は error 0 件を条件とするため、
実際には何も処理していない実行でも退避が一括削除されます。
内訳を残すことで、この判別不能を回避します。

Option D を採らない理由は、冪等性が失われるためです。
R-003 は退避削除後の再実行において唯一の判定材料であり (REQ-F-009) 、
削除すると、定型部マーカーが 2 個目以降の `## Summary` 以降に位置するファイルが
再処理され本文を失います (実測 0 件だが構造上は起こりえます) 。
本決定はラベルの統合であり、判定規則の削減ではありません。

### Consequences

- Positive:
  - 全件処理後の判定が `stripped + passthrough == total かつ error == 0` の 2 条件で表現できます
  - 分類ラベルが副作用の違いと 1 対 1 で対応します (変更あり / 変更なし / 異常)
  - Section 3.2 の分類表が 3 行となり、実行拒否との区別が明確になります
- Negative:
  - 「処理済みのためスキップした」ことが分類ラベルから直接読み取れなくなります
    → サマリーの内訳として件数を報告するため、判別可能性は保たれます
  - 既存の受け入れ基準のうち skipped を期待値とするもの (AC-006 / AC-014) の文言修正が必要です
    → 期待値を「passthrough として計上され、うちスキップ内訳に含まれる」に改めます
  - 分類の再定義にあたるため、requirements / specifications ともに MAJOR 相当の変更となります

---

## DR-14: 処理済みマーカーをキャッシュへ移し、本体の frontmatter を変更しない - 2026-08-12

**Phase**: review-harden
**Status**: Accepted

### Context

DR-04 は処理済みマーカーを private フィールド `_status` として本体の frontmatter に付与すると定めました。
この決定は再実行の冪等性を担保する一方、いくつかの副次的な制約を要求しています。

- REQ-F-011 — private フィールドを `normalizeLogs/` と `outputLogs/` に漏出させない
- REQ-C-006 — 2 つの共有ホワイトリストへ private フィールドを追加することの禁止
- REQ-C-005 — `toFrontmatter()` の `fieldOrder` 明示 (既定引数では未知フィールドが消える)
- DD-01 — 既存キー順を取得するための `keys()` を共有クラスへ追加

これらはいずれも「本体の frontmatter に書き込む」ことから派生した要求です。
REQ-C-006 の Rationale は、ホワイトリストへの追加により REQ-F-011 が
沈黙のうちに破れる旨を記しており、防御が構造的でないことを認めています。

あわせて、11671 件規模では処理の中断が現実に起こりえます。
中断後の再実行において、処理済みファイルの再評価を避ける手段が必要です。

本プロジェクトの他スキル (classify / filter / normalize / set-frontmatter) は
いずれも `ChatlogCache` を用いて処理状態を保持しており、
既定の保存先は `DEFAULT_CACHE_ROOT` (`${TEMP}/cle-cache`) です。
とくに `set-frontmatter` は `phase-status.ts` において
`cache.read(filePath).status === 'written'` による処理済みスキップを実装済みです。
strip のみが本体への書き込みによって同じ目的を達成する設計になっていました。

### Decision

処理済みマーカーの保持先を、本体の frontmatter から `ChatlogCache` へ移します。
本体の frontmatter は strip 処理において一切変更しません。

1. `_status` を本体の frontmatter に付与しません。DR-04 の決定を破棄します
2. 処理済み状態は `ChatlogCache` に保持します。他スキルと同一の機構を用います
3. strip が本体へ加える変更は、本文先頭から最初の `## Summary` 直前までの除去のみとします

判定順序における処理済み判定は、キャッシュ参照に置き換えます。
キャッシュに処理済みの記録を持つファイルは、本体を開かずに処理済みスキップとします
(分類ラベルは DR-15 により `done` です) 。

キャッシュが失われた場合は、当該実行をやり直すものとします。
キャッシュはファイルごとに一意であり、その退避と復元はユーザーの手動運用に委ねます。
本プロジェクトの他スキルも同様の扱いであり、strip のみに特別な永続化を設けません。

### Alternatives Considered

- Option A: 処理済みマーカーをキャッシュへ移し、本体を変更しない (採用)
- Option B: DR-04 のまま本体の frontmatter に `_status` を付与する
- Option C: 記録を一切持たず、`.bak` の存在のみを処理済みの根拠とする

### Rationale

**Option A は、本体を汚さないことにより、派生する制約群をまとめて不要にします。**

Option B が要求する REQ-F-011 / REQ-C-006 / REQ-C-005 / DD-01 は、
いずれも本体への書き込みに起因します。書き込みをやめれば、これらは前提ごと消えます。
とくに REQ-F-011 の漏出防止は 3 つのディレクトリにまたがる関心事であり、
2 つのホワイトリストに private フィールドを追加しないことのみで担保されていました。
キャッシュへ移すことで、漏出の経路が構造的に存在しなくなります。

本体を変更しない利点は、frontmatter の再構築が不要になる点にもあります。
Option B では除去後に frontmatter を組み立て直すため、
未知フィールドの消失とキー順の変化を `fieldOrder` の明示により防いでいました (Edge 9) 。
Option A では frontmatter を読み取るだけで書き戻さないため、この risk 自体が発生しません。

判定を純粋なフィルタとして表現できる点も、本プロジェクトの規約に整合します。
処理済み判定が本体の読み取りを伴わないため、
未処理ファイルのみを対象とする絞り込みを、副作用のない述語として構成できます。

Option C を採らない理由は、DR-08 が `.bak` を一括削除するためです。
削除後の再実行では判定材料が失われ、冪等性が成立しません。
この経路は REQ-F-009 の Rationale が既に指摘しています。

Option B を採らない理由には、上記の制約群に加えて次の点があります。
`originalLogs/` は `export-chatlogs` の出力先であり、その内容は再 export により再現できます。
本体に strip 固有の状態を書き込むと、再 export した内容と食い違いが生じます。

### Consequences

- Positive:
  - REQ-F-011 / REQ-C-006 / REQ-C-005 と DD-01 が不要になります
  - private フィールドが下流へ漏出する経路が構造的に消えます
  - strip が本体へ加える変更が本文の除去のみとなり、frontmatter は不変となります
  - 未知フィールドの消失とキー順の変化 (Edge 9) が発生しません
  - 処理状態の保持機構が他の 4 スキルと統一されます
  - 中断後の再実行において、未処理ファイルのみを対象とする絞り込みが可能になります
- Negative:
  - キャッシュを失うと処理済みの記録も失われ、当該実行のやり直しとなります
    → 他スキルと同一の扱いです。キャッシュの退避と復元はユーザーの手動運用に委ねます
  - キャッシュ喪失後の再実行では、strip 済みファイルが再評価されます
    → strip 済みファイルは本文が `## Summary` から始まり定型部マーカーを持たないため、
    R-006 により passthrough となります。本文は破壊されません
  - 先頭 strip 後もなお定型部が残るファイルは、キャッシュ喪失後の再実行で再度 strip されます
    → `.bak` が存在する間は R-004 が防ぎます。`.bak` 削除後かつキャッシュ喪失後に限られます。
    実測 11671 件中 0 件であり、現データセットでは該当しません。
    ただし定型部マーカーが 2 個目以降の `## Summary` 以降に位置する構造は原理的に起こりえるため、
    Q-02 が取りこぼしを許容した先例に倣い、発生時の損失を許容します
  - DR-04 の決定を破棄するため、requirements / specifications ともに MAJOR 相当の変更となります

---

## DR-15: 処理済みスキップを `done` として独立した分類に戻す - 2026-08-13

**Phase**: review-harden
**Status**: Accepted

### Context

DR-13 は分類を stripped / passthrough / error の 3 つに統合し、
処理済みスキップ (R-003 / R-004) を passthrough の内訳として報告すると定めました。
統合の根拠は「passthrough と skipped は観測可能な副作用が同一である」ことでした。

その後 dry-run の出力仕様を詰める過程で、この統合が 2 回目以降の実行で情報を潰すことが判明しました。

dry-run では副作用が全件ゼロであるため、副作用の同一性を根拠とする統合は成立しません。
さらに分類の意味が実行回数によって変わります。
1 回目の dry-run で stripped と報告されたファイルは「これから除去される」という予測であり、
本番実行後の 2 回目では同一ファイルが passthrough に移動します。
内訳を持たないフラットな件数では、「除去した実行」と「全件が処理済みであった実行」を
サマリー上で区別できません。

DR-13 自身がこの判別不能を Option C の却下理由として挙げており、内訳による回避を選びました。
しかし内訳は分類ラベルではないため、集計構造としては表現されません。

既存スキルの実装を確認したところ、本番の分類軸に対してカウンタを追加する形が慣行として確立しています。

- `BaseStats.skip` — 「dry-run/report 等により判定・削除の実行自体を行わなかった数」
- `ClassifyStats.skip` — 「dry-run のため AI 呼び出しをスキップした件数」
- normalize `Stats.skip` — 「dry-run による分割スキップの件数」
- setfm `Stats.skip` — 「スキップされたファイル数（dryRun 等）」

とりわけ `normalize.types.ts` は、処理済みと dry-run スキップを別カウンタとして持ちます。

- `done` — 「既に分割済み（既正規化ファイル）でスキップされた件数」
- `skip` — 「dry-run による分割スキップの件数」

これは strip が必要とする区別と同一の構造です。

### Decision

処理済みスキップを `done` として独立した分類に戻します。DR-13 の統合を破棄します。

1. 分類を stripped / `done` / passthrough / error の 4 つとします
2. カウンタ名は `skip` ではなく `done` とします
3. 判定規則 R-002 〜 R-008 とその評価順序は変更しません。変更するのは分類ラベルの割り当てのみです
4. `done` は dry-run 専用ではありません。通常実行のサマリーにも常設します

規則と分類の対応を次のとおり定めます。

| 分類          | 該当規則      | 意味                                  |
| ------------- | ------------- | ------------------------------------- |
| `stripped`    | R-008         | 定型部を除去した                      |
| `done`        | R-003 / R-004 | 既に strip 済みのため再処理を回避した |
| `passthrough` | R-005 / R-006 | 除去対象外（定型部を持たない）        |
| `error`       | R-002 / R-007 | 前提の破れ・除去結果の異常            |

全件処理後の判定式を次のとおり改めます。

```text
stripped + done + passthrough == total  かつ  error == 0
```

dry-run 固有の差異は、`stripped` バケットの表示上の時制のみとします。
分類ロジックそのものは通常実行と同一です。

### Alternatives Considered

- Option A: `done` を独立分類として追加し、通常実行にも常設する (採用)
- Option B: DR-13 の 3 分類を維持し、内訳のみで報告する
- Option C: dry-run のときだけ 4 分類にし、通常実行は 3 分類のままとする
- Option D: 独立分類の名前を `skip` とする

### Rationale

**Option A は、集計構造を実行モードとは別に、一定に保ちます。**

分類ラベルは集計の単位であり、内訳は集計の単位ではありません。
DR-13 が保持しようとした判別可能性は、ラベルに昇格させて初めて集計構造として表現されます。
`done` を常設することで、1 回目と 2 回目の実行差分が
「`stripped` にあった件数が `done` へ移動した」として素直に読み取れます。

Option B を採らない理由は、DR-13 の統合根拠が dry-run で成立しないためです。
DR-13 は副作用の同一性を根拠としましたが、dry-run では全分類の副作用がゼロであり、
副作用による区別そのものが消滅します。
根拠が成立しない領域へ決定を延長できません。

Option C を採らない理由は、dry-run が事前検証として機能しなくなるためです。
REQ-F-005 は dry-run の出力を監査ログとして機能させることを求めています。
モードによって集計構造が異なると、
「dry-run で passthrough=40 だったのに本番サマリーでは passthrough=10」という状態が生じ、
dry-run の結果から本番の結果を予測できません。

Option D を採らない理由は、既存 4 スキルとの意味の衝突です。
既存の `skip` はいずれも「dry-run だから評価・実行しなかった」を意味します。
strip の処理済みは通常実行でも発生する恒久的な分類であり、別の概念です。
同名を用いると、他スキルを読んだ実装者が dry-run 固有のカウンタと誤読します。
`normalize.types.ts` が `done` と `skip` を使い分ける先例に倣います。

判定規則を変更しない理由は DR-13 と同じです。
R-003 は退避削除後の再実行において唯一の判定材料であり (REQ-F-009) 、
削除すると、定型部マーカーが 2 個目以降の `## Summary` 以降に位置するファイルが
再処理され本文を失います (実測 0 件だが構造上は起こりえます) 。

### Consequences

- Positive:
  - dry-run と通常実行で集計構造が一致し、dry-run が事前検証として機能します
  - 2 回目以降の実行において「除去した実行」と「全件処理済みの実行」が分類ラベルから直接読み取れます
  - 分類ラベルが判定規則 R-002 〜 R-008 と 1 対 1 に対応します
  - カウンタ名 `done` が既存の `skip` と意味的に衝突しません
- Negative:
  - 全件処理の判定式の項が 1 つ増えます
    → DR-13 が簡潔さを理由に統合した点を部分的に戻すことになりますが、
    判別可能性を集計構造で表現する利益が上回ります
  - 分類ラベルと副作用が 1 対 1 でなくなります (`done` と `passthrough` はいずれも無変更)
    → 呼び出し元が両者へ異なる後続処理を行う場面はありません。
    区別の目的は報告であり、報告のためのラベルとして許容します
  - DR-13 の決定を破棄するため、requirements / specifications ともに変更が必要となります
    → 判定規則は不変であり、変更は分類ラベルと集計式に限られるため MINOR 相当とします

---

## DR-16: 退避削除の前に退避の包含関係を検査する - 2026-08-13

**Phase**: review-harden
**Status**: Accepted

### Context

codex risk レビューは、R-004 が既存の退避を処理済みの根拠として用いる一方で
R-010 がその退避を削除することを、「保護判定に使った証拠を最後に消す設計」と指摘しました。

この指摘に対し spec v3.1.2 は、処理済みの一次的な判定材料がキャッシュであり (DR-14) 、
R-003 を R-004 より先に置く順序制約により冪等性が保たれることを示しました。
削除範囲は変更せず、キャッシュ喪失時の縮退挙動を明記する対応です。

しかしこの対応は「キャッシュが健在であれば安全である」ことを示したにとどまり、
**削除を実行してよいかを実行時に確かめる手段**を与えていません。

R-010 の現行条件は error の有無のみです。
error が 0 件であっても、次の状態は検出されません。

- `stripped` と計上したにもかかわらず、対応する退避が存在しない

これは Phase 4 (退避作成) と Phase 5 (差し替え) の間で
退避が失われた場合などに生じます。
当該ファイルは復旧手段を持たないまま本体が書き換わった状態であり、
この状態で残りの退避を一括削除すると、被害が拡大します。

### Decision

R-010 の削除条件に、退避の包含関係の検査を追加します。

削除は次の 2 条件がともに成立する場合にのみ実行します。

1. error が 0 件であり、かつ dry-run が指定されていない (現行条件)
2. `stripped` と判定したファイルのパス集合が、存在する退避のパス集合に包含される

```text
{ stripped と判定したファイルのパス } ⊆ { 存在する退避のパス }
```

包含が成立しない場合、退避を保持し、不足している退避のパスを報告します。
終了コードは成功以外とします。

削除範囲は変更しません。対象ディレクトリ配下の退避全件のままです (DD-02) 。
本決定が変更するのは削除の**可否判断**であり、削除の**範囲**ではありません。

### Alternatives Considered

- Option A: パス集合の包含関係を検査する (採用)
- Option B: 件数の一致を検査する (`.bak` の件数 == stripped の件数)
- Option C: 件数の下限を検査する (`.bak` の件数 >= stripped の件数)
- Option D: 検査を追加せず、現行の error 判定のみとする

### Rationale

**Option A は、検出したい異常と検査が 1 対 1 で対応します。**

検出すべきは「`stripped` にしたのに退避が無い」という個別ファイルの状態です。
パス集合の包含はこの状態を直接表現します。

Option B を採らない理由は、等式が仕様上成立しないためです。
退避の件数が `stripped` の件数と一致しない経路が 3 つあります。

| 経路                            | 影響                                                     |
| ------------------------------- | -------------------------------------------------------- |
| 前回実行が error で終了した     | R-011 により退避が全保持され、次回は `done` となり計上外 |
| Phase 4 と Phase 5 の間での中断 | 退避は存在するが `stripped` に計上されていない           |
| 他プロセス・手動作業由来の退避  | 仕様は作成元を区別しません (codex risk 前提 3)           |

いずれも正常な状態であり、等式で異常と判定するのは誤りです。

Option C を採らない理由は、余剰と欠損が相殺するためです。
前回中断で残った退避が 5 件あり、今回 `stripped` のうち 3 件の退避が失われた場合、
件数は下限条件を満たしますが、3 件は復旧手段を持ちません。
集合の包含であれば相殺は起こりません。

Option D を採らない理由は、codex の指摘に対する答えが
「キャッシュがあるので大丈夫」という前提の主張にとどまるためです。
本決定は「消す前に整合を確かめる」という実行時の検査を与えます。

追跡コストは低く保たれます。
`stripped` と判定したファイルのパスは Phase 2 の判定結果として既に保持しており、
新たな状態管理を要しません。

### Consequences

- Positive:
  - 復旧手段を失った状態で残りの退避を削除する経路が塞がれます
  - codex risk 前提 3 に対し、前提の主張ではなく実行時の検査で答えます
  - 削除範囲を変更しないため、DD-02 の一括削除方針と両立します
  - 検査に要する情報は Phase 2 の判定結果に含まれ、追加の追跡を要しません
- Negative:
  - R-010 の条件が 1 つ増え、削除が発動しない経路が追加されます
    → 発動しない場合でも退避が保持されるだけであり、本体は正常な strip 済み状態です
  - 包含検査のために退避の一覧取得が必要になります
    → 削除のために同じ一覧を取得するため、追加の走査は生じません
  - spec の R-010 と、それを参照する REQ-F-010 の更新を要します
    → 削除範囲は不変であり、変更は可否判断に限られるため MINOR 相当とします

---

## Change History

<!-- markdownlint-disable line-length -->

| Date       | Version | Description                                                                                                                                                                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | 1.0.0   | Initial release。DR-01（除去境界）/ DR-02（in-place + 退避）/ DR-03（`BackupProvider` 抽象化）を収録                                                                                                                                |
| 2026-08-12 | 1.1.0   | DR-04（処理済みマーカーを private フィールド `_status` として付与）を追加                                                                                                                                                           |
| 2026-08-12 | 1.2.0   | DR-05（実装上の禁止事項を制約要件として規範化）を追加                                                                                                                                                                               |
| 2026-08-12 | 1.3.0   | DR-03 を改訂。`writeTextFileWithBackup` の新設をやめ、既存 `writeTextFile` に `BackupProvider` を追加する方式へ変更                                                                                                                 |
| 2026-08-12 | 1.4.0   | DR-06（`.bak` 削除条件を `_status` 基準とし、最終的な復旧手段は re-export）を追加                                                                                                                                                   |
| 2026-08-12 | 1.4.1   | Change History 表を追加（`deckrd-rule-document-versioning.md` の同期規定に未準拠だったため遡及して記録）                                                                                                                            |
| 2026-08-12 | 1.5.0   | DR-07（未検証データセットへの適用は受理範囲の限定によって強制する）を追加                                                                                                                                                           |
| 2026-08-12 | 2.0.0   | DR-08（`.bak` 削除を対象ディレクトリ単位の一括削除とする）を追加し、DR-06 の決定 1（`_status` 基準）を破棄。passthrough が `_status` を持たず条件が成立しない問題を解消。DR-03 の戻り値の根拠を追跡用途から `.bak` 既存の判別へ改訂 |
| 2026-08-12 | 2.1.0   | DR-09（frontmatter を持たないファイルを error として扱う）を追加。spec explore レビューの F-01 を決定として記録し、spec v1.1.0 / requirements v2.1.0 で先行実装済みの内容に根拠を与える                                             |
| 2026-08-12 | 2.2.0   | spec harden レビューを反映。DR-10（退避削除の失敗を報告し終了コードに反映）/ DR-11（REQ-F-008 の到達不能な判定基準を削除）/ DR-12（`backupPath` の戻り値を `Promise<string>` に単純化）を追加                                       |
| 2026-08-12 | 2.3.0   | DR-13（ファイル単位の分類を 3 つに統合）を追加。skipped を passthrough に統合し、件数は内訳として保持する。判定規則 R-003 / R-004 は冪等性のため存置                                                                                |
| 2026-08-12 | 3.0.0   | DR-14（処理済みマーカーをキャッシュへ移し本体の frontmatter を変更しない）を追加し、DR-04 の決定を破棄。本体への `_status` 付与に由来する REQ-F-011 / REQ-C-005 / REQ-C-006 と DD-01 が不要となる                                   |
| 2026-08-13 | 3.1.0   | DR-15（処理済みスキップを `done` として独立した分類に戻す）を追加し、DR-13 の統合を破棄。分類を 4 つとし判定式を `stripped + done + passthrough == total` に改める。判定規則 R-002 〜 R-008 とその順序は不変                        |
| 2026-08-13 | 3.2.0   | DR-16（退避削除の前に退避の包含関係を検査する）を追加。R-010 の削除条件に「stripped と判定したファイルのパス集合が存在する退避のパス集合に包含される」を加える。削除範囲は不変 (DD-02 維持)                                         |
| 2026-08-13 | 3.2.1   | 再実測により DR-01 / DR-13 / DR-14 / DR-16 の根拠データを訂正。対象 6402→6398 / passthrough 3888→3890 / 先頭 strip 後の定型部残存 2 件→0 件。取りこぼしを 6 件（0.09%）→4 件（0.06%）へ。決定内容の変更は伴わない                   |

<!-- markdownlint-enable line-length -->
