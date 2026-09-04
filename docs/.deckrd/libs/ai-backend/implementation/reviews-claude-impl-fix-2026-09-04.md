---
title: "Review: libs/ai-backend implementation.md"
phase: fix
persona: Spec Auditor
document: "docs/.deckrd/libs/ai-backend/implementation/implementation.md"
date: "2026-09-04"
status: draft
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-unmatched-pair,
  -->
<!-- cspell:words setfm subindex aplys -->

> **Fix Review Report**
> Persona: Spec Auditor
> Purpose: Final cleanup, ensure consistency

## 1. Summary

- Document Reviewed: `implementation/implementation.md` v1.0.0
- Document Type: Implementation Plan
- Terminology Issues: 4
- Testability Issues: 4
- Structure Issues: 3
- Cross-Reference Issues: 5
- Typo/Grammar Fixes: 1

本監査は意味を変えない範囲の指摘に限る。新たな規範・制約は追加せず、Decision Record も生成しない。
harden レビュー（DR-20〜DR-23）で採択済みだが `implementation.md` 本文へ未反映の項目は、
Cross-Reference の欠落として扱い、内容の是非には立ち入らない。

**行番号参照は 7 件すべてが実コードと一致した。** `phase-classify-ai.ts:123` /
`process-chunk.ts:86` / `segment-ai.ts:111` / `setfm-frontmatter.ts:61` / `setfm-review.ts:60` /
`setfm-type-category.ts:91` の各行はいずれも `runAI` 呼び出しであり、`run-ai.ts:216` は
`Valid models: opus, sonnet, haiku (or full IDs)` の文言そのものです。
`json-utils.ts:10-16` の `_tryParseNonEmptyArray` も `data.length > 0` を持つ現行実装と一致する。
§1.2 が述べる「`fetch` の使用はリポジトリ全体で 0 件」も、`skills/` と `scripts/` の走査で
0 件を確認した（配布ミラーを除く）。参照の陳腐化は検出されていない。

Typo は 1 件（文体の混在）だった。助詞の重複・句読点の重複・全角半角の混在は検出されなかった。

## 2. Terminology Inconsistencies

Same concepts should use same terms throughout.

| Current Term                         | Recommended Term       | Occurrences | Locations                     |
| ------------------------------------ | ---------------------- | ----------- | ----------------------------- |
| 観測点（2 つの別集合）               | 集合ごとに別名         | 2 定義      | Commit 1 / Commit 12          |
| エンドポイント受理条件               | サーバ位置値の受理条件 | 1           | §3.1 の R-006 行              |
| 不正なモデル名                       | 不正モデル名           | 1           | Commit 12                     |
| コミット（カタカナ）/ commit（英字） | commit                 | 4 / 6       | §1.2, Phase 6, ミラー節, §3.4 |

### T-01: 「観測点」が 2 つの別集合に同じ名前で割り当てられている

- 用語の使われ方:
  - Commit 1「REQ-C-002 非破壊を 3 観測点（呼び出し元の戻り値 / 永続化される出力 /
    集計・キャッシュへの副作用）で確認する」
  - Commit 12「注入あり・なしで一致すべき観測点は、組み立てられたリクエスト（…）と、
    応答を解釈した結果（…）の 2 点」
- 前者は `specifications-structured-output.md` §5.1 が定める非破壊判定の観測範囲、
  後者は `specifications-transport.md` §4.4 が定める注入の等価性判定の観測点であり、
  上流仕様でも別の節が別の目的で持つ、互いに無関係な集合である。
- 推奨: 前者を「非破壊の観測範囲」、後者を「注入の観測点」と呼び分ける。
  上流の節番号（§5.1 / §4.4）を併記すると、文書を横断して読む際に数が合わない印象を避けられる。
- Locations to fix:
  - Commit 1 の 3 点を挙げる箇条書き
  - Commit 12 の 2 点を挙げる箇条書き

### T-02: §3.1 の R-006 行が規則本文と違う語で要約している

- `specifications-transport.md` R-006 の Condition は「サーバ位置値が §4.3 の受理条件を
  満たさない」であり、受理条件を定める同 §4.3 の見出しも「サーバ位置値の受理条件」である。
- `implementation.md` §3.1 の R-006 行はこれを「エンドポイント受理条件と `InvalidEndpoint`」と
  要約しており、同表の R-002 行が「サーバ位置値の URL 正規化」と書いているのと揃っていない。
- 推奨: R-006 行を「サーバ位置値の受理条件と `InvalidEndpoint`」へ揃える。
- なお Commit 12 の「Step 3 エンドポイント検証と URL 正規化」と Commit 17 の「接続先が実行時に
  `config.yaml` からしか判明せず」は、それぞれ transport §4.1 の Step 3 の名称と REQ-F-010 の
  Rationale の引用であり、上流の語をそのまま使っている。変更対象に含めない。

### T-03: 「不正なモデル名」と「不正モデル名」の 2 表記

- `specifications-error-handling.md` は §4.2 R-005 / §5 / §3.2 で一貫して「不正モデル名」を
  定型語として使う。
- `implementation.md` Commit 12 のみ「不正なモデル名をエンドポイント解決より先に弾く」と
  「な」を挟む。同文は transport §4.1 の impl-note からの引用だが、当該 impl-note も
  「不正なモデル名」と書いており、上流側に同じ揺れがある。
- 推奨: `implementation.md` 側を「不正モデル名」へ揃える。上流 impl-note の表記は
  transport の fix 対象として別途送る。

### T-04: 「コミット」と「commit」の表記が混在している

- カタカナ表記 4 箇所: §1.2「既存コミットは deckrd 設計文書のみ」、Phase 6 見出し
  「（スキル単位 4 コミット）」、Phase 6 導入文「各コミットで」、ミラー節「各コミットは」。
- 英字表記 6 箇所: Phase 0 見出し「（commit なし）」と本文「この Phase は commit を持たず」、
  §3 導入文「それを実装する commit の対応」「commit 分解の欠落」、§3.4「特定の commit に
  閉じない」「すべての commit が満たすべき条件」。加えて 18 個の見出しがすべて `Commit N` である。
- 推奨: 見出しの `Commit N` と揃えて、散文も英字 `commit` に統一する。

## 3. Testability Issues

Requirements that cannot be objectively verified.

### TS-01: Commit 3「llama は到達しない」

- Original: 「`_buildCommand` の default 分岐は維持する。経路判定を `_buildCommand` より前に
  置くため llama は到達しない」
- Issue: Commit 3 の時点では経路判定が存在しない（Commit 12 で入る）。この記述が述べているのは
  Commit 12 以降の状態であり、Commit 3 の完了判定として評価できない。
- Suggested revision: 到達しない根拠を Commit 12 の完了条件として記し、Commit 3 側は
  「default 分岐を変更しない」という、その commit で検証できる記述に留める。
- Verification method: Commit 3 は `_buildCommand` の diff が `switch` の既定分岐を含まないこと。
  Commit 12 は `specifications-transport.md` §4.1.1 の不適合条件 (3) が成立しないこと。

### TS-02: Commit 6「外形の振る舞いは一切変えない」

- Original: 「外形の振る舞いは一切変えない。既存 `run-ai` テスト（unit / integration / system）の
  全通過が Green の条件」
- Issue: 「外形の振る舞い」の範囲が定まっていない。同 commit は後段の例外メッセージが参照する
  `_spec.command` を経路ラベルへ置き換えるため、例外メッセージの文言が範囲に含まれるかどうかで
  合否が変わる。`specifications-error-handling.md` §4.3 は非破壊の判定軸を
  「受理範囲 / 既定モデル / `kind` と `subindex` の組 / 分類を見る既存判定」の 4 つに閉じており、
  メッセージ文言そのものは含めていない。
- Suggested revision: 「外形の振る舞い」を §4.3 の 4 条件と読み替える旨を明記する。
- Verification method: §4.3 の 4 条件がいずれも成立しないこと、および既存 `run-ai` テストの全通過。

### TS-03: Commit 10「非 ASCII が両方向で欠落・化けしない」

- Original: 「リクエストボディを UTF-8 で符号化し `Content-Type: application/json; charset=utf-8` を
  送る。応答本文は UTF-8 として復号する。非 ASCII が両方向で欠落・化けしないことを判定基準とする」
- Issue: 前半 2 文はヘッダと符号化の検査で判定できるが、「欠落・化けしない」は入力文字列と
  比較対象が示されていないため、何をもって合格とするかが読み取れない。
- Suggested revision: 判定を「送信したプロンプト文字列と、`FetchProvider` が受け取ったボディを
  復号した文字列が一致する」「応答本文の復号結果が呼び出し元へ渡る文字列と一致する」の
  2 点に具体化する。
- Verification method: `FetchProvider` 注入下の unit テスト（AC-021 / AC-013）。

### TS-04: Commit 17「例示行は判定対象外とする」

- Original: 「フラグ列を省略した SKILL.md の例示行は判定対象外とする」
- Issue: 「例示行」の識別基準が本文になく、判定者ごとに範囲が変わりうる。
- Suggested revision: 要件 REQ-F-010 の除外規定（`deno run ... "$SCRIPT_PATH"` のように
  フラグ列を省略した行）と `specifications-config-packaging.md` §5 の該当行を参照として付す。
  規定そのものは既存であり、参照を補うだけで基準は一意になる。
- Verification method: 対象行を列挙し、フラグ列を持つ行のみを AC-011 の検査対象とすること。

## 4. Structure Normalization

Formatting and organization improvements.

### S-01: §2 の `###` が 2 種類混在している

- Location: §2 Implementation Plan
- Issue: §2 直下の `###` 見出し 10 個のうち 7 個が `Phase N:`、3 個が
  「共有ライブラリのミラーについて」「impl で決着させる Open Items」
  「未決のまま残るもの（Phase 0 の実測に依存）」である。後者 3 つは Phase ではないが同じ階層に
  並ぶため、目次上は Phase 8〜10 のように見える。
- Fix: 後者 3 つを `## 3. 補足事項` のような独立した節へ移すか、`### Phase 7` の後に
  区切りを置いて「Phase 横断の事項」であることを明示する。以降の節番号は繰り下げる。

### S-02: 着手条件の記載位置が見出しと本文に分かれている

- Location: Phase 0 / Phase 4 / Phase 6
- Issue: Phase 4 は見出しに「（Phase 0 の合格が着手条件）」と書き、Phase 0 は見出しに
  「（commit なし）」と書いて本文で「Phase 4 の着手条件になります」と述べ、Phase 6 は
  見出しに条件を持たず導入文で条件付きの進め方を述べる。Phase 1 は見出しに
  「（llama 非依存・先行）」と依存関係を書く。同じ情報が 3 通りの位置に置かれている。
- Fix: 各 Phase の直下に「着手条件」の 1 行を置く形へ揃え、見出しの括弧書きは Phase の
  内容を表す語に限る。

### S-03: §3 の表形式が 4 節でそろっていない

- Location: §3.1 / §3.2 / §3.3 / §3.4
- Issue: §3.3 のみ `Step` 列を持つ 4 列表、他の 3 節は `Rule` / 内容 / `Commit` の 3 列表である。
  また §3.2 の `Commit` 欄には「Phase 0（なし）」という commit 番号でない値が 1 行だけ入る。
- Fix: §3.3 の `Step` 列は評価順序を示す情報であり残す価値があるため、列構成の差は
  節の冒頭注記（既にある「§4.1 の評価は Step 順であり Rule ID 順ではない」）で説明済みとして
  許容する。§3.2 の「Phase 0（なし）」は、commit 欄の値域が commit 番号であることを崩すため、
  表外の注記へ移す。

## 5. Cross-Reference Validation

Invalid or missing references.

### CR-01: harden で採択した DR-20〜DR-23 が本文へ未反映

- Location: §1.1 の制約リスト / Phase 4〜6 / 末尾 3 節
- Reference: `../decision-records.md` v3.1.0（DR-20 / DR-21 / DR-22 / DR-23）
- Issue: 本文書が引く DR は DR-01〜DR-19 の範囲に留まる。harden レビューで採択した 4 件が
  未反映であり、うち DR-20（可到達性の commit 単一化と Phase 6 の 2 巡化）は Phase 6 の
  現行の進め方と、DR-22（Phase 5 の依存範囲）は Phase 4 の着手条件の記述と食い違う。
- Fix: `/deckrd impl` の再生成で反映する。本監査は反映の有無のみを指摘し、内容には立ち入らない。

### CR-02: §3 の割り当てが commit 本文に現れない箇所がある

- Location: §3.1 の R-008 行 / §3.3 の R-005 行
- Reference: R-008 → Commit 10 / 11、R-005 → Commit 2 / 3
- Issue: §3 冒頭は「割り当ての無い行が残った場合、それは表の欠落ではなく commit 分解の欠落を
  意味する」と述べ、表から commit への対応を規律として扱う。しかし逆方向が 2 箇所で欠けている。
  R-008（UTF-8 の符号化と復号）は Commit 10 の本文が符号化・復号の双方を述べる一方、
  Commit 11 の本文には現れない。R-005（モデル値の受理判定と案内文言の実態追随）は
  Commit 2 の本文にあるが、Commit 3 の本文は REQ-F-001 / DR-02 / DR-14 決定 3 のみを引く。
- Fix: 各 commit の見出し直下にある規則参照行へ、表と同じ規則 ID を揃える。

### CR-03: AC の参照が AC-020 の 1 件のみ

- Location: 文書全体
- Reference: AC-001〜AC-024（requirements.md §8）
- Issue: 本文書が引く AC は Phase 3 見出しの「AC-020 の土台」と Commit 6 / §1.1 の
  AC-020 のみである。§3 が 30 の規範規則について持っている「表から commit への対応」に
  相当するものが、24 件の AC については存在しない。
- Fix: DR-21 が「AC Coverage」節の新設を決定済み。本監査は参照の欠落として記録するに留める。

### CR-04: 呼び出し元の識別に行番号を使っており、要件の方針と異なる

- Location: Commit 13 / 14 / 15 / 16、および Commit 2
- Reference: `phase-classify-ai.ts:123` / `process-chunk.ts:86` / `segment-ai.ts:111` /
  `setfm-frontmatter.ts:61` / `setfm-review.ts:60` / `setfm-type-category.ts:91` / `run-ai.ts:216`
- Issue: 7 件すべて現時点の実コードと一致する（§1 参照）。ただし要件 REQ-F-010 の Rationale は
  「行番号は SKILL.md の編集で陳腐化するため、ファイルと実行対象を識別子で示す」として
  行番号キーを明示的に避けている。本文書は同じ問題を持つ形式を採っており、
  Phase 1〜6 の 16 commit を経る間に 6 つの呼び出し元のうち Commit 13〜16 が触れる 4 ファイルは
  自身の編集で行がずれる。
- Fix: 行番号を落とし、「`phase-classify-ai.ts` の `runAI` 呼び出し」のように実行対象で示す。
  各ファイルに `runAI` 呼び出しは 1 箇所のみであり（走査で確認）、識別子だけで一意に定まる。

### CR-05: REQ-C-003 / REQ-C-004 が ID で引かれていない

- Location: Commit 11 / Commit 7
- Reference: REQ-C-003（リトライ・フォールバック禁止）/ REQ-C-004（既存 CLI へのスキーマ強制の非適用）
- Issue: Commit 11 の「リトライ・他バックエンドへのフォールバックは行わない」は REQ-C-003 の
  内容そのものだが、同 commit の参照行は REQ-F-005・REQ-F-006・REQ-F-017 / transport R-007 /
  error-handling R-001〜R-008 / DR-03・DR-18 を挙げるのみで REQ-C-003 を含まない。
  REQ-C-004 はいずれの commit からも引かれていない（Commit 7 の「llama バックエンド選択時は
  無条件に `response_format` を適用する」が裏側で前提にしている）。
- Fix: Commit 11 の参照行に REQ-C-003 を、Commit 7 の参照行に REQ-C-004 を加える。
  いずれも既存の制約であり、新たな制約の追加にはあたらない。

## 6. Typo & Grammar Fixes

| Location     | Original                                                                              | Corrected                                                                             |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phase 0 本文 | この Phase は commit を持たず、成果物は仕様の更新です。Phase 4 の着手条件になります。 | この Phase は commit を持たず、成果物は仕様の更新とする。Phase 4 の着手条件にあたる。 |

- 本文書は常体（「〜する」「〜としない」）で統一されており、44 箇所の文末がこれに従う。
  ですます体は Phase 0 本文の 1 文のみであり、文体の混在にあたる。
- なお仕様 4 ファイルと `decision-records.md` は 2026-09-03 の textlint 対応で
  ですます体へ統一されている。`implementation.md` を常体のまま保つか、上流に揃えて
  ですます体へ寄せるかは文書単位の選択であり、本監査は文書内の混在の解消のみを指摘する。

## 7. Review Metadata

- Reviewer: AI (deckrd review --phase fix)
- Review Phase: fix
- Review Date: 2026-09-04
- Document Version Reviewed: `implementation.md` v1.0.0
- Upstream: `specifications-index.md` v1.2.0（transport v2.0.1 / structured-output v2.0.0 /
  error-handling v2.0.1 / config-packaging v1.2.0）/ `requirements.md` v1.6.0 /
  `decision-records.md` v3.1.0
- 先行レビュー: `reviews-claude-impl-explore-2026-09-04.md` /
  `reviews-claude-impl-harden-2026-09-04.md`
- Repository State: commit `7385c2033`
