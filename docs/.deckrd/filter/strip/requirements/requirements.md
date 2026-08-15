---
title: "Requirements: filter strip"
module: "filter/strip"
status: Draft
version: 8.5.0
created: "2026-08-12"
---

<!-- cspell:words setfm -->

<!-- textlint-disable
  ja-technical-writing/sentence-length
  -->

## 1. Overview

### 1.1 Purpose

エクスポート済みチャットログ Markdown の冒頭に埋め込まれた set-frontmatter 由来の定型プロンプト部を除去し、実質的な会話内容のみを残す `strip` サブコマンドを追加する。

### 1.2 Scope

- `filter strip <agent> <YYYY-MM>` サブコマンドの新設 (period は必須。REQ-C-008 参照)
- 対象ディレクトリ配下の `.md` を走査し、定型部マーカーを持つファイルのみを対象に、先頭から最初の `## Summary` 直前までを除去する
- 元ファイルを `.bak` として退避し、元のファイル名で strip 済みファイルを書き出す
- `ChatlogCache` の処理済み記録 (`stripped` / `passthrough`) および既存 `.bak` を処理済みの根拠として扱い、
  再実行を冪等にする (DR-14 / DR-31)
- error が 0 件であり、かつ退避の包含関係が成立する場合に `.bak` を一括削除する (DR-16)
- `--dry-run` による非破壊確認
- 処理結果サマリー (対象件数・除去バイト数・`.bak` 削除件数) の報告

**Out of Scope**:

- ファイル単位の削除 (既存の `noise-filter` / `filter` の責務)
- Codex プリアンブル判定によるファイル削除 (issue cle-cs4 の責務)
- 定型部の再生成・復元機能 (`.bak` からの復元はユーザーによる手動操作とする)
- 再 export 後のキャッシュ整合の自動回復 (再 export 時のキャッシュ消去はユーザーの責任とする)
- `## Summary` を持たないファイルの内容変更
- ネストされたログ内部 (2 個目以降の `## Summary` 以降) に出現する定型部の除去

## 2. Context

- Target Environment: TypeScript / Deno、Windows 11 (パス区切りは `/` 正規化)
- Related Components:
  - `skills/filter-chatlogs/` — 本機能の設置先。`noise-filter-chatlogs.ts` が最も近い実装テンプレート
  - `skills/_cle-libs/libs/io/parse-args.ts` — `parseArgs` が `agent` / `YYYY-MM` / `--dry-run` を既に解釈する
  - `skills/_cle-libs/libs/file-io/resolve-directory.ts` — `resolveChatlogsDir` / `agentPath` / `periodToPath`
  - `skills/_cle-libs/libs/file-ops/find-files.ts` — `findFiles` (単一 `ext` フィルタのみ。除外パターンは持たない)
  - `skills/_cle-libs/libs/file-io/write-utils.ts` — `writeTextFile` (tmp+rename の原子的書き込み) 。
    DR-03 により `BackupProvider` を受け取る第 3 引数を追加する
  - `skills/_cle-libs/libs/file-ops/backup-old-path.ts` — `backupOldPath` (退避名は `.old-NN.md` 連番)。
    normalize 等の既存用途向け。strip は `.bak` 方式の `backupToBak` を用いる (DR-03 / DR-17 参照)
  - `skills/_cle-libs/libs/file-ops/exists-utils.ts` — `fileExists` (退避ファイルの存在判定に用いる)
  - `skills/_cle-libs/libs/text/frontmatter-utils.ts` — `divideEntry` / `hasFrontmatter` (いずれも読み取り専用)
  - `skills/_cle-libs/classes/ChatlogFrontmatter.class.ts` — frontmatter の同一性比較に用いる (AC-024) 。
    strip は frontmatter を再構築しないため `set()` / `toFrontmatter()` は用いない (DR-14)
  - `skills/_cle-libs/classes/ChatlogCache.class.ts` — 処理済み状態の記録・参照に用いる (DR-14)
  - `skills/_cle-libs/classes/ChatlogEntry.class.ts` — `renderEntry()` は **本機能では使用しない** (DR-04)。
    `DEFAULT_ORDERED_FIELDS` への並べ替えと tag への `#` 付与を伴うため
  - `skills/_cle-libs/classes/ChatlogError.class.ts` / `libs/io/logger.ts`
- Assumptions:
  - 定型部の境界は `## Summary` 見出しで安定して判定できる (実測により 6668 件中 6398 件が該当)
  - 定型部の正本 `.config/chatlog-exporter/prompts/meta.yaml` はテンプレートであり、展開後テキストとの完全一致比較には使えない
  - サブコマンド分岐は `skills/filter-chatlogs/SKILL.md` 層が担う。
    TypeScript スクリプトは `strip` トークンを除いた引数を受け取る。
    `parseArgs` は `strip` を位置引数として解釈できず `UnknownPositional` を throw する

### System Context Diagram

```text
[User / CLI]        --> +----------------------+ --> [<name>.md      (strip 済み)]
 filter strip           |     filter strip     |      frontmatter は不変
 <agent> <YYYY-MM>      |                      |
                        |                      | --> [<name>.md.bak  (元ファイル退避)]
[originalLogs/*.md] --> |                      |      error 0 かつ包含成立なら一括削除
                        |                      |
[ChatlogCache]      <-> |                      |      (処理済み状態の記録・参照)
                        |                      |
[config.yaml        --> |                      | --> [Summary: total/stripped/
 GlobalConfig]          +----------------------+       passthrough/error
                                                       + .bak 削除件数]
```

<!-- ASCII diagram only. Mermaid, PlantUML, and SVG are prohibited. -->

## 3. Design Decisions (Summary)

<!-- markdownlint-disable line-length -->

| ID    | Decision                                                                           | Linked Record                |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------- |
| DR-01 | 除去境界は「先頭から最初の `## Summary` 直前まで」とする                           | ../decision-records.md#DR-01 |
| DR-02 | 出力方式は in-place + `.bak` 退避とする (issue cle-2rf の別ディレクトリ案を破棄)   | ../decision-records.md#DR-02 |
| DR-03 | 退避方式を `BackupProvider` として抽象化し、既存 `writeTextFile` を拡張する        | ../decision-records.md#DR-03 |
| DR-04 | 処理済みマーカーは private フィールド `_status` として付与する（DR-14 により破棄） | ../decision-records.md#DR-04 |
| DR-05 | 実装上の禁止事項を散文ではなく制約要件として規範化する                             | ../decision-records.md#DR-05 |
| DR-06 | `.bak` 削除条件を `_status` 基準とし、最終的な復旧手段は re-export とする          | ../decision-records.md#DR-06 |
| DR-07 | 未検証データセットへの適用は受理範囲の限定によって強制する                         | ../decision-records.md#DR-07 |
| DR-09 | frontmatter を持たないファイルを error として扱う                                  | ../decision-records.md#DR-09 |
| DR-10 | 退避削除の失敗を報告し、終了コードに反映する                                       | ../decision-records.md#DR-10 |
| DR-11 | REQ-F-008 の到達不能な判定基準を削除する                                           | ../decision-records.md#DR-11 |
| DR-12 | `backupPath` の戻り値を `Promise<string>` に単純化する (DR-17 により破棄)          | ../decision-records.md#DR-12 |
| DR-13 | ファイル単位の分類を 3 つに統合する (DR-15 により破棄)                             | ../decision-records.md#DR-13 |
| DR-14 | 処理済みマーカーをキャッシュへ移し、本体の frontmatter を変更しない                | ../decision-records.md#DR-14 |
| DR-15 | 処理済みスキップを `done` として独立した分類に戻す                                 | ../decision-records.md#DR-15 |
| DR-16 | 退避削除の前に退避の包含関係を検査する                                             | ../decision-records.md#DR-16 |
| DR-17 | 退避 Provider を `backupToBak` とし、既存 `.bak` はスキップして `null` を返す      | ../decision-records.md#DR-17 |

<!-- markdownlint-restore --->

### DR-01 の根拠 (実測データ)

`chatlogs/originalLogs/claude/2026/2026-07` (全 11671 件) を実測した結果は次のとおりです。

**定型部を持つ 6668 件の内訳:**

| 分類                                        | 件数 |
| ------------------------------------------- | ---- |
| 定型部が最初の `## Summary` より前 (先頭型) | 6398 |
| `## Summary` を持たない                     | 266  |
| 定型部が最初の `## Summary` より後ろ        | 4    |

除去対象 6398 件のうち複数 `## Summary` を持つファイルは 976 件存在しますが、
先頭 strip 後も定型部が残るものは **0 件**です。
定型部マーカーを複数持つファイルは 271 件ありますが、いずれも最初の `## Summary` より前に集中しており、
先頭 strip により全て除去されます。

したがって単純な先頭アンカー方式で 6398 件を処理でき、取りこぼしは後方配置の 4 件に限定されます。

なお「先頭 strip 後もなお定型部が残る」構造は原理的に起こりえます。
定型部マーカーが 2 個目以降の `## Summary` 以降に位置する場合です。
実測では該当しませんが、テンプレートの変更により将来発生しうるため、
Edge ケースとしての扱いは維持します (specifications.md Edge 14) 。

**`## Summary` を持つ 10288 件の内訳 (REQ-F-000 の根拠) :**

| 分類                      | 件数 |
| ------------------------- | ---- |
| 定型部を持つ (除去対象)   | 6398 |
| 定型部を持たない (対象外) | 3890 |

`## Summary` の存在のみを条件とすると 3890 件を誤って破壊します。
除去には定型部マーカーの存在確認を必須とします (REQ-F-000) 。

### DR-02 の根拠

issue cle-2rf の当初設計は「別ディレクトリ出力を既定とする」でしたが、ヒアリングにより in-place + `.bak` 方式へ変更しました。
`.bak` が復旧手段を担保するため、`chatlogs/` が git 管理外である問題に対処できます。
**この決定は issue cle-2rf の Design および受け入れ基準と矛盾するため、issue 側の更新が必要** (Open Questions Q-01 参照) 。

## 4. Functional Requirements

### REQ-F-000: 除去対象ファイルの選別

- EARS Type: unwanted behavior

```text
GIVEN 対象ファイルの本文先頭から最初の `## Summary` 直前までの範囲に、定型部マーカー
      `## TOPICS ASSIGNMENT RULES` が存在しない
  NOT DO 当該ファイルの本文を除去する
THEN the system SHALL 当該ファイルを対象外 (passthrough) として無変更のまま残す。
```

**Rationale**: `## Summary` の存在だけを条件にすると、定型部を持たないファイルまで先頭が削除されます。
実測では `## Summary` を持つ 10288 件のうち **3890 件は定型部を持ちません**。
これらのファイルの「先頭部」はタイトル・`## 会話ログ` 見出し・実際のユーザー発話であり、除去は実コンテンツの破壊にあたります。
さらに `### User` 発話の本文が偶然 `## Summary` で始まる例 (`2026-07-25-summary-22dc01be88ca.md`) も存在するため、
定型部マーカーの存在確認は誤削除を防ぐ必須の前提条件です。

**Acceptance Criteria**:

| AC ID  | Scenario                                               |
| ------ | ------------------------------------------------------ |
| AC-010 | 定型部を持たない `## Summary` 付きファイルが不変である |

### REQ-F-001: 定型プロンプト部の除去

- EARS Type: event-driven

```text
GIVEN 対象ファイルが frontmatter を持ち、本文先頭から最初の `## Summary` 直前までの範囲に
      定型部マーカー `## TOPICS ASSIGNMENT RULES` を含む
  WHEN `filter strip <agent> <YYYY-MM>` が実行される
THEN the system SHALL 本文先頭から最初の `## Summary` の直前までを除去し、`## Summary` 以降を変更せずに保持する。
```

**Rationale**: 定型部はファイルサイズの平均 77.8% を占め、AI 判定に回すとトークンの 8 割を消費します。除去により後続処理の spend limit 到達リスクを解消します。

**Acceptance Criteria**:

| AC ID  | Scenario                                     |
| ------ | -------------------------------------------- |
| AC-001 | 先頭型ファイルの定型部が除去される           |
| AC-002 | `## Summary` / `## Excerpt` 以降が保持される |

### REQ-F-002: frontmatter の保持

- EARS Type: state-driven

```text
GIVEN 対象ファイルが frontmatter を持つ
  WHILE strip 処理が実行されている
THEN the system SHALL 既存の全フィールド (session_id / date / project 等) を値・順序ともに変更せずに保持する。
```

例外はありません。フィールドの追加・変更・削除・並べ替えのいずれも行ってはなりません (DR-14) 。
処理済み状態は `ChatlogCache` に記録するため、frontmatter への付与を要しません。

**Rationale**: frontmatter は分類・検索のためのメタデータであり、本文の除去とは独立して維持される必要があります。
処理済みマーカーの保持先を `ChatlogCache` としたことで (DR-14) 、frontmatter を完全に不変とできます。
同一性の判定基準は AC-024 に定めます。

**Acceptance Criteria**:

| AC ID  | Scenario                                              |
| ------ | ----------------------------------------------------- |
| AC-003 | 既存 frontmatter フィールドが値・順序ともに保持される |

### REQ-F-003: 対象外ファイルの無変更通過

- EARS Type: unwanted behavior

```text
GIVEN 対象ファイルが本文に `## Summary` 見出しを 1 つも含まない
  NOT DO ファイル内容を変更する、または `.bak` を作成する
THEN the system SHALL 当該ファイルを無変更のまま残し、passthrough として計上する。
```

**Rationale**: 実測 266 件が該当します。境界が判定できないファイルへの推測による除去は、実質コンテンツの破壊につながります。

**Acceptance Criteria**:

| AC ID  | Scenario                                                |
| ------ | ------------------------------------------------------- |
| AC-004 | `## Summary` を持たないファイルがバイト単位で不変である |

### REQ-F-004: 元ファイルの `.bak` 退避

- EARS Type: event-driven

```text
GIVEN 対象ファイルが除去対象と判定され、かつ `<name>.md.bak` が存在しない
  WHEN strip 処理がファイルを書き出す
THEN the system SHALL 元ファイルを `<name>.md.bak` にリネームしたうえで、元のファイル名で strip 済み内容を書き出す。
```

**Rationale**: `chatlogs/` は `.gitignore` 済み (`chatlogs/.gitignore:13` の `/*`) で git による復旧ができないため、破壊的操作には明示的な復旧手段が必要です。
最終的には `export-chatlogs` の再実行で復元できますが (DR-06) 、全セッションの再変換を伴うため、`.bak` を第一の復旧手段とします。

**Acceptance Criteria**:

| AC ID  | Scenario                      |
| ------ | ----------------------------- |
| AC-005 | `.bak` に元の内容が保存される |

### REQ-F-007: 既存 `.bak` がある場合のスキップ (冪等性)

- EARS Type: unwanted behavior

```text
GIVEN 対象ファイルに対応する `<name>.md.bak` が既に存在する
  NOT DO 当該ファイルを再度 strip する、または既存の `.bak` を上書きする
THEN the system SHALL 当該ファイルを strip 済みとみなしてスキップし、done として計上する。
```

**Rationale**: 二重実行時に strip 済み内容で `.bak` を上書きすると、元ログを永久に失います。既存 `.bak` の存在を処理済みマーカーとして扱うことで、再実行を冪等にします。

**Acceptance Criteria**:

| AC ID  | Scenario                                   |
| ------ | ------------------------------------------ |
| AC-006 | 既存 `.bak` があるファイルがスキップされる |
| AC-009 | 二重実行しても `.bak` の内容が変化しない   |

### REQ-F-009: 処理済みマーカーのキャッシュ記録

- EARS Type: event-driven

```text
GIVEN 対象ファイルが除去対象と判定された、または除去対象外 (passthrough) と判定された
  WHEN strip 処理が strip 済み内容を書き出す、または passthrough の判定が確定する
THEN the system SHALL 当該ファイルの処理済み状態を `ChatlogCache` に記録する。
```

記録する処理済み状態は次の 2 種とします (DR-31 決定 1) 。

| status        | 記録の契機                         | rule (成立した規則) |
| ------------- | ---------------------------------- | ------------------- |
| `stripped`    | 除去した内容の書き込みが成立した   | R-008               |
| `passthrough` | 除去対象を持たないと判定が確定した | R-005 または R-006  |

`passthrough` の記録は本体を変更しないため、書き込みとは独立に判定の確定した時点で行います
(DR-31 決定 4) 。`rule` には成立した規則をそのまま記録します。
`passthrough` の記録に失敗した場合、当該ファイルは error として計上します (DR-31 決定 3) 。
本体は無傷ですが、`stripped` と扱いを変えると記録の失敗が成功として報告されるためです。

strip 処理は本体の frontmatter を変更してはなりません (DR-14) 。
本体へ加える変更は、本文先頭から最初の `## Summary` 直前までの除去のみとします。

再実行時の判定順序は次のとおりとします。

1. キャッシュに処理済みの記録 (`stripped` または `passthrough`) がある → done (`.bak` の有無によらず。DR-31 決定 2)
2. `<name>.md.bak` が存在する → done (REQ-F-007)
3. 定型部マーカーを持たない → passthrough (REQ-F-000)

手順 1 は本体を読み取らずに判定できます。
`passthrough` を手順 1 に含める理由は、対象ディレクトリの大半が除去対象を持たないファイルであり、
記録しなければ実行のたびに全件を読み直して再判定することになるためです (DR-31) 。
中断後の再実行では、未処理のファイルのみを後続の判定対象とします。

**既知の制約 (再 export によるキャッシュの乖離)**:
手順 1 は本体を読み取らないため、キャッシュの記録と本体の実体が乖離した場合にこれを検出できません。
`export-chatlogs` の再実行により本体が未 strip の状態へ再生成されると
(`writeSession` は既存ファイルを無条件に上書きします。DR-06 が定める復旧手段) 、
キャッシュの処理済み記録はそのまま残るため、当該ファイルは手順 1 で done と判定され strip されません。
報告上は done として正常終了するため、定型部の残存に気付けません。

**再 export 時のキャッシュ消去は利用者の責任とします。** 再 export はワークフローの再開を意図した
明示的な操作であり、キャッシュを消すか否かを判断する立場にあるのは利用者であるためです。
本ツールは再 export を検知せず、キャッシュの自動的な無効化・再検証も行いません。
運用上の手順は SKILL.md に記載します。

なお `--recover-orphans` による復帰は strip 自身の副作用であり、利用者の責任には含めません。
復帰したファイルのキャッシュエントリは strip が削除します (DR-24) 。

復帰またはキャッシュエントリの削除に失敗したファイルが 1 件以上ある場合、
失敗件数を報告したうえで終了コードを成功以外としなければなりません (DR-33) 。
乖離を残したまま成功終了すると、次回実行は手順 1 で当該ファイルを永久に done と判定し、
定型部が恒久的に残ります。この状態は 2 回目の `--recover-orphans` では回収できません (DR-27) 。
報告は終了コードの生成に先行します (DR-20 決定 3) 。

この判定は書き込み前に行い、`BackupProvider` 側には持たせません (DR-03) 。
Provider はパスのみを受け取るため手順 1 の判定を担えず、判定ロジックを分割すると保守性を損なうためです。

キャッシュは他スキル (classify / filter / normalize / set-frontmatter) と同一の
`ChatlogCache` を用い、保存先は `DEFAULT_CACHE_ROOT` に従います。
キャッシュ status の値は実装ファイルに直書きせず、定数として定義します。

**Rationale**: REQ-F-010 により `.bak` は正常終了時に削除されるため、`.bak` を唯一の処理済みマーカーとすると冪等性が失われます。
実測では strip 後の本文は `## Summary` 起点となり定型部マーカーを含まないため、
全件が REQ-F-000 で保護されます (先頭 strip 後も定型部が残るファイルは実測 0 件) 。
ただし定型部マーカーが 2 個目以降の `## Summary` 以降に位置する構造は原理的に起こりえ、
その場合は再実行で再度 strip され本文を失います。
キャッシュへの記録は `.bak` 削除後も残るため、この経路を塞ぎます。

**frontmatter の不変性の判定基準。**

AC-024 の一致はバイト単位ではなく、`ChatlogFrontmatter` による同一性比較で判定します。

`_cle-libs` の `writeTextFile` は `normalizeLine` を適用するため、
CRLF 入力では frontmatter 部の改行も LF へ変換されます (REQ-NF-003) 。
改行コードの正規化は決定事項であり、これを取りやめません。
したがってバイト単位の一致は成立せず、判定基準として用いることができません。

同一性は次の条件で判定します。

1. キー集合が一致すること
2. 各キーについて値が一致すること (`string` は `===`、`string[]` は長さと各要素の `===`、型が異なれば不一致)

**キーの出現順序は比較対象に含めません。**
strip は frontmatter を再構築しないため順序は物理的に不変であり、
順序まで判定条件に含めると、将来 frontmatter を経由する処理が入った際に過剰な制約となります。

判定は `ChatlogFrontmatter` に同一性比較の手段を追加して行います。
文字列表現の比較に依存すると、改行コード・引用符・インデントの差異が
内容の変化として誤検出されるためです。

処理済み状態を本体ではなくキャッシュに置く理由は DR-14 に記します。
本体を変更しないことで、private フィールドの下流への漏出と、
frontmatter 再構築に伴う未知フィールドの消失が構造的に発生しなくなります。

キャッシュが失われた場合は、当該実行をやり直します。
キャッシュの退避と復元はユーザーの手動運用に委ねます。
なお strip 済みファイルは本文が `## Summary` から始まり定型部マーカーを持たないため、
キャッシュ喪失後に再実行しても REQ-F-000 により passthrough となり、本文は破壊されません。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------ |
| AC-013 | strip 済みファイルの処理済み状態がキャッシュに記録される                                         |
| AC-014 | `.bak` 削除後に再実行しても strip 済みファイルが再処理されない                                   |
| AC-025 | passthrough と判定したファイルが status=`passthrough` / rule=成立規則 で記録される (DR-31)       |
| AC-026 | passthrough を記録したファイルが再実行で done と判定され再判定されない (DR-31)                   |
| AC-024 | strip 済みファイルの frontmatter が strip 前と同一である (`ChatlogFrontmatter` による同一性比較) |

### REQ-F-010: 正常終了時の `.bak` 一括削除

- EARS Type: event-driven

```text
GIVEN strip 処理が全対象ファイルの走査を完了し、error を計上したファイルが 1 件も無く、
      かつ stripped と判定した全ファイルに対応する `.bak` が存在する
  WHEN 処理が終了する
THEN the system SHALL 対象ディレクトリ配下の `.bak` を全て削除する。
```

次の場合は `.bak` を削除してはなりません。

- error を計上したファイルが 1 件以上ある (調査・復旧のため全 `.bak` を保持する)
- `--dry-run` が指定されている (そもそも `.bak` を作成しない)
- stripped と判定したファイルのうち、対応する `.bak` を持たないものがある (DR-16)

3 つ目の条件は次の包含関係として表現します。

```text
{ stripped と判定したファイルのパス } ⊆ { 存在する .bak のパス }
```

包含が成立しない場合、`.bak` を保持し、不足する `.bak` のパスを報告します。
終了コードは成功以外とします。

件数の比較では代替できません。
前回実行の中断により残った `.bak`、Phase 4 と Phase 5 の間での中断、
他プロセス由来の `.bak` により、件数は `stripped` と一致しないためです。
いずれも正常な状態であり、件数の等式で異常と判定するのは誤りです。

**Rationale**: strip 完了後も `.bak` を残すとディスク使用量が実質倍になります (対象 6398 件・元データ 275.3MB 規模) 。

削除は対象ディレクトリ単位の一括操作とします。
REQ-C-008 により対象は単一の `<agent> <YYYY-MM>` ディレクトリに限定されるため、
配下の `.bak` はすべて strip の作業対象であり、退避パスを個別に追跡する必要がありません。

削除の可否は error の有無と `.bak` の包含関係で判断します。
`_status` を条件に用いない理由は、passthrough と判定されたファイルが書き込みを受けず
`_status` を持たないため、「全ファイルが `stripped`」という条件が実質的に成立しないためです
(実測では対象 6398 件に対し passthrough が 3890 件) 。

包含関係を条件に加える理由は、error が 0 件であっても
「`stripped` と計上したのに `.bak` が無い」状態を検出できないためです (DR-16) 。
当該ファイルは復旧手段を持たないまま本体が書き換わった状態であり、
この状態で残りの `.bak` を一括削除すると被害が拡大します。

前回実行の中断により残った `.bak` も削除対象に含みます。
当該実行が全件を error なく処理し終えた時点で、対象ディレクトリの内容は正常な strip 済み状態であり、
古い `.bak` を保持する理由が無いためです。

削除は実行の最後に一括で行い、途中失敗時に「一部だけ削除済み」の中途半端な状態を作りません。

`.bak` を失った場合でも、`export-chatlogs` の再実行により `originalLogs/` を復元できます (DR-06) 。
一次ソースは `~/.claude/projects/` 配下の JSONL セッションファイルであり、
`originalLogs/` はその派生物です。`writeSession` は既存ファイルを無条件に上書きします。
したがって `.bak` は「唯一の復旧手段」ではなく、再 export の手間を省く一次的な復旧手段です。
ただし利用者が独自に置いた `.bak` は `originalLogs/` の派生物ではないため、再 export では復元できません。

削除対象には当該実行が作成していない `.bak` も含まれます。
そのため、削除する `.bak` のうち stripped と判定したファイルに由来しないものを、
削除の前に件数とパスで警告として報告します (DR-34) 。
報告は前回実行の中断により残った `.bak` と strip 以外の経路で置かれた `.bak` を区別しません。
判定材料を持たないためです。報告は終了コードに影響しません。

**Acceptance Criteria**:

| AC ID  | Scenario                                                            |
| ------ | ------------------------------------------------------------------- |
| AC-015 | 全件成功時に `.bak` が削除される                                    |
| AC-016 | error が 1 件でもあれば `.bak` が保持される                         |
| AC-025 | stripped に由来しない `.bak` の削除時に件数とパスが警告で報告される |

### REQ-F-011: private フィールドの正式版ログへの非出力

> **本要件は DR-14 により不要となりました (Superseded)** 。
> strip は本体の frontmatter を変更しないため、private フィールドは本体に存在しません。
> 以下は DR-14 以前の記録です。

- EARS Type: unwanted behavior

```text
GIVEN 対象ファイルの frontmatter に `_` で始まる private フィールド (`_status` 等) が存在する
  NOT DO 当該フィールドを normalize 出力 (`normalizeLogs/`) または正式版 (`outputLogs/`) に含める
THEN the system SHALL private フィールドを strip の作業対象 (`originalLogs/`) にのみ保持する。
```

`_status` が出力されてよいのは `originalLogs/` のみとします。

<!-- markdownlint-disable line-length -->

| 段階           | ディレクトリ     | `_status`  | 担保している実装                                                                                                     |
| -------------- | ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| strip 作業対象 | `originalLogs/`  | 出力する   | REQ-F-009 / DR-04 の `fieldOrder` 明示                                                                               |
| normalize 出力 | `normalizeLogs/` | 出力しない | `_ATTACH_FIELD_ORDER` (`segment-io.ts:43`) に含めない                                                                |
| 正式版         | `outputLogs/`    | 出力しない | `extractEntryFrontmatter` (`set-frontmatter/scripts/modules/setfm-write.ts:39`) が `DEFAULT_ORDERED_FIELDS` のみ抽出 |

<!-- markdownlint-restore -->

**Rationale**: `_` 始まりフィールドは内部管理用であり、
正式版ログは利用者・Obsidian が参照する成果物であるため、内部状態を持ち出しません。

この不変条件は既存のホワイトリスト方式により現状すでに満たされています (実測で確認済み) 。
ホワイトリストへの private フィールド追加禁止は REQ-C-006 に規定します。
将来 private フィールドを増やす場合も、ホワイトリストに含めないことで同じ防御が働きます。

**Acceptance Criteria**:

| AC ID  | Scenario                                                |
| ------ | ------------------------------------------------------- |
| AC-017 | `_status` を持つファイルの正式版出力に `_status` が無い |

### REQ-F-005: dry-run による非破壊確認

- EARS Type: feature/config-based

```text
GIVEN `--dry-run` オプションが指定されている
  WHERE strip サブコマンドが実行される
THEN the system SHALL ファイルへの書き込みおよび `.bak` 作成を一切行わず、対象ファイル一覧と判定結果を報告する。
```

dry-run の出力には、ファイルごとに次の情報を含めなければなりません (DR-29) 。

- ファイルパス
- 判定結果 (stripped / skipped / done / passthrough / error)
- `error` の場合に限り、該当した判定規則の ID

除去対象となる行範囲および除去バイト数は出力しません (DR-29) 。
事前レビューで参照されるのは分類の一覧であり、1 件ごとの行範囲・バイト数は用いられないためです。
除去規模の総量が必要な場合は REQ-F-006 のサマリーで足ります。

`error` 以外の分類で判定規則の ID を出力しない理由は、正常系の分類は分類名だけで状態が判る一方、
`error` は R-002 (前提の破れ) と R-007 (安全弁) で原因が全く異なるためです (DR-29) 。

判定のカスケードは通常実行と同一でなければならず、集計構造 (件数フィールドの集合) も
通常実行と一致しなければなりません。
dry-run 固有の差異は、除去対象と判定したファイルが `stripped` ではなく `skipped` として
報告される点に限られます (DR-29) 。書き込みを見送ったことをラベルで表すためです。
件数も同様に `stripped` ではなく `skipped` へ計上するため、dry-run の `skipped` は
同一入力に対する通常実行の `stripped` と一致します (DR-30) 。

dry-run では、ファイルへの書き込みと `.bak` 作成に加え、キャッシュへの処理済み記録も行いません。
記録した場合、次回の通常実行が全件 done となり、strip が実行されません。
`passthrough` の記録も同様に行いません (DR-31 決定 5) 。

**Rationale**: 6000 件規模の破壊的操作の前に、影響範囲を確認する手段が必要です。
件数とバイト数だけでは事前レビューとして不十分であり、dry-run 出力を監査ログとして機能させます。

集計構造を通常実行と一致させる理由は、モードによって分類が異なると
dry-run の結果から通常実行の結果を予測できず、事前検証としての用途が失われるためです。
`skipped` の件数は `stripped` へ加算するため、集計構造は 5 分類化の後も通常実行と一致します (DR-29) 。

**Acceptance Criteria**:

| AC ID  | Scenario                                                  |
| ------ | --------------------------------------------------------- |
| AC-007 | dry-run 時にファイルシステムが変更されない                |
| AC-012 | dry-run 出力にファイルパスと判定結果が 1 件ごとに含まれる |

### REQ-F-008: 異常検出による中断 (安全弁)

- EARS Type: unwanted behavior

```text
GIVEN あるファイルが frontmatter を持たない、除去範囲が本文全体に対して異常な比率を占める、
      または除去後の残存内容が実質的に空になる
  NOT DO 当該ファイルを書き換える
THEN the system SHALL 当該ファイルを error として計上してスキップし、処理を継続する。
```

判定基準は次の 2 点とします。

- frontmatter を持たない
- 除去後の本文が空、または除去率が 99% を超える

旧版 (v2.1.1 まで) は「`## Summary` 以降が存在しない」を第 3 の基準としていましたが、
DR-11 によりこれを削除しました。
`## Summary` を持たないファイルは REQ-F-003 により passthrough となり本基準に到達しません。
また DR-01 が除去範囲を「最初の `## Summary` の直前まで」と定めるため、
除去後の本文は必ず `## Summary` から始まります。
したがって当該条件は構造的に発生しません。

除去率は次の式で算出します。

```text
除去率 = 除去バイト数 ÷ 本文バイト数
```

本文バイト数は frontmatter を除いた部分の長さです。
frontmatter の長さに左右されず、除去範囲そのものの比率を評価するためです。

**Rationale**: 判定ロジックが正しいという前提だけでは破壊的処理の安全性を担保できません。
除去範囲が想定を逸脱した場合に個別ファイル単位で停止する安全弁を設けることで、誤削除の被害を局所化します。

frontmatter の欠落を error とする理由を示します。
`originalLogs/` の全ファイルは `export-chatlogs` の `renderMarkdown` により生成されます。
デリミタと `session_id` / `date` は条件分岐の外にあり、無条件に出力されます。
該当箇所は `export-chatlogs/scripts/libs/session-writer.ts` の 57 行目から 62 行目です。
したがって frontmatter を持たないファイルはパイプラインの前提が破れた状態であり、
passthrough として黙って通すのではなく、検出して報告します。
また REQ-F-009 の処理済みマーカーは frontmatter に付与するため、
frontmatter が無いファイルには付与先が存在しません。

**Acceptance Criteria**:

| AC ID  | Scenario                                              |
| ------ | ----------------------------------------------------- |
| AC-011 | 除去後が空になるファイルが error として保護される     |
| AC-023 | frontmatter を持たないファイルが error として扱われる |

### REQ-F-006: 処理結果サマリーの報告

- EARS Type: event-driven

```text
GIVEN strip 処理が全対象ファイルの走査を完了した
  WHEN 処理が終了する
THEN the system SHALL total / stripped / skipped / done / passthrough / error の件数、除去前後の合計バイト数、
     および `.bak` の削除有無 (削除件数、または保持理由) を出力する。
```

分類は stripped / skipped / done / passthrough / error の 5 つとします (DR-15 / DR-29) 。
`done` は処理済みスキップ (REQ-F-007 / REQ-F-009) を表し、`passthrough` は除去対象外を表します。
両者を統合すると、除去した実行と全件が処理済みであった実行を区別できません。
`skipped` は除去対象と判定しながら dry-run のため書き込みを見送った状態を表し、
通常実行では発生しません (DR-29) 。

サマリーの件数は分類と 1 対 1 に対応する 5 分類で報告します (DR-30) 。
`stripped` は常に「書き換えた実績」、`skipped` は常に「書き換えなかった件数」であり、
通常実行では `skipped` が 0、dry-run では `stripped` が 0 となって両者は排他になります。
dry-run で「実行すれば何件 strip されるか」を知るには `skipped` を参照します。

`done` は dry-run 専用ではなく、通常実行のサマリーにも計上します。

除去前後の合計バイト数は `bytesBefore` / `bytesAfter` として件数と同じ行に出力します。
集計対象は除去対象と分類したファイルに限ります。
すなわち通常実行では `stripped`、dry-run では `skipped` です。
値は **本文** (frontmatter を除く) の UTF-8 バイト数の合計です。
対象ディレクトリ全体のサイズではありません。
除去を伴わない分類 (`done` / `passthrough` / `error`) は本文バイト数を持ちません。
判定カスケードは本文の分割を R-005 の直前まで行わないためです。
R-002 (読み取り失敗・frontmatter 欠落) では本文自体が得られず、
R-003 / R-004 (`done`) では本文を読む前に判定が確定します。
したがって除去対象が 1 件も無い実行では両者とも 0 になります。
除去前後の差は除去範囲のバイト数 (removedBytes) の合計です。
removedBytes は除去範囲最終行の行末終端子を含みません。
このため実ファイルの縮小量とは除去 1 件あたり 1 バイト異なります。
dry-run でも同じ値を出力します。1 件ごとの明細は除去バイト数を出力しないため (REQ-F-005) 、
実行した場合の除去規模を事前に知る手段はこのサマリーだけだからです。

通常実行では、サマリーに加えて処理したファイルを 1 件ごとに報告しなければなりません (DR-29 決定 6) 。
対象は `stripped` と `passthrough` の 2 分類とし、`done` は出力しません。
再実行時は大半が `done` となるため、全件を出力するとその実行で実際に何が起きたかが読めなくなります。
退避付き書き込みに失敗した場合は、当該ファイルをエラーとして別途報告します。

全ファイルの評価を終えた時点で、次の式が成立しなければなりません (DR-15 / DR-30) 。

```text
stripped + skipped + done + passthrough == total  かつ  error == 0
```

`.bak` の削除に失敗したファイルが 1 件以上ある場合、
削除失敗件数と対象パスをあわせて出力しなければなりません (DR-10) 。
この場合の終了コードは成功以外とします。
削除失敗は既に確定したファイル単位の分類結果を取り消しません。

**Rationale**: SKILL.md 層が `::info::` 形式の出力を解析する既存パターンに合わせ、処理結果を機械可読な形で提供します。

削除失敗を報告する理由は、退避が残存したか削除されたかを利用者が判別できないと、
ディスク使用量の見積もりと次回実行時の前提が崩れるためです (DR-10) 。

**Acceptance Criteria**:

| AC ID  | Scenario                                                  |
| ------ | --------------------------------------------------------- |
| AC-008 | サマリーに 5 分類の件数と除去前後の合計バイト数が含まれる |

## 5. Non-Functional Requirements

### REQ-NF-001: Maintainability

実装は既存の `noise-filter-chatlogs.ts` の構成に従う
(`buildConfig` → ディレクトリ解決 → `findFiles` → 処理 → サマリー) 。
そのうえで純粋関数と副作用を分離します。

### REQ-NF-002: Testability

境界検出ロジックは副作用を持たない純粋関数として実装し、単体テスト可能とする。既存ユニットテストが全てパスすること。

### REQ-NF-003: Portability

実装は UTF-8 入力を扱い、CRLF / LF いずれの改行コードでも `## Summary` および定型部マーカーを検出できること。

なお `_cle-libs` の `writeTextFile` は `normalizeLine` を適用するため、除去対象ファイルの改行コードは書き出し時に正規化されます。
したがって「先頭部のみが除去され、他はすべてバイト一致」という保証は除去対象ファイルには適用されません。
対象外ファイル (passthrough) は書き込み自体を行わないため、バイト単位で不変です。

### REQ-NF-004: Safety

6000 件規模の破壊的操作を伴うため、書き込みは原子的 (tmp + rename) に行い、処理中断時に破損ファイルを残さないこと。

### REQ-NF-005: 中断時の復旧可能性 (操作順序の定義)

1 ファイルに対する処理は次の順序で行わなければなりません。

1. strip 済み内容を一時ファイル (`<name>.md.tmp`) に書き出す
2. 元ファイルを `<name>.md.bak` にリネームする
3. 一時ファイルを `<name>.md` にリネームする

いかなる時点で処理が中断しても、`<name>.md` または `<name>.md.bak` の少なくとも一方に元の内容または完全な strip 済み内容が存在しなければなりません。
手順 2 と 3 の間で中断した場合、`<name>.md` は存在せず `<name>.md.bak` に元の内容が残るため、`.bak` からの復元が可能です。

この順序は DR-03 に定める `writeTextFile` (`BackupProvider` 指定時) が実装します。
手順 1 で `.tmp` に書き出すため、書き込み中に中断しても `<name>.md` は無傷であり、REQ-NF-004 の原子性を同時に満たします。

**Rationale**: `.bak` が第一の復旧手段であるため、順序が未定義だとクラッシュ時に元ログを失い、再 export が必要になります。
`.tmp` を経由してから退避・差し替えを行うことで、いかなる中断点でも元の内容または完全な strip 済み内容の一方が必ず残ります。

## 6. Constraints

### REQ-C-001: 既存ライブラリの優先利用

引数解析・ディレクトリ解決・ファイル走査・frontmatter 分離・退避は、`skills/_cle-libs/` の既存実装を優先して利用します。
同等機能を新規実装してはなりません。
対象は `parseArgs` / `resolveChatlogsDir` / `findFiles` / `divideEntry` / `backupOldPath` / `writeTextFile` です。

ただし退避を伴う書き込みについては、既存の `writeTextFile` / `backupOldPath` をそのまま使いません。
DR-03 に定める `BackupProvider` 方式を `_cle-libs` に新規追加し、これを用います。

- `BackupProvider` 型 (`types/providers.types.ts`) — `(path: string) => Promise<string | null>`。
  戻り値は作成した退避先パス。`null` は退避を作成しなかったことを表す。
  `backupToBak` / `backupOldPath` の両実装がこの型と厳密に一致する (DR-17)
- `backupToBak` (`libs/file-ops/backup-to-bak.ts`) — `<name>.md` を `<name>.md.bak` に
  リネームする Provider。戻り値は `Promise<string | null>` (DR-17) 。
  既存の `.bak` がある場合はリネームせずスキップし `null` を返す。例外は throw しない。
  連番・世代管理は持たない
- `writeTextFile` (`libs/file-io/write-utils.ts`) — 第 3 引数に `BackupProvider` を追加。
  tmp 書き出し → 退避 → 差し替えの 3 ステップを行う。
  退避先パス、または退避を作成しなかった場合は `null` を返す (`Promise<string | null>`、DR-03 決定 4 のコード例どおり) 。
  `null` は書き込みの中断を意味せず、書き込みは成立している。未指定時は現行と同一の挙動

既存の `writeTextFile` および `backupOldPath` の挙動は変更しません。
`backupOldPath` は戻り値を `Promise<string | null>` に拡張するのみで、連番セマンティクスを維持します。

あわせて frontmatter の同一性比較を `ChatlogFrontmatter` に追加します (AC-024) 。

- `ChatlogFrontmatter` (`classes/ChatlogFrontmatter.class.ts`):
  2 つの frontmatter が同一の内容を持つかを判定する手段を追加する。
  キー集合と各キーの値を比較し、キーの出現順序は比較対象に含めない。
  値は `string` / `string[]` のいずれかであり (`FrontmatterFields`) 、
  `string[]` は長さと各要素を順に比較する

既存のメソッドの挙動は変更しません。追加のみとします。
判定を呼び出し側でインラインに実装してはなりません。
frontmatter の内部表現はクラスが保持しており、比較もクラスの責務であるためです。

### REQ-C-002: 見出し検出ユーティリティの配置

`_cle-libs/libs/text/markdown-utils.ts` には現在 `cleanYaml` のみが存在し、見出し分割ヘルパーは存在しません。
新設する見出し検出関数は、共有される場合 `_cle-libs/libs/text/` に配置します (`directory-structure.md` 準拠) 。

### REQ-C-003: BDD RGR サイクルの適用

新機能追加であるため、実装は `bdd-coder` エージェントに委譲し、Red → Green → Refactor の各フェーズを経ること。

### REQ-C-004: 境界判定は構文解析を行わない (事前検査済みデータへの単純ルール)

境界判定は Markdown 構文解析によらず、本文中の `^## Summary$` (行頭完全一致) の **最初の出現** を用います。
コードフェンス内・引用内・リスト内・ユーザー発話本文内であるかは解釈しません。

この単純化は次の実測に基づく前提条件のうえに成立します (claude/2026-07 で検証済み) 。

| 検証項目                                             | 結果                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| 定型部保有ファイルで最初の `## Summary` がフェンス内 | 0 件                                       |
| 引用・インデント付きの定型部マーカー                 | 0 件                                       |
| `## Summary` 見出しの表記                            | 完全一致 18966 件。ゆれは 3 件のみで対象外 |

他エージェントについては事前検査を実施済みです (Q-04) 。
codex 42 件・chatgpt 9 件のいずれも定型部マーカー保有 0 件であり、strip 対象が存在しません。
これらは既存 `filter` が定型プロンプトファイルを削除済みであるためです。
該当する定義は `filter-chatlogs/scripts/constants/patterns/prompt.constants.ts` の `NOISE_PROMPT_PATTERNS` です。

加えて、**他エージェントのディレクトリが同一実行で走査されることはない**。
agent は常に単一値に解決されるためです。解決元は次の 2 つです。

- `filter-chatlogs/scripts/constants/common.constants.ts` の `DEFAULT_FILTER_CONFIG.agent`
- `_cle-libs/constants/defaults.constants.ts` の `DEFAULT_AGENT`

agent 未指定でも全エージェントを走査する経路は存在しません。
したがって agent 軸については、実測結果と仕様上の分離の双方により前提が担保されます。

**未検証のデータセットに対しては、事前に検査するまで適用してはならない** という制約は維持します。
本機能は新規のログ形式を追加しないため、現時点の前提は今後も維持される見込みです。
ただし `set-frontmatter` の定型部テンプレートまたは `filter` の削除パターンが変更された場合は再検査を要します。

ただしこの散文の制約が実効性を持たない経路が 2 つ残ります。period を省略した場合と
`--input-dir` による override を指定した場合であり、いずれも未検証の年月まで処理対象に入ります。
この 2 経路の実行時強制は REQ-C-008 で規範化します。

Markdown パーサの導入は、依存と解釈差分を増やし破壊的処理のリスクをむしろ高めるため採用しません。

### REQ-C-005: `toFrontmatter()` の `fieldOrder` 明示

> **本要件は DR-14 により不要となりました (Superseded)** 。
> strip は本体の frontmatter を変更しないため、private フィールドは本体に存在しません。
> 以下は DR-14 以前の記録です。

- EARS Type: unwanted behavior

```text
GIVEN strip 処理が frontmatter を再構築する
  NOT DO `toFrontmatter()` を既定引数 (`DEFAULT_ORDERED_FIELDS`) で呼び出す
THEN the system SHALL 入力の既存キー順の末尾に `_status` を加えた `fieldOrder` を構築し、明示的に渡さなければならない。
```

`addTagHashes` は既定 (`false`) のままとし、`tags` に `#` を付与してはなりません。

**Rationale**: `reorderFrontmatterEntries` は `fieldOrder` を走査して結果を組み立てます。
そのため `fieldOrder` に無いフィールドを黙って捨てます (`libs/text/frontmatter-utils.ts:183`) 。
実測 (DR-04 参照) では既定引数で `_status` と未知フィールドが消失しました。既存フィールドの順序も入れ替わっています。
これは REQ-F-002 / REQ-F-009 / AC-003 を同時に破ります。

**Acceptance Criteria**:

| AC ID  | Scenario                                                 |
| ------ | -------------------------------------------------------- |
| AC-018 | 未知フィールドを持つファイルで既存フィールドが消失しない |

### REQ-C-006: 共有フィールド順定数への private フィールド追加の禁止

> **本要件は DR-14 により不要となりました (Superseded)** 。
> strip は本体の frontmatter を変更しないため、private フィールドは本体に存在しません。
> 以下は DR-14 以前の記録です。

- EARS Type: unwanted behavior

```text
GIVEN private フィールド (`_` で始まるフィールド) が定義されている
  NOT DO `DEFAULT_ORDERED_FIELDS` または `_ATTACH_FIELD_ORDER` に当該フィールドを追加する
THEN the system SHALL 両定数を private フィールドを含まない状態に保たなければならない。
```

**Rationale**: REQ-F-011 は private フィールドを正式版ログへ出力しないことを定めます。
これはこの 2 つのホワイトリストに private フィールドが含まれないことのみによって担保されています。
どちらかに追加された時点で `normalizeLogs/` および `outputLogs/` へ漏出し、
REQ-F-011 が沈黙のうちに破れます。実装・レビュー時に検知できるよう制約として明示します。

**Acceptance Criteria**:

| AC ID  | Scenario                                            |
| ------ | --------------------------------------------------- |
| AC-019 | 両定数のいずれにも `_` 始まりフィールドが含まれない |

### REQ-C-007: 退避を伴う書き込みの実装手段

- EARS Type: feature/config-based

```text
GIVEN strip 処理が strip 済み内容を書き出す
  WHERE 元ファイルの退避を伴う
THEN the system SHALL `writeTextFile` に `backupToBak` (DR-03 / DR-17) を渡して用い、`backupOldPath` との組み合わせを用いてはならない。
```

**Rationale**: `writeTextFile` は tmp 書き出しと rename を内部で不可分に実行します。
そのため REQ-NF-005 が定める 3 ステップ順序の手順 2 (退避リネーム) を挟めません。
`backupOldPath` は退避名が `.old-NN.md` 連番であり、REQ-F-004 の `.bak` と一致しません。
既存退避があっても連番を進めるため、REQ-F-007 の冪等性が成立しません。
両者の直接組み合わせでは REQ-NF-004 / REQ-NF-005 / REQ-F-007 を同時に満たせません。

**Acceptance Criteria**:

| AC ID  | Scenario                                                      |
| ------ | ------------------------------------------------------------- |
| AC-020 | 書き込み中断時に `.md` または `.bak` の一方に完全な内容が残る |

### REQ-C-008: 対象範囲を `<agent> <YYYY-MM>` に限定する (未検証データセットへの適用の実行時拒否)

- EARS Type: unwanted behavior

```text
GIVEN strip の実行が要求された
  WHERE period が省略されている、`--input-dir` による override が指定されている、
        または出力ディレクトリ (`--output-dir` もしくは第 3 位置引数) が指定されている
  NOT DO 処理対象ファイルを列挙する
THEN the system SHALL 実行を拒否し、ファイルを 1 件も変更してはならない。
```

`strip` は `<agent>` と `<YYYY-MM>` の両方が指定された形のみを受理します。
period は必須引数として扱い、省略と不正形式のいずれも受理しません。

**Rationale** (DR-07): REQ-C-004 の前提は claude/2026-07 の実測に基づくため、
その範囲外へ破壊的処理が及ぶ経路を実行時に塞ぐ必要があります。
軸ごとの状況は次のとおりです。

| 軸                     | 分離の実効性     | 根拠                                                                                                                                                                                   |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent                  | 保証される       | 常に単一値へ解決される (REQ-C-004 に詳述) 。全エージェントを走査する経路が存在しない                                                                                                   |
| period (不正形式)      | 既存実装で拒否済 | agent の次の位置引数は `YYYY-MM` 形式が必須で、違反時は `InvalidPeriodPosition` を throw する (`_cle-libs/libs/io/parse-args.ts`)                                                      |
| period (省略)          | **破れる**       | `agentPath()` が agent のみを返し (`_cle-libs/libs/file-io/resolve-directory.ts`) 、`findFiles` の再帰走査 (`_cle-libs/libs/file-ops/find-files.ts`) が agent 直下の全年月を対象にする |
| `--input-dir` override | **破れる**       | `resolveChatlogsDir()` は override 指定時に agent / period / addOnDir をすべて無視する (`_cle-libs/libs/file-io/resolve-directory.ts`)                                                 |
| 出力ディレクトリの指定 | **破れる**       | 共通 `parseArgs` が `--output-dir` と第 3 位置引数を `outputDir` へ格納するが、strip は in-place で書き換えるため値を参照しない (DR-32)                                                |

したがって本要件が新たに閉じるのは「period の省略」「override の指定」
「出力ディレクトリの指定」の 3 経路です。

出力ディレクトリを拒否する理由は、指定された値が `resolveChatlogsDir()` へ渡らないためです。
利用者が出力先を変えたつもりの実行が `originalLogs/` を破壊的に書き換えます。
strip は対象を in-place で書き換える処理であり、出力先という概念を持ちません (DR-32) 。

**実装上の注意**: この拒否は strip サブコマンド固有の制約です。
`filter` / `noise-filter` は period 省略を許容する既存挙動を維持するため、
共通の `parseArgs` を変更するのではなく strip 側で受理条件を検査してください。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                    |
| ------ | --------------------------------------------------------------------------- |
| AC-021 | period を省略して実行すると拒否され、ファイルが 1 件も変更されない          |
| AC-022 | `--input-dir` を指定して実行すると拒否され、ファイルが 1 件も変更されない   |
| AC-027 | 出力ディレクトリを指定して実行すると拒否され、ファイルが 1 件も変更されない |

## 7. User Stories

<!-- markdownlint-disable line-length -->

| Story ID | Role                | Goal                                       | Reason                                                  | Related Requirements |
| -------- | ------------------- | ------------------------------------------ | ------------------------------------------------------- | -------------------- |
| US-001   | ログ管理者          | 定型部を一括除去したい                     | ログ全体のサイズを削減し、実質内容だけを保持するため    | REQ-F-001, REQ-F-002 |
| US-002   | ログ管理者          | 実行前に影響範囲を確認したい               | 6000 件規模の破壊的操作を誤って実行しないため           | REQ-F-005            |
| US-003   | ログ管理者          | 誤って除去した場合に復旧したい             | `chatlogs/` は git 管理外で、再 export は高コストなため | REQ-F-004            |
| US-004   | filter 機能の利用者 | 後続の AI 判定にかかるトークンを削減したい | 定型部が 8 割を占め spend limit に到達するため          | REQ-F-001            |
| US-005   | 開発者              | 境界判定ロジックを単体テストしたい         | 大量ファイルへの適用前に正しさを保証するため            | REQ-NF-002           |

<!-- markdownlint-restore -->

## 8. Acceptance Criteria

```gherkin
# AC-010: 定型部を持たない ## Summary 付きファイルが不変である
# Requirement: REQ-F-000
Scenario: 定型部を持たないファイルは除去されない
  Given 本文に ## Summary を含むが ## TOPICS ASSIGNMENT RULES を含まないファイル
  When  filter strip を実行する
  Then  ファイル内容がバイト単位で変更されていない
  And   passthrough として計上される

# AC-001: 先頭型ファイルの定型部が除去される
# Requirement: REQ-F-001
Scenario: 先頭型ファイルの定型部が除去される
  Given 本文が「定型プロンプト → ## Summary → ## Excerpt」の順で構成されたファイル
  When  filter strip claude 2026-07 を実行する
  Then  出力ファイルの本文は "## Summary" から始まる

# AC-002: ## Summary / ## Excerpt 以降が保持される
# Requirement: REQ-F-001
Scenario: 実質部が変更されない
  Given 本文に ## Summary と ## Excerpt を持つファイル
  When  filter strip を実行する
  Then  ## Summary 以降の内容が除去前と一致する

# AC-003: 既存 frontmatter フィールドが値・順序ともに保持される
# Requirement: REQ-F-002
Scenario: 既存 frontmatter フィールドが保持される
  Given session_id / date / project を持つ frontmatter 付きファイル
  When  filter strip を実行する
  Then  session_id / date / project の値と順序が除去前と一致する
  And   追加されるフィールドは stripped のみである

# AC-004: 対象外ファイルが無変更で通過する
# Requirement: REQ-F-003
Scenario: ## Summary を持たないファイルは変更されない
  Given 本文に ## Summary を含まないファイル
  When  filter strip を実行する
  Then  ファイル内容がバイト単位で変更されていない
  And   .bak ファイルが作成されていない
  And   passthrough として計上される

# AC-005: .bak に元の内容が保存される
# Requirement: REQ-F-004
Scenario: 元ファイルが .bak に退避される
  Given 除去対象と判定されたファイル <name>.md
  When  filter strip を実行する
  Then  <name>.md.bak が作成され、その内容が実行前の <name>.md と一致する

# AC-007: dry-run 時にファイルシステムが変更されない
# Requirement: REQ-F-005
Scenario: dry-run は非破壊である
  Given 除去対象を含むディレクトリ
  When  filter strip claude 2026-07 --dry-run を実行する
  Then  いずれのファイルも変更されず .bak も作成されない
  And   対象件数と分類ごとの件数が報告される

# AC-006: 既存 .bak があるファイルがスキップされる
# Requirement: REQ-F-007
Scenario: 既存 .bak があるファイルはスキップされる
  Given <name>.md.bak が既に存在するファイル <name>.md
  When  filter strip を実行する
  Then  <name>.md が変更されない
  And   done として計上される

# AC-009: 二重実行しても .bak の内容が変化しない
# Requirement: REQ-F-007
Scenario: 再実行が冪等である
  Given filter strip を一度実行済みのディレクトリ
  When  filter strip を再度実行する
  Then  全ての .bak の内容が 1 回目実行後と一致する
  And   元ログが失われていない

# AC-013: strip 済みファイルの処理済み状態がキャッシュに記録される
# Requirement: REQ-F-009
Scenario: 処理済み状態が記録される
  Given 定型部マーカーを持つファイル
  When  filter strip を実行する
  Then  当該ファイルの処理済み状態が ChatlogCache に記録される
  And   出力ファイルの frontmatter が strip 前と同一である

# AC-024: strip 済みファイルの frontmatter が strip 前と同一である
# Requirement: REQ-F-009
Scenario: frontmatter が不変である
  Given 定型部マーカーを持つファイル
  When  filter strip を実行する
  Then  strip 前後の frontmatter が ChatlogFrontmatter の同一性比較で一致する
  And   キーの出現順序は比較対象に含めない
  And   改行コードが CRLF から LF へ正規化されても一致と判定される

# AC-014: .bak 削除後に再実行しても strip 済みファイルが再処理されない
# Requirement: REQ-F-009
Scenario: .bak 削除後も冪等である
  Given filter strip が全件成功し .bak が削除されたディレクトリ
  When  filter strip を再度実行する
  Then  strip 済みファイルは全て done として計上される
  And   本文が変更されていない

# AC-015: 全件成功時に .bak が削除される
# Requirement: REQ-F-010
Scenario: 正常終了時に .bak が削除される
  Given 除去対象を含み error が発生しないディレクトリ
  When  filter strip を実行する
  Then  対象ディレクトリ配下の .bak が全て削除されている

# AC-016: error が 1 件でもあれば .bak が保持される
# Requirement: REQ-F-010
Scenario: 異常時は .bak を残す
  Given 除去対象と error 対象が混在するディレクトリ
  When  filter strip を実行する
  Then  対象ディレクトリ配下の .bak が全て残っている

# AC-025: stripped に由来しない .bak の削除時に件数とパスが警告で報告される
# Requirement: REQ-F-010
Scenario: 当該実行の産物でない .bak の削除を報告する
  Given 除去対象を含み error が発生しないディレクトリ
  And   stripped と判定されないファイルに対応する .bak が存在する
  When  filter strip を実行する
  Then  当該 .bak の件数とパスが警告として報告される
  And   対象ディレクトリ配下の .bak が全て削除されている

# AC-011: 除去後が空になるファイルが error として保護される
# Requirement: REQ-F-008
Scenario: 除去範囲が異常なファイルは書き換えられない
  Given 定型部マーカーを持つが、除去すると本文が空になるファイル
  When  filter strip を実行する
  Then  ファイル内容がバイト単位で変更されていない
  And   error として計上される

# AC-023: frontmatter を持たないファイルが error として扱われる
# Requirement: REQ-F-008
Scenario: frontmatter 欠落は前提の破れとして検出される
  Given frontmatter を持たず、定型部マーカーを含むファイル
  When  filter strip を実行する
  Then  ファイル内容がバイト単位で変更されていない
  And   .bak ファイルが作成されていない
  And   error として計上される

# AC-012: dry-run 出力にファイルパスと判定結果が 1 件ごとに含まれる
# Requirement: REQ-F-005 (DR-29 により改訂)
Scenario: dry-run が監査ログとして機能する
  Given 除去対象・対象外・スキップ対象が混在するディレクトリ
  When  filter strip --dry-run を実行する
  Then  各ファイルのパスと判定結果が 1 行ずつ出力される
  And   除去対象と判定したファイルが skipped として出力される
  And   error と判定したファイルにのみ該当した判定規則の ID が併記される
  And   除去範囲および除去バイト数は出力されない

# AC-008: サマリーに 5 分類の件数と除去前後の合計バイト数が含まれる
# Requirement: REQ-F-006
Scenario: 処理結果が報告される
  Given 除去対象と対象外が混在するディレクトリ
  When  filter strip を実行する
  Then  total / stripped / skipped / done / passthrough / error の件数が出力される
  And   除去前後の合計バイト数 (bytesBefore / bytesAfter) が出力される
  And   除去前後の差が除去範囲のバイト数 (removedBytes) の合計と一致する

Scenario: dry-run でも除去規模が報告される
  Given 同一のディレクトリ
  When  filter strip --dry-run を実行する
  Then  除去前後の合計バイト数が通常実行と同じ値で出力される

Scenario: 除去対象が無い実行ではバイト数が 0 になる
  Given 除去対象を 1 件も含まないディレクトリ
  When  filter strip を実行する
  Then  bytesBefore と bytesAfter がいずれも 0 として出力される

# AC-017: _status を持つファイルの正式版出力に _status が無い
# Requirement: REQ-F-011 (DR-14 により Superseded。以下は DR-14 以前の記録)
Scenario: private フィールドが正式版に持ち出されない
  Given frontmatter に _status: stripped を持つ originalLogs 配下のファイル
  When  normalize および set-frontmatter を経て outputLogs に出力する
  Then  outputLogs の frontmatter に _status が含まれない
  And   normalizeLogs の frontmatter にも _status が含まれない

# AC-018: 未知フィールドを持つファイルで既存フィールドが消失しない
# Requirement: REQ-C-005 (DR-14 により Superseded。以下は DR-14 以前の記録)
Scenario: fieldOrder 明示により未知フィールドが保持される
  Given DEFAULT_ORDERED_FIELDS に無いフィールドを持つ除去対象ファイル
  When  filter strip を実行する
  Then  当該フィールドが値を保ったまま出力に残る
  And   既存フィールドの順序が除去前と一致する

# AC-019: 両定数のいずれにも _ 始まりフィールドが含まれない
# Requirement: REQ-C-006
Scenario: 共有フィールド順定数が private フィールドを含まない
  Given DEFAULT_ORDERED_FIELDS および _ATTACH_FIELD_ORDER の定義
  When  各定数の要素を検査する
  Then  _ で始まる要素が 1 つも含まれない

# AC-020: 書き込み中断時に .md または .bak の一方に完全な内容が残る
# Requirement: REQ-C-007
Scenario Outline: 各ステップ境界で中断しても内容が失われない
  Given 除去対象と判定されたファイル
  When  書き込み処理が <中断点> の直後で失敗する
  Then  <name>.md または <name>.md.bak の少なくとも一方に
        元の内容または完全な strip 済み内容が存在する

  Examples:
    | 中断点                          |
    | .tmp 書き出し                   |
    | .md から .bak へのリネーム      |
    | .tmp から .md へのリネーム      |

# AC-021: period を省略して実行すると拒否され、ファイルが 1 件も変更されない
# Requirement: REQ-C-008
Scenario: period 省略時に実行を拒否する
  Given agent のみを指定し period を省略した引数
  When  filter strip を実行する
  Then  実行が拒否される
  And   対象ファイルの列挙が行われない
  And   いずれのファイルも変更されない

# AC-022: --input-dir を指定して実行すると拒否され、ファイルが 1 件も変更されない
# Requirement: REQ-C-008
Scenario: --input-dir 指定時に実行を拒否する
  Given --input-dir による override を含む引数
  When  filter strip を実行する
  Then  実行が拒否される
  And   対象ファイルの列挙が行われない
  And   いずれのファイルも変更されない

# AC-027: 出力ディレクトリを指定して実行すると拒否され、ファイルが 1 件も変更されない
# Requirement: REQ-C-008
Scenario Outline: 出力ディレクトリ指定時に実行を拒否する
  Given <指定方法> によって出力ディレクトリを与えた引数
  When  filter strip を実行する
  Then  実行が拒否される
  And   対象ファイルの列挙が行われない
  And   いずれのファイルも変更されない

  Examples:
    | 指定方法       |
    | --output-dir   |
    | 第 3 位置引数  |
```

## 9. Open Questions

<!-- markdownlint-disable line-length -->

| Question                                                                                  | Type    | Impact Area          | Owner     |
| ----------------------------------------------------------------------------------------- | ------- | -------------------- | --------- |
| Q-01: issue cle-2rf の Design / 受け入れ基準を in-place + `.bak` 方式に更新する必要がある | Process | issue 記述との整合性 | atsushifx |

<!-- markdownlint-restore -->

### 解決済み

<!-- markdownlint-disable line-length -->

| Question                              | Resolution                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-02: 取りこぼし 6 件を個別対応するか | **許容する。** 6668 件中 6 件 (0.09%) 。Out of Scope に明記済み                                                                                                                                                                                                                                     |
| Q-03: `.bak` が既に存在する場合の挙動 | **スキップする。** REQ-F-007 として正規化。再実行を冪等にし元ログを保護する                                                                                                                                                                                                                         |
| Q-04 (a): 他エージェントの未測定      | **解決。claude 以外は strip 対象が存在しない。** codex 42 件・chatgpt 9 件を実測し定型部マーカー保有 0 件を確認。これらは既存 filter が定型プロンプトファイルを削除済みであるため。加えて agent は常に単一値へ解決されるため他エージェントが同一実行で走査されることもない (REQ-C-004)              |
| Q-04 (b): 他年月の未測定              | **未実測のまま、適用範囲外へ封じることで解決。** 2026-07 以外の年月は実測していない。period 省略時と `--input-dir` override 時に未検証の年月へ処理が及ぶため、REQ-C-008 でこの 2 経路の実行を拒否し、受理する範囲を実測済みの `<agent> <YYYY-MM>` に限定する                                        |
| Q-05: strip 後の `.bak` 一括削除      | **全件成功 (error 0 件) 時のみ一括削除する。** REQ-F-010 として正規化。あわせて `.bak` 削除後の冪等性を担保するため frontmatter マーカーを REQ-F-009 として追加                                                                                                                                     |
| Q-06: 退避ファイル命名と書き込み順序  | **`BackupProvider` として抽象化し、strip は `.bak` 方式 (`backupPath`) を使う。冪等判定は Provider ではなく呼び出し側に置く。** DR-03 として記録。`backupOldPath` は戻り値追加のみで連番セマンティクスを維持。**DR-17 により Provider 名は `backupToBak` へ変更** (方式は不変)                      |
| Q-07: 処理済みマーカーの付与経路      | **frontmatter 内の private フィールド `_status` として `ChatlogFrontmatter` の `set()` + `toFrontmatter()` で付与する (単一値、strip 済みは `stripped`) 。** DR-04 として記録。フィールド名・値は `_cle-libs` の共通定数とし、`toFrontmatter()` は既存キー順 + `_status` の `fieldOrder` を明示する |

<!-- markdownlint-restore -->

## 10. Traceability

| REQ ID     | AC IDs                 | Type           |
| ---------- | ---------------------- | -------------- |
| REQ-F-000  | AC-010                 | Functional     |
| REQ-F-001  | AC-001, AC-002         | Functional     |
| REQ-F-002  | AC-003                 | Functional     |
| REQ-F-003  | AC-004                 | Functional     |
| REQ-F-004  | AC-005                 | Functional     |
| REQ-F-005  | AC-007, AC-012         | Functional     |
| REQ-F-006  | AC-008                 | Functional     |
| REQ-F-007  | AC-006, AC-009         | Functional     |
| REQ-F-008  | AC-011, AC-023         | Functional     |
| REQ-F-009  | AC-013, AC-014         | Functional     |
| REQ-F-010  | AC-015, AC-016, AC-025 | Functional     |
| REQ-F-011  | AC-017                 | Functional     |
| REQ-NF-001 | N/A                    | Non-Functional |
| REQ-NF-002 | N/A                    | Non-Functional |
| REQ-NF-003 | N/A                    | Non-Functional |
| REQ-NF-004 | N/A                    | Non-Functional |
| REQ-NF-005 | N/A                    | Non-Functional |
| REQ-C-001  | N/A                    | Constraint     |
| REQ-C-002  | N/A                    | Constraint     |
| REQ-C-003  | N/A                    | Constraint     |
| REQ-C-004  | N/A                    | Constraint     |
| REQ-C-005  | AC-018                 | Constraint     |
| REQ-C-006  | AC-019                 | Constraint     |
| REQ-C-007  | AC-020                 | Constraint     |
| REQ-C-008  | AC-021, AC-022, AC-027 | Constraint     |

## 11. Change History

<!-- SemVer: MAJOR = requirement removed / approach discarded,
     MINOR = requirement / AC / DR added, PATCH = clarification only.
     Keep frontmatter `version` equal to the newest row below.
     See deckrd-rule-document-versioning.md -->

<!-- markdownlint-disable line-length -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | 1.0.0   | Initial release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-12 | 1.1.0   | REQ-F-009 (frontmatter 処理済みマーカー) / REQ-F-010 (正常終了時の `.bak` 一括削除) を追加。Q-05 を解決                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-12 | 1.1.1   | `review req --phase explore` の指摘を反映。Q-06 (退避命名と書き込み順序) / Q-07 (`stripped: true` の付与経路) を追加。§2 に frontmatter 書き戻し経路とサブコマンド分岐の前提を追記。REQ-C-001 の未完文を補完し適用対象外を明記                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-12 | 1.2.0   | DR-03 (`BackupProvider` 抽象化・冪等判定は呼び出し側) を決定し Q-06 を解決。`decision-record.md` を新規作成し DR-01 / DR-02 も収録。REQ-C-001 に新設 3 関数を明記し、REQ-F-009 / REQ-NF-005 / §2 を DR-03 に整合                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-12 | 1.2.1   | バージョン採番を SemVer に統一。frontmatter を 3 桁表記に修正し、既存版を重要度で再採番 (旧 1.2.0 → 1.1.1、旧 1.3.0 → 1.2.0) 。採番規約は `deckrd-rule-document-versioning.md` に集約                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-12 | 1.2.2   | DR 文書を全フェーズ共通の成果物としてモジュール直下へ移動し、deckrd 規約に合わせ複数形へ改名 (`requirements/decision-record.md` → `../decision-records.md`) 。§3 のリンクを追随                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-12 | 1.3.0   | DR-04 (処理済みマーカーを private フィールド `_status` として `ChatlogFrontmatter` で付与) を決定し Q-07 を解決。マーカーを `stripped: true` から `_status: stripped` に変更し、`PRIVATE_STATUS_FIELD` / `CHATLOG_STATUSES` の共通定数化を REQ-F-009 に規定                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-12 | 1.4.0   | REQ-F-011 (private フィールドの正式版ログへの非出力) / AC-017 を追加。DR-04 に不変条件として 3 段階の出力可否表を追記                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-12 | 1.4.1   | Q-04 を解決 (codex 42 件・chatgpt 9 件の事前検査を実施し定型部マーカー 0 件を確認) 。REQ-C-004 に検査結果と再検査条件を追記                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-12 | 1.5.0   | `review req --phase harden` を実施。散文の禁止事項を REQ-C-005 / REQ-C-006 / REQ-C-007 として規範化し AC-018 〜 AC-020 を追加。DR-05 として記録                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-12 | 1.5.1   | `review req --phase fix` を実施。§1.1 の不要マーカー `<>` を除去、REQ-C-001 の「バックアップ」を「退避」に統一、REQ-C-003 / REQ-C-004 の順序を修正、AC-020 を Scenario Outline 化して検証可能にした                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-12 | 1.6.0   | DR-03 を改訂。`writeTextFileWithBackup` の新設をやめ、既存 `writeTextFile` に `BackupProvider` を受け取る第 3 引数を追加する方式へ変更。`backupPath` は既存 `.bak` があれば無視して `null` を返す                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-12 | 1.7.0   | DR-06 を追加。`.bak` 削除条件を `error 0` から「全ファイルの `_status` が `stripped`」へ変更し、最終的な復旧手段が `export-chatlogs` の再実行であることを明記。`.bak` を「唯一の復旧手段」とする記述を補正                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-12 | 1.8.0   | DR-07 を決定し REQ-C-008 (対象範囲を `<agent> <YYYY-MM>` に限定する実行時拒否) / AC-021 / AC-022 を追加。codex risk review の対応候補 4 を解決。agent 軸は単一値解決により分離が保証されることを REQ-C-004 に明記し、Q-04 を (a) 他エージェント = 解決 / (b) 他年月 = 適用範囲外へ封じることで解決 に分離。period 必須化に伴い §1.2 / 図 / REQ-F-001 の `[YYYY-MM]` を `<YYYY-MM>` に統一                                                                                                                                                                                                                                                                                                |
| 2026-08-12 | 2.0.0   | REQ-F-010 の削除条件を再定義。`_status` 基準 (v1.7.0) をやめ、error 0 件を条件とする対象ディレクトリ単位の一括削除に変更。passthrough が `_status` を持たず条件が実質成立しない問題を解消。除外条件「当該実行で作成していない既存 `.bak`」を削除し、中断により残った `.bak` も削除対象に含める。AC-015 / AC-016 の文言を対象ディレクトリ基準へ変更。REQ-C-001 の `BackupProvider` 戻り値の説明に `null` の意味を追記                                                                                                                                                                                                                                                                     |
| 2026-08-12 | 2.1.0   | spec explore レビュー (F-01 / A-01) を反映。REQ-F-008 の判定基準に「frontmatter を持たない」を追加し AC-023 を新設。frontmatter は `renderMarkdown` により構造的に必ず存在するため、欠落を前提の破れとして error 扱いとする。あわせて除去率の算出式 (除去バイト数 ÷ 本文バイト数) を明記し、分母が本文であることを確定                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-12 | 2.1.1   | REQ-F-008 の「frontmatter を持たない」基準の根拠として DR-09 を §3 に追加。要件の追加・変更は伴わない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-12 | 3.0.0   | spec harden レビュー（DR-10 / DR-11 / DR-12）を反映。REQ-F-008 の判定基準から到達不能な「`## Summary` 以降が存在しない」を削除し 3 点から 2 点へ（DR-11）。REQ-F-006 に退避削除の失敗報告と終了コードの規定を追加（DR-10）。REQ-C-001 の `backupPath` 戻り値を `Promise<string>` に変更（DR-12）                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-12 | 4.0.0   | DR-13 を反映。ファイル単位の分類を 4 つから 3 つへ統合し、skipped を passthrough に含める。REQ-F-006 に処理済みスキップの内訳報告と全件処理の判定式を追加。REQ-F-007 / REQ-F-009 / REQ-F-005 / REQ-NF-003 の分類表記と AC-006 / AC-014 / AC-008 の期待値を更新                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-12 | 5.0.0   | DR-14 を反映し DR-04 を破棄。処理済みマーカーを本体の frontmatter から `ChatlogCache` へ移し、strip は本体の frontmatter を変更しない。REQ-F-009 をキャッシュ記録として再定義し AC-024 を新設。本体への `_status` 付与に由来する REQ-F-011 / REQ-C-005 / REQ-C-006 を Superseded とする                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-13 | 5.1.0   | DR-15 を反映し DR-13 を破棄。分類を 3 つから 4 つへ戻し、処理済みスキップを `done` として独立させる。REQ-F-006 の報告項目と判定式を 4 分類へ変更し、内訳報告の規定を削除。REQ-F-005 に集計構造の一致とキャッシュ非記録を追加。REQ-F-007 / REQ-F-009 の分類表記と AC-006 / AC-008 / AC-014 の期待値を更新                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-13 | 5.2.0   | DR-16 を反映。REQ-F-010 の削除条件に `.bak` の包含関係を追加し、破れた場合の報告と終了コードを規定。件数比較で代替できない理由を記録。削除範囲は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-13 | 5.2.1   | claude/2026-07 の再実測により DR-01 の根拠データを訂正。除去対象 6402→6398 / `## Summary` 保有 10290→10288 / 対象外 3888→3890。「先頭 strip 後も定型部が残る 2 件」は実測 0 件のため訂正し、取りこぼしを 6 件→4 件（後方配置のみ）へ。要件・受け入れ基準の変更は伴わない                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-13 | 5.3.0   | codex risk レビューの対応候補 C に対応。AC-024 の「バイト単位で一致」を `ChatlogFrontmatter` による同一性比較へ改める (CRLF 正規化は決定事項として維持)。REQ-F-009 に判定基準 (キー集合と値の一致・キー順は非対象) を追加。REQ-C-001 に同一性比較の追加を記載                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-13 | 5.3.1   | DR-14 で無効化された `_status` 由来の陳腐化記述を一掃 (issue cle-ax1)。Scope / System Context Diagram / 利用ライブラリ / REQ-F-002 / AC-013 Gherkin を現行仕様へ更新し、AC-024 の Gherkin を新設。Superseded 済みの REQ-F-011 / REQ-C-005 配下の記述は歴史的記録として維持し、Gherkin に Superseded 注記を追加。要件の追加・変更は伴わない                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-13 | 6.0.0   | DR-17 を反映し DR-12 の決定を破棄 (MAJOR: decided approach discarded)。退避 Provider 名を `backupPath` から `backupToBak` へ改め、既存 `.bak` 到達時の挙動を throw からスキップ + `null` へ変更。REQ-C-001 の `BackupProvider` / `backupToBak` / `writeTextFile` の記述を更新し、`writeTextFile` の戻り値を DR-03 決定 4 のコード例どおり `Promise<string \| null>` に是正。REQ-F-009 の Provider 名を更新                                                                                                                                                                                                                                                                               |
| 2026-08-13 | 6.1.0   | codex review (PR #409) の指摘「キャッシュの状態が再生成されたソースと乖離する」に対応。REQ-F-009 の判定順序に既知の制約を追記し、再 export 時のキャッシュ消去を利用者の責任として明記。Out of Scope に「再 export 後のキャッシュ整合の自動回復」を追加。`--recover-orphans` による復帰は strip 自身の副作用であるため利用者責任に含めず DR-24 で対処する旨を併記                                                                                                                                                                                                                                                                                                                         |
| 2026-08-16 | 7.0.0   | DR-29 を反映し、REQ-F-005 の「除去範囲・除去見込みバイト数を報告する」要求と、正常系分類にも判定理由を求める規定を削除 (MAJOR: requirement removed)。分類に `skipped` を加えて 5 値とし、dry-run 固有の差異を「表示上の時制」から「`skipped` というラベル」へ改める。`error` に限り判定規則 ID を出力する旨を規定。AC-012 を「ファイルパスと判定結果が 1 件ごとに含まれる」へ改訂し Gherkin を追随。REQ-F-006 に通常実行の per-file 報告 (`stripped` / `passthrough` のみ) を追加し、分類 5 値と統計 4 分類の非対称が意図的である旨を明記。AC-008 の「4 分類」は統計サマリーの分類であり不変。AC-007 の Gherkin から「除去見込みバイト数が報告される」を削除し「分類ごとの件数」へ改める |
| 2026-08-16 | 8.0.0   | DR-30 を反映し DR-29 決定 3 のうち「件数は `StripStats.stripped` へ加算する」部分を破棄 (MAJOR: decided approach discarded)。REQ-F-006 のサマリーを分類と 1 対 1 に対応する 5 分類へ改め、`stripped` と `skipped` が排他である旨と dry-run で `skipped` を参照する旨を規定。「分類 5 値と統計 4 分類の非対称が意図的」とする記述を削除。全件処理の判定式を `stripped + skipped + done + passthrough == total` へ改訂。AC-008 を「サマリーに 5 分類の件数が含まれる」へ改訂し Gherkin を追随。REQ-F-005 に dry-run の `skipped` が通常実行の `stripped` と一致する旨を追加                                                                                                                |
| 2026-08-16 | 8.1.0   | DR-31 を反映 (MINOR: 要求と AC を追加)。REQ-F-009 の記録契機に passthrough を追加し、記録する処理済み状態を `stripped` / `passthrough` の 2 種として表に整理。判定順序の手順 1 が両 status を処理済みとみなす旨、記録が書き込みとは独立に判定の確定時点で行われる旨、記録失敗を error に計上する旨を規定。AC-025 / AC-026 を追加し、REQ-F-005 の dry-run 非記録に passthrough を明記。Scope の処理済み記録の根拠を 2 status へ更新                                                                                                                                                                                                                                                       |
| 2026-08-16 | 8.2.0   | REQ-F-006 の「除去前後の合計バイト数」を実装可能な形へ具体化 (MINOR: AC を追加)。サマリーへ `bytesBefore` / `bytesAfter` を出力する旨と、集計対象を除去対象と分類したファイル (通常実行は `stripped` / dry-run は `skipped`) に限る旨、値が本文 (frontmatter を除く) の UTF-8 バイト数である旨、除去を伴わない分類が本文バイト数を持たない理由を規定。AC-008 を「5 分類の件数と除去前後の合計バイト数が含まれる」へ改訂し、dry-run 一致と除去対象 0 件の Gherkin を追加                                                                                                                                                                                                                  |
| 2026-08-16 | 8.3.0   | DR-32 を反映 (MINOR: AC を追加)。REQ-C-008 の受理拒否条件に「出力ディレクトリ (`--output-dir` もしくは第 3 位置引数) の指定」を追加し、EARS の WHERE 句と軸ごとの表に当該経路を追記。値が受理されても `resolveChatlogsDir()` へ渡らず `originalLogs/` を in-place で書き換える経路であることを Rationale に記録。AC-027 を追加し Gherkin をフラグ・位置引数の 2 例で記述。Traceability の REQ-C-008 に AC-027 を追加                                                                                                                                                                                                                                                                     |
| 2026-08-16 | 8.4.0   | DR-33 を反映 (MINOR: 振る舞いを追加)。REQ-F-009 の `--recover-orphans` の記述に、復帰またはキャッシュエントリ削除に失敗したファイルが 1 件以上ある場合は失敗件数を報告のうえ終了コードを成功以外とする規定を追加。乖離を残したまま成功終了すると次回実行が判定順序の手順 1 で永久に done と判定すること、2 回目の `--recover-orphans` では回収できないこと（DR-27）、報告が終了コードの生成に先行すること（DR-20 決定 3）を根拠として併記。REQ-F-006 / REQ-F-010 の通常モードの終了コード規定は不変                                                                                                                                                                                      |

<!-- markdownlint-enable line-length -->
