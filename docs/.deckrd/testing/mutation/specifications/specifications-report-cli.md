---
title: "Design Specification: mutation testing harness (Report / CLI)"
based-on: requirements.md v1.1.0
status: Draft
version: 1.2.0
created: "2026-10-07"
---

> Part of split specification. See `specifications-index.md` for full scope.

## 1. Overview

### 1.1 Purpose

本仕様は、mutation testing harness の「入口」と「出口」の振る舞いを定める。入口は起動引数の解決である。出口は実行結果のレポートと終了コードの決定である。

対象 FR は REQ-F-011（生存変異体のレポート）、REQ-F-012 のうち起動引数の部分（モジュール値・`--strict`・`--timeout`）、REQ-F-013（既定の終了コード）、REQ-F-014（`--strict` の終了コード）、REQ-F-018（変異体 0 件）である。

### 1.2 Scope

This specification defines the **behavioral rules** and
**classification semantics** of mutation testing harness.

Implementation details are explicitly out of scope.

本ファイルが扱うのは次の 3 点に限る。

- 起動引数の受理条件と、不正時の扱い
- レポートに含める情報とその区別
- 終了コードを非 0 にする条件と、その優先順位

モジュール名からのソース集合・テスト集合の解決は `specifications-generation.md` が扱う。変異体の実行・判定・後始末・drift 検出・ベースライン・ロックは `specifications-execution.md` が扱う。許容リストの読み込み・照合は `specifications-allowlist.md` が扱う。本ファイルは、それらの結果を入力として受け取る側である。

---

## 2. Design Principles

### 2.1 Classification Philosophy

- 生存変異体は「悪」ではなく、人が切り分けるための判断材料である。レポートは切り分けに必要な情報を 1 か所にまとめ、等価として許容済みのものと未許容のものを必ず区別して示す。
- 終了コードは「監査が成立したか」と「品質ゲートを通過したか」の 2 つの意味を持つ。
  - 既定では、監査そのものが成立しなかった場合（引数不正・許容リスト不正・ベースライン失敗・ロック失敗・drift）だけを非 0 にする。
  - `--strict` では、それに加えて品質ゲートとしての不合格を非 0 にする。
- 変異体単位の失敗（error / timeout / compile-error）は、既定の終了コードに影響させない。レポートの件数で扱う。
- compile-error は killed と別に数え、検出力の指標（kill 率・有効判定）から除く（DR-02）。

### 2.2 Design Assumptions

- 引数解決は、ロック取得・許容リスト読み込み・ファイル書き込みのいずれよりも前に完結する。引数が不正なら、リポジトリには何も書き込まれない。
- レポートの入力は、判定集合・許容リストの照合結果・drift・残骸・`--strict` の有無・中断の有無で完結する。レポート生成と終了コード決定は、これらだけに依存して決まる（入力が同じなら出力も同じ）。
- 出力先は 2 系統に分ける。標準出力にはレポート本体のみを書く。ログ・警告・エラー通知は標準エラー出力に書く。
- 判定の集合は、実行した変異体のみを対象とする。

### 2.3 External Design Summary

> **Source**: Derived from the external design dialogue (Phase E) and user-confirmed design direction (Phase D).

#### Feature Decomposition

| Unit                | Responsibility                                                               | REQ Coverage                     |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| Argument Resolution | モジュール値・`--strict`・`--timeout` を受理または拒否し、実行条件を確定する | REQ-F-012（引数部分）            |
| Report Composition  | 判定集合・照合結果・drift 等から、標準出力に出すテキストを構成する           | REQ-F-011, REQ-F-018             |
| Exit Policy         | 実行結果と `--strict` の有無から、終了コードを決める                         | REQ-F-013, REQ-F-014, REQ-F-018  |
| Entry Contract      | 起動引数を受け、各単位を順に呼び出して終了コードを確定させる                 | REQ-F-012（引数部分）, REQ-F-013 |

#### Unit Interaction Map

<!-- impl-note: original said "引数を受けて終了コードを返す。プロセス終了はエントリポイントでのみ行う（REQ-C-003）" (Entry Contract) -->

```text
+---------------------+     +-----------------------+
| Argument Resolution | --> | (他仕様の実行フロー)  |
+---------------------+     +-----------------------+
                                       |
                                       | 判定集合 / 照合結果 / drift / 残骸
                                       v
                            +-----------------------+
                            |  Report Composition   |
                            +-----------------------+
                                       |
                                       v
                            +-----------------------+
                            |      Exit Policy      |
                            +-----------------------+
```

- Argument Resolution の失敗は、他仕様の実行フローを始める前に Exit Policy へ直結する（レポートは構成しない）。
- Report Composition と Exit Policy は、同じ入力から独立に決まる。レポートの内容は終了コードに依存しない。逆に終了コードは、レポートに出る数値と一貫している（レポートの「未許容の生存 N 件」が 1 以上かつ `--strict` なら非 0）。

#### Data Flow Diagram

```text
[argv] --> [Argument Resolution] --> [実行条件: module / strict / timeout]
                  |                              |
                  v                              v
            [引数エラー]                  (他仕様の実行フロー)
            stderr + 非 0                         |
                                                  v
                          [判定集合 / 照合結果 / drift / 残骸 / 中断有無]
                                    |                         |
                                    v                         v
                          [Report Composition]         [Exit Policy] <-- strict
                                    |                         |
                                    v                         v
                              [stdout テキスト]         [終了コード]
```

<!-- ASCII diagrams only. Mermaid, PlantUML, and SVG are prohibited. -->

### 2.4 Non-Goals

> **Derivation**: All items below originate from REQUIREMENTS Section "Out of Scope".

- カバレッジ測定は扱わない ← REQ: Out of Scope #1
- 各モジュールへの変異テストの実施そのものは、本仕様の対象としない ← REQ: Out of Scope #2
- 生存変異体を自動的に kill するテストの生成は行わない ← REQ: Out of Scope #3
- 変異体の並列実行は行わない ← REQ: Out of Scope #4

### 2.5 Behavioral Design Decisions

| ID    | Decision                                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                        | Affected Rules | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| DD-01 | `<module>` に取れる値は、既存のモジュール別テスト起動で使う短縮名から `all`・`classes`・`scripts` を除いたもの（libs / classify / export / filter / normalize / set）とする                                                                             | 判定に使うのは unit テストのみで、`all` は複数モジュールにまたがり、`classes` は変異対象の定義が無い。user 決定 (2026-10-07)。`scripts` は開発用スクリプトとハーネス自身を含むため変異させず、通常の unit / integration テストで担保する。user 決定 (2026-10-08) | R-602          | Active |
| DD-02 | レポートは標準出力のテキストのみとし、機械可読形式（JSON 等）は出さない。ログは標準エラー出力に分ける                                                                                                                                                   | 利用者は人（開発者・レビュー担当）で、終了コードが機械向けの出口になる。user 決定 (2026-10-07)                                                                                                                                                                   | R-605〜R-613   | Active |
| DD-03 | `--timeout` は正の整数（秒）のみ受理し、省略時は 120 秒とする                                                                                                                                                                                           | REQ-NF-003 の既定値に合わせ、0・負数・小数・非数を曖昧に解釈しない。user 決定 (2026-10-07)                                                                                                                                                                       | R-603, R-604   | Active |
| DD-04 | `--strict` では、古い許容エントリが 1 件以上ある場合も非 0 で終了する。既定では報告のみとする                                                                                                                                                           | 許容リストが実体と乖離したモジュールを品質ゲートに通さないため。user 決定 (2026-10-07)                                                                                                                                                                           | R-619, R-616   | Active |
| DD-05 | 「有効な判定」を killed と survived の合計とし、kill 率は killed を有効な判定で割った値とする。compile-error・timeout・error は分母に含めない                                                                                                           | REQ-F-014 の「有効な判定」の定義と揃え、DR-02 の趣旨（型検査や環境要因を検出力に混ぜない）に従う                                                                                                                                                                 | R-608, R-618   | Active |
| DD-06 | SIGINT で中断した場合は、後始末と drift 検査を終えた後、そこまでの判定でレポートを出し、終了コード 130 で終える                                                                                                                                         | 中断を成功と区別でき、シェルの慣例とも一致する。中断時の後始末の手順は execution 仕様が定める                                                                                                                                                                    | R-605, R-614   | Active |
| DD-07 | 後始末で削除できなかったファイルは「残骸」としてレポートに列挙し警告するが、終了コードは変えない                                                                                                                                                        | REQ-F-013 が非 0 の条件を限定列挙しているため。回収は次回起動時の掃除に委ねる                                                                                                                                                                                    | R-612, R-616   | Active |
| DD-08 | 全件が survived のファイルがある場合は、「差し替えが効いていない可能性」を警告する。終了コードは変えない                                                                                                                                                | 実行時にはロードの検査をしないため、レポートの警告で補う。user 決定 (2026-10-07)                                                                                                                                                                                 | R-613          | Active |
| DD-09 | 終了コードの具体値は、中断のみ 130 と固定し、それ以外の失敗は「非 0」とだけ定める                                                                                                                                                                       | 要件が非 0 としか定めておらず、呼び出し側が区別する必要も無い                                                                                                                                                                                                    | R-614, R-615   | Active |
| DD-10 | 監査単位の失敗 (execution DD-14) のうち、レポートを出す段階で判明したものは、drift の直後に「監査の失敗」として理由を列挙する。0 件ならセクションを出さない。レポート構成前に中止する経路 (起動時の掃除の失敗など) は従来どおり標準エラー出力のみとする | 監査単位の失敗は非 0 (R-615) になるため、レポートにその理由が出ないと終了コードとレポートが食い違う (2.3)。drift と同じく監査が成立しない理由なので並べる。user 決定 (2026-10-09)                                                                                | R-621, R-615   | Active |

> **Note**: Decisions listed here derive from REQUIREMENTS Design Decisions.
> If promoting to formal Decision Record, use `/deckrd dr --add`.

**Status Values:**

- `Active` — Currently in effect within this specification
- `Promoted → DR-xx` — Elevated to formal Decision Record (see Section 2.6)

### 2.6 Related Decision Records

> **Reference**: This section lists formal DRs that affect this specification.
> DRs are maintained in `decision-records.md` and are authoritative.

| DR-ID | Title                                                                 | Phase | Impact on This Spec                                                                                             |
| ----- | --------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| DR-02 | 判定を 5 種にし、型検査の失敗を compile-error として分ける            | req   | レポートの件数は 5 種を別々に出す。kill 率と有効な判定から compile-error を除く（R-607, R-608）                 |
| DR-03 | 終了コードは既定でレポートのみ、`--strict` で未許容の生存を失敗にする | req   | 既定と `--strict` の 2 系統の終了コード規則の根拠（R-616〜R-620）。古いエントリの扱いは Open Question #1 を参照 |
| DR-04 | 許容リストは行テキストと行内の出現順で変異体を識別する                | req   | 古いエントリの列挙（R-610）と、許容済み・未許容の生存の区別（R-607, R-609）の前提                               |
| DR-08 | 変異前に元ソースでテストを実行し、監査が成立しない場合は失敗にする    | req   | 有効な判定 0 件を `--strict` で失敗にする規則（R-618）と、ベースライン失敗時の非 0（R-615）                     |
| DR-09 | ロックで同時起動を拒否し、残骸の掃除はロック取得後に行う              | req   | ロック取得失敗時の非 0（R-615）                                                                                 |

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

<!-- 参考: DD-04 は DR-03 の未決事項を閉じるもので、requirements への反映が必要なため、DR への昇格候補（Open Question #1 を参照）。 -->

---

## 3. Behavioral Specification

### 3.1 Input Domain

- Input Type:
  - 起動引数: 位置引数 1 個（モジュール名）、真偽フラグ `--strict`、値付きオプション `--timeout <秒>`
  - 実行結果の集約: 判定集合（5 種）、許容リストの照合結果（許容済みの生存・未許容の生存・古いエントリ）、drift、残骸、中断の有無
- Assumptions:
  - 起動コマンドは `deno task test:mutate <module> [--strict] [--timeout <seconds>]` である。
  - 実行結果の集約は、他仕様（execution / allowlist）が確定させたものを受け取る。本仕様は、その内容を作り直さない。
  - 変異体 1 件には、ファイル・行・オペレータ・置換前後の字句が必ず付いている（REQ-F-001）。

### 3.2 Output Semantics

- Output Meaning:
  - 標準出力: 実行結果のレポート（人が読むテキスト）
  - 標準エラー出力: 引数エラー・ログ・警告
  - 終了コード: 監査が成立したか、`--strict` の場合は品質ゲートを通過したか
- Possible Outcomes:
  - 引数エラー: 何も実行せず、標準エラー出力に理由を出し、非 0 で終了する
  - 実行前の中止（許容リスト不正・ベースライン失敗・ロック取得失敗）: 変異体を実行せず、理由を標準エラー出力に出し、非 0 で終了する。レポートは構成しない。ベースラインで中止した場合に drift があれば、標準エラー出力に列挙する
  - 完了（レポートあり）: レポートを標準出力に出し、規則に従って 0 または非 0 で終了する
  - 中断（レポートあり）: 途中結果であることを明示したレポートを出し、130 で終了する
  - 変異体 0 件: 0 件であることをレポートし、通常の完了と同じ規則で終了する

---

## 4. Decision Rules

<!--
Rule ID format: R-NNN (sequential, stable)
Rule IDs are referenced in Traceability and Edge Cases.
本ファイルの Rule ID は R-6xx の範囲を使う（split 間の衝突を避けるため。範囲の割り当ては index: R-0xx 全体順序、generation R-1xx、execution R-2xx、allowlist R-5xx、report-cli R-6xx）。
-->

評価は 4.1 → 4.2 → 4.3 の順に行う。各表の中では、Step の順に評価し、最初に該当した規則で結果が決まる（4.2 を除く）。

### 4.1 Argument Resolution

引数解決は、他の処理（許容リストの読み込み・ロック取得・ソース解決）より前に行う。

| Rule ID | Step | Condition                                                                                   | Outcome                                                                                                                                                                           |
| ------- | ---: | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-601   |    1 | モジュール名が指定されていない                                                              | 引数エラー。何も実行せず非 0 で終了する                                                                                                                                           |
| R-602   |    2 | モジュール名が許可値（libs / classify / export / filter / normalize / set）のいずれでもない | 引数エラー。何も実行せず非 0 で終了する。`all`・`classes`・`scripts`・ディレクトリ名もここに該当する                                                                              |
| R-603   |    3 | `--timeout` が指定され、値が欠落しているか、正の整数でない（0・負数・小数・数字以外を含む） | 引数エラー。何も実行せず非 0 で終了する                                                                                                                                           |
| R-604   |    4 | 上記のいずれにも該当しない                                                                  | 引数解決は成功する。制限時間は指定値（秒）、無指定なら 120 秒。この値はベースラインと各変異体のテスト実行の 1 回ごとに適用する（execution の DD-10）。`--strict` の有無を確定する |

引数エラーでは、エラーの理由（どの引数がなぜ不正か、許可値の一覧）を標準エラー出力に出す。標準出力にはレポートを出さない。

### 4.2 Report Composition

レポートは次の順序で構成する。各規則は独立しており、該当するものをすべて出す。

| Rule ID | Step | Condition                                                      | Outcome                                                                                                                                                                                                                                                                   |
| ------- | ---: | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-605   |    1 | SIGINT により途中で終了した                                    | レポートの先頭に「中断（途中結果）」であることを明示する。以降は、判定済みの変異体だけを対象に構成する                                                                                                                                                                    |
| R-606   |    2 | 実行対象の変異体が 0 件                                        | 「変異体 0 件」であることを明示する。判定ごとの件数と未許容の生存は 0 件・空として出し、古いエントリ・drift・警告・残骸は通常どおり出す                                                                                                                                   |
| R-607   |    3 | 常に                                                           | 判定ごとの件数（killed / survived / timeout / error / compile-error）を出す。survived は、許容済みと未許容に内訳を分けて示す                                                                                                                                              |
| R-608   |    4 | 常に                                                           | kill 率（killed ÷ (killed + survived)、百分率）を出す。killed + survived が 0 件なら「算出不能」とする。compile-error は分母に含めない。あわせて有効判定率（(killed + survived) ÷ 変異体の総数、百分率）を出し、kill 率が少数の有効判定に基づくことを読み取れるようにする |
| R-609   |    5 | 常に                                                           | 未許容の生存変異体の一覧（file:line・オペレータ・置換前後の字句）を出す。0 件なら 0 件と明示する。並びはファイル・行・桁の昇順                                                                                                                                            |
| R-610   |    6 | 常に                                                           | 古い許容エントリを列挙する。0 件なら 0 件と明示する                                                                                                                                                                                                                       |
| R-611   |    7 | 常に                                                           | drift（実行前後で内容が変わった元ソースファイル）を列挙する。0 件なら 0 件と明示する                                                                                                                                                                                      |
| R-621   |    8 | レポートを出す段階で、監査単位の失敗 (execution DD-14) がある  | 「監査の失敗」として理由を列挙する。無ければセクションを出さない (DD-10)                                                                                                                                                                                                  |
| R-612   |    9 | 後始末で削除できなかったファイルがある                         | 「残骸」として列挙し、警告する。無ければセクションを出さない                                                                                                                                                                                                              |
| R-613   |   10 | あるソースファイルについて、有効な判定がすべて survived である | そのファイルに対し「差し替えが効いていない可能性」を警告する。有効な判定が 0 件のファイルは対象にしない                                                                                                                                                                   |

許容済みの生存は、未許容の生存の一覧（R-609）には含めない。許容済みの件数は R-607 の内訳でのみ示す。

### 4.3 Exit Policy

終了コードは次の順に評価し、最初に該当した規則で決まる。引数エラー・許容リスト不正・ベースライン失敗・ロック取得失敗は、実行前に確定し、その時点で終了する（レポートは構成しない）。

| Rule ID | Step | Condition                                                                                                                                                                                                                                     | Outcome                                                                                                                      |
| ------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R-614   |    1 | SIGINT により中断された                                                                                                                                                                                                                       | 130 で終了する。他の条件にかかわらず、この規則が優先する                                                                     |
| R-615   |    2 | 引数・モジュール名の不正、許容リストの読み込みエラー（理由の無いエントリを含む）、drift の検出、ベースラインの失敗、ロックの取得失敗、監査全体にかかわる処理 (残骸掃除・ハッシュ取得・レポート出力) の失敗 (execution DD-14) のいずれかがある | 非 0 で終了する（130 以外の値）                                                                                              |
| R-616   |    3 | `--strict` が指定されていない                                                                                                                                                                                                                 | 0 で終了する。変異体単位の error / timeout / compile-error、未許容の生存、古いエントリ、残骸、警告は、終了コードに影響しない |
| R-617   |    4 | `--strict` が指定され、未許容の生存が 1 件以上ある                                                                                                                                                                                            | 非 0 で終了する                                                                                                              |
| R-618   |    5 | `--strict` が指定され、変異体が 1 件以上あるのに、有効な判定（killed + survived）が 0 件である                                                                                                                                                | 非 0 で終了する                                                                                                              |
| R-619   |    6 | `--strict` が指定され、古い許容エントリが 1 件以上ある                                                                                                                                                                                        | 非 0 で終了する                                                                                                              |
| R-620   |    7 | 上記のいずれにも該当しない                                                                                                                                                                                                                    | 0 で終了する                                                                                                                 |

No reordering is permitted.

<!-- impl-note: エントリポイントは main(argv?: string[]): Promise<number>。main は throw / return で抜け、Deno.exit は if (import.meta.main) のブロックでのみ呼ぶ (REQ-C-003)。deno.jsonc の test:mutate タスクから起動する。ファイルは scripts/testing/mutate-tester.ts -->
<!-- impl-note: 判定集合・照合結果・drift・strict から (テキスト, 終了コード) を返す純関数として formatReport / decideExitCode を置く。provider を注入せずにテストできること (REQ-NF-002) -->
<!-- impl-note: 引数エラーは ChatlogError を throw し、エントリポイントで catch して stderr に出してから終了する。parseOptions (_cle-libs) の流用可否は impl で確認する。deno.jsonc に @std/cli は無い -->

---

## 5. Edge Cases

| Input                                                              | Classification                                                                  | REQ                  | Rationale                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| モジュール名なし（`deno task test:mutate` のみ）                   | 引数エラー（R-601）。非 0                                                       | REQ-F-012, REQ-F-013 | 対象が決まらない                                                    |
| `unknown`（存在しないモジュール名）                                | 引数エラー（R-602）。変異体を 1 件も実行しない                                  | REQ-F-012            | AC-014                                                              |
| `all` / `classes`                                                  | 引数エラー（R-602）                                                             | REQ-F-012            | モジュール別テスト起動では有効でも、変異対象を決められない（DD-01） |
| `normalize-chatlogs` などのスキルのディレクトリ名                  | 引数エラー（R-602）                                                             | REQ-F-012            | 許可値は短縮名のみ                                                  |
| `--timeout 0` / `--timeout -5` / `--timeout 1.5` / `--timeout abc` | 引数エラー（R-603）                                                             | REQ-F-012            | 正の整数のみ受理（DD-03）                                           |
| `--timeout` のみで値が無い                                         | 引数エラー（R-603）                                                             | REQ-F-012            | 値が欠落している                                                    |
| `--timeout` 省略                                                   | 制限時間 120 秒（R-604）                                                        | REQ-F-012            | 既定値                                                              |
| 変異体 0 件、`--strict` なし                                       | 「変異体 0 件」をレポート、0 で終了（R-606, R-616）                             | REQ-F-018            | AC-021                                                              |
| 変異体 0 件、`--strict` あり、古いエントリなし・drift なし         | 0 で終了（R-618 は変異体 1 件以上が前提）                                       | REQ-F-018, REQ-F-014 | 変異体が無いので、有効な判定 0 件を失敗にしない                     |
| 変異体 0 件、`--strict` あり、許容リストにエントリが残っている     | 全エントリが古いエントリとなり、非 0（R-619）                                   | REQ-F-018, REQ-F-014 | 許容リストが実体と乖離している                                      |
| 未許容の生存 1 件、drift なし、`--strict` なし                     | 一覧に出力し、0 で終了（R-616）                                                 | REQ-F-013            | AC-015                                                              |
| 未許容の生存 1 件、drift なし、`--strict` あり                     | 非 0（R-617）                                                                   | REQ-F-014            | AC-016                                                              |
| すべての生存が許容済み、`--strict` あり                            | 0 で終了（R-620）。許容済みの件数は内訳に出す                                   | REQ-F-014            | 未許容の生存が無い                                                  |
| 2 件ともすべて timeout、`--strict` なし                            | 0 で終了（R-616）。kill 率は「算出不能」                                        | REQ-F-013            | 変異体単位の失敗は終了コードに影響しない                            |
| 2 件ともすべて timeout（または error）、`--strict` あり            | 非 0（R-618）                                                                   | REQ-F-014            | AC-020。有効な判定が 0 件                                           |
| 変異体 1 件以上がすべて compile-error、`--strict` あり             | 非 0（R-618）                                                                   | REQ-F-014            | compile-error は有効な判定ではない（DR-02）                         |
| 古い許容エントリ 1 件、他は問題なし、`--strict` なし               | レポートに列挙し、0 で終了（R-616）                                             | REQ-F-013            | 既定では報告のみ（DD-04）                                           |
| 古い許容エントリ 1 件、他は問題なし、`--strict` あり               | 非 0（R-619）                                                                   | REQ-F-014            | DD-04                                                               |
| drift が 1 件以上、`--strict` なし                                 | レポートに列挙し、非 0（R-615）                                                 | REQ-F-013            | drift はソースを書き換えない設計の違反であり、既定でも失敗とする    |
| レポートを出す段階で監査単位の失敗が 1 件ある                      | 「監査の失敗」として理由を列挙し、非 0（R-621, R-615）                          | REQ-F-013            | DD-10。0 件ならセクションを出さない                                 |
| 後始末で削除できないファイルが残った                               | 「残骸」として列挙し警告。終了コードは変えない（R-612, R-616）                  | REQ-F-013            | DD-07                                                               |
| あるファイルの有効な判定がすべて survived                          | 警告を出す。終了コードは変えない（R-613）                                       | REQ-F-011            | 差し替えが効いていない可能性（DD-08）                               |
| ある変異体が compile-error になっている                            | compile-error として別に数える。kill 率の分母に含めない（R-607, R-608）         | REQ-F-011            | DR-02                                                               |
| SIGINT による中断                                                  | 中断を明示した途中結果のレポートを出し、130 で終了（R-605, R-614）              | REQ-F-013            | DD-06。drift など他の非 0 要因があっても 130 を優先する             |
| 許容リストの読み込みエラー                                         | 変異体を実行せず、標準エラー出力に理由を出し非 0。レポートは構成しない（R-615） | REQ-F-013            | 実行前の中止                                                        |
| ベースラインの失敗、またはテスト 0 件                              | 変異体を実行せず非 0（R-615）                                                   | REQ-F-013            | 実行前の中止（DR-08）                                               |
| ロック取得の失敗                                                   | 何も削除・実行せず非 0（R-615）                                                 | REQ-F-013            | 実行前の中止（DR-09）                                               |
| 有効な判定が 0 件のとき（全件 timeout など）                       | kill 率は「算出不能」と出す（R-608）                                            | REQ-F-011            | 0 での除算を避ける                                                  |
| 同一テキストの行が複数あり、許容エントリが両方に一致               | 両方を許容済みの生存として数える。レポートの内訳もそれに従う                    | REQ-F-011            | DR-04 の既知の弱点。詳細は `specifications-allowlist.md`            |

---

## 6. Requirements Traceability

| Requirement ID                             | Spec Rule                              | Notes                                                                                                     |
| ------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| REQ-F-011                                  | R-605〜R-613, R-621, Edge 5            | AC-013。件数・未許容の生存・古いエントリ・drift を出力。残骸・警告・中断の明示は本仕様での追加            |
| REQ-F-012                                  | R-601〜R-604, Edge 5                   | AC-014, AC-024。起動引数の部分のみ。ソース・テスト集合の解決は Covered in: `specifications-generation.md` |
| REQ-F-013                                  | R-614〜R-616, R-620, Edge 5            | AC-015, AC-023。実行前の中止の扱いを含む。SIGINT の 130 は DD-06 で決め、requirements v1.1.0 に追記済み   |
| REQ-F-014                                  | R-617〜R-620, Edge 5                   | AC-016, AC-020, AC-022。古いエントリでの失敗（R-619）は DD-04 で決め、requirements v1.1.0 に追記済み      |
| REQ-F-018                                  | R-606, R-616, R-618, Edge 5            | AC-021                                                                                                    |
| REQ-NF-002                                 | R-605〜R-621（入出力が純粋であること） | レポート生成と終了コード決定は、判定結果のみから決まる                                                    |
| REQ-C-003                                  | 4.3 の impl-note                       | プロセス終了はエントリポイントでのみ                                                                      |
| REQ-F-001, REQ-F-002                       | (対象外)                               | Covered in: `specifications-generation.md`                                                                |
| REQ-F-003〜REQ-F-008, REQ-F-016, REQ-F-017 | (対象外)                               | Covered in: `specifications-execution.md`                                                                 |
| REQ-F-009, REQ-F-010, REQ-F-015            | (対象外)                               | Covered in: `specifications-allowlist.md`                                                                 |

---

## 7. Open Questions

> **Status**: COMPLETE

実装を妨げる曖昧さは無い。#1 は requirements v1.1.0 で解消した。

| # | Question                                                                                                                                                                                       | Source                                  | Impact                                                        |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| 1 | (解消) `--strict` で古い許容エントリを失敗にする決定（user, 2026-10-07）は、requirements v1.1.0 で REQ-F-014 に追記した (AC-022)                                                               | REQ-F-014, DR-03, Open Questions (user) | R-619 と Edge 5 の古いエントリの行が、requirements と食い違う |
| 2 | kill 率の分母を killed + survived とした（DD-05）。timeout / error を分母に含める案もあり得る。レビューで確認する                                                                              | REQ-F-011                               | R-608 の数値。終了コードには影響しない                        |
| 3 | (解消) 変異体が 0 件のときもベースラインを実行する。全体順序でベースライン (index R-007) は変異体の生成 (index R-008) より前にあるため、ベースラインの失敗は変異体 0 件でも非 0 になる (R-615) | REQ-F-016, REQ-F-018                    | 変異体 0 件のときの終了コード                                 |
| 4 | (解消) `--timeout` の値はベースラインの実行にも同じく適用する (execution の DD-10)                                                                                                             | REQ-NF-003, REQ-F-016                   | R-604                                                         |
| 5 | `--timeout=30` の形式、未知のオプション、`--strict` / `--timeout` の重複指定、オプションの位置（モジュール名の前後）、余分な位置引数の扱い。要件に定めが無い                                   | REQ-F-012                               | 引数エラーの範囲（R-601〜R-603 に追加が要るか）               |
| 6 | 「差し替えが効いていない可能性」の警告（R-613）の最小件数。有効な判定が 1 件のみで survived のファイルも警告するか                                                                             | REQ-F-011                               | 警告のノイズ量                                                |
| 7 | 中断時に、未実行の変異体の件数をレポートに出すか（本仕様は判定済みのみを対象とした）                                                                                                           | REQ-F-011                               | R-605 の表示内容                                              |
| 8 | 非 0 の具体値。130 以外は「非 0」としか定めていない（DD-09）。区別が要るなら別途決める                                                                                                         | REQ-F-013                               | 呼び出し側のスクリプト                                        |

<!-- impl-note: original said "実装では 1 を使う想定だが、区別が要るなら別途決める" (OQ #8)。非 0 は 1 を想定 -->
<!-- impl-note: OQ #9 (エントリポイントのファイルとそのテストが module.md の owns の範囲外になる) は index Section 4 の impl-note へ集約したため削除 -->

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
| 2026-10-08 | 1.1.1   | based-on を requirements.md v1.1.0 に更新。Open Question #1 (`--strict` と古いエントリ) を要件側で解消済みとする                                                                                            |
| 2026-10-09 | 1.2.0   | R-621 / DD-10 を追加。レポートを出す段階の監査単位の失敗 (execution DD-14) を drift の直後に「監査の失敗」として列挙する (0 件なら出さない)。R-612 / R-613 の Step を 9 / 10 に繰り下げる (user 決定)       |
