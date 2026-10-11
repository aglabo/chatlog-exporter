---
title: "Requirements: mutation testing harness"
module: "testing/mutation"
status: Draft
version: 1.1.0
created: "2026-10-07"
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- markdownlint-disable line-length -->

> **Normative Statement**
> This document defines binding requirements.
> Implementations MUST conform to this document.
> RFC 2119 keywords apply to this document only.

## 1. Overview

### 1.1 Purpose

対象モジュールのソースに変異を 1 件ずつ入れて既存テストを実行し、テストが変異を検出できるか (kill できるか) を測ることで、カバレッジでは見えない空振りテストを発見できるようにする。

### 1.2 Scope

- 変異体の生成 (変異オペレータの適用、コメント・文字列リテラルの除外)
- 元ソースを書き換えない変異体の実行と、5 種の判定 (`killed` / `survived` / `timeout` / `error` / `compile-error`)
- 変異体・一時設定の後始末と、元ソースの drift 検査
- 等価変異体の許容リスト (照合と古いエントリの報告)
- 生存変異体のレポートと終了コード (既定 / `--strict`)
- `deno task test:mutate <module>` による起動
- 変異前の元ソースでのテスト実行 (ベースライン) と、同時起動の拒否
- 既存テスト ID (`T-GM-*`) の `T-MUT-GM-*` への改名、および変異テストの規約 (`docs/rules/testing-conventions.md`) への追記

**Out of Scope**:

- カバレッジ測定 (`deno task test:coverage`, beads T-06)。別モジュールで扱う
- 各モジュール (_cle-libs / filter-chatlogs / set-frontmatter / export-chatlogs / classify-chatlogs) への変異テストの実施そのもの。展開用の子 issue の起票は tasks で扱い、要件としては定めない
- 生存変異体を自動的に kill するテストの生成
- 変異体の並列実行

## 2. Context

- Target Environment: Deno 2.x (TypeScript)、Windows / Linux / macOS の開発端末。CI / pre-push からの起動を含む
- Related Components:
  - `scripts/testing/mutation/generate-mutants.ts` (実装済み、beads T-01)
  - `scripts/aplys-tester.ts` (`deno task test:module` のモジュール別名と glob)
  - `deno.jsonc` (`imports` / `tasks`、JSONC)
  - `.gitignore` (whitelist 方式)
  - `docs/rules/testing-conventions.md`
- Assumptions:
  - 対象モジュールのテストは `deno test` で実行でき、失敗時に非 0 で終了する
  - 対象ソースはテストから import で読まれる (ソースを文字列として読むテストは対象外)
  - 動作確認済みの Deno は 2.9.7。差し替え方式 (DR-01) は 2.x の `--config` と `imports` の挙動に依存する
  - テスト自身の副作用 (一時ファイルの書き込み・外部通信) はテストの責務とし、ハーネスは制限しない。ハーネスが保証するのは自身の書き込み範囲 (REQ-NF-001) のみ
  - 許容リストの一致は「行テキストが同じ」ことしか保証しない。呼び出し先や周辺条件の変更で等価性が失われても検出しない (DR-04)
  - 実績値: cle-kju.16 (normalize-chatlogs) で変異体 120 件中 23 件が生存し、15 件が実在の検出漏れ、5 件以上が等価変異体だった

### System Context Diagram

```text
[開発者 / CI] --deno task test:mutate <module> [--strict]--> +----------------------------+ --変異体ごとに起動--> [deno test 子プロセス]
                                                            |  mutation testing harness  |
[開発者 / CI] <--生存変異体レポート / 終了コード------------ |  (scripts/testing/mutation)| <--終了コード・出力-- [deno test 子プロセス]
                                                            |                            |
[対象モジュールのソース] --読むだけ-----------------------> |                            | --変異体・一時設定の書き出し / 削除--> [ファイルシステム]
[許容リスト] --等価変異体の判定記録----------------------> +----------------------------+
```

## 3. Design Decisions (Summary)

| ID    | Decision                                                                              | Linked Record                |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------- |
| DR-01 | 変異体は元ファイルの隣に別ファイルで書き出し、一時 deno 設定の `imports` で差し替える | ../decision-records.md#DR-01 |
| DR-02 | 判定を 5 種とし、型検査の失敗を `compile-error` として `killed` から分ける            | ../decision-records.md#DR-02 |
| DR-03 | 終了コードは既定でレポートのみ、`--strict` で未許容の生存を失敗にする                 | ../decision-records.md#DR-03 |
| DR-04 | 許容リストは行番号ではなく行テキストと行内の出現順で変異体を識別する                  | ../decision-records.md#DR-04 |
| DR-05 | 変異体は 1 件ずつ逐次に実行する                                                       | ../decision-records.md#DR-05 |
| DR-06 | カバレッジ測定は本モジュールの範囲外とする                                            | ../decision-records.md#DR-06 |
| DR-07 | テスト ID を `test_scope: MUT` に揃え、既存の `T-GM-*` を改名する                     | ../decision-records.md#DR-07 |
| DR-08 | 変異前に元ソースでテストを実行し、監査が成立しない場合は失敗にする                    | ../decision-records.md#DR-08 |
| DR-09 | ロックで同時起動を拒否し、残骸の掃除はロック取得後に行う                              | ../decision-records.md#DR-09 |

## 4. Functional Requirements

### REQ-F-001: 変異体の生成

- EARS Type: event-driven

```text
GIVEN 対象モジュールの TypeScript ソースファイル (テストファイルを除く)
  WHEN ハーネスがそのソースを読み込む
THEN the system SHALL 比較 (< <= > >=)・等価 (=== !==)・論理 (&& || ??)・真偽リテラル・数値リテラル +1・否定の除去の各オペレータについて、適用箇所ごとに 1 件の変異体 (ファイル・行・桁・オペレータ・置換前後の字句・行テキスト) を生成する.
```

**Rationale**: cle-kju.16 で実在の検出漏れを見つけたオペレータ集合を固定する。実装済み (beads T-01)。

**Acceptance Criteria**:

| AC ID  | Scenario                                 |
| ------ | ---------------------------------------- |
| AC-001 | 比較演算子を含む行から変異体が生成される |

### REQ-F-002: コメント・文字列リテラルの除外

- EARS Type: unwanted behavior

```text
GIVEN 演算子やリテラルを含むコメント・文字列リテラル・テンプレートリテラルの文字列部
  NOT DO それらの内部を変異させる
THEN the system SHALL 当該範囲から変異体を生成しない.
```

**Rationale**: コメント・文字列内の変異は振る舞いを変えず、誤った生存とノイズを生む。

**Acceptance Criteria**:

| AC ID  | Scenario                                     |
| ------ | -------------------------------------------- |
| AC-002 | コメント内の演算子からは変異体が生成されない |

### REQ-F-003: 元ソースを書き換えない変異体の実行

- EARS Type: unwanted behavior

```text
GIVEN 変異体 1 件と、それを含む対象ソースファイル
  NOT DO 対象ソースファイルの内容を書き換える
THEN the system SHALL 変異体を元ファイルと同じディレクトリの別ファイルに書き出し、元ファイルの import を変異体へ差し替える一時 deno 設定を使ってテストを実行する.
```

**Rationale**: 書き換えて戻す方式は、戻し損ねたときにソースを壊す。別ファイル方式なら異常終了しても残るのは変異体と一時設定だけになる (DR-01)。

**Acceptance Criteria**:

| AC ID  | Scenario                                             |
| ------ | ---------------------------------------------------- |
| AC-003 | 変異体の実行中も実行後も元ファイルの内容が変わらない |

### REQ-F-004: 変異体ごとの判定

- EARS Type: event-driven

```text
GIVEN 変異体 1 件について起動したテストプロセス
  WHEN テストプロセスが終了する、またはタイムアウトする
THEN the system SHALL 終了コード 0 なら survived、型検査の失敗なら compile-error、テストの失敗を出力で確認できる非 0 なら killed、制限時間超過なら timeout、変異体の適用・書き出し・プロセス起動に失敗したなら error、テストの失敗を確認できない非 0 (設定不備・依存解決の失敗・異常終了など) なら error と判定する.
```

**Rationale**: 型検査で落ちた変異体を killed に数えると、テストの検出力を過大評価する (DR-02)。テスト以外の要因による非 0 終了も同じ理由で killed に数えない (v1.1.0 で追記。execution DD-12)。

**Acceptance Criteria**:

| AC ID  | Scenario                                                      |
| ------ | ------------------------------------------------------------- |
| AC-004 | テストが検出した変異体は killed になる                        |
| AC-005 | 型検査で落ちた変異体は compile-error になり killed にならない |

### REQ-F-005: 1 件の失敗で全体を止めない

- EARS Type: event-driven

```text
GIVEN 複数の変異体を順に実行している
  WHEN ある変異体が error または timeout になる
THEN the system SHALL その変異体の判定を記録し、残りの変異体の実行を続ける.
```

**Rationale**: 1 件の環境要因で監査全体が無駄になるのを防ぐ。

**Acceptance Criteria**:

| AC ID  | Scenario                       |
| ------ | ------------------------------ |
| AC-006 | error の後の変異体も実行される |

### REQ-F-006: 変異体と一時設定の後始末

- EARS Type: event-driven

```text
GIVEN 変異体 1 件の実行のために書き出した変異体ファイルと一時 deno 設定
  WHEN その変異体の実行が正常終了・失敗・例外のいずれかで終わる
THEN the system SHALL 変異体ファイルと一時 deno 設定を削除する.
```

**Rationale**: 残骸がソースツリーに残ると、型検査・lint・コミットに混入する。

**Acceptance Criteria**:

| AC ID  | Scenario                                               |
| ------ | ------------------------------------------------------ |
| AC-007 | 例外が起きた変異体の変異体ファイルと一時設定も残らない |

### REQ-F-007: 起動時の残骸掃除

- EARS Type: event-driven

```text
GIVEN 前回の実行が強制終了され、変異体ファイルまたは一時 deno 設定が残っている
  WHEN ハーネスが起動し、ロック (REQ-F-017) を取得した
THEN the system SHALL 変異体ファイルと一時 deno 設定の命名規則に一致するファイルだけを削除してから実行を始める.
```

**Rationale**: プロセスの強制終了 (kill -9 等) では finally が実行されない。

**Acceptance Criteria**:

| AC ID  | Scenario                                                 |
| ------ | -------------------------------------------------------- |
| AC-008 | 命名規則に一致する残骸だけが削除され、他のファイルは残る |

### REQ-F-008: 元ソースの drift 検査

- EARS Type: event-driven

```text
GIVEN 実行前に記録した、対象の元ソースファイル全件の内容ハッシュ
  WHEN 全変異体の実行が終わる、または途中で中断される
THEN the system SHALL 再度ハッシュを取って突合し、内容が変わったファイルを drift として報告する.
```

**Rationale**: 元ソースを書き換えない設計 (REQ-F-003) が守られていることを毎回機械的に確認する安全網。

**Acceptance Criteria**:

| AC ID  | Scenario                                                |
| ------ | ------------------------------------------------------- |
| AC-009 | 実行中に元ファイルが変わった場合 drift として報告される |

### REQ-F-009: 許容リストとの照合

- EARS Type: feature/config-based

```text
GIVEN 等価変異体の判定を記録した許容リスト
  WHERE 許容リストが存在する
  WHEN survived と判定された変異体がある
THEN the system SHALL ファイル・行テキスト (前後空白除去)・オペレータ・置換前後の字句・行内の出現順の一致で許容エントリを照合し、一致した変異体を「許容済みの生存」として未許容の生存と区別する.
```

**Rationale**: 等価変異体の判断を再実行のたびに繰り返さない。行番号ではなく行テキストで識別することで、無関係な行の追加では外れず、当該行の書き換え時だけ判断をやり直させる (DR-04)。

**Acceptance Criteria**:

| AC ID  | Scenario                                     |
| ------ | -------------------------------------------- |
| AC-010 | 上に行を追加しても許容エントリが一致し続ける |

### REQ-F-010: 古い許容エントリの報告

- EARS Type: event-driven

```text
GIVEN 許容リストのエントリ
  WHEN 実行で生成されたどの変異体にも一致しない
THEN the system SHALL そのエントリを古いエントリとしてレポートに列挙する.
```

**Rationale**: 当該行が書き換わった・削除されたエントリを放置すると、許容リストが実体と乖離する。

**Acceptance Criteria**:

| AC ID  | Scenario                                               |
| ------ | ------------------------------------------------------ |
| AC-012 | 行が書き換わったエントリは古いエントリとして報告される |

### REQ-F-011: 生存変異体のレポート

- EARS Type: event-driven

```text
GIVEN 全変異体の判定結果と許容リストの照合結果
  WHEN 実行が終わる
THEN the system SHALL 判定ごとの件数、未許容の生存変異体の一覧 (file:line・オペレータ・置換前後の字句)、古い許容エントリ、drift を出力する.
```

**Rationale**: 生存は人が切り分ける前提であり、切り分けに必要な情報を 1 か所に出す。

**Acceptance Criteria**:

| AC ID  | Scenario                                                  |
| ------ | --------------------------------------------------------- |
| AC-013 | 未許容の生存変異体が file:line と置換前後の字句付きで出る |

### REQ-F-012: モジュール指定での起動

- EARS Type: event-driven

```text
GIVEN リポジトリのルート
  WHEN 開発者が `deno task test:mutate <module> [--strict] [--timeout <秒>]` を実行する
THEN the system SHALL 指定モジュールのソースファイル (テストファイルを除く) を変異対象とし、そのモジュールのテストで変異体を判定する。`--timeout` は正の整数 (秒) のみを受け付け、それ以外は引数の不正とする.
```

**Rationale**: scratchpad に依存せず、誰でも同じ手順で監査を再実行できるようにする。

**Acceptance Criteria**:

| AC ID  | Scenario                               |
| ------ | -------------------------------------- |
| AC-014 | 不明なモジュール名ではエラーで終了する |
| AC-024 | `--timeout 0` ではエラーで終了する     |

### REQ-F-013: 既定の終了コード

- EARS Type: feature/config-based

```text
GIVEN 実行が終わった、または開始前に中止した
  WHERE `--strict` が指定されていない
THEN the system SHALL 中断 (SIGINT) された場合は、後始末・drift 検査・レポート・ロック解放を行ったうえで、他の条件より優先して終了コード 130 で終了する。それ以外は (a) 引数・モジュール名の不正、(b) 許容リストの読み込みエラー (REQ-F-015 を含む)、(c) drift の検出、(d) ベースラインの失敗 (REQ-F-016)、(e) ロックの取得失敗 (REQ-F-017)、(f) 監査全体にかかわる処理 (残骸掃除・ハッシュ取得・レポート出力) の失敗のいずれかがあれば非 0、それ以外は生存変異体の有無にかかわらず 0 で終了する。変異体単位の error / timeout / compile-error は終了コードに影響させない.
```

**Rationale**: 生存 = 悪ではないため、既定では監査の道具として使う (DR-03)。変異体単位の失敗はレポートで扱い、終了コードは監査そのものが成立しなかった場合に限る。130 と (f) は v1.1.0 で追記した (execution DD-08 / DD-14、report-cli R-614)。

**Acceptance Criteria**:

| AC ID  | Scenario                                    |
| ------ | ------------------------------------------- |
| AC-015 | 未許容の生存があっても既定では 0 で終了する |
| AC-023 | 中断 (SIGINT) では後始末の後 130 で終了する |

### REQ-F-014: `--strict` の終了コード

- EARS Type: feature/config-based

```text
GIVEN 実行が終わり、レポートを出力した
  WHERE `--strict` が指定されている
THEN the system SHALL REQ-F-013 の条件に加え、許容リストに無い survived が 1 件でもある場合、変異体が 1 件以上あるのに有効な判定 (killed / survived) が 0 件の場合、または古い許容エントリ (REQ-F-010) が 1 件でもある場合に非 0 で終了する.
```

**Rationale**: 許容リストで切り分けを終えたモジュールを CI / pre-push で退行から守る (DR-03)。古いエントリを失敗にする条件は v1.1.0 で追記した (ユーザー決定、index DD-07)。

**Acceptance Criteria**:

| AC ID  | Scenario                                                |
| ------ | ------------------------------------------------------- |
| AC-016 | `--strict` では未許容の生存 1 件で非 0 終了する         |
| AC-020 | `--strict` では全件 error / timeout のとき非 0 終了する |
| AC-022 | `--strict` では古い許容エントリ 1 件で非 0 終了する     |

### REQ-F-015: 理由の無い許容エントリの拒否

- EARS Type: unwanted behavior

```text
GIVEN 理由が空または欠けている許容エントリを含む許容リスト
  NOT DO そのエントリを照合に使う
THEN the system SHALL 当該エントリを読み込みエラーとして報告し、変異体を実行せずに中止する.
```

**Rationale**: 理由の無い許容は判断の記録にならず、後から妥当性を検証できない。

**Acceptance Criteria**:

| AC ID  | Scenario                                       |
| ------ | ---------------------------------------------- |
| AC-011 | 理由の無い許容エントリはエラーとして報告される |

### REQ-F-016: 変異前のベースライン実行

- EARS Type: event-driven

```text
GIVEN 変異対象のモジュールと、その判定に使うテスト
  WHEN 最初の変異体を実行する前
THEN the system SHALL 元ソースのままテストを 1 回実行し、テストが失敗した場合、または実行されたテストが 0 件の場合は、変異体を実行せずに中止する.
```

**Rationale**: 元から失敗するテストや環境障害があると、すべての変異体が killed に見え、検出力を誤認する (DR-08)。

**Acceptance Criteria**:

| AC ID  | Scenario                                             |
| ------ | ---------------------------------------------------- |
| AC-017 | 元ソースでテストが失敗すると変異体を実行せず中止する |
| AC-018 | テストが 0 件なら変異体を実行せず中止する            |

### REQ-F-017: 同時起動の拒否

- EARS Type: unwanted behavior

```text
GIVEN 同じリポジトリで別のハーネスが実行中である
  NOT DO 実行中の別プロセスの変異体ファイル・一時 deno 設定を削除する、または並行して実行する
THEN the system SHALL ロックの取得に失敗したことを報告し、残骸の掃除も変異体の実行もせずに中止する.
```

**Rationale**: 残骸の掃除は命名規則で対象を決めるため、同時に起動すると他の実行が使用中のファイルを消す (DR-09)。

**Acceptance Criteria**:

| AC ID  | Scenario                                          |
| ------ | ------------------------------------------------- |
| AC-019 | 実行中に 2 つ目を起動すると、何も削除せず中止する |

### REQ-F-018: 変異体 0 件

- EARS Type: event-driven

```text
GIVEN 変異対象のソースから変異体が 1 件も生成されない
  WHEN 実行する
THEN the system SHALL 変異体 0 件であることをレポートし、REQ-F-013 / REQ-F-014 に従って終了する.
```

**Rationale**: 変異候補の無いモジュールでもエラーにせず、その事実を明示する。

**Acceptance Criteria**:

| AC ID  | Scenario                               |
| ------ | -------------------------------------- |
| AC-021 | 変異体 0 件はレポートされ 0 で終了する |

## 5. Non-Functional Requirements

### REQ-NF-001: Safety

全実行後の drift は 0 件でなければならない (MUST)。ハーネスが書き込んでよいのは変異体ファイル・一時 deno 設定・ロックファイル (`temp/mutation.lock`、REQ-F-017) のみとする。

### REQ-NF-002: Testability

テストプロセスの起動は依存注入 (provider) とし、unit テストは実プロセスを起動せずに判定・後始末・drift 検査を検証できなければならない (MUST)。実プロセスによる差し替えの有効性は integration テストで検証する。

### REQ-NF-003: Performance

変異体 1 件あたりの制限時間を持ち、既定値は 120 秒とする (SHOULD)。制限時間は `--timeout <秒>` (正の整数) で変更でき、ベースライン (REQ-F-016) にも同じ値を適用する (MUST)。制限時間を超えたテストプロセスは終了させなければならない (MUST)。

### REQ-NF-004: Portability

Windows / Linux / macOS で動作し、ファイルパスを file URL に変換して差し替えに使わなければならない (MUST)。変異体の書き出しで元ファイルの改行コード (`\r\n` / `\n`) と UTF-8 を保たなければならない (MUST)。

### REQ-NF-005: Maintainability

プロジェクトのコーディング規約に従う (MUST)。位置引数は 6 個まで (超えたら options オブジェクト)、`any` 禁止、型は `scripts/testing/mutation/types/` に置く、関数型優先 (逐次実行が必要な箇所は理由をコメントに書く)。

## 6. Constraints

### REQ-C-001: Runtime and Dependencies

Deno + TypeScript で実装し、追加する依存は JSR の `@std/*` に限る。`deno.jsonc` は JSONC のため、読み込みには JSONC パーサ (`@std/jsonc`) を使う。

### REQ-C-002: Import Redirection

import の差し替えは一時 deno 設定の `imports` で行い、`--import-map` フラグは使わない (`deno.jsonc` の `imports` を置き換え、`@std/*` が解決できなくなるため。2026-10-07 実測)。

### REQ-C-003: Process Exit

`Deno.exit()` はエントリポイント (`if (import.meta.main)`) でのみ呼ぶ。`main()` 以下は throw / return で抜け、終了コードは `main()` の返り値で決める。`scripts/aplys-tester.ts` の `main()` は `Deno.exit` を呼んでいるが、これを踏襲しない。

### REQ-C-004: Test IDs

テスト ID は `module.md` の `test_scope: MUT` に従い `T-MUT-<target>-<連番>` とする。既存の `T-GM-*` は `T-MUT-GM-*` に改名する (DR-07)。

### REQ-C-005: Ignore Rules

変異体ファイルと一時 deno 設定の命名パターンを `.gitignore` に追加する。`.gitignore` は whitelist 方式のため、`!/scripts/**/*.ts` と `!skills/**/*.ts` より後に置く。`.tsx` の変異体も対象に含める。

### REQ-C-006: Production Wiring

追加したモジュールは production 側 (CLI / deno task) から import されていることを grep で確認する。unit テストが通っても呼び出し元が無い状態でコミットしない。

## 7. User Stories

| Story ID | Role                       | Goal                                                            | Reason                                               | Related Requirements                                  |
| -------- | -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| US-001   | テストを書く開発者         | モジュールのテストが変異を検出できるかを 1 コマンドで確かめたい | カバレッジが高くても空振りするテストがあるため       | REQ-F-001, REQ-F-004, REQ-F-012                       |
| US-002   | テストを書く開発者         | 生存変異体をファイル・行・置換前後の字句付きで見たい            | どのテストを足せば kill できるかを判断するため       | REQ-F-011                                             |
| US-003   | リポジトリの保守者         | 監査中にソースが壊れないことを保証したい                        | 書き換えて戻す方式は戻し損ねたときにソースを壊すため | REQ-F-003, REQ-F-006, REQ-F-007, REQ-F-008, REQ-F-017 |
| US-004   | 切り分けを行うレビュー担当 | 等価変異体と判断したものを理由付きで記録したい                  | 再実行のたびに同じ判断を繰り返さないため             | REQ-F-009, REQ-F-010, REQ-F-015                       |
| US-005   | CI / pre-push の管理者     | 切り分け済みのモジュールで新しい生存が出たら失敗させたい        | テストの検出力の退行を防ぐため                       | REQ-F-014, REQ-F-016                                  |
| US-006   | テストを書く開発者         | 型検査で落ちた変異体をテストの検出と区別したい                  | 検出力を過大評価しないため                           | REQ-F-004                                             |

## 8. Acceptance Criteria

```gherkin
# AC-001: 比較演算子を含む行から変異体が生成される
# Requirement: REQ-F-001
Scenario: 比較演算子を含む行から変異体が生成される
  Given ソース "export const f = (n: number) => n > 0;"
  When  変異体を生成する
  Then  ">" を ">=" と "<" 等に置き換えた relational の変異体が、行 1 と ">" の桁位置付きで生成される

# AC-002: コメント内の演算子からは変異体が生成されない
# Requirement: REQ-F-002
Scenario: コメント内の演算子からは変異体が生成されない
  Given ソース "// a > b"
  When  変異体を生成する
  Then  変異体は 0 件である

# AC-003: 変異体の実行中も実行後も元ファイルの内容が変わらない
# Requirement: REQ-F-003
Scenario: 変異体の実行中も実行後も元ファイルの内容が変わらない
  Given 対象ファイル "target.ts" と、それを import するテスト
  When  "target.ts" の変異体を実行する
  Then  テスト実行中の "target.ts" の内容は実行前と同一である
  And   変異体は "target.mutation-001.ts" として同じディレクトリに書き出されている

# AC-004: テストが検出した変異体は killed になる
# Requirement: REQ-F-004
Scenario: テストが検出した変異体は killed になる
  Given "isPositive(0) は false" を検査するテスト
  When  "n > 0" を "n >= 0" にした変異体を実行する
  Then  判定は killed である

# AC-005: 型検査で落ちた変異体は compile-error になり killed にならない
# Requirement: REQ-F-004
Scenario: 型検査で落ちた変異体は compile-error になり killed にならない
  Given 変異によって型検査が失敗するソース
  When  その変異体を実行する
  Then  判定は compile-error であり、killed の件数に含まれない

# AC-006: error の後の変異体も実行される
# Requirement: REQ-F-005
Scenario: error の後の変異体も実行される
  Given 3 件の変異体のうち 2 件目のテスト起動が失敗する
  When  3 件を実行する
  Then  2 件目は error、1 件目と 3 件目はそれぞれの終了コードどおりに判定される

# AC-007: 例外が起きた変異体の変異体ファイルと一時設定も残らない
# Requirement: REQ-F-006
Scenario: 例外が起きた変異体の変異体ファイルと一時設定も残らない
  Given テスト起動が例外を投げる変異体
  When  その変異体を実行する
  Then  変異体ファイルと一時 deno 設定はどちらも存在しない

# AC-008: 命名規則に一致する残骸だけが削除され、他のファイルは残る
# Requirement: REQ-F-007
Scenario: 命名規則に一致する残骸だけが削除され、他のファイルは残る
  Given "foo.mutation-001.ts"・"deno.mutation-001.json"・"foo.ts"・"foo.mutation.ts" が存在する
  When  ハーネスが起動する
  Then  "foo.mutation-001.ts" と "deno.mutation-001.json" だけが削除される

# AC-009: 実行中に元ファイルが変わった場合 drift として報告される
# Requirement: REQ-F-008
Scenario: 実行中に元ファイルが変わった場合 drift として報告される
  Given テスト実行中に "target.ts" の内容が変わる
  When  全変異体の実行が終わる
  Then  drift に "target.ts" が含まれる

# AC-010: 上に行を追加しても許容エントリが一致し続ける
# Requirement: REQ-F-009
Scenario: 上に行を追加しても許容エントリが一致し続ける
  Given 10 行目の "?? -> ||" の生存変異体を許容したエントリ
  When  ファイル先頭に 1 行追加して再実行する
  Then  11 行目になった同じ変異体は許容済みの生存として扱われる

# AC-011: 理由の無い許容エントリはエラーとして報告される
# Requirement: REQ-F-015
Scenario: 理由の無い許容エントリはエラーとして報告される
  Given 理由が空の許容エントリ
  When  許容リストを読み込む
  Then  そのエントリはエラーとして報告される
  And   変異体を 1 件も実行せず、非 0 で終了する

# AC-012: 行が書き換わったエントリは古いエントリとして報告される
# Requirement: REQ-F-010
Scenario: 行が書き換わったエントリは古いエントリとして報告される
  Given 許容エントリが指す行のテキストが書き換わっている
  When  実行する
  Then  そのエントリは古いエントリとしてレポートに列挙される

# AC-013: 未許容の生存変異体が file:line と置換前後の字句付きで出る
# Requirement: REQ-F-011
Scenario: 未許容の生存変異体が file:line と置換前後の字句付きで出る
  Given 未許容の生存変異体が 1 件ある
  When  レポートを出力する
  Then  その変異体の file:line・オペレータ・置換前後の字句が一覧に含まれる

# AC-014: 不明なモジュール名ではエラーで終了する
# Requirement: REQ-F-012
Scenario: 不明なモジュール名ではエラーで終了する
  Given 存在しないモジュール名 "unknown"
  When  "deno task test:mutate unknown" を実行する
  Then  変異体を 1 件も実行せず、非 0 で終了する

# AC-015: 未許容の生存があっても既定では 0 で終了する
# Requirement: REQ-F-013
Scenario: 未許容の生存があっても既定では 0 で終了する
  Given drift が無く、未許容の生存変異体が 1 件ある
  When  "--strict" なしで実行する
  Then  終了コードは 0 である

# AC-016: --strict では未許容の生存 1 件で非 0 終了する
# Requirement: REQ-F-014
Scenario: --strict では未許容の生存 1 件で非 0 終了する
  Given drift が無く、未許容の生存変異体が 1 件ある
  When  "--strict" 付きで実行する
  Then  終了コードは非 0 である

# AC-017: 元ソースでテストが失敗すると変異体を実行せず中止する
# Requirement: REQ-F-016
Scenario: 元ソースでテストが失敗すると変異体を実行せず中止する
  Given 元ソースのままで失敗するテストがある
  When  ハーネスを実行する
  Then  変異体を 1 件も実行せず、非 0 で終了する

# AC-018: テストが 0 件なら変異体を実行せず中止する
# Requirement: REQ-F-016
Scenario: テストが 0 件なら変異体を実行せず中止する
  Given 判定に使うテストが 1 件も無いモジュール
  When  ハーネスを実行する
  Then  変異体を 1 件も実行せず、非 0 で終了する

# AC-019: 実行中に 2 つ目を起動すると、何も削除せず中止する
# Requirement: REQ-F-017
Scenario: 実行中に 2 つ目を起動すると、何も削除せず中止する
  Given 1 つ目のハーネスが変異体 "foo.mutation-001.ts" を実行中である
  When  2 つ目のハーネスを起動する
  Then  2 つ目は非 0 で終了し、"foo.mutation-001.ts" は削除されていない

# AC-020: --strict では全件 error / timeout のとき非 0 終了する
# Requirement: REQ-F-014
Scenario: --strict では全件 error / timeout のとき非 0 終了する
  Given drift が無く、変異体 2 件がどちらも timeout になる
  When  "--strict" 付きで実行する
  Then  終了コードは非 0 である

# AC-021: 変異体 0 件はレポートされ 0 で終了する
# Requirement: REQ-F-018
Scenario: 変異体 0 件はレポートされ 0 で終了する
  Given 変異候補の無いソースだけのモジュール
  When  "--strict" なしで実行する
  Then  レポートに変異体 0 件と出力され、終了コードは 0 である

# AC-022: --strict では古い許容エントリ 1 件で非 0 終了する
# Requirement: REQ-F-014
Scenario: --strict では古い許容エントリ 1 件で非 0 終了する
  Given drift が無く、未許容の生存が 0 件で、どの変異体にも一致しない許容エントリが 1 件ある
  When  "--strict" 付きで実行する
  Then  終了コードは非 0 である

# AC-023: 中断 (SIGINT) では後始末の後 130 で終了する
# Requirement: REQ-F-013
Scenario: 中断 (SIGINT) では後始末の後 130 で終了する
  Given 変異体の実行中である
  When  SIGINT を受け取る
  Then  実行中の変異体の変異体ファイルと一時 deno 設定は残らず、ロックは解放され、終了コードは 130 である

# AC-024: --timeout 0 ではエラーで終了する
# Requirement: REQ-F-012
Scenario: --timeout 0 ではエラーで終了する
  Given モジュール名 "libs"
  When  "deno task test:mutate libs --timeout 0" を実行する
  Then  何も書き込まず、変異体を 1 件も実行せず、非 0 で終了する
```

## 9. Open Questions

下表は v1.0.0 時点の未決事項であり、すべて仕様で解消した。解消方法は `specifications/specifications-index.md` Section 7.1 を参照する。

| Question                                                                                                                            | Type      | Impact Area           | Owner |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------- | ----- |
| compile-error を判定する出力パターン (deno の型検査失敗をどう識別するか)                                                            | Technical | REQ-F-004             | spec  |
| 許容リストの置き場所 (モジュールごと / リポジトリで 1 本) とファイル形式                                                            | Design    | REQ-F-009, REQ-F-010  | spec  |
| レポートの出力形式 (標準出力のテキストのみか、JSON 等の機械可読形式も出すか)                                                        | Design    | REQ-F-011             | spec  |
| `<module>` に取れる値 (`aplys-tester.ts` のモジュール別名を流用するか) と、判定に使うテスト種別 (unit のみ / 全種別)                | Design    | REQ-F-012             | spec  |
| 変異対象から除外するファイル (型定義のみの `*.types.ts`、定数のみのファイル等)                                                      | Design    | REQ-F-001, REQ-F-012  | spec  |
| 制限時間を CLI から変更できるようにするか                                                                                           | Design    | REQ-NF-003            | spec  |
| 同一ファイルに同じテキストの行が複数あるとき、許容エントリをどちらに一致させるか (DR-04 の弱点)                                     | Design    | REQ-F-009             | spec  |
| 変異体が実際に読み込まれたことの確認方法 (変異体だけが持つマーカー等) と、動的 import・別名・再 export 経由の参照を差し替えられるか | Technical | REQ-F-003             | spec  |
| タイムアウト時に子プロセスの子孫まで終了させる方法と、削除に失敗したときの扱い                                                      | Technical | REQ-F-006, REQ-NF-003 | spec  |
| 正規表現・テンプレート内の式・TSX・型位置の数値の変異可否 (実装済み T-01 の振る舞いを spec で固定する)                              | Design    | REQ-F-001, REQ-F-002  | spec  |
| ロックの置き場所と、強制終了で残ったロックの扱い                                                                                    | Technical | REQ-F-017             | spec  |
| `--strict` で古い許容エントリも失敗扱いにするか                                                                                     | Policy    | REQ-F-010, REQ-F-014  | user  |
| Ctrl+C (SIGINT) で中断されたときに後始末を保証する方法                                                                              | Technical | REQ-F-006             | spec  |

## 10. Traceability

| REQ ID     | AC IDs                 | Type           |
| ---------- | ---------------------- | -------------- |
| REQ-F-001  | AC-001                 | Functional     |
| REQ-F-002  | AC-002                 | Functional     |
| REQ-F-003  | AC-003                 | Functional     |
| REQ-F-004  | AC-004, AC-005         | Functional     |
| REQ-F-005  | AC-006                 | Functional     |
| REQ-F-006  | AC-007                 | Functional     |
| REQ-F-007  | AC-008                 | Functional     |
| REQ-F-008  | AC-009                 | Functional     |
| REQ-F-009  | AC-010                 | Functional     |
| REQ-F-010  | AC-012                 | Functional     |
| REQ-F-011  | AC-013                 | Functional     |
| REQ-F-012  | AC-014, AC-024         | Functional     |
| REQ-F-013  | AC-015, AC-023         | Functional     |
| REQ-F-014  | AC-016, AC-020, AC-022 | Functional     |
| REQ-F-015  | AC-011                 | Functional     |
| REQ-F-016  | AC-017, AC-018         | Functional     |
| REQ-F-017  | AC-019                 | Functional     |
| REQ-F-018  | AC-021                 | Functional     |
| REQ-NF-001 | AC-003, AC-009         | Non-Functional |
| REQ-NF-002 | N/A                    | Non-Functional |
| REQ-NF-003 | N/A                    | Non-Functional |
| REQ-NF-004 | N/A                    | Non-Functional |
| REQ-NF-005 | N/A                    | Non-Functional |
| REQ-C-001  | N/A                    | Constraint     |
| REQ-C-002  | N/A                    | Constraint     |
| REQ-C-003  | N/A                    | Constraint     |
| REQ-C-004  | N/A                    | Constraint     |
| REQ-C-005  | N/A                    | Constraint     |
| REQ-C-006  | N/A                    | Constraint     |

## 11. Change History

<!-- SemVer: MAJOR = requirement removed / approach discarded,
     MINOR = requirement / AC / DR added, PATCH = clarification only.
     Keep frontmatter `version` equal to the newest row below.
     See docs/.deckrd/rules/deckrd-rule-document-versioning.md -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | 1.0.0   | Initial release                                                                                                                                                                                                                                                                                                                     |
| 2026-10-08 | 1.1.0   | 仕様で決めた 6 点を追記: `--strict` で古いエントリも非 0 (REQ-F-014, AC-022)、SIGINT は 130 (REQ-F-013, AC-023)、`--timeout` (REQ-F-012, REQ-NF-003, AC-024)、ロックファイルの書き込み (REQ-NF-001)、監査全体の処理の失敗で非 0 (REQ-F-013 (f))、失敗を確認できない非 0 は error (REQ-F-004)。Open Questions は仕様で解消済みと明記 |
