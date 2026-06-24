---
title: "Implementation Tasks"
module: "pipeline/set-frontmatter"
status: Active
created: "2026-06-24 00:00:00"
source: "リファクタリング方針: ChatlogEntry を情報キャリアとして一気通貫化"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma
  -->
<!-- markdownlint-disable no-duplicate-heading line-length -->
<!-- cspell:words MECE setfm -->

> このドキュメントは `skills/set-frontmatter/scripts/modules/` 配下の各モジュールを
> `ChatlogEntry` を情報キャリアとして一気通貫化するリファクタリングタスクを定義する。
> 各タスクは段階的に実施し、各ステップ完了後にテストスイートが全件 GREEN であることを確認する。

---

## 背景と方針

### 現在の問題

各フェーズが `{ file: string, type, category, yaml }` などのプレーンオブジェクトを返し、
オーケストレーター (`set-frontmatter.ts`) が `Map<string, Result>` でファイルパスをキーに突き合わせている。
`ChatlogEntry` 自体が `filePath` と `frontmatter` を保持しているのに、フェーズ間の受け渡しが二重管理になっている。

### 目標

フェーズ間の受け渡しを `ChatlogEntry[]` のみにする。各フェーズが `entry.frontmatter.set()` で
結果を entry に書き込み、次フェーズが `entry.frontmatter.get()` で読み出す設計にする。

### 不変条件（各タスク完了後に必ず満たすこと）

1. `deno task test:unit` が全件 GREEN
2. `deno task test:module fixtures set-frontmatter` が全件 GREEN（回帰確認）
3. `dprint check` が clean

### MECE 設計原則

各タスクは **1モジュール + その呼び出し元 + 影響するテスト** を同時に変更する。
モジュールだけ変更してオーケストレーターを後回しにすると、途中でテストが RED になる。

---

## Task Summary

| Test Target                                                  | Scenarios | Cases | Status  |
| ------------------------------------------------------------ | --------- | ----- | ------- |
| T-01: `judgeType` 返り値を void 化                           | 3         | 7     | pending |
| T-02: `judgeCategory` 引数・返り値を簡略化                   | 3         | 6     | pending |
| T-03: `generateFrontmatter` を entry 直接書き込みに変更      | 3         | 7     | pending |
| T-04: `reviewFrontmatter` を entry 直接書き込みに変更        | 3         | 6     | pending |
| T-05: `writeFrontmatter` から `FrontmatterResult` 依存を除去 | 2         | 4     | pending |
| T-06: 不要型・不要 import の削除（クリーンアップ）           | 2         | 4     | pending |

---

## T-01: `judgeType` 返り値を void 化

### 変更概要

`judgeType` が `TypeResult[]` を返す代わりに、判定結果を `entry.frontmatter.set('type', value)` で
entry に直接書き込む。オーケストレーター側の `typeMap` を削除する。

**変更ファイル:**

- `skills/set-frontmatter/scripts/modules/setfm-type.ts`
- `skills/set-frontmatter/scripts/set-frontmatter.ts`
- `skills/set-frontmatter/scripts/__tests__/fixtures/frontmatter.fixtures.spec.ts`（シグネチャ変更に追従）

**不変条件:** フォールバック値 `DEFAULT_FALLBACK_TYPE` は引き続き適用される。

### [正常] Normal Cases

#### T-01-01: `judgeType` の返り値が `void` になる

- [ ] **T-01-01-01**: `judgeType` を呼び出した後、各 entry の `frontmatter.get('type')` が有効な type 値を返す
  - Target: `judgeType` / `setfm-type.ts`
  - Scenario: Given 有効な entries と dics を渡す, When `judgeType(entries, maxLen, dics, prompts)` を呼び出す
  - Expected: Then `entries[i].frontmatter.get('type')` が `dics.typeEntries` のいずれかの key と一致する

- [ ] **T-01-01-02**: オーケストレーターで `typeMap` が不要になる（`typeChunks.flat()` / `typeMap.get()` が削除される）
  - Target: `set-frontmatter.ts`
  - Scenario: Given Phase 2 完了後, When Phase 3a の `type` を取得する
  - Expected: Then `entry.frontmatter.get('type')` から直接取得できる（Map 参照なし）

#### T-01-02: フォールバック値が entry に書き込まれる

- [ ] **T-01-02-01**: AI が無効な type を返したとき `DEFAULT_FALLBACK_TYPE` が entry に書き込まれる
  - Target: `judgeType` フォールバック処理
  - Scenario: Given AI が辞書にない type 文字列を返す, When `judgeType` を呼び出す
  - Expected: Then `entry.frontmatter.get('type')` が `DEFAULT_FALLBACK_TYPE` と等しい

- [ ] **T-01-02-02**: AI 呼び出しが例外を throw したとき `DEFAULT_FALLBACK_TYPE` が entry に書き込まれる
  - Target: `judgeType` 例外ハンドリング
  - Scenario: Given `runAI` が throw する, When `judgeType` を呼び出す
  - Expected: Then `entry.frontmatter.get('type')` が `DEFAULT_FALLBACK_TYPE` と等しい

### [異常] Error Cases

#### T-01-03: プロンプトテンプレートが未定義のときエラーを throw する

- [ ] **T-01-03-01**: `prompts.prompts.get('type')` が `undefined` のとき `ChatlogError` を throw する
  - Target: `judgeType` ガード条件
  - Scenario: Given `prompts.prompts` に `'type'` キーが存在しない, When `judgeType` を呼び出す
  - Expected: Then `ChatlogError('InvalidArgs', 'NotDefined')` が throw される

### [エッジケース] Edge Cases

#### T-01-04: fixtures テストが新シグネチャに追従する

- [ ] **T-01-04-01**: `frontmatter.fixtures.spec.ts` の `judgeType` 呼び出し後の検証が、
      返り値ではなく `entry.frontmatter.get('type')` を参照するように書き換えられる
  - Target: `frontmatter.fixtures.spec.ts`
  - Scenario: Given シグネチャ変更後, When fixtures テストを実行する
  - Expected: Then 全件 GREEN（テスト数・テスト内容は変わらない）

- [ ] **T-01-04-02**: `TypeResult` 型が `phase.types.ts` から削除され、
      他ファイルで参照されていないことを型チェックで確認する
  - Target: `phase.types.ts` / 型チェック
  - Scenario: Given `TypeResult` を削除した後, When `deno check` を実行する
  - Expected: Then エラーなし

---

## T-02: `judgeCategory` 引数・返り値を簡略化

### 変更概要

`judgeCategory` が `type: LogType` 引数を受け取る代わりに `entry.frontmatter.get('type')` で取得し、
返り値 `string` の代わりに `entry.frontmatter.set('category', value)` で書き込む。
オーケストレーター側の `categoryMap` を削除する。

**変更ファイル:**

- `skills/set-frontmatter/scripts/modules/setfm-category.ts`
- `skills/set-frontmatter/scripts/set-frontmatter.ts`
- `skills/set-frontmatter/scripts/__tests__/fixtures/frontmatter.fixtures.spec.ts`（シグネチャ変更に追従）

**前提:** T-01 完了済み（`entry.frontmatter.get('type')` が有効な値を持つ）。

### [正常] Normal Cases

#### T-02-01: `judgeCategory` が `entry.frontmatter` から type を取得する

- [ ] **T-02-01-01**: `judgeCategory` 呼び出し後、`entry.frontmatter.get('category')` が有効な category 値を返す
  - Target: `judgeCategory` / `setfm-category.ts`
  - Scenario: Given `entry.frontmatter.get('type')` が有効な type 値を持つ, When `judgeCategory(entry, maxLen, dics, prompts)` を呼び出す
  - Expected: Then `entry.frontmatter.get('category')` が `dics.category.split(',')` のいずれかと一致する

- [ ] **T-02-01-02**: `type` 引数が削除され、オーケストレーターが `categoryMap` を使わなくなる
  - Target: `set-frontmatter.ts`
  - Scenario: Given Phase 3a 完了後, When Phase 3b の `category` を取得する
  - Expected: Then `entry.frontmatter.get('category')` から直接取得できる（Map 参照なし）

#### T-02-02: フォールバック値が entry に書き込まれる

- [ ] **T-02-02-01**: AI が無効な category を返したとき `DEFAULT_FALLBACK_CATEGORY` が entry に書き込まれる
  - Target: `judgeCategory` フォールバック処理
  - Scenario: Given AI が辞書にない category 文字列を返す, When `judgeCategory` を呼び出す
  - Expected: Then `entry.frontmatter.get('category')` が `DEFAULT_FALLBACK_CATEGORY` と等しい

### [異常] Error Cases

#### T-02-03: プロンプトテンプレートが未定義のときエラーを throw する

- [ ] **T-02-03-01**: `prompts.prompts.get('category')` が `undefined` のとき `ChatlogError` を throw する
  - Target: `judgeCategory` ガード条件
  - Scenario: Given `prompts.prompts` に `'category'` キーが存在しない, When `judgeCategory` を呼び出す
  - Expected: Then `ChatlogError('InvalidArgs', 'NotDefined')` が throw される

### [エッジケース] Edge Cases

#### T-02-04: fixtures テストが新シグネチャに追従する

- [ ] **T-02-04-01**: `frontmatter.fixtures.spec.ts` の `judgeCategory` 呼び出しが
      `type` 引数なしになり、返り値参照が `entry.frontmatter.get('category')` に変わる
  - Target: `frontmatter.fixtures.spec.ts`
  - Scenario: Given シグネチャ変更後, When fixtures テストを実行する
  - Expected: Then 全件 GREEN

- [ ] **T-02-04-02**: オーケストレーターの `type` フォールバック（`?? 'research'`）が削除され、
      T-01 で書き込んだ値をそのまま利用する
  - Target: `set-frontmatter.ts`
  - Scenario: Given `entry.frontmatter.get('type')` が常に有効（T-01 保証）
  - Expected: Then `?? 'research'` のハードコードなしで動作する

---

## T-03: `generateFrontmatter` を entry 直接書き込みに変更

### 変更概要

`generateFrontmatter` が `FrontmatterResult` を返す代わりに、AI 生成 YAML をパースして
`entry.frontmatter.set(key, val)` で直接書き込む。`type`/`category` 引数も削除する。
`fmResultMap` のうち yaml 管理部分を削除する。

変更ファイル:

- `skills/set-frontmatter/scripts/modules/setfm-frontmatter.ts`
- `skills/set-frontmatter/scripts/set-frontmatter.ts`
- `skills/set-frontmatter/scripts/__tests__/fixtures/frontmatter.fixtures.spec.ts`（シグネチャ変更に追従）

前提:
  T-01・T-02 完了済み。

注意:
  `reviewFrontmatter` は現在 `FrontmatterResult.yaml` を参照している。
  T-03 完了後は `entry.frontmatter.toFrontmatter()` または entry の各フィールドから読み出す形にするため、
  `reviewFrontmatter` のシグネチャ変更は T-04 で行う。
  T-03 単体では `reviewFrontmatter` の入力を `entry` に変更しないが、
  `fmResultMap` から entry を直接渡せるようオーケストレーターを暫定的に修正する。

### [正常] Normal Cases

#### T-03-01: `generateFrontmatter` が entry に AI 生成フィールドを書き込む

- [ ] **T-03-01-01**: `generateFrontmatter` 呼び出し後、`entry.frontmatter.get('title')` が非空文字列になる
  - Target: `generateFrontmatter` / `setfm-frontmatter.ts`
  - Scenario: Given 有効な entry と dics を渡す, When `generateFrontmatter(entry, maxLen, dics, prompts)` を呼び出す
  - Expected: Then `entry.frontmatter.get('title')` が存在する

- [ ] **T-03-01-02**: `type` / `category` 引数が削除され、`entry.frontmatter.get()` から取得する
  - Target: `setfm-frontmatter.ts`
  - Scenario: Given `entry.frontmatter` に type / category が設定済み
  - Expected: Then 引数で渡さずとも正しい type / category がプロンプトに使われる

- [ ] **T-03-01-03**: `fmResultMap` が削除され、`entry` が直接 Phase 3.5 に渡される
  - Target: `set-frontmatter.ts`
  - Scenario: Given Phase 3b 完了後
  - Expected: Then `fmResultMap.get()` の代わりに `entries[]` をそのまま渡せる

#### T-03-02: AI 失敗時でも entry は壊れない

- [ ] **T-03-02-01**: `runAI` が throw したとき entry の既存フィールドは変更されない
  - Target: `generateFrontmatter` 例外ハンドリング
  - Scenario: Given `runAI` が throw する, When `generateFrontmatter` を呼び出す
  - Expected: Then entry は変更なし（title 等が追加されない）

### [異常] Error Cases

#### T-03-03: AI が空 YAML を返したとき entry に書き込まない

- [ ] **T-03-03-01**: `cleanYaml` が空文字列を返したとき、entry の frontmatter は変更されない
  - Target: `generateFrontmatter` 空 yaml ハンドリング
  - Scenario: Given AI が空文字列を返す
  - Expected: Then entry の既存フィールドは保持される（title 等が上書きされない）

### [エッジケース] Edge Cases

#### T-03-04: fixtures テストが新シグネチャに追従する

- [ ] **T-03-04-01**: `frontmatter.fixtures.spec.ts` の `generateFrontmatter` 呼び出しが
      `type`/`category` 引数なしになり、返り値参照が `entry.frontmatter.get()` に変わる
  - Target: `frontmatter.fixtures.spec.ts`
  - Scenario: Given シグネチャ変更後, When fixtures テストを実行する
  - Expected: Then 全件 GREEN

- [ ] **T-03-04-02**: `generateFrontmatter` の返り値が `void` となり、
      `writeFrontmatter` が `FrontmatterResult.yaml` ではなく `entry.renderEntry()` のみを使う
  - Target: `setfm-write.ts`（`parseYaml(result.yaml)` ループの削除）
  - Scenario: Given T-03 完了後
  - Expected: Then `setfm-write.ts` から `parseYaml` import が削除できる

---

## T-04: `reviewFrontmatter` を entry 直接書き込みに変更

### 変更概要

`reviewFrontmatter` が `FrontmatterResult` の代わりに `ChatlogEntry` を受け取り、
修正結果を `entry.frontmatter.set()` で直接書き込む。返り値は `{ validity, errors }` のみに絞る。
`fmResultMap` を削除する。

変更ファイル:

- `skills/set-frontmatter/scripts/modules/setfm-review.ts`
- `skills/set-frontmatter/scripts/set-frontmatter.ts`

前提:
  T-01・T-02・T-03 完了済み。

注意:
レビュー AI への入力は `entry.frontmatter.toFrontmatter()` の生テキストを使う。
これにより AI への入力が「元の生成 yaml 文字列」から「再シリアライズ済み frontmatter」に変わる。
フォーマットの差異が生じる場合のため、E2E テストで動作確認を行う。

### [正常] Normal Cases

#### T-04-01: `reviewFrontmatter` が entry の frontmatter を直接修正する

- [ ] **T-04-01-01**: `validity === 'fail'` のとき `entry.frontmatter.get('type')` が修正値に更新される
  - Target: `reviewFrontmatter` / `setfm-review.ts`
  - Scenario: Given AI が `validity: fail` と `correctedType` を返す, When `reviewFrontmatter(entry, dics, prompts)` を呼び出す
  - Expected: Then `entry.frontmatter.get('type')` が `correctedType` と等しい

- [ ] **T-04-01-02**: `validity === 'pass'` のとき entry の frontmatter は変更されない
  - Target: `reviewFrontmatter` pass ケース
  - Scenario: Given AI が `validity: pass` を返す
  - Expected: Then entry の frontmatter は変更なし

#### T-04-02: オーケストレーターから `fmResultMap` が削除される

- [ ] **T-04-02-01**: Phase 3.5 完了後の Phase 4 への受け渡しが `entries[]` のみになる
  - Target: `set-frontmatter.ts`
  - Scenario: Given T-04 完了後
  - Expected: Then `fmResultMap` の宣言・参照がゼロになる

### [異常] Error Cases

#### T-04-03: `reviewFrontmatter` の修正値が空のとき既存値を保持する

- [ ] **T-04-03-01**: `correctedType` が空文字列のとき `entry.frontmatter.get('type')` は変更されない
  - Target: `reviewFrontmatter` 空修正値ハンドリング
  - Scenario: Given AI が `correctedType: ''` を返す
  - Expected: Then `entry.frontmatter.get('type')` は変更前と同じ値（空で上書きしない）

- [ ] **T-04-03-02**: `runAI` が throw したとき entry は変更されない
  - Target: `reviewFrontmatter` 例外ハンドリング
  - Scenario: Given `runAI` が throw する
  - Expected: Then entry の frontmatter はそのまま（`validity: 'pass'` 相当の扱い）

### [エッジケース] Edge Cases

#### T-04-04: `ReviewResult` 型が `{ validity, errors }` のみに絞り込まれる

- [ ] **T-04-04-01**: `ReviewResult` から `correctedType`/`correctedCategory`/`correctedYaml` フィールドが削除される
  - Target: `phase.types.ts`
  - Scenario: Given T-04 完了後, When 型チェックを実行する
  - Expected: Then `correctedType` 等の参照がゼロで型エラーなし

---

## T-05: `writeFrontmatter` から `FrontmatterResult` 依存を除去

### 変更概要

T-03/T-04 完了後、`writeFrontmatter` が受け取る `result: FrontmatterResult` は
`entry.renderEntry()` の呼び出しにしか使っていない状態になる。
`result` 引数を削除し、`entry` のみで完結させる。

**変更ファイル:**

- `skills/set-frontmatter/scripts/modules/setfm-write.ts`
- `skills/set-frontmatter/scripts/set-frontmatter.ts`
- `skills/set-frontmatter/scripts/__tests__/unit/setfm-write.unit.spec.ts`（シグネチャ変更に追従）

**前提:** T-01〜T-04 完了済み。

### [正常] Normal Cases

#### T-05-01: `writeFrontmatter` のシグネチャから `result` 引数が削除される

- [ ] **T-05-01-01**: `writeFrontmatter(entry, dryRun, stats)` で動作する
  - Target: `writeFrontmatter` / `setfm-write.ts`
  - Scenario: Given `entry.frontmatter` に全フィールドが設定済み, When `writeFrontmatter(entry, false, stats)` を呼び出す
  - Expected: Then ファイルが正しく書き込まれる

- [ ] **T-05-01-02**: yaml 空チェックが entry ベースに変わる
  - Target: `setfm-write.ts`
  - Scenario: Given `entry.frontmatter.get('title')` が存在しない（AI 生成失敗）
  - Expected: Then `stats.fail++` になる（書き込みスキップ）

### [エッジケース] Edge Cases

#### T-05-02: ユニットテストが新シグネチャに追従する

- [ ] **T-05-02-01**: `setfm-write.unit.spec.ts` の `_makeResult()` ヘルパーと `writeFrontmatter` 呼び出しが削除または変更される
  - Target: `setfm-write.unit.spec.ts`
  - Scenario: Given シグネチャ変更後, When ユニットテストを実行する
  - Expected: Then 全件 GREEN

- [ ] **T-05-02-02**: `FrontmatterResult` 型が `phase.types.ts` から削除できる
  - Target: `phase.types.ts`
  - Scenario: Given T-05 完了後, When 型チェックを実行する
  - Expected: Then `FrontmatterResult` の参照がゼロで型エラーなし

---

## T-06: 不要型・不要 import の削除（クリーンアップ）

### 変更概要

T-01〜T-05 完了後、使われなくなった型・import を削除し、
型チェック・テスト・フォーマットが全件クリーンであることを最終確認する。

**変更ファイル:**

- `skills/set-frontmatter/scripts/types/phase.types.ts`（削除対象型の整理）
- 各モジュールの不要 import（`deno check` エラーで特定）

### [正常] Normal Cases

#### T-06-01: 削除済み型が phase.types.ts に残っていない

- [ ] **T-06-01-01**: `TypeResult` が `phase.types.ts` から削除されている
  - Target: `phase.types.ts`
  - Expected: Then ファイル内に `TypeResult` の定義がない

- [ ] **T-06-01-02**: `FrontmatterResult` が `phase.types.ts` から削除されている
  - Target: `phase.types.ts`
  - Expected: Then ファイル内に `FrontmatterResult` の定義がない

### [エッジケース] Edge Cases

#### T-06-02: 全テストスイートが GREEN・フォーマットが clean

- [ ] **T-06-02-01**: `deno task test:unit` が全件 GREEN
  - Target: 全ユニットテスト
  - Expected: Then 0 failed

- [ ] **T-06-02-02**: `deno task test:module fixtures set-frontmatter` が全件 GREEN
  - Target: fixtures テスト
  - Expected: Then 0 failed（回帰なし）

- [ ] **T-06-02-03**: `dprint check` が clean（フォーマット違反なし）
  - Target: 全変更ファイル
  - Expected: Then exit 0

- [ ] **T-06-02-04**: `deno check skills/set-frontmatter/scripts/set-frontmatter.ts` が型エラーなし
  - Target: 型チェック
  - Expected: Then exit 0
