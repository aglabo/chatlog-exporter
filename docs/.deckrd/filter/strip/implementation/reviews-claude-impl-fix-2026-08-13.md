---
title: "Review: implementation.md (filter/strip)"
phase: fix
persona: Spec Auditor
document: "implementation/implementation.md"
date: "2026-08-13"
status: applied
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- markdownlint-disable line-length -->

> **Fix Review Report**
> Persona: Spec Auditor
> Purpose: Final cleanup, ensure consistency

## 1. Summary

- Document Reviewed: `implementation/implementation.md` v1.1.0
- Document Type: Implementation Plan
- Terminology Issues: 2
- Testability Issues: 1
- Structure Issues: 2（うち S-02 は CR-01 と同一箇所）
- Cross-Reference Issues: 3（本文書側の要修正 1 / 上流の陳腐化 2）
- Typo/Grammar Fixes: 0

指摘は延べ 8 件。重複（S-02 = CR-01）と取り下げ（CR-03）を除いた **実質の修正箇所は 5 件**。
うち 4 件を fix フェーズで v1.1.1 として適用した。残る TS-01 は fix の範囲外として繰り越したのち、
harden フェーズで Open Item 5 件すべてを確定させた（DR-21 / DR-22 を新設、他 3 件は既存の契約・
上流文書が既に規定していたことを確認して明文化）。`implementation.md` は v1.3.0 となり、
Open Items 表は空になった。**未対応の指摘は残っていない**。

### 検証済みで問題なしの項目

参照の解決性を実地に照合した。**参照の破れは 0 件**。

| 検証対象                                | 結果                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `based-on: specifications.md v3.5.0`    | OK — spec Change History に存在（三部構成）                    |
| frontmatter `version`                   | OK — Change History 最新行と一致                               |
| DR-02 / DR-03 / DR-15 / DR-16 / DR-17   | OK — `decision-records.md` に全て存在                          |
| DR-03「決定 4 のコード例」              | OK — 決定は 4 点構成、戻り値は `Promise<string \| null>`       |
| DR-15「Option D として却下」            | OK — Option D = 独立分類の名前を `skip` とする、却下理由も記載 |
| DD-04                                   | OK — `specifications.md:143`                                   |
| F-04                                    | OK — `claude-spec-explore-2026-08-12.md:137`                   |
| AC-024 / REQ-NF-005 / REQ-C-001/004/008 | OK — spec・requirements の双方に存在                           |
| R-001〜R-013 の分類/結果                | OK — spec の規則表と 13 行すべて一致                           |
| `meta.yaml` 26 行目                     | OK — `## TOPICS ASSIGNMENT RULES` が実在                       |
| `segment-io.ts:167`                     | OK — 戻り値未使用の `backupOldPath` 呼び出し                   |
| ミラー先 4 パス                         | OK — 4 ディレクトリすべてに実在                                |

## 2. Terminology Inconsistencies

### T-01: 同一の `Phase N` 表記が 2 つの異なる軸に使われている（適用済み）

- Terms used: Section 2 見出しの `Phase 1`〜`Phase 4`（commit をグループ化する軸 = 現在の実装ステージ
  1〜4）と、`Phase 0`〜`Phase 7`（処理の実行順序を表す軸 = 実行フェーズ 0〜7）
- Recommended: commit グループ化側を「実装ステージ N」に改称し、`Phase N` は実行フェーズに限定する
- Rationale: 以下の行番号はいずれもレビュー時点の v1.1.0 のもの。決定的な証拠は 164 行と 146 行の
  対比にある。同じ `Phase 1` という表記が、以下のとおり別々の軸を指していた。

  | 箇所                               | 原文                                         | 指している対象                             |
  | ---------------------------------- | -------------------------------------------- | ------------------------------------------ |
  | 164 行（共有ライブラリのミラー節） | 「Phase 1 の変更は両ツリーに適用する」       | 実装ステージ 1（Commit 1〜4、`_cle-libs`） |
  | 146 行（Commit 10）                | 「実行フェーズの Phase 1(列挙・キャッシュ)」 | 実行フェーズ 1                             |

  同一文書内で同じ表記が異なる対象を指しており、修飾語なしでは一意に読めない。
  加えて 50 行が同じ 0〜7 を「実装フェーズ」、180 行が「実行フェーズ」と呼び分けていた
- 適用: 50 行の名称を、実行フェーズへ統一。Section 2 の 4 見出しと共有ライブラリのミラー節を
  「実装ステージ」へ改称。dry-run の記述（v1.1.0 の 150 行）の裸の `Phase 3〜6` も実行フェーズへ
  修飾。番号空間が異なる旨の 1 文を Section 2 冒頭に追加
- 注記: 当初のレビューでは 50-51 行「Phase 3/4/5 は…1 commit にまとめる」を誤読と判定したが、これは
  誤りだった。同行の `(実行順序、Phase 0〜7)` が軸を自己定義しており、**実行フェーズ** 3/4/5（tmp
  書き出し → 退避 → 差し替え）の意味で正しい。`phase-design-note.md` の実行フェーズ図とも一致する。
  この判定は撤回した

### T-02: `BaseStats.skip` の語義引用が上流より狭い（適用済み）

- Terms used: 99 行「dry-run により実行しなかった数」 / DR-15「dry-run/report 等により判定・削除の実行自体を行わなかった数」
- Recommended: DR-15 の表記に合わせる
- Rationale: 引用範囲が狭いため、 `report` 経路が読み落とされる。`StripStats` が `BaseStats` を継承しない
  という結論自体には影響しない

## 3. Testability Issues

### TS-01: Open Item を含む Commit の完了条件が客観的に判定できない（解消済み）

- Original: 「読み取り不可・権限エラー・走査中に消えたファイルの分類を確定する(OPEN ITEM、本 Commit で確定)」ほか同型 5 件
- Issue: 「確定する」は成果物の状態を規定しないため、commit の完了を客観的に検証できない
- Suggested revision: 確定結果の記録先を完了条件として明示する
- Verification method: 当該 commit 後に Open Items 表から対象行が消え、対応する記述が本文に存在すること
- fix フェーズで未適用とした理由: 提案した改稿は各 commit に「記録という成果物」を新たに課すため、
  fix フェーズが禁じる「要件の追加」に抵触する。意味を変えずに測定可能性のみを足す言い換えが
  見つからなかったため、harden フェーズまたは `/deckrd impl` での改稿に委ねた
- その後の対応 (harden): 5 件のうち Commit 7 の「読み取り不可・権限エラー・走査中の消失の分類」を
  DR-21 で確定させた。エラーの発生箇所ではなく **種類** で全体エラーと継続エラーを切り分ける方針を
  採り、既存の `readTextFile` の `throwFileIoError: false` 契約を用いる。
  `implementation.md` v1.2.0 で Commit 7 に具体的な振る舞いを記載し、Open Items 表から当該行を
  削除して「決着済み」へ移した。TS-01 が指摘した「完了条件が検証できない」状態は、この 1 件に
  ついては解消している
- 残る 4 件の決着 (`implementation.md` v1.3.0): 続けて残余も確定させ、Open Items 表は空になった。
  内訳は次のとおり。新たな決定を要したのは 1 件のみで、他は既存の契約・上流文書が既に規定していた

  | 項目                               | 決着                                                                         |
  | ---------------------------------- | ---------------------------------------------------------------------------- |
  | R-013 の退避パス比較の正規化規則   | DR-22 で新規決定。比較時のみファイル名部分を大小文字を区別せず突き合わせる   |
  | 一時ファイルの衝突時動作           | 既存 `writeTextFile` の `AlreadyExists` → remove → 再 rename を明文化        |
  | Windows での rename の原子性       | 一時ファイルが同一ディレクトリのため構造上担保。上記 catch が差異を吸収      |
  | 終了コードと機械可読出力のスキーマ | 終了コードは DR-20、出力項目は REQ-F-006 が規定済み。impl での新規決定は無し |

- TS-01 の総括: 指摘した 5 件はすべて完了条件が判明した。ただし本項が本来指摘した「〜を確定する」と
  いう **記述形式** の問題は、個別の項目が解消したことで結果的に消えたものであり、記述規約として
  対処したわけではない。今後 Open Item を追加する際は同じ形になりうる

## 4. Structure Normalization

### S-01: Open Items 表の Commit 番号と本文のマーカーが対応していない（適用済み）

- Location: Section 4 の表「Windows での rename/move の原子性・同一ボリューム → 8 / 9」
- Issue: 表は Commit 8 と 9 を挙げるが、本文で当該項目に `(OPEN ITEM、本 Commit で確定)` を付すのは
  Commit 8 のみ。Commit 9 のマーカーは別項目「R-013 の退避パス比較の正規化規則」に属する。
  他の 4 項目は表と本文が 1 対 1 で対応する
- Fix: 表の値を `8` に是正（本文の記載を正とした）

### S-02: 引用ブロック内の版数と参照先の版数が不一致（適用済み・CR-01 と同一箇所）

- Location: Section 3 末尾の注記
- Issue: 注記は `phase-design-note.md` v1.6.1 を、40 行は v1.6.2 を指していた
- Fix: CR-01 を参照

## 5. Cross-Reference Validation

### CR-01: `phase-design-note.md` の版数参照が古い（適用済み）

- Location: 202 行
- Issue: ノートの現行版は v1.6.2。40 行の参照が正しく、202 行のみ陳腐化していた
- Fix: `v1.6.1` → `v1.6.2`。
  **注記の本文は保持した** — v1.6.2 の Section 4 の表を実地確認したところ、依然 R-001〜R-012 の
  12 行のみで R-013 を欠く。本表がこれを補正するという記述は現在も有効

### CR-02: DR-03 の `segment-io.ts` 行番号が古い（上流側・対応済み）

- Issue: 実体は 167 行。`implementation.md` の記載が正しく、`decision-records.md` DR-03 が `:168` と
  誤記していた（決定 4 と Alternatives Considered の 2 箇所）
- Fix: `decision-records.md` v3.4.1 で 2 箇所を `:167` に訂正。DR-18 が既に用いている値に揃えた。
  `implementation.md` 側の修正は不要

### CR-03: DR-03 決定 2 の Provider 名が陳腐化（取り下げ）

- Issue: DR-03 決定 2 の表は `backupPath`、現行は DR-17 による `backupToBak`
- 取り下げの理由: `decision-records.md` v3.4.0 の Change History が「DR-18 は DR-03 決定 2 の表と
  DR-17 の型対称性を維持するため **上流文書の改訂を要さない**」と明記している。表の維持は決定済みで
  あり、陳腐化注記を入れると DR-18 と矛盾する

## 6. Typo & Grammar Fixes

該当なし。

## 7. Review Metadata

- Reviewer: AI (deckrd review impl --phase fix)
- Review Phase: fix
- Review Date: 2026-08-13
- Document Version Reviewed: 1.1.0（fix 適用後: 1.1.1、TS-01 対応で DR-21 → 1.2.0、DR-22 ほかで 1.3.0）
- Phase compliance (fix): 新規の MUST / SHALL / SHOULD / MAY 要件を導入していない。Decision Record を
  生成していない。Open Items 5 件・DR-02 と issue `cle-2rf` の矛盾・除去率閾値 99% はいずれも
  「未決として記録されている」ことの指摘に留め、決着は行っていない
- 後続の harden 作業: 上記の fix レビュー完了後、ユーザーの指示により Open Items 5 件をすべて
  確定させた。これらは fix フェーズの成果物ではなく、別途 harden フェーズとして実施したもの。
  新規 DR は DR-21（読み取り失敗の切り分け、`decision-records.md` v3.5.0）と
  DR-22（R-013 のパス比較、v3.6.0）の 2 件。残る 3 件は既存の `writeTextFile` の契約、
  および DR-20 / REQ-F-006 が既に規定しており、新たな決定を要さなかった
