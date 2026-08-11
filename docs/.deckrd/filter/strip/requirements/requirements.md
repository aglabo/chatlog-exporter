---
title: "Requirements: filter strip"
module: "filter/strip"
status: Draft
version: 5.0.0
created: "2026-08-12"
---

<!-- cspell:words setfm -->

<!-- textlint-disable
  ja-spacing/ja-space-around-code
  -->

## 1. Overview

### 1.1 Purpose

エクスポート済みチャットログ Markdown の冒頭に埋め込まれた set-frontmatter 由来の定型プロンプト部を除去し、実質的な会話内容のみを残す `strip` サブコマンドを追加する。

### 1.2 Scope

- `filter strip <agent> <YYYY-MM>` サブコマンドの新設 (period は必須。REQ-C-008 参照)
- 対象ディレクトリ配下の `.md` を走査し、定型部マーカーを持つファイルのみを対象に、先頭から最初の `## Summary` 直前までを除去する
- 元ファイルを `.bak` として退避し、元のファイル名で strip 済みファイルを書き出す
- 既存 `.bak` および frontmatter の `_status: stripped` を処理済みマーカーとして扱い、再実行を冪等にする
- 全件 strip 成功 (全ファイルの `_status` が `stripped`) 時に `.bak` を一括削除する
- `--dry-run` による非破壊確認
- 処理結果サマリー (対象件数・除去バイト数・`.bak` 削除件数) の報告

**Out of Scope**:

- ファイル単位の削除 (既存の `noise-filter` / `filter` の責務)
- Codex プリアンブル判定によるファイル削除 (issue cle-cs4 の責務)
- 定型部の再生成・復元機能 (`.bak` からの復元はユーザーによる手動操作とする)
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
    normalize 等の既存用途向け。strip は `.bak` 方式の `backupPath` を用いる (DR-03 参照)
  - `skills/_cle-libs/libs/file-ops/exists-utils.ts` — `fileExists` (退避ファイルの存在判定に用いる)
  - `skills/_cle-libs/libs/text/frontmatter-utils.ts` — `divideEntry` / `hasFrontmatter` (いずれも読み取り専用)
  - `skills/_cle-libs/classes/ChatlogFrontmatter.class.ts` — `set()` / `toFrontmatter()`。`_status` の付与に用いる (DR-04) 。
    `toFrontmatter()` は既定引数で呼ばず `fieldOrder` を明示する
  - `skills/_cle-libs/constants/common.constants.ts` — `FRONTMATTER_DELIMITER` / `DEFAULT_ORDERED_FIELDS`。DR-04 の
    `PRIVATE_STATUS_FIELD` / `CHATLOG_STATUSES` をここに追加する
  - `skills/_cle-libs/classes/ChatlogEntry.class.ts` — `renderEntry()` は**本機能では使用しない** (DR-04)。
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
 filter strip           |     filter strip     |      frontmatter に _status: stripped
 <agent> <YYYY-MM>      |                      |
                        |                      | --> [<name>.md.bak  (元ファイル退避)]
[originalLogs/*.md] --> |                      |      全件 stripped なら最後に一括削除
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
| DR-12 | `backupPath` の戻り値を `Promise<string>` に単純化する                             | ../decision-records.md#DR-12 |
| DR-13 | ファイル単位の分類を 3 つに統合する (skipped を passthrough へ)                    | ../decision-records.md#DR-13 |
| DR-14 | 処理済みマーカーをキャッシュへ移し、本体の frontmatter を変更しない                | ../decision-records.md#DR-14 |

<!-- markdownlint-restore --->

### DR-01 の根拠 (実測データ)

`chatlogs/originalLogs/claude/2026/2026-07` (全 11671 件) を実測した結果は次のとおりです。

**定型部を持つ 6668 件の内訳:**

| 分類                                        | 件数 |
| ------------------------------------------- | ---- |
| 定型部が最初の `## Summary` より前 (先頭型) | 6398 |
| `## Summary` を持たない                     | 266  |
| 定型部が最初の `## Summary` より後ろ        | 4    |

複数 `## Summary` を持つファイルは 976 件存在しますが、先頭 strip 後も定型部が残るのは **2 件**にとどまります。
したがって単純な先頭アンカー方式で 6398 件を処理でき、取りこぼしは 6 件 (残存 2 + 後方配置 4) に限定されます。

**`## Summary` を持つ 10290 件の内訳 (REQ-F-000 の根拠) :**

| 分類                      | 件数 |
| ------------------------- | ---- |
| 定型部を持つ (除去対象)   | 6402 |
| 定型部を持たない (対象外) | 3888 |

`## Summary` の存在のみを条件とすると 3888 件を誤って破壊します。
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
実測では `## Summary` を持つ 10290 件のうち **3888 件は定型部を持ちません**。
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

ただし REQ-F-009 に定める処理済みマーカー `_status: stripped` の**追加**のみを例外として許容します。
既存フィールドの変更・削除・並べ替えを行ってはなりません。

**Rationale**: frontmatter は分類・検索のためのメタデータであり、本文の除去とは独立して維持される必要があります。
処理済みマーカーは `.bak` 削除後の冪等性担保に必須であるため、追加のみを例外とします。

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
THEN the system SHALL 当該ファイルを strip 済みとみなしてスキップし、passthrough (処理済みスキップ) として計上する。
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
GIVEN 対象ファイルが除去対象と判定された
  WHEN strip 処理が strip 済み内容を書き出す
THEN the system SHALL 当該ファイルの処理済み状態を `ChatlogCache` に記録する。
```

strip 処理は本体の frontmatter を変更してはなりません (DR-14) 。
本体へ加える変更は、本文先頭から最初の `## Summary` 直前までの除去のみとします。

再実行時の判定順序は次のとおりとします。

1. キャッシュに処理済みの記録がある → passthrough / 処理済みスキップ (`.bak` の有無によらず)
2. `<name>.md.bak` が存在する → passthrough / 処理済みスキップ (REQ-F-007)
3. 定型部マーカーを持たない → passthrough (REQ-F-000)

手順 1 は本体を読み取らずに判定できます。
中断後の再実行では、未処理のファイルのみを後続の判定対象とします。

この判定は書き込み前に行い、`BackupProvider` 側には持たせません (DR-03) 。
Provider はパスのみを受け取るため手順 1 の判定を担えず、判定ロジックを分割すると保守性を損なうためです。

キャッシュは他スキル (classify / filter / normalize / set-frontmatter) と同一の
`ChatlogCache` を用い、保存先は `DEFAULT_CACHE_ROOT` に従います。
キャッシュ status の値は実装ファイルに直書きせず、定数として定義します。

**Rationale**: REQ-F-010 により `.bak` は正常終了時に削除されるため、`.bak` を唯一の処理済みマーカーとすると冪等性が失われます。
実測では strip 後の本文は `## Summary` 起点となり定型部マーカーを含まないため大半は REQ-F-000 で保護されますが、
先頭 strip 後も定型部が残る 2 件は再実行で再度 strip され本文を失います。
キャッシュへの記録は `.bak` 削除後も残るため、この経路を塞ぎます。

処理済み状態を本体ではなくキャッシュに置く理由は DR-14 に記します。
本体を変更しないことで、private フィールドの下流への漏出と、
frontmatter 再構築に伴う未知フィールドの消失が構造的に発生しなくなります。

キャッシュが失われた場合は、当該実行をやり直します。
キャッシュの退避と復元はユーザーの手動運用に委ねます。
なお strip 済みファイルは本文が `## Summary` から始まり定型部マーカーを持たないため、
キャッシュ喪失後に再実行しても REQ-F-000 により passthrough となり、本文は破壊されません。

**Acceptance Criteria**:

| AC ID  | Scenario                                                           |
| ------ | ------------------------------------------------------------------ |
| AC-013 | strip 済みファイルの処理済み状態がキャッシュに記録される           |
| AC-014 | `.bak` 削除後に再実行しても strip 済みファイルが再処理されない     |
| AC-024 | strip 済みファイルの frontmatter が strip 前とバイト単位で一致する |

### REQ-F-010: 正常終了時の `.bak` 一括削除

- EARS Type: event-driven

```text
GIVEN strip 処理が全対象ファイルの走査を完了し、error を計上したファイルが 1 件も無い
  WHEN 処理が終了する
THEN the system SHALL 対象ディレクトリ配下の `.bak` を全て削除する。
```

次の場合は `.bak` を削除してはなりません。

- error を計上したファイルが 1 件以上ある (調査・復旧のため全 `.bak` を保持する)
- `--dry-run` が指定されている (そもそも `.bak` を作成しない)

**Rationale**: strip 完了後も `.bak` を残すとディスク使用量が実質倍になります (対象 6402 件・元データ 275.3MB 規模) 。

削除は対象ディレクトリ単位の一括操作とします。
REQ-C-008 により対象は単一の `<agent> <YYYY-MM>` ディレクトリに限定されるため、
配下の `.bak` はすべて strip の作業対象であり、退避パスを個別に追跡する必要がありません。

削除の可否は error の有無のみで判断します。
`_status` を条件に用いない理由は、passthrough と判定されたファイルが書き込みを受けず
`_status` を持たないため、「全ファイルが `stripped`」という条件が実質的に成立しないためです
(実測では対象 6402 件に対し passthrough が 3888 件) 。

前回実行の中断により残った `.bak` も削除対象に含みます。
当該実行が全件を error なく処理し終えた時点で、対象ディレクトリの内容は正常な strip 済み状態であり、
古い `.bak` を保持する理由が無いためです。

削除は実行の最後に一括で行い、途中失敗時に「一部だけ削除済み」の中途半端な状態を作りません。

`.bak` を失った場合でも、`export-chatlogs` の再実行により `originalLogs/` を復元できます (DR-06) 。
一次ソースは `~/.claude/projects/` 配下の JSONL セッションファイルであり、
`originalLogs/` はその派生物です。`writeSession` は既存ファイルを無条件に上書きします。
したがって `.bak` は「唯一の復旧手段」ではなく、再 export の手間を省く一次的な復旧手段です。

**Acceptance Criteria**:

| AC ID  | Scenario                                    |
| ------ | ------------------------------------------- |
| AC-015 | 全件成功時に `.bak` が削除される            |
| AC-016 | error が 1 件でもあれば `.bak` が保持される |

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
THEN the system SHALL ファイルへの書き込みおよび `.bak` 作成を一切行わず、対象ファイル一覧・判定理由・除去範囲・除去見込みバイト数を報告する。
```

dry-run の出力には、ファイルごとに次の情報を含めなければなりません。

- ファイルパス
- 判定結果 (stripped / passthrough / error) 。passthrough では処理済みスキップに該当するかを併記する
- 判定理由 (マーカー無し / `## Summary` 無し / `.bak` 既存 / 除去率異常など)
- 除去対象となる行範囲、および除去バイト数

**Rationale**: 6000 件規模の破壊的操作の前に、影響範囲を確認する手段が必要です。
件数とバイト数だけでは事前レビューとして不十分であり、dry-run 出力を監査ログとして機能させます。

**Acceptance Criteria**:

| AC ID  | Scenario                                   |
| ------ | ------------------------------------------ |
| AC-007 | dry-run 時にファイルシステムが変更されない |
| AC-012 | dry-run 出力に判定理由と除去範囲が含まれる |

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
THEN the system SHALL total / stripped / passthrough / error の件数、passthrough のうち処理済みスキップの件数、除去前後の合計バイト数、
     および `.bak` の削除有無 (削除件数、または保持理由) を出力する。
```

分類は stripped / passthrough / error の 3 つとします (DR-13) 。
passthrough は「除去対象外」と「処理済みスキップ」の 2 経路を含むため、
後者の件数を内訳として報告しなければなりません。
内訳を欠くと、除去した実行と全件が処理済みであった実行を区別できません。

全ファイルの評価を終えた時点で、次の式が成立しなければなりません (DR-13) 。

```text
stripped + passthrough == total  かつ  error == 0
```

`.bak` の削除に失敗したファイルが 1 件以上ある場合、
削除失敗件数と対象パスをあわせて出力しなければなりません (DR-10) 。
この場合の終了コードは成功以外とします。
削除失敗は既に確定したファイル単位の分類結果を取り消しません。

**Rationale**: SKILL.md 層が `::info::` 形式の出力を解析する既存パターンに合わせ、処理結果を機械可読な形で提供します。

削除失敗を報告する理由は、退避が残存したか削除されたかを利用者が判別できないと、
ディスク使用量の見積もりと次回実行時の前提が崩れるためです (DR-10) 。

**Acceptance Criteria**:

| AC ID  | Scenario                          |
| ------ | --------------------------------- |
| AC-008 | サマリーに 5 分類の件数が含まれる |

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
  型は 2 実装の上位集合であり、`backupOldPath` が `null` を返す可能性を残すために維持する (DR-12)
- `backupPath` (`libs/file-ops/`) — `<name>.md` を `<name>.md.bak` にリネームする Provider。
  戻り値は `Promise<string>` とし、`null` を返さない (DR-12) 。
  既存の `.bak` があるファイルは REQ-F-007 により呼び出し前にスキップされるため、
  退避を作成しない状況には到達しない。到達した場合は前提の破れとして例外を throw する
- `writeTextFile` (`libs/file-io/write-utils.ts`) — 第 3 引数に `BackupProvider` を追加。
  tmp 書き出し → 退避 → 差し替えの 3 ステップを行い、退避先パスを返す。未指定時は現行と同一の挙動

既存の `writeTextFile` および `backupOldPath` の挙動は変更しません。
`backupOldPath` は戻り値を `Promise<string | null>` に拡張するのみで、連番セマンティクスを維持します。

### REQ-C-002: 見出し検出ユーティリティの配置

`_cle-libs/libs/text/markdown-utils.ts` には現在 `cleanYaml` のみが存在し、見出し分割ヘルパーは存在しません。
新設する見出し検出関数は、共有される場合 `_cle-libs/libs/text/` に配置します (`directory-structure.md` 準拠) 。

### REQ-C-003: BDD RGR サイクルの適用

新機能追加であるため、実装は `bdd-coder` エージェントに委譲し、Red → Green → Refactor の各フェーズを経ること。

### REQ-C-004: 境界判定は構文解析を行わない (事前検査済みデータへの単純ルール)

境界判定は Markdown 構文解析によらず、本文中の `^## Summary$` (行頭完全一致) の**最初の出現**を用います。
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

**未検証のデータセットに対しては、事前に検査するまで適用してはならない**という制約は維持します。
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
THEN the system SHALL `writeTextFile` に `backupPath` (DR-03) を渡して用い、`backupOldPath` との組み合わせを用いてはならない。
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
  WHERE period が省略されている、または `--input-dir` による override が指定されている
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

したがって本要件が新たに閉じるのは「period の省略」と「override の指定」の 2 経路です。

**実装上の注意**: この拒否は strip サブコマンド固有の制約です。
`filter` / `noise-filter` は period 省略を許容する既存挙動を維持するため、
共通の `parseArgs` を変更するのではなく strip 側で受理条件を検査してください。

**Acceptance Criteria**:

| AC ID  | Scenario                                                                  |
| ------ | ------------------------------------------------------------------------- |
| AC-021 | period を省略して実行すると拒否され、ファイルが 1 件も変更されない        |
| AC-022 | `--input-dir` を指定して実行すると拒否され、ファイルが 1 件も変更されない |

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
  And   対象件数と除去見込みバイト数が報告される

# AC-006: 既存 .bak があるファイルがスキップされる
# Requirement: REQ-F-007
Scenario: 既存 .bak があるファイルはスキップされる
  Given <name>.md.bak が既に存在するファイル <name>.md
  When  filter strip を実行する
  Then  <name>.md が変更されない
  And   passthrough として計上され、処理済みスキップの内訳に含まれる

# AC-009: 二重実行しても .bak の内容が変化しない
# Requirement: REQ-F-007
Scenario: 再実行が冪等である
  Given filter strip を一度実行済みのディレクトリ
  When  filter strip を再度実行する
  Then  全ての .bak の内容が 1 回目実行後と一致する
  And   元ログが失われていない

# AC-013: strip 済みファイルの frontmatter に _status: stripped が付く
# Requirement: REQ-F-009
Scenario: 処理済みマーカーが記録される
  Given 定型部マーカーを持つファイル
  When  filter strip を実行する
  Then  出力ファイルの frontmatter に _status: stripped が含まれる
  And   既存フィールドの値と順序が変更されていない

# AC-014: .bak 削除後に再実行しても strip 済みファイルが再処理されない
# Requirement: REQ-F-009
Scenario: .bak 削除後も冪等である
  Given filter strip が全件成功し .bak が削除されたディレクトリ
  When  filter strip を再度実行する
  Then  strip 済みファイルは全て passthrough (処理済みスキップ) として計上される
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

# AC-012: dry-run 出力に判定理由と除去範囲が含まれる
# Requirement: REQ-F-005
Scenario: dry-run が監査ログとして機能する
  Given 除去対象・対象外・スキップ対象が混在するディレクトリ
  When  filter strip --dry-run を実行する
  Then  各ファイルのパス・判定結果・判定理由・除去バイト数が出力される

# AC-008: サマリーに 5 分類の件数が含まれる
# Requirement: REQ-F-006
Scenario: 処理結果が報告される
  Given 除去対象と対象外が混在するディレクトリ
  When  filter strip を実行する
  Then  total / stripped / passthrough / error の件数と処理済みスキップの内訳が出力される

# AC-017: _status を持つファイルの正式版出力に _status が無い
# Requirement: REQ-F-011
Scenario: private フィールドが正式版に持ち出されない
  Given frontmatter に _status: stripped を持つ originalLogs 配下のファイル
  When  normalize および set-frontmatter を経て outputLogs に出力する
  Then  outputLogs の frontmatter に _status が含まれない
  And   normalizeLogs の frontmatter にも _status が含まれない

# AC-018: 未知フィールドを持つファイルで既存フィールドが消失しない
# Requirement: REQ-C-005
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
| Q-06: 退避ファイル命名と書き込み順序  | **`BackupProvider` として抽象化し、strip は `.bak` 方式 (`backupPath`) を使う。冪等判定は Provider ではなく呼び出し側に置く。** DR-03 として記録。`backupOldPath` は戻り値追加のみで連番セマンティクスを維持                                                                                        |
| Q-07: 処理済みマーカーの付与経路      | **frontmatter 内の private フィールド `_status` として `ChatlogFrontmatter` の `set()` + `toFrontmatter()` で付与する (単一値、strip 済みは `stripped`) 。** DR-04 として記録。フィールド名・値は `_cle-libs` の共通定数とし、`toFrontmatter()` は既存キー順 + `_status` の `fieldOrder` を明示する |

<!-- markdownlint-restore -->

## 10. Traceability

| REQ ID     | AC IDs         | Type           |
| ---------- | -------------- | -------------- |
| REQ-F-000  | AC-010         | Functional     |
| REQ-F-001  | AC-001, AC-002 | Functional     |
| REQ-F-002  | AC-003         | Functional     |
| REQ-F-003  | AC-004         | Functional     |
| REQ-F-004  | AC-005         | Functional     |
| REQ-F-005  | AC-007, AC-012 | Functional     |
| REQ-F-006  | AC-008         | Functional     |
| REQ-F-007  | AC-006, AC-009 | Functional     |
| REQ-F-008  | AC-011, AC-023 | Functional     |
| REQ-F-009  | AC-013, AC-014 | Functional     |
| REQ-F-010  | AC-015, AC-016 | Functional     |
| REQ-F-011  | AC-017         | Functional     |
| REQ-NF-001 | N/A            | Non-Functional |
| REQ-NF-002 | N/A            | Non-Functional |
| REQ-NF-003 | N/A            | Non-Functional |
| REQ-NF-004 | N/A            | Non-Functional |
| REQ-NF-005 | N/A            | Non-Functional |
| REQ-C-001  | N/A            | Constraint     |
| REQ-C-002  | N/A            | Constraint     |
| REQ-C-003  | N/A            | Constraint     |
| REQ-C-004  | N/A            | Constraint     |
| REQ-C-005  | AC-018         | Constraint     |
| REQ-C-006  | AC-019         | Constraint     |
| REQ-C-007  | AC-020         | Constraint     |
| REQ-C-008  | AC-021, AC-022 | Constraint     |

## 11. Change History

<!-- SemVer: MAJOR = requirement removed / approach discarded,
     MINOR = requirement / AC / DR added, PATCH = clarification only.
     Keep frontmatter `version` equal to the newest row below.
     See deckrd-rule-document-versioning.md -->

<!-- markdownlint-disable line-length -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-12 | 1.0.0   | Initial release                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-12 | 1.1.0   | REQ-F-009 (frontmatter 処理済みマーカー) / REQ-F-010 (正常終了時の `.bak` 一括削除) を追加。Q-05 を解決                                                                                                                                                                                                                                                                                                              |
| 2026-08-12 | 1.1.1   | `review req --phase explore` の指摘を反映。Q-06 (退避命名と書き込み順序) / Q-07 (`stripped: true` の付与経路) を追加。§2 に frontmatter 書き戻し経路とサブコマンド分岐の前提を追記。REQ-C-001 の未完文を補完し適用対象外を明記                                                                                                                                                                                       |
| 2026-08-12 | 1.2.0   | DR-03 (`BackupProvider` 抽象化・冪等判定は呼び出し側) を決定し Q-06 を解決。`decision-record.md` を新規作成し DR-01 / DR-02 も収録。REQ-C-001 に新設 3 関数を明記し、REQ-F-009 / REQ-NF-005 / §2 を DR-03 に整合                                                                                                                                                                                                     |
| 2026-08-12 | 1.2.1   | バージョン採番を SemVer に統一。frontmatter を 3 桁表記に修正し、既存版を重要度で再採番 (旧 1.2.0 → 1.1.1、旧 1.3.0 → 1.2.0) 。採番規約は `deckrd-rule-document-versioning.md` に集約                                                                                                                                                                                                                                |
| 2026-08-12 | 1.2.2   | DR 文書を全フェーズ共通の成果物としてモジュール直下へ移動し、deckrd 規約に合わせ複数形へ改名 (`requirements/decision-record.md` → `../decision-records.md`) 。§3 のリンクを追随                                                                                                                                                                                                                                      |
| 2026-08-12 | 1.3.0   | DR-04 (処理済みマーカーを private フィールド `_status` として `ChatlogFrontmatter` で付与) を決定し Q-07 を解決。マーカーを `stripped: true` から `_status: stripped` に変更し、`PRIVATE_STATUS_FIELD` / `CHATLOG_STATUSES` の共通定数化を REQ-F-009 に規定                                                                                                                                                          |
| 2026-08-12 | 1.4.0   | REQ-F-011 (private フィールドの正式版ログへの非出力) / AC-017 を追加。DR-04 に不変条件として 3 段階の出力可否表を追記                                                                                                                                                                                                                                                                                                |
| 2026-08-12 | 1.4.1   | Q-04 を解決 (codex 42 件・chatgpt 9 件の事前検査を実施し定型部マーカー 0 件を確認) 。REQ-C-004 に検査結果と再検査条件を追記                                                                                                                                                                                                                                                                                          |
| 2026-08-12 | 1.5.0   | `review req --phase harden` を実施。散文の禁止事項を REQ-C-005 / REQ-C-006 / REQ-C-007 として規範化し AC-018 〜 AC-020 を追加。DR-05 として記録                                                                                                                                                                                                                                                                      |
| 2026-08-12 | 1.5.1   | `review req --phase fix` を実施。§1.1 の不要マーカー `<>` を除去、REQ-C-001 の「バックアップ」を「退避」に統一、REQ-C-003 / REQ-C-004 の順序を修正、AC-020 を Scenario Outline 化して検証可能にした                                                                                                                                                                                                                  |
| 2026-08-12 | 1.6.0   | DR-03 を改訂。`writeTextFileWithBackup` の新設をやめ、既存 `writeTextFile` に `BackupProvider` を受け取る第 3 引数を追加する方式へ変更。`backupPath` は既存 `.bak` があれば無視して `null` を返す                                                                                                                                                                                                                    |
| 2026-08-12 | 1.7.0   | DR-06 を追加。`.bak` 削除条件を `error 0` から「全ファイルの `_status` が `stripped`」へ変更し、最終的な復旧手段が `export-chatlogs` の再実行であることを明記。`.bak` を「唯一の復旧手段」とする記述を補正                                                                                                                                                                                                           |
| 2026-08-12 | 1.8.0   | DR-07 を決定し REQ-C-008 (対象範囲を `<agent> <YYYY-MM>` に限定する実行時拒否) / AC-021 / AC-022 を追加。codex risk review の対応候補 4 を解決。agent 軸は単一値解決により分離が保証されることを REQ-C-004 に明記し、Q-04 を (a) 他エージェント = 解決 / (b) 他年月 = 適用範囲外へ封じることで解決 に分離。period 必須化に伴い §1.2 / 図 / REQ-F-001 の `[YYYY-MM]` を `<YYYY-MM>` に統一                            |
| 2026-08-12 | 2.0.0   | REQ-F-010 の削除条件を再定義。`_status` 基準 (v1.7.0) をやめ、error 0 件を条件とする対象ディレクトリ単位の一括削除に変更。passthrough が `_status` を持たず条件が実質成立しない問題を解消。除外条件「当該実行で作成していない既存 `.bak`」を削除し、中断により残った `.bak` も削除対象に含める。AC-015 / AC-016 の文言を対象ディレクトリ基準へ変更。REQ-C-001 の `BackupProvider` 戻り値の説明に `null` の意味を追記 |
| 2026-08-12 | 2.1.0   | spec explore レビュー (F-01 / A-01) を反映。REQ-F-008 の判定基準に「frontmatter を持たない」を追加し AC-023 を新設。frontmatter は `renderMarkdown` により構造的に必ず存在するため、欠落を前提の破れとして error 扱いとする。あわせて除去率の算出式 (除去バイト数 ÷ 本文バイト数) を明記し、分母が本文であることを確定                                                                                               |
| 2026-08-12 | 2.1.1   | REQ-F-008 の「frontmatter を持たない」基準の根拠として DR-09 を §3 に追加。要件の追加・変更は伴わない                                                                                                                                                                                                                                                                                                                |
| 2026-08-12 | 3.0.0   | spec harden レビュー（DR-10 / DR-11 / DR-12）を反映。REQ-F-008 の判定基準から到達不能な「`## Summary` 以降が存在しない」を削除し 3 点から 2 点へ（DR-11）。REQ-F-006 に退避削除の失敗報告と終了コードの規定を追加（DR-10）。REQ-C-001 の `backupPath` 戻り値を `Promise<string>` に変更（DR-12）                                                                                                                     |
| 2026-08-12 | 4.0.0   | DR-13 を反映。ファイル単位の分類を 4 つから 3 つへ統合し、skipped を passthrough に含める。REQ-F-006 に処理済みスキップの内訳報告と全件処理の判定式を追加。REQ-F-007 / REQ-F-009 / REQ-F-005 / REQ-NF-003 の分類表記と AC-006 / AC-014 / AC-008 の期待値を更新                                                                                                                                                       |
| 2026-08-12 | 5.0.0   | DR-14 を反映し DR-04 を破棄。処理済みマーカーを本体の frontmatter から `ChatlogCache` へ移し、strip は本体の frontmatter を変更しない。REQ-F-009 をキャッシュ記録として再定義し AC-024 を新設。本体への `_status` 付与に由来する REQ-F-011 / REQ-C-005 / REQ-C-006 を Superseded とする                                                                                                                              |

<!-- markdownlint-enable line-length -->
