---
title: "Design Specification: mutation testing harness (generation)"
based-on: requirements.md v1.1.0
status: Draft
version: 1.3.0
created: "2026-10-07"
---

> Part of split specification. See `specifications-index.md` for full scope.

## 1. Overview

### 1.1 Purpose

本仕様は、変異テストハーネスのうち「何を変異対象とし、どの変異体を生成し、どのテストで判定するか」を定める。
対象は REQ-F-001 (変異体の生成)、REQ-F-002 (コメント・文字列リテラルの除外)、
REQ-F-012 の対象解決部分 (モジュール指定からソース集合とテスト集合を決める規則、除外規則) である。

### 1.2 Scope

This specification defines the **behavioral rules** and
**classification semantics** of mutation testing harness (generation).

Implementation details are explicitly out of scope.

本ファイルの範囲外 (別ファイルで扱う):

- 変異体の書き出し・実行・判定・後始末: `specifications-execution.md`
- 許容リストの読み込みと照合: `specifications-allowlist.md`
- CLI の引数解析 (`--strict` / `--timeout`)、レポート、終了コード: `specifications-report-cli.md`

---

## 2. Design Principles

### 2.1 Classification Philosophy

- 変異の対象にするのは「実行時の振る舞いを持つ字句」だけである。コメント・文字列は振る舞いを変えないため、変異させない (誤った生存とノイズを避ける)。
- 判断に迷う箇所は「生成しない」側に倒す。変異体を作り損ねても監査は成立するが、解析を誤った変異体は誤判定を生む。
- 同一の入力からは常に同一の出力を得る。変異体の並びと対象ファイルの並びは決定的でなければならない。後続の許容リスト照合・レポートの再現性がこれに依存する。
- 対象解決は「何を変異させるか」と「何で判定するか」を独立に決める。判定に使うテストは当該モジュールの unit テストに限る。

### 2.2 Design Assumptions

- 入力ソースは UTF-8 のテキストである。
- 変異体の生成は純粋な計算であり、入力ソースを変更せず、ファイルシステムにも書き込まない。
- 現状のリポジトリに TSX ファイルは存在しない。TSX の扱いは将来の混入に備えた既知の制限として固定する。

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit              | Responsibility                                                             | REQ Coverage             |
| ----------------- | -------------------------------------------------------------------------- | ------------------------ |
| Target Resolution | モジュール名から、変異対象のソース集合と判定に使うテスト集合を決める       | REQ-F-012 (対象解決部分) |
| Mutant Generation | 1 つのソースから、オペレータ・除外規則に従って変異体の列を決定的に生成する | REQ-F-001, REQ-F-002     |

#### Unit Interaction Map

```text
+-------------------+     +-------------------+
| Target Resolution | --> | Mutant Generation |
+-------------------+     +-------------------+
   |  source set (per file) ------^
   |
   +--> test set --> (specifications-execution.md: 判定に使用)
```

Target Resolution が決めたソース集合の各ファイルを、Mutant Generation が 1 件ずつ処理する。
テスト集合は本ファイルでは生成せず、実行側へ引き渡すだけである。

#### Data Flow Diagram

```text
[validated module name] --> [Target Resolution] --> [source set] --> [Mutant Generation] --> [mutant list]
 (checked by report-cli)            |                                         |
                                    v                                         v
                               [test set]                              [Exclusion rules]
                                                                       (comment / string /
                                                                        regex line / import /
                                                                        type position)
```

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- カバレッジ測定 ← REQ: Out of Scope #1
- 各モジュールへの変異テストの実施そのもの ← REQ: Out of Scope #2
- 生存変異体を自動的に kill するテストの生成 ← REQ: Out of Scope #3
- 変異体の並列実行 ← REQ: Out of Scope #4

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                                                                    | Rationale                                                                                                                                                                                                                                            | Affected Rules                             | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| DD-01 | 指定できるモジュール名は、既存のテスト実行ツールの短縮名から「全体」「クラス」「scripts」を除いたもの (libs / classify / export / filter / normalize / set) | 既存の呼び出し規約を流用し、利用者に別の語彙を覚えさせない。全体とクラスは変異対象の単位として粗すぎる / 対象が無い。scripts は開発用スクリプトとハーネス自身を含むため変異させず、通常の unit / integration テストで担保する (user 決定 2026-10-08) | R-101 (許可値の検査は report-cli の R-602) | Active |
| DD-02 | 判定に使うテストは、当該モジュールの unit テストのみとする                                                                                                  | 変異体 1 件ごとに実行するため、実行時間の短いテストに限る。integration 等は外部要因で timeout を誤誘発しうる                                                                                                                                         | R-104                                      | Active |
| DD-03 | 変異対象から、テスト配下のファイル・テスト仕様ファイル・型定義専用ファイル・定数専用ファイルを除く                                                          | テストそのもの、または変異候補が少なくノイズになりやすいファイルを除き、監査を実行時の論理に集中させる。除外した箇所の検出力は測られない (index Section 2.2)                                                                                         | R-102                                      | Active |
| DD-04 | 正規表現リテラルを含む行は、その行全体から変異体を生成しない                                                                                                | 正規表現と演算子を字句レベルで確実に区別できないため、誤った変異を避ける (既存生成器の振る舞いの固定)                                                                                                                                                | R-107                                      | Active |
| DD-05 | TSX は TS と同じ字句規則で扱い、JSX のテキスト・属性を特別扱いしない                                                                                        | 現状 TSX は存在せず、特別扱いの実装コストに見合わない。既知の制限として明記する                                                                                                                                                                      | R-109                                      | Active |
| DD-06 | 変異体の命名規則に一致するファイルと一時設定は、ソース集合に含めない                                                                                        | 対象解決は残骸の掃除より前に行われるため、前回の残骸が変異対象に混入するのを防ぐ                                                                                                                                                                     | R-103                                      | Active |
| DD-07 | ソース集合・テスト集合・変異体列は、いずれも決定的な順序 (ファイルは昇順、変異体は行・桁昇順) で返す                                                        | 許容リスト照合・出現順・レポートの再現性のため                                                                                                                                                                                                       | R-105, R-110                               | Active |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions and from user decisions confirmed in Phase 6 (2026-10-07).
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                              | Phase | Impact on This Spec                                                                                                              |
| ----- | ------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| DR-01 | 変異体を別ファイルに書き出し、一時 deno 設定で import を差し替える | req   | 変異体が元ファイルと同じ場所に置かれる前提のため、ソース集合の決定時に変異体・一時設定の命名規則に一致するものを除外する (DD-06) |

### 2.7 DD to DR Promotion Criteria

> **Purpose**: Guidelines for determining when a DD should be promoted to a formal DR.
> Promotion is a **human judgment** — these criteria inform, not automate.

**Consider promoting a DD when:**

1. Cross-specification Impact — The decision affects multiple specifications or modules
2. Architectural Significance — The decision constrains future design choices
3. Non-trivial Alternatives — Multiple viable options existed
4. Stakeholder Visibility Required — The decision should be reviewable by external parties

**Keep as DD when:**

- Decision is local to this specification only
- No significant alternatives existed
- Rationale is self-evident from context

> **Action**: To promote, run `/deckrd dr --add` with the DD context,
> then update DD Status to `Promoted → DR-xx`.

本ファイルの DD のうち、DD-01 (モジュール名の語彙) と DD-02 (判定に使うテストの範囲) は
`specifications-report-cli.md` の引数規則と実行側の仕様にも波及する。昇格を検討する余地がある。

---

## 3. Behavioral Specification

### 3.1 Input Domain

- Input Type:
  - Target Resolution: モジュール名 1 件
  - Mutant Generation: UTF-8 のソーステキスト 1 件と、そのファイルの識別子
- Assumptions:
  - 事前条件: モジュール名は許可値 (DD-01) の検査を済ませた状態で渡される。許可値の検査と、不明なモジュール名による中止は `specifications-report-cli.md` (R-602) が担う。Target Resolution は許可値でないモジュール名を受け取らない。
  - ソーステキストは TypeScript (または TSX) として妥当であるとは限らない。解析できない箇所は変異体を生成しないだけで、エラーにしない。
  - ソーステキストの改行は `\n` または `\r\n` であり、BOM を含まない (UTF-8 BOM なし規約)。

<!-- impl-note: Mutant generation is implemented as generateMutants(source, filePath): Mutant[] in scripts/testing/mutation/generate-mutants.ts (implemented, beads T-01). Module names are the short names of aplys-tester (MODULE_GLOB_TABLE / VALID_MODULES) minus "all" and "classes". -->

### 3.2 Output Semantics

- Output Meaning:
  - Target Resolution の出力は、「変異対象のソース集合」と「判定に使うテスト集合」の組である。どちらも決定的な順序で並ぶ。
  - Mutant Generation の出力は、行・桁の昇順に並んだ変異体の列である。各変異体が持つ属性は REQ-F-001 が定める。
- Possible Outcomes:
  - 対象解決: ソース集合とテスト集合が返る。いずれかが空集合でもエラーにはしない (空の扱いは後続: ソースが空なら変異体 0 件として REQ-F-018、テストが空ならベースラインで中止として REQ-F-016)。対象解決そのものが失敗する経路は無い (モジュール名は検査済み)。
  - 変異体の生成: 0 件以上の変異体列。変異できる箇所が無ければ 0 件であり、エラーではない。

---

## 4. Decision Rules

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
-->

### 4.1 Target Resolution

事前条件: モジュール名は許可値 (DD-01) であることを検査済みである (`specifications-report-cli.md` の R-602)。不明なモジュール名による中止は本ファイルの規則に含めない。

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                                                                                                                                                               | Outcome                                                                |
| ------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R-101   |    1 | 検査済みのモジュール名を受け取った                                                                                                                                                                                      | 当該モジュール配下の TypeScript / TSX ファイルをソース集合の候補とする |
| R-102   |    2 | 候補のパスが次のいずれかに該当する: `__tests__/` ディレクトリの配下にある、ファイル名が `*.spec.ts` / `*.spec.tsx` に一致する、`*.types.ts` / `*.types.tsx` に一致する、`*.constants.ts` / `*.constants.tsx` に一致する | 候補から除く (DD-03)                                                   |
| R-103   |    3 | 候補のファイル名が、変異体ファイルの命名 `<stem>.mutation-<NNN>.ts` / `<stem>.mutation-<NNN>.tsx`、または一時設定の命名 `deno.mutation-<NNN>.json` に一致する (命名は `specifications-execution.md` の DD-01)           | 候補から除く (DD-06)                                                   |
| R-104   |    4 | 同じモジュール名について、判定に使うテストを決める                                                                                                                                                                      | 当該モジュールの unit テストのみをテスト集合とする (DD-02)             |
| R-105   |    5 | 集合が確定した                                                                                                                                                                                                          | ソース集合・テスト集合をそれぞれ決定的な順序 (昇順) で返す (DD-07)     |

No reordering is permitted.

### 4.2 Mutant Generation

Evaluation MUST follow this order (1 ソースファイルについて、ソーステキストを先頭から走査して適用する):

| Rule ID | Step | Condition                                                                                                                                                                                                    | Outcome                                                                                        |
| ------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| R-106   |    1 | 字句がコメント (行コメント・ブロックコメント) の内部にある                                                                                                                                                   | 変異体を生成しない (REQ-F-002)                                                                 |
| R-107   |    2 | 字句が、正規表現リテラルを含む行にある                                                                                                                                                                       | その行全体から変異体を生成しない (DD-04)                                                       |
| R-108   |    3 | 字句が、文字列リテラルの内部、またはテンプレートリテラルの文字列部 (`${...}` の外側のテキスト) にある。テンプレートリテラルの `${...}` の内部の式は文字列部に含めず、通常のコードとして R-109 以降で評価する | 変異体を生成しない (REQ-F-002)                                                                 |
| R-109   |    4 | 字句が、import 行、または型位置のジェネリクス (`<...>`) の内部にある。型位置のジェネリクスの内部に現れる数値リテラルも含む                                                                                   | 変異体を生成しない。ソースが TSX の場合も、TS と同じ字句規則 (本表) を適用する (DD-05)         |
| R-110   |    5 | 字句が、REQ-F-001 が定めるオペレータのいずれかの適用対象である                                                                                                                                               | 適用箇所ごとに 1 件の変異体を生成する。1 箇所に複数の置換候補があるときは、候補ごとに 1 件     |
| R-111   |    6 | 上記のいずれにも該当しない                                                                                                                                                                                   | 変異体を生成しない                                                                             |
| R-112   |    7 | 全ての箇所の走査が終わった                                                                                                                                                                                   | 変異体を行の昇順、同一行内では桁の昇順に並べて返す。同一入力に対して常に同一の列を返す (DD-07) |

No reordering is permitted.

オペレータの集合と変異体が持つ属性は REQ-F-001 が定める。本仕様が加えるのは次の点である。

- 1 つの適用箇所に置換候補が複数あるときは、候補ごとに別の変異体とする (R-110)。
- 変異体の並びは行の昇順、同一行内では桁の昇順とし、決定的である (R-112)。
- 行は 1 始まりで数える。行テキストは、改行コードを含まない元の行の内容である。

R-107〜R-109 は、既存生成器の実装済みの振る舞いを固定したものである (index Section 7.1)。

<!-- impl-note: The replacement candidates per operator are fixed by the existing generator (e.g. ">" -> ">=" / "<"); this specification does not enumerate them. -->

---

## 5. Edge Cases

| Input                                                                        | Classification                                                | REQ                  | Rationale                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| 変異対象のソースが 1 件も残らないモジュール (全ファイルが除外対象など)       | 空のソース集合。変異体 0 件 (エラーではない)                  | REQ-F-012, REQ-F-018 | 変異体 0 件の扱いは REQ-F-018 が定める                                              |
| 当該モジュールの unit テストが 1 件も無い                                    | 空のテスト集合 (対象解決ではエラーにしない)                   | REQ-F-012            | 中止の判断はベースライン (REQ-F-016) の責務                                         |
| 前回の強制終了で残った変異体ファイル・一時設定が、対象モジュール配下にある   | ソース集合から除く (R-103)                                    | REQ-F-012            | 掃除より前に対象解決が走るため。残骸を変異対象にしない                              |
| `// a > b` のようなコメントだけの行                                          | 変異体 0 件                                                   | REQ-F-002            | AC-002                                                                              |
| `"a > b"` のような文字列リテラル、`` `a > ${x}` `` のテンプレートの文字列部  | 変異体 0 件                                                   | REQ-F-002            | 文字列内の変異は振る舞いを変えない                                                  |
| 正規表現リテラルと比較演算子が同じ行にある                                   | その行からは変異体を生成しない                                | REQ-F-001, REQ-F-002 | DD-04。比較演算子の変異体も生成されない (既知の制限)                                |
| import 行                                                                    | 変異体 0 件                                                   | REQ-F-001            | モジュール指定子は変異対象にしない                                                  |
| 型位置のジェネリクス (`Array<T>` の `<` `>`)                                 | 変異体 0 件                                                   | REQ-F-001            | 比較演算子と区別できない箇所を変異させない                                          |
| 型位置のジェネリクスの内部の数値リテラル (`Foo<1>` の `1`)                   | 変異体 0 件 (R-109)                                           | REQ-F-001            | 実装済みの振る舞いの固定                                                            |
| テンプレートリテラルの `${...}` の内部の式 (`` `${a > b}` `` の `>`)         | 通常のコードとして変異体を生成する (R-108, R-110)             | REQ-F-001, REQ-F-002 | 式は実行時の振る舞いを持つ。除外するのは文字列部だけ                                |
| `src/__tests__/helper.ts`、`foo.spec.ts`、`foo.types.ts`、`foo.constants.ts` | ソース集合から除く (R-102)                                    | REQ-F-012            | DD-03                                                                               |
| `.tsx` ファイル                                                              | TS と同じ字句規則で扱う。JSX のテキスト・属性は特別扱いしない | REQ-F-001            | DD-05。既知の制限 (現状 `.tsx` は存在しない)                                        |
| 改行が `\r\n` のソース                                                       | 変異体の位置・行テキストは改行コードを除いた内容で得られる    | REQ-F-001            | 行テキストは許容リスト照合のキーになるため、改行コードの違いで変わってはならない    |
| 同一行に同じ字句が複数ある                                                   | 出現ごとに別の変異体 (桁で区別)                               | REQ-F-001            | 許容リスト照合で行内の出現順を使う (別ファイル)                                     |
| 同一の入力を 2 回生成する                                                    | 同じ列を返す                                                  | REQ-F-001            | DD-07                                                                               |
| 2/8/16 進・BigInt・`_` 区切り・`.5` の数値リテラル (`0x1F`、`10n`、`.5`)     | リテラル全体を 1 字句として n+1 (`0x20`、`11n`、`1.5`)        | REQ-F-001            | リテラルを途中で切ると構文エラーの変異体になる。基数・接頭辞・`n` 接尾辞は保持      |
| 指数表記の数値リテラル (`1e3`)                                               | 変異体 0 件                                                   | REQ-F-001            | 仮数部への +1 は n+1 にならない                                                     |
| 非 ASCII 識別子 (`変数1` の `1`、`日本true` の `true`)                       | 識別子の一部として扱い、変異体 0 件                           | REQ-F-001            | 識別子は Unicode の ID_Start / ID_Continue で判定する                               |
| 文字列・テンプレート・後置 `++` `--` の直後の `/` (`'6' / 2`)                | 除算として扱い、行の他の候補は通常どおり生成する              | REQ-F-001            | DD-04 の正規表現行の除外を、除算の行に誤って適用しない                              |
| 行末の `\` で次行へ継続する文字列リテラル                                    | 継続先の行の文字列部からも変異体を生成しない                  | REQ-F-002            | 文字列内の変異は振る舞いを変えない                                                  |
| 式の先頭位置の `<` (`<T>(x: T) => x`、`<number>y`)                           | 型引数の開きとみなし、対応する `>` までを変異体 0 件          | REQ-F-001            | 直前にオペランドが無い `<` は二項の比較演算子になりえない                           |
| リテラル型 (`type T = 0 \| 1`、型注釈 `x: true`)                             | 値のリテラルと同じく変異体を生成する                          | REQ-F-001            | 既知の制限。`{ a: true }` や三項演算子と字句で区別できない。型エラーで kill される  |
| 空白なしの比較 `a<b`                                                         | ジェネリクスの開きとみなし、対応する `>` まで変異体 0 件      | REQ-F-001            | 既知の制限。dprint が二項演算子の前後に空白を入れるため、現状の対象に該当箇所は無い |
| 変異体の桁                                                                   | 1 始まりの UTF-16 コード単位で数える                          | REQ-F-001            | サロゲートペアは 2 桁と数える                                                       |

---

## 6. Requirements Traceability

| Requirement ID                                                   | Spec Rule                  | Notes                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-F-001                                                        | R-110, R-112, Edge 5.x     | AC-001。オペレータ集合・変異体が持つ情報・決定的な順序                                                                                      |
| REQ-F-002                                                        | R-106, R-107, R-108, R-109 | AC-002。コメント・文字列・テンプレートの文字列部・正規表現行・import・型位置を除外                                                          |
| REQ-F-012 (対象解決部分)                                         | R-101〜R-105               | 検査済みのモジュール名からの対象解決。モジュール名の検査 (AC-014) と引数の解析 (`--strict` / `--timeout`) は `specifications-report-cli.md` |
| REQ-F-003〜REQ-F-008, REQ-F-016, REQ-F-017                       | -                          | Covered in: `specifications-execution.md`                                                                                                   |
| REQ-F-009, REQ-F-010, REQ-F-015                                  | -                          | Covered in: `specifications-allowlist.md`                                                                                                   |
| REQ-F-011, REQ-F-013, REQ-F-014, REQ-F-018, REQ-F-012 (CLI 引数) | -                          | Covered in: `specifications-report-cli.md`                                                                                                  |

---

## 7. Open Questions

> **Status**: [COMPLETE]

テンプレートリテラル内の式と型位置の数値の扱いは、実装済みの振る舞いを固定する形で解消した (R-108, R-109)。

| # | Question                                                                                                                                                                                       | Source               | Impact                                                                                    |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| 1 | (解消) 変異体・一時設定の命名規則に一致するファイルをソース集合から除く規則 (DD-06) は REQUIREMENTS に明記されていない。対象解決が掃除より前に走る順序 (index の順序制約) から導いた補完である | REQ-F-007, REQ-F-012 | DD-06 を採用する (ユーザー決定 2026-10-07)。順序が「掃除 → 対象解決」に変われば不要になる |

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in requirements.md.
     See docs/.deckrd/rules/deckrd-rule-document-versioning.md -->

| Date       | Version | Description                                                                                                                                                                                                 |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | 1.0.0   | Initial specification                                                                                                                                                                                       |
| 2026-10-08 | 1.1.0   | 許可するモジュール名から `scripts` を除く (libs / classify / export / filter / normalize / set の 6 件)。開発用スクリプトとハーネス自身は変異させず、通常の unit / integration テストで担保する (user 決定) |
| 2026-10-08 | 1.1.1   | based-on を requirements.md v1.1.0 に更新                                                                                                                                                                   |
| 2026-10-09 | 1.2.0   | Edge Cases に数値リテラル全体の字句化・非 ASCII 識別子・文字列等の後の除算・行継続文字列・式の先頭位置の `<` を追加し、リテラル型と空白なし `a<b` の既知の制限、桁の単位 (UTF-16) を明記 (cle-kju.17.1.1)   |
| 2026-10-09 | 1.3.0   | UTF-8（BOM なし）規約 (coding-guidelines.md) に従い、BOM 付きのソースの扱いを仕様から外す。BOM の無い入力を前提とする (cle-kju.17.1.2)                                                                      |
