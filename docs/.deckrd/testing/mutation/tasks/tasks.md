---
title: "Implementation Tasks"
module: testing/mutation
status: Active
created: "2026-10-08 00:00:00"
source: specifications-index.md
based-on: implementation.md v1.6.0
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/ja-no-redundant-expression,
  ja-technical-writing/no-unmatched-pair,
  ja-technical-writing/max-comma,
   -->
<!-- markdownlint-disable no-duplicate-heading line-length no-space-in-code -->
<!-- cspell:words unallowed -->

> This document contains implementation tasks derived from specifications.
> Each task corresponds to a single unit test case (`it()` block).

---

## Conventions

### 参照の書き方

- `Rule` の `R-NNN` / `DD-NN` には **必ず spec 分冊名を前置** する
  (`index` / `generation` / `execution` / `allowlist` / `report-cli`)。DD 番号は分冊ごとに独立している。
- `Edge <分冊>-<n>` は各 spec の §5 Edge Cases 表の行を、出現順に 1 起点で数えたもの。
- `DR-NN` は `decision-records.md`、`REQ-*` / `AC-NNN` は `requirements.md` v1.1.0 を指す。

### 2 つの ID 名前空間

| ID                     | 名前空間                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `T-XX-YY-ZZ`           | deckrd のタスク ID。本文書内でのみ一意                                                |
| `T-MUT-<abbrev>-GG-CC` | このリポジトリのテスト ID (`docs/rules/testing-conventions.md`)。リポジトリ全体で一意 |

各タスクの `Test ID` が実装時に `it()` ラベルへ載る値であり、`T-XX-YY-ZZ` はコードに現れない。
`T-MUT-*` は 2026-10-08 時点でリポジトリ内に未使用であることを確認した (Commit 1 で改称する `T-MUT-GM-*` を除く)。
GG はシナリオ (`T-XX-YY`) ごとに 1 つ、CC はその中の連番である。

2 つの Test Target が共有する abbrev は、グループ番号の帯を分けて重ねない (testing-conventions §4-2)。

| abbrev | Test Target | 帯              |
| ------ | ----------- | --------------- |
| AL     | T-04 / T-05 | 01〜09 / 10〜19 |
| RP     | T-06 / T-07 | 01〜09 / 10〜19 |
| RS     | T-09 / T-10 | 01〜09 / 10〜19 |
| MT     | T-13 / T-14 | 01〜09 / 10〜29 |

### 実装単位

実装単位は `implementation.md` の Commit 1〜18 で識別する。各 `## T-XX` 直下の blockquote が Commit 番号・配置・テストファイル・Test ID の帯を持つ。
1 回の `/bdd-coder` 委譲は 1 つの Test Target (= 1 Commit) とし、チェックリストには当該 T-XX の分だけを載せる (bdd-cycle ルール)。

次のコミットは振る舞いを持たないため Test Target を持たない (implementation §1.1)。全 T-XX が done になっても、別途完了を確認すること。

- **Commit 1** (`T-GM-*` → `T-MUT-GM-*` の改称、71 件): 改称前後でテスト件数が同じこと、`scripts/check-test-ids.ts` が重複を出さないことで検証する。T-01 より先に行う
- **Commit 2** (型のみ): `deno check` で検証する。T-01〜T-03 の前提
- **Commit 17** (`test:mutate` タスクと owns): 引数エラー経路の手動確認を beads の note に残す。
  確認する振る舞いは、`import.meta.main` ブロックが `main` の戻り値を `Deno.exit` に渡すこと、例外は stderr に出して終了コード 1 にすること (REQ-C-003 / report-cli DD-09)、引数エラーは理由を stderr に出して stdout に何も出さないこと (report-cli §4.1 / Edge report-cli-1・24 の stderr 部分)、`test:mutate` タスクの権限

### Test Target を跨ぐ規則

`main` が順序を制御する規則 (execution R-201 / R-204 / R-208 / R-212 / R-213 / R-227 / R-228、allowlist R-505 の順序、index R-001〜R-014) は、
部品側の T-XX では部品の振る舞いだけを検証し、結線と終了コードは T-14 で検証する。各断片の Coverage Check はこの委譲先を明記している。

### 実装時に確定させる判断 (タスク生成時の仮置き)

- 命名判定関数の名前は `isMutationArtifact(fileName)` と置いた (implementation に名前が無い)
- `resolveTargets` / `loadAllowlist` / `runDenoTest` は、unit テストのために探索ルート・読み込みルート・spawn の注入点を要する。形は実装時に決める
- `main` の依存注入は T-14 の blockquote の `MainDeps` 案による。**ユーザー確認待ち**
- 非 0 の終了コードは 130 以外すべて 1 とした (report-cli DD-09)

---

## Task Summary

| Test Target                                                                           | Commit | Phase | Scenarios | Cases   | Status      |
| ------------------------------------------------------------------------------------- | ------ | ----- | --------- | ------- | ----------- |
| T-01: `resolveTargets` / `isMutationArtifact`                                         | 3      | 1     | 13        | 46      | done        |
| T-02: `applyMutant` / `toMutantPath` / `toMutationConfigPath` / `buildMutationConfig` | 4      | 1     | 19        | 40      | done        |
| T-03: `stripAnsi` / `parseSummary` / `classifyOutcome`                                | 5      | 1     | 16        | 30      | done        |
| T-04: `loadAllowlist`                                                                 | 6      | 1     | 9         | 49      | in progress |
| T-05: `matchAllowlist`                                                                | 7      | 1     | 10        | 39      | in progress |
| T-06: `formatReport`                                                                  | 8      | 1     | 9         | 32      | pending     |
| T-07: `decideExitCode`                                                                | 9      | 1     | 10        | 26      | pending     |
| T-08: `runDenoTest`                                                                   | 10     | 2     | 7         | 12      | pending     |
| T-09: `acquireLock` / `releaseLock`                                                   | 11     | 2     | 9         | 17      | pending     |
| T-10: `sweepArtifacts` / `hashSources` / `detectDrift` / `removeArtifacts`            | 12     | 2     | 10        | 22      | pending     |
| T-11: `runBaseline`                                                                   | 13     | 2     | 8         | 20      | pending     |
| T-12: `runMutants`                                                                    | 14     | 2     | 17        | 37      | pending     |
| T-13: `parseMutateArgs`                                                               | 15     | 3     | 8         | 31      | pending     |
| T-14: `main`（監査の順序制御と SIGINT）                                               | 16     | 3     | 19        | 66      | pending     |
| T-15: `runMutants` integration（実 `deno test` での差し替え検証）                     | 18     | 3     | 6         | 9       | pending     |
| T-16: `generateMutants` 追補（generation Edge 16〜24 の未検証分）                     | —      | 1     | 7         | 9       | pending     |
| **合計**                                                                              | —      | —     | **177**   | **486** | —           |

<!-- Status may be: pending | in progress | done -->

---

## T-01: `resolveTargets` / `isMutationArtifact`（対象解決と命名判定）

> Commit: 3 / 配置ファイル: `scripts/testing/mutation/resolve-targets.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/resolve-targets.unit.spec.ts` /
> Phase: 1 / Test ID prefix: `T-MUT-RT`（グループ番号 01〜19）
> 命名判定関数の名前は implementation.md に無いため、本文書では `isMutationArtifact(fileName): boolean` と呼ぶ。
> 実装で別名にした場合は Target 欄を読み替える。ソース集合の探索はリポジトリルートを起点にする。unit テストでは、一時ディレクトリに作った疑似モジュール配下を
> 探索させる（探索起点を差し替える引数の形は実装で決める）。

### [正常] Normal Cases

#### T-01-01: 6 つのモジュール名からソースのディレクトリを導く

- [x] **T-01-01-01**: `libs` は `skills/_cle-libs` 配下をソース集合にする
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-01`
  - Rule: generation R-101 / generation DD-01 / REQ-F-012
  - Scenario: Given モジュール名 `libs`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/_cle-libs/` 配下であり、1 件以上含まれること

- [x] **T-01-01-02**: `classify` は `skills/classify-chatlogs` 配下をソース集合にする
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-02`
  - Rule: generation R-101 / generation DD-01
  - Scenario: Given モジュール名 `classify`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/classify-chatlogs/` 配下であること

- [x] **T-01-01-03**: `export` は `skills/export-chatlogs` 配下をソース集合にする
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-03`
  - Rule: generation R-101 / generation DD-01
  - Scenario: Given モジュール名 `export`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/export-chatlogs/` 配下であること

- [x] **T-01-01-04**: `filter` は `skills/filter-chatlogs` 配下をソース集合にする
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-04`
  - Rule: generation R-101 / generation DD-01
  - Scenario: Given モジュール名 `filter`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/filter-chatlogs/` 配下であること

- [x] **T-01-01-05**: `normalize` は `skills/normalize-chatlogs` 配下をソース集合にする
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-05`
  - Rule: generation R-101 / generation DD-01
  - Scenario: Given モジュール名 `normalize`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/normalize-chatlogs/` 配下であること

- [x] **T-01-01-06**: `set` は `skills/set-frontmatter` 配下をソース集合にする（`SKILL_MODULES` の export を経由した別名解決）
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-01-06`
  - Rule: generation R-101 / generation DD-01
  - Scenario: Given モジュール名 `set`, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` のすべてのパスが `skills/set-frontmatter/` 配下であること

#### T-01-02: TypeScript / TSX ファイルを候補にする

- [x] **T-01-02-01**: `.ts` の実装ファイルはソース集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-02-01`
  - Rule: generation R-101
  - Scenario: Given 疑似モジュール配下に `scripts/foo.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` に `scripts/foo.ts` のパスが含まれること

- [x] **T-01-02-02**: `.tsx` の実装ファイルもソース集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-02-02`
  - Rule: generation R-101 / generation DD-05
  - Scenario: Given 疑似モジュール配下に `scripts/view.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` に `scripts/view.tsx` のパスが含まれること

#### T-01-03: 判定に使うテスト集合は当該モジュールの unit テストに限る

- [x] **T-01-03-01**: unit テストはテスト集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-01`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/foo.unit.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` に当該ファイル（またはそれに一致する glob）が含まれること

- [x] **T-01-03-02**: functional テストはテスト集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-02`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/functional/foo.functional.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が当該ファイルを含まないこと

- [x] **T-01-03-03**: integration テストはテスト集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-03`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/integration/foo.integration.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が当該ファイルを含まないこと

- [x] **T-01-03-04**: `.spec.tsx` の unit テストはテスト集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-04`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/view.unit.spec.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` に当該ファイルが含まれること

- [x] **T-01-03-05**: `unit/` 配下のサブディレクトリにある unit テストはテスト集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-05`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/sub/foo.unit.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` に当該ファイルが含まれること

- [x] **T-01-03-06**: `__tests__/<group>/unit/` 形式の unit テストはテスト集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-06`
  - Rule: generation R-104 / generation DD-02 / aplys-tester の `<base>/*/unit/**` 形式
  - Scenario: Given 疑似モジュール配下に `__tests__/foo/unit/bar.unit.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` に当該ファイルが含まれること (aplys-tester が unit として実行する範囲と一致する)

- [x] **T-01-03-07**: `libs` の unit テストはテスト集合に入る
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-03-07`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given `skills/_cle-libs/libs/__tests__/unit/foo.unit.spec.ts` がある, When `resolveTargets('libs')` を呼ぶ
  - Expected: Then `tests` に当該ファイルが含まれること

#### T-01-04: 集合を決定的な順序で返す

- [x] **T-01-04-01**: ソース集合は昇順に並ぶ
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-04-01`
  - Rule: generation R-105 / generation DD-07
  - Scenario: Given 疑似モジュール配下に `b.ts`・`a.ts`・`c/d.ts` を作成順 `c/d.ts` → `b.ts` → `a.ts` で置いた, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` がパスの昇順に並ぶこと

- [x] **T-01-04-02**: テスト集合は昇順に並ぶ
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-04-02`
  - Rule: generation R-105 / generation DD-07
  - Scenario: Given 疑似モジュール配下に unit テスト `z.unit.spec.ts`・`a.unit.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が昇順に並ぶこと

- [x] **T-01-04-03**: 同じモジュール名で 2 回呼ぶと同じ結果になる
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-04-03`
  - Rule: generation R-105 / generation DD-07
  - Scenario: Given ファイル構成を変えずに, When 同じモジュール名で `resolveTargets` を 2 回呼ぶ
  - Expected: Then 2 回の `{ sources, tests }` が完全に一致すること

#### T-01-05: 変異体と一時設定の命名を判定する

- [x] **T-01-05-01**: 3 桁番号の `.ts` 変異体名は一致する
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-05-01`
  - Rule: generation R-103 / execution DD-01
  - Scenario: Given ファイル名 `foo.mutation-001.ts`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `true` を返すこと

- [x] **T-01-05-02**: 3 桁番号の `.tsx` 変異体名は一致する
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-05-02`
  - Rule: generation R-103 / execution DD-01 / REQ-C-005
  - Scenario: Given ファイル名 `view.mutation-001.tsx`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `true` を返すこと

- [x] **T-01-05-03**: 4 桁番号の変異体名は一致する
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-05-03`
  - Rule: generation R-103 / execution DD-01
  - Scenario: Given ファイル名 `foo.mutation-1000.ts`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `true` を返すこと

- [x] **T-01-05-04**: 一時設定名は一致する
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-05-04`
  - Rule: generation R-103 / execution DD-01
  - Scenario: Given ファイル名 `deno.mutation-001.json`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `true` を返すこと

### [異常] Error Cases

> [N/A] 対象解決は失敗する経路を持たない。モジュール名は report-cli R-602 で検査済みのものしか渡されず、空の集合もエラーにしない（generation §3.2 Possible Outcomes）。
> 空集合の扱いは Edge Cases の T-01-10 / T-01-11 で固定する。

### [エッジケース] Edge Cases

#### T-01-06: テスト・型・定数のファイルを除外する

- [x] **T-01-06-01**: `__tests__/` 配下のヘルパーは除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-01`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下に `src/__tests__/helper.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-02**: `*.spec.ts` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-02`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下の `__tests__/` の外に `foo.spec.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-03**: `*.spec.tsx` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-03`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下の `__tests__/` の外に `foo.spec.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-04**: `*.types.ts` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-04`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下に `foo.types.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-05**: `*.types.tsx` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-05`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下に `foo.types.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-06**: `*.constants.ts` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-06`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下に `foo.constants.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-06-07**: `*.constants.tsx` は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-06-07`
  - Rule: generation R-102 / generation DD-03
  - Scenario: Given 疑似モジュール配下に `foo.constants.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

#### T-01-07: 前回の残骸をソース集合から除く

- [x] **T-01-07-01**: 残った `.ts` 変異体は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-07-01`
  - Rule: generation R-103 / generation DD-06 / DR-01
  - Scenario: Given 疑似モジュール配下に `foo.ts` と残骸 `foo.mutation-001.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が `foo.ts` を含み、`foo.mutation-001.ts` を含まないこと

- [x] **T-01-07-02**: 残った `.tsx` 変異体は除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-07-02`
  - Rule: generation R-103 / generation DD-06
  - Scenario: Given 疑似モジュール配下に残骸 `view.mutation-002.tsx` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-07-03**: 4 桁番号の残骸も除外する
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-07-03`
  - Rule: generation R-103 / generation DD-06 / execution DD-01
  - Scenario: Given 疑似モジュール配下に残骸 `foo.mutation-1000.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-07-04**: 残った一時設定はソース集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-07-04`
  - Rule: generation R-103 / generation DD-06
  - Scenario: Given 疑似モジュール配下に残骸 `deno.mutation-003.json` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

#### T-01-08: 命名に似ているが一致しない名前を判定しない

- [x] **T-01-08-01**: 番号の無い `foo.mutation.ts` は一致しない
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-08-01`
  - Rule: generation R-103 / execution DD-01 / AC-008
  - Scenario: Given ファイル名 `foo.mutation.ts`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `false` を返すこと

- [x] **T-01-08-02**: 2 桁番号の `foo.mutation-01.ts` は一致しない
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-08-02`
  - Rule: execution DD-01
  - Scenario: Given ファイル名 `foo.mutation-01.ts`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `false` を返すこと

- [x] **T-01-08-03**: 拡張子 `.js` の `foo.mutation-001.js` は一致しない
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-08-03`
  - Rule: execution DD-01
  - Scenario: Given ファイル名 `foo.mutation-001.js`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `false` を返すこと

- [x] **T-01-08-04**: 番号が数字でない `foo.mutation-abc.ts` は一致しない
  - Target: `isMutationArtifact`
  - Test ID: `T-MUT-RT-08-04`
  - Rule: execution DD-01
  - Scenario: Given ファイル名 `foo.mutation-abc.ts`, When `isMutationArtifact` を呼ぶ
  - Expected: Then `false` を返すこと

#### T-01-09: TypeScript 以外のファイルは候補にしない

- [x] **T-01-09-01**: `.js` ファイルは候補にしない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-09-01`
  - Rule: generation R-101
  - Scenario: Given 疑似モジュール配下に `legacy.js` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

- [x] **T-01-09-02**: `.md` ファイルは候補にしない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-09-02`
  - Rule: generation R-101
  - Scenario: Given 疑似モジュール配下に `SKILL.md` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `sources` が当該ファイルを含まないこと

#### T-01-10: ソース集合が空になる

- [x] **T-01-10-01**: 全ファイルが除外対象のモジュールは空のソース集合を返し、エラーにしない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-10-01`
  - Rule: generation R-101〜R-105 / generation §3.2 / REQ-F-018
  - Scenario: Given 疑似モジュール配下に `foo.types.ts` と `__tests__/unit/foo.unit.spec.ts` だけがある, When `resolveTargets` を呼ぶ
  - Expected: Then 例外を投げず、`sources` が空配列であること

#### T-01-11: テスト集合が空になる

- [x] **T-01-11-01**: unit テストが無いモジュールは空のテスト集合を返し、エラーにしない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-11-01`
  - Rule: generation R-104 / generation §3.2 / REQ-F-016
  - Scenario: Given 疑似モジュール配下に `foo.ts` だけがあり `__tests__/unit/` が無い, When `resolveTargets` を呼ぶ
  - Expected: Then 例外を投げず、`tests` が空配列であること

#### T-01-12: `unit/` 配下でも spec ファイル以外はテスト集合に入れない

- [x] **T-01-12-01**: `unit/` 配下のヘルパー `.ts` はテスト集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-12-01`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/helpers.ts` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が当該ファイルを含まないこと

- [x] **T-01-12-02**: `unit/` 配下の `.json` フィクスチャはテスト集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-12-02`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/fixture.json` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が当該ファイルを含まないこと

- [x] **T-01-12-03**: `unit/` 配下の `.spec.sh` はテスト集合に入らない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-12-03`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given 疑似モジュール配下に `__tests__/unit/foo.unit.spec.sh` がある, When `resolveTargets` を呼ぶ
  - Expected: Then `tests` が当該ファイルを含まないこと (`deno test` の対象は `*.spec.ts` / `*.spec.tsx` に限る)

#### T-01-13: 他モジュールの unit テストはテスト集合に入れない

- [x] **T-01-13-01**: スキルモジュールは他スキルの unit テストを含めない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-13-01`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given `skills/classify-chatlogs/` と `skills/filter-chatlogs/` の双方に `__tests__/unit/*.unit.spec.ts` がある, When `resolveTargets('classify')` を呼ぶ
  - Expected: Then `tests` が `skills/classify-chatlogs/` 配下の spec だけと一致すること

- [x] **T-01-13-02**: `libs` はスキルモジュールの unit テストを含めない
  - Target: `resolveTargets`
  - Test ID: `T-MUT-RT-13-02`
  - Rule: generation R-104 / generation DD-02
  - Scenario: Given `skills/_cle-libs/` と `skills/classify-chatlogs/` の双方に `__tests__/unit/*.unit.spec.ts` がある, When `resolveTargets('libs')` を呼ぶ
  - Expected: Then `tests` が `skills/_cle-libs/` 配下の spec だけと一致すること

---

## T-02: `applyMutant` / `toMutantPath` / `toMutationConfigPath` / `buildMutationConfig`（変異体と一時設定のステージング）

> Commit: 4 / 配置ファイル: `scripts/testing/mutation/stage-mutant.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/stage-mutant.unit.spec.ts` /
> Phase: 1 / Test ID prefix: `T-MUT-SM`（グループ番号 01〜19）
> ファイルへの書き出し（execution R-215 の「元ファイルの隣に書き出す」部分）と `deno.jsonc` の読み込みは Commit 14 の `runMutants` が行う。
> 本 Test Target は純粋な部品（文字列とパスと設定オブジェクトの変換）だけを検証する。位置不一致の「error 結果」の具体的な形
> （判別共用体など）は実装で決め、本文書では「error 結果」と呼ぶ。

### [正常] Normal Cases

#### T-02-01: 指定位置の字句を置き換える

- [x] **T-02-01-01**: 比較演算子を置換した文字列を返し、他の行は変えない
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-01-01`
  - Rule: execution R-215 / REQ-F-003
  - Scenario: Given 3 行のソースの 2 行目 `return n > 0;` と、2 行目・`>` の桁・`before: '>'`・`after: '>='` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 2 行目だけが `return n >= 0;` になり、1 行目と 3 行目は元と同一の文字列を返すこと

- [x] **T-02-01-02**: `after` が空文字の変異体（否定の除去）は字句を取り除く
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-01-02`
  - Rule: execution R-215 / REQ-F-001
  - Scenario: Given 行 `if (!ok) {` と、`!` の桁・`before: '!'`・`after: ''` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 当該行が `if (ok) {` になった文字列を返すこと

#### T-02-02: 変異体ファイルのパスを命名規則で作る

- [x] **T-02-02-01**: 番号 1 は 3 桁にゼロ埋めし、元ファイルと同じディレクトリに置く
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-02-01`
  - Rule: execution R-215 / execution DD-01 / AC-003
  - Scenario: Given 元ファイル `skills/x/scripts/target.ts` と番号 1, When `toMutantPath` を呼ぶ
  - Expected: Then `skills/x/scripts/target.mutation-001.ts` を返すこと

- [x] **T-02-02-02**: 2 桁の番号も 3 桁にゼロ埋めする
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-02-02`
  - Rule: execution DD-01
  - Scenario: Given 元ファイル `a/foo.ts` と番号 42, When `toMutantPath` を呼ぶ
  - Expected: Then `a/foo.mutation-042.ts` を返すこと

#### T-02-03: 一時設定のパスを命名規則で作る

- [x] **T-02-03-01**: 元の設定と同じディレクトリの `deno.mutation-<NNN>.json` を返す
  - Target: `toMutationConfigPath`
  - Test ID: `T-MUT-SM-03-01`
  - Rule: execution R-216 / execution DD-01
  - Scenario: Given 番号 1, When `toMutationConfigPath` を呼ぶ
  - Expected: Then 元の設定（`deno.jsonc`）と同じディレクトリの `deno.mutation-001.json` を返すこと

#### T-02-04: 一時設定に import の差し替えを 1 件足す

- [x] **T-02-04-01**: `imports` に元ファイルの file URL から変異体の file URL への対応を足す
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-04-01`
  - Rule: execution R-216 / execution DD-02 / DR-01 / REQ-NF-004
  - Scenario: Given `imports` を持つ元の設定と、`originalUrl = file:///repo/a/foo.ts`・`mutantUrl = file:///repo/a/foo.mutation-001.ts`, When `buildMutationConfig` を呼ぶ
  - Expected: Then 戻り値の `imports['file:///repo/a/foo.ts']` が `file:///repo/a/foo.mutation-001.ts` であること

- [x] **T-02-04-02**: 既存の `imports`（`@std/*`）を保つ
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-04-02`
  - Rule: execution R-216 / execution DD-02 / REQ-C-002
  - Scenario: Given `imports` に `@std/assert` と `@std/yaml` を持つ元の設定, When `buildMutationConfig` を呼ぶ
  - Expected: Then 戻り値の `imports` が両キーを元と同じ値で保ち、追加されたキーが差し替えの 1 件だけであること

- [x] **T-02-04-03**: `imports` 以外のトップレベルキーを保つ
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-04-03`
  - Rule: execution R-216 / execution DD-02
  - Scenario: Given `tasks`・`compilerOptions`・`fmt` を持つ元の設定, When `buildMutationConfig` を呼ぶ
  - Expected: Then 戻り値が 3 キーを元と同じ値で持つこと

- [x] **T-02-04-04**: 元の設定オブジェクトを変更しない
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-04-04`
  - Rule: execution R-216 / REQ-NF-001
  - Scenario: Given 元の設定オブジェクトの深いコピーを保存しておく, When `buildMutationConfig` を呼ぶ
  - Expected: Then 呼び出し後の元の設定オブジェクトが保存したコピーと等しいこと

#### T-02-05: 生成した名前が命名判定と往復一致する

- [x] **T-02-05-01**: `toMutantPath` の結果は `isMutationArtifact` に一致する
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-05-01`
  - Rule: execution DD-01 / generation R-103 / execution R-205
  - Scenario: Given 元ファイル `a/foo.ts` と番号 7, When `toMutantPath` の結果のファイル名を `isMutationArtifact` に渡す
  - Expected: Then `true` を返すこと

- [x] **T-02-05-02**: `toMutationConfigPath` の結果は `isMutationArtifact` に一致する
  - Target: `toMutationConfigPath`
  - Test ID: `T-MUT-SM-05-02`
  - Rule: execution DD-01 / generation R-103 / execution R-205
  - Scenario: Given 番号 7, When `toMutationConfigPath` の結果のファイル名を `isMutationArtifact` に渡す
  - Expected: Then `true` を返すこと

#### T-02-16: 複数文字の字句を置き換える

- [x] **T-02-16-01**: 2 文字の字句 `>=` を 1 文字の `>` に置き換える
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-16-01`
  - Rule: execution R-215
  - Scenario: Given 行 `a >= b` と、3 桁目・`before: '>='`・`after: '>'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `a > b` を返し、`before` の長さ分だけを置き換えること

- [x] **T-02-16-02**: 3 文字の字句 `===` を `!==` に置き換える
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-16-02`
  - Rule: execution R-215
  - Scenario: Given 行 `x === y` と、3 桁目・`before: '==='`・`after: '!=='` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `x !== y` を返し、字句の後ろの文字が保たれること

#### T-02-17: 変異体・一時設定・ロックを `.gitignore` で除外する

- [x] **T-02-17-01**: `scripts/` 配下の `.ts` の変異体は、許可リストより後ろの除外行で無視される
  - Target: `.gitignore`
  - Test ID: `T-MUT-SM-17-01`
  - Rule: REQ-C-005 / impl Commit 4
  - Scenario: Given パス `scripts/testing/mutation/target.mutation-001.ts`, When `git check-ignore -q` に渡す
  - Expected: Then 終了コードが 0（無視される）であること（`!/scripts/**/*.ts` で再許可されたままにならない）

- [x] **T-02-17-02**: `skills/` 配下の `.tsx` の変異体は無視される
  - Target: `.gitignore`
  - Test ID: `T-MUT-SM-17-02`
  - Rule: REQ-C-005 / impl Commit 4 / Edge execution-3
  - Scenario: Given パス `skills/x/scripts/view.mutation-001.tsx`, When `git check-ignore -q` に渡す
  - Expected: Then 終了コードが 0（無視される）であること（`!skills/**` で再許可されたままにならない）

- [x] **T-02-17-03**: 一時設定 `deno.mutation-<NNN>.json` は無視される
  - Target: `.gitignore`
  - Test ID: `T-MUT-SM-17-03`
  - Rule: REQ-C-005 / impl Commit 4
  - Scenario: Given パス `deno.mutation-001.json`, When `git check-ignore -q` に渡す
  - Expected: Then 終了コードが 0（無視される）であること

- [x] **T-02-17-04**: ロックファイル `temp/mutation.lock` は無視される
  - Target: `.gitignore`
  - Test ID: `T-MUT-SM-17-04`
  - Rule: REQ-C-005 / impl Commit 4
  - Scenario: Given パス `temp/mutation.lock`, When `git check-ignore -q` に渡す
  - Expected: Then 終了コードが 0（無視される）であること

### [異常] Error Cases

#### T-02-06: 置換前の字句が指定位置に無い

- [x] **T-02-06-01**: 指定桁の字句が `before` と異なる場合は、例外を投げず error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-06-01`
  - Rule: execution R-214 / execution DD-09 / REQ-F-004
  - Scenario: Given 行 `return n < 0;` と、同じ桁を指す `before: '>'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 例外を投げず、位置不一致を表す error 結果を返すこと

- [x] **T-02-06-02**: 行番号がソースの行数を超える場合は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-06-02`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 3 行のソースと、`line: 4` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 例外を投げず、位置不一致を表す error 結果を返すこと

- [x] **T-02-06-03**: 桁が行の長さを超える場合は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-06-03`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 長さ 10 の行と、`column: 20` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 例外を投げず、位置不一致を表す error 結果を返すこと

#### T-02-13: 行・桁が 1 以上の整数でない

- [x] **T-02-13-01**: 桁 0 は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-13-01`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given ソース `a > b\n` と、`line: 1`・`column: 0`・`before: 'a'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 先頭桁として扱わず、error 結果を返すこと

- [x] **T-02-13-02**: 負の桁は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-13-02`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 同じソースと、`column: -1` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then error 結果を返すこと

- [x] **T-02-13-03**: 整数でない桁は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-13-03`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 同じソースと、`column: 1.5` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then error 結果を返すこと

- [x] **T-02-13-04**: 行 0 は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-13-04`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 同じソースと、`line: 0` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then error 結果を返すこと

### [エッジケース] Edge Cases

#### T-02-07: 改行コードを保つ

- [x] **T-02-07-01**: `\r\n` 改行のソースは変異後も `\r\n` を保つ
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-07-01`
  - Rule: execution R-215 / REQ-NF-004 / Edge execution-2
  - Scenario: Given 全行が `\r\n` で終わる 3 行のソースと、2 行目の変異体, When `applyMutant` を呼ぶ
  - Expected: Then 戻り値の改行がすべて `\r\n` であり、変異した字句以外のバイト列が元と同一であること

- [x] **T-02-07-03**: `\n` 改行のソースに `\r` を混ぜない
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-07-03`
  - Rule: execution R-215 / REQ-NF-004
  - Scenario: Given 全行が `\n` で終わるソースと変異体, When `applyMutant` を呼ぶ
  - Expected: Then 戻り値が `\r` を含まないこと

#### T-02-08: `.tsx` の拡張子を保つ

- [x] **T-02-08-01**: `.tsx` の元ファイルからは `.tsx` の変異体パスを作る
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-08-01`
  - Rule: execution DD-01 / REQ-C-005 / Edge execution-3
  - Scenario: Given 元ファイル `a/view.tsx` と番号 1, When `toMutantPath` を呼ぶ
  - Expected: Then `a/view.mutation-001.tsx` を返すこと

#### T-02-09: 番号の桁あふれ

- [x] **T-02-09-01**: 番号 999 は `-999` になる（3 桁の上限）
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-09-01`
  - Rule: execution DD-01 / Edge execution-4
  - Scenario: Given 元ファイル `a/foo.ts` と番号 999, When `toMutantPath` を呼ぶ
  - Expected: Then `a/foo.mutation-999.ts` を返すこと

- [x] **T-02-09-02**: 番号 1000 は桁をそのまま使う
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-09-02`
  - Rule: execution DD-01 / Edge execution-4
  - Scenario: Given 元ファイル `a/foo.ts` と番号 1000, When `toMutantPath` を呼ぶ
  - Expected: Then `a/foo.mutation-1000.ts` を返すこと

- [x] **T-02-09-03**: 一時設定も番号 1000 で桁をそのまま使う
  - Target: `toMutationConfigPath`
  - Test ID: `T-MUT-SM-09-03`
  - Rule: execution DD-01 / Edge execution-4
  - Scenario: Given 番号 1000, When `toMutationConfigPath` を呼ぶ
  - Expected: Then ファイル名が `deno.mutation-1000.json` であること

#### T-02-10: 同一行に同じ字句が複数ある

- [x] **T-02-10-01**: 桁で指定した 2 番目の出現だけを置き換える
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-10-01`
  - Rule: execution R-215 / Edge generation-14
  - Scenario: Given 行 `a > b && c > d` と、2 番目の `>` の桁を指す変異体, When `applyMutant` を呼ぶ
  - Expected: Then 当該行が `a > b && c >= d` になり、1 番目の `>` は変わらないこと

#### T-02-11: 元の設定に `imports` が無い

- [x] **T-02-11-01**: `imports` を持たない元の設定には、差し替え 1 件だけの `imports` を作る
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-11-01`
  - Rule: execution R-216 / execution DD-02
  - Scenario: Given `tasks` だけを持ち `imports` を持たない元の設定, When `buildMutationConfig` を呼ぶ
  - Expected: Then 戻り値の `imports` が差し替えの 1 件だけを持ち、`tasks` を保つこと

#### T-02-12: 元の設定に同じキーが既にある

- [x] **T-02-12-01**: 元の設定の `imports` に元ファイルの file URL が既にあっても、変異体の URL で上書きする
  - Target: `buildMutationConfig`
  - Test ID: `T-MUT-SM-12-01`
  - Rule: execution R-216 / execution DD-02
  - Scenario: Given `imports['file:///repo/a/foo.ts']` に別の値を持つ元の設定, When 同じ `originalUrl` で `buildMutationConfig` を呼ぶ
  - Expected: Then 戻り値の当該キーが `mutantUrl` であり、`imports` のキー数が元と同じであること

#### T-02-14: 置換前の字句が空文字

- [x] **T-02-14-01**: `before` が空文字でも、行末 + 1 より後ろの桁は error 結果を返す
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-14-01`
  - Rule: execution R-214 / execution DD-09
  - Scenario: Given 行 `ab` と、`column: 4`・`before: ''`・`after: 'c'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then error 結果を返すこと

- [x] **T-02-14-02**: `before` が空文字で桁が行末 + 1 なら、行末に挿入する
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-14-02`
  - Rule: execution R-215
  - Scenario: Given 行 `ab` と、`column: 3`・`before: ''`・`after: 'c'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `abc` を返すこと

#### T-02-15: 拡張子の無いパス

- [x] **T-02-15-01**: 拡張子の無いパスはファイル名を保って番号を付ける
  - Target: `toMutantPath`
  - Test ID: `T-MUT-SM-15-01`
  - Rule: execution R-215 / execution DD-01
  - Scenario: Given パス `a/Makefile` と番号 1, When `toMutantPath` を呼ぶ
  - Expected: Then `a/Makefile.mutation-001` を返すこと

#### T-02-18: 字句の前にサロゲートペアがある行

- [x] **T-02-18-01**: 桁を 1 始まりの UTF-16 コード単位で数え、サロゲートペアの後ろの字句を置き換える
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-18-01`
  - Rule: execution R-215 / Edge generation-24
  - Scenario: Given 行 `const s = '😀' > x;` と、`column: 16`（`😀` を 2 桁と数えた `>` の桁）・`before: '>'`・`after: '>='` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `const s = '😀' >= x;` を返すこと（error 結果にならず、`😀` が壊れない）

#### T-02-19: 数値リテラル全体を置き換える

- [x] **T-02-19-01**: `after` が `before` より長い変異体（`.5` → `1.5`）は、字句の後ろを長さの差だけずらして保つ
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-19-01`
  - Rule: execution R-215 / Edge generation-16
  - Scenario: Given 行 `x = .5;` と、`column: 5`・`before: '.5'`・`after: '1.5'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `x = 1.5;` を返すこと

- [x] **T-02-19-02**: 接頭辞付きのリテラル全体（`0x1F` → `0x20`）を 1 字句として置き換える
  - Target: `applyMutant`
  - Test ID: `T-MUT-SM-19-02`
  - Rule: execution R-215 / Edge generation-16
  - Scenario: Given 行 `x = 0x1F;` と、`column: 5`・`before: '0x1F'`・`after: '0x20'` の変異体, When `applyMutant` を呼ぶ
  - Expected: Then `x = 0x20;` を返すこと

---

## T-03: `stripAnsi` / `parseSummary` / `classifyOutcome`（実行結果の 5 判定）

> Commit: 5 / 配置ファイル: `scripts/testing/mutation/classify-outcome.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/classify-outcome.unit.spec.ts` /
> Phase: 1 / Test ID prefix: `T-MUT-CO`（グループ番号 01〜19）
> `classifyOutcome` は `TestRunOutcome`（`exited { code, stdout, stderr }` / `timeout` / `error { message }`）
> だけから判定する純関数である（execution §4.2 末尾）。
> 判定には ANSI を除いた `stdout` と `stderr` の連結を使う（DD-03）。`parseSummary` は
> ANSI を除いた後のテキストを受け取る前提とし、連結と除去は `classifyOutcome` が行う。

### [正常] Normal Cases

#### T-03-01: ANSI エスケープを除く

- [x] **T-03-01-01**: 色付けのエスケープを除いた文字列を返す
  - Target: `stripAnsi`
  - Test ID: `T-MUT-CO-01-01`
  - Rule: execution DD-03 / Edge execution-6
  - Scenario: Given `"\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed."`, When `stripAnsi` を呼ぶ
  - Expected: Then `"error: Type checking failed."` を返すこと

#### T-03-02: 要約行から件数を取り出す

- [x] **T-03-02-01**: 成功の要約行から passed / failed を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-02-01`
  - Rule: execution R-222 / execution DD-06 / execution DD-12
  - Scenario: Given 出力の末尾が `ok | 5 passed | 0 failed (12ms)`, When `parseSummary` を呼ぶ
  - Expected: Then `passed: 5`・`failed: 0` を返すこと

- [x] **T-03-02-02**: 失敗の要約行から passed / failed を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-02-02`
  - Rule: execution R-222 / execution DD-12
  - Scenario: Given 出力の末尾が `FAILED | 3 passed | 2 failed (40ms)`, When `parseSummary` を呼ぶ
  - Expected: Then `passed: 3`・`failed: 2` を返すこと

- [x] **T-03-02-03**: step 件数の注記付きの要約行からテスト件数を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-02-03`
  - Rule: execution R-222 / execution DD-06
  - Scenario: Given 出力の末尾が `FAILED | 2 passed (9 steps) | 1 failed (3 steps) (51ms)`, When `parseSummary` を呼ぶ
  - Expected: Then step の件数ではなく `passed: 2`・`failed: 1` を返すこと

#### T-03-03: 5 種の判定

- [x] **T-03-03-01**: 終了コード 0 は survived
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-03-01`
  - Rule: execution R-220 / REQ-F-004
  - Scenario: Given `exited { code: 0, stdout: 'ok | 4 passed | 0 failed', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'survived'` を返すこと

- [x] **T-03-03-02**: 非 0 で行頭に型検査失敗の表示がある場合は compile-error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-03-02`
  - Rule: execution R-221 / execution DD-03 / DR-02 / AC-005
  - Scenario: Given `exited { code: 1, stdout: '', stderr: 'error: Type checking failed.\n' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと（`'killed'` ではない）

- [x] **T-03-03-03**: 非 0 で要約行に失敗が 1 件以上ある場合は killed
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-03-03`
  - Rule: execution R-222 / execution DD-12 / AC-004
  - Scenario: Given `exited { code: 1, stdout: 'FAILED | 3 passed | 1 failed (20ms)', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'killed'` を返すこと

- [x] **T-03-03-04**: timeout は timeout
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-03-04`
  - Rule: execution R-223 / REQ-NF-003 / Edge execution-9
  - Scenario: Given `timeout` の結果, When `classifyOutcome` を呼ぶ
  - Expected: Then `'timeout'` を返すこと

- [x] **T-03-03-05**: 起動の失敗は error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-03-05`
  - Rule: execution R-224 / execution R-219
  - Scenario: Given `error { message: 'spawn failed' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと

### [異常] Error Cases

#### T-03-04: 要約行が無い出力

- [x] **T-03-04-01**: 要約行が無ければ未検出を返す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-04-01`
  - Rule: execution DD-06 / execution DD-12
  - Scenario: Given 要約行を含まない出力 `error: Module not found "file:///x.ts".`, When `parseSummary` を呼ぶ
  - Expected: Then 件数を返さず、未検出を表す値を返すこと

#### T-03-05: テストの失敗を確認できない非 0 終了は error

- [x] **T-03-05-01**: 非 0 で出力が空なら error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-05-01`
  - Rule: execution R-224 / execution DD-12 / Edge execution-8
  - Scenario: Given `exited { code: 1, stdout: '', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと

- [x] **T-03-05-02**: 依存解決の失敗で要約行が無い非 0 終了は error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-05-02`
  - Rule: execution R-224 / execution DD-12 / Edge execution-27
  - Scenario: Given `exited { code: 1, stdout: '', stderr: 'error: Module not found "file:///x.ts".' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと（`'killed'` ではない）

- [x] **T-03-05-03**: 要約行の失敗件数が 0 の非 0 終了は error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-05-03`
  - Rule: execution R-222 / execution R-224 / execution DD-12
  - Scenario: Given `exited { code: 1, stdout: 'ok | 3 passed | 0 failed (8ms)', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと

### [エッジケース] Edge Cases

#### T-03-06: ANSI を含まない文字列

- [x] **T-03-06-01**: エスケープを含まない文字列はそのまま返す
  - Target: `stripAnsi`
  - Test ID: `T-MUT-CO-06-01`
  - Rule: execution DD-03
  - Scenario: Given `"ok | 1 passed | 0 failed"`, When `stripAnsi` を呼ぶ
  - Expected: Then 入力と同一の文字列を返すこと

#### T-03-07: ANSI 付きの型検査失敗

- [x] **T-03-07-01**: ANSI で色付けされた型検査失敗の表示も compile-error と判定する
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-07-01`
  - Rule: execution R-221 / execution DD-03 / Edge execution-6 / Edge execution-5
  - Scenario: Given `exited { code: 1, stdout: '', stderr: '\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed.\n' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと

#### T-03-08: 行頭以外に現れる `Type checking failed`

- [x] **T-03-08-01**: 行頭以外の表示は compile-error にせず、要約行に失敗があれば killed
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-08-01`
  - Rule: execution R-221 / execution R-222 / Edge execution-7
  - Scenario: Given `exited { code: 1, stdout: '  AssertionError: expected "error: Type checking failed"\nFAILED | 0 passed | 1 failed', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'killed'` を返すこと

- [x] **T-03-08-02**: 行頭以外の表示だけで要約行が無ければ error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-08-02`
  - Rule: execution R-221 / execution R-224 / Edge execution-7
  - Scenario: Given `exited { code: 1, stdout: 'note: Type checking failed somewhere', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと

#### T-03-09: stdout と stderr の連結

- [x] **T-03-09-01**: 型検査失敗の表示が stdout 側にあっても compile-error と判定する
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-09-01`
  - Rule: execution DD-03
  - Scenario: Given `exited { code: 1, stdout: 'error: Type checking failed.', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと

- [x] **T-03-09-02**: 要約行が stderr 側にあっても killed と判定する
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-09-02`
  - Rule: execution DD-03 / execution R-222
  - Scenario: Given `exited { code: 1, stdout: '', stderr: 'FAILED | 2 passed | 1 failed (9ms)' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'killed'` を返すこと

#### T-03-10: 判定の優先順位

- [x] **T-03-10-01**: 型検査失敗と失敗の要約行が両方ある場合は compile-error を優先する
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-10-01`
  - Rule: execution R-221 / execution R-222（評価順）/ DR-02
  - Scenario: Given `exited { code: 1, stdout: 'FAILED | 0 passed | 1 failed', stderr: 'error: Type checking failed.' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと

- [x] **T-03-10-02**: 終了コード 0 なら出力の内容にかかわらず survived
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-10-02`
  - Rule: execution R-220（評価順の先頭）
  - Scenario: Given `exited { code: 0, stdout: 'FAILED | 0 passed | 1 failed', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'survived'` を返すこと

#### T-03-11: 末尾に改行の無い stdout と stderr の連結

- [x] **T-03-11-01**: stdout が改行で終わらなくても、stderr 先頭の型検査失敗の表示は行頭として扱う
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-11-01`
  - Rule: execution DD-03 / execution R-221
  - Scenario: Given `exited { code: 1, stdout: 'Check file:///x.ts', stderr: 'error: Type checking failed.' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと（連結で stdout の末尾と stderr の先頭が同じ行にならない）

#### T-03-12: 複数行の出力の途中にある型検査失敗

- [x] **T-03-12-01**: 2 行目以降の行頭にある型検査失敗の表示も compile-error と判定する
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-12-01`
  - Rule: execution R-221 / execution DD-03
  - Scenario: Given `exited { code: 1, stdout: '', stderr: 'Check file:///x.ts\nerror: Type checking failed.\n' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'compile-error'` を返すこと

#### T-03-13: 終了コード 0 で型検査失敗の表示がある

- [x] **T-03-13-01**: 終了コード 0 なら、行頭の型検査失敗の表示があっても survived
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-13-01`
  - Rule: execution R-221（非 0 終了かつ）/ execution R-220
  - Scenario: Given `exited { code: 0, stdout: '', stderr: 'error: Type checking failed.\n' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'survived'` を返すこと（`'compile-error'` ではない）

#### T-03-14: 付加セグメントを持つ要約行

- [x] **T-03-14-01**: `| N ignored` を持つ要約行から passed / failed を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-14-01`
  - Rule: execution R-222 / execution DD-06
  - Scenario: Given 出力の末尾が `FAILED | 3 passed | 1 failed | 2 ignored (20ms)`, When `parseSummary` を呼ぶ
  - Expected: Then `passed: 3`・`failed: 1` を返すこと（ignored の件数を混ぜない）

- [x] **T-03-14-02**: `| N filtered out` を持つ要約行から passed / failed を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-14-02`
  - Rule: execution R-222 / execution DD-06
  - Scenario: Given 出力の末尾が `ok | 2 passed | 0 failed | 3 filtered out (7ms)`, When `parseSummary` を呼ぶ
  - Expected: Then `passed: 2`・`failed: 0` を返すこと（filtered out の件数を混ぜない）

#### T-03-15: 要約行と同じ形の行が複数ある出力

- [x] **T-03-15-01**: 要約行が複数あれば最後の要約行から件数を取り出す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-15-01`
  - Rule: execution R-222 / execution DD-12 / Edge execution-31
  - Scenario: Given `"ok | 99 passed | 0 failed\nFAILED | 0 passed | 1 failed"`, When `parseSummary` を呼ぶ
  - Expected: Then 最後の要約行の `passed: 0`・`failed: 1` を返すこと

- [x] **T-03-15-02**: 先頭の要約行に失敗があっても最後の要約行の件数を返す
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-15-02`
  - Rule: execution R-222 / execution DD-12 / Edge execution-31
  - Scenario: Given `"FAILED | 0 passed | 1 failed\nok | 99 passed | 0 failed"`, When `parseSummary` を呼ぶ
  - Expected: Then 最後の要約行の `passed: 99`・`failed: 0` を返すこと

- [x] **T-03-15-03**: 先頭の要約行風の出力だけに失敗がある非 0 終了は error
  - Target: `classifyOutcome`
  - Test ID: `T-MUT-CO-15-03`
  - Rule: execution R-222 / execution R-224 / execution DD-12 / Edge execution-31
  - Scenario: Given `exited { code: 1, stdout: 'FAILED | 0 passed | 1 failed\nok | 99 passed | 0 failed', stderr: '' }`, When `classifyOutcome` を呼ぶ
  - Expected: Then `'error'` を返すこと（`'killed'` ではない）

#### T-03-16: `failed` に語が続く行

- [x] **T-03-16-01**: `failed` の直後に語が続く行は要約行とみなさない
  - Target: `parseSummary`
  - Test ID: `T-MUT-CO-16-01`
  - Rule: execution R-222 / execution DD-06
  - Scenario: Given `"FAILED | 0 passed | 1 failedness"`, When `parseSummary` を呼ぶ
  - Expected: Then 件数を返さず、未検出を表す値を返すこと

---

## T-04: `loadAllowlist`（許容リストの読み込みと検証）

> Commit: 6 / 配置ファイル: `scripts/testing/mutation/allowlist.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/allowlist.unit.spec.ts` / Phase: 1 / Test ID prefix: `T-MUT-AL`（グループ番号 01〜09）
>
> 読み込み元は `scripts/testing/mutation/allowlist/<module>.yaml`。unit テストでは一時ディレクトリに YAML を置いて読ませる（実リポジトリの許容リストに依存しない）。
> 検証の既定値は implementation.md §3.4 の #1〜#5 に従う。読み込みエラーは `ChatlogError` で、検証内容は `error.message` に対して確認する（`detail` プロパティは存在しない）。

### [正常] Normal Cases

#### T-04-01: 許容リストのファイルが存在しない

- [x] **T-04-01-01**: ファイルが無ければエントリ 0 件として返し、エラーにしない
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-01-01`
  - Rule: allowlist R-501 / allowlist DD-04 / REQ-F-009 / Edge allowlist-1
  - Scenario: Given 対象モジュールの許容リストファイルが存在しない, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、エントリ 0 件の配列を返すこと

#### T-04-02: 正しい許容リストの読み込み

- [x] **T-04-02-01**: 7 属性すべてが正しいエントリ 1 件を読み込む
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-02-01`
  - Rule: allowlist R-503 / allowlist R-504 / REQ-F-009 / REQ-F-015
  - Scenario: Given `file` / `lineText` / `op` / `before` / `after` / `occurrence` / `reason` がすべて正しいエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 各属性の値を保った `AllowlistEntry` 1 件を返すこと

- [x] **T-04-02-02**: `after` が空文字列のエントリを受理する
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-02-02`
  - Rule: allowlist R-504 / implementation §3.4 #2 / allowlist §3.1（`after` は空文字列を許す）
  - Scenario: Given `op: negation`、`before: "!"`、`after: ""` の正しいエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 読み込みエラーにならず、`after` が空文字列のエントリを返すこと

- [ ] **T-04-02-03**: 他モジュールの許容リストがあっても、指定モジュールのファイルだけを読む
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-02-03`
  - Rule: allowlist §3.1（置き場所はモジュールごとに 1 ファイル。他モジュールのエントリは参照しない） / implementation Commit 6（`allowlist/<module>.yaml` を読む）
  - Scenario: Given `libs.yaml` に正しいエントリ 1 件、`classify.yaml` に別の正しいエントリ 1 件がある, When `loadAllowlist('libs')` を呼ぶ
  - Expected: Then `libs.yaml` のエントリ 1 件だけを返し、`classify.yaml` のエントリを含まないこと

### [異常] Error Cases

#### T-04-03: 許容リストとして解釈できない内容

- [x] **T-04-03-01**: YAML として解釈できない内容は読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-01`
  - Rule: allowlist R-502 / REQ-F-015
  - Scenario: Given 閉じていないフロー列 `- [file: a` を含む YAML 構文エラーのファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に解釈できなかった旨とファイルのパスを含むこと

- [x] **T-04-03-02**: 最上位がエントリの列でない YAML は読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-02`
  - Rule: allowlist R-502 / allowlist §3.1（形式: エントリの列）
  - Scenario: Given 最上位がマッピング `file: a.ts` の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、個々のエントリの検証メッセージ（R-503 / R-504）を含まないこと

- [x] **T-04-03-03**: 明示的な null 文書 `~` は読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-03`
  - Rule: allowlist R-502 / implementation §3.4 #5（免除は内容なし・コメントのみ）
  - Scenario: Given 内容が `~` だけの許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に最上位がエントリの列ではない旨を含むこと（エントリ 0 件として受理しないこと）

- [x] **T-04-03-04**: 明示的な null 文書 `null` は読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-04`
  - Rule: allowlist R-502 / implementation §3.4 #5（免除は内容なし・コメントのみ）
  - Scenario: Given 内容が `null` だけの許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に最上位がエントリの列ではない旨を含むこと（エントリ 0 件として受理しないこと）

- [x] **T-04-03-05**: 明示的な null 文書 `---` は読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-05`
  - Rule: allowlist R-502 / implementation §3.4 #5（免除は内容なし・コメントのみ）
  - Scenario: Given 内容が `---` だけの許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に最上位がエントリの列ではない旨を含むこと（エントリ 0 件として受理しないこと）

- [x] **T-04-03-06**: 存在しない以外の理由で読めない許容リストは、エントリ 0 件にせず読み込みエラーにする
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-03-06`
  - Rule: allowlist R-501（免除は存在しない場合のみ） / allowlist DD-04
  - Scenario: Given `<module>.yaml` という名前のディレクトリがある, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げ、エントリ 0 件の配列を返さないこと

#### T-04-04: 理由の検証

- [x] **T-04-04-01**: 理由が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-01`
  - Rule: allowlist R-503 / REQ-F-015 / AC-011 / Edge allowlist-3
  - Scenario: Given `reason` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に当該エントリの位置と `reason` の欠落を含むこと

- [x] **T-04-04-02**: 理由が空文字列のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-02`
  - Rule: allowlist R-503 / REQ-F-015 / Edge allowlist-4
  - Scenario: Given `reason: ""` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に当該エントリの位置と `reason` が空である旨を含むこと

- [x] **T-04-04-03**: 理由が空白文字だけのエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-03`
  - Rule: allowlist R-503 / implementation §3.4 #1（allowlist OQ #1 の既定値）
  - Scenario: Given `reason: "   "`（空白 3 文字）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に当該エントリの位置と `reason` が空である旨を含むこと

- [x] **T-04-04-04**: 理由が YAML の null のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-04`
  - Rule: allowlist R-503
  - Scenario: Given `reason:`（値なし = null）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に当該エントリの位置と `reason` の欠落を含むこと

- [x] **T-04-04-05**: 理由が数値のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-05`
  - Rule: allowlist R-503
  - Scenario: Given `reason: 42` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `reason` が文字列でない旨を含むこと

- [x] **T-04-04-06**: 理由がマッピングのエントリは、値を JSON 表記で示して読み込みエラーにする
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-04-06`
  - Rule: allowlist R-503 / allowlist DD-05（一括報告を崩さない値の整形）
  - Scenario: Given `reason: {}` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `reason が文字列でない: {}` を含むこと（`[object Object]` と表示しないこと）

#### T-04-05: 理由以外の必須属性の検証

- [x] **T-04-05-01**: `occurrence` が 0 のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-01`
  - Rule: allowlist R-504 / allowlist DD-03 / implementation §3.4 #2
  - Scenario: Given `occurrence: 0` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `occurrence` が 1 以上の整数でない旨を含むこと

- [x] **T-04-05-02**: `occurrence` が小数のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-02`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `occurrence: 1.5` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `occurrence` が 1 以上の整数でない旨を含むこと

- [x] **T-04-05-03**: `occurrence` が文字列のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-03`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `occurrence: "1"`（引用符付きの文字列）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `occurrence` が 1 以上の整数でない旨を含むこと

- [x] **T-04-05-04**: `op` が `MutationOp` に無い値のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-04`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `op: arithmetic` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `op` の値と許可される値の一覧を含むこと

- [x] **T-04-05-05**: `file` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-05`
  - Rule: allowlist R-504
  - Scenario: Given `file` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `file` の欠落を含むこと

- [x] **T-04-05-06**: `lineText` が文字列でないエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-06`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `lineText: 42`（数値）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `lineText` が文字列でない旨を含むこと

- [x] **T-04-05-07**: `before` が文字列でないエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-07`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `before: true`（真偽値）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `before` が文字列でない旨を含むこと

- [x] **T-04-05-08**: `after` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-08`
  - Rule: allowlist R-504 / implementation §3.4 #2（`after` は空文字列のみ許す。欠落は許さない）
  - Scenario: Given `after` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `after` の欠落を含むこと

- [x] **T-04-05-09**: `file` が `\` 区切りのエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-09`
  - Rule: allowlist R-504 / implementation §3.4 #3 / REQ-NF-004
  - Scenario: Given `file: 'skills\_cle-libs\libs\a.ts'` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `file` が `/` 区切りのリポジトリルート相対でない旨を含むこと

- [x] **T-04-05-10**: `file` が絶対パスのエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-10`
  - Rule: allowlist R-504 / implementation §3.4 #3
  - Scenario: Given `file: /home/user/repo/skills/_cle-libs/libs/a.ts` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `file` がリポジトリルート相対でない旨を含むこと

- [x] **T-04-05-11**: null のエントリと不正な属性のエントリをすべて列挙する
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-11`
  - Rule: allowlist R-504 / allowlist DD-05
  - Scenario: Given 1 件目が `-` のみ（null）、2 件目が正常、3 件目が `op: arithmetic` の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` の `error.message` に 1 件目がマッピングでない旨と 3 件目の `op` 不正の両方を含むこと

- [x] **T-04-05-12**: スカラーのエントリは、マッピングでない旨だけを報告する
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-12`
  - Rule: allowlist R-504
  - Scenario: Given `- foo` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` にマッピングでない旨を含み、属性ごとの不正を含まないこと

- [x] **T-04-05-13**: `lineText` が列のエントリは、値を JSON 表記で示して読み込みエラーにする
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-13`
  - Rule: allowlist R-504 / allowlist DD-05（一括報告を崩さない値の整形）
  - Scenario: Given `lineText: []` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `lineText が文字列でない: []` を含むこと（空文字と表示しないこと）

- [x] **T-04-05-14**: `occurrence` がマッピングのエントリは、値を JSON 表記で示して読み込みエラーにする
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-14`
  - Rule: allowlist R-504 / allowlist DD-05（一括報告を崩さない値の整形）
  - Scenario: Given `occurrence: {a: 1}` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `occurrence が 1 以上の整数でない: {"a":1}` を含むこと

- [x] **T-04-05-15**: `file` が `/` 区切りの Windows 絶対パスのエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-15`
  - Rule: allowlist R-504 / implementation §3.4 #3 / REQ-NF-004
  - Scenario: Given `file: C:/x/a.ts` のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `file` がリポジトリルート相対でない旨を含むこと

- [ ] **T-04-05-16**: `after` が数値のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-16`
  - Rule: allowlist R-504 / implementation §3.4 #2（`after` は空文字を許す文字列）
  - Scenario: Given `after: 1`（数値）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `after` が文字列でない旨を含むこと

- [ ] **T-04-05-17**: `after` が YAML の null のエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-17`
  - Rule: allowlist R-504 / implementation §3.4 #2（`after` は空文字を許す文字列。null は空文字ではない）
  - Scenario: Given `after:`（値なし = null）のエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `after` を含むこと（空文字列の `after` として受理しないこと）

- [ ] **T-04-05-18**: `lineText` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-18`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `lineText` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `lineText` の欠落を含むこと

- [ ] **T-04-05-19**: `op` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-19`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `op` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `op` の欠落を含むこと

- [ ] **T-04-05-20**: `before` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-20`
  - Rule: allowlist R-504 / implementation §3.4 #2
  - Scenario: Given `before` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `before` の欠落を含むこと

- [ ] **T-04-05-21**: `occurrence` が欠けているエントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-05-21`
  - Rule: allowlist R-504 / allowlist DD-03 / implementation §3.4 #2
  - Scenario: Given `occurrence` キーを持たないエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に `occurrence` の欠落を含むこと

#### T-04-06: キーの重複

- [x] **T-04-06-01**: 照合キーが同一の 2 エントリは読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-06-01`
  - Rule: allowlist R-504 / implementation §3.4 #4（allowlist OQ #4 の既定値） / allowlist DD-01
  - Scenario: Given `file` / `lineText` / `op` / `before` / `after` / `occurrence` が同一で `reason` だけが異なる 2 エントリの YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に重複した 2 エントリの位置を含むこと

- [x] **T-04-06-02**: `lineText` が前後の空白だけ異なる 2 エントリは重複として読み込みエラーになる
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-06-02`
  - Rule: allowlist R-504 / implementation §3.4 #4 / allowlist DD-01（`lineText` は trim して比べる）
  - Scenario: Given `lineText` が `return a > b;` と `  return a > b;  ` で、他のキーが同一の 2 エントリの YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、`error.message` に 2 件目が 1 件目と重複している旨を含むこと

#### T-04-07: 不正なエントリの一括報告

- [x] **T-04-07-01**: 正しいエントリに 1 件だけ不正が混ざると、全体を読み込みエラーにする
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-07-01`
  - Rule: allowlist R-505 / allowlist DD-05 / Edge allowlist-5
  - Scenario: Given 正しいエントリ 2 件と、`reason` を欠くエントリ 1 件からなる YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then エントリの配列を返さずに `ChatlogError` を投げること（正しい 2 件だけを部分的に返さないこと）

- [x] **T-04-07-02**: 複数の不正をすべて列挙する
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-07-02`
  - Rule: allowlist R-505 / allowlist DD-05 / Edge allowlist-6
  - Scenario: Given 1 件目が `reason` を欠き、3 件目が `op: arithmetic` の 3 エントリの YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` の `error.message` に 1 件目の `reason` 欠落と 3 件目の `op` 不正の両方を含むこと（最初の 1 件で打ち切らないこと）

### [エッジケース] Edge Cases

#### T-04-08: エントリを持たない文書

- [x] **T-04-08-01**: 空のファイルはエントリ 0 件として扱う
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-08-01`
  - Rule: allowlist R-502 / implementation §3.4 #5（allowlist OQ #5 の既定値） / Edge allowlist-2
  - Scenario: Given 内容が 0 バイトの許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、エントリ 0 件の配列を返すこと

- [x] **T-04-08-02**: コメントだけのファイルはエントリ 0 件として扱う
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-08-02`
  - Rule: allowlist R-502 / implementation §3.4 #5 / Edge allowlist-2
  - Scenario: Given `# 等価変異体の記録` の 1 行だけからなる許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、エントリ 0 件の配列を返すこと

- [x] **T-04-08-03**: 空の列 `[]` はエントリ 0 件として扱う
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-08-03`
  - Rule: allowlist R-502 / Edge allowlist-2
  - Scenario: Given 内容が `[]` の許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、エントリ 0 件の配列を返すこと

- [x] **T-04-08-04**: コメント・空行・字下げしたコメントだけのファイルはエントリ 0 件として扱う
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-08-04`
  - Rule: allowlist R-502 / implementation §3.4 #5（空文書の判定は本文テキストで行う）
  - Scenario: Given コメント行・空行・字下げしたコメント行だけからなる許容リストファイルがある, When `loadAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、エントリ 0 件の配列を返すこと（T-04-03-03〜05 の対照）

#### T-04-09: 検証の境界

- [x] **T-04-09-01**: `occurrence` の最小値 1 を受理する
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-09-01`
  - Rule: allowlist R-504 / allowlist DD-03（1 始まり）
  - Scenario: Given `occurrence: 1` の正しいエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 読み込みエラーにならず、`occurrence` が 1 のエントリを返すこと

- [x] **T-04-09-02**: `occurrence` だけが異なる 2 エントリは重複とみなさない
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-09-02`
  - Rule: allowlist R-504 / implementation §3.4 #4 / allowlist DD-03
  - Scenario: Given `occurrence: 1` と `occurrence: 2` 以外のキーが同一の 2 エントリの YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 読み込みエラーにならず、2 件のエントリを返すこと（T-04-06-01 の対照）

- [x] **T-04-09-03**: `file` が空文字列のエントリを受理する（現挙動の固定）
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-09-03`
  - Rule: allowlist R-504 / implementation §3.4 #3（相対パスの形式だけを検査し、存在は検査しない）
  - Scenario: Given `file: ''` の正しいエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 読み込みエラーにならず、`file` が空文字列のエントリを返すこと

- [x] **T-04-09-04**: `file` が `..` で始まる相対パスのエントリを受理する（現挙動の固定）
  - Target: `loadAllowlist`
  - Test ID: `T-MUT-AL-09-04`
  - Rule: allowlist R-504 / implementation §3.4 #3（相対パスの形式だけを検査し、存在は検査しない）
  - Scenario: Given `file: ../a.ts` の正しいエントリ 1 件の YAML がある, When `loadAllowlist` を呼ぶ
  - Expected: Then 読み込みエラーにならず、`file` が `../a.ts` のエントリを返すこと

---

## T-05: `matchAllowlist`（生存変異体の照合と古いエントリの抽出）

> Commit: 7 / 配置ファイル: `scripts/testing/mutation/allowlist.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/allowlist.unit.spec.ts` / Phase: 1 / Test ID prefix: `T-MUT-AL`（グループ番号 10〜19）
>
> シグネチャは `matchAllowlist(mutants, results, entries)` で、`{ allowed, unallowed, stale }` を返す。照合キーは `file` + 前後の空白を除いた `lineText` + `op` + `before` + `after` + `occurrence`（DR-04 / allowlist DD-01）。
> 生存の許容判定（R-506〜R-508）は survived の変異体だけが対象。エントリの存在確認（R-509）は判定の種類を問わず生成された全変異体が対象（implementation Commit 7）。

### [正常] Normal Cases

#### T-05-01: キーが一致する survived 変異体

- [x] **T-05-01-01**: 照合キーがすべて一致する survived 変異体は許容済みの生存になる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-10-01`
  - Rule: allowlist R-507 / DR-04 / REQ-F-009
  - Scenario: Given survived の変異体 1 件と、その照合キーとすべて一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれ、`unallowed` に含まれないこと

#### T-05-02: キーが一致しない survived 変異体

- [x] **T-05-02-01**: エントリ 0 件なら survived 変異体は未許容の生存になる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-11-01`
  - Rule: allowlist R-508 / Edge allowlist-1
  - Scenario: Given survived の変異体 1 件と、エントリ 0 件の許容リストがある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれ、`allowed` が空であること

- [x] **T-05-02-02**: `file` だけが異なるエントリには一致しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-11-02`
  - Rule: allowlist R-508 / allowlist DD-01
  - Scenario: Given survived の変異体 1 件と、`file` だけが異なるエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれること

- [x] **T-05-02-03**: `op` だけが異なるエントリには一致しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-11-03`
  - Rule: allowlist R-508 / allowlist DD-01
  - Scenario: Given survived の変異体 1 件と、`op` だけが異なるエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれること

- [x] **T-05-02-04**: `before` だけが異なるエントリには一致しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-11-04`
  - Rule: allowlist R-508 / allowlist DD-01
  - Scenario: Given survived の変異体 1 件と、`before` だけが異なるエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれること

- [x] **T-05-02-05**: `after` だけが異なるエントリには一致しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-11-05`
  - Rule: allowlist R-508 / allowlist DD-01
  - Scenario: Given `>` を `>=` にした survived の変異体 1 件と、`after: "<"` のほかは同じエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれること

#### T-05-03: 古いエントリの抽出

- [x] **T-05-03-01**: どの変異体にも一致しないエントリは古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-12-01`
  - Rule: allowlist R-509 / allowlist R-510 / REQ-F-010
  - Scenario: Given 変異体 2 件と、どちらのキーとも一致しないエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれること

- [x] **T-05-03-02**: survived 変異体に一致したエントリは古いエントリにならない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-12-02`
  - Rule: allowlist R-509
  - Scenario: Given survived の変異体 1 件と、そのキーに一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `stale` が空であること

### [異常] Error Cases

#### T-05-04: survived 以外の判定には許容を適用しない

- [x] **T-05-04-01**: killed の変異体はキーが一致しても許容済み・未許容のどちらにも入らない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-13-01`
  - Rule: allowlist R-506 / allowlist §2.1（許容は survived にのみ作用する）
  - Scenario: Given killed の変異体 1 件と、そのキーに一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` にも `unallowed` にも含まれないこと

- [x] **T-05-04-02**: timeout の変異体はキーが一致しても許容済み・未許容のどちらにも入らない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-13-02`
  - Rule: allowlist R-506
  - Scenario: Given timeout の変異体 1 件と、そのキーに一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` にも `unallowed` にも含まれないこと

- [x] **T-05-04-03**: error の変異体はキーが一致しても許容済み・未許容のどちらにも入らない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-13-03`
  - Rule: allowlist R-506
  - Scenario: Given error の変異体 1 件と、そのキーに一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` にも `unallowed` にも含まれないこと

- [x] **T-05-04-04**: compile-error の変異体はキーが一致しても許容済み・未許容のどちらにも入らない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-13-04`
  - Rule: allowlist R-506 / DR-02
  - Scenario: Given compile-error の変異体 1 件と、そのキーに一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` にも `unallowed` にも含まれないこと

### [エッジケース] Edge Cases

#### T-05-05: 行番号のずれ

- [x] **T-05-05-01**: 上に行が追加されて行番号がずれても許容済みのまま一致する
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-14-01`
  - Rule: allowlist R-507 / DR-04 / REQ-F-009 / AC-010 / Edge allowlist-7
  - Scenario: Given 10 行目の `?? -> ||` を記録したエントリと、同じ行テキスト・同じ変異で 11 行目にある survived の変異体がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれること（行番号をキーに使わないこと）

#### T-05-06: 行テキストの空白と改行コード

- [x] **T-05-06-01**: 行頭のインデントだけが変わっても一致する
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-15-01`
  - Rule: allowlist R-507 / allowlist DD-01 / Edge allowlist-8
  - Scenario: Given エントリの `lineText` が `if (a > b) {` で、survived 変異体の `lineText` が
    `  if (a > b) {`（4 空白インデント）である, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれること

- [x] **T-05-06-02**: 行末の空白だけが変わっても一致する
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-15-02`
  - Rule: allowlist R-507 / allowlist DD-01 / Edge allowlist-8
  - Scenario: Given エントリの `lineText` が `if (a > b) {` で、survived 変異体の `lineText` が `if (a > b) {  `（行末に空白 2 文字）である, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれること

- [x] **T-05-06-03**: 行の内部の空白が変わったエントリは古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-15-03`
  - Rule: allowlist R-509 / REQ-F-010 / AC-012 / Edge allowlist-9
  - Scenario: Given エントリの `lineText` が `if (a > b) {` で、生成された変異体の `lineText` が `if (a  > b) {`（内部の空白が 2 文字）である, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれること

- [x] **T-05-06-04**: 行の内部の空白が変わった survived 変異体は未許容の生存になる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-15-04`
  - Rule: allowlist R-508 / Edge allowlist-9
  - Scenario: Given エントリの `lineText` が `if (a > b) {` で、survived 変異体の `lineText` が `if (a  > b) {`（内部の空白が 2 文字）である, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `unallowed` に含まれること

- [x] **T-05-06-05**: CRLF のソースから写したエントリの行末 `\r` は照合に影響しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-15-05`
  - Rule: allowlist R-507 / allowlist §3.1（行テキストは改行コードを含まない） / REQ-NF-004 / Edge allowlist-16
  - Scenario: Given エントリの `lineText` が `if (a > b) {\r` で、survived 変異体の `lineText` が `if (a > b) {` である, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれること

#### T-05-07: 当該行・ファイルの消失

- [x] **T-05-07-01**: エントリが指す行が削除されたら古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-16-01`
  - Rule: allowlist R-509 / Edge allowlist-10
  - Scenario: Given エントリの `lineText` を持つ変異体が 1 件も生成されていない（行が削除された）, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれること

- [x] **T-05-07-02**: エントリが指すファイルが改名されたら古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-16-02`
  - Rule: allowlist R-509 / Edge allowlist-10
  - Scenario: Given エントリの `file` が `skills/a/old.ts` で、同じ行・同じ変異の変異体が `skills/a/new.ts` にある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれること

#### T-05-08: 行内の出現順

- [x] **T-05-08-01**: 出現順だけが異なる 2 エントリは、それぞれ別の変異体に一致する
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-01`
  - Rule: allowlist R-507 / allowlist DD-03 / Edge allowlist-11
  - Scenario: Given 行 `a < b && c < d` の 1 つ目の `<` と 2 つ目の `<` を `<=` にした survived 変異体 2 件と、`occurrence: 1` / `occurrence: 2` のエントリ 2 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 2 件の変異体がともに `allowed` に含まれ、`stale` が空であること

- [x] **T-05-08-02**: 出現順が適用箇所の数を超えるエントリは古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-02`
  - Rule: allowlist R-509 / Edge allowlist-12
  - Scenario: Given 行 `a < b` から生成された変異体と、同じ行・同じ変異で `occurrence: 2` のエントリがある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれること

- [x] **T-05-08-03**: 置換後の字句の違いは出現順に影響しない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-03`
  - Rule: allowlist R-507 / allowlist DD-03
  - Scenario: Given 行 `a < b` の同じ `<` を `<=` にした survived 変異体と `>=` にした survived 変異体があり、`after: ">="`・`occurrence: 1` のエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `>=` にした変異体だけが `allowed` に含まれ、`<=` にした変異体は `unallowed` に含まれること（どちらも出現順 1 として数えること）

- [x] **T-05-08-04**: 置換前の字句が異なる箇所は出現順に数えない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-04`
  - Rule: allowlist R-507 / allowlist DD-03
  - Scenario: Given 行 `a <= b && c < d` の `<` を `<=` にした survived 変異体と、`before: "<"`・`occurrence: 1` のエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該変異体が `allowed` に含まれること（左にある `<=` を `<` の出現として数えないこと）

- [x] **T-05-08-05**: 別ファイルにある同じ置換前の字句は出現順に数えない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-05`
  - Rule: allowlist R-507 / allowlist DD-03（同一 `file` に限る）
  - Scenario: Given 対象の survived 変異体（col 16）と、別ファイルの同じ行番号・同じ `before` で col 7 の変異体があり、`occurrence: 1` のエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 対象の変異体が `allowed` に含まれること（別ファイルの変異体を数えて出現順 2 にしないこと）

- [x] **T-05-08-06**: 同じファイルの別の行にある同じ置換前の字句は出現順に数えない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-06`
  - Rule: allowlist R-507 / allowlist DD-03（同一 `line` に限る）
  - Scenario: Given 対象の survived 変異体（col 16）と、同じファイルの別の行・同じ `before` で col 7 の変異体があり、`occurrence: 1` のエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 対象の変異体が `allowed` に含まれること（別の行の変異体を数えて出現順 2 にしないこと）

- [x] **T-05-08-07**: 出現順は左から数える
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-07`
  - Rule: allowlist R-507 / allowlist R-508 / allowlist DD-03（左から数えた順位）
  - Scenario: Given 行 `a < b && c < d` の col 7 と col 16 の `<` を `<=` にした survived 変異体 2 件と、`occurrence: 2` のエントリ 1 件だけがある, When `matchAllowlist` を呼ぶ
  - Expected: Then col 16 の変異体が `allowed`、col 7 の変異体が `unallowed` に含まれること（順位の向きを固定する。T-05-08-01 の対照）

- [x] **T-05-08-08**: 同じ位置に置換後の字句違いの変異体が複数あっても、その位置は 1 回だけ数える
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-17-08`
  - Rule: allowlist R-507 / allowlist DD-03（置換後の字句は順位に影響しない）
  - Scenario: Given 行 `a < b && c < d` の col 7 の `<` を `<=` と `>=` にした変異体 2 件と、col 16 の `<` を `<=` にした survived 変異体があり、`occurrence: 2` のエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then col 16 の変異体が `allowed` に含まれること（col 7 を 2 回数えて出現順 3 にしないこと）

#### T-05-09: 一致の多重性と判定の種類

- [x] **T-05-09-01**: 同じテキストの行が 2 つあると、1 エントリが両方の変異体に一致する
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-18-01`
  - Rule: allowlist R-507 / allowlist DD-02 / DR-04（既知の弱点） / Edge allowlist-13 / Edge index-9
  - Scenario: Given 同一ファイルの 3 行目と 9 行目が同じテキストで、それぞれに同じ変異の survived 変異体があり、エントリが 1 件ある, When `matchAllowlist` を呼ぶ
  - Expected: Then 2 件の変異体がともに `allowed` に含まれること

- [x] **T-05-09-02**: killed の変異体にだけ一致するエントリは古いエントリにならない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-18-02`
  - Rule: allowlist R-509 / allowlist DD-06 / Edge allowlist-14
  - Scenario: Given killed の変異体 1 件と、そのキーに一致するエントリ 1 件だけがある, When `matchAllowlist` を呼ぶ
  - Expected: Then `stale` が空であること（存在確認は判定の種類を問わないこと）

- [x] **T-05-09-03**: 1 件の survived 変異体に複数のエントリが一致しても、許容済みとして 1 回だけ数える
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-18-03`
  - Rule: allowlist R-507（複数一致でも結果は同じ）
  - Scenario: Given survived の変異体 1 件と、そのキーに一致し `reason` だけが異なる 2 エントリがある, When `matchAllowlist` を呼ぶ
  - Expected: Then `allowed` に当該変異体がちょうど 1 回だけ含まれること

#### T-05-10: 集合の境界

- [x] **T-05-10-01**: 変異体が 0 件なら有効なエントリはすべて古いエントリになる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-01`
  - Rule: allowlist R-509 / Edge allowlist-15 / REQ-F-018
  - Scenario: Given 変異体 0 件と、有効なエントリ 2 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 2 件のエントリがすべて `stale` に含まれ、`allowed` と `unallowed` が空であること

- [x] **T-05-10-02**: すべての survived が許容済みなら未許容の生存は 0 件になる
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-02`
  - Rule: allowlist R-507 / allowlist R-508 / Edge allowlist-17
  - Scenario: Given survived の変異体 2 件と、それぞれに一致するエントリ 2 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `unallowed` が空で、`allowed` が 2 件であること

- [x] **T-05-10-03**: 中断で判定の無い変異体に一致するエントリは古いエントリにならない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-03`
  - Rule: allowlist R-509 / allowlist DD-06 / Edge allowlist-18
  - Scenario: Given 生成済みの変異体 3 件のうち判定があるのは 1 件だけで、判定の無い 3 件目の変異体に一致するエントリがある, When `matchAllowlist` を呼ぶ
  - Expected: Then 当該エントリが `stale` に含まれないこと（古さは生成済みの変異体全体に対して判定すること）

- [x] **T-05-10-04**: 生成された変異体に無い survived の判定は、照合せずにエラーにする
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-04`
  - Rule: implementation Commit 7（前提: 判定の変異体は生成された変異体に含まれる）
  - Scenario: Given 生成された変異体 M だけがあり、判定には M と、生成されていない変異体 Mx の survived がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げること（Mx を出現順 1 として黙って照合しないこと）

- [x] **T-05-10-05**: 生成された変異体に無い killed の判定もエラーにする
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-05`
  - Rule: implementation Commit 7（前提は判定の種類を問わない）
  - Scenario: Given 生成された変異体 M だけがあり、判定には生成されていない変異体 Mx の killed がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [x] **T-05-10-06**: 判定の変異体は値で照らし合わせ、同じ値の別オブジェクトでもエラーにしない
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-06`
  - Rule: implementation Commit 7（前提の判定は全属性の値の一致）
  - Scenario: Given 生成された変異体 M と、M の全属性を写した別オブジェクトの survived 判定、M に一致するエントリ 1 件がある, When `matchAllowlist` を呼ぶ
  - Expected: Then 例外を投げず、当該判定の変異体が `allowed` に含まれること

- [ ] **T-05-10-07**: 生成された変異体と `line` だけが異なる判定の変異体はエラーにする
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-07`
  - Rule: implementation Commit 7（前提の判定は全属性の値の一致）
  - Scenario: Given 生成された変異体 M と、M の `line` だけを 1 増やした変異体の survived 判定がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げること（`line` を照合キーに使わないことを理由に一致とみなさないこと）

- [ ] **T-05-10-08**: 生成された変異体と `column` だけが異なる判定の変異体はエラーにする
  - Target: `matchAllowlist`
  - Test ID: `T-MUT-AL-19-08`
  - Rule: implementation Commit 7（前提の判定は全属性の値の一致）
  - Scenario: Given 生成された変異体 M と、M の `column` だけを 1 増やした変異体の survived 判定がある, When `matchAllowlist` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

---

## T-06: `formatReport`（レポートのテキスト構成）

> Commit: 8 / 配置ファイル: `scripts/testing/mutation/report.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/report.unit.spec.ts` / Phase: 1 / Test ID prefix: `T-MUT-RP`（グループ番号 01〜09）
>
> `formatReport(summary: MutationRunReport): string` は標準出力に出すテキストだけを返す純関数（report-cli DD-02 / REQ-NF-002）。`MutationRunReport` は生成件数 `generatedCount` と判定の列（判定済み件数）を別に持つ（implementation Commit 8）。

### [正常] Normal Cases

#### T-06-01: 判定ごとの件数

- [ ] **T-06-01-01**: 5 種の判定の件数を別々に出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-01-01`
  - Rule: report-cli R-607 / DR-02 / REQ-F-011
  - Scenario: Given killed 3・survived 2・timeout 1・error 1・compile-error 1 の判定を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に killed 3、survived 2、timeout 1、error 1、compile-error 1 の件数がそれぞれ含まれること

- [ ] **T-06-01-02**: survived を許容済みと未許容の内訳に分けて出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-01-02`
  - Rule: report-cli R-607 / DR-04
  - Scenario: Given survived 3 件のうち許容済み 1 件・未許容 2 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の survived の内訳に許容済み 1 件と未許容 2 件が示されること

#### T-06-02: kill 率と有効判定率

- [ ] **T-06-02-01**: kill 率を killed ÷ (killed + survived) の百分率で出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-02-01`
  - Rule: report-cli R-608 / report-cli DD-05
  - Scenario: Given killed 3・survived 1 の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の kill 率が 75% であること

- [ ] **T-06-02-02**: 有効判定率を (killed + survived) ÷ 生成件数の百分率で出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-02-02`
  - Rule: report-cli R-608 / report-cli DD-05 / implementation Commit 8（通常時の分母は生成件数）
  - Scenario: Given `generatedCount` 8 で、killed 3・survived 1・timeout 4 の判定を持つ中断なしの summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の有効判定率が 50% であること

- [ ] **T-06-02-03**: compile-error は kill 率の分母に含めない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-02-03`
  - Rule: report-cli R-608 / DR-02 / report-cli DD-05 / Edge report-cli-22
  - Scenario: Given killed 1・compile-error 1 の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の kill 率が 100% であり、compile-error 1 件が別に数えられていること

#### T-06-03: 一覧の出力

- [ ] **T-06-03-01**: 未許容の生存を file:line・オペレータ・置換前後の字句つきで出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-03-01`
  - Rule: report-cli R-609 / REQ-F-011 / AC-013 / Edge report-cli-11
  - Scenario: Given `skills/_cle-libs/libs/a.ts` の 12 行目で `>` を `>=` にした未許容の生存 1 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の未許容の生存の一覧に `skills/_cle-libs/libs/a.ts:12`、`relational`、`>`、`>=` が含まれること

- [ ] **T-06-03-02**: 許容済みの生存は未許容の一覧に出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-03-02`
  - Rule: report-cli R-609（許容済みは R-607 の内訳でのみ示す）
  - Scenario: Given 許容済みの生存 1 件だけを持ち、未許容の生存が 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 未許容の生存の一覧に当該変異体の file:line が含まれないこと

- [ ] **T-06-03-03**: 未許容の生存をファイル・行・桁の昇順に並べる
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-03-03`
  - Rule: report-cli R-609
  - Scenario: Given 未許容の生存 `b.ts:3:5`・`a.ts:10:2`・`a.ts:3:9`・`a.ts:3:4` をこの順で持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 一覧が `a.ts:3:4`、`a.ts:3:9`、`a.ts:10:2`、`b.ts:3:5` の順に並ぶこと

- [ ] **T-06-03-04**: 古い許容エントリを列挙する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-03-04`
  - Rule: report-cli R-610 / DR-04 / REQ-F-010 / Edge report-cli-17
  - Scenario: Given 古いエントリ 1 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の古いエントリの一覧に当該エントリの `file` と `lineText` が含まれること

- [ ] **T-06-03-05**: drift したファイルを列挙する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-03-05`
  - Rule: report-cli R-611 / REQ-F-008 / Edge report-cli-19
  - Scenario: Given drift として `skills/_cle-libs/libs/a.ts` を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の drift の一覧に `skills/_cle-libs/libs/a.ts` が含まれること

### [異常] Error Cases

#### T-06-04: 実行上の異常の報告

- [ ] **T-06-04-01**: 削除できなかったファイルを残骸として列挙し警告する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-04-01`
  - Rule: report-cli R-612 / report-cli DD-07 / execution DD-05 / Edge report-cli-20
  - Scenario: Given 残骸として `skills/_cle-libs/libs/a.mutation-003.ts` を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に残骸のセクションと警告があり、`a.mutation-003.ts` が列挙されること

- [ ] **T-06-04-02**: 有効な判定がすべて survived のファイルに「差し替えが効いていない可能性」を警告する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-04-02`
  - Rule: report-cli R-613 / report-cli DD-08 / Edge report-cli-21
  - Scenario: Given `a.ts` の判定が survived 3 件だけである summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `a.ts` についての差し替えが効いていない可能性の警告が含まれること

- [ ] **T-06-04-03**: 中断時はレポートの先頭に途中結果である旨を明示する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-04-03`
  - Rule: report-cli R-605 / report-cli DD-06 / Edge report-cli-23
  - Scenario: Given 中断ありで、判定済みの変異体 2 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の先頭が「中断（途中結果）」の見出しであること

- [ ] **T-06-04-04**: survived 2 件と timeout 1 件のファイルにも差し替えの警告を出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-04-04`
  - Rule: report-cli R-613（有効な判定だけで判断する） / report-cli DD-05 / Edge report-cli-21
  - Scenario: Given `a.ts` の判定が survived 2 件・timeout 1 件である summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `a.ts` についての差し替えが効いていない可能性の警告が含まれること（timeout を有効な判定に数えないこと）

- [ ] **T-06-04-05**: 2 ファイルのうち有効な判定がすべて survived のファイルだけを警告する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-04-05`
  - Rule: report-cli R-613（ファイルごとに判断する） / Edge report-cli-21
  - Scenario: Given `a.ts` の判定が survived 2 件、`b.ts` の判定が killed 1 件・survived 1 件である summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `a.ts` についての差し替えの警告が含まれ、`b.ts` についての警告が含まれないこと

### [エッジケース] Edge Cases

#### T-06-05: 0 件の明示

- [ ] **T-06-05-01**: 未許容の生存が 0 件なら 0 件と明示する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-05-01`
  - Rule: report-cli R-609
  - Scenario: Given 未許容の生存が 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 未許容の生存のセクションが省略されず、0 件と明示されること

- [ ] **T-06-05-02**: 古いエントリが 0 件なら 0 件と明示する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-05-02`
  - Rule: report-cli R-610
  - Scenario: Given 古いエントリが 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 古いエントリのセクションが省略されず、0 件と明示されること

- [ ] **T-06-05-03**: drift が 0 件なら 0 件と明示する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-05-03`
  - Rule: report-cli R-611
  - Scenario: Given drift が 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then drift のセクションが省略されず、0 件と明示されること

#### T-06-06: 出さないセクション・警告

- [ ] **T-06-06-01**: 残骸が無ければ残骸のセクションを出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-06-01`
  - Rule: report-cli R-612
  - Scenario: Given 残骸が 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に残骸のセクションも警告も含まれないこと

- [ ] **T-06-06-02**: 有効な判定が 0 件のファイルには差し替えの警告を出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-06-02`
  - Rule: report-cli R-613
  - Scenario: Given `a.ts` の判定が timeout 2 件だけである summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `a.ts` についての差し替えの警告が含まれないこと

- [ ] **T-06-06-03**: killed を含むファイルには差し替えの警告を出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-06-03`
  - Rule: report-cli R-613
  - Scenario: Given `a.ts` の判定が killed 1 件・survived 2 件である summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `a.ts` についての差し替えの警告が含まれないこと

#### T-06-07: kill 率の算出不能

- [ ] **T-06-07-01**: killed + survived が 0 件なら kill 率を「算出不能」と出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-07-01`
  - Rule: report-cli R-608 / Edge report-cli-14 / Edge report-cli-27
  - Scenario: Given timeout 2 件だけの判定を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の kill 率が「算出不能」であり、0 除算による `NaN` や `Infinity` を含まないこと

- [ ] **T-06-07-02**: 生成件数 0 で有効判定率の分母が 0 でも `NaN` や `Infinity` を出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-07-02`
  - Rule: report-cli R-608 / report-cli R-606 / implementation Commit 8（通常時の分母は生成件数）
  - Scenario: Given `generatedCount` が 0 で中断なしの summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `NaN` と `Infinity` のどちらも含まれないこと

- [ ] **T-06-07-03**: 中断で判定済み 0 件のとき有効判定率の分母が 0 でも `NaN` や `Infinity` を出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-07-03`
  - Rule: report-cli R-608 / report-cli R-605 / implementation Commit 8（中断時の分母は判定済み件数）
  - Scenario: Given `generatedCount` 5 で、中断ありかつ判定済み 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に `NaN` と `Infinity` のどちらも含まれないこと

#### T-06-08: 変異体 0 件

- [ ] **T-06-08-01**: 生成件数 0 なら「変異体 0 件」を明示し、件数を 0 として出す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-08-01`
  - Rule: report-cli R-606 / REQ-F-018 / AC-021 / Edge report-cli-8
  - Scenario: Given `generatedCount` が 0 で中断なしの summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に「変異体 0 件」が含まれ、5 種の判定の件数がすべて 0 と出ること

- [ ] **T-06-08-02**: 中断で判定済みが 0 件でも、生成件数が 1 以上なら「変異体 0 件」と出さない
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-08-02`
  - Rule: report-cli R-606 / report-cli R-605 / implementation Commit 8
  - Scenario: Given `generatedCount` 5 で、中断ありかつ判定済み 0 件の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に「変異体 0 件」が含まれず、中断の見出しが含まれること

- [ ] **T-06-08-03**: 変異体 0 件でも古いエントリは通常どおり列挙する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-08-03`
  - Rule: report-cli R-606 / report-cli R-610 / Edge report-cli-10
  - Scenario: Given `generatedCount` が 0 で、古いエントリ 2 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に「変異体 0 件」と古いエントリ 2 件の一覧の両方が含まれること

- [ ] **T-06-08-04**: 変異体 0 件でも drift は通常どおり列挙する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-08-04`
  - Rule: report-cli R-606（drift は通常どおり出す） / report-cli R-611
  - Scenario: Given `generatedCount` が 0 で、drift として `skills/_cle-libs/libs/a.ts` 1 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に「変異体 0 件」と、drift の一覧の `skills/_cle-libs/libs/a.ts` の両方が含まれること

- [ ] **T-06-08-05**: 変異体 0 件でも残骸は通常どおり列挙する
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-08-05`
  - Rule: report-cli R-606（残骸は通常どおり出す） / report-cli R-612
  - Scenario: Given `generatedCount` が 0 で、残骸として `skills/_cle-libs/libs/a.mutation-001.ts` 1 件を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力に「変異体 0 件」と、残骸のセクションの `a.mutation-001.ts` の両方が含まれること

#### T-06-09: 分母・決定性・重複一致

- [ ] **T-06-09-01**: 中断時の有効判定率の分母は判定済み件数とする
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-09-01`
  - Rule: report-cli R-608 / report-cli R-605 / implementation Commit 8
  - Scenario: Given `generatedCount` 10 で、中断ありかつ判定済み 4 件（killed 1・survived 1・timeout 2）の summary がある, When `formatReport` を呼ぶ
  - Expected: Then 出力の有効判定率が 50%（2 ÷ 4）であり、20%（2 ÷ 10）でないこと

- [ ] **T-06-09-02**: 同一の入力からは同一のテキストを返す
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-09-02`
  - Rule: report-cli §2.2（入力が同じなら出力も同じ） / REQ-NF-002
  - Scenario: Given すべてのセクションを含む summary を 1 つ用意する, When 同じ summary で `formatReport` を 2 回呼ぶ
  - Expected: Then 2 回の戻り値が完全に一致すること

- [ ] **T-06-09-03**: 1 エントリに一致した同テキスト行の 2 件を許容済みとして 2 件数える
  - Target: `formatReport`
  - Test ID: `T-MUT-RP-09-03`
  - Rule: report-cli R-607 / DR-04 / allowlist DD-02 / Edge report-cli-28
  - Scenario: Given 1 エントリに一致して許容済みになった生存 2 件（同テキストの別行）を持つ summary がある, When `formatReport` を呼ぶ
  - Expected: Then survived の内訳の許容済みが 2 件と出ること

---

## T-07: `decideExitCode`（既定と `--strict` の終了コード）

> Commit: 9 / 配置ファイル: `scripts/testing/mutation/report.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/report.unit.spec.ts` / Phase: 1 / Test ID prefix: `T-MUT-RP`（グループ番号 10〜19）
>
> `decideExitCode(summary, strict): number` は純関数。評価順は 中断 (130) → drift・監査単位の失敗 (1) → 既定 0 → `--strict` の 3 条件 → 0（report-cli 4.3）。非 0 の具体値は 1 とする（report-cli DD-09 / §7 の impl-note）。
> 引数エラー・許容リスト不正・ベースライン失敗・ロック取得失敗は main が実行前に確定させて終了するため、本関数には到達しない（T-14 で扱う）。

### [正常] Normal Cases

#### T-07-01: `--strict` なしは監査が成立すれば 0

- [ ] **T-07-01-01**: 未許容の生存があっても既定では 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-01`
  - Rule: report-cli R-616 / DR-03 / REQ-F-013 / AC-015 / Edge report-cli-11
  - Scenario: Given drift なしで未許容の生存 1 件を持つ summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-02**: 古いエントリがあっても既定では 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-02`
  - Rule: report-cli R-616 / report-cli DD-04 / allowlist DD-07 / Edge report-cli-17
  - Scenario: Given 古いエントリ 1 件だけを持ち、他に問題の無い summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-03**: 全件 timeout でも既定では 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-03`
  - Rule: report-cli R-616 / REQ-F-013 / Edge report-cli-14 / Edge index-2
  - Scenario: Given 判定が timeout 2 件だけの summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-04**: 全件 error でも既定では 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-04`
  - Rule: report-cli R-616 / REQ-F-013 / Edge index-2
  - Scenario: Given 判定が error 2 件だけの summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-05**: 全件 compile-error でも既定では 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-05`
  - Rule: report-cli R-616 / DR-02 / REQ-F-013
  - Scenario: Given 判定が compile-error 2 件だけの summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-06**: 残骸があっても 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-06`
  - Rule: report-cli R-616 / report-cli DD-07 / execution DD-05 / Edge report-cli-20
  - Scenario: Given 残骸 1 件を持ち、他に問題の無い summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-07**: 差し替えの警告対象のファイルがあっても 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-07`
  - Rule: report-cli R-616 / report-cli DD-08 / Edge report-cli-21
  - Scenario: Given 有効な判定がすべて survived のファイルを持ち、他に問題の無い summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-01-08**: 変異体 0 件は既定で 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-10-08`
  - Rule: report-cli R-616 / REQ-F-018 / AC-021 / Edge report-cli-8
  - Scenario: Given `generatedCount` が 0 で中断なし・drift なしの summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

#### T-07-02: `--strict` を通過する

- [ ] **T-07-02-01**: すべての生存が許容済みなら `--strict` でも 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-11-01`
  - Rule: report-cli R-620 / Edge report-cli-13
  - Scenario: Given 許容済みの生存 2 件・未許容 0 件・古いエントリ 0 件の summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-02-02**: killed だけで問題が無ければ `--strict` でも 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-11-02`
  - Rule: report-cli R-620
  - Scenario: Given 判定が killed 3 件だけで、古いエントリ・drift の無い summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

### [異常] Error Cases

#### T-07-03: 中断は 130 が最優先

- [ ] **T-07-03-01**: 中断されたら 130 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-12-01`
  - Rule: report-cli R-614 / report-cli DD-06 / report-cli DD-09 / REQ-F-013 / AC-023
  - Scenario: Given 中断ありで、他に問題の無い summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 130 を返すこと

- [ ] **T-07-03-02**: 中断と drift が重なっても 130 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-12-02`
  - Rule: report-cli R-614 / report-cli R-615 / Edge report-cli-23
  - Scenario: Given 中断ありかつ drift 1 件を持つ summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 1 ではなく 130 を返すこと

- [ ] **T-07-03-03**: `--strict` の失敗条件と重なっても中断は 130 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-12-03`
  - Rule: report-cli R-614 / report-cli R-617
  - Scenario: Given 中断ありかつ未許容の生存 1 件を持つ summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 130 を返すこと

#### T-07-04: 監査が成立しない

- [ ] **T-07-04-01**: drift があれば既定でも非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-13-01`
  - Rule: report-cli R-615 / REQ-F-008 / REQ-F-013 / Edge report-cli-19
  - Scenario: Given 中断なしで drift 1 件を持つ summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

- [ ] **T-07-04-02**: 監査単位の失敗があれば既定でも非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-13-02`
  - Rule: report-cli R-615 / execution DD-14 / REQ-F-013 (f)
  - Scenario: Given 中断なし・drift なしで、監査単位の失敗（残骸掃除の削除失敗）を持つ summary がある, When `strict = false` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

- [ ] **T-07-04-03**: drift は `--strict` の判定より先に非 0 で確定する
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-13-03`
  - Rule: report-cli R-615 / report-cli 4.3（最初に該当した規則で決まる）
  - Scenario: Given 中断なしで drift 1 件を持ち、未許容の生存・古いエントリの無い summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

#### T-07-05: `--strict` と未許容の生存

- [ ] **T-07-05-01**: `--strict` では未許容の生存 1 件で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-14-01`
  - Rule: report-cli R-617 / DR-03 / REQ-F-014 / AC-016 / Edge report-cli-12
  - Scenario: Given drift なしで未許容の生存 1 件を持つ summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

#### T-07-06: `--strict` と有効な判定 0 件

- [ ] **T-07-06-01**: `--strict` では全件 timeout で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-15-01`
  - Rule: report-cli R-618 / report-cli DD-05 / DR-08 / REQ-F-014 / AC-020 / Edge report-cli-15 / Edge index-2
  - Scenario: Given drift なしで、判定が timeout 2 件だけの summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

- [ ] **T-07-06-02**: `--strict` では全件 error で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-15-02`
  - Rule: report-cli R-618 / REQ-F-014 / AC-020 / Edge report-cli-15 / Edge index-2
  - Scenario: Given drift なしで、判定が error 2 件だけの summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

- [ ] **T-07-06-03**: `--strict` では全件 compile-error で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-15-03`
  - Rule: report-cli R-618 / DR-02 / Edge report-cli-16
  - Scenario: Given drift なしで、判定が compile-error 2 件だけの summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

#### T-07-07: `--strict` と古いエントリ

- [ ] **T-07-07-01**: `--strict` では古いエントリ 1 件で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-16-01`
  - Rule: report-cli R-619 / report-cli DD-04 / allowlist DD-07 / REQ-F-014 / AC-022 / Edge report-cli-18
  - Scenario: Given drift なし・未許容の生存 0 件で、古いエントリ 1 件を持つ summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

### [エッジケース] Edge Cases

#### T-07-08: 変異体 0 件と `--strict`

- [ ] **T-07-08-01**: 変異体 0 件では `--strict` でも有効な判定 0 件を失敗にしない
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-17-01`
  - Rule: report-cli R-618（変異体 1 件以上が前提） / report-cli R-620 / REQ-F-018 / Edge report-cli-9
  - Scenario: Given `generatedCount` が 0 で、古いエントリ・drift の無い summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

- [ ] **T-07-08-02**: 変異体 0 件で許容リストにエントリが残っていれば `--strict` で非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-17-02`
  - Rule: report-cli R-619 / REQ-F-018 / REQ-F-014 / Edge report-cli-10
  - Scenario: Given `generatedCount` が 0 で、古いエントリ 2 件を持つ summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 1 を返すこと

#### T-07-09: 有効な判定の最小値

- [ ] **T-07-09-01**: 有効な判定が 1 件あれば `--strict` の有効判定 0 件条件に該当しない
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-18-01`
  - Rule: report-cli R-618 / report-cli DD-05
  - Scenario: Given 判定が killed 1 件・timeout 3 件で、未許容の生存・古いエントリ・drift の無い summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 0 を返すこと

#### T-07-10: 終了コードの値とレポートとの一貫性

- [ ] **T-07-10-01**: `--strict` の失敗は 130 ではない非 0 を返す
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-19-01`
  - Rule: report-cli R-615 / report-cli DD-09（130 は中断のみ）
  - Scenario: Given 中断なしで未許容の生存 1 件を持つ summary がある, When `strict = true` で `decideExitCode` を呼ぶ
  - Expected: Then 戻り値が 0 でも 130 でもないこと

- [ ] **T-07-10-02**: レポートの未許容の生存件数と `--strict` の終了コードが一貫する
  - Target: `decideExitCode`
  - Test ID: `T-MUT-RP-19-02`
  - Rule: report-cli §2.3（終了コードはレポートの数値と一貫する） / report-cli R-617 / implementation Commit 9
  - Scenario: Given 未許容の生存 1 件を持つ summary を 1 つ用意する, When 同じ summary で `formatReport` と `strict = true` の `decideExitCode` を呼ぶ
  - Expected: Then レポートの未許容の生存が 1 件と出て、かつ終了コードが非 0 であること

---

## T-08: `runDenoTest`（制限時間つきテスト実行と出力の捕捉）

> Commit: 10 / 配置ファイル: `scripts/testing/mutation/run-deno-test.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/run-deno-test.unit.spec.ts`（T-08-05・T-08-07 のみ `scripts/testing/mutation/__tests__/integration/run-deno-test.integration.spec.ts`）/ Phase: 2 / Test ID prefix: `T-MUT-RD`（グループ番号 01〜05）・`T-MUT-RDI`（グループ番号 01〜02）

unit は子プロセスの起動部をスタブに差し替えて検証する（実プロセスを起動しない）。差し替え口の形は implementation.md の `runDenoTest(args, { timeoutMs, signal })` に起動関数の注入を足す形で実装時に決める。実 `deno` が要るのは T-08-05 と T-08-07 だけである。

### [正常] Normal Cases

#### T-08-01: 子プロセスが終了したときの結果の捕捉

- [ ] **T-08-01-01**: 終了コード 0 の子プロセスは終了コードと標準出力・標準エラーを保持した `exited` になる
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-01-01`
  - Rule: execution R-217 / REQ-NF-002
  - Scenario: Given 終了コード 0・標準出力 `"ok | 1 passed"`・標準エラー `""` で終わる子プロセスのスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then `{ kind: 'exited', code: 0, stdout: "ok | 1 passed", stderr: "" }` 相当の結果を返すこと

- [ ] **T-08-01-02**: 非 0 終了でも標準出力と標準エラーを捨てずに返す
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-01-02`
  - Rule: execution R-217 / execution DD-03
  - Scenario: Given 終了コード 1・標準出力 `"FAILED | 0 passed | 1 failed"`・標準エラー `"error: AssertionError"` で終わる子プロセスのスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then `exited` の `code` が 1 で、`stdout` と `stderr` の両方が入力どおり保持されていること

#### T-08-02: 起動引数の受け渡し

- [ ] **T-08-02-01**: 渡した引数がそのまま `deno` の起動引数になる
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-02-01`
  - Rule: execution R-217 / REQ-NF-002
  - Scenario: Given 引数 `['test', '--config', 'deno.mutation-001.json', 'a.unit.spec.ts']` と起動内容を記録するスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then スタブが受け取った起動コマンドが `deno` で、引数が入力の配列と順序まで一致すること

### [異常] Error Cases

#### T-08-03: 子プロセスの起動失敗

- [ ] **T-08-03-01**: 起動時の例外は投げ直さず `error` として返す
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-03-01`
  - Rule: execution R-219
  - Scenario: Given 起動時に `Deno.errors.NotFound("deno not found")` を投げるスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then 例外を投げず、`message` に `"deno not found"` を含む `{ kind: 'error' }` を返すこと

#### T-08-04: 制限時間の超過（unit）

- [ ] **T-08-04-01**: 制限時間内に終わらない子プロセスは強制終了され `timeout` になる
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-04-01`
  - Rule: execution R-218 / execution DD-04 / REQ-NF-003
  - Scenario: Given `kill` されるまで終了しない子プロセスのスタブと `timeoutMs: 50`, When `runDenoTest` を呼ぶ
  - Expected: Then スタブの直接の子プロセスに `kill` が 1 回送られ、結果が `{ kind: 'timeout' }` であること

#### T-08-05: 実 `deno` の制限時間超過（integration）

- [ ] **T-08-05-01**: 実際の `deno test` が制限時間を超えると、直接の子プロセスが終了させられて `timeout` が返る
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RDI-01-01`
  - Rule: execution R-218 / execution DD-04 / REQ-NF-003
  - Scenario: Given 一時ディレクトリに置いた、60 秒待機するだけのテストファイルと `timeoutMs: 2000`, When 実 `deno` で `runDenoTest` を呼ぶ
  - Expected: Then `{ kind: 'timeout' }` が、待機時間 60 秒よりも十分短い時間（制限時間 + 猶予）で返ること

### [エッジケース] Edge Cases

#### T-08-06: 終了・中止の境界と出力の加工

- [ ] **T-08-06-01**: 制限時間内に終了した場合は `kill` を送らず、タイマーを残さない
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-05-01`
  - Rule: execution R-217 / execution R-218
  - Scenario: Given 即座に終了コード 0 で終わる子プロセスのスタブと `timeoutMs: 60000`, When `runDenoTest` を呼ぶ
  - Expected: Then `kill` が送られず、テストのリソース検査（タイマーの残留）で失敗しないこと

- [ ] **T-08-06-02**: 実行中に `signal` が中止されると、直接の子プロセスに `kill` を送って待機を終える
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-05-02`
  - Rule: execution R-227 / implementation Commit 10
  - Scenario: Given `kill` されるまで終了しない子プロセスのスタブ、`timeoutMs: 60000`、実行開始後に中止する `AbortController`, When `runDenoTest` を呼ぶ
  - Expected: Then 制限時間を待たずに結果が返り、スタブの子プロセスに `kill` が送られていること

- [ ] **T-08-06-03**: ANSI エスケープを含む出力は除去せずそのまま返す
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-05-03`
  - Rule: execution R-217 / execution DD-03（ANSI の除去は判定側の責務）
  - Scenario: Given 標準エラーに `"\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed."` を出して終了コード 1 で終わる子プロセスのスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then `stderr` がエスケープを含んだ入力と完全一致すること

- [ ] **T-08-06-04**: 呼び出し前に中止済みの `signal` でも、制限時間を待たずに結果を返す
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-05-04`
  - Rule: execution R-227 / implementation Commit 10
  - Scenario: Given 呼び出し前に中止済みの `AbortController` の `signal`、`kill` されるまで終了しない子プロセスのスタブ、`timeoutMs: 60000`, When `runDenoTest` を呼ぶ
  - Expected: Then 例外を投げず、制限時間（60000ms）を待たずに結果が返ること（終了しない子プロセスを残したまま待ち続けないこと）

- [ ] **T-08-06-05**: 強制終了と自然終了が競合しても例外を投げず、1 つの種類の結果を返す
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RD-05-05`
  - Rule: execution R-218 / execution R-219 / execution DD-04
  - Scenario: Given `timeoutMs: 50` と、制限時間の到達時に `kill` を受けると「既に終了済み」として `TypeError` を投げ、同時に終了コード 0 で終わる子プロセスのスタブ, When `runDenoTest` を呼ぶ
  - Expected: Then `runDenoTest` が reject せず、`kind` が `exited`・`timeout`・`error` のいずれか 1 つに定まった結果を 1 件返し、`exited` であれば `code` が 0 であること

#### T-08-07: パイプの容量を超える出力（integration）

- [ ] **T-08-07-01**: パイプの容量を超える標準出力・標準エラーを、詰まらずに全量捕捉する
  - Target: `runDenoTest`
  - Test ID: `T-MUT-RDI-02-01`
  - Rule: execution R-217 / execution DD-03（出力を捨てずに取得する）
  - Scenario: Given 標準出力と標準エラーのそれぞれに 1 MiB の文字列を書いて終了コード 0 で終わる一時ディレクトリのスクリプトと `timeoutMs: 30000`, When 実 `deno` で `runDenoTest` を呼ぶ
  - Expected: Then `timeout` にならずに `{ kind: 'exited', code: 0 }` が返り、`stdout` と `stderr` の長さがそれぞれ書いた文字列の長さと一致すること

---

## T-09: `acquireLock` / `releaseLock`（同時起動の拒否）

> Commit: 11 / 配置ファイル: `scripts/testing/mutation/run-safety.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/run-safety.unit.spec.ts` / Phase: 2 / Test ID prefix: `T-MUT-RS`（グループ番号 01〜09）

ロックのパスはテストごとの一時ディレクトリ配下に置く（実リポジトリの `temp/mutation.lock` に触れない）。

### [正常] Normal Cases

#### T-09-01: ロックが無い状態での取得

- [ ] **T-09-01-01**: ロックが存在しなければロックファイルを作成して取得に成功する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-01-01`
  - Rule: execution R-201 / execution R-203 / REQ-F-017
  - Scenario: Given ロックのパスにファイルが存在しない一時ディレクトリ, When `acquireLock(path)` を呼ぶ
  - Expected: Then 例外を投げず、`path` にロックファイルが作成されていること

- [ ] **T-09-01-02**: ロックに PID・作成時刻・ランダム ID を記録する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-01-02`
  - Rule: execution R-203 / execution DD-07
  - Scenario: Given ロックが存在しない一時ディレクトリ, When `acquireLock(path)` を呼んでロックファイルを読む
  - Expected: Then 記録の PID が `Deno.pid` と一致し、作成時刻が日時として解釈でき、ランダム ID が空でない文字列であること

- [ ] **T-09-01-03**: ランダム ID は実行ごとに異なる
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-01-03`
  - Rule: execution DD-07 / execution DD-13
  - Scenario: Given ロックが存在しない一時ディレクトリ, When `acquireLock` → `releaseLock` → `acquireLock` の順に 2 回取得する
  - Expected: Then 1 回目と 2 回目のロックに記録されたランダム ID が異なること

#### T-09-02: 自分のロックの解放

- [ ] **T-09-02-01**: 記録のランダム ID が自分のものと一致すればロックを削除する
  - Target: `releaseLock`
  - Test ID: `T-MUT-RS-02-01`
  - Rule: execution R-213 / execution DD-13
  - Scenario: Given `acquireLock` で取得したロック, When その戻り値を `releaseLock` に渡す
  - Expected: Then ロックファイルが存在しないこと

### [異常] Error Cases

#### T-09-03: 既存のロックがある場合の中止

- [ ] **T-09-03-01**: 有効な記録を持つロックが既にあれば取得に失敗する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-03-01`
  - Rule: execution R-202 / REQ-F-017 / AC-019 / DR-09
  - Scenario: Given 別の実行が作成した、PID・作成時刻・ランダム ID を持つロックファイル, When `acquireLock(path)` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-09-03-02**: 取得に失敗しても既存のロックを書き換えも削除もしない
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-03-02`
  - Rule: execution R-202 / execution R-213（取得できなかったロックには触れない）
  - Scenario: Given 別の実行が作成したロックファイル, When `acquireLock(path)` を呼んで失敗させる
  - Expected: Then ロックファイルが存在し、その内容が呼び出し前とバイト単位で同一であること

- [ ] **T-09-03-03**: 中止時に、ロックのパス・記録された PID と作成時刻・削除の案内を標準エラー出力へ出す
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-03-03`
  - Rule: execution R-202 / execution DD-07
  - Scenario: Given PID `4242`・作成時刻 `2026-10-08T00:00:00Z` を記録したロックファイル, When `acquireLock(path)` を呼んで失敗させる
  - Expected: Then 標準エラー出力（`logger` の error 出力）に、ロックのパス、`4242`、`2026-10-08T00:00:00Z`、他の実行が無いことを確かめて削除するよう促す案内がすべて含まれること

#### T-09-04: ランダム ID が一致しないロックの解放

- [ ] **T-09-04-01**: 記録のランダム ID が別の値ならロックを削除しない
  - Target: `releaseLock`
  - Test ID: `T-MUT-RS-04-01`
  - Rule: execution R-213 / execution DD-13
  - Scenario: Given `acquireLock` で取得した後、別の実行が作り直したことを模してランダム ID だけを別の値に書き換えたロックファイル, When 最初の戻り値を `releaseLock` に渡す
  - Expected: Then ロックファイルが存在し、内容が書き換え後のままであること

#### T-09-05: 解放の失敗

- [ ] **T-09-05-01**: ロックの削除に失敗しても例外を投げず、警告だけを出す
  - Target: `releaseLock`
  - Test ID: `T-MUT-RS-05-01`
  - Rule: execution DD-14 / execution R-213
  - Scenario: Given `acquireLock` で取得した後、ロックのパスを削除できない状態（同名の空でないディレクトリへの置き換え）にしたもの, When その戻り値を `releaseLock` に渡す
  - Expected: Then 例外を投げず、標準エラー出力に警告が 1 件出ること

### [エッジケース] Edge Cases

#### T-09-06: 記録の可読性・保持者の生死を問わない中止

- [ ] **T-09-06-01**: 空のロックファイルでも取得に失敗する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-06-01`
  - Rule: execution R-202 / execution DD-07 / Edge execution-23
  - Scenario: Given 内容が空のロックファイル, When `acquireLock(path)` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、ロックファイルが残っていること

- [ ] **T-09-06-02**: JSON として解釈できないロックファイルでも取得に失敗する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-06-02`
  - Rule: execution R-202 / execution DD-07 / Edge execution-23
  - Scenario: Given 内容が `"{broken"` のロックファイル, When `acquireLock(path)` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、ロックファイルが残っていること

- [ ] **T-09-06-03**: 記録された PID のプロセスが存在しなくても取得に失敗する（引き継がない）
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-06-03`
  - Rule: execution R-202 / execution DD-07 / Edge execution-22
  - Scenario: Given 実在しない PID（例: `999999999`）を記録したロックファイル, When `acquireLock(path)` を呼ぶ
  - Expected: Then `ChatlogError` を投げ、ロックファイルの内容が変わっていないこと

- [ ] **T-09-06-04**: 記録を読み取れない場合は、読み取れた範囲（パスと削除の案内）だけを出す
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-06-04`
  - Rule: execution R-202 / execution DD-07
  - Scenario: Given 内容が空のロックファイル, When `acquireLock(path)` を呼んで失敗させる
  - Expected: Then 標準エラー出力にロックのパスと削除の案内が含まれ、処理が記録の解釈失敗で別の例外に変わらないこと

- [ ] **T-09-06-05**: 記録の一部だけ読み取れる場合は、読み取れた PID を出して中止する
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-06-05`
  - Rule: execution R-202 / execution DD-07（読み取れた範囲）/ Edge execution-23
  - Scenario: Given PID `4242` とランダム ID だけを記録し、作成時刻のキーを持たないロックファイル, When `acquireLock(path)` を呼んで失敗させる
  - Expected: Then `ChatlogError` を投げ、標準エラー出力にロックのパス・`4242`・削除の案内が含まれ、作成時刻の欠落で別の例外に変わらないこと

#### T-09-07: 取得失敗時の副作用の不在

- [ ] **T-09-07-01**: 取得に失敗したとき、ロック以外のファイルを作成も削除もしない
  - Target: `acquireLock`
  - Test ID: `T-MUT-RS-07-01`
  - Rule: execution R-201 / REQ-F-017 / AC-019 / Edge execution-21
  - Scenario: Given 既存のロックファイルと、同じディレクトリにある `foo.mutation-001.ts`・`deno.mutation-001.json`, When `acquireLock(path)` を呼んで失敗させる
  - Expected: Then 呼び出しの前後でディレクトリのファイル一覧と各ファイルの内容が同一であること

#### T-09-08: 解放時に記録が壊れている

- [ ] **T-09-08-01**: 解放時にロックの記録を読み取れなければ削除せず、警告だけを出す
  - Target: `releaseLock`
  - Test ID: `T-MUT-RS-08-01`
  - Rule: execution DD-13 / execution DD-14
  - Scenario: Given `acquireLock` で取得した後、内容を `"{broken"` に書き換えたロックファイル, When 最初の戻り値を `releaseLock` に渡す
  - Expected: Then 例外を投げず、ロックファイルが残り、標準エラー出力に警告が出ること

#### T-09-09: 解放時にロックが既に無い

- [ ] **T-09-09-01**: ロックファイルが既に無くても、解放は例外を投げずロックを作り直さない
  - Target: `releaseLock`
  - Test ID: `T-MUT-RS-09-01`
  - Rule: execution DD-14 / execution DD-13 / execution R-213
  - Scenario: Given `acquireLock` で取得した後、ロックファイルを削除したもの, When その戻り値を `releaseLock` に渡す
  - Expected: Then 例外を投げず、ロックのパスにファイルが存在しないこと

---

## T-10: `sweepArtifacts` / `hashSources` / `detectDrift` / `removeArtifacts`（残骸掃除と drift 検査）

> Commit: 12 / 配置ファイル: `scripts/testing/mutation/run-safety.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/run-safety.unit.spec.ts` / Phase: 2 / Test ID prefix: `T-MUT-RS`（グループ番号 10〜19）

命名の判定は Commit 3 の判定関数を再利用する（判定関数自体の網羅は T-01 / T-02 の担当）。ここでは掃除・削除の振る舞いだけを検証する。

### [正常] Normal Cases

#### T-10-01: 命名規則に一致する残骸の削除

- [ ] **T-10-01-01**: 変異体ファイル `foo.mutation-001.ts` を削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-01`
  - Rule: execution R-205 / REQ-F-007 / AC-008
  - Scenario: Given `foo.mutation-001.ts` を含む一時ディレクトリ, When そのディレクトリを渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `foo.mutation-001.ts` が存在しないこと

- [ ] **T-10-01-02**: 一時設定 `deno.mutation-001.json` を削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-02`
  - Rule: execution R-205 / REQ-F-007 / AC-008
  - Scenario: Given `deno.mutation-001.json` を含む一時ディレクトリ, When そのディレクトリを渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `deno.mutation-001.json` が存在しないこと

- [ ] **T-10-01-03**: `.tsx` の変異体ファイルを削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-03`
  - Rule: execution R-205 / execution DD-01 / REQ-C-005 / Edge execution-3
  - Scenario: Given `view.mutation-001.tsx` を含む一時ディレクトリ, When そのディレクトリを渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `view.mutation-001.tsx` が存在しないこと

- [ ] **T-10-01-04**: 番号が 1000 以上の変異体ファイルを削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-04`
  - Rule: execution R-205 / execution DD-01 / Edge execution-4
  - Scenario: Given `foo.mutation-1000.ts` を含む一時ディレクトリ, When そのディレクトリを渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `foo.mutation-1000.ts` が存在しないこと

- [ ] **T-10-01-05**: 渡したディレクトリの下位ディレクトリにある残骸も削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-05`
  - Rule: execution R-205 / REQ-F-007 / Edge execution-15
  - Scenario: Given `sub/deep/foo.mutation-001.ts` を含む一時ディレクトリ, When その一時ディレクトリ（`sub/` の親）を渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `sub/deep/foo.mutation-001.ts` が存在しないこと

- [ ] **T-10-01-06**: 複数のディレクトリを渡すと、それぞれの残骸を削除する
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-10-06`
  - Rule: execution R-205 / REQ-F-007 / Edge execution-15
  - Scenario: Given `a/foo.mutation-001.ts` を含むディレクトリ `a` と `b/bar.mutation-002.ts` を含むディレクトリ `b`, When `[a, b]` を渡して `sweepArtifacts` を呼ぶ
  - Expected: Then `a/foo.mutation-001.ts` と `b/bar.mutation-002.ts` がどちらも存在しないこと

#### T-10-02: ソースの内容ハッシュ

- [ ] **T-10-02-01**: 同じ内容のファイルは何度取っても同じハッシュになる
  - Target: `hashSources`
  - Test ID: `T-MUT-RS-11-01`
  - Rule: execution R-206 / implementation Commit 12（`generateHash` を使わない）
  - Scenario: Given 内容を変えないソースファイル 1 件, When `hashSources` を 2 回呼ぶ
  - Expected: Then 2 回の結果でそのファイルのハッシュが一致すること

- [ ] **T-10-02-02**: ハッシュは内容の SHA-256 全 64 桁である
  - Target: `hashSources`
  - Test ID: `T-MUT-RS-11-02`
  - Rule: execution R-206 / implementation §3.2（`sessionHash(content, 64)`）
  - Scenario: Given 内容 `"export const a = 1;\n"` のソースファイル, When `hashSources` を呼ぶ
  - Expected: Then そのファイルのハッシュが `sessionHash("export const a = 1;\n", 64)` と一致し、長さが 64 であること

#### T-10-03: drift の突合

- [ ] **T-10-03-01**: 内容が変わっていなければ drift は 0 件である
  - Target: `detectDrift`
  - Test ID: `T-MUT-RS-12-01`
  - Rule: execution R-212 / REQ-NF-001
  - Scenario: Given 同じファイル集合・同じ内容から取った 2 つのハッシュ記録, When `detectDrift(before, after)` を呼ぶ
  - Expected: Then 空の一覧を返すこと

- [ ] **T-10-03-02**: 内容が変わったファイルを drift として返す
  - Target: `detectDrift`
  - Test ID: `T-MUT-RS-12-02`
  - Rule: execution R-212 / REQ-F-008 / AC-009 / Edge execution-16
  - Scenario: Given `target.ts` と `other.ts` のハッシュ記録を取った後、`target.ts` の内容だけを書き換えて再取得した記録, When `detectDrift(before, after)` を呼ぶ
  - Expected: Then `target.ts` だけを含む一覧を返すこと

- [ ] **T-10-03-03**: drift の一覧は記録の作成順によらず同じ順序で返る
  - Target: `detectDrift`
  - Test ID: `T-MUT-RS-12-03`
  - Rule: execution R-212 / report-cli R-611 / report-cli §2.2（入力が同じなら出力も同じ）
  - Scenario: Given `a.ts`・`b.ts`・`c.ts` の 3 件が変化した before / after の記録で、after だけを `c.ts`・`b.ts`・`a.ts` の順に作ったもの, When `detectDrift(before, after)` を呼ぶ
  - Expected: Then 返る一覧の順序が、after も `a.ts`・`b.ts`・`c.ts` の順に作った記録で呼んだ場合と一致すること

#### T-10-04: 後始末の削除

- [ ] **T-10-04-01**: 全件削除できれば空の一覧を返す
  - Target: `removeArtifacts`
  - Test ID: `T-MUT-RS-13-01`
  - Rule: execution R-225 / REQ-F-006
  - Scenario: Given 存在する変異体ファイルと一時設定の 2 パス, When `removeArtifacts` を呼ぶ
  - Expected: Then 戻り値が空配列で、2 ファイルとも存在しないこと

- [ ] **T-10-04-02**: 書き出されなかったパスは残骸として返さない
  - Target: `removeArtifacts`
  - Test ID: `T-MUT-RS-13-02`
  - Rule: execution R-226 / execution DD-05 / implementation Commit 12
  - Scenario: Given 一度も書き出していない（存在しない）一時設定のパス 1 件, When `removeArtifacts` を呼ぶ
  - Expected: Then 例外を投げず、空配列を返すこと

### [異常] Error Cases

#### T-10-05: 後始末の削除失敗

- [ ] **T-10-05-01**: 削除できないパスは例外にせず戻り値で返す
  - Target: `removeArtifacts`
  - Test ID: `T-MUT-RS-14-01`
  - Rule: execution R-226 / execution DD-05 / Edge execution-13
  - Scenario: Given 削除できないパス 1 件（同名の空でないディレクトリ）, When `removeArtifacts` を呼ぶ
  - Expected: Then 例外を投げず、そのパスだけを含む配列を返すこと

- [ ] **T-10-05-02**: 一部が削除できなくても、残りのパスは削除する
  - Target: `removeArtifacts`
  - Test ID: `T-MUT-RS-14-02`
  - Rule: execution R-225 / execution R-226 / execution DD-05
  - Scenario: Given 先頭が削除できないパス、2 件目が通常の一時設定ファイルの 2 パス, When `removeArtifacts` を呼ぶ
  - Expected: Then 2 件目のファイルが存在せず、戻り値が先頭のパスだけであること

#### T-10-06: 起動時の掃除の削除失敗

- [ ] **T-10-06-01**: 命名規則に一致するが削除できないファイルは、例外にせず戻り値で返す
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-15-01`
  - Rule: execution R-205 / execution DD-14（中止の判断は main。implementation Commit 12）
  - Scenario: Given 名前が `foo.mutation-001.ts` の空でないディレクトリを含む一時ディレクトリ, When `sweepArtifacts` を呼ぶ
  - Expected: Then 例外を投げず、そのパスを含む配列を返すこと

### [エッジケース] Edge Cases

#### T-10-07: 命名規則に一致しないファイルの保持

- [ ] **T-10-07-01**: 似た名前の `foo.mutation.ts` は削除しない
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-16-01`
  - Rule: execution R-205 / REQ-F-007 / AC-008 / Edge execution-14
  - Scenario: Given `foo.mutation.ts` を含む一時ディレクトリ, When `sweepArtifacts` を呼ぶ
  - Expected: Then `foo.mutation.ts` が内容を保って存在すること

- [ ] **T-10-07-02**: 元のソース `foo.ts` は削除しない
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-16-02`
  - Rule: execution R-205 / AC-008
  - Scenario: Given `foo.ts` を含む一時ディレクトリ, When `sweepArtifacts` を呼ぶ
  - Expected: Then `foo.ts` が内容を保って存在すること

- [ ] **T-10-07-03**: 元の設定 `deno.jsonc` は削除しない
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-16-03`
  - Rule: execution R-205 / REQ-NF-001
  - Scenario: Given `deno.jsonc` を含む一時ディレクトリ, When `sweepArtifacts` を呼ぶ
  - Expected: Then `deno.jsonc` が内容を保って存在すること

#### T-10-08: 削除されたソース

- [ ] **T-10-08-01**: 実行後に存在しなくなったファイルも drift として返す
  - Target: `detectDrift`
  - Test ID: `T-MUT-RS-17-01`
  - Rule: execution R-212 / REQ-F-008
  - Scenario: Given `target.ts` を含む記録を取った後、`target.ts` を削除して再取得した記録, When `detectDrift(before, after)` を呼ぶ
  - Expected: Then `target.ts` を含む一覧を返すこと

#### T-10-09: 改行コードだけの変化

- [ ] **T-10-09-01**: 改行コードだけが変わった場合も drift として検出する
  - Target: `hashSources`
  - Test ID: `T-MUT-RS-18-01`
  - Rule: execution R-206 / execution R-212 / REQ-NF-004
  - Scenario: Given 内容 `"a\nb\n"` で記録を取った後、同じファイルを `"a\r\nb\r\n"` に書き換えたもの, When `hashSources` で再取得して `detectDrift` に渡す
  - Expected: Then そのファイルが drift として返ること

#### T-10-10: 掃除対象が無い

- [ ] **T-10-10-01**: 命名規則に一致するファイルが無ければ何も削除せず空の一覧を返す
  - Target: `sweepArtifacts`
  - Test ID: `T-MUT-RS-19-01`
  - Rule: execution R-205
  - Scenario: Given 空の一時ディレクトリ, When `sweepArtifacts` を呼ぶ
  - Expected: Then 例外を投げず、空配列を返すこと

---

## T-11: `runBaseline`（変異前のベースライン実行）

> Commit: 13 / 配置ファイル: `scripts/testing/mutation/baseline.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/baseline.unit.spec.ts` / Phase: 2 / Test ID prefix: `T-MUT-BL`（グループ番号 01〜08）

`runner` には結果を固定した `TestRunnerProvider` のスタブを注入する。要約行の解釈は Commit 5 の `parseSummary` を再利用する（解釈そのものの網羅は T-03 の担当）。

### [正常] Normal Cases

#### T-11-01: ベースラインの成功

- [ ] **T-11-01-01**: 終了コード 0 で passed が 1 件以上なら `ok` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-01-01`
  - Rule: execution R-209 / REQ-F-016 / DR-08
  - Scenario: Given `exited { code: 0, stdout: "ok | 3 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'ok' }` を返すこと

#### T-11-02: runner への受け渡し

- [ ] **T-11-02-01**: 引数を変えずに runner へ渡す（元の設定のまま実行する）
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-02-01`
  - Rule: execution R-207 / execution DD-10
  - Scenario: Given 引数 `['test', 'a.unit.spec.ts']` と呼び出し内容を記録する runner, When `runBaseline(runner, args, opts)` を呼ぶ
  - Expected: Then runner が受け取った引数が入力と一致し、一時設定（`--config deno.mutation-*`）を含まないこと

- [ ] **T-11-02-02**: 制限時間を変えずに runner へ渡す
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-02-02`
  - Rule: execution DD-10 / REQ-NF-003
  - Scenario: Given `timeoutMs: 120000` と呼び出し内容を記録する runner, When `runBaseline` を呼ぶ
  - Expected: Then runner が受け取った `timeoutMs` が 120000 であること

- [ ] **T-11-02-03**: runner を 1 回だけ呼ぶ
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-02-03`
  - Rule: execution R-207
  - Scenario: Given 成功を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then runner の呼び出し回数が 1 であること

### [異常] Error Cases

#### T-11-03: ベースラインの失敗

- [ ] **T-11-03-01**: 元ソースでテストが失敗すれば `failed` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-03-01`
  - Rule: execution R-208 / REQ-F-016 / AC-017 / Edge execution-18
  - Scenario: Given `exited { code: 1, stdout: "FAILED | 2 passed | 1 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'failed' }` を返すこと

- [ ] **T-11-03-02**: 制限時間超過は `failed` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-03-02`
  - Rule: execution R-208 / execution DD-10 / Edge execution-20
  - Scenario: Given `{ kind: 'timeout' }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'failed' }` を返すこと

- [ ] **T-11-03-03**: 起動失敗は `failed` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-03-03`
  - Rule: execution R-208 / execution DD-10 / Edge execution-20
  - Scenario: Given `{ kind: 'error', message: "deno not found" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'failed' }` を返すこと

- [ ] **T-11-03-04**: 終了コード 0 でも passed が 0 件なら `failed` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-03-04`
  - Rule: execution R-208 / execution DD-06 / AC-018
  - Scenario: Given `exited { code: 0, stdout: "ok | 0 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'failed' }` を返すこと

- [ ] **T-11-03-05**: 終了コード 0 でも要約行が無ければ `failed` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-03-05`
  - Rule: execution R-208 / execution DD-06 / Edge execution-19
  - Scenario: Given `exited { code: 0, stdout: "", stderr: "" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'failed' }` を返すこと

#### T-11-04: 失敗理由の記録

- [ ] **T-11-04-01**: 起動失敗の `failed` は、起動失敗のメッセージを理由に含む
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-04-01`
  - Rule: execution R-208 / REQ-F-013 (d)
  - Scenario: Given `{ kind: 'error', message: "deno not found" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `failed` の `reason` に `"deno not found"` が含まれること

- [ ] **T-11-04-02**: 制限時間超過の `failed` は理由を持つ
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-04-02`
  - Rule: execution R-208 / execution DD-10 / implementation Commit 13（`failed { reason }`）
  - Scenario: Given `{ kind: 'timeout' }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `failed` の `reason` が空でない文字列であること

- [ ] **T-11-04-03**: passed 0 件の `failed` は理由を持つ
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-04-03`
  - Rule: execution R-208 / execution DD-06 / implementation Commit 13（`failed { reason }`）
  - Scenario: Given `exited { code: 0, stdout: "ok | 0 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `failed` の `reason` が空でない文字列であること

- [ ] **T-11-04-04**: 要約行が無い `failed` は理由を持つ
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-04-04`
  - Rule: execution R-208 / execution DD-06 / implementation Commit 13（`failed { reason }`）
  - Scenario: Given `exited { code: 0, stdout: "", stderr: "" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `failed` の `reason` が空でない文字列であること

#### T-11-08: runner が例外を投げる

- [ ] **T-11-08-01**: runner の例外は投げ直さず `failed` とする
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-08-01`
  - Rule: execution R-208（起動失敗）/ execution DD-10
  - Scenario: Given 呼ばれると `Error("spawn failed")` を投げる runner, When `runBaseline` を呼ぶ
  - Expected: Then `runBaseline` が reject せず、`{ kind: 'failed' }` を返すこと

### [エッジケース] Edge Cases

#### T-11-05: ベースライン実行中の中断

- [ ] **T-11-05-01**: 実行中に `signal` が中止されたら `failed` ではなく `interrupted` を返す
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-05-01`
  - Rule: execution R-227 / implementation Commit 13
  - Scenario: Given 呼び出し中に `AbortController` を中止してから `exited { code: 1, stdout: "" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'interrupted' }` を返すこと

- [ ] **T-11-05-02**: `signal` を runner へそのまま渡す
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-05-02`
  - Rule: execution R-227 / implementation Commit 13
  - Scenario: Given `AbortController` の `signal` と呼び出し内容を記録する runner, When `runBaseline` を呼ぶ
  - Expected: Then runner が受け取った `signal` が渡したものと同一であること

- [ ] **T-11-05-03**: 中止された後に runner が成功相当の結果を返しても `interrupted` を返す
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-05-03`
  - Rule: execution R-227 / implementation Commit 13
  - Scenario: Given 呼び出し中に `AbortController` を中止してから `exited { code: 0, stdout: "ok | 3 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `ok` ではなく `{ kind: 'interrupted' }` を返すこと

- [ ] **T-11-05-04**: 呼び出し前に中止済みの `signal` なら `interrupted` を返す
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-05-04`
  - Rule: execution R-227 / execution R-228（中断は 130 の経路へ進む）
  - Scenario: Given 呼び出し前に中止済みの `signal` と、成功に当たる結果を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `ok` でも `failed` でもなく `{ kind: 'interrupted' }` を返すこと（runner の呼び出し有無は問わない）

#### T-11-06: ANSI 付きの要約行

- [ ] **T-11-06-01**: ANSI エスケープで装飾された要約行でも passed 件数を読み取る
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-06-01`
  - Rule: execution DD-06 / Edge execution-6
  - Scenario: Given `exited { code: 0, stdout: "\x1b[32mok\x1b[0m | 3 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'ok' }` を返すこと

#### T-11-07: passed 件数の下限

- [ ] **T-11-07-01**: passed がちょうど 1 件なら `ok` になる
  - Target: `runBaseline`
  - Test ID: `T-MUT-BL-07-01`
  - Rule: execution R-209 / execution DD-06
  - Scenario: Given `exited { code: 0, stdout: "ok | 1 passed | 0 failed" }` を返す runner, When `runBaseline` を呼ぶ
  - Expected: Then `{ kind: 'ok' }` を返すこと

---

## T-12: `runMutants`（逐次実行と後始末の保証）

> Commit: 14 / 配置ファイル: `scripts/testing/mutation/run-mutants.ts` / テストファイル: `scripts/testing/mutation/__tests__/unit/run-mutants.unit.spec.ts` / Phase: 2 / Test ID prefix: `T-MUT-RM`（グループ番号 01〜17）

`testRunner` には結果を固定した `TestRunnerProvider` のスタブを注入し、ソースと設定は一時ディレクトリに置く。判定規則（R-220〜R-224）の網羅は T-03（`classifyOutcome`）、ステージングの網羅は T-02（`applyMutant` ほか）の担当であり、ここでは結線と後始末だけを検証する。

### [正常] Normal Cases

#### T-12-01: runner の結果から判定を記録する

- [ ] **T-12-01-01**: テストの失敗を示す終了は killed として記録する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-01-01`
  - Rule: execution R-222 / REQ-F-004 / AC-004
  - Scenario: Given 変異体 1 件と、`exited { code: 1, stdout: "FAILED | 0 passed | 1 failed" }` を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `results` が 1 件で、その判定が `killed` であること

- [ ] **T-12-01-02**: runner の `timeout` は timeout として記録する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-01-02`
  - Rule: execution R-223 / REQ-F-004
  - Scenario: Given 変異体 1 件と、`{ kind: 'timeout' }` を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `results` の判定が `timeout` であること

- [ ] **T-12-01-03**: 型検査の失敗を示す終了は compile-error として記録する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-01-03`
  - Rule: execution R-221 / execution DD-03 / REQ-F-004
  - Scenario: Given 変異体 1 件と、`exited { code: 1, stdout: "", stderr: "error: Type checking failed." }` を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `results` が 1 件で、その判定が `compile-error` であること

#### T-12-02: 逐次実行

- [ ] **T-12-02-01**: 前の変異体の後始末が終わってから次の変異体のテストを起動する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-02-01`
  - Rule: execution R-210 / DR-05 / REQ-NF-005
  - Scenario: Given 同じファイルの変異体 3 件と、呼ばれるたびに直前の番号の変異体ファイルの有無を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then 2 回目・3 回目の呼び出し時点で、直前の番号の変異体ファイルと一時設定がどちらも存在しないこと

- [ ] **T-12-02-02**: 判定は入力の変異体の順に並ぶ
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-02-02`
  - Rule: execution R-210
  - Scenario: Given 変異体 3 件と、順に survived・killed・timeout に当たる結果を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `results` の判定が `survived`・`killed`・`timeout` の順で、各 `mutant` が入力と同じ順であること

#### T-12-03: ステージングと起動の結線

- [ ] **T-12-03-01**: テスト起動時点で、変異を適用した別ファイルが元ファイルの隣にある
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-01`
  - Rule: execution R-215 / REQ-F-003 / AC-003
  - Scenario: Given `target.ts` の `n > 0` を `n >= 0` にする変異体 1 件と、呼ばれた時点のファイルを読む runner, When `runMutants` を呼ぶ
  - Expected: Then 呼び出し時点で `target.mutation-001.ts` が `target.ts` と同じディレクトリにあり、`n >= 0` を含むこと

- [ ] **T-12-03-02**: 一時設定を書き出し、その設定を `--config` で指定してテストを起動する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-02`
  - Rule: execution R-216 / execution R-217 / execution DD-02 / REQ-C-002
  - Scenario: Given 変異体 1 件、`configPath` に置いた元の設定、呼ばれた時点の引数と設定ファイルを記録する runner, When `runMutants` を呼ぶ
  - Expected: Then runner の引数に `--config` と `deno.mutation-001.json` のパスが含まれ、そのファイルの `imports` に元ファイルの file URL から変異体の file URL への対応があること

- [ ] **T-12-03-03**: テスト実行中も元ファイルの内容は変わらない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-03`
  - Rule: execution R-215 / REQ-F-003 / REQ-NF-001 / AC-003
  - Scenario: Given 変異体 1 件と、呼ばれた時点で元ファイル `target.ts` を読む runner, When `runMutants` を呼ぶ
  - Expected: Then 呼び出し時点と実行後の `target.ts` の内容が、実行前とバイト単位で同一であること

- [ ] **T-12-03-04**: 制限時間を runner へ渡す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-04`
  - Rule: execution R-217 / REQ-NF-003
  - Scenario: Given `timeoutMs: 30000` と呼び出し内容を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then runner が受け取った `timeoutMs` が 30000 であること

- [ ] **T-12-03-05**: `signal` を runner へそのまま渡す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-05`
  - Rule: execution R-227 / implementation Commit 14
  - Scenario: Given 変異体 1 件、`AbortController` の `signal`、呼び出し内容を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then runner が受け取った `signal` が渡したものと同一であること

- [ ] **T-12-03-06**: `testArgs` を変えずに、同じ順序で runner へ渡す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-06`
  - Rule: execution R-217 / REQ-NF-002
  - Scenario: Given 変異体 1 件、`testArgs: ['test', '--allow-read', 'a.unit.spec.ts', 'b.unit.spec.ts']`、呼び出し内容を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then runner の引数に `testArgs` の各要素が変更されずに含まれ、その相対順序が入力と同じであること

- [ ] **T-12-03-07**: runner の引数に `--import-map` を含めない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-03-07`
  - Rule: execution DD-02 / DR-01 / REQ-C-002
  - Scenario: Given 変異体 1 件と呼び出し内容を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then runner の引数のどの要素も `--import-map` で始まらないこと

#### T-12-04: 正常終了時の後始末

- [ ] **T-12-04-01**: 変異体の処理が終わると変異体ファイルと一時設定を削除する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-04-01`
  - Rule: execution R-225 / REQ-F-006
  - Scenario: Given 変異体 1 件と、survived に当たる結果を返す runner, When `runMutants` を呼ぶ
  - Expected: Then 実行後に `target.mutation-001.ts` と `deno.mutation-001.json` がどちらも存在しないこと

- [ ] **T-12-04-02**: 削除がすべて成功すれば `leftovers` は空で、`interrupted` は false である
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-04-02`
  - Rule: execution R-225 / execution DD-05
  - Scenario: Given 変異体 2 件と、survived に当たる結果を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `leftovers` が空配列で、`interrupted` が `false` であること

### [異常] Error Cases

#### T-12-05: 置換前の字句が指定位置に無い

- [ ] **T-12-05-01**: 位置が一致しない変異体は error とし、テストを起動しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-05-01`
  - Rule: execution R-214 / execution DD-09 / Edge execution-1
  - Scenario: Given `before` が `">"` なのに指定の行・桁が `"<"` を指す変異体 1 件と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then 判定が `error` で、runner の呼び出し回数が 0 で、変異体ファイルと一時設定が残っていないこと

- [ ] **T-12-05-02**: 位置不一致で書き出さなかった変異体は `leftovers` に現れない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-05-02`
  - Rule: execution R-226 / execution DD-05 / implementation Commit 12 / implementation Commit 14
  - Scenario: Given `before` が指定位置の字句と一致しない変異体 1 件と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then `leftovers` が空配列であること

#### T-12-06: 変異体単位の失敗の後も続行する

- [ ] **T-12-06-01**: 2 件目の起動失敗の後も 3 件目を実行する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-06-01`
  - Rule: execution R-211 / REQ-F-005 / AC-006 / Edge execution-10
  - Scenario: Given 変異体 3 件と、2 回目だけ `{ kind: 'error' }`、他は survived に当たる結果を返す runner, When `runMutants` を呼ぶ
  - Expected: Then runner が 3 回呼ばれ、判定が `survived`・`error`・`survived` の順であること

- [ ] **T-12-06-02**: 2 件目の timeout の後も 3 件目を実行する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-06-02`
  - Rule: execution R-211 / REQ-F-005
  - Scenario: Given 変異体 3 件と、2 回目だけ `{ kind: 'timeout' }` を返す runner, When `runMutants` を呼ぶ
  - Expected: Then runner が 3 回呼ばれ、2 件目の判定が `timeout` であること

#### T-12-07: runner が例外を投げる

- [ ] **T-12-07-01**: runner が例外を投げても変異体ファイルと一時設定を削除する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-07-01`
  - Rule: execution R-225 / REQ-F-006 / AC-007 / Edge execution-12
  - Scenario: Given 変異体 1 件と、例外を投げる runner, When `runMutants` を呼ぶ
  - Expected: Then 実行後に `target.mutation-001.ts` と `deno.mutation-001.json` がどちらも存在しないこと

- [ ] **T-12-07-02**: runner の例外は当該変異体の error として記録し、次の変異体へ進む
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-07-02`
  - Rule: execution R-219 / execution R-211 / Edge execution-12
  - Scenario: Given 変異体 2 件と、1 回目だけ例外を投げ 2 回目は survived に当たる結果を返す runner, When `runMutants` を呼ぶ
  - Expected: Then `runMutants` 自体は例外を投げず、判定が `error`・`survived` の順であること

#### T-12-08: 変異体ファイルの書き出し失敗

- [ ] **T-12-08-01**: 変異体ファイルを書き出せなければ error とし、テストを起動しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-08-01`
  - Rule: execution R-219 / REQ-F-004 / Edge execution-10
  - Scenario: Given 変異体の書き出し先 `target.mutation-001.ts` に同名の空でないディレクトリがある状態と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then 判定が `error` で、runner の呼び出し回数が 0 であること

#### T-12-09: 後始末の削除失敗

- [ ] **T-12-09-01**: 削除できなかったファイルを `leftovers` に集め、実行は続ける
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-09-01`
  - Rule: execution R-226 / execution DD-05 / REQ-F-006 / Edge execution-13
  - Scenario: Given 変異体 2 件と、1 回目の呼び出し中に `target.mutation-001.ts` を同名の空でないディレクトリへ置き換える runner, When `runMutants` を呼ぶ
  - Expected: Then `leftovers` に `target.mutation-001.ts` のパスが含まれ、runner が 2 回呼ばれていること

- [ ] **T-12-09-02**: 削除できなかったファイルがあれば警告を出す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-09-02`
  - Rule: execution R-226 / execution DD-05
  - Scenario: Given 変異体 1 件と、呼び出し中に `target.mutation-001.ts` を同名の空でないディレクトリへ置き換える runner, When `runMutants` を呼ぶ
  - Expected: Then 標準エラー出力に、そのパスを含む警告が出ること

#### T-12-14: 前回の残骸と同名の通常ファイルがある

- [ ] **T-12-14-01**: 書き出し先に同名の変異体ファイルが既にあれば error とし、テストを起動しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-14-01`
  - Rule: execution R-219 / implementation §3.4（execution OQ #3: 衝突は error 扱い）
  - Scenario: Given `target.ts` の隣に通常ファイル `target.mutation-001.ts`（内容 `"stale"`）が既にある状態と、変異体 1 件と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then 判定が `error` で、runner の呼び出し回数が 0 であること

- [ ] **T-12-14-02**: 書き出し先に同名の一時設定が既にあれば error とし、テストを起動しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-14-02`
  - Rule: execution R-219 / implementation §3.4（execution OQ #3: 衝突は error 扱い）
  - Scenario: Given 元の設定の隣に通常ファイル `deno.mutation-001.json`（内容 `"{}"`）が既にある状態と、変異体 1 件と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then 判定が `error` で、runner の呼び出し回数が 0 であること

#### T-12-15: 一時設定の書き出し失敗

- [ ] **T-12-15-01**: 一時設定を書き出せなければ error とし、テストを起動せず変異体ファイルを削除する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-15-01`
  - Rule: execution R-219 / execution R-225 / REQ-F-006
  - Scenario: Given 一時設定の書き出し先 `deno.mutation-001.json` に同名の空でないディレクトリがある状態と、変異体 1 件と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then 判定が `error` で、runner の呼び出し回数が 0 で、実行後に `target.mutation-001.ts` が存在しないこと

### [エッジケース] Edge Cases

#### T-12-10: 実行中の中断

- [ ] **T-12-10-01**: 実行中の変異体の判定は記録せず、`interrupted` を true にする
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-10-01`
  - Rule: execution R-227 / Edge execution-24
  - Scenario: Given 変異体 3 件と、2 回目の呼び出し中に `AbortController` を中止する runner, When `runMutants` を呼ぶ
  - Expected: Then `interrupted` が `true` で、`results` が 1 件目の判定だけであること

- [ ] **T-12-10-02**: 中断後は新しい変異体を開始しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-10-02`
  - Rule: execution R-227 / Edge execution-24
  - Scenario: Given 変異体 3 件と、2 回目の呼び出し中に `AbortController` を中止する runner, When `runMutants` を呼ぶ
  - Expected: Then runner の呼び出し回数が 2 であること

- [ ] **T-12-10-03**: 中断された変異体の変異体ファイルと一時設定も削除する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-10-03`
  - Rule: execution R-227 / execution R-225 / execution DD-08
  - Scenario: Given 変異体 3 件と、2 回目の呼び出し中に `AbortController` を中止する runner, When `runMutants` を呼ぶ
  - Expected: Then 実行後に `target.mutation-002.ts` と `deno.mutation-002.json` がどちらも存在しないこと

- [ ] **T-12-10-04**: 開始前に中止済みの `signal` なら 1 件もテストを起動しない
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-10-04`
  - Rule: execution R-227
  - Scenario: Given 変異体 2 件と、呼び出し前に中止済みの `signal`, When `runMutants` を呼ぶ
  - Expected: Then runner の呼び出し回数が 0、`results` が空配列、`interrupted` が `true` であること

#### T-12-11: 全件が error / timeout

- [ ] **T-12-11-01**: 全変異体が timeout でも全件の判定を記録して完了する
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-11-01`
  - Rule: execution R-211 / REQ-F-005 / Edge execution-11
  - Scenario: Given 変異体 2 件と、常に `{ kind: 'timeout' }` を返す runner, When `runMutants` を呼ぶ
  - Expected: Then 例外を投げず、`results` が `timeout` 2 件で、`interrupted` が `false` であること

#### T-12-12: 変異体 0 件

- [ ] **T-12-12-01**: 変異体が 0 件なら runner を呼ばずに空の結果を返す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-12-01`
  - Rule: execution R-210 / REQ-F-018
  - Scenario: Given 空の変異体の列と呼び出し回数を数える runner, When `runMutants` を呼ぶ
  - Expected: Then runner の呼び出し回数が 0 で、`{ results: [], leftovers: [], interrupted: false }` を返すこと

#### T-12-13: 変異体の番号付け

- [ ] **T-12-13-01**: 2 件目の変異体は番号 002 の名前で書き出す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-13-01`
  - Rule: execution R-215 / execution DD-01
  - Scenario: Given 同じファイルの変異体 2 件と、呼ばれた時点のファイル一覧を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then 2 回目の呼び出し時点で `target.mutation-002.ts` と `deno.mutation-002.json` が存在すること

- [ ] **T-12-13-02**: 複数のソースファイルにまたがる変異体では、各一時設定が自分の元ファイルだけを差し替える
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-13-02`
  - Rule: execution R-216 / execution DD-02 / execution DD-01
  - Scenario: Given `a.ts` の変異体 1 件と `b.ts` の変異体 1 件をこの順に並べた列と、呼ばれた時点の一時設定を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then 1 回目の一時設定の `imports` に足された対応が `a.ts` → `a.mutation-001.ts` の 1 件だけで、2 回目は `b.ts` → `b.mutation-002.ts` の 1 件だけであること

- [ ] **T-12-13-03**: 複数のソースファイルにまたがっても番号は列全体で一意に振る
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-13-03`
  - Rule: execution DD-01 / execution R-215 / execution R-216
  - Scenario: Given `a.ts` の変異体 1 件と `b.ts` の変異体 1 件をこの順に並べた列と、呼ばれた時点の引数を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then 1 回目と 2 回目の `--config` が `deno.mutation-001.json` と `deno.mutation-002.json` で互いに異なること

#### T-12-16: 書き出しで改行コードを保つ

- [ ] **T-12-16-01**: CRLF のソースから書き出した変異体ファイルは CRLF をバイト単位で保つ
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-16-01`
  - Rule: execution R-215 / REQ-NF-004 / Edge execution-2 / implementation §3.2（`writeTextFile` を使わない）
  - Scenario: Given 内容 `"export const f = (n: number) => n > 0;\r\nexport const g = 1;\r\n"` の `target.ts` と `>` を `>=` にする変異体 1 件、呼ばれた時点の変異体ファイルのバイト列を記録する runner, When `runMutants` を呼ぶ
  - Expected: Then 記録したバイト列が `"export const f = (n: number) => n >= 0;\r\nexport const g = 1;\r\n"` の UTF-8 と完全一致すること

#### T-12-17: JSONC の元の設定

- [ ] **T-12-17-01**: コメントと末尾カンマを含む `deno.jsonc` を読み、全キーを保った一時設定を書き出す
  - Target: `runMutants`
  - Test ID: `T-MUT-RM-17-01`
  - Rule: execution R-216 / execution DD-02 / REQ-C-001（`@std/jsonc`）/ implementation Commit 4
  - Scenario: Given `configPath` に置いた `{ // 設定\n "imports": { "@std/assert": "jsr:@std/assert@^1", },\n "tasks": { "test": "deno test" },\n}` の `deno.jsonc`、変異体 1 件、呼ばれた時点の一時設定を読む runner, When `runMutants` を呼ぶ
  - Expected: Then 一時設定が JSON として解釈でき、`tasks.test` と `imports["@std/assert"]` を元の値のまま持ち、`imports` に元ファイルから変異体への対応が足されていること

---

## T-13: `parseMutateArgs`

> Commit: 15 / 配置ファイル: `scripts/testing/mutate-tester.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/mutate-tester.unit.spec.ts` / Phase: 3 /
> Test ID prefix: `T-MUT-MT`（グループ番号 01〜09）
> 戻り値は `{ module, strict, timeoutSec }`。引数エラーは `ChatlogError` を throw する。`ChatlogError` は `detail` を property として持たないため、理由・許可値の検証は `error.message` に対して行う。
> オプションの位置・`--timeout=30` 形式・重複指定・余分な位置引数 (report-cli OQ #5) は `parseOptions` の挙動に従うため、本 Test Target ではタスク化しない。

### [正常] Normal Cases

#### T-13-01: 許可されたモジュール名の受理

- [ ] **T-13-01-01**: `libs` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-01`
  - Rule: report-cli R-604 / report-cli DD-01 / index DD-06 / REQ-F-012
  - Scenario: Given argv が `['libs']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then 例外を投げず、`module` が `'libs'` であること

- [ ] **T-13-01-02**: `classify` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-02`
  - Rule: report-cli R-604 / report-cli DD-01
  - Scenario: Given argv が `['classify']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `module` が `'classify'` であること

- [ ] **T-13-01-03**: `export` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-03`
  - Rule: report-cli R-604 / report-cli DD-01
  - Scenario: Given argv が `['export']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `module` が `'export'` であること

- [ ] **T-13-01-04**: `filter` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-04`
  - Rule: report-cli R-604 / report-cli DD-01
  - Scenario: Given argv が `['filter']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `module` が `'filter'` であること

- [ ] **T-13-01-05**: `normalize` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-05`
  - Rule: report-cli R-604 / report-cli DD-01
  - Scenario: Given argv が `['normalize']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `module` が `'normalize'` であること

- [ ] **T-13-01-06**: `set` を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-01-06`
  - Rule: report-cli R-604 / report-cli DD-01
  - Scenario: Given argv が `['set']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `module` が `'set'` であること

#### T-13-02: `--strict` の確定

- [ ] **T-13-02-01**: `--strict` を指定すると `strict` が true になる
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-02-01`
  - Rule: report-cli R-604 / DR-03
  - Scenario: Given argv が `['libs', '--strict']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `strict` が `true` であること

- [ ] **T-13-02-02**: `--strict` と `--timeout` を同時に指定すると両方を確定する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-02-02`
  - Rule: report-cli R-604
  - Scenario: Given argv が `['libs', '--strict', '--timeout', '30']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `strict` が `true` で、`timeoutSec` が `30` であること

#### T-13-03: `--timeout` の正の整数の受理

- [ ] **T-13-03-01**: `--timeout 30` を秒数 30 として受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-03-01`
  - Rule: report-cli R-604 / report-cli DD-03 / REQ-NF-003
  - Scenario: Given argv が `['libs', '--timeout', '30']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `timeoutSec` が `30` であること

### [異常] Error Cases

#### T-13-04: モジュール名の欠落

- [ ] **T-13-04-01**: 引数が空なら引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-04-01`
  - Rule: report-cli R-601 / Edge report-cli-1 / REQ-F-012
  - Scenario: Given argv が `[]` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-04-02**: フラグだけでモジュール名が無ければ引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-04-02`
  - Rule: report-cli R-601
  - Scenario: Given argv が `['--strict']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること (`--strict` をモジュール名と誤認しない)

- [ ] **T-13-04-03**: モジュール名の欠落のエラーは許可値の一覧を含む
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-04-03`
  - Rule: report-cli R-601 / report-cli 4.1（引数エラーの理由と許可値の一覧） / Edge report-cli-1
  - Scenario: Given argv が `[]` である, When `parseMutateArgs` を呼んで投げられた `ChatlogError` を捕捉する
  - Expected: Then `error.message` に `libs`・`classify`・`export`・`filter`・`normalize`・`set` の 6 件がすべて含まれること

#### T-13-05: 許可値以外のモジュール名

- [ ] **T-13-05-01**: 存在しないモジュール名は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-01`
  - Rule: report-cli R-602 / Edge report-cli-2 / AC-014
  - Scenario: Given argv が `['unknown']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-05-02**: `all` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-02`
  - Rule: report-cli R-602 / report-cli DD-01 / Edge report-cli-3
  - Scenario: Given argv が `['all']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-05-03**: `classes` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-03`
  - Rule: report-cli R-602 / report-cli DD-01 / Edge report-cli-3
  - Scenario: Given argv が `['classes']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-05-04**: `scripts` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-04`
  - Rule: report-cli R-602 / report-cli DD-01 (v1.1.0)
  - Scenario: Given argv が `['scripts']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること (`aplys-tester` では有効な短縮名でも変異対象にしない)

- [ ] **T-13-05-05**: スキルのディレクトリ名は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-05`
  - Rule: report-cli R-602 / Edge report-cli-4
  - Scenario: Given argv が `['normalize-chatlogs']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-05-06**: モジュール名のエラーは許可値の一覧を含む
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-06`
  - Rule: report-cli 4.1 (引数エラーの理由と許可値の一覧)
  - Scenario: Given argv が `['unknown']` である, When `parseMutateArgs` を呼んで投げられた `ChatlogError` を捕捉する
  - Expected: Then `error.message` に `libs`・`classify`・`export`・`filter`・`normalize`・`set` の 6 件がすべて含まれること

- [ ] **T-13-05-07**: 共通ライブラリのディレクトリ名 `_cle-libs` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-05-07`
  - Rule: report-cli R-602 / report-cli DD-01 / Edge report-cli-4
  - Scenario: Given argv が `['_cle-libs']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること（`libs` の別名として受理しないこと）

#### T-13-06: `--timeout` の不正値

- [ ] **T-13-06-01**: `--timeout 0` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-01`
  - Rule: report-cli R-603 / report-cli DD-03 / Edge report-cli-5 / AC-024
  - Scenario: Given argv が `['libs', '--timeout', '0']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-06-02**: 負数は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-02`
  - Rule: report-cli R-603 / Edge report-cli-5
  - Scenario: Given argv が `['libs', '--timeout', '-5']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-06-03**: 小数は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-03`
  - Rule: report-cli R-603 / Edge report-cli-5
  - Scenario: Given argv が `['libs', '--timeout', '1.5']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること (切り捨てて 1 として受理しない)

- [ ] **T-13-06-04**: 数字以外は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-04`
  - Rule: report-cli R-603 / Edge report-cli-5
  - Scenario: Given argv が `['libs', '--timeout', 'abc']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-06-05**: 数字の後ろに文字が続く値は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-05`
  - Rule: report-cli R-603 (数字以外を含む)
  - Scenario: Given argv が `['libs', '--timeout', '30s']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること (`parseInt` の前方一致で 30 として受理しない)

- [ ] **T-13-06-06**: 値の無い `--timeout` は引数エラー
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-06`
  - Rule: report-cli R-603 / Edge report-cli-6
  - Scenario: Given argv が `['libs', '--timeout']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `ChatlogError` を投げること

- [ ] **T-13-06-07**: `--timeout` のエラーは不正な引数名を含む
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-06-07`
  - Rule: report-cli 4.1 (どの引数がなぜ不正か)
  - Scenario: Given argv が `['libs', '--timeout', '0']` である, When `parseMutateArgs` を呼んで投げられた `ChatlogError` を捕捉する
  - Expected: Then `error.message` に `--timeout` が含まれること

### [エッジケース] Edge Cases

#### T-13-07: 省略時の既定値

- [ ] **T-13-07-01**: `--timeout` 省略時は 120 秒
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-07-01`
  - Rule: report-cli R-604 / report-cli DD-03 / Edge report-cli-7 / REQ-NF-003
  - Scenario: Given argv が `['libs']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `timeoutSec` が `120` であること

- [ ] **T-13-07-02**: `--strict` 省略時は false
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-07-02`
  - Rule: report-cli R-604 / DR-03
  - Scenario: Given argv が `['libs']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `strict` が `false` であること

- [ ] **T-13-07-03**: 最小の正の整数 1 を受理する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-07-03`
  - Rule: report-cli R-603 / report-cli DD-03 (境界値 min)
  - Scenario: Given argv が `['libs', '--timeout', '1']` である, When `parseMutateArgs` を呼ぶ
  - Expected: Then `timeoutSec` が `1` であること (0 との境界)

#### T-13-08: 規則の評価順

- [ ] **T-13-08-01**: モジュール名の欠落は `--timeout` の不正より先に判定する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-08-01`
  - Rule: report-cli 4.1 (Step 順の評価、R-601 → R-603)
  - Scenario: Given argv が `['--timeout', '0']` である, When `parseMutateArgs` を呼んで投げられた `ChatlogError` を捕捉する
  - Expected: Then `error.message` がモジュール名の欠落を理由とし、`--timeout` の不正を理由としないこと

- [ ] **T-13-08-02**: 許可値以外のモジュール名は `--timeout` の不正より先に判定する
  - Target: `parseMutateArgs`
  - Test ID: `T-MUT-MT-08-02`
  - Rule: report-cli 4.1 (Step 順の評価、R-602 → R-603)
  - Scenario: Given argv が `['unknown', '--timeout', '0']` である, When `parseMutateArgs` を呼んで投げられた `ChatlogError` を捕捉する
  - Expected: Then `error.message` が許可値の一覧を含み、`--timeout` を理由としないこと

---

## T-14: `main`（監査の順序制御と SIGINT）

> Commit: 16 / 配置ファイル: `scripts/testing/mutate-tester.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/mutate-tester.unit.spec.ts` / Phase: 3 /
> Test ID prefix: `T-MUT-MT`（グループ番号 10〜29。本 Target は 10〜28 を使用）
> 注入（**判断事項。ユーザー確認待ち**）: impl v1.5.0 は `main(argv?): Promise<number>` の依存の渡し方を定めていない。本タスクは次の最小形を前提とする。
> `main(argv?: string[], deps: Partial<MainDeps> = {}): Promise<number>`。`MainDeps` は `scripts/testing/mutation/types/mutation.types.ts` に置き、既定値は分割代入で production 実装を与える (coding-guidelines のオブジェクト引数規約)。
> `MainDeps` = `{ resolveTargets, loadAllowlist, acquireLock, releaseLock, sweepArtifacts, hashSources, runBaseline, generateMutants, runMutants, matchAllowlist, readSource, writeReport, signals }`。
> `writeReport(text)` は標準出力への書き出し、`signals` は `{ onInterrupt(handler): () => void }` (`Deno.addSignalListener('SIGINT', …)` の薄い包み。戻り値で登録解除) とする。
> `formatReport` / `decideExitCode` / `detectDrift` は純関数なので注入せず実物を使う (REQ-NF-002、report-cli 4.3 の impl-note)。
> テストは各 fake の呼び出しを 1 本の呼び出し記録配列へ積み、順序と有無を検証する。SIGINT は `signals` の fake が保持した handler を、任意の fake の実行中に呼んで再現する。実プロセスは起動しない。
>
> 異常経路の「非 0」は、`main` が `ChatlogError` で reject する (エントリポイントで 1 になる) か、130 以外の非 0 を return するかのどちらかで観測する。各タスクの Expected は、impl Commit 16 の記述 (例外を投げる経路 / return する経路) に従って書いた。

### [正常] Normal Cases

#### T-14-10: 全工程が成功する監査

- [ ] **T-14-10-01**: 工程が規定の順序で呼ばれる
  - Target: `main`
  - Test ID: `T-MUT-MT-10-01`
  - Rule: index R-001〜R-013 / index DD-01 / execution R-205 / execution R-209 / execution R-213 / REQ-C-006
  - Scenario: Given すべての fake が成功し変異体 1 件を生成する deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then 呼び出し記録が `resolveTargets` → `loadAllowlist` → `acquireLock` → `signals.onInterrupt` → `sweepArtifacts` → `hashSources` → `runBaseline` → `generateMutants` → `runMutants` → `matchAllowlist` → `hashSources` → `writeReport` → `releaseLock` の順であること

- [ ] **T-14-10-02**: レポートを標準出力へ 1 回書き出す
  - Target: `main`
  - Test ID: `T-MUT-MT-10-02`
  - Rule: index R-012 / report-cli DD-02
  - Scenario: Given すべての fake が成功し、`runMutants` が killed 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` が 1 回だけ呼ばれ、その引数が同じ入力に対する `formatReport` の出力と一致すること

- [ ] **T-14-10-03**: 既定では未許容の生存があっても 0 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-10-03`
  - Rule: index R-013 / DR-03 / AC-015
  - Scenario: Given `runMutants` が survived 1 件を返し、`matchAllowlist` がそれを未許容とする deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then `0` を返すこと

- [ ] **T-14-10-04**: `--strict` が終了コードの決定に渡る
  - Target: `main`
  - Test ID: `T-MUT-MT-10-04`
  - Rule: index R-013 / DR-03 / AC-016
  - Scenario: Given `runMutants` が survived 1 件を返し、`matchAllowlist` がそれを未許容とする deps と argv `['libs', '--strict']` がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない値を返すこと

- [ ] **T-14-10-05**: 制限時間をベースラインと変異体の実行に同じ値で渡す
  - Target: `main`
  - Test ID: `T-MUT-MT-10-05`
  - Rule: execution DD-10 / report-cli R-604 / REQ-NF-003
  - Scenario: Given すべての fake が成功する deps と argv `['libs', '--timeout', '30']` がある, When `main` を呼ぶ
  - Expected: Then `runBaseline` と `runMutants` に渡された制限時間がどちらも 30000 ミリ秒であること

- [ ] **T-14-10-06**: 対象ソース全件の変異体を `runMutants` に渡す
  - Target: `main`
  - Test ID: `T-MUT-MT-10-06`
  - Rule: index R-008 / index R-009
  - Scenario: Given `resolveTargets` がソース 2 件を返し、`generateMutants` が各ソースから 1 件ずつ変異体を返す deps がある, When `main` を呼ぶ
  - Expected: Then `runMutants` に渡された変異体列が 2 件で、`resolveTargets` のソース順に並んでいること

#### T-14-11: 変異体 0 件の監査

- [ ] **T-14-11-01**: 変異体 0 件なら `runMutants` を呼ばない
  - Target: `main`
  - Test ID: `T-MUT-MT-11-01`
  - Rule: index R-008 / Edge index-1 / REQ-F-018
  - Scenario: Given `generateMutants` が全ソースで空配列を返す deps がある, When `main` を呼ぶ
  - Expected: Then `runMutants` が呼ばれないこと

- [ ] **T-14-11-02**: 変異体 0 件をレポートし 0 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-11-02`
  - Rule: index R-008 / report-cli R-606 / Edge report-cli-8 / AC-021
  - Scenario: Given `generateMutants` が全ソースで空配列を返し、許容リストが空の deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に変異体 0 件の明示が含まれ、`0` を返すこと

- [ ] **T-14-11-03**: 変異体 0 件でも許容リストの照合 (古いエントリの抽出) を行う
  - Target: `main`
  - Test ID: `T-MUT-MT-11-03`
  - Rule: index R-008 / allowlist R-509
  - Scenario: Given `generateMutants` が空配列を返し、`loadAllowlist` がエントリ 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `matchAllowlist` が空の変異体列とそのエントリ 1 件で呼ばれること

- [ ] **T-14-11-04**: 変異体 0 件の監査でもベースラインを実行する
  - Target: `main`
  - Test ID: `T-MUT-MT-11-04`
  - Rule: index R-007 / index R-008 / implementation Commit 16（変異体 0 件でもベースラインを実行する）
  - Scenario: Given `generateMutants` が全ソースで空配列を返す deps がある, When `main` を呼ぶ
  - Expected: Then `runBaseline` が 1 回呼ばれ、呼び出し記録で `generateMutants` より前にあること

### [異常] Error Cases

#### T-14-12: 引数エラー

- [ ] **T-14-12-01**: 不明なモジュール名では `ChatlogError` で reject する
  - Target: `main`
  - Test ID: `T-MUT-MT-12-01`
  - Rule: index R-001 / report-cli R-602 / AC-014 / REQ-C-003
  - Scenario: Given argv `['unknown']` と記録付きの deps がある, When `main` を呼ぶ
  - Expected: Then `main` が `ChatlogError` で reject すること (`Deno.exit` を呼ばない)

- [ ] **T-14-12-02**: 不明なモジュール名ではどの依存も呼ばない
  - Target: `main`
  - Test ID: `T-MUT-MT-12-02`
  - Rule: index R-001 / execution R-201 / AC-014
  - Scenario: Given argv `['unknown']` と記録付きの deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then 呼び出し記録が空であること (`resolveTargets`・`acquireLock`・`sweepArtifacts` を含め何も呼ばれない)

- [ ] **T-14-12-03**: `--timeout 0` ではどの依存も呼ばない
  - Target: `main`
  - Test ID: `T-MUT-MT-12-03`
  - Rule: index R-001 / report-cli R-603 / AC-024
  - Scenario: Given argv `['libs', '--timeout', '0']` と記録付きの deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then 呼び出し記録が空であること

#### T-14-13: 許容リストの不正

- [ ] **T-14-13-01**: 許容リストのエラーをそのまま伝える
  - Target: `main`
  - Test ID: `T-MUT-MT-13-01`
  - Rule: index R-003 / allowlist R-505 / Edge report-cli-24 / AC-011
  - Scenario: Given `loadAllowlist` が全エラーを列挙した `ChatlogError` を投げる deps がある, When `main` を呼ぶ
  - Expected: Then `main` が同じ `ChatlogError` で reject し、`error.message` が `loadAllowlist` の列挙を含むこと

- [ ] **T-14-13-02**: 許容リストの検証はロック取得より先で、ロック競合より優先する
  - Target: `main`
  - Test ID: `T-MUT-MT-13-02`
  - Rule: index R-003 / index R-004 / index DD-02 / Edge index-3
  - Scenario: Given `loadAllowlist` が `ChatlogError` を投げ、`acquireLock` も失敗するよう設定した deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `acquireLock`・`sweepArtifacts` が呼ばれず、reject の理由が許容リストのエラーであること

- [ ] **T-14-13-03**: 許容リストの不正で中止したらレポートを構成しない
  - Target: `main`
  - Test ID: `T-MUT-MT-13-03`
  - Rule: report-cli §3.2（実行前の中止はレポートを構成しない） / report-cli 4.3 / Edge report-cli-24
  - Scenario: Given `loadAllowlist` が `ChatlogError` を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `writeReport` が呼ばれないこと

#### T-14-14: ロックの取得失敗

- [ ] **T-14-14-01**: ロックの取得失敗で非 0 になる
  - Target: `main`
  - Test ID: `T-MUT-MT-14-01`
  - Rule: index R-004 / execution R-202 / DR-09 / Edge index-7 / Edge execution-15 (前半: ロックが残っていれば中止) / Edge execution-22 / Edge report-cli-26
  - Scenario: Given 前回の強制終了で残ったロックを想定し、`acquireLock` が `ChatlogError` を投げる deps がある, When `main` を呼ぶ
  - Expected: Then `main` が `ChatlogError` で reject すること

- [ ] **T-14-14-02**: ロックの取得失敗では何も削除せず実行もしない
  - Target: `main`
  - Test ID: `T-MUT-MT-14-02`
  - Rule: index R-004 / execution R-201 / REQ-F-017 / Edge execution-21 / AC-019
  - Scenario: Given 別のハーネスが実行中であることを想定し、`acquireLock` が `ChatlogError` を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `sweepArtifacts`・`hashSources`・`runBaseline`・`runMutants` がいずれも呼ばれないこと

- [ ] **T-14-14-03**: 取得できなかったロックは解放しない
  - Target: `main`
  - Test ID: `T-MUT-MT-14-03`
  - Rule: execution R-213 / execution DD-13
  - Scenario: Given `acquireLock` が `ChatlogError` を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `releaseLock` が呼ばれないこと

- [ ] **T-14-14-04**: ロックの取得失敗で中止したらレポートを構成しない
  - Target: `main`
  - Test ID: `T-MUT-MT-14-04`
  - Rule: report-cli §3.2（実行前の中止はレポートを構成しない） / report-cli 4.3 / Edge report-cli-26
  - Scenario: Given `acquireLock` が `ChatlogError` を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `writeReport` が呼ばれないこと

#### T-14-15: 残骸掃除の失敗

- [ ] **T-14-15-01**: 削除できなかった残骸があれば非 0 で中止する
  - Target: `main`
  - Test ID: `T-MUT-MT-15-01`
  - Rule: execution DD-14 / Edge execution-28 / report-cli R-615
  - Scenario: Given `sweepArtifacts` が削除に失敗したパス 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない結果 (非 0 の return または reject) になること

- [ ] **T-14-15-02**: 掃除で中止してもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-15-02`
  - Rule: execution DD-14 / index 補足規則 (あらゆる経路で解放)
  - Scenario: Given `sweepArtifacts` が削除に失敗したパス 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

- [ ] **T-14-15-03**: 掃除で中止したらハッシュ取得もベースラインも行わない
  - Target: `main`
  - Test ID: `T-MUT-MT-15-03`
  - Rule: execution DD-14 / index R-005
  - Scenario: Given `sweepArtifacts` が削除に失敗したパス 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` と `runBaseline` が呼ばれないこと

#### T-14-16: ハッシュ取得の失敗

- [ ] **T-14-16-01**: ハッシュ取得の失敗で非 0 で中止する
  - Target: `main`
  - Test ID: `T-MUT-MT-16-01`
  - Rule: execution DD-14 / Edge execution-28 / report-cli R-615
  - Scenario: Given 1 回目の `hashSources` が例外を投げる deps がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない結果になり、`runBaseline` が呼ばれないこと

- [ ] **T-14-16-02**: ハッシュ取得で中止してもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-16-02`
  - Rule: execution DD-14
  - Scenario: Given 1 回目の `hashSources` が例外を投げる deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

#### T-14-17: レポート出力の失敗

- [ ] **T-14-17-01**: レポート出力の失敗で非 0 になる
  - Target: `main`
  - Test ID: `T-MUT-MT-17-01`
  - Rule: execution DD-14 / Edge execution-28 / report-cli R-615
  - Scenario: Given `writeReport` が例外を投げ、他の fake が成功する deps がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない結果になること

- [ ] **T-14-17-02**: レポート出力で失敗してもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-17-02`
  - Rule: execution DD-14
  - Scenario: Given `writeReport` が例外を投げる deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

#### T-14-18: ベースラインの失敗

- [ ] **T-14-18-01**: ベースラインが失敗したら変異体を生成も実行もしない
  - Target: `main`
  - Test ID: `T-MUT-MT-18-01`
  - Rule: index R-007 / execution R-208 / DR-08 / Edge index-4 / Edge execution-18 / AC-017 / AC-018
  - Scenario: Given `runBaseline` が `failed { reason }` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `generateMutants` と `runMutants` が呼ばれないこと

- [ ] **T-14-18-02**: ベースラインの失敗で非 0 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-18-02`
  - Rule: index R-007 / report-cli R-615 / Edge report-cli-25
  - Scenario: Given `runBaseline` が `failed { reason }` を返す deps がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない結果になること

- [ ] **T-14-18-03**: ベースラインで中止してもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-18-03`
  - Rule: index R-007 / index 補足規則
  - Scenario: Given `runBaseline` が `failed { reason }` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

- [ ] **T-14-18-04**: ベースラインで中止する場合も drift 検査を行い、drift を標準エラー出力へ列挙する
  - Target: `main`
  - Test ID: `T-MUT-MT-18-04`
  - Rule: execution R-208 / index 補足規則 (R-007 中止時の drift) / Edge execution-29
  - Scenario: Given `runBaseline` が `failed { reason }` を返し、2 回目の `hashSources` が 1 件のソースについて異なるハッシュを返す deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` が 2 回呼ばれ、標準エラー出力 (logger) にそのソースのパスが出ること

- [ ] **T-14-18-05**: ベースラインで中止したらレポートを構成しない
  - Target: `main`
  - Test ID: `T-MUT-MT-18-05`
  - Rule: report-cli 3.2 (実行前の中止はレポートを構成しない) / report-cli 4.3
  - Scenario: Given `runBaseline` が `failed { reason }` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` が呼ばれないこと

#### T-14-19: drift の検出

- [ ] **T-14-19-01**: 全変異体の処理後に drift があれば非 0 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-19-01`
  - Rule: index R-011 / execution R-212 / report-cli R-615 / Edge index-10 / Edge execution-16 / AC-009
  - Scenario: Given すべての工程が成功し、2 回目の `hashSources` が 1 件のソースについて異なるハッシュを返す deps と argv `['libs']` (`--strict` なし) がある, When `main` を呼ぶ
  - Expected: Then 0 でも 130 でもない値を返すこと

- [ ] **T-14-19-02**: drift のファイルをレポートに渡す
  - Target: `main`
  - Test ID: `T-MUT-MT-19-02`
  - Rule: index R-011 / report-cli R-611
  - Scenario: Given 2 回目の `hashSources` が `a.ts` について異なるハッシュを返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に `a.ts` が drift として含まれること

### [エッジケース] Edge Cases

#### T-14-20: ハッシュ記録の完了前に SIGINT を受ける

- [ ] **T-14-20-01**: ハッシュ記録中の SIGINT で 130 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-20-01`
  - Rule: execution R-227 / index R-014 / index DD-04 / Edge index-6 / Edge execution-30
  - Scenario: Given 1 回目の `hashSources` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `130` を返すこと

- [ ] **T-14-20-02**: ハッシュ記録中の SIGINT では進行中のハッシュ記録を終え、ベースラインへ進まない
  - Target: `main`
  - Test ID: `T-MUT-MT-20-02`
  - Rule: execution R-227
  - Scenario: Given 1 回目の `hashSources` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` が最後まで完了 (resolve) し、`runBaseline` が呼ばれないこと

- [ ] **T-14-20-03**: ハッシュ記録中の SIGINT では drift 検査を省く
  - Target: `main`
  - Test ID: `T-MUT-MT-20-03`
  - Rule: execution R-227 / index DD-04
  - Scenario: Given 1 回目の `hashSources` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` の呼び出しが 1 回だけであること

- [ ] **T-14-20-04**: ハッシュ記録中の SIGINT でも中断の事実をレポートする
  - Target: `main`
  - Test ID: `T-MUT-MT-20-04`
  - Rule: execution R-227 / report-cli R-605
  - Scenario: Given 1 回目の `hashSources` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に中断 (途中結果) の明示が含まれること

- [ ] **T-14-20-05**: ハッシュ記録中の SIGINT でもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-20-05`
  - Rule: execution R-227 / index 補足規則
  - Scenario: Given 1 回目の `hashSources` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

- [ ] **T-14-20-06**: 掃除中の SIGINT では掃除を終えてから中断する
  - Target: `main`
  - Test ID: `T-MUT-MT-20-06`
  - Rule: execution R-227 / Edge execution-30
  - Scenario: Given `sweepArtifacts` の実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `sweepArtifacts` が最後まで完了し、`runBaseline` が呼ばれず、`130` を返すこと

#### T-14-21: ベースラインの実行中に SIGINT を受ける

- [ ] **T-14-21-01**: ベースラインの `interrupted` は失敗ではなく 130 として扱う
  - Target: `main`
  - Test ID: `T-MUT-MT-21-01`
  - Rule: execution R-227 / execution R-228 / report-cli R-614 / report-cli DD-06
  - Scenario: Given `runBaseline` の実行中に SIGINT の handler を呼び、`runBaseline` が `interrupted` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `130` を返すこと

- [ ] **T-14-21-02**: ベースラインへ渡した中止信号が SIGINT で中止される
  - Target: `main`
  - Test ID: `T-MUT-MT-21-02`
  - Rule: execution R-227
  - Scenario: Given `runBaseline` の fake が受け取った `signal` を保持し、実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then 保持した `signal.aborted` が `true` であること

- [ ] **T-14-21-03**: ベースライン中の中断では変異体を実行しない
  - Target: `main`
  - Test ID: `T-MUT-MT-21-03`
  - Rule: execution R-227
  - Scenario: Given `runBaseline` が `interrupted` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `generateMutants` と `runMutants` が呼ばれないこと

- [ ] **T-14-21-04**: ベースライン中の中断では drift 検査を行う
  - Target: `main`
  - Test ID: `T-MUT-MT-21-04`
  - Rule: execution R-228 / REQ-F-008
  - Scenario: Given `runBaseline` が `interrupted` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` が 2 回呼ばれること

- [ ] **T-14-21-05**: ベースライン中の中断では判定 0 件の中断レポートを出す
  - Target: `main`
  - Test ID: `T-MUT-MT-21-05`
  - Rule: execution R-228 / report-cli R-605
  - Scenario: Given `runBaseline` が `interrupted` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` が 1 回呼ばれ、その引数に中断の明示が含まれること

- [ ] **T-14-21-06**: ベースライン中の中断でもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-21-06`
  - Rule: execution R-228 / index R-014
  - Scenario: Given `runBaseline` が `interrupted` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれること

#### T-14-22: 変異体の実行中に SIGINT を受ける

- [ ] **T-14-22-01**: 変異体の実行中の SIGINT で 130 を返す
  - Target: `main`
  - Test ID: `T-MUT-MT-22-01`
  - Rule: index R-014 / execution R-228 / report-cli R-614 / Edge index-5 / Edge execution-24 / Edge report-cli-23 / AC-023
  - Scenario: Given `runMutants` の実行中に SIGINT の handler を呼び、`runMutants` が `interrupted: true` と判定 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `130` を返すこと

- [ ] **T-14-22-02**: `runMutants` へ渡した中止信号が SIGINT で中止される
  - Target: `main`
  - Test ID: `T-MUT-MT-22-02`
  - Rule: execution R-227
  - Scenario: Given `runMutants` の fake が受け取った `signal` を保持し、実行中に SIGINT の handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then 保持した `signal.aborted` が `true` であること

- [ ] **T-14-22-03**: 変異体の実行中の中断でも drift 検査を行う
  - Target: `main`
  - Test ID: `T-MUT-MT-22-03`
  - Rule: execution R-228 / execution R-212 / Edge execution-17 / REQ-F-008
  - Scenario: Given `runMutants` が `interrupted: true` を返し、2 回目の `hashSources` が 1 件のソースについて異なるハッシュを返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数にそのソースが drift として含まれること

- [ ] **T-14-22-04**: 中断のレポートはそこまでの判定で構成する
  - Target: `main`
  - Test ID: `T-MUT-MT-22-04`
  - Rule: execution R-228 / report-cli R-605
  - Scenario: Given `runMutants` が `interrupted: true` と killed 1 件の判定を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に中断の明示と killed 1 件が含まれること

- [ ] **T-14-22-05**: 変異体の実行中の中断でもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-22-05`
  - Rule: execution R-228 / index R-014
  - Scenario: Given `runMutants` が `interrupted: true` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `releaseLock` が 1 回呼ばれ、それが `writeReport` の後であること

- [ ] **T-14-22-06**: 中断と drift が重なっても 130 を優先する
  - Target: `main`
  - Test ID: `T-MUT-MT-22-06`
  - Rule: report-cli R-614 / report-cli DD-06 / Edge report-cli-23
  - Scenario: Given `runMutants` が `interrupted: true` を返し、2 回目の `hashSources` が異なるハッシュを返す deps がある, When `main` を呼ぶ
  - Expected: Then `130` を返すこと

- [ ] **T-14-22-07**: 中断後の照合には判定の有無を問わず生成された全変異体を渡す
  - Target: `main`
  - Test ID: `T-MUT-MT-22-07`
  - Rule: allowlist R-509 / allowlist DD-06 / Edge allowlist-18 / implementation Commit 7（存在確認は生成された全変異体が対象）
  - Scenario: Given `generateMutants` が変異体 3 件を返し、`runMutants` の実行中に SIGINT の handler を呼んで `runMutants` が `interrupted: true` と判定 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `matchAllowlist` に渡された変異体列が生成された 3 件すべてであること（判定済みの 1 件に絞らないこと）

- [ ] **T-14-22-08**: 中断のレポートにも古いエントリを列挙する
  - Target: `main`
  - Test ID: `T-MUT-MT-22-08`
  - Rule: allowlist R-509 / allowlist R-510 / report-cli R-605 / report-cli R-610 / Edge allowlist-18
  - Scenario: Given `runMutants` が `interrupted: true` を返し、`matchAllowlist` が古いエントリ 1 件を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に中断の明示と、その古いエントリの `file` と `lineText` が含まれること

#### T-14-23: SIGINT の受信開始の時期

- [ ] **T-14-23-01**: SIGINT の受信はロック取得の後に始める
  - Target: `main`
  - Test ID: `T-MUT-MT-23-01`
  - Rule: execution R-204 / index R-014
  - Scenario: Given すべての fake が成功する deps がある, When `main` を呼ぶ
  - Expected: Then 呼び出し記録で `signals.onInterrupt` が `acquireLock` より後、`sweepArtifacts` より前にあること

- [ ] **T-14-23-02**: ロックを取得できなければ SIGINT の受信を始めない
  - Target: `main`
  - Test ID: `T-MUT-MT-23-02`
  - Rule: execution R-204 / Edge execution-26
  - Scenario: Given `acquireLock` が `ChatlogError` を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `signals.onInterrupt` が呼ばれないこと

#### T-14-24: 後始末中の追加の SIGINT

- [ ] **T-14-24-01**: 2 回目の SIGINT でも drift 検査とロック解放を省略しない
  - Target: `main`
  - Test ID: `T-MUT-MT-24-01`
  - Rule: execution DD-08 / execution R-228 / Edge execution-25
  - Scenario: Given `runMutants` の実行中に SIGINT の handler を呼び、続く 2 回目の `hashSources` の実行中にもう一度 handler を呼ぶ deps がある, When `main` を呼ぶ
  - Expected: Then `hashSources` が 2 回とも完了し、`writeReport` と `releaseLock` がそれぞれ 1 回呼ばれ、`130` を返すこと

#### T-14-25: ロック解放の失敗

- [ ] **T-14-25-01**: ロック解放の失敗は終了コードを変えない
  - Target: `main`
  - Test ID: `T-MUT-MT-25-01`
  - Rule: execution DD-14 / execution DD-13
  - Scenario: Given すべての工程が成功し、`releaseLock` が解放失敗 (警告のみ) を報告する deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then `0` を返すこと

- [ ] **T-14-25-02**: ロック解放の失敗を標準エラー出力へ警告する
  - Target: `main`
  - Test ID: `T-MUT-MT-25-02`
  - Rule: execution DD-14（解放の失敗は警告のみ） / report-cli §2.2（警告は標準エラー出力）
  - Scenario: Given すべての工程が成功し、`releaseLock` が解放失敗 (警告のみ) を報告する deps がある, When `main` を呼ぶ
  - Expected: Then 標準エラー出力 (logger) に警告が 1 件出て、`writeReport` の引数にはその警告が含まれないこと

#### T-14-26: 後始末の残骸

- [ ] **T-14-26-01**: 残骸があっても終了コードは変えない
  - Target: `main`
  - Test ID: `T-MUT-MT-26-01`
  - Rule: index DD-05 / execution DD-05 / Edge index-8 / report-cli R-616
  - Scenario: Given `runMutants` が `leftovers` に 1 件を返し、他は問題の無い deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then `0` を返すこと

- [ ] **T-14-26-02**: 残骸をレポートに渡す
  - Target: `main`
  - Test ID: `T-MUT-MT-26-02`
  - Rule: index R-012 / report-cli R-612
  - Scenario: Given `runMutants` が `leftovers` に `src/a.mutation-001.ts` を返す deps がある, When `main` を呼ぶ
  - Expected: Then `writeReport` の引数に `src/a.mutation-001.ts` が残骸として含まれること

#### T-14-27: 想定外の例外でもロックを解放する

- [ ] **T-14-27-01**: `runMutants` が例外を投げてもロックを解放する
  - Target: `main`
  - Test ID: `T-MUT-MT-27-01`
  - Rule: index 補足規則 (例外を含むあらゆる経路で解放) / index DD-03
  - Scenario: Given `runMutants` が想定外の例外を投げる deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then `releaseLock` が 1 回呼ばれること

- [ ] **T-14-27-02**: `runMutants` の例外は `main` の reject として伝わる
  - Target: `main`
  - Test ID: `T-MUT-MT-27-02`
  - Rule: REQ-C-003 / index DD-03
  - Scenario: Given `runMutants` が想定外の例外を投げる deps がある, When `main` を呼ぶ
  - Expected: Then `main` がその例外で reject すること (0 や 130 で resolve しない)

#### T-14-28: SIGINT の受信の登録解除

- [ ] **T-14-28-01**: 正常終了で SIGINT の受信を解除する
  - Target: `main`
  - Test ID: `T-MUT-MT-28-01`
  - Rule: T-14 blockquote の `MainDeps` 案（`signals.onInterrupt` の戻り値で登録解除） / execution R-204
  - Scenario: Given すべての fake が成功し、`signals.onInterrupt` が記録付きの解除関数を返す deps と argv `['libs']` がある, When `main` を呼ぶ
  - Expected: Then 解除関数が 1 回呼ばれ、`main` が `0` を返すこと

- [ ] **T-14-28-02**: 想定外の例外で中止しても SIGINT の受信を解除する
  - Target: `main`
  - Test ID: `T-MUT-MT-28-02`
  - Rule: T-14 blockquote の `MainDeps` 案（`signals.onInterrupt` の戻り値で登録解除）
  - Scenario: Given `runMutants` が想定外の例外を投げ、`signals.onInterrupt` が記録付きの解除関数を返す deps がある, When `main` を呼んで reject を捕捉する
  - Expected: Then 解除関数が 1 回呼ばれること

- [ ] **T-14-28-03**: 中断で終了しても SIGINT の受信を解除する
  - Target: `main`
  - Test ID: `T-MUT-MT-28-03`
  - Rule: T-14 blockquote の `MainDeps` 案（`signals.onInterrupt` の戻り値で登録解除） / execution R-228
  - Scenario: Given `runMutants` の実行中に SIGINT の handler を呼び、`runMutants` が `interrupted: true` を返し、`signals.onInterrupt` が記録付きの解除関数を返す deps がある, When `main` を呼ぶ
  - Expected: Then 解除関数が 1 回呼ばれ、`main` が `130` を返すこと

---

## T-15: `runMutants` integration（実 `deno test` での差し替え検証）

> Commit: 18 / 配置ファイル: `scripts/testing/mutation/run-mutants.ts`（検証対象。新規コードは fixture のみ）/ テストファイル: `scripts/testing/mutation/__tests__/integration/run-mutants.integration.spec.ts` / Phase: 3 / Test ID prefix: `T-MUT-MTI`（グループ番号 01〜09。本 Target は 01〜06 を使用）
> fixture: 一時ディレクトリに、小さなソース `target.ts`・それを import するテスト・元の設定 (`deno.json`、`@std/assert` を解決する `imports` を持つ) を置く。
> 変異体は `generateMutants` で生成し、既定の `TestRunnerProvider` (`runDenoTest`) で実行する。実行時間を抑えるため、変異体は各シナリオ 1〜2 件に絞る。

### [正常] Normal Cases

#### T-15-01: 差し替えた変異体がテストに読まれる

- [ ] **T-15-01-01**: テストが検出する変異体は killed になる
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-01-01`
  - Rule: index DD-08 / DR-01 / execution R-216 / REQ-F-003 / AC-004
  - Scenario: Given `export const isPositive = (n: number) => n > 0;` と、`isPositive(0) === false` を検査するテストの fixture があり、`>` を `>=` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が killed であること (`imports` による差し替えが効いている)

- [ ] **T-15-01-02**: テストが触れない変異体は survived になる
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-01-02`
  - Rule: execution R-220 / REQ-F-004
  - Scenario: Given fixture にテストから呼ばれない関数 `isLarge = (n: number) => n > 100` があり、その `>` を `>=` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が survived であること

#### T-15-02: 元ソースと作業ツリーを汚さない

- [ ] **T-15-02-01**: 実行の前後で元ソースの drift が 0 件である
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-02-01`
  - Rule: execution R-212 / REQ-F-008 / REQ-NF-001 / AC-003 / AC-009
  - Scenario: Given T-15-01-01 と同じ fixture と変異体があり、実行前に `hashSources` で `target.ts` のハッシュを記録した, When 実 `deno test` で `runMutants` を実行し、再度 `hashSources` を取って `detectDrift` に渡す
  - Expected: Then drift が 0 件であること

- [ ] **T-15-02-02**: 実行後に変異体ファイルと一時設定が残らない
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-02-02`
  - Rule: execution R-225 / REQ-F-006 / AC-007
  - Scenario: Given T-15-01-01 と同じ fixture と変異体がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then fixture ディレクトリに `*.mutation-*.ts` と `deno.mutation-*.json` が 1 件も無く、`leftovers` が空であること

### [異常] Error Cases

#### T-15-03: 型検査で落ちる変異体

- [ ] **T-15-03-01**: 型検査が落とした変異体は compile-error になり killed にならない
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-03-01`
  - Rule: execution R-221 / execution DD-03 / DR-02 / Edge execution-5 / Edge generation-22 / AC-005
  - Scenario: Given `export const FLAG: true = true;` を持つ fixture と、`true` を `false` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が compile-error であること (実 Deno の型検査失敗の出力で識別できる)

### [エッジケース] Edge Cases

#### T-15-04: 移植性 (改行コードとパス)

- [ ] **T-15-04-01**: CRLF のソースでも差し替えが効く
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-04-01`
  - Rule: REQ-NF-004 / execution R-215 / Edge index-11 / Edge execution-2
  - Scenario: Given T-15-01-01 と同じ内容を CRLF 改行で書いた fixture と、`>` を `>=` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が killed であること

- [ ] **T-15-04-02**: 空白を含むディレクトリでも file URL で差し替えが効く
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-04-02`
  - Rule: REQ-NF-004 (file URL への変換) / execution R-216
  - Scenario: Given 名前に空白を含むディレクトリに T-15-01-01 と同じ fixture を置き、`>` を `>=` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が killed であること

#### T-15-05: 差し替えが効かない読み方の前提

- [ ] **T-15-05-01**: ソースを文字列として読むテストでは検出されるべき変異体も survived になる
  - Target: `runMutants`
  - Test ID: `T-MUT-MTI-05-01`
  - Rule: index DD-08 / DR-01 (import 経由でのみ効く) / report-cli R-613 の前提
  - Scenario: Given `target.ts` を import せず `Deno.readTextFile` で読み、本文に `n > 0` が含まれることを検査するテストの fixture と、`>` を `>=` にした変異体 1 件がある, When 実 `deno test` で `runMutants` を実行する
  - Expected: Then その変異体の判定が survived であること (差し替えが効かない読み方では全件 survived になる、という警告 R-613 の根拠を固定する)

---

## T-16: `generateMutants` 追補（generation Edge 16〜24 の未検証分）

> Commit: —（実装済み、テスト追補のみ）/ 配置ファイル: `scripts/testing/mutation/generate-mutants.ts` /
> テストファイル: `scripts/testing/mutation/__tests__/unit/generate-mutants.unit.spec.ts` /
> Phase: 1 / Test ID prefix: `T-MUT-GM`（既存の 3 段 ID `T-MUT-GM-01-SS-CC` を継ぎ、シナリオ番号 SS は 25〜31 を使用）
> 既存の `T-MUT-GM-01-01-01`〜`T-MUT-GM-01-24-07` で未検証の分だけを足す。各タスクの入力は既存テストに無いことを確認済み。
> 既存のテーブル駆動 (`_runCases`) に載る形 (入力 1 件 → `Mutant` の位置・字句の配列) を基本とする。

### [正常] Normal Cases

#### T-16-01: 同一の入力から同じ列を返す

- [ ] **T-16-01-01**: 同じソースを 2 回渡すと、同一の変異体列を返す
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-25-01`
  - Rule: generation DD-07 / generation R-112 / Edge generation-15
  - Scenario: Given 2 行のソース `a < b && c\nx = true;` と `filePath`, When `generateMutants` を 2 回呼ぶ
  - Expected: Then 2 回の戻り値が要素の順序まで `assertEquals` で等しいこと

#### T-16-02: `.tsx` を TS と同じ字句規則で走査する

- [ ] **T-16-02-01**: `.tsx` のファイルでも `.ts` と同じ位置・字句の変異体を返し、`file` に `.tsx` のパスを記録する
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-26-01`
  - Rule: generation DD-05 / generation R-109 / Edge generation-12
  - Scenario: Given ソース `x = a > b;` と `filePath` `a/view.tsx`, When `generateMutants` を呼ぶ
  - Expected: Then `line: 1`・`column: 7`・`before: '>'`・`after: '>='` の 1 件を返し、その `file` が `a/view.tsx` であること

### [異常] Error Cases

#### T-16-03: 解析できないソース

- [ ] **T-16-03-01**: 閉じていないブロックコメントは例外を投げず、以降の行からも変異体を生成しない
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-27-01`
  - Rule: generation R-106 / generation §3.1（解析できない箇所はエラーにしない）
  - Scenario: Given 閉じ `*/` の無いソース `/* a < b\nx = c && d;`, When `generateMutants` を呼ぶ
  - Expected: Then 例外を投げず、空配列を返すこと

### [エッジケース] Edge Cases

#### T-16-04: 後置 `--` の直後の `/`

- [ ] **T-16-04-01**: 後置 `--` の直後の `/` は除算であり、行を正規表現行として除外しない
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-28-01`
  - Rule: Edge generation-19 / generation DD-04 / generation R-110
  - Scenario: Given ソース `x = i-- / 2 && y;`, When `generateMutants` を呼ぶ
  - Expected: Then `column: 11` の `2` → `3` と `column: 13` の `&&` → `||` の 2 件を、この順で返すこと

#### T-16-05: リテラル型

- [ ] **T-16-05-01**: 型エイリアスの数値リテラル型 `type T = 0 | 1` は値のリテラルと同じく変異体を生成する
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-29-01`
  - Rule: Edge generation-22 / generation R-110
  - Scenario: Given ソース `type T = 0 | 1;`, When `generateMutants` を呼ぶ
  - Expected: Then `column: 10` の `0` → `1` と `column: 14` の `1` → `2` の 2 件を返すこと（既知の制限の固定）

- [ ] **T-16-05-02**: 型注釈の boolean リテラル型 `x: true` は値のリテラルと同じく変異体を生成する
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-29-02`
  - Rule: Edge generation-22 / generation R-110
  - Scenario: Given ソース `let x: true;`, When `generateMutants` を呼ぶ
  - Expected: Then `column: 8` の `true` → `false` の 1 件を返すこと（既知の制限の固定）

#### T-16-06: 字句の前にサロゲートペアがある行

- [ ] **T-16-06-01**: 桁を 1 始まりの UTF-16 コード単位で数え、サロゲートペアを 2 桁とする
  - Target: `generateMutants`
  - Test ID: `T-MUT-GM-01-30-01`
  - Rule: Edge generation-24 / REQ-F-001
  - Scenario: Given ソース `const s = '😀' > x;`, When `generateMutants` を呼ぶ
  - Expected: Then `>` の変異体の `column` が `16` であること（コードポイントで数えた `15` ではない）

---

## Coverage Check

### Coverage Check (T-01〜T-03)

| Source             | 内容 (短縮)                                        | Task ID(s)                                                                                                             |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| generation R-101   | モジュール配下の TS / TSX を候補にする             | T-01-01-01〜06, T-01-02-01〜02, T-01-09-01〜02                                                                         |
| generation R-102   | テスト・spec・types・constants を除外              | T-01-06-01〜07                                                                                                         |
| generation R-103   | 変異体・一時設定の命名に一致するものを除外         | T-01-05-01〜04, T-01-07-01〜04, T-01-08-01〜04                                                                         |
| generation R-104   | 判定用テストは当該モジュールの unit のみ           | T-01-03-01〜07, T-01-11-01, T-01-12-01〜03, T-01-13-01〜02                                                             |
| generation R-105   | 集合を昇順で返す                                   | T-01-04-01〜03                                                                                                         |
| generation R-106   | コメント内は変異体を生成しない（閉じないコメント） | T-16-03-01（他は既存 `T-MUT-GM-*`）                                                                                    |
| generation R-110   | オペレータの適用箇所ごとに 1 件                    | T-16-04-01, T-16-05-01〜02（他は既存 `T-MUT-GM-*`）                                                                    |
| generation R-112   | 行・桁の昇順、同一入力で同一の列                   | T-16-01-01（他は既存 `T-MUT-GM-*`）                                                                                    |
| generation DD-01   | 6 つのモジュール名                                 | T-01-01-01〜06                                                                                                         |
| generation DD-02   | unit テストのみ                                    | T-01-03-01〜03                                                                                                         |
| generation DD-03   | テスト・型・定数ファイルの除外                     | T-01-06-01〜07                                                                                                         |
| generation DD-05   | TSX を TS と同様に扱う                             | T-01-02-02（対象解決）, T-16-02-01（生成）                                                                             |
| generation DD-06   | 残骸をソース集合に含めない                         | T-01-07-01〜04                                                                                                         |
| generation DD-07   | 決定的な順序                                       | T-01-04-01〜03（対象解決）, T-16-01-01（生成）                                                                         |
| generation DR-01   | 別ファイル方式のため残骸を除外                     | T-01-07-01                                                                                                             |
| Edge generation-1  | ソースが残らないモジュール                         | T-01-10-01                                                                                                             |
| Edge generation-2  | unit テストが無い                                  | T-01-11-01                                                                                                             |
| Edge generation-3  | 前回の残骸が配下にある                             | T-01-07-01〜04                                                                                                         |
| Edge generation-11 | `__tests__/`・spec・types・constants               | T-01-06-01〜07                                                                                                         |
| Edge generation-12 | `.tsx` を TS と同じ字句規則で扱う                  | T-16-02-01                                                                                                             |
| Edge generation-13 | CRLF の位置・行テキスト                            | 既存 `T-MUT-GM-01-14-03`, `T-MUT-GM-01-20-09`                                                                          |
| Edge generation-14 | 同一行に同じ字句が複数ある                         | T-02-10-01（生成側は既存 `T-MUT-GM-01-07-01`）                                                                         |
| Edge generation-15 | 同一の入力を 2 回生成する                          | T-16-01-01                                                                                                             |
| Edge generation-16 | 数値リテラル全体を 1 字句として n+1                | T-02-19-01〜02（生成側は既存 `T-MUT-GM-01-21-01〜07`）                                                                 |
| Edge generation-17 | 指数表記は変異体 0 件                              | 既存 `T-MUT-GM-01-21-08〜09`                                                                                           |
| Edge generation-18 | 非 ASCII 識別子                                    | 既存 `T-MUT-GM-01-22-01〜05`                                                                                           |
| Edge generation-19 | 文字列・テンプレート・後置 `++` `--` の後の `/`    | T-16-04-01（他は既存 `T-MUT-GM-01-23-01〜04`）                                                                         |
| Edge generation-20 | 行継続する文字列リテラル                           | 既存 `T-MUT-GM-01-23-05〜07`                                                                                           |
| Edge generation-21 | 式の先頭位置の `<`                                 | 既存 `T-MUT-GM-01-24-01〜07`                                                                                           |
| Edge generation-22 | リテラル型も変異体を生成する                       | T-16-05-01〜02, T-15-03-01                                                                                             |
| Edge generation-23 | 空白なしの比較 `a<b`                               | 既存 `T-MUT-GM-01-12-05`                                                                                               |
| Edge generation-24 | 桁は 1 始まりの UTF-16 コード単位                  | T-02-18-01, T-16-06-01                                                                                                 |
| execution R-214    | 位置不一致は error                                 | T-02-06-01〜03                                                                                                         |
| execution R-215    | 命名どおり別ファイル・改行と UTF-8 を保持          | T-02-01-01〜02, T-02-02-01〜02, T-02-07-01〜03, T-02-10-01, T-02-18-01, T-02-19-01〜02（書き出しそのものは Commit 14） |
| execution R-216    | 全キーを保ち imports を 1 件足す                   | T-02-03-01, T-02-04-01〜04, T-02-11-01, T-02-12-01                                                                     |
| execution R-220    | 終了 0 は survived                                 | T-03-03-01, T-03-10-02, T-03-13-01                                                                                     |
| execution R-221    | 型検査失敗は compile-error                         | T-03-03-02, T-03-07-01, T-03-08-01〜02, T-03-09-01, T-03-10-01, T-03-11-01, T-03-12-01, T-03-13-01                     |
| execution R-222    | 要約行で失敗を確認できれば killed                  | T-03-02-01〜03, T-03-03-03, T-03-05-03, T-03-08-01, T-03-09-02, T-03-14-01〜02                                         |
| execution R-223    | timeout                                            | T-03-03-04                                                                                                             |
| execution R-224    | 確認できない非 0・error は error                   | T-03-03-05, T-03-05-01〜03, T-03-08-02                                                                                 |
| execution DD-01    | 変異体・一時設定の命名                             | T-01-05-01〜04, T-01-08-01〜04, T-02-02-01〜02, T-02-03-01, T-02-05-01〜02, T-02-08-01, T-02-09-01〜03                 |
| execution DD-02    | 全キー保持 + imports 1 件、`--import-map` 不使用   | T-02-04-01〜03, T-02-11-01, T-02-12-01（`--import-map` 不使用は T-12-03-07）                                           |
| execution DD-03    | ANSI 除去 + stdout/stderr 連結 + 行頭判定          | T-03-01-01, T-03-06-01, T-03-07-01, T-03-09-01〜02, T-03-11-01, T-03-12-01                                             |
| execution DD-06    | 要約行の件数抽出（要約行が無ければ未検出）         | T-03-02-01, T-03-02-03, T-03-04-01, T-03-14-01〜02（0 件判定そのものは Commit 13）                                     |
| execution DD-09    | 位置不一致は error、テストを起動しない             | T-02-06-01〜03（起動しないことは Commit 14）                                                                           |
| execution DD-12    | killed は要約行で失敗を確認できた場合のみ          | T-03-03-03, T-03-05-01〜03                                                                                             |
| DR-01              | 一時設定の imports で差し替え                      | T-02-04-01, T-02-05-01〜02                                                                                             |
| DR-02              | compile-error を killed から分ける                 | T-03-03-02, T-03-10-01                                                                                                 |
| REQ-C-005          | 変異体・一時設定・ロックを `.gitignore` で除外     | T-02-17-01〜04                                                                                                         |
| Edge execution-1   | 置換前の字句が指定位置に無い                       | T-02-06-01                                                                                                             |
| Edge execution-2   | CRLF                                               | T-02-07-01                                                                                                             |
| Edge execution-3   | `.tsx`                                             | T-02-08-01, T-01-05-02                                                                                                 |
| Edge execution-4   | 番号が 1000 以上                                   | T-02-09-02〜03, T-01-05-03                                                                                             |
| Edge execution-5   | 変異による型エラー                                 | T-03-03-02, T-03-07-01                                                                                                 |
| Edge execution-6   | ANSI エスケープ                                    | T-03-01-01, T-03-07-01                                                                                                 |
| Edge execution-7   | 行頭以外の `Type checking failed`                  | T-03-08-01〜02                                                                                                         |
| Edge execution-8   | 非 0 で出力が空                                    | T-03-05-01                                                                                                             |
| Edge execution-9   | 制限時間超過（判定部分）                           | T-03-03-04（強制終了は Commit 10）                                                                                     |
| Edge execution-14  | 似た名前のファイル（命名判定の部分）               | T-01-08-01（掃除の振る舞いは Commit 12）                                                                               |
| Edge execution-15  | 前回の残骸（対象解決での除外の部分）               | T-01-07-01〜04（掃除は Commit 12）                                                                                     |
| Edge execution-27  | 起動設定の誤り・依存解決の失敗                     | T-03-05-02                                                                                                             |

> 範囲外: generation R-106〜R-112・DD-04・Edge generation-4〜10, 12, 13, 15〜24 は実装済みの `generateMutants`（既存の `T-MUT-GM-*`、Commit 1 で改称）が担い、
> 既存テストで未検証の分（DD-05・DD-07・閉じないコメント・Edge generation-12, 13, 15, 19, 22, 24）は T-16 で追補する。
> Edge generation-14 は T-02-10-01 が担う（生成側は既存 `T-MUT-GM-01-07-01`）。

### Coverage Check (T-04〜T-07)

#### allowlist §4 Decision Rules

| Item  | Task ID(s)                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R-501 | T-04-01-01, T-04-03-06                                                                                                                         |
| R-502 | T-04-03-01〜T-04-03-05, T-04-08-01〜T-04-08-04                                                                                                 |
| R-503 | T-04-02-01, T-04-04-01〜T-04-04-06                                                                                                             |
| R-504 | T-04-02-01, T-04-02-02, T-04-05-01〜T-04-05-21, T-04-06-01, T-04-06-02, T-04-09-01〜T-04-09-04                                                 |
| R-505 | T-04-07-01, T-04-07-02（ロック前に中止する順序は T-14 で扱う）                                                                                 |
| R-506 | T-05-04-01, T-05-04-02, T-05-04-03, T-05-04-04                                                                                                 |
| R-507 | T-05-01-01, T-05-05-01, T-05-06-01, T-05-06-02, T-05-06-05, T-05-08-01, T-05-08-03〜T-05-08-08, T-05-09-01, T-05-09-03, T-05-10-02, T-05-10-06 |
| R-508 | T-05-02-01〜T-05-02-05, T-05-06-04, T-05-08-07, T-05-10-02                                                                                     |
| R-509 | T-05-03-01, T-05-03-02, T-05-06-03, T-05-07-01, T-05-07-02, T-05-08-02, T-05-09-02, T-05-10-01, T-05-10-03                                     |
| R-510 | T-05-03-01（終了コードへの反映は T-07-07-01）                                                                                                  |

#### allowlist §5 Edge Cases

| Item              | Task ID(s)                         |
| ----------------- | ---------------------------------- |
| Edge allowlist-1  | T-04-01-01, T-05-02-01             |
| Edge allowlist-2  | T-04-08-01, T-04-08-02, T-04-08-03 |
| Edge allowlist-3  | T-04-04-01                         |
| Edge allowlist-4  | T-04-04-02                         |
| Edge allowlist-5  | T-04-07-01                         |
| Edge allowlist-6  | T-04-07-02                         |
| Edge allowlist-7  | T-05-05-01                         |
| Edge allowlist-8  | T-05-06-01, T-05-06-02             |
| Edge allowlist-9  | T-05-06-03, T-05-06-04             |
| Edge allowlist-10 | T-05-07-01, T-05-07-02             |
| Edge allowlist-11 | T-05-08-01                         |
| Edge allowlist-12 | T-05-08-02                         |
| Edge allowlist-13 | T-05-09-01                         |
| Edge allowlist-14 | T-05-09-02                         |
| Edge allowlist-15 | T-05-10-01                         |
| Edge allowlist-16 | T-05-06-05                         |
| Edge allowlist-17 | T-05-10-02                         |
| Edge allowlist-18 | T-05-10-03, T-14-22-07, T-14-22-08 |

#### allowlist §2.5 DD / implementation §3.4 既定値

| Item                                                          | Task ID(s)                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| allowlist DD-01 (→ DR-04)                                     | T-05-02-02〜T-05-02-05, T-05-06-01, T-05-06-02                         |
| allowlist DD-02                                               | T-05-09-01, T-06-09-03                                                 |
| allowlist DD-03                                               | T-05-08-01, T-05-08-03〜T-05-08-08, T-04-09-01                         |
| allowlist DD-04                                               | T-04-01-01                                                             |
| allowlist DD-05                                               | T-04-07-01, T-04-07-02, T-04-05-11, T-04-04-06, T-04-05-13, T-04-05-14 |
| allowlist DD-06                                               | T-05-09-02, T-05-10-03                                                 |
| allowlist DD-07                                               | T-07-01-02, T-07-07-01                                                 |
| impl §3.4 #1 (空白のみの理由)                                 | T-04-04-03                                                             |
| impl §3.4 #2 (型・値域)                                       | T-04-02-02, T-04-05-01〜T-04-05-08, T-04-05-16〜T-04-05-21             |
| impl §3.4 #3 (`/` 区切りの相対)                               | T-04-05-09, T-04-05-10, T-04-05-15, T-04-09-03, T-04-09-04             |
| impl §3.4 #4 (キー重複)                                       | T-04-06-01, T-04-06-02, T-04-09-02                                     |
| impl §3.4 #5 (空文書)                                         | T-04-08-01, T-04-08-02, T-04-08-04, T-04-03-03〜T-04-03-05             |
| allowlist §3.1 (モジュールごとに 1 ファイル)                  | T-04-02-03                                                             |
| impl Commit 7 前提 (判定の変異体は生成された変異体に含まれる) | T-05-10-04〜T-05-10-08                                                 |

#### report-cli §4 Decision Rules（本 fragment の範囲 R-605〜R-620）

| Item         | Task ID(s)                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| R-601〜R-604 | 範囲外: T-13（Commit 15 `parseMutateArgs`）                                        |
| R-605        | T-06-04-03, T-06-08-02, T-06-09-01                                                 |
| R-606        | T-06-08-01, T-06-08-02, T-06-08-03, T-06-08-04, T-06-08-05                         |
| R-607        | T-06-01-01, T-06-01-02, T-06-02-03, T-06-09-03                                     |
| R-608        | T-06-02-01, T-06-02-02, T-06-02-03, T-06-07-01, T-06-09-01, T-06-07-02, T-06-07-03 |
| R-609        | T-06-03-01, T-06-03-02, T-06-03-03, T-06-05-01                                     |
| R-610        | T-06-03-04, T-06-05-02, T-06-08-03                                                 |
| R-611        | T-06-03-05, T-06-05-03, T-06-08-04                                                 |
| R-612        | T-06-04-01, T-06-06-01, T-06-08-05                                                 |
| R-613        | T-06-04-02, T-06-06-02, T-06-06-03, T-06-04-04, T-06-04-05                         |
| R-614        | T-07-03-01, T-07-03-02, T-07-03-03                                                 |
| R-615        | T-07-04-01, T-07-04-02, T-07-04-03, T-07-10-01（実行前の中止経路は T-14）          |
| R-616        | T-07-01-01〜T-07-01-08                                                             |
| R-617        | T-07-05-01, T-07-10-02                                                             |
| R-618        | T-07-06-01, T-07-06-02, T-07-06-03, T-07-08-01, T-07-09-01                         |
| R-619        | T-07-07-01, T-07-08-02                                                             |
| R-620        | T-07-02-01, T-07-02-02, T-07-08-01                                                 |

#### report-cli §5 Edge Cases

| Item                 | Task ID(s)                                                |
| -------------------- | --------------------------------------------------------- |
| Edge report-cli-1〜7 | 範囲外: T-13（Commit 15 引数解決）                        |
| Edge report-cli-8    | T-06-08-01, T-07-01-08                                    |
| Edge report-cli-9    | T-07-08-01                                                |
| Edge report-cli-10   | T-06-08-03, T-07-08-02                                    |
| Edge report-cli-11   | T-06-03-01, T-07-01-01                                    |
| Edge report-cli-12   | T-07-05-01                                                |
| Edge report-cli-13   | T-07-02-01                                                |
| Edge report-cli-14   | T-06-07-01, T-07-01-03                                    |
| Edge report-cli-15   | T-07-06-01, T-07-06-02                                    |
| Edge report-cli-16   | T-07-06-03                                                |
| Edge report-cli-17   | T-06-03-04, T-07-01-02                                    |
| Edge report-cli-18   | T-07-07-01                                                |
| Edge report-cli-19   | T-06-03-05, T-07-04-01                                    |
| Edge report-cli-20   | T-06-04-01, T-07-01-06                                    |
| Edge report-cli-21   | T-06-04-02, T-07-01-07, T-06-04-04, T-06-04-05            |
| Edge report-cli-22   | T-06-02-03                                                |
| Edge report-cli-23   | T-06-04-03, T-07-03-02                                    |
| Edge report-cli-24   | 範囲外: T-14（Commit 16 main の許容リスト不正での中止）   |
| Edge report-cli-25   | 範囲外: T-14（Commit 16 main のベースライン失敗での中止） |
| Edge report-cli-26   | 範囲外: T-14（Commit 16 main のロック取得失敗での中止）   |
| Edge report-cli-27   | T-06-07-01                                                |
| Edge report-cli-28   | T-06-09-03, T-05-09-01                                    |

#### report-cli §2.5 DD

| Item             | Task ID(s)                                                 |
| ---------------- | ---------------------------------------------------------- |
| report-cli DD-01 | 範囲外: T-13（モジュール名の許可値）                       |
| report-cli DD-02 | T-06-09-02（テキストのみを返す純関数）、T-06 全体          |
| report-cli DD-03 | 範囲外: T-13（`--timeout`）                                |
| report-cli DD-04 | T-07-01-02, T-07-07-01                                     |
| report-cli DD-05 | T-06-02-01, T-06-02-02, T-06-02-03, T-07-06-01, T-07-09-01 |
| report-cli DD-06 | T-06-04-03, T-07-03-01                                     |
| report-cli DD-07 | T-06-04-01, T-07-01-06                                     |
| report-cli DD-08 | T-06-04-02, T-07-01-07                                     |
| report-cli DD-09 | T-07-03-01, T-07-10-01                                     |

#### Decision Records

| Item  | Task ID(s)                                                  |
| ----- | ----------------------------------------------------------- |
| DR-02 | T-05-04-04, T-06-01-01, T-06-02-03, T-07-01-05, T-07-06-03  |
| DR-03 | T-07-01-01, T-07-05-01                                      |
| DR-04 | T-05-01-01, T-05-05-01, T-05-09-01, T-06-01-02, T-06-09-03  |
| DR-08 | T-07-06-01（有効判定 0 件。ベースライン失敗の非 0 は T-14） |
| DR-09 | 範囲外: T-09 / T-14（ロック取得失敗）                       |

#### Acceptance Criteria

| Item   | Task ID(s)                              |
| ------ | --------------------------------------- |
| AC-010 | T-05-05-01                              |
| AC-011 | T-04-04-01（非 0 終了は T-14）          |
| AC-012 | T-05-06-03                              |
| AC-013 | T-06-03-01                              |
| AC-015 | T-07-01-01                              |
| AC-016 | T-07-05-01                              |
| AC-020 | T-07-06-01, T-07-06-02                  |
| AC-021 | T-06-08-01, T-07-01-08                  |
| AC-022 | T-07-07-01                              |
| AC-023 | T-07-03-01（後始末とロック解放は T-14） |

`[UNCOVERED]` なし。

### Coverage Check (T-08〜T-12)

#### execution §4 Decision Rules

| Item  | Covering Task ID(s)                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| R-201 | T-09-01-01, T-09-07-01 / 順序（ロック前に何もしない）は → T-14 (Commit 16)                                 |
| R-202 | T-09-03-01, T-09-03-02, T-09-03-03, T-09-06-01, T-09-06-02, T-09-06-03, T-09-06-04, T-09-06-05             |
| R-203 | T-09-01-01, T-09-01-02                                                                                     |
| R-204 | → T-14 (Commit 16)                                                                                         |
| R-205 | T-10-01-01〜06, T-10-06-01, T-10-07-01〜03, T-10-10-01 / ロック取得後に呼ぶ順序は → T-14                   |
| R-206 | T-10-02-01, T-10-02-02, T-10-09-01                                                                         |
| R-207 | T-11-02-01, T-11-02-03                                                                                     |
| R-208 | T-11-03-01〜05, T-11-04-01〜04, T-11-08-01 / 中止の経路（drift 検査を含む）は → T-14 (Commit 16)           |
| R-209 | T-11-01-01, T-11-07-01 / 逐次実行へ進む結線は → T-14 (Commit 16)                                           |
| R-210 | T-12-02-01, T-12-02-02, T-12-12-01                                                                         |
| R-211 | T-12-06-01, T-12-06-02, T-12-07-02, T-12-11-01                                                             |
| R-212 | T-10-03-01, T-10-03-02, T-10-03-03, T-10-08-01, T-10-09-01 / 実行後・中断後の呼び出しは → T-14             |
| R-213 | T-09-02-01, T-09-03-02, T-09-04-01, T-09-05-01, T-09-09-01 / レポート後に解放する順序は → T-14             |
| R-214 | T-12-05-01（`applyMutant` の位置判定そのものは → T-02 (Commit 4)）                                         |
| R-215 | T-12-03-01, T-12-03-03, T-12-13-01, T-12-13-03, T-12-16-01（文字列上の改行の保持は → T-02 (Commit 4)）     |
| R-216 | T-12-03-02, T-12-13-02, T-12-13-03, T-12-17-01（`buildMutationConfig` の網羅は → T-02 (Commit 4)）         |
| R-217 | T-08-01-01, T-08-01-02, T-08-02-01, T-08-06-01, T-08-06-03, T-08-07-01, T-12-03-02, T-12-03-04, T-12-03-06 |
| R-218 | T-08-04-01, T-08-05-01, T-08-06-01, T-08-06-05                                                             |
| R-219 | T-08-03-01, T-08-06-05, T-12-07-02, T-12-08-01, T-12-14-01, T-12-14-02, T-12-15-01                         |
| R-220 | → T-03 (Commit 5)（結線は T-12-02-02）                                                                     |
| R-221 | → T-03 (Commit 5)（結線は T-12-01-03）                                                                     |
| R-222 | → T-03 (Commit 5)（結線は T-12-01-01）                                                                     |
| R-223 | T-12-01-02 / 判定規則は → T-03 (Commit 5)                                                                  |
| R-224 | → T-03 (Commit 5)                                                                                          |
| R-225 | T-10-04-01, T-10-05-02, T-12-04-01, T-12-04-02, T-12-07-01, T-12-10-03, T-12-15-01                         |
| R-226 | T-10-04-02, T-10-05-01, T-10-05-02, T-12-05-02, T-12-09-01, T-12-09-02                                     |
| R-227 | T-08-06-02, T-08-06-04, T-11-05-01〜04, T-12-03-05, T-12-10-01〜04 / 130 で終える経路は → T-14             |
| R-228 | → T-14 (Commit 16)                                                                                         |

#### execution §5 Edge Cases

| Item                                                  | Covering Task ID(s)                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Edge execution-1（位置不一致）                        | T-12-05-01（`applyMutant` 単体は → T-02）                                                                     |
| Edge execution-2（CRLF）                              | T-12-16-01（書き出し）/ 文字列上の保持は → T-02 (Commit 4)                                                    |
| Edge execution-3（`.tsx`）                            | T-10-01-03（書き出しの命名は → T-02 (Commit 4)）                                                              |
| Edge execution-4（番号 1000 以上）                    | T-10-01-04（書き出しの命名は → T-02 (Commit 4)）                                                              |
| Edge execution-5（型エラー）                          | → T-03 (Commit 5)                                                                                             |
| Edge execution-6（ANSI）                              | T-08-06-03, T-11-06-01 / 判定は → T-03 (Commit 5)                                                             |
| Edge execution-7（行頭以外の Type checking）          | → T-03 (Commit 5)                                                                                             |
| Edge execution-8（非 0 で出力が空）                   | → T-03 (Commit 5)                                                                                             |
| Edge execution-9（制限時間超過）                      | T-08-04-01, T-08-05-01                                                                                        |
| Edge execution-10（書き出し・起動失敗）               | T-12-06-01, T-12-08-01                                                                                        |
| Edge execution-11（全件 error / timeout）             | T-12-11-01                                                                                                    |
| Edge execution-12（起動が例外を投げる）               | T-12-07-01, T-12-07-02                                                                                        |
| Edge execution-13（削除失敗）                         | T-10-05-01, T-12-09-01, T-12-09-02                                                                            |
| Edge execution-14（似た名前）                         | T-10-07-01                                                                                                    |
| Edge execution-15（前回の残骸とロック）               | T-09-03-01（ロック残存で中止）, T-10-01-01, T-10-01-02, T-10-01-05, T-10-01-06（削除後の掃除）/ 順序は → T-14 |
| Edge execution-16（実行中に元ファイル変化）           | T-10-03-02                                                                                                    |
| Edge execution-17（中断 + 元ファイル変化）            | T-10-03-02（突合）/ 中断時に drift 検査を呼ぶ経路は → T-14                                                    |
| Edge execution-18（元ソースで失敗）                   | T-11-03-01                                                                                                    |
| Edge execution-19（要約行が無い）                     | T-11-03-05                                                                                                    |
| Edge execution-20（ベースライン timeout・起動失敗）   | T-11-03-02, T-11-03-03                                                                                        |
| Edge execution-21（2 つ目のハーネス）                 | T-09-03-01, T-09-07-01 / 掃除を走らせない順序は → T-14                                                        |
| Edge execution-22（保持者が存在しない）               | T-09-06-03                                                                                                    |
| Edge execution-23（記録を読めない）                   | T-09-06-01, T-09-06-02, T-09-06-04, T-09-06-05                                                                |
| Edge execution-24（変異体実行中の SIGINT）            | T-12-10-01, T-12-10-02, T-12-10-03 / 130 は → T-14                                                            |
| Edge execution-25（後始末中の追加 SIGINT）            | → T-14 (Commit 16): T-14-24-01                                                                                |
| Edge execution-26（ロック取得前の SIGINT）            | → T-14 (Commit 16)                                                                                            |
| Edge execution-27（起動設定の誤り）                   | → T-03 (Commit 5)                                                                                             |
| Edge execution-28（掃除・ハッシュ・レポートの失敗）   | T-10-06-01（失敗パスの返却）/ 中止の判断は → T-14                                                             |
| Edge execution-29（ベースラインが元ソースを書き換え） | T-11-03-01（failed）, T-10-03-02（突合）/ 中止時の drift 報告は → T-14                                        |
| Edge execution-30（掃除・ハッシュ記録中の SIGINT）    | → T-14 (Commit 16)                                                                                            |

#### execution §2.5 Behavioral Design Decisions

| Item                      | Covering Task ID(s)                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------- |
| execution DD-01           | T-10-01-03, T-10-01-04, T-12-13-01, T-12-13-02, T-12-13-03 / 命名生成の網羅は → T-02    |
| execution DD-02 (→ DR-01) | T-12-03-02, T-12-03-07 / 設定生成の網羅は → T-02                                        |
| execution DD-03           | T-08-01-02, T-08-06-03, T-08-07-01（出力を捨てない）, T-12-01-03（結線）/ 識別は → T-03 |
| execution DD-04           | T-08-04-01, T-08-05-01, T-08-06-05                                                      |
| execution DD-05           | T-10-04-02, T-10-05-01, T-10-05-02, T-12-05-02, T-12-09-01, T-12-09-02                  |
| execution DD-06           | T-11-03-04, T-11-03-05, T-11-04-03, T-11-04-04, T-11-06-01, T-11-07-01                  |
| execution DD-07           | T-09-01-02, T-09-01-03, T-09-03-03, T-09-06-01〜05                                      |
| execution DD-08           | T-12-10-03 / 130 と追加 SIGINT の扱いは → T-14                                          |
| execution DD-09           | T-12-05-01                                                                              |
| execution DD-10           | T-11-02-01, T-11-02-02, T-11-03-02, T-11-03-03, T-11-04-02, T-11-08-01                  |
| execution DD-12           | → T-03 (Commit 5)                                                                       |
| execution DD-13           | T-09-01-03, T-09-02-01, T-09-04-01, T-09-08-01, T-09-09-01                              |
| execution DD-14           | T-09-05-01, T-09-08-01, T-09-09-01, T-10-06-01 / 監査単位の中止は → T-14                |

#### execution §2.6 Related Decision Records

| Item  | Covering Task ID(s)                                                          |
| ----- | ---------------------------------------------------------------------------- |
| DR-01 | T-12-03-01, T-12-03-02 / 実プロセスでの差し替えの有効性は → T-15 (Commit 18) |
| DR-02 | → T-03 (Commit 5)                                                            |
| DR-05 | T-12-02-01                                                                   |
| DR-08 | T-11-01-01, T-11-03-01〜05                                                   |
| DR-09 | T-09-03-01, T-09-07-01 / 掃除をロック取得後に行う順序は → T-14 (Commit 16)   |

#### 本分冊の範囲外へ送った項目（組み立て時の突合用）

- → T-14 (Commit 16): R-204、R-228、Edge execution-26・30、および R-201 / R-205 / R-208 / R-209 / R-212 / R-213 / R-227 / DD-08 / DD-14 / DR-09 / Edge execution-15・17・21・24・25・28・29 の main 側の順序・中止経路・130
- → T-02 (Commit 4): R-214〜R-216 の部品単体、Edge execution-2、DD-01 / DD-02 の生成側
- → T-03 (Commit 5): R-220〜R-224、Edge execution-5・7・8・27、DD-03 の識別、DD-12、DR-02
- → T-15 (Commit 18): DR-01 の実プロセスでの有効性

### Coverage Check (T-13〜T-15)

| 項目                                                                                | 出典                     | Task ID                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| index R-001 引数の解釈・不正なら何もせず非 0                                        | index §4                 | T-13-04〜T-13-06, T-14-12-01, T-14-12-02, T-14-12-03                                                                               |
| index R-002 対象解決 (main からの呼び出し)                                          | index §4                 | T-14-10-01                                                                                                                         |
| index R-003 許容リストの検証                                                        | index §4                 | T-14-13-01, T-14-13-02                                                                                                             |
| index R-004 ロック取得・失敗時は何もしない                                          | index §4                 | T-14-14-01, T-14-14-02                                                                                                             |
| index R-005 掃除                                                                    | index §4                 | T-14-10-01, T-14-15-03                                                                                                             |
| index R-006 ハッシュ記録                                                            | index §4                 | T-14-10-01, T-14-16-01                                                                                                             |
| index R-007 ベースライン                                                            | index §4                 | T-14-18-01〜T-14-18-03, T-14-11-04                                                                                                 |
| index R-008 生成・0 件で照合は古いエントリのみ                                      | index §4                 | T-14-10-06, T-14-11-01, T-14-11-03, T-14-11-04                                                                                     |
| index R-009 逐次処理 (main からの呼び出し)                                          | index §4                 | T-14-10-01, T-14-10-06                                                                                                             |
| index R-010 照合                                                                    | index §4                 | T-14-10-01, T-14-11-03                                                                                                             |
| index R-011 drift 突合                                                              | index §4                 | T-14-19-01, T-14-19-02                                                                                                             |
| index R-012 レポート出力                                                            | index §4                 | T-14-10-02, T-14-26-02                                                                                                             |
| index R-013 ロック解放と終了コード                                                  | index §4                 | T-14-10-01, T-14-10-03, T-14-10-04                                                                                                 |
| index R-014 SIGINT                                                                  | index §4                 | T-14-20-01, T-14-21-06, T-14-22-01, T-14-22-05                                                                                     |
| index 補足規則 (あらゆる経路でロック解放)                                           | index §4                 | T-14-15-02, T-14-16-02, T-14-17-02, T-14-18-03, T-14-27-01                                                                         |
| execution R-201 ロック前は作成・削除・起動しない                                    | execution §4.1           | T-14-12-02, T-14-14-02                                                                                                             |
| execution R-204 ロック取得後に SIGINT の受信開始                                    | execution §4.1           | T-14-23-01, T-14-23-02                                                                                                             |
| execution R-208 ベースライン失敗で中止・drift 検査                                  | execution §4.1           | T-14-18-01, T-14-18-04                                                                                                             |
| execution R-209 ベースライン成功で逐次実行へ                                        | execution §4.1           | T-14-10-01                                                                                                                         |
| execution R-212 ハッシュ再取得と突合                                                | execution §4.1           | T-14-19-01, T-14-22-03, T-15-02-01                                                                                                 |
| execution R-213 ロック解放 (取得できなかったものに触れない)                         | execution §4.1           | T-14-10-01, T-14-14-03                                                                                                             |
| execution R-227 SIGINT (結線)                                                       | execution §4.3           | T-14-20-01〜T-14-20-06, T-14-21-02, T-14-22-02                                                                                     |
| execution R-228 後始末後の drift・レポート・解放・130                               | execution §4.3           | T-14-21-04〜T-14-21-06, T-14-22-03〜T-14-22-05                                                                                     |
| execution R-215 / R-216 / R-220 / R-221 / R-225 (実プロセス)                        | execution §4.2           | T-15-04-01, T-15-01-01, T-15-01-02, T-15-03-01, T-15-02-02                                                                         |
| report-cli R-601                                                                    | report-cli §4.1          | T-13-04-01, T-13-04-02, T-13-04-03                                                                                                 |
| report-cli R-602                                                                    | report-cli §4.1          | T-13-05-01〜T-13-05-07                                                                                                             |
| report-cli R-603                                                                    | report-cli §4.1          | T-13-06-01〜T-13-06-07, T-13-07-03                                                                                                 |
| report-cli R-604                                                                    | report-cli §4.1          | T-13-01-01〜T-13-03-01, T-13-07-01, T-13-07-02, T-13-02-02                                                                         |
| report-cli 4.1 の評価順                                                             | report-cli §4.1          | T-13-08-01, T-13-08-02                                                                                                             |
| report-cli R-614 (結線)                                                             | report-cli §4.3          | T-14-21-01, T-14-22-06                                                                                                             |
| report-cli R-615 (結線)                                                             | report-cli §4.3          | T-14-15-01, T-14-16-01, T-14-17-01, T-14-18-02, T-14-19-01                                                                         |
| allowlist R-505 (結線)                                                              | allowlist §4             | T-14-13-01                                                                                                                         |
| allowlist R-509 / DD-06 / Edge allowlist-18 中断時も生成済みの全変異体で照合 (結線) | allowlist §4 / §5        | T-14-22-07, T-14-22-08                                                                                                             |
| Edge index-1 変異体 0 件                                                            | index §5                 | T-14-11-01, T-14-11-02                                                                                                             |
| Edge index-3 許容リスト不正とロック競合                                             | index §5                 | T-14-13-02                                                                                                                         |
| Edge index-4 ベースラインで中止                                                     | index §5                 | T-14-18-01〜T-14-18-03                                                                                                             |
| Edge index-5 実行中の SIGINT                                                        | index §5                 | T-14-22-01                                                                                                                         |
| Edge index-6 ハッシュ記録前の SIGINT                                                | index §5                 | T-14-20-01〜T-14-20-05                                                                                                             |
| Edge index-7 強制終了でロックが残っている                                           | index §5                 | T-14-14-01                                                                                                                         |
| Edge index-8 後始末で削除できないファイル                                           | index §5                 | T-14-26-01                                                                                                                         |
| Edge index-10 実行中に元ソースが書き換わる                                          | index §5                 | T-14-19-01                                                                                                                         |
| Edge index-11 CRLF                                                                  | index §5                 | T-15-04-01                                                                                                                         |
| Edge report-cli-1〜7 (引数)                                                         | report-cli §5            | T-13-04-01, T-13-05-01, T-13-05-02, T-13-05-03, T-13-05-05, T-13-06-01〜T-13-06-04, T-13-06-06, T-13-07-01, T-13-04-03, T-13-05-07 |
| Edge report-cli-8 変異体 0 件・strict なし                                          | report-cli §5            | T-14-11-02                                                                                                                         |
| Edge report-cli-23 SIGINT                                                           | report-cli §5            | T-14-22-01, T-14-22-06                                                                                                             |
| Edge report-cli-24 許容リストの読み込みエラー                                       | report-cli §5            | T-14-13-01, T-14-13-03                                                                                                             |
| Edge report-cli-25 ベースラインの失敗                                               | report-cli §5            | T-14-18-02, T-14-18-05                                                                                                             |
| Edge report-cli-26 ロック取得の失敗                                                 | report-cli §5            | T-14-14-01, T-14-14-04                                                                                                             |
| Edge execution-2 CRLF                                                               | execution §5             | T-15-04-01                                                                                                                         |
| Edge execution-5 型エラー                                                           | execution §5             | T-15-03-01                                                                                                                         |
| Edge execution-15 (前半: ロックが残っていれば中止)                                  | execution §5             | T-14-14-01                                                                                                                         |
| Edge execution-16 実行中の drift                                                    | execution §5             | T-14-19-01                                                                                                                         |
| Edge execution-17 SIGINT 中断時の drift                                             | execution §5             | T-14-22-03                                                                                                                         |
| Edge execution-18 元ソースでテスト失敗                                              | execution §5             | T-14-18-01                                                                                                                         |
| Edge execution-21 2 つ目のハーネス                                                  | execution §5             | T-14-14-02                                                                                                                         |
| Edge execution-22 保持者が存在しないロック                                          | execution §5             | T-14-14-01                                                                                                                         |
| Edge execution-24 変異体の実行中の SIGINT                                           | execution §5             | T-14-22-01                                                                                                                         |
| Edge execution-25 後始末中の追加 SIGINT                                             | execution §5             | T-14-24-01                                                                                                                         |
| Edge execution-26 ロック取得前の SIGINT                                             | execution §5             | T-14-23-02                                                                                                                         |
| Edge execution-28 掃除・ハッシュ・レポートの失敗                                    | execution §5             | T-14-15-01, T-14-16-01, T-14-17-01                                                                                                 |
| Edge execution-29 ベースラインが元ソースを書き換える                                | execution §5             | T-14-18-04                                                                                                                         |
| Edge execution-30 掃除・ハッシュ記録中の SIGINT                                     | execution §5             | T-14-20-01, T-14-20-06                                                                                                             |
| index DD-01 実行順序                                                                | index §2.5               | T-14-10-01                                                                                                                         |
| index DD-02 許容リストの検証はロックより前                                          | index §2.5               | T-14-13-02                                                                                                                         |
| index DD-03 変異体単位と監査単位の失敗                                              | index §2.5               | T-14-26-01, T-14-27-02                                                                                                             |
| index DD-04 SIGINT と 130                                                           | index §2.5               | T-14-20-01, T-14-20-03                                                                                                             |
| index DD-05 残骸は終了コードを変えない                                              | index §2.5               | T-14-26-01                                                                                                                         |
| index DD-06 モジュール名の値                                                        | index §2.5               | T-13-01-01, T-13-05-02, T-13-05-03                                                                                                 |
| index DD-08 差し替えの有効性は integration で固定                                   | index §2.5               | T-15-01-01, T-15-05-01                                                                                                             |
| report-cli DD-01 許可値                                                             | report-cli §2.5          | T-13-01-01〜T-13-01-06, T-13-05-02〜T-13-05-04, T-13-05-07                                                                         |
| report-cli DD-03 `--timeout` は正の整数・既定 120                                   | report-cli §2.5          | T-13-03-01, T-13-06-01, T-13-07-01, T-13-07-03                                                                                     |
| report-cli DD-06 SIGINT で 130                                                      | report-cli §2.5          | T-14-21-01, T-14-22-06                                                                                                             |
| report-cli §2.2 警告は標準エラー出力                                                | report-cli §2.2          | T-14-25-02                                                                                                                         |
| report-cli §3.2 実行前の中止はレポートを構成しない                                  | report-cli §3.2          | T-14-13-03, T-14-14-04, T-14-18-05                                                                                                 |
| implementation Commit 16 変異体 0 件でもベースラインを実行                          | implementation Commit 16 | T-14-11-04                                                                                                                         |
| `MainDeps` 案 `signals.onInterrupt` の登録解除                                      | T-14 blockquote          | T-14-28-01〜T-14-28-03                                                                                                             |
| execution DD-03 compile-error の識別 (実出力)                                       | execution §2.5           | T-15-03-01                                                                                                                         |
| execution DD-05 残骸は終了コードを変えない                                          | execution §2.5           | T-14-26-01                                                                                                                         |
| execution DD-08 追加の SIGINT で後始末を省略しない                                  | execution §2.5           | T-14-24-01                                                                                                                         |
| execution DD-10 ベースラインにも同じ制限時間                                        | execution §2.5           | T-14-10-05                                                                                                                         |
| execution DD-13 ロック解放の照合 (取得失敗時は触れない)                             | execution §2.5           | T-14-14-03, T-14-25-01                                                                                                             |
| execution DD-14 監査単位の例外経路                                                  | execution §2.5           | T-14-15-01〜T-14-17-02, T-14-25-01, T-14-25-02                                                                                     |
| DR-01 別ファイル + 一時設定の imports                                               | decision-records         | T-15-01-01, T-15-05-01                                                                                                             |
| DR-02 compile-error を分ける                                                        | decision-records         | T-15-03-01                                                                                                                         |
| DR-03 既定はレポートのみ、`--strict` で失敗                                         | decision-records         | T-14-10-03, T-14-10-04                                                                                                             |
| DR-08 ベースライン                                                                  | decision-records         | T-14-18-01                                                                                                                         |
| DR-09 ロックと掃除の順序                                                            | decision-records         | T-14-10-01, T-14-14-02                                                                                                             |
| AC-014                                                                              | requirements v1.1.0      | T-13-05-01, T-14-12-01, T-14-12-02                                                                                                 |
| AC-017 / AC-018                                                                     | requirements v1.1.0      | T-14-18-01                                                                                                                         |
| AC-019                                                                              | requirements v1.1.0      | T-14-14-02                                                                                                                         |
| AC-021                                                                              | requirements v1.1.0      | T-14-11-02                                                                                                                         |
| AC-023                                                                              | requirements v1.1.0      | T-14-22-01                                                                                                                         |
| AC-024                                                                              | requirements v1.1.0      | T-13-06-01, T-14-12-03                                                                                                             |
| AC-003 / AC-009 (実プロセス)                                                        | requirements v1.1.0      | T-15-02-01                                                                                                                         |

範囲外として他の断片が担う行: Edge index-2 (T-07-01-03, T-07-01-04, T-07-06-01, T-07-06-02)・index-9 (T-05-09-01)、Edge report-cli-9〜22・27・28 (`formatReport` / `decideExitCode` / `matchAllowlist`)、Edge execution-1・3〜4・6〜14・19〜20・23・27 (ステージング・判定・実行・ロック・掃除の各単体)、DR-04・DR-05・DR-06・DR-07、index DD-07 (`decideExitCode`)、report-cli DD-02・DD-04・DD-05・DD-07〜DD-09 (`formatReport` / `decideExitCode`)、execution DD-01・DD-02・DD-04・DD-06・DD-07・DD-09・DD-12。

---

## Category Balance

| Test Target | Normal  | Error   | Edge    | Cases   | 判定  |
| ----------- | ------- | ------- | ------- | ------- | ----- |
| T-01        | 22      | [N/A]   | 24      | 46      | [N/A] |
| T-02        | 17      | 7       | 16      | 40      | [OK]  |
| T-03        | 9       | 4       | 17      | 30      | [OK]  |
| T-04        | 4       | 37      | 8       | 49      | [OK]  |
| T-05        | 8       | 4       | 27      | 39      | [OK]  |
| T-06        | 10      | 5       | 17      | 32      | [OK]  |
| T-07        | 10      | 11      | 5       | 26      | [OK]  |
| T-08        | 3       | 3       | 6       | 12      | [OK]  |
| T-09        | 4       | 5       | 8       | 17      | [OK]  |
| T-10        | 13      | 3       | 6       | 22      | [OK]  |
| T-11        | 4       | 10      | 6       | 20      | [OK]  |
| T-12        | 14      | 12      | 11      | 37      | [OK]  |
| T-13        | 9       | 17      | 5       | 31      | [OK]  |
| T-14        | 10      | 24      | 32      | 66      | [OK]  |
| T-15        | 4       | 1       | 4       | 9       | [OK]  |
| T-16        | 2       | 1       | 6       | 9       | [OK]  |
| **合計**    | **143** | **144** | **199** | **486** | —     |

> **[N/A] T-01** — 対象解決は失敗する経路を持たない。モジュール名は report-cli R-602 で検査済みのものしか渡されず、
> 空の集合もエラーにしない (generation §3.2)。空集合はエッジケースに分類した。

## ゼロ件のカテゴリを持つ Test Target は存在しない (`[N/A]` は仕様上異常系が存在しないことを根拠付きで示したものであり、0 件とは区別する)

## Open Questions

2026-10-09 の差分監査で見つかった、仕様が振る舞いを定めていない箇所。**タスクは起票していない。**
`/deckrd spec --phase` で仕様を確定させてから、該当 Test Target にタスクを追記する。

| #    | 内容                                                                                                            | 影響する Test Target | beads           |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------------------- | --------------- |
| OQ-1 | ソースが欠落したときの `hashSources`: drift とする (T-10-08-01) か、大きく失敗する (execution DD-14) か         | T-10                 | `cle-kju.17.11` |
| OQ-2 | ロック前に `temp/` が無いとき、作成してよいか (execution R-201「ロック前に何も作らない」)                       | T-09                 | `cle-kju.17.12` |
| OQ-3 | allowlist の `before: ""` をエラーにするか (§3.1 が空文字を許すのは `after` だけ)                               | T-04                 | `cle-kju.17.13` |
| OQ-4 | ベースライン中断で `generatedCount` が 0 のとき、中断見出しの横に「変異体 0 件」(report-cli R-606) を出すか     | T-06 / T-14          | `cle-kju.17.14` |
| OQ-5 | Edge generation-22 の Rationale「型エラーで kill される」が execution R-221 / DR-02 の compile-error と食い違う | (spec 文言のみ)      | `cle-kju.17.15` |
