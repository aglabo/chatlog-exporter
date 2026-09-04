---
title: "Implementation Tasks"
module: filter/strip
status: Active
created: "2026-08-13 00:00:00"
source: specifications.md
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable no-duplicate-heading line-length -->

> This document contains implementation tasks derived from specifications.
> Each task corresponds to a single unit test case (`it()` block).

## Conventions

タスク ID は deckrd 標準の `T-XX-YY-ZZ`、`Test ID` は
`.claude/rules/testing-conventions.md` 準拠の実テスト ID を併記します。

- `Rule` は `specifications.md` の R-NNN / AC-NNN / Edge NN を指します。
  `SPEC-NNN` および `IMPL-NNN` は本プロジェクトに存在しません。
- 実装単位は Commit 1〜13 で識別します。Commit 13 (SKILL.md) は BDD 免除のため対象外です。
- **Stage 1 (C1〜C4) の変更は `skills/setup-chatlogs/assets/_cle-libs/` にも同期が必要です。**
  片側のみの更新は `setup-chatlogs` を無言で破壊します。

### 実データで 0 件のケース (合成 fixture 必須)

以下は実データ 6398 件で発生件数 0 です。実ログを流用できません。

| ケース                | Task ID    |
| --------------------- | ---------- |
| 除去後の本文が空      | T-05-03-01 |
| 除去率が 99% 超       | T-05-03-02 |
| 先頭 strip 後も定型部 | T-05-04-05 |

---

## Task Summary

| Test Target                            | Commit | Scenarios | Cases   | Status |
| -------------------------------------- | ------ | --------- | ------- | ------ |
| T-01: `backupToBak` / `backupOldPath`  | C1, C4 | 5         | 11      | done   |
| T-02: `writeTextFile` (BackupProvider) | C2     | 4         | 8       | done   |
| T-03: frontmatter 同一性比較           | C3     | 3         | 9       | done   |
| T-04: 境界検出                         | C6     | 3         | 9       | done   |
| T-05: 判定カスケード                   | C7, C5 | 5         | 32      | done   |
| T-06: 書き込みパイプライン             | C8     | 4         | 13      | done   |
| T-07: バックアップ一括削除             | C9     | 6         | 19      | done   |
| T-08: エントリポイント                 | C10    | 5         | 33      | done   |
| T-09: フェーズ関数                     | C10    | 9         | 27      | done   |
| **合計**                               | —      | **44**    | **161** | —      |

<!-- Status may be: pending | in progress | done -->

---

## T-01: `backupToBak` / `backupOldPath`

> Commit 1 / Commit 4。`BackupProvider` 型の新設と、既存 `backupOldPath` の戻り値拡幅。
> 配置: `skills/_cle-libs/libs/file-ops/backup-to-bak.ts` (新規)、
> `skills/_cle-libs/libs/file-ops/backup-old-path.ts` (既存)。
> Test ID: `backupToBak` は `T-LIB-BTB` を新規採番、`backupOldPath` は既存 `T-LIB-B` を継続。

### [正常] Normal Cases

#### T-01-01: 退避先が存在しない通常の退避

- [x] **T-01-01-01**: `<name>.md` を `<name>.md.bak` へ退避し、作成したパスを返す
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-01-01`
  - Rule: R-009 / DR-17
  - Scenario: Given `<name>.md.bak` が存在しない, When `backupToBak(path)` を呼ぶ
  - Expected: Then 戻り値が `<name>.md.bak` のパスであること

- [x] **T-01-01-02**: 退避に `RenameProvider` が 1 回だけ呼ばれる
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-01-02`
  - Rule: R-009
  - Scenario: Given `.bak` が存在しない, When `backupToBak(path)` を呼ぶ
  - Expected: Then 注入した `RenameProvider` が `(path, path + '.bak')` で 1 回呼ばれること

#### T-01-02: `BackupProvider` 型への適合 (DR-17)

- [x] **T-01-02-01**: `backupToBak` が `BackupProvider` として代入可能である
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-02-01`
  - Rule: DR-17
  - Scenario: Given `BackupProvider` 型の変数, When `backupToBak` を代入する
  - Expected: Then 型エラーなく代入でき、`(path) => Promise<string | null>` を満たすこと

- [x] **T-01-02-02**: `backupOldPath` が `BackupProvider` として代入可能である
  - Target: `backupOldPath`
  - Test ID: `T-LIB-B-07`
  - Rule: DR-17 / Commit 4
  - Scenario: Given 戻り値を `Promise<string | null>` へ拡幅した後, When `BackupProvider` 型に代入する
  - Expected: Then 型エラーなく代入できること

- [x] **T-01-02-03**: `backupOldPath` が作成した退避パスを返す
  - Target: `backupOldPath`
  - Test ID: `T-LIB-B-08`
  - Rule: Commit 4
  - Scenario: Given 退避先が存在しない, When `backupOldPath(path)` を呼ぶ
  - Expected: Then 戻り値が作成した `.old-NN` パスであること (旧実装の `void` ではない)

#### T-01-03: `.old-NN` 連番の維持 (リグレッション)

- [x] **T-01-03-01**: `.old-01` が既存なら `.old-02` を採番する
  - Target: `backupOldPath`
  - Test ID: `T-LIB-B-09`
  - Rule: Commit 4 / REQ-C-007
  - Scenario: Given `<name>.old-01.md` が既に存在する, When `backupOldPath(path)` を呼ぶ
  - Expected: Then `<name>.old-02.md` へ退避し、そのパスを返すこと

- [x] **T-01-03-02**: 戻り値型の拡幅が連番採番の挙動を変えない
  - Target: `backupOldPath`
  - Test ID: `T-LIB-B-10`
  - Rule: Commit 4
  - Scenario: Given `.old-01` 〜 `.old-03` が存在する, When `backupOldPath(path)` を呼ぶ
  - Expected: Then `.old-04` が選ばれ、既存の連番規則が保たれること

### [異常] Error Cases

#### T-01-04: 退避不能・失敗

- [x] **T-01-04-01**: リネーム失敗の例外を握りつぶさない
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-04-01`
  - Rule: fail-first / R-009
  - Scenario: Given `RenameProvider` が例外を投げる, When `backupToBak(path)` を呼ぶ
  - Expected: Then 例外がそのまま伝播し、`null` へ握り潰されないこと

- [x] **T-01-04-02**: 元ファイルが存在しない場合に例外が伝播する
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-04-02`
  - Rule: fail-first
  - Scenario: Given `<name>.md` が存在しない, When `backupToBak(path)` を呼ぶ
  - Expected: Then `NotFound` 相当の例外が伝播すること

### [エッジケース] Edge Cases

#### T-01-05: 既存 `.bak` のスキップ (DR-17)

- [x] **T-01-05-01**: 既存 `.bak` があれば `null` を返し例外を投げない
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-05-01`
  - Rule: DR-17 / R-004
  - Scenario: Given `<name>.md.bak` が既に存在する, When `backupToBak(path)` を呼ぶ
  - Expected: Then 戻り値が `null` であり、例外を投げないこと

- [x] **T-01-05-02**: 既存 `.bak` があればリネームを実行しない
  - Target: `backupToBak`
  - Test ID: `T-LIB-BTB-05-02`
  - Rule: DR-17 / AC-009
  - Scenario: Given `<name>.md.bak` が既に存在する, When `backupToBak(path)` を呼ぶ
  - Expected: Then `RenameProvider` が 1 度も呼ばれず、既存 `.bak` の内容が不変であること

---

## T-02: `writeTextFile` (BackupProvider 対応)

> Commit 2。`skills/_cle-libs/libs/file-io/write-utils.ts` の第 3 引数追加。
> 戻り値を `Promise<void>` から `Promise<string | null>` へ拡幅する。
> 既存 spec ファイル `__tests__/unit/write-utils.unit.spec.ts` に T- ID が無いため
> `T-LIB-WTF` を新設する。

### [正常] Normal Cases

#### T-02-01: 副作用順序 (tmp → backup → swap)

- [x] **T-02-01-01**: 一時ファイル書き出しが退避より先に起こる
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-01-01`
  - Rule: R-009 手順 1-2
  - Scenario: Given `BackupProvider` を注入, When `writeTextFile(path, content, provider)` を呼ぶ
  - Expected: Then 一時ファイルへの書き込みが `BackupProvider` 呼び出しより先に記録されること

- [x] **T-02-01-02**: 退避がスワップより先に起こる
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-01-02`
  - Rule: R-009 手順 2-3 / REQ-NF-005
  - Scenario: Given `BackupProvider` と `RenameProvider` を注入, When 書き込みを実行する
  - Expected: Then `BackupProvider` が最終リネーム (tmp → 本体) より先に呼ばれること

- [x] **T-02-01-03**: 作成した退避パスを戻り値として返す
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-01-03`
  - Rule: DR-03 / R-009
  - Scenario: Given `BackupProvider` が退避パスを返す, When 書き込みを実行する
  - Expected: Then `writeTextFile` の戻り値がその退避パスと一致すること

#### T-02-02: 第 3 引数を省略した既存挙動

- [x] **T-02-02-01**: `BackupProvider` 省略時に退避を作らず書き込む
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-02-01`
  - Rule: Commit 2 (後方互換)
  - Scenario: Given 第 3 引数を渡さない, When `writeTextFile(path, content)` を呼ぶ
  - Expected: Then 内容が書き込まれ、退避ファイルが作成されないこと

- [x] **T-02-02-02**: `BackupProvider` 省略時の戻り値が `null` である
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-02-02`
  - Rule: Commit 2
  - Scenario: Given 第 3 引数を渡さない, When 書き込みが成功する
  - Expected: Then 戻り値が `null` であること (退避未作成を表す)

### [異常] Error Cases

#### T-02-03: 各段階の失敗

- [x] **T-02-03-01**: 退避の失敗時に本体を書き換えない
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-03-01`
  - Rule: R-009 / REQ-NF-004
  - Scenario: Given `BackupProvider` が例外を投げる, When 書き込みを実行する
  - Expected: Then 例外が伝播し、元ファイルの内容が変化しないこと

- [x] **T-02-03-02**: 一時ファイル書き込みの失敗時に退避しない
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-03-02`
  - Rule: R-009 手順 1
  - Scenario: Given 一時ファイルへの書き込みが失敗する, When 書き込みを実行する
  - Expected: Then `BackupProvider` が呼ばれず、元ファイルが不変であること

### [エッジケース] Edge Cases

#### T-02-04: 退避未作成でも書き込みは成功する

- [x] **T-02-04-01**: `BackupProvider` が `null` を返しても書き込みは完了する
  - Target: `writeTextFile`
  - Test ID: `T-LIB-WTF-04-01`
  - Rule: DR-17 / R-009
  - Scenario: Given `BackupProvider` が `null` を返す (既存 `.bak` によるスキップ), When 書き込みを実行する
  - Expected: Then 例外を投げず内容が書き込まれ、戻り値が `null` であること

---

## T-03: frontmatter 同一性比較

> Commit 3。`skills/_cle-libs/classes/ChatlogFrontmatter.class.ts` へ比較メソッドを追加。
> 既存 spec ファイル `classes/__tests__/unit/ChatlogFrontmatter.unit.spec.ts` の
> **`T-CLS-CF` を 51 から継続採番する** (既存は `T-CLS-CF-11` 〜 `T-CLS-CF-50`)。
> 比較条件は キー集合の一致 + 各値の一致。**キー順序は比較対象に含めない** (Section 4.2)。

### [正常] Normal Cases

#### T-03-01: 同一と判定すべき組

- [x] **T-03-01-01**: 同一のキー集合と値を持つ組が同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-51`
  - Rule: AC-024
  - Scenario: Given 同じキーと値を持つ 2 つの frontmatter, When 比較する
  - Expected: Then 同一と判定されること

- [x] **T-03-01-02**: キー順序が異なっても同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-52`
  - Rule: AC-024 / Section 4.2 (キー順序は比較対象外)
  - Scenario: Given 同じキー集合・値でキーの並び順のみが異なる 2 つ, When 比較する
  - Expected: Then 同一と判定されること

- [x] **T-03-01-03**: `string[]` の全要素が一致すれば同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-53`
  - Rule: AC-024
  - Scenario: Given `tags: ['a','b']` を持つ同値の 2 つ, When 比較する
  - Expected: Then 同一と判定されること

### [異常] Error Cases

#### T-03-02: 同一でないと判定すべき組

- [x] **T-03-02-01**: キーが欠落していれば非同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-54`
  - Rule: AC-024 (キー集合の一致)
  - Scenario: Given 一方のみ `category` を持つ 2 つ, When 比較する
  - Expected: Then 非同一と判定されること

- [x] **T-03-02-02**: キーが増えていれば非同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-55`
  - Rule: AC-024 (キー集合の一致)
  - Scenario: Given 一方に未知フィールドが 1 つ多い 2 つ, When 比較する
  - Expected: Then 非同一と判定されること

- [x] **T-03-02-03**: `string` の値が異なれば非同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-56`
  - Rule: AC-024 (`string` は `===`)
  - Scenario: Given `title` の値のみ異なる 2 つ, When 比較する
  - Expected: Then 非同一と判定されること

- [x] **T-03-02-04**: `string[]` の長さが異なれば非同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-57`
  - Rule: AC-024 (`string[]` は長さと各要素)
  - Scenario: Given `tags: ['a']` と `tags: ['a','b']`, When 比較する
  - Expected: Then 非同一と判定されること

### [エッジケース] Edge Cases

#### T-03-03: 境界値と正規化の影響

- [x] **T-03-03-01**: 空の frontmatter 同士が同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-58`
  - Rule: AC-024 (境界値)
  - Scenario: Given キーを 1 つも持たない 2 つ, When 比較する
  - Expected: Then 同一と判定されること

- [x] **T-03-03-02**: `string[]` の要素順が異なれば非同一と判定される
  - Target: `ChatlogFrontmatter` 同一性比較
  - Test ID: `T-CLS-CF-59`
  - Rule: AC-024 (各要素の一致)
  - Scenario: Given `tags: ['a','b']` と `tags: ['b','a']`, When 比較する
  - Expected: Then 非同一と判定されること (配列は順序を保持する値である)

---

## T-04: 境界検出

> Commit 6。R-005 / R-006 が用いる検出。行頭完全一致のみで **Markdown を構文解析しない**。
> `^## Summary$` の **最初の出現** を境界とし、`^## TOPICS ASSIGNMENT RULES$` の存在を確認する。
> 両文字列は `skills/filter-chatlogs/scripts/constants/strip.constants.ts` に定数として定義する
> (実装ファイルへの直書きは禁止)。
> 同ファイルには R-007 の除去率上限 `STRIP_MAX_REMOVAL_RATE`、および復帰専用モード (R-015) の
> キャッシュ削除の再試行に用いる `STRIP_CACHE_DELETE_ATTEMPTS` (= 2) /
> `STRIP_CACHE_DELETE_RETRY_WAIT_MS` (= 100) も配置する (DR-27)。

### [正常] Normal Cases

#### T-04-01: 見出しとマーカーの検出

- [x] **T-04-01-01**: `## Summary` の最初の出現位置を返す
  - Target: 境界検出
  - Test ID: `T-FL-SBD-01-01`
  - Rule: R-005 / REQ-C-004
  - Scenario: Given `## Summary` を 2 箇所に持つ本文, When 境界を検出する
  - Expected: Then 最初の出現の位置が返ること

- [x] **T-04-01-02**: 定型部マーカーの存在を検出する
  - Target: 境界検出
  - Test ID: `T-FL-SBD-01-02`
  - Rule: R-006 / REQ-C-004
  - Scenario: Given `## TOPICS ASSIGNMENT RULES` を含む本文, When マーカーを確認する
  - Expected: Then 存在ありと判定されること

- [x] **T-04-01-03**: 境界文字列を定数から参照する
  - Target: `STRIP_BOUNDARY_HEADING` / `STRIP_TEMPLATE_MARKER`
  - Test ID: `T-FL-SBD-01-03-01` / `T-FL-SBD-01-03-02`
  - Rule: Section 4.2 (定数化の義務) / Commit 5
  - Scenario: Given 定数から組み立てた見出し行・マーカー行を含む本文, When 各検出関数を呼ぶ
  - Expected: Then `## Summary` / `## TOPICS ASSIGNMENT RULES` が定数として公開され、かつ検出関数がその定数を参照して該当行を検出すること

### [異常] Error Cases

#### T-04-02: 検出できない入力

- [x] **T-04-02-01**: `## Summary` を持たない本文で不在を返す
  - Target: 境界検出
  - Test ID: `T-FL-SBD-02-01`
  - Rule: R-005 / Edge 2
  - Scenario: Given `## Summary` を 1 つも含まない本文, When 境界を検出する
  - Expected: Then 不在を示す結果が返り、例外を投げないこと

- [x] **T-04-02-02**: 空文字列の本文で不在を返す
  - Target: 境界検出
  - Test ID: `T-FL-SBD-02-02`
  - Rule: R-005 (境界値)
  - Scenario: Given 空文字列の本文, When 境界を検出する
  - Expected: Then 不在を示す結果が返り、例外を投げないこと

### [エッジケース] Edge Cases

#### T-04-03: 行頭完全一致の境界条件

- [x] **T-04-03-01**: CRLF と LF で同一の検出結果になる
  - Target: 境界検出
  - Test ID: `T-FL-SBD-03-01`
  - Rule: REQ-NF-003 / Edge 11
  - Scenario: Given 同一内容の CRLF 版と LF 版, When それぞれ境界を検出する
  - Expected: Then 検出結果が一致すること

- [x] **T-04-03-02**: 行頭でない `## Summary` を検出しない
  - Target: 境界検出
  - Test ID: `T-FL-SBD-03-02`
  - Rule: REQ-C-004 (行頭完全一致)
  - Scenario: Given `text ## Summary` のように行途中に現れる本文, When 境界を検出する
  - Expected: Then 不在と判定されること

- [x] **T-04-03-03**: 後置テキストを伴う見出しを検出しない
  - Target: 境界検出
  - Test ID: `T-FL-SBD-03-03`
  - Rule: REQ-C-004 (`^## Summary$` の完全一致)
  - Scenario: Given `## Summary of work` という見出し行, When 境界を検出する
  - Expected: Then 不在と判定されること (表記ゆれは対象外)

- [x] **T-04-03-04**: コードフェンス内のマーカーも構文解析せず検出する
  - Target: 境界検出
  - Test ID: `T-FL-SBD-03-04`
  - Rule: REQ-C-004 (構文解析をしない)
  - Scenario: Given コードフェンス内に `## TOPICS ASSIGNMENT RULES` を持つ本文, When マーカーを確認する
  - Expected: Then 存在ありと判定されること (フェンスを解釈しない仕様どおり)

---

## T-05: 判定カスケード

> Commit 7 (+ Commit 5 の型・定数を消費)。R-002 〜 R-008 を **単一の判定関数** に閉じる。
> 判定結果は `outcome` / `reason` / `removalStartLine` / `removalEndLine` / `removedBytes`。
> 配置: 実装は `skills/filter-chatlogs/scripts/libs/classify-strip.ts` の `classifyStrip`
> (DR-29 決定 4。`libs/` 配下の動詞-目的語順に揃える)、型は
> `skills/filter-chatlogs/scripts/types/strip.types.ts` (新規)。
> シグネチャは `classifyStrip(filePath, cache, dryRun, options?)`。`ChatlogCache` を直接受け取り
> R-003 を内部で評価する (述語注入は行わない — DR-29 決定 1)。`hasBackup` / `readProvider` は
> テスト用の注入口として `options` に残す。
> **副作用を持たない** (`writeStripped` を呼ばない — DR-29 決定 2) が、cache を参照し R-004 で
> `fileExists` を呼ぶため **純粋関数ではない**。
> `StripOutcome` は `stripped` / `done` / `passthrough` / `error` / `skipped` の 5 値 (DR-29 決定 3)。
> `skipped` は R-008 に到達した場合の dry-run のみで返り、件数は `StripStats.skipped` へ加算する
> (`StripStats` は分類と同名の件数フィールドを持つ — DR-30)。
> **順序の変更は許されない** (Section 4.2)。除去率 = 除去バイト数 ÷ 本文バイト数 (frontmatter 除外)。

### [正常] Normal Cases

#### T-05-01: 各規則が単独で成立する場合

- [x] **T-05-01-01**: キャッシュに処理済み記録があれば done
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-01`
  - Rule: R-003 / AC-014 / Edge 4
  - Scenario: Given キャッシュに記録があり退避を持たない, When 判定する
  - Expected: Then `outcome === 'done'` であること

- [x] **T-05-01-02**: 退避ファイルが既に存在すれば done
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-02`
  - Rule: R-004 / AC-006 / Edge 3
  - Scenario: Given `<name>.md.bak` が存在しキャッシュ記録が無い, When 判定する
  - Expected: Then `outcome === 'done'` であること

- [x] **T-05-01-03**: `## Summary` が無ければ passthrough
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-03`
  - Rule: R-005 / AC-004 / Edge 2
  - Scenario: Given `## Summary` を 1 つも持たない本文, When 判定する
  - Expected: Then `outcome === 'passthrough'` であること

- [x] **T-05-01-04**: マーカーが境界より前に無ければ passthrough
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-04`
  - Rule: R-006 / AC-010 / Edge 1
  - Scenario: Given `## Summary` を持つがその手前にマーカーが無い, When 判定する
  - Expected: Then `outcome === 'passthrough'` であること

- [x] **T-05-01-05**: 全条件を満たせば stripped
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-05`
  - Rule: R-008 / AC-001
  - Scenario: Given 先頭に定型部を持ち `## Summary` が続く本文, When 判定する
  - Expected: Then `outcome === 'stripped'` であること

- [x] **T-05-01-06**: 除去範囲が本文先頭から `## Summary` 直前までである
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-06`
  - Rule: R-008 / DR-01 / AC-002
  - Scenario: Given 先頭型の定型部を持つ本文, When 判定する
  - Expected: Then `removalStartLine` が本文先頭、`removalEndLine` が `## Summary` の直前行であること

- [x] **T-05-01-07**: 除去バイト数が算出される
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-07`
  - Rule: R-007 / AC-012
  - Scenario: Given 除去対象を持つ本文, When 判定する
  - Expected: Then `removedBytes` が除去範囲のバイト数と一致すること

- [x] **T-05-01-08**: 判定理由が結果に含まれる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-08`
  - Rule: AC-012 / REQ-F-005
  - Scenario: Given 任意の入力, When 判定する
  - Expected: Then `reason` に成立した規則を識別できる値が入ること

- [x] **T-05-01-09**: dry-run では除去対象のみが `skipped` へ振り替わる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-06-01`
  - Rule: DR-29 決定 3
  - Scenario: Given 除去対象のファイル, When `dryRun` を真として判定する
  - Expected: Then `outcome` が `skipped` になり、`reason.rule` は `R-008` のままであること

- [x] **T-05-01-10**: `skipped` は除去範囲を `stripped` と同値で担ぐ
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-06-02`
  - Rule: DR-29 決定 3
  - Scenario: Given 除去対象のファイル, When `dryRun` の有無で判定を比較する
  - Expected: Then `removalStartLine` / `removalEndLine` / `removedBytes` が両者で一致すること
  - Note: 出力はしないが `writeStripped` が使うため値そのものは保持する (DR-29 決定 5)

- [x] **T-05-01-11**: 除去対象以外は dry-run でも分類が変化しない
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-06-03`
  - Rule: DR-29 決定 3
  - Scenario: Given `done` / `passthrough` / `error` と判定されるファイル,
    When `dryRun` を真として判定する
  - Expected: Then 判定の分類がそのまま返り `skipped` にならないこと
    (除去対象でないファイルを `skipped` にすると `stats.skipped` を不当に押し上げ、`done` / `passthrough` / `error` の内訳が失われる — DR-30)

- [x] **T-05-01-12**: キャッシュ記録が `stripped` なら done になる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-09`
  - Rule: R-003 / DR-31 決定 2
  - Scenario: Given キャッシュ記録の `status` が `stripped`, When 判定する
  - Expected: Then `outcome === 'done'` かつ `reason.rule === 'R-003'` であること

- [x] **T-05-01-13**: キャッシュ記録が `passthrough` なら done になる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-01-10`
  - Rule: R-003 / AC-026 / DR-31 決定 2
  - Scenario: Given キャッシュ記録の `status` が `passthrough`, When 判定する
  - Expected: Then `outcome === 'done'` かつ `reason.rule === 'R-003'` であること
  - Note: `passthrough` を処理済みから落とすと、除去対象を持たないファイルを実行のたびに
    読み直して再判定することになる (DR-31 Context)

#### T-05-02: カスケード順序の不変条件

- [x] **T-05-02-01**: frontmatter 欠落がキャッシュ記録より優先される
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-02-01`
  - Rule: R-002 > R-003 (Section 4.2)
  - Scenario: Given frontmatter が無く、かつキャッシュに処理済み記録がある, When 判定する
  - Expected: Then `outcome === 'error'` であること (R-002 が勝つ)

- [x] **T-05-02-02**: キャッシュ記録が退避の存在より優先される
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-02-02`
  - Rule: R-003 > R-004 (冪等性の維持)
  - Scenario: Given キャッシュ記録があり、退避も存在する, When 判定する
  - Expected: Then `reason` が R-003 由来であること (R-004 ではない)

- [x] **T-05-02-03**: `## Summary` 不在がマーカー判定より優先される
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-02-03`
  - Rule: R-005 > R-006 (Section 4.2)
  - Scenario: Given `## Summary` が無く、本文中にマーカーのみ存在する, When 判定する
  - Expected: Then `reason` が R-005 由来の passthrough であること

- [x] **T-05-02-04**: 安全弁が書き込み判定より優先される
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-02-04`
  - Rule: R-007 > R-008 (Section 4.2)
  - Scenario: Given 除去条件を満たすが除去後の本文が空になる, When 判定する
  - Expected: Then `outcome === 'error'` であること (stripped にならない)

### [異常] Error Cases

#### T-05-03: 安全弁と前提の破れ

- [x] **T-05-03-01**: 除去後の本文が空なら error (合成 fixture)
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-01`
  - Rule: R-007 / AC-011 / Edge 5
  - Scenario: Given 除去後に本文が空になる合成入力, When 判定する
  - Expected: Then `outcome === 'error'` であること
  - Note: 実測 0 件のため合成 fixture が必須

- [x] **T-05-03-02**: 除去率が 99% を超えれば error (合成 fixture)
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-02`
  - Rule: R-007 / Edge 6
  - Scenario: Given 除去率が 99% を超える合成入力, When 判定する
  - Expected: Then `outcome === 'error'` であること
  - Note: 実測最大 96.23%。実データでは発火しないため合成 fixture が必須

- [x] **T-05-03-03**: frontmatter を持たなければ error
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-03`
  - Rule: R-002 / AC-023 / Edge 15 / DR-09
  - Scenario: Given frontmatter を持たない `.md`, When 判定する
  - Expected: Then `outcome === 'error'` であること

- [x] **T-05-03-04**: I/O エラーを error として計上し処理を継続する
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-04`
  - Rule: DD-03 / DR-21
  - Scenario: Given 読み取りが `PermissionDenied` を返す, When 判定する
  - Expected: Then 当該ファイルが error に計上され、例外が実行全体を止めないこと

- [x] **T-05-03-05**: I/O 以外の例外は再スローする
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-05`
  - Rule: fail-first / DR-21
  - Scenario: Given 読み取りが I/O 以外の例外を投げる, When 判定する
  - Expected: Then 例外が伝播し、error に丸め込まれないこと

- [x] **T-05-03-06**: 1 件の error が残り全件の処理を止めない
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-03-06`
  - Rule: **DD-03** / REQ-F-008
  - Scenario: Given 3 件中 1 件目が error になる入力群, When 順に判定する
  - Expected: Then 2 件目・3 件目も判定され、それぞれの結果が得られること

### [エッジケース] Edge Cases

#### T-05-04: 境界的な入力

- [x] **T-05-04-01**: 未知フィールドを持つ frontmatter でも stripped になる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-01`
  - Rule: Edge 9 / REQ-C-005
  - Scenario: Given frontmatter に未知フィールドを持つ除去対象, When 判定する
  - Expected: Then `outcome === 'stripped'` であり、未知フィールドが失われないこと

- [x] **T-05-04-02**: CRLF 入力でも stripped になる
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-02`
  - Rule: Edge 11 / REQ-NF-003
  - Scenario: Given 改行コードが CRLF の除去対象, When 判定する
  - Expected: Then `outcome === 'stripped'` であり、LF 版と同じ除去範囲になること

- [x] **T-05-04-03**: 偶然 `## Summary` で始まる発話は passthrough
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-03`
  - Rule: Edge 12 / REQ-F-000
  - Scenario: Given ユーザー発話は偶然 `## Summary` で始まりマーカーが無い, When 判定する
  - Expected: Then `outcome === 'passthrough'` であること (マーカー不在により保護される)

- [x] **T-05-04-04**: マーカーが境界より後ろなら passthrough
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-04`
  - Rule: Edge 13 / REQ-C-004
  - Scenario: Given 定型部が最初の `## Summary` より後ろにある, When 判定する
  - Expected: Then `outcome === 'passthrough'` であること (先頭アンカー方式の対象外)

- [x] **T-05-04-05**: 先頭 strip 後もマーカーの残る入力が stripped になる (合成 fixture)
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-05`
  - Rule: Edge 14 / REQ-F-009
  - Scenario: Given マーカーが 2 個目以降の `## Summary` 以降にも存在する合成入力, When 判定する
  - Expected: Then 先頭の除去が行われ `outcome === 'stripped'` であること
  - Note: 実測 0 件のため合成 fixture が必須

- [x] **T-05-04-06**: 除去率の分母が frontmatter を含まない
  - Target: 判定カスケード
  - Test ID: `T-FL-SCC-04-06`
  - Rule: R-007 (除去率の定義)
  - Scenario: Given 本文が同一で frontmatter の長さのみ異なる 2 入力, When それぞれ判定する
  - Expected: Then 算出される除去率が一致すること

#### T-05-05: 型・定数の形状 (Commit 5)

- [x] **T-05-05-01**: `StripStats` が 5 分類の件数を保持する
  - Target: `StripStats`
  - Test ID: `T-FL-SCC-05-01`
  - Rule: Section 3.2 / AC-008 / DR-30
  - Scenario: Given `StripStats` 型の値, When 各フィールドを参照する
  - Expected: Then `total` / `stripped` / `skipped` / `done` / `passthrough` / `error` を持つこと

- [x] **T-05-05-02**: `StripStats` が `BaseStats` を継承しない
  - Target: `StripStats`
  - Test ID: `T-FL-SCC-05-02`
  - Rule: Commit 5 / DR-15
  - Scenario: Given `StripStats` の定義, When `BaseStats` の `keep`/`skip`/`remove` を参照する
  - Expected: Then それらのキーを持たないこと (`skip` はモード依存で `done` と衝突するため)

- [x] **T-05-05-03**: `STRIP_CACHE_STATUSES` が `as const` + 派生 union である
  - Target: `STRIP_CACHE_STATUSES`
  - Test ID: `T-FL-SCC-05-03`
  - Rule: Commit 5 / REQ-C-001
  - Scenario: Given 定数定義, When 型を参照する
  - Expected: Then `CACHE_STATUSES` と同じ `as const` + `typeof X[keyof typeof X]` の形であること

---

## T-06: 書き込みパイプライン

> Commit 8。Phase 3/4/5 を分割不能な 1 単位として扱う。
> R-009 の順序: 1) tmp へ書き出す → 2) 元を `.bak` へ退避 → 3) tmp を本体名へ移動。
> テスト種別は integration (実 tmp ディレクトリを使う)。

### [正常] Normal Cases

#### T-06-01: 正常な書き込みと退避

- [x] **T-06-01-01**: `.bak` に元の内容が保存される
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-01-01`
  - Rule: R-009 / AC-005
  - Scenario: Given stripped と判定されたファイル, When 書き込みを実行する
  - Expected: Then `<name>.md.bak` の内容が strip 前の原文と一致すること

- [x] **T-06-01-02**: 本体が除去後の内容に置き換わる
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-01-02`
  - Rule: R-009 / AC-001 / AC-002
  - Scenario: Given stripped と判定されたファイル, When 書き込みを実行する
  - Expected: Then `<name>.md` が `## Summary` から始まり、以降の内容が strip 前と一致すること

- [x] **T-06-01-03**: frontmatter が strip 前と同一である
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-01-03`
  - Rule: AC-024 / AC-003 / DR-14
  - Scenario: Given stripped と判定されたファイル, When 書き込みを実行する
  - Expected: Then `ChatlogFrontmatter` の同一性比較で strip 前と同一と判定されること

- [x] **T-06-01-04**: 一時ファイルが残らない
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-01-04`
  - Rule: R-009 / REQ-NF-004
  - Scenario: Given 書き込みが正常完了する, When 完了後のディレクトリを走査する
  - Expected: Then `<name>.md.tmp` が存在しないこと

#### T-06-02: キャッシュ記録のタイミング

- [x] **T-06-02-01**: スワップ成功後にキャッシュへ記録する
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-02-01`
  - Rule: R-009 / AC-013 / REQ-F-009
  - Scenario: Given 書き込みが正常完了する, When 記録処理を確認する
  - Expected: Then キャッシュへの記録が最終リネームの後に行われること

- [x] **T-06-02-02**: スワップ失敗時にキャッシュへ記録しない
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-02-02`
  - Rule: R-009 / R-003
  - Scenario: Given 手順 3 のリネームが失敗する, When 書き込みを実行する
  - Expected: Then キャッシュに記録されないこと (次回実行が誤って done でスキップしない)

### [異常] Error Cases

#### T-06-03: 中断と防御的分岐

- [x] **T-06-03-01**: 手順 1 の中断で元ファイルが完全なまま残る
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-03-01`
  - Rule: AC-020 / REQ-NF-005
  - Scenario: Given tmp への書き出しが失敗する, When 書き込みを実行する
  - Expected: Then `WriteFailed` を返し、`<name>.md` に元の完全な内容が残り、
    `<name>.md.bak` が作られていないこと

- [x] **T-06-03-02**: 手順 2 の中断で元ファイルが完全なまま残る
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-03-02`
  - Rule: AC-020 / REQ-NF-005
  - Scenario: Given 退避のリネームが失敗する, When 書き込みを実行する
  - Expected: Then 退避リネーム時点で置換内容が `<name>.md.tmp` へ退避済みであり、
    `<name>.md` または `<name>.md.bak` の一方に完全な元の内容が残ること

- [x] **T-06-03-03**: 手順 3 の中断で退避に元の内容が残る
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-03-03`
  - Rule: AC-020 / REQ-NF-005 / R-014
  - Scenario: Given 手順 2 と 3 の間で中断する, When 状態を確認する
  - Expected: Then `<name>.md` が存在せず、`<name>.md.bak` に完全な元の内容が残ること (孤立退避)

- [x] **T-06-03-04**: 退避未作成の戻り値を error として計上し書き込みを見送る
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-03-04`
  - Rule: Commit 8 (防御的分岐) / REQ-NF-005
  - Scenario: Given `writeTextFile` が `null` を返す経路に到達する, When 書き込みを実行する
  - Expected: Then error として計上し、本体を書き換えないこと
  - Note: spec 上は「退避未作成でも書き込みは成功」だが、R-004 により本経路は
    到達不能。到達した場合 REQ-NF-005 の保証が崩れるため防御的に error とする

### [エッジケース] Edge Cases

#### T-06-04: 書き込み後の境界状態

- [x] **T-06-04-01**: 手順 2 と 3 の間の中断が孤立退避を生成する
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-04-01`
  - Rule: R-014 / REQ-NF-005 / DR-23
  - Scenario: Given 手順 2 の直後に中断する, When ディレクトリの状態を確認する
  - Expected: Then `<name>.md` が存在せず `<name>.md.bak` のみが残り、
    R-014 が孤立退避として検出できる状態になっていること

- [x] **T-06-04-02**: 既存 `.bak` があるファイルは書き込み経路に到達しない
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-04-02`
  - Rule: R-004 / AC-009
  - Scenario: Given `<name>.md.bak` が既に存在する, When 一連の処理を実行する
  - Expected: Then R-004 により done と判定され、`.bak` の内容が上書きされないこと

- [x] **T-06-04-03**: CRLF 入力でも frontmatter の同一性が保たれる
  - Target: 書き込みパイプライン
  - Test ID: `T-FL-STW-04-03`
  - Rule: AC-024 / Edge 11 / REQ-NF-003
  - Scenario: Given 改行コードが CRLF の除去対象, When 書き込みを実行する
  - Expected: Then 本文が LF へ正規化される一方、frontmatter が同一性比較で
    strip 前と同一と判定されること (バイト単位一致では判定しない)

---

## T-07: バックアップ一括削除

<!-- status: done -->

> **実装メモ (Commit 9 完了時)**: 実装は `modules/strip/sweep-backups.ts` の `sweepBackups`。
> 次の 3 ケースは設計上 Phase 6 の外側 (Commit 11 / 12 の main) に属するため、C9 の射程で
> 表現できる形に読み替えて検証した。**T-08 で main を実装する際に構造レベルで回収すること。**
>
> | ケース     | 読み替えた検証                                                                                                      |
> | ---------- | ------------------------------------------------------------------------------------------------------------------- |
> | T-07-04-04 | `sweepBackups` が `dryRun` 引数を持たないことを検証 (dry-run 時は main が呼ばない設計。`phase-design-note.md` §3.2) |
> | T-07-02-03 | 削除失敗時に `ChatlogError` を **返す** ことを検証 (終了コードは main 終端の throw が生成 — DR-20 決定 2)           |
> | T-07-03-03 | 包含破れ時に `ChatlogError` を **返す** ことを検証 (同上)                                                           |
>
> R-012 と R-013 の区別は `subindex` (`BackupSweepFailed` / `BackupMissing`) が担う。
> 終了コードは 0/1 の二値で両者を区別できないため (DR-20 決定 1)。
>
> **回収済み (Commit 11 / 12 完了時)**: 上記 3 ケースは T-08 で構造レベルの検証として回収した。
> T-07-04-04 は `T-FL-SEP-04-07` / `04-08` (dry-run 時に Phase 3〜6 の副作用が 1 つも観測されない)、
> T-07-02-03 / T-07-03-03 は `T-FL-SEP-02-04` (system テストで実プロセスの終了コードを検証) が担う。
> Commit 9。Phase 6 (R-010 〜 R-013)。削除は **実行の最後に一括で** 行う。
> 包含関係: `{ stripped と判定したパス } ⊆ { 存在する退避のパス }`。
> 検査は stripped 側のパスから期待退避パス `<name>.md.bak` を構成し、退避一覧との
> **完全一致** で確認する (DR-25)。大文字小文字の変換は行わない。
> 報告は **元の形** のパスを出す。

### [正常] Normal Cases

#### T-07-01: 削除の実行条件

- [x] **T-07-01-01**: 全件成功なら対象ディレクトリ配下の退避を一括削除する
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-01-01`
  - Rule: R-010 / AC-015 / DD-02 / DR-08
  - Scenario: Given error が 0 件で dry-run でなく包含が成立する, When 終了処理を実行する
  - Expected: Then 対象ディレクトリ配下の `.bak` が全件削除されること

- [x] **T-07-01-02**: 前回実行の中断で残った退避も削除対象に含む
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-01-02`
  - Rule: R-010 / Section 4.3
  - Scenario: Given 当該実行が作成していない退避が配下に存在し error が 0 件, When 終了処理を実行する
  - Expected: Then その退避も削除されること (作成元を区別しない)

- [x] **T-07-01-03**: passthrough と done の件数が削除可否に影響しない
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-01-03`
  - Rule: R-010 / Section 4.3
  - Scenario: Given stripped が 0 件で done と passthrough のみ、error が 0 件, When 終了処理を実行する
  - Expected: Then 削除が実行されること

#### T-07-05: 当該実行に由来しない退避の報告 (DR-34)

- [x] **T-07-05-01**: 退避がすべて stripped 由来なら警告を出さない
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-06-01`
  - Rule: R-010 / AC-028 / DR-34
  - Scenario: Given 退避一覧が期待退避パスと一致し error が 0 件, When 終了処理を実行する
  - Expected: Then 警告が 1 行も出力されず、削除が実行されること

### [異常] Error Cases

#### T-07-02: 削除を止める条件と失敗の扱い

- [x] **T-07-02-01**: error が 1 件でもあれば退避を全保持する
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-02-01`
  - Rule: R-011 / AC-016
  - Scenario: Given error が 1 件以上ある, When 終了処理を実行する
  - Expected: Then `.bak` が 1 件も削除されないこと

- [x] **T-07-02-02**: 削除失敗時に件数とパスを報告する
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-02-02`
  - Rule: R-012 / DR-10
  - Scenario: Given 削除のうち 2 件が失敗する, When 終了処理を実行する
  - Expected: Then 失敗件数 2 と対象パスが報告されること

- [x] **T-07-02-03**: 削除失敗時の終了コードを成功以外とする
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-02-03`
  - Rule: R-012 / DR-10 / DR-20
  - Scenario: Given 削除に失敗した退避が 1 件以上ある, When 実行を終了する
  - Expected: Then 終了コードが成功以外であること

- [x] **T-07-02-04**: 削除は 1 件失敗しても全件試行する
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-02-04`
  - Rule: R-012 / Section 4.3
  - Scenario: Given 5 件中 2 件目の削除が失敗する, When 終了処理を実行する
  - Expected: Then 残り 3 件の削除も試行され、中断しないこと

- [x] **T-07-02-05**: 削除失敗が分類の件数を変えない
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-02-05`
  - Rule: R-012 / Section 4.3
  - Scenario: Given 削除に失敗した退避がある, When サマリーを確認する
  - Expected: Then stripped / skipped / done / passthrough / error の件数が削除前と変わらないこと

#### T-07-03: 包含関係の破れ (R-013)

- [x] **T-07-03-01**: 包含が成立しなければ退避を保持する
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-03-01`
  - Rule: R-013 / DR-16
  - Scenario: Given stripped と計上したのに対応する退避の無いファイルが存在する, When 終了処理を実行する
  - Expected: Then 退避が 1 件も削除されないこと

- [x] **T-07-03-02**: 不足する退避のパスを報告する
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-03-02`
  - Rule: R-013 / DR-16
  - Scenario: Given 包含が成立しない, When 終了処理を実行する
  - Expected: Then 不足する退避のパスが報告されること

- [x] **T-07-03-03**: 包含破れ時の終了コードを成功以外とする
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-03-03`
  - Rule: R-013 / DR-20
  - Scenario: Given 包含が成立しない, When 実行を終了する
  - Expected: Then 終了コードが成功以外であること

### [エッジケース] Edge Cases

#### T-07-04: 件数比較では代替できない経路と正規化

- [x] **T-07-04-01**: 退避が stripped より多くても包含は成立する
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-04-01`
  - Rule: R-013 / Section 4.3 (件数比較では代替できない)
  - Scenario: Given 退避 5 件に対し stripped が 3 件で、3 件とも退避を持つ, When 包含を検査する
  - Expected: Then 包含が成立すると判定されること (件数の不一致で異常としない)

- [x] **T-07-04-02**: 大文字小文字のみ異なる退避を一致とみなさない
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-04-02`
  - Rule: DR-25
  - Scenario: Given `Foo.md` を stripped と判定したが退避一覧に `Foo.md.bak` は無く `foo.md.bak` のみ存在する,
    When 包含を検査する
  - Expected: Then 包含が成立せず `Foo.md.bak` が不足として報告されること
  - Note: 小文字化キーによる比較では誤って成立し、Phase 6 が退避を削除する (DR-22 を破棄した理由)

- [x] **T-07-04-03**: 報告するパスが元の形である
  - Target: 包含関係の検査
  - Test ID: `T-FL-SBS-04-03`
  - Rule: DR-25
  - Scenario: Given 大文字を含むパスが不足している, When 不足を報告する
  - Expected: Then 大文字小文字を変換せず元の形のパスが出力されること

- [x] **T-07-04-04**: dry-run では削除しない
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-04-04`
  - Rule: R-010 / AC-007 / Section 4.3
  - Scenario: Given dry-run が指定され error が 0 件, When 終了処理を実行する
  - Expected: Then 削除が実行されないこと (退避自体を作成しないため)

- [x] **T-07-04-05**: `normalizePath` がドライブレターを大文字化しファイル名の case を保つ
  - Target: `normalizePath` / `toUnixPath`
  - Test ID: `T-FL-SBS-04-05`
  - Rule: DR-25 の前提検証
  - Scenario: Given `c:\Dir\File.md` のような Windows パス, When `normalizePath` を適用する
  - Expected: Then ドライブレターが大文字化され、ファイル名の大文字小文字が保持されること
  - Note: DR-25 は期待退避パスを stripped 側のパスから構成するため、`normalizePath` が
    ファイル名の case を保つことに依存する。未検証のため明示的に確認する

#### T-07-06: 当該実行に由来しない退避の報告 (DR-34)

- [x] **T-07-06-01**: stripped に由来しない退避の件数とパスが警告される
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-06-02`
  - Rule: R-010 / AC-028 / DR-34
  - Scenario: Given 期待退避パスに含まれない退避が配下に存在し error が 0 件, When 終了処理を実行する
  - Expected: Then 当該退避の件数とパスが警告として出力され、削除は全件について行われること

- [x] **T-07-06-02**: stripped が 0 件でも残存退避が警告される
  - Target: バックアップ一括削除
  - Test ID: `T-FL-SBS-06-03`
  - Rule: R-010 / AC-028 / DR-34
  - Scenario: Given stripped が 0 件で退避が 1 件残り error が 0 件, When 終了処理を実行する
  - Expected: Then 当該退避が警告として報告され、削除が実行されること
  - Note: `glob` を注入する契約レベルのケースであり、実パイプラインでは到達しない。本体があれば
    R-003 / R-004 により `done` となり、本体が無ければ `findOrphans` が error を計上して R-011 が
    削除を止める。`T-FL-SBS-01-02` (zombie) と同じ位置づけです

---

## T-08: エントリポイント

<!-- status: done -->

> **実装メモ (Commit 11 / 12 完了時)**: 実装は `scripts/strip-chatlogs.ts` の `main`。
> テストは `__tests__/integration/strip/strip-main.integration.spec.ts` (通常モード・
> 受理ゲート・復帰専用モード・dry-run)、`__tests__/system/strip/strip-main.system.spec.ts`
> (終了コード。`Deno.Command` で実プロセス起動)、`configs/__tests__/unit/strip-config.unit.spec.ts`
> (T-08-02-05 スキーマ) に分割して配置した。
>
> 実装途中で 2 件の欠陥を検出し修正した。いずれもテストが無い状態で潜伏していたもの。
>
> | 欠陥         | 内容                                                                                                                                               |
> | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 未 import    | `strip-chatlogs.ts` が `DEFAULT_ORIGINAL_LOGS_DIR` を import せずに使用しており型検査が通らなかった                                                |
> | R-015 未結線 | `recoverOrphans` に production の呼び出し元が無く、`--recover-orphans` 指定時に復帰されず **通常の strip が走ってファイルが書き換わる** 状態だった |
>
> Commit 11 / 12。Phase 0/1/7。R-001 の受理ゲート、実行モード分岐 (R-014 / R-015)、サマリー出力。
> 引数スキーマは `skills/filter-chatlogs/scripts/configs/strip-config.ts` に
> `ArgSchema<StripParsedConfig>` として定義する (共通の `parseArgs` は変更しない — DD-04)。
> 終了コードは `ChatlogError` を捕捉して `Deno.exit(1)` (DR-20)。
>
> 実行フェーズ 2〜5 は `_processFiles` として **1 ファイル単位のパイプライン** で実装する
> (DR-28 決定 1)。1 件あたりの責務は `_classifyFile` (判定と書き込みの実行・分類) /
> `_logFileOutcome` (ログ出力) / `_applyFileOutcome` (件数加算) の 3 関数に分け、この順で呼ぶ。
> 実行は `runConcurrent(files, fn, config.concurrency)` で並列度を制限する (DR-28 決定 3)。
> `sweepBackups` (Phase 6) はディレクトリ単位のためループの外に置き、渡す `strippedPaths` は
> **判定** が `stripped` としたパスとする (書き込みの成否で絞り込まない — DR-28 決定 5)。
> 通常実行では `stripped` / `passthrough` を `logger.info` で `<分類>: <path>` の形で
> 1 件ごとに出力する。`done` は出力しない (DR-29 決定 6)。
> 判定 error (R-002 / R-007) と書き込み失敗は `logger.error` で
> `<分類>: <path> (<詳細>)` の形で出力する。判定 error の詳細は `rule=<規則 ID>` とする (DR-37)。

### [正常] Normal Cases

#### T-08-01: 通常モードとサマリー

- [x] **T-08-01-01**: `<agent> <YYYY-MM>` 指定で通常モードとして実行される
  - Target: エントリポイント
  - Test ID: `T-FL-SEP-01-01`
  - Rule: R-014 / REQ-C-008
  - Scenario: Given agent と年月が指定される, When 実行する
  - Expected: Then 対象ディレクトリを列挙し R-002 以降が適用されること

- [x] **T-08-01-02**: サマリーに 5 分類の件数が含まれる
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-02`
  - Rule: AC-008 / REQ-F-006 / DR-30
  - Scenario: Given 実行が完了する, When サマリーを出力する
  - Expected: Then stripped / skipped / done / passthrough / error の件数がすべて含まれること

- [x] **T-08-01-03**: 全件処理の判定式が成立する
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-03`
  - Rule: DR-15 / DR-30 / Section 4.3
  - Scenario: Given 異常なく全件を評価した実行, When 集計を確認する
  - Expected: Then `stripped + skipped + done + passthrough === total` かつ `error === 0` であること

- [x] **T-08-01-04**: dry-run の集計構造が通常実行と一致する
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-04`
  - Rule: REQ-F-005 / Section 3.2 / DR-30
  - Scenario: Given 同一入力に対する dry-run と通常実行, When 双方の集計を比較する
  - Expected: Then 集計構造 (件数フィールドの集合) と `done` / `passthrough` / `error` /
    `total` の件数が一致すること。dry-run の `skipped` が通常実行の `stripped` と一致し、
    dry-run の `stripped` と通常実行の `skipped` がいずれも 0 (排他) であること

- [x] **T-08-01-05**: サマリーに除去前後の合計バイト数が含まれる
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-05`
  - Rule: AC-008 / REQ-F-006
  - Scenario: Given 除去対象と対象外が混在する実行, When サマリーを出力する
  - Expected: Then `bytesBefore` / `bytesAfter` が出力され、その差が実ファイルの縮小量
    (除去範囲最終行の行末終端子 1 バイトを除く) と一致すること

- [x] **T-08-01-06**: dry-run の除去前後バイト数が通常実行と一致する
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-06`
  - Rule: AC-008 / REQ-F-006 / REQ-F-005
  - Scenario: Given 同一入力に対する dry-run と通常実行, When 双方のバイト数を比較する
  - Expected: Then `bytesBefore` / `bytesAfter` が両モードで一致すること
    (1 件ごとの明細はバイト数を出さないため、事前に除去規模を知る唯一の手段である)

### [異常] Error Cases

#### T-08-02: 受理ゲート (R-001)

- [x] **T-08-02-01**: 年月の省略で実行を拒否する
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-01`
  - Rule: R-001 / AC-021 / Edge 7 / DR-07
  - Scenario: Given 年月を省略して起動する, When 実行する
  - Expected: Then 実行が拒否され、1 件も変更されないこと

- [x] **T-08-02-02**: `--input-dir` の指定で実行を拒否する
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-02`
  - Rule: R-001 / AC-022 / Edge 8 / DR-07
  - Scenario: Given 入力ディレクトリの override を指定して起動する, When 実行する
  - Expected: Then 実行が拒否され、1 件も変更されないこと

- [x] **T-08-02-03**: 拒否は列挙より前に評価される
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-03`
  - Rule: R-001 (Section 4.1) / AC-021
  - Scenario: Given 年月を省略して起動する, When 実行する
  - Expected: Then 列挙プロバイダが 1 度も呼ばれないこと

- [x] **T-08-02-04**: 拒否時の終了コードを成功以外とする
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-04`
  - Rule: R-001 / DR-20
  - Scenario: Given 受理範囲外の起動, When 実行が終了する
  - Expected: Then `ChatlogError` を捕捉して終了コードが成功以外であること

- [x] **T-08-02-05**: 受理検査を共通の引数解析に持ち込まない
  - Target: `strip-config.ts`
  - Test ID: `T-FL-SEP-02-05`
  - Rule: **DD-04** / REQ-C-008
  - Scenario: Given strip の受理検査を追加した状態, When `filter` / `noise-filter` を実行する
  - Expected: Then 既存の引数解析の挙動が変化しないこと

- [x] **T-08-02-06**: 第 3 位置引数の出力先指定で実行を拒否する
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-06` / `T-FL-SEP-02-04-03` (system)
  - Rule: R-001 / AC-027 / Edge 16 / DR-32
  - Scenario: Given `<agent> <YYYY-MM> <dir>` の形で第 3 位置引数を与えて起動する, When 実行する
  - Expected: Then 実行が拒否され、1 件も変更されないこと

- [x] **T-08-02-07**: `--output-dir` の指定で実行を拒否する
  - Target: 受理ゲート
  - Test ID: `T-FL-SEP-02-07` / `T-FL-SEP-02-04-04` (system)
  - Rule: R-001 / AC-027 / Edge 16 / DR-32
  - Scenario: Given `--output-dir` を指定して起動する, When 実行する
  - Expected: Then 実行が拒否され、1 件も変更されないこと

#### T-08-03: 孤立退避の検出 (R-014)

- [x] **T-08-03-01**: 通常モードで孤立退避を error として計上する
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-03-01`
  - Rule: R-014 / DR-23
  - Scenario: Given `<name>.md` が無く `<name>.md.bak` が存在する, When 通常モードで実行する
  - Expected: Then 当該 `<name>` が error に計上され、パスが報告されること

- [x] **T-08-03-02**: 孤立退避の error が一括削除を止める
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-03-02`
  - Rule: R-014 / R-011 / DR-23
  - Scenario: Given 孤立退避が 1 件存在し他は全件成功する, When 終了処理に到達する
  - Expected: Then R-011 により退避が全保持されること (復旧材料を失わない)

- [x] **T-08-03-04**: `.md` 由来でない退避は孤立として検出されない
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-05-01`
  - Rule: R-014 / DR-26
  - Scenario: Given `notes.bak` と `work.tmp` が存在する, When 孤立退避を検出する
  - Expected: Then いずれも検出対象に含まれないこと (列挙は `.md.bak` で行うため)

- [x] **T-08-03-05**: `.md.tmp` のみが残る name は孤立として検出されない
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-05-03`
  - Rule: R-014 / DR-26
  - Scenario: Given `<name>.md` が無く `<name>.md.tmp` のみが存在する, When 孤立退避を検出する
  - Expected: Then 検出対象に含まれないこと
  - Note: DR-26 により孤立退避の定義を `.bak` に限定し、DR-23 決定 1 の `.md.tmp` 部分と
    決定 4 を破棄した。REQ-NF-005 手順 1 の時点で `<name>.md` は無傷のため、
    `.tmp` 単独の孤立は正常な処理順序では到達しない

- [x] **T-08-03-03**: 復帰後のキャッシュ削除失敗を error として計上する
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-03-03`
  - Rule: DR-24
  - Scenario: Given `--recover-orphans` で復帰したファイルのキャッシュ削除が失敗する, When 実行する
  - Expected: Then 当該ファイルが error に計上され、パスが報告されること
  - Note: 復帰は完了しているがキャッシュが乖離したままであり、次回実行で strip が漏れる

### [エッジケース] Edge Cases

#### T-08-05: サマリーのバイト数が退化するケース

- [x] **T-08-05-01**: 除去対象が 1 件も無い実行でバイト数が 0 になる
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-01-07`
  - Rule: AC-008 / REQ-F-006
  - Scenario: Given passthrough と error のみのディレクトリ, When サマリーを出力する
  - Expected: Then `bytesBefore` / `bytesAfter` がいずれも 0 であること
    (除去を伴わない分類は本文バイト数を持たない)

#### T-08-04: 復帰専用モード (R-015)

- [x] **T-08-04-01**: `--recover-orphans` で `.bak` を本体名へ復帰させる
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-01`
  - Rule: R-015 / DR-23
  - Scenario: Given `<name>.md` が無く `<name>.md.bak` が存在する, When `--recover-orphans` 付きで実行する
  - Expected: Then `<name>.md.bak` が `<name>.md` へリネームされること

- [x] **T-08-04-02**: 復帰専用モードで strip を行わない
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-02`
  - Rule: R-015 / DR-23
  - Scenario: Given 除去対象のファイルも配下に存在する, When `--recover-orphans` 付きで実行する
  - Expected: Then R-002 〜 R-013 が評価されず、除去対象が変更されないこと

- [x] **T-08-04-03**: `.tmp` のみの孤立は復帰せず報告のみ行う
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-03`
  - Rule: R-015 / DR-23
  - Scenario: Given `<name>.md.tmp` のみが存在する, When `--recover-orphans` 付きで実行する
  - Expected: Then 復帰されず、報告のみ行われること (復帰元が存在しない)

- [x] **T-08-04-04**: `.bak` と `.tmp` が併存すれば `.bak` を採用し `.tmp` を残す
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-04`
  - Rule: R-015 / DR-23
  - Scenario: Given `<name>.md.bak` と `<name>.md.tmp` が併存する, When `--recover-orphans` 付きで実行する
  - Expected: Then `.bak` が `<name>.md` へ復帰し、`.tmp` が残置されること

- [x] **T-08-04-10**: 復帰したファイルのキャッシュエントリを削除する
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-10`
  - Rule: DR-24
  - Scenario: Given `<name>` に処理済みのキャッシュエントリが残り、`<name>.md` を伴わない `<name>.md.bak` のみ存在する,
    When `--recover-orphans` 付きで実行する
  - Expected: Then 復帰後に当該キャッシュエントリが削除されていること
  - Note: 削除しないと次回実行が判定順序の手順 1 で done と誤判定し、定型部が恒久的に残る

- [x] **T-08-04-11**: 復帰しなかった `.tmp` 単独のキャッシュは削除しない
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-11`
  - Rule: DR-24
  - Scenario: Given `<name>.md.tmp` のみが存在し `<name>` にキャッシュエントリが残る,
    When `--recover-orphans` 付きで実行する
  - Expected: Then 復帰されず、キャッシュエントリも削除されないこと (削除対象は復帰したファイルに限る)

- [x] **T-08-04-12**: キャッシュエントリが存在しない復帰は no-op として成功する
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-12`
  - Rule: DR-24
  - Scenario: Given `<name>` にキャッシュエントリが無く `<name>.md.bak` が存在する,
    When `--recover-orphans` 付きで実行する
  - Expected: Then 復帰が成功し、error として計上されないこと

- [x] **T-08-04-13**: 初回のキャッシュ削除失敗が再試行で回復する
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-13`
  - Rule: DR-27
  - Scenario: Given 1 回目のキャッシュ削除だけが失敗する, When `--recover-orphans` 付きで実行する
  - Expected: Then 再試行により削除が成功し error に計上されないこと。
    試行と試行の間に `STRIP_CACHE_DELETE_RETRY_WAIT_MS` の待機が挟まること

- [x] **T-08-04-14**: 全試行が失敗すると error に計上され試行回数が打ち切られる
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-14`
  - Rule: DR-27 / DR-24
  - Scenario: Given 上限を超える回数キャッシュ削除が失敗する, When `--recover-orphans` 付きで実行する
  - Expected: Then 試行が `STRIP_CACHE_DELETE_ATTEMPTS` 回で打ち切られ、当該パスが error に
    計上されること。待機は試行と試行の間にのみ挟まり最終試行の後には挟まないこと
    (待機回数は `STRIP_CACHE_DELETE_ATTEMPTS - 1`)。復帰そのものは成立しているため
    `recovered` にも計上されること

- [x] **T-08-04-05**: 復帰専用モードでも R-001 の受理ゲートを評価する
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-05`
  - Rule: R-015 手順 1 / R-001
  - Scenario: Given 年月を省略し `--recover-orphans` を指定する, When 実行する
  - Expected: Then 実行が拒否され、復帰が行われないこと

- [x] **T-08-04-06**: 復帰専用モードと dry-run の併用で報告のみ行う
  - Target: 復帰専用モード
  - Test ID: `T-FL-SEP-04-06`
  - Rule: R-015 / AC-007
  - Scenario: Given `--recover-orphans` と `--dry-run` を併用する, When 実行する
  - Expected: Then 復帰されず、対象件数とパスの報告にとどまること

- [x] **T-08-04-07**: dry-run 時にファイルシステムが変更されない
  - Target: エントリポイント
  - Test ID: `T-FL-SEP-04-07`
  - Rule: AC-007 / REQ-F-005
  - Scenario: Given 除去対象を含むディレクトリ, When `--dry-run` 付きで実行する
  - Expected: Then 内容・退避・キャッシュのいずれも変化しないこと

- [x] **T-08-04-08**: Phase 3 〜 6 の副作用が 1 つも観測されない
  - Target: エントリポイント
  - Test ID: `T-FL-SEP-04-08`
  - Rule: AC-007 / REQ-F-005 / DR-28
  - Scenario: Given 除去対象と、本体を伴う既存の退避が同居するディレクトリ,
    When `--dry-run` 付きで実行する
  - Expected: Then 本体の内容が変化せず、退避が生成されず、キャッシュへ記録されないこと
    (Phase 3 〜 5)。かつ退避の一括削除が要求されず既存の退避も残ること (Phase 6)。
    error が 0 件であること (R-011 の保持ゲートで削除が止まると偽陽性になるため)
  - Note: DR-28 により「`main` が Phase 3 〜 6 を呼ばない」構造は破棄された。`dryRun` は
    `_processFiles` / `_classifyFile` / `classifyStrip` が引数で受け取り 1 ファイルごとに
    内部で分岐する (`recoverOrphans` と揃えるための意図的な方針変更)。したがって
    「各 Phase 内に `if (dryRun)` 分岐が存在しない」ことは検証対象ではなく、
    観測される副作用の不在そのものをテストで担保する

- [x] **T-08-04-09**: 出力にパスと判定結果が含まれ理由は error のみに付く
  - Target: サマリー出力
  - Test ID: `T-FL-SEP-04-09`
  - Rule: AC-012 / REQ-F-005 / DR-29
  - Scenario: Given dry-run 実行, When 出力を確認する
  - Expected: Then 1 ファイルにつき 1 行の明細としてパスと判定結果が含まれること
    (`<path>: outcome=stripped (skip)` / `outcome=passthrough` / `outcome=done` / `outcome=error rule=R-002`)。
    `rule=` は `error` のときのみ付き、`lines=` / `removedBytes=` はいずれの分類でも出力されないこと
  - Note: DR-29 決定 5 により除去範囲・除去見込みバイト数は明細から全廃された。
    `StripDecision` の当該フィールドは `writeStripped` が使うため存続するが、出力はしない

---

## T-09: フェーズ関数

<!-- status: done -->

> Commit 11 / 12 の `main` から切り出したフェーズ関数のユニットテスト。実装は
> `scripts/strip-chatlogs.ts` の `_processOrphanErrors` (Phase 1 の孤立退避計上) /
> `_processFiles` (Phase 2 〜 6 を 1 ファイル単位のパイプラインへ統合したもの) /
> `_logDecisionDetail` (dry-run 明細 1 行の書式) の 3 関数。
> いずれも `main` の内部関数だがテストから直接呼ぶために export している
> (テスト用 export であり production の呼び出し元は `main` のみ)。
> テストは `__tests__/unit/strip/strip-phases.unit.spec.ts`。
> Test ID 範囲は `T-FL-SEP-06-01` 〜 `T-FL-SEP-06-23` (`-08` は 4 ケースの
> テーブル駆動のため `-08-01` 〜 `-08-04` の枝番を持つ)。
>
> T-08 が `main` 経由の統合・system レベルで振る舞いを押さえるのに対し、本節は
> DR-28 で導入した 1 ファイル単位パイプラインの内部結線 (判定 → 書き込み → ログ →
> 件数加算、およびループ外の `sweepBackups`) を関数単位で押さえる。
> `classifyStrip` / `writeStripped` / `sweepBackups` は `StripMainDeps` に含めず
> 実経路を通すため、検証には実ファイルまたは fake provider を用いる。

### [正常] Normal Cases

#### T-09-01: 孤立退避の計上 (Phase 1)

- [x] **T-09-01-01**: 孤立 2 件で `stats.error` へ 2 件を加算し各件が error ログに出る
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-06-01`
  - Rule: R-014 / DR-23 決定 1
  - Scenario: Given 事前に `stats.error` が 1 件あり、本体を伴わない `.md.bak` が 2 件列挙される,
    When `_processOrphanErrors` を呼ぶ
  - Expected: Then `stats.error` が 3 になり (上書きではなく加算)、他の分類は初期値のまま変化せず、
    error ログが `<INDENT>孤立した退避を検出しました: <bak>（本体なし: <md>）` の形で
    孤立 2 件ぶん逐語に一致して出力されること

#### T-09-02: 判定の全件適用と件数加算 (Phase 2)

- [x] **T-09-02-01**: 各ファイルの `filePath` と判定結果が入力と同順・同数で返る
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-03`
  - Rule: DR-28 決定 1 / DR-28 決定 3
  - Scenario: Given stripped / passthrough / error になる 3 件を入力順に渡す,
    When `_processFiles` を並列度 2 で呼ぶ
  - Expected: Then `decisions.length === 3` であり、`[filePath, outcome]` の並びが
    入力順どおり `stripped` / `passthrough` / `error` となること
  - Note: `runConcurrent` は結果を入力位置へ書き戻すため完了順に依存しない。順序が崩れると
    `sweepBackups` へ渡す stripped のパス集合の由来が追えなくなる

- [x] **T-09-02-02**: stripped 以外の判定が分類ごとに `stats` へ計上される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-07`
  - Rule: DR-30 / DR-28 決定 1
  - Scenario: Given passthrough / done (キャッシュ記録あり) / error の 3 件, When `_processFiles` を呼ぶ
  - Expected: Then `stats` が `{ total: 0, stripped: 0, skipped: 0, done: 1, passthrough: 1, error: 1 }`
    となること (`total` は `_processFiles` では加算しない)

#### T-09-03: dry-run 明細の出力

- [x] **T-09-03-01**: `dryRun` なら宣言行に続き stripped 以外も含む全件の明細が出る
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-18`
  - Rule: REQ-F-005 / DR-29 決定 5 / DR-29 決定 6
  - Scenario: Given stripped / passthrough / done / error になる 4 件, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then 宣言行が明細より前に **1 度だけ** 出力され、4 件それぞれの明細に
    `outcome=stripped (skip)` / `outcome=passthrough` / `outcome=done` / `outcome=error rule=`
    が含まれること。`rule=` は error のみに付き、`lines=` / `removedBytes=` は
    いずれの行にも含まれず、dryrun ログの総数が 5 行 (宣言行 1 + 明細 4) であること

- [x] **T-09-03-02**: 各分類の明細が 1 行の逐語書式で dryrun へ出力される
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-08-01` / `T-FL-SEP-06-08-02` / `T-FL-SEP-06-08-03` / `T-FL-SEP-06-08-04`
  - Rule: REQ-F-005 / AC-012 / DR-29 決定 5
  - Scenario: Given `skipped` / `passthrough` / `done` / `error` の判定結果を直接与える,
    When `_logDecisionDetail(filePath, decision)` を呼ぶ
  - Expected: Then dryrun ログが `a.md: outcome=stripped (skip)` / `a.md: outcome=passthrough` /
    `a.md: outcome=done` / `a.md: outcome=error rule=R-002` のいずれか 1 行のみとなり、
    かつ info / error ログが 1 行も出力されないこと
  - Note: 4 ケースのテーブル駆動のため Test ID は枝番を持つ

- [x] **T-09-03-03**: 判定 `stripped` には `(skip)` を付けない
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-23`
  - Rule: DR-29 決定 3 / DR-29 決定 5
  - Scenario: Given 判定 `stripped` の結果を直接与える, When `_logDecisionDetail` を呼ぶ
  - Expected: Then dryrun ログが `a.md: outcome=stripped` のちょうど 1 行であること
    (判定 `stripped` と dry-run の `skipped` は別状態であり、表示を統合すると区別が失われる)

#### T-09-04: 書き込みと退避の一括削除 (Phase 3 〜 6)

- [x] **T-09-04-01**: 本体を書き換え stripped を計上し退避を一括削除する
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-10`
  - Rule: R-009 / R-010 / DR-14 / DR-28 決定 5
  - Scenario: Given 除去対象 1 件と、対応する退避を返す `GlobProvider`, When `_processFiles` を呼ぶ
  - Expected: Then `sweepError` が `undefined`、`stats.stripped === 1` かつ `stats.error === 0` で、
    本体から定型部が消え `## Summary` は残り、キャッシュの `status` が `stripped` として
    1 回書き込まれ、退避が削除対象として 1 件記録されること

- [x] **T-09-04-02**: 通常実行で stripped / passthrough のパスが 1 行ずつ出て done は出ない
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-21`
  - Rule: DR-29 決定 6 / REQ-F-005
  - Scenario: Given stripped / passthrough / done の 3 件, When `dryRun` を偽として `_processFiles` を呼ぶ
  - Expected: Then info ログに `<INDENT>stripped: <path>` と `<INDENT>passthrough: <path>` が
    それぞれ含まれ、done のパスは 1 度も現れず、`.md` を含む info 行がちょうど 2 行であること
    (done への報告追加と同一ファイルの二重報告の双方を検出する)

- [x] **T-09-04-03**: `## Summary` 不在の passthrough が status=passthrough / rule=R-005 で記録される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-24`
  - Rule: R-005 / AC-025 / AC-026 / DR-31 決定 1・4
  - Scenario: Given `## Summary` を持たない 1 件, When `dryRun` を偽として `_processFiles` を呼ぶ
  - Expected: Then キャッシュの `status` が `passthrough`、`rule` が `R-005` として 1 回書き込まれ、
    `stats.passthrough === 1` / `stats.error === 0` であること

- [x] **T-09-04-04**: マーカー不在の passthrough が status=passthrough / rule=R-006 で記録される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-25`
  - Rule: R-006 / AC-025 / AC-026 / DR-31 決定 1・4
  - Scenario: Given `## Summary` を持つがその手前にマーカーが無い 1 件,
    When `dryRun` を偽として `_processFiles` を呼ぶ
  - Expected: Then キャッシュの `status` が `passthrough`、`rule` が `R-006` として 1 回書き込まれ、
    `stats.passthrough === 1` / `stats.error === 0` であること
  - Note: R-005 側だけでは `rule` を `R-005` へ固定した実装を検出できないため、両規則を通す

### [異常] Error Cases

#### T-09-05: 書き込み失敗と退避不足

- [x] **T-09-05-01**: `writeStripped` のエラーが INDENT 付きで error ログに出る
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-11`
  - Rule: DD-03 / R-011 / DR-21
  - Scenario: Given 判定は通過するがキャッシュ記録が失敗する (`CacheWriteFailed`), When `_processFiles` を呼ぶ
  - Expected: Then throw されず `stats.error === 1` / `stats.stripped === 0` となり、
    error ログが 1 行だけ出てそれが `LOGGER_TEXT.INDENT` で始まり失敗メッセージを含むこと。
    error のため退避は削除されず `removed` が空になること。`sweepError` は `undefined` であること
  - Note: 既存退避による失敗 (`BackupAlreadyExists`) は R-004 が done にするため到達不能であり、
    書き込みだけを失敗させる唯一の経路がキャッシュ記録の失敗です

- [x] **T-09-05-02**: 事前の error 件数が `sweepBackups` へ渡り退避が保持される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-12`
  - Rule: R-011 / R-014 / DR-28 決定 1
  - Scenario: Given 対象ファイルが 0 件で `stats.error` が 1 件 (Phase 1 の孤立退避由来),
    When `_processFiles` を呼ぶ
  - Expected: Then `sweepError` が `undefined` で削除が 1 件も行われず、
    info ログに `error 1 件のため退避を保持します` が含まれること

- [x] **T-09-05-03**: 退避不足時は `ChatlogError` が throw されず戻り値として返る
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-13`
  - Rule: R-013 / DR-16 / DR-20 決定 2
  - Scenario: Given 書き込みは成功し `stats.error` が 0 のまま、退避一覧が空で包含が破れる,
    When `_processFiles` を呼ぶ
  - Expected: Then `stats.error === 0` のまま `sweepError` が返り、その `subindex` が
    `BackupMissing` であること。削除は 1 件も行われないこと
  - Note: サマリー出力の後に throw する順序は `main` の責務であり、ここでは値として返すことを確認する

- [x] **T-09-05-04**: passthrough のキャッシュ記録失敗が error に計上される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-26`
  - Rule: DR-31 決定 3 / R-011 / DD-03
  - Scenario: Given passthrough と判定されるファイル 1 件と、書き込みが失敗するキャッシュ,
    When `dryRun` を偽として `_processFiles` を呼ぶ
  - Expected: Then throw されず `stats.error === 1` / `stats.passthrough === 0` /
    `stats.stripped === 0` となり、本体の内容が原文と完全一致し、
    error ログが 1 行だけ出て失敗メッセージを含み、退避が削除されないこと
  - Note: 分類は 1 ファイルにつき 1 つであり `passthrough` と `error` は排他になる。
    記録失敗を成功として報告する経路を塞ぐ

### [エッジケース] Edge Cases

#### T-09-06: 孤立 0 件と対象 0 件の境界

- [x] **T-09-06-01**: 孤立 0 件なら `stats` は不変でログも出ない
  - Target: 孤立退避の検出
  - Test ID: `T-FL-SEP-06-02`
  - Rule: R-014 / DR-26
  - Scenario: Given 本体のみ存在し対応する退避を持たない, When `_processOrphanErrors` を呼ぶ
  - Expected: Then `stats` が初期値のまま変化せず、error ログが 1 行も出ないこと

- [x] **T-09-06-02**: 対象ファイルが 0 件なら判定は空配列になる
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-06`
  - Rule: DR-28 決定 1
  - Scenario: Given 対象ファイル一覧が空, When `_processFiles` を呼ぶ
  - Expected: Then `decisions` が空配列であること

- [x] **T-09-06-03**: `dryRun` かつ対象 0 件でも宣言行だけは出力される
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-19`
  - Rule: REQ-F-005 / AC-007
  - Scenario: Given 対象ファイル一覧が空, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then `decisions` が空配列で、dryrun ログが宣言行 1 行のみであること
    (宣言行をループ内へ移すと件数分重複し 0 件では消える — ループ外 1 回であることの証明)

- [x] **T-09-06-04**: `dryRun` でなければ宣言行と明細のいずれも出力されない
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-20`
  - Rule: REQ-F-005
  - Scenario: Given 除去対象 1 件, When `dryRun` を偽として `_processFiles` を呼ぶ
  - Expected: Then dryrun ログが 1 行も出力されないこと

#### T-09-07: キャッシュ・退避による done 判定の結線

- [x] **T-09-07-01**: キャッシュに stripped 記録があるファイルは R-003 で done になる
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-04`
  - Rule: R-003 / AC-014 / Edge 4
  - Scenario: Given 除去対象だがキャッシュに `status: stripped` の記録を持つ, When `_processFiles` を呼ぶ
  - Expected: Then 判定の `outcome` が `done` かつ `reason.rule` が `R-003` であること
    (`isProcessed` が `STRIP_CACHE_STATUSES.STRIPPED` と照合されていなければ stripped のままになる)

- [x] **T-09-07-02**: 退避が既存のファイルは R-004 で done になる
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-05`
  - Rule: R-004 / AC-006 / Edge 3
  - Scenario: Given 除去対象と同名の `<name>.md.bak` が実在する, When `_processFiles` を呼ぶ
  - Expected: Then 判定の `outcome` が `done` かつ `reason.rule` が `R-004` であること
    (`hasBackup` へ `${path}${BAK_SUFFIX}` を渡していなければ stripped のままになる)

#### T-09-08: 明細への除去情報の非出力

- [x] **T-09-08-01**: 除去を伴う判定でも `lines=` と `removedBytes=` は出力されない
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-09`
  - Rule: DR-29 決定 5 / REQ-F-005
  - Scenario: Given 除去範囲 4-9 / 除去バイト数 42 を保持する `skipped` の判定結果,
    When `_logDecisionDetail` を呼ぶ
  - Expected: Then 明細行に `lines=` と `removedBytes=` のいずれも含まれず、かつ判定結果側の
    `removalStartLine === 4` / `removedBytes === 42` は保持されたままであること
    (値が消えたのではなく出力しないだけであることを保持値ごと検証する)

#### T-09-09: dry-run の非破壊性

- [x] **T-09-09-01**: dry-run では本体が書き換わらず `.bak` / `.tmp` も作られない
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-14`
  - Rule: AC-007 / REQ-F-005 / REQ-NF-004
  - Scenario: Given 除去対象 1 件, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then `sweepError` が `undefined` で本体の内容が原文と完全一致し、
    `<name>.md.bak` / `<name>.md.tmp` のいずれも存在せず、キャッシュ書き込みが 0 回で
    `cache.read(path).status` が `undefined` のまま、error ログも出ないこと

- [x] **T-09-09-02**: dry-run では `sweepBackups` へ到達せず退避が削除されない
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-15`
  - Rule: AC-007 / R-010 / DR-28 決定 1
  - Scenario: Given 退避一覧を非空で与え、到達すれば削除が要求される状態, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then `sweepError` が `undefined` で、**退避の列挙に用いる glob パターンが
    1 度も渡されない** こと (`patterns` が空配列)。削除記録も空であること
  - Note: `removed` が空なだけでは R-011 の保持ゲートで止まった場合と区別できないため、
    glob 未呼び出しで短絡を証明する

- [x] **T-09-09-03**: dry-run では stripped 判定の件数が `stats.skipped` へ計上される
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-16`
  - Rule: DR-30 / DR-29 決定 3 / REQ-F-005
  - Scenario: Given 除去対象 2 件と passthrough 1 件, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then `stats` が `{ total: 0, stripped: 0, skipped: 2, done: 0, passthrough: 1, error: 0 }`
    であること (通常実行なら `stripped: 2` に計上される件数が `skipped` へ振り替わり両者は排他。
    非 stripped の判定は同じループ内で本来の分類へ計上される)

- [x] **T-09-09-04**: dry-run 明細は 1 ファイルにつきちょうど 1 行になる
  - Target: dry-run 明細
  - Test ID: `T-FL-SEP-06-17`
  - Rule: REQ-F-005 / DR-28 決定 1
  - Scenario: Given stripped / passthrough / error の 3 件, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then dryrun ログの総数が `ファイル数 + 1` (宣言行) となり、各ファイルのパスで
    始まる明細がそれぞれちょうど 1 行であること
  - Note: 判定と書き込みが 1 ループへ統合されたため、分類ごとに別々の dryrun 行を足すと
    同一ファイルの明細が二重に出る

- [x] **T-09-09-05**: dry-run では通常実行用の info 行が出ず明細のみになる
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-22`
  - Rule: DR-29 決定 6 / AC-007 / REQ-F-005
  - Scenario: Given stripped / passthrough / done の 3 件, When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then info ログが 1 行も出力されないこと (通常実行の分類報告を dry-run にも出すと
    同一ファイルが明細と分類報告の 2 行で報告され、未実施の書き換えを実施したかのように読ませる)

- [x] **T-09-09-06**: dry-run では passthrough がキャッシュへ記録されない
  - Target: フェーズ関数
  - Test ID: `T-FL-SEP-06-27`
  - Rule: DR-31 決定 5 / AC-007 / REQ-F-005
  - Scenario: Given R-005 / R-006 で passthrough となる 2 件,
    When `dryRun` を真として `_processFiles` を呼ぶ
  - Expected: Then キャッシュ書き込みが 0 回で両ファイルの `status` が `undefined` のままとなり、
    `stats.passthrough === 2` / `stats.error === 0` であること (記録の有無は分類を変えない)
  - Note: 記録すると次回の通常実行が R-003 で done と判定し、strip が永久に行われない

---

## T-10: 到達範囲の拡張 (DR-38 / DR-39 / DR-40)

<!-- status: done -->

> 受理ゲートの改訂 (入力ディレクトリの受理) 、走査の再帰化、キャッシュキー衝突の fail-fast。
> テストは `__tests__/integration/strip/strip-main.integration.spec.ts` /
> `__tests__/system/strip/strip-main.system.spec.ts` /
> `__tests__/unit/strip/find-orphans.unit.spec.ts` /
> `__tests__/unit/strip/sweep-backups.unit.spec.ts`。

### [正常] Normal Cases

#### T-10-01: 入力ディレクトリの受理 (R-001 / DR-38)

- [x] **T-10-01-01**: `--input-dir` / 第 1 位置引数のいずれでも当該ディレクトリが対象になる
  - Target: `_assertAcceptedRange` / `resolveChatlogsDir` の override 結線
  - Test ID: `T-FL-SEP-02-02`, `T-FL-SEP-02-08`, `T-FL-SEP-02-09`
  - Rule: R-001 / DR-38 決定 1・2
  - AC: AC-022 / AC-031 / AC-032
  - Scenario: Given 入力ディレクトリを指定し period を省略した引数, When `main` を実行する
  - Expected: Then 受理され、既定の解決先ではなく指定ディレクトリのファイルが処理されること
- [x] **T-10-01-02**: 復帰専用モードでも入力ディレクトリの対象を見る
  - Test ID: `T-FL-SEP-02-10`
  - Rule: R-001 / R-015
- [x] **T-10-01-03**: system レベルで `--input-dir` 指定が終了コード 0 で完了する
  - Test ID: `T-FL-SEP-02-04-02`
  - Rule: R-001 / DR-38 決定 1

#### T-10-02: 再帰走査 (R-017 / DR-39)

- [x] **T-10-02-01**: サブディレクトリ配下の `.md` が列挙され除去される
  - Test ID: `T-FL-SEP-09-01`
  - Rule: R-017 / DR-39 決定 1
  - AC: AC-033
- [x] **T-10-02-02**: サブディレクトリの `stripped` で R-013 の包含検査が成立し、退避を削除する
  - Test ID: `T-FL-SEP-09-02`, `T-FL-SBS-09-01`
  - Rule: R-010 / R-013 / R-017
  - AC: AC-035
- [x] **T-10-02-03**: `findOrphans` がサブディレクトリ (深さ 2 含む) の孤立退避を検出する
  - Test ID: `T-FL-SEP-03-08`
  - Rule: R-014 / R-017
- [x] **T-10-02-04**: `--recover-orphans` がサブディレクトリの孤立退避を復帰する
  - Test ID: `T-FL-SEP-09-04`
  - Rule: R-015 / R-017

### [異常] Error Cases

#### T-10-03: 受理ゲートの維持 (R-001)

- [x] **T-10-03-01**: 入力ディレクトリなしの period 省略は拒否される
  - Test ID: `T-FL-SEP-02-01`, `T-FL-SEP-02-03`, `T-FL-SEP-02-04-01`
  - Rule: R-001 / DR-38 決定 2
  - AC: AC-021
- [x] **T-10-03-02**: 出力ディレクトリの指定は拒否される
  - Test ID: `T-FL-SEP-02-06`, `T-FL-SEP-02-07`, `T-FL-SEP-02-04-03`, `T-FL-SEP-02-04-04`
  - Rule: R-001 / DR-32 / DR-38 決定 3
  - AC: AC-027

#### T-10-04: キャッシュキーの衝突 (R-016 / DR-40)

- [x] **T-10-04-01**: ベース名が重複する列挙結果で実行が拒否される
  - Test ID: `T-FL-SEP-08-01`
  - Rule: R-016 / DR-40 決定 1・2
  - AC: AC-036 / AC-037
- [x] **T-10-04-02**: 拒否時に本体・退避・キャッシュのいずれも変更されない
  - Test ID: `T-FL-SEP-08-02`
  - Rule: R-016
- [x] **T-10-04-03**: `--dry-run` でも拒否され判定明細を出力しない
  - Test ID: `T-FL-SEP-08-03`
  - Rule: R-016

### [エッジケース] Edge Cases

- [x] **T-10-05-01**: 空のサブディレクトリがあっても完走する
  - Test ID: `T-FL-SEP-09-05`
  - Rule: R-017
  - Edge: Edge 18
- [x] **T-10-05-02**: サブディレクトリの孤立退避を error に計上し、R-011 で退避を保持する
  - Test ID: `T-FL-SEP-09-03`
  - Rule: R-011 / R-014 / R-017
  - AC: AC-034

## Coverage Check

母集団は Edge Cases 14 行 (Edge 10 を除く) + Active DD 2 件 + DR 26 件
(DR-01〜DR-31 のうち、破棄済みの DR-04 / DR-06 決定 1 / DR-12 / DR-13 / DR-22 を除く)。

### Edge Cases (spec Section 5)

| Edge | 内容                                 | Task ID                                        |
| ---- | ------------------------------------ | ---------------------------------------------- |
| 1    | `## Summary` ありマーカーなし        | T-05-01-04                                     |
| 2    | `## Summary` を 1 つも持たない       | T-04-02-01, T-05-01-03                         |
| 3    | 退避ファイルが既に存在               | T-05-01-02, T-01-05-01, T-06-04-02, T-09-07-02 |
| 4    | キャッシュに記録あり・退避なし       | T-05-01-01, T-09-07-01                         |
| 5    | 除去後の本文が空                     | T-05-03-01                                     |
| 6    | 除去率が 99% 超                      | T-05-03-02                                     |
| 7    | 年月を省略して起動                   | T-08-02-01                                     |
| 8    | 入力ディレクトリを指定 (受理)        | T-10-01-01                                     |
| 9    | frontmatter に未知フィールド         | T-05-04-01, T-03-02-02                         |
| 10   | ネスト構造・ブロックスカラー         | 対象外 (前提外・仕様未規定)                    |
| 11   | 改行コードが CRLF                    | T-04-03-01, T-05-04-02, T-06-04-03             |
| 12   | 偶然 `## Summary` で始まる発話       | T-05-04-03                                     |
| 13   | 定型部が最初の `## Summary` より後ろ | T-05-04-04                                     |
| 14   | 先頭 strip 後もなお定型部が残る      | T-05-04-05                                     |
| 15   | frontmatter を持たない               | T-05-03-03                                     |
| 18   | 対象がサブディレクトリを持つ         | T-10-02-01 〜 T-10-02-04, T-10-05-01           |
| 19   | ベース名が重複するファイルを列挙     | T-10-04-01 〜 T-10-04-03                       |
| 20   | 入力ディレクトリ指定で年月を省略     | T-10-01-01                                     |

### Active Design Decisions (spec Section 2.5)

| DD    | 内容                                       | Task ID                |
| ----- | ------------------------------------------ | ---------------------- |
| DD-03 | 安全弁は個別ファイル単位・実行を中断しない | T-05-03-06, T-05-03-04 |
| DD-04 | 受理検査は strip 側で行う                  | T-08-02-05             |

> DD-01 は Obsolete (DR-14)、DD-02 は Promoted → DR-08 のため対象外。

### Decision Records (spec Section 2.6)

| DR    | 観測可能な振る舞い                              | Task ID                                                                              |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| DR-01 | 除去境界は最初の `## Summary` 直前まで          | T-05-01-06                                                                           |
| DR-02 | in-place + 退避                                 | T-06-01-01, T-06-01-02                                                               |
| DR-03 | 退避を Provider として抽象化                    | T-02-01-03, T-01-02-01                                                               |
| DR-05 | 並び順の明示義務                                | T-05-04-01                                                                           |
| DR-07 | 受理範囲の限定による強制 (DR-38 が一部を上書き) | T-08-02-01                                                                           |
| DR-08 | 対象ディレクトリ単位の一括削除                  | T-07-01-01, T-07-01-02                                                               |
| DR-09 | frontmatter 欠落を error とする                 | T-05-03-03                                                                           |
| DR-10 | 削除失敗の報告と終了コード反映                  | T-07-02-02, T-07-02-03                                                               |
| DR-11 | R-007 と REQ-F-008 の 1 対 1 対応               | T-05-03-01, T-05-03-02                                                               |
| DR-14 | 処理済みマーカーをキャッシュへ移す              | T-06-01-03, T-06-02-01                                                               |
| DR-15 | `done` を独立分類として扱う                     | T-05-01-01, T-08-01-03                                                               |
| DR-16 | 削除前に包含関係を検査                          | T-07-03-01, T-07-04-01                                                               |
| DR-17 | `backupToBak` は既存 `.bak` をスキップ          | T-01-05-01, T-01-05-02                                                               |
| DR-23 | 孤立退避の検出と復帰専用モードの分離            | T-08-03-01, T-08-04-01, T-06-04-01                                                   |
| DR-24 | 復帰時のキャッシュエントリ削除                  | T-08-04-10, T-08-04-11, T-08-03-03                                                   |
| DR-25 | 包含検査は期待退避パスの実在確認                | T-07-04-02, T-07-04-03, T-07-04-05                                                   |
| DR-26 | 孤立退避を `.bak` に限定し `.tmp` を除外        | T-08-03-04, T-08-03-05                                                               |
| DR-27 | キャッシュ削除は待機を挟み固定 2 回再試行       | T-08-04-13, T-08-04-14                                                               |
| DR-28 | 1 ファイル単位パイプラインと並列度制限          | T-08-04-08, T-09-02-01, T-09-05-02                                                   |
| DR-29 | 分類の単一責務化・5 値化・報告書式簡素化        | T-05-01-09 〜 T-05-01-11, T-08-04-09, T-09-03-03, T-09-04-02, T-09-08-01, T-09-09-05 |
| DR-30 | 分類と統計を 1 対 1 に対応させる                | T-05-05-01, T-08-01-02 〜 T-08-01-04, T-09-02-02, T-09-09-03                         |
| DR-31 | passthrough もキャッシュへ記録する              | T-05-01-12, T-05-01-13, T-09-04-03, T-09-04-04, T-09-05-04, T-09-09-06               |
| DR-38 | 入力ディレクトリの指定を受理する                | T-10-01-01 〜 T-10-01-03, T-10-03-01, T-10-03-02                                     |
| DR-39 | 対象ディレクトリを再帰的に走査する              | T-10-02-01 〜 T-10-02-04, T-10-05-01, T-10-05-02                                     |
| DR-40 | キャッシュキーの衝突を fail-fast する           | T-10-04-01 〜 T-10-04-03                                                             |

DR-18 / DR-19 / DR-20 / DR-21 は本モジュールのタスクに直接の Target を持たない。

| DR    | 扱い                                                                             |
| ----- | -------------------------------------------------------------------------------- |
| DR-18 | `_cle-libs` の `backupOldPath` の戻り値拡幅。検証は `T-LIB-B-08` 〜 `T-LIB-B-10` |
| DR-19 | `ChatlogFrontmatter.equals()` の新設。呼び出し元をテストに限定する決定           |
| DR-20 | 終了コードの二値化。R-012 / R-013 / R-001 のタスクが Rule として参照する         |
| DR-21 | 読み取り失敗の切り分け。T-05-03-04 / T-05-03-05 が Rule として参照する           |

> DR-04 (DR-14 により破棄) / DR-06 決定 1 (DR-08 により破棄) /
> DR-12 (DR-17 により破棄) / DR-13 (DR-15 により破棄) /
> DR-22 (DR-25 により破棄) は対象外。

### Acceptance Criteria

| AC     | Task ID                                        | AC     | Task ID                               |
| ------ | ---------------------------------------------- | ------ | ------------------------------------- |
| AC-001 | T-05-01-05, T-06-01-02                         | AC-013 | T-06-02-01                            |
| AC-002 | T-05-01-06, T-06-01-02                         | AC-014 | T-05-01-01                            |
| AC-003 | T-06-01-03                                     | AC-015 | T-07-01-01                            |
| AC-004 | T-05-01-03                                     | AC-016 | T-07-02-01                            |
| AC-005 | T-06-01-01                                     | AC-019 | (対象外 — DR-14 により定数制約が不要) |
| AC-006 | T-05-01-02                                     | AC-020 | T-06-03-01 〜 T-06-03-03              |
| AC-007 | T-07-04-04, T-08-04-07, T-09-09-01, T-09-09-02 | AC-021 | T-08-02-01, T-08-02-03                |
| AC-008 | T-08-01-02, T-08-01-05, T-08-01-06, T-08-05-01 | AC-022 | T-10-01-01                            |
| AC-009 | T-01-05-02                                     | AC-023 | T-05-03-03                            |
| AC-010 | T-05-01-04                                     | AC-024 | T-03-01-01, T-06-01-03                |
| AC-011 | T-05-03-01                                     | AC-025 | T-09-04-03, T-09-04-04                |
| AC-012 | T-05-01-08, T-08-04-09                         | AC-026 | T-05-01-13, T-09-04-03, T-09-04-04    |
|        |                                                | AC-028 | T-07-05-01, T-07-06-01, T-07-06-02    |
| AC-031 | T-10-01-01                                     | AC-035 | T-10-02-02                            |
| AC-032 | T-10-01-01                                     | AC-036 | T-10-04-01                            |
| AC-033 | T-10-02-01                                     | AC-037 | T-10-04-01                            |
| AC-034 | T-10-05-02                                     |        |                                       |

> AC-017 / AC-018 は DR-14 により Superseded のため対象外。

**`[UNCOVERED]`: なし**

---

## Category Balance

| Test Target | Normal | Error  | Edge   | Cases   | 判定    |
| ----------- | ------ | ------ | ------ | ------- | ------- |
| T-01        | 7      | 2      | 2      | 11      | [OK]    |
| T-02        | 5      | 2      | 1      | 8       | [OK]    |
| T-03        | 3      | 4      | 2      | 9       | [OK]    |
| T-04        | 3      | 2      | 4      | 9       | [OK]    |
| T-05        | 17     | 6      | 9      | 32      | [OK]    |
| T-06        | 6      | 4      | 3      | 13      | [ADDED] |
| T-07        | 4      | 8      | 7      | 19      | [OK]    |
| T-08        | 6      | 12     | 15     | 33      | [OK]    |
| T-09        | 10     | 4      | 13     | 27      | [OK]    |
| **合計**    | **61** | **44** | **56** | **161** | —       |

> **[ADDED] T-06**: 初版では Edge が 0 件であり Category Balance ゲートに違反していた。
> 埋め草ではなく、仕様上実在する境界状態から 3 件を追加した (T-06-04-01 〜 T-06-04-03)。
> とりわけ T-06-04-01 は R-014 の孤立退避が「どう生成されるか」を書き込み側から
> 押さえるもので、T-08-03-01 (検出側) と対になる。

ゼロ件のカテゴリを持つ Test Target は存在しない。

---

<!--
Task ID Format: T-<TestTarget>-<Scenario>-<Case>
- TestTarget: 2-digit (01, 02, ...)
- Scenario: 2-digit (01, 02, ...)
- Case: 2-digit (01, 02, ...)

Test ID Format: .claude/rules/testing-conventions.md 4 節を参照。
prefix の一覧は台帳として持たず、同節 4-3 のコマンドで実体から導出・検査する。

このモジュールで使う prefix:
- T-FL-SBD / T-FL-SCC / T-FL-STW / T-FL-SBS / T-FL-SEP → filter-chatlogs strip
- T-LIB-BTB / T-LIB-B / T-LIB-WTF / T-CLS-CF → _cle-libs

T-FL-SWP は filter-chatlogs filter / sweep-discards (SWeeP discards) が使用中のため
strip では使わない。書き込みパイプラインは当初この prefix を使い ID が衝突したため
T-FL-STW へ改名した（cle-qb0）。
-->
