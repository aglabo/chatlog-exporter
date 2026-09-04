---
title: "Review: libs/ai-backend tasks.md"
phase: explore
persona: Design Reviewer
document: "docs/.deckrd/libs/ai-backend/tasks/tasks.md"
date: "2026-09-04"
status: draft
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-exclamation-question-mark,
  ja-technical-writing/max-comma,
  ja-technical-writing/no-unmatched-pair,
  -->

<!-- cspell:words llamacpp -->
<!-- markdownlint-disable line-length -->

> **Explore Review Report**
> Persona: Design Reviewer
> Purpose: Initial exploration, identify gaps and alternatives

## 1. Summary

- Document Reviewed: `docs/.deckrd/libs/ai-backend/tasks/tasks.md`
- Document Type: tasks（15 Test Target / 112 scenario / 172 case、`based-on: implementation.md v1.3.2`）
- Total Questions: 14
- Total Concerns: 6 gaps / 4 assumptions / 3 alternatives / 4 ambiguous terms

### 1.1 機械検査の結果（所見ではなく前提の確認）

以下は本レビューで実際に検査した項目であり、いずれも整合していた。所見はこの前提のうえに立つ。

| 検査項目                                       | 結果                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| 定義済み case 数 と Task Summary 合計          | 172 = 172 で一致                                                       |
| Task Summary の scenario / case 列と本文の実数 | 全 15 Test Target で一致                                               |
| Category Balance の列合計（64 / 57 / 51）      | 各行の実数および総計 172 と一致                                        |
| Coverage Check が引用する Task ID の実在       | 未定義 ID の引用は 0 件                                                |
| DR 母集団 25 件（DR-07 / DR-08 を除く）        | Decision Records 表の行数と一致                                        |
| Test ID prefix の空き                          | `T-LIB-J` は 19 まで・`T-LIB-AI-RA` は 49 まで既存、`T-CLS-GCL` 未使用 |
| `based-on` のバージョン                        | implementation.md frontmatter の `version: 1.3.2` と一致               |

数量的な自己整合は取れている。以下の所見は、数え間違いではなく **タスクの実行可能性・境界・
追跡可能性の宣言範囲** についてのものです。

---

## 2. Questions & Concerns

### 2.1 Completeness

- Q-01: `Coverage Check` の母集団は Edge Cases 40 行 + Active DD 13 件 + DR 25 件 + AC 24 件と
  宣言されている。一方 implementation.md §4 は 4 分冊の規範規則 R-NNN 計 30 件について
  Rule → Commit の対応表を持つ。tasks.md 側に Rule → Task の対応表がないため、
  「全 30 規則が最低 1 ケースを持つ」ことを本文書だけで確認できないのではないか。
  （実際に各タスクの `Rule:` 行を集計すると 29 件が参照され、未参照は
  `structured-output R-006`（Phase 0 実測ゲート）1 件のみだった。DR-09 と同様に
  「対象外 — Phase 0 が担う」と明示する余地があるのではないか）
- Q-02: Phase 5 以降の着手条件は「Phase 0 実測ゲートの合格」だが、Phase 0 は commit を持たず
  タスク化もされていない。AC-016 / DR-09 / DR-22 / DR-25 はいずれも `対象外` として
  Coverage Check から外れている。ゲートの合否をこの文書の外側でどう確認する想定か、
  着手判断の根拠を残す方法を検討してはどうか。
- Q-03: `Task Summary` の `Status` 列は全 15 行が `pending` である。Phase 0 の測定作業は
  この表に現れないため、進捗を追う側から見ると Phase 5 に進める状態かどうかが表から読めない。
  Phase 0 を Status 表に非タスク行として置く選択肢を検討してはどうか。
- Q-04: Phase 0 依存の未決 3 件（implementation §3.2）に対し、改訂条件の blockquote は
  T-09-11-01 / T-12-06-01 / T-12-07-01 / T-12-10-01 の 4 タスクに付いている。
  T-12-06-01 と T-12-07-01 が同一の未決（400 の読み分け）の表裏である旨は文脈から読めるが、
  明示されていない。3 件と 4 タスクの対応を書き添えてはどうか。

### 2.2 Ambiguity

- Q-05: T-06（Commit 6〜9）と T-13（Commit 16〜19）は、複数の commit を 1 つの Test Target に
  束ねている。case からファイル名は読めるが、どの case がどの commit に属するかの対応は
  明示されていない。このリポジトリの `.claude/rules/bdd-cycle.md` は
  「1 委譲 = 1 タスク」「他タスクを含む資料を渡さない」を定めているため、
  委譲用チェックリストを切り出す側が推測で分割することにならないか。
- Q-06: T-14 全体・T-07-05-01 / -02・T-07-06-01・T-15-04-01・T-15-08-01 は
  「静的検査」「実行順序を検査する」といった、ソーステキストや構成ファイルの検査である。
  他のタスクが関数名を `Target` に置くのに対し、これらの `Target` は
  「`--allow-net` 付与範囲の静的検査」のように検査そのものを指している。
  検査する補助関数を実装成果物として扱うのか、テスト内に閉じたヘルパとするのか、
  どちらの想定か明確にしてはどうか。
- Q-07: T-07-06-01 の Expected は「`_runViaCli` がモジュール外から import できないこと」だが、
  export されていない識別子はテストファイルから参照できないため、
  「参照を試みる」テストは記述できない。実現可能な形は export 一覧の静的読み取りだと読めるが、
  そう読んでよいか。
- Q-08: T-15-02-01 の Scenario に「構築処理の共有を検証する形で代替可」という但し書きがある。
  代替が許される条件と、代替した場合の合格線が読み取りにくい。
  何をもって「同一の構築処理を通った」と見なすかを書き下してはどうか。
- Q-09: `Conventions` は Edge Cases 参照を `Edge <分冊>-<行番号>` 形式と宣言しているが、
  T-01-03-01 のみ `structured-output Edge-empty-array-vs-prose` という別形式で、
  番号に解決しない。宣言した規約の唯一の例外として意図的なものか。

### 2.3 Alternatives

- Q-10: 静的検査タスク群は、`docs/rules/testing-conventions.md` のテスト種別のうち
  unit ではなく system に置く方が自然に見える（既存の
  `export-chatlog.main.system.spec.ts` と同種の性格を持つ）。テスト種別を
  タスク側で指定しない現行の書式は、実装者の判断に委ねる意図か。
- Q-11: T-12 は 31 case（Error 23）で最大の Test Target である。Step 1〜7 + 6.5 という
  評価順の単位で Test Target を分ける案もありうるが、Step 順の一体性を保つ目的で
  1 つに束ねたと読める。この理解でよいか。

### 2.4 Assumptions

- Q-12: Commit 14 のタスク（T-11-01-04 / T-11-03-01）は `FetchProvider` が受け取ったものを
  Expected に置いている。`_runViaHttp` の結線は Commit 21 であり、Commit 14 の時点で
  ボディを `FetchProvider` へ渡す経路は存在しない。
  implementation.md の Commit 14 も **テスト**: unit（`FetchProvider` 注入下でのボディ構築）と
  書いているため文書間の齟齬ではないが、Commit 14 単独でこのテストが書ける前提は何か。
  構築関数が `RequestInit` 相当の値を返し、それを単体で検査する想定か。
- Q-13: 同様に T-12-12-01 / -02 の Scenario は「llama 経路で `runAI` を呼ぶ」と書かれている。
  T-12 の配置は Commit 15 であり、`runAI` からの到達は Commit 21 で初めて成立する。
  Commit 15 の RED を書く時点でこの 2 case をどう実行する想定か。
- Q-14: `Conventions` は各 spec §5 の Edge Cases 行を「表の出現順に 1 起点で採番した」と述べる。
  この採番は spec 側に書かれていないため、行の増減があると番号がずれる。
  spec 側へ ID を振る案も含め、採番の維持方法を検討してはどうか。

---

## 3. Ambiguous Terms

| Term                                          | Context                                        | Clarification Needed                                                             |
| --------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 静的検査                                      | T-14 全体 / T-07-05 / T-07-06 / T-15-04        | 検査主体（実装成果物 / テストヘルパ）とテスト種別（unit / system）が読み取れない |
| 構築処理の共有を検証する形で代替可            | T-15-02-01 Scenario                            | 代替の許容条件と、代替時の合格線                                                 |
| `structured-output Edge-empty-array-vs-prose` | T-01-03-01 Rule                                | Conventions が宣言した `Edge <分冊>-<行番号>` 形式に解決しない唯一の参照         |
| 経路ラベル                                    | T-07-04-01 / -02（`_spec.command` の置き換え） | ラベルの値の集合が本文書内で定義されておらず、文言一致の検査対象が読み取りにくい |

---

## 4. Alternatives to Explore

### ALT-01: T-06 / T-13 を commit 単位の Test Target へ分割する

- Current approach: T-06 が Commit 6〜9（4 スキル）を、T-13 が Commit 16〜19（6 呼び出し）を
  それぞれ 1 つの Test Target にまとめ、blockquote に commit 範囲を併記する。
- Alternative: スキル単位・commit 単位に Test Target を分け、Task Summary の Commit 列を
  1 対 1 にする。
- Trade-offs: 分割すると Test Target 数が 15 から 21 前後へ増え、
  同一構造の 4 スキル分（正常 / 異常 / 非破壊）を並べた対称性が表から見えにくくなる。
  一方で `bdd-coder` への委譲単位と Test Target が一致し、切り出し時の判断が不要になる。
- Consider exploring: 現行の束ねを保ったまま、各 case に commit 番号を 1 行添える折衷案。

### ALT-02: 静的検査タスクを別のテスト種別として切り出す

- Current approach: T-14（8 case）と T-07-05 / T-07-06 / T-15-04 / T-15-08 を、
  他の振る舞いテストと同じ書式で Test Target 内に並べている。
- Alternative: これらを「構成・ソースの適合検査」として節を分け、
  テスト種別（system）とファイル配置を明示する。
- Trade-offs: 節を分けると Category Balance の集計単位が二重になる。
  一方で、実行環境（ネットワーク不要・ファイル走査のみ）が他と異なることが表現できる。
- Consider exploring: Category Balance に「検査種別」列を足すだけで足りるかどうか。

### ALT-03: Coverage Check に Rule → Task の対応表を加える

- Current approach: 母集団を Edge Cases / DD / DR / AC の 4 種とし、
  規範規則 R-NNN は各タスクの `Rule:` 行にのみ現れる。
- Alternative: implementation.md §4 の Rule Coverage 表に対応する
  Rule → Task 表を tasks.md へ置き、`[UNCOVERED]` の判定対象に規則も含める。
- Trade-offs: 表が 1 つ増え、規則の増減時の維持コストが上がる。
  一方で spec → task の追跡が実装計画と同じ粒度でそろい、
  「R-006 のみ対象外」という事実が文書上に残る。
- Consider exploring: 全 30 行の表ではなく、対象外の規則だけを注記する軽い形。

---

## 5. Implicit Assumptions

### A-01: Commit 14 / 15 の時点で `FetchProvider` 注入下のテストが書ける

- Assumption: リクエストボディ構築関数と応答解釈関数が、`runAI` の結線（Commit 21）を待たずに
  `FetchProvider` を介した入出力の形で検査できる。
- Location: T-11-01-04 / T-11-03-01（Commit 14）、T-12-12-01 / T-12-12-02（Commit 15）
- Risk if incorrect: これらの case が Commit 21 まで RED のまま残り、
  Commit 14 / 15 の Green 条件を満たせない。Phase 6 の完了判定が Phase 8 に依存する。
- Suggestion: 各関数の入出力の形（`RequestInit` 相当の値を返すのか、送信まで担うのか）を
  タスク側にも明記することを検討してはどうか。

### A-02: Edge Cases の採番が読み手側で再現できる

- Assumption: 各 spec §5 の表の行順が安定しており、`Edge transport-1` のような参照が
  レビュー時と実装時で同じ行を指す。
- Location: Conventions「参照の書き方」、Coverage Check の 4 つの Edge Cases 表
- Risk if incorrect: spec 側で行が挿入・削除されると、40 行分の参照が静かにずれる。
- Suggestion: spec §5 側へ ID 列を置くか、tasks.md の表に行の内容を残すこと（現行は残っている）を
  維持する方針を明記してはどうか。

### A-03: Test ID prefix の新規確保が今後も衝突しない

- Assumption: 本文書が確保した 19 の新規 prefix と、既存 2 prefix の連番開始位置
  （`T-LIB-J-20` / `T-LIB-AI-RA-50`）が、実装着手までの間に他の作業で埋まらない。
- Location: Conventions「2 つの ID 名前空間」、文末のコメントブロック
- Risk if incorrect: 実装時に ID が重複し、`testing-conventions.md` §4.3 の重複検査で
  初めて発覚する。Phase 8 まで実装が続くため、確保から使用までの間隔が長い。
- Suggestion: 各 commit の着手時に §4.3 の重複検査を回す運用を、着手条件として
  書き添える案を検討してはどうか。

### A-04: 「静的検査」のテストが対象ファイルの相対パスを前提にできる

- Assumption: T-14 の検査が `SKILL.md` / shebang 行 / `deno.json` をリポジトリルート基準で
  読み取れ、配布ミラー（`sync-skill-assets.sh` の同期先）と取り違えない。
- Location: T-14-01-01 〜 T-14-08-01
- Risk if incorrect: ミラー側を検査して常に合格する、あるいは両方を検査して
  T-14-08-01 と役割が重なる。
- Suggestion: 検査対象がソース側かミラー側かを 1 行添えてはどうか。

---

## 6. Gaps Identified

### G-01: Commit 14 のタスクが結線後の観測点で書かれている

- Area: T-11-01-04 / T-11-03-01（Commit 14 / Phase 6）
- Missing: Commit 14 単独で `FetchProvider` へ到達する経路の説明。
  `Target` は「llama リクエストボディ構築関数」だが、Scenario / Expected は
  「`FetchProvider` へリクエストを送る」「`FetchProvider` が受け取ったボディを復号した文字列」を
  検査対象にしている。
- Impact: Commit 14 の RED を書く段で、テストが何を呼ぶのかが決まらない。
- Suggestion: 構築関数の戻り値に対する検査へ言い換えるか、
  これらの case を Commit 21 側（T-15）へ移す案を検討してはどうか。

### G-02: Commit 15 のタスクが `runAI` の呼び出しを前提にしている

- Area: T-12-12-01 / T-12-12-02（Commit 15 / Phase 6）
- Missing: `runAI` から llama 経路へ到達できるのは Commit 21 であることとの整合。
  Scenario は「llama 経路で `runAI` を呼ぶ」、Expected は
  「CLI バックエンドのコマンド構築・起動が一度も行われないこと」であり、
  経路選択（Commit 21 の変更点）の検証に読める。
- Impact: Commit 15 の Green 条件が Commit 21 の着地に依存する。
  implementation §1.4 の Phase 依存（Phase 6 → Phase 8）と向きが逆になる。
- Suggestion: 応答解釈関数に対する直接呼び出しへ言い換えるか、T-15 へ移すことを検討してはどうか。

### G-03: 複数 commit を束ねた Test Target で case → commit の対応が非明示

- Area: T-06（Commit 6〜9・12 case）、T-13（Commit 16〜19・10 case）
- Missing: どの case がどの commit の Green 条件に属するかの明示。
  T-06 はファイル名から 4 スキルへ分解できるが、T-13 は 6 呼び出しが 4 commit に
  どう割り振られるかが本文書からは読めない。
- Impact: `.claude/rules/bdd-cycle.md` の「1 委譲 = 1 タスク」に沿ってチェックリストを
  切り出す際、分割が実装者の推測になる。同ルールは、複数タスクを併記した資料を渡した結果
  範囲外まで実装された事例を根拠として記録している。
- Suggestion: 各 case に commit 番号を添えるか、ALT-01 の分割を検討してはどうか。

### G-04: Coverage Check の母集団に規範規則が含まれていない

- Area: Coverage Check（母集団の宣言）
- Missing: R-NNN（4 分冊で計 30 件）に対する Rule → Task の対応。
  implementation.md §4 は同じ規則について commit 単位の対応表を持つ。
- Impact: 「`[UNCOVERED]`: なし」という宣言が、規則については何も述べていない。
  実際には 29 件が `Rule:` 行で参照され、未参照は `structured-output R-006`
  （Phase 0 の実測ゲート）だけだが、その事実は文書からは確認できない。
- Suggestion: ALT-03 のいずれかの形で、R-006 が対象外である旨を DR-09 と同じ書式で
  残すことを検討してはどうか。

### G-05: Phase 0 実測ゲートの合否を確認する成果物が本文書内にない

- Area: Conventions「実装単位と着手条件」、Coverage Check の `対象外` 行
- Missing: Phase 5 以降の着手条件である実測ゲートについて、
  合否をどこで確認するかを指す参照。AC-016 / DR-09 / DR-22 / DR-25 はすべて
  「Phase 0 が担う」として母集団から外れており、実測レポートは未作成と明記されている。
- Impact: Commit 11 の着手可否が、この文書の外の未作成成果物に依存したまま残る。
- Suggestion: 実測レポートの想定パスを Conventions に書いておくか、
  Task Summary に Phase 0 の行（タスクなし・成果物のみ）を置く案を検討してはどうか。

### G-06: 静的検査タスクのテスト種別と配置が指定されていない

- Area: T-07-05-01 / -02、T-07-06-01、T-14-01-01 〜 T-14-08-01、T-15-04-01、T-15-08-01（計 13 case）
- Missing: これらが unit / system のどちらのテストとして配置されるかの指定。
  他のタスクは `配置ファイル` が blockquote にあるが、これらの検査対象は
  `SKILL.md` / shebang 行 / `deno.json` / ソース全体であり、実装ファイルではない。
- Impact: `testing-conventions.md` の命名規則（`<対象名>.<種別>.spec.ts`）へ落とす際に
  種別が決まらない。T-14-08-01 は `bash scripts/sync-skill-assets.sh --check-staged` の実行を
  伴うため、ユニットテストとしての実行時間・副作用の想定も他と異なる。
- Suggestion: 検査系タスクの blockquote にテスト種別を 1 行足す案を検討してはどうか。

---

## 7. Review Metadata

- Reviewer: AI (deckrd review --phase explore)
- Review Phase: explore
- Review Date: 2026-09-04
- Document Version Reviewed: tasks.md（frontmatter に version なし / `based-on: implementation.md v1.3.2`）
