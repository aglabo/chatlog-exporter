---
title: "Design Review: filter strip specifications (fix)"
module: "filter/strip"
target: "specifications/specifications.md v1.1.1"
phase: fix
persona: "Spec Auditor"
reviewer: claude
status: Draft
version: 1.0.0
date: "2026-08-12"
---

<!-- cspell:words passthrough setfm -->

<!-- textlint-disable ja-spacing/ja-space-around-code -->

> `/deckrd review spec --phase fix` の実行結果です。
> fix フェーズの規約に従い、新規の MUST / SHALL / SHOULD / MAY 表現と
> Decision Record の生成は行いません。意味を変えない範囲の訂正のみを扱います。
> 対象文書は編集していません。所見の適用は `/deckrd spec` の再実行によります。

## 1. サマリー

| 分類         | 件数 | 内訳            |
| ------------ | ---- | --------------- |
| 用語の不統一 | 1    | T-01            |
| 検証可能性   | 1    | TS-01           |
| 構造の正規化 | 2    | S-01 / S-02     |
| 相互参照     | 1    | CR-01           |
| **合計**     | 5    | うち要修正 3 件 |

機械的に検証した項目のうち、次の 3 種は問題を検出しませんでした。

- REQ-ID の相互参照: spec が参照する 25 件と requirements が定義する 25 件が完全一致
- DR-ID の相互参照: spec が参照する DR-01 〜 DR-09 がすべて decision-records.md に存在
- 規則 ID (R-NNN) : R-001 〜 R-011 の定義と参照が一致し、未定義参照なし

---

## 2. 用語の不統一

| 現在の表記 | 推奨表記   | 出現数 | 箇所                  |
| ---------- | ---------- | ------ | --------------------- |
| 5 つの結果 | 4 つの結果 | 1      | Section 1.2 (28 行目) |
| 5 分類     | 4 分類     | 1      | Section 6 (392 行目)  |

### T-01: ファイル単位の分類数が 4 と 5 で揺れている

- 使用されている表記:
  - 「5 つの結果 (stripped / passthrough / skipped / error / 拒否)」 — Section 1.2
  - 「4 つの結果のいずれかを決定します」 — Section 2.3 Feature Decomposition
  - 「相互に排他的な 4 つの結果のいずれかに分類されます」 — Section 3.2
  - 「5 分類の件数と退避削除の結果を報告します」 — Section 6 Traceability
- 推奨: ファイル単位の分類は「4 つ」に統一する
- Rationale: Section 3.2 は実行拒否をファイル単位の分類から明確に区別しています。
  同節は「各入力ファイルは相互に排他的な 4 つの結果のいずれかに分類されます。
  加えて実行そのものが拒否される場合、いかなるファイルも分類されません」と定めます。
  実行拒否は R-001 により対象の列挙前に作用するため、ファイルは 1 件も分類されません。
  したがって実行拒否はファイル単位の分類ではなく、実行単位の結果です。

  requirements 側の REQ-F-006 も報告対象を
  「total / stripped / passthrough / skipped / error の件数」と定めます。
  報告される分類は 4 つ (と総数) です。
- 修正箇所:
  - Section 1.2 (28 行目) : 「5 つの結果」を「4 つの結果と、実行拒否」に改める
  - Section 6 (392 行目) : 「5 分類の件数」→「4 分類の件数」

なお Section 3.2 の結果テーブルが 5 行を持ち、5 行目が `(実行拒否)` と
括弧付きで表記されている点は、区別が意図的であることを示しており適切です。

---

## 3. 検証可能性

### TS-01: Edge 14 の Classification が単一実行の結果として検証できない

- Original: Edge 14 の Classification 欄が `stripped→skipped`
- Issue: 他の 14 件はいずれも単一の分類値を持ちますが、Edge 14 のみが 2 値を矢印で結んでいます。
  Section 3.2 が「各入力ファイルは相互に排他的な 4 つの結果のいずれかに分類されます」と
  定めるため、単一実行の結果を表す欄に 2 値が入ると検証条件が定まりません。
  テストケースとして「期待される分類」を一意に決められない状態です。
- Suggested revision: Classification を `stripped` とし、
  Rationale 欄に「再実行時は R-003 により skipped となる」旨を移す
- Verification method: 1 回目の実行で stripped の計上を確認する。
  2 回目の実行で skipped となることは、別ケースとして確認する

本項目は explore フェーズの A-05 と同一の指摘です。
表記の統一にあたるため fix フェーズの範囲内と判断しました。

---

## 4. 構造の正規化

### S-01: Section 2.3 の Feature Decomposition が Section 3.2 と分類数の記述を違える

- Location: Section 2.3 Feature Decomposition の「分類」ユニット
- Issue: Responsibility 欄が「ファイルごとに 4 つの結果のいずれかを決定します」とあり、
  数としては Section 3.2 と一致します。
  一方 REQ Coverage 欄が挙げるのは REQ-F-000 / REQ-F-003 / REQ-F-007 / REQ-F-009 の 4 件です。
  error 分類の根拠である REQ-F-008 を含みません。
  error は 4 分類の 1 つであり、その判定は「分類」ユニットの責務に含まれます。
- Fix: 「分類」ユニットの REQ Coverage に REQ-F-008 を追加する

  現状では REQ-F-008 が「安全弁」ユニットにのみ対応づけられています。
  安全弁は R-007 (除去後の異常検出) を担いますが、
  R-002 (frontmatter を持たない → error) は判定順序の先頭にあり、
  分類の一部として作用します。

### S-02: Section 2.5 の DD-03 が参照する規則 ID が更新されていない

- Location: Section 2.5 Behavioral Design Decisions の DD-03 行
- Issue: Affected Rules 欄が `R-002, R-007` となっています。
  DD-03 は「安全弁は個別ファイル単位で作用し、実行全体を中断しません」という決定です。
  安全弁にあたる規則は R-002 (frontmatter 欠落) と R-007 (除去結果の異常) です。
  この対応は v1.1.0 の ID 繰り下げ後の番号として正しく、問題ありません。
- Fix: 修正不要

  本項目は監査の過程で確認した結果であり、記録のために残します。
  v1.1.0 の Change History は「旧 R-002〜R-010 → 新 R-003〜R-011」と記します。
  そこで繰り下げの影響を受ける参照箇所が他に無いかを確認しました。
  Section 2.5 の DD-01・DD-02・DD-04 と、
  Section 2.6 の DR-01 〜 DR-09 の Impact 欄を対象としました。
  いずれも繰り下げ後の番号として整合しています。

---

## 5. 相互参照の検証

### CR-01: Section 5 の Edge 15 が参照するコード位置の行番号

- Location: Section 5 の Edge 15 補足 (374 行目付近)
- Reference: 「該当箇所は `export-chatlogs/scripts/libs/session-writer.ts` の
  57 行目から 62 行目です」
- Issue: 参照先を確認したところ、`renderMarkdown` は 55 行目から始まり、
  frontmatter のデリミタは 57 行目と 62 行目にあります。
  `session_id` (58 行目) と `date` (59 行目) は条件分岐の外にあり無条件に出力されます。
  一方 `project` (60 行目) と `slug` (61 行目) は条件付きです。

  したがって「57 行目から 62 行目」という範囲指定自体は正確です。
  ただし当該範囲には条件付きの 2 行が含まれるため、
  「無条件に出力される」という主張の根拠としては範囲がやや広く読めます。
- Fix: 記述を「デリミタは 57 行目と 62 行目、`session_id` と `date` は 58 行目と 59 行目にあり、
  いずれも条件分岐の外にあります」と具体化する案が考えられます

  現行の記述でも誤りではないため、優先度は低い項目です。
  なお DR-09 の Context は既にこの区別を明示しており、
  spec 側の記述を DR-09 に合わせると整合が高まります。

---

## 6. 誤字・文法

検出なし。

機械的に確認した範囲では、誤字・脱字・文法上の誤りは見つかりませんでした。

---

## 7. 監査の対象外とした項目

fix フェーズの規約により、次の項目は対象外としました。

| 項目                            | 対象外の理由                                   |
| ------------------------------- | ---------------------------------------------- |
| explore F-05 (`null` 戻り値)    | harden フェーズで DR-12 として決定済み         |
| explore F-07 (削除失敗の扱い)   | harden フェーズで DR-10 として決定済み         |
| explore A-04 (REQ-F-008 の基準) | harden フェーズで DR-11 として決定済み         |
| explore A-03 (用語「マーカー」) | 用語集の新設は構造の追加にあたり、fix の範囲外 |
| explore F-04 / P-01 / P-02      | 記述の追加を伴い、意味の追加にあたる           |
| explore A-02 / P-03 (再帰性)    | 走査範囲の定義追加は規範の追加にあたる         |

explore A-03 について補足します。
「処理済みマーカー」と「定型部マーカー」の語が近接する問題は、
いずれかの呼称変更で解消できます。
ただし呼称の変更は requirements 側の REQ-F-009 / REQ-F-000 の記述にも波及します。
文書間の用語統一を伴うため、fix フェーズ単独では完結しません。

---

## 8. 推奨する適用順序

| 優先度 | 所見  | 対応                                              |
| ------ | ----- | ------------------------------------------------- |
| 中     | T-01  | 分類数を 4 に統一 (2 箇所)                        |
| 中     | TS-01 | Edge 14 の Classification を単一値にする          |
| 低     | S-01  | 「分類」ユニットの REQ Coverage に REQ-F-008 追加 |
| 低     | CR-01 | Edge 15 の行番号参照を具体化                      |

いずれも振る舞い規則を変更しないため、適用時のバージョンは PATCH (1.1.1 → 1.1.2) が相当します。

## 9. Review Metadata

- Reviewer: AI (deckrd review --phase fix)
- Review Phase: fix
- Review Date: 2026-08-12
- Document Version Reviewed: specifications.md v1.1.1
- Decision Records Generated: 0 (fix フェーズでは生成しません)

## Change History

| Date       | Version | Description     |
| ---------- | ------- | --------------- |
| 2026-08-12 | 1.0.0   | Initial release |
