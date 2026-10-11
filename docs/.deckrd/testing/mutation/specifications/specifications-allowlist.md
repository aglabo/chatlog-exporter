---
title: "Design Specification: mutation testing harness (allowlist)"
based-on: requirements.md v1.1.0
status: Draft
version: 1.0.1
created: "2026-10-07"
---

> Part of split specification. See `specifications-index.md` for full scope.

## 1. Overview

### 1.1 Purpose

等価変異体の判断を再実行のたびに繰り返さないために、許容リストの読み込み・検証、生存変異体との照合、古いエントリの抽出という 3 つの振る舞いを定義する。

### 1.2 Scope

This specification defines the **behavioral rules** and
**classification semantics** of mutation testing harness.

Implementation details are explicitly out of scope.

本ファイルが扱う FR は REQ-F-009 (許容リストとの照合)、REQ-F-010 (古い許容エントリの報告)、REQ-F-015 (理由の無い許容エントリの拒否) に限る。
レポートの書式と終了コードの最終決定は `specifications-report-cli.md` が扱い、本ファイルは同仕様へ渡す照合結果までを定める。

---

## 2. Design Principles

### 2.1 Classification Philosophy

- 許容リストは「人が等価と判断した記録」であり、判断の根拠 (理由) を持たないエントリは記録として成立しない。理由を欠くエントリは黙って無視せず、読み込みの段階で拒否する。
- 変異体の識別は行番号に依存させない。無関係な行の追加・削除では判断が外れず、当該行の書き換えのときだけ外れて、判断のやり直しが必要な場面と一致させる (DR-04)。
- 照合が保証するのは「行テキストと変異の内容が同じ」ことだけである。周辺条件の変更で等価性が失われても検出しない。この限界を仕様として明示し、隠さない。
- 許容は survived にのみ作用する。許容リストは他の判定 (killed / timeout / error / compile-error) を書き換えない。
- 古いエントリは放置すると許容リストが実体と乖離するため、検出して列挙する。ただし古いエントリが実行の成否に及ぼす影響は、本ファイルでは決めない。

### 2.2 Design Assumptions

- 変異体は、照合の前に対象モジュール全体について生成済みである (生成仕様は `specifications-generation.md`)。
- 各変異体は、ファイル・行・オペレータ・置換前後の字句・行テキストを持つ (REQ-F-001)。
- 許容リストはモジュールごとに 1 つ存在しうる。リポジトリ全体で 1 本にはしない。
- 照合の対象となる survived の判定は、実行側 (`specifications-execution.md`) が先に確定している。
- 許容リストの内容は人が書く。誤記は読み込み時に検出するが、内容の妥当性 (本当に等価か) は検証しない。

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit               | Responsibility                                                                | REQ Coverage         |
| ------------------ | ----------------------------------------------------------------------------- | -------------------- |
| Allowlist Loading  | 許容リストの有無の判断、解釈、全エントリの検証 (理由必須)、不正時の中止の合図 | REQ-F-015, REQ-F-009 |
| Allowlist Matching | survived 変異体と許容エントリの照合、許容済み / 未許容の区別                  | REQ-F-009            |
| Stale Detection    | どの生成済み変異体にも一致しないエントリの抽出と列挙の材料の提供              | REQ-F-010            |

#### Unit Interaction Map

```text
+-------------------+     +--------------------+
| Allowlist Loading | --> | Allowlist Matching |
+-------------------+     +--------------------+
   |                              |
   | (invalid: abort,             v
   |  before lock)         +-----------------+
   v                       | Stale Detection |
 [Exit != 0]               +-----------------+
                                  |
                                  v
                        (to Report & Exit Policy)
```

順序制約: Allowlist Loading は、ロックの取得・残骸掃除・ベースライン・変異体の実行のいずれよりも前に完了する。
Allowlist Matching と Stale Detection は、全変異体の判定が出そろった後に行う。

#### Data Flow Diagram

```text
[Allowlist file] --> [Load] --> [Validate every entry] --> [Valid entries]
                                        |                        |
                                        v                        v
                                 [Load error] --> abort   [Match survived mutants]
                                                                 |
                                         +-----------------------+---------------+
                                         v                                       v
                              [Allowed survivors /                    [Stale entries]
                               Unallowed survivors]                          |
                                         |                                   |
                                         +-----------> [Report & Exit Policy] <+
```

<!-- ASCII diagrams only. Mermaid, PlantUML, and SVG are prohibited. -->

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- カバレッジ測定は扱わない。許容リストは変異テストの生存の切り分けにのみ使う ← REQ: Out of Scope #1
- 各モジュールへの変異テストの実施そのものは扱わない。許容リストの中身の作成は各モジュールの作業である ← REQ: Out of Scope #2
- 生存変異体を自動的に kill するテストの生成は扱わない。許容リストは kill できない変異体の記録に限る ← REQ: Out of Scope #3
- 変異体の並列実行は扱わない。照合は全判定の確定後に 1 回行う ← REQ: Out of Scope #4

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                                                                           | Rationale                                                                                       | Affected Rules      | Status           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------- | ---------------- |
| DD-01 | 照合キーは、ファイル・行テキスト (前後の空白を除く)・オペレータ・置換前後の字句・行内の出現順の組とする                                                            | 行番号に依存させず、当該行の書き換えのときだけ判断をやり直させるため                            | R-507, R-509        | Promoted → DR-04 |
| DD-02 | 同一ファイルに同じテキストの行が複数あるとき、キーが一致するすべての変異体にエントリが一致する。1 つのエントリが複数の変異体を許容しうる                           | 行番号を持たないため区別できない。DR-04 の既知の弱点として受け入れ、仕様に明記する              | R-507, R-509        | Active           |
| DD-03 | 行内の出現順は、同一行の中で置換前の字句が同じ適用箇所を左から数えた順位 (1 始まり) とする。置換後の字句の違いは順位に影響しない                                   | 同一行に同じ字句が複数あっても、位置を持たずに区別するため                                      | R-507               | Active           |
| DD-04 | 許容リストのファイルが存在しない場合は、エントリ 0 件の許容リストとして扱い、エラーにしない                                                                        | 切り分け前のモジュールで許容リストを用意させないため (REQ-F-009 の「存在する場合」に対応)       | R-501               | Active           |
| DD-05 | 検証は全エントリに対して先に行い、不正が 1 件でもあれば変異体を 1 件も実行せずに中止する。不正なエントリは、見つかったものをすべて報告する                         | 修正のたびに再実行して 1 件ずつ発見する手間を避け、不正なまま部分的に使うことを防ぐため         | R-503, R-504, R-505 | Active           |
| DD-06 | 古いエントリは、判定の種類を問わず「生成されたどの変異体にも一致しない」エントリとする。survived 以外の変異体に一致するエントリは古いエントリではない              | 古さは当該行の書き換え・削除を指すもので、判定結果の変動とは別の事象であるため                  | R-509               | Active           |
| DD-07 | 古いエントリの終了コードへの影響は本ファイルでは定めず、列挙のみとする。既定では報告のみ、`--strict` では失敗扱いとする方針 (user 決定) は report-cli 仕様が定める | 終了コードの決定は一箇所 (report-cli 仕様) に集約するため。複数仕様にまたがるため昇格を検討する | R-510               | Active           |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions and from decisions confirmed during the design dialogue.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                 | Phase | Impact on This Spec                                                                                              |
| ----- | --------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| DR-04 | 許容リストは行テキストと行内の出現順で変異体を識別する                | req   | 照合キー (DD-01)、古いエントリの定義 (R-509)、理由必須 (R-503)、同テキスト行の弱点 (DD-02) の根拠                |
| DR-03 | 終了コードは既定でレポートのみ、`--strict` で未許容の生存を失敗にする | req   | 古いエントリの扱いが `--strict` の未決事項として残っていた。終了コードへの反映は report-cli 仕様に委ねる (DD-07) |

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

---

## 3. Behavioral Specification

### 3.1 Input Domain

- Input Type: 次の 3 つ。
  - 対象モジュールに対応する許容リスト (存在しない場合を含む)
  - 対象モジュール全体について生成された変異体の集合
  - 各変異体の判定結果
- Assumptions:
  - 許容リストは利用者が編集する外部契約であり、次の形をとる。
    - 置き場所: モジュールごとに 1 ファイル、`scripts/testing/mutation/allowlist/<module>.yaml` (`<module>` は起動引数のモジュール名)。存在しなければエントリ 0 件として扱う (DD-04)
    - 形式: YAML。エントリの列を持つ
    - 各エントリの属性: `file` (対象ファイル)・`lineText` (行テキスト。前後の空白は照合時に除く)・`op` (オペレータ)・`before` / `after` (置換前後の字句。`after` は空文字列を許す)・`occurrence` (行内の出現順。1 始まりの整数、DD-03)・`reason` (等価と判断した理由。必須・空不可)
  - 変異体が持つ行テキストは、行末の改行コード (`\r\n` / `\n`) を含まない。
  - 許容リストはモジュールごとに独立している。他モジュールのエントリは参照しない。
  - 許容リストは人が編集するテキストであり、書式の誤りが起こりうる。

<!-- impl-note: YAML は @std/yaml で読む。型は scripts/testing/mutation/types/mutation.types.ts に置く -->

### 3.2 Output Semantics

- Output Meaning: 許容リストの検証結果と、各 survived 変異体の許容有無、および古いエントリの集合。レポート・終了コードの決定側 (report-cli 仕様) が入力として使う。
- Possible Outcomes:
  - 読み込み成功: 有効なエントリの集合 (0 件を含む) が確定する。
  - 読み込みエラー: 不正なエントリの一覧が得られ、実行は始まらない。
  - 許容済みの生存: 許容エントリに一致した survived 変異体。
  - 未許容の生存: どの許容エントリにも一致しない survived 変異体。
  - 古いエントリ: 生成されたどの変異体にも一致しない許容エントリ。

<!-- impl-note: 読み込みは loadAllowlist、照合と古いエントリの抽出は matchAllowlist (同一モジュール allowlist.ts)。古いエントリの抽出は matchAllowlist の結果に含める -->

---

## 4. Decision Rules

Evaluation MUST follow this order:

| Rule ID | Step | Condition                                                                                              | Outcome                                                                                                 |
| ------- | ---: | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| R-501   |    1 | 対象モジュールの許容リストが存在しない                                                                 | エントリ 0 件の許容リストとして扱い、エラーにしない。R-502〜R-505 は評価しない                          |
| R-502   |    2 | 許容リストが存在し、その内容を許容リストとして解釈できない                                             | 読み込みエラーとする。個々のエントリの検証 (R-503, R-504) は行わない                                    |
| R-503   |    3 | エントリの理由が欠けている、または空である                                                             | 当該エントリを読み込みエラーとして報告する。照合には使わない。全エントリについて評価する                |
| R-504   |    4 | 理由以外の必須属性が欠けている、または値が不正なエントリがある                                         | 当該エントリを読み込みエラーとして報告する。全エントリについて評価する                                  |
| R-505   |    5 | R-502〜R-504 のいずれかで読み込みエラーが 1 件以上ある                                                 | ロックの取得・残骸掃除・ベースライン・変異体の実行の前に中止し、非 0 で終了する。エラーはすべて列挙する |
| R-506   |    6 | (読み込み成功後) 全変異体の判定が出そろい、変異体の判定が survived 以外である                          | 照合の対象にしない。判定は変更しない                                                                    |
| R-507   |    7 | 判定が survived の変異体について、照合キー (DD-01) がすべて一致するエントリが 1 件以上ある             | 「許容済みの生存」とする。複数のエントリが一致しても結果は同じとする                                    |
| R-508   |    8 | 判定が survived の変異体について、R-507 で一致するエントリが無い                                       | 「未許容の生存」とする                                                                                  |
| R-509   |    9 | 有効なエントリのうち、生成された全変異体 (判定の種類を問わない) のいずれともキーが一致しないものがある | 当該エントリを「古いエントリ」とする                                                                    |
| R-510   |   10 | 古いエントリが 1 件以上ある                                                                            | 全件を列挙して報告側へ渡す。本仕様では実行の成否を変えない (終了コードへの反映は report-cli 仕様)       |

No reordering is permitted.

---

## 5. Edge Cases

| Input                                                                           | Classification                                                 | REQ                  | Rationale                                                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| 許容リストのファイルが存在しない                                                | エントリ 0 件。全 survived は未許容の生存 (R-501, R-508)       | REQ-F-009            | 「存在する場合」にのみ照合する。切り分け前のモジュールで実行できるようにする (DD-04) |
| 許容リストは存在するがエントリが 0 件                                           | エントリ 0 件。ファイルが無い場合と同じ結果                    | REQ-F-009            | エントリが無いことは不正ではない                                                     |
| 理由が欠けているエントリ                                                        | 読み込みエラー (R-503)。変異体は実行しない (R-505)             | REQ-F-015            | 理由の無い許容は判断の記録にならない                                                 |
| 理由が空文字のエントリ                                                          | 読み込みエラー (R-503)                                         | REQ-F-015            | 「空」に該当する                                                                     |
| 複数エントリのうち 1 件だけ理由が無い                                           | 全体が読み込みエラー。有効な他のエントリも使わない (R-505)     | REQ-F-015            | 不正なまま部分的に使わない (DD-05)                                                   |
| 複数エントリが不正                                                              | すべてのエラーを列挙して中止                                   | REQ-F-015            | 1 件ずつ修正して再実行する手間を避ける (DD-05)                                       |
| ファイル先頭に行を追加して行番号がずれた                                        | 許容済みの生存として一致し続ける (R-507)                       | REQ-F-009            | 行番号をキーに使わない (AC-010)                                                      |
| 対象行のインデントや行末の空白だけが変わった                                    | 一致し続ける (R-507)                                           | REQ-F-009            | 行テキストは前後の空白を除いて比較する                                               |
| 対象行の内部の空白を含む文字列が書き換わった                                    | エントリは古いエントリ (R-509)、変異体は未許容の生存 (R-508)   | REQ-F-009, REQ-F-010 | 空白の除去は前後に限る。行が変わったので判断をやり直させる (AC-012)                  |
| 許容エントリが指す行が削除された、またはファイルが削除・改名された              | 古いエントリ (R-509)                                           | REQ-F-010            | どの変異体にも一致しない                                                             |
| 同一行に同じ置換前の字句が複数あり、出現順だけが異なる 2 つのエントリ           | それぞれ別の変異体に一致する (R-507)                           | REQ-F-009            | 出現順で区別する (DD-03)                                                             |
| 出現順が実際の適用箇所の数を超えるエントリ                                      | 古いエントリ (R-509)                                           | REQ-F-010            | 対応する変異体が生成されない                                                         |
| 同一ファイルに同じテキストの行が複数あり、一方だけを許容するつもりのエントリ    | 両方の行の変異体に一致し、どちらも許容済みの生存になる (R-507) | REQ-F-009            | 行番号を持たない DR-04 の既知の弱点。仕様として受け入れる (DD-02)                    |
| 許容エントリが、killed / timeout / error / compile-error の変異体にだけ一致する | 古いエントリではない。許容は適用されない (R-506, R-509)        | REQ-F-009, REQ-F-010 | 古さは行の書き換え・削除を指す (DD-06)。許容は survived にのみ作用する               |
| 変異体が 1 件も生成されない                                                     | 有効なエントリはすべて古いエントリ (R-509)                     | REQ-F-010            | どの変異体にも一致しない。変異体 0 件の扱い自体は report-cli 仕様                    |
| CRLF の改行コードを持つソース                                                   | 行テキストは改行コードを含めずに比較する                       | REQ-F-009            | 改行コードの違いで照合が外れないようにする                                           |
| すべての survived が許容済み                                                    | 未許容の生存は 0 件                                            | REQ-F-009            | 区別の結果として自然に導かれる                                                       |
| 実行が途中で中断された                                                          | 古いエントリは、生成済みの変異体全体に対して判定する           | REQ-F-010            | 古さは判定の実行有無に依存しない (DD-06)                                             |

---

## 6. Requirements Traceability

| Requirement ID                                        | Spec Rule                  | Notes                                                                       |
| ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| REQ-F-009                                             | R-501, R-506, R-507, R-508 | AC-010。照合キーは DD-01、同テキスト行の扱いは DD-02、出現順は DD-03        |
| REQ-F-010                                             | R-509, R-510               | AC-012。古さの定義は DD-06。終了コードへの反映は DD-07 (report-cli 仕様)    |
| REQ-F-015                                             | R-502, R-503, R-504, R-505 | AC-011。全エントリの検証と一括報告は DD-05。非 0 終了は REQ-F-013(b) に従う |
| REQ-F-001, REQ-F-002                                  | —                          | Covered in: `specifications-generation.md`                                  |
| REQ-F-003 〜 REQ-F-008, REQ-F-016, REQ-F-017          | —                          | Covered in: `specifications-execution.md`                                   |
| REQ-F-011, REQ-F-012, REQ-F-013, REQ-F-014, REQ-F-018 | —                          | Covered in: `specifications-report-cli.md`                                  |

---

## 7. Open Questions

> **Status**: [COMPLETE]

以下は R-501〜R-510 の導出を妨げない確認事項であり、レビュー (Phase 10 / 12) で決める。

| # | Question                                                                                                           | Source               | Impact                                                                             |
| - | ------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| 1 | 理由が空白文字だけの場合を「空」とみなして読み込みエラーにするか                                                   | REQ-F-015            | R-503 の判定境界。空白のみの理由は記録として成立しないため、エラーとする案が有力   |
| 2 | 理由以外の必須属性の検証範囲 (欠落のみか、型・値域 (出現順は 1 以上の整数、オペレータ名は既知の値) まで検証するか) | REQ-F-015, REQ-F-013 | R-504 の範囲。REQ は「読み込みエラー」を挙げるが、理由以外の検証内容を定めていない |
| 3 | 許容エントリのファイルの表記 (リポジトリルートからの相対パスか、区切り文字は `/` に統一するか)                     | REQ-F-009            | Windows と他 OS で同じ許容リストが一致するかに影響 (REQ-NF-004)                    |
| 4 | 同じキーを持つエントリが重複しているとき、エラーにするか、1 件として扱うか                                         | REQ-F-009, REQ-F-015 | R-504 または R-507 の扱い。重複した一方だけが古いエントリになることは無い          |
| 5 | 許容リストの先頭が空の文書 (内容が無い、またはコメントのみ) をエントリ 0 件とみなすか、解釈不能 (R-502) とするか   | REQ-F-009, REQ-F-015 | 空ファイルの境界 (R-501 と R-502 の間)                                             |

---

## 8. Change History

<!-- SemVer: MAJOR = behavior removed / redefined, MINOR = spec item added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in requirements.md.
     See docs/.deckrd/rules/deckrd-rule-document-versioning.md -->

| Date       | Version | Description                               |
| ---------- | ------- | ----------------------------------------- |
| 2026-10-07 | 1.0.0   | Initial specification                     |
| 2026-10-08 | 1.0.1   | based-on を requirements.md v1.1.0 に更新 |
