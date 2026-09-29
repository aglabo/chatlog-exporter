---
title: "Decision Records: filter/filter"
module: "filter/filter"
status: Draft
version: 1.2.0
created: "2026-09-08"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma,
  -->
<!-- markdownlint-disable line-length -->

<!--
IDs MUST be sequential: DR-01, DR-02, ...

Versioning (SemVer, see deckrd-rule-document-versioning.md):
  MINOR — a new DR is added
  PATCH — an existing DR's wording or rationale is clarified
  MAJOR — an accepted DR is superseded or reversed

Keep frontmatter `version` equal to the newest Change History row below.
-->

> 本書は KEEP / DISCARD 判定を行う `filter-chatlogs.ts` を対象とします。
> 定型部の除去は `filter/strip`、ノイズファイルの除外は `filter/noise-filter` が持ちます。

## Index

| ID    | Decision                                                                       | 主な影響先                                  |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| DR-01 | fixture テストは本体のプロンプトと同一経路を通し、パース失敗を assert で落とす | `fixtures.spec.ts` / `process-chunk.ts`     |
| DR-02 | 実 AI を呼ぶテストは system tier に一本化し、fixtures tier を廃止する          | `keep-discard-criteria.system.spec.ts`      |
| DR-03 | KEEP / DISCARD の判定軸は技術性ではなく「WHY が残っているか」                  | `process-chunk.ts` の `_SYSTEM_PROMPT`      |
| DR-04 | prefilter の「会話本文が空」判定は削除する（User ターン検査が覆う）            | `prefilter.ts` の `_classifyEntryByContent` |

---

## DR-01: fixture テストは本体のプロンプトと同一経路を通し、パース失敗を assert で落とす

**Status**: Accepted

**Context**: `skills/filter-chatlogs/scripts/__tests__/fixtures/filter/fixtures.spec.ts` は
`process-chunk.ts` の `_SYSTEM_PROMPT` を **ローカルに再定義** しており、本体から乖離していました。
デリミタとインジェクション防御ブロックが欠落し、KEEP / DISCARD 基準も旧文言のままです。

この構造では、`process-chunk.ts` のプロンプトを変更してもテストに反映されません。
プロンプトの回帰を検知するはずのテストが、プロンプトの変更から独立して緑のままになります。

**Decision**:

1. ローカルの `_SYSTEM_PROMPT` を削除し、`process-chunk.ts` から import する
2. user prompt も `buildBatchPrompt` 経由（本体と同一経路）に統一する
3. パース失敗時のサイレント PASS を assert に置き換える

**Alternatives Considered**:

- ローカル定義を本体の現行文言に更新する — 同じ乖離が次のプロンプト変更で再発します。
  2 箇所に同じ文字列を置く限り、同期は人手の注意力に依存し続けます
- プロンプトの同一性だけを比較するテストを別に足す — 乖離は検知できますが、
  fixture テスト自体は依然として本体と違うプロンプトで判定を検証することになります。
  検証対象が本番経路でないという問題は残ります

**Consequences**: 既存 fixture `normal-01-basic-keep`（一般的な TypeScript の Result 型
チュートリアル Q&A）は、新しい KEEP 基準「WHY が残っているか」では DISCARD 側へ振れます。
プロジェクト固有の決定や却下理由を含まない教科書的な解説だからです。
import 化に伴い、この fixture を `normal-01-design-rationale-keep` へ差し替えました。

`deno task test:module fixtures filter --use-ai` が ignored ではなく実行されて
PASS することを確認しています。

> 出典: beads `cle-8s3`（closed 2026-08-20） / GitHub #443

---

## DR-02: 実 AI を呼ぶテストは system tier に一本化し、fixtures tier を廃止する

**Status**: Accepted

**Context**: DR-01 で `fixtures.spec.ts` を本体の `_SYSTEM_PROMPT` / `buildBatchPrompt` 経路へ
統一した結果、`fixtures/filter/fixtures.spec.ts` と
`system/filter/keep-discard-criteria.system.spec.ts` が **ほぼ同一の検証** をするようになりました。

同じ `_SYSTEM_PROMPT`、同じ経路（`buildBatchPrompt` → `runAI` → `parseAiJsonArray`）、
同じ fixture ディレクトリ構造、同じ `output.yaml` スキーマです。
差分は fixture の題材と `describe` ラベルだけになりました。
**実 AI 呼び出しを 2 系統維持するコストに見合いません。**

**Decision**:

1. `fixtures.spec.ts` を廃止し、fixture 4 件を `keep-discard-criteria.system.spec.ts` へ集約する
2. 移設分は `T-FL-KDC-03` / `T-FL-KDC-04` に採番し直し、`T-FL-FC` prefix を廃止する
3. fixture は 4 件すべて残す

**Rationale**: 両者の違いは fixture の題材、すなわちデータだけです。
データ差分は fixture 駆動テストが本来吸収すべきものであり、
スイートを分ける理由になりません。

加えて、filter の `fixtures.spec.ts` は fixtures tier で **唯一実 AI を呼ぶテスト** でした。
他の実 AI テストはすべて system tier にあります。統合により
「実 AI を呼ぶテストは system tier」という区分が揃います。

決定 3 の理由は、fixture の題材自体は重複ではなく補完的だからです。

- `normal-01` / `normal-02`（KDC-01 / 02）— 技術用語の濃さと理由の有無を逆転させた対照ペア。
  判定軸が「技術的か」ではなく「WHY があるか」であることを証明する
- `normal-03` / `normal-04`（KDC-03 / 04、旧 FC-01 / 02）— 交絡のない素直なペア。基本動作の回帰検知

**Alternatives Considered**:

- 両スイートを残し、役割の違いを describe ラベルとコメントで明示する —
  実 AI 呼び出しが 2 系統残ります。呼び出し回数は実行時間と API 消費に直結し、
  ラベルでは減りません
- `fixtures.spec.ts` を残して system 側を廃止する — fixtures tier に実 AI テストが
  1 件だけ残る構図が続きます。他の実 AI テストが system tier にある以上、
  tier の意味が filter だけ例外になります

**Consequences**: fixtures tier から実 AI 呼び出しが消え、
「実 AI = system tier」の区分が全スキルで揃いました。`T-FL-FC` prefix は廃止済みのため、
今後この prefix を再利用してはいけません。

> 出典: beads `cle-er9`（closed 2026-09-07） / GitHub #443

---

## DR-03: KEEP / DISCARD の判定軸は技術性ではなく「WHY が残っているか」

**Status**: Accepted

**Context**: 旧判定軸は「会話が技術的か」でした。この軸は両方向に外していました。

1. 技術用語が濃いだけの実行ログを拾いすぎる
2. 技術的に薄いが、却下理由・制約・ハマりどころ・ユーザーの確定回答が残るログを取りこぼす

**Decision**: `process-chunk.ts` の `_SYSTEM_PROMPT` の判定軸を
**「判断の理由 (WHY) が残っているか」** に置き換える (2026-08-21)。
KEEP は the log records WHY、DISCARD は the log records only WHAT happened。

新軸の文言は、ユーザーのグローバル `CLAUDE.md` の長期メモリ規約
(設計判断とその理由 / 制約・前提 / ハマりどころと解法 / ユーザーの確定回答) から移植したものです。

**Rationale**: 技術性はプロンプトで明示しなくても、判定を行う claude 自身が担保します。
併記すると旧軸の失敗 (1) を再び招くため書かない — これはユーザーの判断です。

実測 (各 5 回) では、旧基準の 2 fixture 同時 PASS が約 8% だったのに対し、
新基準は 5 / 5・confidence 0.85-0.96 でした。

**Consequences**: 検証は system テスト
`skills/filter-chatlogs/scripts/__tests__/system/filter/keep-discard-criteria.system.spec.ts`
(`RUN_AI=1` ゲート、T-FL-KDC-01 / 02) が担います。
DR-01 / DR-02 が前提としている「新しい KEEP 基準」とは本 DR を指します。

> 出典: 2026-09-19 の永続メモリー棚卸しで `bd remember` から移送（決定自体は 2026-08-21）

---

## DR-04: prefilter の「会話本文が空」判定は削除する（User ターン検査が覆う）

**Status**: Accepted

> 本 DR が対象とする `prefilter.ts` は `filter-chatlogs.ts` と `noise-filter-chatlogs.ts` の
> 両エントリで共有されます。本書冒頭のスコープ注記が挙げる `filter/noise-filter` は
> ディレクトリが存在しないため、共有部分の決定は本書に置きます。

**Context**: `_classifyEntryByContent` は `extractConversation(content, maxBodyChars)` の結果が
空かどうかで `'会話本文が空'` として除外する分岐を持っていました。この分岐に渡る `maxBodyChars` は、
どんな値を入れても振る舞いを変えない死んだ引数でした。さらに調べると、**分岐そのものが
すべての入力に対して到達不能**でした。

`_classifyEntryByContent` は同じ `content` を 2 回評価します。

1. `isExcludedByContent(content, ...)` が `!hasUserTurn(parseConversation(content))` のとき
   `'Userターンが存在しない'` として除外する
2. それを通過した場合にのみ `extractConversation` の空判定へ進む

会話ターンが 0 件なら User ターンも 0 件なので (1) で必ず除外されます。したがって (2) に到達した
時点で User ターンが 1 件以上あり、`renderConversation` は各ターンを `'### User\n…'` /
`'### Assistant\n…'` として join した文字列を返すため、`maxBodyChars >= 1` のいかなる値でも
先頭が `'#'` になり `.trim()` は空になりません。`maxBodyChars` はスキーマで `min: 1` に
固定されているので `0` を渡す経路もありません。

実測: 分岐をまるごと削除すると `deno task test` の 445 件のうち落ちるのは `T-FL-PFF-22-01`
（`maxBodyChars: 0` を直接渡してこの配線を pin するテスト）の 1 件だけでした。`0` はスキーマが
禁じる値なので、このテストは production から到達できない入力を pin していました。

**Decision**: `prefilterFiles` / `_phase3PartitionByContent` / `_classifyEntryByContent` から
`maxBodyChars` 引数を落とし、`'会話本文が空'` 分岐を削除する。`PrefilterFilesOptions` と
`NoiseFilterConfig` からも同名フィールドを落とす（noise-filter は AI を呼ばないため用途が皆無）。
**代替ガードは足さない。**

**Alternatives Considered**:

- **引数だけ落として `parseConversation(content).length === 0` のガードを残す** — 却下。
  同じ理由で到達不能のままなので、テストで覆えない分岐が残るだけです。防御的に見えて、
  実際には「この分岐が動いた例が 1 つも存在しない」状態を固定します
- **切り詰め後の本文長が閾値未満なら除外する形にして `maxBodyChars` を生かす** — 却下。
  `minCharCount` が既に本文長のゲートを持っており、`maxBodyChars` は `SKILL.md` と
  `config.yaml` で「バッチプロンプトへ埋め込む本文の切り詰め長」と文書化されています。
  同一のキーに除外閾値の意味を重ねると、設定の意味が二重化します

**Consequences**: `maxBodyChars` の意味はバッチプロンプトの切り詰め長だけになり、
`SKILL.md` の記述と実体が一致します。`T-FL-PFF-22` / `T-FL-PFF-23` は廃番とし、この連番を
再利用してはいけません。削除後の保証は次の 2 件が担います。

- `T-FL-IC-02-03` — 会話見出しを含まない `minCharCount` 以上の本文が
  `'Userターンが存在しない'` で除外される（unit）
- `T-FL-PFF-24-01` — 同じ入力が `prefilterFiles` を通過しない（functional）

レビュー（人間・AI とも）が「会話本文の空判定が無い」と指摘してきたら、本 DR で閉じてください。

> 出典: beads `cle-kju.3.2.1`（GitHub #478）

---

## Change History

| Date       | Version | Description                                                                                             |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-8s3` / `cle-er9` が出典） |
| 2026-09-19 | 1.1.0   | DR-03 を追加。永続メモリー `filter-keep-discard-criterion` から移送                                     |
| 2026-09-29 | 1.2.0   | DR-04 を追加。prefilter の到達不能な「会話本文が空」判定と死んだ `maxBodyChars` 引数の削除を記録        |

<!-- markdownlint-enable line-length -->
